import * as THREE from 'three';
import { BOXES, MAP_SIZE, SITES } from './sim.js';

const C = { night: 0x101b27, blue: 0x263746, wall: 0x4c5c65, sand: 0x786852, copper: 0x9c5638,
  trim: 0xb17b4b, cyan: 0x54e8e2, red: 0xf06b45, white: 0xdde0d4, dark: 0x111920, warm: 0xffbd78 };
const mat = (color, roughness = .78, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const boxGeo = new THREE.BoxGeometry(1, 1, 1), sphereGeo = new THREE.SphereGeometry(1, 16, 12), cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12);

export function createView(container) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x182431); scene.fog = new THREE.FogExp2(0x263440, .008);
  const camera = new THREE.PerspectiveCamera(74, 1, .08, 180); camera.rotation.order = 'YXZ'; scene.add(camera);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
  renderer.outputColorSpace = THREE.SRGBColorSpace; container.appendChild(renderer.domElement);

  const m = {
    ground: mat(0x41474a), asphalt: mat(0x303b41), concrete: mat(C.wall), panel: mat(C.blue, .48, .3),
    sand: mat(C.sand), copper: mat(C.copper, .5, .35), trim: mat(C.trim, .4, .55), black: mat(C.dark, .42, .4),
    steel: mat(0x74828a, .34, .75), pale: mat(C.white), cyan: mat(C.cyan, .28, .4), red: mat(C.red, .3, .25),
    glass: new THREE.MeshStandardMaterial({ color: 0xffd38c, emissive: 0xff982d, emissiveIntensity: 2.1 }),
    redGlow: new THREE.MeshStandardMaterial({ color: C.red, emissive: C.red, emissiveIntensity: 1.8 }),
    cyanGlow: new THREE.MeshStandardMaterial({ color: C.cyan, emissive: C.cyan, emissiveIntensity: 1.8 }),
  };
  const hemi = new THREE.HemisphereLight(0xaec4d2, 0x27201b, 3); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc68e, 3); sun.position.set(-28, 38, 22); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -38; sun.shadow.camera.right = 38;
  sun.shadow.camera.top = 38; sun.shadow.camera.bottom = -38; sun.shadow.bias = -.0004; scene.add(sun);
  const sunset = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0xf29358 })); sunset.position.set(-42, 18, -72); sunset.scale.set(13, 9, 1); scene.add(sunset);
  const fill = new THREE.AmbientLight(0x627b92, .9); scene.add(fill);

  function mesh(geometry, material, parent = scene, x = 0, y = 0, z = 0) {
    const o = new THREE.Mesh(geometry, material); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  }
  function block(parent, material, x, y, z, sx, sy, sz) {
    const o = mesh(boxGeo, material, parent, x, y, z); o.scale.set(sx, sy, sz); return o;
  }
  function cylinder(parent, material, x, y, z, radius, height, segments = 12) {
    const o = mesh(segments === 12 ? cylGeo : new THREE.CylinderGeometry(radius, radius, 1, segments), material, parent, x, y, z);
    o.scale.set(radius, height, radius); return o;
  }
  const floor = mesh(new THREE.PlaneGeometry(180, 180), m.ground); floor.rotation.x = -Math.PI / 2; floor.position.y = -.18; floor.receiveShadow = true;
  block(scene, m.asphalt, 0, -.085, 0, MAP_SIZE - 2, .12, MAP_SIZE - 2);
  // Dusty traffic lanes, drainage seams, and broken pavement markings.
  for (const x of [-21, 0, 21]) {
    block(scene, m.asphalt, x, -.012, 0, 10, .025, 57);
    for (let z = -27; z < 28; z += 4) block(scene, m.trim, x + (x === 0 ? 5.3 : 4.7), .006, z, .09, .025, 1.2);
  }
  for (let i = 0; i < 40; i++) {
    const x = -27 + (i * 17 % 53), z = -27 + (i * 29 % 53);
    const pebble = mesh(sphereGeo, i % 3 ? m.asphalt : m.concrete, scene, x, -.005, z);
    pebble.scale.set(.08 + (i % 4) * .03, .025, .1 + (i % 3) * .035); pebble.castShadow = false;
  }
  // Perimeter walls and industrial cover, matching the simulation's collision map.
  for (const b of BOXES) {
    const wallMat = b.h > 3 ? m.concrete : (b.w > b.d ? m.sand : m.panel);
    block(scene, wallMat, b.x, b.y, b.z, b.w, b.h, b.d);
    if (b.h > 3) {
      const alongX = b.w > b.d, length = alongX ? b.w : b.d, count = Math.floor(length / 2.5);
      for (let i = 1; i < count; i++) {
        const offset = -length / 2 + i * length / count;
        block(scene, m.trim, b.x + (alongX ? offset : 0), b.y, b.z + (alongX ? 0 : offset), alongX ? .055 : b.w + .04, b.h * .86, alongX ? b.d + .04 : .055);
      }
      block(scene, m.black, b.x, b.y + b.h / 2 + .035, b.z, b.w + (b.w > b.d ? .16 : 0), .08, b.d + (b.d > b.w ? .16 : 0));
    } else {
      const alongX = b.w > b.d, width = alongX ? b.w : b.d;
      for (let i = 0; i <= width * 2; i++) {
        const offset = -width / 2 + i * .5;
        const rib = block(scene, i % 4 === 0 ? m.trim : m.steel, b.x + (alongX ? offset : 0), b.y + b.h / 2 + .018,
          b.z + (alongX ? 0 : offset), alongX ? .045 : b.w * .88, .035, alongX ? b.d * .88 : .045);
        rib.castShadow = false;
      }
      block(scene, m.copper, b.x, b.y + b.h / 2 + .045, b.z, b.w, .06, b.d);
    }
  }
  // Create raised ribbed utility containers and pipe runs along all three routes.
  for (const [x, z] of [[-20,-10],[20,-10],[-20,10],[20,10],[-3,-7],[3,7]]) {
    const w = Math.abs(x) === 3 ? 4 : 8, d = Math.abs(x) === 3 ? 5 : 8, top = Math.abs(x) === 3 ? 2 : 2;
    for (let i = 0; i < 5; i++) block(scene, i % 2 ? m.steel : m.trim, x - w/2 + .22 + i*(w-.44)/4, top/2, z, .075, top-.18, d-.25);
    for (const side of [-1,1]) block(scene, m.black, x+side*(w/2-.12), .18, z, .08, .16, d+.12);
  }
  // Pipe racks, cable bridges, roof vents and warning-striped bollards.
  for (const x of [-13, 13]) {
    cylinder(scene, m.steel, x, 2.75, 0, .11, 23, 10).rotation.z = Math.PI / 2;
    cylinder(scene, m.copper, x, 3.02, 0, .07, 23, 10).rotation.z = Math.PI / 2;
    for (const z of [-10, 10]) block(scene, m.trim, x, 2.45, z, .18, .9, .18);
  }
  for (const [x,z] of [[-24,0],[24,0],[0,-26],[0,26]]) {
    const post = cylinder(scene, m.trim, x, .65, z, .13, 1.3); post.rotation.z = .04;
    for (let y = .25; y < 1.3; y += .34) { const stripe = block(scene, m.black, x, y, z, .28, .12, .28); stripe.rotation.y = Math.PI/4; }
  }
  // Exterior skyline: refinery stacks, gantries and silent tank silhouettes beyond the wall.
  for (let i = 0; i < 15; i++) {
    const x = -48 + i * 6.8, z = -42 - (i % 3) * 5, h = 5 + (i * 7 % 12), silhouette = i % 3 ? m.panel : m.black;
    block(scene, silhouette, x, h / 2, z, 3 + i % 4, h, 2.5);
    if (i % 4 === 0) { cylinder(scene, m.black, x + 1, h + 2, z, .55, 4); cylinder(scene, m.copper, x + 1, h + 4.05, z, .62, .14); }
  }
  for (const x of [-42, 42]) {
    cylinder(scene, m.black, x, 4, 0, 3.7, 8); cylinder(scene, m.panel, x, 8.2, 0, 3.9, .5);
    for (let y = 1; y < 8; y += 1.5) cylinder(scene, m.steel, x, y, 0, 3.82, .1);
  }
  // Site relay towers with illuminated CanvasTexture signs and warm practical lights.
  const siteObjects = new Map();
  for (const site of SITES) {
    const group = new THREE.Group(); group.position.set(site.x, 0, site.z); scene.add(group);
    block(group, m.black, 0, .13, 0, 3.4, .26, 3.4); block(group, m.trim, 0, .3, 0, 3.05, .08, 3.05);
    for (const [x,z] of [[-1.25,-1.25],[1.25,-1.25],[-1.25,1.25],[1.25,1.25]]) cylinder(group,m.steel,x,.75,z,.09, .9);
    block(group,m.panel,0,1.05,0,1.45,1.45,1.25); block(group,m.copper,0,1.82,0,1.65,.14,1.45);
    for (const side of [-1,1]) block(group,m.black,side*.77,1.05,0,.1,1.48,1.4);
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');
    ctx.fillStyle='#182735';ctx.fillRect(0,0,256,256);ctx.strokeStyle='#bd8150';ctx.lineWidth=10;ctx.strokeRect(9,9,238,238);
    ctx.fillStyle='#d9d3bd';ctx.font='bold 40px sans-serif';ctx.textAlign='center';ctx.fillText('RELAY',128,82);
    ctx.fillStyle='#f3b566';ctx.font='bold 112px sans-serif';ctx.fillText(site.id,128,195);
    const signMat=new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(canvas),emissive:0x40301c,emissiveMap:new THREE.CanvasTexture(canvas),emissiveIntensity:.7,roughness:.4});
    const sign=mesh(new THREE.PlaneGeometry(1.25,1.13),signMat,group,0,1.12,.64);
    for(const side of [-1,1]) { const lamp=mesh(sphereGeo,m.glass,group,side*.72,2.05,0);lamp.scale.set(.12,.1,.12);const light=new THREE.PointLight(0xffa448,8,9,2);light.position.set(site.x+side*.8,2.1,site.z);scene.add(light); }
    // Mast and wire-loop antenna.
    cylinder(group,m.steel,0,2.35,0,.055,1.1);const ring=mesh(new THREE.TorusGeometry(.56,.035,7,24),m.copper,group,0,2.8,0);ring.rotation.x=Math.PI/2;
    block(group,m.black,0,.02,0,3.7,.08,3.7);siteObjects.set(site.id,{group,sign});
  }
  // Overhead gantry, hanging lamps and perimeter floodlight poles.
  for (const x of [-27,27]) {
    cylinder(scene,m.steel,x,6,18,.13,12);const arm=block(scene,m.steel,x/2,11.7,18,Math.abs(x),.18,.2);
    const lamp=mesh(boxGeo,m.glass,scene,x/2,11.52,18);lamp.scale.set(.55,.18,.5);const point=new THREE.PointLight(0xffba75,34,24,2);point.position.set(x/2,10.8,18);scene.add(point);
    for(const z of [-24,0,24]) { cylinder(scene,m.steel,x,5,z,.1,10);const fixture=mesh(boxGeo,m.glass,scene,x,9.7,z);fixture.scale.set(.55,.26,.6);const glow=new THREE.PointLight(0xffbd78,22,19,2);glow.position.set(x,9.2,z);scene.add(glow); }
  }
  // Cable lines run above the playable lanes.
  for(const z of [-15,15]) { const cable=mesh(new THREE.CylinderGeometry(.035,.035,28,6),m.black,scene,0,5,z);cable.rotation.z=Math.PI/2; }

  const teamMats = [m.cyan,m.red], darkCloth=mat(0x1e2a32), skin=mat(0xb58b6c), visorMats=[m.cyanGlow,m.redGlow];
  function makeHuman(e) {
    const root=new THREE.Group();scene.add(root);const team=teamMats[e.team], visor=visorMats[e.team], parts={root,legs:[],arms:[],team:e.team};
    const torso=mesh(boxGeo,darkCloth,root,0,1.03,0);torso.scale.set(.53,.66,.31);
    const vest=mesh(boxGeo,team,root,0,1.12,-.04);vest.scale.set(.56,.43,.34);
    for(const side of [-1,1]) { const shoulder=mesh(sphereGeo,team,root,side*.37,1.3,0);shoulder.scale.set(.2,.2,.22);
      const arm=mesh(boxGeo,darkCloth,root,side*.39,.98,-.01);arm.scale.set(.19,.51,.22);parts.arms.push(arm);
      const leg=mesh(boxGeo,team,root,side*.14,.48,0);leg.scale.set(.22,.58,.25);parts.legs.push(leg);
      const boot=mesh(boxGeo,m.black,root,side*.14,.17,-.05);boot.scale.set(.25,.16,.38);
    }
    const neck=mesh(cylGeo,skin,root,0,1.43,0);neck.scale.set(.13,.19,.13);
    const head=mesh(sphereGeo,skin,root,0,1.63,0);head.scale.set(.24,.28,.23);
    const helmet=mesh(sphereGeo,team,root,0,1.78,0);helmet.scale.set(.28,.17,.26);
    const face=mesh(boxGeo,visor,root,0,1.64,-.207);face.scale.set(.31,.105,.045);
    const headset=mesh(cylGeo,m.black,root,0,1.59,0);headset.rotation.z=Math.PI/2;headset.scale.set(.075,.53,.075);
    // Compact recognizable rifle with stock, receiver, barrel, optic and magazine.
    const gun=new THREE.Group();root.add(gun);gun.position.set(.27,1.05,-.28);gun.rotation.x=-.02;parts.gun=gun;
    block(gun,m.black,0,0,-.16,.13,.14,.48);block(gun,m.steel,0,.015,-.48,.055,.06,.48);
    block(gun,m.copper,0,.11,-.2,.11,.1,.32);block(gun,m.black,0,-.17,-.08,.12,.28,.11);
    block(gun,m.black,0,.115,-.15,.045,.12,.07);block(gun,m.trim,0,.18,-.16,.19,.025,.2);
    return parts;
  }
  const humans=new Map();
  // Detailed first-person receiver, optic rail, front sight and handguard.
  const weapon=new THREE.Group();camera.add(weapon);weapon.position.set(.34,-.28,-.7);
  block(weapon,m.black,0,0,-.31,.19,.18,.55);block(weapon,m.steel,0,.01,-.69,.065,.07,.42);
  block(weapon,m.trim,0,.105,-.29,.17,.035,.47);block(weapon,m.black,0,-.2,-.2,.13,.29,.13);
  block(weapon,m.black,-.09,-.02,-.07,.08,.17,.2);block(weapon,m.copper,0,.13,-.3,.13,.04,.08);
  block(weapon,m.black,0,.16,-.37,.09,.08,.12);block(weapon,m.cyan,0,.205,-.37,.048,.012,.06);
  const muzzleFlash=mesh(sphereGeo,m.glass,weapon,0,0,-.93);muzzleFlash.scale.set(.11,.11,.25);muzzleFlash.visible=false;

  const tracerPool=[];
  for(let i=0;i<80;i++){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(6),3));
    const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xffd28d,transparent:true,opacity:.9,depthWrite:false}));line.frustumCulled=false;line.visible=false;scene.add(line);tracerPool.push(line);}
  const smokePool=[];
  for(let i=0;i<12;i++){const cloud=mesh(sphereGeo,new THREE.MeshStandardMaterial({color:0x9aa6a7,transparent:true,opacity:.2,roughness:1,depthWrite:false}),scene);cloud.visible=false;smokePool.push(cloud);}
  const relayBeacon=new THREE.Group();scene.add(relayBeacon);const relayBase=mesh(cylGeo,m.black,relayBeacon,0,.22,0);relayBase.scale.set(.38,.44,.38);
  const relayCore=mesh(sphereGeo,m.redGlow,relayBeacon,0,.62,0);relayCore.scale.set(.23,.31,.23);
  const relayRing=mesh(new THREE.TorusGeometry(.43,.035,8,28),m.copper,relayBeacon,0,.63,0);relayRing.rotation.x=Math.PI/2;
  const relayLight=new THREE.PointLight(0xff4f34,0,10,2);relayBeacon.add(relayLight);relayBeacon.visible=false;

  let previousShots=0, shotFlash=0, clock=0;
  function resize() { const w=container.clientWidth||window.innerWidth,h=container.clientHeight||window.innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix(); }
  const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;observer?.observe(container);window.addEventListener('resize',resize);resize();
  function render(state,dt=16) {
    clock+=dt/1000;const player=state.entities?.find(e=>e.type==='player')||state.entities?.[0];
    for(const e of state.entities||[]){let parts=humans.get(e.id);if(!parts){parts=makeHuman(e);humans.set(e.id,parts);}
      const moving=Math.hypot(e.vx||0,e.vz||0),phase=clock*9+(e.id.length*1.3),swing=Math.sin(phase)*Math.min(1,moving/2.5)*.55;
      parts.root.position.set(e.x,e.dead?0:(e.crouch ? .02 : 0),e.z);parts.root.rotation.set(e.dead?Math.PI/2:0,e.yaw||0,e.dead?Math.PI/2:0);
      parts.root.visible=e.type!=='player';parts.legs[0].rotation.x=swing;parts.legs[1].rotation.x=-swing;parts.arms[0].rotation.x=-.18-swing*.18;parts.arms[1].rotation.x=-.22+swing*.18;
      parts.root.scale.y=e.crouch&&!e.dead ? .76 : 1;if(e.dead){parts.root.rotation.z=Math.PI/2;parts.root.position.y=.28;parts.legs.forEach(l=>l.rotation.x=0);}
    }
    if(player){const speed=Math.hypot(player.vx||0,player.vz||0),bob=Math.sin(clock*10)*Math.min(.025,speed*.005);
      camera.position.set(player.x,player.crouch?1.12:1.65,player.z);camera.rotation.set(player.pitch||0,player.yaw||0,0,'YXZ');
      camera.position.y+=speed>.2?bob:0;const ads=!!player.aim;camera.fov=ads?59:74;camera.updateProjectionMatrix();
      weapon.visible=!player.dead;weapon.position.x=.34+(player.crouch?-.025:0);weapon.position.y=-.28+(player.crouch?-.03:0);
      if(state.tracers?.length>previousShots){shotFlash=.07;weapon.position.z=-.64;}previousShots=state.tracers?.length||0;
      if(player.reload>0){const progress=1-Math.min(1,player.reload/2400);weapon.position.y=-.28-Math.sin(progress*Math.PI)*.23;weapon.rotation.x=Math.sin(progress*Math.PI)*.32;}
    }
    shotFlash=Math.max(0,shotFlash-dt/1000);muzzleFlash.visible=shotFlash>0;
    weapon.position.z+=( -.7-weapon.position.z)*Math.min(1,dt*.018);weapon.rotation.x*=Math.max(0,1-dt*.012);
    for(let i=0;i<tracerPool.length;i++){const line=tracerPool[i],t=state.tracers?.[i];line.visible=!!t;if(t){const a=line.geometry.attributes.position.array;a[0]=t.from.x;a[1]=t.from.y;a[2]=t.from.z;a[3]=t.to.x;a[4]=t.to.y;a[5]=t.to.z;line.geometry.attributes.position.needsUpdate=true;line.material.color.setHex(t.team===0?C.cyan:C.red);line.material.opacity=Math.min(1,t.life/100);}}
    let smokeIndex=0;for(const g of state.grenades||[])if(g.kind==='smoke'&&g.fuse<0&&smokeIndex<smokePool.length){const cloud=smokePool[smokeIndex++];cloud.visible=true;cloud.position.set(g.x,g.y+1.1,g.z);const scale=1.2+Math.sin(clock*1.6)*.1;cloud.scale.set(scale*1.8,scale,scale*1.8);cloud.material.opacity=.19;}
    while(smokeIndex<smokePool.length)smokePool[smokeIndex++].visible=false;
    const planted=state.relay?.status==='PLANTED';relayBeacon.visible=!!planted;
    if(planted&&state.relay.site){relayBeacon.position.set(state.relay.site.x,0,state.relay.site.z);relayRing.rotation.y=clock*2.7;relayLight.intensity=9+Math.sin(clock*8)*5;}
    renderer.render(scene,camera);
  }
  return { render, camera, renderer };
}
