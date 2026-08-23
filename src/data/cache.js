import { DB_NAME, STORE } from '../config.js';

/* ==========================================================================
   2. LOCAL CACHE (IndexedDB)
   --------------------------------------------------------------------------
   Startup reads the cache and renders immediately, then revalidates over the
   network in the background. This makes a second launch instant, keeps the app
   usable offline, and means a failed fetch is never a blank screen.
   ========================================================================== */
function openDb(){
  return new Promise((res,rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { if(!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}
async function cacheGet(k){
  try{
    const db = await openDb();
    return await new Promise((res,rej) => {
      const q = db.transaction(STORE,'readonly').objectStore(STORE).get(k);
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
  }catch(e){ return null; }          // private mode / blocked storage — just skip
}
async function cacheSet(k,v){
  try{
    const db = await openDb();
    await new Promise((res,rej) => {
      const q = db.transaction(STORE,'readwrite').objectStore(STORE).put(v,k);
      q.onsuccess = () => res(); q.onerror = () => rej(q.error);
    });
  }catch(e){}
}

export { openDb, cacheGet, cacheSet };
