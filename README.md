# Rupiq — know where your money goes. Before it's gone.

A private, offline-capable money tracker for everyday Indian households. Static web app (PWA), **no backend, no accounts, no analytics, no third-party services**. Your data never leaves the device.

## Run locally
```bash
npm start            # http://localhost:8080  (plain Node static server, zero dependencies)
npm test             # 11 unit tests (money, IST dates, budgets, insights, import/export)
npm install && npm run test:e2e   # 24 real-browser checks (needs Chrome; CHROME=/path/to/chrome to override)
```
Any static server works (`python3 -m http.server`). Service worker/offline needs `localhost` or https.

## Deploy to Netlify (nothing is deployed automatically)
1. Create a **new, empty** GitHub repo and push this folder (do not reuse an existing repo).
2. Netlify → *Add new site → Import from Git* → pick that repo. `netlify.toml` sets build `npm run build`, publish `dist`.
   (Or drag-and-drop the output of `npm run build` into Netlify Drop.)
3. Cost: free tier is plenty — it only serves static files. No database, no functions.

## Architecture
| Choice | Why |
|---|---|
| Vanilla ES modules, no framework/bundler, no runtime deps | Tiny, fast on low-end Android, nothing to maintain or break |
| Local-first, IndexedDB (localStorage fallback) | Zero cost, zero vendor lock-in, max privacy |
| Integer **paise** for money | No floating-point drift in totals |
| Dates as IST `YYYY-MM-DD` strings | A 11:50pm spend can't slip into the next month |
| Rule-based insights (`src/calc.js`) | Each insight needs real data or it isn't shown |
| CSP `default-src 'self'`, all user text escaped | No inline scripts, no external requests |

```
index.html  styles.css  sw.js  manifest.webmanifest  theme-init.js
src/  money.js dates.js data.js calc.js store.js app.js
tests/  unit.test.js  e2e.mjs        scripts/  serve.js build.js
```
Data model (one document in IndexedDB key `main`; demo data in separate key `demo`): `profile`, `categories`, `budgets{YYYY-MM:{total,alloc}}`, `txns[]`, `prefs`. Schema is versioned (`v`) for future migrations; app updates never touch stored data.

## Data storage & privacy — what users are told
- Data lives **only in this browser on this device**. Not backed up, not synced.
- Clearing browser data, uninstalling, or switching phones erases it unless a JSON backup was exported.
- Rupiq asks the browser for persistent storage, shows its status, and nudges for a backup (30+ days, 15+ transactions).
- Import/restore validates files, skips bad records, drops duplicate IDs, and keeps a one-step **safety copy** (undo) before replace/merge.
- *Delete everything* wipes all data including the safety copy. Export: JSON (full) and CSV (formula-safe).
- Money definitions are separated in the UI: money in, money out, budget, planned-in-categories, budget left. Budget left ≠ bank balance, and the app says so.

## Test results
- Unit: 11/11 pass. E2E (Chrome, 360px phone viewport): 24/24 pass — onboarding, add/edit/delete/undo, validation, HTML-escaping, budget & allocation maths, reload persistence, delete-all, export → wipe → restore, corrupt-file rejection, offline load, no overflow at 320px, demo isolation, zero console errors.

## Known limitations
- Single device only; no sync, no household sharing (needs real identities, permissions and a server — deferred, not faked).
- Not tested on real iPhone/Android hardware or Safari/Firefox yet (Chrome only) — do a pilot pass on a few phones before sharing widely. Safari may evict site data after ~7 days of non-use unless installed to the Home Screen.
- No recurring bills, no multi-currency conversion (currency is a display setting), English only.
- Icons are emoji (render slightly differently per OS). Insights need a week or so of data and a budget to appear.
- PNG icons were generated from the SVG; replace with final brand artwork when ready.
- I could not browse Gist Money and other references live; the design follows general product-design principles, not copied layouts.

## Roadmap
1. **Pilot** with 10–20 households; watch where entry is slow. 2. Recurring bills & subscriptions. 3. Savings goals. 4. Quick-add from a home-screen shortcut / voice & natural-language entry ("250 auto"). 5. Hindi/Telugu/Tamil UI. 6. Optional encrypted sync + household sharing (needs a small self-hosted server and real auth — explicit approval and cost review first). 7. Optional, consent-based GA4 (no financial data).
