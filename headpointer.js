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
  LERP: 0.14,
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
  _hpStopCam();
  if (HP.faceLandmarker){ try{ HP.faceLandmarker.close(); }catch(e){} HP.faceLandmarker = null; }
  document.getElementById('cursor').classList.remove('active');
  document.getElementById('dwellRing').classList.remove('active');
  document.querySelector('.hp-toggle').classList.remove('on');
}

// ── Lerp
function _lerp(a, b, t){ return a + (b - a) * t; }

// ── Main tracking loop (cursor renders at 60fps, detection at ~10fps)
function _hpLoop(){
  if (!HP.on) return;
  HP.animFrame = requestAnimationFrame(_hpLoop);
  const now = performance.now();

  // ── Face detection (~10fps — heavy, runs less often)
  if (now - HP.lastDetect >= 100){
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
  const inRestZone = HP.cy < H * HP.REST_TOP;
  cursor.classList.toggle('resting', inRestZone);

  // ── Edge swipe detection
  const inLeftEdge = HP.cx < W * HP.EDGE_ZONE;
  const inRightEdge = HP.cx > W * (1 - HP.EDGE_ZONE);
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
  document.getElementById('cursor').classList.add('active');
  document.getElementById('dwellRing').classList.add('active');
  _hpLoop();
}

// ── Auto power-down on background / navigate away
document.addEventListener('visibilitychange', () => { if (document.hidden && HP.on) _hpPowerDown(); });
window.addEventListener('pagehide', () => { if (HP.on) _hpPowerDown(); });
