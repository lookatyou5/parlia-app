// ═══════════════════════════════════════════════════════════════
//  HEAD POINTER · Navigazione con il naso via MediaPipe
//  Cursor visivo + dwell click + head swipe + zona riposo
// ═══════════════════════════════════════════════════════════════

const HP = {
  on: false,
  faceLandmarker: null,
  stream: null,
  animFrame: null,
  lastDetect: 0,
  // Cursor position (screen px, smoothed)
  cx: window.innerWidth / 2,
  cy: window.innerHeight / 2,
  // Raw nose (for lerp)
  rawX: 0.5, rawY: 0.5,
  // Dwell click
  dwellTarget: null,   // element under cursor
  dwellStart: 0,       // timestamp when dwell started
  dwellDone: false,     // already clicked
  DWELL_MS: 1500,
  // Edge swipe
  edgeDir: null,       // 'left' | 'right' | null
  edgeStart: 0,
  EDGE_MS: 1000,
  EDGE_ZONE: 0.12,     // 12% of screen width
  // Rest zone
  REST_TOP: 0.15,       // top 15% of screen
  // Lerp
  LERP: 0.2,
  // Sensitivity: amplifies small head movements around center
  GAIN: 5.5,
  // Calibration: neutral nose position (set on activation)
  neutralX: 0.5,
  neutralY: 0.4,
  calibrated: false,
  // Audio
  popCtx: null,
};

const MP_CDN_HP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision';

// ── Pop sound via Web Audio
function _hpPop(){
  try {
    if (!HP.popCtx) HP.popCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = HP.popCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.1);
  } catch(e){}
  // Also vibrate if supported
  try { navigator.vibrate && navigator.vibrate(30); } catch(e){}
}

// ── MediaPipe loading (same CJS shim pattern)
async function _hpLoadMP(){
  if (window._MP) return true;
  return new Promise(resolve => {
    const s = document.createElement('script');
    s.type = 'module';
    s.textContent = `
      try {
        const v = await import("${MP_CDN_HP}/vision_bundle.mjs");
        window._MP = { FaceLandmarker: v.FaceLandmarker, FilesetResolver: v.FilesetResolver };
      } catch(e){ console.error('HP MP import fail:', e); }
      window._mpDone = true;
    `;
    document.head.appendChild(s);
    const iv = setInterval(() => {
      if (window._mpDone){ clearInterval(iv); resolve(!!window._MP); }
    }, 200);
    setTimeout(() => { clearInterval(iv); resolve(false); }, 15000);
  });
}

async function _hpInitMP(){
  if (HP.faceLandmarker) return true;
  const ok = await _hpLoadMP();
  if (!ok || !window._MP) return false;
  try {
    const { FaceLandmarker, FilesetResolver } = window._MP;
    const fs = await FilesetResolver.forVisionTasks(MP_CDN_HP + '/wasm');
    HP.faceLandmarker = await FaceLandmarker.createFromOptions(fs, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO', outputFaceBlendshapes: false, numFaces: 1,
    });
    return true;
  } catch(e){
    console.error('HP FaceLandmarker init failed:', e);
    return false;
  }
}

// ── Camera
async function _hpStartCam(){
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode:'user', width:{ideal:160}, height:{ideal:120} }, audio: false
    });
    const video = document.getElementById('hpVideo');
    video.srcObject = stream;
    await video.play();
    HP.stream = stream;
    return true;
  } catch(e){
    console.error('HP camera fail:', e);
    return false;
  }
}

function _hpStopCam(){
  if (HP.stream){ HP.stream.getTracks().forEach(t => t.stop()); HP.stream = null; }
  const v = document.getElementById('hpVideo');
  if (v) v.srcObject = null;
}

function _hpPowerDown(){
  HP.on = false;
  if (HP.animFrame){ cancelAnimationFrame(HP.animFrame); HP.animFrame = null; }
  if (typeof _hpStopScrollWatch === 'function') _hpStopScrollWatch();
  document.body.classList.remove('hp-on');
  _hpStopCam();
  if (HP.faceLandmarker){ try{ HP.faceLandmarker.close(); }catch(e){} HP.faceLandmarker = null; }
  const cur = document.getElementById('cursor'); if (cur) cur.classList.remove('active');
  const ring = document.getElementById('dwellRing'); if (ring) ring.classList.remove('active');
  const tg = document.querySelector('.hp-toggle'); if (tg) tg.classList.remove('on');
}

// ── Lerp
function _lerp(a, b, t){ return a + (b - a) * t; }

// ── Main tracking loop (cursor renders at 60fps, detection at ~10fps)
function _hpLoop(){
  if (!HP.on) return;
  HP.animFrame = requestAnimationFrame(_hpLoop);
  const now = performance.now();

  // ── Face detection (~10fps — heavy, runs less often)
  if (now - HP.lastDetect >= 66){ // ~15fps detection
    HP.lastDetect = now;
    const video = document.getElementById('hpVideo');
    if (video && HP.faceLandmarker){
      try {
        const result = HP.faceLandmarker.detectForVideo(video, now);
        if (result && result.faceLandmarks && result.faceLandmarks.length){
          const nose = result.faceLandmarks[0][1];
          const noseX = 1 - nose.x;
          const noseY = nose.y;
          if (!HP.calibrated){
            HP.neutralX = noseX;
            HP.neutralY = noseY;
            HP.calibrated = true;
          }
          const dx = (noseX - HP.neutralX) * HP.GAIN;
          const dy = (noseY - HP.neutralY) * HP.GAIN;
          HP.rawX = 0.5 + dx;
          HP.rawY = 0.5 + dy;
        }
      } catch(e){}
    }
  }

  // ── Cursor rendering (60fps — always smooth)
  const targetX = Math.max(0, Math.min(window.innerWidth, HP.rawX * window.innerWidth));
  const targetY = Math.max(0, Math.min(window.innerHeight, HP.rawY * window.innerHeight));
  HP.cx = _lerp(HP.cx, targetX, HP.LERP);
  HP.cy = _lerp(HP.cy, targetY, HP.LERP);

  // Position cursor + dwell ring
  const cursor = document.getElementById('cursor');
  const ring = document.getElementById('dwellRing');
  cursor.style.left = HP.cx + 'px';
  cursor.style.top = HP.cy + 'px';
  ring.style.left = HP.cx + 'px';
  ring.style.top = HP.cy + 'px';

  const W = window.innerWidth, H = window.innerHeight;
  // Se il cursore è su un controllo del puntatore (scroll btn o toggle),
  // by-passa rest/edge zones così il dwell-click funziona normalmente.
  const _elAt = document.elementFromPoint(HP.cx, HP.cy);
  const _onHpControl = _elAt && _elAt.closest('.hp-scroll-btn, .hp-toggle');
  const inRestZone = !_onHpControl && HP.cy < H * HP.REST_TOP;
  cursor.classList.toggle('resting', inRestZone);

  // ── Edge swipe detection
  const inLeftEdge = !_onHpControl && HP.cx < W * HP.EDGE_ZONE;
  const inRightEdge = !_onHpControl && HP.cx > W * (1 - HP.EDGE_ZONE);
  const arrowL = document.querySelector('.hp-swipe-arrow.left');
  const arrowR = document.querySelector('.hp-swipe-arrow.right');

  if (inLeftEdge && !inRestZone) {
    if (arrowL) arrowL.classList.add('show');
    if (HP.edgeDir !== 'left') { HP.edgeDir = 'left'; HP.edgeStart = now; }
    else if (now - HP.edgeStart >= HP.EDGE_MS) {
      _hpSwipe('left');
      HP.edgeDir = null; HP.edgeStart = 0;
      if (arrowL) arrowL.classList.remove('show');
    }
  } else if (inRightEdge && !inRestZone) {
    if (arrowR) arrowR.classList.add('show');
    if (HP.edgeDir !== 'right') { HP.edgeDir = 'right'; HP.edgeStart = now; }
    else if (now - HP.edgeStart >= HP.EDGE_MS) {
      _hpSwipe('right');
      HP.edgeDir = null; HP.edgeStart = 0;
      if (arrowR) arrowR.classList.remove('show');
    }
  } else {
    HP.edgeDir = null;
    if (arrowL) arrowL.classList.remove('show');
    if (arrowR) arrowR.classList.remove('show');
  }

  // ── Dwell click detection
  if (inRestZone || inLeftEdge || inRightEdge) {
    // In rest or edge zone → reset dwell
    HP.dwellTarget = null; HP.dwellStart = 0; HP.dwellDone = false;
    ring.style.setProperty('--dwell', '0');
    cursor.classList.remove('hovering');
    return;
  }

  const el = document.elementFromPoint(HP.cx, HP.cy);
  const clickable = el ? el.closest('[onclick], a, button, .nav-item, .ai-chip, .rehab-card, .cat-card, .agenda-card') : null;

  if (clickable) {
    cursor.classList.add('hovering');
    if (clickable === HP.dwellTarget) {
      if (HP.dwellDone) return;
      const elapsed = now - HP.dwellStart;
      const pct = Math.min(elapsed / HP.DWELL_MS, 1);
      ring.style.setProperty('--dwell', pct.toFixed(3));
      if (pct >= 1) {
        // DWELL CLICK
        HP.dwellDone = true;
        _hpPop();
        ring.style.setProperty('--dwell', '0');
        clickable.click();
        // Reset after click
        setTimeout(() => { HP.dwellTarget = null; HP.dwellDone = false; }, 400);
      }
    } else {
      HP.dwellTarget = clickable;
      HP.dwellStart = now;
      HP.dwellDone = false;
      ring.style.setProperty('--dwell', '0');
    }
  } else {
    cursor.classList.remove('hovering');
    HP.dwellTarget = null; HP.dwellStart = 0; HP.dwellDone = false;
    ring.style.setProperty('--dwell', '0');
  }
}

// ── Head swipe
function _hpSwipe(dir){
  _hpPop();
  const page = window.curPage;
  if (typeof window.goTo === 'function' && typeof page === 'number'){
    if (dir === 'right' && page < 3) window.goTo(page + 1);
    if (dir === 'left' && page > 0) window.goTo(page - 1);
  }
}

// ── Toggle on/off
async function hpToggle(){
  if (HP.on){
    _hpPowerDown();
    return;
  }
  const btn = document.querySelector('.hp-toggle');
  btn.textContent = '⏳';
  const mpOk = await _hpInitMP();
  const camOk = mpOk ? await _hpStartCam() : false;
  if (!camOk){
    btn.textContent = '👁️';
    if (typeof toast === 'function') toast('No se pudo activar el head pointer');
    return;
  }
  HP.on = true;
  HP.calibrated = false; // ricalibra: il naso dove sei adesso = centro schermo
  HP.cx = window.innerWidth / 2;
  HP.cy = window.innerHeight / 2;
  btn.classList.add('on');
  btn.textContent = '👁️';
  document.body.classList.add('hp-on');
  document.getElementById('cursor').classList.add('active');
  document.getElementById('dwellRing').classList.add('active');
  if (typeof _hpStartScrollWatch === 'function') _hpStartScrollWatch();
  _hpLoop();
}

// ═══ SCROLL BUTTONS (↑ ↓ ← →) ═══
// Trova lo scroller più rilevante nel viewport per l'asse richiesto
function _hpFindBestScroller(axis){
  const candidates = [];
  const all = document.querySelectorAll('*');
  for (const el of all){
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.right < 0 || r.bottom < 0 || r.left > window.innerWidth || r.top > window.innerHeight) continue;
    const cs = getComputedStyle(el);
    if (axis === 'y'){
      const ov = cs.overflowY;
      if ((ov === 'auto' || ov === 'scroll') && el.scrollHeight > el.clientHeight + 2) candidates.push(el);
    } else {
      const ov = cs.overflowX;
      if ((ov === 'auto' || ov === 'scroll') && el.scrollWidth > el.clientWidth + 2) candidates.push(el);
    }
  }
  const doc = document.scrollingElement || document.documentElement;
  if (axis === 'y' && doc.scrollHeight > doc.clientHeight + 2) candidates.push(doc);
  if (axis === 'x' && doc.scrollWidth > doc.clientWidth + 2) candidates.push(doc);
  if (!candidates.length) return null;
  // Se ce n'è uno solo, è lui. Altrimenti il più grande visibile.
  let best = null, bestArea = 0;
  for (const el of candidates){
    const r = (el === doc) ? { left:0, top:0, right:window.innerWidth, bottom:window.innerHeight, width:window.innerWidth, height:window.innerHeight } : el.getBoundingClientRect();
    const visW = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0));
    const visH = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
    const area = visW * visH;
    if (area > bestArea){ bestArea = area; best = el; }
  }
  return best;
}
function _hpCanScroll(sc, dir){
  if (!sc) return false;
  if (dir === 'up')    return sc.scrollTop > 2;
  if (dir === 'down')  return sc.scrollTop + sc.clientHeight < sc.scrollHeight - 2;
  if (dir === 'left')  return sc.scrollLeft > 2;
  if (dir === 'right') return sc.scrollLeft + sc.clientWidth < sc.scrollWidth - 2;
  return false;
}
function hpScroll(dir){
  const axis = (dir === 'up' || dir === 'down') ? 'y' : 'x';
  const sc = _hpFindBestScroller(axis);
  if (!sc) return;
  const step = Math.round((axis === 'y' ? sc.clientHeight : sc.clientWidth) * 0.7);
  const sign = (dir === 'up' || dir === 'left') ? -1 : 1;
  const opts = { behavior: 'smooth' };
  if (axis === 'y') opts.top = step * sign;
  else opts.left = step * sign;
  try { sc.scrollBy(opts); } catch(e){ /* fallback */ sc.scrollTop += (opts.top||0); sc.scrollLeft += (opts.left||0); }
}
function _hpUpdateScrollBtnsVisibility(){
  const vSc = _hpFindBestScroller('y');
  const hSc = _hpFindBestScroller('x');
  const map = {
    hpScrollUp:    _hpCanScroll(vSc, 'up'),
    hpScrollDown:  _hpCanScroll(vSc, 'down'),
    hpScrollLeft:  _hpCanScroll(hSc, 'left'),
    hpScrollRight: _hpCanScroll(hSc, 'right'),
  };
  for (const [id, v] of Object.entries(map)){
    const el = document.getElementById(id);
    if (el) el.classList.toggle('visible', v);
  }
}
// Update periodico (ogni 400ms) mentre il puntatore è attivo
HP._scrollUpdateTimer = null;
function _hpStartScrollWatch(){
  if (HP._scrollUpdateTimer) return;
  _hpUpdateScrollBtnsVisibility();
  HP._scrollUpdateTimer = setInterval(_hpUpdateScrollBtnsVisibility, 400);
}
function _hpStopScrollWatch(){
  if (HP._scrollUpdateTimer){ clearInterval(HP._scrollUpdateTimer); HP._scrollUpdateTimer = null; }
  // Nascondi tutti
  ['hpScrollUp','hpScrollDown','hpScrollLeft','hpScrollRight'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('visible');
  });
}

// ═══ DOM INJECTION (così funziona anche su pagine senza markup hardcoded) ═══
function _hpInjectDOM(){
  const make = (tag, attrs, parent) => {
    if (attrs.id && document.getElementById(attrs.id)) return document.getElementById(attrs.id);
    if (attrs.className && document.querySelector('.' + attrs.className.split(' ')[0])){
      // Già presente (es. home.html ha .hp-toggle hardcoded)
      if (tag === 'button' && attrs.className.includes('hp-toggle')) return document.querySelector('.hp-toggle');
    }
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v]) => {
      if (k === 'className') el.className = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v);
    });
    (parent || document.body).appendChild(el);
    return el;
  };
  // Core elements
  make('div', { id:'cursor' });
  make('div', { id:'dwellRing' });
  make('video', { id:'hpVideo', autoplay:'', playsinline:'', muted:'' });
  // Toggle button (se non già presente)
  if (!document.querySelector('.hp-toggle')){
    make('button', { className:'hp-toggle', onclick:'hpToggle()', title:'Head Pointer', text:'👁️' });
  }
  // Scroll buttons
  make('button', { id:'hpScrollUp',    className:'hp-scroll-btn', onclick:"hpScroll('up')",    'aria-label':'Scroll arriba',  text:'↑' });
  make('button', { id:'hpScrollDown',  className:'hp-scroll-btn', onclick:"hpScroll('down')",  'aria-label':'Scroll abajo',   text:'↓' });
  make('button', { id:'hpScrollLeft',  className:'hp-scroll-btn', onclick:"hpScroll('left')",  'aria-label':'Scroll izquierda', text:'←' });
  make('button', { id:'hpScrollRight', className:'hp-scroll-btn', onclick:"hpScroll('right')", 'aria-label':'Scroll derecha', text:'→' });
}

// Inietta subito al load dello script (idempotente)
if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', _hpInjectDOM);
} else {
  _hpInjectDOM();
}

// Espongo le funzioni a window (chiamate via onclick inline)
window.hpToggle = hpToggle;
window.hpScroll = hpScroll;

// ── Auto power-down on background / navigate away
document.addEventListener('visibilitychange', () => { if (document.hidden && HP.on) _hpPowerDown(); });
window.addEventListener('pagehide', () => { if (HP.on) _hpPowerDown(); });
