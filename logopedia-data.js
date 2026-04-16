// ═══════════════════════════════════════════════════════════════
//  LOGOPEDIA · EXERCISE BANK + METADATA
//  Modifica questo file per aggiungere/cambiare esercizi.
//  Ogni esercizio: { type, word, instruction, hint, level, sound? }
//  type  'say'  → confronto fonetico
//  type  'list' → nominare N elementi (match.min)
//  level 1..5   → vocale → sillaba → parola → complessa → frase
//  sound        → fonema per filtro profilo (solo L1/L2)
// ═══════════════════════════════════════════════════════════════

const EXERCISES = {
  pronunciacion: [
    // ─ L1 · vocali
    { type:'say', level:1, sound:'a', word:'A', instruction:'Di la vocal A', hint:'Boca bien abierta, claro y firme' },
    { type:'say', level:1, sound:'e', word:'E', instruction:'Di la vocal E', hint:'Labios estirados hacia los lados' },
    { type:'say', level:1, sound:'i', word:'I', instruction:'Di la vocal I', hint:'Sonrisa, lengua arriba' },
    { type:'say', level:1, sound:'o', word:'O', instruction:'Di la vocal O', hint:'Labios redondos, como un círculo' },
    { type:'say', level:1, sound:'u', word:'U', instruction:'Di la vocal U', hint:'Labios hacia adelante, beso' },
    // ─ L2 · sillabe CV
    { type:'say', level:2, sound:'ma', word:'MA', instruction:'Di la sílaba MA', hint:'Labios juntos → abrir' },
    { type:'say', level:2, sound:'me', word:'ME', instruction:'Di la sílaba ME', hint:'Labios juntos → sonrisa' },
    { type:'say', level:2, sound:'mo', word:'MO', instruction:'Di la sílaba MO', hint:'Labios juntos → redondos' },
    { type:'say', level:2, sound:'pa', word:'PA', instruction:'Di la sílaba PA', hint:'Explosión de aire en labios' },
    { type:'say', level:2, sound:'pe', word:'PE', instruction:'Di la sílaba PE', hint:'P suave + E' },
    { type:'say', level:2, sound:'po', word:'PO', instruction:'Di la sílaba PO', hint:'P + labios redondos' },
    { type:'say', level:2, sound:'ta', word:'TA', instruction:'Di la sílaba TA', hint:'Lengua toca detrás de los dientes' },
    { type:'say', level:2, sound:'te', word:'TE', instruction:'Di la sílaba TE', hint:'T + sonrisa' },
    { type:'say', level:2, sound:'to', word:'TO', instruction:'Di la sílaba TO', hint:'T + O redonda' },
    { type:'say', level:2, sound:'la', word:'LA', instruction:'Di la sílaba LA', hint:'Lengua arriba, suave' },
    { type:'say', level:2, sound:'le', word:'LE', instruction:'Di la sílaba LE', hint:'Suave, lengua arriba' },
    { type:'say', level:2, sound:'lo', word:'LO', instruction:'Di la sílaba LO', hint:'Lengua arriba + O' },
    { type:'say', level:2, sound:'na', word:'NA', instruction:'Di la sílaba NA', hint:'Nasal, suave' },
    { type:'say', level:2, sound:'ne', word:'NE', instruction:'Di la sílaba NE', hint:'Nasal + E' },
    { type:'say', level:2, sound:'no', word:'NO', instruction:'Di la sílaba NO', hint:'Nasal + O redonda' },
    { type:'say', level:2, sound:'sa', word:'SA', instruction:'Di la sílaba SA', hint:'S larga y suave' },
    { type:'say', level:2, sound:'se', word:'SE', instruction:'Di la sílaba SE', hint:'S + sonrisa' },
    { type:'say', level:2, sound:'so', word:'SO', instruction:'Di la sílaba SO', hint:'S + O' },
    // ─ L3 · parole 2 sillabe
    { type:'say', level:3, word:'Mamá',   instruction:'Di la palabra',  hint:'Mmm… mmá — dos veces' },
    { type:'say', level:3, word:'Papá',   instruction:'Di la palabra',  hint:'P fuerte las dos veces' },
    { type:'say', level:3, word:'Lola',   instruction:'Di la palabra',  hint:'Lengua arriba, dos veces' },
    { type:'say', level:3, word:'Casa',   instruction:'Di la palabra',  hint:'C suave + sa' },
    { type:'say', level:3, word:'Mesa',   instruction:'Di la palabra',  hint:'M + E + sa' },
    { type:'say', level:3, word:'Pato',   instruction:'Di la palabra',  hint:'Pa + to, claro' },
    { type:'say', level:3, word:'Luna',   instruction:'Di la palabra',  hint:'Lu + na, suave' },
    { type:'say', level:3, word:'Sopa',   instruction:'Di la palabra',  hint:'So + pa, lento' },
    // ─ L4 · parole complesse
    { type:'say', level:4, word:'Pájaro',      instruction:'Di esta palabra', hint:'Marca la P y la J' },
    { type:'say', level:4, word:'Mariposa',    instruction:'Di esta palabra', hint:'Suave, sílaba a sílaba' },
    { type:'say', level:4, word:'Carretera',   instruction:'Di esta palabra', hint:'La RR fuerte vibra' },
    { type:'say', level:4, word:'Ferrocarril', instruction:'Di esta palabra', hint:'Con RR al final' },
    // ─ L5 · frasi/trabalenguas
    { type:'say', level:5, word:'El perro de Roque no tiene rabo', instruction:'Di la frase', hint:'Trabalenguas clásico, con calma' },
    { type:'say', level:5, word:'Tres tristes tigres',             instruction:'Di la frase', hint:'Marca cada T' },
  ],
  fluidez: [
    // ─ L1
    { type:'say', level:1, sound:'a', word:'Aaa', instruction:'Sostén la A 3 segundos', hint:'Un soplo continuo, sin cortar' },
    { type:'say', level:1, sound:'o', word:'Ooo', instruction:'Sostén la O 3 segundos', hint:'Voz estable, no tiembles' },
    // ─ L2
    { type:'say', level:2, sound:'ma', word:'Ma-ma-ma',  instruction:'Repite MA 3 veces seguidas', hint:'Ritmo constante' },
    { type:'say', level:2, sound:'pa', word:'Pa-pa-pa',  instruction:'Repite PA 3 veces seguidas', hint:'Sin parar' },
    { type:'say', level:2, sound:'la', word:'La-la-la',  instruction:'Repite LA 3 veces seguidas', hint:'Suave y seguido' },
    // ─ L3
    { type:'say', level:3, word:'Uno dos tres',           instruction:'Cuenta del 1 al 3',        hint:'Todo seguido' },
    { type:'say', level:3, word:'Hola mamá',              instruction:'Frase corta en un respiro', hint:'Sin pausa en medio' },
    { type:'say', level:3, word:'Me gusta',               instruction:'Frase corta',               hint:'Dos palabras seguidas' },
    // ─ L4
    { type:'say', level:4, word:'Hoy hace un día precioso',       instruction:'Frase seguida, un respiro', hint:'Respira antes, suelta todo' },
    { type:'say', level:4, word:'Uno dos tres cuatro cinco',      instruction:'Cuenta hasta 5',            hint:'Ritmo uniforme' },
    { type:'say', level:4, word:'Me gusta el café por la mañana', instruction:'Frase seguida',             hint:'Sin pausas largas' },
    // ─ L5
    { type:'say', level:5, word:'La casa de mi abuela está junto al mar', instruction:'Frase larga, un respiro', hint:'Ancla la respiración' },
    { type:'say', level:5, word:'Lunes martes miércoles jueves viernes',  instruction:'Días laborables seguidos', hint:'No pares entre palabras' },
  ],
  voz: [
    // ─ L1
    { type:'say', level:1, sound:'a', word:'Aaa', instruction:'Sostén la A con voz suave',  hint:'Como un susurro' },
    { type:'say', level:1, sound:'a', word:'AAA', instruction:'Sostén la A con voz fuerte', hint:'Proyecta, no grites' },
    { type:'say', level:1, sound:'o', word:'Ooo', instruction:'Sostén la O',                hint:'Voz estable' },
    // ─ L2
    { type:'say', level:2, sound:'ma', word:'Ma',  instruction:'Di MA con voz suave',  hint:'Suave como un secreto' },
    { type:'say', level:2, sound:'ma', word:'MA',  instruction:'Di MA con voz fuerte', hint:'Proyecta la voz' },
    { type:'say', level:2, sound:'mm', word:'Mmm', instruction:'Sostén la M con boca cerrada', hint:'Nota la vibración en los labios' },
    // ─ L3
    { type:'say', level:3, word:'Hola', instruction:'Di HOLA con voz suave',  hint:'Como a alguien cerca' },
    { type:'say', level:3, word:'Hola', instruction:'Di HOLA con voz fuerte', hint:'Como llamando lejos' },
    // ─ L4
    { type:'say', level:4, word:'¿Cómo estás?', instruction:'Tono de pregunta real', hint:'Sube el tono al final' },
    { type:'say', level:4, word:'Estoy bien',   instruction:'Tono afirmativo firme', hint:'Baja el tono al final' },
    // ─ L5
    { type:'say', level:5, word:'Buenos días, ¿qué tal estás?', instruction:'Con entonación natural', hint:'Alegre y cálido' },
  ],
  comprension: [
    // ─ L1
    { type:'say', level:1, sound:'a', word:'A', instruction:'Repite lo que digo: A', hint:'Solo la vocal' },
    { type:'say', level:1, sound:'o', word:'O', instruction:'Repite lo que digo: O', hint:'Solo la vocal' },
    // ─ L2
    { type:'say', level:2, sound:'ma', word:'MA', instruction:'Repite: MA', hint:'Una sílaba' },
    { type:'say', level:2, sound:'la', word:'LA', instruction:'Repite: LA', hint:'Una sílaba' },
    // ─ L3
    { type:'list', level:3, word:'1 fruta',  instruction:'Nombra una fruta',  hint:'Ej: manzana', match:{ min:1 } },
    { type:'list', level:3, word:'1 color',  instruction:'Nombra un color',   hint:'El que quieras', match:{ min:1 } },
    { type:'list', level:3, word:'1 animal', instruction:'Nombra un animal',  hint:'El que prefieras', match:{ min:1 } },
    // ─ L4
    { type:'list', level:4, word:'3 frutas',            instruction:'Nombra 3 frutas',            hint:'Manzana, pera…',   match:{ min:3 } },
    { type:'list', level:4, word:'3 colores',           instruction:'Nombra 3 colores',           hint:'Los que quieras',  match:{ min:3 } },
    { type:'list', level:4, word:'3 animales',          instruction:'Nombra 3 animales',          hint:'Perro, gato…',     match:{ min:3 } },
    { type:'list', level:4, word:'3 prendas de ropa',   instruction:'Nombra 3 prendas',           hint:'Camisa, pantalón', match:{ min:3 } },
    { type:'list', level:4, word:'3 cosas de la cocina',instruction:'Nombra 3 objetos de cocina', hint:'Cuchara, plato',   match:{ min:3 } },
    // ─ L5
    { type:'list', level:5, word:'Días de la semana', instruction:'Di los 7 días',   hint:'De lunes a domingo', match:{ min:5 } },
    { type:'list', level:5, word:'5 frutas',          instruction:'Nombra 5 frutas', hint:'Tómate tu tiempo',   match:{ min:5 } },
  ]
};

const CATEGORY_META = {
  pronunciacion: { emoji:'🗣️', label:'Pronunciación', color:'#a21caf' },
  fluidez:       { emoji:'🌬️', label:'Fluidez',       color:'#4f46e5' },
  voz:           { emoji:'🎚️', label:'Voz',           color:'#b45309' },
  comprension:   { emoji:'🧩', label:'Comprensión',   color:'#047857' },
  sorriso:       { emoji:'😊', label:'Sfida del Sorriso', color:'#e11d48', special:'sorriso' },
  dialogo:       { emoji:'💬', label:'Diálogo Guidado',   color:'#0284c7', special:'dialogo' },
};

const SOUND_GROUPS = {
  vowel: ['a','e','i','o','u'],
  m:     ['ma','me','mi','mo','mu'],
  pt:    ['pa','pe','po','ta','te','to'],
  lns:   ['la','le','lo','na','ne','no','sa','se','so'],
};

const DEFAULT_SOUNDS = ['a','e','i','o','u'];
