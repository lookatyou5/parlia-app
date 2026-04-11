# Deploy con Wrangler

Per deployare Parlia su Cloudflare Pages usando Wrangler:

## Setup iniziale (una sola volta)

1. **Installa Node.js** (se non l'hai già)
   - Scarica da https://nodejs.org (versione LTS consigliata)

2. **Installa wrangler globalmente**
   ```bash
   npm install -g wrangler
   ```

3. **Autenticati con Cloudflare**
   ```bash
   wrangler login
   ```
   - Ti aprirà il browser per autenticarti
   - Autorizza l'accesso al tuo account Cloudflare

4. **Installa dipendenze locali** (opzionale, ma consigliato)
   ```bash
   npm install
   ```

## Deploy

Ogni volta che vuoi deployare le ultime modifiche:

```bash
wrangler deploy
```

Oppure, se vuoi prima testare localmente:

```bash
npm run dev
```
- Si avvierà un server locale su `http://localhost:8788`
- Puoi testare le modifiche prima di deployare

## Configurazione

- **Progetto**: parlia-app (Cloudflare Pages)
- **File config**: `wrangler.toml`
- **File config npm**: `package.json`
- **URL**: https://app.parlia.app

## Note

- I file HTML, CSS, JS sono nella root (no cartelle)
- Wrangler leggerà tutti i file nella root e li deployerà
- La configurazione del dominio è già settata in `wrangler.toml`
