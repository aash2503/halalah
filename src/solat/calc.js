/* Calculated prayer times for any place: standard solar astronomy plus a named convention ("method") for the two
   twilight prayers. Pure functions, no state. Times are minutes after local midnight at the place (tz = hours east of UTC).
   A calculated time is never "official": the screen always names the method and any adjustment (see place.js). */
const R = Math.PI / 180;

/* fajr / isha = degrees of sun below the horizon; ishaMin = fixed minutes after Maghrib (replaces the angle);
   pad = minutes of caution the authority itself adds to every time (its "ihtiyat"), taken off Syuruk. */
export const METHODS = {
  MUIS:    { name:'MUIS (Singapore)',            fajr:20,   isha:18,   pad:0 },
  JAKIM:   { name:'JAKIM (Malaysia)',            fajr:18,   isha:18,   pad:0 },
  KEMENAG: { name:'Kemenag (Indonesia)',         fajr:20,   isha:18,   pad:2 },
  MWL:     { name:'Muslim World League',         fajr:18,   isha:17,   pad:0 },
  MAKKAH:  { name:'Umm al-Qura (Makkah)',        fajr:18.5, ishaMin:90, pad:0 },
  EGYPT:   { name:'Egyptian General Authority',  fajr:19.5, isha:17.5, pad:0 },
  KARACHI: { name:'Karachi (South Asia)',        fajr:18,   isha:18,   pad:0 },
  ISNA:    { name:'ISNA (North America)',        fajr:15,   isha:15,   pad:0 },
  DIYANET: { name:'Diyanet (Türkiye)',           fajr:18,   isha:17,   pad:0 },
};

function sun(jd){
  const D = jd - 2451545, g = (357.529 + 0.98560028 * D) * R, q = 280.459 + 0.98564736 * D;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * R, e = (23.439 - 0.00000036 * D) * R;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  let ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / R / 15; ra = ((ra % 24) + 24) % 24;
  const eqt = ((q / 15 - ra) % 24 + 36) % 24 - 12;
  return { dec, eqt };
}

/* o = { lat, lng, tz, method, asr: 1 (Shafi'i, Maliki, Hanbali) | 2 (Hanafi) }
   -> [subuh, syuruk, zohor, asar, maghrib, isyak] in minutes (not rounded: callers round once, after any adjustment),
   or null where the sun never reaches that angle (far north or south in summer). */
export function calcTimes(y, m, d, o){
  const M = METHODS[o.method] || METHODS.MWL, lat = o.lat * R;
  const jd0 = Date.UTC(y, m, d) / 864e5 + 2440587.5 - o.lng / 360;
  const at = (hours) => sun(jd0 + hours / 24);
  const noonOf = s => 12 + o.tz - o.lng / 15 - s.eqt;
  const ha = (s, alt) => { const c = (Math.sin(alt * R) - Math.sin(lat) * Math.sin(s.dec)) / (Math.cos(lat) * Math.cos(s.dec)); return Math.abs(c) > 1 ? null : Math.acos(c) / R / 15; };
  /* each time is refined once with the sun's position at that time (the first pass uses noon) */
  const solve = (alt, sign, guess) => {
    let t = guess;
    for(let i = 0; i < 2; i++){ const s = at(t - o.tz), h = typeof alt === 'function' ? alt(s) : ha(s, alt); if(h == null) return null; t = noonOf(s) + sign * h; }
    return t;
  };
  const s0 = at(12 - o.tz), noon = noonOf(s0);
  const asrAlt = s => ha(s, Math.atan(1 / ((o.asr || 1) + Math.tan(Math.abs(lat - s.dec)))) / R);
  const sunrise = solve(-0.8333, -1, noon - 6), sunset = solve(-0.8333, 1, noon + 6);
  const fajr = solve(-M.fajr, -1, noon - 7);
  const isha = M.ishaMin ? (sunset == null ? null : sunset + M.ishaMin / 60) : solve(-M.isha, 1, noon + 7);
  const pad = (M.pad || 0) / 60;
  const out = [fajr, sunrise, noon + 1 / 60, solve(asrAlt, 1, noon + 3), sunset, isha];
  return out.map((h, i) => h == null ? null : (h + (i === 1 ? -pad : pad)) * 60);
}

/* Whole minutes, on the careful side: a prayer's start rounds up (never early), sunrise rounds down (Subuh never
   runs late). The 0.3-minute nudge covers the gap between this sun model and the published almanacs; with it the
   JAKIM method matched the official Sabah and Labuan tables to within a minute on every date checked (23 Nov 2026). */
export function roundTimes(t){
  return t.map((v, i) => v == null ? null : (i === 1 ? Math.floor(v - 0.3 + 1e-6) : Math.ceil(v + 0.3 - 1e-6)));
}
