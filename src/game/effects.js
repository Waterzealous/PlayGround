import * as THREE from 'three';

const MAX = 800;

export class Effects {
  constructor(scene, ball) {
    this.scene = scene;
    this.ball = ball;
    this.particles = [];
    this.cursor = 0;
    this.rings = [];
    this.popups = [];

    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(MAX * 3);
    this.colors = new Float32Array(MAX * 3);
    this.sizes = new Float32Array(MAX);
    this.alphas = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    geo.setDrawRange(0, MAX);

    const tex = this._dotTexture();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uScale: { value: 500 },
        uMap: { value: tex },
      },
      vertexShader: `
        attribute float size;
        attribute float alpha;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uScale;
        void main(){
          vColor = color;
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(size * uScale / max(0.4, -mv.z), 1.0, 80.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec3 vColor;
        varying float vAlpha;
        void main(){
          vec4 t = texture2D(uMap, gl_PointCoord);
          if (t.a < 0.03) discard;
          gl_FragColor = vec4(vColor, t.a * vAlpha);
        }
      `,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);

    for (let i = 0; i < MAX; i++) {
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        size: 0.2,
        color: new THREE.Color(),
        gravity: 0,
        drag: 0,
        fade: 1,
      });
      this.alphas[i] = 0;
    }

    // shock rings
    for (let i = 0; i < 7; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xd7ff4a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.52, 40), mat);
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      scene.add(ring);
      this.rings.push({ mesh: ring, t: 0, life: 0.55, active: false, maxScale: 6 });
    }

    this.tmp = new THREE.Color();
  }

  _dotTexture() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.92)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.32)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  setViewport(height) {
    this.material.uniforms.uScale.value = height * 0.62;
  }

  spawn(pos, opts = {}) {
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % MAX;
    p.active = true;
    p.pos.copy(pos);
    p.vel.set(opts.vx ?? 0, opts.vy ?? 0, opts.vz ?? 0);
    p.life = opts.life ?? 0.6;
    p.maxLife = p.life;
    p.size = opts.size ?? 0.18;
    p.color.set(opts.color ?? 0xffffff);
    p.gravity = opts.gravity ?? 0;
    p.drag = opts.drag ?? 0.4;
    p.fade = opts.fade ?? 1;
    return p;
  }

  burst(pos, count = 16, color = 0xffffff, power = 4, opts = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.9;
      const sp = power * (0.35 + Math.random() * 0.8);
      this.spawn(pos, {
        vx: Math.cos(a) * sp,
        vy: up * sp * (opts.up ?? 0.7),
        vz: Math.sin(a) * sp,
        life: 0.35 + Math.random() * (opts.life ?? 0.5),
        size: (0.12 + Math.random() * 0.22) * (opts.size ?? 1),
        color: Array.isArray(color) ? color[Math.floor(Math.random() * color.length)] : color,
        gravity: opts.gravity ?? 5,
        drag: 1.6,
      });
    }
  }

  kickBurst(pos, color = 0xffffff, power = 1) {
    this.burst(pos, Math.round(10 + power * 10), color, 3 + power * 3, { life: 0.4, gravity: 4, size: 1.1 });
    this.ring(pos, color, 2.6 + power * 1.4);
  }

  ring(pos, color = 0xd7ff4a, maxScale = 5) {
    const r = this.rings.find((x) => !x.active) || this.rings[0];
    r.active = true;
    r.t = 0;
    r.maxScale = maxScale;
    r.mesh.material.color.set(color);
    r.mesh.material.opacity = 0.7;
    r.mesh.position.set(pos.x, 0.04, pos.z);
    r.mesh.scale.setScalar(1);
    r.mesh.visible = true;
  }

  confetti(pos, colors = [0xd7ff4a, 0x44f3ff, 0xffffff, 0xff4b9d]) {
    for (let i = 0; i < 150; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 9;
      this.spawn(new THREE.Vector3(pos.x + (Math.random() - 0.5) * 6, 5 + Math.random() * 8, pos.z + (Math.random() - 0.5) * 4), {
        vx: Math.cos(a) * sp * 0.5,
        vy: 2 + Math.random() * 5,
        vz: Math.sin(a) * sp * 0.5,
        life: 1.8 + Math.random() * 2.4,
        size: 0.12 + Math.random() * 0.18,
        color: colors[Math.floor(Math.random() * colors.length)],
        gravity: 4.5,
        drag: 0.35,
      });
    }
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn(new THREE.Vector3(pos.x, 0.2, pos.z), {
        vx: Math.cos(a) * 2.5,
        vy: 5 + Math.random() * 5,
        vz: Math.sin(a) * 2.5,
        life: 1.2 + Math.random(),
        size: 0.16,
        color: 0xffffff,
        gravity: 3,
        drag: 0.8,
      });
    }
  }

  trailPuff(pos, color = 0xd7ff4a) {
    this.spawn(pos, {
      vx: (Math.random() - 0.5) * 2,
      vy: 0.4 + Math.random(),
      vz: (Math.random() - 0.5) * 2,
      life: 0.45,
      size: 0.16 + Math.random() * 0.14,
      color,
      gravity: -1,
      drag: 1.4,
    });
  }

  update(dt) {
    const pos = this.positions;
    const colors = this.colors;
    const sizes = this.sizes;
    const alphas = this.alphas;
    for (let i = 0; i < MAX; i++) {
      const p = this.particles[i];
      if (!p.active) {
        alphas[i] = 0;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        alphas[i] = 0;
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.04) {
        p.pos.y = 0.04;
        p.vel.y = Math.abs(p.vel.y) * 0.3;
        p.vel.x *= 0.8;
        p.vel.z *= 0.8;
      }
      const k = p.life / p.maxLife;
      pos[i * 3] = p.pos.x;
      pos[i * 3 + 1] = p.pos.y;
      pos[i * 3 + 2] = p.pos.z;
      colors[i * 3] = p.color.r;
      colors[i * 3 + 1] = p.color.g;
      colors[i * 3 + 2] = p.color.b;
      sizes[i] = p.size * (0.4 + k * 0.8);
      alphas[i] = Math.min(1, k * 2.2) * p.fade;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.geometry.attributes.size.needsUpdate = true;
    this.points.geometry.attributes.alpha.needsUpdate = true;

    for (const r of this.rings) {
      if (!r.active) continue;
      r.t += dt;
      const k = r.t / r.life;
      if (k >= 1) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      r.mesh.scale.setScalar(1 + (r.maxScale - 1) * (1 - Math.pow(1 - k, 2)));
      r.mesh.material.opacity = 0.7 * (1 - k);
    }
  }
}
