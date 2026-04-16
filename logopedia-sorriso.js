// ═══════════════════════════════════════════════════════════════
//  LOGOPEDIA · SFIDA DEL SORRISO (motoria facciale)
//  MediaPipe FaceLandmarker blendshapes → rileva espressioni reali
// ═══════════════════════════════════════════════════════════════

// difficulty 1=fácil  2=medio  3=difícil
// holdSec viene sovrascritto in base al livello del profilo utente
const SORRISO_EXERCISES = [
  // ─ Difficulty 1 (básico — movimientos simples)
  { id:'smile',   emoji:'😁', title:'Sonrisa grande',     instruction:'Sonríe lo más que puedas',            diff:1 },
  { id:'open',    emoji:'😮', title:'Boca grande',        instruction:'Abre la boca bien grande',            diff:1 },
  { id:'kiss',    emoji:'😗', title:'Beso al aire',       instruction:'Labios hacia fuera, como un beso',    diff:1 },
  { id:'lips-o',  emoji:'🫢', title:'Labios en O',        instruction:'Haz una O grande con los labios',     diff:1 },
  // ─ Difficulty 2 (intermedio)
  { id:'cheeks',  emoji:'🐡', title:'Infla las mejillas',  instruction:'Infla las mejillas como un pez globo', diff:2 },
  { id:'surprise',emoji:'😲', title:'Cara de sorpresa',   instruction:'Abre los ojos y la boca — ¡sorpresa!', diff:2 },
  { id:'teeth',   emoji:'😬', title:'Enseña los dientes', instruction:'Junta los dientes y enseña una sonrisa grande', diff:2 },
  { id:'brows',   emoji:'🤨', title:'Sube las cejas',     instruction:'Levanta las cejas lo más que puedas',  diff:2 },
  // ─ Difficulty 3 (avanzado — movimientos asimétricos)
  { id:'wink-l',  emoji:'😉', title:'Guiño izquierdo',    instruction:'Cierra solo el ojo izquierdo',         diff:3 },
  { id:'wink-r',  emoji:'😜', title:'Guiño derecho',      instruction:'Cierra solo el ojo derecho',           diff:3 },
  { id:'nose',    emoji:'🐰', title:'Arruga la nariz',    instruction:'Arruga la nariz como un conejo',       diff:3 },
  { id:'tongue',  emoji:'😛', title:'Saca la lengua',     instruction:'Saca la lengua todo lo que puedas',    diff:3 },
];

// Hold seconds per logo profile level
function _holdForLevel(){
  const lvl = (window.state && state.logo && state.logo.level) || 3;
  if (lvl <= 2) return 1;
  if (lvl === 3) return 2;
  return 3;
}

// Landmark-based expression detection (no blendshapes needed)
// Uses 478 face mesh points — measures distances between key landmarks.
function _dist(a,b){ return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2); }

const SORRISO_CHECKS = {
  'smile': lm => {
    // Mouth width vs face width — wider = smiling
    const mW = _dist(lm[61],lm[291]), fW = _dist(lm[234],lm[454]);
    return fW > 0 ? mW / fW : 0;
  },
  'cheeks': lm => {
    // Face width increase (puffed) — compare current width to mouth-nose ratio
    const fW = _dist(lm[234],lm[454]), noseW = _dist(lm[129],lm[358]);
    return noseW > 0 ? fW / noseW : 0;
  },
  'open': lm => {
    // Mouth vertical opening vs face height
    const mH = _dist(lm[13],lm[14]), fH = _dist(lm[10],lm[152]);
    return fH > 0 ? mH / fH : 0;
  },
  'kiss': lm => {
    // Bacio = bocca stretta (commissure vicine) + labbra serrate (sup/inf unite)
    const mW = _dist(lm[61],lm[291]);
    const fW = _dist(lm[234],lm[454]);
    const mH = _dist(lm[13],lm[14]);
    const fH = _dist(lm[10],lm[152]);
    if (fW === 0 || fH === 0) return 0;
    const narrow = Math.max(0, 1 - (mW / fW) * 1.2);
    const closed = Math.max(0, 1 - (mH / fH) * 25);
    return narrow * 0.6 + closed * 0.4;
  },
  'wink-l': lm => {
    // Left eye closed, right open — gradient score
    const lH = _dist(lm[159],lm[145]), lW = _dist(lm[33],lm[133]);
    const rH = _dist(lm[386],lm[374]), rW = _dist(lm[362],lm[263]);
    const lEAR = lW > 0 ? lH/lW : 0.3;
    const rEAR = rW > 0 ? rH/rW : 0.3;
    // How closed is left eye (0=open, 1=shut) + how open is right
    const closed = Math.max(0, 1 - lEAR / 0.28);
    const open = Math.min(1, rEAR / 0.2);
    return closed * open;
  },
  'wink-r': lm => {
    const lH = _dist(lm[159],lm[145]), lW = _dist(lm[33],lm[133]);
    const rH = _dist(lm[386],lm[374]), rW = _dist(lm[362],lm[263]);
    const lEAR = lW > 0 ? lH/lW : 0.3;
    const rEAR = rW > 0 ? rH/rW : 0.3;
    const closed = Math.max(0, 1 - rEAR / 0.28);
    const open = Math.min(1, lEAR / 0.2);
    return closed * open;
  },
  'lips-o': lm => {
    // Mouth height / width ratio approaching 1.0 = O shape
    const mW = _dist(lm[61],lm[291]), mH = _dist(lm[13],lm[14]);
    return mW > 0 ? mH / mW : 0;
  },
  'surprise': lm => {
    // Eyes wide + mouth open
    const mH = _dist(lm[13],lm[14]), fH = _dist(lm[10],lm[152]);
    const eyeH = (_dist(lm[159],lm[145]) + _dist(lm[386],lm[374])) / 2;
    const eyeW = (_dist(lm[33],lm[133]) + _dist(lm[362],lm[263])) / 2;
    const mOpen = fH > 0 ? mH / fH : 0;
    const eyeRatio = eyeW > 0 ? eyeH / eyeW : 0;
    return (mOpen * 5 + eyeRatio) / 2;
  },
  'teeth': lm => {
    // Mouth wide open + lips apart but teeth visible (smile with open mouth)
    const mW = _dist(lm[61],lm[291]), fW = _dist(lm[234],lm[454]);
    const mH = _dist(lm[13],lm[14]), fH = _dist(lm[10],lm[152]);
    return fW > 0 ? (mW/fW * 0.7 + mH/fH * 8) / 2 : 0;
  },
  'brows': lm => {
    // Eyebrow raise — distance from eye to brow increases
    const browL = _dist(lm[105],lm[159]); // left brow to left eye top
    const browR = _dist(lm[334],lm[386]);
    const fH = _dist(lm[10],lm[152]);
    return fH > 0 ? (browL + browR) / fH : 0;
  },
  'nose': lm => {
    // Nose scrunch — upper lip rises, nose narrows
    const noseH = _dist(lm[4],lm[6]); // nose tip to nose bridge gets shorter
    const lipToNose = _dist(lm[13],lm[4]); // upper lip to nose tip
    const fH = _dist(lm[10],lm[152]);
    return fH > 0 ? 1 - (lipToNose / fH * 8) : 0;
  },
  'tongue': lm => {
    // Tongue out — jaw opens wide, lower face extends
    const mH = _dist(lm[13],lm[14]), fH = _dist(lm[10],lm[152]);
    const chinDist = _dist(lm[17],lm[152]); // lower lip area to chin
    return fH > 0 ? (mH/fH * 6 + chinDist/fH) / 2 : 0;
  },
};
const SORRISO_THRESHOLDS = {
  'smile':0.42, 'cheeks':3.2, 'open':0.07, 'kiss':0.6,
  'wink-l':0.35, 'wink-r':0.35, 'lips-o':0.55, 'surprise':0.35,
  'teeth':0.4, 'brows':0.18, 'nose':0.4, 'tongue':0.35,
};

// ── State
const _sorriso = {
  exercises: [], idx: 0, results: [],
  stream: null, faceLandmarker: null, detecting: false,
  holdProgress: 0,
  animFrame: null, lastDetectTime: 0,
  mpAvailable: false,
  currentDiff: 1,  // difficoltà corrente nella sessione
  roundPassed: 0,  // quanti superati nel round corrente
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
      runningMode:'VIDEO', outputFaceBlendshapes:false, numFaces:1,
    });
    _sorriso.mpAvailable = true;
    console.log('FaceLandmarker ready (landmarks mode)');
    return true;
  } catch(e){
    console.error('FaceLandmarker GPU init failed:', e);
    try {
      const { FaceLandmarker, FilesetResolver } = window._MP;
      const fs = await FilesetResolver.forVisionTasks(MP_CDN + '/wasm');
      _sorriso.faceLandmarker = await FaceLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate:'CPU' },
        runningMode:'VIDEO', outputFaceBlendshapes:false, numFaces:1,
      });
      _sorriso.mpAvailable = true;
      console.log('FaceLandmarker ready (CPU fallback, landmarks mode)');
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

// Full power-down: stop camera + close FaceLandmarker (frees GPU/WASM memory)
function sorrisoPowerDown(){
  sorrisoStopCamera();
  if (_sorriso.faceLandmarker){
    try { _sorriso.faceLandmarker.close(); } catch(e){}
    _sorriso.faceLandmarker = null;
    _sorriso.mpAvailable = false;
  }
}

// Auto power-down when app goes to background or user navigates away
document.addEventListener('visibilitychange', () => {
  if (document.hidden){
    sorrisoPowerDown();
  }
});
// Also power-down on page unload (back button, navigate away)
window.addEventListener('pagehide', sorrisoPowerDown);
window.addEventListener('beforeunload', sorrisoPowerDown);

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
    if (!result || !result.faceLandmarks || !result.faceLandmarks.length){
      _updateDetectUI(0, 'No detecto tu cara — acércate');
      return;
    }
    const lm = result.faceLandmarks[0];
    const checkFn = SORRISO_CHECKS[ex.id];
    const threshold = SORRISO_THRESHOLDS[ex.id] || 0.4;
    const score = checkFn ? checkFn(lm) : 0;

    if (score >= threshold){
      // Expression detected — accumulate hold (faster fill, ~0.2/sec per holdSec)
      _sorriso.holdProgress += 0.18 / _holdForLevel();
      _sorriso.holdProgress = Math.min(_sorriso.holdProgress, 1);
      _updateDetectUI(_sorriso.holdProgress, _sorriso.holdProgress >= 1 ? '' : '¡Detectado! Mantén…');
      if (_sorriso.holdProgress >= 1){
        _sorriso.detecting = false;
        _exerciseSuccess();
      }
    } else {
      // Expression lost — slow decay (forgiving, doesn't reset fast)
      _sorriso.holdProgress = Math.max(0, _sorriso.holdProgress - 0.03);
      _updateDetectUI(_sorriso.holdProgress, score > threshold * 0.6 ? 'Casi… un poco más' : 'Hazlo más marcado…');
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
function _pickSorrisoExercises(diff){
  const pool = SORRISO_EXERCISES.filter(e => e.diff === diff);
  return shuffle(pool.slice()).slice(0, 3);
}

function sorrisoStart(){
  _sorriso.currentDiff = 1;
  _sorriso.roundPassed = 0;
  _sorriso.exercises = _pickSorrisoExercises(1);
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
  document.getElementById('sorrisoTimer').textContent = 'Mantén ' + _holdForLevel() + 's';
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
    let countdown = _holdForLevel();
    document.getElementById('sorrisoTimer').textContent = countdown;
    const iv = setInterval(() => {
      countdown--;
      _updateDetectUI((_holdForLevel() - countdown) / _holdForLevel(), 'Mantén…');
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
  document.getElementById('sorrisoTimer').textContent = _sorriso.mpAvailable ? '' : (ex ? _holdForLevel() + 's' : '');
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
  if (_sorriso.idx >= _sorriso.exercises.length){
    // Fine del round — conta quanti superati
    const roundResults = _sorriso.results.slice(-_sorriso.exercises.length);
    const passed = roundResults.filter(r => r === 'done').length;
    // Se ≥2/3 superati e c'è un livello successivo → proponi di salire
    if (passed >= 2 && _sorriso.currentDiff < 3){
      _sorriso.currentDiff++;
      const nextPool = SORRISO_EXERCISES.filter(e => e.diff === _sorriso.currentDiff);
      if (nextPool.length > 0){
        sayAgent('¡Muy bien! Vamos a subir de nivel. Ejercicios un poco más difíciles.');
        _sorriso.exercises = shuffle(nextPool.slice()).slice(0, 3);
        _sorriso.idx = 0;
        setTimeout(() => sorrisoRender(), 800);
        return;
      }
    }
    return sorrisoComplete();
  }
  sorrisoRender();
  sayAgent('Vamos con la siguiente.');
}

function sorrisoComplete(){
  sorrisoPowerDown();
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
  sorrisoPowerDown();
  document.getElementById('screenSorriso').classList.add('hidden');
  backToCategories();
}
