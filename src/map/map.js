import L from 'leaflet';
import 'leaflet.markercluster';
import { S, groupCleared, hasVisited } from '../state.js';
import { ZONE_BOXES, HOTSPOT_MIN, VENUE_CHIP_ZOOM, SCHEME_EAT } from '../config.js';
import { escapeHtml } from '../util.js';
import { setStatus } from '../ui/toast.js';

/* ==========================================================================
   7. MAP
   ========================================================================== */
const map = L.map('map', { zoomControl:false, minZoom:11, maxZoom:18 }).setView([1.3521,103.8198], 12);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{
  attribution:'&copy; OpenStreetMap &copy; CARTO · Halal data &copy; MUIS',
  subdomains:'abcd', maxZoom:19 }).addTo(map);

Object.entries(ZONE_BOXES).forEach(([name,z]) => {
  L.rectangle(z.bounds,{ color:z.color, weight:2, dashArray:"7 7", fillColor:z.color,
                         fillOpacity:.05, interactive:false }).addTo(map);
  L.marker(L.latLngBounds(z.bounds).getCenter(),{ interactive:false,
    icon:L.divIcon({ className:'', html:`<div class="zone-label">${name} ZONE</div>`, iconSize:[110,14] })
  }).addTo(map);
});

const clusterGroup = L.markerClusterGroup({
  showCoverageOnHover:false, spiderfyOnMaxZoom:false,
  disableClusteringAtZoom:18, maxClusterRadius:55, chunkedLoading:true,
  iconCreateFunction(cluster){
    const n = cluster.getAllChildMarkers().reduce((s,m) => s + (m.options.count || 1), 0);
    const cls = n>=100 ? "l" : n>=25 ? "m" : "s";
    const px  = n>=100 ? 50 : n>=25 ? 44 : 38;
    return L.divIcon({ html:`<div class="cl-badge ${cls}" style="width:${px}px;height:${px}px;">${n>=1000?(n/1000).toFixed(1)+'k':n}</div>`,
                       className:'', iconSize:L.point(px,px) });
  }
});
map.addLayer(clusterGroup);


function spotPinHtml(s){
  const cls = ['pix-pin', s.scheme===SCHEME_EAT?'':'prep',
               hasVisited(s.id)?'done':'', S.NEW_IDS.has(s.id)?'isnew':''].filter(Boolean).join(' ');
  return `<div class="${cls}"><div class="body"></div><div class="pip"></div><div class="point"></div></div>`;
}
function groupIcon(g, zoom){
  const n = g.items.length;
  if(n === 1) return L.divIcon({ className:'', html:spotPinHtml(g.items[0]), iconSize:[26,30], iconAnchor:[13,28] });
  // Zoomed in, a named venue shows its name — far more use than a bare number.
  if(zoom >= VENUE_CHIP_ZOOM && g.venue){
    const done = groupCleared(g);
    const w = Math.min(210, 58 + g.venue.length * 5.4);
    return L.divIcon({ className:'',
      html:`<div class="venue-chip"><b>${n}</b><span class="${done?'vn-done':''}">${escapeHtml(g.venue.slice(0,22))}</span></div>`,
      iconSize:[w,26], iconAnchor:[w/2,13] });
  }
  const cls = ['place-badge', g.hasEat?'':'prep',
               groupCleared(g)?'cleared':(n>=HOTSPOT_MIN?'hotspot':'')].filter(Boolean).join(' ');
  return L.divIcon({ className:'', html:`<div class="${cls}">${n}</div>`, iconSize:[34,34], iconAnchor:[17,17] });
}

let shownGroups = [];
function renderGroups(groups){
  shownGroups = groups;
  clusterGroup.clearLayers();
  const z = map.getZoom();
  clusterGroup.addLayers(groups.map(g => {
    const m = L.marker([g.lat,g.lng], { icon:groupIcon(g,z), count:g.items.length });
    m.on('click', () => groupTapHandler && groupTapHandler(g));
    return m;
  }));
  const n = groups.reduce((s,g) => s + g.items.length, 0);
  setStatus(`${n} SPOT${n===1?'':'S'} · ${groups.length} PLACE${groups.length===1?'':'S'}`);
}
/* Re-icon on zoom so venue names appear/disappear at the threshold. */
let lastZoomBand = null;
map.on('zoomend', () => {
  const band = map.getZoom() >= VENUE_CHIP_ZOOM;
  if(band !== lastZoomBand){ lastZoomBand = band; if(shownGroups.length) renderGroups(shownGroups); }
});

/* sheet.js registers the tap handler here, so map never has to import sheet
   (which imports map) — that would be a cycle. */
let groupTapHandler = null;
function onGroupTap(fn){ groupTapHandler = fn; }

/* Fit a set of points without zooming so far that one cluster fills the
   screen. Leaflet throws on zero-area bounds, so widen a single point. */
function flyBounds(points){
  if(!points || !points.length) return;
  let b = L.latLngBounds(points);
  /* pad() SCALES the box, so a zero-area bounds — one point, or several rows
     sharing a coordinate, which this dataset is full of — stays zero and
     flyToBounds then resolves to NaN ("Invalid LatLng object"). Expand by an
     absolute delta instead. */
  if(b.getNorth() === b.getSouth() || b.getEast() === b.getWest()){
    const d = 0.0025;                                  // ~250 m
    b = L.latLngBounds([b.getSouth() - d, b.getWest() - d],
                       [b.getNorth() + d, b.getEast() + d]);
  } else {
    b = b.pad(.25);
  }
  map.flyToBounds(b, { duration:.9, maxZoom:16 });
}

export { L, map, clusterGroup, renderGroups, spotPinHtml, groupIcon, onGroupTap, flyBounds, shownGroups };
