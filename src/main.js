import * as THREE from "three";
import { AudioManager } from "./audio.js";
import "./style.css";

const $ = (id) => document.getElementById(id);
const ui = {
  canvas: $("game-canvas"), menu: $("menu"), hud: $("hud"), pause: $("pause-screen"), end: $("end-screen"),
  goal: $("goal-banner"), loading: $("loading"), joystick: $("joystick-zone"), knob: $("joystick-knob"),
  shoot: $("shoot-btn"), pass: $("pass-btn"), skill: $("skill-btn"), sprint: $("sprint-btn"),
};
const audio = new AudioManager();
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const FIELD = { x: 12, z: 7, goalHalf: 2.15 };
const STYLE = {
  street: { label: "STREET", icon: "⚡", color: "#ff3ec8", cooldown: 2.1, control: 1.18, shot: 1, turbo: 1 },
  tiki: { label: "TIKI-TAKA", icon: "◈", color: "#21e9ff", cooldown: 3.6, control: 1.04, shot: 1.04, turbo: 1 },
  power: { label: "POWER", icon: "✹", color: "#ff8a2b", cooldown: 3.4, control: 0.96, shot: 1.24, turbo: 1 },
  press: { label: "PRESS", icon: "↯", color: "#c9ff3b", cooldown: 3.3, control: 1, shot: 1, turbo: 1.28 },
};
const KIT = { cyan: 0x21e9ff, lime: 0xc9ff3b, pink: 0xff3ec8 };
const game = {
  running: false, paused: false, ended: false, style: "street", kit: "cyan", difficulty: "pro",
  time: 120, homeScore: 0, awayScore: 0, players: [], home: [], away: [], user: null, owner: null,
  ball: null, ballMesh: null, ballShadow: null, scene: null, camera: null, renderer: null, clock: null,
  stamina: 100, skillCD: 0, skillTime: 0, charge: 0, charging: false, sprinting: false,
  input: new THREE.Vector2(), key: {}, shots: 0, skills: 0, homePoss: 0, totalPoss: 0,
  goalTimer: 0, toastTimer: 0, lastHUD: 0, crowdNear: false,
};

initThree();
bindUI();
window.addEventListener("resize", resize);
window.addEventListener("blur", () => { if (game.running && !game.paused) pauseGame(); });
requestAnimationFrame(frame);
setTimeout(() => ui.loading.classList.add("done"), 850);

function initThree() {
  game.scene = new THREE.Scene();
  game.scene.background = new THREE.Color(0x080c1a);
  game.scene.fog = new THREE.FogExp2(0x080c1a, 0.022);
  game.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 120);
  game.camera.position.set(0, 24, 28);
  game.camera.lookAt(0, 0, 0);
  game.renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  game.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7));
  game.renderer.setSize(innerWidth, innerHeight);
  game.renderer.shadowMap.enabled = true;
  game.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  game.renderer.outputColorSpace = THREE.SRGBColorSpace;
  game.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  game.renderer.toneMappingExposure = 1.2;
  game.scene.add(new THREE.HemisphereLight(0x8dbdff, 0x141323, 2.0));
  const key = new THREE.DirectionalLight(0xfff4df, 3.1);
  key.position.set(-5, 18, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -18; key.shadow.camera.right = 18; key.shadow.camera.top = 15; key.shadow.camera.bottom = -15;
  key.shadow.bias = -0.0004;
  game.scene.add(key);
  game.scene.add(new THREE.AmbientLight(0x344c89, 0.8));
  buildArena();
  buildBall();
  resize();
}

function mat(color, roughness = 0.78, metalness = 0.04, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}
function box(parent, name, size, pos, material, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...pos);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  parent.add(mesh);
  return mesh;
}
function line(parent, points, color, opacity = 1, radius = 0.035) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, points.length * 4), radius, 6, false),
    new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity }));
  parent.add(mesh);
  return mesh;
}

function buildArena() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat(0x101322, 0.94));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.22; floor.receiveShadow = true; game.scene.add(floor);
  const slab = box(game.scene, "court", [25.4, 0.25, 15.4], [0, -0.08, 0], mat(0x20243a, 0.9), { castShadow: false });
  slab.receiveShadow = true;
  const stripeMats = [mat(0x242b43, 0.86), mat(0x1d2339, 0.86)];
  for (let i = 0; i < 12; i++) box(game.scene, `court stripe ${i}`, [2.05, 0.012, 14], [(-11 + i * 2), 0.056, 0], stripeMats[i % 2], { castShadow: false });
  const white = new THREE.MeshBasicMaterial({ color: 0x94a2c5, transparent: true, opacity: 0.58 });
  const marking = (w, h, x, z, t = 0.055) => box(game.scene, "pitch marking", [w, 0.025, h], [x, 0.08, z], white, { castShadow: false, receiveShadow: false });
  marking(24, 0.055, 0, -7); marking(24, 0.055, 0, 7); marking(0.055, 14, -12, 0); marking(0.055, 14, 12, 0); marking(0.055, 14, 0, 0);
  const centerCircle = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.035, 6, 48), new THREE.MeshBasicMaterial({ color: 0x94a2c5, transparent: true, opacity: 0.58 }));
  centerCircle.rotation.x = Math.PI / 2; centerCircle.position.y = 0.09; game.scene.add(centerCircle);
  for (const sign of [-1, 1]) {
    const area = box(game.scene, "goal box line", [0.055, 0.026, 7.8], [sign * 8.5, 0.085, 0], white, { castShadow: false });
    const top = box(game.scene, "goal box top", [3.5, 0.026, 0.055], [sign * 10.25, 0.085, -3.9], white, { castShadow: false });
    box(game.scene, "goal box bottom", [3.5, 0.026, 0.055], [sign * 10.25, 0.085, 3.9], white, { castShadow: false });
    buildGoal(sign);
    // Cage boards and luminous rails frame a compact, enclosed street court.
    box(game.scene, "side board", [25, 0.78, 0.12], [0, 0.35, sign * 7.64], mat(0x10172c, 0.48, 0.28));
    box(game.scene, "side rail", [25.2, 0.055, 0.16], [0, 0.77, sign * 7.64], mat(sign > 0 ? 0x21e9ff : 0xff3ec8, 0.4, 0.25, { emissive: sign > 0 ? 0x07323a : 0x330a28, emissiveIntensity: 1.4 }));
  }
  // End walls have an opening around each goal, with netting rendered as fine neon lines.
  for (const sign of [-1, 1]) {
    for (const z of [-5.9, 5.9]) box(game.scene, "end board", [0.14, 0.9, 2.2], [sign * 12.62, 0.38, z], mat(0x12182b, 0.5, 0.2));
    for (const y of [0.15, 0.65, 1.15, 1.65, 2.15, 2.65]) {
      line(game.scene, [[sign * 12.44, y, -4.8], [sign * 12.44, y, 4.8]], sign < 0 ? 0xff3ec8 : 0x21e9ff, 0.2, 0.012);
    }
    for (let z = -4.8; z <= 4.81; z += 0.5) line(game.scene, [[sign * 12.44, 0.1, z], [sign * 12.44, 2.7, z]], 0x91a0c9, 0.12, 0.009);
  }
  addArenaLights();
  addCrowdAndSkyline();
}

function buildGoal(sign) {
  const frameMat = mat(sign > 0 ? 0xff5669 : 0x32f1ff, 0.3, 0.48, { emissive: sign > 0 ? 0x51101d : 0x06323b, emissiveIntensity: 1.5 });
  const x = sign * 12.03, backX = sign * 13.45, half = FIELD.goalHalf;
  box(game.scene, "goal post", [0.14, 2.45, 0.14], [x, 1.22, -half], frameMat);
  box(game.scene, "goal post", [0.14, 2.45, 0.14], [x, 1.22, half], frameMat);
  box(game.scene, "goal bar", [0.14, 0.14, half * 2], [x, 2.42, 0], frameMat);
  const net = new THREE.MeshBasicMaterial({ color: sign > 0 ? 0xff6374 : 0x4bf4ff, transparent: true, opacity: 0.2 });
  for (let i = 0; i <= 8; i++) {
    const z = -half + i * half * 2 / 8;
    const v = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0.1, z), new THREE.Vector3(backX, 0.1, z), new THREE.Vector3(backX, 2.4, z), new THREE.Vector3(x, 2.4, z)]);
    game.scene.add(new THREE.Line(v, net));
  }
  for (let i = 0; i <= 4; i++) {
    const y = 0.1 + i * 0.575;
    const v = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y, -half), new THREE.Vector3(backX, y, -half), new THREE.Vector3(backX, y, half), new THREE.Vector3(x, y, half)]);
    game.scene.add(new THREE.Line(v, net));
  }
  const glow = new THREE.PointLight(sign > 0 ? 0xff315f : 0x21e9ff, 16, 8, 2);
  glow.position.set(sign * 11.6, 2, 0); game.scene.add(glow);
}

function addArenaLights() {
  for (const x of [-10.5, 0, 10.5]) {
    for (const z of [-8.7, 8.7]) {
      const color = z < 0 ? 0x21e9ff : 0xff3ec8;
      const lamp = box(game.scene, "light tower", [0.2, 5.5, 0.2], [x, 2.7, z], mat(0x33394c, 0.7, 0.4));
      box(game.scene, "light panel", [0.55, 0.18, 0.45], [x, 5.5, z], mat(color, 0.25, 0.2, { emissive: color, emissiveIntensity: 2 }));
      const light = new THREE.PointLight(color, 24, 12, 1.7); light.position.set(x, 5.4, z * 0.76); game.scene.add(light);
    }
  }
}

function addCrowdAndSkyline() {
  const rng = (n) => (Math.sin(n * 127.1 + 31.7) * 43758.5453) % 1;
  for (let i = 0; i < 24; i++) {
    const h = 3 + Math.abs(rng(i + 2)) * 12;
    const x = -24 + i * 2.1;
    const z = i % 2 ? -17 : 17;
    const building = box(game.scene, "night skyline", [1.65, h, 2], [x, h / 2 - 0.2, z], mat(i % 3 === 0 ? 0x151b31 : 0x101629, 0.92), { castShadow: false });
    building.receiveShadow = false;
    for (let w = 0; w < 3; w++) {
      const window = box(game.scene, "window glow", [0.08, 0.12, 0.02], [x - 0.45 + w * 0.42, h * 0.42, z - 1.01], mat(w % 2 ? 0x20c4db : 0xf378bc, 0.4, 0, { emissive: w % 2 ? 0x07313a : 0x300b26, emissiveIntensity: 1.8 }), { castShadow: false });
      window.receiveShadow = false;
    }
  }
  // Low-poly crowd silhouettes create a lively ring without external assets.
  const crowdMat = [mat(0x4d5270, 0.9), mat(0x222b48, 0.9), mat(0x39435e, 0.9)];
  for (let i = 0; i < 92; i++) {
    const side = i % 2 ? -1 : 1;
    const x = -11.5 + (i % 46) * 0.51;
    const z = side * (8.5 + Math.abs(rng(i + 99)) * 1.5);
    const h = 0.45 + Math.abs(rng(i + 33)) * 0.7;
    const person = new THREE.Group(); person.position.set(x, 0.95 + h / 2, z); game.scene.add(person);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, h * 0.55, 2, 5), crowdMat[i % 3]); torso.castShadow = true; person.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), mat(0x9a8290, 0.95)); head.position.y = h * 0.55 + 0.18; person.add(head);
  }
  for (let i = 0; i < 18; i++) {
    const sparkle = new THREE.Mesh(new THREE.SphereGeometry(0.045 + (i % 3) * 0.015, 6, 5), mat(i % 2 ? 0x21e9ff : 0xff3ec8, 0.3, 0, { emissive: i % 2 ? 0x21e9ff : 0xff3ec8, emissiveIntensity: 1.7 }));
    sparkle.position.set(-12 + i * 1.4, 2.5 + Math.abs(Math.sin(i * 5)) * 3, -11.5); game.scene.add(sparkle);
  }
}

function buildBall() {
  game.ball = { pos: new THREE.Vector3(0, 0.3, 0), vel: new THREE.Vector3(), spin: 0, owner: null };
  const group = new THREE.Group();
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.29, 20, 16), mat(0xf4f5ff, 0.35, 0.08));
  sphere.castShadow = true; group.add(sphere);
  const dark = mat(0x151b2d, 0.48, 0.02);
  for (let i = 0; i < 5; i++) {
    const patch = new THREE.Mesh(new THREE.CircleGeometry(0.082, 5), dark);
    patch.position.set(Math.sin(i * 1.256) * 0.2, Math.cos(i * 1.256) * 0.2, 0.205);
    patch.lookAt(patch.position.clone().multiplyScalar(5)); sphere.add(patch);
  }
  game.scene.add(group); game.ballMesh = group;
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.38, 20), new THREE.MeshBasicMaterial({ color: 0x030611, transparent: true, opacity: 0.5 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.075; game.scene.add(shadow); game.ballShadow = shadow;
}

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
function createPlayer(team, index, home) {
  const color = home ? KIT[game.kit] : 0xff4d62;
  const glowColor = home ? KIT[game.kit] : 0xff315f;
  const group = new THREE.Group();
  const uniform = mat(color, 0.5, 0.08, { emissive: glowColor, emissiveIntensity: 0.12 });
  const shorts = mat(home ? 0x18223d : 0x3c1729, 0.82);
  const skin = mat([0xe5b995, 0x9d694a, 0xf0c9a1][index], 0.88);
  const shoe = mat(0xe8ecff, 0.38, 0.04);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.31, 0.46, 4, 8), uniform);
  torso.position.y = 1.07; torso.castShadow = true; group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10), skin);
  head.position.y = 1.82; head.castShadow = true; group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.238, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.48), mat(index === 1 ? 0x1b1721 : 0x30222a));
  hair.position.y = 1.88; group.add(hair);
  const shortMesh = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.22, 0.42), shorts);
  shortMesh.position.y = 0.64; shortMesh.castShadow = true; group.add(shortMesh);
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * 0.15, 0.56, 0);
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.34, 3, 6), shorts);
    limb.position.y = -0.22; limb.castShadow = true; leg.add(limb);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.28), shoe);
    foot.position.set(0, -0.45, -0.07); foot.castShadow = true; leg.add(foot);
    group.add(leg); legs.push(leg);
  }
  const number = new THREE.Mesh(new THREE.PlaneGeometry(0.23, 0.3), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  number.position.set(0, 1.13, 0.312); number.rotation.y = Math.PI; group.add(number);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.035, 6, 32), new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.82 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.1; ring.visible = false; group.add(ring);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.36, 16), new THREE.MeshBasicMaterial({ color: 0x02040a, transparent: true, opacity: 0.32 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.068; group.add(shadow);
  game.scene.add(group);
  const positions = home ? [[-2.2, 0], [-5.7, -3.2], [-5.7, 3.2]] : [[2.2, 0], [5.7, 3.2], [5.7, -3.2]];
  const player = {
    team, home, index, group, legs, ring, pos: v3(positions[index][0], 0, positions[index][1]), vel: v3(),
    face: v3(home ? 1 : -1, 0, 0), speed: home ? 5.2 : 4.7, target: v3(), role: index === 0 ? "pivot" : "wing",
    cooldown: 0, anim: Math.random() * 6, name: home ? ["ACE", "JET", "NOVA"][index] : ["BLAZE", "VEX", "RIOT"][index],
  };
  group.position.copy(player.pos);
  return player;
}
function setupTeams() {
  for (const p of game.players) game.scene.remove(p.group);
  game.players = [];
  game.home = [0, 1, 2].map((i) => createPlayer("NEON", i, true));
  game.away = [0, 1, 2].map((i) => createPlayer("REDLINE", i, false));
  game.players = [...game.home, ...game.away];
  game.user = game.home[0];
  game.user.ring.visible = true;
}
function disposeTeams() {
  for (const p of game.players) {
    game.scene.remove(p.group);
    p.group.traverse((o) => { if (o.geometry && o.geometry !== game.ballMesh?.geometry) o.geometry.dispose(); });
  }
  game.players = []; game.home = []; game.away = [];
}
function startMatch() {
  audio.init(); audio.start();
  game.running = true; game.paused = false; game.ended = false;
  game.time = 120; game.homeScore = 0; game.awayScore = 0; game.stamina = 100;
  game.skillCD = 0; game.skillTime = 0; game.charge = 0; game.charging = false;
  game.shots = 0; game.skills = 0; game.homePoss = 0; game.totalPoss = 0; game.goalTimer = 0;
  ui.menu.classList.add("hidden"); ui.pause.classList.add("hidden"); ui.end.classList.add("hidden");
  ui.hud.classList.remove("hidden"); ui.goal.classList.remove("show");
  setupTeams(); resetBall(0); updateHUD(true); showToast("KICK OFF · YOU ATTACK →");
}
function resetBall(owned = 0) {
  game.ball.pos.set(0, 0.3, 0); game.ball.vel.set(0, 0, 0);
  game.owner = null; game.ball.owner = null;
  if (owned) setOwner(owned > 0 ? game.home[0] : game.away[0]);
  for (const p of game.players) {
    const base = p.home ? [[-2.2, 0], [-5.7, -3.2], [-5.7, 3.2]][p.index] : [[2.2, 0], [5.7, 3.2], [5.7, -3.2]][p.index];
    p.pos.set(base[0], 0, base[1]); p.vel.set(0, 0, 0); p.group.position.copy(p.pos);
  }
}
function setOwner(p) {
  game.owner = p; game.ball.owner = p; game.ball.vel.set(0, 0, 0);
  if (p) game.ball.pos.set(p.pos.x + p.face.x * 0.58, 0.3, p.pos.z + p.face.z * 0.58);
}
function resize() {
  if (!game.renderer) return;
  game.camera.aspect = innerWidth / innerHeight;
  game.camera.fov = innerWidth < 700 ? 50 : 42;
  game.camera.updateProjectionMatrix();
  game.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1.35 : 1.7));
  game.renderer.setSize(innerWidth, innerHeight);
}
function bindUI() {
  $("start-btn").addEventListener("click", startMatch);
  $("playstyles").addEventListener("click", (e) => {
    const card = e.target.closest("[data-style]"); if (!card) return;
    game.style = card.dataset.style;
    document.querySelectorAll(".ps-card").forEach((el) => el.classList.toggle("selected", el === card));
    audio.init(); audio.ui();
  });
  $("difficulty").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-diff]"); if (!btn) return;
    game.difficulty = btn.dataset.diff;
    $("difficulty").querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
  });
  $("kits").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-kit]"); if (!btn) return;
    game.kit = btn.dataset.kit;
    $("kits").querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
  });
  $("pause-btn").addEventListener("click", pauseGame);
  $("resume-btn").addEventListener("click", resumeGame);
  $("restart-btn").addEventListener("click", startMatch);
  $("quit-btn").addEventListener("click", quitToMenu);
  $("rematch-btn").addEventListener("click", startMatch);
  $("menu-btn").addEventListener("click", quitToMenu);
  for (const id of ["sound-btn", "menu-sound"]) $(id).addEventListener("click", () => {
    const muted = audio.toggle();
    document.querySelectorAll(".sound").forEach((b) => b.classList.toggle("muted", muted));
  });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  bindJoystick();
  bindHold(ui.shoot, () => { if (!game.running || game.paused) return; game.charging = true; game.charge = 0; $("shot-aim").classList.add("show"); }, () => releaseShot());
  ui.pass.addEventListener("pointerdown", (e) => { e.preventDefault(); passBall(); });
  ui.skill.addEventListener("pointerdown", (e) => { e.preventDefault(); useSkill(); });
  bindHold(ui.sprint, () => { game.sprinting = true; }, () => { game.sprinting = false; });
  ui.canvas.addEventListener("pointerdown", (e) => {
    if (!game.running || game.paused || e.target.closest?.("button")) return;
    if (e.clientX > innerWidth * 0.5) { game.charging = true; game.charge = 0; $("shot-aim").classList.add("show"); }
  });
  ui.canvas.addEventListener("pointerup", () => { if (game.charging) releaseShot(); });
}
function bindHold(el, down, up) {
  el.addEventListener("pointerdown", (e) => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); down(); });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(event, (e) => { e.preventDefault?.(); up(); });
}
function bindJoystick() {
  let pointer = null;
  const move = (e) => {
    if (pointer !== e.pointerId) return;
    const r = ui.joystick.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const radius = Math.min(r.width, r.height) * 0.34;
    const len = Math.min(radius, Math.hypot(dx, dy));
    const nx = Math.hypot(dx, dy) ? dx / Math.hypot(dx, dy) : 0, ny = Math.hypot(dx, dy) ? dy / Math.hypot(dx, dy) : 0;
    ui.knob.style.transform = `translate(${nx * len}px, ${ny * len}px)`;
    game.input.set(nx * len / radius, -ny * len / radius);
  };
  ui.joystick.addEventListener("pointerdown", (e) => { e.preventDefault(); pointer = e.pointerId; ui.joystick.setPointerCapture(e.pointerId); move(e); });
  ui.joystick.addEventListener("pointermove", move);
  const release = (e) => { if (pointer !== e.pointerId) return; pointer = null; game.input.set(0, 0); ui.knob.style.transform = "translate(0, 0)"; };
  ui.joystick.addEventListener("pointerup", release); ui.joystick.addEventListener("pointercancel", release);
}
function onKeyDown(e) {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if (e.code === "Escape" && game.running) { game.paused ? resumeGame() : pauseGame(); return; }
  game.key[e.code] = true;
  if (e.repeat || !game.running || game.paused) return;
  if (e.code === "Space") { game.charging = true; game.charge = 0; $("shot-aim").classList.add("show"); }
  if (e.code === "KeyE") passBall();
  if (e.code === "KeyQ") useSkill();
}
function onKeyUp(e) {
  game.key[e.code] = false;
  if (e.code === "Space" && game.charging) releaseShot();
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") game.sprinting = false;
}
function pauseGame() {
  if (!game.running || game.paused || game.ended) return;
  game.paused = true; game.sprinting = false; game.charging = false;
  $("pause-home").textContent = game.homeScore; $("pause-away").textContent = game.awayScore;
  ui.pause.classList.remove("hidden");
}
function resumeGame() { game.paused = false; ui.pause.classList.add("hidden"); audio.init(); audio.start(); }
function quitToMenu() {
  game.running = false; game.paused = false; game.ended = false;
  ui.pause.classList.add("hidden"); ui.end.classList.add("hidden"); ui.hud.classList.add("hidden"); ui.menu.classList.remove("hidden");
  ui.goal.classList.remove("show"); disposeTeams(); setOwner(null); game.ball.pos.set(0, 0.3, 0); game.ballMesh.position.copy(game.ball.pos);
}
function currentInput() {
  const x = (game.key.KeyD || game.key.ArrowRight ? 1 : 0) - (game.key.KeyA || game.key.ArrowLeft ? 1 : 0);
  const y = (game.key.KeyW || game.key.ArrowUp ? 1 : 0) - (game.key.KeyS || game.key.ArrowDown ? 1 : 0);
  const k = new THREE.Vector2(x, y);
  if (k.lengthSq()) k.normalize();
  if (game.input.lengthSq() > k.lengthSq()) k.copy(game.input);
  return k;
}
