import { S } from '../state.js';
import { SCHEME_EAT, AR_RADII, INDOOR_RADIUS_M } from '../config.js';
import { fmtDist, escapeHtml, bearing, titleCase } from '../util.js';
import { subMeta, venueName } from '../data/model.js';
import { map } from '../map/map.js';
import { showToast } from './toast.js';
import { openSpot, openGroup } from './sheet.js';
import { unitOf, levelLabel, levelRank } from '../util.js';

/* ==========================================================================
   FINDER — a compass that points, plus an indoor venue mode.
   --------------------------------------------------------------------------
   This replaces the camera AR overlay, which was fighting its own error
   budget. Measured on this data and typical phone hardware:

     · position uncertainty ~19 m (urban GPS ~15 m, plus the dataset's 4-dp
       coordinates quantising to ~11 m)
     · phone compasses drift 10-20 deg outdoors and far worse near steel
     · at 25 m that is ~42 deg of combined error against a 35 deg viewfinder
       half-width — the label could point at the wrong shop entirely

   An ARROW degrades gracefully where an overlay does not: 25 deg off still
   walks you to the right place. So the finder shows ONE target, its bearing,
   its live distance, and how uncertain the fix is.

   And 82% of eat-in spots share a coordinate with at least one other (45%
   with nine or more, largest stack 52). Inside such a building a bearing is
   meaningless — you are already there and what you want is the UNIT NUMBER.
   That is INDOOR MODE.
   ========================================================================== */

const $ = id => document.getElementById(id);
const finderModal = $('finderModal');

let open = false;
let heading = null;          // smoothed degrees from north
let orientHandler = null;
let radius = 500;
let targets = [];            // nearby buildings, nearest first
let idx = 0;
let indoorGroup = null;      // set when we are inside a venue
let indoorLevel = 'ALL';
let raf = 0, rafFallback = 0;   // coalesces compass events into one paint

/* ---- heading ---------------------------------------------------------- */
function headingFromEvent(e){
  if(typeof e.webkitCompassHeading === 'number') return e.webkitCompassHeading;   // iOS, true north
  if(e.absolute === true && typeof e.alpha === 'number'){
    const so = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    return (360 - e.alpha + so + 360) % 360;                                      // Android
  }
  return null;
}
/* Heavier smoothing than the old overlay used, plus a dead-band: an arrow only
   needs to be steady, and jitter is what made the previous view feel broken. */
function smoothHeading(h){
  if(heading == null) return h;
  const delta = ((h - heading + 540) % 360) - 180;
  if(Math.abs(delta) < 2) return heading;          // ignore magnetometer noise
  return (heading + delta * 0.12 + 360) % 360;
}

/* ---- target selection ------------------------------------------------- */
function nearbyBuildings(){
  if(!S.playerPos) return [];
  const byCoord = new Map();
  for(const s of S.ALL){
    if(s.scheme !== SCHEME_EAT || s._dist == null || s._dist > radius) continue;
    const k = s.lat + ',' + s.lng;
    if(!byCoord.has(k)) byCoord.set(k, { key:k, lat:s.lat, lng:s.lng, dist:s._dist, items:[] });
    byCoord.get(k).items.push(s);
  }
  return [...byCoord.values()].sort((a,b) => a.dist - b.dist);
}

/* Inside a venue when the nearest multi-spot building is closer than our own
   positional uncertainty — arguing about direction then is meaningless. */
function detectIndoor(list){
  const g = list[0];
  if(!g) return null;
  const slack = Math.max(INDOOR_RADIUS_M, Math.min(S.accuracy || 0, 60));
  return (g.dist <= slack && g.items.length > 1) ? g : null;
}

/* ---- render ----------------------------------------------------------- */
/* Coalesce compass events into one paint per frame — the old overlay repainted
   on every event at ~60 Hz, which is what made it stutter.
   rAF alone is not enough: frames do NOT fire while the document is hidden, so
   a queued frame could stay pending forever and every later schedule() would
   return early, wedging the view. The timeout guarantees a paint regardless. */
function schedule(){
  if(!open || raf) return;
  raf = requestAnimationFrame(() => { raf = 0; clearTimeout(rafFallback); paint(); });
  clearTimeout(rafFallback);
  rafFallback = setTimeout(() => {
    if(raf){ cancelAnimationFrame(raf); raf = 0; }
    if(open) paint();
  }, 250);
}

function paint(){
  if(!open) return;
  targets = nearbyBuildings();
  const forced = indoorGroup && indoorGroup.forced;
  const inside = forced ? null : detectIndoor(targets);

  if(inside && (!indoorGroup || indoorGroup.key !== inside.key)){
    indoorGroup = inside; indoorLevel = 'ALL';
  }
  if(!inside && indoorGroup && !forced) indoorGroup = null;

  if(indoorGroup && !forced){ paintIndoor(indoorGroup); return; }
  paintWalk();
}

function paintIndoor(g){
  $('finderWalk').style.display = 'none';
  $('finderIndoor').style.display = 'block';
  $('finderTitle').textContent = "You're inside";

  const venue = g.items[0] && venueName(g.items[0].address);
  $('indoorHdr').textContent = venue || titleCase(g.items[0].address || '').slice(0, 40);
  $('indoorSub').textContent =
    `${g.items.length} certified spots here · look for the unit number`;

  /* Group by level, because in a mall "#B1-42" is the only thing that helps. */
  const levels = [...new Set(g.items.map(s => levelLabel(s.address)).filter(Boolean))]
    .sort((a,b) => levelRank(a) - levelRank(b));
  $('indoorLevels').innerHTML =
    [`<div class="filter-pill" data-lv="ALL" data-active="${indoorLevel==='ALL'}">ALL</div>`]
    .concat(levels.map(l => `<div class="filter-pill" data-lv="${l}" data-active="${indoorLevel===l}">${l}</div>`))
    .join('');
  $('indoorLevels').querySelectorAll('.filter-pill').forEach(p =>
    p.addEventListener('click', () => { indoorLevel = p.dataset.lv; paintIndoor(g); }));

  const rows = g.items
    .filter(s => indoorLevel === 'ALL' || levelLabel(s.address) === indoorLevel)
    .sort((a,b) => levelRank(levelLabel(a.address)) - levelRank(levelLabel(b.address))
                || (unitOf(a.address) || '').localeCompare(unitOf(b.address) || ''));

  $('indoorList').innerHTML = rows.map(s => {
    const m = subMeta(s), u = unitOf(s.address);
    return `<div class="unit-row" data-id="${s.id}">
      <div class="unit-no">${escapeHtml(u || '—')}</div>
      <div style="min-width:0;">
        <div class="unit-nm">${escapeHtml((s.name||'').toUpperCase())}</div>
        <div class="unit-ty" style="color:${m.color}">${m.label}</div>
      </div>
      <div class="unit-go">▶</div></div>`;
  }).join('') || `<div class="empty">Nothing on this level</div>`;

  $('indoorList').querySelectorAll('.unit-row').forEach(r =>
    r.addEventListener('click', () => {
      const s = S.BY_ID[r.dataset.id]; if(!s) return;
      closeFinder(); setTimeout(() => openSpot(s, null), 250);
    }));
}

function paintWalk(){
  $('finderIndoor').style.display = 'none';
  $('finderWalk').style.display = 'block';
  $('finderTitle').textContent = 'Walk this way';

  if(!S.playerPos){
    $('walkDist').textContent = '—';
    $('walkTarget').textContent = 'No position yet';
    $('walkSub').textContent = '';
    note('Waiting for a GPS fix');
    return;
  }
  if(!targets.length){
    $('walkDist').textContent = '—';
    $('walkTarget').textContent = `Nothing within ${fmtDist(radius)}`;
    $('walkSub').textContent = 'Try a wider radius';
    note('Tap the radius button to widen');
    drawBlips();
    return;
  }

  idx = Math.max(0, Math.min(idx, targets.length - 1));
  const g = targets[idx];
  const lead = g.items[0];
  const venue = g.items.length > 1 ? venueName(lead.address) : null;

  $('walkDist').textContent = fmtDist(g.dist);
  $('walkTarget').textContent = (venue || lead.name || '').toUpperCase().slice(0, 26);
  $('walkSub').textContent = g.items.length > 1
    ? `${g.items.length} halal spots here · ${idx+1}/${targets.length}`
    : `${subMeta(lead).label} · ${idx+1}/${targets.length}`;

  const brg = bearing(S.playerPos.lat, S.playerPos.lng, g.lat, g.lng);
  const arrow = $('crArrow');
  if(heading == null){
    /* No compass: a bearing is still useful as a cardinal direction, so say it
       in words rather than pretending to point. */
    arrow.style.opacity = '.25';
    arrow.style.transform = `rotate(${brg}deg)`;
    note(`Head ${compassPoint(brg)} · ${accuracyNote()}`);
  } else {
    arrow.style.opacity = '1';
    arrow.style.transform = `rotate(${((brg - heading) + 360) % 360}deg)`;
    note(`${compassPoint(brg)} · ${accuracyNote()}`);
  }
  drawBlips(g.key);
}

/* Other nearby buildings as blips around the ring, north-up. */
function drawBlips(activeKey){
  const wrap = $('crBlips');
  if(!S.playerPos){ wrap.innerHTML = ''; return; }
  wrap.innerHTML = targets.slice(0, 14).map(g => {
    const brg = bearing(S.playerPos.lat, S.playerPos.lng, g.lat, g.lng);
    const rad = (brg - (heading || 0) - 90) * Math.PI / 180;
    const frac = Math.min(1, g.dist / radius) * 0.42;
    const x = 50 + Math.cos(rad) * frac * 100, y = 50 + Math.sin(rad) * frac * 100;
    const cls = 'cblip' + (g.key === activeKey ? ' on' : '') + (g.items.length >= 5 ? ' hot' : '');
    return `<div class="${cls}" style="left:${x}%;top:${y}%"></div>`;
  }).join('');
}

const POINTS = ['N','NE','E','SE','S','SW','W','NW'];
const compassPoint = b => POINTS[Math.round(((b % 360) / 45)) % 8];
function accuracyNote(){
  const a = S.accuracy;
  if(a == null) return 'Accuracy unknown';
  return `±${Math.round(a)} m fix${a > 40 ? ' — rough' : ''}`;
}
function note(s){ $('finderNote').textContent = s; }

/* ---- lifecycle -------------------------------------------------------- */
async function openFinder(){
  finderModal.classList.add('open');
  open = true;
  if(!S.playerPos) showToast('Waiting for your position');

  /* Orientation permission must be asked from the gesture that opened this. */
  try{
    if(typeof DeviceOrientationEvent !== 'undefined' &&
       typeof DeviceOrientationEvent.requestPermission === 'function'){
      const st = await DeviceOrientationEvent.requestPermission();
      if(st !== 'granted') note('Compass denied — showing direction in words');
    }
  }catch(e){}

  if(!orientHandler){
    orientHandler = e => {
      const h = headingFromEvent(e);
      if(h == null) return;
      heading = smoothHeading(h);
      schedule();                       // one paint per frame, never per event
    };
    window.addEventListener('deviceorientationabsolute', orientHandler, true);
    window.addEventListener('deviceorientation', orientHandler, true);
  }
  paint();
}
function closeFinder(){
  open = false;
  finderModal.classList.remove('open');
  if(orientHandler){
    window.removeEventListener('deviceorientationabsolute', orientHandler, true);
    window.removeEventListener('deviceorientation', orientHandler, true);
    orientHandler = null;
  }
  if(raf){ cancelAnimationFrame(raf); raf = 0; }
  clearTimeout(rafFallback);
}
/* geo.js calls this on each position update. */
function renderFinderIfOpen(){ if(open) schedule(); }

$('openFinder').addEventListener('click', openFinder);
$('finderClose').addEventListener('click', closeFinder);
$('walkNext').addEventListener('click', () => { if(targets.length){ idx = (idx + 1) % targets.length; paint(); } });
$('walkPrev').addEventListener('click', () => { if(targets.length){ idx = (idx - 1 + targets.length) % targets.length; paint(); } });
$('walkOpen').addEventListener('click', () => {
  const g = targets[idx]; if(!g){ showToast('Nothing to open'); return; }
  closeFinder();
  map.setView([g.lat, g.lng], 17);
  const mg = S.GROUP_BY_KEY[g.key];
  setTimeout(() => { if(g.items.length > 1 && mg) openGroup(mg); else openSpot(g.items[0], null); }, 280);
});
$('walkRadius').addEventListener('click', () => {
  radius = AR_RADII[(AR_RADII.indexOf(radius) + 1) % AR_RADII.length];
  $('walkRadius').textContent = fmtDist(radius);
  idx = 0; paint();
});
/* Escape hatch: standing in a mall but wanting to be pointed elsewhere. */
$('indoorExit').addEventListener('click', () => {
  if(indoorGroup) indoorGroup = { ...indoorGroup, forced:true };
  idx = Math.min(1, Math.max(0, targets.length - 1));
  paint();
});

/* debug surface — module internals are unreachable from the console once bundled */
function _debug(){ return { open, heading, radius, idx,
  indoorGroup: indoorGroup && { key:indoorGroup.key, forced:!!indoorGroup.forced, n:indoorGroup.items.length },
  targets: nearbyBuildings().slice(0,3).map(g => ({ key:g.key, dist:Math.round(g.dist), n:g.items.length })),
  detected: (()=>{ const g = detectIndoor(nearbyBuildings()); return g && { key:g.key, n:g.items.length }; })() }; }

export { openFinder, closeFinder, renderFinderIfOpen, nearbyBuildings, finderModal, _debug };
