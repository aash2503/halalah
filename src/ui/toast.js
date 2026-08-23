/* Transient feedback + the status pill. No imports: everything may use it. */

let toastTimer = null;
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
function setStatus(msg, kind){
  document.getElementById('statusText').textContent = msg;
  const s = document.getElementById('statusStrip');
  s.classList.toggle('busy', kind === 'busy');
  s.classList.toggle('err',  kind === 'err');
}

export { showToast, setStatus };
