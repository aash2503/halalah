import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/* ==========================================================================
   HALALAH build
   --------------------------------------------------------------------------
   The host (canvaslink.app) accepts exactly ONE html file, so everything —
   JS, CSS, fonts, icons — has to end up inlined in dist/index.html.
   viteSingleFile handles JS/CSS; assetsInlineLimit forces the font and PNG
   icons to base64 rather than emitting sibling files.
   Upload dist/index.html. Never upload the source index.html at the root.
   ========================================================================== */
export default defineConfig({
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    /* Minify with terser purely so we can cap line length. esbuild emits the
       whole bundle as one ~190,000-character line, which hangs browser-based
       editors and upload fields (and makes the file impossible to open and
       eyeball). Same output, just wrapped. */
    /* Leave CSS unminified: minifying it collapses every rule onto one line,
       and the embedded font's data URI rides along, producing a 63k line. */
    cssMinify: false,
    minify: 'terser',
    terserOptions: {
      format: { max_line_len: 500 },
    },
    assetsInlineLimit: 100 * 1024 * 1024,   // inline everything, whatever the size
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
  server: { port: 5180, open: false },
});
