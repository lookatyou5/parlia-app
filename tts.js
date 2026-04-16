// tts.js — Google Cloud Text-to-Speech (Neural2) per Parlia
// Espone window.speakNeural(text, opts) con cache, stop precedente, fallback Web Speech.
// Endpoint: Cloudflare Worker parlia-tts → Google TTS API

(function () {
  'use strict';

  const TTS_PROXY    = 'https://parlia-tts.luca-peltrini.workers.dev';
  const DEFAULT_VOICE = 'es-ES-Neural2-H';
  const DEFAULT_RATE  = 0.9;
  const CACHE_MAX     = 60;   // max frasi in cache (LRU semplice)
  const FETCH_TIMEOUT = 6000; // ms — oltre questo timeout: fallback

  const _cache = new Map();   // key "voice|rate|text" → blobUrl
  let _currentAudio = null;
  let _currentToken = 0;      // invalida richieste obsolete

  function _cacheGet(key) {
    if (!_cache.has(key)) return null;
    const v = _cache.get(key);
    _cache.delete(key); _cache.set(key, v); // LRU touch
    return v;
  }
  function _cacheSet(key, blobUrl) {
    if (_cache.size >= CACHE_MAX) {
      const oldest = _cache.keys().next().value;
      const old = _cache.get(oldest);
      _cache.delete(oldest);
      try { URL.revokeObjectURL(old); } catch (e) {}
    }
    _cache.set(key, blobUrl);
  }

  function _stopCurrent() {
    if (_currentAudio) {
      try { _currentAudio.pause(); } catch (e) {}
      try { _currentAudio.currentTime = 0; } catch (e) {}
      _currentAudio = null;
    }
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
  }

  function _fallback(text, rate) {
    if (!('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES';
      u.rate = rate;
      u.pitch = 1.05;
      u.volume = 1;
      const vs = speechSynthesis.getVoices();
      const v = vs.find(v => v.name.includes('Lucía') || v.name.includes('Lucia') || (v.lang === 'es-ES' && v.localService))
             || vs.find(v => v.lang === 'es-ES')
             || vs.find(v => v.lang.startsWith('es'));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) { /* silenzioso */ }
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

  async function speakNeural(text, opts) {
    text = (text || '').toString().trim();
    if (!text) return;

    opts = opts || {};
    const voice = opts.voice || DEFAULT_VOICE;
    const rate  = typeof opts.rate === 'number' ? opts.rate : DEFAULT_RATE;
    const onEnd = typeof opts.onend === 'function' ? opts.onend : null;

    _stopCurrent();
    const myToken = ++_currentToken;
    const key = voice + '|' + rate + '|' + text;

    const playBlobUrl = (url) => {
      if (myToken !== _currentToken) return; // un altro speak è arrivato dopo
      const audio = new Audio(url);
      _currentAudio = audio;
      audio.onended = () => { if (_currentAudio === audio) _currentAudio = null; if (onEnd) onEnd(); };
      audio.onerror = () => { if (_currentAudio === audio) _currentAudio = null; if (onEnd) onEnd(); };
      audio.play().catch(() => {
        // autoplay policy: in certi contesti senza user gesture iOS rifiuta
        if (_currentAudio === audio) _currentAudio = null;
      });
    };

    const cached = _cacheGet(key);
    if (cached) { playBlobUrl(cached); return; }

    try {
      const res = await _fetchWithTimeout(TTS_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, rate })
      }, FETCH_TIMEOUT);

      if (!res.ok) throw new Error('TTS HTTP ' + res.status);
      const blob = await res.blob();
      if (myToken !== _currentToken) return;
      const url = URL.createObjectURL(blob);
      _cacheSet(key, url);
      playBlobUrl(url);
    } catch (e) {
      console.warn('[speakNeural] fallback Web Speech:', e && e.message);
      if (myToken === _currentToken) _fallback(text, rate);
    }
  }

  function stopNeural() {
    _currentToken++;
    _stopCurrent();
  }

  // Pre-warm voci Web Speech (per fallback istantaneo)
  if ('speechSynthesis' in window) {
    try { speechSynthesis.getVoices(); } catch (e) {}
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => { try { speechSynthesis.getVoices(); } catch (e) {} };
    }
  }

  // Stop audio quando l'app va in background
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopNeural();
  });

  window.speakNeural = speakNeural;
  window.stopNeural  = stopNeural;
})();
