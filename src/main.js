import '@fontsource/do-hyeon/korean-400.css';
import '@fontsource/do-hyeon/latin-400.css';
import '@fontsource/ibm-plex-sans-kr/korean-400.css';
import '@fontsource/ibm-plex-sans-kr/latin-400.css';
import '@fontsource/ibm-plex-sans-kr/korean-600.css';
import '@fontsource/ibm-plex-sans-kr/latin-600.css';
import './style.css';
import { createGame } from './game.js';

const canvas = document.querySelector('#game');
const overlay = document.querySelector('#overlay');
const panel = document.querySelector('#panel');
const mute = document.querySelector('#mute');
const game = createGame(canvas);

const KEYS = {
  w: 'w',
  arrowup: 'w',
  s: 's',
  arrowdown: 's',
  a: 'a',
  arrowleft: 'a',
  d: 'd',
  arrowright: 'd',
  q: 'q',
  ' ': 'attack',
};

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(960 * dpr);
  canvas.height = Math.round(540 * dpr);
}

function begin() {
  game.continue();
  canvas.focus();
}

let signature = '';

function bestLine(best) {
  if (!best) return '';
  return `<p class="best">최고 ${best.meters.toLocaleString('ko-KR')}m · ${best.kills}처치 · ${best.sword}</p>`;
}

function renderPanel(state) {
  if (state.mode === 'title') {
    panel.innerHTML = `
      <p class="eyebrow">끝없는 야간 행군</p>
      <h1>외계 행군</h1>
      <p class="lead">적은 앞에서 밀려온다. 베거나 피하면서 앞으로, 때로는 뒤로 걸어라. 쓰러뜨릴수록 검이 자란다.</p>
      <ul class="keys">
        <li><kbd>W</kbd> 점프</li>
        <li><kbd>S</kbd> 웅크리기</li>
        <li><kbd>A</kbd><kbd>D</kbd> 이동</li>
        <li><kbd>Space</kbd> 앞으로 베기</li>
        <li><kbd>Q</kbd> 대시</li>
        <li><kbd>M</kbd> 음소거</li>
      </ul>
      <div class="tips">
        <span>방패병 — 점프나 웅크리기로 벤다</span>
        <span>총병 — 낮은 탄은 점프, 높은 탄은 웅크리기</span>
        <span>UFO — 공격하면 피해가 되돌아온다</span>
      </div>
      ${bestLine(state.best)}
      <button id="start" type="button">행군 시작</button>
      <p class="footnote">Enter로도 시작할 수 있다</p>
    `;
  } else if (state.paused) {
    panel.innerHTML = `
      <p class="eyebrow">행군 중단</p>
      <h1>일시정지</h1>
      <p class="lead">${state.meters}m · 처치 ${state.kills} · ${state.sword}</p>
      <button id="start" type="button">계속 행군</button>
      <p class="footnote">Esc로도 이어 할 수 있다</p>
    `;
  } else {
    panel.innerHTML = `
      <p class="eyebrow">행군 종료</p>
      <h1>쓰러졌다</h1>
      <p class="cause">${state.cause}</p>
      <dl class="stats">
        <div><dt>거리</dt><dd>${state.meters}m</dd></div>
        <div><dt>처치</dt><dd>${state.kills}</dd></div>
        <div><dt>검</dt><dd>${state.sword}</dd></div>
      </dl>
      ${bestLine(state.best)}
      <button id="start" type="button">다시 행군</button>
      <p class="footnote">R 또는 Enter</p>
    `;
  }
  panel.querySelector('#start')?.addEventListener('click', (event) => {
    event.stopPropagation();
    begin();
  });
}

function syncMute(muted) {
  mute.textContent = muted ? '음소거' : '소리';
  mute.setAttribute('aria-pressed', muted ? 'true' : 'false');
}

function sync() {
  const state = game.snapshot();
  const next = `${state.mode}|${state.paused}|${state.cause}|${state.meters}|${state.kills}|${state.sword}|${state.best?.meters ?? ''}|${state.best?.kills ?? ''}`;
  if (next !== signature) {
    signature = next;
    renderPanel(state);
  }
  overlay.hidden = state.mode === 'play' && !state.paused;
}

window.addEventListener('keydown', (event) => {
  const raw = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
  if (raw === 'm') {
    event.preventDefault();
    syncMute(game.toggleMute());
    return;
  }
  if (raw === 'escape') {
    event.preventDefault();
    const state = game.snapshot();
    if (state.mode === 'play' && state.paused) begin();
    else game.pause();
    return;
  }
  if (raw === 'enter') {
    const state = game.snapshot();
    if (state.mode !== 'play' || state.paused) {
      event.preventDefault();
      begin();
    }
    return;
  }
  if (raw === 'r') {
    const state = game.snapshot();
    if (state.mode === 'dead') {
      event.preventDefault();
      begin();
    }
    return;
  }
  const key = KEYS[raw] || (event.code === 'Space' ? 'attack' : null);
  if (!key) return;
  event.preventDefault();
  game.hold(key, true);
});

window.addEventListener('keyup', (event) => {
  const raw = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
  const key = KEYS[raw] || (event.code === 'Space' ? 'attack' : null);
  if (!key) return;
  game.hold(key, false);
});

window.addEventListener('blur', () => game.releaseAll());

mute.addEventListener('click', () => {
  syncMute(game.toggleMute());
  canvas.focus();
});

overlay.addEventListener('pointerdown', (event) => {
  if (event.target === overlay) begin();
});

for (const button of document.querySelectorAll('#touch button')) {
  const key = button.dataset.k;
  const press = (event) => {
    event.preventDefault();
    button.classList.add('held');
    if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
    game.hold(key, true);
    canvas.focus();
  };
  const release = (event) => {
    button.classList.remove('held');
    game.hold(key, false);
    if (event?.pointerId != null && button.hasPointerCapture?.(event.pointerId)) {
      button.releasePointerCapture(event.pointerId);
    }
  };
  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('contextmenu', (event) => event.preventDefault());
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause();
});

window.addEventListener('resize', resize);
resize();
canvas.focus();
syncMute(false);

function loop(now) {
  game.frame(now);
  game.draw();
  sync();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
