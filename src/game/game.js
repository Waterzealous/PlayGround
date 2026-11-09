import * as THREE from 'three';
import {
  BASE, DIFFICULTY, FIELD, FORMATION, MATCH, PLAYSTYLES, ROSTER, TEAMS,
} from './constants.js';
import { Ball } from './ball.js';
import { Player } from './player.js';
import { updateAI, updateKeepers, resolveKeeperBall } from './ai.js';

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const horizDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Game {
  constructor({ scene, camera, renderer, input, audio, effects, ui }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.effects = effects;
    this.ui = ui;

    this.state = 'menu';
    this.prevState = null;
    this.now = 0;
    this.styleId = localStorage.getItem('neon-style') || 'showman';
    this.difficultyId = localStorage.getItem('neon-diff') || 'pro';
    if (!PLAYSTYLES[this.styleId]) this.styleId = 'showman';
    if (!DIFFICULTY[this.difficultyId]) this.difficultyId = 'pro';

    this.score = { home: 0, away: 0 };
    this.stats = { shots: 0, tackles: 0, passes: 0 };
    this.timeLeft = MATCH.duration;
    this.golden = false;
    this.possessionTime = { home: 0, away: 0 };
    this.matchElapsed = 0;
    this.goalScorer = null;
    this.goalTeam = null;
    this.pendingEnd = false;
    this.goalTimer = 0;
    this.kickoffTimer = 0;
    this.keeperHold = 0;
    this.controlLock = 0;
    this.controlled = null;
    this.owner = null;
    this.charging = false;
    this.chargeTime = 0;
    this.chargeOwner = null;
    this.hitStop = 0;
    this.shake = 0;
    this.wallSoundCd = 0;
    this.runDust = 0;
    this.hudTimer = 0;
    this.aimTimer = 0;
    this.passTimer = 0;
    this.orbitTime = 0;
    this.switchTimer = 0;
    this.cameraFov = 52;
    this.camPos = new THREE.Vector3(21, 14, -29);
    this.camLook = new THREE.Vector3(0, 1.2, 0);
    this.aimTarget = new THREE.Vector3();
    this.prevBallPos = new THREE.Vector3();
    this.statsFlash = 0;
    this.lastPassTarget = null;
    this.aiPassTarget = null;
    this.difficulty = DIFFICULTY[this.difficultyId];
    this.playstyle = PLAYSTYLES[this.styleId];

    this.ball = new Ball(scene);
    this.players = [];
    this.homeTeam = { players: [], keeper: null };
    this.awayTeam = { players: [], keeper: null };
    this.buildPlayers();
    this.resetForKickoff('home', true, true);
    this.buildAimGuide();
    this.players.forEach((p) => {
      p.setControlled(false);
      p.setOwner(false);
    });
    this.owner = null;
    this.ball.owner = null;
    this.controlled = null;
    this.ball.reset(0, 0);
    this.state = 'menu';
  }

  buildPlayers() {
    for (const p of this.players) p.dispose();
    this.players = [];
    this.homeTeam = { players: [], keeper: null };
    this.awayTeam = { players: [], keeper: null };
    const numbers = { home: [9, 7, 11, 1], away: [10, 6, 8, 1] };

    for (const teamId of ['home', 'away']) {
      const team = TEAMS[teamId];
      const roster = ROSTER[teamId];
      const outfield = [];
      roster.forEach((data, i) => {
        const isKeeper = data.role === 'keeper';
        const style = teamId === 'home' ? PLAYSTYLES[this.styleId] : null;
        const player = new Player({
          scene: this.scene,
          team,
          data,
          isKeeper,
          style,
          number: numbers[teamId][i],
          quality: teamId === 'away' ? this.difficulty?.aiSpeed ?? 1 : 1,
        });
        player.aiShootCd = 0.5 + Math.random();
        player.aiPassCd = 0.6 + Math.random() * 0.6;
        player.aiTarget = new THREE.Vector2();
        player.aiSpeedMul = 1;
        player.aiSprint = false;
        player.aiTimer = Math.random() * 0.2;
        player.role = data.role;
        this.players.push(player);
        if (isKeeper) {
          if (teamId === 'home') this.homeTeam.keeper = player;
          else this.awayTeam.keeper = player;
        } else {
          outfield.push(player);
          if (teamId === 'home') this.homeTeam.players.push(player);
          else this.awayTeam.players.push(player);
        }
      });
    }
  }

  applyPlaystyle(styleId) {
    this.styleId = styleId;
    this.playstyle = PLAYSTYLES[styleId] || PLAYSTYLES.showman;
    localStorage.setItem('neon-style', styleId);
    for (const p of this.homeTeam.players) {
      p.style = this.playstyle;
      p.stats.speed = BASE.speed * this.playstyle.speed;
      p.stats.sprint = BASE.sprintSpeed * this.playstyle.sprint;
      p.stats.control = this.playstyle.control;
      p.stats.shotPower = this.playstyle.shotPower;
      p.stats.shotAccuracy = this.playstyle.shotAccuracy;
      p.stats.curve = this.playstyle.curve;
      p.stats.tackle = this.playstyle.tackle;
      p.stats.stamina = this.playstyle.stamina;
      p.stats.strength = this.playstyle.strength;
    }
    this.ui?.setStyle?.(styleId);
  }

  setDifficulty(id) {
    if (!DIFFICULTY[id]) return;
    this.difficultyId = id;
    this.difficulty = DIFFICULTY[id];
    localStorage.setItem('neon-diff', id);
  }

  startMatch(styleId = this.styleId, difficultyId = this.difficultyId) {
    this.applyPlaystyle(styleId);
    this.setDifficulty(difficultyId);
    this.score = { home: 0, away: 0 };
    this.stats = { shots: 0, tackles: 0, passes: 0 };
    this.timeLeft = MATCH.duration;
    this.golden = false;
    this.possessionTime = { home: 0, away: 0 };
    this.matchElapsed = 0;
    this.pendingEnd = false;
    this.goalScorer = null;
    this.goalTeam = null;
    this.charging = false;
    this.chargeTime = 0;
    this.hitStop = 0;
    this.shake = 0;
    this.ui?.hideMenu?.();
    this.ui?.hideEnd?.();
    this.ui?.hidePause?.();
    this.ui?.showHud?.();
    this.ui?.updateHud?.(this.hudData());
    this.ui?.setHint?.('HOLD SHOOT · RELEASE IN THE GREEN');
    this.audio?.whistle?.();
    this.resetForKickoff('home', true, true);
    this.state = 'play';
    this.ui?.toast?.('KICK OFF', '');
    setTimeout(() => {
      if (this.state === 'play') this.ui?.setHint?.('');
    }, 5500);
  }

  resetForKickoff(kickoffTeam, first = false, snapCamera = false) {
    this.state = 'play';
    this.pendingEnd = false;
    this.charging = false;
    this.chargeOwner = null;
    this.chargeTime = 0;
    this.ui?.setCharge?.(0, false, false);
    this.kickoffTimer = 0.75;
    this.controlLock = 0.25;
    this.switchTimer = 0;
    this.keeperHold = 0;
    this.postCd = 0;
    this.ball.reset(0, 0);
    this.owner = null;
    this.controlled = null;

    for (const p of this.players) {
      p.setOwner(false);
      p.setControlled(false);
      p.charge = 0;
      p.dive.active = false;
      p.action = { name: null, t: 0, dur: 0 };
      p.slideTimer = 0;
      p.skillTimer = 0;
      p.targetRing.visible = false;
      const base = FORMATION[p.team.id][p.role];
      let x = base[0];
      let z = base[1];
      if (p.role === 'striker' && p.team.id === kickoffTeam) z = p.team.dir > 0 ? -1.15 : 1.15;
      if (first) p.stamina = 100;
      p.setPosition(x, z, p.team.dir > 0 ? 0 : Math.PI);
    }

    const kicker = kickoffTeam === 'home' ? this.homeTeam.players.find((p) => p.role === 'striker') : this.awayTeam.players.find((p) => p.role === 'striker');
    if (kicker) {
      kicker.root.position.set(kicker.pos.x, 0, kicker.pos.z);
      this.giveBall(kicker);
    }
    const keeper = kickoffTeam === 'home' ? this.homeTeam.keeper : this.awayTeam.keeper;
    if (keeper) keeper.setPosition(keeper.pos.x, keeper.pos.z, kickoffTeam === 'home' ? 0 : Math.PI);
    this.ball.pos.set(0, this.ball.radius, 0);
    this.ball.mesh.position.copy(this.ball.pos);
    this.setControlled(kicker && kicker.team.id === 'home' ? kicker : this.nearestHomeToBall());
    this.ui?.updateHud?.(this.hudData());
    if (snapCamera) this.snapCamera();
  }

  giveBall(player) {
    if (!player) return;
    if (this.owner && this.owner !== player) this.owner.setOwner(false);
    this.owner = player;
    this.ball.owner = player;
    this.ball.vel.set(0, 0, 0);
    this.ball.spin = 0;
    this.ball.pickupLock = 0.1;
    const fx = Math.sin(player.facing);
    const fz = Math.cos(player.facing);
    const side = 0.3;
    this.ball.pos.set(
      player.pos.x + fx * 0.58 + Math.cos(player.facing) * side,
      this.ball.radius,
      player.pos.z + fz * 0.58 - Math.sin(player.facing) * side
    );
    this.ball.mesh.position.copy(this.ball.pos);
    player.setOwner(true, player.team.color);
    if (player.team.id === 'home' && !player.isKeeper) this.setControlled(player);
  }

  setControlled(player) {
    if (!player || player.isKeeper) player = this.nearestHomeToBall();
    if (this.controlled === player) {
      player?.setControlled(true);
      return;
    }
    if (this.controlled) this.controlled.setControlled(false);
    this.controlled = player;
    if (player) {
      player.setControlled(true);
      this.ui?.setPlayer?.(player.name, player.style?.name ?? this.playstyle.name);
    }
  }

  nearestHomeToBall(exclude = null) {
    let best = null;
    let bestD = Infinity;
    for (const p of this.homeTeam.players) {
      if (p === exclude) continue;
      const d = horizDist(p.pos, this.ball.pos);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  switchToNextDefender() {
    const sorted = [...this.homeTeam.players].sort((a, b) => horizDist(a.pos, this.ball.pos) - horizDist(b.pos, this.ball.pos));
    if (!sorted.length) return;
    const idx = sorted.indexOf(this.controlled);
    const next = sorted[(idx + 1) % sorted.length];
    this.setControlled(next);
    this.controlLock = 0.7;
  }

  hudData() {
    const total = this.possessionTime.home + this.possessionTime.away;
    const possession = total > 0 ? Math.round((this.possessionTime.home / total) * 100) : 50;
    return {
      score: { ...this.score },
      timeLeft: this.timeLeft,
      golden: this.golden,
      stamina: this.controlled?.stamina ?? 100,
      playerName: this.controlled?.name ?? 'NOVA',
      styleId: this.styleId,
      styleName: this.playstyle.name,
      shots: this.stats.shots,
      possession,
      tackles: this.stats.tackles,
    };
  }

  snapCamera() {
    const aspect = this.renderer.domElement.clientWidth / Math.max(1, this.renderer.domElement.clientHeight);
    const portrait = aspect < 0.95;
    const focus = this.cameraFocus();
    const dist = portrait ? 20.4 : 18.5;
    const height = portrait ? 13.4 : 11.6;
    this.camPos.set(focus.x * 0.52, height, clamp(focus.z - dist, -FIELD.halfLength - 6, FIELD.halfLength - 4));
    this.camLook.set(focus.x * 0.68, 0.95, focus.z + (portrait ? 5.9 : 7));
  }

  cameraFocus() {
    const focus = new THREE.Vector3();
    const ballPos = this.ball.pos;
    const playerPos = this.controlled?.pos ?? ballPos;
    focus.x = ballPos.x * 0.62 + playerPos.x * 0.38;
    focus.z = ballPos.z * 0.62 + playerPos.z * 0.38;
    focus.y = 0;
    return focus;
  }

  // ============================ FLOW ============================
  update(dt) {
    this.now += dt;
    this.wallSoundCd = Math.max(0, this.wallSoundCd - dt);
    this.shake = Math.max(0, this.shake - dt * 2.6);

    if (this.state === 'paused') return;
    this.effects.update(dt);

    if (this.state === 'menu') {
      this.updateMenu(dt);
      this.updateMenuCamera(dt);
      return;
    }
    if (this.state === 'goal') {
      this.updateGoal(dt);
      this.updateGoalCamera(dt);
      return;
    }
    if (this.state === 'ended') {
      this.updateEnded(dt);
      this.updateEndCamera(dt);
      return;
    }
    if (this.state === 'play') {
      this.updatePlay(dt);
    }
  }

  updateMenu(dt) {
    this.orbitTime += dt;
    this.ball.mesh.position.set(0, FIELD.ballRadius + Math.sin(this.now * 1.4) * 0.09, 0);
    this.ball.mesh.rotation.y += dt * 0.8;
    this.ball.mesh.rotation.x += dt * 0.22;
    this.ball.glow.position.set(0, 0.03, 0);
    for (const p of this.players) {
      p.update(dt, 0, 0, false, 0);
      p.root.position.set(p.pos.x, 0, p.pos.z);
    }
  }

  updatePlay(dt) {
    this.matchElapsed += dt;
    this.kickoffTimer = Math.max(0, this.kickoffTimer - dt);
    this.controlLock = Math.max(0, this.controlLock - dt);
    this.postCd = Math.max(0, (this.postCd || 0) - dt);

    if (!this.golden) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        if (this.score.home === this.score.away) {
          if (!this.golden) {
            this.golden = true;
            this.audio?.whistle?.();
            this.ui?.toast?.('GOLDEN GOAL · NEXT GOAL WINS', 'danger');
            this.ui?.updateHud?.(this.hudData());
          }
        } else {
          this.endMatch('FULL TIME');
          return;
        }
      }
    }

    this.handleHumanInput(dt);
    if (this.state !== 'play') return;

    updateAI(this, dt);
    updateKeepers(this, dt);
    this.updatePlayerPhysics(dt);
    this.collidePlayers();
    this.updateBallPhysics(dt);

    this.checkPosts();
    if (this.state !== 'play') return;
    this.checkGoal();
    if (this.state !== 'play') return;

    resolveKeeperBall(this);
    this.ballBoundaries();
    this.resolvePossession(dt);
    this.updateControlSwitch();
    this.updateAimGuide();
    this.spawnRunningEffects(dt);
    this.updatePassIndicator(dt);
    this.updateCamera(dt);

    if (this.owner) this.possessionTime[this.owner.team.id] += dt;

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.ui?.updateHud?.(this.hudData());
    }
  }

  updateGoal(dt) {
    this.goalTimer -= dt;
    this.orbitTime += dt;
    this.ball.update(dt * 0.55);
    // keep the ball inside the net
    const dir = Math.sign(this.goalZ || 1);
    const maxZ = FIELD.halfLength + FIELD.goalDepth - 0.45;
    if (Math.abs(this.ball.pos.z) > maxZ) {
      this.ball.pos.z = Math.sign(this.ball.pos.z) * maxZ;
      this.ball.vel.z *= -0.35;
      this.ball.vel.x *= 0.7;
      this.ball.vel.y *= 0.5;
    }
    this.ball.pos.x = clamp(this.ball.pos.x, -FIELD.goalWidth / 2 + 0.3, FIELD.goalWidth / 2 - 0.3);

    for (const p of this.players) {
      if (p === this.controlled) continue;
      p.update(dt * 0.7, 0, 0, false, 0);
    }
    if (this.controlled) this.controlled.update(dt * 0.7, 0, 0, false, 0);

    if (this.goalTimer <= 0) {
      if (this.pendingEnd) {
        this.endMatch(this.golden ? 'GOLDEN GOAL' : 'FULL TIME');
      } else {
        this.resetForKickoff(this.concededTeam || 'home');
        this.audio?.whistle?.();
        this.ui?.toast?.('KICK OFF', '');
      }
    }
  }

  updateEnded(dt) {
    this.orbitTime += dt;
    for (const p of this.players) p.update(dt, 0, 0, false, 0);
    this.ball.update(dt * 0.4);
  }

  pause() {
    if (this.state !== 'play') return;
    this.prevState = this.state;
    this.state = 'paused';
    this.cancelCharge();
    this.ui?.showPause?.(this.score);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = this.prevState || 'play';
    this.prevState = null;
    this.ui?.hidePause?.();
  }

  togglePause() {
    if (this.state === 'paused') this.resume();
    else this.pause();
  }

  restart() {
    this.ui?.hidePause?.();
    this.startMatch(this.styleId, this.difficultyId);
  }

  returnToMenu() {
    this.cancelCharge();
    this.state = 'menu';
    this.pendingEnd = false;
    this.charging = false;
    this.owner = null;
    this.ball.owner = null;
    for (const p of this.players) {
      p.setOwner(false);
      p.setControlled(false);
      p.celebrate = false;
      p.dive.active = false;
      p.action = { name: null, t: 0, dur: 0 };
      const base = FORMATION[p.team.id][p.role];
      p.setPosition(base[0], base[1], p.team.dir > 0 ? 0 : Math.PI);
    }
    this.ball.reset(0, 0);
    this.ball.mesh.position.set(0, FIELD.ballRadius, 0);
    this.controlled = null;
    this.ui?.hideHud?.();
    this.ui?.hidePause?.();
    this.ui?.hideEnd?.();
    this.ui?.hideGoal?.();
    this.ui?.showMenu?.();
    this.snapCamera();
  }

  // ============================ HUMAN INPUT ============================
  handleHumanInput(dt) {
    if (!this.controlled) return;
    const axes = this.input.moveAxes();
    const shootPressed = this.input.wasPressed('shoot');
    const shootReleased = this.input.wasReleased('shoot');

    if (shootPressed) {
      if (this.owner && this.owner.team.id === 'home' && !this.owner.isKeeper) {
        this.startCharge(this.owner);
      } else if (!this.owner) {
        const near = horizDist(this.ball.pos, this.controlled.pos) < 2.2 && this.ball.pos.y < 2.5;
        if (near) this.volley(this.controlled, axes);
      }
    }

    if (this.charging) {
      if (!this.owner || this.owner !== this.chargeOwner || this.owner.team.id !== 'home') {
        this.cancelCharge();
      } else {
        this.chargeTime += dt;
        const ratio = Math.min(1, this.chargeTime / BASE.shotCharge);
        this.chargeOwner.charge = ratio;
        const perfect = ratio >= this.perfectMin() && ratio <= this.perfectMax();
        this.ui?.setCharge?.(ratio, perfect, true);
        if (shootReleased) {
          const owner = this.chargeOwner;
          this.shoot(owner, ratio, perfect, false, axes);
          this.cancelCharge();
        }
      }
    }

    if (this.input.wasPressed('pass')) {
      if (this.charging) this.cancelCharge();
      if (this.owner && this.owner.team.id === 'home' && !this.owner.isKeeper) {
        this.passBall(this.owner, this.input.isDown('sprint'), axes);
      } else {
        this.switchToNextDefender();
      }
    }

    if (this.input.wasPressed('skill')) {
      if (this.charging) this.cancelCharge();
      if (this.owner && this.owner.team.id === 'home' && !this.owner.isKeeper) {
        this.skillMove(this.owner, axes);
      } else if (this.controlled) {
        this.slideTackle(this.controlled, axes);
      }
    }
  }

  startCharge(player) {
    this.charging = true;
    this.chargeTime = 0;
    this.chargeOwner = player;
    this.controlLock = 0.3;
    player.charge = 0;
  }

  cancelCharge(ui = true) {
    if (this.chargeOwner) this.chargeOwner.charge = 0;
    this.charging = false;
    this.chargeTime = 0;
    this.chargeOwner = null;
    if (ui) this.ui?.setCharge?.(0, false, false);
    if (this.aimLine) this.aimLine.visible = false;
    if (this.aimRing) this.aimRing.visible = false;
  }

  perfectMin() {
    return this.styleId === 'sniper' ? 0.64 : 0.7;
  }

  perfectMax() {
    return this.styleId === 'sniper' ? 0.94 : 0.9;
  }

  computeShot(player, ratio, axes = null, aiOpts = null) {
    const goalZ = player.team.dir * FIELD.halfLength;
    const aimInput = aiOpts?.aimX != null ? aiOpts.aimX : clamp(axes?.x ?? 0, -1, 1);
    let targetX = aimInput * (FIELD.goalWidth / 2 - 0.75) - player.pos.x * 0.17;
    if (Math.abs(aimInput) < 0.12) targetX -= player.pos.x * 0.12;
    targetX = clamp(targetX, -FIELD.goalWidth / 2 + 0.35, FIELD.goalWidth / 2 - 0.35);
    let targetY = clamp(0.36 + ratio * 2.1 + (aiOpts?.liftY ?? 0), 0.36, FIELD.goalHeight - 0.22);
    if (ratio < 0.2) targetY = 0.42;

    const dx = targetX - this.ball.pos.x;
    const dz = goalZ - this.ball.pos.z;
    const dist = Math.hypot(dx, dz);
    const perfect = aiOpts?.perfect ?? false;
    let speed = (22.5 + 13.5 * ratio) * player.stats.shotPower;
    if (perfect) speed *= 1.14;
    if (aiOpts) speed *= 0.94 + (aiOpts.skill ?? 0.75) * 0.14;
    const t = Math.max(0.12, dist / speed);
    let lift = (targetY - this.ball.pos.y) / t + 0.5 * BASE.gravity * t;
    lift = clamp(lift, 0.4, 10.5);

    let angle = Math.atan2(dx, dz);
    let spread = (0.024 + (1 - ratio) * 0.02) / Math.max(0.8, player.stats.shotAccuracy);
    if (perfect) spread *= 0.3;
    if (aiOpts) spread *= Math.max(0.35, 1.85 - (aiOpts.skill ?? 0.75) * 1.35);
    angle += (Math.random() - 0.5) * spread;
    lift += (Math.random() - 0.5) * spread * 10;

    const spin = Math.sign(targetX - this.ball.pos.x || 1) * (4.2 + ratio * 5.2) * player.stats.curve * (perfect ? 1.14 : 1);
    return {
      dir: new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)),
      speed,
      lift,
      spin,
      targetX,
      targetY,
      goalZ,
      perfect,
    };
  }

  shoot(player, ratio, perfect = false, ai = false, axes = null, aiOpts = null) {
    if (!player) return;
    const opts = ai ? { ...(aiOpts || {}), skill: this.difficulty.shotSkill, perfect } : null;
    const shot = this.computeShot(player, ratio, axes, opts);
    shot.perfect = perfect;

    if (this.owner === player) {
      player.setOwner(false);
      this.owner = null;
    }
    this.ball.kick(shot.dir, shot.speed, shot.lift, shot.spin);
    this.ball.lastKicker = player;
    this.lastTouch = player;
    this.ball.passTarget = null;
    player.play('kick', 0.24);
    player.charge = 0;
    player.kickCooldown = 0.22;
    this.effects.kickBurst(this.ball.pos, player.team.color, 0.6 + ratio * 0.8);
    this.audio?.shot?.(ratio, perfect);
    this.shake = Math.max(this.shake, 0.14 + ratio * 0.22);
    if (player.team.id === 'home') this.stats.shots += 1;
    if (perfect && !ai) {
      this.hitStop = 0.09;
      this.ui?.toast?.('PERFECT STRIKE', '');
      this.audio?.perfect?.();
    }
    if (ai && ratio > 0.8) this.audio?.kick?.(ratio);
    this.controlLock = Math.max(this.controlLock, 0.25);
  }

  volley(player, axes) {
    const shot = this.computeShot(player, 0.78, axes, { skill: 0.85 });
    shot.lift += 1.2;
    this.ball.kick(shot.dir, shot.speed * 0.94, shot.lift, shot.spin * 0.7);
    this.ball.lastKicker = player;
    this.lastTouch = player;
    this.ball.passTarget = null;
    player.play('kick', 0.22);
    this.effects.kickBurst(this.ball.pos, player.team.color, 1.2);
    this.audio?.shot?.(0.8, false);
    this.shake = Math.max(this.shake, 0.2);
    if (player.team.id === 'home') {
      this.stats.shots += 1;
      this.ui?.toast?.('VOLLEY!', '');
    }
  }

  findPassTarget(player, axes = null, lofted = false) {
    let aimX;
    let aimZ;
    if (axes && Math.hypot(axes.x, axes.y) > 0.3) {
      const l = Math.hypot(axes.x, axes.y);
      aimX = axes.x / l;
      aimZ = axes.y / l;
    } else {
      aimX = Math.sin(player.facing);
      aimZ = Math.cos(player.facing);
    }
    const goalZ = player.team.dir * FIELD.halfLength;
    let best = null;
    let bestScore = -Infinity;
    for (const t of this.players) {
      if (t === player || t.team.id !== player.team.id || t.isKeeper) continue;
      const dx = t.pos.x - player.pos.x;
      const dz = t.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.5) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      const dot = nx * aimX + nz * aimZ;
      let score = dot * 1.7 - dist * 0.025;
      score += ((t.pos.z - player.pos.z) * player.team.dir) * 0.065;
      score += (t.pos.z * player.team.dir) * 0.012;
      // lane clearance
      let lanePenalty = 0;
      for (const o of this.players) {
        if (o.team.id === player.team.id || o.isKeeper) continue;
        const t2 = ((o.pos.x - player.pos.x) * dx + (o.pos.z - player.pos.z) * dz) / (dist * dist);
        if (t2 < 0.04 || t2 > 0.98) continue;
        const px = player.pos.x + dx * t2;
        const pz = player.pos.z + dz * t2;
        const off = Math.hypot(o.pos.x - px, o.pos.z - pz);
        if (off < 0.85) lanePenalty += 1.1;
        else if (off < 1.65) lanePenalty += 0.45;
      }
      score -= lanePenalty;
      let space = 99;
      for (const o of this.players) {
        if (o.team.id === player.team.id) continue;
        if (o.isKeeper) continue;
        space = Math.min(space, horizDist(o.pos, t.pos));
      }
      if (space > 5) score += 0.6;
      else if (space < 2.5) score -= 0.45;
      if (dist > 25) score -= 0.6;
      if (lofted) score += (t.pos.z - player.pos.z) * player.team.dir * 0.02;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  passBall(player, lofted = false, axes = null) {
    if (!player) return null;
    const target = this.findPassTarget(player, axes, lofted);
    player.play('kick', 0.2);
    this.audio?.pass?.();
    if (!target) {
      const dir = new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing));
      this.ball.kick(dir, 19, lofted ? 5.5 : 0.6, 0);
      this.ball.lastKicker = player;
      this.lastTouch = player;
      if (this.owner === player) {
        player.setOwner(false);
        this.owner = null;
      }
      this.effects.kickBurst(this.ball.pos, player.team.color, 0.4);
      return null;
    }
    const lead = lofted ? 4.2 : 1.0;
    const tx = target.pos.x + target.vel.x * 0.25;
    const tz = target.pos.z + target.vel.z * 0.25 + player.team.dir * lead;
    const dx = tx - this.ball.pos.x;
    const dz = tz - this.ball.pos.z;
    const dist = Math.max(1, Math.hypot(dx, dz));
    let angle = Math.atan2(dx, dz);
    angle += (Math.random() - 0.5) * (0.028 / Math.max(0.9, player.stats.control));
    if (lofted) angle = Math.atan2(dx, dz);
    const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const speed = lofted ? clamp(11 + dist * 0.62, 13, 23) : clamp(8 + dist * 1.08, 12, 25);
    const lift = lofted ? clamp(3.6 + dist * 0.11, 4, 8.5) : 0.35;
    const spin = lofted ? 0 : (Math.random() - 0.5) * 1.6;

    if (this.owner === player) {
      player.setOwner(false);
      this.owner = null;
    }
    this.ball.kick(dir, speed, lift, spin);
    this.ball.lastKicker = player;
    this.ball.lastPass = player;
    this.ball.passTarget = target;
    this.ball.passTeam = player.team.id;
    this.ball.passTimer = 1.6;
    this.lastTouch = player;
    this.effects.kickBurst(this.ball.pos, player.team.color, 0.25);
    this.aiPassTarget = target;
    if (player.team.id === 'home') {
      this.stats.passes += 1;
      this.setControlled(target);
      this.controlLock = 0.85;
      this.lastPassTarget = target;
      target.targetRing.visible = true;
      target.targetRing.material.color.setHex(0x44f3ff);
    }
    this.controlLock = Math.max(this.controlLock, 0.6);
    return target;
  }

  skillMove(player, axes) {
    if (player.skillCooldown > 0) return;
    if (this.owner !== player) return;
    let dx = axes.x;
    let dz = axes.y;
    if (Math.hypot(dx, dz) < 0.2) {
      dx = Math.sin(player.facing);
      dz = Math.cos(player.facing);
    }
    player.startSkill(dx, dz);
    this.effects.ring(player.pos, player.team.color, 2.6);
    this.effects.burst(new THREE.Vector3(player.pos.x, 0.5, player.pos.z), 10, player.team.color, 3, { life: 0.4 });
    this.audio?.skillMove?.();
    this.shake = Math.max(this.shake, 0.1);
    this.controlLock = Math.max(this.controlLock, 0.25);
  }

  slideTackle(player, axes) {
    if (player.tackleCooldown > 0 || player.slideTimer > 0) return;
    let dx = axes.x;
    let dz = axes.y;
    if (Math.hypot(dx, dz) < 0.2) {
      dx = Math.sin(player.facing);
      dz = Math.cos(player.facing);
    }
    player.startSlide(dx, dz);
    this.effects.ring(player.pos, 0xffffff, 2.2);
    this.effects.burst(new THREE.Vector3(player.pos.x, 0.2, player.pos.z), 12, 0x9fc8dd, 3, { gravity: 3 });
    this.audio?.slide?.();
    this.shake = Math.max(this.shake, 0.08);
  }

  buildAimGuide() {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(20 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.aimLine = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: this.playstyle.color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.aimLine.frustumCulled = false;
    this.aimLine.visible = false;
    this.scene.add(this.aimLine);

    this.aimRing = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.64, 40),
      new THREE.MeshBasicMaterial({ color: this.playstyle.color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
    );
    this.aimRing.rotation.x = -Math.PI / 2;
    this.aimRing.visible = false;
    this.scene.add(this.aimRing);
  }

  updateAimGuide() {
    if (!this.aimLine) return;
    if (!this.charging || !this.owner || !this.chargeOwner) {
      this.aimLine.visible = false;
      this.aimRing.visible = false;
      return;
    }
    const axes = this.input.moveAxes();
    const ratio = Math.min(1, this.chargeTime / BASE.shotCharge);
    const shot = this.computeShot(this.chargeOwner, ratio, axes);
    const positions = this.aimLine.geometry.attributes.position.array;
    const n = 20;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = lerp(this.ball.pos.x, shot.targetX, t) + Math.sin(t * Math.PI) * shot.spin * 0.045;
      const z = lerp(this.ball.pos.z, shot.goalZ, t);
      positions[i * 3] = x;
      positions[i * 3 + 1] = 0.045;
      positions[i * 3 + 2] = z;
    }
    this.aimLine.geometry.attributes.position.needsUpdate = true;
    this.aimLine.visible = true;
    this.aimLine.material.color.setHex(this.playstyle.color);
    this.aimLine.material.opacity = 0.3 + ratio * 0.35;
    this.aimRing.visible = true;
    this.aimRing.position.set(shot.targetX, 0.05, shot.goalZ - this.chargeOwner.team.dir * 0.18);
    const pulse = 1 + Math.sin(this.now * 8) * 0.08;
    this.aimRing.scale.setScalar(pulse * (0.8 + ratio * 0.4));
    this.aimRing.material.color.setHex(this.playstyle.color);
  }

  updatePassIndicator(dt) {
    this.passTimer -= dt;
    if (this.passTimer > 0) return;
    this.passTimer = 0.15;
    for (const p of this.players) p.targetRing.visible = false;
    if (this.charging) return;
    if (!this.owner || this.owner.team.id !== 'home' || this.owner.isKeeper) {
      if (this.lastPassTarget) {
        this.lastPassTarget.targetRing.visible = true;
        this.lastPassTarget.targetRing.material.color.setHex(0x44f3ff);
      }
      return;
    }
    const target = this.findPassTarget(this.owner, this.input.moveAxes(), false);
    if (target) {
      target.targetRing.visible = true;
      target.targetRing.material.color.setHex(0x44f3ff);
      target.targetRing.material.opacity = 0.48;
      this.lastPassTarget = target;
    }
  }

  // ============================ PHYSICS & CONTACT ============================
  updatePlayerPhysics(dt) {
    const diffSpeed = this.difficulty.aiSpeed;
    for (const p of this.players) {
      if (p === this.controlled) {
        const axes = this.input.moveAxes();
        p.update(dt, axes.x, axes.y, this.input.isDown('sprint'), 1);
      } else if (p.isKeeper) {
        p.update(dt, p.intent.x, p.intent.y, p.aiSprint, p.aiSpeedMul);
      } else {
        p.update(dt, p.intent.x, p.intent.y, p.aiSprint, p.aiSpeedMul * (p.team.id === 'away' ? diffSpeed : 1));
      }
      p.updateDive(dt);
      const margin = 0.55;
      p.pos.x = clamp(p.pos.x, -FIELD.halfWidth + margin, FIELD.halfWidth - margin);
      p.pos.z = clamp(p.pos.z, -FIELD.halfLength + margin, FIELD.halfLength - margin);
      p.root.position.set(p.pos.x, 0, p.pos.z);
      p.root.rotation.y = p.facing;
      p.contest = Math.max(0, (p.contest || 0) - dt * 0.6);
    }
  }

  collidePlayers() {
    const list = this.players;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.isKeeper && b.isKeeper) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        let d = Math.hypot(dx, dz);
        if (d >= 1.16 || d < 0.0001) continue;
        const overlap = 1.16 - d;
        const nx = dx / d;
        const nz = dz / d;
        const aSlide = a.slideTimer > 0;
        const bSlide = b.slideTimer > 0;
        let aShare = 0.5;
        let bShare = 0.5;
        if (a.isKeeper) { aShare = 0; bShare = 1; }
        else if (b.isKeeper) { aShare = 1; bShare = 0; }
        else if (aSlide !== bSlide) {
          if (aSlide) { aShare = 0.15; bShare = 0.85; }
          else { aShare = 0.85; bShare = 0.15; }
        }
        a.pos.x -= nx * overlap * aShare;
        a.pos.z -= nz * overlap * aShare;
        b.pos.x += nx * overlap * bShare;
        b.pos.z += nz * overlap * bShare;
        a.root.position.set(a.pos.x, 0, a.pos.z);
        b.root.position.set(b.pos.x, 0, b.pos.z);
        if (aSlide && !b.isKeeper) {
          b.vel.x += nx * 2.6;
          b.vel.z += nz * 2.6;
        }
        if (bSlide && !a.isKeeper) {
          a.vel.x -= nx * 2.6;
          a.vel.z -= nz * 2.6;
        }
      }
    }
  }

  updateBallPhysics(dt) {
    this.prevBallPos.copy(this.ball.pos);
    if (this.owner) {
      this.updateDribble(dt);
    }
    this.ball.update(dt);
    if (this.ball.passTimer > 0) {
      this.ball.passTimer -= dt;
      if (this.ball.passTimer <= 0) this.ball.passTarget = null;
    }
    if (!this.owner) this.ballBodyCollisions();
  }

  updateDribble(dt) {
    const o = this.owner;
    if (!o) return;
    if (o.isKeeper) {
      const fx = Math.sin(o.facing);
      const fz = Math.cos(o.facing);
      this.ball.pos.set(o.pos.x + fx * 0.52, 1.05, o.pos.z + fz * 0.52);
      this.ball.vel.set(o.vel.x * 0.4, 0, o.vel.z * 0.4);
      return;
    }
    const speed = Math.hypot(o.vel.x, o.vel.z);
    let offset = 0.66 + Math.min(speed, 12.5) * 0.045;
    if (o.sprinting) offset += 0.34;
    if (o.skillTimer > 0) offset += 0.5;
    if (o.charge > 0.03) offset -= 0.08;
    const fx = Math.sin(o.facing);
    const fz = Math.cos(o.facing);
    const side = 0.3;
    let tx = o.pos.x + fx * offset + o.vel.x * 0.035 + Math.cos(o.facing) * side;
    let tz = o.pos.z + fz * offset + o.vel.z * 0.035 - Math.sin(o.facing) * side;
    tx += Math.cos(o.runPhase) * 0.045;
    tz -= Math.sin(o.runPhase) * 0.045;
    tx = clamp(tx, -FIELD.halfWidth + 0.45, FIELD.halfWidth - 0.45);
    tz = clamp(tz, -FIELD.halfLength + 0.5, FIELD.halfLength - 0.5);
    const rate = (o.sprinting ? 10.5 : 17.5) * (0.86 + o.stats.control * 0.2);
    const oldX = this.ball.pos.x;
    const oldZ = this.ball.pos.z;
    this.ball.pos.x = damp(oldX, tx, rate, dt);
    this.ball.pos.z = damp(oldZ, tz, rate, dt);
    this.ball.pos.y = damp(this.ball.pos.y, this.ball.radius + (o.skillTimer > 0 ? 0.05 : 0), 14, dt);
    if (dt > 0) this.ball.vel.set((this.ball.pos.x - oldX) / dt, 0, (this.ball.pos.z - oldZ) / dt);
  }

  ballBodyCollisions() {
    const speed = this.ball.vel.length();
    if (speed < 19 || this.ball.pickupLock > 0) return;
    for (const p of this.players) {
      if (p.isKeeper) continue;
      if (this.ball.pos.y > 1.85) continue;
      const dx = this.ball.pos.x - p.pos.x;
      const dz = this.ball.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.72 || d < 0.001) continue;
      const nx = dx / d;
      const nz = dz / d;
      const dot = this.ball.vel.x * nx + this.ball.vel.z * nz;
      if (dot >= 0) continue;
      this.ball.vel.x -= 1.7 * dot * nx;
      this.ball.vel.z -= 1.7 * dot * nz;
      this.ball.vel.multiplyScalar(0.52);
      this.ball.vel.y = Math.max(this.ball.vel.y, 2.1);
      this.ball.spin *= 0.4;
      this.ball.pickupLock = 0.16;
      this.ball.lastKicker = p;
      this.lastTouch = p;
      this.ball.passTarget = null;
      this.effects.burst(this.ball.pos, 9, p.team.color, 3.2, { life: 0.32, gravity: 4 });
      this.audio?.block?.();
      this.shake = Math.max(this.shake, 0.09);
      return;
    }
  }

  resolvePossession(dt = 0.016) {
    if (this.owner) {
      const owner = this.owner;
      if (this.kickoffTimer <= 0 && !owner.isKeeper) {
        if (horizDist(this.ball.pos, owner.pos) > 2.6) {
          this.loseOwnership();
        } else {
          for (const o of this.players) {
            if (o.team.id === owner.team.id || o.isKeeper) continue;
            const d = horizDist(o.pos, owner.pos);
            if (d > 1.9) {
              o.contest = 0;
              continue;
            }
            if (d < 1.82 && o.slideTimer > 0) {
              this.stealBall(o, owner, true);
              return;
            }
            const pressing = o.sprinting || d < 1.05;
            if (!pressing || d > 1.16) continue;
            o.contest = (o.contest || 0) + dt;
            if (o.contest > 0.4) {
              o.contest = 0;
              const chance = clamp(0.36 * (o.stats.strength / owner.stats.strength), 0.12, 0.72);
              if (Math.random() < chance) {
                this.stealBall(o, owner, false);
                return;
              }
            }
          }
        }
      }
    }
    if (!this.owner) this.tryPickup(dt);
  }

  loseOwnership() {
    if (!this.owner) return;
    this.owner.setOwner(false);
    this.owner = null;
    this.ball.owner = null;
  }

  stealBall(winner, owner, slide = false) {
    if (!winner || !owner || winner.team.id === owner.team.id) return;
    owner.setOwner(false);
    this.ball.owner = null;
    this.owner = null;
    this.ball.passTarget = null;
    const fx = Math.sin(winner.facing);
    const fz = Math.cos(winner.facing);
    if (slide) {
      this.ball.vel.set(fx * 6.8 + (Math.random() - 0.5) * 2, 1.2, fz * 6.8 + (Math.random() - 0.5) * 2);
      this.ball.spin = 0;
      this.ball.pickupLock = 0.18;
    } else {
      this.giveBall(winner);
    }
    owner.vel.x -= fx * 2.2;
    owner.vel.z -= fz * 2.2;
    this.ball.lastKicker = winner;
    this.lastTouch = winner;
    this.effects.ring(winner.pos, winner.team.color, 3);
    this.effects.burst(new THREE.Vector3(owner.pos.x, 0.6, owner.pos.z), 12, 0xffffff, 4, { life: 0.35 });
    this.audio?.tackle?.();
    this.shake = Math.max(this.shake, 0.24);
    if (winner.team.id === 'home') this.stats.tackles += 1;
    winner.contest = 0;
    this.controlLock = Math.max(this.controlLock, 0.3);
  }

  tryPickup(dt) {
    if (this.ball.pickupLock > 0 || this.owner) return;
    const speed = this.ball.vel.length();
    if (this.ball.pos.y > 1.7) return;
    let best = null;
    let bestD = Infinity;
    for (const p of this.players) {
      if (p.isKeeper) continue;
      const d = horizDist(p.pos, this.ball.pos);
      const isPass = this.ball.passTarget === p && this.ball.passTeam === p.team.id;
      let reach = 0.82 + (p.stats.control - 1) * 0.32;
      if (p.slideTimer > 0) reach = 1.42;
      if (isPass) reach += 0.32;
      const maxSpeed = p.slideTimer > 0 ? 17 : isPass ? 31 : 21;
      if (speed > maxSpeed) continue;
      if (d < reach && d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best) return;
    if (this.ball.passTarget === best) {
      this.lastPassTarget = best;
      if (best.team.id === 'home') this.ui?.setHint?.('');
    }
    this.giveBall(best);
    this.ball.passTarget = null;
    this.ball.lastKicker = best;
    this.lastTouch = best;
    this.audio?.touch?.();
    if (best.team.id === 'home' && !best.isKeeper) this.setControlled(best);
  }

  updateControlSwitch() {
    if (this.controlLock > 0) return;
    if (this.controlled && (this.controlled.slideTimer > 0 || this.charging)) return;
    if (this.owner && this.owner.team.id === 'home' && !this.owner.isKeeper) {
      if (this.controlled !== this.owner) this.setControlled(this.owner);
      return;
    }
    this.switchTimer -= 0.016;
    if (this.switchTimer > 0) return;
    this.switchTimer = 0.18;
    const candidate = this.nearestHomeToBall();
    if (!candidate) return;
    if (!this.controlled) {
      this.setControlled(candidate);
      return;
    }
    const currentD = horizDist(this.controlled.pos, this.ball.pos);
    const candidateD = horizDist(candidate.pos, this.ball.pos);
    if (candidate !== this.controlled && candidateD + 1.1 < currentD) {
      this.setControlled(candidate);
    }
  }

  spawnRunningEffects(dt) {
    this.runDust -= dt;
    if (this.runDust > 0) return;
    this.runDust = 0.075;
    for (const p of this.players) {
      const speed = Math.hypot(p.vel.x, p.vel.z);
      if (p.skillTimer > 0) {
        this.effects.trailPuff(new THREE.Vector3(p.pos.x, 0.6 + Math.random() * 0.8, p.pos.z), p.team.color);
      } else if (speed > 9.2) {
        const fx = -Math.sin(p.facing) * 0.35;
        const fz = -Math.cos(p.facing) * 0.35;
        this.effects.trailPuff(new THREE.Vector3(p.pos.x + fx + (Math.random() - 0.5) * 0.4, 0.12, p.pos.z + fz + (Math.random() - 0.5) * 0.4), p.team === TEAMS.home ? 0x2b5a58 : 0x4a2a3c);
      }
      if (this.owner === p && p.sprinting && speed > 10) {
        this.effects.trailPuff(new THREE.Vector3(this.ball.pos.x, 0.18, this.ball.pos.z), p.team.color);
      }
    }
  }

  // ============================ RULES & BALL ============================
  checkPosts() {
    if ((this.postCd || 0) > 0) return;
    const b = this.ball.pos;
    const r = this.ball.radius;
    const hw = FIELD.goalWidth / 2;
    for (const z of [-FIELD.halfLength, FIELD.halfLength]) {
      for (const x of [-hw, hw]) {
        const dx = b.x - x;
        const dz = b.z - z;
        const d = Math.hypot(dx, dz);
        if (d < r + 0.12 && b.y < FIELD.goalHeight + 0.1 && d > 0.001) {
          const nx = dx / d;
          const nz = dz / d;
          const dot = this.ball.vel.x * nx + this.ball.vel.z * nz;
          if (dot < 0) {
            this.ball.vel.x -= 1.7 * dot * nx;
            this.ball.vel.z -= 1.7 * dot * nz;
            this.ball.vel.multiplyScalar(0.66);
            this.ball.vel.y = Math.max(this.ball.vel.y, 1.4);
            this.postCd = 0.4;
            this.ball.pickupLock = 0.1;
            this.audio?.post?.();
            this.shake = Math.max(this.shake, 0.42);
            this.effects.ring(new THREE.Vector3(x, 0.4, z), 0xffffff, 2.5);
            if (this.ball.shotActive && this.lastKicker?.team.id === 'home') this.ui?.toast?.('OFF THE POST', 'bad');
            this.ball.shotActive = false;
            return;
          }
        }
      }
    }
    // crossbar
    if (Math.abs(b.z) > FIELD.halfLength - 0.3 && Math.abs(b.x) < hw + 0.1) {
      if (Math.abs(b.y - FIELD.goalHeight) < r + 0.06 && this.ball.vel.y > -1) {
        this.ball.vel.y = -Math.abs(this.ball.vel.y) * 0.52 - 0.4;
        this.ball.vel.z *= 0.6;
        this.ball.vel.x *= 0.8;
        this.postCd = 0.35;
        this.audio?.post?.();
        this.shake = Math.max(this.shake, 0.36);
        if (this.ball.shotActive && this.lastKicker?.team.id === 'home') this.ui?.toast?.('CROSSBAR!', 'bad');
        this.ball.shotActive = false;
      }
    }
  }

  checkGoal() {
    const b = this.ball.pos;
    const sign = Math.sign(b.z);
    if (Math.abs(b.z) < FIELD.halfLength + 0.03) return;
    if (Math.abs(b.x) > FIELD.goalWidth / 2 - 0.04) return;
    if (b.y > FIELD.goalHeight - 0.04) return;
    if (sign > 0) this.scoreGoal('home');
    else this.scoreGoal('away');
  }

  scoreGoal(teamId) {
    if (this.state !== 'play') return;
    const scoring = TEAMS[teamId];
    const concedingId = teamId === 'home' ? 'away' : 'home';
    this.score[teamId] += 1;
    this.goalTeam = teamId;
    this.concededTeam = concedingId;
    this.goalZ = scoring.dir * FIELD.halfLength;
    const last = this.lastTouch;
    const ownGoal = !!(last && last.team.id !== teamId);
    const scorerName = last ? `${last.name}${ownGoal ? ' · OG' : ''}` : scoring.name;
    this.goalScorer = scorerName;

    this.cancelCharge(false);
    this.charging = false;
    if (this.owner) {
      this.owner.setOwner(false);
      this.owner = null;
    }
    this.ball.owner = null;
    if (this.controlled) this.controlled.setControlled(false);
    this.controlled = null;
    for (const p of this.players) {
      p.setOwner(false);
      p.setControlled(false);
      p.charge = 0;
      p.contest = 0;
      if (p.team.id === teamId) p.celebrateFor(2.5);
      else p.play('dejected', 2.5);
    }
    this.ui?.setCharge?.(0, false, false);
    this.state = 'goal';
    this.goalTimer = MATCH.goalCelebration;
    this.orbitTime = 0;
    this.pendingEnd = this.score[teamId] >= MATCH.goalsToWin || this.golden;
    this.effects.confetti(new THREE.Vector3(0, 1.6, this.goalZ - Math.sign(this.goalZ) * 1.2), [scoring.color, 0xd7ff4a, 0xffffff, TEAMS[concedingId].color]);
    this.effects.ring(new THREE.Vector3(this.ball.pos.x, 0.1, this.ball.pos.z), scoring.color, 5);
    this.audio?.goal?.();
    this.shake = Math.max(this.shake, 0.5);
    this.ui?.flashScreen?.();
    this.ui?.showGoal?.({ teamId, teamName: scoring.name, scorer: scorerName, ownGoal, score: { ...this.score } });
    this.ui?.updateHud?.(this.hudData());
  }

  ballBoundaries() {
    const b = this.ball.pos;
    const r = this.ball.radius;
    const hw = FIELD.halfWidth;
    const hl = FIELD.halfLength;
    let hit = 0;
    if (b.x > hw - r) {
      b.x = hw - r;
      if (this.ball.vel.x > 0) this.ball.vel.x *= -0.68;
      hit = 1;
    } else if (b.x < -hw + r) {
      b.x = -hw + r;
      if (this.ball.vel.x < 0) this.ball.vel.x *= -0.68;
      hit = 1;
    }
    const inMouth = Math.abs(b.x) < FIELD.goalWidth / 2 - 0.02;
    const underBar = b.y < FIELD.goalHeight - 0.02;
    if (!inMouth || !underBar) {
      if (b.z > hl - r) {
        b.z = hl - r;
        if (this.ball.vel.z > 0) this.ball.vel.z *= -0.62;
        hit = 1;
      } else if (b.z < -hl + r) {
        b.z = -hl + r;
        if (this.ball.vel.z < 0) this.ball.vel.z *= -0.62;
        hit = 1;
      }
    } else {
      b.z = clamp(b.z, -hl - FIELD.goalDepth + 0.35, hl + FIELD.goalDepth - 0.35);
    }
    if (hit) {
      this.ball.spin *= 0.5;
      if (this.wallSoundCd <= 0) {
        this.wallSoundCd = 0.16;
        this.audio?.wall?.();
      }
      if (Math.hypot(this.ball.vel.x, this.ball.vel.z) > 8) {
        this.effects.burst(new THREE.Vector3(b.x, Math.max(0.3, b.y), b.z), 5, 0x9adfff, 2, { life: 0.25 });
      }
    }
  }

  endMatch(reason = 'FULL TIME') {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.cancelCharge();
    this.owner = null;
    this.ball.owner = null;
    if (this.controlled) this.controlled.setControlled(false);
    this.controlled = null;
    this.orbitTime = 0;
    const win = this.score.home > this.score.away;
    const draw = this.score.home === this.score.away;
    for (const p of this.players) {
      p.setOwner(false);
      p.setControlled(false);
      if (draw) continue;
      const won = (p.team.id === 'home') === win;
      if (won) p.celebrateFor(4);
      else p.play('dejected', 4);
    }
    const total = this.possessionTime.home + this.possessionTime.away;
    const possession = total > 0 ? Math.round((this.possessionTime.home / total) * 100) : 50;
    this.ui?.showEnd?.({
      result: win ? 'win' : draw ? 'draw' : 'loss',
      reason,
      score: { ...this.score },
      shots: this.stats.shots,
      tackles: this.stats.tackles,
      possession,
      styleName: this.playstyle.name,
      difficulty: this.difficulty.name,
      golden: this.golden,
    });
    this.audio?.whistle?.();
    if (win) {
      this.audio?.goal?.();
      this.effects.confetti(new THREE.Vector3(0, 2, 0), [TEAMS.home.color, 0xd7ff4a, 0xffffff]);
    }
    this.ui?.updateHud?.(this.hudData());
  }

  // ============================ CAMERA ============================
  applyCamera(desiredPos, desiredLook, dt, fovTarget, lambda = 5) {
    const k = 1 - Math.exp(-lambda * dt);
    this.camPos.lerp(desiredPos, k);
    this.camLook.lerp(desiredLook, k);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      const s = this.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s * 0.5;
    }
    this.camera.lookAt(this.camLook);
    this.camera.fov = damp(this.camera.fov, fovTarget, 4, dt);
    this.camera.updateProjectionMatrix();
  }

  updateCamera(dt) {
    const el = this.renderer.domElement;
    const aspect = el.clientWidth / Math.max(1, el.clientHeight);
    const portrait = aspect < 0.95;
    const focus = this.cameraFocus();
    const dist = portrait ? 19.8 : 18.3;
    const height = portrait ? 13.1 : 11.3;
    const lead = portrait ? 6.1 : 7.2;
    const desired = new THREE.Vector3(
      focus.x * (portrait ? 0.54 : 0.42),
      height,
      clamp(focus.z - dist, -FIELD.halfLength - 7.5, FIELD.halfLength - 3.4)
    );
    const look = new THREE.Vector3(focus.x * (portrait ? 0.7 : 0.62), 0.95, focus.z + lead);
    const speed = this.controlled ? Math.hypot(this.controlled.vel.x, this.controlled.vel.z) : 0;
    const fov = (portrait ? 61 : 50) + Math.min(4, speed * 0.22) + (this.charging ? 2 : 0);
    this.applyCamera(desired, look, dt, fov, 5.2);
  }

  updateMenuCamera(dt) {
    const angle = -2.15 + Math.sin(this.now * 0.1) * 0.3;
    const desired = new THREE.Vector3(Math.sin(angle) * 28, 12.6 + Math.sin(this.now * 0.16) * 0.7, Math.cos(angle) * 28);
    const look = new THREE.Vector3(0, 1.3, 0);
    this.applyCamera(desired, look, dt, 50, 2.2);
  }

  updateGoalCamera(dt) {
    const sign = Math.sign(this.goalZ || 1);
    const angle = this.orbitTime * 0.42;
    // Stay inside the pitch so the celebration frames the goal mouth, net and confetti
    // instead of looking back through the net from outside the stadium.
    const desired = new THREE.Vector3(
      Math.sin(angle) * 7.6,
      4.1 + Math.sin(angle * 0.7) * 0.35,
      this.goalZ - sign * (10.6 + Math.cos(angle) * 1.2)
    );
    const look = new THREE.Vector3(
      Math.sin(angle * 0.6) * 1.4,
      1.25,
      this.goalZ + sign * 0.4
    );
    this.applyCamera(desired, look, dt, 48, 4.6);
  }

  updateEndCamera(dt) {
    const angle = this.orbitTime * 0.22;
    const desired = new THREE.Vector3(Math.sin(angle) * 24, 13.5, Math.cos(angle) * 24);
    const look = new THREE.Vector3(0, 1.2, 0);
    this.applyCamera(desired, look, dt, 52, 1.8);
  }
}
