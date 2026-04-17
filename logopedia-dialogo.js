// ═══════════════════════════════════════════════════════════════
//  LOGOPEDIA · DIÁLOGO GUIDADO
//  L'AI propone domande, l'utente risponde a voce.
//  Non giudica la pronuncia — premia lo sforzo.
// ═══════════════════════════════════════════════════════════════

const DIALOGO_PROMPTS = [
  { question:'¿Qué has desayunado hoy?',        hint:'Comida, bebida… lo que sea' },
  { question:'¿Cuál es tu color favorito?',      hint:'Di el color y por qué' },
  { question:'¿Qué tiempo hace hoy?',            hint:'Sol, nubes, frío, calor…' },
  { question:'¿Tienes alguna mascota?',           hint:'Nombre, tipo, o si te gustaría una' },
  { question:'¿Qué harías si fueras invisible?',  hint:'Piensa algo divertido' },
  { question:'¿Cuál es tu canción favorita?',     hint:'Nombre, cantante o tararea' },
  { question:'Cuéntame qué ves por la ventana.',   hint:'Describe lo que veas o imagines' },
  { question:'¿Qué te gustaría cenar esta noche?', hint:'Plato, postre, lo que quieras' },
  { question:'¿A dónde irías de vacaciones?',     hint:'Playa, montaña, ciudad…' },
  { question:'¿Qué es lo mejor de hoy?',          hint:'Algo bonito, pequeño o grande' },
  { question:'Dime tres cosas que te hacen feliz.',hint:'Personas, lugares, cosas…' },
  { question:'¿Qué película te gusta mucho?',     hint:'Título o describe la historia' },
];

const _dialogo = {
  prompts: [],
  idx: 0,
  results: [],   // { question, heard, words }
  recording: false,
  recognition: null,
};

function dialogoStart(){
  _dialogo.prompts = shuffle(DIALOGO_PROMPTS.slice()).slice(0,5);
  _dialogo.idx = 0;
  _dialogo.results = [];
  showScreen('Dialogo');
  dialogoRender();
}

function dialogoRender(){
  const p = _dialogo.prompts[_dialogo.idx];
  if (!p) return dialogoComplete();
  // Progress
  const prog = document.getElementById('dialogoProgress');
  prog.innerHTML = '';
  _dialogo.prompts.forEach((_,i) => {
    const d = document.createElement('div');
    d.className = 'ex-progress-dot' + (i < _dialogo.idx ? ' done' : i === _dialogo.idx ? ' active' : '');
    prog.appendChild(d);
  });
  document.getElementById('dialogoQuestion').textContent = p.question;
  document.getElementById('dialogoHint').textContent = p.hint;
  document.getElementById('dialogoHeard').textContent = '';
  document.getElementById('dialogoFeedback').textContent = 'Pulsa el micrófono y responde';
  document.getElementById('dialogoFeedback').className = 'sf-feedback';
  document.getElementById('dialogoMicBtn').disabled = false;
  document.getElementById('dialogoNextBtn').disabled = true;
  sayAgent(p.question);
}

function dialogoToggleRecord(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR){
    // No STT — let user skip
    document.getElementById('dialogoFeedback').textContent = '¡Bien! (sin micrófono)';
    document.getElementById('dialogoFeedback').className = 'sf-feedback green';
    _dialogo.results.push({ question:_dialogo.prompts[_dialogo.idx].question, heard:'—', words:0 });
    document.getElementById('dialogoNextBtn').disabled = false;
    sayAgent('¡Gracias por intentarlo!');
    return;
  }
  if (_dialogo.recording){ dialogoStopRecord(); return; }
  dialogoStartRecord();
}

function dialogoStartRecord(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  try{ if (_dialogo.recognition) _dialogo.recognition.abort(); }catch(e){}
  const r = new SR();
  r.lang = 'es-ES'; r.continuous = false; r.interimResults = false; r.maxAlternatives = 1;
  _dialogo.recognition = r;
  _dialogo.recording = true;
  const btn = document.getElementById('dialogoMicBtn');
  btn.classList.add('recording'); btn.textContent = '■';
  document.getElementById('dialogoFeedback').textContent = 'Escuchando…';
  document.getElementById('dialogoFeedback').className = 'sf-feedback';

  r.onresult = (e) => {
    const heard = e.results[0][0].transcript || '';
    dialogoEvaluate(heard);
  };
  r.onerror = (e) => {
    dialogoStopRecord();
    document.getElementById('dialogoFeedback').textContent = e.error === 'no-speech' ? 'No escuché nada, intenta de nuevo' : 'Error, intenta de nuevo';
  };
  r.onend = () => { dialogoStopRecord(); };
  try { r.start(); } catch(e){ dialogoStopRecord(); }
}

function dialogoStopRecord(){
  _dialogo.recording = false;
  const btn = document.getElementById('dialogoMicBtn');
  if (btn){ btn.classList.remove('recording'); btn.textContent = '🎤'; }
  try{ if (_dialogo.recognition) _dialogo.recognition.stop(); }catch(e){}
}

function dialogoEvaluate(heard){
  document.getElementById('dialogoHeard').textContent = heard ? `"${heard}"` : '';
  const words = (heard || '').trim().split(/\s+/).filter(w => w.length > 0).length;
  const p = _dialogo.prompts[_dialogo.idx];
  _dialogo.results.push({ question: p.question, heard, words });

  // Premia lo sforzo — qualsiasi risposta è buona
  let feedback, cheerLine;
  if (words >= 5){
    feedback = '¡Fantástico! Muy buena respuesta.';
    cheerLine = ['¡Me encanta esa respuesta!','¡Qué bien te expresas!','Muy bien, sigue así.'][Math.floor(Math.random()*3)];
  } else if (words >= 2){
    feedback = '¡Bien! Has respondido.';
    cheerLine = ['¡Genial, eso cuenta!','¡Bien dicho!','Perfecto, cada palabra suma.'][Math.floor(Math.random()*3)];
  } else if (words >= 1){
    feedback = '¡Bien! Una palabra es un buen comienzo.';
    cheerLine = ['¡Eso es! Cada intento vale.','¡Bravo, lo importante es intentarlo!'][Math.floor(Math.random()*2)];
  } else {
    feedback = 'No se entendió, pero gracias por intentarlo.';
    cheerLine = 'No pasa nada, lo importante es participar.';
  }
  document.getElementById('dialogoFeedback').textContent = feedback;
  document.getElementById('dialogoFeedback').className = 'sf-feedback green';
  document.getElementById('dialogoNextBtn').disabled = false;
  document.getElementById('dialogoMicBtn').disabled = true;
  sayAgent(cheerLine, { mode: 'cheer' });
}

function dialogoNext(){
  _dialogo.idx++;
  if (_dialogo.idx >= _dialogo.prompts.length) return dialogoComplete();
  dialogoRender();
}

function dialogoComplete(){
  document.getElementById('screenDialogo').classList.add('hidden');
  const total = _dialogo.results.length;
  const answered = _dialogo.results.filter(r => r.words >= 1).length;
  _sessionsDone++;
  document.getElementById('statDone').textContent = total;
  document.getElementById('statGreen').textContent = answered;
  document.getElementById('statScore').textContent = Math.round((answered/Math.max(total,1))*100) + '%';
  document.getElementById('completeTitle').textContent = answered >= total-1 ? '¡Genial! 💬' : '¡Buen esfuerzo! 💪';
  document.getElementById('completeMsg').textContent = `Has respondido a ${answered} de ${total} preguntas.`;
  setAgentStatus('Sesión terminada');
  sayAgent(`${answered} respuestas. ¡Bien hecho, cada palabra cuenta!`, { mode: 'cheer' });
  try{
    const log = JSON.parse(localStorage.getItem('parlia_logo_log')||'[]');
    log.push({ date:new Date().toISOString(), category:'dialogo', done:total, green:answered, yellow:0, score:Math.round((answered/Math.max(total,1))*100) });
    if (log.length > 100) log.splice(0, log.length-100);
    localStorage.setItem('parlia_logo_log', JSON.stringify(log));
  } catch(e){}
  if (typeof _enterSubscreen === 'function') _enterSubscreen('complete');
  showScreen('Complete');
}

function dialogoExit(){
  try{ if (_dialogo.recognition) _dialogo.recognition.abort(); }catch(e){}
  _dialogo.recording = false;
  document.getElementById('screenDialogo').classList.add('hidden');
  backToCategories();
}
