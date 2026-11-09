import * as THREE from 'three';
import { FIELD, BASE } from './constants.js';

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f7f4';
  ctx.fillRect(0, 0, 512, 256);
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.55, 'rgba(210,225,225,0.25)');
  grad.addColorStop(1, 'rgba(60,80,90,0.5)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  const pent = (x, y, r, rot = 0, color = '#101820') => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  };
  const rows = [
    [42, 62, 22], [150, 54, 24], [264, 66, 21], [372, 52, 24], [472, 64, 21],
    [96, 148, 24], [208, 142, 22], [320, 152, 24], [430, 144, 22],
    [38, 214, 22], [154, 206, 23], [266, 214, 22], [378, 204, 24], [480, 214, 21],
  ];
  for (const [x, y, r] of rows) pent(x, y, r, Math.random() * 2);
  // seams
  ctx.strokeStyle = 'rgba(40,55,65,0.22)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * 512, Math.random() * 256);
    ctx.quadraticCurveTo(Math.random() * 512, Math.random() * 256, Math.random() * 512, Math.random() * 256);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class Ball {
  constructor(scene) {
    this.radius = FIELD.ballRadius;
    this.pos = new THREE.Vector3(0, this.radius, 0);
    this.vel = new THREE.Vector3();
    this.spin = 0;
    this.owner = null;
    this.lastKicker = null;
    this.pickupLock = 0;
    this.kickLock = 0;
    this.airTime = 0;
    this.trailHistory = [];
    this.shotActive = false;

    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius, 26, 20),
      new THREE.MeshStandardMaterial({
        map: ballTexture(),
        roughness: 0.36,
        metalness: 0.05,
        envMapIntensity: 0.8,
      })
    );
    this.mesh.castShadow = true;
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);

    // soft glow under the ball
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 64;
    glowCanvas.height = 64;
    const gctx = glowCanvas.getContext('2d');
    const g = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(0.5, 'rgba(160,240,255,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    gctx.fillStyle = g;
    gctx.fillRect(0, 0, 64, 64);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.glow.rotation.x = -Math.PI / 2;
    scene.add(this.glow);

    this.trail = [];
    const trailMatBase = new THREE.MeshBasicMaterial({
      color: 0xd7ff4a,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (let i = 0; i < 11; i++) {
      const mat = trailMatBase.clone();
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(this.radius * (1 - i * 0.045), 10, 8), mat);
      mesh.visible = false;
      scene.add(mesh);
      this.trail.push(mesh);
    }

    this._axis = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._prev = new THREE.Vector3();
  }

  reset(x = 0, z = 0) {
    this.pos.set(x, this.radius, z);
    this.vel.set(0, 0, 0);
    this.spin = 0;
    this.owner = null;
    this.lastKicker = null;
    this.pickupLock = 0.2;
    this.kickLock = 0;
    this.airTime = 0;
    this.shotActive = false;
    this.trailHistory.length = 0;
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.identity();
    for (const t of this.trail) t.visible = false;
  }

  kick(dir, power, lift = 0, spin = 0) {
    this.owner = null;
    this.pickupLock = 0.2;
    this.kickLock = 0.16;
    this.vel.copy(dir).multiplyScalar(power);
    this.vel.y = lift;
    this.spin = spin;
    this.shotActive = power > 17;
    this.trailHistory.length = 0;
  }

  releaseFromOwner() {
    this.owner = null;
    this.pickupLock = 0.16;
  }

  update(dt) {
    this.pickupLock = Math.max(0, this.pickupLock - dt);
    this.kickLock = Math.max(0, this.kickLock - dt);

    if (!this.owner) {
      const v = this.vel;
      v.y -= BASE.gravity * dt;
      // Magnus bend from side spin
      if (Math.abs(this.spin) > 0.01) {
        const k = 0.012;
        const ax = this.spin * v.z * k;
        const az = -this.spin * v.x * k;
        v.x += ax * dt;
        v.z += az * dt;
        this.spin *= Math.exp(-0.55 * dt);
      }
      const drag = Math.exp(-0.11 * dt);
      v.x *= drag;
      v.z *= drag;
      if (v.y < 0) v.y *= Math.exp(-0.04 * dt);

      this.pos.addScaledVector(v, dt);

      if (this.pos.y <= this.radius) {
        this.pos.y = this.radius;
        if (v.y < -2.2) {
          v.y *= -0.56;
          v.x *= 0.86;
          v.z *= 0.86;
        } else {
          v.y = 0;
        }
        const roll = Math.exp(-1.05 * dt);
        v.x *= roll;
        v.z *= roll;
        if (Math.abs(v.x) < 0.06) v.x = 0;
        if (Math.abs(v.z) < 0.06) v.z = 0;
      }

      this.airTime += dt;
    } else {
      this.vel.multiplyScalar(0.5);
    }

    // spin visual
    const speed = this.vel.length();
    if (!this.owner && speed > 0.2) {
      this._axis.set(this.vel.z, 0, -this.vel.x);
      if (this._axis.lengthSq() > 0.0001) {
        this._axis.normalize();
        const angle = (Math.hypot(this.vel.x, this.vel.z) * dt) / this.radius;
        this._quat.setFromAxisAngle(this._axis, angle);
        this.mesh.quaternion.premultiply(this._quat);
      }
    }

    this.mesh.position.copy(this.pos);
    this.glow.position.set(this.pos.x, 0.035, this.pos.z);
    this.glow.material.opacity = 0.28 + Math.min(0.3, Math.max(0, 1 - this.pos.y / 6) * 0.22);

    this.updateTrail(dt, speed);
  }

  updateTrail(dt, speed) {
    const active = !this.owner && speed > 9;
    if (active) {
      this.trailHistory.unshift(this.pos.clone());
      if (this.trailHistory.length > 12) this.trailHistory.length = 12;
    } else {
      if (this.trailHistory.length) this.trailHistory.pop();
    }
    for (let i = 0; i < this.trail.length; i++) {
      const pt = this.trailHistory[i + 1];
      const t = this.trail[i];
      if (!pt || !active) {
        t.visible = false;
        continue;
      }
      t.visible = true;
      t.position.copy(pt);
      t.material.opacity = 0.34 * (1 - i / this.trail.length);
      const s = 0.9 - i * 0.045;
      t.scale.setScalar(Math.max(0.2, s));
    }
  }
}
