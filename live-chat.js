/* ═══════════════════════════════════════════════════════════════
   LIVE AI CHAT · Stub UI
   Step 2: shell interattivo senza Deepgram/AI backend.
   Toggle mic finto + admin panel timer + chip TTS con Neural2-H.
   Deepgram (WebSocket) e generazione chips AI verranno aggiunti
   negli step 3/4 quando la key API sarà disponibile.
   ═══════════════════════════════════════════════════════════════ */

(function(){
  'use strict';

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
  const foot      = () => $('lcFootHint');

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

  // ─── Toast semplice (riutilizza pattern di home) ───
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
  function addUserBubble(text, interim = false) {
    hideEmpty();
    const b = document.createElement('div');
    b.className = 'lc-bubble user' + (interim ? ' interim' : '');
    b.textContent = text;
    thread().appendChild(b);
    thread().scrollTop = thread().scrollHeight;
    return b;
  }
  function updateInterimBubble(el, text) {
    if (el) el.textContent = text;
    thread().scrollTop = thread().scrollHeight;
  }
  function promoteInterimToFinal(el, text) {
    if (!el) return;
    el.classList.remove('interim');
    el.textContent = text;
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

  function onChipTap(btn, text) {
    resetSafety();
    // Feedback visivo
    document.querySelectorAll('.lc-chip.played').forEach(c => c.classList.remove('played'));
    btn.classList.add('played');
    // Lettura con Neural2-H, tono conversazionale naturale
    if (!S.ttsMuted && window.speakNeural) {
      try { window.stopNeural && window.stopNeural(); } catch(e){}
      if (typeof window.speakNeural.chip === 'function') {
        window.speakNeural.chip(text);
      } else {
        window.speakNeural(text, { rate: 1.0 });
      }
    }
  }

  // ─── Start / Stop mic ───
  async function startListening() {
    if (S.listening) return;
    S.listening = true;
    S.startedAt = Date.now();
    resetSafety();

    micBtn().classList.add('listening');
    micIcon().textContent = '⏹️';
    micLabel().textContent = 'Detener';

    setWsStatus('connecting');
    startTick();

    // STUB: simula una connessione stabilita dopo 500ms.
    // Step 3: qui andrà il request al Worker parlia-deepgram per il token,
    //         poi new WebSocket('wss://api.deepgram.com/v1/listen?...') + mic stream.
    setTimeout(() => {
      if (S.listening) {
        setWsStatus('connected');
        // Mock: mostra un placeholder per far capire che il flusso è pronto
        addUserBubble('(esperando a que hables…)', true);
        // Stub chips per vedere l'animazione
        setTimeout(() => {
          if (!S.listening) return;
          renderChips(['Sí, gracias', 'No, ahora no', 'Un momento por favor']);
        }, 900);
      }
    }, 500);
  }

  function stopListening(silent = false) {
    if (!S.listening) return;
    S.listening = false;
    clearSafety();
    // Step 3: chiudi il WebSocket Deepgram + ferma i MediaStream tracks.

    micBtn().classList.remove('listening');
    micIcon().textContent = '🎙️';
    micLabel().textContent = 'Empezar';

    setWsStatus('disconnected');
    // Il tick rimane per mostrare il costo finale fino al prossimo avvio
    // ma congelato — fermiamo l'interval e lasciamo gli ultimi valori visibili.
    stopTick();

    // Rimuovi l'ultima bolla interim se è ancora il placeholder
    const interim = thread().querySelector('.lc-bubble.user.interim:last-of-type');
    if (interim && interim.textContent.startsWith('(')) interim.remove();

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
