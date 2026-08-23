import { SUPABASE_URL, SB_HEADERS, PAGE_SIZE, SELECT_COLS } from '../config.js';

/* ==========================================================================
   1. DATA SOURCE — Supabase, queried straight from the browser.
   The anon key is a PUBLISHABLE key meant to ship in client code; RLS allows
   reads and rejects writes (anon INSERT -> Postgres 42501). Never put a
   service_role / sb_secret_ key here.
   Source: MUIS, Singapore's official halal certification authority.
   ========================================================================== */


/* Returns { rows, partial }. If a later page fails we keep the pages we already
   have rather than discarding everything — a half-loaded map still beats an
   error screen, as long as we say so. */
async function fetchAllEstablishments(onProgress){
  const rows = [];
  let partial = false;
  for(let from = 0; ; from += PAGE_SIZE){
    let page;
    try{
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/establishments?select=${SELECT_COLS}` +
        `&is_active=eq.true&lat=not.is.null&order=id.asc`,
        { headers: { ...SB_HEADERS, Range: `${from}-${from + PAGE_SIZE - 1}` } });
      if(!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      page = await res.json();
    }catch(err){
      if(rows.length){ partial = true; break; }   // keep what we got
      throw err;                                   // nothing at all — real failure
    }
    rows.push(...page);
    if(onProgress) onProgress(rows.length);
    if(page.length < PAGE_SIZE) break;
    if(from > 20000) break;                        // runaway stop
  }
  return { rows, partial };
}

/* Documented primary call: proximity + filter + sort server-side, one round
   trip, true geodesic metres. Used for the wheel's NEAR ME scope. */
async function fetchNearby(lat, lng, opts = {}){
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/establishments_nearby`, {
    method:"POST", headers:{ ...SB_HEADERS, "Content-Type":"application/json" },
    body: JSON.stringify({
      in_lat:lat, in_lng:lng,
      in_radius_m: opts.radius ?? 1000, in_limit: opts.limit ?? 50,
      in_schemes: opts.schemes ?? null, in_query: opts.query ?? null }),
  });
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}

export { fetchAllEstablishments, fetchNearby };
