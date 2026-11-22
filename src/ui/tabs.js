/* Bottom tab bar: Solat, Kiblat, Food, More (design option B). Food is the
   original Halalah map; the others are new views beside it. */
import { map } from '../map/map.js';
import { pi } from './icons.js';
import { status, refresh } from '../solat/data.js';
import { hijriAdjust, setHijriAdjust } from '../solat/hijri.js';
import { renderSolat } from '../solat/solat.js';

const $ = id => document.getElementById(id);
const TABS = [['solat','Solat','moon'],['kiblat','Kiblat','compass'],['food','Food','fork'],['more','More','dots']];

export function showTab(name){
  TABS.forEach(([n]) => {
    const v = $(n === 'food' ? 'app' : 'view-' + n); if(v) v.classList.toggle('view-off', n !== name);
    const b = document.querySelector('[data-tab="' + n + '"]'); if(b){ b.classList.toggle('on', n === name); b.setAttribute('aria-current', n === name ? 'page' : 'false'); }
  });
  try{ localStorage.setItem('hl.tab', name); }catch(e){}
  if(name === 'food' && map) setTimeout(() => map.invalidateSize(), 60);
  if(name === 'more') renderMore();
}

function renderMore(){
  const s = status();
  $('moreData').textContent = s.count
    ? 'Official MUIS times loaded for ' + s.first + ' to ' + s.last + '. Last checked ' + new Date(s.fetchedAt).toLocaleDateString('en-SG', { day:'numeric', month:'short', year:'numeric' }) + '.'
    : 'Official MUIS times are not loaded yet. Times shown are estimates until this phone goes online.';
  if(window.HalalahApp) $('moreApp').textContent = 'Android app, build ' + window.HalalahApp.build() + '. It updates itself when opened online.';
  document.querySelectorAll('[data-hadj]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.hadj === hijriAdjust())));
}

export function initTabs(){
  $('tabbar').innerHTML = TABS.map(([n, label, ic]) => `<button class="tab" data-tab="${n}">${pi(ic, 22)}<span>${label}</span></button>`).join('');
  $('tabbar').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if(b) showTab(b.dataset.tab); });
  $('moreRefresh').addEventListener('click', async () => {
    $('moreData').textContent = 'Checking data.gov.sg…';
    const r = await refresh(true); renderMore(); renderSolat();
    if(!r.ok) $('moreData').textContent = 'Could not reach data.gov.sg (' + r.error + '). Try again when online.';
  });
  document.querySelectorAll('[data-hadj]').forEach(b => b.addEventListener('click', () => { setHijriAdjust(+b.dataset.hadj); renderMore(); renderSolat(); }));
  const deep = /[?#].*(spot|venue|q)=/.test(location.href);            // shared food links open on Food
  showTab(deep ? 'food' : 'solat');
}
