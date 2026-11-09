import * as THREE from 'three';
import { BASE, FIELD } from './constants.js';

const TAU = Math.PI * 2;
const skinMats = new Map();
const hairMats = new Map();

function skinMat(color) {
  if (!skinMats.has(color)) skinMats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.02 }));
  return skinMats.get(color);
}
function hairMat(color) {
  if (!hairMats.has(color)) hairMats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 }));
  return hairMats.get(color);
}

function numberTexture(num, color, jersey) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = jersey;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.roundRect(8, 8, 112, 112, 22);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.font = '400 92px "Bebas Neue", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.26)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

let BLOB;
function shadowBlob() {
  if (!BLOB) BLOB = blobTexture();
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.55, 1.55),
    new THREE.MeshBasicMaterial({ map: BLOB, transparent: true, opacity: 0.9, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  return mesh;
}

function jerseyColor(team, keeper) {
  if (!keeper) return team.jersey;
  return team.id === 'home' ? 0xc7f24a : 0xffae3d;
}

export class Player {
  constructor({ scene, team, data, style, isKeeper = false, number = 7, quality = 1 }) {
    this.scene = scene;
    this.team = team;
    this.data = data;
    this.name = data.name;
    this.role = data.role;
    this.isKeeper = isKeeper;
    this.number = number;
    this.quality = quality;
    this.style = style;

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = team.dir > 0 ? 0 : Math.PI;
    this.targetFacing = this.facing;
    this.intent = new THREE.Vector2();
    this.sprinting = false;
    this.stamina = 100;
    this.controlled = false;
    this.isOwner = false;
    this.slideTimer = 0;
    this.skillTimer = 0;
    this.skillCooldown = 0;
    this.tackleCooldown = 0;
    this.kickCooldown = 0;
    this.charge = 0;
    this.action = { name: null, t: 0, dur: 0 };
    this.dive = { active: false, side: 1, t: 0, targetX: 0, speed: 10 };
    this.runPhase = Math.random() * TAU;
    this.lastSpeed = 0;
    this.aiTimer = 0;
    this.aiRole = data.role;
    this.tackleActive = false;
    this.reactionTimer = 0;
    this.celebrate = false;

    this.stats = {
      speed: BASE.speed * (style?.speed ?? 1) * (isKeeper ? 0.94 : 1),
      sprint: BASE.sprintSpeed * (style?.sprint ?? 1) * (isKeeper ? 0.9 : 1),
      control: style?.control ?? 1,
      shotPower: style?.shotPower ?? 1,
      shotAccuracy: style?.shotAccuracy ?? 1,
      curve: style?.curve ?? 1,
      tackle: style?.tackle ?? 1,
      stamina: style?.stamina ?? 1,
      strength: style?.strength ?? 1,
    };

    this.buildModel();
  }

  buildModel() {
    const root = new THREE.Group();
    const visual = new THREE.Group();
    root.add(visual);
    visual.add(shadowBlob());

    const skin = skinMat(this.data.skin);
    const hair = hairMat(this.data.hair);
    const jersey = new THREE.MeshStandardMaterial({
      color: jerseyColor(this.team, this.isKeeper),
      roughness: 0.68,
      metalness: 0.04,
      emissive: jerseyColor(this.team, this.isKeeper),
      emissiveIntensity: 0.06,
    });
    const trimColor = this.isKeeper ? 0x101820 : this.team.trim;
    const trim = new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.5, metalness: 0.2 });
    const shorts = new THREE.MeshStandardMaterial({
      color: this.isKeeper ? 0x121a22 : this.team.dark,
      roughness: 0.75,
      metalness: 0.05,
    });
    const boot = new THREE.MeshStandardMaterial({
      color: this.team.id === 'home' ? 0xd7ff4a : 0xffd166,
      roughness: 0.35,
      metalness: 0.35,
      emissive: this.team.id === 'home' ? 0x49601a : 0x5c3c0c,
      emissiveIntensity: 0.6,
    });

    // legs
    const legGeo = new THREE.CapsuleGeometry(0.115, 0.5, 3, 8);
    const bootGeo = new THREE.BoxGeometry(0.21, 0.12, 0.38);
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    for (const [leg, sx] of [[this.legL, -0.17], [this.legR, 0.17]]) {
      leg.position.set(sx, 0.88, 0);
      const shin = new THREE.Mesh(legGeo, skin);
      shin.position.y = -0.34;
      shin.castShadow = true;
      leg.add(shin);
      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.115, 0.24, 8), trim);
      sock.position.y = -0.48;
      leg.add(sock);
      const foot = new THREE.Mesh(bootGeo, boot);
      foot.position.set(0, -0.7, 0.07);
      foot.castShadow = true;
      leg.add(foot);
      visual.add(leg);
    }

    // shorts
    const shortsMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.27, 0.36), shorts);
    shortsMesh.position.y = 0.94;
    shortsMesh.castShadow = true;
    visual.add(shortsMesh);

    // torso
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.31, 0.48, 4, 10), jersey);
    torso.position.y = 1.36;
    torso.scale.set(1.13, 1, 0.8);
    torso.castShadow = true;
    visual.add(torso);

    // chest / shoulder trim
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.6, 0.46), trim);
    stripe.position.set(0.22, 1.36, 0.02);
    stripe.rotation.z = -0.12;
    visual.add(stripe);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.028, 6, 14), trim);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.76;
    visual.add(collar);

    // arms
    const armGeo = new THREE.CapsuleGeometry(0.085, 0.45, 3, 8);
    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    for (const [arm, sx, side] of [[this.armL, -0.39, -1], [this.armR, 0.39, 1]]) {
      arm.position.set(sx, 1.6, 0);
      const limb = new THREE.Mesh(armGeo, skin);
      limb.position.y = -0.28;
      limb.castShadow = true;
      arm.add(limb);
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.18, 8), jersey);
      sleeve.position.y = -0.06;
      arm.add(sleeve);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), this.isKeeper ? new THREE.MeshStandardMaterial({ color: this.team.id === 'home' ? 0xe8ffa4 : 0xffdfa0, roughness: 0.7 }) : skin);
      hand.position.y = -0.57;
      arm.add(hand);
      arm.rotation.z = side * 0.1;
      visual.add(arm);
    }

    // neck + head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.12, 8), skin);
    neck.position.y = 1.81;
    visual.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.245, 16, 12), skin);
    head.position.y = 2.02;
    head.scale.set(0.94, 1.05, 0.94);
    head.castShadow = true;
    visual.add(head);

    // hair cap
    const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.252, 14, 10, 0, TAU, 0, Math.PI * 0.52), hair);
    hairMesh.position.y = 2.04;
    hairMesh.rotation.x = -0.16;
    visual.add(hairMesh);
    if (Math.random() > 0.6) {
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), hair);
      knot.position.set(0, 2.28, -0.08);
      visual.add(knot);
    }

    // eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0a0d12 });
    for (const sx of [-0.085, 0.085]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), eyeMat);
      eye.position.set(sx, 2.04, 0.215);
      visual.add(eye);
    }

    // number on back
    if (!this.isKeeper) {
      const tex = numberTexture(this.number, this.team.trim, `#${new THREE.Color(this.team.dark).getHexString()}`);
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 0.42),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
      );
      plane.position.set(0, 1.42, -0.3);
      plane.rotation.y = Math.PI;
      visual.add(plane);
    } else {
      // keeper gloves
      for (const arm of [this.armL, this.armR]) {
        const glove = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 8, 6),
          new THREE.MeshStandardMaterial({ color: this.team.id === 'home' ? 0xe6ff9c : 0xffe0a6, roughness: 0.65 })
        );
        glove.position.y = -0.61;
        glove.scale.set(1, 1.25, 0.7);
        arm.add(glove);
      }
    }

    // controlled / owner rings
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.58, 0.7, 36),
      new THREE.MeshBasicMaterial({ color: 0xd7ff4a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.025;
    this.ring.visible = false;
    root.add(this.ring);

    this.ringGlow = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.86, 36),
      new THREE.MeshBasicMaterial({ color: 0xd7ff4a, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
    );
    this.ringGlow.rotation.x = -Math.PI / 2;
    this.ringGlow.position.y = 0.018;
    this.ringGlow.visible = false;
    root.add(this.ringGlow);

    this.chevron = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.26, 4),
      new THREE.MeshBasicMaterial({ color: 0xd7ff4a, transparent: true, opacity: 0.95, depthWrite: false })
    );
    this.chevron.rotation.x = Math.PI;
    this.chevron.rotation.y = Math.PI / 4;
    this.chevron.position.y = 2.72;
    this.chevron.visible = false;
    root.add(this.chevron);

    // pass target ring
    this.targetRing = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 0.98, 40),
      new THREE.MeshBasicMaterial({ color: 0x44f3ff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide })
    );
    this.targetRing.rotation.x = -Math.PI / 2;
    this.targetRing.position.y = 0.02;
    this.targetRing.visible = false;
    root.add(this.targetRing);

    this.root = root;
    this.visual = visual;
    this.mesh = root;
    this.scene.add(root);
  }

  setControlled(v) {
    this.controlled = v;
    this.ring.visible = v;
    this.ringGlow.visible = v;
    this.chevron.visible = v;
  }

  setOwner(v, color = 0xd7ff4a) {
    this.isOwner = v;
    if (v && !this.controlled) {
      this.ring.visible = true;
      this.ring.material.color.setHex(color);
      this.ringGlow.material.color.setHex(color);
      this.ringGlow.visible = true;
    } else if (!v && !this.controlled) {
      this.ring.visible = false;
      this.ringGlow.visible = false;
    }
  }

  setPosition(x, z, facing) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.slideTimer = 0;
    this.skillTimer = 0;
    this.tackleActive = false;
    this.action = { name: null, t: 0, dur: 0 };
    if (facing !== undefined) {
      this.facing = facing;
      this.targetFacing = facing;
    }
    this.root.position.set(x, 0, z);
    this.root.rotation.y = this.facing;
  }

  play(name, dur) {
    this.action = { name, t: 0, dur };
  }

  startSlide(dirX, dirZ) {
    this.slideTimer = 0.44;
    this.tackleActive = true;
    this.tackleCooldown = 1.15;
    this.vel.set(dirX * 15.5, 0, dirZ * 15.5);
    this.targetFacing = Math.atan2(dirX, dirZ);
    this.facing = this.targetFacing;
    this.play('slide', 0.62);
  }

  startSkill(dirX, dirZ) {
    const power = this.style?.skillPower ?? 1;
    this.skillTimer = 0.34 + (power - 1) * 0.28;
    this.skillCooldown = 1.05 * (this.style?.skillCooldown ?? 1);
    const len = Math.hypot(dirX, dirZ) || 1;
    this.vel.set((dirX / len) * 16.2 * power, 0, (dirZ / len) * 16.2 * power);
    this.targetFacing = Math.atan2(dirX, dirZ);
    this.facing = this.targetFacing;
    this.play('skill', 0.38);
  }

  update(dt, moveX, moveZ, sprint, speedMul = 1) {
    this.skillCooldown = Math.max(0, this.skillCooldown - dt);
    this.tackleCooldown = Math.max(0, this.tackleCooldown - dt);
    this.kickCooldown = Math.max(0, this.kickCooldown - dt);
    this.slideTimer = Math.max(0, this.slideTimer - dt);
    this.skillTimer = Math.max(0, this.skillTimer - dt);

    const len = Math.hypot(moveX, moveZ);
    if (this.slideTimer > 0) {
      this.vel.multiplyScalar(Math.exp(-2.1 * dt));
    } else if (this.skillTimer > 0) {
      this.vel.multiplyScalar(Math.exp(-1.4 * dt));
    } else if (len > 0.04) {
      const nx = moveX / len;
      const nz = moveZ / len;
      const canSprint = sprint && this.stamina > 2 && this.charge < 0.3;
      const max = (canSprint ? this.stats.sprint : this.stats.speed) * speedMul * (this.charge > 0.05 ? 0.74 : 1);
      const desiredX = nx * max;
      const desiredZ = nz * max;
      const rate = 1 - Math.exp(-BASE.accel * dt);
      this.vel.x += (desiredX - this.vel.x) * rate;
      this.vel.z += (desiredZ - this.vel.z) * rate;
      this.targetFacing = Math.atan2(nx, nz);
      this.sprinting = canSprint;
    } else {
      const rate = 1 - Math.exp(-BASE.accel * 1.35 * dt);
      this.vel.x -= this.vel.x * rate;
      this.vel.z -= this.vel.z * rate;
      this.sprinting = false;
    }

    if (this.slideTimer > 0) this.sprinting = false;

    // stamina
    if (this.sprinting && len > 0.1) {
      this.stamina -= (BASE.staminaDrain / this.stats.stamina) * dt;
    } else {
      const regen = len < 0.1 ? BASE.staminaRegen * 1.6 : BASE.staminaRegen;
      this.stamina += (regen * Math.min(2, this.stats.stamina)) * dt;
    }
    this.stamina = Math.max(0, Math.min(100, this.stamina));
    if (this.stamina <= 0) this.sprinting = false;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // turn toward intent / velocity
    let target = this.targetFacing;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed > 0.8 && this.slideTimer <= 0) target = Math.atan2(this.vel.x, this.vel.z);
    let diff = ((target - this.facing + Math.PI * 3) % TAU) - Math.PI;
    const turn = (this.skillTimer > 0 ? 14 : BASE.turn) * dt;
    this.facing += THREE.MathUtils.clamp(diff, -turn, turn);

    this.root.position.set(this.pos.x, 0, this.pos.z);
    this.root.rotation.y = this.facing;

    this.updateAnimation(dt, speed);
    this.lastSpeed = speed;
  }

  updateAnimation(dt, speed) {
    const t = performance.now() / 1000;
    const a = this.action;
    if (a.name) {
      a.t += dt;
      if (a.t >= a.dur) {
        a.name = null;
        a.t = 0;
      }
    }
    const running = speed > 0.35;
    this.runPhase += dt * (2.2 + Math.min(speed, 14) * 1.42);
    const ratio = Math.min(1, speed / 12);
    const swing = running ? Math.sin(this.runPhase) * (0.52 + ratio * 0.55) : Math.sin(t * 1.6 + this.number) * 0.06;

    let lean = ratio * 0.16;
    let bob = running ? Math.abs(Math.sin(this.runPhase * 2)) * 0.055 * ratio : Math.sin(t * 1.8 + this.number) * 0.012;
    let bodyY = 0;
    let bodyZ = 0;

    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    this.armL.rotation.z = -0.1;
    this.armR.rotation.z = 0.1;
    this.visual.rotation.z = 0;
    this.visual.rotation.x = lean;
    this.visual.scale.set(1, 1, 1);

    if (this.charge > 0.03) {
      bodyY = -0.09;
      lean += 0.05;
      this.legL.rotation.x = -0.35;
      this.legR.rotation.x = 0.35;
      this.armL.rotation.z = -0.6;
      this.armR.rotation.z = 0.6;
      this.visual.rotation.x = lean;
    }

    if (a.name === 'kick') {
      const p = a.t / a.dur;
      const kick = Math.sin(Math.min(1, p * 1.15) * Math.PI);
      this.legR.rotation.x = 0.9 * kick;
      this.legL.rotation.x = -0.45 * kick;
      this.visual.rotation.x = lean + 0.07 * kick;
      this.armL.rotation.z = -0.9 * kick;
    } else if (a.name === 'slide') {
      const p = Math.min(1, a.t / a.dur);
      const tilt = Math.sin(Math.min(1, p * 1.5) * Math.PI * 0.5);
      this.visual.rotation.z = -1.22 * tilt;
      bodyY = -0.44 * tilt;
      this.legL.rotation.x = 0.8;
      this.legR.rotation.x = 1.2;
      this.armL.rotation.z = -1.4;
      this.armR.rotation.z = 0.3;
    } else if (a.name === 'skill') {
      const p = a.t / a.dur;
      const spin = Math.sin(p * Math.PI);
      bodyY = Math.sin(p * Math.PI) * 0.14;
      this.visual.rotation.y = p * Math.PI * 2;
      this.legL.rotation.x = 0.9 * spin;
      this.legR.rotation.x = -0.7 * spin;
      this.armL.rotation.z = -0.8 - spin;
      this.armR.rotation.z = 0.8 + spin;
      this.visual.rotation.x = 0.12;
    } else if (a.name === 'celebrate') {
      const p = a.t / a.dur;
      const jump = Math.abs(Math.sin(p * Math.PI * 5)) * 0.24;
      bodyY = jump;
      this.visual.rotation.x = -0.06;
      this.armL.rotation.z = -2.5 + Math.sin(t * 14) * 0.2;
      this.armR.rotation.z = 2.5 - Math.sin(t * 14) * 0.2;
      this.armL.rotation.x = -0.2;
      this.armR.rotation.x = -0.2;
      this.legL.rotation.x = 0.2 + jump;
      this.legR.rotation.x = -0.2 - jump;
    } else if (a.name === 'dejected') {
      this.visual.rotation.x = 0.22;
      bodyY = -0.06;
      this.armL.rotation.z = -0.2;
      this.armR.rotation.z = 0.2;
      this.armL.rotation.x = 0.3;
      this.armR.rotation.x = 0.3;
    }

    if (this.dive.active) {
      const p = Math.min(1, this.dive.t / 0.55);
      this.visual.rotation.z = -this.dive.side * (0.2 + p * 1.25);
      bodyY = -0.28 + Math.abs(Math.sin(p * Math.PI)) * 0.5;
      this.armL.rotation.z = -2.4;
      this.armR.rotation.z = 2.4;
      this.armL.rotation.x = -0.6;
      this.armR.rotation.x = -0.6;
      this.legL.rotation.x = 0.7;
      this.legR.rotation.x = -0.4;
    }

    this.visual.position.y = bodyY + bob;
    this.visual.position.z = bodyZ;
    if (a.name === 'skill') {
      this.visual.rotation.y += 0;
    } else {
      this.visual.rotation.y *= Math.exp(-10 * dt);
    }

    // controlled ring pulse
    if (this.controlled) {
      const pulse = 1 + Math.sin(t * 4.5) * 0.06;
      this.ring.scale.setScalar(pulse);
      this.ringGlow.scale.setScalar(1 + Math.sin(t * 4.5 + 1) * 0.1);
      this.chevron.position.y = 2.72 + Math.sin(t * 3) * 0.07;
      this.chevron.rotation.y += dt * 1.4;
    }
    if (this.isOwner && !this.controlled) {
      this.ring.scale.setScalar(1 + Math.sin(t * 5) * 0.05);
    }
  }

  setDive(side) {
    if (this.dive.active) return;
    this.dive.active = true;
    this.dive.side = side;
    this.dive.t = 0;
    this.play('dive', 0.7);
  }

  updateDive(dt) {
    if (!this.dive.active) return;
    this.dive.t += dt;
    if (this.dive.t > 0.75) {
      this.dive.active = false;
      this.dive.t = 0;
    }
  }

  celebrateFor(dur = 2.2) {
    this.play('celebrate', dur);
  }

  dispose() {
    this.scene.remove(this.root);
  }
}

export function clampToPitch(pos, margin = 1) {
  pos.x = THREE.MathUtils.clamp(pos.x, -FIELD.halfWidth + margin, FIELD.halfWidth - margin);
  pos.z = THREE.MathUtils.clamp(pos.z, -FIELD.halfLength + margin, FIELD.halfLength - margin);
}
