# Ledger — Daily Project Tracker

A daily-action tracker for keeping every project you're running moving forward,
even by one small step a day. Task backlogs, weekday-only streaks, miss
detection, a weekly rollup, archive/reorder/search, backfill for missed days,
and a PTO/holiday skip that doesn't break your streaks.

This is a installable web app (PWA) — it runs in any browser and can also be
installed like a native app on macOS, Windows, iOS, and Android. All data is
stored locally in your browser (`localStorage`); nothing is sent to a server.

## Run it locally

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`.

## Deploy to GitHub Pages (automatic)

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages**, and under "Build and deployment ▸
   Source" select **GitHub Actions**.
3. Push to `main` (or run the "Deploy to GitHub Pages" workflow manually from
   the **Actions** tab). The included workflow (`.github/workflows/deploy.yml`)
   builds the app and publishes it automatically.
4. Your app will be live at `https://<your-username>.github.io/<repo-name>/`.

Every subsequent push to `main` redeploys automatically.

## Deploy to GitHub Pages (manual, no Actions)

```bash
npm run build
npx gh-pages -d dist
```

(Requires `npm install -D gh-pages` first, and Pages source set to the
`gh-pages` branch instead of GitHub Actions.)

## Installing it as an app

Once it's live over HTTPS (GitHub Pages is HTTPS by default):

- **Desktop Chrome/Edge**: an install icon appears in the address bar. Click
  it, or use the browser menu → "Install Ledger…"
- **macOS Safari**: File → Add to Dock (Safari 17+), or Share → Add to Dock.
- **iOS/iPadOS Safari**: Share → Add to Home Screen.
- **Android Chrome**: menu → "Install app" or "Add to Home screen".

Installed, it opens in its own window with no browser chrome, has its own
icon, and works offline (the app shell is cached by a service worker — your
data was always local anyway).

## Data storage — read this

Data lives in `localStorage`, scoped to the exact origin you load the app
from:

- It's per-browser, per-device. Opening the GitHub Pages URL in a different
  browser or on your phone starts with an empty ledger — it does not sync.
- Clearing site data/cookies for that origin, or using a private/incognito
  window, will not persist data across sessions.
- There's no built-in backup/export yet. If that becomes a problem, the
  cleanest fix is swapping `src/storage.js` for an IndexedDB-backed version
  (same `get`/`set` shape, more headroom) or wiring in a simple JSON
  export/import button — ask and it can be added.

If you serve the app from a *different* URL later (e.g. move from
`username.github.io/ledger` to a custom domain), that counts as a different
origin to the browser and you'll start with a fresh, empty ledger there too.

## Project structure

```
src/
  App.jsx        the entire app (state, logic, UI)
  storage.js      localStorage-backed persistence (swap this to change storage backend)
  main.jsx        React entry point
public/
  icon-192.png, icon-512.png, maskable-icon-512.png   PWA icons
  apple-touch-icon.png, favicon.png
vite.config.js    build config + PWA manifest/service-worker generation
.github/workflows/deploy.yml   auto-deploy to GitHub Pages on push
```

## Updating the icons

Icons were generated with `gen_icons.py` (Pillow) as simple blue rounded
squares with a white checkmark. Regenerate or replace the PNGs in `public/`
with your own design at the same filenames/sizes and rebuild.
