/* Prayer reminders. The choices live on the phone (hl.remind + the per-prayer bells). In the Android app the next
   30 days of reminders are handed to the shell (HalalahApp.schedule), which rings them with the app closed and the
   phone offline. In a browser nothing can ring; the choices are still saved. */
import { PRAYERS, LABEL, timesFor, fmt } from './data.js';
import { place, placeNow, instantAt } from './place.js';

const KEY = 'hl.remind', BELLS = 'hl.solat.bells', DAYS = 30;
const app = () => (typeof window !== 'undefined' && window.HalalahApp && window.HalalahApp.schedule) ? window.HalalahApp : null;

export function settings(){
  let s = {}; try{ s = JSON.parse(localStorage.getItem(KEY)) || {}; }catch(e){}
  return { on: s.on !== false, atTime: s.atTime !== false, before: [0,5,10,15,20,30].includes(s.before) ? s.before : 0,
           style: ['sound','vibrate','silent'].includes(s.style) ? s.style : 'sound' };
}
export function setSetting(k, v){
  const s = settings(); s[k] = v;
  try{ localStorage.setItem(KEY, JSON.stringify(s)); }catch(e){}
  sync();
}
export function bells(){ try{ return JSON.parse(localStorage.getItem(BELLS)) || {}; }catch(e){ return {}; } }
export function bellOn(p){ const b = bells(); return p in b ? !!b[p] : p !== 'syuruk'; }
export function setBell(p, on){
  const b = bells(); b[p] = !!on;
  try{ localStorage.setItem(BELLS, JSON.stringify(b)); }catch(e){}
  sync();
}

/* -> [{ t, id, title, text, ch }] in time order, from now on. Pure: tests call it with a fixed "now". */
export function buildSchedule(nowMs = Date.now()){
  const s = settings(), out = [], pl = place(), base = placeNow();
  if(!s.on || pl.needsFix) return out;
  for(let d = 0; d < DAYS; d++){
    const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + d);
    const { times, official, calc } = timesFor(day);
    PRAYERS.forEach((p, i) => {
      if(!bellOn(p) || times[i] == null) return;
      const at = instantAt(day, times[i]);
      const how = official ? '' : calc ? ' (calculated)' : ' (estimated time)';
      if(s.atTime && at > nowMs)
        out.push({ t: at, id: i, ch: s.style, title: LABEL[p] + ' · ' + fmt(times[i]),
                   text: (p === 'syuruk' ? 'Sunrise in ' + pl.name + '. Subuh has ended.' : 'It is time for ' + LABEL[p] + ' in ' + pl.name + '.') + how });
      const pre = at - s.before * 60000;
      if(s.before && pre > nowMs)
        out.push({ t: pre, id: i, ch: s.style, title: LABEL[p] + ' in ' + s.before + ' minutes',
                   text: (p === 'syuruk' ? 'Sunrise is at ' : LABEL[p] + ' is at ') + fmt(times[i]) + how + '.' });
    });
  }
  out.sort((a, b) => a.t - b.t);
  if(out.length) out.push({ t: out[out.length - 1].t + 60000, id: 9, ch: 'silent', title: 'Open Halalah to keep reminders going',
                            text: 'Reminders are loaded a month at a time. Open the app once to load the next month.' });
  return out;
}

export function sync(){
  const a = app(); if(!a) return false;
  try{ a.schedule(JSON.stringify(buildSchedule())); return true; }catch(e){ return false; }
}

/* 'app-on' | 'app-blocked' | 'old' (an installed APK from before reminders) | 'web' */
export function state(){
  const a = app(); if(!a) return (typeof window !== 'undefined' && window.HalalahApp) ? 'old' : 'web';
  try{ return a.notifyState() === 'granted' ? 'app-on' : 'app-blocked'; }catch(e){ return 'app-blocked'; }
}
export function exactOk(){ const a = app(); try{ return a ? !!a.exactOk() : true; }catch(e){ return true; } }
export function ask(done){
  const a = app(); if(!a){ done && done('web'); return; }
  window.__hlNotify = () => { sync(); done && done(state()); };
  try{ a.askNotify(); }catch(e){ done && done(state()); }
}
export function test(){ const a = app(); if(a) try{ a.test(settings().style); return true; }catch(e){} return false; }
export function openSettings(){ const a = app(); if(a) try{ a.openNotifySettings(); }catch(e){} }
