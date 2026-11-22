/* MUIS prayer timetable.
   Source: data.gov.sg "Muslim Prayer Timetable (consolidated)" (Singapore Open
   Data Licence). Fetched in the browser, cached on the device, so the screen
   works offline after the first load. Where no official row exists for a date
   (first run offline, or a year MUIS has not published yet) the times are
   CALCULATED and the screen says so: never shown as official. */
const DATASET = 'd_a6a206cba471fe04b62dd886ef5eaf22';
const API = 'https://data.gov.sg/api/action/datastore_search?resource_id=' + DATASET;
const KEY = 'hl.solat.v1';
export const PRAYERS = ['subuh','syuruk','zohor','asar','maghrib','isyak'];
export const LABEL = { subuh:'Subuh', syuruk:'Syuruk', zohor:'Zohor', asar:'Asar', maghrib:'Maghrib', isyak:'Isyak' };

let store = { fetchedAt:0, days:{} };
try{ const s = JSON.parse(localStorage.getItem(KEY)); if(s && s.days) store = s; }catch(e){}

export const pad = n => String(n).padStart(2,'0');
export const dkey = d => d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());

/* Forgiving parsers (Rule 11): the published files have used "2026-01-01" and
   "1/1/2026" for dates, and "05:44", "5:44" and "5 44" (12-hour, no am/pm) for
   times. From 2026 the times are 24-hour. */
export function parseDate(v){
  const s = String(v).trim(); let m;
  if((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
  if((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return m[3] + '-' + pad(+m[2]) + '-' + pad(+m[1]);
  return null;
}
export function parseTime(v, prayer){
  const m = String(v).trim().match(/^(\d{1,2})\D+(\d{2})/); if(!m) return null;
  let h = +m[1]; const mi = +m[2];
  if(prayer === 'zohor' && h < 11) h += 12;
  if((prayer === 'asar' || prayer === 'maghrib' || prayer === 'isyak') && h < 12) h += 12;
  return h * 60 + mi;
}
export function parseRows(records){
  const out = {};
  for(const r of records){
    const f = {}; for(const k in r) f[k.toLowerCase().replace(/[^a-z]/g,'')] = r[k];
    const d = parseDate(f.date); if(!d) continue;
    const t = {}; let ok = true;
    for(const p of PRAYERS){ t[p] = parseTime(f[p], p); if(t[p] == null) ok = false; }
    if(ok) out[d] = PRAYERS.map(p => t[p]);
  }
  return out;
}

export async function refresh(force){
  const week = 7 * 864e5;
  const haveNextMonth = !!store.days[dkey(new Date(Date.now() + 30 * 864e5))];
  if(!force && haveNextMonth && Date.now() - store.fetchedAt < week) return { ok:true, cached:true };
  try{
    const days = {}; let offset = 0, total = Infinity;
    while(offset < total){
      const res = await fetch(API + '&limit=1000&offset=' + offset);
      if(!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json(); const recs = (j.result && j.result.records) || [];
      total = (j.result && j.result.total) || recs.length;
      Object.assign(days, parseRows(recs));
      offset += recs.length; if(!recs.length) break;
    }
    if(!Object.keys(days).length) throw new Error('no rows understood');
    store = { fetchedAt: Date.now(), days };
    try{ localStorage.setItem(KEY, JSON.stringify(store)); }catch(e){}
    return { ok:true, count:Object.keys(days).length };
  }catch(err){ return { ok:false, error:String(err && err.message || err) }; }
}

export function status(){
  const ks = Object.keys(store.days).sort();
  return { count:ks.length, first:ks[0], last:ks[ks.length-1], fetchedAt:store.fetchedAt };
}

/* ---- calculated fallback (Singapore, Fajr 20 deg, Isha 18 deg, Shafi'i Asar) ---- */
const LAT = 1.3521, LNG = 103.8198, TZ = 8, R = Math.PI / 180;
function calc(d){
  const jd = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5 + 2440587.5 - LNG / 360;
  const D = jd - 2451545, g = (357.529 + 0.98560028 * D) * R, q = 280.459 + 0.98564736 * D;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * R, e = (23.439 - 0.00000036 * D) * R;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  let ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / R / 15; ra = ((ra % 24) + 24) % 24;
  const eqt = ((q / 15 - ra) % 24 + 36) % 24 - 12;
  const noon = 12 + TZ - LNG / 15 - eqt;
  const ha = a => Math.acos((Math.sin(a * R) - Math.sin(LAT * R) * Math.sin(dec)) / (Math.cos(LAT * R) * Math.cos(dec))) / R / 15;
  const asr = Math.atan(1 / (1 + Math.tan(Math.abs(LAT * R - dec)))) / R;
  return [noon - ha(-20), noon - ha(-0.833), noon + 1/60, noon + ha(asr), noon + ha(-0.833), noon + ha(-18)].map(h => Math.round(h * 60));
}

/* -> { times:[minutes x6], official:boolean } */
export function timesFor(d){
  const row = store.days[dkey(d)];
  return row ? { times:row, official:true } : { times:calc(d), official:false };
}
export const fmt = m => pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60);
