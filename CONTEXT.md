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
- `home.html` — app principale con 4 pagine a swipe (Inicio / AAC / Rehab / Yo)
- `profile.html` — schermata profilo
- `comunicador.html` — comunicador AAC standalone
- `roadmap.html` — roadmap interna (accessibile da ⚙️ nella home)
- `manifest.json` — PWA manifest (start_url: /)
- `sw.js` — service worker

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
- **Tutorial interattivo** (card viola "Tutorial de la app" nella home page0):
  - Banner card in page0 → avvia walkthrough in-home
  - Si auto-avvia dopo onboarding (flag localStorage `parlia_show_tutorial`)
  - 6 step con spotlight (box-shadow cutout) su elementi UI reali:
    1. Benvenuto (schermo scuro)
    2. Spotlight su #aiHeroWrap (AI hero)
    3. Animazione swipe 👆 + navigazione reale a page1 e ritorno
    4. Naviga a page1 (AAC), spotlight su #catScroll
    5. Resta in page0, spotlight su .profile-card
    6. Fine (schermo scuro)
  - Tutto in spagnolo: Saltar / Siguiente → / ¡Empezar! 🚀

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

## Sessione 12 aprile 2026 (mattina)
- Aggiunto tutorial interattivo con spotlight su elementi UI reali
- Tab "Yo" rinominata "Perfil", click → va a profile.html
- Copyright spostato dentro la navbar (bottom: 3px, absolute)
- Nav-h aumentata da 72px a 80px per far vedere il copyright
- Profile.html: aggiunte sezioni profilo arricchite (hobby, interessi, famiglia, info personali)
- Deploy via GitHub → Cloudflare Pages (auto-deploy su push a main)
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
