/* MUIS prayer timetable.
   Source: data.gov.sg "Muslim Prayer Timetable (consolidated)" (Singapore Open
   Data Licence). Fetched in the browser, cached on the device, so the screen
   works offline after the first load. Where no official row exists for a date
   (first run offline, or a year MUIS has not published yet) the times are
   CALCULATED and the screen says so: never shown as official. */
import { calcTimes, roundTimes } from './calc.js';
import { place, tzOffset } from './place.js';

const DATASET = 'd_a6a206cba471fe04b62dd886ef5eaf22';
/* In the Android app the shell fetches for us (/muis), which avoids the browser's cross-site limits. */
const API = (typeof window !== 'undefined' && window.HalalahApp ? '/muis' : 'https://data.gov.sg/api/action/datastore_search')
  + '?resource_id=' + DATASET;
const KEY = 'hl.solat.v1';
export const PRAYERS = ['subuh','syuruk','zohor','asar','maghrib','isyak'];
export const LABEL = { subuh:'Subuh', syuruk:'Syuruk', zohor:'Zohor', asar:'Asar', maghrib:'Maghrib', isyak:'Isyak' };

let store = { fetchedAt:0, days:{} };
export let lastError = '';
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
  const week = 12 * 36e5;                     // ask again after 12 hours, so 'Live' means checked today
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
    lastError = '';
    return { ok:true, count:Object.keys(days).length };
  }catch(err){ lastError = String(err && err.message || err); return { ok:false, error:lastError }; }
}

export function status(){
  const ks = Object.keys(store.days).sort();
  return { count:ks.length, first:ks[0], last:ks[ks.length-1], fetchedAt:store.fetchedAt };
}

/* ---- which times to show ----
   Singapore: the official row when the phone has it, else calculated with MUIS's angles and labelled Estimated.
   Travel: always calculated for the place in use (place.js), with the user's buffer; never shown as official.
   d carries the calendar day in its local fields. -> { times, raw, official, calc, buffer } (minutes after midnight there) */
const SG = { lat:1.3521, lng:103.8198, tz:8, method:'MUIS', asr:1 };
export function timesFor(d){
  const pl = place();
  if(pl.kind === 'sg'){
    const row = store.days[dkey(d)];
    if(row) return { times:row, raw:row, official:true, calc:false, buffer:0 };
    const t = roundTimes(calcTimes(d.getFullYear(), d.getMonth(), d.getDate(), SG));
    return { times:t, raw:t, official:false, calc:false, buffer:0 };
  }
  const noonUtc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 4));
  const tz = (pl.tzName ? tzOffset(pl.tzName, noonUtc) : -new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTimezoneOffset()) / 60;
  const raw = roundTimes(calcTimes(d.getFullYear(), d.getMonth(), d.getDate(), { lat:pl.lat, lng:pl.lng, tz, method:pl.method, asr:pl.asr }));
  const times = raw.map((v, i) => v == null ? null : v + (i === 1 ? -pl.buffer : pl.buffer));
  return { times, raw, official:false, calc:true, buffer:pl.buffer };
}
export const fmt = m => m == null ? '—' : pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60);

/* How far to trust the times on screen (shown in the banner, never by colour alone):
   live = official and checked with data.gov.sg in the last 24 hours; saved = official, from this phone's copy;
   est = calculated, no official row for that date; calc = travel mode, calculated for another place. */
export function trust(d){
  if(place().kind !== 'sg') return 'calc';
  if(!store.days[dkey(d)]) return 'est';
  return Date.now() - store.fetchedAt < 864e5 ? 'live' : 'saved';
}
