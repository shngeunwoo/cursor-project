import { createGame, GROUND, CROUCH_H } from '../src/game.js';

const canvas = {
  width: 960,
  height: 540,
  getContext() {
    return {};
  },
};

const game = createGame(canvas);
let failures = 0;

function assert(condition, message) {
  if (!condition) {
    failures += 1;
    const stats = game.debug.stats();
    const enemies = game.debug.enemies().map((enemy) => ({
      type: enemy.type,
      hp: enemy.hp,
      shield: enemy.shield,
      x: Math.round(enemy.x),
      y: Math.round(enemy.y),
    }));
    console.error('FAIL', message, JSON.stringify({ stats, enemies }));
  } else {
    console.log('OK', message);
  }
}

function frames(count) {
  for (let i = 0; i < count; i += 1) game.step(1 / 60);
}

function reset() {
  game.releaseAll();
  game.start();
  game.debug.setFreeze(true);
  game.debug.holdSpawn(999);
  game.debug.clear();
}

function swing() {
  game.hold('attack', false);
  frames(30);
  game.hold('attack', true);
  frames(2);
  game.hold('attack', false);
  frames(12);
}

reset();
const y0 = game.debug.player().y;
game.hold('w', true);
frames(8);
game.hold('w', false);
assert(!game.debug.player().grounded, '점프하면 땅에서 떨어진다');
assert(game.debug.player().y < y0 - 20, '점프하면 몸이 올라간다');
frames(180);
assert(game.debug.player().grounded, '다시 착지한다');

game.hold('s', true);
frames(2);
assert(game.debug.player().crouch, 'S를 누르면 웅크린다');
assert(game.debug.player().h === CROUCH_H, '웅크리면 피격 높이가 줄어든다');
game.hold('s', false);
frames(2);
assert(!game.debug.player().crouch, 'S를 떼면 일어선다');

reset();
const x0 = game.debug.player().x;
game.hold('a', true);
frames(6);
assert(game.debug.player().x < x0 - 8, 'A는 뒤로 이동한다');
game.hold('a', false);
const x1 = game.debug.player().x;
game.hold('d', true);
frames(6);
assert(game.debug.player().x > x1 + 8, 'D는 앞으로 이동한다');

reset();
const beforeDash = game.debug.player().x;
game.hold('q', true);
frames(2);
game.hold('q', false);
assert(game.debug.player().x > beforeDash + 10, 'Q는 앞으로 대시한다');
const dashHp = game.debug.stats().hp;
game.debug.bullet({
  x: game.debug.player().x,
  y: game.debug.player().y + 16,
  w: 40,
  h: 30,
  vx: 0,
  damage: 30,
});
frames(2);
assert(game.debug.stats().hp === dashHp, '대시 중에는 탄환을 무시한다');

reset();
game.debug.setFreeze(false);
const marched = game.debug.spawn('grunt', 800, { frozen: true });
const marchX = marched.x;
frames(10);
assert(marched.x < marchX - 10, '행군이 앞에서 오는 적을 끌어온다');

reset();
const grunt = game.debug.spawn('grunt', 300, { hp: 80, frozen: true });
const gruntHp = grunt.hp;
swing();
assert(grunt.hp < gruntHp, '베기로 일반 병에게 피해를 준다');

reset();
const shield = game.debug.spawn('shield', 300, { frozen: true });
const shieldHp = shield.hp;
const shieldPoints = shield.shield;
swing();
assert(shield.hp === shieldHp, '선 베기는 방패에 막힌다');
assert(shield.shield === shieldPoints - 1, '막히면 방패 내구가 줄어든다');
game.hold('s', true);
frames(2);
swing();
game.hold('s', false);
assert(shield.hp < shieldHp, '웅크려 베면 방패병을 맞힌다');

reset();
const jumper = game.debug.spawn('shield', 300, { frozen: true, shield: 3 });
const jumpHp = jumper.hp;
game.hold('w', true);
frames(4);
game.hold('w', false);
game.hold('attack', true);
frames(2);
game.hold('attack', false);
frames(14);
assert(!game.debug.player().grounded || jumper.hp < jumpHp, '점프 베기 판정이 공중에서 난다');
assert(jumper.hp < jumpHp, '점프 베기는 방패를 넘어 들어간다');

reset();
const ufo = game.debug.spawn('ufo', 300, { y: 390, frozen: true, hp: 80 });
const before = game.debug.stats().hp;
swing();
const after = game.debug.stats().hp;
assert(ufo.hp < 80, 'UFO도 베기 피해를 받는다');
assert(after < before, 'UFO를 베면 플레이어 체력이 깎인다');
assert(before - after === 80 - ufo.hp, '반사 피해는 입힌 피해와 같다');

reset();
game.hold('s', true);
frames(2);
game.debug.bullet({
  x: game.debug.player().x + 4,
  y: GROUND - 78,
  w: 24,
  h: 12,
  vx: 0,
  damage: 12,
  high: true,
});
frames(2);
assert(game.debug.stats().hp === 100, '웅크리기로 높은 탄을 피한다');
game.debug.clear();
game.hold('s', false);
frames(3);
game.debug.player().invuln = 0;
game.debug.bullet({
  x: game.debug.player().x + 4,
  y: GROUND - 78,
  w: 24,
  h: 12,
  vx: 0,
  damage: 12,
  high: true,
});
frames(2);
assert(game.debug.stats().hp < 100, '서 있으면 높은 탄에 맞는다');

reset();
game.debug.player().grounded = false;
game.debug.player().crouch = false;
game.debug.player().h = 78;
game.debug.player().y = 260;
game.debug.player().vy = 0;
game.debug.bullet({
  x: game.debug.player().x,
  y: GROUND - 26,
  w: 36,
  h: 12,
  vx: 0,
  damage: 12,
  high: false,
});
frames(1);
assert(game.debug.stats().hp === 100, '점프로 낮은 탄을 피한다');

reset();
game.hold('s', true);
frames(2);
game.debug.bullet({
  x: game.debug.player().x,
  y: GROUND - 26,
  w: 36,
  h: 12,
  vx: 0,
  damage: 12,
  high: false,
});
frames(2);
assert(game.debug.stats().hp < 100, '웅크리면 낮은 탄에 맞는다');

reset();
function killOne() {
  game.debug.clear();
  game.debug.spawn('grunt', 300, { hp: 1, frozen: true });
  game.hold('attack', true);
  frames(14);
  game.hold('attack', false);
  frames(24);
}
killOne();
killOne();
killOne();
assert(game.debug.stats().kills === 3, '처치 수가 쌓인다');
assert(game.debug.stats().swordLevel === 2, '셋을 쓰러뜨리면 검이 강철로 강화된다');
assert(game.debug.stats().hp > 80, '강화할 때 체력을 회복한다');

if (failures > 0) {
  console.error(`${failures}개 실패`);
  process.exit(1);
}
console.log('모든 시뮬레이션 검사를 통과했다');
