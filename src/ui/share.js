import { titleCase, fmtDist, appUrl } from '../util.js';
import { subMeta } from '../data/model.js';
import { showToast } from './toast.js';

/* ==========================================================================
   12. SHARE SHORTLIST — PNG via canvas, or text via Web Share / clipboard
   The MUIS logo host has no CORS headers, so nothing remote is ever drawn to
   the canvas; the card is pure text + shapes and therefore never tainted.
   ========================================================================== */
function shortlistText(rows, title){
  const lines = rows.slice(0,10).map((s,i) => {
    const d = s._dist ?? s.distance_m;
    return `${i+1}. ${s.name} — ${subMeta(s).label}${d!=null?` (${fmtDist(d)})`:''}\n   ${titleCase(s.address)}`;
  });
  return `Halalah — ${title}\nMUIS-certified halal spots\n\n${lines.join('\n')}\n\n` +
         `${appUrl()}\nAlways verify the certificate on site.`;
}
async function shareShortlist(rows, title){
  rows = rows.slice(0,10);
  if(!rows.length){ showToast('Nothing to share'); return; }
  const text = shortlistText(rows, title);
  let file = null;
  try{ file = await shortlistPng(rows, title); }catch(e){ file = null; }

  if(file && navigator.canShare && navigator.canShare({ files:[file] })){
    try{ await navigator.share({ files:[file], title:'Halalah', text:`${title} — halal shortlist` }); return; }
    catch(e){ if(e && e.name === 'AbortError') return; }
  }
  if(navigator.share){
    try{ await navigator.share({ title:'Halalah', text }); return; }
    catch(e){ if(e && e.name === 'AbortError') return; }
  }
  // No Web Share (most desktops): download the PNG and copy the text.
  if(file){
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  try{ await navigator.clipboard.writeText(text); showToast('PNG saved · text copied'); }
  catch(e){ showToast('Shortlist PNG saved'); }
}
async function shortlistPng(rows, title){
  try{ await document.fonts.ready; }catch(e){}
  const W = 720, H = 200 + rows.length * 92;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const px = (n) => `${n}px 'Press Start 2P', monospace`;

  x.fillStyle = '#111827'; x.fillRect(0,0,W,H);
  x.fillStyle = '#4A5C2A'; x.fillRect(0,0,W,120);
  x.fillStyle = '#0A0F18'; x.fillRect(0,116,W,6);
  x.fillStyle = '#F6F3E9'; x.font = px(28); x.fillText('HALAL', 34, 58);
  x.fillStyle = '#F6F3E9'; x.fillText('AH', 34 + x.measureText('HALAL').width, 58);
  x.fillStyle = '#F6F3E9'; x.font = px(11);
  x.fillText(String(title).toUpperCase().slice(0,40), 34, 92);

  rows.forEach((s,i) => {
    const y = 156 + i*92;
    x.fillStyle = '#1F2937'; x.fillRect(24, y, W-48, 76);
    x.strokeStyle = '#0A0F18'; x.lineWidth = 4; x.strokeRect(24, y, W-48, 76);
    const m = subMeta(s);
    x.fillStyle = m.color; x.fillRect(24, y, 8, 76);
    x.fillStyle = '#F6F3E9'; x.font = px(12);
    x.fillText(`${i+1}.`, 46, y+30);
    x.fillStyle = '#F6F3E9'; x.font = px(12);
    x.fillText((s.name||'').toUpperCase().slice(0,30), 82, y+30);
    x.fillStyle = '#B9BEA9'; x.font = px(8);
    const d = s._dist ?? s.distance_m;
    x.fillText(`${m.label}${d!=null?'  ·  '+fmtDist(d):''}`, 82, y+52);
    x.fillStyle = '#6B7280'; x.font = px(7);
    x.fillText(titleCase(s.address).slice(0,52), 82, y+68);
  });
  x.fillStyle = '#4B5563'; x.font = px(7);
  x.fillText('MUIS-certified · verify on site', 34, H-22);

  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  return new File([blob], 'halalah-shortlist.png', { type:'image/png' });
}

export { shareShortlist, shortlistPng, shortlistText };
