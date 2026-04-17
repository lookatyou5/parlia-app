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
  };

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
    b.className = 'lc-bubble user interim';
    b.textContent = '';
    thread().appendChild(b);
    S.currentInterimEl = b;
    return b;
  }
  function updateInterim(text) {
    const b = ensureInterimBubble();
    b.textContent = text;
    thread().scrollTop = thread().scrollHeight;
  }
  function commitFinal(text) {
    // Promuove la bolla interim corrente a finale (se esiste) o ne crea una nuova.
    if (S.currentInterimEl && S.currentInterimEl.isConnected) {
      S.currentInterimEl.classList.remove('interim');
      S.currentInterimEl.textContent = text;
    } else {
      hideEmpty();
      const b = document.createElement('div');
      b.className = 'lc-bubble user';
      b.textContent = text;
      thread().appendChild(b);
    }
    S.currentInterimEl = null;
    thread().scrollTop = thread().scrollHeight;

    // Aggiungi il turno del INTERLOCUTORE alla history (la persona che parla
    // è chi sta di fronte all'utente; le chips sono risposte per l'utente).
    pushHistory('them', text);

    // Avvia generazione chip AI
    generateChipsFromAI();
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

  function onChipTap(btn, text) {
    resetSafety();
    document.querySelectorAll('.lc-chip.played').forEach(c => c.classList.remove('played'));
    btn.classList.add('played');

    // Aggiungi il turno dell'UTENTE alla history (tap su chip = "ha detto")
    pushHistory('me', text);

    if (!S.ttsMuted && window.speakNeural) {
      try { window.stopNeural && window.stopNeural(); } catch(e){}
      if (typeof window.speakNeural.chip === 'function') {
        window.speakNeural.chip(text);
      } else {
        window.speakNeural(text, { rate: 1.0 });
      }
    }
  }

  // ─── Generazione chip via Claude Haiku ───
  //
  // Mandiamo a Claude Haiku gli ultimi N turni (them/me) + un system prompt
  // specifico e gli chiediamo 3 risposte brevi IN PRIMA PERSONA per l'utente.
  // Usiamo un token monotonico: se arriva un nuovo final transcript prima che
  // la richiesta precedente abbia risposto, scartiamo il risultato vecchio.
  async function generateChipsFromAI() {
    const myToken = ++S.chipToken;
    showChipsLoading();

    try {
      const ud = (window.ParliaUser && ParliaUser.get && ParliaUser.get()) || {};
      const userName = ud.personal?.userName || '';
      const hobbies  = (ud.memory?.hobbies || []).slice(0, 3).join(', ');
      const condicion = (ud.personal?.condicion && ud.personal.condicion[0]) || '';

      const systemPrompt =
        'Eres el asistente de comunicación de una persona con dificultades del habla. ' +
        'Alguien está hablando con la persona en una conversación cara a cara. ' +
        'Tu tarea: generar 3 posibles respuestas que la persona podría tocar con el dedo ' +
        'para que la voz las lea en voz alta a quien le está hablando. ' +
        '\n\nReglas estrictas:' +
        '\n- Respuestas en PRIMERA PERSONA (yo/me/mi), en español natural y conversacional' +
        '\n- 3 respuestas VARIADAS en intención, nunca repetitivas:' +
        '\n   · 1 muy breve (1-4 palabras): sí/no/gracias/etc' +
        '\n   · 1 corta con matiz (3-7 palabras)' +
        '\n   · 1 un poco más larga (6-14 palabras) con contexto o pregunta inversa' +
        '\n- NUNCA repitas literalmente lo que ha dicho el interlocutor' +
        '\n- Si ya hay historia previa, haz que las respuestas sean coherentes' +
        (userName ? `\n- La persona se llama ${userName}` : '') +
        (condicion ? `\n- Condición: ${condicion}` : '') +
        (hobbies ? `\n- Intereses del usuario: ${hobbies}` : '') +
        '\n\nResponde SOLO con un JSON array de 3 strings, sin markdown, sin comentarios.' +
        '\nEjemplo: ["Sí","No mucho hoy","Ahora mismo estoy un poco cansado, ¿podemos hablar luego?"]';

      // Costruzione del payload messages: una sola riga utente che include la history
      // formattata come "INTERLOCUTOR:" / "YO:" — più semplice per Haiku di passare
      // assistant/user alternati (che confonderebbero il ruolo di YO).
      const convo = S.history.map(h =>
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
          max_tokens: 200,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMsg }],
        }),
      });

      if (myToken !== S.chipToken) return;           // nel frattempo è arrivato un altro final
      if (!S.listening && S.chipToken === myToken) { /* stop premuto: mantieni ultime chip */ }

      if (!resp.ok) throw new Error('AI HTTP ' + resp.status);
      const data = await resp.json();
      const raw = (data.content?.[0]?.text || '[]').replace(/```json|```/g, '').trim();
      let arr = [];
      try { arr = JSON.parse(raw); } catch(e) {
        // Fallback: estrai manualmente stringhe quotate
        const m = raw.match(/"([^"]+)"/g);
        arr = m ? m.map(s => s.slice(1, -1)) : [];
      }
      if (!Array.isArray(arr) || arr.length === 0) throw new Error('AI empty');
      arr = arr.slice(0, 3).map(s => String(s).trim()).filter(Boolean);
      if (arr.length === 0) throw new Error('AI empty');

      if (myToken !== S.chipToken) return;
      renderChips(arr);
    } catch (err) {
      console.warn('[LiveChat] chip gen fallback:', err?.message || err);
      if (myToken !== S.chipToken) return;
      // Fallback: chips generici universali (sempre utili)
      renderChips(['Sí', 'No lo sé', 'Espera un momento, por favor']);
    }
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
    if (S.ttsMuted && window.stopNeural) { try { window.stopNeural(); } catch(e){} }
  };

  // ─── Power-down automatico ───
  function powerDown() {
    if (S.listening) stopListening(true);
    if (window.stopNeural) { try { window.stopNeural(); } catch(e){} }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') powerDown();
  });
  window.addEventListener('pagehide', powerDown);
  window.addEventListener('beforeunload', powerDown);

  // ─── Init ───
  function init() {
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
