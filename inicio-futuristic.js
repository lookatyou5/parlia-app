// Parlia — Inicio "futuristic" · canvas halo + typewriter + chips + orologio
// Esposto come window.initFuturisticInicio(). Chiamato da home.html DOPO che
// il partial components/inicio-futuristic.html è stato iniettato in #page0.
// Idempotente: se viene chiamato più volte (es. dopo un soft refresh) non
// crea animazioni duplicate.

(function(){
  if (window.initFuturisticInicio) return; // già installato

  // ── OROLOGIO ──
  function updateClock(){
    const el = document.getElementById('futMeteoTime');
    if (!el) return;
    const now = new Date();
    const days = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const h = String(now.getHours()).padStart(2,'0');
    const m = String(now.getMinutes()).padStart(2,'0');
    el.textContent = `${days[now.getDay()]} · ${h}:${m}`;
  }

  // ── SALUTI AI (stessi del file standalone) ──
  const GREETINGS = [
    { h:[6,12],  msg: 'Buenos días, Laura. ¿Lista para empezar el día? 🌅', chips:['Sí, estoy lista','Aún cansada','¿Qué toca hoy?'] },
    { h:[12,15], msg: 'Buenas tardes. ¿Cómo fue la sesión de esta mañana?', chips:['Muy bien','Regular','Difícil','Estoy cansada'] },
    { h:[15,20], msg: 'Por la tarde todo en calma. ¿Cómo te sientes ahora?', chips:['Bien 😊','Dolorida','Motivada','Quiero descansar'] },
    { h:[20,24], msg: 'Buenas noches Laura. ¡Excelente trabajo hoy! Completaste todas tus sesiones. ¿Cómo te sientes?', chips:['Cansada','Bien pero dolorida','Muy motivada','Quiero relajarme'] },
    { h:[0,6],   msg: 'Parece que es tarde. Descansa bien — mañana sigue el trabajo.', chips:['Buenas noches 🌙','No puedo dormir','¿Mañana qué toca?'] },
  ];
  function getGreeting(){
    const h = new Date().getHours();
    return GREETINGS.find(g => h >= g.h[0] && h < g.h[1]) || GREETINGS[3];
  }

  function typewrite(el, text, speed=28, cb){
    if (!el) return;
    el.innerHTML = '';
    let i = 0;
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    (function tick(){
      if (i < text.length) {
        el.textContent = text.slice(0, ++i);
        el.appendChild(cursor);
        setTimeout(tick, speed);
      } else {
        el.textContent = text;
        if (cb) cb();
      }
    })();
  }

  function showChips(chips){
    const container = document.getElementById('futAiChips');
    const hint = document.getElementById('futTapHint');
    if (!container) return;
    container.innerHTML = '';
    container.style.display = 'flex';
    chips.forEach((c,i) => {
      const el = document.createElement('div');
      el.className = 'fut-ai-chip';
      el.style.animationDelay = (i * .07) + 's';
      el.textContent = c;
      el.onclick = () => chipSelected(el, c);
      container.appendChild(el);
    });
    if (hint) hint.style.opacity = '0';
  }

  function chipSelected(el, text){
    document.querySelectorAll('.fut-ai-chip').forEach(c => c.style.opacity = '.3');
    el.style.opacity = '1';
    el.style.background = 'rgba(99,102,241,.3)';
    el.style.borderColor = 'rgba(99,102,241,.5)';
    setTimeout(() => {
      const chipsEl = document.getElementById('futAiChips');
      const hint = document.getElementById('futTapHint');
      if (chipsEl) chipsEl.style.display = 'none';
      if (hint) hint.style.opacity = '0.6';
      const reply = getReply(text);
      typewrite(document.getElementById('futAiText'), reply, 22);
    }, 600);
  }

  function getReply(chip){
    const map = {
      'Sí, estoy lista': '¡Perfecto! Tienes logopedia a las 13:00 con la Dra. Martínez. ¡Ánimo! 💪',
      'Aún cansada': 'Tómatelo con calma. No hace falta empezar corriendo — ve a tu ritmo. 🌿',
      'Cansada': 'Es normal después de un día tan completo. Descansa y mañana seguimos. 🌙',
      'Bien pero dolorida': 'Eso es señal de que trabajaste duro. Avisa a tu cuidador si necesitas algo.',
      'Muy motivada': '¡Me encanta escuchar eso! Ese espíritu es tu mejor herramienta. 🚀',
      'Quiero relajarme': 'Mereces un descanso. ¿Quieres que ponga algo tranquilo de fondo?',
    };
    return map[chip] || '¡Gracias por contarme! Estoy aquí si necesitas algo más. 🤍';
  }

  // ── LIQUID WAVE CANVAS ──
  let _canvasInit = false;
  let _setEnergy = null;
  function initCanvas(){
    if (_canvasInit) return;
    const canvas = document.getElementById('futHaloCanvas');
    if (!canvas) return;
    _canvasInit = true;
    const ctx = canvas.getContext('2d');
    let W, H, energy = 0;

    function resize(){
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width = W * devicePixelRatio;
      canvas.height = H * devicePixelRatio;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(devicePixelRatio, devicePixelRatio);
    }
    resize();
    window.addEventListener('resize', resize);

    const waves = [
      { amp: 18, freq: 0.016, speed: 0.014, phase: 0,   color: 'rgba(37,99,235,',  alpha: 0.32 },
      { amp: 12, freq: 0.024, speed: 0.020, phase: 2.1, color: 'rgba(79,70,229,',  alpha: 0.26 },
      { amp: 22, freq: 0.011, speed: 0.009, phase: 4.2, color: 'rgba(99,102,241,', alpha: 0.20 },
      { amp: 8,  freq: 0.030, speed: 0.026, phase: 1.0, color: 'rgba(124,58,237,', alpha: 0.18 },
      { amp: 14, freq: 0.014, speed: 0.011, phase: 3.3, color: 'rgba(59,130,246,', alpha: 0.24 },
      { amp: 6,  freq: 0.038, speed: 0.030, phase: 5.1, color: 'rgba(139,92,246,', alpha: 0.14 },
    ];

    function draw(){
      if (!canvas.isConnected) return; // stop se il partial è stato rimpiazzato
      ctx.clearRect(0, 0, W, H);
      waves.forEach((w, i) => {
        w.phase += w.speed * (1 + energy * 2);
        const amp = w.amp * (1 + energy * 1.2);
        const pts = [];
        for (let x = 0; x <= W; x += 2) {
          const y = H/2
            + Math.sin(x * w.freq + w.phase) * amp
            + Math.sin(x * w.freq * 0.6 + w.phase * 0.8) * amp * 0.35
            + Math.sin(x * w.freq * 1.4 + w.phase * 1.2) * amp * 0.15;
          pts.push({x, y});
        }
        ctx.beginPath();
        pts.forEach((p, j) => j === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
        const grad = ctx.createLinearGradient(0, H/2 - amp*1.5, 0, H);
        grad.addColorStop(0, w.color + (w.alpha * (1 + energy * 0.7)) + ')');
        grad.addColorStop(0.6, w.color + (w.alpha * 0.4) + ')');
        grad.addColorStop(1, w.color + '0)');
        ctx.fillStyle = grad;
        ctx.fill();
        if (i % 2 === 0) {
          ctx.beginPath();
          pts.forEach((p, j) => j === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
          ctx.strokeStyle = w.color + Math.min(0.55, w.alpha * 1.8 * (1 + energy * 0.5)) + ')';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      });
      if (energy > 0) energy = Math.max(0, energy - 0.006);
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
    _setEnergy = v => { energy = v; };
  }

  // ── HALO CLICK ──
  let _haloClicked = false;
  function haloClick(){
    if (_setEnergy) _setEnergy(1);
    const ring = document.getElementById('futHaloRing');
    if (ring) {
      ring.classList.remove('touched');
      void ring.offsetWidth; // reflow per restart animazione
      ring.classList.add('touched');
      setTimeout(() => ring.classList.remove('touched'), 700);
    }
    if (!_haloClicked) {
      _haloClicked = true;
      const hint = document.getElementById('futTapHint');
      const chipsEl = document.getElementById('futAiChips');
      if (hint) hint.style.opacity = '0';
      if (chipsEl) chipsEl.style.display = 'none';
      typewrite(
        document.getElementById('futAiText'),
        '¡Hola Laura! Estoy aquí. Toca un chip para responder o desliza para ver tu agenda. 🌿',
        24,
        () => setTimeout(() => showChips(getGreeting().chips), 500)
      );
    } else {
      showChips(getGreeting().chips);
      const hint = document.getElementById('futTapHint');
      if (hint) hint.style.opacity = '0';
    }
  }

  // ── INIT pubblico ──
  window.initFuturisticInicio = function(){
    const wrap = document.getElementById('futHaloWrap');
    if (!wrap) return; // partial non iniettato, niente da fare
    updateClock();
    if (!window._futClockTimer) window._futClockTimer = setInterval(updateClock, 30000);
    initCanvas();
    wrap.onclick = haloClick;
    // Saluto iniziale
    setTimeout(() => {
      const g = getGreeting();
      typewrite(document.getElementById('futAiText'), g.msg, 28, () => {
        setTimeout(() => showChips(g.chips), 400);
      });
    }, 400);
  };
})();
