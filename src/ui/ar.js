import { S } from '../state.js';
import { SCHEME_EAT, AR_FOV, AR_RADII } from '../config.js';
import { fmtDist, escapeHtml, bearing } from '../util.js';
import { subMeta, venueName } from '../data/model.js';
import { map } from '../map/map.js';
import { showToast } from './toast.js';
import { openSpot, openGroup } from './sheet.js';

/* ==========================================================================
   15. AR FINDER — camera + compass, with a 2D radar fallback
   --------------------------------------------------------------------------
   Camera and orientation both require a SECURE CONTEXT (https, or localhost).
   iOS 13+ additionally requires DeviceOrientationEvent.requestPermission()
   from inside a user gesture, and reports true-north via webkitCompassHeading;
   Android reports alpha and needs screen-orientation compensation.
   Headings are noisy and the coordinates are building-level, so this is a
   DIRECTIONAL FINDER ("that way, 120m"), not survey-grade AR anchoring.
   ========================================================================== */
const arModal = document.getElementById('arModal');
const arScene = document.getElementById('arScene');
const arVideo = document.getElementById('arVideo');
let arOpen = false, arStream = null, arHeading = null, arRadius = 500;
let arRadarOnly = false, arOrientHandler = null;

function headingFromEvent(e){
  if(typeof e.webkitCompassHeading === 'number') return e.webkitCompassHeading;   // iOS, true north
  if(e.absolute === true && typeof e.alpha === 'number'){
    let h = 360 - e.alpha;                                                        // Android
    const so = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    return (h + so + 360) % 360;
  }
  return null;
}
async function startAR(){
  arModal.classList.add('open'); arOpen = true;
  if(!S.playerPos) showToast('TURN ON SCAN FOR DISTANCES');

  const secure = window.isSecureContext;
  if(!secure){
    setArNote('CAMERA + COMPASS NEED HTTPS.<br>SHOWING RADAR ONLY.');
    enableRadarOnly(true);
  } else {
    // Orientation permission must be requested from the tap that opened AR.
    try{
      if(typeof DeviceOrientationEvent !== 'undefined' &&
         typeof DeviceOrientationEvent.requestPermission === 'function'){
        const st = await DeviceOrientationEvent.requestPermission();
        if(st !== 'granted') setArNote('COMPASS DENIED — DIRECTION UNAVAILABLE');
      }
    }catch(e){}
    arOrientHandler = e => {
      const h = headingFromEvent(e);
      if(h == null) return;
      // Low-pass filter: raw magnetometer output jitters badly.
      arHeading = arHeading == null ? h
        : (((h - arHeading + 540) % 360) - 180) * 0.18 + arHeading;
      arHeading = (arHeading + 360) % 360;
      document.getElementById('arCompass').textContent = `HEADING ${Math.round(arHeading)}°`;
      renderAR();
    };
    window.addEventListener('deviceorientationabsolute', arOrientHandler, true);
    window.addEventListener('deviceorientation', arOrientHandler, true);

    if(!arRadarOnly){
      try{
        arStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:'environment' } }, audio:false });
        arVideo.srcObject = arStream;
      }catch(err){
        setArNote('CAMERA UNAVAILABLE — RADAR MODE');
        enableRadarOnly(true);
      }
    }
  }
  renderAR();
}
function stopAR(){
  arOpen = false; arModal.classList.remove('open');
  if(arStream){ arStream.getTracks().forEach(t => t.stop()); arStream = null; arVideo.srcObject = null; }
  if(arOrientHandler){
    window.removeEventListener('deviceorientationabsolute', arOrientHandler, true);
    window.removeEventListener('deviceorientation', arOrientHandler, true);
    arOrientHandler = null;
  }
}
function setArNote(html){ document.getElementById('arNote').innerHTML = html; }
function enableRadarOnly(on){
  arRadarOnly = on;
  document.getElementById('radarWrap').classList.toggle('on', on);
  arVideo.style.display = on ? 'none' : 'block';
  document.getElementById('arToggle').textContent = on ? 'CAMERA MODE' : 'RADAR MODE';
  if(on && arStream){ arStream.getTracks().forEach(t => t.stop()); arStream = null; arVideo.srcObject = null; }
}
/* Targets are BUILDINGS, not rows. Every stall in one mall shares a coordinate,
   so it shares a bearing and a distance too — rendering one tag per row stacked
   26 identical labels on the same pixel. One tag per building, with a count. */
function arCandidates(){
  if(!S.playerPos) return [];
  const near = S.ALL.filter(s => s.scheme === SCHEME_EAT && s._dist != null && s._dist <= arRadius);
  const byCoord = new Map();
  for(const s of near){
    const k = s.lat + ',' + s.lng;
    if(!byCoord.has(k)) byCoord.set(k, { key:k, lat:s.lat, lng:s.lng, dist:s._dist, items:[] });
    byCoord.get(k).items.push(s);
  }
  return [...byCoord.values()].sort((a,b) => a.dist - b.dist).slice(0, 12);
}
function renderAR(){
  if(!arOpen) return;
  const rows = arCandidates();
  const radar = document.getElementById('radar');
  radar.querySelectorAll('.blip').forEach(b => b.remove());
  arScene.querySelectorAll('.ar-tag').forEach(t => t.remove());

  if(!S.playerPos){ setArNote('TURN ON SCAN TO SEE WHAT’S AROUND'); return; }
  if(!rows.length){ setArNote(`NOTHING WITHIN ${fmtDist(arRadius)}`); return; }
  const spotCount = rows.reduce((n,g) => n + g.items.length, 0);
  if(arHeading == null && !arRadarOnly) setArNote('MOVE YOUR PHONE IN A FIGURE 8 TO CALIBRATE');
  else setArNote(`${spotCount} SPOTS IN ${rows.length} PLACES · TAP A TAG`);

  for(const g of rows){
    const brg = bearing(S.playerPos.lat, S.playerPos.lng, g.lat, g.lng);

    // --- radar blip (always drawn; north-up) ---
    const rad = (brg - 90) * Math.PI/180;
    const frac = Math.min(1, g.dist / arRadius) * 0.46;
    const b = document.createElement('div');
    b.className = 'blip' + (g.dist < 150 ? ' hot' : '');
    b.style.left = (50 + Math.cos(rad)*frac*100) + '%';
    b.style.top  = (50 + Math.sin(rad)*frac*100) + '%';
    radar.appendChild(b);

    // --- camera overlay tag (needs a heading) ---
    if(arHeading == null || arRadarOnly) continue;
    const rel = ((brg - arHeading + 540) % 360) - 180;   // -180..180
    if(Math.abs(rel) > AR_FOV/2) continue;               // outside the viewfinder

    /* Keep tags fully on screen. A tag centred at 0% or 100% loses half its
       width to the bezel; clamping trades a little edge-of-view precision for
       labels you can actually read. The crosshair remains the true reference. */
    const left = Math.max(24, Math.min(76, 50 + (rel/(AR_FOV/2))*50));
    const top = 32 + Math.min(1, g.dist / arRadius) * 34;
    const lead = g.items[0];
    const venue = venueName(lead.address);
    const label = g.items.length > 1 && venue ? venue : (lead.name || '');
    const t = document.createElement('div');
    t.className = 'ar-tag' + (g.dist > arRadius*0.6 ? ' far' : '') + (g.items.length > 1 ? ' multi' : '');
    t.innerHTML =
      `<div class="an">${escapeHtml(label.toUpperCase().slice(0,20))}</div>
       <div class="ad">${fmtDist(g.dist)}${g.items.length === 1 ? ' · ' + subMeta(lead).label : ''}</div>` +
      (g.items.length > 1 ? `<div class="acount">${g.items.length} HALAL SPOTS ▸</div>` : '');
    t.style.left = left + '%';
    t.style.top  = Math.min(top, 74) + '%';
    /* Tapping a tag opens the place. The AR view sits above the sheet, so it
       has to close first or the sheet opens behind it. */
    t.addEventListener('click', () => {
      stopAR();
      const full = S.BY_ID[lead.id] || lead;
      map.setView([g.lat, g.lng], 17);
      const mapGroup = S.GROUP_BY_KEY[g.key];
      setTimeout(() => {
        if(g.items.length > 1 && mapGroup) openGroup(mapGroup);
        else openSpot(full, null);
      }, 300);
    });
    arScene.appendChild(t);
  }

  /* De-collide against MEASURED boxes rather than guessed widths — label length
     varies enough that a predicted threshold either overlapped or over-spread.
     Each tag drops until it clears everything already placed. */
  const tagEls = [...arScene.querySelectorAll('.ar-tag')];
  for(let i=1; i<tagEls.length; i++){
    for(let guard=0; guard<14; guard++){
      const a = tagEls[i].getBoundingClientRect();
      const clash = tagEls.slice(0,i).some(o => {
        const b = o.getBoundingClientRect();
        return !(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top);
      });
      if(!clash) break;
      tagEls[i].style.top = (parseFloat(tagEls[i].style.top) + 7) + '%';
    }
  }
}
document.getElementById('openAR').addEventListener('click', startAR);
document.getElementById('arClose').addEventListener('click', stopAR);
document.getElementById('arToggle').addEventListener('click', async () => {
  if(arRadarOnly){
    enableRadarOnly(false);
    if(window.isSecureContext){
      try{
        arStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:'environment' } }, audio:false });
        arVideo.srcObject = arStream;
      }catch(e){ setArNote('CAMERA UNAVAILABLE — RADAR MODE'); enableRadarOnly(true); }
    } else { setArNote('CAMERA NEEDS HTTPS'); enableRadarOnly(true); }
  } else enableRadarOnly(true);
  renderAR();
});
document.getElementById('arRadius').addEventListener('click', () => {
  arRadius = AR_RADII[(AR_RADII.indexOf(arRadius) + 1) % AR_RADII.length];
  document.getElementById('arRadius').textContent = fmtDist(arRadius).toUpperCase();
  renderAR();
});

/* geo.js calls this on every position update; keeping arOpen private
   avoids geo reaching into this module's internals. */
function renderARIfOpen(){ if(arOpen) renderAR(); }

export { startAR, stopAR, renderAR, renderARIfOpen, arCandidates, arModal };
