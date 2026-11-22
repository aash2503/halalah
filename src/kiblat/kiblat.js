/* Kiblat compass. The bearing is exact maths; the phone's compass is the weak
   part, so the screen always says how far to trust it and never pretends. */
const $ = id => document.getElementById(id);
const KA = { lat:21.4225, lng:39.8262 }, R = Math.PI / 180;
let pos = { lat:1.3521, lng:103.8198 }, heading = null, acc = null, listening = false;

export function bearing(lat, lng){
  const dl = (KA.lng - lng) * R;
  const y = Math.sin(dl) * Math.cos(KA.lat * R);
  const x = Math.cos(lat * R) * Math.sin(KA.lat * R) - Math.sin(lat * R) * Math.cos(KA.lat * R) * Math.cos(dl);
  return (Math.atan2(y, x) / R + 360) % 360;
}
const compassWord = b => ['north','north-east','east','south-east','south','south-west','west','north-west'][Math.round(b / 45) % 8];

function draw(){
  const b = bearing(pos.lat, pos.lng);
  $('kibBearing').textContent = Math.round(b) + '°';
  $('kibWords').textContent = 'Kiblat is ' + Math.round(b) + '° from north (' + compassWord(b) + ').';
  if(heading == null){
    $('kibDial').style.transform = 'rotate(0deg)';
    $('kibNeedle').style.transform = 'rotate(' + b + 'deg)';
    $('kibState').textContent = 'Compass not started. The dial shows north at the top.';
    $('kibState').className = 'kib-state';
    return;
  }
  $('kibDial').style.transform = 'rotate(' + (-heading) + 'deg)';
  $('kibNeedle').style.transform = 'rotate(' + (b - heading) + 'deg)';
  const off = Math.abs(((b - heading + 540) % 360) - 180);
  const facing = off <= 5;
  $('kibState').className = 'kib-state' + (facing ? ' ok' : '');
  $('kibState').textContent = facing ? 'You are facing the kiblat.'
    : (acc != null && acc > 25) ? 'Compass is unsure. Move the phone in a figure of eight, away from metal.'
    : 'Turn until the arrow points straight up.';
}

function onOrient(e){
  let h = null;
  if(typeof e.webkitCompassHeading === 'number'){ h = e.webkitCompassHeading; acc = e.webkitCompassAccuracy; }
  else if(e.absolute && typeof e.alpha === 'number'){ h = (360 - e.alpha) % 360; }
  if(h == null) return;
  heading = h; draw();
}

async function start(){
  try{
    if(typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'){
      const r = await DeviceOrientationEvent.requestPermission();
      if(r !== 'granted'){ $('kibState').textContent = 'Motion access was not allowed. The bearing above still works with any compass.'; return; }
    }
    if(!listening){
      window.addEventListener('deviceorientationabsolute', onOrient, true);
      window.addEventListener('deviceorientation', onOrient, true);
      listening = true;
    }
    $('kibStart').style.display = 'none';
    setTimeout(() => { if(heading == null) $('kibState').textContent = 'This device has no compass. Use the bearing above with any compass.'; }, 2500);
  }catch(err){ $('kibState').textContent = 'Could not start the compass. Use the bearing above with any compass.'; }
  if(navigator.geolocation) navigator.geolocation.getCurrentPosition(p => { pos = { lat:p.coords.latitude, lng:p.coords.longitude }; draw(); }, () => {}, { maximumAge:6e5, timeout:8000 });
}

export function initKiblat(){ $('kibStart').addEventListener('click', start); draw(); }
