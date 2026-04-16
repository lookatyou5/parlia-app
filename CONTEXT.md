# Parlia — Contesto progetto

Parlia è una PWA (app web progressiva) per comunicazione aumentativa (AAC) destinata a persone con difficoltà del linguaggio, sviluppata per Laura che è in riabilitazione neurologica al Institut Guttmann di Barcellona.

## URL
- App Parlia: https://app.parlia.app
- App Laura: https://laura.parlia.app
- Landing: https://parlia.app
- Cloudflare Pages progetto: parlia-app

## File principali
- `index.html` — router (manda sempre a onboarding.html)
- `onboarding.html` — onboarding a step con animazioni
- `home.html` — **orchestratore** del carosello Inicio/AAC/Rehab/Perfil (~600 righe dopo la modularizzazione)
- `home.backup.html` — snapshot pre-refactor di home.html, recuperabile in caso di necessità
- `inicio.css` · `aac.css` · `rehab.css` · `perfil.css` — stili specifici di ogni pagina della home
- `components/inicio.html` · `aac.html` · `rehab.html` · `perfil.html` — partial HTML di ogni pagina, caricati via fetch
- `profile.html` — **profilo unificato** (datos personales + memoria AI + funciones)
- `profileApp.js` — logica della pagina profilo (config-driven, modal unico)
- `userData.js` — data layer condiviso `parlia_user_data` con migrazione legacy
- `memoriaAI.html` — redirect a `profile.html` (mantiene compat con bookmark)
- `comunicador.html` — comunicador AAC standalone
- `logopedia.html` — **shell HTML** della pagina logopedia (140 righe, solo struttura + import)
- `logopedia.css` — stili della logopedia (330 righe)
- `logopedia-data.js` — **exercise bank** per livello + metadata categorie/suoni (131 righe — file da toccare per aggiungere/cambiare esercizi)
- `logopedia.js` — logica app: agente Ana, STT, semaforo, assessment, navigation (429 righe)
- `tutorial.html` — tutorial interattivo standalone con tour guidato
- `roadmap.html` — roadmap interna (accessibile da ⚙️ nella home)
- `manifest.json` — PWA manifest (start_url: /)
- `sw.js` — service worker (kill-cache, passa tutto alla rete)

## Architettura del carosello home (modulare)
`home.html` al caricamento:
1. Linka i 4 CSS per sezione (`<link rel="stylesheet" href="inicio.css">` ecc.)
2. Lascia i 4 `<div class="page" id="pageN">` **vuoti**
3. All'inizio del `<script>` principale esegue un **bootstrap** che fa `Promise.all` su `fetch('components/*.html')` e inietta i partial nei rispettivi div
4. Solo dopo due `requestAnimationFrame` (layout+paint completi) chiama `runApp()` — la funzione che racchiude tutta la logica dell'app

Tutte le funzioni richiamate da `onclick="…"` negli HTML (goTo, toast, openSOS, openReminderModal, replayLast, selCat, ecc.) sono esposte a `window` alla fine di `runApp()` con un `Object.assign(window, {…})`.

## Carosello swipe (scroll-snap nativo)
Dopo vari tentativi di implementazione custom con `transform/translateX`, abbiamo riscritto il carosello usando **CSS scroll-snap nativo** (stesso modello di `profile.html`):
```css
.pages-wrap {
  position: fixed; left: 0; right: 0;
  overflow-x: auto; overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  overscroll-behavior-x: contain;
}
.page { width: 100vw; scroll-snap-align: start; scroll-snap-stop: always; }
```
Il browser gestisce: drag del dito, inerzia, snap-to-page, allineamento. JS solo per:
- `goTo(idx)` → `wrap.scrollTo({left: idx*width, behavior:'smooth'})`
- Scroll listener con rAF → aggiorna `curPage` + nav attivi quando l'utente fa swipe
- Flag `_programmaticScroll` per evitare che il listener reagisca durante smooth-scroll di `goTo`

## Back gesture (modello lineare, 2 stati)
Regola semplice: la `history` della home contiene **al massimo 2 voci** — `{page:0}` e, se si è fuori da Inicio, `{page:currentIdx}`.
- Al load: `history.replaceState({page:0}, '')`
- `goTo(idx)` + swipe listener chiamano `_syncNavAndHistory(idx)`:
  - Torna a Inicio (idx=0) → `replaceState({page:0})`
  - Lascia Inicio per la prima volta → `pushState({page:idx})`
  - Cambia tra sezioni non-Inicio → `replaceState({page:idx})`
- `popstate`:
  - Se `curPage > 0` → `goTo(0, true)` (fromBack=true, non modifica history)
  - Se `curPage === 0` → browser default (chiude l'app)

Risultato: da AAC/Rehab/Perfil **un solo back porta a Inicio**, da Inicio un solo back chiude l'app. Nessuna cronologia infinita, nessun loop.

## Pull-to-refresh (soft refresh PWA)
Trascinare giù su Inicio **non ricarica la pagina**. Esegue invece in sequenza: `buildAgenda()` → `loadMeteo()` → `loadGoal()` → `_sendMsg(null)` (saluto AI) → `loadAISuggestions()`. La pagina resta sempre visibile, niente flash bianco, effetto nativo PWA.

## Profilo unificato (parlia_user_data)
Schema centralizzato in localStorage, gestito da `userData.js`:
```
{
  personal:  { userName, gender, age, condicion[], movilidad, caregiverName, caregiver2Name },
  memory:    { hobbies[], musica, comida, interests[], family[], profession, birthplace, notas },
  functions: { aac, chat, logo, neuro, gps, mood },
  stats:     { opens, last_open, favorite_hours[], last_mood, last_mood_date }
}
```
- Al primo load migra automaticamente da `parlia_profile`, `parlia_profile_extra`, `parlia_memory`
- `ParliaUser.save()` mantiene le chiavi legacy sincronizzate (backward compat con codice esistente di home.html)
- `profile.html` edita ogni campo tramite **modal unico** (text / textarea / chip single / chip multi / lista CSV)
- `home.html` legge `_ud = ParliaUser.get()` e costruisce il system prompt AI includendo: edad, condición, hobbies, música, comida, intereses, familia, profesión, lugar de origen, tono/preferencias — tutto con sync immediato appena si salva nel profilo.
- La sezione "Memoria e intereses" in profile.html ha una **hero viola/rosa** con gradient distintivo ("💙 EL CORAZÓN DE PARLIA AI · Cuéntale a Parlia quién eres") e mini-barra di completamento dedicata; hero e lista campi formano un unico blocco visivo.

## Tab Perfil nella home (page3)
Vista read-only come dashboard:
- Avatar + nome + "Institut Guttmann · Barcelona"
- Barra "Perfil completado" (calcolo condiviso con `ParliaUser.count()`)
- Card riassuntiva **non cliccabile** (Datos personales · Condición · Cuidador · Memoria AI (N/8 campos) · Funciones activas)
- Un unico bottone CTA in gradient blu: **"✏️ Editar mi perfil · Datos personales + memoria AI"** → apre `profile.html`
- Link 🎓 Tutorial de la app (separato, apre `tutorial.html`)

## Tech stack
- HTML/CSS/JS puro, niente framework
- Cloudflare Pages per il deploy (zip diretto)
- Proxy AI: voci-ai-proxy.luca-peltrini.workers.dev → Anthropic Claude Haiku
- Font: Bricolage Grotesque + Plus Jakarta Sans
- Tema chiaro, colori blu/indigo, --bg: #f5f6fa
- UI in spagnolo

## Home (home.html)
- 4 pagine a swipe: Inicio / AAC / Rehab / **Perfil** (non più "Yo")
- Tab "Perfil" in navbar → va direttamente a profile.html (non mostra page3 interna)
- AI chat context-aware con TTS
- Agenda con sessioni feriali + promemoria personali
- Meteo Open-Meteo con scene animate (sole, pioggia, neve ecc.)
- Obiettivo del giorno generato da AI
- Modalità notte 23:00-6:00
- Pull-to-refresh
- Meteo pill in topbar con popup
- Settings ⚙️ con link a roadmap e profilo
- Copyright © 2026 Parlia.app — dentro la navbar come ultima riga (position: absolute; bottom: 3px)
- **Tutorial widget** (card viola compatta "Descubre Parlia.app" in cima a page0):
  - Link a `tutorial.html` (pagina standalone)
  - Nascondibile: checkbox "No mostrar más el tutorial" in tutorial.html salva `parlia_hide_tutorial_widget` in localStorage → il widget sparisce dalla home
  - Tutorial accessibile anche da: menu ⚙️ (settings) e sezione Perfil (riga 🎓 prima di "Editar perfil")

## AAC (comunicador nella home + comunicador.html standalone)
- 6 categorie: Necesidades, Emociones, Social, Actividades, Lugares, Urgencias
- Subcategorie per ogni categoria
- Suggerimenti AI per ogni subcategoria
- Frasi con emoji colorata per categoria
- Hero frase con TTS e selezione persistente

## Deploy
- Zip tutti i file flat (no cartelle) → carica su Cloudflare Pages → progetto parlia-app
- Dopo deploy: app disponibile su app.parlia.app

## Landing page
- File: index.html su progetto parlia-landing
- URL: parlia.app
- Waitlist Formspree: mwvwgwqv
- In spagnolo, tema chiaro

## App Laura (separata)
- URL: laura.parlia.app
- Cloudflare Pages progetto: aaclaura
- Firebase: aaclaura-c0612
- Ha chat con Luca, GPS, push notifications FCM
- Non toccare questo progetto quando lavori su Parlia

## Interazioni e Gesti
- **Swipe orizzontale**: Naviga tra le 4 pagine della home (Inicio/AAC/Rehab/Yo)
  - Swipe destra dalla home → torna all'onboarding con history.back()
  - Touchstart/touchmove/touchend listeners in home.html
- **Back button (Android/iOS)**: Funziona come swipe
  - Browser history.pushState() per ogni goTo() navigation
  - Popstate listener legge lo stato e naviga di conseguenza
  - Logica: goTo() aggiunge stato → popstate legge stato → naviga indietro
  - Da Home back → onboarding, da altre pagine back → pagina precedente (con possibile salto)

## Deploy (GitHub + Cloudflare Pages)
- Repository GitHub: https://github.com/lookatyou5/parlia-app
- Cloudflare Pages progetto: parlia-app (connesso a GitHub)
- Auto-deploy: ogni `git push` deploya automaticamente
- Comando deploy: `git push` (nient'altro necessario!)
- Dominio: app.parlia.app (CNAME configurato)

## Home (home.html) — layout attuale della pagina Inicio
Ordine dei blocchi (dall'alto):
1. **Widget Tutorial** (viola) — link a `tutorial.html`
2. **Widget Meteo** — card full-width con gradient cielo dinamico (sunny/rainy/cloudy/night/ecc.), temp grande, descrizione + località, tap → apre popup meteo centrato con scena animata
3. **Parlia AI Core (orbital)** — card centrale animata:
   - Orb avatar pulsante con barre audio animate
   - Session pill "AHORA · X" (se c'è sessione in corso) / "PRÓXIMO · X · HH:MM" / "DESPUÉS · X · HH:MM"; nascosta se dayOver
   - Mode toggle 💬 / ✏️ + TTS 🔇 + ✕ end-chat
   - Chat thread (ultime bolle AI + user)
   - Chips di risposta (mode 💬) o input testo (mode ✏️)
   - Agenda integrata sotto il divider "📅 Tu día" — card glass semi-trasparenti scrollabili, AHORA con glow verde smeraldo pulsante, chip "+ Recordatorio" in coda. A fine giornata: card celebrativa "🎉 ¡Todas las sesiones completadas!"
4. **Profile card** — link a `profile.html`

## Parlia AI — modalità e comportamento
Due modalità utente (salvate in `parlia_user_data.functions.aiMode`):
- **💬 chips (default)**: il modello genera `CHIPS: a|b|c|d` per tap rapido
- **✏️ texto**: input libero, risposte testuali
Switch texto→chips su una risposta AI non ancora risposta → rigenera i chips on-demand (chiamata API dedicata).

Bottone **✕ end chat**: svuota history + thread, ferma TTS, mostra placeholder "Conversación pausada" con "Saludar de nuevo" → evita loop buonanotte.

### System prompt context-aware
Il prompt inviato a Claude Haiku 4.5 include:
- **CONTEXTO AHORA**: giorno della settimana, fase della giornata (mañana/mediodía/tarde/noche), weekend sì/no, ora esatta, meteo corrente, sessione in corso/prossima/recentemente terminata, `dayOver` (dopo 16:00)
- **CONOCIMIENTO PERSONAL**: edad, condición, hobbies, música, comida, intereses, familia, profesión, origen, tono preferito, ultimo mood, numero aperture
- **Reglas di awareness** (intreccia almeno 1 elemento reale, adatta tono al meteo/ora, varia temi)
- **Longitud**: max 18 parole, per lo più 4-12 (WhatsApp-style), non sempre termina con domanda
- **Format**: in mode chips richiede `CHIPS:` al fondo; in mode texto vieta il format CHIPS

`max_tokens: 90` hard cap API.

## Agenda
Sessioni feriali (lun-ven) 10:00 → 16:00 con copertura continua, definite in `SESSIONS` (home.html). L'array `_sessions` dell'AI hero è derivato da `SESSIONS` per coerenza.

Calendario:
| Orario | Sessione |
|---|---|
| 10:00-11:00 | 🏋️ Fisioterapia |
| 11:15-12:00 | 🖐️ Terapia ocupacional |
| 12:15-13:00 | 🎤 Logopedia |
| 13:00-14:00 | 🥗 Almuerzo |
| 14:15-15:15 | 🚴 Bicicleta estática |
| 15:30-16:00 | 🧩 Estimulación |

Dopo le 16:00 (`dayOver`): session pill nascosta + agenda-done-card nella Tu día + system prompt istruisce Parlia AI a non menzionare orari.

## Rehab (page 2)
- Titolo "Rehabilitación · Tus herramientas de terapia"
- 🎯 **Objetivo de hoy** (card gialla — focus della pagina, AI-generated via `loadGoal()`)
- 🗣️ **Logopedia** → apre `logopedia.html` (safety-net JS in `home.html` forza `location.href` anche se il partial rehab.html è cached)
- 🧠 Estimulación · 📊 Mis progresos (card cliccabili, ancora toast)
- 📅 Próxima sesión

## Navbar — pill solida
- Posizione: fixed bottom, centrata
- Sfondo bianco pieno (`#ffffff`), border grigio, border-radius 28px
- **Niente backdrop-filter** (rimosso per zero costo GPU durante swipe)
- Item attivo: gradient blu→viola con shadow colorata
- Copyright `© 2026 Parlia.app` sotto come testo fisso

## Performance swipe tra pagine
- `scroll-snap-type: x mandatory` + scroll nativo (niente smooth CSS, solo momentum)
- `contain: layout paint style` + `translateZ(0)` su ogni `.page`
- `body.is-scrolling` attivato durante scroll + 180ms dopo ultimo evento
- Durante scroll vengono: messe in pausa TUTTE le animazioni decorative, nascosti (opacity 0) mesh blob + halo AI core + orbit rings + grid pattern, rimosso backdrop-filter residuo
- Ritorno con transition .25s fade morbido

## Meteo popup (centrato)
Tap sul widget meteo → overlay scuro (`rgba(10,15,40,.5)`) + blur 10px → card scura centrata verticalmente + orizzontalmente con entrata elastica `cubic-bezier(.34,1.56,.64,1)`. Close button ✕ in alto a destra + tap sul backdrop.

## SOS overlay
Tap sul 🆘 in topbar → overlay scuro (niente backdrop-filter — causava flash nero su Chrome Android) → card bottom sheet con 5 frasi SOS (`speakSOS()`).

## Sessione 16 aprile 2026 — Logopedia: polish + modularizzazione
- **Ana reagisce subito** dopo il risultato (semaforo), non solo al click "Siguiente"
- **Saluto non ripetitivo**: primo ingresso → presentazione completa; ritorno da categoria → frase breve variata ("¿Qué más practicamos?")
- **Animazioni subtle**: blob drift, hero float, card stagger, online dot pulse, profile-bar slide-in
- **Modularizzazione**: file monolitico 1256 righe → 4 file:
  - `logopedia.html` (140) — solo HTML shell
  - `logopedia.css` (330) — stili
  - `logopedia-data.js` (131) — exercise bank (il file da toccare per aggiungere esercizi)
  - `logopedia.js` (429) — logica app
- **Cache-bust** su tutti i link (`?v=20260416b`) + meta no-cache su logopedia.html

## Sessione 15 aprile 2026 (sera) — Logopedia IA personalizzata
Creata la pagina **`logopedia.html`** standalone (file unico autocontenuto, HTML+CSS+JS inline ~1200 righe).

### Agente IA "Ana"
- Avatar 🎙️ con alone pulsante, nome "Ana · logopeda IA", stato dinamico, online dot verde
- Bolla testo con **typing effect** (22ms/char) + **TTS** in spagnolo (voce Lucía se disponibile)
- `sayAgent(text)` annulla typing precedente + `speechSynthesis.cancel()` prima di partire → niente typer sovrapposti (causa "scatti" iniziali, poi risolto)
- Toggle 🔊/🔇 per disabilitare voce

### Flusso
1. **Welcome screen**: profile bar (nivel + sonidos) + 4 card categoria + bottone ⚙️ "Ajustar"
2. **Assessment screen** (aperto automaticamente al primo ingresso, o on-demand):
   - Scelta livello 1→5 con descrizione
   - Se L1/L2: griglia chip selezionabili (vocali + sillabe M, P/T, L/N/S) → caregiver marca solo quello che l'utente sa dire
3. **Exercise screen**: progress dots · instruction · word grande · hint · semaforo · mic · repetir/siguiente
4. **Complete screen**: stats (ejercicios/acertadas/precisión) + "Otra categoría" / "Repetir"

### Profilo logopedico (`parlia_logo_profile` in localStorage)
```js
{
  level: 2,                                          // 1..5
  sounds: ['a','e','o','ma','na','la','lo'],         // suoni che sa dire
  assessed: true
}
```
**Default**: L3 + tutte le 5 vocali. **Caso Laura**: L2 con solo A/E/O + MA/NA/LA/LO → le verranno proposti SOLO esercizi con questi suoni.

### Exercise bank per livelli (4 categorie)
Ogni esercizio ha `{ type, level, sound?, word, instruction, hint, match? }`.

| Livello | Pronunciación | Fluidez | Voz | Comprensión |
|---|---|---|---|---|
| **L1** | Vocali A/E/I/O/U | Sostieni A/O 3s | Sostieni vocali suave/fuerte | Ripeti una vocale |
| **L2** | Sillabe MA/PA/TA/LA/NA/SA + E/O | Sillaba ripetuta 3× (Ma-ma-ma) | Sillaba con volume | Ripeti sillaba |
| **L3** | Parole 2 sil (Mamá, Casa, Pato) | Contare 1-3, frasi corte | Parole con tono | Nominare 1 oggetto |
| **L4** | Pájaro, Mariposa, Carretera | Frasi medie, contare 1-5 | Entonación (pregunta/afirmación) | Nominare 3 (frutas, colores, animales) |
| **L5** | Trabalenguas (El perro de Roque…) | Frasi lunghe seguite | Frasi lunghe con tono | Días semana, 5 frutas |

### pickExercises(cat) — selezione adattiva
```js
// 1. Filtra: skip ex con level > userLevel + 1; skip L1/L2 con sound non in state.logo.sounds
// 2. Mix: 3 al livello corrente + 1 più facile + 1 di sfida (livello+1)
// 3. Fallback: se pool vuoto (profilo troppo restrittivo) → bank completo
```

### Semaforo + valutazione
- `say` type: similarity (Levenshtein) con norm (lowercase + strip accenti + strip puntuazione)
  - ≥ 82% → verde
  - ≥ 55% → giallo
  - < 55% → rosso
- `list` type: `countDistinctWords(heard)` vs `match.min` (ignora stopwords)

### Riconoscimento vocale
- `webkitSpeechRecognition` (es-ES), `maxAlternatives: 3`
- Fallback se il browser non supporta: notice giallo + pulsante skip
- Aborta su `chooseCategory`/`backToCategories` per evitare conflitti

### Stats persistite
`parlia_logo_log` in localStorage: array delle ultime 100 sessioni `{ date, category, done, green, yellow, score }`.

### Fix integrazione con Rehab
- `components/rehab.html`: la card Logopedia ora ha `onclick="location.href='logopedia.html'"` (era un toast)
- **Safety-net JS** in `home.html` (dopo l'inject dei partial): ricerca `.rehab-card` con `.rehab-name` "Logopedia" e forza `location.href` → funziona anche se il partial arriva da cache
- Bumpata cache-bust partial `V = '20260415a'`

### Bugfix durante la sessione
- Flicker cambio categoria: tolti `setTimeout` 600ms/300ms → render esercizio immediato, Ana parla in parallelo
- Scatti typing: clearInterval del typer precedente in `sayAgent`
- Scroll jank: `window.scrollTo(0,0)` istantaneo (era smooth)

---

## Sessione 15 aprile 2026 — Parlia AI aware + mode A/C + agenda 10-16
- **Home Inicio ristrutturata**: AI Core come orbita fluttuante con agenda fusa dentro (divider "Tu día" + glass cards). Objetivo spostato in Rehab.
- **Meteo widget** sotto il tutorial in cima a Inicio (rimossa la pillola in topbar). Click apre popup centrato blurred.
- **Navbar** passata da glass a pill solida bianca (zero backdrop-filter per swipe fluido).
- **Parlia AI context-aware**: system prompt con CONTEXTO + CONOCIMIENTO PERSONAL strutturati, awareness meteo/ora/memoria, regole longitud strict (4-18 parole, stile WhatsApp), max_tokens 90.
- **Mode selector 💬/✏️**: chips vs texto libero, salvato in `parlia_user_data.functions.aiMode`, regenerazione chips on-demand al switch.
- **Bottone ✕ end chat**: placeholder "Conversación pausada" con CTA "Saludar de nuevo" → ferma loop infiniti tipo buonanotte.
- **Agenda ricostruita 10-16** con 6 sessioni continue. Unificato `_sessions` con `SESSIONS`.
- **AHORA card** con glow verde smeraldo pulsante (prima giallo) + testo scuro leggibile.
- **dayOver**: dopo 16:00 mostra card celebrativa "¡Todas las sesiones completadas!" dentro Tu día; session pill in alto nascosta per non duplicare.
- **Performance swipe**: GPU layers + contain + aggressive hide di mesh/glow/rings durante scroll.
- **SOS overlay**: rimosso backdrop-filter (causava flash nero).
- **Tutorial**: widget Perfil preview aggiornato (rimosso hero memoria secondaria, focus su editing profilo).

## Sessione 14 aprile 2026 — Modularizzazione + back gesture + PWA
- **Modularizzazione home.html**: estratto HTML e CSS di ogni pagina del carosello in file separati.
  - 4 partial: `components/{inicio,aac,rehab,perfil}.html`
  - 4 CSS: `{inicio,aac,rehab,perfil}.css` (link nel head di home.html)
  - Bootstrap con `Promise.all(fetch...)` + doppio `requestAnimationFrame` prima di `runApp()`, così il carosello scroll-snap parte su un layout stabile.
  - `home.html` è passato da 2423 a ~600 righe.
  - Funzioni chiamate via `onclick=` nell'HTML esposte a `window` a fine `runApp()` (altrimenti locali alla funzione).
  - Backup in `home.backup.html` + commit `b4eab7d`.
- **Riscritto il carosello con scroll-snap nativo** (come profile.html): eliminati tutti i bug di allineamento/sfasatura che si avevano con `transform: translateX` custom.
- **Back gesture rifatta 3 volte** fino al modello finale: cronologia lineare con max 2 voci (`{page:0}` + `{page:currentIdx}`). Back da qualsiasi sezione → Inicio. Back da Inicio → chiude app. Nessun loop, nessun stato spurio.
- **Pull-to-refresh = soft refresh**: invece di `window.location.reload()` (che con i partial fa flash bianco), rinfrescamo solo i dati dinamici in-place (agenda, meteo, obiettivo, saluto AI, suggerimenti AAC). Effetto PWA nativo.
- **Profilo unificato**: `profile.html` + `profileApp.js` + `userData.js`. Schema unico `parlia_user_data` con migrazione automatica da `parlia_profile`/`parlia_profile_extra`/`parlia_memory`. Un solo modal per editare ogni campo (text/textarea/chip single/chip multi/lista CSV). `memoriaAI.html` convertito in redirect.
- **Tab Perfil nella home**: trasformata in dashboard read-only con un unico CTA "Editar mi perfil".
- **Sezione Memoria e intereses nel profile**: card hero viola→rosa "Cuéntale a Parlia quién eres" con mini-barra di completamento dedicata; hero + lista campi uniti in un unico blocco visivo.
- **Tutorial aggiornato**: il passo 4 ora mostra una preview della hero Memoria AI + CTA di editing del profilo.

## Sessione 12 aprile 2026 (mattina)
- Aggiunto tutorial interattivo con spotlight su elementi UI reali
- Tab "Yo" rinominata "Perfil", click → va a profile.html
- Copyright spostato dentro la navbar (bottom: 3px, absolute)
- Nav-h aumentata da 72px a 80px per far vedere il copyright
- Profile.html: aggiunte sezioni profilo arricchite (hobby, interessi, famiglia, info personali)
- Deploy via GitHub → Cloudflare Pages (auto-deploy su push a main)

## Sessione 13 aprile 2026
- Creato `tutorial.html` — tutorial standalone (non più walkthrough in-home)
  - Spotlight iniziale su bottone "Iniciar tour guiado" con tutto il resto offuscato
  - Tour guidato 4 passi: Parlia AI → Agenda → Rehabilitación → Perfil
  - Widget reali copiati dalla home (rehab con 3 card, perfil con avatar+righe)
  - Scroll intelligente: centra widget piccoli, mostra top per widget grandi
  - Animazioni: agenda auto-swipe (1.5s), rehab cards highlight sequenziale (1s), perfil rows highlight sequenziale (1s), AAC pictograms flash (2 giri a 300ms poi stop)
  - Animazioni si fermano durante il tour per performance
  - Fine tour → scroll a "Prueba el comunicador" con flash AAC
  - Checkbox "No mostrar más el tutorial" → nasconde widget nella home (localStorage `parlia_hide_tutorial_widget`)
  - "¡Listo! Ir a la App →" salva `parlia_tutorial_seen` e va a home.html
  - Navbar rimossa (non funzionale nel tutorial)
- Rimosso vecchio tutorial walkthrough in-home (CSS, JS, HTML overlay ~370 righe)
- Aggiunto widget tutorial compatto in cima a home page0
- Aggiunto link tutorial nel menu ⚙️ settings
- Aggiunto link tutorial nella sezione Perfil (prima di "Editar perfil")
- Branch di lavoro: main (le modifiche vengono mergeate su main e deployate)

## Sessione 12 aprile 2026 — pomeriggio
- Riordinati widget in home page0: AI Hero → Agenda → Obiettivo del giorno → Profile card → Tutorial banner
- Fix spotlight tutorial per il passo "Profilo":
  - Logica finale: aggiunge 200px paddingBottom temporaneo alla pagina per avere spazio di scroll
  - Calcola targetScroll per posizionare l'elemento APPENA SOPRA il pannello tutorial (20px margine)
  - Il pannello tutorial rimane SEMPRE in basso (rimosso wt-top logic)
  - rAF dopo lo scroll per misurare getBoundingClientRect() accurato
  - Cleanup del paddingBottom quando si cambia step o si chiude il tutorial
- Fix spotlight AI hero: funziona anche se page0 è scrollata (formula targetScroll gestisce scroll negativo → clamp a 0)
- Meteo popup redesign: floating card con backdrop-filter blur, border-radius 24px, posizionata sotto pill, testo gerarchico, "consiglio" meteo
- Canvas weather scene: nuvole volumetriche con 17 gradient radiali sovrapposti (bianco in alto, grigio-blu in basso), atmosfera realistica, glow solare, luna con globalCompositeOperation:'multiply', animazione ~12fps
- Tutti i fix commitati e pushati su main → auto-deploy Cloudflare

## Sessione 13 aprile 2026 — Tutorial premium
- Tutorial upgrade a esperienza premium e fluida:
  - **Spotlight persistente**: `wt-spotlight` non viene mai rimosso/ricreato; mostrato/nascosto via `opacity` + classe `.wt-spotlight-on`
  - **Estetica**: `border-radius: 24px`, overlay `rgba(10,15,40,0.75)` (blu scuro), `inset 0 0 20px rgba(0,0,0,.2)` per bordi morbidi
  - **Scroll sincronizzato**: predice posizione post-scroll (`predictedTop = elRect.top - deltaScroll`), imposta spotlight subito, avvia `pageEl.scrollTo({behavior:'smooth'})` contemporaneamente, fine-tune a 620ms
  - **navDelay adattivo**: 60ms se stessa pagina, 320ms se cambia pagina (attende transizione)
  - **Card animation**: ogni step triggera fade-in + slide-up 15px su `#wtCardInner` via `@keyframes wtCardStep` + classe `wt-step-anim` con reflow forzato
  - **Elemento centrato**: `desiredElemTop = pageTop + (visibleH - el.offsetHeight) / 2` (centro nell'area sopra card)
  - **catScroll**: spotlight copre l'intero contenitore `#catScroll` in page1

## Note tecniche spotlight tutorial
- `.wt-ov`: position fixed; inset 0; z-index 400
- `.wt-dark`: background `rgba(10,15,40,0.75)`; `.off` → opacity 0
- `.wt-spotlight`: opacity 0 default; `.wt-spotlight-on` → opacity 1; box-shadow 9999px + inset shadow
- Transizioni spotlight: top/left/width/height 0.5s cubic-bezier + opacity 0.35s
- Scroll formula: `elTopInContent = elRect.top - pageTop + pageEl.scrollTop`
- `desiredElemTop = pageTop + (window.innerHeight - wtCardH - el.offsetHeight) / 2`
- `targetScroll = Math.max(0, elTopInContent - (desiredElemTop - pageTop))`
- `deltaScroll = targetScroll - pageEl.scrollTop`; `predictedTop = elRect.top - deltaScroll`
- Padding 200px temporaneo su pageEl rimosso da `_wtCleanup()` (chiamato in `closeTutorial()` e all'inizio di `_wtRender()`)

## Istruzioni per Claude Code
- Prima di qualsiasi modifica, fai sempre un commit git con messaggio "backup pre-modifica"
- Dopo ogni sessione di lavoro, fai un commit con le modifiche fatte
- Non modificare mai laura.parlia.app o i file dell'app di Laura
- Deploy: basta `git push` - Cloudflare fa il resto automaticamente!
