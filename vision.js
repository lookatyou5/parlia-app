// ═══════════════════════════════════════════════════════════════
//  VISIÓN ASISTIDA · logica completa
//  1. Cattura frame camera → POST al Worker parlia-vision
//  2. Se c'è TESTO → speakNeural (Neural2-H) + mostra testo
//  3. Se NON c'è testo → Claude Haiku genera "Veo..." → TTS
// ═══════════════════════════════════════════════════════════════

const VISION_URL = 'https://parlia-vision.luca-peltrini.workers.dev';
const AI_PROXY   = 'https://voci-ai-proxy.luca-peltrini.workers.dev/v1/messages';

const VIS = {
  stream: null,
  facing: 'environment',
  lastText: '',
  analyzing: false,
};

// ── Camera ──
async function startCamera() {
  const video = document.getElementById('visVideo');
  const notice = document.getElementById('visCamNotice');
  const flipBtn = document.getElementById('flipBtn');
  notice.textContent = '📷 Preparando cámara…';
  notice.classList.remove('hidden');

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

// ── Cattura frame corrente → data URL JPEG ──
function _captureFrame() {
  const video = document.getElementById('visVideo');
  if (!video || !video.videoWidth) return null;
  const canvas = document.createElement('canvas');
  // Downscale al max 1024 sul lato più lungo (upload veloce, risoluzione ok per Vision)
  const MAX_DIM = 1024;
  let w = video.videoWidth, h = video.videoHeight;
  if (w >= h && w > MAX_DIM) { h = Math.round(h * MAX_DIM / w); w = MAX_DIM; }
  else if (h > w && h > MAX_DIM) { w = Math.round(w * MAX_DIM / h); h = MAX_DIM; }
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(video, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.82);
}

// ── UI helpers ──
function _setAnalyzing(on) {
  VIS.analyzing = on;
  document.getElementById('analyzeBtn').disabled = on;
  document.getElementById('visScanner').classList.toggle('active', on);
  document.getElementById('visAnalyzing').classList.toggle('hidden', !on);
  const flipBtn = document.getElementById('flipBtn');
  if (flipBtn) flipBtn.disabled = on;
}
function _showResult(label, text) {
  document.getElementById('visResultLabel').textContent = label;
  document.getElementById('visResultText').textContent = text;
  document.getElementById('visResult').classList.remove('hidden');
  document.getElementById('replayBtn').disabled = !text;
  document.getElementById('visHint').textContent = 'Toca "↻ Nuevo" para capturar otra';
}
function _showError(msg) {
  _showResult('Error', msg);
  VIS.lastText = '';
  document.getElementById('replayBtn').disabled = true;
}

// ── Descrizione AI quando non c'è testo ──
async function _describeWithAI(items, hintText = '') {
  const list = items.slice(0, 6).join(', ');
  const hint = hintText ? ` Texto parcial visible (puede ser marca/etiqueta): "${hintText.slice(0, 60)}".` : '';
  try {
    const res = await fetch(AI_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        system: 'Eres un asistente visual para una persona en rehabilitación. Describe en español lo que hay en la imagen en UNA frase corta y natural, máximo 10 palabras, empezando siempre con "Veo". Prioriza el objeto más relevante. Si hay una marca o etiqueta visible, puedes mencionarla brevemente. Evita signos de exclamación.',
        messages: [{
          role: 'user',
          content: `Objetos/etiquetas detectados (en inglés, de más a menos probable): ${list}.${hint} Genera la frase en español.`,
        }],
      }),
    });
    if (!res.ok) throw new Error('AI HTTP ' + res.status);
    const d = await res.json();
    const txt = (d.content?.[0]?.text || '').trim();
    if (txt) return txt;
  } catch (e) {
    console.error('AI describe error:', e);
  }
  return `Veo ${items[0] || 'algo'}.`;
}

// ── Main: capture → Vision API → TTS/AI ──
async function analyzeFrame() {
  if (VIS.analyzing) return;
  const dataUrl = _captureFrame();
  if (!dataUrl) {
    _showError('Cámara no lista. Espera un momento y vuelve a intentar.');
    return;
  }

  _setAnalyzing(true);
  // Stop TTS precedente se stava parlando
  try { window.stopNeural && stopNeural(); } catch (e) {}

  try {
    const resp = await fetch(VISION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
    });
    if (!resp.ok) {
      const errJson = await resp.json().catch(() => ({}));
      throw new Error(errJson.error || ('HTTP ' + resp.status));
    }
    const data = await resp.json();
    await _handleResult(data);
  } catch (e) {
    console.error('Analyze error:', e);
    _showError('No pude analizar: ' + (e.message || 'error de red'));
  } finally {
    _setAnalyzing(false);
  }
}

async function _handleResult(data) {
  const rawText = (data.text || '').trim();
  const objects = Array.isArray(data.objects) ? data.objects.map(o => o.name) : [];
  const labels  = Array.isArray(data.labels)  ? data.labels.map(l => l.desc) : [];

  // Heuristica "testo vero": ≥3 parole separate da spazi/newline, ≥15 char totali.
  // Evita di leggere brand name isolati tipo "COCA-COLA" o "500ml" stampati su
  // una bottiglia — quelli vengono trattati come oggetto, descritti dall'AI.
  const wordCount = rawText.split(/\s+/).filter(w => w.length >= 2).length;
  const isMeaningfulText = rawText.length >= 15 && wordCount >= 3;

  if (isMeaningfulText) {
    _showResult('Texto detectado', rawText);
    VIS.lastText = rawText;
    if (window.speakNeural) window.speakNeural(rawText, { voice: 'es-ES-Neural2-H' });
    return;
  }

  // Niente testo significativo → descrivi con AI (passa anche il testo breve,
  // può aiutare Claude a identificare il brand / prodotto)
  const candidates = [...objects, ...labels];
  if (candidates.length === 0 && !rawText) {
    const fallback = 'No he podido identificar nada claro. Prueba con mejor luz o acércate.';
    _showResult('Sin detección', fallback);
    VIS.lastText = fallback;
    if (window.speakNeural) window.speakNeural(fallback, { voice: 'es-ES-Neural2-H' });
    return;
  }
  const description = await _describeWithAI(candidates, rawText);
  _showResult('Veo', description);
  VIS.lastText = description;
  if (window.speakNeural) window.speakNeural(description, { voice: 'es-ES-Neural2-H' });
}

// ── Bottoni secondari ──
function replayLast() {
  if (!VIS.lastText || !window.speakNeural) return;
  window.speakNeural(VIS.lastText, { voice: 'es-ES-Neural2-H' });
}
function resetResult() {
  try { window.stopNeural && stopNeural(); } catch (e) {}
  VIS.lastText = '';
  document.getElementById('visResult').classList.add('hidden');
  document.getElementById('replayBtn').disabled = true;
  document.getElementById('visHint').textContent = 'Apunta a un texto o un objeto';
}

// ── Power down ──
function stopCamera() {
  if (VIS.stream) {
    VIS.stream.getTracks().forEach(t => t.stop());
    VIS.stream = null;
  }
  const video = document.getElementById('visVideo');
  if (video) video.srcObject = null;
  try { window.stopNeural && stopNeural(); } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });
window.addEventListener('pagehide', stopCamera);
window.addEventListener('beforeunload', stopCamera);

// Espongo funzioni a window (onclick inline)
window.flipCamera = flipCamera;
window.analyzeFrame = analyzeFrame;
window.replayLast = replayLast;
window.resetResult = resetResult;

window.addEventListener('load', startCamera);
