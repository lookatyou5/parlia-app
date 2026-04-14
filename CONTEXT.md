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
