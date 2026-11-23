import { S } from './state.js';
import { SCHEME_EAT, SCHEME_PREP, HOTSPOT_MIN } from './config.js';
import { haversine } from './util.js';
import { hasSaved } from './state.js';
import { brandKey, venueName, venueKey, buildGroups } from './data/model.js';
import { renderGroups } from './map/map.js';
import { setStatus } from './ui/toast.js';

/* Filter state is module-local: only search and the pills touch it, and they
   go through the setters below. */

/* ==========================================================================
   8. FILTERS + SEARCH + AREA SNAP
   ========================================================================== */
let activeFilter = 'all', searchTerm = '', areaFilter = null;   // areaFilter = {lat,lng,radius,name}
/* Picking a suggestion pins an EXACT match so every outlet of that name (or
   every coordinate of that venue) stays on the map — a substring search would
   also drag in unrelated addresses. */
let exactName = null, venueFilter = null;
/* One key used for BOTH grouping suggestions and filtering the map, so the two
   can never disagree. Falls back to the full name when brandKey() declines
   (single words, generic descriptions like "CHICKEN RICE"). */
function nameKey(s){ return brandKey(s.name) || (s.name||'').trim().toUpperCase(); }

function currentSelection(){
  const q = searchTerm.trim().toLowerCase();
  return S.ALL.filter(s => {
    if(activeFilter === 'prep'){ if(s.scheme !== SCHEME_PREP) return false; }
    else if(activeFilter === 'saved'){ if(!hasSaved(s.id)) return false; }
    else if(activeFilter === 'new'){ if(!S.NEW_IDS.has(s.id)) return false; }
    else if(activeFilter === 'hot' || activeFilter === 'all'){ if(s.scheme !== SCHEME_EAT) return false; }
    else if(!activeFilter.split(',').includes(String(s.sub_scheme))) return false;
    if(maxDist && s._dist != null && s._dist > maxDist) return false;

    if(exactName && nameKey(s) !== exactName) return false;
    /* A venue IS its set of coordinates. Re-deriving the key from each row's
       own address dropped rows inside the building whose address is spelt
       differently ("JURONG POINT BAGUS", or no unit number at all), so the
       index said 61 and the map showed 50. Match on the building instead. */
    if(venueFilter && !venueFilter.has(s.lat + ',' + s.lng)) return false;
    /* An area matches on GEOGRAPHY or on the ADDRESS TEXT. A centroid+radius
       alone missed places whose address plainly says the area but which sit
       outside an arbitrary circle, and vice versa. */
    if(areaFilter){
      const inRadius = haversine(areaFilter.lat, areaFilter.lng, s.lat, s.lng) <= areaFilter.radius;
      const named = areaFilter.name &&
        (s.address || '').toUpperCase().includes(areaFilter.name.toUpperCase());
      if(!inRadius && !named) return false;
    }
    if(q && !(s.name||'').toLowerCase().includes(q)
         && !(s.address||'').toLowerCase().includes(q)
         && !(s.postal||'').includes(q)) return false;
    return true;
  });
}
const listeners = [];
function onFiltersApplied(fn){ listeners.push(fn); }
let maxDist = 0;                       // metres; 0 = any distance
function setMaxDist(m){ maxDist = m; }
function applyFilters(){
  let groups = buildGroups(currentSelection());
  if(activeFilter === 'hot') groups = groups.filter(g => g.items.length >= HOTSPOT_MIN);
  renderGroups(groups);
  if(!groups.length) setStatus('No matches — clear a filter', 'err');
  listeners.forEach(fn => fn());
}



/* Category pills combine (Hawker + Bakery); All eat-in, Saved and Kitchens each stand alone. */
const CATS = ['103','106','108','109'];
document.querySelectorAll('#filterRow .filter-pill').forEach(p => {
  p.addEventListener('click', () => {
    const pills = [...document.querySelectorAll('#filterRow .filter-pill')], f = p.dataset.filter;
    if(CATS.includes(f)){
      p.dataset.active = String(p.dataset.active !== 'true');
      pills.filter(x => !CATS.includes(x.dataset.filter)).forEach(x => x.dataset.active = 'false');
      const on = pills.filter(x => CATS.includes(x.dataset.filter) && x.dataset.active === 'true').map(x => x.dataset.filter);
      if(on.length) activeFilter = on.join(',');
      else { activeFilter = 'all'; pills.find(x => x.dataset.filter === 'all').dataset.active = 'true'; }
    } else {
      pills.forEach(x => x.dataset.active = 'false'); p.dataset.active = 'true'; activeFilter = f;
    }
    applyFilters();
  });
});
document.querySelectorAll('#distRow .filter-pill').forEach(p => {
  p.addEventListener('click', () => {
    document.querySelectorAll('#distRow .filter-pill').forEach(x => x.dataset.active = 'false');
    p.dataset.active = 'true'; maxDist = +p.dataset.dist; applyFilters();
  });
});

export { onFiltersApplied, setMaxDist, maxDist, activeFilter, searchTerm, areaFilter, exactName, venueFilter, nameKey, currentSelection, applyFilters, setFilter, setSearch, setArea, setExact, setVenue };

/* Setters — other modules must not reassign imported bindings. */
function setFilter(v){ activeFilter = v; }
function setSearch(v){ searchTerm = v; }
function setArea(v){ areaFilter = v; }
function setExact(v){ exactName = v; }
function setVenue(v){ venueFilter = v; }
