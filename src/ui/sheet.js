import { S, hasVisited, hasSaved, hasSeen, markSeen, toggleVisited, toggleSaved } from '../state.js';
import { SCHEME_PREP, SCHEME_EAT } from '../config.js';
import { titleCase, fmtDist, escapeHtml, regionFor, appUrl, spotLink,
         unitOf, levelLabel, levelRank } from '../util.js';
import { subMeta, brandKey, venueName, buildGroups } from '../data/model.js';
import { map, renderGroups, flyBounds, onGroupTap, clusterGroup, L } from '../map/map.js';
import { applyFilters, setFilter, setArea, setSearch, setExact, setVenue } from '../filters.js';
import { showToast } from './toast.js';
import { shareShortlist } from './share.js';
import { openFinderTo } from './finder.js';

/* ==========================================================================
   10. BOTTOM SHEET
   ========================================================================== */
const sheet = document.getElementById('sheet'), scrim = document.getElementById('scrim');
const elList = document.getElementById('sheetList'), elDetail = document.getElementById('sheetDetail');
let currentSpot = null, currentGroup = null;

function handleGroupTap(g){ g.items.length === 1 ? openSpot(g.items[0], null) : openGroup(g); }

/* Cluster peek — tapping a 133-cluster used to just zoom, several times over.
   Show what's inside first, with zoom still one tap away. */
clusterGroup.on('clusterclick', e => {
  const groups = e.layer.getAllChildMarkers()
    .map(m => S.GROUP_BY_KEY[m.getLatLng().lat + ',' + m.getLatLng().lng])
    .filter(Boolean)
    .sort((a,b) => b.items.length - a.items.length);
  if(!groups.length){ e.layer.zoomToBounds({ padding:[40,40] }); return; }
  const total = groups.reduce((n,g) => n + g.items.length, 0);

  currentGroup = null;
  elList.style.display = 'block'; elDetail.style.display = 'none';
  document.getElementById('blHdr').textContent = 'THIS CLUSTER';
  document.getElementById('blSub').textContent =
    `${total} certified establishments across ${groups.length} place${groups.length===1?'':'s'}`;
  document.getElementById('blBreak').innerHTML = '';
  document.getElementById('blRows').innerHTML = groups.slice(0,40).map((g,i) => `
    <div class="bld-row" data-i="${i}">
      <div style="min-width:0;">
        <div class="nm">${escapeHtml((g.venue || titleCase(g.label)).toUpperCase().slice(0,30))}</div>
        <div class="ty">${g.items.length} spot${g.items.length===1?'':'s'}${g.items[0]._dist!=null?' · '+fmtDist(g.items[0]._dist):''}</div>
      </div><div class="go">▶</div></div>`).join('');
  document.querySelectorAll('#blRows .bld-row').forEach(row =>
    row.addEventListener('click', () => handleGroupTap(groups[+row.dataset.i])));

  sheet.classList.add('open'); scrim.classList.add('open');
  showToast('Tap a place, or zoom in');
});

function openGroup(g){
  currentGroup = g;
  elList.style.display = 'block'; elDetail.style.display = 'none';
  document.getElementById('blHdr').textContent = titleCase(g.label) || 'THIS BUILDING';
  const cleared = g.items.filter(i => hasVisited(i.id)).length;
  document.getElementById('blSub').textContent =
    `${g.items.length} certified establishments · ${cleared}/${g.items.length} visited` +
    (g.items[0]._dist !== undefined ? ` · ${fmtDist(g.items[0]._dist)} away` : '');

  const counts = {};
  for(const i of g.items){ const m = subMeta(i); counts[m.label] = (counts[m.label]||0) + 1; }
  document.getElementById('blBreak').innerHTML = Object.entries(counts)
    .sort((a,b) => b[1]-a[1])
    .map(([l,n]) => `<span class="type-badge" style="background:#374151">${n} ${escapeHtml(l)}</span>`).join('');

  /* Order by level then unit, the way you'd walk a mall, and SHOW the unit —
     inside a building that number is the only thing that helps you find it. */
  const ordered = g.items.map((s,i) => ({ s, i })).sort((a,b) =>
      levelRank(levelLabel(a.s.address)) - levelRank(levelLabel(b.s.address))
   || (unitOf(a.s.address) || '').localeCompare(unitOf(b.s.address) || ''));

  document.getElementById('blRows').innerHTML = ordered.map(({s,i}) => {
    const m = subMeta(s), u = unitOf(s.address);
    return `<div class="bld-row ${hasVisited(s.id)?'done':''}" data-i="${i}">
      <div style="min-width:0;">
        <div class="nm">${escapeHtml((s.name||'').toUpperCase())}</div>
        <div class="ty" style="color:${m.color}">${m.label}${s.est_type===1?' · Virtual':''}${S.NEW_IDS.has(s.id)?' · New':''}${hasVisited(s.id)?' · ✔':''}</div>
        ${u ? `<div class="unit">${escapeHtml(u)}</div>` : ''}
      </div><div class="go">▶</div></div>`;
  }).join('');
  document.querySelectorAll('#blRows .bld-row').forEach(row =>
    row.addEventListener('click', () => openSpot(g.items[+row.dataset.i], g)));

  sheet.classList.add('open'); scrim.classList.add('open');
  map.panTo([g.lat,g.lng],{ animate:true });
}

function openSpot(s, fromGroup){
  currentSpot = s;
  currentGroup = fromGroup || currentGroup;
  elList.style.display = 'none'; elDetail.style.display = 'block';
  document.getElementById('sheetBack').classList.toggle('show', !!(fromGroup && fromGroup.items.length > 1));
  const first = !hasSeen(s.id);
  markSeen(s.id);

  const m = subMeta(s);
  document.getElementById('sEntryNo').textContent = '';
  document.getElementById('sName').textContent = titleCase(s.name || '');
  const badges = [`<span class="type-badge" style="background:${m.color}">${m.label}</span>`,
                  `<span class="status-chip">MUIS certified</span>`];
  if(S.NEW_IDS.has(s.id)) badges.push(`<span class="flag-badge fresh">New</span>`);
  if(s.est_type === 1) badges.push(`<span class="flag-badge virtual">Delivery only</span>`);
  if(s.scheme === SCHEME_PREP) badges.push(`<span class="flag-badge prep">Not walk-in</span>`);
  document.getElementById('sBadges').innerHTML = badges.join('');

  document.getElementById('sDist').textContent = fmtDist(s._dist);
  document.getElementById('sZone').textContent = regionFor(s.lat,s.lng);
  document.getElementById('sCert').textContent = s.cert_number || '—';
  document.getElementById('sScheme').textContent = `${s.scheme_text||'—'} — ${s.sub_scheme_text||'—'}`;
  document.getElementById('sAddr').textContent = titleCase(s.address);

  /* Logo host sends no CORS headers — <img> only, never fetch/canvas. */
  const logo = document.getElementById('sLogo');
  if(s.logo){
    logo.src = `https://halal.muis.gov.sg/logo/${s.logo}?size=96`;
    logo.style.display = 'block';
    logo.onerror = () => { logo.style.display = 'none'; };
  } else logo.style.display = 'none';

  const btn = document.getElementById('sCatch');
  const v = hasVisited(s.id);
  btn.dataset.caught = v; btn.textContent = v ? '✔ Visited' : '◎ Mark visited';
  const sv = document.getElementById('sSave');
  sv.textContent = hasSaved(s.id) ? '★ Saved' : '☆ Save';
  document.getElementById('sDist').textContent = s._dist == null ? 'Location off' : fmtDist(s._dist);
  sv.className = 'a btn ' + (hasSaved(s.id) ? 'btn-y' : 'btn-w');

  /* Other locations sharing this name. Deliberately worded as "same name" —
     the dataset has no brand/franchise field, so a shared name is evidence of
     a chain, not proof of one. */
  const key = brandKey(s.name);
  const sibs = key && S.BRAND_INDEX[key] ? S.BRAND_INDEX[key].filter(r => r.id !== s.id) : [];
  const chainSect = document.getElementById('sChainSect');
  if(sibs.length){
    const withDist = sibs.slice().sort((a,b) => (a._dist ?? Infinity) - (b._dist ?? Infinity));
    const nearest = withDist[0];
    chainSect.style.display = 'block';
    document.getElementById('sChain').innerHTML =
      `<div style="font-size:8px; line-height:2; color:var(--muted)">
         ${sibs.length} OTHER LOCATION${sibs.length===1?'':'S'} NAMED
         <span style="color:var(--yellow)">${escapeHtml(key)}</span>
         ${nearest && nearest._dist!=null ? `<br>Nearest ${fmtDist(nearest._dist)} away` : ''}
       </div>
       <div class="acts"><div class="a btn btn-w" id="sChainBtn" >Show all ${sibs.length+1}</div></div>`;
    document.getElementById('sChainBtn').addEventListener('click', () => {
      const rows = S.BRAND_INDEX[key];
      closeSheet();
      renderGroups(buildGroups(rows));
      map.fitBounds(L.latLngBounds(rows.map(r => [r.lat,r.lng])).pad(.25), { maxZoom:16 });
      showToast(`${rows.length} named ${key}`);
    });
  } else chainSect.style.display = 'none';

  sheet.classList.add('open'); scrim.classList.add('open');
  map.panTo([s.lat,s.lng],{ animate:true });
}

/* Deep link back into the app for a single spot. */
function closeSheet(){
  sheet.classList.remove('open'); scrim.classList.remove('open');
  currentSpot = null; currentGroup = null;
}
document.getElementById('sheetClose').addEventListener('click', closeSheet);
scrim.addEventListener('click', closeSheet);
document.getElementById('sheetBack').addEventListener('click', () => { if(currentGroup) openGroup(currentGroup); });

/* Drag the grab handle down to dismiss. */
(function dragSheet(){
  const grab = document.getElementById('sheetGrab');
  let y0 = null, dy = 0;
  const start = e => { y0 = (e.touches?e.touches[0]:e).clientY; dy = 0; sheet.classList.add('dragging'); };
  const move = e => {
    if(y0 === null) return;
    dy = Math.max(0, (e.touches?e.touches[0]:e).clientY - y0);
    sheet.style.transform = `translateY(${dy}px)`;
  };
  const end = () => {
    if(y0 === null) return;
    sheet.classList.remove('dragging'); sheet.style.transform = '';
    if(dy > 90) closeSheet();
    y0 = null;
  };
  grab.addEventListener('touchstart', start, {passive:true});
  grab.addEventListener('touchmove', move, {passive:true});
  grab.addEventListener('touchend', end);
  grab.addEventListener('mousedown', start);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
})();

/* Coordinates are building-level, so route on the ADDRESS text. */
document.getElementById('sGo').addEventListener('click', () => {
  if(!currentSpot) return;
  if(currentSpot.est_type === 1){ showToast('Delivery only — no walk-in'); return; }
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(currentSpot.address || currentSpot.name || '')}`,
              '_blank','noopener');
});
document.getElementById('sCatch').addEventListener('click', () => {
  if(!currentSpot) return;
  const v = toggleVisited(currentSpot.id);
  const b = document.getElementById('sCatch');
  b.dataset.caught = v; b.textContent = v ? '✔ Visited' : '◎ Mark visited';
  if(v) showToast('Logged to explorer card');
  applyFilters();
});
document.getElementById('sMoreLike').addEventListener('click', () => {
  if(!currentSpot) return;
  const sub = String(currentSpot.sub_scheme);
  const pill = document.querySelector(`#filterRow .filter-pill[data-filter="${sub}"]`);
  document.querySelectorAll('#filterRow .filter-pill').forEach(x => x.dataset.active='false');
  if(pill){ pill.dataset.active='true'; setFilter(sub); }
  else { setFilter('all'); }
  setArea({ lat:currentSpot.lat, lng:currentSpot.lng, radius:2000, name:'Nearby' });
  setSearch(''); searchInput.value='';
  applyFilters(); closeSheet();
  map.flyTo([currentSpot.lat, currentSpot.lng], 15, { duration:.7 });
  showToast(`${subMeta(currentSpot).label} within 2km`);
});
document.getElementById('blShare').addEventListener('click', () => {
  if(currentGroup) shareShortlist(currentGroup.items.slice(0,10), titleCase(currentGroup.label));
});
document.getElementById('sSave').addEventListener('click', () => {
  if(!currentSpot) return;
  const on = toggleSaved(currentSpot.id);
  const b = document.getElementById('sSave');
  b.textContent = on ? '★ Saved' : '☆ Save';
  b.className = 'a btn ' + (on ? 'btn-y' : 'btn-w');
  showToast(on ? 'Added to saved' : 'Removed from saved');
  applyFilters();
});
document.getElementById('sShare2').addEventListener('click', () => document.getElementById('sShare').click());
document.getElementById('sWalk').addEventListener('click', () => { if(currentSpot){ const s = currentSpot; closeSheet(); openFinderTo(s); } });
document.getElementById('sShare').addEventListener('click', async () => {
  if(!currentSpot) return;
  const s = currentSpot;
  const text = `${s.name} — MUIS certified (${subMeta(s).label})\n${titleCase(s.address)}\nCert ${s.cert_number}\n${spotLink(s)}`;
  if(navigator.share){
    try{ await navigator.share({ title:'Halalah', text }); return; }
    catch(e){ if(e && e.name === 'AbortError') return; }
  }
  try{ await navigator.clipboard.writeText(text); showToast('Link copied'); }
  catch(e){ showToast('Could not copy'); }
});

export { openSpot, openGroup, closeSheet, handleGroupTap, currentSpot, currentGroup };
