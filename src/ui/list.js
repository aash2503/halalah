/* Food: the list (default view). Nearest first when the phone knows where it is, otherwise by name. The same search
   and filter pills drive the list, the map and "Pick for me", so the three can never disagree. */
import { S, hasSaved } from '../state.js';
import { currentSelection, onFiltersApplied } from '../filters.js';
import { subMeta } from '../data/model.js';
import { fmtDist, escapeHtml, titleCase } from '../util.js';
import { map } from '../map/map.js';
import { openSpot } from './sheet.js';
import { onFabTap, beginLiveScan } from '../geo.js';
import { showToast } from './toast.js';

const $ = id => document.getElementById(id);
const PAGE = 40;
let shown = PAGE, rows = [], view = 'list', lastPosKey = '', rolling = false;

function sorted(){
  const sel = currentSelection();
  if(S.playerPos) sel.sort((a, b) => (a._dist ?? 1e12) - (b._dist ?? 1e12));
  else sel.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return sel;
}

export function renderList(){
  if(rolling) return;
  const hud = document.querySelector('.hud-top');
  if(hud && hud.offsetHeight) document.getElementById('app').style.setProperty('--hud', hud.offsetHeight + 'px');
  rows = sorted();
  const note = $('loadNote'), start = $('startBtn');
  if(!S.ALL.length){
    const failed = start && start.textContent === 'Retry';
    $('flCount').textContent = failed ? (note.textContent || 'Could not load the halal registry.') : 'Loading the halal registry…';
    $('flLocate').style.display = failed ? '' : 'none'; $('flLocate').textContent = failed ? 'Try again' : 'Use my location';
    $('flRows').innerHTML = ''; $('flMore').style.display = 'none'; $('pickBtn').disabled = true;
    return;
  }
  $('flLocate').textContent = 'Use my location';
  $('flLocate').style.display = S.playerPos ? 'none' : '';
  $('flCount').textContent = rows.length
    ? rows.length + (rows.length === 1 ? ' place' : ' places') + (S.playerPos ? ', nearest first' : ', A to Z. Turn on location to sort by distance.')
    : 'Nothing matches. Clear a filter or widen the distance.';
  $('flRows').innerHTML = rows.slice(0, shown).map((s, i) => {
    const m = subMeta(s);
    return `<button class="fl-row" data-i="${i}">
      <i class="fl-dot" style="background:${m.color}"></i>
      <span class="fl-main"><span class="fl-name">${escapeHtml(titleCase(s.name || ''))}</span>
        <span class="fl-sub">${escapeHtml(m.label)}${s._dist != null ? ' · ' + fmtDist(s._dist) : ''}${hasSaved(s.id) ? ' · ★ Saved' : ''}</span>
        <span class="fl-addr">${escapeHtml(titleCase(s.address || ''))}</span></span>
    </button>`;
  }).join('');
  $('flMore').style.display = rows.length > shown ? '' : 'none';
  $('flMore').textContent = 'Show ' + Math.min(PAGE, rows.length - shown) + ' more';
  $('pickBtn').disabled = rows.length < 2;
}

function setView(v){
  view = v;
  $('foodList').classList.toggle('off', v !== 'list');
  document.getElementById('app').classList.toggle('mapview', v === 'map');
  document.querySelectorAll('#viewSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  if(v === 'map') setTimeout(() => map.invalidateSize(), 60);
}

/* "Pick for me": the highlight runs down the places on screen, slows, and stops on one. */
function pick(){
  if(rolling || rows.length < 2) return;
  if(view !== 'list') setView('list');
  const els = [...document.querySelectorAll('#flRows .fl-row')];
  const n = Math.min(els.length, 20); if(n < 2) return;
  const target = Math.floor(Math.random() * n);
  els.forEach(e => e.classList.remove('roll', 'picked'));
  const land = () => {
    rolling = false; els.forEach(e => e.classList.remove('roll'));
    els[target].classList.add('picked'); els[target].scrollIntoView({ block:'center', behavior:'smooth' });
    $('pickBtn').textContent = 'Pick again';
    showToast('Picked: ' + titleCase(rows[target].name || ''));
  };
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){ rolling = true; land(); return; }
  rolling = true;
  const steps = n * 2 + target + 1;            // two full passes, then on to the winner
  let k = 0;
  const tick = () => {
    const i = k % n;
    els.forEach(e => e.classList.remove('roll')); els[i].classList.add('roll');
    els[i].scrollIntoView({ block:'center' });
    k++;
    if(k >= steps){ setTimeout(land, 250); return; }
    const left = steps - k;
    setTimeout(tick, left > 12 ? 55 : left > 6 ? 110 : left > 3 ? 190 : 300);
  };
  tick();
}

let started = false;
export function foodShown(){                     // called each time the Food tab is opened
  if(!started){ started = true; beginLiveScan(); }
  renderList();
}

export function initList(){
  onFiltersApplied(() => { shown = PAGE; $('pickBtn').textContent = 'Pick for me'; renderList(); });
  $('flRows').addEventListener('click', e => {
    const r = e.target.closest('.fl-row'); if(!r || rolling) return;
    const s = rows[+r.dataset.i]; if(s) openSpot(s, null);
  });
  $('flMore').addEventListener('click', () => { shown += PAGE; renderList(); });
  $('flLocate').addEventListener('click', () => {
    if(!S.ALL.length){ location.reload(); return; }
    onFabTap();
  });
  $('viewSeg').addEventListener('click', e => { const b = e.target.closest('button'); if(b) setView(b.dataset.view); });
  $('pickBtn').addEventListener('click', pick);
  /* distances arrive with the first position fix and change as you move: repaint when they do */
  setInterval(() => {
    const p = S.playerPos, key = p ? p.lat.toFixed(4) + ',' + p.lng.toFixed(4) : (S.ALL.length ? 'n' : '');
    if(key !== lastPosKey){ lastPosKey = key; renderList(); }
  }, 1500);
  setView('list'); renderList();
}
