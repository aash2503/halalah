import { S } from '../state.js';
import { GAZETTEER, SCHEME_EAT } from '../config.js';
import { titleCase, escapeHtml } from '../util.js';
import { nameKey, exactName, applyFilters, setSearch, setArea, setExact, setVenue } from '../filters.js';
import { map, flyBounds } from '../map/map.js';
import { showToast } from './toast.js';
import { openSpot, openGroup } from './sheet.js';

/* --- suggestions: areas, venues, then establishments --------------------- */
const suggestEl = document.getElementById('suggest');
function buildSuggestions(q){
  const s = q.trim().toLowerCase();
  if(s.length < 2) return [];
  /* Per-category budgets, not one shared running total. The old shared cap let
     a few area hits starve venues, and venues starve establishments. */
  const areas = [], venues = [], spots = [];

  for(const a of GAZETTEER){
    if(a.name.toLowerCase().includes(s)) areas.push({ kind:'area', name:a.name, lat:a.lat, lng:a.lng });
    if(areas.length >= 6) break;
  }
  /* Match a venue on its canonical key OR any spelling MUIS uses for it, so
     "jurong point" finds the place however that row happened to write it. */
  for(const v of S.VENUE_INDEX){
    const hit = v.name.toLowerCase().includes(s) ||
                (v.key || '').toLowerCase().includes(s) ||
                [...(v.names || [])].some(n => n.toLowerCase().includes(s));
    if(hit){
      /* Say what you'll actually SEE. The venue holds every certified row, but
         the map defaults to eat-in, so a bare total reads as a discrepancy. */
      const eat = v.groups.reduce((n,g) => n + g.items.filter(i => i.scheme === SCHEME_EAT).length, 0);
      const where = v.groups.length > 1 ? ` · ${v.groups.length} buildings` : '';
      const count = eat === v.count ? `${v.count} certified spot${v.count===1?'':'s'}`
                                    : `${eat} eat-in · ${v.count} certified`;
      venues.push({ kind:'venue', name:v.name, venue:v, sub:`${count}${where}` });
    }
    if(venues.length >= 8) break;
  }
  const out = areas.concat(venues);
  /* Group establishment hits by NAME KEY, not raw name. Every outlet carries its
     own stall code and venue ("MUNCHI PANCAKES (S36) @ ONE PUNGGOL..."), so raw
     names are all distinct and grouping by them collapses nothing. nameKey()
     strips that suffix, so all 17 land on one row. */
  const byName = new Map();
  for(const e of S.ALL){
    if(!(e.name||'').toLowerCase().includes(s)) continue;
    const key = nameKey(e);
    if(!byName.has(key)) byName.set(key, []);
    byName.get(key).push(e);
  }
  for(const [key, rows] of byName){
    out.push({
      kind:'spot', key, rows,
      // Show the shared name for a chain, the full one for a single outlet.
      name: rows.length > 1 ? key : rows[0].name,
      sub: rows.length > 1
        ? `${rows.length} locations`
        : titleCase(rows[0].address).slice(0,44)
    });
    if(out.length - areas.length - venues.length >= 8) break;
  }
  return out;
}
function renderSuggestions(list){
  if(!list.length){ suggestEl.classList.remove('open'); return; }
  suggestEl.innerHTML = list.map((r,i) => `
    <div class="sg-row" data-i="${i}">
      <span class="k ${r.kind}">${r.kind==='area'?'AREA':r.kind==='venue'?'VENUE':'SPOT'}</span>
      <span class="t" style="min-width:0;">${escapeHtml(r.name.toUpperCase().slice(0,30))}
        ${r.sub?`<div class="d">${escapeHtml(r.sub)}</div>`:''}</span>
    </div>`).join('');
  suggestEl.classList.add('open');
  suggestEl.querySelectorAll('.sg-row').forEach(row => {
    row.addEventListener('click', () => chooseSuggestion(list[+row.dataset.i]));
  });
}
function chooseSuggestion(r){
  suggestEl.classList.remove('open');
  document.getElementById('searchInput').blur();
  if(r.kind === 'area'){
    // Snap to the area and scope results to it.
    setArea({ lat:r.lat, lng:r.lng, radius:1800, name:r.name });
    setSearch('');
    document.getElementById('searchInput').value = r.name;
    applyFilters();
    map.flyTo([r.lat, r.lng], 15, { duration:.8 });
    showToast(`SNAPPED TO ${r.name}`);
  } else if(r.kind === 'venue'){
    /* A venue name can occur at more than one coordinate (NORTHPOINT, CHANGI
       AIRPORT T2/T3). Show every one of them, not just the first. */
    setArea(null); setSearch(''); setExact(null);
    setVenue(new Set(r.venue.groups.map(g => g.key)));
    document.getElementById('searchInput').value = r.name;
    applyFilters();
    const groups = r.venue.groups;
    if(groups.length === 1){
      map.flyTo([groups[0].lat, groups[0].lng], 17, { duration:.8 });
      setTimeout(() => openGroup(groups[0]), 850);
    } else {
      flyBounds(groups.map(g => [g.lat,g.lng]));
      showToast(`${groups.length} PLACES NAMED ${r.name}`);
    }
  } else {
    /* Every outlet with this name, not just the one that happened to match
       first. Only auto-open the sheet when there's genuinely one of them. */
    setArea(null); setSearch(''); setVenue(null);
    setExact(r.key);
    document.getElementById('searchInput').value = r.name;
    applyFilters();
    if(r.rows.length === 1){
      map.flyTo([r.rows[0].lat, r.rows[0].lng], 17, { duration:.8 });
      setTimeout(() => openSpot(r.rows[0], null), 850);
    } else {
      flyBounds(r.rows.map(e => [e.lat,e.lng]));
      showToast(`${r.rows.length} LOCATIONS — ${exactName.slice(0,22)}`);
    }
  }
}

let searchDebounce = null;
const searchInput = document.getElementById('searchInput');
searchInput.addEventListener('input', e => {
  const v = e.target.value;
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    renderSuggestions(buildSuggestions(v));
    // Typing again abandons whatever suggestion was pinned.
    setExact(null); setVenue(null);
    if(v.trim().length === 0) setArea(null);
    setSearch(v.trim().length >= 2 ? v : '');
    applyFilters();
  }, 250);
});
searchInput.addEventListener('keydown', e => {
  if(e.key === 'Enter'){
    clearTimeout(searchDebounce);
    const list = buildSuggestions(e.target.value);
    if(list.length) chooseSuggestion(list[0]); else { setSearch(e.target.value); applyFilters(); }
  }
});
document.getElementById('searchBtn').addEventListener('click', () => {
  const list = buildSuggestions(searchInput.value);
  if(list.length) chooseSuggestion(list[0]);
  else { setSearch(searchInput.value); setArea(null); setExact(null); setVenue(null); applyFilters(); }
});
document.getElementById('map').addEventListener('click', () => suggestEl.classList.remove('open'));

export { buildSuggestions, renderSuggestions, chooseSuggestion };
