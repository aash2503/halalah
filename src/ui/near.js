import { S, hasVisited, hasSaved } from '../state.js';
import { SCHEME_EAT } from '../config.js';
import { fmtDist, escapeHtml } from '../util.js';
import { subMeta } from '../data/model.js';
import { spotPinHtml, map } from '../map/map.js';
import { startTracking } from '../geo.js';
import { showToast } from './toast.js';
import { openSpot } from './sheet.js';
import { shareShortlist } from './share.js';

/* ==========================================================================
   12b. NEAR ME LIST
   --------------------------------------------------------------------------
   "What's closest?" is the most common question this app answers, and the map
   alone is a poor way to ask it. Distance-sorted, grouped by venue so a mall
   doesn't flood the list with 26 identical-distance rows.
   ========================================================================== */
const nearModal = document.getElementById('nearModal');
let nearCat = 'all';

function nearRows(){
  if(!S.playerPos) return [];
  let pool = S.ALL.filter(s => s.scheme === SCHEME_EAT && s._dist != null);
  if(nearCat === 'saved') pool = S.ALL.filter(s => hasSaved(s.id) && s._dist != null);
  else if(nearCat !== 'all') pool = pool.filter(s => String(s.sub_scheme) === nearCat);
  return pool.sort((a,b) => a._dist - b._dist).slice(0, 60);
}
function buildNear(){
  const body = document.getElementById('nearBody');
  if(!S.playerPos){
    body.innerHTML = `<div class="empty">TURN ON SCAN TO SEE<br>WHAT'S CLOSEST TO YOU
      <div class="acts"><div class="a btn btn-g" id="nearScan" style="font-size:8px">TURN ON SCAN</div></div></div>`;
    const b = document.getElementById('nearScan');
    if(b) b.addEventListener('click', () => { nearModal.classList.remove('open'); startTracking(); });
    return;
  }
  const rows = nearRows();
  if(!rows.length){ body.innerHTML = `<div class="empty">NOTHING MATCHES<br>TRY ANOTHER CATEGORY</div>`; return; }

  // Collapse by venue so one mall is one row, with its own count.
  const seenKey = new Set(); const out = [];
  for(const s of rows){
    const k = s.lat + ',' + s.lng;
    if(seenKey.has(k)) continue;
    seenKey.add(k);
    const g = S.GROUP_BY_KEY[k];
    out.push({ s, g, siblings: g ? g.items.length - 1 : 0 });
    if(out.length >= 30) break;
  }
  body.innerHTML = out.map(({s,siblings}) => {
    const m = subMeta(s);
    return `<div class="log-row" data-id="${s.id}">
      <div class="no" style="color:var(--yellow); width:46px;">${fmtDist(s._dist)}</div>
      <div class="sprite">${spotPinHtml(s)}</div>
      <div style="min-width:0;">
        <div class="nm">${escapeHtml((s.name||'').toUpperCase())}</div>
        <div class="sub" style="color:${m.color}">${m.label}${siblings>0?` · +${siblings} HERE`:''}${hasSaved(s.id)?' · ★':''}</div>
      </div>
      <div class="got">${hasVisited(s.id)?'✔':''}</div></div>`;
  }).join('');
  body.querySelectorAll('.log-row').forEach(row => {
    row.addEventListener('click', () => {
      const s = S.BY_ID[row.dataset.id]; if(!s) return;
      nearModal.classList.remove('open');
      map.setView([s.lat,s.lng],17);
      setTimeout(() => openSpot(s,null), 300);
    });
  });
}
document.querySelectorAll('#nearCats .filter-pill').forEach(p => {
  p.addEventListener('click', () => {
    document.querySelectorAll('#nearCats .filter-pill').forEach(x => x.dataset.active='false');
    p.dataset.active='true'; nearCat = p.dataset.cat; buildNear();
  });
});
document.getElementById('openNear').addEventListener('click', () => { buildNear(); nearModal.classList.add('open'); });
document.getElementById('nearClose').addEventListener('click', () => nearModal.classList.remove('open'));
document.getElementById('nearShare').addEventListener('click', () => {
  const rows = nearRows().slice(0,10);
  if(!rows.length){ showToast('NOTHING TO SHARE'); return; }
  shareShortlist(rows, 'NEAR ME');
});

export { buildNear, nearModal };
