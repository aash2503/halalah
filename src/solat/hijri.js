/* Hijri date. Calculated (Umm al-Qura), with a -1 / 0 / +1 day adjustment in
   More so it can be matched to the date MUIS declares. Loading MUIS's own
   Islamic calendar is still to do: there is no open dataset for it yet. */
const M = ['Muharram','Safar','Rabiulawal','Rabiulakhir','Jamadilawal','Jamadilakhir','Rejab','Syaaban','Ramadan','Syawal','Zulkaedah','Zulhijjah'];
export function hijriAdjust(){ return +(localStorage.getItem('hl.hijri.adj') || 0) || 0; }
export function setHijriAdjust(n){ try{ localStorage.setItem('hl.hijri.adj', String(n)); }catch(e){} }
export function hijri(d){
  try{
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + hijriAdjust(), 12);
    const p = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day:'numeric', month:'numeric', year:'numeric' }).formatToParts(x);
    const g = t => +(p.find(q => q.type === t) || {}).value;
    const day = g('day'), mon = g('month'), yr = g('year');
    if(!day || !mon || !yr) return '';
    return day + ' ' + M[mon - 1] + ' ' + yr;
  }catch(e){ return ''; }
}
