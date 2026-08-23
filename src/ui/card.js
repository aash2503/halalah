import { S, save, seenSet, visitedSet, savedSet, groupCleared, hasVisited,
         regionProgress, earnedBadges, rankFor, currentQuest } from '../state.js';
import { REGIONS, BADGE_REQ, QUEST_POOL } from '../config.js';
import { escapeHtml, titleCase, regionFor } from '../util.js';
import { showToast } from './toast.js';
import { buildLog, logModal } from './log.js';

/* ==========================================================================
   14. EXPLORER CARD
   ========================================================================== */
const cardModal = document.getElementById('cardModal');
function buildCard(){
  const pct = S.ALL.length ? Math.round(seenSet.size/S.ALL.length*100) : 0;
  const cleared = S.GROUPS.filter(g => g.items.length > 1 && groupCleared(g));
  document.getElementById('xcId').textContent = 'IDNo. ' + save.explorerId;
  document.getElementById('xcRank').textContent = rankFor(visitedSet.size);
  document.getElementById('xcSeen').textContent = seenSet.size;
  document.getElementById('xcVisited').textContent = visitedSet.size;
  document.getElementById('xcSaved').textContent = savedSet.size;
  document.getElementById('xcVenues').textContent = cleared.length;

  const q = currentQuest(), def = QUEST_POOL[q.idx];
  document.getElementById('questText').textContent = def.text;
  document.getElementById('questProg').textContent = q.done ? '✔ COMPLETE — COME BACK TOMORROW' : 'IN PROGRESS';
  document.getElementById('questBox').classList.toggle('done', q.done);

  document.getElementById('badgeCase').innerHTML = REGIONS.map(r => {
    const p = regionProgress(r.key), got = p >= BADGE_REQ;
    return `<div class="zone-badge ${got?'earned':''}"><div class="ico">${r.icon}</div>
      <div class="nm">${got?r.label:p+'/'+BADGE_REQ}</div></div>`;
  }).join('');

  document.getElementById('districtList').innerHTML = REGIONS.map(r => {
    const tot = S.ALL.filter(s => regionFor(s.lat,s.lng) === r.key).length;
    const got = regionProgress(r.key);
    const pc = tot ? Math.round(got/tot*100) : 0;
    return `<div class="dist-row"><div class="dn">${r.label}</div>
      <div class="dt"><div class="df2" style="width:${pc}%"></div></div>
      <div class="dv">${got}/${tot}</div></div>`;
  }).join('');

  const top = S.GROUPS.filter(g => g.items.length > 1)
    .map(g => ({ g, done:g.items.filter(i => hasVisited(i.id)).length }))
    .filter(o => o.done > 0)
    .sort((a,b) => (b.done/b.g.items.length) - (a.done/a.g.items.length)).slice(0,8);
  document.getElementById('venueClears').innerHTML = top.length ? top.map(o =>
    `<div class="venue-clear ${o.done===o.g.items.length?'full':''}">
      <span>${escapeHtml((o.g.venue||titleCase(o.g.label)).slice(0,22))}</span>
      <span class="vc">${o.done}/${o.g.items.length}${o.done===o.g.items.length?' ✔':''}</span></div>`).join('')
    : `<div class="empty">VISIT SPOTS IN A MALL<br>TO START CLEARING VENUES</div>`;
}
document.getElementById('openCard').addEventListener('click', () => { buildCard(); cardModal.classList.add('open'); });
document.getElementById('cardClose').addEventListener('click', () => cardModal.classList.remove('open'));
document.getElementById('shareCard').addEventListener('click', async () => {
  const cleared = S.GROUPS.filter(g => g.items.length>1 && groupCleared(g)).length;
  const text = `HALALAH — Explorer Card\nRank: ${rankFor(visitedSet.size)}\n` +
               `Seen ${seenSet.size}/${S.ALL.length} · Visited ${visitedSet.size} · Venues cleared ${cleared}`;
  if(navigator.share){ try{ await navigator.share({ title:'HALALAH', text }); return; }catch(e){ if(e.name==='AbortError') return; } }
  try{ await navigator.clipboard.writeText(text); showToast('CARD COPIED'); }catch(e){ showToast('COULD NOT SHARE'); }
});

function refreshProgressUI(){
  if(logModal.classList.contains('open')) buildLog(false);
  if(cardModal.classList.contains('open')) buildCard();
  document.getElementById('lsSeen').textContent = seenSet.size;
}

export { buildCard, cardModal, refreshProgressUI };
