/* A centred modal dialog — used for boot failures, registry changes and venue
   clears, i.e. things too important to flash past in a toast. */

/* A real centred dialog — used for boot failures and dataset changes, which
   are too important to flash past in a toast. */
function showDialog(title, bodyHtml, buttons){
  document.getElementById('dlgTitle').textContent = title;
  document.getElementById('dlgBody').innerHTML = bodyHtml;
  const foot = document.getElementById('dlgFoot');
  foot.innerHTML = '';
  (buttons || [{ label:'OK', cls:'btn-y', fn:hideDialog }]).forEach(b => {
    const el = document.createElement('div');
    el.className = `a btn ${b.cls || 'btn-w'}`;
    el.textContent = b.label;
    el.addEventListener('click', b.fn);
    foot.appendChild(el);
  });
  document.getElementById('dialogWrap').classList.add('open');
}
function hideDialog(){ document.getElementById('dialogWrap').classList.remove('open'); }

export { showDialog, hideDialog };
