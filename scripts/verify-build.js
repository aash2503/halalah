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
  '{s}.basemaps.cartocdn.com',          // Leaflet tile template ({s} = subdomain)
  'basemaps.cartocdn.com',              // map tiles, fetched at runtime by Leaflet
  'www.w3.org',                         // SVG/xlink namespaces, not a request
  'bugs.chromium.org',                  // URL inside a Leaflet CSS comment
  'bugzilla.mozilla.org',               // URL inside a Leaflet CSS comment
  'halal.muis.gov.sg',                  // establishment logos, <img> only
  'www.google.com',                     // directions hand-off
  'leafletjs.com',                      // licence comment
  'github.com',                         // licence comment
  'openstreetmap.org',                  // attribution link
  'carto.com',                          // attribution link
];

let failed = false;
const fail = m => { console.error('  ✗ ' + m); failed = true; };
const pass = m => console.log('  ✓ ' + m);

// 1. exactly one file in dist
const files = readdirSync(DIST).filter(f => !f.startsWith('.'));
files.length === 1 && files[0] === 'index.html'
  ? pass('dist contains exactly index.html')
  : fail(`dist should contain only index.html, found: ${files.join(', ')}`);

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

// 5. the anon key is publishable, but a secret key never belongs here
/sb_secret_|service_role/.test(html)
  ? fail('a SECRET key is present — never ship service_role / sb_secret_')
  : pass('no secret key in the bundle');

const kb = Math.round(statSync(join(DIST, 'index.html')).size / 1024);
console.log(`\n  dist/index.html — ${kb} KB — upload THIS file to canvaslink.\n`);
process.exit(failed ? 1 : 0);
