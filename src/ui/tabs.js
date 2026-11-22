/* Bottom tab bar: Solat, Kiblat, Food, More (design option B). Food is the
   original Halalah map; the others are new views beside it. */
import { map } from '../map/map.js';
import { pi } from './icons.js';
import { status, refresh, lastError } from '../solat/data.js';
import { hijriAdjust, setHijriAdjust } from '../solat/hijri.js';
import { renderSolat } from '../solat/solat.js';
import { PRAYERS, LABEL } from '../solat/data.js';
import * as R from '../solat/remind.js';

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

function renderReminders(){
  const st = R.state(), s = R.settings();
  $('remState').textContent = !s.on ? 'Reminders are off.'
    : st === 'web' ? 'Reminders ring only in the Android app. Your choices are saved here and used there.'
    : st === 'old' ? 'This copy of the app is from before reminders. Install the newest halalah.apk once to turn them on.'
    : st === 'app-blocked' ? 'Notifications are blocked for Halalah on this phone. Tap "Open Android notification settings" and allow them.'
    : R.exactOk() ? 'Reminders are on for this phone. They work with the app closed and offline.'
    : 'Reminders are on, but this phone may deliver them a few minutes late.';
  $('remBody').style.display = s.on ? '' : 'none';
  document.querySelectorAll('[data-set]').forEach(g => {
    const v = s[g.dataset.set];
    g.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === (typeof v === 'boolean' ? (v ? '1' : '0') : String(v)))));
  });
  $('remBefore').value = String(s.before);
  $('remPrayers').innerHTML = PRAYERS.map(p => `<button class="chk" data-rp="${p}" role="switch" aria-checked="${R.bellOn(p)}">${LABEL[p]}</button>`).join('');
  $('remTest').style.display = st === 'app-on' ? '' : 'none';
  $('remSys').style.display = (st === 'web' || st === 'old') ? 'none' : '';
}

function initReminders(){
  document.querySelectorAll('[data-set]').forEach(g => g.addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    const k = g.dataset.set, v = k === 'style' ? b.dataset.v : b.dataset.v === '1';
    R.setSetting(k, v);
    if(k === 'on' && v) R.ask(() => renderReminders());
    renderReminders();
  }));
  $('remBefore').addEventListener('change', () => { R.setSetting('before', +$('remBefore').value); renderReminders(); });
  $('remPrayers').addEventListener('click', e => {
    const b = e.target.closest('[data-rp]'); if(!b) return;
    R.setBell(b.dataset.rp, !R.bellOn(b.dataset.rp)); renderReminders(); renderSolat();
  });
  $('remTest').addEventListener('click', () => { R.test(); });
  $('remSys').addEventListener('click', () => R.openSettings());
  if(R.settings().on && R.state() === 'app-blocked') R.ask(() => renderReminders());   // first open: Android asks once
}

function renderMore(){
  renderReminders();
  const s = status();
  $('moreData').textContent = s.count
    ? 'Official MUIS times loaded for ' + s.first + ' to ' + s.last + '. Last checked ' + new Date(s.fetchedAt).toLocaleDateString('en-SG', { day:'numeric', month:'short', year:'numeric' }) + '.'
    : 'Official MUIS times are not loaded yet, so times are estimates.' + (lastError ? ' Last try: ' + lastError + '.' : '');
  if(window.HalalahApp) $('moreApp').textContent = 'Android app, build ' + window.HalalahApp.build() + '. It updates itself when opened online.';
  document.querySelectorAll('[data-hadj]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.hadj === hijriAdjust())));
}

export function initTabs(){
  document.querySelectorAll('[data-pi]').forEach(e => { e.innerHTML = pi(e.dataset.pi, +e.dataset.s || 20); });
  $('tabbar').innerHTML = TABS.map(([n, label, ic]) => `<button class="tab" data-tab="${n}">${pi(ic, 22)}<span>${label}</span></button>`).join('');
  $('tabbar').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if(b) showTab(b.dataset.tab); });
  $('moreRefresh').addEventListener('click', async () => {
    $('moreData').textContent = 'Checking data.gov.sg…';
    const r = await refresh(true); renderMore(); renderSolat();
    if(!r.ok) $('moreData').textContent = 'Could not reach data.gov.sg (' + r.error + '). Try again when online.';
  });
  document.querySelectorAll('[data-hadj]').forEach(b => b.addEventListener('click', () => { setHijriAdjust(+b.dataset.hadj); renderMore(); renderSolat(); }));
  initReminders();
  const deep = /[?#].*(spot|venue|q)=/.test(location.href);            // shared food links open on Food
  showTab(deep ? 'food' : 'solat');
}
