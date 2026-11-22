import { S, hasVisited } from '../state.js';
import { SCHEME_EAT, SUB_SCHEME, SLICES, SLICE_COLORS } from '../config.js';
import { fmtDist, escapeHtml, shuffle } from '../util.js';
import { fetchNearby } from '../data/api.js';
import { subMeta, buildGroups } from '../data/model.js';
import { map, renderGroups, flyBounds, L } from '../map/map.js';
import { showToast } from './toast.js';
import { openSpot } from './sheet.js';
import { shareShortlist } from './share.js';

/* ==========================================================================
   11. WHEEL — multi-select categories + scope
   ========================================================================== */
let wheelCats = new Set(), wheelScope = 'near', wheelRadius = 1000;
let wheelPool = [], wheelPick = null, wheelAngle = 0, spinning = false;
let wheelSlices = SLICES;              // slices actually drawn — matches the pool size


async function buildCandidates(){
  const cats = [...wheelCats];
  if(wheelScope === 'near'){
    if(!S.playerPos) return { rows:[], note:'Turn on scan first' };
    try{
      let rows = await fetchNearby(S.playerPos.lat, S.playerPos.lng, {
        radius:wheelRadius, limit:120, schemes:[SCHEME_EAT] });
      if(cats.length){
        // The RPC returns sub_scheme_text, so match category via the loaded row.
        rows = rows.filter(r => { const f = S.BY_ID[r.id]; return f && cats.includes(String(f.sub_scheme)); });
      }
      if(!rows.length) return { rows:[], note:`Nothing${cats.length?' of that kind':''} within ${fmtDist(wheelRadius)}` };
      return { rows:shuffle(rows).slice(0,SLICES), note:`Within ${fmtDist(wheelRadius)} of you` };
    }catch(err){ return { rows:[], note:'Lookup failed — check connection' }; }
  }

  let pool = S.ALL.filter(s => s.scheme === SCHEME_EAT);
  if(cats.length) pool = pool.filter(s => cats.includes(String(s.sub_scheme)));
  let note = cats.length ? cats.map(c => (SUB_SCHEME[c]||{}).label).join(' + ') : 'Any eat-in';

  if(wheelScope === 'view'){
    const b = map.getBounds();
    pool = pool.filter(s => b.contains([s.lat,s.lng]));
    note += ' · This map view';
  } else if(wheelScope === 'unseen'){
    pool = pool.filter(s => !hasVisited(s.id));
    note += ' · Unvisited';
  } else note += ' · Island-wide';

  if(!pool.length) return { rows:[], note:'Nothing matches those filters' };
  if(S.playerPos){
    pool.sort((a,b) => (a._dist ?? Infinity) - (b._dist ?? Infinity));
    pool = pool.slice(0, 40);
  }
  return { rows:shuffle(pool.slice()).slice(0,SLICES), note };
}

function polar(cx,cy,r,deg){ const a=(deg-90)*Math.PI/180; return [cx+r*Math.cos(a), cy+r*Math.sin(a)]; }
async function drawWheel(){
  const { rows, note } = await buildCandidates();
  wheelPool = rows; wheelPick = null;
  const svg = document.getElementById('wheelSvg');
  const cx=100, cy=100, r=96;

  /* Draw exactly as many slices as we have picks. A fixed 8 left blank wedges
     whenever a tight radius or category combo returned fewer, and the pointer
     could then stop on nothing. */
  wheelSlices = Math.max(1, wheelPool.length);
  const seg = 360/wheelSlices;
  let out = '';

  if(!wheelPool.length){
    out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#1D2513" stroke="#3F4B2E" stroke-width="2.5"/>`;
  } else if(wheelSlices === 1){
    // One pick: a full disc, because a 360° arc path collapses to nothing.
    out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${SLICE_COLORS[0]}" stroke="#10140B" stroke-width="2.5"/>`;
  }

  for(let i=0; i<wheelPool.length && wheelSlices > 1; i++){
    const a0=i*seg, a1=(i+1)*seg;
    const [x0,y0]=polar(cx,cy,r,a0), [x1,y1]=polar(cx,cy,r,a1);
    const large = seg > 180 ? 1 : 0;
    out += `<path d="M${cx},${cy} L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large},1 ${x1.toFixed(2)},${y1.toFixed(2)} Z"
             fill="${SLICE_COLORS[i % SLICE_COLORS.length]}" stroke="#10140B" stroke-width="2.5"/>`;
  }
  // Labels drawn after all wedges so no slice can overlap a neighbour's text.
  for(let i=0;i<wheelPool.length;i++){
    const mid = wheelSlices === 1 ? 0 : i*seg + seg/2;
    const flip = mid > 180;
    const [tx,ty] = polar(cx, cy, wheelSlices === 1 ? 0 : r*0.9, mid);
    const nm = (wheelPool[i].name||'').toUpperCase();
    out += `<text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}"
              transform="rotate(${(wheelSlices===1?0:(flip?mid+90:mid-90)).toFixed(1)},${tx.toFixed(2)},${ty.toFixed(2)})"
              text-anchor="${wheelSlices===1?'middle':(flip?'start':'end')}" dominant-baseline="middle"
              font-family="'Press Start 2P',cursive" font-size="5"
              fill="#10140B">${escapeHtml(nm.length>12?nm.slice(0,11)+'.':nm)}</text>`;
  }
  out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#10140B" stroke-width="5"/>`;
  svg.innerHTML = out;
  document.getElementById('wheelResult').innerHTML =
    `<div class="rn">${wheelPool.length?'Ready?':'No picks'}</div>` +
    `<div class="rs">${escapeHtml(note)}${wheelPool.length?` · ${wheelPool.length} on the wheel`:''}</div>`;
}
function spinWheel(){
  if(spinning || !wheelPool.length) return;
  spinning = true;
  const svg = document.getElementById('wheelSvg');
  const idx = Math.floor(Math.random()*wheelPool.length), seg = 360/wheelSlices;

  /* Land slice `idx` under the 12 o'clock pointer. This must be computed as an
     ABSOLUTE target: adding a fresh offset each spin (the old behaviour) never
     cancelled the previous one, so from the second spin the wheel stopped on
     the wrong slice while the result text still used `idx`. */
  const target  = (360 - (idx*seg + seg/2)) % 360;
  const current = ((wheelAngle % 360) + 360) % 360;
  wheelAngle += 360*5 + ((target - current + 360) % 360);

  svg.classList.add('spinning');
  svg.style.transform = `rotate(${wheelAngle}deg)`;
  document.getElementById('wheelHub').textContent = '...';
  setTimeout(() => {
    spinning = false;
    wheelPick = wheelPool[idx];
    document.getElementById('wheelHub').textContent = 'SPIN';
    const full = S.BY_ID[wheelPick.id] || wheelPick, m = subMeta(full);
    const d = wheelPick.distance_m ?? full._dist;
    document.getElementById('wheelResult').innerHTML = `
      <div class="rn">${escapeHtml((wheelPick.name||'').toUpperCase())}</div>
      <div class="rs">${m.label}${d!=null?' · '+fmtDist(d)+' away':''}</div>`;
    showToast('Makan: ' + (wheelPick.name||'').toUpperCase());
  }, 4300);
}
document.getElementById('spinBtn').addEventListener('click', spinWheel);
document.getElementById('wheelHub').addEventListener('click', spinWheel);
document.getElementById('wheelGo').addEventListener('click', () => {
  if(!wheelPick){ showToast('Spin first!'); return; }
  const full = S.BY_ID[wheelPick.id] || wheelPick;
  wheelModal.classList.remove('open');
  map.setView([full.lat, full.lng], 17);
  setTimeout(() => openSpot(full, null), 300);
});
document.getElementById('wheelMore').addEventListener('click', () => {
  if(!wheelPool.length){ showToast('Nothing to show'); return; }
  const ids = new Set(wheelPool.map(r => r.id));
  const rows = S.ALL.filter(s => ids.has(s.id));
  wheelModal.classList.remove('open');
  renderGroups(buildGroups(rows));
  if(rows.length){
    map.fitBounds(L.latLngBounds(rows.map(s => [s.lat,s.lng])).pad(.25), { maxZoom:16 });
  }
  showToast(`Showing ${rows.length} shortlisted`);
});
document.getElementById('wheelShare').addEventListener('click', () => {
  if(!wheelPool.length){ showToast('Spin first!'); return; }
  const rows = wheelPool.map(r => S.BY_ID[r.id] || r);
  shareShortlist(rows, wheelScope === 'near' ? `WITHIN ${fmtDist(wheelRadius)}` : 'SHORTLIST');
});
document.querySelectorAll('#wheelCats .filter-pill').forEach(p => {
  p.addEventListener('click', () => {          // multi-select
    const c = p.dataset.cat;
    if(wheelCats.has(c)){ wheelCats.delete(c); p.dataset.active='false'; }
    else { wheelCats.add(c); p.dataset.active='true'; }
    drawWheel();
  });
});
document.querySelectorAll('#wheelScope .filter-pill').forEach(p => {
  p.addEventListener('click', () => {
    document.querySelectorAll('#wheelScope .filter-pill').forEach(x => x.dataset.active='false');
    p.dataset.active='true'; wheelScope = p.dataset.scope; drawWheel();
  });
});
document.querySelectorAll('#radiusRow .filter-pill').forEach(p => {
  p.addEventListener('click', () => {
    document.querySelectorAll('#radiusRow .filter-pill').forEach(x => x.dataset.active='false');
    p.dataset.active='true'; wheelRadius = +p.dataset.radius;
    if(wheelScope === 'near') drawWheel();
  });
});
const wheelModal = document.getElementById('wheelModal');
document.getElementById('openWheel').addEventListener('click', () => { wheelModal.classList.add('open'); drawWheel(); });
document.getElementById('wheelClose').addEventListener('click', () => wheelModal.classList.remove('open'));

export { drawWheel, spinWheel, wheelModal };
