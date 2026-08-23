# HALALAH

Singapore halal food locator. Retro-game UI over the MUIS halal registry.

## The one rule

**The host (canvaslink.app) accepts exactly ONE html file.**

Upload **`dist/halalah-vX.Y.html`**.

There are two files named `index.html` in this project and only one of them
works. The one at the **project root is the Vite source shell** — 15 KB, no CSS,
and a `<script src="/src/main.js">` that 404s on any host. Uploading it renders
as unstyled markup that looks like the host mangled the file; it has happened.
The build therefore emits a version-stamped copy so the right file is
unmistakable in a file dialog, and the source shell now shows a full-screen
"DO NOT UPLOAD" banner if it is ever served directly.

`npm run build` fails if anything would end up as a sibling file, reference a
CDN, lose an inlined asset, ship a module script, place the script before the
markup, or contain a secret key.

```bash
npm install
npm run dev      # http://localhost:5180, hot reload
npm run build    # -> dist/halalah-vX.Y.html  (upload this)  + verification
npm run verify   # re-run the checks against an existing build
```

## Layout

```
index.html          Vite entry — markup only
src/
  main.js           wiring + the two dependency-cycle breaks
  config.js         every constant (Supabase, schemes, thresholds, gazetteer)
  util.js           pure helpers — no DOM, no state
  state.js          shared mutable state (S) + progress/save
  filters.js        map filter predicate + apply
  geo.js            geolocation, live scan, proximity encounters
  boot.js           cache-first startup, registry diff, PWA manifest
  data/  api.js     Supabase REST + the nearby RPC
         cache.js   IndexedDB snapshot
         model.js   grouping, venues, brands
  map/   map.js     Leaflet, zones, clustering, markers
  ui/    sheet.js search.js wheel.js near.js log.js card.js ar.js
         share.js toast.js dialog.js
  styles/app.css    vendor CSS + brand kit
  assets/           icons + pixel font (inlined at build)
scripts/verify-build.js
archive/            previously shipped builds
```

### Import direction

`config / util / state` → `data` → `map` → `ui`. Where a lower layer must call
a higher one, the higher one **registers a callback** in `main.js` rather than
importing downward:

- `map` needs the sheet on a marker tap → `onGroupTap(handleGroupTap)`
- `state` needs the card to redraw → `onProgressChange(refreshProgressUI)`

`appUrl`/`spotLink` live in `util.js` (not `sheet.js`) for the same reason —
`share.js` needs them and `sheet.js` already imports `share.js`.

## Data notes

Supabase (Postgres + PostGIS), queried directly from the browser, no backend.
The anon key is **publishable**: RLS allows reads and rejects writes (an anon
INSERT returns Postgres `42501`). Never put a `service_role` / `sb_secret_` key
in this repo.

Things measured about this dataset that shaped the UI:

- **Coordinate stacking is severe.** Geocoding is postal-code level, so 1,582
  eat-in rows collapse to 736 unique coordinates, worst case 26 establishments
  on one point. Never render one marker per row — group by coordinate. The AR
  view groups for the same reason.
- **Venue names** are recoverable from the address (text between the unit
  number and the postal code) for ~82% of stacked buildings.
- **Chains are real but so are false ones.** 79 names appear 3+ times, but
  "CHICKEN RICE", "MALAY KITCHEN" etc. are generic stall descriptions. The
  stop-list plus a "2+ words" rule cuts 79 → 60. Labelled "same name", never
  asserted as a franchise.
- **No hours, cuisine, price or ratings exist.** Anything implying them was
  removed rather than faked.
- PostgREST silently caps responses at 1,000 rows — page with `Range`.
- The logo host sends no CORS headers: `<img src>` only, never fetch/canvas.

## Debugging

`window.__HALALAH` exposes `{ S, boot, handleDeepLink, renderSyncStamp }` — the
module internals are otherwise unreachable from the console once bundled.
A top-level error trap writes startup failures into the landing screen instead
of leaving the UI frozen on "BOOTING…".
