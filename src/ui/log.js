import { S, hasSeen, hasVisited, seenSet } from '../state.js';
import { escapeHtml, regionFor } from '../util.js';
import { subMeta } from '../data/model.js';
import { spotPinHtml, map } from '../map/map.js';
import { openSpot } from './sheet.js';

/* ==========================================================================
   13. FIELD LOG
   ========================================================================== */
const logModal = document.getElementById('logModal'), logList = document.getElementById('logList');
const LOG_PAGE = 150; let logShown = LOG_PAGE, logFilter = '';
function logDataset(){
  const q = logFilter.trim().toLowerCase();
  let rows = S.ALL;
  if(q) rows = rows.filter(s => (s.name||'').toLowerCase().includes(q) || (s.address||'').toLowerCase().includes(q));
  return rows.slice().sort((a,b) => (hasSeen(b.id)?1:0) - (hasSeen(a.id)?1:0));
}
function buildLog(reset){
  if(reset) logShown = LOG_PAGE;
  const rows = logDataset();
  if(!rows.length){
    logList.innerHTML = `<div class="empty">Nothing matches<br>Try a different word</div>`;
    document.getElementById('logMore').style.display = 'none'; return;
  }
  logList.innerHTML = rows.slice(0, logShown).map(s => {
    const seen = hasSeen(s.id), m = subMeta(s);
    return `<div class="log-row ${seen?'':'unseen'}" data-id="${s.id}">
      <div class="no">${s.postal||'—'}</div>
      <div class="sprite">${spotPinHtml(s)}</div>
      <div style="min-width:0;">
        <div class="nm">${seen?escapeHtml((s.name||'').toUpperCase()):'??????????'}</div>
        <div class="sub">${seen?m.label+' · '+regionFor(s.lat,s.lng):'Not registered'}</div>
      </div>
      <div class="got">${hasVisited(s.id)?'✔':''}</div></div>`;
  }).join('');
  logList.querySelectorAll('.log-row').forEach(row => {
    const s = S.BY_ID[row.dataset.id];
    if(!s || !hasSeen(s.id)) return;
    row.addEventListener('click', () => {
      logModal.classList.remove('open');
      map.setView([s.lat,s.lng],17);
      setTimeout(() => openSpot(s,null), 300);
    });
  });
  const more = document.getElementById('logMore');
  more.style.display = rows.length > logShown ? 'block' : 'none';
  more.textContent = `Load more (${rows.length - logShown} left)`;
  const pct = S.ALL.length ? Math.round(seenSet.size/S.ALL.length*100) : 0;
  document.getElementById('logProgressText').textContent = `${seenSet.size} / ${S.ALL.length}`;
  document.getElementById('logProgressFill').style.width = pct + '%';
}
document.getElementById('logMore').addEventListener('click', () => { logShown += LOG_PAGE; buildLog(false); });
let logDebounce = null;
document.getElementById('logSearch').addEventListener('input', e => {
  logFilter = e.target.value;
  clearTimeout(logDebounce);
  logDebounce = setTimeout(() => buildLog(true), 250);
});
document.getElementById('openLog').addEventListener('click', () => { buildLog(true); logModal.classList.add('open'); });
document.getElementById('logClose').addEventListener('click', () => logModal.classList.remove('open'));

export { buildLog, logModal };
