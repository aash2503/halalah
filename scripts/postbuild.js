/* ==========================================================================
   Post-build fixups for the canvaslink host.
   --------------------------------------------------------------------------
   1. Vite always writes <script type="module" crossorigin> for the entry, even
      when rollup emits a classic IIFE. canvaslink serves under a CSP `sandbox`
      directive, where a module script is markedly more fragile than a classic
      one — the pre-Vite build that worked there used a plain <script>.

   2. A classic script must then MOVE to the end of <body>. A module is
      implicitly deferred; a classic one is not, and `defer` is ignored on
      INLINE scripts — so left in <head> it runs before <body> exists and
      Leaflet dies with "Map container not found".

   Refuses to demote if the bundle still contains ES module syntax, since that
   would break the app silently.
   ========================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'dist/index.html';
let html = readFileSync(FILE, 'utf8');

const m = html.match(/<script[^>]*>[\s\S]*?<\/script>/);
if (!m) { console.error('  ✗ no inline script found'); process.exit(1); }
const block = m[0];
const code = block.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');

if (/(^|\n)\s*(import|export)[\s{]/.test(code) || code.includes('import.meta')) {
  console.error('  ✗ bundle still uses ES module syntax — check output.format is "iife".');
  process.exit(1);
}

// plain tag, and relocate to just before </body>
html = html.replace(block, '');
html = html.replace('</body>', `<script>${code}</script>\n</body>`);
html = html.replace(/<style\s+rel="stylesheet"\s+crossorigin>/g, '<style>');

writeFileSync(FILE, html);
console.log('  ✓ classic <script>, moved to end of <body>');

/* 3. Emit a DISTINCTLY NAMED copy.
      The Vite entry at the project root is also called index.html, and picking
      the wrong one in a file dialog uploads a 15 KB shell with no CSS and a
      404-ing module script — which renders as unstyled markup and looks like
      the host mangled it. A versioned filename removes the ambiguity. */
const ver = (html.match(/class="ver">V([\d.]+)</) || [,'0.0'])[1];
const named = `dist/halalah-v${ver}.html`;
writeFileSync(named, html);
console.log(`  ✓ upload copy: ${named}`);
