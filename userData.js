// Parlia — Unified user data layer
// Schema: parlia_user_data
//   personal  : { userName, gender, age, condicion[], movilidad, caregiverName, caregiver2Name }
//   memory    : { hobbies[], musica, comida, interests[], family[], profession, birthplace, notas }
//   functions : { aac, chat, logo, neuro, gps, mood }
//   stats     : { opens, last_open, favorite_hours[], last_mood, last_mood_date }
//
// Migration: on first load, reads legacy keys (parlia_profile, parlia_profile_extra,
// parlia_memory) and merges into parlia_user_data. Legacy keys are also kept in sync
// on save for backward compatibility with older code paths.

(function(global){
  const KEY = 'parlia_user_data';
  const LEGACY = { profile:'parlia_profile', extra:'parlia_profile_extra', memory:'parlia_memory' };

  function defaults(){
    return {
      personal: { userName:'', gender:'', age:'', condicion:[], movilidad:'', caregiverName:'', caregiver2Name:'' },
      memory:   { hobbies:[], musica:'', comida:'', interests:[], family:[], profession:'', birthplace:'', notas:'' },
      functions:{ aac:true, chat:true, logo:true, neuro:true, gps:false, mood:true },
      stats:    { opens:0, last_open:'', favorite_hours:[], last_mood:'', last_mood_date:'' }
    };
  }

  function mergeUnique(a,b){ const s=new Set([...(a||[]),...(b||[])].filter(Boolean)); return [...s]; }
  function readJSON(k){ try { return JSON.parse(localStorage.getItem(k)||'null'); } catch(e){ return null; } }

  function migrate(){
    const p = readJSON(LEGACY.profile) || {};
    const e = readJSON(LEGACY.extra)   || {};
    const m = readJSON(LEGACY.memory)  || {};
    const mp = (m && m.user_profile) || {};
    const is = (m && m.interaction_stats) || {};
    const ml = (m && m.mood_log) || {};
    const pp = e.personal || {};
    const d = defaults();
    d.personal = {
      userName: p.userName || '',
      gender: p.gender || '',
      age: e.edad || '',
      condicion: Array.isArray(e.condicion) ? e.condicion : (e.condicion ? [e.condicion] : []),
      movilidad: e.movilidad || '',
      caregiverName: p.caregiverName || '',
      caregiver2Name: e.cuidador2Name || ''
    };
    d.memory = {
      hobbies: mergeUnique(e.hobbies, mp.hobbies),
      musica: mp.musica || '',
      comida: mp.comida || pp.favoriteFood || '',
      interests: e.interests || [],
      family: e.family || [],
      profession: pp.profession || '',
      birthplace: pp.birthplace || '',
      notas: mp.notas || ''
    };
    if(e.switchState) d.functions = Object.assign(d.functions, e.switchState);
    d.stats = {
      opens: is.opens || 0,
      last_open: is.last_open || '',
      favorite_hours: Array.isArray(is.favorite_hours) ? is.favorite_hours : [],
      last_mood: ml.last_mood || '',
      last_mood_date: ml.last_mood_date || ''
    };
    return d;
  }

  function getUserData(){
    let d = readJSON(KEY);
    if(!d){
      d = migrate();
      localStorage.setItem(KEY, JSON.stringify(d));
    } else {
      // Fill in any missing top-level keys from defaults (forward compat)
      const def = defaults();
      for(const k of Object.keys(def)) if(!d[k]) d[k] = def[k];
    }
    return d;
  }

  function saveUserData(d){
    localStorage.setItem(KEY, JSON.stringify(d));
    // Keep legacy keys in sync so older code still works
    try {
      localStorage.setItem(LEGACY.profile, JSON.stringify({
        userName: d.personal.userName,
        gender: d.personal.gender,
        caregiverName: d.personal.caregiverName
      }));
      localStorage.setItem(LEGACY.extra, JSON.stringify({
        condicion: d.personal.condicion,
        movilidad: d.personal.movilidad,
        edad: d.personal.age,
        hobbies: d.memory.hobbies,
        interests: d.memory.interests,
        family: d.memory.family,
        personal: {
          profession: d.memory.profession,
          birthplace: d.memory.birthplace,
          favoriteFood: d.memory.comida
        },
        switchState: d.functions,
        cuidador2Name: d.personal.caregiver2Name
      }));
      localStorage.setItem(LEGACY.memory, JSON.stringify({
        user_profile: {
          hobbies: d.memory.hobbies,
          musica: d.memory.musica,
          comida: d.memory.comida,
          notas: d.memory.notas
        },
        interaction_stats: {
          opens: d.stats.opens,
          last_open: d.stats.last_open,
          favorite_hours: d.stats.favorite_hours
        },
        mood_log: {
          last_mood: d.stats.last_mood,
          last_mood_date: d.stats.last_mood_date
        }
      }));
    } catch(e){}
  }

  // Count fields for progress %
  function countCompleted(d){
    let n = 0, t = 0;
    const p = d.personal, m = d.memory;
    const fields = [p.userName, p.gender, p.age, p.condicion.length, p.movilidad, p.caregiverName,
                    m.hobbies.length, m.musica, m.comida, m.interests.length, m.family.length,
                    m.profession, m.birthplace, m.notas];
    fields.forEach(v => { t++; if(v && (typeof v!=='number' || v>0)) n++; });
    return { done:n, total:t, pct: Math.round(n/t*100) };
  }

  global.ParliaUser = { get:getUserData, save:saveUserData, count:countCompleted, defaults };
})(window);
