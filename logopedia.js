// ═══════════════════════════════════════════════════════════════
//  LOGOPEDIA · APP LOGIC
//  Ana agent + exercises + STT + assessment
// ═══════════════════════════════════════════════════════════════

const PROXY = 'https://voci-ai-proxy.luca-peltrini.workers.dev/v1/messages';

// ── User data
const _ud = (window.ParliaUser && ParliaUser.get()) || { personal:{}, memory:{} };
const USER_NAME = (_ud.personal && _ud.personal.userName) || '';

// ── Logo profile (localStorage)
const LOGO_KEY = 'parlia_logo_profile';
function loadLogoProfile(){
  try {
    const raw = localStorage.getItem(LOGO_KEY);
    if (raw){
      const p = JSON.parse(raw);
      if (!Array.isArray(p.sounds)) p.sounds = DEFAULT_SOUNDS.slice();
      if (typeof p.level !== 'number') p.level = 3;
      return p;
    }
  } catch(e){}
  return { level:3, sounds:DEFAULT_SOUNDS.slice(), assessed:false };
}
function saveLogoProfile(p){
  try { localStorage.setItem(LOGO_KEY, JSON.stringify(p)); } catch(e){}
}

// ── State
const state = {
  category: null, exercises: [], idx: 0, results: [],
  recording: false, ttsOn: true, recognition: null, currentWord: '',
  logo: loadLogoProfile(),
};
let _sessionsDone = 0;

// ═══ ANA · UI ═══
function setAgentStatus(txt){
  const el = document.getElementById('agentStatus');
  if (el) el.textContent = txt;
}
let _typeIV = null;
function sayAgent(text, opts={}){
  const b = document.getElementById('agentBubble');
  if (!b) return;
  if (_typeIV){ clearInterval(_typeIV); _typeIV = null; }
  try { window.stopNeural && stopNeural(); } catch(e){}
  b.innerHTML = '';
  let i = 0;
  _typeIV = setInterval(() => {
    if (i <= text.length) {
      b.innerHTML = text.slice(0, i) + '<span class="cursor"></span>';
      i++;
    } else {
      b.innerHTML = text;
      clearInterval(_typeIV); _typeIV = null;
      if (opts.speak !== false) speak(text, opts);
    }
  }, 22);
}
function toggleTTS(){
  state.ttsOn = !state.ttsOn;
  const el = document.getElementById('ttsToggle');
  if (el){ el.textContent = state.ttsOn ? '🔊' : '🔇'; el.classList.toggle('off', !state.ttsOn); }
  if (!state.ttsOn) { try{ window.stopNeural && stopNeural(); }catch(e){} }
}
// speak con mode: 'normal' (default), 'cheer' (incoraggiamento), 'word' (slow+emphasis), 'therapeutic' (auto-emphasis fonemi difficili)
function speak(text, opts){
  if (!state.ttsOn || !text) return;
  opts = opts || {};
  if (!window.speakNeural) return;
  const mode = opts.mode || 'normal';
  if (mode === 'cheer' && speakNeural.cheer) {
    speakNeural.cheer(text, { onend: opts.onend });
  } else if (mode === 'word' && speakNeural.exerciseWord) {
    speakNeural.exerciseWord(text, { onend: opts.onend });
  } else if (mode === 'therapeutic' && speakNeural.therapeutic) {
    speakNeural.therapeutic(text, { targetWord: opts.targetWord, onend: opts.onend });
  } else {
    speakNeural(text, { rate: opts.rate || 0.95, onend: opts.onend });
  }
}

// Rileva pattern "vocale sostenuta": stessa lettera ripetuta >=2 volte (es. AAA, Aaa, Ooo)
function _isSustainedVowel(w){
  if (!w || w.length < 2) return false;
  const first = w[0].toLowerCase();
  if (!/[aeiouáéíóú]/i.test(first)) return false;
  return w.toLowerCase().split('').every(c => c === first);
}

// Bottone 👂 — riproduce la parola corrente con emphasis terapeutica
function listenWord(){
  const ex = state.exercises[state.idx];
  if (!ex || !ex.word) return;
  const btn = document.getElementById('exListenBtn');
  if (btn) btn.classList.add('playing');
  const reset = () => { if (btn) btn.classList.remove('playing'); };

  // Caso speciale: vocale sostenuta (es. Aaa, AAA, Ooo) — Google TTS di default
  // la pronuncia corta come "a". Forziamo sostegno via SSML <prosody rate="x-slow">
  // su vocale ripetuta + pitch variabile in base a "voz suave" vs "voz fuerte".
  if (_isSustainedVowel(ex.word) && window.speakNeural){
    const v = ex.word[0].toLowerCase();
    const isSoft = /suave/i.test(ex.instruction || '') || /susurro/i.test(ex.hint || '');
    const isLoud = /fuerte/i.test(ex.instruction || '') || /proyect/i.test(ex.hint || '');
    // 5 ripetizioni + rate x-slow → il sintetizzatore produce un suono sostenuto di ~2s
    const stretched = (v + v + v + v + v);
    const prosodyAttrs = isSoft ? 'rate="x-slow" volume="-4dB" pitch="-5%"'
                       : isLoud  ? 'rate="x-slow" volume="+3dB" pitch="+5%"'
                       : 'rate="x-slow"';
    const ssml = `<prosody ${prosodyAttrs}>${stretched}</prosody>`;
    speakNeural(ssml, { ssml: true, onend: reset });
    return;
  }

  if (window.speakNeural && speakNeural.therapeutic) {
    speakNeural.therapeutic(ex.word, { targetWord: ex.word, onend: reset });
  } else if (window.speakNeural) {
    speakNeural(ex.word, { rate: 0.85, onend: reset });
  } else {
    reset();
  }
}

// ═══ NAVIGATION ═══
function showScreen(name){
  ['screenCategories','screenExercise','screenComplete','screenAssessment','screenSorriso','screenDialogo'].forEach(id => {
    document.getElementById(id).classList.toggle('hidden', id !== 'screen'+name);
  });
  const endBtn = document.getElementById('endBtn');
  if (endBtn) endBtn.classList.toggle('hidden', name === 'Categories' || name === 'Assessment');
  window.scrollTo(0, 0);
}

// ═══ HISTORY MANAGEMENT ═══
// Modello a 2 livelli: Categories (base) vs subscreen (Exercise/Sorriso/Dialogo/Assessment/Complete).
// Back dal subscreen → torna alle Categories; back da Categories → esce a home.html.
let _inSubscreen = false;
let _pendingSayAgent = null;

try { history.replaceState({ screen:'categories', sub:false }, ''); } catch(e){}

function _enterSubscreen(name){
  try {
    if (_inSubscreen) history.replaceState({ screen:name, sub:true }, '');
    else { history.pushState({ screen:name, sub:true }, ''); _inSubscreen = true; }
  } catch(e){}
}

function _showCategoriesView(){
  try{ if (state.recognition) state.recognition.abort(); }catch(e){}
  try { window.stopNeural && stopNeural(); } catch(e){}
  try { if (typeof sorrisoPowerDown === 'function') sorrisoPowerDown(); } catch(e){}
  try { if (window._dialogo && _dialogo.recognition) _dialogo.recognition.abort(); }catch(e){}
  document.body.classList.remove('on-sorriso');
  state.recording = false;
  const hadCategory = !!state.category;
  state.category = null;
  setAgentStatus('Lista para empezar');
  showScreen('Categories');
  if (_pendingSayAgent){ sayAgent(_pendingSayAgent); _pendingSayAgent = null; return; }
  if (hadCategory || _sessionsDone > 0) sayAgent(returnText());
  else sayAgent(greetingText());
}

// Difensivo: qualsiasi popstate mentre siamo fuori da Categories → mostra Categories.
// Così non dipende dal matching dello state (che può essere null in alcuni browser).
window.addEventListener('popstate', (e) => {
  const catScreen = document.getElementById('screenCategories');
  const categoriesHidden = catScreen && catScreen.classList.contains('hidden');
  if (categoriesHidden || _inSubscreen){
    _inSubscreen = false;
    _showCategoriesView();
    try { history.replaceState({ screen:'categories', sub:false }, ''); } catch(err){}
  }
});
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

function pickExercises(cat){
  const all = EXERCISES[cat] || [];
  const lvl = state.logo.level || 3;
  const sounds = state.logo.sounds || DEFAULT_SOUNDS;
  const filtered = all.filter(ex => {
    if (ex.level > lvl + 1) return false;
    if (ex.level <= 2 && ex.sound && !sounds.includes(ex.sound)) return false;
    return true;
  });
  const atLevel = filtered.filter(e => e.level === lvl);
  const below   = filtered.filter(e => e.level < lvl);
  const above   = filtered.filter(e => e.level === lvl + 1);
  const pool = shuffle(atLevel.slice()).slice(0,3)
    .concat(shuffle(below.slice()).slice(0,1))
    .concat(shuffle(above.slice()).slice(0,1));
  if (!pool.length) return shuffle(all.slice()).slice(0,5);
  return shuffle(pool).slice(0,5);
}

function chooseCategory(cat){
  try { if (state.recognition) state.recognition.abort(); } catch(e){}
  state.recording = false;
  try { window.stopNeural && stopNeural(); } catch(e){}
  state.category = cat;
  const meta = CATEGORY_META[cat];
  setAgentStatus(meta.label);

  // Categorie speciali con la propria logica
  if (meta.special === 'sorriso'){
    _enterSubscreen('sorriso');
    sayAgent(`Perfecto${USER_NAME?', '+USER_NAME:''}. ¡Vamos con el Reto de la Sonrisa!`);
    sorrisoStart();
    return;
  }
  if (meta.special === 'dialogo'){
    _enterSubscreen('dialogo');
    sayAgent(`Perfecto${USER_NAME?', '+USER_NAME:''}. Vamos a conversar un poco.`);
    dialogoStart();
    return;
  }

  // Categorie standard (pronunciacion/fluidez/voz/comprension)
  state.exercises = pickExercises(cat);
  state.idx = 0;
  state.results = [];
  _enterSubscreen('exercise');
  showScreen('Exercise');
  renderExercise();
  sayAgent(`Perfecto${USER_NAME?', '+USER_NAME:''}. Vamos a practicar ${meta.label.toLowerCase()}.`);
}

function backToCategories(){
  if (_inSubscreen) { history.back(); return; }
  _showCategoriesView();
}

function endSession(){
  if (!confirm('¿Terminar la sesión?')) return;
  backToCategories();
}

// ═══ EXERCISE ═══
function renderExercise(){
  const ex = state.exercises[state.idx];
  if (!ex) return showComplete();
  state.currentWord = ex.word;
  document.getElementById('exInstruction').textContent = ex.instruction;
  const w = document.getElementById('exWord');
  w.textContent = ex.word;
  w.classList.toggle('small', ex.word.length > 18);
  document.getElementById('exHint').textContent = ex.hint || '';
  const prog = document.getElementById('exProgress');
  prog.innerHTML = '';
  state.exercises.forEach((_, i) => {
    const d = document.createElement('div');
    d.className = 'ex-progress-dot' + (i < state.idx ? ' done' : i === state.idx ? ' active' : '');
    prog.appendChild(d);
  });
  resetSemaforo();
  document.getElementById('sfFeedback').textContent = 'Pulsa el micrófono y habla';
  document.getElementById('sfFeedback').className = 'sf-feedback';
  document.getElementById('sfHeard').textContent = '';
  document.getElementById('exStatus').textContent = '';
  document.getElementById('nextBtn').disabled = true;
  document.getElementById('micBtn').disabled = false;
}

function resetSemaforo(){
  ['sfRed','sfYellow','sfGreen'].forEach(id => {
    document.getElementById(id).classList.remove('on','red','yellow','green');
  });
}
function setSemaforo(level){
  resetSemaforo();
  if (level === 'red')    document.getElementById('sfRed').classList.add('on','red');
  if (level === 'yellow') document.getElementById('sfYellow').classList.add('on','yellow');
  if (level === 'green')  document.getElementById('sfGreen').classList.add('on','green');
}

function nextExercise(){
  state.idx++;
  if (state.idx >= state.exercises.length) { showComplete(); return; }
  renderExercise();
  sayAgent('Vamos con la siguiente.');
}
function repeatExercise(){
  resetSemaforo();
  document.getElementById('sfFeedback').textContent = 'Vuelve a intentarlo, respira y habla claro';
  document.getElementById('sfFeedback').className = 'sf-feedback';
  document.getElementById('sfHeard').textContent = '';
  document.getElementById('nextBtn').disabled = true;
  document.getElementById('micBtn').disabled = false;
}
function agentCheerLine(level){
  if (level === 'green')  return ['¡Muy bien!','Perfecto, así.','¡Excelente!','¡Clarísimo!'][Math.floor(Math.random()*4)];
  if (level === 'yellow') return ['Casi, casi.','Bien, vas mejorando.','Ya casi lo tienes.'][Math.floor(Math.random()*3)];
  if (level === 'red')    return ['No pasa nada.','Tranquila, inténtalo otra vez.','Lo importante es practicar.'][Math.floor(Math.random()*3)];
  return '';
}

// ═══ COMPLETE ═══
function showComplete(){
  _sessionsDone++;
  const done = state.results.length;
  const green = state.results.filter(r => r.ok==='green').length;
  const yellow = state.results.filter(r => r.ok==='yellow').length;
  const score = done ? Math.round((green*100 + yellow*50) / done) : 0;
  document.getElementById('statDone').textContent = done;
  document.getElementById('statGreen').textContent = green;
  document.getElementById('statScore').textContent = score + '%';
  let title = '¡Bien hecho! 🎉', msg = 'Sesión completada.';
  if (score >= 85)      { title = '¡Excelente! 🌟'; msg = 'Has estado fantástica hoy.'; }
  else if (score >= 60) { title = '¡Muy bien! 💪'; msg = 'Buen trabajo, sigue así.'; }
  else                  { title = '¡Buen esfuerzo! 🌱'; msg = 'Lo importante es practicar cada día.'; }
  document.getElementById('completeTitle').textContent = title;
  document.getElementById('completeMsg').textContent = msg;
  setAgentStatus('Sesión terminada');
  sayAgent(`${title.replace(/[!¡🎉🌟💪🌱]/g,'').trim()} ${USER_NAME?USER_NAME+', ':''}has completado ${done} ejercicios con ${score}% de precisión.`, { mode: score >= 60 ? 'cheer' : 'normal' });
  try{
    const log = JSON.parse(localStorage.getItem('parlia_logo_log')||'[]');
    log.push({ date:new Date().toISOString(), category:state.category, done, green, yellow, score });
    if (log.length > 100) log.splice(0, log.length-100);
    localStorage.setItem('parlia_logo_log', JSON.stringify(log));
  } catch(e){}
  _enterSubscreen('complete');
  showScreen('Complete');
}
function repeatSession(){
  if (!state.category) return backToCategories();
  chooseCategory(state.category);
}

// ═══ SPEECH RECOGNITION ═══
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const SPEECH_SUPPORTED = !!SR;

function initRecognition(){
  if (!SPEECH_SUPPORTED) return null;
  const r = new SR();
  r.lang = 'es-ES'; r.continuous = false; r.interimResults = false; r.maxAlternatives = 3;
  return r;
}
function toggleRecord(){
  if (!SPEECH_SUPPORTED){
    document.getElementById('sfFeedback').textContent = 'Bien (sin reconocimiento de voz)';
    document.getElementById('sfFeedback').className = 'sf-feedback yellow';
    setSemaforo('yellow');
    state.results.push({ word:state.currentWord, ok:'yellow', heard:'—' });
    document.getElementById('nextBtn').disabled = false;
    return;
  }
  if (state.recording){ stopRecord(); return; }
  startRecord();
}
function startRecord(){
  try{ if (state.recognition) state.recognition.abort(); }catch(e){}
  const r = initRecognition();
  if (!r) return;
  state.recognition = r;
  state.recording = true;
  document.getElementById('micBtn').classList.add('recording');
  document.getElementById('micBtn').textContent = '■';
  document.getElementById('exStatus').textContent = 'Escuchando… habla ahora';
  document.getElementById('sfFeedback').textContent = 'Grabando…';
  document.getElementById('sfFeedback').className = 'sf-feedback';
  r.onresult = (e) => {
    const alts = [];
    for (let i=0; i<e.results[0].length; i++) alts.push(e.results[0][i].transcript);
    evaluate(alts);
  };
  r.onerror = (e) => {
    stopRecord();
    document.getElementById('exStatus').textContent = (e.error==='no-speech') ? 'No se ha escuchado nada' : 'Error: '+e.error;
    document.getElementById('sfFeedback').textContent = 'Inténtalo de nuevo';
  };
  r.onend = () => { stopRecord(); };
  try { r.start(); }
  catch(err){ stopRecord(); document.getElementById('exStatus').textContent = 'No se pudo iniciar el micrófono'; }
}
function stopRecord(){
  state.recording = false;
  const btn = document.getElementById('micBtn');
  btn.classList.remove('recording'); btn.textContent = '🎤';
  try{ if (state.recognition) state.recognition.stop(); }catch(e){}
}

function evaluate(alternatives){
  const ex = state.exercises[state.idx];
  if (!ex) return;
  const heard = alternatives[0] || '';
  document.getElementById('sfHeard').textContent = heard ? `Oído: "${heard}"` : '';
  let level, msg;
  if (ex.type === 'list'){
    const count = countDistinctWords(heard);
    const need = (ex.match && ex.match.min) || 3;
    if (count >= need)       { level='green';  msg=`¡Perfecto! ${count} elementos.`; }
    else if (count >= need-1){ level='yellow'; msg=`Casi: oí ${count} elementos.`; }
    else                     { level='red';    msg=`Solo ${count} elementos, inténtalo otra vez.`; }
  } else {
    let best = 0;
    alternatives.forEach(a => { const s = similarity(a, ex.word); if (s>best) best=s; });
    if (best >= 0.82)      { level='green';  msg='¡Muy bien pronunciado!'; }
    else if (best >= 0.55) { level='yellow'; msg='Casi, repite con más claridad.'; }
    else                   { level='red';    msg='No se entendió bien, vamos otra vez.'; }
  }
  setSemaforo(level);
  document.getElementById('sfFeedback').textContent = msg;
  document.getElementById('sfFeedback').className = 'sf-feedback ' + level;
  document.getElementById('exStatus').textContent = '';
  document.getElementById('nextBtn').disabled = false;
  state.results.push({ word:state.currentWord, ok:level, heard });
  const cheer = agentCheerLine(level);
  if (cheer) sayAgent(cheer, { mode: level === 'green' ? 'cheer' : 'normal' });
}

// ═══ SIMILARITY ═══
function norm(s){
  return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[¿?¡!.,;:]/g,'').replace(/\s+/g,' ').trim();
}
function similarity(a, b){
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}
function levenshtein(a, b){
  const m=a.length, n=b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({length:m+1}, () => new Array(n+1).fill(0));
  for (let i=0;i<=m;i++) dp[i][0]=i;
  for (let j=0;j<=n;j++) dp[0][j]=j;
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++){
    dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  }
  return dp[m][n];
}
function countDistinctWords(s){
  const STOP = new Set(['y','o','u','e','a','al','del','de','la','el','los','las','un','una','por','para','con','sin','que','en','mi','tu','su']);
  return new Set(norm(s).split(/\s+/).filter(w => w.length >= 2 && !STOP.has(w))).size;
}

// ═══ GREETING ═══
function greetingText(){
  const h = new Date().getHours();
  let phase = h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  return `${phase}${USER_NAME?', '+USER_NAME:''}. Soy Ana, tu logopeda. ¿Qué quieres practicar hoy?`;
}
function returnText(){
  const p = ['¿Qué más practicamos?','¿Probamos otra categoría?','Elige otra categoría cuando quieras.','¿Seguimos con algo más?','Bien, ¿qué hacemos ahora?'];
  return p[Math.floor(Math.random()*p.length)];
}

// ═══ ASSESSMENT ═══
let _assessDraft = null;

function renderProfileBar(){
  const p = state.logo;
  const names = {1:'1 · Vocales',2:'2 · Sílabas',3:'3 · Palabras',4:'4 · Palabras largas',5:'5 · Frases'};
  const lvl = document.getElementById('pbLevel');
  const snd = document.getElementById('pbSounds');
  if (lvl) lvl.textContent = names[p.level] || '—';
  if (snd) snd.textContent = (p.sounds||[]).map(s => s.toUpperCase()).join(' ') || '—';
}
function renderSoundGrid(containerId, sounds){
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  sounds.forEach(s => {
    const b = document.createElement('button');
    b.className = 'sound-chip' + (_assessDraft.sounds.includes(s) ? ' on' : '');
    b.textContent = s.toUpperCase();
    b.type = 'button';
    b.onclick = () => {
      const i = _assessDraft.sounds.indexOf(s);
      if (i >= 0) _assessDraft.sounds.splice(i, 1); else _assessDraft.sounds.push(s);
      b.classList.toggle('on');
    };
    el.appendChild(b);
  });
}
function renderLevelGrid(){
  document.querySelectorAll('#levelGrid .level-opt').forEach(el => {
    const lvl = parseInt(el.dataset.lvl, 10);
    el.classList.toggle('selected', lvl === _assessDraft.level);
    el.onclick = () => { _assessDraft.level = lvl; renderLevelGrid(); document.getElementById('soundsSection').style.display = (lvl <= 2) ? '' : 'none'; };
  });
  document.getElementById('soundsSection').style.display = (_assessDraft.level <= 2) ? '' : 'none';
}
function openAssessment(){
  _assessDraft = { level: state.logo.level || 3, sounds: (state.logo.sounds || DEFAULT_SOUNDS).slice() };
  renderLevelGrid();
  renderSoundGrid('vowelGrid', SOUND_GROUPS.vowel);
  renderSoundGrid('mGrid', SOUND_GROUPS.m);
  renderSoundGrid('ptGrid', SOUND_GROUPS.pt);
  renderSoundGrid('lnsGrid', SOUND_GROUPS.lns);
  _enterSubscreen('assessment');
  showScreen('Assessment');
  setAgentStatus('Configurando perfil');
  sayAgent('Marca lo que puedes decir bien ahora. Así adapto los ejercicios a ti.');
}
function cancelAssessment(){
  _assessDraft = null;
  backToCategories();
}
function saveAssessment(){
  if (!_assessDraft) return;
  if (_assessDraft.level <= 2 && !_assessDraft.sounds.length) _assessDraft.sounds = DEFAULT_SOUNDS.slice();
  state.logo = { level: _assessDraft.level, sounds: _assessDraft.sounds, assessed: true };
  saveLogoProfile(state.logo);
  _assessDraft = null;
  renderProfileBar();
  _pendingSayAgent = `Perfil guardado. Nivel ${state.logo.level}. ¿Qué practicamos?`;
  backToCategories();
}

// ═══ INIT ═══
window.addEventListener('load', () => {
  if (!SPEECH_SUPPORTED) document.getElementById('noSpeechNotice').classList.remove('hidden');
  renderProfileBar();
  if (!state.logo.assessed) {
    setTimeout(() => {
      sayAgent(`${USER_NAME?'Hola '+USER_NAME+'. ':''}Soy Ana. Antes de empezar, dime qué sonidos puedes decir para adaptar los ejercicios a ti.`);
      setTimeout(() => openAssessment(), 1200);
    }, 400);
  } else {
    setTimeout(() => sayAgent(greetingText()), 400);
  }
});
