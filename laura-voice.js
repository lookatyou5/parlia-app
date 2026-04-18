/* ═══════════════════════════════════════════════════════════════
   LAURA VOICE · MiniMax speech-01-turbo cloned voice
   ═══════════════════════════════════════════════════════════════

   Espone:
     window.fetchMiniMaxAudio(text, opts?)  → riproduce la voce clonata di Laura
     window.stopLauraVoice()                → stop immediato
     window.lauraVoiceStats()               → { plays, cacheHits, charsSent, charsSaved }

   Architettura:
     [Browser] --POST {text,speed?}--> [parlia-minimax Worker]
                                              |
                                    + MINIMAX_API_KEY + GROUP_ID + VOICE_ID
                                              |
                                              v
                           [api.minimax.io/v1/t2a_v2]
                                              |
     [Browser] <-- audio/mpeg blob --<------<-'
     ↓
     LRU cache (in-memoria, 120 frasi) → riproduzioni successive istantanee

   Cache strategy:
   - Key: lowercase(trim(text)) — così "Hola" e "hola " hit la stessa entry
   - In-memoria via Map + LRU touch
   - Persistence tra refresh: NON implementata in v1 (se serve, v2 con Cache API)
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const PROXY_URL     = 'https://parlia-minimax.luca-peltrini.workers.dev';
  const CACHE_MAX     = 120;     // frasi max in LRU (alta perché Laura ne riuserà molte)
  const FETCH_TIMEOUT = 12000;   // MiniMax può essere lento su testi lunghi

  // ─── Tracking costi (stima client-side) ───
  // Default: $0.060 per 1000 caratteri (pricing ufficiale MiniMax
  // https://platform.minimax.io/docs/guides/pricing-paygo — speech-02-turbo
  // $60/M chars. speech-01-turbo non è esplicitamente listato ma la misura
  // empirica — 307 char → $0.02 = $0.065/1K — è coerente con lo stesso rate
  // più eventuale rounding upstream.
  // Per speech-02-hd / 2.6-hd / 2.8-hd il rate corretto è $0.100/1K ($100/M).
  // L'utente può ritarare via setPricePer1K() / bottone "Tasa ✏️" nella UI.
  const DEFAULT_PRICE_PER_1K = 0.060;
  const PRICE_KEY    = 'parlia_laura_price_per_1k';
  const LIFETIME_KEY = 'parlia_laura_lifetime_chars';

  function _getPricePer1K() {
    try {
      const raw = localStorage.getItem(PRICE_KEY);
      const v = parseFloat(raw);
      if (isFinite(v) && v >= 0 && v < 10) return v;
    } catch (e) {}
    return DEFAULT_PRICE_PER_1K;
  }
  function _setPricePer1K(v) {
    const n = parseFloat(v);
    if (!isFinite(n) || n < 0 || n >= 10) return false;
    try { localStorage.setItem(PRICE_KEY, String(n)); return true; } catch (e) { return false; }
  }
  function _getLifetimeChars() {
    try {
      const v = parseInt(localStorage.getItem(LIFETIME_KEY) || '0', 10);
      return isFinite(v) && v >= 0 ? v : 0;
    } catch (e) { return 0; }
  }
  function _addLifetimeChars(n) {
    try {
      const cur = _getLifetimeChars();
      localStorage.setItem(LIFETIME_KEY, String(cur + n));
    } catch (e) {}
  }
  function _resetLifetime() {
    try { localStorage.removeItem(LIFETIME_KEY); } catch (e) {}
  }

  // ─── Cache a 2 livelli: in-memory (Map) + persistente (IndexedDB) ───
  //
  // Layer 1 — Map<key, blobUrl>
  //   Serve la riproduzione istantanea (URL.createObjectURL già risolto,
  //   nessuna lettura async dal disco).
  //
  // Layer 2 — IndexedDB 'parlia-laura-voice' / store 'audio'
  //   Entry schema: { key: string, blob: Blob, ts: number, chars: number }
  //   Sopravvive a refresh, chiusura PWA, riavvio del dispositivo.
  //   Al page load ogni entry viene letta una volta sola e il blob
  //   convertito in URL locale che popola la Map → da lì in poi la
  //   riproduzione è identica a una cache in-memory.
  //
  // Se IndexedDB non è disponibile (Firefox in privacy mode, Safari in
  // private browsing su iOS ≤13, ecc.) si degrada silenziosamente al
  // solo layer in-memory — zero errori utente.
  const IDB_NAME = 'parlia-laura-voice';
  const IDB_VERSION = 1;
  const IDB_STORE = 'audio';

  const _cache = new Map();      // key → blobUrl (memoria)
  const _stats = {
    plays: 0,           // riproduzioni totali (cache + API)
    cacheHits: 0,       // riproduzioni servite da cache
    charsSent: 0,       // caratteri effettivamente spediti a MiniMax
    charsSaved: 0,      // caratteri risparmiati grazie alla cache
  };

  let _db = null;
  let _idbAvailable = true;
  let _idbReady = null;          // Promise risolta al termine del preload

  let _currentAudio = null;
  let _currentToken = 0;

  function _normalize(text) {
    return String(text || '').toLowerCase().trim();
  }

  // ─── IndexedDB helpers ───
  function _idbOpen() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { _idbAvailable = false; reject(new Error('no_idb')); return; }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => { _idbAvailable = false; reject(req.error); };
      req.onblocked = () => { /* no-op: il vecchio DB viene chiuso dal tab precedente */ };
    });
  }
  function _idbTx(mode = 'readonly') {
    return _db.transaction(IDB_STORE, mode).objectStore(IDB_STORE);
  }
  function _idbGetAll() {
    return new Promise((resolve, reject) => {
      try {
        const req = _idbTx().getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
  }
  function _idbPut(entry) {
    return new Promise((resolve, reject) => {
      try {
        const req = _idbTx('readwrite').put(entry);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
  }
  function _idbDelete(key) {
    return new Promise((resolve, reject) => {
      try {
        const req = _idbTx('readwrite').delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
  }
  function _idbClear() {
    return new Promise((resolve, reject) => {
      try {
        const req = _idbTx('readwrite').clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
  }

  async function _preloadCacheFromIDB() {
    try {
      await _idbOpen();
      const entries = await _idbGetAll();
      // Ordina per timestamp crescente così le entry più vecchie finiscono
      // "in fondo" alla LRU Map (saranno le prime a essere sfrattate se
      // superiamo CACHE_MAX durante la sessione).
      entries.sort((a, b) => (a.ts || 0) - (b.ts || 0));
      for (const e of entries) {
        if (!e || !e.blob || !e.key) continue;
        try {
          const url = URL.createObjectURL(e.blob);
          _cache.set(e.key, url);
        } catch (err) { /* skip entry corrotta */ }
      }
      console.log('[laura-voice] IDB preload:', entries.length, 'frases en caché persistente');
    } catch (err) {
      _idbAvailable = false;
      console.warn('[laura-voice] IndexedDB no disponible, solo caché en memoria:', err && err.message);
    }
  }
  _idbReady = _preloadCacheFromIDB();

  function _cacheGet(key) {
    if (!_cache.has(key)) return null;
    const v = _cache.get(key);
    _cache.delete(key); _cache.set(key, v);   // LRU touch
    return v;
  }
  async function _cacheSet(key, blob, chars) {
    // Evict oldest from Map se superiamo CACHE_MAX
    if (_cache.size >= CACHE_MAX) {
      const oldestKey = _cache.keys().next().value;
      const oldUrl = _cache.get(oldestKey);
      _cache.delete(oldestKey);
      try { URL.revokeObjectURL(oldUrl); } catch (e) {}
      // Rimuovi anche da IDB per non far crescere il DB all'infinito
      if (_idbAvailable) {
        try { await _idbDelete(oldestKey); } catch (e) {}
      }
    }
    const blobUrl = URL.createObjectURL(blob);
    _cache.set(key, blobUrl);
    // Persist in IDB (fire-and-forget: non bloccare la riproduzione)
    if (_idbAvailable) {
      _idbPut({ key, blob, ts: Date.now(), chars: chars || 0 })
        .catch(err => console.warn('[laura-voice] IDB put fail:', err && err.message));
    }
    return blobUrl;
  }

  function _stopCurrent() {
    if (_currentAudio) {
      try { _currentAudio.pause(); } catch (e) {}
      try { _currentAudio.currentTime = 0; } catch (e) {}
      _currentAudio = null;
    }
  }

  function _fetchWithTimeout(url, opts, ms) {
    return new Promise((resolve, reject) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), ms);
      fetch(url, Object.assign({}, opts, { signal: ctrl.signal }))
        .then(r => { clearTimeout(timer); resolve(r); })
        .catch(e => { clearTimeout(timer); reject(e); });
    });
  }

  // Aggiunge un punto finale se il testo non termina con punteggiatura di
  // chiusura. Il voice clone MiniMax tende ad allungare/sospirare frasi
  // corte senza terminatore (probabilmente ereditato dai pattern emotivi
  // dell'audio di training). Un '.' finale dà un segnale netto di stop.
  function _ensureTerminalPunct(text) {
    const t = text.trim();
    if (!t) return t;
    // Gli ellipsi e i doppi punteggi contano come terminali (niente retrocompat)
    if (/[.!?…]$/.test(t)) return t;
    return t + '.';
  }

  // Whitelist delle emozioni accettate da MiniMax speech-01/02. Valore invalido
  // → default 'neutral' (tono piatto, stabile, meno variabilità sul clone).
  const EMOTIONS = ['happy','sad','angry','fearful','surprised','disgusted','neutral'];
  function _normalizeEmotion(e) {
    const v = typeof e === 'string' ? e.toLowerCase().trim() : '';
    return EMOTIONS.includes(v) ? v : 'neutral';
  }

  async function fetchMiniMaxAudio(text, opts) {
    text = _ensureTerminalPunct(String(text || '').trim());
    if (!text) return;
    opts = opts || {};
    const onEnd   = typeof opts.onend   === 'function' ? opts.onend   : null;
    const onErr   = typeof opts.onerror === 'function' ? opts.onerror : null;
    const speed   = typeof opts.speed   === 'number'   ? opts.speed   : 1.0;
    const emotion = _normalizeEmotion(opts.emotion);
    // Cache key include anche emotion: "tengo hambre | neutral" ≠ "tengo hambre | happy"
    // così varianti emotive vivono in cache come entry separate (audio diversi).
    const key     = _normalize(text) + '|' + emotion;

    _stopCurrent();
    const myToken = ++_currentToken;

    // Aspetta il preload IDB prima di controllare la cache — così il primo
    // tap dopo un refresh NON paga API se la frase era persistita da una
    // sessione precedente. Il wait è tipicamente <100ms (getAll di una
    // manciata di entry); se IDB non è disponibile, la promise si risolve
    // subito senza bloccare.
    if (_idbReady) { try { await _idbReady; } catch (e) {} }

    if (myToken !== _currentToken) return;

    const playBlobUrl = (url, fromCache) => {
      if (myToken !== _currentToken) return;
      const audio = new Audio(url);
      _currentAudio = audio;
      audio.onended = () => { if (_currentAudio === audio) _currentAudio = null; if (onEnd) onEnd(); };
      audio.onerror = () => {
        if (_currentAudio === audio) _currentAudio = null;
        if (onErr) onErr(new Error('audio_play_error'));
      };
      audio.play().catch(err => {
        console.warn('[laura-voice] play failed:', err);
        if (_currentAudio === audio) _currentAudio = null;
        if (onErr) onErr(err);
      });
      _stats.plays++;
      if (fromCache) {
        _stats.cacheHits++;
        _stats.charsSaved += text.length;
      }
    };

    // 1. Cache hit → zero chiamate API
    const cached = _cacheGet(key);
    if (cached) {
      playBlobUrl(cached, true);
      return { fromCache: true };
    }

    // 2. Cache miss → fetch dal Worker
    try {
      const res = await _fetchWithTimeout(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, speed, emotion }),
      }, FETCH_TIMEOUT);

      if (!res.ok) {
        // Estrai tutto il detail utile dal JSON di errore del Worker
        // (error + base_resp.status_code/msg + upstream status)
        let errBody = null;
        try { errBody = await res.json(); } catch (e) {}
        const parts = ['HTTP ' + res.status];
        if (errBody) {
          if (errBody.error)   parts.push(errBody.error);
          if (errBody.status)  parts.push('up_status ' + errBody.status);
          if (errBody.base_resp) {
            const br = errBody.base_resp;
            parts.push('minimax ' + (br.status_code ?? '?') + ': ' + (br.status_msg || '').slice(0, 120));
          }
          if (errBody.detail)  parts.push(String(errBody.detail).slice(0, 160));
        }
        throw new Error(parts.join(' · '));
      }

      const blob = await res.blob();
      if (myToken !== _currentToken) return;   // nel frattempo stopped
      const blobUrl = await _cacheSet(key, blob, text.length);
      _stats.charsSent += text.length;
      _addLifetimeChars(text.length);
      playBlobUrl(blobUrl, false);
      return { fromCache: false };
    } catch (err) {
      console.error('[laura-voice] fetch error:', err);
      if (onErr) onErr(err);
      throw err;
    }
  }

  function stopLauraVoice() {
    _currentToken++;
    _stopCurrent();
  }

  function lauraVoiceStats() {
    const pricePer1K = _getPricePer1K();
    const lifetimeChars = _getLifetimeChars();
    return {
      plays: _stats.plays,
      cacheHits: _stats.cacheHits,
      charsSent: _stats.charsSent,
      charsSaved: _stats.charsSaved,
      cacheSize: _cache.size,
      pricePer1K,
      lifetimeChars,
      costSession: (_stats.charsSent / 1000) * pricePer1K,
      costSaved:   (_stats.charsSaved / 1000) * pricePer1K,
      costLifetime: (lifetimeChars / 1000) * pricePer1K,
    };
  }

  async function clearLauraVoiceCache() {
    // 1. Memory
    for (const url of _cache.values()) {
      try { URL.revokeObjectURL(url); } catch (e) {}
    }
    _cache.clear();
    // 2. IndexedDB (persistente)
    if (_idbAvailable) {
      try { await _idbClear(); } catch (e) { console.warn('[laura-voice] IDB clear fail:', e && e.message); }
    }
  }

  function setLauraPricePer1K(v) { return _setPricePer1K(v); }
  function resetLauraLifetimeCounter() { _resetLifetime(); }

  // Promise risolta quando la cache persistente è stata precaricata in memoria.
  // Esposta così la UI può mostrare lo stato "cargando caché…" e aggiornare
  // il counter 'Entradas en caché' una volta completato.
  function lauraVoiceReady() { return _idbReady || Promise.resolve(); }

  // Check se un testo specifico è già in cache (usato dalla UI per marcare
  // i bottoni che non costerebbero nulla prima ancora di essere toccati).
  // Ora la chiave include l'emotion → applichiamo la stessa normalizzazione
  // del path di play (ensureTerminalPunct + emotion). Senza opts → neutral.
  function isLauraCached(text, opts) {
    const t = _ensureTerminalPunct(String(text || '').trim());
    if (!t) return false;
    const emo = _normalizeEmotion(opts && opts.emotion);
    return _cache.has(_normalize(t) + '|' + emo);
  }

  // Stop audio quando la tab va in background
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLauraVoice();
  });

  // Esposizione globale
  window.fetchMiniMaxAudio         = fetchMiniMaxAudio;
  window.stopLauraVoice            = stopLauraVoice;
  window.lauraVoiceStats           = lauraVoiceStats;
  window.clearLauraVoiceCache      = clearLauraVoiceCache;
  window.setLauraPricePer1K        = setLauraPricePer1K;
  window.resetLauraLifetimeCounter = resetLauraLifetimeCounter;
  window.lauraVoiceReady           = lauraVoiceReady;
  window.isLauraCached             = isLauraCached;
})();
