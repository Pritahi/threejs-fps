import { State, startMatch, step, buy, reload, grenade } from './sim.js';
import { createView } from './view.js';

const $ = (selector) => document.querySelector(selector);
const container = $('#game-container');
if (!container) throw new Error('COPPERLINE requires #game-container in index.html');
const view = createView(container);
const canvas = view.renderer.domElement;
canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;display:block';
container.insertBefore(canvas, container.firstChild);
const hud = $('#hud'), overlay = $('#ui-overlay'), startPanel = $('#start-screen'), buyPanel = $('#buy-menu'), pausePanel = $('#pause-menu');
const style = document.createElement('style');
style.textContent = `
 #hud{z-index:2;color:#e8e5d9;text-shadow:0 2px 5px #091018;pointer-events:none}
 #ui-overlay{z-index:5;background:rgba(7,13,20,.78);backdrop-filter:blur(3px)}
 #crosshair{border:0;width:18px;height:18px}
 #crosshair:before,#crosshair:after{content:"";position:absolute;background:#c5f7ed;box-shadow:0 0 5px #54e8e2}
 #crosshair:before{width:2px;height:18px;left:8px}#crosshair:after{height:2px;width:18px;top:8px}
 #hitmarker{position:absolute;left:50%;top:50%;width:22px;height:22px;transform:translate(-50%,-50%) rotate(45deg);opacity:0;pointer-events:none}
 #hitmarker.on{opacity:1}#hitmarker:before,#hitmarker:after{content:"";position:absolute;background:#ffe6b0}
 #hitmarker:before{width:2px;height:22px;left:10px}#hitmarker:after{height:2px;width:22px;top:10px}
 .hud-top{top:15px;gap:6px}.hud-top>div{background:#101b27c9;padding:5px 14px;border:1px solid #9c7045}
 #phase-label{font-size:13px;color:#59ded3;letter-spacing:2px}.hud-bottom-left,.hud-bottom-right{background:#101b27c9;padding:12px 16px;border:1px solid #344955;bottom:22px}
 #objective-status{position:absolute;left:50%;bottom:95px;transform:translateX(-50%);padding:8px 15px;background:#101b27d9;border:1px solid #b17b4b;font-size:14px;white-space:nowrap}
 #team-status{position:absolute;top:22px;right:22px;padding:8px 12px;background:#101b27c9;font-size:13px;line-height:1.55}
 #kill-feed{position:absolute;right:22px;top:115px;width:260px;text-align:right;font-size:13px;line-height:1.6;color:#f0d6b3}
 #banner{position:absolute;left:50%;top:35%;transform:translate(-50%,-50%);font-size:26px;letter-spacing:3px;text-align:center;color:#f2c587;text-shadow:0 3px 16px #000;white-space:pre-line}
 #round-timer{font-size:24px}#score{font-size:18px;color:#e8d8bd}
 #health-bar{width:180px}#cash-value{color:#c8e0a4}
 .panel{max-width:min(680px,90vw);color:#d8e0df}#start-screen h1{font-size:clamp(42px,8vw,76px);letter-spacing:10px;color:#d89254;margin:0;text-shadow:0 0 25px #b6632b55}
 #start-screen>p{font-size:20px;letter-spacing:4px;color:#66dcd5;margin:10px 0 22px}
 #controls-copy{max-width:590px;line-height:1.8;color:#bac5c5;text-align:left;margin:16px auto 22px;font-size:14px}
 #controls-copy b{color:#e0aa71}#banner-sub{font-size:14px;color:#d6d2c4;letter-spacing:1px;margin-top:12px}
 #ui-overlay button{min-width:125px;background:#172630;border-color:#b17b4b;color:#f2c18c}#ui-overlay button:hover{background:#b17b4b;color:#101820}
 .buy-grid button{font-size:14px;min-width:145px}.setting{display:flex;justify-content:space-between;gap:22px;margin:14px 0;align-items:center}
 #pause-menu input{accent-color:#54e8e2}.panel h2{color:#dfa269;letter-spacing:4px}
 `;
document.head.append(style);

const phaseLabel = document.createElement('div'); phaseLabel.id = 'phase-label'; $('.hud-top')?.prepend(phaseLabel);
const teamStatus = document.createElement('div'); teamStatus.id = 'team-status'; hud?.append(teamStatus);
const killFeed = document.createElement('div'); killFeed.id = 'kill-feed'; hud?.append(killFeed);
const banner = document.createElement('div'); banner.id = 'banner'; hud?.append(banner);
const bannerSub = document.createElement('div'); bannerSub.id = 'banner-sub'; banner.append(bannerSub);
const objective = $('#objective-status');
const crosshair = $('#crosshair'), hitmarker = $('#hitmarker'), vignette = $('#damage-vignette');
const minimap = $('#minimap'), ctx = minimap?.getContext('2d');
const startButton = $('#btn-start'), resumeButton = $('#btn-resume'), restartButton = $('#btn-restart');
const keys = new Set();
const FIXED = 1000 / 60;
let accumulator = 0, lastFrame = performance.now(), deployed = false, paused = false, preview = false;
let firing = false, aiming = false, sensitivity = .0022, masterVolume = .22, audio = null, hitUntil = 0, hurtUntil = 0;
let lastEventTime = -1, lastSeenEvents = new WeakSet(), feed = [];

function player() { return State.entities.find(e => e.type === 'player') || State.entities[0]; }
function formatTime(ms) { const seconds = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function ensureAudio() {
  if (audio) { if (audio.context.state === 'suspended') audio.context.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const context = new AC(), gain = context.createGain(); gain.gain.value = masterVolume; gain.connect(context.destination); audio = { context, gain };
}
function tone(freq, duration = .08, type = 'square', volume = .12, endFreq = freq) {
  if (!audio || masterVolume <= 0) return;
  const now = audio.context.currentTime, osc = audio.context.createOscillator(), gain = audio.context.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, now); osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
  gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
  osc.connect(gain); gain.connect(audio.gain); osc.start(now); osc.stop(now + duration);
}
function playEvent(event) {
  if (event.type === 'hit') {
    if (event.target === player()?.id) { hurtUntil = performance.now() + 180; tone(115, .13, 'sawtooth', .12, 55); }
    else if (event.source === player()?.id) { hitUntil = performance.now() + 110; tone(event.head ? 1150 : 790, .055, 'square', .08, 620); }
  } else if (event.type === 'kill') {
    feed.unshift({ text: `${event.source === player()?.id ? 'YOU' : event.source}  ▸  ${event.target}`, at: performance.now() }); feed.length = Math.min(feed.length, 5);
    tone(440, .1, 'triangle', .09, 760);
  } else if (event.type === 'planted') tone(520, .35, 'sine', .16, 310);
  else if (event.type === 'round-end') tone(event.winner === 0 ? 540 : 270, .48, 'triangle', .15, event.winner === 0 ? 820 : 150);
  else if (event.type === 'explosion') tone(68, .32, 'sawtooth', .16, 35);
  else if (event.type === 'reload') tone(260, .045, 'square', .045, 190);
}
function processEvents() {
  if (State.elapsed < lastEventTime) lastSeenEvents = new WeakSet();
  lastEventTime = State.elapsed;
  for (const event of State.events) if (!lastSeenEvents.has(event)) { lastSeenEvents.add(event); playEvent(event); }
}
function overlay(which) {
  overlayElement(true);
  for (const panel of [startPanel, buyPanel, pausePanel]) panel?.classList.add('hidden');
  if (which === 'start') startPanel?.classList.remove('hidden');
  if (which === 'buy') buyPanel?.classList.remove('hidden');
  if (which === 'pause') pausePanel?.classList.remove('hidden');
}
function overlayElement(show) { overlay?.classList.toggle('hidden', !show); }
function hideOverlay() { overlayElement(false); }
function addControls() {
  if (startPanel && !$('#controls-copy')) {
    const copy = document.createElement('div'); copy.id = 'controls-copy';
    copy.innerHTML = '<b>W A S D</b> move &nbsp; <b>Mouse</b> aim &nbsp; <b>LMB</b> fire &nbsp; <b>RMB</b> aim<br><b>R</b> reload &nbsp; <b>CTRL</b> crouch &nbsp; <b>SHIFT</b> sprint &nbsp; <b>E</b> plant / defuse<br><b>G / H</b> frag / smoke &nbsp; <b>B</b> market &nbsp; <b>1 / 2 / 3</b> buy weapon<br><b>ENTER</b> skip buy &nbsp; <b>ESC</b> pause &nbsp; First team to four rounds wins.';
    startPanel.insertBefore(copy, startButton || null);
  }
  if (pausePanel && !$('#settings')) {
    const settings = document.createElement('div'); settings.id = 'settings';
    settings.innerHTML = '<label class="setting">Sensitivity <input id="sensitivity" type="range" min="0.0005" max="0.006" step="0.0001" value="0.0022"></label><label class="setting">Master volume <input id="volume" type="range" min="0" max="0.5" step="0.01" value="0.22"></label>';
    (restartButton?.parentElement || pausePanel).insertBefore(settings, restartButton || null);
    $('#sensitivity').addEventListener('input', e => { sensitivity = Number(e.target.value); });
    $('#volume').addEventListener('input', e => { masterVolume = Number(e.target.value); if (audio) audio.gain.gain.value = masterVolume; });
  }
  for (const button of document.querySelectorAll('[data-item]')) button.addEventListener('click', () => {
    ensureAudio(); const ok = buy(player(), button.dataset.item); tone(ok ? 500 : 150, .09, 'triangle', .08, ok ? 680 : 110); updateHUD();
  });
}
addControls();

function requestLock() { if (!preview && canvas.requestPointerLock) { try { canvas.requestPointerLock(); } catch {} } }
function deploy(skipBuy = false) {
  ensureAudio(); startMatch(); deployed = true; paused = false; firing = false; aiming = false; accumulator = 0;
  if (skipBuy) { for (let i = 0; i < 151; i++) step(100, {}); }
  hideOverlay(); if (!preview) requestLock(); updateHUD();
}
startButton?.addEventListener('click', () => deploy(false));
resumeButton?.addEventListener('click', () => { paused = false; hideOverlay(); requestLock(); });
restartButton?.addEventListener('click', () => deploy(false));
container.addEventListener('click', event => { if (event.target.closest('button')) return; if (deployed && paused) { paused = false; hideOverlay(); requestLock(); } });
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) { if (deployed && !paused) hideOverlay(); }
  else if (deployed && !preview && !paused && State.phase !== 'MATCH') { paused = true; firing = false; aiming = false; overlay('pause'); }
});
document.addEventListener('mousemove', event => {
  if (!deployed || paused || preview || document.pointerLockElement !== canvas) return;
  const p = player(); p.yaw -= event.movementX * sensitivity; p.pitch = Math.max(-1.48, Math.min(1.48, p.pitch - event.movementY * sensitivity));
});
container.addEventListener('mousedown', event => { if (!deployed || paused || document.pointerLockElement !== canvas && !preview) return; ensureAudio(); if (event.button === 0) firing = true; if (event.button === 2) aiming = true; });
window.addEventListener('mouseup', event => { if (event.button === 0) firing = false; if (event.button === 2) aiming = false; });
container.addEventListener('contextmenu', event => event.preventDefault());
function buyBySlot(slot) { if (State.phase !== 'BUY') return; buy(player(), ['pistol', 'rifle', 'sniper'][slot]); }
window.addEventListener('keydown', event => {
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) event.preventDefault();
  if (event.code === 'Escape') {
    if (!deployed) return;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    else if (!paused) { paused = true; firing = false; aiming = false; overlay('pause'); }
    else { paused = false; hideOverlay(); requestLock(); }
    return;
  }
  if (event.repeat && ['KeyG','KeyH','KeyR','KeyB','Enter','Digit1','Digit2','Digit3'].includes(event.code)) return;
  keys.add(event.code);
  if (!deployed || paused) return;
  ensureAudio();
  if (event.code === 'KeyR') reload(player());
  if (event.code === 'KeyG') grenade(player(), 'frag');
  if (event.code === 'KeyH') grenade(player(), 'smoke');
  if (event.code === 'KeyB' && State.phase === 'BUY') { overlay('buy'); if (document.pointerLockElement) document.exitPointerLock(); }
  if (event.code === 'Enter' && State.phase === 'BUY') { for (let i = 0; i < 151; i++) step(100, {}); }
  if (event.code === 'Digit1') buyBySlot(0); if (event.code === 'Digit2') buyBySlot(1); if (event.code === 'Digit3') buyBySlot(2);
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => { firing = false; aiming = false; keys.clear(); });

function controls() {
  if (paused || !deployed) return {};
  const p = player(), forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS')), side = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  return { moveX: -sy * forward + cy * side, moveZ: -cy * forward - sy * side,
    yaw: p.yaw, pitch: p.pitch, fire: firing, aim: aiming, crouch: keys.has('ControlLeft') || keys.has('ControlRight'),
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'), reload: false, interact: keys.has('KeyE') };
}
function drawMinimap() {
  if (!ctx || !minimap) return;
  const w = minimap.width = minimap.clientWidth * devicePixelRatio, h = minimap.height = minimap.clientHeight * devicePixelRatio;
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#111a22'; ctx.fillRect(0, 0, w, h);
  const sx = w / 60, sy = h / 60, px = x => (x + 30) * sx, pz = z => (z + 30) * sy;
  ctx.fillStyle = '#39454b'; for (const b of (awaitlessBoxes)) ctx.fillRect(px(b.x-b.w/2),pz(b.z-b.d/2),b.w*sx,b.d*sy);
  ctx.font = `${Math.max(10, w*.09)}px monospace`; ctx.textAlign='center';
  for (const site of awaitlessSites) { ctx.fillStyle='#dfa15e';ctx.fillText(site.id,px(site.x),pz(site.z)); }
  const me=player(); if (!me) return;
  for (const e of State.entities) if (!e.dead) {
    if (e.team !== me.team && Math.hypot(e.x-me.x,e.z-me.z)>19) continue;
    ctx.fillStyle=e.type==='player'?'#69f4e6':e.team===me.team?'#4dbbb5':'#ec6949';ctx.beginPath();ctx.arc(px(e.x),pz(e.z),e.type==='player'?4:3.3,0,Math.PI*2);ctx.fill();
  }
}
const awaitlessBoxes = (await import('./sim.js')).BOXES;
const awaitlessSites = (await import('./sim.js')).SITES;
function updateHUD() {
  const p=player(); if(!p)return;
  $('#round-timer').textContent=formatTime(State.timer);$('#score').textContent=`${State.score[0]}  —  ${State.score[1]}`;
  phaseLabel.textContent=`ROUND ${State.round}  /  ${State.phase}`;
  $('#health-value').textContent=`${Math.max(0,Math.ceil(p.hp))}${p.armor?`  +${Math.ceil(p.armor)} ARMOR`:''}`;
  $('#health-fill').style.width=`${Math.max(0,p.hp)}%`;$('#health-fill').style.background=p.hp<35?'#ed644f':'#54e8e2';
  $('#ammo-count').textContent=p.reload>0?'RELOADING':`${p.mag}  /  ${p.reserve}`;
  $('#weapon-name').textContent=({pistol:'SIDEARM // M9',rifle:'RIFLE // COPPER',sniper:'PRECISION // LANCE'})[p.weapon]||p.weapon.toUpperCase();
  $('#cash-value').textContent=`$ ${p.money.toLocaleString()}  ·  FRAG ${p.grenades.frag} / SMOKE ${p.grenades.smoke}`;
  const alive=[0,1].map(team=>State.entities.filter(e=>e.team===team&&!e.dead).length);
  teamStatus.innerHTML=`<span style="color:#5be0d7">COPPER ${alive[0]}</span><br><span style="color:#f07a55">HOSTILE ${alive[1]}</span>`;
  if(State.relay.status==='PLANTED') objective.textContent=`RELAY ${State.relay.site?.id||''} — FUSE ${formatTime(State.relay.fuse)}${State.relay.defuse>0?`  ·  DEFUSING ${Math.floor(State.relay.defuse/50)}%`:''}`;
  else if(State.relay.progress>0) objective.textContent=`PLANTING ${Math.min(100,Math.floor(State.relay.progress/30))}% — HOLD E`;
  else if(State.phase==='BUY') objective.textContent=`BUY PHASE — $${p.money.toLocaleString()}  ·  B MARKET  ·  ENTER DEPLOY`;
  else objective.textContent=`RELAY IDLE — ATTACKERS PLANT AT A / B`;
  if(!p.hp||p.dead){banner.firstChild.textContent='ELIMINATED';bannerSub.textContent=State.phase==='END'?'ROUND COMPLETE — NEXT ROUND IN A MOMENT':'SPECTATING';}
  else if(State.phase==='MATCH'){banner.firstChild.textContent=State.winner===0?'COPPERLINE VICTORY':'HOSTILES WIN';bannerSub.textContent='FIRST TO FOUR ROUNDS';}
  else if(State.phase==='END'){banner.firstChild.textContent=State.winner===0?'ROUND WON':'ROUND LOST';bannerSub.textContent=`${State.score[0]} — ${State.score[1]}  ·  NEXT ROUND` ;}
  else if(State.phase==='BUY'){banner.firstChild.textContent='BUY PHASE';bannerSub.textContent=`DEPLOYING IN ${formatTime(State.timer)}`;}
  else {banner.firstChild.textContent='';bannerSub.textContent='';}
  const now=performance.now();crosshair?.classList.toggle('aiming',aiming);hitmarker?.classList.toggle('on',now<hitUntil);
  if(vignette)vignette.style.boxShadow=now<hurtUntil?'inset 0 0 120px rgba(228,45,34,.5)':'inset 0 0 100px rgba(211,66,66,0)';
  killFeed.innerHTML=feed.filter(item=>now-item.at<5000).map(item=>`<div>${item.text}</div>`).join('');feed=feed.filter(item=>now-item.at<5000);
  drawMinimap();
}
function frame(now) {
  requestAnimationFrame(frame);const delta=Math.min(100,Math.max(0,now-lastFrame));lastFrame=now;
  if(deployed&&!paused&&State.phase!=='MATCH'){
    accumulator+=delta;let count=0;while(accumulator>=FIXED&&count<6){step(FIXED,controls());accumulator-=FIXED;count++;}
    if(count===6)accumulator=Math.min(accumulator,FIXED);
    processEvents();
  }
  view.render(State,delta);updateHUD();
}

preview=new URLSearchParams(location.search).get('preview')==='1';
const shot=new URLSearchParams(location.search).get('shot');
if(preview){deploy(true);if(shot==='site'){const p=player();p.x=-20;p.z=-14;p.yaw=0;p.pitch=.06;State.phase='LIVE';State.timer=90000;}}
else { overlay('start'); }
window.game={state:State,start:({skipBuy=false}={})=>deploy(skipBuy),teleport:(x,z)=>{const p=player();p.x=x;p.z=z;},setLook:(yaw,pitch=0)=>{const p=player();p.yaw=yaw;p.pitch=pitch;},step:(n=1)=>{for(let i=0;i<n;i++)step(FIXED,controls());processEvents();updateHUD();}};
requestAnimationFrame(frame);
