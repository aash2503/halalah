/* Pure helpers — no DOM, no state, no imports. Safe for anything to use. */

function titleCase(str){
  if(!str) return "";
  return str.toLowerCase().replace(/\b([a-z])/g,(m,c)=>c.toUpperCase())
            .replace(/#([a-z0-9-/]+)/gi, m => m.toUpperCase());
}

const fmtDist = m => (m===undefined||m===null) ? "—" : (m<1000 ? Math.round(m)+"m" : (m/1000).toFixed(1)+"km");

function regionFor(lat,lng){
  if(lat > 1.40) return "NORTH";
  if(lng > 103.90) return "EAST";
  if(lng < 103.75) return "WEST";
  return "CENTRAL";
}

function escapeHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function haversine(a1,o1,a2,o2){
  const R=6371000, r=d=>d*Math.PI/180;
  const dLat=r(a2-a1), dLon=r(o2-o1);
  const x = Math.sin(dLat/2)**2 + Math.cos(r(a1))*Math.cos(r(a2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

/* Initial bearing from point 1 to point 2, degrees clockwise from north. */
function bearing(a1,o1,a2,o2){
  const r=d=>d*Math.PI/180, φ1=r(a1), φ2=r(a2), Δλ=r(o2-o1);
  const y = Math.sin(Δλ)*Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  return (Math.atan2(y,x)*180/Math.PI + 360) % 360;
}

function daysSince(iso){
  if(!iso) return null;
  const t = new Date(iso).getTime();
  return isNaN(t) ? null : (Date.now() - t) / 86400000;
}

function fmtSynced(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d)) return '';
  return d.toLocaleDateString('en-SG', { day:'numeric', month:'short', year:'numeric' }).toUpperCase();
}

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

/* Deep link back into the app for a single spot. Pure, so it lives here
   rather than in sheet.js — share.js needs it and importing sheet would
   make a cycle (sheet -> share -> sheet). */
const appUrl = () => location.origin + location.pathname;
function spotLink(s){ return `${appUrl()}?spot=${encodeURIComponent(s.id)}`; }

/* Unit numbers are the only useful wayfinding inside a mall, and 91% of eat-in
   rows carry one. "#B1-42/43/44" -> "#B1-42", level "B1". Levels sort
   basement-first, the way lift buttons do. */
function unitOf(address){
  const m = (address || '').match(/#([A-Z0-9]+)-([A-Z0-9]+)/i);
  if(m) return `#${m[1].toUpperCase()}-${m[2].toUpperCase()}`;
  const m2 = (address || '').match(/#([A-Z0-9]+)/i);
  return m2 ? `#${m2[1].toUpperCase()}` : null;
}
function levelLabel(address){
  const m = (address || '').match(/#([A-Z0-9]+)-/i) || (address || '').match(/#([A-Z0-9]+)/i);
  return m ? m[1].toUpperCase() : null;
}
function levelRank(label){
  if(!label) return 999;
  const b = label.match(/^B(\d+)$/);            // B2 below B1 below ground
  if(b) return -Number(b[1]);
  const n = label.match(/^0*(\d+)$/);
  return n ? Number(n[1]) : 500;
}

export { unitOf, levelLabel, levelRank, appUrl, spotLink, titleCase, fmtDist, regionFor, escapeHtml, haversine, bearing, daysSince, fmtSynced, shuffle };
