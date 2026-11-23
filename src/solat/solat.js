/* Solat screen: all six times for a day, the next prayer and a countdown, the
   Hijri date, and a way to step or jump to any date (design option B). */
import { PRAYERS, LABEL, timesFor, fmt, refresh, dkey, trust } from './data.js';
import { hijri } from './hijri.js';
import { pi } from '../ui/icons.js';
import { bellOn, setBell, sync as syncReminders } from './remind.js';
import { place, placeNow, adjustments } from './place.js';
import { METHODS } from './calc.js';
import { hijriAdjust } from './hijri.js';

const $ = id => document.getElementById(id);
/* All dates here carry the PLACE's calendar day and clock in their local fields (placeNow), so the screen is right
   for Singapore even when the phone is abroad, and for a far-away city chosen from the list. */
const today = () => { const n = placeNow(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
let view = today();                          // the date on screen
const nowMin = () => { const n = placeNow(); return n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60; };
const sameDay = (a, b) => dkey(a) === dkey(b);
function nextPrayer(){
  const mins = nowMin();
  const t = timesFor(today()).times;
  for(let i = 0; i < 6; i++){ if(i !== 1 && t[i] != null && t[i] > mins) return { i, at:t[i], wait:t[i] - mins, tomorrow:false }; }
  const tm = new Date(today().getTime() + 864e5 + 36e5); const t2 = timesFor(tm).times;
  const j = t2[0] != null ? 0 : 2;                       // no Subuh angle that far north: the next one is Zohor
  return { i:j, at:t2[j], wait:t2[j] + 1440 - mins, tomorrow:true };
}
function waitText(m){
  m = Math.max(0, Math.ceil(m)); const h = Math.floor(m / 60), r = m % 60;
  if(!h) return 'in ' + r + (r === 1 ? ' minute' : ' minutes');
  return 'in ' + h + ' h ' + r + ' min';
}

export function renderSolat(){
  const isToday = sameDay(view, today());
  const { times, raw, buffer } = timesFor(view), pl = place();
  $('solDate').textContent = view.toLocaleDateString('en-SG', { weekday:'short', day:'numeric', month:'long', year:'numeric' });
  $('solHijri').textContent = hijri(view);
  const nx = nextPrayer();
  $('solNextLbl').textContent = nx.tomorrow ? 'Next prayer, tomorrow' : 'Next prayer';
  $('solNextName').textContent = LABEL[PRAYERS[nx.i]].toUpperCase() + ' ' + fmt(nx.at);
  $('solNextWait').textContent = waitText(nx.wait);
  const nowM = Math.floor(nowMin());
  $('solRows').innerHTML = PRAYERS.map((p, i) => {
    const isNext = isToday && !nx.tomorrow && nx.i === i;
    const past = isToday && times[i] != null && times[i] <= nowM;
    const buf = buffer && times[i] != null ? `<span class="buf" title="Calculated ${fmt(raw[i])}, moved by your ${buffer}-minute buffer">${i === 1 ? '−' : '+'}${buffer}</span>` : '';
    return `<div class="sol-row panel${isNext ? ' nx' : ''}${past ? ' past' : ''}">
      <span class="nm">${LABEL[p]}</span>${isNext ? '<span class="tag">Next</span>' : ''}
      ${buf}<span class="t">${fmt(times[i])}</span>
      <button class="bell${bellOn(p) ? '' : ' off'}" data-bell="${p}" aria-pressed="${bellOn(p)}"
        aria-label="${LABEL[p]} reminder ${bellOn(p) ? 'on' : 'off'}">${pi('bell', 20)}</button></div>`;
  }).join('');
  $('solFoot').style.display = isToday ? 'none' : '';
  $('solArc').innerHTML = times.some(v => v == null) ? '' : arcSvg(times, isToday ? nowMin() : null);
  const tr = trust(view);
  $('solLoc').innerHTML = pi('pin', 16) + '<span>' + pl.name + '</span>';
  $('solState').className = 'st ' + tr;
  $('solState').innerHTML = tr === 'live' ? '<i class="dot"></i>Live · MUIS'
    : tr === 'saved' ? '<i class="dot"></i>Saved · MUIS'
    : tr === 'calc' ? '<i class="ring"></i>Calculated'
    : '<i class="bang">!</i>Estimated';
  $('solSrc').textContent = tr === 'calc'
    ? (pl.needsFix ? 'Waiting for your location. Showing Singapore, calculated.' : METHODS[pl.method].name + ' method' + (buffer ? ' · ' + buffer + ' min buffer' : '') + ' · tap for details')
    : '';
  $('solSrc').style.display = tr === 'calc' ? '' : 'none';
}

/* The banner picture: the sun's path over a pixel skyline. Time runs left to right from before Subuh to after Isyak;
   the curve is above the horizon between Syuruk and Maghrib. Marks sit at the prayer times, the dot is the sun now. */
const SKY = [1,1,1,7,7,1,1,2,3,4,4,3,2,1,1,1,1,1,2,2,2,3,3,4,5,6,7,8,8,9,9,10,10,11];
function arcSvg(t, nowMin){
  const W = 340, HZ = 62, A = 50, t0 = t[0] - 45, t1 = t[5] + 45;
  const X = m => 6 + (W - 12) * (m - t0) / (t1 - t0);
  const Y = m => { const s = Math.sin(Math.PI * (m - t[1]) / (t[4] - t[1])); return HZ - (s >= 0 ? A * s : 9 * Math.max(s, -1)); };
  const path = (a, b) => { let d = ''; for(let i = 0; i <= 40; i++){ const m = a + (b - a) * i / 40; d += (i ? 'L' : 'M') + X(m).toFixed(1) + ' ' + Y(m).toFixed(1); } return d; };
  const cols = SKY.concat(SKY.slice().reverse());
  let sky = '';
  cols.forEach((h, i) => { sky += `<rect x="${i * 5}" y="${HZ - h * 3}" width="5.2" height="${h * 3 + 14}"/>`; });
  sky += `<rect x="167" y="${HZ - 39}" width="6" height="6"/><rect x="15" y="${HZ - 27}" width="10" height="6"/><rect x="315" y="${HZ - 27}" width="10" height="6"/>`;
  const now = nowMin == null ? null : Math.min(Math.max(nowMin, t0), t1);
  const marks = [0, 2, 3, 4, 5].map(i => `<circle cx="${X(t[i]).toFixed(1)}" cy="${Y(t[i]).toFixed(1)}" r="3"/>`).join('');
  return `<svg viewBox="0 0 ${W} 76" preserveAspectRatio="xMidYMid meet">
    <path d="${path(t0, t1)}" fill="none" stroke="rgba(246,243,233,.4)" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round"/>
    ${now == null ? '' : `<path d="${path(t0, now)}" fill="none" stroke="#F6F3E9" stroke-width="3" stroke-linecap="round"/>`}
    <g fill="#141B0B" shape-rendering="crispEdges">${sky}</g>
    <g fill="rgba(246,243,233,.75)">${marks}</g>
    ${now == null ? '' : `<circle cx="${X(now).toFixed(1)}" cy="${Y(now).toFixed(1)}" r="14" fill="rgba(246,243,233,.18)"/><circle cx="${X(now).toFixed(1)}" cy="${Y(now).toFixed(1)}" r="8" fill="#F6F3E9"/>`}
  </svg>`;
}

/* What the banner's words mean, and everything that is adjusting the numbers. */
function showInfo(){
  const tr = trust(view), pl = place();
  const head = tr === 'live' ? 'Official MUIS times, checked with data.gov.sg in the last day.'
    : tr === 'saved' ? 'Official MUIS times saved on this phone. They have not been re-checked today.'
    : tr === 'est' ? 'Estimated. The official MUIS timetable for this date is not on this phone, so these times are calculated with MUIS\'s angles and may be a few minutes off.'
    : 'Calculated for ' + pl.name + '. These are not from an official timetable and can differ by a minute or two from the local mosque. Where it matters, check locally.';
  $('solInfoBody').innerHTML = '<p>' + head + '</p><ul>' + adjustments(hijriAdjust()).map(x => '<li>' + x + '</li>').join('') + '</ul>';
  $('solInfo').classList.add('open');
}

function shift(n){ view = new Date(view.getFullYear(), view.getMonth(), view.getDate() + n); renderSolat(); }

export function initSolat(){
  $('solPrev').addEventListener('click', () => shift(-1));
  $('solNext').addEventListener('click', () => shift(1));
  $('solToday').addEventListener('click', () => { view = today(); renderSolat(); });
  document.querySelector('.sol-next').addEventListener('click', showInfo);
  $('solInfoClose').addEventListener('click', () => $('solInfo').classList.remove('open'));
  document.addEventListener('place-changed', () => { view = today(); renderSolat(); syncReminders(); });
  const pick = $('solPick');
  $('solPickBtn').addEventListener('click', () => { pick.value = dkey(view); if(pick.showPicker) pick.showPicker(); else pick.focus(); });
  pick.addEventListener('change', () => { const [y, m, d] = pick.value.split('-').map(Number); if(y){ view = new Date(y, m - 1, d); renderSolat(); } });
  $('solRows').addEventListener('click', e => {
    const b = e.target.closest('[data-bell]'); if(!b) return;
    setBell(b.dataset.bell, !bellOn(b.dataset.bell));
    renderSolat();
  });
  $('solPrev').innerHTML = pi('left', 20); $('solNext').innerHTML = pi('right', 20);
  renderSolat();
  setInterval(renderSolat, 20000);
  syncReminders();
  refresh(false).then(r => { renderSolat(); syncReminders(); document.dispatchEvent(new CustomEvent('solat-data', { detail:r })); });
}
