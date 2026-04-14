// Parlia — Profile page logic
// Uses window.ParliaUser (userData.js) for persistence

(function(){
  const data = ParliaUser.get();

  // ── Field definitions (single source of truth) ─────────────────────────────
  // type: text | textarea | chips-single | chips-multi | text-list
  const FIELDS = [
    // personal
    { g:'personal', k:'userName',       icon:'🙋', bg:'#eff6ff', label:'Nombre',
      type:'text', placeholder:'Tu nombre de pila', help:'Así te llamará Parlia AI.' },
    { g:'personal', k:'gender',         icon:'🧑', bg:'#f5f3ff', label:'Género',
      type:'chips-single', options:[{v:'f',l:'👩 Mujer'},{v:'m',l:'👨 Hombre'},{v:'n',l:'🧑 No especificado'}],
      display:v=>({f:'Mujer',m:'Hombre',n:'No especificado'})[v]||'—' },
    { g:'personal', k:'age',            icon:'🎂', bg:'#f0fdfa', label:'Edad',
      type:'chips-single', options:['Niño (0-12)','Adolescente (13-17)','Adulto joven (18-40)','Adulto (41-65)','Mayor (65+)'].map(v=>({v,l:v})),
      help:'Parlia adapta el tono y los ejercicios a tu edad.' },
    { g:'personal', k:'condicion',      icon:'🏥', bg:'#fef9c3', label:'Condición',
      type:'chips-multi', options:['Afasia','SLA','Parálisis cerebral','Daño cerebral adquirido','Parkinson','Otra'].map(v=>({v,l:v})),
      help:'Puedes seleccionar más de una.' },
    { g:'personal', k:'movilidad',      icon:'🖐️', bg:'#fdf4ff', label:'Movilidad de manos',
      type:'chips-single', options:['Completa','Limitada','Solo un dedo','Switch externo'].map(v=>({v,l:v})),
      help:'Ajustamos los botones y la interacción.' },
    { g:'personal', k:'caregiverName',  icon:'🤝', bg:'#ecfeff', label:'Cuidador principal',
      type:'text', placeholder:'Ej: Luca, María…', help:'Tu contacto principal de apoyo.' },
    { g:'personal', k:'caregiver2Name', icon:'👴', bg:'#fef3c7', label:'Contacto secundario',
      type:'text', placeholder:'Ej: Ana, Roberto…', help:'Un familiar adicional (opcional).' },

    // memory
    { g:'memory', k:'hobbies',    icon:'🎨', bg:'#fef3c7', label:'Hobbies',
      type:'text-list', placeholder:'ej: plantas, lectura, música, cocina…',
      help:'Separa con comas. Parlia los usará para charlar contigo.' },
    { g:'memory', k:'musica',     icon:'🎵', bg:'#fae8ff', label:'Música favorita',
      type:'text', placeholder:'ej: jazz, Rosalía, clásica…',
      help:'Tus géneros o artistas preferidos.' },
    { g:'memory', k:'comida',     icon:'🍽️', bg:'#ffedd5', label:'Comida favorita',
      type:'text', placeholder:'ej: paella, sushi, chocolate…',
      help:'Platos o sabores que amas.' },
    { g:'memory', k:'interests',  icon:'💡', bg:'#f5e6ff', label:'Intereses',
      type:'text-list', placeholder:'ej: naturaleza, historia, ciencia…',
      help:'Separa con comas. Temas para conversaciones.' },
    { g:'memory', k:'family',     icon:'👨‍👩‍👧', bg:'#ffe6cc', label:'Familia y mascotas',
      type:'text-list', placeholder:'ej: Luca (marido), Michi (gato)…',
      help:'Las personas y mascotas que te rodean.' },
    { g:'memory', k:'profession', icon:'💼', bg:'#dbeafe', label:'Profesión',
      type:'text', placeholder:'Ej: Ingeniera, Profesora…',
      help:'A qué te dedicas o te dedicabas.' },
    { g:'memory', k:'birthplace', icon:'🗺️', bg:'#dcfce7', label:'Lugar de origen',
      type:'text', placeholder:'Ej: Barcelona, Buenos Aires…' },
    { g:'memory', k:'notas',      icon:'💬', bg:'#fdf2f8', label:'Cómo hablar conmigo',
      type:'textarea', placeholder:'Me gusta que me hablen con humor, tutéame, evita tecnicismos…',
      help:'Tono, manías, anécdotas. Es lo que más humaniza las conversaciones.' },
  ];

  const FUNCS = [
    { k:'aac',   icon:'🗣️', bg:'#eff6ff', label:'Comunicador AAC',  sub:'Frases y categorías con voz' },
    { k:'chat',  icon:'💬', bg:'#fae8ff', label:'Chat con cuidador', sub:'Mensajes en tiempo real' },
    { k:'logo',  icon:'🎙️', bg:'#fdf4ff', label:'Logopedia',         sub:'Ejercicios de habla con IA' },
    { k:'neuro', icon:'🧠', bg:'#f5f3ff', label:'Estimulación cognitiva', sub:'Juegos neurológicos' },
    { k:'gps',   icon:'📍', bg:'#dcfce7', label:'GPS en vivo',        sub:'Comparte tu posición' },
    { k:'mood',  icon:'😊', bg:'#fff7ed', label:'Widget de ánimo',    sub:'Registra cómo te sientes' },
  ];

  // ── Render rows ───────────────────────────────────────────────────────────
  function valPreview(f){
    const v = data[f.g][f.k];
    if(f.display) return f.display(v) || 'Añadir';
    if(Array.isArray(v)) return v.length ? v.join(', ') : 'Añadir';
    if(f.type==='chips-single'){ const o = (f.options||[]).find(o=>o.v===v); return o ? o.l : 'Añadir'; }
    return v ? String(v) : 'Añadir';
  }

  function rowHTML(f){
    const v = valPreview(f);
    const isEmpty = v === 'Añadir';
    return `<div class="row" onclick="openField('${f.k}')">
      <div class="row-icon" style="background:${f.bg}">${f.icon}</div>
      <div class="row-body">
        <div class="row-title">${f.label}</div>
        <div class="row-value ${isEmpty?'empty':''}">${escapeHtml(v)}</div>
      </div>
      <div class="row-chev">›</div>
    </div>`;
  }

  function render(){
    document.getElementById('g-personal').innerHTML = FIELDS.filter(f=>f.g==='personal').map(rowHTML).join('');
    document.getElementById('g-memory').innerHTML   = FIELDS.filter(f=>f.g==='memory').map(rowHTML).join('');
    document.getElementById('g-functions').innerHTML = FUNCS.map(f=>`
      <div class="toggle-row">
        <div class="row-icon" style="background:${f.bg}">${f.icon}</div>
        <div>
          <div class="tl">${f.label}</div>
          <div class="ts">${f.sub}</div>
        </div>
        <div class="toggle ${data.functions[f.k]?'on':''}" onclick="toggleFunc('${f.k}',this)"></div>
      </div>
    `).join('');
    updateProgress();
  }

  function updateProgress(){
    const c = ParliaUser.count(data);
    document.getElementById('pcBar').style.width = c.pct + '%';
    document.getElementById('pcTitle').textContent = c.pct >= 100 ? '¡Perfil completo! 🎉' : `Perfil al ${c.pct}%`;
    document.getElementById('pcPct').textContent = c.pct >= 100
      ? 'Parlia AI te conoce muy bien.'
      : `${c.done} de ${c.total} campos — cuanto más completes, más personal será Parlia AI.`;
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  let _editing = null; // {field, draft}

  window.openField = function(k){
    const f = FIELDS.find(x=>x.k===k); if(!f) return;
    const v = data[f.g][f.k];
    _editing = { f, draft: Array.isArray(v) ? [...v] : v };
    document.getElementById('mEmoji').textContent = f.icon;
    document.getElementById('mTitle').textContent = f.label;
    document.getElementById('mHelp').textContent  = f.help || '';
    document.getElementById('mHelp').style.display = f.help ? 'block' : 'none';
    document.getElementById('mBody').innerHTML = renderEditor(f, _editing.draft);
    document.getElementById('mOverlay').classList.add('open');
    setTimeout(()=>{
      const inp = document.querySelector('#mBody input, #mBody textarea');
      if(inp) inp.focus();
    }, 280);
  };

  function renderEditor(f, draft){
    if(f.type === 'text'){
      return `<input class="minput" type="text" value="${escapeHtml(draft||'')}"
        placeholder="${escapeHtml(f.placeholder||'')}" oninput="_editing.draft=this.value" autocomplete="off" spellcheck="false">`;
    }
    if(f.type === 'textarea'){
      return `<textarea class="minput" rows="4" placeholder="${escapeHtml(f.placeholder||'')}"
        oninput="_editing.draft=this.value">${escapeHtml(draft||'')}</textarea>`;
    }
    if(f.type === 'text-list'){
      const s = Array.isArray(draft) ? draft.join(', ') : (draft||'');
      return `<textarea class="minput" rows="3" placeholder="${escapeHtml(f.placeholder||'')}"
        oninput="_editing.draft=this.value.split(',').map(x=>x.trim()).filter(Boolean)">${escapeHtml(s)}</textarea>
        <div class="mhint">Separa los elementos con comas.</div>`;
    }
    if(f.type === 'chips-single'){
      return `<div class="mchips">${f.options.map(o=>`
        <div class="mchip ${draft===o.v?'sel':''}" onclick="_pickSingle('${escapeJs(o.v)}',this)">${escapeHtml(o.l)}</div>
      `).join('')}</div>`;
    }
    if(f.type === 'chips-multi'){
      const set = new Set(Array.isArray(draft) ? draft : []);
      return `<div class="mchips">${f.options.map(o=>`
        <div class="mchip ${set.has(o.v)?'sel':''}" onclick="_pickMulti('${escapeJs(o.v)}',this)">${escapeHtml(o.l)}</div>
      `).join('')}</div>
      <div class="mhint">Puedes seleccionar más de uno.</div>`;
    }
    return '';
  }

  window._pickSingle = function(v, el){
    _editing.draft = v;
    el.parentElement.querySelectorAll('.mchip').forEach(c=>c.classList.remove('sel'));
    el.classList.add('sel');
  };

  window._pickMulti = function(v, el){
    if(!Array.isArray(_editing.draft)) _editing.draft = [];
    const i = _editing.draft.indexOf(v);
    if(i >= 0){ _editing.draft.splice(i,1); el.classList.remove('sel'); }
    else { _editing.draft.push(v); el.classList.add('sel'); }
  };
  window._editing = null; // exposed getter for inline handlers
  Object.defineProperty(window,'_editing',{ get:()=>_editing, set:v=>{_editing=v;} });

  window.closeModal = function(){ document.getElementById('mOverlay').classList.remove('open'); _editing = null; };

  window.saveModal = function(){
    if(!_editing) return closeModal();
    const { f, draft } = _editing;
    data[f.g][f.k] = Array.isArray(draft) ? [...draft] : (draft||'');
    ParliaUser.save(data);
    closeModal();
    render();
    showToast('✓ Guardado');
  };

  window.toggleFunc = function(k, el){
    data.functions[k] = !data.functions[k];
    el.classList.toggle('on', data.functions[k]);
    ParliaUser.save(data);
  };

  // ── Export/Import ─────────────────────────────────────────────────────────
  window.exportData = function(){
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'parlia_backup_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('📤 Exportado');
  };

  window.importData = function(e){
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const incoming = JSON.parse(ev.target.result);
        // Accept either the new flat schema or legacy multi-key backups
        if(incoming.personal && incoming.memory){
          Object.assign(data.personal, incoming.personal);
          Object.assign(data.memory, incoming.memory);
          if(incoming.functions) Object.assign(data.functions, incoming.functions);
        } else {
          // legacy: store raw keys then re-migrate
          if(incoming.parlia_profile) localStorage.setItem('parlia_profile', JSON.stringify(incoming.parlia_profile));
          if(incoming.parlia_profile_extra) localStorage.setItem('parlia_profile_extra', JSON.stringify(incoming.parlia_profile_extra));
          if(incoming.parlia_memory) localStorage.setItem('parlia_memory', JSON.stringify(incoming.parlia_memory));
          localStorage.removeItem('parlia_user_data');
          location.reload(); return;
        }
        ParliaUser.save(data);
        render();
        showToast('📥 Importado');
      } catch(err){ showToast('❌ Archivo no válido'); }
    };
    reader.readAsText(file);
  };

  // ── Utils ─────────────────────────────────────────────────────────────────
  function showToast(msg){
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(t._tm);
    t._tm = setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateX(-50%) translateY(16px)'; }, 2000);
  }
  function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function escapeJs(s){ return String(s).replace(/'/g,"\\'"); }

  render();
})();
