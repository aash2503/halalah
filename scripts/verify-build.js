/* ==========================================================================
   Post-build guard.
   --------------------------------------------------------------------------
   canvaslink.app accepts exactly ONE html file, so a build that quietly emits
   a sibling asset — or leaves a CDN reference in — would break in production
   while working perfectly in `vite preview`. Fail the build instead.
   Run automatically by `npm run build`.
   ========================================================================== */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const ALLOWED_HOSTS = [
  'svnagkwvpenklcgbwrvc.supabase.co',   // the data API
  'data.gov.sg',                        // MUIS prayer timetable (open data)
  'server.arcgisonline.com',            // map tiles (Esri dark gray base, keyless)
  'www.w3.org',                         // SVG/xlink namespaces, not a request
  'bugs.chromium.org',                  // URL inside a Leaflet CSS comment
  'bugzilla.mozilla.org',               // URL inside a Leaflet CSS comment
  'halal.muis.gov.sg',                  // establishment logos, <img> only
  'www.google.com',                     // directions hand-off
  'leafletjs.com',                      // licence comment
  'github.com',                         // licence comment
  'openstreetmap.org',                  // attribution link
];

let failed = false;
const fail = m => { console.error('  ✗ ' + m); failed = true; };
const pass = m => console.log('  ✓ ' + m);

// 1. exactly one file in dist
const files = readdirSync(DIST).filter(f => !f.startsWith('.')).sort();
const named = files.find(f => /^halalah-v[\d.]+\.html$/.test(f));
files.length === 2 && files.includes('index.html') && named
  ? pass(`dist holds index.html + ${named} (identical; upload the named one)`)
  : fail(`dist should hold index.html and one halalah-vX.Y.html, found: ${files.join(', ')}`);

const html = readFileSync(join(DIST, 'index.html'), 'utf8');

// 2. nothing loaded from a sibling file
const localRefs = [...html.matchAll(/(?:src|href)="(?!data:|https?:|#)([^"]+)"/g)].map(m => m[1]);
localRefs.length === 0
  ? pass('no local file references (everything inlined)')
  : fail(`local references would 404 on the host: ${localRefs.join(', ')}`);

// 3. no unexpected remote hosts
const hosts = [...new Set([...html.matchAll(/https?:\/\/([^/"'\s)]+)/g)].map(m => m[1]))];
const unexpected = hosts.filter(h => !ALLOWED_HOSTS.includes(h));
unexpected.length === 0
  ? pass(`remote hosts limited to the expected ${hosts.length}`)
  : fail(`unexpected remote host(s): ${unexpected.join(', ')}`);

// 4. the pieces that must be inlined really are
[['<script', 'inline script'], ['<style', 'inline style'],
 ['data:font/woff2', 'embedded pixel font'], ['data:image/png', 'embedded icons']]
  .forEach(([needle, label]) => html.includes(needle)
    ? pass(`${label} present`)
    : fail(`${label} MISSING`));

// 5. a module script is a canvaslink hazard (it serves under a CSP sandbox)
/<script[^>]*type="module"/.test(html)
  ? fail('script is still type="module" — fragile under canvaslink\'s CSP sandbox')
  : pass('classic <script> (safe under a CSP sandbox)');

// 5b. a classic script in <head> MUST be deferred or it runs before <body>
html.indexOf('<script>') > html.indexOf('<div id="app"')
  ? pass('script sits after the markup (DOM exists when it runs)')
  : fail('inline script runs before <body> — Leaflet will fail with "Map container not found"');

// 6. the anon key is publishable, but a secret key never belongs here
/sb_secret_|service_role/.test(html)
  ? fail('a SECRET key is present — never ship service_role / sb_secret_')
  : pass('no secret key in the bundle');

const kb = Math.round(statSync(join(DIST, 'index.html')).size / 1024);
console.log(`\n  ${kb} KB — upload  dist/${named}  to canvaslink.`);
console.log(`  (NOT the index.html at the project root — that is the source shell.)\n`);
process.exit(failed ? 1 : 0);
