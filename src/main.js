/* ==========================================================================
   HALALAH — entry point
   --------------------------------------------------------------------------
   Modules avoid import cycles by pointing one way: config/util/state at the
   bottom, then data, then map, then UI. Where a lower layer needs to call a
   higher one (map needing the sheet on a marker tap, state needing the card to
   redraw), the higher layer REGISTERS a callback here instead.
   ========================================================================== */
import './styles/app.css';

import { S, onProgressChange, syncBadgeBaseline } from './state.js';
import { onGroupTap, map } from './map/map.js';
import './ui/search.js';
import { handleGroupTap, closeSheet } from './ui/sheet.js';
import { refreshProgressUI } from './ui/card.js';
import './ui/wheel.js';
import { boot, handleDeepLink, goFullscreen, renderSyncStamp } from './boot.js';
import './ui/ar.js';
import './ui/near.js';
import './ui/log.js';
import { updatePosition, scanForEncounters, startTracking } from './geo.js';

/* --- break the two would-be cycles ------------------------------------- */
onGroupTap(handleGroupTap);          // map -> sheet
onProgressChange(refreshProgressUI); // state -> card

syncBadgeBaseline();

/* Bundled modules aren't global, so a thrown error during startup would leave
   the UI frozen on "BOOTING..." with nothing in view. Surface it instead. */
function fatal(where, err){
  console.error('[halalah]', where, err);
  const note = document.getElementById('loadNote');
  if(note){ note.classList.add('err'); note.textContent = 'STARTUP FAILED — ' + (err && err.message || err); }
  const st = document.getElementById('statusText');
  if(st) st.textContent = 'STARTUP FAILED';
}
window.addEventListener('error', e => fatal('error', e.error || e.message));
window.addEventListener('unhandledrejection', e => fatal('unhandledrejection', e.reason));

boot().catch(err => fatal('boot', err));

/* A single handle for debugging and for the verification battery — the module
   internals are otherwise unreachable from the console once bundled. */
window.__HALALAH = { S, boot, handleDeepLink, renderSyncStamp,
                     updatePosition, scanForEncounters, startTracking };
