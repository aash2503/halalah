import { S, save, persist } from './state.js';
import { ENCOUNTER_RADIUS_M, ENCOUNTER_COOLDOWN_MS, SCHEME_EAT } from './config.js';
import { haversine, escapeHtml } from './util.js';
import { L, map } from './map/map.js';
import { showToast } from './ui/toast.js';
import { showDialog, hideDialog } from './ui/dialog.js';
import { openSpot, openGroup } from './ui/sheet.js';
import { renderFinderIfOpen } from './ui/finder.js';

/* ==========================================================================
   9. LIVE SCAN
   ========================================================================== */
let playerMarker = null, watchId = null;

/* Ask before the browser asks. A cold permission prompt gets denied far more
   often, and a denial here costs the wheel's NEAR ME, the finder, the near-me
   list and proximity alerts. */
function primeGeolocation(then){
  if(save.geoPrimed) { then(); return; }
  showDialog('Find what\'s around you',
    `HALALAH uses your location to sort spots by distance, point the compass at
     the nearest halal spot, and alert you when a certified place is right
     nearby.<br><br>
     Your location <b>stays on this device</b> — it is never uploaded.`,
    [{ label:'Continue', cls:'btn-y', fn:() => { save.geoPrimed = true; persist(); hideDialog(); then(); } },
     { label:'Not now', cls:'btn-w', fn:hideDialog }]);
}
/* ---- Live scan is ALWAYS ON --------------------------------------------
   Distances, the near-me list, the wheel's NEAR ME scope, the finder and
   proximity alerts are all worthless without a position, so scanning starts
   itself rather than waiting for a tap. Two honest limits remain:
     · the browser still owns the permission prompt — if it is denied we cannot
       force it, so the FAB becomes a retry;
     · the watch is suspended while the app is in the background, because a
       high-accuracy watch left running there is a real battery cost.
   -------------------------------------------------------------------------- */
const fab = () => document.getElementById('fabLocate');
let denied = false;

function setTrackingUi(){
  fab().dataset.tracking = S.tracking;
  fab().querySelector('.lbl').textContent = 'Locate';
}

function startTracking({ silent = false } = {}){
  if(S.tracking || watchId !== null) return;             // idempotent
  if(!navigator.geolocation){ if(!silent) showToast('No geolocation support'); return; }
  S.tracking = true; setTrackingUi();
  watchId = navigator.geolocation.watchPosition(
    p => { denied = false; S.accuracy = p.coords.accuracy; updatePosition(p.coords.latitude, p.coords.longitude); },
    err => {
      denied = err.code === 1;
      if(!silent || denied) showToast(denied ? 'Location denied — tap to retry' : 'Location unavailable');
      stopTracking();
    },
    { enableHighAccuracy:true, maximumAge:5000, timeout:10000 });
}
function stopTracking(){
  if(watchId !== null){ navigator.geolocation.clearWatch(watchId); watchId = null; }
  S.tracking = false; setTrackingUi();
}

/* Called once the map is actually in front of the user. */
function beginLiveScan(){
  if(!save.geoPrimed){ primeGeolocation(() => startTracking()); return; }
  startTracking({ silent:true });
}

/* Suspend in the background, resume on return. */
document.addEventListener('visibilitychange', () => {
  if(document.hidden) stopTracking();
  else if(!denied && save.geoPrimed) startTracking({ silent:true });
});

/* The FAB no longer switches scanning off — it recentres on you, or retries
   the permission if the browser refused it. */
function onFabTap(){
  if(S.tracking && S.playerPos){ map.flyTo([S.playerPos.lat, S.playerPos.lng], 17, { duration:.6 }); return; }
  if(!save.geoPrimed){ primeGeolocation(() => startTracking()); return; }
  denied = false;
  startTracking();
  showToast('Looking for you...');
}
function updatePosition(lat,lng){
  const first = !S.playerPos;
  S.playerPos = { lat, lng };
  if(!playerMarker){
    playerMarker = L.marker([lat,lng],{
      icon:L.divIcon({ className:'', html:`<div class="pix-pin player"><div class="body"></div></div>`,
                       iconSize:[26,26], iconAnchor:[13,13] }), zIndexOffset:1000 }).addTo(map);
  } else playerMarker.setLatLng([lat,lng]);
  if(first) map.setView([lat,lng],16);
  for(const s of S.ALL) s._dist = haversine(lat,lng,s.lat,s.lng);
  scanForEncounters();
  renderFinderIfOpen();
}
/* Initial bearing from point 1 to point 2, degrees clockwise from north. */
function bearing(a1,o1,a2,o2){
  const r=d=>d*Math.PI/180, φ1=r(a1), φ2=r(a2), Δλ=r(o2-o1);
  const y = Math.sin(Δλ)*Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  return (Math.atan2(y,x)*180/Math.PI + 360) % 360;
}
fab().addEventListener('click', onFabTap);

/* Encounters fire per BUILDING, not per row, and no more than once every
   ENCOUNTER_COOLDOWN_MS.
   ------------------------------------------------------------------------
   This used to scan row by row: it took the first unseen spot within 120 m,
   opened it, and logged it. Inside a mall where 60 eat-in stalls share one
   coordinate, every one of them is within 120 m, so each GPS tick tripped the
   next — sixty sheets and sixty log entries in a minute. Always-on scanning
   removed the tap that used to gate it. */
const encountered = new Set();          // coordinate keys, not row ids
let lastEncounterAt = 0;

function scanForEncounters(){
  return;                                    // proximity pop-ups went with the game layer (23 Nov 2026)
  if(!S.tracking) return;
  if(Date.now() - lastEncounterAt < ENCOUNTER_COOLDOWN_MS) return;

  let best = null;
  for(const s of S.ALL){
    if(s.scheme !== SCHEME_EAT || s._dist == null || s._dist > ENCOUNTER_RADIUS_M) continue;
    const key = s.lat + ',' + s.lng;
    if(encountered.has(key)) continue;
    if(!best || s._dist < best.dist) best = { key, dist:s._dist, spot:s };
  }
  if(!best) return;

  encountered.add(best.key);
  lastEncounterAt = Date.now();
  const g = S.GROUP_BY_KEY[best.key];
  playEncounter(best.spot, g, () => {
    /* A building opens its LIST — which deliberately logs nothing. Only a spot
       you actually tap should end up in your field log. */
    if(g && g.items.length > 1) openGroup(g);
    else openSpot(best.spot);
  });
}
function playEncounter(spot, group, done){
  const el = document.getElementById('encounter');
  /* Name the building when there are several inside it — announcing one stall
     for a whole mall reads as if that is all there is. */
  const many = group && group.items.length > 1;
  const label = many ? `${group.items.length} halal spots here!` : 'Halal spot right here!';
  const who = many ? (group.venue || spot.name || '') : (spot.name || '');
  document.getElementById('encounterText').innerHTML =
    `${label}<br><br>${escapeHtml(who.toUpperCase())}`;
  el.classList.remove('run'); void el.offsetWidth; el.classList.add('run');
  setTimeout(() => { el.classList.remove('run'); if(done) done(); }, 810);
}

export { startTracking, stopTracking, beginLiveScan, onFabTap,
         updatePosition, primeGeolocation, scanForEncounters, playEncounter };
