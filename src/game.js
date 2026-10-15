import { createAudio } from './audio.js';

export const VW = 960;
export const VH = 540;
export const GROUND = 448;
export const STAND_H = 78;
export const CROUCH_H = 44;

const PW = 36;
const ATTACK_TIME = 0.28;
const BEST_KEY = 'alien-march-best-v1';

export const SWORDS = [
  { level: 1, name: '녹슨 검', dmg: 16, range: 86, need: 0, color: '#d9d3c7', glow: '#fff6e4' },
  { level: 2, name: '강철 검', dmg: 27, range: 102, need: 3, color: '#e7eef8', glow: '#f7fbff' },
  { level: 3, name: '달빛 검', dmg: 40, range: 118, need: 8, color: '#ffe08a', glow: '#fff4c4' },
  { level: 4, name: '플라스마 검', dmg: 56, range: 136, need: 16, color: '#8cf4ff', glow: '#e5fdff' },
  { level: 5, name: '외계핵 검', dmg: 76, range: 156, need: 28, color: '#ff8fe0', glow: '#ffd6f4' },
];

const TYPES = {
  grunt: { hp: 16, w: 44, h: 72, xp: 1, touch: 10, label: '일반 병' },
  shield: { hp: 44, w: 50, h: 80, xp: 2, touch: 14, label: '방패병' },
  gunner: { hp: 30, w: 46, h: 76, xp: 2, touch: 12, label: '총병' },
  ufo: { hp: 52, w: 86, h: 40, xp: 4, touch: 18, label: 'UFO' },
};

const INTRO = ['grunt', 'grunt', 'shield', 'grunt', 'gunner', 'shield', 'ufo'];

const CAUSES = {
  grunt: '일반 병의 창에 쓰러졌다.',
  shield: '방패병에게 밀려 쓰러졌다.',
  gunner: '총병과 부닺혀 쓰러졌다.',
  bullet: '총탄을 피하지 못했다.',
  ufo: 'UFO와 충돌했다.',
  reflect: 'UFO가 검의 피해를 되돌렸다.',
};

const HINTS = {
  shield: '방패병은 서서 치면 막힌다. 웅크리거나 점프해 베라.',
  gunner: '낮은 탄은 점프, 높은 탄은 웅크리기.',
  ufo: 'UFO를 베면 피해가 그대로 돌아온다.',
};

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function loadBest() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(BEST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function fillRound(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.fill();
}

export function createGame(canvas) {
  const ctx = canvas.getContext('2d');
  const audio = createAudio();
  const reduceMotion = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const maxHp = 100;
  const held = new Set();
  const pressed = new Set();
  const released = new Set();

  const stars = Array.from({ length: 70 }, () => ({
    x: Math.random() * VW,
    y: Math.random() * 280,
    z: Math.random(),
    r: Math.random() < 0.8 ? 1.2 : 2,
    warm: Math.random() < 0.25,
  }));

  const ruins = Array.from({ length: 16 }, (_, i) => ({
    x: i * 160 + (i % 3) * 18,
    w: 26 + (i % 4) * 14,
    h: 46 + (i % 5) * 26,
    kind: i % 3,
  }));

  const player = {
    x: 220,
    y: GROUND - STAND_H,
    w: PW,
    h: STAND_H,
    vy: 0,
    grounded: true,
    crouch: false,
    hp: maxHp,
    attackT: 0,
    attackCd: 0,
    dashT: 0,
    dashCd: 0,
    dashDir: 1,
    invuln: 0,
    squash: 0,
  };

  let mode = 'title';
  let paused = false;
  let distance = 0;
  let kills = 0;
  let xp = 0;
  let swordLevel = 1;
  let combo = 0;
  let comboT = 0;
  let introI = 0;
  let spawnCd = 2;
  let cause = '';
  let hitStop = 0;
  let shake = 0;
  let hurtFlash = 0;
  let hint = '';
  let hintT = 0;
  let banner = '';
  let bannerSub = '';
  let bannerT = 0;
  let controlsT = 0;
  let animTime = 0;
  let titleScroll = 0;
  let nextId = 1;
  let jumpBuffer = 0;
  let dashBuffer = 0;
  let attackBuffer = 0;
  let dustT = 0;
  let freezeMarch = false;
  let attackHit = new Set();
  let best = loadBest();
  let crash = null;

  let enemies = [];
  let bullets = [];
  let pickups = [];
  let particles = [];
  let floats = [];
  let ghosts = [];

  const seen = { shield: false, gunner: false, ufo: false };

  function currentSword() {
    return SWORDS[Math.max(0, Math.min(SWORDS.length - 1, swordLevel - 1))];
  }

  function metersOf(value) {
    return Math.floor(value / 16);
  }

  function setHint(text, life) {
    hint = text;
    hintT = life;
  }

  function floatText(x, y, text, color) {
    floats.push({ x, y, text, color, life: 0.75, vy: -46 });
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const power = speed * (0.35 + Math.random() * 0.7);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * power,
        vy: Math.sin(angle) * power - 30,
        life: 0.28 + Math.random() * 0.32,
        color,
        size: 2 + Math.random() * 2.4,
        g: 480,
      });
    }
    if (particles.length > 260) particles.splice(0, particles.length - 260);
  }

  function resetPlayer() {
    player.x = 220;
    player.y = GROUND - STAND_H;
    player.w = PW;
    player.h = STAND_H;
    player.vy = 0;
    player.grounded = true;
    player.crouch = false;
    player.hp = maxHp;
    player.attackT = 0;
    player.attackCd = 0;
    player.dashT = 0;
    player.dashCd = 0;
    player.dashDir = 1;
    player.invuln = 0;
    player.squash = 0;
    player.coyote = 0.1;
  }

  function saveBest() {
    const meters = metersOf(distance);
    if (!best || meters > best.meters || (meters === best.meters && kills > best.kills)) {
      best = { meters, kills, sword: currentSword().name };
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(BEST_KEY, JSON.stringify(best));
        }
      } catch {
        // ignore private mode
      }
    }
  }

  function die(tag) {
    if (mode !== 'play') return;
    mode = 'dead';
    paused = false;
    cause = tag;
    player.hp = 0;
    shake = Math.max(shake, 14);
    audio.die();
    saveBest();
  }

  function hurt(amount, tag, options = {}) {
    if (mode !== 'play') return false;
    if (!options.ignoreInvuln && (player.invuln > 0 || player.dashT > 0)) return false;
    player.hp -= amount;
    player.invuln = Math.max(player.invuln, options.ignoreInvuln ? 0.32 : 0.78);
    hurtFlash = 0.28;
    shake = Math.max(shake, options.shake ?? 7);
    player.x = Math.max(56, player.x - 16);
    floatText(
      player.x,
      player.y,
      options.ignoreInvuln ? `반사 ${amount}` : `-${amount}`,
      options.ignoreInvuln ? '#ff9adf' : '#ffd0d0',
    );
    if (options.ignoreInvuln) audio.reflect();
    else audio.hurt();
    if (player.hp <= 0) die(tag);
    return true;
  }

  function grantXp(amount) {
    xp += amount;
    while (swordLevel < SWORDS.length && xp >= SWORDS[swordLevel].need) {
      swordLevel += 1;
      const before = player.hp;
      player.hp = Math.min(maxHp, player.hp + 20);
      const gained = Math.round(player.hp - before);
      banner = currentSword().name;
      bannerSub = '검이 강화되었다';
      bannerT = 1.8;
      audio.level();
      burst(player.x + 30, player.y + 20, currentSword().glow, 22, 180);
      if (gained > 0) floatText(player.x, player.y - 16, `+${gained}`, '#9dff7a');
    }
  }

  function reap() {
    const alive = [];
    for (const enemy of enemies) {
      if (enemy.hp <= 0) onKill(enemy);
      else if (enemy.x >= -180 && enemy.x <= 1400) alive.push(enemy);
    }
    enemies = alive;
  }

  function onKill(enemy) {
    kills += 1;
    grantXp(enemy.xp);
    burst(
      enemy.x + enemy.w / 2,
      enemy.y + enemy.h / 2,
      enemy.type === 'ufo' ? '#e4c6ff' : '#b6ff7a',
      14,
      150,
    );
    floatText(enemy.x, enemy.y - 8, `+${enemy.xp} XP`, '#fff1a8');
    audio.hit();
    shake = Math.max(shake, 3);
    const drop = enemy.type === 'gunner' ? 0.4 : enemy.type === 'ufo' ? 0 : 0.22;
    if (Math.random() < drop) {
      pickups.push({
        x: enemy.x + enemy.w / 2,
        y: enemy.y + 16,
        r: 9,
        heal: 16,
        life: 7,
      });
    }
  }

  function announce(type) {
    if (!HINTS[type] || seen[type]) return;
    seen[type] = true;
    setHint(HINTS[type], 4.4);
  }

  function spawnEnemy(type, x, extra = {}) {
    const spec = TYPES[type];
    const scale = 1 + distance / 4600 + Math.max(0, kills - 2) * 0.028;
    const shieldPoints = type === 'shield' ? 2 + Math.floor(distance / 3200) : 0;
    const enemy = {
      id: nextId,
      type,
      x: x ?? 1000,
      y: type === 'ufo' ? 236 + Math.random() * 46 : GROUND - spec.h,
      w: spec.w,
      h: spec.h,
      hp: Math.round(spec.hp * scale),
      maxHp: Math.round(spec.hp * scale),
      shield: shieldPoints,
      shieldMax: shieldPoints,
      xp: spec.xp,
      touch: spec.touch + Math.floor(distance / 2600),
      touchCd: 0.35,
      phase: Math.random() * Math.PI * 2,
      baseY: 0,
      shootCd: 0.75 + Math.random() * 0.35,
      telegraph: 0,
      aimHigh: false,
      nextHigh: false,
      burst: 1,
      swoopT: 0,
      swoopCd: 1.3 + Math.random(),
      frozen: false,
      label: spec.label,
    };
    nextId += 1;
    Object.assign(enemy, extra);
    if (extra.y == null && type !== 'ufo') enemy.y = GROUND - enemy.h;
    enemy.baseY = enemy.baseY || enemy.y;
    enemy.maxHp = Math.max(enemy.hp, enemy.maxHp || 0);
    enemies.push(enemy);
    announce(type);
    return enemy;
  }

  function rollType() {
    const pool = [{ t: 'grunt', w: 4 }];
    if (distance > 500 || kills >= 2) pool.push({ t: 'shield', w: 3 });
    if (distance > 1100 || kills >= 4) pool.push({ t: 'gunner', w: 3 });
    if (distance > 1700 || kills >= 6) pool.push({ t: 'ufo', w: 2 });
    if (distance > 4200) pool.push({ t: 'shield', w: 2 }, { t: 'gunner', w: 2 }, { t: 'ufo', w: 2 });
    let sum = 0;
    for (const item of pool) sum += item.w;
    let roll = Math.random() * sum;
    for (const item of pool) {
      roll -= item.w;
      if (roll <= 0) return item.t;
    }
    return 'grunt';
  }

  function updateSpawn(dt) {
    spawnCd -= dt;
    if (spawnCd > 0 || mode !== 'play') return;
    const cap = distance > 5200 ? 6 : 5;
    if (enemies.length >= cap || enemies.some((enemy) => enemy.x > 860)) {
      spawnCd = 0.28;
      return;
    }
    let type = 'grunt';
    let x = 990 + Math.random() * 70;
    if (introI < INTRO.length) {
      type = INTRO[introI];
      introI += 1;
      x = introI < 4 ? 840 : 980;
    } else {
      type = rollType();
    }
    spawnEnemy(type, x);
    spawnCd = Math.max(0.52, 1.62 - distance / 7600);
    if (distance > 4600 && Math.random() < 0.28 && enemies.length < cap - 1) {
      spawnEnemy(Math.random() < 0.5 ? 'grunt' : rollType(), 1140);
    }
  }

  function fireBullet(enemy) {
    const high = enemy.aimHigh;
    bullets.push({
      x: enemy.x - 8,
      y: high ? GROUND - 78 : GROUND - 26,
      w: 20,
      h: 12,
      vx: -(330 + Math.min(150, distance / 42)),
      damage: 11 + Math.floor(distance / 1900),
      high,
    });
    audio.shoot();
  }

  function updateGunner(enemy, dt) {
    const desired = player.x + 72;
    const delta = desired - enemy.x;
    const maxStep = 240 * dt;
    if (Math.abs(delta) > 6) {
      enemy.x += Math.sign(delta) * Math.min(Math.abs(delta), maxStep);
    }
    if (enemy.telegraph > 0) {
      enemy.telegraph -= dt;
      if (enemy.telegraph <= 0) {
        fireBullet(enemy);
        if (enemy.burst > 1) {
          enemy.burst -= 1;
          enemy.aimHigh = !enemy.aimHigh;
          enemy.telegraph = 0.26;
        }
      }
      return;
    }
    enemy.shootCd -= dt;
    if (enemy.shootCd <= 0 && enemy.x < player.x + 620 && enemy.x > player.x + 30) {
      enemy.aimHigh = enemy.nextHigh;
      enemy.nextHigh = !enemy.nextHigh;
      enemy.telegraph = 0.52;
      enemy.shootCd = Math.max(0.86, 1.42 - distance / 9000);
      enemy.burst = distance > 4800 && Math.random() < 0.4 ? 2 : 1;
    }
  }

  function updateUfo(enemy, dt) {
    enemy.phase += dt;
    const cruise = enemy.baseY + Math.sin(enemy.phase * 2.1) * 26;
    if (enemy.swoopT > 0) {
      enemy.swoopT -= dt;
      const target = player.y + 20;
      enemy.y += (target - enemy.y) * Math.min(1, dt * 3.4);
    } else {
      enemy.y += (cruise - enemy.y) * Math.min(1, dt * 2);
      enemy.swoopCd -= dt;
      if (enemy.swoopCd <= 0 && enemy.x < player.x + 540 && enemy.x > player.x - 10) {
        enemy.swoopT = 0.7;
        enemy.swoopCd = Math.max(1.2, 2.55 - distance / 6400);
      }
    }
    enemy.x -= (30 + Math.sin(enemy.phase * 1.3) * 18) * dt * (1 + distance / 10000);
    enemy.y = Math.max(150, Math.min(GROUND - enemy.h - 6, enemy.y));
  }

  function updateEnemy(enemy, dt) {
    enemy.touchCd = Math.max(0, enemy.touchCd - dt);
    if (enemy.frozen) return;
    if (enemy.type === 'grunt') enemy.x -= Math.min(84, 30 + distance / 110) * dt;
    else if (enemy.type === 'shield') {
      const speed = enemy.shield > 0 ? 16 : 54;
      enemy.x -= Math.min(110, speed + distance / 130) * dt;
    } else if (enemy.type === 'gunner') updateGunner(enemy, dt);
    else if (enemy.type === 'ufo') updateUfo(enemy, dt);
  }

  function playerRect() {
    return { x: player.x, y: player.y, w: player.w, h: player.h };
  }

  function enemyRect(enemy) {
    if (enemy.type === 'ufo') {
      return { x: enemy.x + 6, y: enemy.y + 2, w: enemy.w - 12, h: enemy.h - 4 };
    }
    return { x: enemy.x + 4, y: enemy.y + 2, w: enemy.w - 6, h: enemy.h - 2 };
  }

  function attackRect() {
    const range = currentSword().range;
    if (!player.grounded) {
      return { x: player.x + 4, y: player.y + 8, w: range, h: player.h + 46 };
    }
    if (player.crouch) {
      return { x: player.x + 2, y: player.y + 6, w: range, h: 32 };
    }
    return { x: player.x + 6, y: player.y + 12, w: range, h: 56 };
  }

  function holdTheLine() {
    if (!player.grounded || player.dashT > 0) return;
    const front = player.x + player.w - 6;
    for (const enemy of enemies) {
      if (enemy.frozen || enemy.type === 'ufo') continue;
      const rect = enemyRect(enemy);
      if (rect.x >= front) continue;
      const reach = { x: player.x - 6, y: player.y, w: player.w + 20, h: player.h };
      if (!overlap(reach, rect)) continue;
      enemy.x += front - rect.x;
    }
  }

  function shieldBlocks(enemy) {
    return enemy.type === 'shield' && enemy.shield > 0 && player.grounded && !player.crouch;
  }

  function swordDamage() {
    const bonus = 1 + Math.min(combo, 8) * 0.07;
    return Math.max(1, Math.round(currentSword().dmg * bonus));
  }

  function resolveAttack() {
    if (player.attackT <= 0) return;
    const age = ATTACK_TIME - player.attackT;
    if (age < 0.04 || age > 0.2) return;
    const box = attackRect();
    let connected = false;
    let blocked = false;
    for (const enemy of enemies) {
      if (mode !== 'play') break;
      if (enemy.x + enemy.w < player.x - 8) continue;
      if (!overlap(box, enemyRect(enemy))) continue;
      if (attackHit.has(enemy.id)) continue;
      attackHit.add(enemy.id);
      if (shieldBlocks(enemy)) {
        enemy.shield -= 1;
        blocked = true;
        audio.block();
        burst(enemy.x, enemy.y + 30, '#9fd8ff', 8, 120);
        floatText(enemy.x, enemy.y, enemy.shield <= 0 ? '방패 파괴' : '막힘', '#b7e6ff');
        player.x = Math.max(56, player.x - 8);
      } else {
        const dealt = swordDamage();
        enemy.hp -= dealt;
        connected = true;
        combo += 1;
        comboT = 1.7;
        floatText(enemy.x + 8, enemy.y, `${dealt}`, '#fff4c2');
        burst(enemy.x + 10, enemy.y + 20, currentSword().glow, 6, 90);
        if (enemy.type === 'ufo') {
          // 반사 피해는 무적과 대시를 무시한다.
          hurt(dealt, 'reflect', { ignoreInvuln: true, shake: 9 });
        }
      }
    }
    if (connected) {
      hitStop = 0.04;
      shake = Math.max(shake, 4);
      audio.hit();
    } else if (blocked) {
      hitStop = 0.02;
      shake = Math.max(shake, 2);
    }
  }

  function scrollWorld(amount) {
    if (!amount) return;
    for (const enemy of enemies) enemy.x -= amount;
    for (const bullet of bullets) bullet.x -= amount;
    for (const pickup of pickups) pickup.x -= amount;
    for (const particle of particles) particle.x -= amount;
    for (const item of floats) item.x -= amount;
  }

  function currentMarch() {
    if (freezeMarch) return 0;
    let march = 148 + Math.min(120, distance * 0.1);
    const forward = held.has('d');
    const back = held.has('a');
    if (forward && !back) march += 110;
    else if (back && !forward) march = Math.max(32, march - 125);
    return march;
  }

  function updateFx(dt) {
    for (const particle of particles) {
      particle.life -= dt;
      particle.vy += particle.g * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
    particles = particles.filter((particle) => particle.life > 0);

    for (const item of floats) {
      item.life -= dt;
      item.y += item.vy * dt;
    }
    floats = floats.filter((item) => item.life > 0);

    for (const ghost of ghosts) ghost.life -= dt;
    ghosts = ghosts.filter((ghost) => ghost.life > 0);

    shake *= 0.86;
    if (shake < 0.25) shake = 0;
    hurtFlash = Math.max(0, hurtFlash - dt);
    hintT = Math.max(0, hintT - dt);
    bannerT = Math.max(0, bannerT - dt);
    controlsT = Math.max(0, controlsT - dt);
    if (comboT > 0) {
      comboT -= dt;
      if (comboT <= 0) combo = 0;
    }
    player.squash = Math.max(0, player.squash - dt * 2.4);
  }

  function clearEdges() {
    pressed.clear();
    released.clear();
  }

  function readBuffers() {
    if (mode !== 'play' || paused) return;
    if (pressed.has('w')) jumpBuffer = 0.12;
    if (pressed.has('q')) dashBuffer = 0.12;
    if (pressed.has('attack') || held.has('attack')) attackBuffer = Math.max(attackBuffer, 0.1);
    if (released.has('w') && player.vy < 0) player.vy *= 0.48;
  }

  function simulate(dt) {
    jumpBuffer = Math.max(0, jumpBuffer - dt);
    dashBuffer = Math.max(0, dashBuffer - dt);
    attackBuffer = Math.max(0, attackBuffer - dt);

    const forward = held.has('d');
    const back = held.has('a');

    if (dashBuffer > 0 && player.dashCd <= 0 && player.dashT <= 0) {
      player.dashT = 0.16;
      player.dashCd = 0.88;
      player.dashDir = back && !forward ? -1 : 1;
      dashBuffer = 0;
      player.invuln = Math.max(player.invuln, 0.18);
      player.attackT = 0;
      audio.dash();
    }

    if (jumpBuffer > 0 && (player.grounded || player.coyote > 0)) {
      player.vy = -760;
      player.grounded = false;
      player.crouch = false;
      player.h = STAND_H;
      jumpBuffer = 0;
      player.coyote = 0;
      audio.jump();
    }

    if (player.grounded && player.dashT <= 0) {
      const wantCrouch = held.has('s') && jumpBuffer <= 0;
      if (wantCrouch !== player.crouch) {
        player.crouch = wantCrouch;
        player.h = wantCrouch ? CROUCH_H : STAND_H;
        player.y = GROUND - player.h;
      }
    }

    if (player.dashT > 0) {
      player.x += player.dashDir * 840 * dt;
      if (!player.grounded) player.vy = Math.min(player.vy, 40);
      ghosts.push({
        x: player.x,
        y: player.y,
        w: player.w,
        h: player.h,
        life: 0.16,
      });
    } else if (forward && !back) player.x += 175 * dt;
    else if (back && !forward) player.x -= 215 * dt;

    if (!player.grounded) {
      player.vy += 2300 * dt;
      if (held.has('s')) player.vy += 1400 * dt;
      if (player.vy > 1200) player.vy = 1200;
      player.y += player.vy * dt;
      if (player.y >= GROUND - STAND_H) {
        player.grounded = true;
        player.vy = 0;
        player.squash = 0.16;
        player.crouch = held.has('s');
        player.h = player.crouch ? CROUCH_H : STAND_H;
        player.y = GROUND - player.h;
      }
    } else {
      player.coyote = 0.1;
      player.y = GROUND - player.h;
    }
    if (!player.grounded) player.coyote = Math.max(0, (player.coyote || 0) - dt);

    player.x = Math.max(56, Math.min(520, player.x));

    player.attackCd = Math.max(0, player.attackCd - dt);
    player.dashCd = Math.max(0, player.dashCd - dt);
    player.dashT = Math.max(0, player.dashT - dt);
    player.invuln = Math.max(0, player.invuln - dt);

    let startedAttack = false;
    if (attackBuffer > 0 && player.attackCd <= 0 && player.attackT <= 0 && player.dashT <= 0) {
      player.attackT = ATTACK_TIME;
      player.attackCd = 0.42;
      attackHit = new Set();
      attackBuffer = 0;
      startedAttack = true;
      if (player.grounded) player.x = Math.min(520, player.x + 10);
      audio.swing();
    }
    if (!startedAttack && player.attackT > 0) player.attackT = Math.max(0, player.attackT - dt);

    const march = currentMarch();
    distance += march * dt;
    scrollWorld(march * dt);

    for (const enemy of enemies) updateEnemy(enemy, dt);
    for (const bullet of bullets) bullet.x += bullet.vx * dt;
    holdTheLine();
    resolveAttack();
    reap();

    if (mode === 'play') {
      for (const enemy of enemies) {
        if (enemy.touchCd <= 0 && overlap(playerRect(), enemyRect(enemy))) {
          if (hurt(enemy.touch, enemy.type)) enemy.touchCd = 0.72;
        }
      }
    }

    if (mode === 'play') {
      for (const bullet of bullets) {
        if (overlap(playerRect(), bullet)) {
          bullet.x = -999;
          hurt(bullet.damage, 'bullet');
        }
      }
    }
    bullets = bullets.filter((bullet) => bullet.x > -80 && bullet.x < 1300);

    for (const pickup of pickups) {
      pickup.life -= dt;
      const dx = player.x + player.w / 2 - pickup.x;
      const dy = player.y + player.h / 2 - pickup.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 120 && dist > 1) {
        pickup.x += (dx / dist) * 140 * dt;
        pickup.y += (dy / dist) * 140 * dt;
      }
      if (dist < player.w && mode === 'play') {
        const before = player.hp;
        player.hp = Math.min(maxHp, player.hp + pickup.heal);
        const gained = Math.round(player.hp - before);
        if (gained > 0) {
          floatText(player.x, player.y - 10, `+${gained}`, '#9dff7a');
          audio.pickup();
        }
        pickup.life = 0;
      }
    }
    pickups = pickups.filter((pickup) => pickup.life > 0 && pickup.x > -40);
    reap();

    if (!freezeMarch) updateSpawn(dt);

    dustT -= dt;
    if (dustT <= 0 && player.grounded && player.dashT <= 0) {
      dustT = 0.08;
      particles.push({
        x: player.x + 6,
        y: GROUND - 2,
        vx: -50 - Math.random() * 40,
        vy: -16 - Math.random() * 24,
        life: 0.28,
        color: 'rgba(190, 176, 150, 0.55)',
        size: 2,
        g: 0,
      });
    }

    updateFx(dt);
  }

  function step(dt) {
    animTime += dt;
    readBuffers();
    if (mode === 'title') {
      titleScroll += dt * 48;
      updateFx(dt);
      clearEdges();
      return;
    }
    if (mode !== 'play' || paused) {
      updateFx(dt);
      clearEdges();
      return;
    }
    if (hitStop > 0) {
      hitStop -= dt;
      updateFx(dt);
      clearEdges();
      return;
    }
    simulate(dt);
    clearEdges();
  }

  let acc = 0;
  let last = 0;
  function frame(now) {
    if (crash) return;
    try {
      if (!last) last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += dt;
      let guard = 0;
      while (acc >= 1 / 60 && guard < 5) {
        step(1 / 60);
        acc -= 1 / 60;
        guard += 1;
      }
    } catch (error) {
      crash = error;
      console.error(error);
    }
  }

  function start() {
    mode = 'play';
    paused = false;
    last = 0;
    acc = 0;
    distance = 0;
    kills = 0;
    xp = 0;
    swordLevel = 1;
    combo = 0;
    comboT = 0;
    introI = 0;
    spawnCd = 0.9;
    cause = '';
    hitStop = 0;
    shake = 0;
    hurtFlash = 0;
    banner = '';
    bannerSub = '';
    bannerT = 0;
    controlsT = 7;
    jumpBuffer = 0;
    dashBuffer = 0;
    attackBuffer = 0;
    freezeMarch = false;
    attackHit = new Set();
    seen.shield = false;
    seen.gunner = false;
    seen.ufo = false;
    enemies = [];
    bullets = [];
    pickups = [];
    particles = [];
    floats = [];
    ghosts = [];
    resetPlayer();
    player.coyote = 0.1;
    setHint('W 점프 · S 웅크리기 · A/D 이동 · Space 베기 · Q 대시', 6.5);
    audio.unlock();
  }

  function continueGame() {
    if (mode === 'play' && paused) {
      paused = false;
      return;
    }
    if (mode !== 'play') start();
  }

  function hold(key, down) {
    if (down) {
      if (!held.has(key)) pressed.add(key);
      held.add(key);
    } else if (held.has(key)) {
      held.delete(key);
      released.add(key);
    }
  }

  function releaseAll() {
    held.clear();
    pressed.clear();
    released.clear();
  }

  function snapshot() {
    return {
      mode,
      paused,
      hp: Math.max(0, Math.ceil(player.hp)),
      maxHp,
      meters: metersOf(distance),
      kills,
      sword: currentSword().name,
      swordLevel,
      cause: CAUSES[cause] || '행군이 끝났다.',
      best,
      muted: audio.muted,
    };
  }

  function xpFraction() {
    if (swordLevel >= SWORDS.length) return 1;
    const prev = SWORDS[swordLevel - 1].need;
    const next = SWORDS[swordLevel].need;
    return Math.max(0, Math.min(1, (xp - prev) / (next - prev)));
  }

  function viewDistance() {
    return mode === 'title' ? titleScroll : distance;
  }

  function drawSky(dist) {
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#07091a');
    sky.addColorStop(0.55, '#14182e');
    sky.addColorStop(1, '#2a1b28');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VW, GROUND);

    for (const star of stars) {
      const shift = (dist * (0.015 + star.z * 0.05)) % VW;
      let x = star.x - shift;
      if (x < 0) x += VW;
      ctx.globalAlpha = 0.35 + star.z * 0.65;
      ctx.fillStyle = star.warm ? '#ffe1b5' : '#d7ecff';
      ctx.fillRect(x, star.y, star.r, star.r);
    }
    ctx.globalAlpha = 1;

    const gx = 790;
    const gy = 108;
    const gr = 74;
    const planet = ctx.createRadialGradient(gx - 22, gy - 26, 8, gx, gy, gr);
    planet.addColorStop(0, '#f2ffe4');
    planet.addColorStop(0.42, '#7dcea0');
    planet.addColorStop(1, '#1a4634');
    ctx.fillStyle = planet;
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(6, 32, 24, 0.28)';
    for (let i = 0; i < 5; i += 1) ctx.fillRect(gx - gr, gy - 42 + i * 18, gr * 2, 5);
    ctx.restore();
    ctx.strokeStyle = 'rgba(214, 255, 220, 0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(gx, gy + 10, 118, 16, -0.25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function drawRuins(dist) {
    const span = 2560;
    const offset = (dist * 0.32) % span;
    for (const ruin of ruins) {
      let x = ruin.x - offset;
      if (x < -140) x += span;
      if (x > VW + 20) continue;
      ctx.fillStyle = '#1a2234';
      if (ruin.kind === 0) {
        ctx.beginPath();
        ctx.moveTo(x, GROUND);
        ctx.lineTo(x + 8, GROUND - ruin.h);
        ctx.lineTo(x + ruin.w - 8, GROUND - ruin.h);
        ctx.lineTo(x + ruin.w, GROUND);
        ctx.fill();
        ctx.fillStyle = '#7dffb0';
        ctx.fillRect(x + ruin.w / 2 - 2, GROUND - ruin.h + 12, 4, 4);
      } else if (ruin.kind === 1) {
        ctx.fillRect(x, GROUND - ruin.h, 8, ruin.h);
        ctx.fillRect(x + ruin.w - 8, GROUND - ruin.h, 8, ruin.h);
        ctx.fillRect(x, GROUND - ruin.h, ruin.w, 8);
      } else {
        ctx.beginPath();
        ctx.ellipse(x + ruin.w / 2, GROUND - 8, ruin.w / 2, 16, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#245c3d';
        ctx.beginPath();
        ctx.ellipse(x + ruin.w / 2, GROUND - 16, 8, 18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawGround(dist) {
    ctx.fillStyle = '#110e12';
    ctx.fillRect(0, GROUND, VW, VH - GROUND);
    const glow = ctx.createLinearGradient(0, GROUND - 28, 0, GROUND + 8);
    glow.addColorStop(0, 'rgba(120, 255, 170, 0)');
    glow.addColorStop(1, 'rgba(140, 255, 180, 0.16)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, GROUND - 28, VW, 36);
    const tile = 72;
    const offset = dist % tile;
    for (let i = -1; i < 16; i += 1) {
      const x = i * tile - offset;
      ctx.fillStyle = i % 2 === 0 ? '#1a1418' : '#241c20';
      ctx.fillRect(x, GROUND + 6, tile - 3, VH - GROUND);
      ctx.strokeStyle = 'rgba(150, 255, 176, 0.22)';
      ctx.beginPath();
      ctx.moveTo(x + 12, GROUND + 16);
      ctx.lineTo(x + 26, GROUND + 34);
      ctx.lineTo(x + 18, GROUND + 54);
      ctx.stroke();
    }
    ctx.fillStyle = '#07060a';
    ctx.fillRect(0, GROUND, VW, 4);
  }

  function drawShadow(x, y, w) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y, w, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawAlienHead(cx, cy, radius) {
    ctx.fillStyle = '#9af57a';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#102016';
    ctx.beginPath();
    ctx.arc(cx + radius * 0.32, cy - 1, radius * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff4d6a';
    ctx.beginPath();
    ctx.arc(cx + radius * 0.4, cy - 1, Math.max(1.5, radius * 0.18), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLegs(x, y, h, phase, color) {
    const step = Math.sin(animTime * 11 + phase) * 4;
    ctx.fillStyle = color;
    ctx.fillRect(x + 10, y + h - 22, 6, 22);
    ctx.fillRect(x + 24, y + h - 22, 6, 22);
    ctx.fillRect(x + 8 + step, y + h - 5, 12, 4);
    ctx.fillRect(x + 22 - step, y + h - 5, 12, 4);
  }

  function drawGrunt(enemy) {
    const { x, y, h } = enemy;
    drawLegs(x, y, h, enemy.phase, '#143322');
    ctx.fillStyle = '#1f6a3a';
    fillRound(ctx, x + 8, y + 30, 30, 24, 7);
    ctx.fillStyle = 'rgba(190, 255, 140, 0.85)';
    ctx.beginPath();
    ctx.ellipse(x + 24, y + 42, 5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    drawAlienHead(x + 28, y + 20, 15);
    ctx.strokeStyle = '#e6d3a8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 40);
    ctx.lineTo(x - 18, y + 50);
    ctx.stroke();
    ctx.fillStyle = '#d5dde4';
    ctx.beginPath();
    ctx.moveTo(x - 22, y + 44);
    ctx.lineTo(x - 8, y + 50);
    ctx.lineTo(x - 20, y + 56);
    ctx.fill();
  }

  function drawShield(enemy) {
    const { x, y, h } = enemy;
    drawLegs(x, y, h, enemy.phase, '#10281c');
    ctx.fillStyle = '#174a30';
    fillRound(ctx, x + 14, y + 28, 30, 30, 6);
    drawAlienHead(x + 32, y + 16, 12);
    ctx.fillStyle = '#10281c';
    fillRound(ctx, x + 22, y + 6, 20, 14, 4);
    if (enemy.shield > 0) {
      ctx.fillStyle = '#14344c';
      fillRound(ctx, x - 16, y + 22, 32, h - 40, 6);
      ctx.fillStyle = '#8fd4ff';
      fillRound(ctx, x - 11, y + 28, 22, h - 54, 5);
      ctx.strokeStyle = '#14344c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 2, y + 40);
      ctx.lineTo(x + 6, y + 52);
      ctx.lineTo(x - 2, y + 64);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#8fd4ff';
      ctx.fillRect(x - 6, y + h - 18, 14, 4);
      ctx.fillRect(x + 8, y + h - 12, 10, 3);
    }
  }

  function drawGunner(enemy) {
    const { x, y, h } = enemy;
    drawLegs(x, y, h, enemy.phase + 1, '#1a3324');
    ctx.fillStyle = '#245c38';
    fillRound(ctx, x + 16, y + 26, 22, 32, 6);
    drawAlienHead(x + 30, y + 16, 11);
    ctx.fillStyle = '#0e1a12';
    fillRound(ctx, x + 24, y + 10, 16, 8, 3);
    ctx.fillStyle = '#ffb15a';
    ctx.fillRect(x + 30, y + 12, 8, 3);
    const muzzleY = (enemy.aimHigh ? GROUND - 72 : GROUND - 18);
    ctx.strokeStyle = '#1a120c';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x + 16, y + 42);
    ctx.lineTo(x - 26, muzzleY);
    ctx.stroke();
    ctx.fillStyle = '#ffb15a';
    ctx.beginPath();
    ctx.arc(x - 26, muzzleY, 4, 0, Math.PI * 2);
    ctx.fill();
    if (enemy.telegraph > 0) {
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.sin(animTime * 28) * 0.25;
      ctx.strokeStyle = enemy.aimHigh ? '#ffe28a' : '#ff8a3d';
      ctx.setLineDash([7, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 30, muzzleY);
      ctx.lineTo(player.x + player.w, muzzleY);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawUfo(enemy) {
    const cx = enemy.x + enemy.w / 2;
    const cy = enemy.y + enemy.h / 2 + 4;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(210, 170, 255, 0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 48, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d7c6ff';
    ctx.beginPath();
    ctx.ellipse(0, 6, 40, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6d5bff';
    ctx.beginPath();
    ctx.ellipse(0, 6, 20, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e9fff4';
    ctx.beginPath();
    ctx.ellipse(0, -4, 15, 12, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#143322';
    ctx.beginPath();
    ctx.arc(-1, -5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff4d6a';
    ctx.beginPath();
    ctx.arc(1, -5, 2, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 4; i += 1) {
      const on = Math.floor(animTime * 6 + i) % 2 === 0;
      ctx.fillStyle = on ? '#ff7ad9' : '#6a4a78';
      ctx.beginPath();
      ctx.arc(-24 + i * 16, 8, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255, 214, 250, 0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.ellipse(0, 6, 50, 20, animTime, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawEnemy(enemy, decorative = false) {
    if (!decorative) drawShadow(enemy.x + enemy.w / 2, GROUND, enemy.type === 'ufo' ? 28 : enemy.w * 0.38);
    ctx.save();
    if (enemy.type === 'grunt') drawGrunt(enemy);
    else if (enemy.type === 'shield') drawShield(enemy);
    else if (enemy.type === 'gunner') drawGunner(enemy);
    else drawUfo(enemy);
    ctx.restore();

    if (decorative) {
      paint(enemy.label, enemy.x + enemy.w / 2, enemy.y - 18, '#e7ffe4', "14px 'IBM Plex Sans KR', sans-serif", 'center');
      return;
    }

    const ratio = Math.max(0, enemy.hp / enemy.maxHp);
    ctx.fillStyle = '#140e10';
    ctx.fillRect(enemy.x, enemy.y - 8, enemy.w, 4);
    ctx.fillStyle = enemy.type === 'ufo' ? '#e39cff' : '#ff5d73';
    ctx.fillRect(enemy.x, enemy.y - 8, enemy.w * ratio, 4);
    if (enemy.type === 'shield' && enemy.shieldMax > 0) {
      ctx.fillStyle = '#79d0ff';
      ctx.fillRect(enemy.x, enemy.y - 13, enemy.w * (enemy.shield / enemy.shieldMax), 3);
    }
    paint(enemy.label, enemy.x + enemy.w / 2, enemy.y - 28, 'rgba(232,255,236,0.92)', "13px 'IBM Plex Sans KR', sans-serif", 'center');
  }

  function swordAngle() {
    if (mode === 'dead') return 1.15;
    if (player.attackT > 0) {
      const age = ATTACK_TIME - player.attackT;
      const eased = 1 - (1 - Math.min(1, age / 0.2)) ** 3;
      if (!player.grounded) return lerp(-2.45, -0.15, eased);
      if (player.crouch) return lerp(-0.3, 1.02, eased);
      return lerp(-2.05, 0.42, eased);
    }
    if (player.crouch) return 0.82;
    return -0.55 + Math.sin(animTime * 8) * 0.05;
  }

  function drawPlayer() {
    const blink = player.invuln > 0 && player.dashT <= 0 && Math.floor(animTime * 18) % 2 === 0;
    drawShadow(player.x + player.w * 0.5, GROUND, player.crouch ? 18 : 16);
    if (blink && mode === 'play') return;

    const sword = currentSword();
    const x = player.x;
    const y = player.y + (mode === 'dead' ? 8 : 0);
    const bob = player.grounded && player.dashT <= 0 && mode === 'play'
      ? Math.sin(animTime * 12) * -1.5
      : 0;

    ctx.save();
    ctx.translate(x + player.w / 2, GROUND);
    ctx.scale(1 + player.squash * 0.1, 1 - player.squash * 0.15);
    ctx.translate(-(x + player.w / 2), -GROUND);
    ctx.translate(0, bob);

    ctx.fillStyle = '#9d3030';
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 24);
    ctx.quadraticCurveTo(x - 8 + Math.sin(animTime * 7) * 5, y + 48, x + 6, y + player.h - 8);
    ctx.lineTo(x + 16, y + 42);
    ctx.fill();

    const leg = player.grounded ? Math.sin(animTime * 12) * 5 : 8;
    ctx.fillStyle = '#2a3142';
    if (!player.crouch) {
      ctx.fillRect(x + 8, y + 50, 7, 26);
      ctx.fillRect(x + 20 + leg * 0.15, y + 50, 7, 26);
      ctx.fillRect(x + 6 - leg, y + player.h - 6, 12, 5);
      ctx.fillRect(x + 20 + leg, y + player.h - 6, 12, 5);
    } else {
      ctx.fillRect(x + 4, y + 28, 30, 8);
      ctx.fillRect(x + 2, y + player.h - 8, 16, 6);
    }

    ctx.fillStyle = '#efe7d6';
    if (player.crouch) fillRound(ctx, x + 6, y + 12, 30, 20, 6);
    else fillRound(ctx, x + 6, y + 24, 28, 32, 7);
    ctx.fillStyle = '#d24a42';
    ctx.fillRect(x + 8, player.crouch ? y + 22 : y + 40, 22, 4);

    ctx.fillStyle = '#1c2230';
    fillRound(ctx, x + 10, y + (player.crouch ? 0 : 2), 22, 18, 6);
    ctx.fillStyle = '#10151d';
    fillRound(ctx, x + 18, y + (player.crouch ? 5 : 8), 14, 7, 2);
    ctx.fillStyle = sword.glow;
    ctx.fillRect(x + 20, y + (player.crouch ? 7 : 10), 10, 2);

    const handX = x + (player.crouch ? 30 : 28);
    const handY = y + (player.crouch ? 24 : player.grounded ? 40 : 34);
    const length = 24 + sword.level * 12;
    ctx.translate(handX, handY);
    ctx.rotate(swordAngle());
    ctx.fillStyle = '#f0c7a4';
    ctx.beginPath();
    ctx.arc(4, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a3428';
    ctx.fillRect(-2, -3, 12, 6);
    ctx.fillStyle = sword.glow;
    ctx.fillRect(8, -6, 4, 12);
    ctx.beginPath();
    ctx.moveTo(12, -4);
    ctx.lineTo(12 + length, 0);
    ctx.lineTo(12, 4);
    ctx.closePath();
    ctx.fillStyle = sword.color;
    ctx.shadowColor = sword.glow;
    ctx.shadowBlur = reduceMotion ? 0 : 6 + sword.level * 2;
    ctx.fill();
    ctx.restore();
  }

  function drawSlash() {
    if (player.attackT <= 0 || mode !== 'play') return;
    const age = ATTACK_TIME - player.attackT;
    if (age < 0.04 || age > 0.2) return;
    const sword = currentSword();
    const box = attackRect();
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = sword.glow;
    ctx.beginPath();
    const left = box.x + 8;
    const right = box.x + box.w;
    const mid = box.y + box.h * 0.45;
    ctx.moveTo(left, mid);
    ctx.quadraticCurveTo((left + right) / 2, box.y - 8, right, mid);
    ctx.quadraticCurveTo((left + right) / 2, box.y + box.h * 0.75, left + 12, mid + 10);
    ctx.fill();
    ctx.restore();
  }

  function paint(text, x, y, color, font, align = 'left') {
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.72)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawHud() {
    if (mode === 'title') return;
    const sword = currentSword();
    ctx.fillStyle = '#3a1c24';
    fillRound(ctx, 20, 18, 210, 14, 7);
    const ratio = Math.max(0, player.hp / maxHp);
    ctx.fillStyle = ratio < 0.3 ? '#ff4d5e' : '#7dff9a';
    if (ratio > 0) fillRound(ctx, 20, 18, Math.max(8, 210 * ratio), 14, 7);
    paint('체력', 20, 36, '#f4fff6', "15px 'IBM Plex Sans KR', sans-serif");
    paint(
      player.dashCd <= 0 ? '대시 준비' : '대시 충전',
      78,
      36,
      player.dashCd <= 0 ? '#9dffe0' : '#8d978f',
      "15px 'IBM Plex Sans KR', sans-serif",
    );

    paint(`${metersOf(distance)}m`, VW / 2, 14, '#f3ffe8', "40px 'Do Hyeon', sans-serif", 'center');
    paint(`처치 ${kills}`, VW / 2, 56, '#d5e2cf', "16px 'IBM Plex Sans KR', sans-serif", 'center');
    if (combo > 1) {
      paint(`${combo} HIT`, VW / 2, 76, '#ffe08a', "16px 'Do Hyeon', sans-serif", 'center');
    }

    const right = VW - 96;
    paint(sword.name, right, 14, sword.glow, "24px 'Do Hyeon', sans-serif", 'right');
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < sword.level ? sword.color : '#2a3144';
      ctx.fillRect(right - (5 - i) * 16, 44, 12, 8);
    }
    ctx.fillStyle = '#1b2230';
    ctx.fillRect(right - 124, 58, 124, 5);
    ctx.fillStyle = sword.glow;
    ctx.fillRect(right - 124, 58, 124 * xpFraction(), 5);

    if (hintT > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, hintT * 2);
      ctx.font = "18px 'IBM Plex Sans KR', sans-serif";
      const width = ctx.measureText(hint).width + 28;
      ctx.fillStyle = 'rgba(8, 12, 18, 0.78)';
      fillRound(ctx, VW / 2 - width / 2, 102, width, 32, 6);
      paint(hint, VW / 2, 108, '#e9ffe4', "18px 'IBM Plex Sans KR', sans-serif", 'center');
      ctx.restore();
    }

    if (bannerT > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, bannerT);
      paint(bannerSub, VW / 2, 168, '#d6ff7a', "18px 'IBM Plex Sans KR', sans-serif", 'center');
      paint(banner, VW / 2, 190, '#fff6d2', "36px 'Do Hyeon', sans-serif", 'center');
      ctx.restore();
    }

    if (controlsT > 0 && mode === 'play') {
      ctx.save();
      ctx.globalAlpha = Math.min(1, controlsT);
      paint('Esc 일시정지 · M 음소거', VW / 2, VH - 28, '#c9d7c4', "14px 'IBM Plex Sans KR', sans-serif", 'center');
      ctx.restore();
    }

    if (paused) {
      ctx.fillStyle = 'rgba(5, 8, 16, 0.45)';
      ctx.fillRect(0, 0, VW, VH);
    }

    if (crash) {
      paint(String(crash.message || crash), 20, VH - 40, '#ffb4b4', "16px sans-serif");
    }
  }

  function drawTitleCast() {
    const cast = [
      { type: 'grunt', x: 590, y: GROUND - 72, w: 44, h: 72, phase: 0.4, label: '일반 병', shield: 0 },
      { type: 'shield', x: 720, y: GROUND - 80, w: 50, h: 80, phase: 1.2, label: '방패병', shield: 2, shieldMax: 2 },
      { type: 'gunner', x: 860, y: GROUND - 76, w: 46, h: 76, phase: 2, label: '총병', telegraph: 0, aimHigh: false },
      {
        type: 'ufo',
        x: 500,
        y: 188 + Math.sin(animTime * 1.4) * 8,
        w: 86,
        h: 40,
        phase: animTime,
        label: 'UFO',
        baseY: 188,
      },
    ];
    for (const enemy of cast) drawEnemy(enemy, true);
  }

  function draw() {
    if (!ctx) return;
    const dpr = canvas.width / VW || 1;
    const magnitude = reduceMotion ? 0 : shake;
    const ox = (Math.random() - 0.5) * 2 * magnitude;
    const oy = (Math.random() - 0.5) * 2 * magnitude;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#07091a';
    ctx.fillRect(0, 0, VW, VH);
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);

    const dist = viewDistance();
    drawSky(dist);
    drawRuins(dist);
    drawGround(dist);

    if (mode === 'title') drawTitleCast();

    for (const ghost of ghosts) {
      ctx.globalAlpha = Math.max(0, ghost.life * 4);
      ctx.fillStyle = '#efe7d6';
      fillRound(ctx, ghost.x, ghost.y, ghost.w, ghost.h, 6);
      ctx.globalAlpha = 1;
    }

    for (const enemy of enemies) drawEnemy(enemy, false);

    drawPlayer();
    drawSlash();

    for (const bullet of bullets) {
      ctx.fillStyle = bullet.high ? '#ffe28a' : '#ff7a32';
      fillRound(ctx, bullet.x, bullet.y, bullet.w, bullet.h, 4);
      ctx.fillStyle = '#fff6e4';
      ctx.fillRect(bullet.x + 3, bullet.y + 4, 8, 3);
    }

    for (const pickup of pickups) {
      const pulse = 1 + Math.sin(animTime * 8) * 0.12;
      ctx.save();
      ctx.translate(pickup.x, pickup.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#9dff7a';
      ctx.fillRect(-6 * pulse, -6 * pulse, 12 * pulse, 12 * pulse);
      ctx.restore();
    }

    for (const particle of particles) {
      ctx.globalAlpha = Math.max(0, particle.life * 2);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    ctx.globalAlpha = 1;

    for (const item of floats) {
      ctx.globalAlpha = Math.min(1, item.life * 2);
      paint(item.text, item.x, item.y, item.color, "16px 'Do Hyeon', sans-serif", 'left');
    }
    ctx.globalAlpha = 1;

    if (hurtFlash > 0) {
      ctx.fillStyle = `rgba(255, 50, 70, ${hurtFlash * 0.35})`;
      ctx.fillRect(-20, -20, VW + 40, VH + 40);
    }

    const vignette = ctx.createRadialGradient(VW / 2, VH / 2, 180, VW / 2, VH / 2, 560);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vignette;
    ctx.fillRect(-20, -20, VW + 40, VH + 40);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawHud();
  }

  resetPlayer();
  player.coyote = 0;

  return {
    frame,
    draw,
    step,
    start,
    continue: continueGame,
    hold,
    releaseAll,
    toggleMute() {
      return audio.toggle();
    },
    pause() {
      if (mode === 'play') paused = true;
    },
    snapshot,
    debug: {
      setFreeze(value) {
        freezeMarch = value;
      },
      holdSpawn(value) {
        spawnCd = value;
      },
      clear() {
        enemies = [];
        bullets = [];
        pickups = [];
      },
      spawn(type, x, extra) {
        return spawnEnemy(type, x, extra || {});
      },
      bullet(spec) {
        const bullet = {
          x: 0,
          y: 0,
          w: 20,
          h: 12,
          vx: 0,
          damage: 12,
          high: true,
          ...spec,
        };
        bullets.push(bullet);
        return bullet;
      },
      player: () => player,
      enemies: () => enemies,
      bullets: () => bullets,
      stats() {
        return {
          hp: player.hp,
          xp,
          swordLevel,
          kills,
          mode,
          distance,
          grounded: player.grounded,
          crouch: player.crouch,
          x: player.x,
          y: player.y,
          h: player.h,
          invuln: player.invuln,
          dashT: player.dashT,
        };
      },
    },
  };
}
