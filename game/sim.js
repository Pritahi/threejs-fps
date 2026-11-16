// game/sim.js - COPPERLINE // Relay Siege Simulation
export const MAP_SIZE = 60;
export const SITES = [{ x: -20, z: -20, id: 'A' }, { x: 20, z: -20, id: 'B' }];
export const BOXES = [
    { x: 0, y: 2, z: -30, w: 60, h: 4, d: 2 }, // Perimeter
    { x: 0, y: 2, z: 30, w: 60, h: 4, d: 2 },
    { x: 30, y: 2, z: 0, w: 2, h: 4, d: 60 },
    { x: -30, y: 2, z: 0, w: 2, h: 4, d: 60 },
    { x: -10, y: 1.5, z: 0, w: 2, h: 3, d: 20 }, // Mid wall
    { x: 10, y: 1.5, z: 0, w: 2, h: 3, d: 20 },
    { x: -20, y: 1, z: -10, w: 8, h: 2, d: 8 }, // Site A cover
    { x: 20, y: 1, z: -10, w: 8, h: 2, d: 8 },  // Site B cover
];

export const WEAPONS = {
    pistol: { price: 0, dmg: 25, spread: 0.02, recoil: 0.1, rate: 250, mag: 12, reserve: 36, reload: 1500 },
    rifle: { price: 2900, dmg: 34, spread: 0.01, recoil: 0.25, rate: 100, mag: 30, reserve: 90, reload: 2500 },
    sniper: { price: 4500, dmg: 110, spread: 0.001, recoil: 1.0, rate: 1200, mag: 5, reserve: 15, reload: 3500 }
};

export const State = {
    phase: 'BUY', // BUY, LIVE, END
    timer: 15000,
    round: 1,
    score: [0, 0], // Teal, Red
    entities: [],
    projectiles: [],
    grenades: [],
    events: [],
    relay: { status: 'IDLE', site: null, progress: 0, fuse: 35000 },
    rng: 12345
};

function seedRNG() { 
    State.rng = (State.rng * 16807) % 2147483647; 
    return (State.rng - 1) / 2147483646; 
}

export function startMatch() {
    State.score = [0, 0];
    State.round = 1;
    startRound();
}

function startRound() {
    State.phase = 'BUY';
    State.timer = 15000;
    State.relay = { status: 'IDLE', site: null, progress: 0, fuse: 35000 };
    State.entities = [
        createEntity('player', 0, 0, 25),
        createEntity('bot', 0, 10, 25), createEntity('bot', 0, -10, 25),
        createEntity('bot', 1, 15, -25), createEntity('bot', 1, -15, -25), createEntity('bot', 1, 0, -25)
    ];
}

function createEntity(type, team, x, z) {
    return {
        type, team, hp: 100, x, y: 1.6, z, vx: 0, vy: 0, vz: 0,
        yaw: 0, pitch: 0, crouch: false, sprint: false,
        weapon: 'pistol', mag: 12, reserve: 36, reload: 0, fireDelay: 0,
        armor: false, money: 800, dead: false,
        ai: { state: 'IDLE', target: null, path: [], lastSeen: 0 }
    };
}

export function step(dt, inputs) {
    if (State.timer > 0) State.timer -= dt;
    else if (State.phase === 'BUY') { State.phase = 'LIVE'; State.timer = 90000; }
    else if (State.phase === 'LIVE') endRound(1); // Counter-terrorists win if timer runs out

    State.entities.forEach((e, i) => {
        if (e.dead) return;
        const input = (i === 0) ? inputs : getAIInput(e, dt);
        updatePhysics(e, input, dt);
        updateCombat(e, input, dt);
    });

    updateRelay(dt);
}

function updatePhysics(e, input, dt) {
    const speed = e.crouch ? 2 : (e.sprint ? 7 : 5);
    const acc = 20;
    const targetVx = (input.moveX || 0) * speed;
    const targetVz = (input.moveZ || 0) * speed;
    
    e.vx += (targetVx - e.vx) * (acc * dt / 1000);
    e.vz += (targetVz - e.vz) * (acc * dt / 1000);

    const nx = e.x + e.vx * (dt / 1000);
    const nz = e.z + e.vz * (dt / 1000);

    if (!checkCollision(nx, e.z)) e.x = nx; else e.vx = 0;
    if (!checkCollision(e.x, nz)) e.z = nz; else e.vz = 0;
}

function checkCollision(x, z) {
    return BOXES.some(b => 
        x > b.x - b.w/2 - 0.5 && x < b.x + b.w/2 + 0.5 &&
        z > b.z - b.d/2 - 0.5 && z < b.z + b.d/2 + 0.5
    );
}

function updateCombat(e, input, dt) {
    if (e.reload > 0) e.reload -= dt;
    if (e.fireDelay > 0) e.fireDelay -= dt;

    if (input.fire && e.fireDelay <= 0 && e.reload <= 0 && e.mag > 0) {
        fire(e, input.yaw, input.pitch);
    }
}

export function fire(e, yaw, pitch) {
    const w = WEAPONS[e.weapon];
    e.mag--;
    e.fireDelay = w.rate;
    const spread = w.spread + (Math.abs(e.vx) + Math.abs(e.vz)) * 0.02;
    const dy = (yaw || 0) + (seedRNG() - 0.5) * spread;
    
    let hit = null;
    let minDist = 100;
    State.entities.forEach(target => {
        if (target === e || target.dead) return;
        const dist = Math.sqrt((target.x - e.x)**2 + (target.z - e.z)**2);
        if (dist < minDist) {
            hit = target;
            minDist = dist;
        }
    });

    if (hit) {
        const isHead = seedRNG() > 0.8;
        const dmg = isHead ? w.dmg * 3 : w.dmg;
        hit.hp -= dmg;
        if (hit.hp <= 0) { hit.dead = true; e.money += 300; }
        State.events.push({ type: 'hit', x: hit.x, z: hit.z, head: isHead });
    }
}

function getAIInput(e, dt) {
    return { moveX: 0, moveZ: 0, fire: false, yaw: 0, pitch: 0 };
}

function updateRelay(dt) {
    if (State.relay.status === 'PLANTED') {
        State.relay.fuse -= dt;
        if (State.relay.fuse <= 0) endRound(0);
    }
}

function endRound(winner) {
    State.score[winner]++;
    State.phase = 'END';
    State.timer = 5000;
}

export function buy(e, item) {
    if (State.phase !== 'BUY') return;
    const w = WEAPONS[item];
    if (w && e.money >= w.price) {
        e.money -= w.price;
        e.weapon = item;
        e.mag = w.mag;
        e.reserve = w.reserve;
    }
}

startRound();
