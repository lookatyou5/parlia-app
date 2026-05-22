/* ═══════════════════════════════════════════════════════════════
   LIVE AI CHAT · Deepgram Nova-2 streaming
   Step 3: WebSocket reale + AudioWorklet PCM 16-bit → trascrizione
           in tempo reale (interim + final) con safety timer 3min.
   Step 4 (prossimo): passare i transcript a Claude Haiku per
           generare 3 chips predittive. Per ora le chips restano
           uno stub locale solo per vedere le animazioni.
   ═══════════════════════════════════════════════════════════════ */

(function(){
  'use strict';

  // ─── Config ───
  // URL del Worker `parlia-deepgram` che rilascia token temporanei.
  // Deploy in separato (stesso pattern di parlia-tts / parlia-vision).
  const TOKEN_URL = 'https://parlia-deepgram.luca-peltrini.workers.dev/token';

  // Proxy Claude Haiku (stesso usato in home.html per la chat AI)
  const AI_PROXY = 'https://voci-ai-proxy.luca-peltrini.workers.dev/v1/messages';

  // Parametri Deepgram (docs: https://developers.deepgram.com/docs/live-streaming-audio)
  const DG_PARAMS = {
    model: 'nova-2',
    language: 'es',
    smart_format: 'true',     // punteggiatura + maiuscole automatiche
    interim_results: 'true',  // parziali per feedback immediato
    endpointing: '300',       // ms di silenzio per considerare un turno finito
    channels: '1',
    encoding: 'linear16',
    // sample_rate viene iniettato a runtime (dipende dall'AudioContext)
  };

  // Quanti turni di contesto mandare all'AI per generare le chips.
  // Troppo poco = risposte generiche; troppo = più token, più latenza.
  const CHIP_CTX_TURNS = 8;

  // ─── Interlocutori preset ───
  // Categorie di contatto visualizzate come pill nella parte alta della
  // pagina. La selezione:
  //  - resetta la history della conversazione corrente
  //  - inietta un "contexto del interlocutor" nel system prompt di Haiku
  //    così le chip sono adatte al tipo di relazione
  // Persistenza: localStorage 'parlia_live_interlocutor' = id corrente.
  // Schema futuro: potranno essere editabili da profile.html + custom contacts.
  const CONTACTS = [
    {
      id: 'luca',
      name: 'Luca',
      emoji: '💑',
      relationship: 'pareja / compañero sentimental',
      context: 'Luca es el compañero/pareja del usuario. Relación cercana, íntima, cariñosa, de confianza total. Tono natural, afectuoso, con inside jokes y complicidad. Pueden hablar de cualquier cosa: planes, sentimientos, miedos, recuerdos, vida cotidiana, deseos, pequeñas tonterías.',
    },
    {
      id: 'medicos',
      name: 'Médicos',
      emoji: '🩺',
      relationship: 'equipo médico / terapéutico',
      context: 'Es el equipo médico o terapéutico (fisioterapeuta, logopeda, neurólogo, enfermería, psicólogo). Tono respetuoso y colaborativo, directo cuando hace falta. Temas típicos: cómo me siento, dolor, cansancio, progresos, dudas sobre el tratamiento o los ejercicios, efectos de la medicación, objetivos de rehabilitación.',
    },
    {
      id: 'familia',
      name: 'Familia',
      emoji: '👨‍👩‍👧',
      relationship: 'familiar (padres, hermanos, hijos)',
      context: 'Es un miembro cercano de la familia. Tono cálido, familiar, afectuoso. Temas: salud y cómo me va hoy, noticias de la familia, recuerdos compartidos, vida cotidiana, preocupaciones suaves, planes próximos. Evita lenguaje técnico-médico.',
    },
    {
      id: 'amigos',
      name: 'Amigos',
      emoji: '🙋',
      relationship: 'amigo/a',
      context: 'Es un amigo/a. Tono relajado, cercano, con humor ligero si viene natural. Temas: cómo me va, qué hago estos días, planes, anécdotas del día a día, intereses compartidos.',
    },
  ];

  // Stato
  const S = {
    listening: false,
    wsStatus: 'disconnected',    // 'disconnected' | 'connecting' | 'connected' | 'error'
    startedAt: 0,
    lastInteraction: 0,
    costPerMin: 0.0059,          // Deepgram Nova-2 streaming
    ttsMuted: false,
    tickTimer: null,
    safetyTimer: null,
    safetyMs: 3 * 60 * 1000,     // 3 min senza interazioni → stop auto

    // Audio
    audioCtx: null,
    stream: null,
    sourceNode: null,
    workletNode: null,

    // WebSocket
    ws: null,
    currentInterimEl: null,      // bolla interim attualmente in aggiornamento

    // Contesto conversazione per generare chips AI
    // Array di { role: 'them' | 'me', text: string } — ultimi CHIP_CTX_TURNS turni
    history: [],
    chipToken: 0,                // invalida richieste AI obsolete (come _currentToken in tts.js)

    // Pre-generazione su interim stabile (riduce latenza percepita)
    interimStableTimer: null,    // timer 500ms dopo ultima modifica interim
    preGenInterim: null,         // testo interim per cui è stato lanciato il pre-gen

    // Interlocutore selezionato (default primo della lista)
    interlocutorId: CONTACTS[0].id,
  };

  const PREGEN_STABLE_MS = 500;
  const PREGEN_MIN_WORDS = 3;

  // DOM
  const $ = id => document.getElementById(id);
  const micBtn    = () => $('lcMicBtn');
  const micIcon   = () => $('lcMicIcon');
  const micLabel  = () => $('lcMicLabel');
  const dot       = () => $('lcDot');
  const thread    = () => $('lcThread');
  const emptyEl   = () => $('lcEmpty');
  const chipsRow  = () => $('lcChipsRow');
  const adminWs   = () => $('lcAdminWs');
  const adminTime = () => $('lcAdminTime');
  const adminCost = () => $('lcAdminCost');
  const adminLast = () => $('lcAdminLast');
  const ttsBtn    = () => $('ttsBtn');

  // ─── Utility formattazione ───
  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }
  function fmtCost(ms) {
    const min = ms / 60000;
    return '$' + (min * S.costPerMin).toFixed(4);
  }
  function fmtAgo(ms) {
    if (!ms) return '—';
    const d = Date.now() - ms;
    if (d < 1000) return 'ahora';
    if (d < 60000) return Math.floor(d / 1000) + 's';
    return Math.floor(d / 60000) + 'm';
  }

  // ─── Admin panel tick ───
  function startTick() {
    stopTick();
    S.tickTimer = setInterval(() => {
      if (!S.startedAt) return;
      const elapsed = Date.now() - S.startedAt;
      adminTime().textContent = fmtTime(elapsed);
      adminCost().textContent = fmtCost(elapsed);
      adminLast().textContent = fmtAgo(S.lastInteraction);
    }, 500);
  }
  function stopTick() {
    if (S.tickTimer) { clearInterval(S.tickTimer); S.tickTimer = null; }
  }

  // ─── WebSocket status UI ───
  function setWsStatus(status) {
    S.wsStatus = status;
    const d = dot();
    const w = adminWs();
    d.classList.remove('connected', 'connecting');
    w.classList.remove('connected', 'connecting', 'error');
    if (status === 'connected')       { d.classList.add('connected');  w.classList.add('connected');  w.textContent = '🟢 conectado'; }
    else if (status === 'connecting') { d.classList.add('connecting'); w.classList.add('connecting'); w.textContent = '🟡 conectando…'; }
    else if (status === 'error')      { w.classList.add('error');      w.textContent = '🔴 error'; }
    else                              { w.textContent = '⚪ desconectado'; }
  }

  // ─── Safety timer (3 min di inattività) ───
  function resetSafety() {
    S.lastInteraction = Date.now();
    if (S.safetyTimer) clearTimeout(S.safetyTimer);
    if (!S.listening) return;
    S.safetyTimer = setTimeout(() => {
      if (S.listening) {
        stopListening(true);
        toast('Micrófono cerrado por inactividad');
      }
    }, S.safetyMs);
  }
  function clearSafety() {
    if (S.safetyTimer) { clearTimeout(S.safetyTimer); S.safetyTimer = null; }
  }

  // ─── Toast ───
  function toast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:110px;transform:translateX(-50%);background:rgba(15,23,42,.94);color:white;padding:10px 16px;border-radius:14px;font-size:.85rem;font-weight:600;z-index:9999;box-shadow:0 6px 20px rgba(0,0,0,.3);animation:cardIn .25s ease both;';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  // ─── Thread bubbles ───
  function hideEmpty() {
    const e = emptyEl();
    if (e) e.remove();
  }
  function ensureInterimBubble() {
    if (S.currentInterimEl && S.currentInterimEl.isConnected) return S.currentInterimEl;
    hideEmpty();
    const b = document.createElement('div');
    b.className = 'lc-bubble them interim';
    b.textContent = '';
    thread().appendChild(b);
    S.currentInterimEl = b;
    return b;
  }
  function updateInterim(text) {
    const b = ensureInterimBubble();
    b.textContent = text;
    thread().scrollTop = thread().scrollHeight;
    schedulePreGen(text);
  }
  function commitFinal(text) {
    // Cancella eventuale timer di pre-gen ancora in attesa
    if (S.interimStableTimer) { clearTimeout(S.interimStableTimer); S.interimStableTimer = null; }

    // Promuove la bolla interim corrente a finale (se esiste) o ne crea una nuova.
    if (S.currentInterimEl && S.currentInterimEl.isConnected) {
      S.currentInterimEl.classList.remove('interim');
      S.currentInterimEl.textContent = text;
    } else {
      hideEmpty();
      const b = document.createElement('div');
      b.className = 'lc-bubble them';
      b.textContent = text;
      thread().appendChild(b);
    }
    S.currentInterimEl = null;
    thread().scrollTop = thread().scrollHeight;

    // Aggiungi il turno del INTERLOCUTORE alla history reale
    pushHistory('them', text);

    // Se il final coincide (dopo normalizzazione) con l'interim che abbiamo
    // pre-genato, le chips attuali sono già valide → risparmiamo una chiamata.
    if (S.preGenInterim && _isCloseMatch(S.preGenInterim, text)) {
      S.preGenInterim = null;
      return;
    }
    S.preGenInterim = null;

    // Altrimenti rigenera usando la history definitiva
    runChipGen(null);
  }

  // Normalizza per confronto: minuscolo, rimuove punteggiatura e spazi multipli
  function _normalizeForCompare(s) {
    return String(s).toLowerCase()
      .replace(/[.,;:!?¿¡"'()…\-–—]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function _isCloseMatch(a, b) {
    const na = _normalizeForCompare(a);
    const nb = _normalizeForCompare(b);
    if (!na || !nb) return false;
    return na === nb;
  }

  // ─── History conversazione ───
  function pushHistory(role, text) {
    S.history.push({ role, text });
    if (S.history.length > CHIP_CTX_TURNS) {
      S.history = S.history.slice(-CHIP_CTX_TURNS);
    }
  }

  // ─── Chips ───
  function renderChips(arr) {
    const row = chipsRow();
    row.innerHTML = '';
    (arr || []).forEach(text => {
      const b = document.createElement('button');
      b.className = 'lc-chip';
      b.type = 'button';
      b.textContent = text;
      b.onclick = () => onChipTap(b, text);
      row.appendChild(b);
    });
  }
  function clearChips() { chipsRow().innerHTML = ''; }

  function showChipsLoading() {
    const row = chipsRow();
    row.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const sk = document.createElement('div');
      sk.className = 'lc-chip lc-chip-skeleton';
      sk.innerHTML = '<span class="lc-sk-bar"></span>';
      sk.style.animationDelay = (i * 70) + 'ms';
      row.appendChild(sk);
    }
  }

  function addMeBubble(text) {
    hideEmpty();
    const b = document.createElement('div');
    b.className = 'lc-bubble me';
    b.textContent = text;
    thread().appendChild(b);
    thread().scrollTop = thread().scrollHeight;
    return b;
  }

  function onChipTap(btn, text) {
    resetSafety();
    document.querySelectorAll('.lc-chip.played').forEach(c => c.classList.remove('played'));
    btn.classList.add('played');

    // Aggiungi la risposta come bolla "me" (destra, rosa) nel thread →
    // conversazione visibile a entrambi i lati, come WhatsApp.
    addMeBubble(text);

    // Aggiungi il turno dell'UTENTE alla history per le chips successive
    pushHistory('me', text);

    if (!S.ttsMuted) _playChipVoice(text);
  }

  // Stato persistito: se attivo, le chips vengono lette con la voce clonata
  // di Laura (MiniMax via fetchMiniMaxAudio) invece di Google Neural2-H.
  // Fallback automatico a Neural2-H se MiniMax fallisce (rete, balance, ecc.)
  // → l'app non resta mai muta sulla chip che Laura ha tappato.
  function _useLauraVoice() {
    return localStorage.getItem('parlia_live_use_laura_voice') === '1';
  }

  function _playNeural(text) {
    if (!window.speakNeural) return;
    try { window.stopNeural && window.stopNeural(); } catch(e){}
    if (typeof window.speakNeural.chip === 'function') {
      window.speakNeural.chip(text);
    } else {
      window.speakNeural(text, { rate: 1.0 });
    }
  }

  function _playChipVoice(text) {
    // Stop di qualsiasi audio precedente (entrambi i motori)
    try { window.stopLauraVoice && window.stopLauraVoice(); } catch(e){}
    try { window.stopNeural && window.stopNeural(); } catch(e){}

    if (_useLauraVoice() && window.fetchMiniMaxAudio) {
      window.fetchMiniMaxAudio(text).catch(err => {
        console.warn('[LiveChat] Laura voice fallback → Neural2:', err?.message || err);
        _playNeural(text);
      });
    } else {
      _playNeural(text);
    }
  }

  // ─── Generazione chip via Claude Haiku ───
  //
  // runChipGen(tentativeInterim):
  //   - tentativeInterim = string → PRE-GEN: usa una history "ipotetica"
  //     con l'interim come ultimo turno them (non persisto nulla in S.history)
  //   - tentativeInterim = null → POST-FINAL: usa S.history com'è
  //
  // Token monotonico invalida richieste obsolete (es. pre-gen soppiantato da
  // un pre-gen più recente o dal final).

  function _buildChipPrompt() {
    const ud = (window.ParliaUser && ParliaUser.get && ParliaUser.get()) || {};
    const userName = ud.personal?.userName || '';
    const hobbies  = (ud.memory?.hobbies || []).slice(0, 3).join(', ');
    const condicion = (ud.personal?.condicion && ud.personal.condicion[0]) || '';
    const contact = _currentContact();

    return 'Eres el asistente de comunicación de una persona con dificultades del habla. ' +
      'Alguien está hablando con la persona en una conversación cara a cara. ' +
      'Tu tarea: generar 3 posibles respuestas que la persona podría tocar con el dedo ' +
      'para que la voz las lea en voz alta a quien le está hablando. ' +
      '\n\n🗣️ CONTEXTO DEL INTERLOCUTOR (muy importante para el tono):' +
      `\n- Categoría: ${contact.name}` +
      `\n- Relación: ${contact.relationship}` +
      `\n- Contexto: ${contact.context}` +
      '\n\nAdapta registro, tono, nivel de formalidad y temas al interlocutor. ' +
      'No uses lenguaje técnico con familiares/amigos, ni demasiada confianza con médicos. ' +
      'Con la pareja el tono puede ser más íntimo y cariñoso; con amigos más relajado.' +
      '\n\nReglas de VARIEDAD (importantísimas — evitar respuestas repetitivas):' +
      '\n- Respuestas en PRIMERA PERSONA (yo/me/mi), en español natural y conversacional' +
      '\n- Las 3 respuestas deben ser CLARAMENTE DISTINTAS en intención emocional:' +
      '\n   · una EMOCIONAL/AFECTIVA (cómo me siento, qué me gustaría)' +
      '\n   · una CONCRETA con detalle (algo que sí/no he hecho, una preferencia específica)' +
      '\n   · una con PREGUNTA DEVUELTA o invitación a seguir la conversación' +
      '\n- PROHIBIDO empezar las 3 con monosílabos genéricos (Sí, No, Vale, Claro) — usa máximo UNA respuesta corta y solo si encaja claramente' +
      '\n- PROHIBIDO el comodín "No lo sé" salvo que la pregunta lo requiera literalmente' +
      '\n- Longitudes variadas: una breve (2-5 palabras), una media (5-10), una larga (10-16 palabras con un detalle o pregunta inversa)' +
      '\n- NUNCA repitas literalmente lo que ha dicho el interlocutor' +
      '\n- Si ya hay historia previa, sé coherente y NO repitas respuestas ya dichas' +
      (userName ? `\n- La persona se llama ${userName}` : '') +
      (condicion ? `\n- Condición: ${condicion}` : '') +
      (hobbies ? `\n- Intereses del usuario: ${hobbies} (úsalos como ganchos cuando encajen)` : '') +
      '\n\nResponde SOLO con un JSON array de 3 strings, sin markdown, sin comentarios.' +
      '\nEjemplo BUENO: ["Hoy ha sido un día duro","He dormido fatal esta noche, sigo cansada","¿Y tú cómo llevas la semana?"]' +
      '\nEjemplo MALO (NO HAGAS ESTO): ["Sí","No","No lo sé"]';
  }

  // Pool di fallback per interlocutore — usato solo se la chiamata AI fallisce.
  // Più ricco delle 3 frasi statiche di prima, randomizzato per evitare percezione
  // di app "che dice sempre le stesse cose" quando l'AI è giù/lenta.
  const CHIP_FALLBACK_POOL = {
    luca: [
      'Estoy bien, amor', 'Cuéntame más', 'Te echaba de menos',
      'Ahora estoy un poco cansada', '¿Y tú qué tal hoy?',
      'Más tarde hablamos mejor', '¿Me das un abrazo?',
      'Hoy me siento más fuerte', '¿Has comido ya?',
      'Estoy pensando en ti', '¿Salimos un rato?',
      'Quiero descansar contigo',
    ],
    medicos: [
      'Sí, todo bien', 'Tengo algo de dolor', 'No, gracias',
      '¿Puede repetirlo, por favor?', 'Estoy un poco cansada hoy',
      'Mejor que ayer', 'Me cuesta entenderlo',
      '¿Cuánto durará?', 'Necesito una pausa, por favor',
      'Sí, hago los ejercicios', '¿Es normal sentir esto?',
      'Prefiero descansar ahora',
    ],
    familia: [
      'Hola, me alegro de verte', 'Estoy bien, no te preocupes',
      'Cuéntame qué tal todo', 'Hoy ha sido un buen día',
      'Te echaba de menos', '¿Cómo están los demás?',
      'Estoy un poco cansada hoy', 'Me apetece hablar contigo',
      '¿Hay novedades por casa?', 'Gracias por venir',
      'Estoy mejor, gracias', '¿Cuándo vuelves a verme?',
    ],
    amigos: [
      '¡Qué bueno verte!', 'Cuéntame qué hay de nuevo',
      'Estoy mejor, gracias', 'Hoy un poco cansada',
      '¿Y tú qué tal andas?', 'Eso suena genial',
      'Me has hecho reír', '¿Quedamos pronto?',
      'Cuéntamelo todo', 'No me lo puedo creer',
      'Te he echado de menos', 'Hablamos otro día con calma',
    ],
  };

  // Seleziona 3 frasi RANDOM diverse dal pool dell'interlocutore corrente.
  // Evita ripetizioni rispetto all'ultimo set mostrato.
  let _lastFallbackChips = [];
  function _pickFallbackChips() {
    const id = (_currentContact() && _currentContact().id) || 'luca';
    const pool = (CHIP_FALLBACK_POOL[id] || CHIP_FALLBACK_POOL.luca).slice();
    // Rimuovi quelle viste l'ultima volta per massimizzare percezione di varietà
    const avoid = new Set(_lastFallbackChips);
    let candidates = pool.filter(p => !avoid.has(p));
    if (candidates.length < 3) candidates = pool; // pool troppo piccolo, usalo tutto
    // Shuffle Fisher-Yates parziale
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const picked = candidates.slice(0, 3);
    _lastFallbackChips = picked;
    return picked;
  }

  async function runChipGen(tentativeInterim) {
    const myToken = ++S.chipToken;
    showChipsLoading();

    // Costruisci la history effettiva da mandare al modello
    const effectiveHistory = tentativeInterim
      ? S.history.concat([{ role: 'them', text: tentativeInterim }])
      : S.history;

    try {
      const systemPrompt = _buildChipPrompt();

      const convo = effectiveHistory.map(h =>
        (h.role === 'them' ? 'INTERLOCUTOR: ' : 'YO: ') + h.text
      ).join('\n');

      const userMsg =
        'Conversación hasta ahora:\n' + convo +
        '\n\nGenera las 3 respuestas posibles para YO. Recuerda: solo el JSON array.';

      const resp = await fetch(AI_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 320,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMsg }],
        }),
      });

      if (myToken !== S.chipToken) return;           // superato (altro pre-gen o final)

      if (!resp.ok) {
        // Log verbose per diagnosi: status + body parziale
        let bodySnippet = '';
        try { bodySnippet = (await resp.text()).slice(0, 300); } catch(e){}
        throw new Error(`HTTP ${resp.status} · ${bodySnippet}`);
      }
      const data = await resp.json();
      const raw = (data.content?.[0]?.text || '[]').replace(/```json|```/g, '').trim();
      let arr = [];
      try { arr = JSON.parse(raw); } catch(e) {
        // Fallback: estrai manualmente stringhe quotate
        const m = raw.match(/"([^"]+)"/g);
        arr = m ? m.map(s => s.slice(1, -1)) : [];
        if (!arr.length) console.warn('[LiveChat] AI raw non parsabile:', raw.slice(0, 200));
      }
      if (!Array.isArray(arr) || arr.length === 0) throw new Error('AI empty (raw: ' + raw.slice(0, 120) + ')');
      arr = arr.slice(0, 3).map(s => String(s).trim()).filter(Boolean);
      if (arr.length === 0) throw new Error('AI empty after trim');

      if (myToken !== S.chipToken) return;
      renderChips(arr);
    } catch (err) {
      console.warn('[LiveChat] chip gen fallback →', err?.message || err);
      if (myToken !== S.chipToken) return;
      renderChips(_pickFallbackChips());
    }
  }

  // Alias per leggibilità nei chiamanti che vogliono solo "rigenera sul contesto attuale"
  function generateChipsFromAI() { return runChipGen(null); }

  // ─── Pre-generazione su interim stabile ───
  // Quando l'utente sta ancora parlando e l'interim non cambia per PREGEN_STABLE_MS,
  // lanciamo una chiamata AI "speculativa" usando l'interim come ultimo turno them.
  // Se il final poi coincide (dopo normalize), le chips sono già pronte → zero attesa.
  function schedulePreGen(interimText) {
    if (!interimText) return;
    const words = interimText.trim().split(/\s+/).filter(Boolean);
    if (words.length < PREGEN_MIN_WORDS) return;

    // Reset del timer a ogni update dell'interim: parte solo quando l'interim
    // smette di cambiare per PREGEN_STABLE_MS.
    if (S.interimStableTimer) clearTimeout(S.interimStableTimer);
    S.interimStableTimer = setTimeout(() => {
      S.interimStableTimer = null;
      // Evita di rilanciare se abbiamo già pre-genato per lo stesso testo
      if (S.preGenInterim && _isCloseMatch(S.preGenInterim, interimText)) return;
      S.preGenInterim = interimText;
      runChipGen(interimText);
    }, PREGEN_STABLE_MS);
  }

  // ─── Token Deepgram ───
  async function fetchDeepgramToken() {
    const resp = await fetch(TOKEN_URL, { method: 'GET', cache: 'no-store' });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error('token_http_' + resp.status + ' ' + body);
    }
    const data = await resp.json();
    if (!data.token) throw new Error('token_missing');
    return data.token;
  }

  // ─── Audio capture (AudioWorklet → PCM linear16) ───
  //
  // Perché AudioWorklet e non MediaRecorder?
  // - Latenza minima (niente container webm/opus)
  // - Safari iOS supporta AudioWorklet ma NON MediaRecorder con opus
  // - Deepgram accetta PCM linear16 nativamente senza parsing container
  //
  // Il processor converte Float32 [-1..1] → Int16 e lo manda via port.postMessage.
  // Il sample rate è quello del device (solitamente 48000 o 44100) e lo passiamo
  // a Deepgram come query param (nessun resampling client-side).
  const WORKLET_CODE = `
    class PCMProcessor extends AudioWorkletProcessor {
      process(inputs) {
        const input = inputs[0];
        if (input && input.length > 0) {
          const channel = input[0];
          const pcm = new Int16Array(channel.length);
          for (let i = 0; i < channel.length; i++) {
            const s = Math.max(-1, Math.min(1, channel[i]));
            pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          this.port.postMessage(pcm.buffer, [pcm.buffer]);
        }
        return true;
      }
    }
    registerProcessor('parlia-pcm-processor', PCMProcessor);
  `;

  async function startAudioCapture() {
    // Richiesta microfono
    S.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    // AudioContext (solitamente 48000 Hz)
    const AC = window.AudioContext || window.webkitAudioContext;
    S.audioCtx = new AC();
    if (S.audioCtx.state === 'suspended') {
      await S.audioCtx.resume();
    }

    // Carica il worklet da blob URL (niente file esterno da servire)
    const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
    const workletUrl = URL.createObjectURL(blob);
    await S.audioCtx.audioWorklet.addModule(workletUrl);
    URL.revokeObjectURL(workletUrl);

    S.sourceNode = S.audioCtx.createMediaStreamSource(S.stream);
    S.workletNode = new AudioWorkletNode(S.audioCtx, 'parlia-pcm-processor');

    S.workletNode.port.onmessage = (e) => {
      if (S.ws && S.ws.readyState === WebSocket.OPEN) {
        S.ws.send(e.data);
      }
    };

    S.sourceNode.connect(S.workletNode);
    // NON connettiamo il worklet alla destinazione (niente loopback audio)

    return S.audioCtx.sampleRate;
  }

  function stopAudioCapture() {
    try { if (S.workletNode) { S.workletNode.port.onmessage = null; S.workletNode.disconnect(); } } catch(e){}
    try { if (S.sourceNode) { S.sourceNode.disconnect(); } } catch(e){}
    try { if (S.audioCtx && S.audioCtx.state !== 'closed') { S.audioCtx.close(); } } catch(e){}
    try { if (S.stream) { S.stream.getTracks().forEach(t => t.stop()); } } catch(e){}
    S.workletNode = null; S.sourceNode = null; S.audioCtx = null; S.stream = null;
  }

  // ─── WebSocket Deepgram ───
  function buildDeepgramUrl(sampleRate) {
    const params = { ...DG_PARAMS, sample_rate: String(sampleRate) };
    const qs = Object.entries(params).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    return `wss://api.deepgram.com/v1/listen?${qs}`;
  }

  function connectDeepgramWS(token, sampleRate) {
    // Auth via subprotocol — unico modo per passare credenziali a un WebSocket
    // dal browser (non si possono settare header custom).
    //   - API key permanente  → subprotocol ['token', API_KEY]
    //   - JWT temp da /v1/auth/grant → subprotocol ['bearer', JWT]  ← il nostro caso
    // Se usi 'token' con un JWT, Deepgram risponde 401 durante l'handshake
    // e il browser emette close 1006 senza poter leggere il motivo reale.
    const ws = new WebSocket(buildDeepgramUrl(sampleRate), ['bearer', token]);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      setWsStatus('connected');
    };

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch(e) { return; }
      if (msg.type === 'Results') {
        const alt = msg.channel?.alternatives?.[0];
        const transcript = alt?.transcript || '';
        if (!transcript) return;
        resetSafety();
        if (msg.is_final) {
          commitFinal(transcript);
        } else {
          updateInterim(transcript);
        }
      }
      // Altri tipi di messaggio possibili: 'Metadata', 'UtteranceEnd', 'SpeechStarted', 'Error'
      else if (msg.type === 'Error') {
        console.error('[Deepgram] Error message:', msg);
      }
    };

    ws.onerror = (e) => {
      console.error('[Deepgram] WS error', e);
      setWsStatus('error');
    };

    ws.onclose = (e) => {
      console.log('[Deepgram] WS close code=' + e.code + ' reason=' + (e.reason || '(none)') + ' wasClean=' + e.wasClean);
      // Se chiude inatteso durante l'ascolto, forziamo stop pulito
      if (S.listening) {
        S.listening = false;
        micBtn().classList.remove('listening');
        micIcon().textContent = '🎙️';
        micLabel().textContent = 'Empezar';
        stopAudioCapture();
        clearSafety();
        stopTick();
        setWsStatus('disconnected');
        if (e.code !== 1000) {
          const hint = e.code === 1006 ? ' (auth o red)' : '';
          toast('Conexión cerrada (' + e.code + ')' + hint);
        }
      }
    };

    return ws;
  }

  // ─── Start / Stop ───
  async function startListening() {
    if (S.listening) return;
    S.listening = true;
    S.startedAt = Date.now();
    resetSafety();
    clearChips();

    micBtn().classList.add('listening');
    micIcon().textContent = '⏹️';
    micLabel().textContent = 'Detener';

    setWsStatus('connecting');
    startTick();

    try {
      // 1. Token temporaneo
      const token = await fetchDeepgramToken();
      if (!S.listening) return; // nel frattempo l'utente ha premuto stop

      // 2. Audio capture (ritorna sample rate reale)
      const sampleRate = await startAudioCapture();
      if (!S.listening) { stopAudioCapture(); return; }

      // 3. WebSocket
      S.ws = connectDeepgramWS(token, sampleRate);
    } catch (err) {
      console.error('[LiveChat] start error', err);
      setWsStatus('error');
      toast('Error: ' + (err?.message || err));
      // Cleanup parziale
      stopAudioCapture();
      clearSafety();
      stopTick();
      S.listening = false;
      micBtn().classList.remove('listening');
      micIcon().textContent = '🎙️';
      micLabel().textContent = 'Empezar';
    }
  }

  function stopListening(silent = false) {
    if (!S.listening) return;
    S.listening = false;
    clearSafety();
    // Cancella pre-gen in attesa / in volo
    if (S.interimStableTimer) { clearTimeout(S.interimStableTimer); S.interimStableTimer = null; }
    S.preGenInterim = null;

    // Chiudi WS in modo pulito
    if (S.ws) {
      try {
        // Deepgram accetta il messaggio di finalize per svuotare il buffer
        if (S.ws.readyState === WebSocket.OPEN) {
          try { S.ws.send(JSON.stringify({ type: 'CloseStream' })); } catch(e){}
        }
        S.ws.close(1000, 'user_stop');
      } catch(e){}
      S.ws = null;
    }

    stopAudioCapture();

    micBtn().classList.remove('listening');
    micIcon().textContent = '🎙️';
    micLabel().textContent = 'Empezar';

    setWsStatus('disconnected');
    stopTick();

    // Rimuovi eventuale bolla interim orfana
    if (S.currentInterimEl && S.currentInterimEl.isConnected) {
      S.currentInterimEl.remove();
      S.currentInterimEl = null;
    }

    if (!silent) toast('Micrófono detenido');
  }

  // ─── Handlers pubblici ───
  window.toggleMic = function() {
    if (S.listening) stopListening();
    else startListening();
  };

  window.toggleTTS = function() {
    S.ttsMuted = !S.ttsMuted;
    ttsBtn().textContent = S.ttsMuted ? '🔇' : '🔊';
    ttsBtn().classList.toggle('muted', S.ttsMuted);
    if (S.ttsMuted) {
      try { window.stopNeural && window.stopNeural(); } catch(e){}
      try { window.stopLauraVoice && window.stopLauraVoice(); } catch(e){}
    }
  };

  // Toggle voce: off (default) = Google Neural2-H, on = MiniMax voce di Laura.
  // Stato persistito in localStorage. Fallback automatico a Neural2 in _playChipVoice.
  window.toggleLauraVoice = function() {
    const on = !_useLauraVoice();
    localStorage.setItem('parlia_live_use_laura_voice', on ? '1' : '0');
    _syncLauraVoiceBtn();
    // Stop audio in corso così il prossimo chip parte col nuovo motore
    try { window.stopNeural && window.stopNeural(); } catch(e){}
    try { window.stopLauraVoice && window.stopLauraVoice(); } catch(e){}
  };

  function _syncLauraVoiceBtn() {
    const btn = document.getElementById('voiceBtn');
    if (!btn) return;
    btn.classList.toggle('on', _useLauraVoice());
    btn.setAttribute('aria-pressed', _useLauraVoice() ? 'true' : 'false');
  }
  // Inizializza lo stato del bottone al load
  document.addEventListener('DOMContentLoaded', _syncLauraVoiceBtn);

  // ─── Power-down automatico ───
  function powerDown() {
    if (S.listening) stopListening(true);
    if (window.stopNeural) { try { window.stopNeural(); } catch(e){} }
    if (window.stopLauraVoice) { try { window.stopLauraVoice(); } catch(e){} }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') powerDown();
  });
  window.addEventListener('pagehide', powerDown);
  window.addEventListener('beforeunload', powerDown);

  // ─── Interlocutori (render + selezione) ───
  function _currentContact() {
    return CONTACTS.find(c => c.id === S.interlocutorId) || CONTACTS[0];
  }

  function _loadInterlocutor() {
    try {
      const saved = localStorage.getItem('parlia_live_interlocutor');
      if (saved && CONTACTS.some(c => c.id === saved)) S.interlocutorId = saved;
    } catch(e) {}
  }
  function _saveInterlocutor() {
    try { localStorage.setItem('parlia_live_interlocutor', S.interlocutorId); } catch(e) {}
  }

  function renderInterlocutors() {
    const row = document.getElementById('lcInterlocutors');
    if (!row) return;
    row.innerHTML = '';
    CONTACTS.forEach(c => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lc-interlocutor' + (c.id === S.interlocutorId ? ' active' : '');
      btn.innerHTML = `<span class="lc-interlocutor-emoji">${c.emoji}</span> ${c.name}`;
      btn.onclick = () => selectInterlocutor(c.id);
      row.appendChild(btn);
    });
  }

  function _updateEmptyState() {
    const c = _currentContact();
    const i = document.getElementById('lcEmptyIcon');
    const t = document.getElementById('lcEmptyTitle');
    const s = document.getElementById('lcEmptySub');
    if (i) i.textContent = c.emoji;
    if (t) t.textContent = 'Conversación con ' + c.name;
    if (s) s.innerHTML = 'Pulsa <b>Empezar</b>. Parlia sugerirá respuestas adecuadas para hablar con ' + c.name.toLowerCase() + '.';
  }

  function selectInterlocutor(id) {
    if (!id || id === S.interlocutorId) return;
    const prev = S.interlocutorId;
    S.interlocutorId = id;
    _saveInterlocutor();

    // Reset conversazione: nuova persona, nuova storia
    S.history = [];
    S.preGenInterim = null;
    if (S.interimStableTimer) { clearTimeout(S.interimStableTimer); S.interimStableTimer = null; }
    S.chipToken++;  // invalida eventuali chiamate AI in volo
    clearChips();

    // Svuota thread e ricrea empty state con i testi del nuovo contatto
    const th = thread();
    if (th) th.innerHTML = '';
    S.currentInterimEl = null;
    const empty = document.createElement('div');
    empty.className = 'lc-empty';
    empty.id = 'lcEmpty';
    empty.innerHTML = `
      <div class="lc-empty-icon" id="lcEmptyIcon"></div>
      <div class="lc-empty-title" id="lcEmptyTitle"></div>
      <div class="lc-empty-sub" id="lcEmptySub"></div>`;
    th.appendChild(empty);
    _updateEmptyState();

    renderInterlocutors();
    if (prev) toast('Interlocutor: ' + _currentContact().name);
  }

  // ─── Init ───
  function init() {
    _loadInterlocutor();
    renderInterlocutors();
    _updateEmptyState();
    setWsStatus('disconnected');
    adminTime().textContent = '00:00';
    adminCost().textContent = '$0.0000';
    adminLast().textContent = '—';
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
