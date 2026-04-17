// tts.js — Google Cloud Text-to-Speech (Neural2) per Parlia
// Espone window.speakNeural(text, opts) con cache, stop precedente, fallback Web Speech.
// Endpoint: Cloudflare Worker parlia-tts → Google TTS API
//
// Helper SSML "terapeutici" (su Neural2, supporta SSML):
//   speakNeural.exerciseWord(word)   → emphasis + slow su parola intera
//   speakNeural.withPauses(text)     → [pausa] o [pausa:1.5s] → <break time="..."/>
//   speakNeural.cheer(text)          → pitch +15%, volume +3dB (incoraggiamento)
//   speakNeural.therapeutic(text, { targetWord, difficultPhonemes? })
//                                    → rallenta + enfasi su targetWord se contiene fonemi difficili
//   speakNeural.chip(text)           → tono naturale/immediato per risposte conversazionali (Live AI Chat)
//
// I difficultPhonemes vengono letti automaticamente da parlia_logo_profile.difficultPhonemes
// se non passati esplicitamente.

(function () {
  'use strict';

  const TTS_PROXY    = 'https://parlia-tts.luca-peltrini.workers.dev';
  const DEFAULT_VOICE = 'es-ES-Neural2-H';
  const DEFAULT_RATE  = 0.9;
  const CACHE_MAX     = 60;   // max frasi in cache (LRU semplice)
  const FETCH_TIMEOUT = 6000; // ms — oltre questo timeout: fallback

  const _cache = new Map();   // key "voice|rate|ssml|text" → blobUrl
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

  // Per il fallback Web Speech: serve testo plain, niente tag SSML
  function _stripSSML(s) {
    return String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }

  function _fallback(text, rate, isSsml) {
    if (!('speechSynthesis' in window)) return;
    const plain = isSsml ? _stripSSML(text) : text;
    if (!plain) return;
    try {
      const u = new SpeechSynthesisUtterance(plain);
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
    const isSsml = opts.ssml === true;

    _stopCurrent();
    const myToken = ++_currentToken;
    const key = voice + '|' + rate + '|' + (isSsml ? 's' : 't') + '|' + text;

    const playBlobUrl = (url) => {
      if (myToken !== _currentToken) return;
      const audio = new Audio(url);
      _currentAudio = audio;
      audio.onended = () => { if (_currentAudio === audio) _currentAudio = null; if (onEnd) onEnd(); };
      audio.onerror = () => { if (_currentAudio === audio) _currentAudio = null; if (onEnd) onEnd(); };
      audio.play().catch(() => {
        if (_currentAudio === audio) _currentAudio = null;
      });
    };

    const cached = _cacheGet(key);
    if (cached) { playBlobUrl(cached); return; }

    try {
      const reqBody = { text, voice, rate };
      if (isSsml) reqBody.ssml = true;

      const res = await _fetchWithTimeout(TTS_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      }, FETCH_TIMEOUT);

      if (!res.ok) throw new Error('TTS HTTP ' + res.status);
      const blob = await res.blob();
      if (myToken !== _currentToken) return;
      const url = URL.createObjectURL(blob);
      _cacheSet(key, url);
      playBlobUrl(url);
    } catch (e) {
      console.warn('[speakNeural] fallback Web Speech:', e && e.message);
      if (myToken === _currentToken) _fallback(text, rate, isSsml);
    }
  }

  function stopNeural() {
    _currentToken++;
    _stopCurrent();
  }

  // ─── HELPER SSML "TERAPEUTICI" ───

  // Escape caratteri SSML-pericolosi nel testo plain (& < > " ')
  function _escapeSSML(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Legge i fonemi difficili dal profilo logopedico (se non passati esplicitamente)
  function _readDifficultPhonemes() {
    try {
      const raw = localStorage.getItem('parlia_logo_profile');
      if (!raw) return [];
      const p = JSON.parse(raw);
      const arr = p && p.difficultPhonemes;
      return Array.isArray(arr) ? arr.map(s => String(s).toLowerCase()).filter(Boolean) : [];
    } catch (e) { return []; }
  }

  // Verifica se una parola contiene almeno uno dei fonemi difficili
  function _wordHasDifficult(word, phonemes) {
    if (!phonemes || !phonemes.length) return false;
    const w = String(word).toLowerCase();
    return phonemes.some(p => w.includes(p));
  }

  // exerciseWord("Mariposa") → speak con emphasis + rate slow sull'intera parola
  function speakExerciseWord(word, opts) {
    const w = (word || '').toString().trim();
    if (!w) return;
    opts = opts || {};
    const ssml = `<prosody rate="slow"><emphasis level="strong">${_escapeSSML(w)}</emphasis></prosody>`;
    return speakNeural(ssml, Object.assign({}, opts, { ssml: true, rate: opts.rate || 0.85 }));
  }

  // withPauses("Respira hondo [pausa:1s] ahora di la palabra") → <break time="1s"/>
  // Marker supportati: [pausa]  [pausa:500ms]  [pausa:1s]  [pausa:1.5s]
  function speakWithPauses(text, opts) {
    const t = (text || '').toString().trim();
    if (!t) return;
    opts = opts || {};
    // Spezza il testo nei marker per fare escape SOLO sul testo plain
    const parts = t.split(/(\[pausa(?::[\d.]+(?:ms|s)?)?\])/i);
    const built = parts.map(part => {
      const m = part.match(/^\[pausa(?::([\d.]+)(ms|s)?)?\]$/i);
      if (m) {
        const dur = m[1] ? `${m[1]}${m[2] || 's'}` : '1s';
        return `<break time="${dur}"/>`;
      }
      return _escapeSSML(part);
    }).join('');
    return speakNeural(built, Object.assign({}, opts, { ssml: true }));
  }

  // cheer("¡Muy bien!") → pitch +15% volume +3dB per feedback positivo
  function speakCheer(text, opts) {
    const t = (text || '').toString().trim();
    if (!t) return;
    opts = opts || {};
    const ssml = `<prosody pitch="+15%" volume="+3dB">${_escapeSSML(t)}</prosody>`;
    return speakNeural(ssml, Object.assign({}, opts, { ssml: true }));
  }

  // chip("Sí, gracias") → tono naturale conversazionale, leggermente più
  // sveglio del default (pitch +2% per calore, rate 1.0 = velocità normale di
  // parlato, non rallentato). Usato in Live AI Chat dopo il tap su una chip.
  function speakChip(text, opts) {
    const t = (text || '').toString().trim();
    if (!t) return;
    opts = opts || {};
    const ssml = `<prosody pitch="+2%">${_escapeSSML(t)}</prosody>`;
    return speakNeural(ssml, Object.assign({}, opts, { ssml: true, rate: opts.rate || 1.0 }));
  }

  // therapeutic("Decir mariposa", { targetWord: "mariposa" })
  // Se targetWord contiene fonemi difficili (dal profilo o passati): rallenta+enfatizza la parola
  // Altrimenti: legge normalmente
  function speakTherapeutic(text, opts) {
    const t = (text || '').toString().trim();
    if (!t) return;
    opts = opts || {};
    const target = (opts.targetWord || '').toString().trim();
    const phonemes = opts.difficultPhonemes || _readDifficultPhonemes();

    if (!target) {
      // niente target → leggi normalmente
      return speakNeural(t, opts);
    }

    const escapedFull = _escapeSSML(t);
    const escapedTarget = _escapeSSML(target);
    const needsBoost = _wordHasDifficult(target, phonemes);

    if (!needsBoost && !t.includes(target)) {
      return speakNeural(t, opts);
    }

    // Sostituisci la prima occorrenza del target con la versione enfatizzata
    let ssml;
    if (needsBoost) {
      const wrapped = `<prosody rate="slow"><emphasis level="strong">${escapedTarget}</emphasis></prosody>`;
      ssml = escapedFull.replace(escapedTarget, wrapped);
    } else {
      const wrapped = `<emphasis level="moderate">${escapedTarget}</emphasis>`;
      ssml = escapedFull.replace(escapedTarget, wrapped);
    }
    return speakNeural(ssml, Object.assign({}, opts, { ssml: true }));
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

  // Esponi tutto a window
  speakNeural.exerciseWord = speakExerciseWord;
  speakNeural.withPauses   = speakWithPauses;
  speakNeural.cheer        = speakCheer;
  speakNeural.therapeutic  = speakTherapeutic;
  speakNeural.chip         = speakChip;

  window.speakNeural = speakNeural;
  window.stopNeural  = stopNeural;
})();
