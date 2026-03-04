const canvas = document.getElementById('usageCanvas');
const ctx = canvas.getContext('2d');
const ribbon = document.getElementById('ribbon');
const ribbonText = document.getElementById('ribbonText');
const banner = document.getElementById('banner');
const adviceEl = document.getElementById('advice');
const chipPower = document.getElementById('currentPower');
const chipCo2 = document.getElementById('co2');
const chipEes = document.getElementById('ees');

const devices = [
  {key:'fridge', label:'Fridge'},
  {key:'ac', label:'AC'},
  {key:'fan', label:'Fan'},
  {key:'tv', label:'TV'},
  {key:'idle', label:'Idle Load'}
];

let geo = {lat:12.97, lon:77.59, ok:false};
let currentDevice = 'fridge';
let state = {series:[], limit:3.2, spike:false, anomaly:false};

init();

function init(){
  bindDeviceRadios();
  getLocation().then(() => {
    updateForDevice(currentDevice);
    setInterval(tickLive, 60000);
  });
}

function bindDeviceRadios(){
  document.getElementById('dev-fridge').addEventListener('change',()=>select('fridge'));
  document.getElementById('dev-ac').addEventListener('change',()=>select('ac'));
  document.getElementById('dev-fan').addEventListener('change',()=>select('fan'));
  document.getElementById('dev-tv').addEventListener('change',()=>select('tv'));
  document.getElementById('dev-idle').addEventListener('change',()=>select('idle'));
}

function select(key){
  currentDevice = key;
  updateForDevice(key);
}

function getLocation(){
  return new Promise(resolve=>{
    if(navigator.geolocation){
      navigator.geolocation.getCurrentPosition(p=>{
        geo = {lat:p.coords.latitude, lon:p.coords.longitude, ok:true};
        resolve();
      }, ()=>resolve());
    } else resolve();
  });
}

function prng(seed){
  let n = seed % 2147483647;
  if (n <= 0) n += 2147483646;
  return function(){
    n = n * 16807 % 2147483647;
    return (n - 1) / 2147483646;
  }
}

function smooth(values, passes){
  let arr = values.slice();
  for(let p=0;p<passes;p++){
    const out = arr.slice();
    for(let i=1;i<arr.length-1;i++){
      out[i]=(arr[i-1]+arr[i]+arr[i+1])/3;
    }
    arr = out;
  }
  return arr;
}

function generateSeries(device, lat, lon){
  const now = new Date();
  const seed = Math.floor((lat+90)*1000) ^ Math.floor((lon+180)*1000) ^ (now.getFullYear()*100+now.getMonth()) ^ now.getDate();
  const rnd = prng(seed + device.charCodeAt(0));
  const base = new Array(24).fill(0).map((_,h)=>{
    let t = Math.sin((h/24)*Math.PI*2 - Math.PI/2)*0.6+0.4;
    let n = rnd()*0.6-0.3;
    return Math.max(0, t + n);
  });
  let devAmp=1, devBias=0.2, limit=3.0;
  if(device==='fridge'){devAmp=0.9; devBias=0.6; limit=2.8}
  if(device==='ac'){devAmp=1.4; devBias=0.5; limit=3.0}
  if(device==='fan'){devAmp=0.8; devBias=0.4; limit=2.6}
  if(device==='tv'){devAmp=1.1; devBias=0.3; limit=2.7}
  if(device==='idle'){devAmp=0.5; devBias=0.2; limit=2.2}
  const climate = Math.min(1.3, 0.8 + Math.abs(lat)/90*0.6);
  const regionLimit = limit * (lat>0 ? 1.0 : 0.95);
  const series = smooth(base.map(v=> (v*devAmp+devBias)*climate*2.2 ),2).map(v=>Math.min(5,Math.max(0,v)));
  return {series, limit: regionLimit};
}

function analyze(series, limit){
  let over=false, spike=false, p=series[0];
  for(let i=1;i<series.length;i++){
    const v=series[i];
    if(v>limit) over=true;
    if(v>limit && v-p>1.0) spike=true;
    p=v;
  }
  return {anomaly:over && !spike, spike:spike};
}

function draw(series, limit, mode){
  const w = canvas.width, h = canvas.height;
  const pad = {l:30, r:10, t:10, b:20};
  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle='rgba(255,255,255,0.08)';
  ctx.lineWidth=1;
  for(let i=0;i<3;i++){
    const y = pad.t + (i+1)*(h-pad.t-pad.b)/4;
    ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(w-pad.r,y); ctx.stroke();
  }
  ctx.setLineDash([6,6]); ctx.strokeStyle='#ffb5b5'; ctx.lineWidth=2;
  const yLimit = mapY(limit);
  ctx.beginPath(); ctx.moveTo(pad.l,yLimit); ctx.lineTo(w-pad.r,yLimit); ctx.stroke();
  ctx.setLineDash([]);

  const points = series.map((v,i)=>[mapX(i), mapY(v)]);
  const grd = ctx.createLinearGradient(pad.l,0,w-pad.r,0);
  grd.addColorStop(0, mode==='spike' ? '#ff7b5a' : '#31d158');
  grd.addColorStop(1, mode==='spike' ? '#ffb38f' : '#ffd24d');
  ctx.lineWidth=3.5; ctx.strokeStyle=grd;
  ctx.beginPath();
  points.forEach(([x,y],i)=>{ if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
  ctx.stroke();

  const fill = ctx.createLinearGradient(0,pad.t,0,h-pad.b);
  fill.addColorStop(0, mode==='spike' ? 'rgba(255,123,90,.35)' : 'rgba(49,209,88,.35)');
  fill.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  points.forEach(([x,y])=>ctx.lineTo(x,y));
  ctx.lineTo(points[points.length-1][0], h-pad.b);
  ctx.lineTo(points[0][0], h-pad.b);
  ctx.closePath(); ctx.fill();

  function mapX(i){return pad.l + i*(w-pad.l-pad.r)/23}
  function mapY(v){return pad.t + (5-v)*(h-pad.t-pad.b)/5}
}

function updateForDevice(device){
  const {series, limit} = generateSeries(device, geo.lat, geo.lon);
  const res = analyze(series, limit);
  state = {series, limit, spike:res.spike, anomaly:res.anomaly};
  draw(series, limit, res.spike ? 'spike' : 'normal');
  updateUI(device, res);
}

function updateUI(device, res){
  const over = res.spike || res.anomaly;
  ribbon.className = 'ribbon '+(res.spike?'danger':'warn')+(over?'':' hide');
  ribbonText.textContent = res.spike ? 'Spike Detected!' : (over ? 'Anomaly Alert' : '');
  banner.className = 'badge '+(over?'':'hide');
  banner.textContent = over ? 'Anomaly Detected' : '';
  const hour = new Date().getHours();
  const v = Math.round(state.series[hour]*180);
  chipPower.textContent = v+' W';
  chipCo2.textContent = (v*0.0039).toFixed(1)+' kg CO2';
  chipEes.textContent = Math.max(0, Math.min(100, 100 - Math.round((v-300)/5))).toString();
  const place = geo.ok ? `(${geo.lat.toFixed(2)}, ${geo.lon.toFixed(2)})` : '(emulated location)';
  let advice = 'Usage within limits.';
  if(res.spike){
    advice = device==='ac' ? `Spike near ${place}. Reduce thermostat or switch AC off.` :
             device==='tv' ? `Spike near ${place}. Turn off TV or dim brightness.` :
             `Spike near ${place}. Stop the device temporarily.`;
  }else if(res.anomaly){
    advice = device==='idle' ? `Idle load above limit ${place}. Unplug standby devices.` :
             `Anomaly above limit ${place}. Consider pausing ${device}.`;
  }
  adviceEl.textContent = advice;
}

function tickLive(){
  const hour = new Date().getHours();
  const jitter = (Math.random()*0.4-0.2);
  state.series[hour] = Math.max(0, Math.min(5, state.series[hour] + jitter));
  const res = analyze(state.series, state.limit);
  state.spike = res.spike; state.anomaly = res.anomaly;
  draw(state.series, state.limit, res.spike ? 'spike' : 'normal');
  updateUI(currentDevice, res);
}