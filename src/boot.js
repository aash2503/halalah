import icon192 from './assets/icon-192.png';
import icon512 from './assets/icon-512.png';
import iconMaskable from './assets/icon-maskable-512.png';
import { S, save, persist, syncBadgeBaseline, seenSet,
         hasVisited, hasSaved, earnedBadges } from './state.js';
import { CACHE_KEY, SCHEME_EAT, STALE_DAYS, REVALIDATE_MS,
         UPSTREAM_OLD_DAYS, UPSTREAM_STALE_DAYS } from './config.js';
import { daysSince, fmtSynced, titleCase, escapeHtml, haversine } from './util.js';
import { fetchAllEstablishments } from './data/api.js';
import { cacheGet, cacheSet } from './data/cache.js';
import { buildGroups, buildVenueIndex, buildBrandIndex } from './data/model.js';
import { map, L } from './map/map.js';
import { applyFilters, setFilter, setArea } from './filters.js';
import { showToast, setStatus } from './ui/toast.js';
import { showDialog, hideDialog } from './ui/dialog.js';
import { beginLiveScan } from './geo.js';
import { openSpot, openGroup } from './ui/sheet.js';
import { buildNear, nearModal } from './ui/near.js';
import { buildLog, logModal } from './ui/log.js';
import { drawWheel, wheelModal } from './ui/wheel.js';

/* ==========================================================================
   17. BOOT — cache first, then revalidate, then diff
   ========================================================================== */
const startBtn = document.getElementById('startBtn'), loadNote = document.getElementById('loadNote');

function indexData(rows){
  S.ALL = rows;
  S.BY_ID = Object.fromEntries(rows.map(s => [s.id, s]));
  S.GROUPS = buildGroups(rows);
  S.GROUP_BY_KEY = Object.fromEntries(S.GROUPS.map(g => [g.key, g]));
  S.VENUE_INDEX = buildVenueIndex(S.GROUPS);
  S.BRAND_INDEX = buildBrandIndex(rows);
  S.SYNCED_AT = rows.reduce((mx,r) => (r.last_synced_at && r.last_synced_at > mx) ? r.last_synced_at : mx, '');
  syncBadgeBaseline();          // badge counter lives in state.js now
  const eat = rows.filter(s => s.scheme === SCHEME_EAT).length;
  document.getElementById('lsTotal').textContent = rows.length;
  document.getElementById('lsEat').textContent = eat;
  document.getElementById('lsSeen').textContent = seenSet.size;
  if(S.playerPos) for(const s of S.ALL) s._dist = haversine(S.playerPos.lat, S.playerPos.lng, s.lat, s.lng);
}
function readyUp(note){
  applyFilters();
  if(S.SYNCED_AT){
    document.getElementById('landingFoot').innerHTML =
      `MUIS REGISTRY · SYNCED ${fmtSynced(S.SYNCED_AT)}<br>ALWAYS VERIFY THE CERTIFICATE ON SITE`;
  }
  startBtn.disabled = false;
  startBtn.textContent = 'PRESS START';
  loadNote.classList.remove('err');
  loadNote.textContent = note;
}

/* Compare the fresh rows against the previous snapshot (the IndexedDB cache,
   which holds FULL records — so a delisted place can still be named) and
   surface the delta in a dialog.

   NOTE ON "NEW": every row currently shares one first_seen_at, because the
   table was seeded in a single import. So "new" here means "new to YOU since
   your last launch", derived from the local snapshot diff — not a claim about
   when MUIS certified it. */
function diffAndAnnounce(freshRows, prevRows){
  if(!prevRows || !prevRows.length) return;          // first run — nothing to compare
  const prevById = new Map(prevRows.map(r => [r.id, r]));
  const freshIds = new Set(freshRows.map(r => r.id));

  const added   = freshRows.filter(r => !prevById.has(r.id));
  const removed = prevRows.filter(r => !freshIds.has(r.id));
  S.NEW_IDS = new Set(added.map(r => r.id));
  if(!added.length && !removed.length) return;

  /* A place YOU logged losing its certification is the most important thing
     this app can tell you — surface those first and mark them. */
  const removedVisited = removed.filter(r => hasVisited(r.id) || hasSaved(r.id));
  const rowHtml = (r, sign, warn) => `
    <div class="chg-item" data-id="${r.id}" ${warn?'style="border-color:var(--red)"':''}>
      <span class="s" style="color:${warn?'var(--red)':'var(--green)'}">${sign}</span>
      <span><span class="n">${escapeHtml((r.name||'').toUpperCase().slice(0,26))}</span>
      <span class="a2">${warn?'YOU LOGGED THIS — NOW DELISTED':escapeHtml(titleCase(r.address).slice(0,40))}</span></span>
    </div>`;

  const body =
    `<div style="margin-bottom:10px;">
       ${added.length   ? `<b style="color:var(--green)">${added.length} NEWLY LISTED</b><br>` : ''}
       ${removed.length ? `<b style="color:var(--red)">${removed.length} NO LONGER LISTED</b>` : ''}
     </div>` +
    removedVisited.map(r => rowHtml(r,'－',true)).join('') +
    removed.filter(r => !hasVisited(r.id) && !hasSaved(r.id)).slice(0,4).map(r => rowHtml(r,'－',false)).join('') +
    added.slice(0,6).map(r => rowHtml(r,'＋',false)).join('') +
    (added.length>6 ? `<div class="hint">+${added.length-6} MORE NEW</div>` : '');

  const buttons = [];
  if(added.length) buttons.push({ label:'SHOW NEW', cls:'btn-y', fn:() => {
    hideDialog();
    document.querySelectorAll('#filterRow .filter-pill').forEach(x => x.dataset.active='false');
    const p = document.querySelector('#filterRow .filter-pill[data-filter="new"]');
    if(p) p.dataset.active = 'true';
    setFilter('new'); setArea(null); applyFilters();
    const pts = added.map(r => [r.lat,r.lng]);
    if(pts.length) map.fitBounds(L.latLngBounds(pts).pad(.3), { maxZoom:15 });
  }});
  buttons.push({ label:'DISMISS', cls:'btn-w', fn:hideDialog });

  showDialog('REGISTRY UPDATED', body, buttons);
  document.querySelectorAll('#dlgBody .chg-item').forEach(el => {
    el.addEventListener('click', () => {
      const s = S.BY_ID[el.dataset.id];
      if(!s) { showToast('THIS ONE IS NO LONGER LISTED'); return; }   // removed rows have no map pin
      hideDialog(); map.setView([s.lat,s.lng],17); setTimeout(() => openSpot(s,null), 300);
    });
  });
}

/* Two different clocks, and they answer different questions:
     · cache age      — how long since THIS DEVICE last fetched
     · S.SYNCED_AT      — how long since the REGISTRY snapshot was taken upstream
   Only the second tells you whether the certification data itself is current,
   so that's what the status bar shows. A device that opens the app daily would
   never notice an upstream pipeline that had quietly stopped. */

function renderSyncStamp(){
  const el = document.getElementById('sbSync');
  if(!el) return;
  const d = daysSince(S.SYNCED_AT);
  if(d == null){ el.textContent = ''; el.className = 'sb-sync'; return; }
  const label = d < 1 ? 'TODAY' : d < 2 ? '1 DAY AGO' : `${Math.floor(d)} DAYS AGO`;
  el.textContent = 'SYNCED ' + label;
  el.className = 'sb-sync ' + (d >= UPSTREAM_STALE_DAYS ? 'stale' : d >= UPSTREAM_OLD_DAYS ? 'old' : 'ok');
  el.title = 'Registry synced ' + fmtSynced(S.SYNCED_AT);
}

/* Upstream staleness — the pipeline having stopped is invisible to someone who
   opens the app every day, so check the snapshot's own age, not the cache's. */
function warnIfUpstreamStale(){
  const d = daysSince(S.SYNCED_AT);
  if(d == null || d < UPSTREAM_STALE_DAYS) return;
  showDialog('REGISTRY MAY BE OUT OF DATE',
    `The halal registry snapshot behind this app was last updated
     <b>${Math.floor(d)} days ago</b>.<br><br>
     Certifications can lapse or be issued in that time, so treat these listings as a
     guide and <b>check the certificate on site</b>.`,
    [{ label:'GOT IT', cls:'btn-y', fn:hideDialog }]);
}

async function boot(forceRefresh){
  let usedCache = false;
  const cached = await cacheGet(CACHE_KEY);
  const prevRows = (cached && cached.rows) ? cached.rows : null;

  if(prevRows && prevRows.length){
    indexData(prevRows);
    renderSyncStamp();
    const ageMin = Math.round((Date.now() - cached.at) / 60000);
    readyUp(`${prevRows.length} SPOTS FROM CACHE (${ageMin < 60 ? ageMin+' MIN' : Math.round(ageMin/60)+' HR'} OLD)`);
    usedCache = true;

    /* The registry is a scheduled upstream snapshot, not a live feed, so there
       is nothing to gain from re-fetching 1,939 rows on every launch. Refresh
       at most once a day; the ⟳ stamp is tappable for a manual refresh. */
    if(!forceRefresh && (Date.now() - cached.at) < REVALIDATE_MS){
      applyFilters();                 // sets the status pill itself
      warnIfUpstreamStale();
      return;
    }
    setStatus('CACHED — REFRESHING...', 'busy');
  } else {
    setStatus('LOADING...', 'busy');
  }

  try{
    const t0 = performance.now();
    const { rows, partial } = await fetchAllEstablishments(n => { if(!usedCache) setStatus(`LOADING ${n}...`, 'busy'); });
    indexData(rows);
    // A partial fetch must not overwrite a complete cached snapshot.
    if(!partial || !prevRows || rows.length >= prevRows.length){
      await cacheSet(CACHE_KEY, { rows, at: Date.now() });
    }
    // Sync date lives in the footer — don't repeat it here.
    readyUp(`${rows.length} CERTIFIED SPOTS${partial?' (PARTIAL)':''} (${Math.round(performance.now()-t0)} MS)`);
    if(partial){
      setStatus('PARTIAL LOAD — SOME SPOTS MISSING', 'err');
      showToast('CONNECTION DROPPED MID-LOAD');
    }
    renderSyncStamp();
    diffAndAnnounce(rows, prevRows);
    applyFilters();
    document.getElementById('offlineBar').classList.remove('show');
    warnIfUpstreamStale();
  }catch(err){
    console.error(err);
    if(usedCache){
      // We still have data — degrade quietly rather than blocking the app.
      setStatus('OFFLINE — CACHED DATA', 'err');
      document.getElementById('offlineBar').classList.add('show');
      /* Certification lapses. Old cached data isn't just inconvenient, it can be
         wrong about whether somewhere is still certified — so past a threshold
         say so loudly rather than in a status pill. */
      const ageDays = (Date.now() - cached.at) / 86400000;
      if(ageDays >= STALE_DAYS){
        showDialog('SAVED DATA IS OLD',
          `This device last reached the registry <b>${Math.floor(ageDays)} days ago</b>.<br><br>
           Certifications can lapse in that time, so treat what you see as a guide and
           <b>check the certificate on site</b>.`,
          [{ label:'RETRY NOW', cls:'btn-y', fn:() => location.reload() },
           { label:'CONTINUE', cls:'btn-w', fn:hideDialog }]);
      }
    }else{
      // No data at all. The error must be visible even when the landing screen
      // is hidden for a returning user, so it goes in a dialog, not the landing.
      setStatus('DATA UNAVAILABLE', 'err');
      loadNote.classList.add('err');
      loadNote.textContent = 'COULD NOT REACH THE REGISTRY.';
      startBtn.disabled = false; startBtn.textContent = 'RETRY';
      showDialog('CAN\'T REACH THE REGISTRY',
        'No saved data on this device yet, so there is nothing to show offline.<br><br>Check your connection and try again.',
        [{ label:'RETRY', cls:'btn-y', fn:() => location.reload() }]);
    }
  }
}

/* Leaflet must be told when the viewport changes — a standalone PWA settles
   its safe-area/status bar after first paint, which otherwise leaves a stale
   map size and a blank-looking screen. */
function refreshMapSize(){ setTimeout(() => map.invalidateSize(), 60); }
window.addEventListener('resize', refreshMapSize);
window.addEventListener('orientationchange', refreshMapSize);
document.addEventListener('visibilitychange', () => { if(!document.hidden) refreshMapSize(); });

function goFullscreen(){
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if(req){ try{ req.call(el, { navigationUI:'hide' }); }catch(e){ try{ req.call(el); }catch(_){} } }
}
startBtn.addEventListener('click', () => {
  if(startBtn.disabled) return;
  if(startBtn.textContent === 'RETRY'){ location.reload(); return; }
  goFullscreen();
  document.getElementById('landing').classList.add('hide');
  save.started = true; persist();
  refreshMapSize();
  beginLiveScan();          // live scan is always on
});

const params = new URLSearchParams(location.search);
const launchAction = params.get('action');
const launchSpot = params.get('spot');
const launchVenue = params.get('venue');

/* Deep links: ?spot=<id> and ?venue=<NAME> open straight to a place, so a
   shared link lands somewhere useful instead of the default map. */
function handleDeepLink(){
  if(launchSpot){
    const s = S.BY_ID[launchSpot];
    if(s){ map.setView([s.lat,s.lng],17); setTimeout(() => openSpot(s,null), 350); }
    else showToast('THAT SPOT IS NO LONGER LISTED');
    return true;
  }
  if(launchVenue){
    const v = S.VENUE_INDEX.find(x => x.name === launchVenue.toUpperCase());
    if(v && v.groups.length){
      const g = v.groups[0];
      map.setView([g.lat,g.lng],17);
      setTimeout(() => openGroup(g), 350);
    } else showToast('VENUE NOT FOUND');
    return true;
  }
  return false;
}

if(save.started || launchAction || launchSpot || launchVenue){
  document.getElementById('landing').classList.add('hide');
  refreshMapSize();                       // the fix for the blank second launch
  beginLiveScan();                        // live scan is always on
  window.addEventListener('pointerdown', function once(){
    goFullscreen(); window.removeEventListener('pointerdown', once);
  }, { once:true });
}

/* An installable app that asks for location and camera should say plainly what
   it does with them, and that it isn't the certifying authority. */
document.getElementById('aboutBtn').addEventListener('click', () => {
  showDialog('ABOUT HALALAH',
    `<b style="color:var(--yellow)">NOT AN OFFICIAL MUIS APP.</b><br>
     HALALAH is an independent app. It is not affiliated with, endorsed by, or operated by
     Majlis Ugama Islam Singapura. Listings mirror the MUIS halal registry
     ${S.SYNCED_AT ? `(snapshot: ${fmtSynced(S.SYNCED_AT)})` : ''} and can lag behind it —
     <b>always check the certificate displayed at the premises.</b><br><br>

     <b style="color:var(--yellow)">YOUR DATA STAYS ON YOUR DEVICE.</b><br>
     · Location is used only to sort by distance and power the finder. It is never
       uploaded, stored remotely, or shared.<br>
     · The camera is used only to draw the AR view live on screen. No image is recorded,
       saved, or transmitted.<br>
     · Your log, saved places and progress live in this browser's local storage. Clearing
       your browser data erases them.<br>
     · There is no account, no S.tracking and no analytics.<br><br>

     <b style="color:var(--yellow)">DATA</b><br>
     Halal listings © MUIS. Map tiles © Esri, HERE, Garmin and OpenStreetMap contributors.
     Built with Leaflet (BSD-2-Clause) and Leaflet.markercluster (MIT).`,
    [{ label:'CLOSE', cls:'btn-y', fn:hideDialog }]);
});

/* Small map controls */
/* Tap the status pill to force a refresh, since the automatic one is now daily. */
document.getElementById('statusStrip').style.cursor = 'pointer';
document.getElementById('statusStrip').addEventListener('click', () => {
  showToast('REFRESHING REGISTRY...');
  boot(true);
});

document.getElementById('zoomIn').addEventListener('click', () => map.zoomIn());
document.getElementById('zoomOut').addEventListener('click', () => map.zoomOut());
document.getElementById('recenter').addEventListener('click', () => {
  if(S.playerPos) map.flyTo([S.playerPos.lat, S.playerPos.lng], 16, { duration:.6 });
  else { map.flyTo([1.3521,103.8198], 12, { duration:.6 }); showToast('TURN ON SCAN TO CENTRE ON YOU'); }
});
document.getElementById('legendBtn').addEventListener('click', () => {
  const l = document.getElementById('legend');
  l.classList.toggle('open');
  l.style.top = (document.querySelector('.hud-top').offsetHeight + 8) + 'px';
});
window.addEventListener('online',  () => { document.getElementById('offlineBar').classList.remove('show'); });
window.addEventListener('offline', () => { document.getElementById('offlineBar').classList.add('show'); });

boot().then(() => {
  if(launchAction === 'spin'){ wheelModal.classList.add('open'); drawWheel(); }
  if(launchAction === 'log'){ buildLog(true); logModal.classList.add('open'); }
  if(launchAction === 'near'){ buildNear(); nearModal.classList.add('open'); }
  handleDeepLink();
  refreshMapSize();
});

/* ==========================================================================
   18. PWA — runtime manifest + install
   A service worker can't be registered from a data:/blob: URL, so this
   single-file build has no offline SW; the IndexedDB cache above covers
   offline data instead. Chrome no longer requires a SW to install, and iOS
   Add to Home Screen never did.
   ========================================================================== */
(function injectManifest(){
  const here = location.href.split('?')[0].split('#')[0];
  const dir = here.substring(0, here.lastIndexOf('/') + 1);
  const manifest = {
    id:dir, name:"HALALAH — This one Halal ah?", short_name:"HALALAH",
    description:"Every MUIS-certified halal establishment in Singapore.",
    start_url:here, scope:dir,
    display:"fullscreen", display_override:["fullscreen","standalone","minimal-ui"],
    orientation:"portrait", background_color:"#000000", theme_color:"#000000",
    lang:"en-SG", categories:["food","travel","lifestyle"],
    icons:[
      { src:icon192,  sizes:"192x192", type:"image/png", purpose:"any" },
      { src:icon512,  sizes:"512x512", type:"image/png", purpose:"any" },
      { src:iconMaskable, sizes:"512x512", type:"image/png", purpose:"maskable" }
    ]
  };
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = 'data:application/manifest+json;charset=utf-8,' + encodeURIComponent(JSON.stringify(manifest));
  document.head.appendChild(link);

  /* iOS installs a standalone app only when apple-touch-icon is present —
     without it, Add to Home Screen degrades to a plain bookmark. */
  for(const [rel, sizes, href] of [['apple-touch-icon','192x192',icon192],
                                   ['apple-touch-icon','512x512',icon512],
                                   ['icon','192x192',icon192]]){
    const l = document.createElement('link');
    l.rel = rel; l.sizes = sizes; l.href = href;
    document.head.appendChild(l);
  }
})();

const installBtn = document.getElementById('installBtn');
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredPrompt = e;
  installBtn.textContent = '⤓ INSTALL APP';
  installBtn.style.display = 'block';
});
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.navigator.standalone === true ||
                     window.matchMedia('(display-mode: fullscreen)').matches ||
                     window.matchMedia('(display-mode: standalone)').matches;
if(isIOS && !isStandalone){
  installBtn.textContent = '⤓ ADD TO HOME SCREEN';
  installBtn.style.display = 'block';
}
installBtn.addEventListener('click', async () => {
  if(deferredPrompt){
    deferredPrompt.prompt(); await deferredPrompt.userChoice;
    deferredPrompt = null; installBtn.style.display = 'none'; return;
  }
  showToast('TAP SHARE, THEN ADD TO HOME SCREEN');
});

export { boot, indexData, renderSyncStamp, handleDeepLink, goFullscreen, warnIfUpstreamStale };
