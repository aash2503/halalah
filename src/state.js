/* ==========================================================================
   SHARED STATE
   --------------------------------------------------------------------------
   Everything mutable that more than one module needs lives on `S`. Using a
   single object (rather than exported `let`s) keeps the mutation site obvious
   and sidesteps live-binding surprises across modules.

   Progress/save lives here too, because almost every UI module reads it.
   PERSISTENCE HOOK: localStorage stands in for an account.
   ========================================================================== */
import { SAVE_KEY, REGIONS, BADGE_REQ, RANKS, QUEST_POOL } from './config.js';
import { regionFor } from './util.js';
import { showToast } from './ui/toast.js';
import { showDialog, hideDialog } from './ui/dialog.js';
import { escapeHtml, titleCase } from './util.js';

export const S = {
  ALL: [],            // every active establishment
  BY_ID: {},
  GROUPS: [],         // establishments grouped by identical coordinate
  GROUP_BY_KEY: {},
  VENUE_INDEX: [],    // { name, groups[], count }
  BRAND_INDEX: {},    // brand key -> rows
  NEW_IDS: new Set(), // ids added since the previous launch
  SYNCED_AT: null,    // registry snapshot time (last_synced_at)
  playerPos: null,
  accuracy: null,     // metres, from position.coords.accuracy
  tracking: false,
};

export let save = {
  seen: [], visited: [], saved: [],
  explorerId: String(Math.floor(Math.random() * 89999 + 10000)),
  started: false, quest: null, geoPrimed: false,
};
try { const raw = localStorage.getItem(SAVE_KEY); if (raw) save = Object.assign(save, JSON.parse(raw)); } catch (e) {}
export function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

export const seenSet = new Set(save.seen);
export const visitedSet = new Set(save.visited);
export const savedSet = new Set(save.saved || []);

export const hasSeen = id => seenSet.has(id);
export const hasVisited = id => visitedSet.has(id);
/* "Saved" is a want-to-try shortlist — deliberately separate from "visited",
   which records where you have actually been. */
export const hasSaved = id => savedSet.has(id);

/* UI modules register here instead of state importing them, which would make
   a cycle (card -> state -> card). */
const progressListeners = [];
export function onProgressChange(fn) { progressListeners.push(fn); }
function fireProgress() { progressListeners.forEach(fn => fn()); }

export function markSeen(id) {
  if (seenSet.has(id)) return;
  seenSet.add(id); save.seen = [...seenSet]; persist(); fireProgress();
}
export function toggleVisited(id) {
  const now = !visitedSet.has(id);
  now ? visitedSet.add(id) : visitedSet.delete(id);
  save.visited = [...visitedSet]; persist();
  fireProgress(); checkBadges(); checkVenueClear(id); checkQuest();
  return now;
}
export function toggleSaved(id) {
  const now = !savedSet.has(id);
  now ? savedSet.add(id) : savedSet.delete(id);
  save.saved = [...savedSet]; persist(); fireProgress();
  return now;
}

export const regionProgress = k => S.ALL.filter(s => hasVisited(s.id) && regionFor(s.lat, s.lng) === k).length;
export const earnedBadges = () => REGIONS.filter(r => regionProgress(r.key) >= BADGE_REQ);

let knownBadgeCount = 0;
export function syncBadgeBaseline() { knownBadgeCount = earnedBadges().length; }
export function checkBadges() {
  const now = earnedBadges();
  if (now.length > knownBadgeCount) showToast(`${now[now.length - 1].label} BADGE EARNED!`);
  knownBadgeCount = now.length;
}

export function rankFor(n) { let r = RANKS[0][1]; for (const [t, l] of RANKS) if (n >= t) r = l; return r; }

/* A venue is "cleared" when every establishment in it has been visited. */
export const groupCleared = g => g.items.length > 0 && g.items.every(i => hasVisited(i.id));
export function checkVenueClear(id) {
  const s = S.BY_ID[id]; if (!s) return;
  const g = S.GROUP_BY_KEY[s.lat + ',' + s.lng];
  if (g && g.items.length > 1 && groupCleared(g)) {
    showDialog('VENUE CLEARED!', `<div style="text-align:center; line-height:2.2;">
      <div style="font-size:11px; color:var(--yellow)">${escapeHtml(titleCase(g.label))}</div>
      <div style="margin-top:12px;">ALL ${g.items.length} CERTIFIED SPOTS VISITED.</div></div>`,
      [{ label: 'NICE', cls: 'btn-y', fn: hideDialog }]);
  }
}

/* Daily quest — derived from the date so it does not reroll on refresh. */
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
export function currentQuest() {
  const k = todayKey();
  if (!save.quest || save.quest.day !== k) {
    let h = 0; for (const c of k) h = (h * 31 + c.charCodeAt(0)) | 0;
    save.quest = { day: k, idx: Math.abs(h) % QUEST_POOL.length, start: visitedSet.size, done: false };
    persist();
  }
  return save.quest;
}
export function checkQuest() {
  const q = currentQuest(), def = QUEST_POOL[q.idx];
  if (q.done) return;
  let ok = false;
  if (def.cat) ok = [...visitedSet].some(id => S.BY_ID[id] && String(S.BY_ID[id].sub_scheme) === def.cat);
  else ok = visitedSet.size - q.start >= (def.text.startsWith('LOG 3') ? 3 : 2);
  if (ok) { q.done = true; persist(); showToast('QUEST COMPLETE!'); }
}
