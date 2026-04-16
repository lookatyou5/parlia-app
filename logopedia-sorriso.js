// ═══════════════════════════════════════════════════════════════
//  LOGOPEDIA · SFIDA DEL SORRISO (motoria facciale)
//  MediaPipe FaceLandmarker blendshapes → rileva espressioni reali
// ═══════════════════════════════════════════════════════════════

const SORRISO_EXERCISES = [
  { id:'smile',    emoji:'😁', title:'Sonrisa grande',    instruction:'Sonríe lo más que puedas y mantén',  holdSec:3 },
  { id:'cheeks',   emoji:'🐡', title:'Infla las mejillas', instruction:'Infla las mejillas como un pez globo', holdSec:3 },
  { id:'open',     emoji:'😮', title:'Boca grande',       instruction:'Abre la boca bien grande',            holdSec:3 },
  { id:'kiss',     emoji:'😗', title:'Beso al aire',      instruction:'Haz como si dieras un beso — labios hacia fuera', holdSec:3 },
  { id:'wink-l',   emoji:'😉', title:'Guiño izquierdo',   instruction:'Cierra solo el ojo izquierdo',        holdSec:2 },
  { id:'wink-r',   emoji:'😜', title:'Guiño derecho',     instruction:'Cierra solo el ojo derecho',          holdSec:2 },
  { id:'lips-o',   emoji:'🫢', title:'Labios en O',       instruction:'Haz una O grande con los labios',     holdSec:3 },
  { id:'surprise', emoji:'😲', title:'Cara de sorpresa',  instruction:'Abre los ojos y la boca — ¡sorpresa!', holdSec:3 },
];

// Blendshape mapping: id → check function returning 0..1 score
function _bs(shapes, name){ const s = shapes.find(b => b.categoryName === name); return s ? s.score : 0; }
const SORRISO_CHECKS = {
  'smile':    s => (_bs(s,'mouthSmileLeft') + _bs(s,'mouthSmileRight')) / 2,
  'cheeks':   s => _bs(s,'cheekPuff'),
  'open':     s => _bs(s,'jawOpen'),
  'kiss':     s => _bs(s,'mouthPucker'),
  'wink-l':   s => (_bs(s,'eyeBlinkLeft') > 0.5 && _bs(s,'eyeBlinkRight') < 0.3) ? 1 : 0,
  'wink-r':   s => (_bs(s,'eyeBlinkRight') > 0.5 && _bs(s,'eyeBlinkLeft') < 0.3) ? 1 : 0,
  'lips-o':   s => (_bs(s,'mouthFunnel') + _bs(s,'mouthPucker')) / 2,
  'surprise': s => (_bs(s,'eyeWideLeft') + _bs(s,'eyeWideRight') + _bs(s,'jawOpen')) / 3,
};
const SORRISO_THRESHOLDS = {
  'smile':0.45, 'cheeks':0.3, 'open':0.5, 'kiss':0.4,
  'wink-l':0.5, 'wink-r':0.5, 'lips-o':0.3, 'surprise':0.3,
};

// ── State
const _sorriso = {
  exercises: [], idx: 0, results: [],
  stream: null, faceLandmarker: null, detecting: false,
  holdProgress: 0, // 0..1 how long expression held
  animFrame: null, lastDetectTime: 0,
  mpAvailable: false,
};

// ── MediaPipe init (lazy, one-time, self-loading)
const MP_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision';

async function _loadMP(){
  // Dynamically inject module script to import MediaPipe
  if (window._MP) return true;
  return new Promise(resolve => {
    const s = document.createElement('script');
    s.type = 'module';
    s.textContent = `
      try {
        const v = await import("${MP_CDN}/vision_bundle.mjs");
        window._MP = { FaceLandmarker: v.FaceLandmarker, FilesetResolver: v.FilesetResolver };
      } catch(e){ console.error('MP import fail:', e); }
      window._mpDone = true;
    `;
    document.head.appendChild(s);
    // Poll until done (module scripts are async)
    const iv = setInterval(() => {
      if (window._mpDone){ clearInterval(iv); resolve(!!window._MP); }
    }, 200);
    // Timeout 12s
    setTimeout(() => { clearInterval(iv); resolve(false); }, 12000);
  });
}

async function _initMediaPipe(){
  if (_sorriso.faceLandmarker) return true;
  const loaded = await _loadMP();
  if (!loaded || !window._MP){
    console.warn('MediaPipe not available');
    return false;
  }
  try {
    const { FaceLandmarker, FilesetResolver } = window._MP;
    const fs = await FilesetResolver.forVisionTasks(MP_CDN + '/wasm');
    _sorriso.faceLandmarker = await FaceLandmarker.createFromOptions(fs, {
      baseOptions: { modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate:'GPU' },
      runningMode:'VIDEO', outputFaceBlendshapes:true, numFaces:1,
    });
    _sorriso.mpAvailable = true;
    console.log('FaceLandmarker ready');
    return true;
  } catch(e){
    console.error('FaceLandmarker init failed:', e);
    // Retry with CPU delegate
    try {
      const { FaceLandmarker, FilesetResolver } = window._MP;
      const fs = await FilesetResolver.forVisionTasks(MP_CDN + '/wasm');
      _sorriso.faceLandmarker = await FaceLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate:'CPU' },
        runningMode:'VIDEO', outputFaceBlendshapes:true, numFaces:1,
      });
      _sorriso.mpAvailable = true;
      console.log('FaceLandmarker ready (CPU fallback)');
      return true;
    } catch(e2){ console.error('FaceLandmarker CPU fallback also failed:', e2); return false; }
  }
}

// ── Camera
async function sorrisoStartCamera(){
  const video = document.getElementById('sorrisoVideo');
  const notice = document.getElementById('sorrisoCamNotice');
  if (!video) return;
  notice.textContent = '📷 Preparando cámara y detección facial…';
  notice.classList.remove('hidden');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'user', width:{ideal:320}, height:{ideal:240} }, audio:false });
    video.srcObject = stream;
    await video.play();
    _sorriso.stream = stream;
    video.classList.remove('hidden');
    // Init MediaPipe in parallel
    const ok = await _initMediaPipe();
    notice.textContent = ok ? '' : '⚠️ Detección facial no disponible — confirma manualmente';
    if (ok) notice.classList.add('hidden');
  } catch(e){
    video.classList.add('hidden');
    notice.textContent = '🪞 No se pudo abrir la cámara. Confirma manualmente cada ejercicio.';
    notice.classList.remove('hidden');
  }
}

function sorrisoStopCamera(){
  _sorriso.detecting = false;
  if (_sorriso.animFrame){ cancelAnimationFrame(_sorriso.animFrame); _sorriso.animFrame = null; }
  if (_sorriso.stream){ _sorriso.stream.getTracks().forEach(t => t.stop()); _sorriso.stream = null; }
  const video = document.getElementById('sorrisoVideo');
  if (video){ video.srcObject = null; video.classList.add('hidden'); }
}

// ── Detection loop
function _startDetection(){
  const ex = _sorriso.exercises[_sorriso.idx];
  if (!ex) return;
  _sorriso.detecting = true;
  _sorriso.holdProgress = 0;
  _sorriso.lastDetectTime = performance.now();
  _detectFrame();
}

function _detectFrame(){
  if (!_sorriso.detecting) return;
  _sorriso.animFrame = requestAnimationFrame(_detectFrame);
  const now = performance.now();
  if (now - _sorriso.lastDetectTime < 150) return; // ~7fps
  _sorriso.lastDetectTime = now;

  const video = document.getElementById('sorrisoVideo');
  const ex = _sorriso.exercises[_sorriso.idx];
  if (!video || !ex || !_sorriso.faceLandmarker) return;

  try {
    const result = _sorriso.faceLandmarker.detectForVideo(video, now);
    if (!result || !result.faceBlendshapes || !result.faceBlendshapes.length){
      _updateDetectUI(0, 'No detecto tu cara — acércate');
      return;
    }
    const shapes = result.faceBlendshapes[0].categories;
    const checkFn = SORRISO_CHECKS[ex.id];
    const threshold = SORRISO_THRESHOLDS[ex.id] || 0.4;
    const score = checkFn ? checkFn(shapes) : 0;

    if (score >= threshold){
      // Expression detected — accumulate hold progress
      _sorriso.holdProgress += 0.15 / ex.holdSec; // ~150ms tick / holdSec
      _sorriso.holdProgress = Math.min(_sorriso.holdProgress, 1);
      _updateDetectUI(_sorriso.holdProgress, _sorriso.holdProgress >= 1 ? '' : '¡Detectado! Mantén…');
      if (_sorriso.holdProgress >= 1){
        _sorriso.detecting = false;
        _exerciseSuccess();
      }
    } else {
      // Expression lost — decay hold
      _sorriso.holdProgress = Math.max(0, _sorriso.holdProgress - 0.08);
      _updateDetectUI(_sorriso.holdProgress, 'Hazlo más marcado…');
    }
  } catch(e){}
}

function _updateDetectUI(pct, label){
  const bar = document.getElementById('sorrisoDetectBar');
  const lbl = document.getElementById('sorrisoDetectLabel');
  if (bar){
    bar.style.width = (pct * 100) + '%';
    bar.classList.toggle('full', pct >= 1);
  }
  if (lbl && label !== undefined){
    lbl.textContent = label;
    lbl.className = 'sorriso-detect-label' + (pct >= 1 ? ' done' : pct > 0 ? ' detecting' : '');
  }
}

function _exerciseSuccess(){
  _sorriso.results.push('done');
  _updateDetectUI(1, '¡Perfecto!');
  document.getElementById('sorrisoGoBtn').classList.add('hidden');
  document.getElementById('sorrisoConfirm').classList.add('hidden');
  document.getElementById('sorrisoNextBtn').classList.remove('hidden');
  document.getElementById('sorrisoNextBtn').disabled = false;
  document.getElementById('sorrisoTimer').textContent = '✓';
  sayAgent(['¡Genial!','¡Bien hecho!','Perfecto, así.','¡Buen trabajo!'][Math.floor(Math.random()*4)]);
}

// ── Init session
function sorrisoStart(){
  _sorriso.exercises = shuffle(SORRISO_EXERCISES.slice()).slice(0,5);
  _sorriso.idx = 0;
  _sorriso.results = [];
  showScreen('Sorriso');
  sorrisoStartCamera();
  sorrisoRender();
}

function sorrisoRender(){
  const ex = _sorriso.exercises[_sorriso.idx];
  if (!ex) return sorrisoComplete();
  _sorriso.detecting = false;
  _sorriso.holdProgress = 0;
  if (_sorriso.animFrame){ cancelAnimationFrame(_sorriso.animFrame); _sorriso.animFrame = null; }
  // Progress dots
  const prog = document.getElementById('sorrisoProgress');
  prog.innerHTML = '';
  _sorriso.exercises.forEach((_,i) => {
    const d = document.createElement('div');
    d.className = 'ex-progress-dot' + (i < _sorriso.idx ? ' done' : i === _sorriso.idx ? ' active' : '');
    prog.appendChild(d);
  });
  document.getElementById('sorrisoEmoji').textContent = ex.emoji;
  document.getElementById('sorrisoTitle').textContent = ex.title;
  document.getElementById('sorrisoInstruction').textContent = ex.instruction;
  document.getElementById('sorrisoTimer').textContent = 'Mantén ' + ex.holdSec + 's';
  _updateDetectUI(0, 'Preparado');
  document.getElementById('sorrisoGoBtn').classList.remove('hidden');
  document.getElementById('sorrisoGoBtn').disabled = false;
  document.getElementById('sorrisoConfirm').classList.add('hidden');
  document.getElementById('sorrisoNextBtn').classList.add('hidden');
  sayAgent(ex.instruction);
}

function sorrisoGo(){
  const ex = _sorriso.exercises[_sorriso.idx];
  if (!ex) return;
  document.getElementById('sorrisoGoBtn').disabled = true;

  if (_sorriso.mpAvailable){
    // Real detection
    document.getElementById('sorrisoTimer').textContent = '';
    _updateDetectUI(0, 'Hazlo ahora…');
    _startDetection();
    // Timeout: 15s max per esercizio
    setTimeout(() => {
      if (_sorriso.detecting && _sorriso.holdProgress < 1){
        _sorriso.detecting = false;
        _updateDetectUI(_sorriso.holdProgress, 'No se ha mantenido suficiente');
        document.getElementById('sorrisoGoBtn').classList.add('hidden');
        document.getElementById('sorrisoConfirm').classList.remove('hidden');
      }
    }, 15000);
  } else {
    // Fallback: timer-based self-confirm (no MediaPipe)
    let countdown = ex.holdSec;
    document.getElementById('sorrisoTimer').textContent = countdown;
    const iv = setInterval(() => {
      countdown--;
      _updateDetectUI((ex.holdSec - countdown) / ex.holdSec, 'Mantén…');
      if (countdown > 0){
        document.getElementById('sorrisoTimer').textContent = countdown;
      } else {
        clearInterval(iv);
        document.getElementById('sorrisoTimer').textContent = '¡Tiempo!';
        document.getElementById('sorrisoGoBtn').classList.add('hidden');
        document.getElementById('sorrisoConfirm').classList.remove('hidden');
        sayAgent('¿Lo has conseguido?');
      }
    }, 1000);
  }
}

function sorrisoConfirmYes(){
  _sorriso.results.push('done');
  document.getElementById('sorrisoConfirm').classList.add('hidden');
  document.getElementById('sorrisoNextBtn').classList.remove('hidden');
  document.getElementById('sorrisoNextBtn').disabled = false;
  _updateDetectUI(1, '¡Bien!');
  sayAgent(['¡Genial!','¡Bien hecho!'][Math.floor(Math.random()*2)]);
}

function sorrisoConfirmRetry(){
  document.getElementById('sorrisoConfirm').classList.add('hidden');
  document.getElementById('sorrisoGoBtn').classList.remove('hidden');
  document.getElementById('sorrisoGoBtn').disabled = false;
  _updateDetectUI(0, 'Preparado');
  const ex = _sorriso.exercises[_sorriso.idx];
  document.getElementById('sorrisoTimer').textContent = _sorriso.mpAvailable ? '' : (ex ? ex.holdSec + 's' : '');
  sayAgent('Venga, otra vez. ¡Tú puedes!');
}

function sorrisoSkip(){
  _sorriso.detecting = false;
  if (_sorriso.animFrame){ cancelAnimationFrame(_sorriso.animFrame); _sorriso.animFrame = null; }
  _sorriso.results.push('skip');
  _sorriso.idx++;
  if (_sorriso.idx >= _sorriso.exercises.length) return sorrisoComplete();
  sorrisoRender();
}

function sorrisoNext(){
  _sorriso.detecting = false;
  if (_sorriso.animFrame){ cancelAnimationFrame(_sorriso.animFrame); _sorriso.animFrame = null; }
  _sorriso.idx++;
  if (_sorriso.idx >= _sorriso.exercises.length) return sorrisoComplete();
  sorrisoRender();
  sayAgent('Vamos con la siguiente.');
}

function sorrisoComplete(){
  sorrisoStopCamera();
  const done = _sorriso.results.filter(r => r === 'done').length;
  const total = _sorriso.results.length;
  _sessionsDone++;
  document.getElementById('statDone').textContent = total;
  document.getElementById('statGreen').textContent = done;
  document.getElementById('statScore').textContent = Math.round((done/Math.max(total,1))*100) + '%';
  document.getElementById('completeTitle').textContent = done >= total-1 ? '¡Genial! 😊' : '¡Buen esfuerzo! 💪';
  document.getElementById('completeMsg').textContent = `${done} de ${total} ejercicios completados.`;
  setAgentStatus('Sesión terminada');
  sayAgent(`${done} ejercicios faciales completados. ¡Bien hecho!`);
  try{
    const log = JSON.parse(localStorage.getItem('parlia_logo_log')||'[]');
    log.push({ date:new Date().toISOString(), category:'sorriso', done:total, green:done, yellow:0, score:Math.round((done/Math.max(total,1))*100) });
    if (log.length > 100) log.splice(0, log.length-100);
    localStorage.setItem('parlia_logo_log', JSON.stringify(log));
  } catch(e){}
  showScreen('Complete');
}

function sorrisoExit(){
  _sorriso.detecting = false;
  if (_sorriso.animFrame){ cancelAnimationFrame(_sorriso.animFrame); _sorriso.animFrame = null; }
  sorrisoStopCamera();
  document.getElementById('screenSorriso').classList.add('hidden');
  backToCategories();
}
