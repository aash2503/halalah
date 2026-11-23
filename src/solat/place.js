/* Where the prayer times are for.
   - Singapore: the official MUIS timetable (data.js). This is the only place with official times in the app.
   - Anywhere else ("travel"): CALCULATED from the sun's position with a named method. Every choice that moves a
     time (method, Asar rule, buffer) is listed by adjustments() and shown to the user: nothing shifts quietly. */
import { METHODS } from './calc.js';

const KEY = 'hl.place', GPS = 'hl.place.gps';
/* name, country, lat, lng, IANA time zone, default method */
export const CITIES = [
  ['Kota Kinabalu','Malaysia',5.9804,116.0735,'Asia/Kuching','JAKIM'], ['Kuala Lumpur','Malaysia',3.1390,101.6869,'Asia/Kuala_Lumpur','JAKIM'],
  ['Johor Bahru','Malaysia',1.4927,103.7414,'Asia/Kuala_Lumpur','JAKIM'], ['Melaka','Malaysia',2.1896,102.2501,'Asia/Kuala_Lumpur','JAKIM'],
  ['Penang','Malaysia',5.4141,100.3288,'Asia/Kuala_Lumpur','JAKIM'], ['Langkawi','Malaysia',6.3500,99.8000,'Asia/Kuala_Lumpur','JAKIM'],
  ['Kuching','Malaysia',1.5533,110.3592,'Asia/Kuching','JAKIM'], ['Jakarta','Indonesia',-6.2088,106.8456,'Asia/Jakarta','KEMENAG'],
  ['Batam','Indonesia',1.0456,104.0305,'Asia/Jakarta','KEMENAG'], ['Bali (Denpasar)','Indonesia',-8.6705,115.2126,'Asia/Makassar','KEMENAG'],
  ['Yogyakarta','Indonesia',-7.7956,110.3695,'Asia/Jakarta','KEMENAG'], ['Bandung','Indonesia',-6.9175,107.6191,'Asia/Jakarta','KEMENAG'],
  ['Bandar Seri Begawan','Brunei',4.9031,114.9398,'Asia/Brunei','JAKIM'], ['Bangkok','Thailand',13.7563,100.5018,'Asia/Bangkok','MWL'],
  ['Phuket','Thailand',7.8804,98.3923,'Asia/Bangkok','MWL'], ['Ho Chi Minh City','Vietnam',10.8231,106.6297,'Asia/Ho_Chi_Minh','MWL'],
  ['Hanoi','Vietnam',21.0278,105.8342,'Asia/Ho_Chi_Minh','MWL'], ['Manila','Philippines',14.5995,120.9842,'Asia/Manila','MWL'],
  ['Hong Kong','China',22.3193,114.1694,'Asia/Hong_Kong','MWL'], ['Shenzhen','China',22.5431,114.0579,'Asia/Shanghai','MWL'],
  ['Shanghai','China',31.2304,121.4737,'Asia/Shanghai','MWL'], ['Beijing','China',39.9042,116.4074,'Asia/Shanghai','MWL'],
  ['Taipei','Taiwan',25.0330,121.5654,'Asia/Taipei','MWL'], ['Tokyo','Japan',35.6762,139.6503,'Asia/Tokyo','MWL'],
  ['Osaka','Japan',34.6937,135.5023,'Asia/Tokyo','MWL'], ['Seoul','South Korea',37.5665,126.9780,'Asia/Seoul','MWL'],
  ['Jeju','South Korea',33.4996,126.5312,'Asia/Seoul','MWL'], ['Makkah','Saudi Arabia',21.4225,39.8262,'Asia/Riyadh','MAKKAH'],
  ['Madinah','Saudi Arabia',24.5247,39.5692,'Asia/Riyadh','MAKKAH'], ['Jeddah','Saudi Arabia',21.4858,39.1925,'Asia/Riyadh','MAKKAH'],
  ['Dubai','UAE',25.2048,55.2708,'Asia/Dubai','MAKKAH'], ['Doha','Qatar',25.2854,51.5310,'Asia/Qatar','MAKKAH'],
  ['Istanbul','Türkiye',41.0082,28.9784,'Europe/Istanbul','DIYANET'], ['Cairo','Egypt',30.0444,31.2357,'Africa/Cairo','EGYPT'],
  ['Delhi','India',28.6139,77.2090,'Asia/Kolkata','KARACHI'], ['Kochi','India',9.9312,76.2673,'Asia/Kolkata','KARACHI'],
  ['Colombo','Sri Lanka',6.9271,79.8612,'Asia/Colombo','KARACHI'], ['Malé','Maldives',4.1755,73.5093,'Indian/Maldives','MWL'],
  ['London','United Kingdom',51.5074,-0.1278,'Europe/London','MWL'], ['Paris','France',48.8566,2.3522,'Europe/Paris','MWL'],
  ['Sydney','Australia',-33.8688,151.2093,'Australia/Sydney','MWL'], ['Melbourne','Australia',-37.8136,144.9631,'Australia/Melbourne','MWL'],
  ['Perth','Australia',-31.9505,115.8605,'Australia/Perth','MWL'], ['Auckland','New Zealand',-36.8485,174.7633,'Pacific/Auckland','MWL'],
  ['New York','United States',40.7128,-74.0060,'America/New_York','ISNA'], ['Los Angeles','United States',34.0522,-118.2437,'America/Los_Angeles','ISNA'],
].map(c => ({ name:c[0], country:c[1], lat:c[2], lng:c[3], tzName:c[4], method:c[5] }));

export function prefs(){
  let s = {}; try{ s = JSON.parse(localStorage.getItem(KEY)) || {}; }catch(e){}
  return { mode: ['sg','gps','city'].includes(s.mode) ? s.mode : 'sg', city: (s.city === 'Singapore' || CITIES.some(c => c.name === s.city)) ? s.city : 'Kota Kinabalu',
           method: METHODS[s.method] ? s.method : 'auto', asr: s.asr === 2 ? 2 : 1, buffer: [0,1,2,3,4,5].includes(s.buffer) ? s.buffer : 0 };
}
export function setPref(k, v){ const s = prefs(); s[k] = v; try{ localStorage.setItem(KEY, JSON.stringify(s)); }catch(e){} }

export function gpsFix(){ try{ const g = JSON.parse(localStorage.getItem(GPS)); return g && typeof g.lat === 'number' ? g : null; }catch(e){ return null; } }
export function saveFix(lat, lng){ try{ localStorage.setItem(GPS, JSON.stringify({ lat, lng, at: Date.now() })); }catch(e){} }

const km = (a, b, c, d) => { const R = Math.PI / 180, x = (d - b) * R * Math.cos((a + c) * R / 2), y = (c - a) * R; return Math.sqrt(x * x + y * y) * 6371; };
function nearestCity(lat, lng){ let best = null; for(const c of CITIES){ const d = km(lat, lng, c.lat, c.lng); if(!best || d < best.d) best = { c, d }; } return best; }

/* minutes east of UTC at a place on a given date (handles daylight saving) */
export function tzOffset(tzName, date = new Date()){
  try{
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tzName, hourCycle:'h23', year:'numeric', month:'numeric', day:'numeric', hour:'numeric', minute:'numeric' }).formatToParts(date);
    const g = t => +p.find(x => x.type === t).value;
    return Math.round((Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - date.getTime()) / 60000);
  }catch(e){ return -date.getTimezoneOffset(); }
}

/* The place in use.
   -> { kind:'sg' } | { kind:'calc', name, detail, lat, lng, tzName|null, method, methodAuto, asr, buffer, needsFix } */
export function place(){
  const p = prefs();
  /* Singapore picked from the city list is the same as the Singapore tab: the official MUIS timetable, never calculated. */
  if(p.mode === 'sg' || (p.mode === 'city' && p.city === 'Singapore')) return { kind:'sg', name:'Singapore', tzName:'Asia/Singapore', buffer:0 };
  let base;
  if(p.mode === 'city'){ const c = CITIES.find(x => x.name === p.city); base = { name:c.name, detail:c.country, lat:c.lat, lng:c.lng, tzName:c.tzName, auto:c.method }; }
  else {
    const g = gpsFix();
    if(!g) return { kind:'calc', needsFix:true, name:'Where I am', detail:'Location not found yet', lat:1.3521, lng:103.8198, tzName:null, method:'MUIS', methodAuto:true, asr:p.asr, buffer:p.buffer };
    const n = nearestCity(g.lat, g.lng);
    base = { name: n.d < 60 ? n.c.name : n.d < 400 ? 'Near ' + n.c.name : g.lat.toFixed(2) + '°, ' + g.lng.toFixed(2) + '°',
             detail: n.d < 400 ? n.c.country : 'Your location', lat:g.lat, lng:g.lng, tzName:null, auto: n.d < 1500 ? n.c.method : 'MWL' };
  }
  const method = p.method === 'auto' ? base.auto : p.method;
  return { kind:'calc', name:base.name, detail:base.detail, lat:base.lat, lng:base.lng, tzName:base.tzName, method, methodAuto:p.method === 'auto', asr:p.asr, buffer:p.buffer };
}

/* minutes east of UTC for the place in use (the phone's own zone for "Where I am") */
export function placeOffset(date = new Date()){ const pl = place(); return pl.tzName ? tzOffset(pl.tzName, date) : -date.getTimezoneOffset(); }

/* "Now" at the place, as a Date whose LOCAL fields (getHours, getDate...) read the place's clock. */
export function placeNow(){ const n = new Date(); return new Date(n.getTime() + (placeOffset(n) + n.getTimezoneOffset()) * 60000); }

/* The instant (epoch ms) of a clock time at the place: day = a Date carrying the place's calendar day in its local fields. */
export function instantAt(day, minutes){
  const guess = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes);
  return guess - placeOffset(new Date(guess)) * 60000;
}

/* Everything currently changing the numbers, in plain words (More > Place, and the banner's explanation). */
export function adjustments(hijriAdj = 0){
  const pl = place(), out = [];
  if(pl.kind === 'calc'){
    const M = METHODS[pl.method];
    out.push('Times are calculated for ' + pl.name + ', not taken from an official timetable.');
    out.push('Method: ' + M.name + (pl.methodAuto ? ' (chosen automatically for this place)' : ' (chosen by you)') + '. Subuh when the sun is ' + M.fajr + '° below the horizon; Isyak ' + (M.ishaMin ? M.ishaMin + ' minutes after Maghrib' : 'at ' + M.isha + '°') + '.');
    if(M.pad) out.push('This method adds its own ' + M.pad + ' minutes of caution to every time.');
    out.push('Asar: ' + (pl.asr === 2 ? 'Hanafi (shadow twice the object\'s length).' : 'Shafi\'i, Maliki and Hanbali (shadow equal to the object\'s length).'));
    out.push('Rounding: prayer starts round up to the next minute, sunrise rounds down.');
    if(pl.buffer) out.push('Your buffer: ' + pl.buffer + (pl.buffer === 1 ? ' minute' : ' minutes') + ' added to each prayer\'s start and taken off sunrise. Times with a buffer are marked +' + pl.buffer + '.');
  } else out.push('Singapore: the official MUIS timetable. Nothing is adjusted.');
  if(hijriAdj) out.push('Hijri date moved ' + Math.abs(hijriAdj) + ' day ' + (hijriAdj > 0 ? 'later' : 'earlier') + ' by you.');
  return out;
}
