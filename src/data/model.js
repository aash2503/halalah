import { S } from '../state.js';
import { SUB_SCHEME, GENERIC_NAMES, SCHEME_EAT, SCHEME_PREP } from '../config.js';
import { regionFor } from '../util.js';

/* ==========================================================================
   3. WHAT THIS DATASET HAS — AND DOESN'T
   Present: name, cert number, scheme/sub-scheme, address, postal, lat/lng,
            est_type (1 = delivery-only), logo (36 of 1939), last_synced_at.
   ABSENT:  hours, phone, cuisine, price, ratings, reviews.
   Nothing in this UI may imply any of those.
   ========================================================================== */
const subMeta = s => SUB_SCHEME[s.sub_scheme] || { label:(s.sub_scheme_text||"Other"), color:"#475569" };






/* Venue name = the text between the unit number and the postal code, cut at
   the first comma. Measured: resolves 82% of stacked buildings cleanly
   (CAUSEWAY POINT, WATERWAY POINT, HILLION MALL...). Falls back to street. */
function venueName(address){
  if(!address) return null;
  let s = address.trim().replace(/\s*\d{6}\s*$/, '');
  /* Unit numbers can be ranges — "#03-48 TO 51 JURONG POINT" — and without
     the TO clause the venue came out as "TO 51 JURONG POINT". */
  const m = s.match(/#\S+(?:\s+TO\s+\S+)?\s+(.*)$/i);
  if(!m) return null;
  let v = m[1].split(',')[0].trim();
  v = v.replace(/\s+(BLK|BLOCK|STALL|LEVEL|LVL|UNIT)\b.*$/i, '').replace(/\s+/g,' ').trim();
  return v.length >= 4 ? v.toUpperCase() : null;
}

/* Canonical identity for a venue.
   ------------------------------------------------------------------------
   MUIS writes the same building several ways, which split one mall into
   several "venues": JURONG POINT / JURONG POINT SHOPPING CENTRE, WATERWAY
   POINT (EAST WING) / (WEST WING), FUNAN / FUNAN MALL. Measured on the live
   data this collapses 653 raw strings to 617 real places.

   Deliberately does NOT strip a trailing number: doing so merged CHANGI
   AIRPORT TERMINAL 1/2/3/4 into one, and JUNCTION 8 with JUNCTION 10, which
   are genuinely different places. Losing the "JURONG POINT 1" variant (one
   row) is the cheaper mistake. */
const VENUE_QUALIFIER = /\b(WING|LEVEL|LVL|LOUNGE|HALL|DEPARTURE|ARRIVAL|TRANSIT|BLK|BLOCK|STALL|UNIT|ANNEX|TOWER|MR\d|S\d+|(NS|EW|NE|CC|DT|TE|JS|CR|BP|PE|PW|SE|SW)\d+)\b/;
function venueKey(v){
  if(!v) return null;
  let k = v.toUpperCase()
    /* A parenthetical is either a QUALIFIER of one place — "(EAST WING)",
       "(NS9)", "(MR3)" — which should merge, or a DIFFERENT place —
       "SAFRA CLUBHOUSE (TAMPINES)" vs "(PUNGGOL)" — which must not. Dropping
       every parenthetical merged four separate SAFRA clubhouses into one. */
    .replace(/\(([^)]*)\)/g, (_, inner) => VENUE_QUALIFIER.test(inner) ? '' : ' ' + inner + ' ')
    .replace(/\b(SHOPPING\s+)?(CENTRE|CENTER|MALL|COMPLEX|BUILDING)\b/g, '')
    .replace(/\b(THE|AT|@)\b/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return k || null;
}

/* --- Chains -------------------------------------------------------------
   Measured: 79 names appear at 3+ locations, covering 429 rows. But a naive
   grouping invents chains that don't exist — "CHICKEN RICE" (x15), "MALAY
   KITCHEN", "YONG TAU FOO" and "STAFF CANTEEN STALL" are generic stall
   descriptions, not brands. So: strip outlet suffixes, require 2+ words and
   3+ locations, and reject anything that is purely a food/venue noun phrase.
   Even then it is labelled "same name", never asserted as a franchise. */
function brandKey(name){
  let n = (name || '').trim();
  n = n.split(/\s*[@(#]|\s+-\s+/)[0];                       // drop "@ Mall", "(S4)"
  n = n.replace(/\s*\b(pte ltd|llp)\b.*$/i, '');
  n = n.replace(/\s+/g, ' ').trim().toUpperCase();
  if(n.length < 5) return null;
  if(n.split(' ').length < 2) return null;                  // single words are too loose
  if(GENERIC_NAMES.has(n)) return null;
  return n;
}
function buildBrandIndex(rows){
  const m = new Map();
  for(const r of rows){
    const k = brandKey(r.name);
    if(!k) continue;
    if(!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  const out = {};
  for(const [k,v] of m) if(v.length >= 3) out[k] = v;       // 3+ locations only
  return out;
}

/* ==========================================================================
   4. COORDINATE GROUPING
   Geocoding is postal-code level, so a whole mall lands on one lat/lng (worst
   case measured: 26 establishments). One marker per coordinate, never per row.
   ========================================================================== */
function buildGroups(rows){
  const m = new Map();
  for(const r of rows){
    const key = r.lat + ',' + r.lng;
    let g = m.get(key);
    if(!g){ g = { key, lat:r.lat, lng:r.lng, items:[], region:regionFor(r.lat,r.lng) }; m.set(key,g); }
    g.items.push(r);
  }
  for(const g of m.values()){
    g.venue   = venueName(g.items[0].address);
    g.label   = g.venue || (g.items[0].address || '').replace(/#\S+\s*/, '').replace(/\s*\d{6}\s*$/,'');
    g.hasEat  = g.items.some(i => i.scheme === SCHEME_EAT);
    g.hasPrep = g.items.some(i => i.scheme === SCHEME_PREP);
  }
  return [...m.values()];
}
/* One entry per REAL venue, keyed canonically, so a mall spread over several
   postal codes and spelt three ways is a single searchable place. Jurong Point
   spans two postal codes (648886 / 648331) = two coordinate groups. */
function buildVenueIndex(groups){
  const m = new Map();
  for(const g of groups){
    const k = venueKey(g.venue);
    if(!k) continue;
    let v = m.get(k);
    if(!v){ v = { key:k, name:g.venue, names:new Set(), groups:[], count:0 }; m.set(k, v); }
    v.names.add(g.venue);
    v.groups.push(g); v.count += g.items.length;
    // display the longest spelling — "JURONG POINT SHOPPING CENTRE" reads better
    if(g.venue && g.venue.length > v.name.length) v.name = g.venue;
  }
  return [...m.values()].sort((a,b) => b.count - a.count);
}

export { subMeta, venueName, venueKey, brandKey, buildBrandIndex, buildGroups, buildVenueIndex };
