// COPPERLINE // deterministic fixed-step relay siege simulation (dt in ms).
export const MAP_SIZE = 60;
export const SITES = [{ id: 'A', x: -20, z: -20 }, { id: 'B', x: 20, z: -20 }];
export const BOXES = [
  { x: 0, y: 2, z: -30, w: 60, h: 4, d: 2 }, { x: 0, y: 2, z: 30, w: 60, h: 4, d: 2 },
  { x: 30, y: 2, z: 0, w: 2, h: 4, d: 60 }, { x: -30, y: 2, z: 0, w: 2, h: 4, d: 60 },
  { x: -10, y: 1.5, z: 0, w: 2, h: 3, d: 20 }, { x: 10, y: 1.5, z: 0, w: 2, h: 3, d: 20 },
  { x: -20, y: 1, z: -10, w: 8, h: 2, d: 8 }, { x: 20, y: 1, z: -10, w: 8, h: 2, d: 8 },
  { x: -20, y: 1, z: 10, w: 8, h: 2, d: 8 }, { x: 20, y: 1, z: 10, w: 8, h: 2, d: 8 },
  { x: 0, y: 1.25, z: -19, w: 12, h: 2.5, d: 2 }, { x: 0, y: 1.25, z: 19, w: 12, h: 2.5, d: 2 },
  { x: -3, y: 1, z: -7, w: 4, h: 2, d: 5 }, { x: 3, y: 1, z: 7, w: 4, h: 2, d: 5 },
];
export const WEAPONS = {
  pistol: { price: 200, dmg: 25, spread: .022, recoil: .012, rate: 280, mag: 12, reserve: 48, reload: 1450 },
  rifle: { price: 2900, dmg: 34, spread: .012, recoil: .018, rate: 105, mag: 30, reserve: 90, reload: 2350 },
  sniper: { price: 4500, dmg: 42, spread: .002, recoil: .045, rate: 850, mag: 5, reserve: 20, reload: 3000 },
};

const BUY_MS = 15000, LIVE_MS = 90000, END_MS = 5000, FUSE_MS = 35000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const State = {
  phase: 'BUY', timer: BUY_MS, elapsed: 0, round: 1, score: [0, 0], cash: [800, 8000],
  entities: [], relay: { status: 'IDLE', site: null, progress: 0, fuse: FUSE_MS },
  tracers: [], grenades: [], events: [], rng: 12345, winner: null,
};

function random() { State.rng = (State.rng * 16807) % 2147483647; return (State.rng - 1) / 2147483646; }
function event(type, data = {}) { State.events.push({ type, time: State.elapsed, ...data }); if (State.events.length > 64) State.events.shift(); }
function entity(type, team, x, z, weapon = 'pistol', money = 800) {
  const gun = WEAPONS[weapon];
  return { id: `${type}-${State.round}-${State.entities.length}`, type, team, hp: 100, x, y: 0, z, vx: 0, vz: 0,
    yaw: team === 0 ? 0 : Math.PI, pitch: 0, crouch: false, sprint: false, aim: false, dead: false, armor: 0,
    weapon, mag: gun.mag, reserve: gun.reserve, reload: 0, fireDelay: random() * 300, recoil: 0,
    grenades: { frag: 0, smoke: 0 }, money, ai: type === 'bot' ? { target: null, route: [], routeAt: 0, think: random() * 300, plant: 0, defuse: 0 } : null };
}
function newRound() {
  State.phase = 'BUY'; State.timer = BUY_MS; State.elapsed = 0; State.winner = null;
  State.relay = { status: 'IDLE', site: null, progress: 0, fuse: FUSE_MS, defuse: 0 };
  State.tracers.length = 0; State.grenades.length = 0;
  const oldPlayer = State.entities[0], playerMoney = State.cash[0];
  const carry = oldPlayer ? { weapon: oldPlayer.weapon, armor: oldPlayer.armor, grenades: { ...oldPlayer.grenades } } : null;
  State.entities = [entity('player', 0, 0, 24, carry?.weapon || 'pistol', playerMoney),
    entity('bot', 0, -6, 24, 'rifle', State.cash[0]), entity('bot', 0, 6, 24, 'rifle', State.cash[0]),
    entity('bot', 1, -16, -24, 'rifle', State.cash[1]), entity('bot', 1, 16, -24, 'rifle', State.cash[1]), entity('bot', 1, 0, -25, 'sniper', State.cash[1])];
  if (carry) Object.assign(State.entities[0], carry);
  State.entities.forEach(e => { e.money = e.team === 0 ? State.cash[0] : State.cash[1]; });
}
export function startMatch(seed = 12345) {
  State.score = [0, 0]; State.cash = [800, 8000]; State.round = 1;
  State.rng = (Math.abs(Math.trunc(seed)) % 2147483646) + 1; State.events = []; newRound(); return State;
}
startMatch();

function hitBox(x, z, radius = .42) {
  return BOXES.some(b => Math.abs(x - b.x) < b.w / 2 + radius && Math.abs(z - b.z) < b.d / 2 + radius);
}
function move(e, input, dt) {
  e.crouch = !!input.crouch; e.sprint = !!input.sprint && !e.crouch;
  const speed = e.crouch ? 2.1 : e.sprint ? 7 : 4.7, seconds = dt / 1000;
  const mx = clamp(input.moveX || 0, -1, 1), mz = clamp(input.moveZ || 0, -1, 1), len = Math.hypot(mx, mz) || 1;
  const response = Math.min(1, 14 * seconds);
  e.vx += (mx / len * speed - e.vx) * response; e.vz += (mz / len * speed - e.vz) * response;
  let nx = clamp(e.x + e.vx * seconds, -28.7, 28.7), nz = clamp(e.z + e.vz * seconds, -28.7, 28.7);
  if (!hitBox(nx, e.z)) e.x = nx; else e.vx = 0;
  if (!hitBox(e.x, nz)) e.z = nz; else e.vz = 0;
}
function rayAABB(o, d, maxDistance, box) {
  let lo = 0, hi = maxDistance;
  for (const [origin, dir, min, max] of [[o.x,d.x,box.x-box.w/2,box.x+box.w/2],[o.y,d.y,box.y-box.h/2,box.y+box.h/2],[o.z,d.z,box.z-box.d/2,box.z+box.d/2]]) {
    if (Math.abs(dir) < 1e-8) { if (origin < min || origin > max) return Infinity; continue; }
    let a = (min-origin)/dir, b = (max-origin)/dir; if (a>b) [a,b] = [b,a]; lo = Math.max(lo,a); hi = Math.min(hi,b); if (hi < lo) return Infinity;
  }
  return lo >= 0 ? lo : hi >= 0 ? hi : Infinity;
}
function wallDistance(o, d, max) {
  let nearest = max;
  for (const b of BOXES) nearest = Math.min(nearest, rayAABB(o, d, nearest, b));
  for (const g of State.grenades) if (g.kind === 'smoke' && g.fuse < 0 && Math.hypot(o.x-g.x,o.z-g.z) < 4 && Math.abs(o.y-g.y) < 3) nearest = Math.min(nearest, 0);
  return nearest;
}
function look(e, yaw, pitch) {
  const cp = Math.cos(pitch); return { x: -Math.sin(yaw)*cp, y: Math.sin(pitch), z: -Math.cos(yaw)*cp };
}
function visible(a, b) {
  const origin = { x:a.x, y:a.y+(a.crouch?1.05:1.55), z:a.z }, target = { x:b.x, y:b.y+(b.crouch?1.05:1.55), z:b.z };
  const dx=target.x-origin.x,dy=target.y-origin.y,dz=target.z-origin.z,length=Math.hypot(dx,dy,dz);
  return wallDistance(origin,{x:dx/length,y:dy/length,z:dz/length},length) >= length-.2;
}
function traceShot(e, yaw, pitch, aiming = false) {
  const gun = WEAPONS[e.weapon], moving = Math.hypot(e.vx,e.vz), spread = gun.spread * (aiming ? .34 : 1) + moving*.003 + e.recoil;
  yaw += (random()-.5)*spread; pitch += (random()-.5)*spread;
  const d = look(e,yaw,pitch), o = { x:e.x, y:e.y+(e.crouch?1.05:1.55), z:e.z }, range = e.weapon === 'sniper' ? 100 : 75;
  let nearest = wallDistance(o,d,range), victim = null, head = false;
  for (const t of State.entities) {
    if (t === e || t.dead || t.team === e.team) continue;
    const center = {x:t.x,y:t.y+(t.crouch?1.05:1.35),z:t.z};
    for (const [cy,r,isHead] of [[center.y,.43,false],[center.y+.48,.23,true]]) {
      const ox=o.x-center.x, oy=o.y-cy, oz=o.z-center.z, projection=-(ox*d.x+oy*d.y+oz*d.z);
      if (projection < 0 || projection > nearest) continue;
      const qx=ox+d.x*projection,qy=oy+d.y*projection,qz=oz+d.z*projection;
      if (qx*qx+qy*qy+qz*qz <= r*r) { nearest=projection; victim=t; head=isHead; }
    }
  }
  const end={x:o.x+d.x*nearest,y:o.y+d.y*nearest,z:o.z+d.z*nearest};
  State.tracers.push({from:o,to:end,life:100,team:e.team});
  if (victim) damage(e,victim,gun.dmg*(head?3:1),head);
}
function damage(source,target,amount,head=false) {
  const absorbed=Math.min(target.armor,amount*.45); target.armor-=absorbed; target.hp-=amount-absorbed;
  event('hit',{source:source.id,target:target.id,x:target.x,z:target.z,head,damage:Math.round(amount-absorbed)});
  if (target.hp<=0) { target.hp=0;target.dead=true;source.money+=300;State.cash[source.team]+=300;event('kill',{source:source.id,target:target.id,team:source.team});checkElimination(); }
}
function shoot(e, input) {
  if (e.reload>0 || e.fireDelay>0 || e.mag<=0) { if (e.mag===0 && e.reserve>0) reload(e); return; }
  e.mag--; e.fireDelay=WEAPONS[e.weapon].rate; e.recoil=Math.min(.065,e.recoil+WEAPONS[e.weapon].recoil);
  traceShot(e,input.yaw ?? e.yaw,input.pitch ?? e.pitch,!!input.aim);
  if(e.mag===0&&e.reserve>0) reload(e);
}
export function fire(e=State.entities[0], yaw=e.yaw, pitch=e.pitch, aim=false) { if(!e||e.dead)return false; const before=State.tracers.length;shoot(e,{yaw,pitch,aim});return State.tracers.length>before; }
export function reload(e=State.entities[0]) {
  if(!e||e.dead||e.reload>0||e.mag>=WEAPONS[e.weapon].mag||e.reserve<=0)return false;
  e.reload=WEAPONS[e.weapon].reload;event('reload',{entity:e.id});return true;
}
function finishReload(e) { const amount=Math.min(WEAPONS[e.weapon].mag-e.mag,e.reserve);e.mag+=amount;e.reserve-=amount;e.reload=0; }
export function buy(e,item) {
  if(!e||State.phase!=='BUY'||e.dead)return false;
  if(WEAPONS[item]) { const gun=WEAPONS[item];if(e.money<gun.price)return false;e.money-=gun.price;State.cash[e.team]=Math.max(0,State.cash[e.team]-gun.price);e.weapon=item;e.mag=gun.mag;e.reserve=gun.reserve;e.reload=0;event('buy',{entity:e.id,item});return true; }
  if(item==='armor'&&e.armor<100&&e.money>=650){e.money-=650;State.cash[e.team]-=650;e.armor=100;return true;}
  if((item==='frag'||item==='smoke')&&e.grenades[item]<1){const price=item==='frag'?400:300;if(e.money<price)return false;e.money-=price;State.cash[e.team]-=price;e.grenades[item]++;return true;}
  return false;
}
export function grenade(e=State.entities[0],kind='frag',yaw=e.yaw,pitch=e.pitch) {
  if(!e||e.dead||!['frag','smoke'].includes(kind)||e.grenades[kind]<=0)return false;
  const d=look(e,yaw,pitch),speed=kind==='frag'?15:12;e.grenades[kind]--;
  State.grenades.push({kind,owner:e.id,team:e.team,x:e.x,y:e.y+1.35,z:e.z,vx:d.x*speed,vz:d.z*speed,vy:d.y*speed+4,fuse:kind==='frag'?1800:1250,life:kind==='smoke'?6500:0});
  event('grenade',{kind,x:e.x,z:e.z});return true;
}

function nearestEnemy(e) { let best=null,range=Infinity;for(const t of State.entities)if(!t.dead&&t.team!==e.team){const d=dist(e,t);if(d<range&&visible(e,t)){best=t;range=d;}}return best; }
function routeFor(e,target) {
  const candidates=[{x:0,z:11},{x:-6,z:4},{x:6,z:-4},{x:-15,z:-15},{x:15,z:-15},target];
  const start={x:e.x,z:e.z};const route=[];let point=start;
  while(candidates.length){let index=0,best=Infinity;candidates.forEach((p,i)=>{const d=Math.hypot(p.x-point.x,p.z-point.z);if(d<best){best=d;index=i;}});point=candidates.splice(index,1)[0];route.push(point);}
  return route;
}
function aiInput(e,dt) {
  const ai=e.ai;ai.think-=dt;let target=ai.target&&State.entities.find(t=>t.id===ai.target&&!t.dead);
  if(ai.think<=0){target=nearestEnemy(e);ai.target=target?.id||null;ai.think=220+random()*180;}
  const attacker=e.team===0;let objective=null;
  if(attacker&&State.relay.status==='IDLE')objective=SITES.reduce((a,s)=>dist(e,s)<dist(e,a)?s:a,SITES[0]);
  else if(!attacker&&State.relay.status==='PLANTED')objective=State.relay;
  if(!ai.route.length||ai.routeAt>=ai.route.length){ai.route=routeFor(e,objective||target||{x:0,z:0});ai.routeAt=0;}
  let waypoint=ai.route[ai.routeAt];if(Math.hypot(e.x-waypoint.x,e.z-waypoint.z)<1.2&&ai.routeAt<ai.route.length-1)waypoint=ai.route[++ai.routeAt];
  let yaw=e.yaw,pitch=0,fireNow=false;
  if(target){const dx=target.x-e.x,dy=target.y+1.2-(e.y+1.5),dz=target.z-e.z,yawTarget=Math.atan2(-dx,-dz),pitchTarget=Math.atan2(dy,Math.hypot(dx,dz));yaw+=clamp(Math.atan2(Math.sin(yawTarget-yaw),Math.cos(yawTarget-yaw)),-dt*.003,dt*.003);pitch=pitchTarget+(random()-.5)*.03;fireNow=dist(e,target)<38&&visible(e,target)&&Math.abs(Math.atan2(Math.sin(yawTarget-yaw),Math.cos(yawTarget-yaw)))<.12;}
  else {const dx=waypoint.x-e.x,dz=waypoint.z-e.z;if(Math.hypot(dx,dz)>1)yaw=Math.atan2(-dx,-dz);}
  e.yaw=yaw;e.pitch=pitch;
  if(objective&&dist(e,objective)<2&&attacker&&State.relay.status==='IDLE')ai.plant+=dt;else ai.plant=0;
  if(objective&&dist(e,objective)<2&&!attacker&&State.relay.status==='PLANTED')ai.defuse+=dt;else ai.defuse=0;
  return {moveX:waypoint.x-e.x,moveZ:waypoint.z-e.z,yaw,pitch,fire:fireNow,aim:true};
}
function interactEntity(e, input, dt) {
  if(!input.interact||e.dead)return;
  const attackers=State.entities.filter(t=>!t.dead&&t.team===0),defenders=State.entities.filter(t=>!t.dead&&t.team===1);
  if(State.relay.status==='IDLE'&&e.team===0){const site=SITES.find(s=>dist(e,s)<2.4);if(site){State.relay.progress+=dt;if(State.relay.progress>=3000){State.relay.status='PLANTED';State.relay.site=site;State.relay.fuse=FUSE_MS;State.relay.progress=0;event('planted',{site:site.id});}}else State.relay.progress=0;}
  else if(State.relay.status==='PLANTED'&&e.team===1&&dist(e,State.relay.site)<2.4){State.relay.defuse+=dt;if(State.relay.defuse>=5000){State.relay.status='DEFUSED';event('defused');endRound(1);}}else if(e.team===1)State.relay.defuse=0;
  if(attackers.length===0)endRound(1);else if(defenders.length===0&&State.relay.status!=='PLANTED')endRound(0);
}
export function interact(e=State.entities[0],dt=16) { if(!e)return false;interactEntity(e,{interact:true},dt);return true; }
function updateGrenades(dt) {
  for(let i=State.grenades.length-1;i>=0;i--){const g=State.grenades[i];g.fuse-=dt;g.x+=g.vx*dt/1000;g.z+=g.vz*dt/1000;g.y+=g.vy*dt/1000;g.vy-=9.8*dt/1000;
    if(hitBox(g.x,g.z,.15)){g.x-=g.vx*dt/1000;g.z-=g.vz*dt/1000;g.vx*=-.35;g.vz*=-.35;}if(g.y<.15){g.y=.15;g.vy=Math.abs(g.vy)*.35;g.vx*=.8;g.vz*=.8;}
    if(g.kind==='frag'&&g.fuse<=0){for(const t of State.entities)if(!t.dead){const d=Math.hypot(t.x-g.x,t.z-g.z),o={x:g.x,y:g.y,z:g.z},v={x:(t.x-g.x)/(d||1),y:(t.y+1-g.y)/(d||1),z:(t.z-g.z)/(d||1)};if(d<7&&wallDistance(o,v,d)>=d-.2)damage(State.entities.find(e=>e.id===g.owner)||t,t,Math.round(90*(1-d/7)));}event('explosion',{x:g.x,z:g.z});State.grenades.splice(i,1);}
    else if(g.kind==='smoke'&&g.fuse<=0){g.fuse=-1;g.vx=0;g.vz=0;g.vy=0;g.life-=dt;if(g.life<=0)State.grenades.splice(i,1);}
  }
}
function checkElimination() { const alive=[0,1].map(team=>State.entities.some(e=>!e.dead&&e.team===team));if(!alive[0])endRound(1);else if(!alive[1]&&State.relay.status!=='PLANTED')endRound(0); }
function endRound(winner) { if(State.phase==='END'||State.phase==='MATCH')return;State.phase='END';State.timer=END_MS;State.winner=winner;State.score[winner]++;State.cash[winner]+=3000;State.cash[1-winner]+=1900;event('round-end',{winner,score:[...State.score]});if(State.score[winner]>=4){State.phase='MATCH';State.timer=0;event('match-end',{winner});} }
function updateObjective(dt) {
  if(State.relay.status==='PLANTED'){State.relay.fuse-=dt;if(State.relay.fuse<=0)endRound(0);
    if(!State.entities.some(e=>!e.dead&&e.team===0))endRound(1);if(!State.entities.some(e=>!e.dead&&e.team===1))endRound(0);
    for(const e of State.entities.filter(e=>e.type==='bot'&&e.team===1&&!e.dead)){if(dist(e,State.relay.site)<2&&visible(e,{...State.relay.site,y:0,crouch:false})){e.ai.defuse+=dt;if(e.ai.defuse>=5000){State.relay.status='DEFUSED';event('defused',{by:e.id});endRound(1);break;}}else e.ai.defuse=0;}
  }
}
export function step(dt, input = {}) {
  dt=clamp(Number.isFinite(dt)?dt:0,0,100);State.elapsed+=dt;State.events=State.events.slice(-64);
  for(const t of State.tracers)t.life-=dt;State.tracers=State.tracers.filter(t=>t.life>0);
  if(State.phase==='MATCH')return State;
  if(State.phase==='END'){State.timer-=dt;if(State.timer<=0){State.round++;newRound();}return State;}
  State.timer-=dt;if(State.phase==='BUY'&&State.timer<=0){State.phase='LIVE';State.timer=LIVE_MS;event('live');}
  else if(State.phase==='LIVE'&&State.timer<=0&&State.relay.status!=='PLANTED'){endRound(1);return State;}
  for(const e of State.entities){if(e.dead)continue;if(e.fireDelay>0)e.fireDelay-=dt;if(e.recoil>0)e.recoil=Math.max(0,e.recoil-dt*.000018);if(e.reload>0){e.reload-=dt;if(e.reload<=0)finishReload(e);}
    const control=e.type==='player'?input:aiInput(e,dt);e.yaw=Number.isFinite(control.yaw)?control.yaw:e.yaw;e.pitch=Number.isFinite(control.pitch)?control.pitch:e.pitch;e.aim=!!control.aim;move(e,control,dt);
    if(control.reload)reload(e);if(control.interact)interactEntity(e,control,dt);if(control.fire&&State.phase==='LIVE')shoot(e,control);
    if(e.type==='bot'&&e.ai){if(e.ai.plant>=3000&&State.relay.status==='IDLE'){const site=SITES.reduce((a,s)=>dist(e,s)<dist(e,a)?s:a,SITES[0]);State.relay.status='PLANTED';State.relay.site=site;State.relay.fuse=FUSE_MS;event('planted',{site:site.id,by:e.id});}}
  }
  updateGrenades(dt);updateObjective(dt);
  if(State.phase==='LIVE'&&State.relay.status==='IDLE'&&!State.entities.some(e=>!e.dead&&e.team===1))endRound(0);
  if(State.phase==='LIVE'&&State.relay.status!=='PLANTED'&&!State.entities.some(e=>!e.dead&&e.team===0))endRound(1);
  return State;
}
