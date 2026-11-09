import './style.css';
import * as THREE from 'three';
import { createStadium } from './game/pitch.js';
import { Effects } from './game/effects.js';
import { AudioEngine } from './game/audio.js';
import { Input } from './game/input.js';
import { Game } from './game/game.js';
import { UI } from './ui.js';
import { PLAYSTYLES } from './game/constants.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.14;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x040a13, 0.0095);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 260);
camera.position.set(21, 14, -29);

const stadium = createStadium(scene, renderer);

const audio = new AudioEngine();
const effects = new Effects(scene, null);
const input = new Input({
  onPause: () => game?.togglePause(),
  onGesture: () => audio.init(),
});

let game;
const ui = new UI({
  onPlay: (style, diff) => {
    audio.init();
    document.activeElement?.blur?.();
    ui.setStyle(style);
    ui.updateHud({
      score: { home: 0, away: 0 },
      timeLeft: 120,
      golden: false,
      stamina: 100,
      playerName: 'NOVA',
      styleId: style,
      styleName: PLAYSTYLES[style]?.name ?? 'SHOWMAN',
      shots: 0,
      possession: 50,
    });
    game.startMatch(style, diff);
    ui.hideMenu();
    ui.flashScreen();
  },
  onStyleChange: (style) => {
    game?.applyPlaystyle(style);
    ui.setStyle(style);
  },
  onDifficultyChange: (diff) => game?.setDifficulty(diff),
  onPauseToggle: () => game?.togglePause(),
  onResume: () => game?.resume(),
  onRestart: () => game?.restart(),
  onMenu: () => game?.returnToMenu(),
  onAgain: () => {
    ui.hideEnd();
    game?.startMatch(ui.selectedStyle, ui.selectedDifficulty);
  },
  onSoundToggle: () => {
    audio.init();
    return audio.toggleMuted();
  },
});

game = new Game({ scene, camera, renderer, input, audio, effects, ui });

// sync initial selection + sound icon
ui.selectedStyle = game.styleId;
ui.selectedDifficulty = game.difficultyId;
ui._syncMenu();
ui.setStyle(game.styleId);
ui.setMuted(audio.muted);
ui.showMenu();

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, w < 900 ? 1.75 : 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  effects.setViewport(h * renderer.getPixelRatio());
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 220));
resize();

window.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'play') game.pause();
});

// First input unlocks audio (iOS requires a user gesture)
const unlock = () => {
  audio.init();
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
};
window.addEventListener('pointerdown', unlock, { passive: true });
window.addEventListener('keydown', unlock);

let last = performance.now();
// Warm up every shader and shadow pass once during load. On software renderers the
// first compiled frame can take seconds; doing it here keeps the menu responsive for
// the first click and removes the opening hitch.
renderer.compile(scene, camera);
renderer.setSize(8, 8, false);
renderer.render(scene, camera);
resize();
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
  last = now;
  let dt = raw;
  if (game.hitStop > 0) {
    game.hitStop -= raw;
    dt = raw * 0.3;
  }
  input.poll();
  game.update(dt);
  input.endFrame();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// Helpful for automated checks and tinkering.
window.NEON = {
  game,
  ui,
  audio,
  renderer,
  scene,
  camera,
  start: (style = game.styleId, diff = game.difficultyId) => game.startMatch(style, diff),
};
