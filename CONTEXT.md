# Parlia — Contesto progetto

Parlia è una PWA (app web progressiva) per comunicazione aumentativa (AAC) destinata a persone con difficoltà del linguaggio, sviluppata per Laura che è in riabilitazione neurologica al Institut Guttmann di Barcellona.

## 🚧 TODO — Prossimi lavori
> **Claude: leggi sempre questa sezione a inizio sessione e ricorda all'utente i punti aperti.**

- **Portare `tts.js` su cache IndexedDB (persistente)**. Oggi ha solo Map in memoria (60 frasi LRU), che si svuota a ogni chiusura PWA → al riavvio ogni frase paga una nuova call Google TTS. Applicando lo stesso pattern a 2 livelli di `laura-voice.js` (Map + IndexedDB `audio` store), le frasi ripetute restano istantanee anche dopo chiusura/riavvio del device → risparmio reale di chiamate API e più snappy sul primo uso di ogni sessione. ~30 min di lavoro. Priorità media — il free tier Google è generoso (1M char/mese) ma la fluidità migliora.
- **Setup worker in repo (`workers/voci-ai-proxy`, `workers/parlia-tts`, `workers/parlia-minimax`)** con `wrangler.toml`. Oggi i worker vivono solo sul dashboard Cloudflare → nessun version control, nessuna diff visibility. I secret (API key) restano su Cloudflare come env secrets. ~15 min setup, da fare quando serve la prossima modifica a un worker.
- **Supporto emozione nella voce di Laura (MiniMax)**. Passare il parametro `emotion` (happy/sad/tranquila/ecc.) in `laura-voice.js` + UI con chips preset. Richiede modifica del worker `parlia-minimax` per accettare e inoltrare il campo. ~30 min totali.
- **Voice cloning per altri utenti (in ottica futura)**. Flusso di onboarding voce → upload audio → worker `parlia-voice-clone` → `voice_id` MiniMax per-utente. Punto critico: flusso di consenso legale, non la tecnica. Vedi discussione sessione 18 aprile 2026.

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
- `vision.html` — **Visión Asistida** — pagina standalone con camera posteriore, OCR + riconoscimento oggetti via Google Cloud Vision, lettura automatica in Neural2-H
- `vision.css` · `vision.js` — stili palette teal/cyan + logica (capture → Worker → TTS/AI describe)
- `logopedia.html` — **shell HTML** della pagina logopedia (140 righe, solo struttura + import)
- `logopedia.css` — stili della logopedia (330 righe)
- `logopedia-data.js` — **exercise bank** per livello + metadata categorie/suoni (131 righe — file da toccare per aggiungere/cambiare esercizi)
- `logopedia.js` — logica app: agente Ana, STT, semaforo, assessment, navigation (429 righe)
- `tutorial.html` — tutorial interattivo standalone con tour guidato
- `roadmap.html` — roadmap interna (accessibile da ⚙️ nella home)
- `manifest.json` — PWA manifest (start_url: /)
- `sw.js` — service worker (kill-cache, passa tutto alla rete)
- `tts.js` — modulo TTS Google Neural2 (`window.speakNeural`/`stopNeural`) con cache, stop precedente, fallback Web Speech

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
- Proxy TTS: parlia-tts.luca-peltrini.workers.dev → Google Cloud Text-to-Speech (Neural2)
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

## Sessione 16 aprile 2026 (sera) — Google Cloud TTS Neural2
Sostituita la **Web Speech API** con **Google Cloud Text-to-Speech (Neural2)** per voce di alta qualità coerente su tutti i device. Confermato funzionante in produzione (`app.parlia.app`).

### Setup Google Cloud
- Progetto GCP con **Cloud Text-to-Speech API** abilitata
- API key creata e ristretta a SOLO Text-to-Speech (anche se trapelasse, danno limitato)
- Budget alert $5/mese per sicurezza
- Free tier: **1M caratteri Neural2/mese**, ricorrente — Parlia ne consuma ~100k (di fatto gratis)

### Cloudflare Worker `parlia-tts` (nuovo, separato da voci-ai-proxy)
- URL: `https://parlia-tts.luca-peltrini.workers.dev`
- Secret cifrato: `GOOGLE_TTS_KEY`
- CORS allowlist: `app.parlia.app`, `laura.parlia.app`, `parlia.app`, localhost
- Validazione: max 500 char, rate clamp 0.25-2.0
- Cache HTTP `public, max-age=86400` → frasi ripetute servite da edge cache 24h
- Default voice: `es-ES-Neural2-H` (femminile naturale), default rate `0.9`
- Worker separato da `voci-ai-proxy` per isolamento responsabilità + secret + log

### Modulo `tts.js` (nuovo file in repo)
Globali esposte: `window.speakNeural(text, opts?)` + `window.stopNeural()`.

Caratteristiche:
- **Cache LRU client** (max 60 frasi) → frasi AAC ripetute istantanee, zero round-trip
- **Token monotonico** → richieste obsolete scartate se nel frattempo arriva un altro speak
- **Stop precedente** automatico (pause Audio + cancel Web Speech residuo)
- **Timeout 6s** → oltre cade su fallback
- **Fallback Web Speech** automatico in caso di timeout/HTTP error/rete giù → app non resta mai muta (critico per AAC/SOS)
- **Pre-warm voci** Web Speech al load (per fallback istantaneo)
- **Auto-stop su `visibilitychange`** quando l'app va in background

### Punti d'uso (tutte le `speechSynthesis.speak()` sostituite)
- `home.html` → `speakSOS` (rate 0.85), `aacSpeak` (0.9), `_speak` AI hero (0.95), `toggleTTS`/`endAiChat` chiamano `stopNeural()`
- `comunicador.html` → `speak()` con `onend` callback per stato bottone
- `logopedia.js` → `speak()` chiamato da `sayAgent()`; tutti i `cancel` sostituiti con `stopNeural()`
- `tutorial.html` → `speak(el, text)` AAC demo con `onend` callback per reset UI
- Rimosso pre-warm voci Web Speech ridondante (già fatto in `tts.js`)

### Architettura finale
```
[Browser] --POST {text,voice?,rate?}--> [parlia-tts Worker] --+ GOOGLE_TTS_KEY--> [Google TTS API]
[Browser] <-- audio/mpeg blob ---------- [parlia-tts Worker] <-- MP3 base64 --------+
```

### Note operative
- Il `<script src="tts.js?v=...">` deve essere caricato PRIMA degli script che lo usano (subito dopo `userData.js` o equivalente)
- Per cambiare voce in futuro: `speakNeural(text, { voice: 'es-ES-Chirp3-HD-Despina' })` — l'infrastruttura è già pronta per mix Neural2 + Chirp3 senza modifiche al Worker
- `home.backup.html` NON aggiornato (snapshot pre-refactor, non in produzione)
- Deploy: push branch su `main` → Cloudflare Pages auto-deploya in ~1-2 min

---

## Sessione 16 aprile 2026 (sera, parte 2) — Reto de la Sonrisa: ricalibrazione formule MediaPipe
Round di fix dopo testing reale degli esercizi facciali. Le formule originali erano basate su euristiche non testate empiricamente; molte avevano falsi positivi (barra che si riempiva a riposo) o falsi negativi (espressione fatta correttamente ma non rilevata).

### Bug fix per esercizio (file `logopedia-sorriso.js`)

**KISS (Beso al aire)** — non riconosceva mai
- Vecchio: `1 - mW/fW` con soglia 0.7 → richiedeva di stringere la bocca quasi completamente perché i landmark 2D non vedono la protrusione 3D delle labbra
- Tentativo intermedio: somma pesata `narrow*0.6 + closed*0.4` → falso positivo a riposo (closed era sempre alto a labbra unite)
- Fix finale: **moltiplicazione (AND gate)** `narrow * closed` con soglia 0.45. Entrambi i segnali devono essere presenti contemporaneamente: bocca stretta (commissure 61↔291) E labbra serrate (sup/inf 13↔14)

**WINK L/R (Guiño izquierdo/derecho)** — funzionavano invertiti
- Causa: i landmark MediaPipe usano naming **anatomico** (dal punto di vista del viso), ma la camera mostra il viso a **specchio**. L'utente interpreta "ojo derecho" come il proprio occhio destro reale, ma le formule erano scambiate
- Fix: rinominate variabili `lEAR`/`rEAR` → `rightEAR`/`leftEAR` con commento esplicito; riassegnate `wink-l` e `wink-r` ai landmark anatomici corretti
- 33,133,159,145 = occhio DESTRO anatomico (= a sinistra dello schermo specchio)
- 362,263,386,374 = occhio SINISTRO anatomico (= a destra dello schermo specchio)

**NOSE (Arruga la nariz)** — non rilevava lo scrunch
- Vecchio: `1 - (lipToNose / fH * 8)` dipendeva da `fH` (altezza viso intera), che varia con la distanza dalla camera → sensibile al setup
- Fix: `1 - (lipToTip / noseToChin) * 2.0` con soglia 0.22. Confronto interno al volto (entrambe distanze interne, scala identica) indipendente da camera/distanza

**CHEEKS (Infla las mejillas)** — non rilevava il gonfiore (formula vecchia), poi triggerava a riposo (primo fix)
- Vecchio: `fW/noseW` con tempie 234/454 — le tempie NON si muovono col gonfiore
- Tentativo intermedio: `cheekW(138↔367) / tempW(234↔454)` → partiva da ~0.85 a riposo, troppo vicino alla soglia
- Fix finale: **`cheekW / mouthW`** con soglia 2.95. Quando si gonfiano le guance: cheekW AUMENTA E mouthW DIMINUISCE (labbra serrate per trattenere l'aria) → ratio cresce in modo molto più marcato del singolo segnale

**BROWS (Sube las cejas)** — triggerava a riposo
- Causa: soglia 0.18 troppo bassa per visi con sopracciglia naturalmente alte
- Fix: alzata a 0.24 (formula `(browL+browR)/fH` invariata)

### Soglie attuali finali
```js
{
  smile: 0.42,  cheeks: 2.95, open: 0.07,  kiss: 0.45,
  'wink-l': 0.35, 'wink-r': 0.35, 'lips-o': 0.55, surprise: 0.35,
  teeth: 0.4, brows: 0.24, nose: 0.22, tongue: 0.35,
}
```

### Lezioni imparate
- I landmark MediaPipe sono **anatomici**, non screen-relative → attenzione con camera a specchio
- Per espressioni che combinano più segnali, **moltiplicazione (AND)** è più robusta della somma pesata: evita che un singolo segnale "gratis" alzi lo score
- Riferimenti **interni al volto** (es. `noseToChin`) sono molto più stabili di riferimenti che includono dimensioni assolute (es. `fH` intera) perché invarianti alla distanza dalla camera
- Le soglie vanno tarate con **testing reale**: ogni viso ha proporzioni diverse e le euristiche basate solo su MediaPipe docs spesso sbagliano

### Cache-bust durante la sessione: v20260416d → e → f → g → h

---

## Sessione 16 aprile 2026 — Logopedia: polish + modularizzazione + nuove categorie + MediaPipe
- **Ana reagisce subito** dopo il risultato (semaforo), non solo al click "Siguiente"
- **Saluto non ripetitivo**: primo ingresso → presentazione completa; ritorno da categoria → frase breve variata ("¿Qué más practicamos?")
- **Animazioni subtle**: blob drift, hero float, card stagger, online dot pulse, profile-bar slide-in
- **Glassmorphism** su tutta la pagina: exercise card, semaforo (glass pill), bottoni, profile bar, topbar, cat-cards, complete card — stile adulto/elegante, non clinico
- **Redesign Ana hero**: stile orbitale (orbit rings rotanti con dot, grid animata, flare, glass-blur bubble)
- **Redesign card categorie**: da griglia 2x2 a lista verticale full-width con icona+body+freccia + barra gradient accent a sinistra
- **Back button**: usa `history.back()` → torna a Rehab, non a Inicio
- **Rimossa categoria Comprensión** (esercizi duplicavano le altre categorie)
- **Modularizzazione**: file monolitico 1256 righe → 6 file:
  - `logopedia.html` (~160) — HTML shell
  - `logopedia.css` (~380) — stili + glassmorphism
  - `logopedia-data.js` (~100) — exercise bank pronunciación/fluidez/voz
  - `logopedia.js` (~430) — logica app (Ana, STT, assessment, navigation)
  - `logopedia-sorriso.js` (~470) — Sfida del Sorriso con MediaPipe
  - `logopedia-dialogo.js` (~165) — Diálogo Guidado con STT

### Sfida del Sorriso — MediaPipe FaceLandmarker
- **Camera frontale** come specchio digitale + rilevamento espressioni reale
- **MediaPipe FaceLandmarker** caricato dinamicamente via CJS shim (`vision_bundle.mjs` da jsDelivr CDN)
- Usa **478 face landmarks** (non blendshapes — il modello .task non li include) con calcolo distanze:
  - smile: mouth width / face width
  - mouth open: lip distance / face height
  - kiss/pucker: 1 - mouth width ratio
  - wink L/R: eye aspect ratio comparison (gradiente, non binario)
  - lips O: mouth height / width ratio
  - cheeks puff: face width / nose width
  - surprise: eyes wide + mouth open
  - teeth: mouth wide + lips apart
  - brows: brow-to-eye distance / face height
  - nose scrunch: lip-to-nose distance decrease
  - tongue: jaw open + chin extension
- **12 esercizi** in 3 livelli di difficoltà:
  - Diff 1 (básico): sorriso, boca grande, beso, labios O
  - Diff 2 (intermedio): guance gonfie, sorpresa, denti, sopracciglia
  - Diff 3 (avanzado): guiño L/R, naso arricciato, lingua
- **Difficoltà progressiva**: 3 esercizi per round, se ≥2/3 superati → Ana propone il livello successivo
- **Hold time adattivo** al profilo: L1-2→1s, L3→2s, L4-5→3s
- **Hold meter**: barra si riempie solo quando l'espressione è rilevata, decay lento (0.03) se persa brevemente
- **Timeout 15s**: se non rilevato → "Repetir" / conferma manuale (fallback)
- **Power-down completo** (`sorrisoPowerDown()`): camera stop + `FaceLandmarker.close()` (libera GPU/WASM)
  - Attivato su: exit, complete, `visibilitychange` (background), `pagehide`, `beforeunload`
  - Re-init lazy alla prossima sessione

### Diálogo Guidado
- 12 domande conversazionali ("¿Qué has desayunado?", "¿Color favorito?", ecc.)
- Utente risponde a voce (STT), AI premia lo **sforzo** non la precisione
- Qualsiasi risposta ≥1 parola = successo, nessun semaforo rosso

### Categorie attuali (5)
1. 🗣️ Pronunciación (STT + similarity Levenshtein)
2. 🌬️ Fluidez (STT)
3. 🎚️ Voz (STT)
4. 😊 Reto de la Sonrisa (camera + MediaPipe landmarks)
5. 💬 Diálogo Guiado (STT + valutazione sforzo)

### Head Pointer — navigazione con il naso (home.html)
File: `headpointer.js` + `headpointer.css` — test di navigazione hands-free sulla home.

- **Bottone 👁️** fisso bottom-right per attivare/disattivare
- **Camera nascosta** (160x120, frontale) + MediaPipe FaceLandmarker per tracciare il naso (landmark 1)
- **Cursore rosso** (#ff3b30, bordo bianco) segue il naso — alto contrasto su qualsiasi sfondo dell'app
- **Auto-calibrazione**: alla attivazione, posizione naso = centro schermo
- **Gain 5.5×**: movimenti minimi della testa → grandi spostamenti cursore (meno stress al collo)
- **Lerp 0.2** per fluidità, **rendering a 60fps** (solo CSS, costo zero), **detection a 15fps**
- **Dwell Click (1.5s)**: fermo su elemento cliccabile → anello rosso si riempie a 360° (conic-gradient `--dwell`) → click() + suono pop (Web Audio 880→440Hz) + vibrazione
  - Elementi riconosciuti: `[onclick], a, button, .nav-item, .ai-chip, .rehab-card, .cat-card, .agenda-card`
- **Head Swipe**: zone bordo schermo (12% larghezza), 1s di permanenza → `goTo(curPage ± 1)`
  - Frecce ‹ / › come indicatore visivo
  - `curPage` esposto via `Object.defineProperty` (getter live dalla closure di `runApp()`)
- **Zona di Riposo**: top 15% schermo → dwell timer in pausa, cursore grigio
- **Power-down**: camera + FaceLandmarker chiusi su disattivazione / `visibilitychange` / `pagehide`
- **i18n**: tutti i testi visibili in spagnolo (nomi variabili interni restano in italiano/inglese)

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

## TTS — Google Cloud Text-to-Speech (Neural2)
Sostituita la Web Speech API con Google TTS Neural2 per voce di alta qualità coerente su tutti i device.

### Architettura
```
[Browser Parlia] --POST {text,voice?,rate?}--> [parlia-tts Worker] --+ GOOGLE_TTS_KEY--> [Google TTS API]
                                                                                                   |
[Browser] <-- audio/mpeg blob ---------------- [parlia-tts Worker] <-- MP3 base64 ----------------+
```

### Cloudflare Worker `parlia-tts`
- URL: `https://parlia-tts.luca-peltrini.workers.dev`
- Secret: `GOOGLE_TTS_KEY` (env var cifrata, mai nel codice)
- CORS allowlist: `app.parlia.app`, `laura.parlia.app`, `parlia.app`, localhost
- Validazione: text required, max 500 char, rate clamp 0.25-2.0
- Cache header: `public, max-age=86400` (Cloudflare cachea per 24h le frasi ripetute)
- Default voice: `es-ES-Neural2-H` (femminile), default rate `0.9`
- Errori: ritorna JSON `{error, detail?}` con codice HTTP appropriato

### Modulo client `tts.js`
Espone due funzioni globali:
- `window.speakNeural(text, { voice?, rate?, onend? })` — riproduce audio
- `window.stopNeural()` — ferma audio corrente + invalida richieste in corso

Caratteristiche:
- **Cache LRU** (max 60 frasi) con `Map` + `URL.createObjectURL` → frasi AAC ripetute partono istantanee, zero costo Google
- **Token monotonico** (`_currentToken`) → richieste obsolete non riproducono se nel frattempo è arrivato un altro `speakNeural()`
- **Stop precedente** automatico: pause + cancel Web Speech residuo
- **Fallback Web Speech** in caso di: timeout (6s), HTTP error, rete giù → usa `SpeechSynthesisUtterance` con voce Lucía/es-ES (l'app NON resta muta)
- **Pre-warm voci Web Speech** al load (per fallback istantaneo)
- **Auto-stop su `visibilitychange`** quando l'app va in background

### Punti d'uso (tutte le chiamate `speechSynthesis.speak()` sostituite)
- `home.html` → `speakSOS()` (rate 0.85), `aacSpeak()` (rate 0.9), `_speak()` AI hero (rate 0.95)
- `home.html` → `toggleTTS()` chiama `stopNeural()` quando muto
- `comunicador.html` → `speak()` (rate 0.9, con `onend` callback per stato bottone)
- `logopedia.js` → `speak()` (rate 0.95) chiamato da `sayAgent()`; cancel sostituiti con `stopNeural()`
- `tutorial.html` → `speak(el, text)` AAC demo (rate 0.88, con `onend` callback)

### Costi attesi
Free tier Google: **1M caratteri Neural2/mese** (rinnovo automatico ogni mese).
Stima Laura: ~100k char/mese (cache esclusa) → **completamente dentro free tier**.
Cache lato client + cache lato Worker (24h) abbattono ulteriormente le chiamate effettive.

### Sicurezza
- API key Google ristretta a SOLO Cloud Text-to-Speech API (anche se trapelasse, danno limitato al free tier TTS)
- Budget alert GCP $5/mese
- Key vive solo come secret cifrato nel Worker, mai nel browser, mai nel repo

## Sessione 17 aprile 2026 — TTS terapeutico (SSML helpers)
Trasformata la voce di Parlia da "lettore piatto" a vera **logopedista virtuale** sfruttando SSML su Google Neural2.

### Worker `parlia-tts` esteso
Accetta nuovo parametro opzionale `ssml: true` → wrappa il testo in `<speak>...</speak>` se manca e lo passa a Google come `input.ssml` invece di `input.text`. Resto invariato. `MAX_TEXT_LENGTH` da 500 a 1500 (i tag SSML occupano caratteri extra).

### Nuovi helper in `tts.js`
Quattro metodi su `speakNeural`:

```js
speakNeural.exerciseWord("Mariposa")
// → <prosody rate="slow"><emphasis level="strong">Mariposa</emphasis></prosody>
// Per word target negli esercizi: scandita lentamente con enfasi marcata.

speakNeural.withPauses("Respira hondo [pausa:1s] ahora di la palabra")
// → marker [pausa] o [pausa:1.5s] sostituiti con <break time="1.5s"/>
// Per istruzioni terapeutiche con tempo di esecuzione.

speakNeural.cheer("¡Muy bien!")
// → <prosody pitch="+15%" volume="+3dB">¡Muy bien!</prosody>
// Per feedback positivi: voce più calorosa e motivante.

speakNeural.therapeutic("Decir mariposa", { targetWord: "mariposa" })
// → Se targetWord contiene un fonema dalla lista difficultPhonemes del profilo:
//   wrappa la parola con prosody slow + emphasis strong
//   Altrimenti: emphasis moderate. La frase circostante resta naturale.
```

I `difficultPhonemes` vengono letti automaticamente da `parlia_logo_profile.difficultPhonemes` (se non passati esplicitamente all'invocazione).

### Cache + fallback
- Cache key estesa con flag `s|t` per evitare collisioni tra varianti SSML/text dello stesso testo
- Il fallback Web Speech strippa automaticamente i tag SSML (`_stripSSML`) → l'app non si rompe mai anche se il Worker rifiuta SSML

### Schema profilo logopedico esteso
`parlia_logo_profile` ora include:
```js
{
  level: 3,
  sounds: ['a','e','i','o','u'],          // sa dire (esistente)
  difficultPhonemes: ['r','rr','cl'],     // NUOVO — lavora su questi
  assessed: true
}
```

Helper centralizzati in `userData.js`:
- `ParliaUser.getLogoProfile()` / `saveLogoProfile(p)`
- `ParliaUser.getDifficultPhonemes()` / `setDifficultPhonemes(arr)`

### UI in `profile.html`
Nuova sezione **🎙️ Logopedia** → riga "Letras a practicar" → modal con chip preset:
`r, rr, l, s, ch, j, bl, br, cl, cr, dr, tr, pl, pr` (15 fonemi spagnoli più rilevanti per terapia post-ictus/afasia).
Selezione multipla, salvataggio in `parlia_logo_profile.difficultPhonemes`. Default vuoto → comportamento neutro (nessuna enfasi automatica).

### Punti d'integrazione
- **`logopedia.js`**: `speak(text, opts)` esteso con `opts.mode` ('cheer' | 'word' | 'therapeutic'); bottone **👂** accanto alla word target → `listenWord()` chiama `speakNeural.therapeutic()`; feedback verde (semaforo) → mode `cheer`; complete con score ≥60% → mode `cheer`
- **`logopedia-sorriso.js`**: tutte le esclamazioni di incoraggiamento ('¡Genial!', '¡Bien hecho!', '¡Tú puedes!', salita di livello, complete) → mode `cheer`
- **`logopedia-dialogo.js`**: cheer line dopo risposta utente + complete → mode `cheer`

### Effetto pratico
- Word target: pronuncia scandita, l'utente sente bene ogni sillaba
- Fonemi difficili: enfatizzati automaticamente quando appaiono in qualsiasi parola (basta impostare la lista una volta nel profilo)
- Feedback positivi: voce con pitch +15% suona genuinamente felice/motivante (vs piatto)
- Pause terapeutiche: marker `[pausa:1s]` nei testi → l'utente ha tempo fisico di eseguire il movimento

### Cache-bust v20260417a
Aggiornati: `tts.js`, `userData.js`, `logopedia.js`, `logopedia.css`, `logopedia-data.js`, `logopedia-sorriso.js`, `logopedia-dialogo.js`, `profileApp.js`, `home.html`, `comunicador.html`, `tutorial.html`, `logopedia.html`, `profile.html`.

### Fix bottone 👂 su vocali sostenute (v20260417b)
Google Neural2 di default pronuncia "Aaa" / "AAA" / "Ooo" come singola vocale brevissima (non sostenuta). Aggiunto rilevamento pattern "stessa lettera ripetuta ≥2 volte" in `listenWord()`: quando il pattern viene riconosciuto, la parola viene riprodotta con SSML `<prosody rate="x-slow">aaaaa</prosody>` (5 ripetizioni della vocale + rate x-slow) → suono sostenuto di ~2 secondi.

Volume/pitch adattati al tipo di esercizio tramite parsing di `instruction` e `hint`:
- `"voz suave"` / `"susurro"` → `volume="-4dB" pitch="-5%"` (sussurrato controllato)
- `"voz fuerte"` / `"proyecta"` → `volume="+3dB" pitch="+5%"` (proiettata)
- Neutro → solo `rate="x-slow"`

### TODO per prossima sessione
- **Brows (Sube las cejas)** — soglia 0.32 ancora insufficiente per alcuni visi (triggera da sola a riposo). Fix da fare: cambiare la formula in `logopedia-sorriso.js` per usare `eyeWidth` come riferimento invece di `fH` (altezza viso intera), così è invariante alla forma del volto e alla distanza dalla camera. Soglia da ricalibrare sul nuovo range.

---

## Sessione 17 aprile 2026 (pomeriggio) — Back gesture logopedia + Reto de la Sonrisa overlay

### Back dentro logopedia.html (history a 2 livelli)
Problema: lo swipe/back dentro una categoria (Pronunciación, Fluidez, Sorriso…) usciva direttamente a `home.html` Rehab saltando la lista delle 5 categorie, perché il cambio di schermata in `logopedia.html` era solo UI senza toccare `history`.

Modello a 2 livelli:
- **Categories (base)**: al load di `logopedia.js` → `history.replaceState({screen:'categories', sub:false})`
- **Subscreen** (Exercise / Sorriso / Dialogo / Assessment / Complete): all'ingresso → `history.pushState({screen:'xyz', sub:true})` + flag `_inSubscreen = true`

popstate handler **difensivo**: controlla sia il flag che il DOM. Se `screenCategories.hidden` o `_inSubscreen` → forza ritorno a Categories (non dipende dal matching dello state, che può essere `null` al restore da bfcache).

Cleanup automatico in `_showCategoriesView`: STT abort, TTS stop, `sorrisoPowerDown()`, dialogo recognition abort, `body.classList.remove('on-sorriso')`.

`backToCategories` / `cancelAssessment` / `saveAssessment` / `sorrisoExit` / `dialogoExit` passano per `history.back()` per coerenza con lo swipe (tutti confluiscono su popstate → `_showCategoriesView`).

`saveAssessment` ha un one-shot override del messaggio Ana via `_pendingSayAgent` ("Perfil guardado. Nivel X. ¿Qué practicamos?") per non perdere il feedback di salvataggio.

Risultato: da **qualsiasi** schermata dentro logopedia → un back torna alle 5 categorie; da categorie → esce a home.html Rehab. Zero loop, zero salti.

### Reto de la Sonrisa — layout overlay full-camera
Problema: stack verticale (camera 4:3 ≈300px + emoji 3rem + titolo + istruzione + barra progress + label + timer + bottone Empezar) → su mobile il bottone "¡Empezar!" cadeva sotto il fold. I tentativi intermedi di compattare (mirror max-height 180px + Ana hero shrink) tagliavano il volto nella camera.

Soluzione: **la camera è il protagonista visivo**, tutto il resto è sovrapposto in overlay:

```
┌─────────────────────────────┐
│ ○ ○ ○  (progress dots)      │ ← top overlay
│ 😊 Sonrisa grande           │   gradient dark→trasparente
│ Sonríe lo más que puedas    │
│                             │
│      [USER'S FACE]          │ ← video object-fit cover
│                             │
│                             │
│ [====== 60%]  Mantén 2s     │ ← bottom overlay (hidden
│ [    ¡Empezar!      ]       │   finché non si preme)
└─────────────────────────────┘
[ Saltar ]  [ ← Cambiar cat. ]  ← sotto la camera, piccoli
```

Dettagli CSS in `logopedia.css`:
- `.sorriso-stage`: `position:relative`, `aspect-ratio:2/3`, `max-height:72vh`, `overflow:hidden`, `border-radius:24px`
- `.sorriso-video`: `position:absolute; inset:0; width:100%; height:100%; object-fit:cover; transform:scaleX(-1)` → faccia intera, non tagliata, effetto specchio
- `.sorriso-overlay-top` / `.sorriso-overlay-bottom`: `position:absolute`, gradient via `linear-gradient` per leggibilità testo su qualsiasi sfondo; `pointer-events:none` sul contenitore + `pointer-events:auto` sui figli (così il video sotto non riceve tap spuri)
- `#sorrisoDetectGroup` (barra + label + timer): wrappato e `hidden` all'avvio → l'utente vede solo la camera e il bottone, la barra compare solo durante il rilevamento
- `.sorriso-actions-below`: "Saltar" + "← Cambiar categoría" in riga sotto la camera, compatti
- `body.on-sorriso`: Ana hero ultra-compatta (avatar 32px, bolla **nascosta**, niente halo né animazione float) — tutta la scena alla camera

Toggle `body.on-sorriso` in `sorrisoStart` (add) e `sorrisoExit` / `sorrisoComplete` / `_showCategoriesView` (remove).

Progress dots dentro l'overlay hanno palette specifica per sfondo scuro (`active` bianco+giallo, `done` verde smeraldo).

### Cache-bust della sessione: v20260417c → d → e → f → g → h

### File toccati
- `logopedia.html` — screen Sorriso riscritto (rimosso wrapper `.exercise-card`, nuovo `.sorriso-stage` con overlay)
- `logopedia.css` — intera sezione "SFIDA DEL SORRISO" riscritta per overlay
- `logopedia.js` — history management + popstate + `_showCategoriesView` + wire di `backToCategories`, `cancelAssessment`, `saveAssessment`
- `logopedia-sorriso.js` — toggle `on-sorriso` body class, show/hide del `sorrisoDetectGroup` in `sorrisoGo`/`sorrisoRender`
- `logopedia-dialogo.js` — `_enterSubscreen('complete')` in `dialogoComplete`

---

## Sessione 17 aprile 2026 (sera) — Head Pointer: scroll + estensione a logopedia

### Problema
Il puntatore funzionava solo sulla home (4 pagine del carosello) e permetteva dwell-click sui cliccabili + swipe laterale per cambiare pagina. Mancavano:
- **Scroll verticale** (in una pagina con contenuto sotto il fold, es. una lista lunga in comunicador)
- **Scroll orizzontale** di container interni (es. `.subcat-scroll` in AAC — lo swipe laterale cambiava pagina invece di scorrere le subcategorie)
- **Disponibilità sulle altre pagine** (logopedia non lo aveva; per uscire da un esercizio dovevi cliccare manualmente "Cambiar categoría")

### Soluzione: 4 edge zones, un solo paradigma
Tutti e 4 i bordi dello schermo diventano zone di dwell (1s) con edge-glow viola. Priorità:
1. **Clickable sotto il cursore** → dwell-click normale (1.5s). Se l'utente è su ⚙️, 🆘, un bottone — vince sempre, anche se per coincidenza è in una edge zone. Così la topbar resta cliccabile.
2. **Edge zone** → dwell di 1s → trigger azione specifica per direzione.
3. **Nient'altro** → reset timer, niente sound.

### Azioni per direzione
- **Top (10% alto)** → `hpScroll('up')` sul container verticale più grande visibile
- **Bottom (10% basso)** → `hpScroll('down')`
- **Left (12% sinistro)** → cascata:
  1. Scroll orizzontale a sinistra su container interno (es. `.cat-scroll`, `.subcat-scroll`, `.cats`, `.subcats`)
  2. `goTo(curPage - 1)` sul carosello home
  3. `history.back()` (fallback universale → esce da esercizi logopedia, torna a home, ecc.)
- **Right (12% destro)** → scroll orizzontale destra → `goTo(curPage + 1)` carosello. Nessun fallback a `history.forward()` (poco utile).

**Pop sound viene riprodotto SOLO se l'azione avviene davvero** — altrimenti la ri-trigger ogni secondo produceva suoni inutili con l'utente fermo in un bordo "morto".

### Scroller finder intelligente (`_hpFindBestScroller(axis)`)
Cerca tra tutti gli elementi con `overflow: auto/scroll` visibili nel viewport:
- **Blacklist** `.pages-wrap` e `[data-hp-no-scroll]` — evita di scrollare manualmente il carosello home (che deve cambiare pagina via goTo, non pixel-per-pixel)
- **Scoring**: area visibile × 10 se il cursore ricade nel range perpendicolare dello scroller. Così su AAC, se l'utente punta la testa al livello verticale della riga subcats e va a destra, scrolla subcats (non cats). Se punta al livello di cats, scrolla cats.
- Fallback finale: `document.scrollingElement` se è scrollabile.

### DOM auto-injection
`headpointer.js` all'avvio (DOMContentLoaded) inietta nel body tutti gli elementi mancanti:
- `#cursor`, `#dwellRing`, `#hpVideo` (nascosti)
- `.hp-edge-left/right/top/bottom` (zone invisibili, glow solo durante il dwell)
- `.hp-swipe-arrow.left/right` (indicatori ‹ ›)
- `.hp-toggle` (👁️) — solo se non già presente (home.html ce l'ha hardcoded)

Idempotente (check `document.getElementById`/`querySelector` prima di creare). Una pagina qualsiasi che include `headpointer.css` + `headpointer.js` ottiene automaticamente tutto.

### File toccati
- `headpointer.js` — main loop riscritto (priorità clickable > edge), nuovo `_hpEdgeTrigger(dir)`, scroller finder con scoring + blacklist, auto-injection DOM
- `headpointer.css` — edge zones per tutti e 4 i lati con glow `.triggered`
- `logopedia.html` — aggiunti `<link>` CSS + `<script>` JS del puntatore
- `home.html` — solo cache-bust dei riferimenti

### Cache-bust della sessione
`headpointer.*`: v20260416c → v20260417k (via i, j intermedi durante dev)

---

## Sessione 17 aprile 2026 (notte) — Visión Asistida (Google Cloud Vision)

Nuova feature: **`vision.html`** — pagina standalone che usa la camera posteriore per leggere testi (OCR) e descrivere oggetti, con lettura automatica via TTS Neural2-H.

### URL
- Pagina: `https://app.parlia.app/vision.html`
- Worker proxy: `https://parlia-vision.luca-peltrini.workers.dev`

### Architettura
```
[Browser] --POST {image: base64}--> [parlia-vision Worker] --+ GOOGLE_VISION_KEY --> [Google Cloud Vision API]
[Browser] <-- JSON {text,labels,objects} -- [Worker] <-- annotations --------------+
                                                          │
                                                          └── se NO text → [voci-ai-proxy → Claude Haiku]
                                                                           → "Veo una botella de…"
                                                          │
                                                          └── TTS via [parlia-tts → Google Neural2-H]
```

### Worker `parlia-vision` (nuovo, separato)
- URL: `parlia-vision.luca-peltrini.workers.dev`
- Secret cifrato: `GOOGLE_VISION_KEY` (chiave Google Cloud ristretta a SOLO Cloud Vision API)
- CORS allowlist: `app.parlia.app`, `laura.parlia.app`, `parlia.app`, localhost
- Validazione: immagine base64, max 5MB
- Features richieste per request: `TEXT_DETECTION` + `LABEL_DETECTION` + `OBJECT_LOCALIZATION` (3 in una chiamata)
- `imageContext.languageHints: ['es', 'it', 'en']` per migliorare OCR multilingua
- Risposta normalizzata: `{ text: string, labels: [{desc,score}], objects: [{name,score}] }`
- Free tier Google: **1000 req/mese/feature** (≈3000/mese effettive per Laura) — ampiamente coperto

### Pagina `vision.html` — layout full-camera (stesso pattern del Reto de la Sonrisa)
```
┌─────────────────────────────┐
│ ← Visión Asistida      🔄   │ topbar teal
├─────────────────────────────┤
│                             │
│ Apunta a un texto o objeto  │ ← overlay top (gradient)
│                             │
│     [CAMERA POSTERIORE]     │ ← aspect 3/4, max 72vh,
│          live               │   object-fit cover, NO mirror
│                             │
│  ═════ scanner line ═════   │ ← solo durante analisi
│                             │
│ ┌─ Texto detectado ──────┐  │ ← overlay bottom (gradient)
│ │ Resultado leído aquí   │  │   glass card scrollabile
│ └────────────────────────┘  │
│ [   🔍 Analizar       ]    │ ← bottone grande gradient teal→cyan
└─────────────────────────────┘
[🔊 Escuchar de nuevo] [↻ Nuevo]
```

Palette verde/ciano (`#0d9488 → #06b6d4 → #22d3ee`) per differenziare da Tutorial viola, AI core blu, Reto sorriso viola/rosa. Scanner line ciano con glow + `@keyframes scannerScan` ping-pong 1.6s durante analisi.

### Logica client (`vision.js`)
1. **startCamera** al load: `getUserMedia({facingMode:{ideal:'environment'}, width:1280, height:960})`. Flip 🔄 visibile solo se ci sono ≥2 camere.
2. **analyzeFrame**: cattura frame → canvas downscale a max 1024px lato lungo → JPEG 0.82 → POST al Worker
3. **_handleResult** (priorità):
   - **Testo "significativo"** (≥3 parole **E** ≥15 caratteri) → legge tutto con Neural2-H. Etichetta "Texto detectado"
   - Altrimenti → Claude Haiku via `voci-ai-proxy` genera frase in spagnolo iniziando con "Veo…" (max 10 parole). Il testo breve eventuale (brand, etichetta) viene passato come **hint** a Claude così può dire "Veo una botella de Coca-Cola" invece di "Veo una botella"
   - Nessun segnale affidabile → fallback testuale + lettura
4. **UI stato analisi**: bottone disabilitato + `.vis-scanner.active` (linea che scorre) + spinner overlay
5. **🔊 Escuchar de nuevo**: ripete `VIS.lastText` — arriva dalla cache LRU client di `tts.js` → **zero consumo API**
6. **Stop TTS precedente** prima di nuova lettura (evita sovrapposizioni)
7. **Power down automatico**: `visibilitychange`/`pagehide`/`beforeunload` → stop stream + `stopNeural()`

### Heuristica "testo significativo" (evita falsi positivi)
Vision API rileva qualsiasi testo, incluso "COCA-COLA 500ml" su una lattina. Leggere quello invece di descrivere l'oggetto è disorientante. Fix: testo viene letto solo se sembra un testo vero (pagina, cartello, menu — ≥3 parole E ≥15 char). Brand/etichette brevi cadono sul path AI → descrizione naturale.

### Integrazione nella home
Card compatta in `components/inicio.html` (tra Tutorial e Meteo):
```html
🔍 Visión Asistida
Lee textos y reconoce objetos       [Abrir →]
```
Gradient teal→cyan, link diretto a `vision.html`. Posizione scelta per essere sempre visibile in cima sia con tutorial attivo sia dopo averlo nascosto.

### File creati/toccati
- **Nuovi**:
  - `vision.html` (75 righe) — shell + overlay camera
  - `vision.css` (250 righe) — palette teal/cyan, scanner line, spinner, overlay gradient
  - `vision.js` (180 righe) — camera + analyzeFrame + _handleResult + AI describe
- **Modificati**:
  - `components/inicio.html` — card di ingresso
  - `home.html` — cache-bust partial v20260416b → v20260417a

### Costi
- Google Cloud Vision: free tier 1000 req/mese per feature. Richiesta combinata TEXT+LABEL+OBJECT conta come 3 feature-req → 1000 analisi/mese. Laura probabilmente ~50-100/mese.
- Google TTS Neural2: 1M char/mese free. Letture vision tipiche ~30-80 char → trascurabile (si era già detto).
- Claude Haiku (via voci-ai-proxy): consumo token minimo (~100 token per descrizione).

### Istruzioni di setup (per Luca in futuro, se serve replicare)
1. Google Cloud Console → abilitare **Cloud Vision API** sullo stesso progetto del TTS
2. Credentials → crea API key → restringi a SOLO Cloud Vision API
3. Cloudflare Workers → crea Worker `parlia-vision` con il codice in `notes/parlia-vision-worker.js` (NON in repo, lo ho fornito come testo nella chat di sviluppo)
4. Nel Worker: Settings → Variables → Secret `GOOGLE_VISION_KEY` = la API key
5. Deploy

---

## Sessione 17 aprile 2026 (notte, parte 2) — Live AI Chat (Deepgram Nova-2)

Nuova feature: **`live-chat.html`** — pagina standalone per conversazioni in tempo reale. L'interlocutore parla, Deepgram trascrive in streaming, Claude Haiku genera 3 risposte predittive che Laura può toccare → voce Neural2-H le legge ad alta voce. Pensata per conversazioni faccia a faccia (caregiver, visitatori, terapisti) dove Laura non riesce a formulare risposte verbali.

### URL
- Pagina: `https://app.parlia.app/live-chat.html`
- Worker token: `https://parlia-deepgram.luca-peltrini.workers.dev/token`

### Architettura
```
[Mic browser] --PCM linear16 (AudioWorklet)--> [Deepgram WS Nova-2]
                                                        │
[Browser] <-- Results (interim + final) ----------------+
    │
    └── final transcript → history → [voci-ai-proxy → Claude Haiku] → 3 chips
                                                                          │
[Browser] --tap chip--> speakNeural.chip(text) ----> [parlia-tts → Neural2-H]
    │
    └── token temp: GET [parlia-deepgram Worker] --+ DEEPGRAM_API_KEY--> [api.deepgram.com/v1/auth/grant]
                                                                              → JWT valido 30s
```

### Worker `parlia-deepgram` (nuovo)
- URL: `parlia-deepgram.luca-peltrini.workers.dev`
- Secret cifrato: `DEEPGRAM_API_KEY` (Deepgram console API key con scope `member`)
- Endpoint unico: `GET /token` → POST a `https://api.deepgram.com/v1/auth/grant` con Authorization Token; ritorna `{ token, expires_in }` (JWT valido 30s, scope `asr:write`)
- CORS allowlist: app.parlia.app, laura.parlia.app, parlia.app, localhost
- `Cache-Control: no-store` (ogni token è usa-e-getta)
- **NON in repo** (codice fornito nella chat di sviluppo, stesso pattern di `parlia-vision` e `parlia-tts`)
- Free tier Deepgram: $200 di credito iniziale = ~565 ore Nova-2 streaming
  - **Nessuna carta di credito aggiunta** → quando il credito finisce, l'API smette e basta (zero addebito)
  - Deepgram non ha budget-alert integrati come GCP → controllo manuale via console.deepgram.com → Usage

### Auth WebSocket dal browser
I browser non possono settare header custom su WebSocket. Deepgram accetta credenziali via **subprotocol**:
- API key fissa: `new WebSocket(url, ['token', API_KEY])`
- **JWT temp (il nostro caso)**: `new WebSocket(url, ['bearer', JWT])` ← indispensabile

Errore tipico: usare `'token'` con un JWT → Deepgram risponde 401 durante l'handshake, il browser emette **close code 1006** senza reason leggibile. Il fix passa da `['token', ...]` a `['bearer', ...]`.

### Capture audio: AudioWorklet + PCM linear16 (non MediaRecorder)
Motivazioni:
- **Latenza minima** (niente container webm/opus)
- **Safari iOS compatibile** (MediaRecorder con opus NON lo è — bloccante per Laura su iPhone)
- **Deepgram** accetta PCM linear16 direttamente, nessun parsing container lato server

Implementazione (file inline via `URL.createObjectURL(new Blob(...))`, zero file esterno da servire):
```js
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    const pcm = new Int16Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      const s = Math.max(-1, Math.min(1, channel[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    return true;
  }
}
```
Sample rate passato a Deepgram così com'è (`audioCtx.sampleRate`, tipicamente 48000 o 44100) — zero resampling client-side. `getUserMedia` con `echoCancellation + noiseSuppression + autoGainControl` attivi.

### Parametri Deepgram WebSocket
```
wss://api.deepgram.com/v1/listen?
  model=nova-2 &
  language=es &
  smart_format=true &           ← punteggiatura + maiuscole automatiche
  interim_results=true &        ← parziali in tempo reale
  endpointing=300 &             ← ms di silenzio per finalizzare un turno
  channels=1 &
  encoding=linear16 &
  sample_rate=<runtime>
```
Messaggi gestiti: `type=Results` con `is_final: false/true`. Altri tipi loggati solo se `Error`.

### Chat UI — bolle them / me (come WhatsApp)
- **Interlocutore** (chi parla al microfono, cioè la persona davanti a Laura) → bolle **sinistra**, bianche, bordo soft
  - Interim: background rosa tenue + dashed border + italic gray → feedback immediato mentre si parla
  - Finale: bianco pieno, ink scuro
- **Laura** (chip tappata) → bolle **destra**, rose gradient (stesso colore della pagina)
- Thread scrollabile, animazione bubbleIn .25s sotto a ogni inserimento

`addMeBubble(text)` viene chiamata in `onChipTap` PRIMA del TTS → conversazione leggibile a entrambi i lati.

### Pre-generazione chips su interim stabile (riduce latenza percepita ~50%)
Il bottleneck della feature è la latenza di Claude Haiku (~800-1500ms per risposta). Soluzione:

`schedulePreGen(interimText)` debounce 500ms: se l'interim non cambia per mezzo secondo **E** ha ≥3 parole, lancia una chiamata AI speculativa usando `[...S.history, {role:'them', text:interim}]` come history ipotetica. `S.history` reale NON viene toccato.

Quando arriva il final:
- Se coincide (dopo `_normalizeForCompare`: lowercase + strip punteggiatura + trim) con l'interim pre-genato → **chips già renderizzate**, zero attesa, zero nuova chiamata API
- Altrimenti: `runChipGen(null)` rigenera con history definitiva, skeleton shimmer mentre aspetta

Token monotonico (`S.chipToken`): ogni pre-gen / post-final incrementa il token → i risultati delle chiamate precedenti vengono scartati prima del render.

Costo trade-off: ~0.0001$ per chiamata pre-gen sprecata quando l'utente continua a cambiare frase. Trascurabile rispetto al guadagno di UX.

### System prompt Claude Haiku per chips
Obiettivi stretti:
- Risposte in **PRIMA PERSONA** ("yo me mi") in spagnolo conversazionale naturale
- Sempre 3 risposte **varie in intenzione e lunghezza**:
  - 1 muy breve (1-4 palabras) — sì/no/gracias
  - 1 corta con matiz (3-7 palabras)
  - 1 más larga (6-14 palabras) con contesto o pregunta inversa
- **Mai ripetere** letteralmente ciò che ha detto l'interlocutore
- Coerenza con la history (gli ultimi 8 turni)
- Personalizzazione da `ParliaUser` (nome, condicion, hobbies) se presenti
- Output: **solo JSON array** di 3 stringhe (parsing con fallback regex su stringhe quotate se `JSON.parse` fallisce)

`max_tokens: 200`. History serializzata come `INTERLOCUTOR:` / `YO:` (più leggibile per Haiku dei role user/assistant alternati).

### Nuovo helper `speakNeural.chip(text)` in `tts.js`
Tono naturale/immediato, diverso dal default terapeutico (0.9x slow):
```js
ssml: `<prosody pitch="+2%">${escapedText}</prosody>`
rate: 1.0  // velocità normale di parlato, non rallentato
```
Usato in `onChipTap` → la voce Neural2-H legge la risposta tappata con tono conversazionale, non da logopedista.

### Pannello admin (sempre visibile)
Sotto il thread, sopra il bottone Empezar: card nera stile terminal con 3 celle + status dot:
- ⚪/🟡/🟢/🔴 status WebSocket (sincronizzato col dot in topbar)
- `TIEMPO` — mm:ss dal Empezar
- `COSTE SESIÓN` — elapsed_ms / 60000 × $0.0059 (tariffa Nova-2 streaming)
- `ÚLTIMA INTERACCIÓN` — "ahora" / "Ns" / "Nm" da `S.lastInteraction` (aggiornato su ogni transcript + chip tap)

Oggi è **sempre visibile** (l'app la usa solo Luca per ora). Quando Laura inizierà a usare l'app, wrapparla in `if (localStorage.getItem('parlia_admin')==='luca') {...}` nasconderà il pannello a tutti gli altri device senza ulteriori modifiche.

### Safety & risparmio
- **Start/Stop manuale** con animazione ring-pulse rosa durante l'ascolto
- **Safety timer 3 min**: `resetSafety()` ogni transcript ricevuto + ogni chip tap. Se scade senza attività → `stopListening(silent)` + toast "Micrófono cerrado por inactividad". Evita sessioni appese con mic aperto e costi in background.
- **Power-down** completo su `visibilitychange` / `pagehide` / `beforeunload`:
  - WebSocket `CloseStream` message + close(1000)
  - `stream.getTracks().forEach(t => t.stop())` (spegne l'indicatore rosso del mic)
  - `workletNode.disconnect()` + `audioCtx.close()` (libera AudioContext)
  - `stopNeural()` ferma TTS in corso
- **Nessun loopback**: il worklet non è connesso a `audioCtx.destination` → la voce dell'utente NON viene riprodotta in altoparlante (evita eco)

### File creati/toccati
- **Nuovi**:
  - `live-chat.html` (~80 righe) — topbar + thread + chips row + admin + mic button
  - `live-chat.css` (~410 righe) — palette rosa/fucsia (`#ec4899 → #f43f5e`), bolle them/me, skeleton shimmer, ring-pulse mic
  - `live-chat.js` (~540 righe) — token fetch, AudioWorklet, WS Deepgram, runChipGen, schedulePreGen, safety timer
  - Worker `parlia-deepgram` (non in repo) — endpoint `/token`
- **Modificati**:
  - `tts.js` — nuovo helper `speakNeural.chip(text)` (SSML pitch +2%, rate 1.0)
  - `components/inicio.html` — card "Live AI Chat" gradient rosa sotto Visión
  - `home.html` — cache-bust partial V '20260417a' → '20260417b'

### Costi stimati (uso tipico Laura, ~30 min/giorno streaming)
- **Deepgram Nova-2 streaming**: 30 min × $0.0059/min × 30 giorni = **~$5.30/mese** (coperto dai $200 iniziali per ~38 mesi se non si aggiunge carta)
- **Claude Haiku** (via voci-ai-proxy): ~200 token per generazione × ~50-100 chips/giorno = trascurabile
- **Neural2-H TTS**: frasi da 30-80 char × ~50 letture/giorno = ~4000 char/giorno = dentro free tier 1M/mese

### Cache-bust sessione
- `live-chat.js`: v20260417a (stub) → b (Deepgram) → c (bearer fix) → d (chips AI) → e (pre-gen + me bubble)
- `live-chat.css`: v20260417a → b (skeleton) → c (bolle them/me)
- `tts.js`: v20260417b → c (helper chip)
- `home.html` partial V: v20260417a → b

### Note operative
- Il Worker `parlia-deepgram` NON deve essere confuso con `parlia-tts` o `parlia-vision` — sono 3 worker separati con 3 secret diversi, per isolamento responsabilità e log
- Se in futuro Deepgram cambia endpoint token da `/v1/auth/grant` ad altro, basta aggiornare il Worker (nessun deploy Pages richiesto)
- Per aggiungere lingue (it/en): aggiungere un toggle UI in live-chat.html, passare la lingua a `DG_PARAMS.language`. Nessun cambio worker/infrastruttura — lavoro di ~15 minuti.
- Pre-gen e chat history sono **in-memory only** (non persistite in localStorage): ogni volta che l'utente esce dalla pagina, la conversazione si resetta. Questa è una scelta di privacy e semplicità — se in futuro serve history persistente, valutare se salvare solo metadata (timestamp, durata, #chips) vs. transcript completo (considerazioni privacy).

---

## Sessione 18 aprile 2026 — Polish Live AI Chat + Voz de Laura (MiniMax)

### Interlocutore selector in Live AI Chat
Porting del pattern dall'app di Laura (aaclaura): 4 categorie preset hardcoded in `CONTACTS` dentro `live-chat.js`:
- 💑 **Luca** — pareja/compañero sentimental (íntimo, cariñoso)
- 🩺 **Médicos** — equipo médico/terapéutico (respetuoso colaborativo)
- 👨‍👩‍👧 **Familia** — familiar (cálido familiar, senza tecnicismi)
- 🙋 **Amigos** — amigo/a (rilassato con umorismo ligero)

UI: riga `.lc-interlocutors` scrollable orizzontale sopra il thread. Pill bianche + active rose-gradient. `scroll-snap-type: x proximity`, scrollbar nascosta, touch-momentum.

Comportamento:
- Default: primo contatto (Luca). Scelta persistita in `localStorage.parlia_live_interlocutor`
- Tap cambio → reset totale (history `[]`, thread vuoto, chips clear, preGen cancellato, chipToken invalidato), nuovo empty state, toast conferma
- `_buildChipPrompt()` include una sezione `🗣️ CONTEXTO DEL INTERLOCUTOR` con `categoría · relación · contexto` + istruzioni esplicite di adattamento tono (pareja íntimo, médicos formal ecc.)

Non tocca il flusso Deepgram/audio — cambia solo il system prompt di Claude Haiku. Zero costo aggiuntivo streaming.

### Polish home: Vision spostato in topbar
Visión Asistida era una card grande in Inicio — rubava spazio dopo l'introduzione di Live AI Chat (feature più usata). Spostato a icona 🔍 compatta 32×32 nella topbar di `home.html`, subito prima dell'ingranaggio ⚙️, stile `.vision-btn` (bianco + bordo, active state cyan). Rimossa la card corrispondente da `components/inicio.html`.

### Fix contrasto agenda-sleep su weekend
Il blocco `.agenda-sleep` (*"¡Sábado libre! · Sin compromisos programados hoy"*) usava colori `--ink` e `--muted` pensati per fondo bianco ma veniva renderizzato DENTRO il gradient viola del core AI → testo illeggibile (effetto olivastro/marrone). Override scoped in `.ai-hero-inner .agenda-sleep` con bianco su glass (bianco 12% + bordo bianco 20%), stessa tecnica già usata per `.agenda-done-card` e `.agenda-card`.

### Voz de Laura — MiniMax speech-01-turbo cloned voice
Nuova feature di test: pagina standalone **`laura-voice.html`** con frasi preset + input libero per verificare la qualità della voce clonata di Laura su MiniMax prima di integrarla nei punti d'uso reali.

#### Architettura
```
[Browser] --POST {text,speed}--> [parlia-minimax Worker]
                                       │ + MINIMAX_API_KEY
                                       │ + MINIMAX_GROUP_ID
                                       │ + MINIMAX_LAURA_VOICE_ID
                                       ↓
                          api.minimax.io/v1/t2a_v2
                          (model: speech-01-turbo, mp3 128k/32kHz)
[Browser] <-- audio/mpeg blob <- [Worker decode hex]
```

Secret e voice_id NON toccano mai il browser/repo: vivono solo come secret cifrati nel Worker `parlia-minimax` (NON in repo, stesso pattern di `parlia-tts` / `parlia-vision` / `parlia-deepgram`).

#### Worker `parlia-minimax`
- URL: `parlia-minimax.luca-peltrini.workers.dev`
- Endpoint unico: `POST /`
- Body accettato: `{ text, speed? }` — max 500 char
- Decodifica hex della risposta MiniMax (`data.audio` è hex-encoded, non base64) → ritorna `audio/mpeg` binario al browser
- `Cache-Control: public, max-age=86400` per edge cache Cloudflare
- Errori: JSON `{ error, status?, base_resp?, detail? }` (il client ora estrae e mostra `base_resp.status_code/status_msg` per debug — es. `1008 insufficient balance`, `1004 invalid voice_id`)

#### File client

**`laura-voice.js`** (~320 righe) — modulo globale:
- `fetchMiniMaxAudio(text, opts?)` — cache-first, riproduzione automatica, stop del precedente
- `stopLauraVoice()` — stop immediato
- `lauraVoiceStats()` → `{ plays, cacheHits, charsSent, charsSaved, cacheSize, pricePer1K, lifetimeChars, costSession, costSaved, costLifetime }`
- `clearLauraVoiceCache()` — async, pulisce memoria + IndexedDB
- `setLauraPricePer1K(v)` / `resetLauraLifetimeCounter()`
- `lauraVoiceReady()` — promise risolta al termine del preload IDB
- `isLauraCached(text)` — check sync per pre-marcare i bottoni già in cache

**Cache a 2 livelli:**
- **Layer 1** — `Map<key, blobUrl>` in memoria: riproduzione istantanea. Max 120 entries (LRU eviction con `URL.revokeObjectURL`)
- **Layer 2** — IndexedDB `parlia-laura-voice` store `audio` (schema `{key, blob, ts, chars}`): sopravvive a refresh, chiusura PWA, riavvio device
  - Al page load: `_preloadCacheFromIDB()` legge tutte le entries, converte blob → URL, popola Map
  - `fetchMiniMaxAudio` fa `await _idbReady` prima del lookup → primo tap dopo refresh NON paga API se la frase era persistita
  - LRU eviction rimuove entry sia da Map sia da IDB per non far crescere il DB all'infinito
  - Se IndexedDB non disponibile (Firefox privacy mode ecc.) → fallback silenzioso a solo Layer 1

**Key normalization**: `lowercase(trim(text))` → "Hola", "hola", "hola " colpiscono la stessa entry.

#### Pricing tracking (stima client-side)
- Default tasso: **$0.060 per 1000 caratteri** (fonte ufficiale: https://platform.minimax.io/docs/guides/pricing-paygo → speech-02-turbo $60/M chars, coerente con la misura empirica di Luca: 307 char → $0.02)
- Pricing HD: $100/M chars per speech-02-hd / 2.6-hd / 2.8-hd (per riferimento)
- Voice Cloning: $1.5 per voice (una tantum, non per uso)
- Tasso editabile via bottone "✏️" nella UI (prompt + persistenza in `localStorage.parlia_laura_price_per_1k`)
- Contatore lifetime chars persistito in `localStorage.parlia_laura_lifetime_chars` → sopravvive a chiusure
- Link diretto a `platform.minimax.io/user-center/basic-information/bill-info` per confrontare stima vs saldo reale

#### Pagina `laura-voice.html`
Palette lavender `#7c3aed → #8b5cf6 → #a78bfa` (distintiva da Tutorial viola-indigo, Vision teal, Live-chat rosa, AI blu).

Sezioni:
1. **✏️ Escribe y escucha** — textarea 2 righe (max 500 char con counter "N/500") + bottone "🔊 Leer con voz de Laura" full-width gradient. Auto-save ultimo testo digitato in `localStorage.parlia_laura_last_text`
2. **🟣 Frases cortas** — grid 2 col con 8 frasi preset (Hola, Gracias, Sí/No, Te quiero, ecc.)
3. **🟣🟣 Frases medias** — 5 frasi conversazionali (¿Cómo estás?, ecc.)
4. **🟣🟣🟣 Frases largas** — 4 frasi lunghe per testare prosodia su ~15-25 parole
5. **Pannello stats** nero stile terminal:
   - Header con badge "ESTADÍSTICAS · caché N" (N = entries IDB persistite)
   - 6 celle: Reproducciones · Desde caché · Chars enviados · Chars ahorrados · ~Coste sesión · ~Coste histórico
   - Footer: "Tasa: $X.XXX/1K chars ✏️" (editabile) + link "Ver billing MiniMax ↗"
   - Note: status message dinamico (left-align, word-break, selezionabile per copiare errori da mobile)

Stati visuali bottone:
- `.cached` → badge ⚡ (in cache, gratis al tap)
- `.loading` → spinner rotella (fetching API)
- `.playing` → rosa gradient + icona 🔊 pulsante

Card d'ingresso lavender in `components/inicio.html` sotto Live AI Chat.

#### Costi attesi uso Laura (calcolo empirico)
- 80 frasi uniche/giorno, 30 char media, cache hit ~70% dopo settimane di uso
- Fresh char/giorno: ~720 → costo: $0.043/giorno → ~$1.30/mese
- Pre-cache IDB: dopo 1-2 settimane saturazione tipica (~300-500 frasi in libreria) → cost marginale verso zero
- $25 caricati → **~18+ mesi** di uso quotidiano una volta raggiunta saturazione cache

#### Risultato test iniziale (Luca, 18 aprile)
- Voce clonata risulta abbastanza buona per il test (conferma Luca)
- Deepgram + Haiku + Neural2 restano su tutta l'app; Laura voice al momento **solo su pagina test**
- Prossimo step pianificato: integrare `fetchMiniMaxAudio` al posto di `speakNeural` in punti specifici (Live AI Chat `onChipTap`, comunicador AAC, frasi SOS) con toggle globale "Voz propia" nel profilo + fallback automatico a Neural2 se MiniMax fallisce

#### File creati/toccati
- **Nuovi:**
  - `laura-voice.html` · `laura-voice.css` · `laura-voice.js`
  - Worker `parlia-minimax` (NON in repo)
- **Modificati:**
  - `components/inicio.html` — card d'ingresso lavender
  - `home.html` — cache-bust partial V `20260417c` → `20260418a`, topbar con `.vision-btn`
  - `inicio.css` — fix contrasto `.ai-hero-inner .agenda-sleep`
  - `live-chat.html/css/js` — interlocutor pills + reset su cambio + contesto nel prompt

#### Cache-bust sessione
- `live-chat.js`: v20260417e → f
- `live-chat.css`: v20260417c → d
- `laura-voice.js`: v20260418a → b → c → d → e
- `laura-voice.css`: v20260418a → b → c → d → e
- `inicio.css`: v20260414aa → v20260417d
- `home.html` partial V: v20260417b → c → v20260418a

---

## Sessione 18 aprile 2026 (parte 2) — Polish massivo + PIN Laura + performance Android + emozioni voce

Sessione lunga di ottimizzazioni, bug fix e piccole feature. Di seguito i blocchi principali.

### PIN gate per widget "Voz de Laura · Test"
Siccome la sezione usa la voce clonata MiniMax a pagamento, si condivide l'app con altre persone ma quel widget deve restare accessibile solo al proprietario. Pin `0512` salvato in `localStorage.parlia_laura_voice_unlocked`:
- Tap widget (con lucchetto 🔒) → modal lavender con input PIN (auto-submit al 4° digit, shake se sbagliato)
- Sblocco persistente sul device → lucchetto sparisce, tap successivi aprono direttamente
- `laura-voice.html` ha guard script in testa: se `localStorage` non contiene `'1'`, fa `location.replace('home.html')` prima di renderizzare (protegge anche accesso diretto via URL)
- Per cambiare il PIN: costante `LAURA_PIN` in `home.html`

### Performance Android — no-select + low-power mode
Risolti due problemi visti sul telefono Android di Laura (Redmi/Xiaomi):
1. **Popup "Cerca su Google"** su tap di pulsanti → CSS globale `user-select:none` + `-webkit-touch-callout:none` su tutta la home. Riabilitato solo su `input`, `textarea`, `.ai-bubble`, `.frase-hero` (dove ha senso selezionare). Fix esteso anche al link "Ir directo a la home" in `onboarding.html`.
2. **Swipe e transizioni lente**. Attivato **low-power mode di default su QUALSIASI Android** (Chrome Android ha throttling anche su flagship). La classe `body.low-power` spegne: `backdrop-filter` globale, mesh blob animati, halo/orbit pulsanti AI core, animazioni meteo. Override manuale con `localStorage.setItem('parlia_low_power','0')` per disattivare. In più `body.is-scrolling` ora rimuove ogni `backdrop-filter` del DOM durante lo swipe (non solo su elementi selezionati).

### Bottone "Empezar conversación" + lazy loading AI
Trasformate in lazy / on-demand tutte le chiamate AI che prima partivano auto:
- **Parlia AI (home)**: niente `_sendMsg(null)` all'apertura. La card AI mostra solo `👋 Hola, [nome] · Toca para charlar conmigo` + bottone "Empezar conversación →". La chiamata a Claude Haiku parte solo al tap. Stesso comportamento sul pull-to-refresh (reset a stato starter). Nuova funzione `showAiStarter()` che riusa gli stili `.ai-chat-ended` già esistenti.
- **`loadGoal()`** rimosso da init + pull-to-refresh: la card "Objetivo de hoy" è stata resa WIP/Próximamente nella pagina Rehab (vedi sotto).
- **`loadAISuggestions()`** rimosso da init + pull-to-refresh: parte ora solo la prima volta che l'utente raggiunge la pagina AAC (page 1), tramite hook in `_syncNavAndHistory` con flag `_aacSugsInitialized`. Se l'utente apre la home 20× ma usa AAC 3× → 17 chiamate Claude Haiku in meno.

**Bilancio totale**: da 3 chiamate AI automatiche per apertura → **0 chiamate automatiche**.

### Rehab "Próximamente"
Solo la **Logopedia** è funzionante. Le altre card (Objetivo de hoy, Estimulación cognitiva, Mis progresos) sono state marcate come WIP:
- Classe `.coming-soon` in `rehab.css` → opacity .55, grayscale .35, pointer-events:none, box-shadow:none, badge "Próximamente" in alto a destra tramite `::after`
- `components/rehab.html` aggiornato con la classe e testo statico sulla goal card (niente più skel/AI-generated)

### Fix weekend session pill
Bug: sabato/domenica il core AI mostrava "AHORA · Logopedia" perché `_getCtx()` pescava da `SESSIONS` (hardcoded lun-ven) senza controllo del giorno. Se l'ora corrente cadeva in uno slot (es. sab 12:24 ∈ 12:15-13:00) → falso positivo + system prompt AI contraddittorio.
Fix: `_getCtx()` ora fa early return con tutti i campi session `null` + `isWeekend: true` se `dow === 0 || dow === 6`. `_showCtxBadge` ora nasconde esplicitamente il badge se `label` vuoto.

### Fix onboarding — nome errato in home dopo configurazione
Bug: dopo "Empezar configuración" la home mostrava "Test" invece del nome digitato (es. Laura). Causa: `onboarding.html` scrive solo la chiave legacy `parlia_profile`; se la home era stata aperta prima (es. via "Modo test"), `parlia_user_data` era già materializzato con "Test" e `ParliaUser.get()` non rifaceva la migrazione.
Fix: `finish()` e `openHome()` ora fanno `localStorage.removeItem('parlia_user_data')` → la home rimigra da `parlia_profile` fresco. Dati custom (hobbies, memoria) preservati perché `ParliaUser.save()` mantiene i legacy keys sincronizzati.

### Fix profile bar stale al back
Bug: dopo aver editato dati in `profile.html`, tornando alla home la barra e il conteggio campi restavano sui valori stale del primo load (43% su profilo vs 21% su home). Causa: `bfcache` del browser ripristina il DOM della home com'era all'uscita, `initProfile()` non viene rieseguito.
Fix: listener `window.addEventListener('pageshow', () => initProfile())` → rinfresca sempre al ritorno. Aggiunto anche `initProfile()` al pull-to-refresh per simmetria.

### Logopedia — Ana parla subito
Prima: `sayAgent()` faceva typewriter (22ms/char) e chiamava `speak()` SOLO alla fine → per un saluto di 70 char erano ~1.5s di silenzio + 400ms di setTimeout iniziale = quasi 2s.
Fix: `speak()` ora parte IN PARALLELO al typewriter (non più alla fine). `setTimeout` iniziale ridotto 400ms → 150ms. Ana parte ~1.7s prima. Effetto visivo "Ana sta scrivendo" resta (stile ChatGPT Voice).

### Settings menu ⚙️ — pulito
- Rimossa voce "🛠️ Roadmap" (era per uso interno)
- "Notificaciones" e "Idioma" ora hanno classe `.coming-soon` (opacity .5, pointer-events:none) + pill inline "Próximamente" a destra
- Nuovo CSS: `.settings-item.coming-soon` + `.soon-pill`

### Topbar — BETA badge inline
Su schermi stretti il badge "BETA" andava a capo sotto "Parlia.app". Aggiunto `white-space: nowrap` su `.logo-text`.

### Voz de Laura — auto-punteggiatura + emotion
Il voice clone MiniMax tendeva ad allungare/sospirare su frasi corte senza punteggiatura finale (es. "Tengo hambre" → "Tengo hambreeee"). Pattern ereditato dal training audio di Laura.

**Fix 1 — auto-punteggiatura**: `_ensureTerminalPunct()` in `laura-voice.js` aggiunge `.` se il testo non termina con `[.!?…]`. Applicato prima del normalize → la cache key resta coerente.

**Fix 2 — parametro `emotion`**: aggiunto supporto per `voice_setting.emotion` di MiniMax con whitelist `happy|sad|angry|fearful|surprised|disgusted|neutral`. Default `neutral` → tono piatto, stabile, molto meno variabilità tra generazioni.
- `laura-voice.js`: `fetchMiniMaxAudio(text, {emotion})`, cache key ora include l'emozione (`key = text + '|' + emotion`) così varianti emotive vivono come entry separate
- **Worker `parlia-minimax` aggiornato** (sempre NON in repo, edit manuale su dashboard Cloudflare): aggiunta costante `EMOTIONS`, parsing + validazione di `body.emotion`, inserimento in `voice_setting.emotion`. Retro-compatibile (client vecchi ricevono automaticamente `neutral`)
- **UI chips** in `laura-voice.html`: riga orizzontale scrollabile in testa con 7 chips (😐 Neutra · 😊 Feliz · 🥲 Triste · 😠 Enfadada · 😲 Sorprendida · 😨 Asustada · 🤢 Disgustada). Tap su chip la attiva (gradient lavender) e diventa il tono globale per tutte le riproduzioni. Stato persistito in `localStorage.parlia_laura_emotion`
- Nuovi stili in `laura-voice.css`: `.lv-emo-wrap` + `.lv-emo-chips` + `.lv-emo-chip` + `.lv-emo-chip.active`

**Limite osservato**: con `speech-01-turbo` la gamma emotiva è volutamente compressa (bilanciamento identità/emozione del voice clone). Le differenze ci sono ma sottili. Possibili upgrade futuri:
- Modello `speech-02-hd` (qualità + emozione più marcate, ~3x costo per char)
- Combinare `emotion` con `speed` modulato per amplificare percezione

### Backup branch pre-emotion
Prima di aggiungere il supporto emotion è stato creato il branch `backup/pre-emotion-20260418` su GitHub (commit `6a74cf0`) come snapshot rollback in caso di problemi con MiniMax o con il worker.

### File nuovi / toccati questa parte 2
- **Nuovi**: nessuno
- **Modificati**:
  - `home.html` (tantissimo: user-select, low-power mode, PIN modal, showAiStarter, lazy loadAISuggestions, weekend fix in `_getCtx`, pageshow listener, settings menu, BETA nowrap, cache-bust V partial)
  - `onboarding.html` (user-select fix + removeItem parlia_user_data)
  - `components/inicio.html` (widget Laura voice con lucchetto + onclick gate)
  - `components/rehab.html` (coming-soon markup)
  - `rehab.css` (classe `.coming-soon`)
  - `logopedia.js` + `logopedia.html` (parallel TTS, setTimeout ridotto)
  - `laura-voice.html` (chips emozione + stato + markup)
  - `laura-voice.css` (stili chips)
  - `laura-voice.js` (ensureTerminalPunct, emotion param, isLauraCached aggiornato)

### Cache-bust questa parte 2
- `home.html` partial V: `20260418a` → `b` → `c`
- `rehab.css`: `20260414aa` → `20260418c`
- `logopedia.js`: `20260417f` → `20260418d` → `e` → `f` → `g`
- `laura-voice.js`: `20260418e` → `f` → `g`
- `laura-voice.css`: `20260418e` → `f`

---

## Sessione 18 aprile 2026 (parte 3, sera-tardi) — STT logopedia + logo Parlia

### STT logopedia — matching fonetico permissivo (vocali/sillabe)
Problema riportato: esercizi di suoni isolati (A, E, I, O, U, NA, MA, ecc.) non venivano riconosciuti anche quando Laura diceva il suono giusto. Web Speech API (Chrome Android, non Neural2 che è TTS) trascrive suoni isolati come *parole*: "A" → "ah"/"ha"/"eh"/"y", "I" → "y" (spagnolo "y" suona come "i"), "Aaaa" prolungata → "aa". Levenshtein stretto dava falsi rossi.

Fix in `logopedia.js`:
- **`normPhonetic(s)`**: rimuove h mute, collassa vocali ripetute (`"aaa"→"a"`, `"ooooh"→"o"`), applica mapping `PHONETIC_EQUIV` (`y`→`i`, `and`→`i`, `hay`→`ay`)
- **`matchShortSound(heard, target)`**: per target ≤3 char usa `normPhonetic` + containment invece di Levenshtein puro. `"ah"` per "A" = 1.0, `"y"` per "I" = 1.0, `"mah"` per "MA" = 1.0
- **`evaluate()`** sceglie quale funzione di matching usare in base alla lunghezza del target (short=fonetico, long=Levenshtein). Word lunghe come "Mamá" / "Casa" continuano col matching stretto di prima
- **`maxAlternatives`**: 3 → 6 (più candidati = più chance di coglierne uno fonetico-corretto)

### STT logopedia — label "Grabando/Escuchando" solo durante registrazione
Bug: dopo che lo STT terminava senza risultato (silenzio, timeout, auto-stop), `stopRecord()` ripristinava il bottone mic ma lasciava i testi `"Grabando…"` e `"Escuchando… habla ahora"` visibili → sembrava fosse ancora in registrazione.

Fix: `stopRecord()` ora, se nessun altro (evaluate/onerror) ha già aggiornato `#sfFeedback` / `#exStatus`, li ripristina a `"Pulsa el micrófono y habla"` / `""`. Label transitorie visibili SOLO durante la registrazione effettiva.

### STT logopedia — "Oído" mostra la vocale/sillaba reale
Visualmente l'utente vedeva `Oído: "eh"` quando aveva detto "A" → sembrava sbagliato anche quando il verde era stato assegnato.

Fix con `displayHeard(heard, target)`: per target ≤3 char applica `normPhonetic` + uppercase all'heard. Output: `Oído: "A"` / `"E"` / `"I"` / `"MA"` ecc. anche se lo STT raw diceva `"ah"` / `"eh"` / `"y"` / `"mah"`. Per parole lunghe resta il testo raw.

### Backup branch pre-STT-fix
Creato `backup/pre-stt-fix-20260418` prima della sessione STT come snapshot rollback.

### Logo Parlia nel topbar home
Sostituiti `.logo-mark` + `.logo-text` + `.beta-badge` con una singola immagine **`parlia-logo.webp`** (29 KB) fornita dall'utente via upload diretto su GitHub.

Dettagli implementativi:
- `<img class="topbar-logo" src="parlia-logo.webp?v=...">` al posto dei 3 div
- CSS: `height: 62px` + `max-width: 70%` + `object-fit: contain`
- **`mix-blend-mode: multiply`** per eliminare lo sfondo bianco non-trasparente del WEBP senza dover rigenerare il file — i pixel bianchi si fondono col `#f5f6fa` della topbar diventando invisibili, colori scuri/saturi preservati
- **`--top-h`**: `56px` → `72px` per dare respiro verticale al logo più grande. Propaga automaticamente a `.pages-wrap` `.ptr-indicator` `.settings-menu` che già usavano la variabile
- CSS `.logo-mark` / `.logo-text` / `.beta-badge` lasciati nel file ma non più referenziati — facile revert

### File nuovi / toccati parte 3
- **Nuovi**:
  - `parlia-logo.webp` (asset logo)
- **Modificati**:
  - `home.html` (topbar rewritten, `--top-h` 56→72, nuovo `.topbar-logo` CSS)
  - `logopedia.js` (normPhonetic + matchShortSound + displayHeard + stopRecord fix + maxAlternatives 6)
  - `logopedia.html` (cache-bust)

---

## Istruzioni per Claude Code
- Prima di qualsiasi modifica, fai sempre un commit git con messaggio "backup pre-modifica"
- Dopo ogni sessione di lavoro, fai un commit con le modifiche fatte
- Non modificare mai laura.parlia.app o i file dell'app di Laura
- Deploy: basta `git push` - Cloudflare fa il resto automaticamente!
