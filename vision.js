// ═══════════════════════════════════════════════════════════════
//  VISIÓN ASISTIDA · placeholder (step 2)
//  Apre solo la camera posteriore. Analisi vera → step 3.
// ═══════════════════════════════════════════════════════════════

const VIS = {
  stream: null,
  facing: 'environment', // rear camera by default
  lastText: '',          // ultimo risultato per "Escuchar de nuevo"
  analyzing: false,
};

async function startCamera() {
  const video = document.getElementById('visVideo');
  const notice = document.getElementById('visCamNotice');
  const flipBtn = document.getElementById('flipBtn');
  notice.textContent = '📷 Preparando cámara…';
  notice.classList.remove('hidden');

  // Stop stream precedente se c'era
  if (VIS.stream) {
    VIS.stream.getTracks().forEach(t => t.stop());
    VIS.stream = null;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: VIS.facing },
        width: { ideal: 1280 },
        height: { ideal: 960 },
      },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    VIS.stream = stream;
    video.classList.remove('hidden');
    notice.classList.add('hidden');
    // Mostra flip solo se il dispositivo ha più di una camera
    if (navigator.mediaDevices.enumerateDevices) {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const cams = devs.filter(d => d.kind === 'videoinput');
      if (cams.length > 1) flipBtn.classList.remove('hidden');
    }
  } catch (e) {
    console.error('Camera error:', e);
    notice.textContent = '🚫 No se pudo abrir la cámara. Verifica permisos.';
    notice.classList.remove('hidden');
    video.classList.add('hidden');
  }
}

function flipCamera() {
  VIS.facing = (VIS.facing === 'environment') ? 'user' : 'environment';
  startCamera();
}

// Stub — step 3 sostituirà con la vera chiamata Vision API
function analyzeFrame() {
  alert('Step 3: qui chiameremo Google Cloud Vision. Per ora la camera si apre e basta.');
}

function replayLast() {
  if (!VIS.lastText || !window.speakNeural) return;
  window.speakNeural(VIS.lastText);
}

function resetResult() {
  VIS.lastText = '';
  const result = document.getElementById('visResult');
  const replay = document.getElementById('replayBtn');
  result.classList.add('hidden');
  replay.disabled = true;
  const hint = document.getElementById('visHint');
  hint.textContent = 'Apunta a un texto o un objeto';
}

// Power down quando si lascia la pagina
function stopCamera() {
  if (VIS.stream) {
    VIS.stream.getTracks().forEach(t => t.stop());
    VIS.stream = null;
  }
  const video = document.getElementById('visVideo');
  if (video) { video.srcObject = null; }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });
window.addEventListener('pagehide', stopCamera);
window.addEventListener('beforeunload', stopCamera);

// Espongo funzioni a window (onclick inline)
window.flipCamera = flipCamera;
window.analyzeFrame = analyzeFrame;
window.replayLast = replayLast;
window.resetResult = resetResult;

// Avvia camera al load
window.addEventListener('load', startCamera);
