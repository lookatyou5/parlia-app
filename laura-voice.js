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
  // Default: $0.065 per 1000 caratteri (misurato empiricamente: 307 char → $0.02
  // su speech-01-turbo con cloned voice). L'utente può ritarare via setPricePer1K().
  const DEFAULT_PRICE_PER_1K = 0.065;
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

  // Stato privato (cache + stats)
  const _cache = new Map();      // key → blobUrl
  const _stats = {
    plays: 0,           // riproduzioni totali (cache + API)
    cacheHits: 0,       // riproduzioni servite da cache
    charsSent: 0,       // caratteri effettivamente spediti a MiniMax
    charsSaved: 0,      // caratteri risparmiati grazie alla cache
  };

  let _currentAudio = null;
  let _currentToken = 0;

  function _normalize(text) {
    return String(text || '').toLowerCase().trim();
  }

  function _cacheGet(key) {
    if (!_cache.has(key)) return null;
    const v = _cache.get(key);
    _cache.delete(key); _cache.set(key, v);   // LRU touch
    return v;
  }
  function _cacheSet(key, blobUrl) {
    if (_cache.size >= CACHE_MAX) {
      const oldestKey = _cache.keys().next().value;
      const oldUrl = _cache.get(oldestKey);
      _cache.delete(oldestKey);
      try { URL.revokeObjectURL(oldUrl); } catch (e) {}
    }
    _cache.set(key, blobUrl);
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

  async function fetchMiniMaxAudio(text, opts) {
    text = String(text || '').trim();
    if (!text) return;
    opts = opts || {};
    const onEnd  = typeof opts.onend  === 'function' ? opts.onend  : null;
    const onErr  = typeof opts.onerror === 'function' ? opts.onerror : null;
    const speed  = typeof opts.speed  === 'number'   ? opts.speed  : 1.0;
    const key    = _normalize(text);

    _stopCurrent();
    const myToken = ++_currentToken;

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
        body: JSON.stringify({ text, speed }),
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
      const blobUrl = URL.createObjectURL(blob);
      _cacheSet(key, blobUrl);
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

  function clearLauraVoiceCache() {
    for (const url of _cache.values()) {
      try { URL.revokeObjectURL(url); } catch (e) {}
    }
    _cache.clear();
  }

  function setLauraPricePer1K(v) { return _setPricePer1K(v); }
  function resetLauraLifetimeCounter() { _resetLifetime(); }

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
})();
