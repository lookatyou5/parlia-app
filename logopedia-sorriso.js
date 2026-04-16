// ═══════════════════════════════════════════════════════════════
//  LOGOPEDIA · SFIDA DEL SORRISO (motoria facciale)
//  Camera come specchio + esercizi guidati per la muscolatura
// ═══════════════════════════════════════════════════════════════

const SORRISO_EXERCISES = [
  { id:'smile',    emoji:'😁', title:'Sonrisa grande',    instruction:'Sonríe lo más que puedas y mantén 5 segundos',  duration:5 },
  { id:'cheeks',   emoji:'🐡', title:'Infla las mejillas', instruction:'Infla las mejillas como un pez globo — mantén 4 segundos', duration:4 },
  { id:'tongue',   emoji:'😛', title:'Saca la lengua',    instruction:'Saca la lengua todo lo que puedas, 4 segundos', duration:4 },
  { id:'open',     emoji:'😮', title:'Boca grande',       instruction:'Abre la boca bien grande y mantén 3 segundos', duration:3 },
  { id:'kiss',     emoji:'😗', title:'Beso al aire',      instruction:'Haz como si dieras un beso grande — labios hacia fuera', duration:4 },
  { id:'wink-l',   emoji:'😉', title:'Guiño izquierdo',   instruction:'Cierra solo el ojo izquierdo y mantén 3 segundos', duration:3 },
  { id:'wink-r',   emoji:'😜', title:'Guiño derecho',     instruction:'Cierra solo el ojo derecho y mantén 3 segundos', duration:3 },
  { id:'jaw',      emoji:'😬', title:'Mandíbula lateral', instruction:'Mueve la mandíbula a la izquierda, luego a la derecha', duration:5 },
  { id:'lips-o',   emoji:'🫢', title:'Labios en O',       instruction:'Haz una O grande con los labios — mantén 4 segundos', duration:4 },
  { id:'surprise', emoji:'😲', title:'Cara de sorpresa',  instruction:'Abre los ojos y la boca como si te sorprendieras', duration:4 },
];

// ── State
const _sorriso = {
  exercises: [],
  idx: 0,
  stream: null,
  timer: null,
  countdown: 0,
  results: [], // 'done' | 'skip'
};

// ── Camera
async function sorrisoStartCamera(){
  const video = document.getElementById('sorrisoVideo');
  const notice = document.getElementById('sorrisoCamNotice');
  if (!video) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'user', width:{ideal:320}, height:{ideal:240} }, audio:false });
    video.srcObject = stream;
    video.play();
    _sorriso.stream = stream;
    video.classList.remove('hidden');
    if (notice) notice.classList.add('hidden');
  } catch(e){
    // Camera non disponibile → mostra messaggio "usa uno specchio"
    video.classList.add('hidden');
    if (notice) { notice.classList.remove('hidden'); notice.textContent = '🪞 No se pudo abrir la cámara. Usa un espejo y sigue las instrucciones.'; }
  }
}

function sorrisoStopCamera(){
  if (_sorriso.stream){
    _sorriso.stream.getTracks().forEach(t => t.stop());
    _sorriso.stream = null;
  }
  const video = document.getElementById('sorrisoVideo');
  if (video){ video.srcObject = null; video.classList.add('hidden'); }
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
  // Progress
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
  document.getElementById('sorrisoTimer').textContent = ex.duration + 's';
  document.getElementById('sorrisoTimerBar').style.width = '0%';
  // Mostra solo il bottone "Empezar", nascondi conferma
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
  _sorriso.countdown = ex.duration;
  const total = ex.duration;
  document.getElementById('sorrisoTimer').textContent = _sorriso.countdown;
  document.getElementById('sorrisoTimerBar').style.width = '0%';
  _sorriso.timer = setInterval(() => {
    _sorriso.countdown--;
    const pct = ((total - _sorriso.countdown) / total) * 100;
    document.getElementById('sorrisoTimerBar').style.width = pct + '%';
    if (_sorriso.countdown > 0){
      document.getElementById('sorrisoTimer').textContent = _sorriso.countdown;
    } else {
      clearInterval(_sorriso.timer);
      document.getElementById('sorrisoTimer').textContent = '¡Tiempo!';
      document.getElementById('sorrisoTimerBar').style.width = '100%';
      // Mostra conferma: "¿Lo has conseguido?"
      document.getElementById('sorrisoGoBtn').classList.add('hidden');
      document.getElementById('sorrisoConfirm').classList.remove('hidden');
      sayAgent('¿Lo has conseguido?');
    }
  }, 1000);
}

function sorrisoConfirmYes(){
  _sorriso.results.push('done');
  document.getElementById('sorrisoConfirm').classList.add('hidden');
  document.getElementById('sorrisoNextBtn').classList.remove('hidden');
  document.getElementById('sorrisoNextBtn').disabled = false;
  sayAgent(['¡Genial!','¡Bien hecho!','Perfecto, así.','¡Buen trabajo!'][Math.floor(Math.random()*4)]);
}

function sorrisoConfirmRetry(){
  // Ripeti lo stesso esercizio
  document.getElementById('sorrisoConfirm').classList.add('hidden');
  document.getElementById('sorrisoGoBtn').classList.remove('hidden');
  document.getElementById('sorrisoGoBtn').disabled = false;
  document.getElementById('sorrisoTimerBar').style.width = '0%';
  const ex = _sorriso.exercises[_sorriso.idx];
  document.getElementById('sorrisoTimer').textContent = ex ? ex.duration + 's' : '';
  sayAgent('Venga, otra vez. ¡Tú puedes!');
}

function sorrisoSkip(){
  if (_sorriso.timer) clearInterval(_sorriso.timer);
  _sorriso.results.push('skip');
  _sorriso.idx++;
  if (_sorriso.idx >= _sorriso.exercises.length) return sorrisoComplete();
  sorrisoRender();
}

function sorrisoNext(){
  if (_sorriso.timer) clearInterval(_sorriso.timer);
  _sorriso.idx++;
  if (_sorriso.idx >= _sorriso.exercises.length) return sorrisoComplete();
  sorrisoRender();
  sayAgent('Vamos con la siguiente.');
}

function sorrisoComplete(){
  sorrisoStopCamera();
  const done = _sorriso.results.filter(r => r === 'done').length;
  const total = _sorriso.results.length;
  document.getElementById('screenSorriso').classList.add('hidden');
  // Reuse the complete screen
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
  if (_sorriso.timer) clearInterval(_sorriso.timer);
  sorrisoStopCamera();
  document.getElementById('screenSorriso').classList.add('hidden');
  backToCategories();
}
