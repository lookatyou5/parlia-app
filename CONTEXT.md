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

## Ultima sessione (12 aprile 2026 — pomeriggio)
- Riordinati widget in home page0: AI Hero → Agenda → Obiettivo del giorno → Profile card → Tutorial banner
- Fix spotlight tutorial per il passo "Profilo":
  - Logica finale: aggiunge 200px paddingBottom temporaneo alla pagina per avere spazio di scroll
  - Calcola targetScroll per posizionare l'elemento APPENA SOPRA il pannello tutorial (20px margine)
  - Il pannello tutorial rimane SEMPRE in basso (rimosso wt-top logic)
  - rAF dopo lo scroll per misurare getBoundingClientRect() accurato
  - Cleanup del paddingBottom quando si cambia step o si chiude il tutorial
- Fix spotlight AI hero: funziona anche se page0 è scrollata (formula targetScroll gestisce scroll negativo → clamp a 0)
- Tutti i fix commitati e pushati su main → auto-deploy Cloudflare

## Note tecniche spotlight tutorial
- `.wt-ov`: position fixed; inset 0; z-index 400
- `.wt-dark`: background rgba off quando c'è spotlight
- `.wt-spotlight`: box-shadow 9999px crea il buio attorno; body trasparente mostra l'elemento sotto
- Scroll formula: `elTopInContent = r.top - pageTop + pageEl.scrollTop`, `targetScroll = elTopInContent - (desiredElemTop - pageTop)`
- desiredElemTop = `window.innerHeight - wtCardH - el.offsetHeight - 20`
- Padding 200px temporaneo su pageEl rimosso da `_wtCleanup()` chiamato in `closeTutorial()` e in `_wtRender()` prima di ogni step

## Istruzioni per Claude Code
- Prima di qualsiasi modifica, fai sempre un commit git con messaggio "backup pre-modifica"
- Dopo ogni sessione di lavoro, fai un commit con le modifiche fatte
- Non modificare mai laura.parlia.app o i file dell'app di Laura
- Deploy: basta `git push` - Cloudflare fa il resto automaticamente!
