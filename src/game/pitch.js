import * as THREE from 'three';
import { FIELD, TEAMS } from './constants.js';

const TAU = Math.PI * 2;

function canvasTexture(w, h, draw, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = opts.anisotropy ?? 4;
  if (opts.repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  return tex;
}

function grassTexture() {
  return canvasTexture(
    1024,
    1024,
    (ctx, w, h) => {
      const bands = 16;
      for (let i = 0; i < bands; i++) {
        const t = i / bands;
        ctx.fillStyle = i % 2 === 0 ? '#115039' : '#0b432e';
        ctx.fillRect(0, (h / bands) * i, w, h / bands + 1);
      }
      const grad = ctx.createRadialGradient(w / 2, h / 2, 80, w / 2, h / 2, w * 0.72);
      grad.addColorStop(0, 'rgba(96, 195, 120, 0.22)');
      grad.addColorStop(1, 'rgba(0, 8, 12, 0.3)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // grass grain
      for (let i = 0; i < 16000; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const a = Math.random();
        ctx.fillStyle = a > 0.5 ? `rgba(95, 170, 96, ${0.03 + Math.random() * 0.08})` : `rgba(0, 18, 9, ${0.04 + Math.random() * 0.14})`;
        ctx.fillRect(x, y, 1 + Math.random() * 2.4, 1 + Math.random() * 2);
      }
      // mow sheen
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = '#b7ff8a';
      for (let i = 0; i < bands; i += 2) ctx.fillRect(0, (h / bands) * i, w, 2);
      ctx.globalAlpha = 1;
    },
    { anisotropy: 8 }
  );
}

function adTexture(lines, accent) {
  return canvasTexture(1024, 128, (ctx, w, h) => {
    ctx.fillStyle = '#050a12';
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(8, 18, 30, 1)');
    g.addColorStop(0.5, 'rgba(14, 26, 40, 1)');
    g.addColorStop(1, 'rgba(7, 15, 26, 1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(w, 8);
    ctx.moveTo(0, h - 8);
    ctx.lineTo(w, h - 8);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = accent;
    ctx.font = '700 58px Manrope, Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '10px';
    ctx.fillText(lines, w / 2, h / 2 + 3);
  });
}

function signTexture() {
  return canvasTexture(1024, 320, (ctx, w, h) => {
    ctx.fillStyle = '#04070d';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(68,243,255,0.55)';
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 34;
    ctx.shadowColor = '#44f3ff';
    ctx.fillStyle = '#e9ffff';
    ctx.font = '400 128px "Bebas Neue", Impact, sans-serif';
    ctx.letterSpacing = '9px';
    ctx.fillText('NEON LEAGUE', w / 2, h * 0.43, w - 130);
    ctx.shadowColor = '#d7ff4a';
    ctx.fillStyle = '#d7ff4a';
    ctx.font = '800 42px Manrope, Arial, sans-serif';
    ctx.letterSpacing = '13px';
    ctx.fillText('3 V 3  STREET FOOTBALL', w / 2, h * 0.72, w - 170);
  });
}

function radialGlowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(120,220,255,0)') {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.28, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(120,230,255,0.13)');
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

function flatMat(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false });
}

function addLine(group, x1, z1, x2, z2, width = 0.1, opacity = 0.52, color = 0xeafcff) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, width), flatMat(color, opacity));
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = -Math.atan2(dz, dx);
  mesh.position.set((x1 + x2) / 2, 0.016, (z1 + z2) / 2);
  group.add(mesh);
  return mesh;
}

function addRing(group, x, z, radius, thickness, color = 0xeafcff, opacity = 0.45, thetaStart = 0, thetaLength = TAU) {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(radius - thickness, radius, 72, 1, thetaStart, thetaLength),
    flatMat(color, opacity)
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.017, z);
  group.add(mesh);
  return mesh;
}

function makeNet(z, dir, color = 0x9fd9e6) {
  const pts = [];
  const halfW = FIELD.goalWidth / 2;
  const h = FIELD.goalHeight;
  const depth = FIELD.goalDepth;
  const back = z + dir * depth;
  const step = 0.42;
  // back grid
  for (let x = -halfW; x <= halfW + 0.001; x += step) {
    pts.push(x, 0.06, back, x, h, back);
  }
  for (let y = 0.06; y <= h + 0.001; y += step) {
    pts.push(-halfW, y, back, halfW, y, back);
  }
  // side grids
  for (const sx of [-halfW, halfW]) {
    for (let y = 0.06; y <= h + 0.001; y += step) {
      pts.push(sx, y, z, sx, y, back);
    }
    for (let zz = z; zz <= back + 0.001; zz += step) {
      pts.push(sx, 0.06, zz, sx, h, zz);
    }
  }
  // top grid
  for (let x = -halfW; x <= halfW + 0.001; x += step) {
    pts.push(x, h, z, x, h, back);
  }
  for (let zz = z; zz <= back + 0.001; zz += step) {
    pts.push(-halfW, h, zz, halfW, h, zz);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false });
  return new THREE.LineSegments(geo, mat);
}

function createGoal(team, z) {
  const group = new THREE.Group();
  const dir = Math.sign(z);
  const halfW = FIELD.goalWidth / 2;
  const h = FIELD.goalHeight;
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0xf4feff,
    roughness: 0.28,
    metalness: 0.55,
    emissive: 0xbfeaff,
    emissiveIntensity: 0.18,
  });
  const postGeo = new THREE.CylinderGeometry(0.075, 0.075, h, 10);
  for (const x of [-halfW, halfW]) {
    const post = new THREE.Mesh(postGeo, frameMat);
    post.position.set(x, h / 2, z);
    post.castShadow = true;
    group.add(post);
    // rear support
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, FIELD.goalDepth + 0.08, 8), frameMat);
    back.rotation.x = Math.PI / 2;
    back.position.set(x, 0.08, z + dir * FIELD.goalDepth * 0.5);
    group.add(back);
    const support = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, h, 8), frameMat);
    support.position.set(x, h / 2, z + dir * FIELD.goalDepth);
    group.add(support);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, FIELD.goalWidth + 0.18, 10), frameMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, h, z);
  bar.castShadow = true;
  group.add(bar);

  const neon = new THREE.Mesh(
    new THREE.BoxGeometry(FIELD.goalWidth - 0.2, 0.035, 0.05),
    new THREE.MeshBasicMaterial({ color: team.color })
  );
  neon.position.set(0, h - 0.13, z + 0.08 * -dir);
  group.add(neon);

  group.add(makeNet(z, dir));
  return group;
}

function createFloodlight(x, z, target, glowTex) {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.6, metalness: 0.65 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 16, 8), poleMat);
  pole.position.set(x, 8, z);
  group.add(pole);
  const head = new THREE.Group();
  head.position.set(x, 16, z);
  head.lookAt(target.x, 9, target.z);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.25, 0.4), poleMat);
  head.add(housing);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xf4ffff });
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 2; j++) {
      const lamp = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.36), lampMat);
      lamp.position.set(-1.25 + i * 0.62, -0.2 + j * 0.42, 0.21);
      head.add(lamp);
    }
  }
  group.add(head);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xbdefff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    })
  );
  glow.scale.set(9, 9, 1);
  glow.position.set(x, 16, z);
  group.add(glow);
  return group;
}

function createSky(scene) {
  const geo = new THREE.SphereGeometry(160, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x010309) },
      mid: { value: new THREE.Color(0x071527) },
      bottom: { value: new THREE.Color(0x02050b) },
    },
    vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vPos;
      void main(){
        float h = normalize(vPos).y;
        vec3 c = mix(bottom, mid, smoothstep(-0.08, 0.2, h));
        c = mix(c, top, smoothstep(0.16, 0.85, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(geo, mat));

  const starGeo = new THREE.BufferGeometry();
  const arr = [];
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * TAU;
    const y = 0.25 + Math.random() * 0.7;
    const r = Math.sqrt(1 - y * y) * 145;
    arr.push(Math.cos(a) * r, y * 145, Math.sin(a) * r);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0x88a9d0, size: 0.45, transparent: true, opacity: 0.55, depthWrite: false, fog: false })
  );
  scene.add(stars);

  // distant city blocks
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cityMat = new THREE.MeshStandardMaterial({
    color: 0x050b14,
    roughness: 0.9,
    metalness: 0.1,
    emissive: 0x071828,
    emissiveIntensity: 1,
  });
  const city = new THREE.InstancedMesh(boxGeo, cityMat, 46);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * TAU + Math.random() * 0.08;
    const r = 86 + Math.random() * 34;
    const h = 8 + Math.random() * 28;
    p.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
    s.set(6 + Math.random() * 9, h, 6 + Math.random() * 9);
    m.compose(p, q, s);
    city.setMatrixAt(i, m);
  }
  city.instanceMatrix.needsUpdate = true;
  scene.add(city);
}

function createAds(group) {
  const lines = [
    ['NEON LEAGUE', '#44f3ff'],
    ['NO RULES · JUST GRAVITY', '#d7ff4a'],
    ['3V3 STREET FOOTBALL', '#ff4b9d'],
    ['PICK YOUR PLAYSTYLE', '#44f3ff'],
    ['DEMO BUILD', '#d7ff4a'],
  ];
  const textures = lines.map(([text, color]) => adTexture(text, color));
  const boardGeo = new THREE.PlaneGeometry(7.4, 1.04);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const tex = textures[(i + (side > 0 ? 1 : 0)) % textures.length];
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 0.5,
        roughness: 0.5,
        side: THREE.DoubleSide,
      });
      const board = new THREE.Mesh(boardGeo, mat);
      board.position.set(side * (FIELD.halfWidth + 2.1), 1.12, -21.4 + i * 10.7);
      board.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      group.add(board);
    }
  }
}

function createStands(group, glowTex) {
  const standMat = new THREE.MeshStandardMaterial({ color: 0x081220, roughness: 0.88, metalness: 0.12 });
  const railMat = new THREE.MeshBasicMaterial({ color: 0x123a55, transparent: true, opacity: 0.7 });
  for (const side of [-1, 1]) {
    const baseX = side * (FIELD.halfWidth + 5.4);
    for (let tier = 0; tier < 7; tier++) {
      const depth = 1.3;
      const h = 0.62;
      const step = new THREE.Mesh(new THREE.BoxGeometry(depth, h, FIELD.halfLength * 2 + 9), standMat);
      step.position.set(baseX + side * tier * 1.18, 0.35 + tier * 0.52, 0);
      step.receiveShadow = true;
      group.add(step);
      if (tier === 6) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, FIELD.halfLength * 2 + 9), railMat);
        rail.position.set(baseX + side * tier * 1.18, 4.05, 0);
        group.add(rail);
      }
    }
    // corner glowing pylons
    for (const z of [-FIELD.halfLength - 3, FIELD.halfLength + 3]) {
      const pylon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.16, 2.6, 8),
        new THREE.MeshBasicMaterial({ color: side > 0 ? TEAMS.away.color : TEAMS.home.color })
      );
      pylon.position.set(baseX, 1.3, z);
      group.add(pylon);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTex, color: side > 0 ? TEAMS.away.color : TEAMS.home.color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      glow.scale.set(2.4, 2.4, 1);
      glow.position.set(baseX, 2.8, z);
      group.add(glow);
    }
  }

  // crowd
  const count = 1000;
  const geo = new THREE.BoxGeometry(0.26, 0.5, 0.28);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  const crowd = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const palette = [
    new THREE.Color(0x213044), new THREE.Color(0x2c3a51), new THREE.Color(0x1a2435),
    new THREE.Color(0x35e7ff), new THREE.Color(0xff3d8b), new THREE.Color(0xd7ff4a),
    new THREE.Color(0xd8e8ff), new THREE.Color(0x8f5bff),
  ];
  let n = 0;
  for (let i = 0; i < count * 2; i++) {
    if (n >= count) break;
    const side = Math.random() > 0.5 ? 1 : -1;
    const tier = Math.floor(Math.random() * 7);
    const baseX = side * (FIELD.halfWidth + 5.4);
    const x = baseX + side * tier * 1.18 + (Math.random() - 0.5) * 0.45;
    const y = 0.72 + tier * 0.52 + 0.26;
    const z = (Math.random() - 0.5) * (FIELD.halfLength * 2 + 7.5);
    if (Math.random() < 0.22) continue;
    p.set(x, y, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 0.5);
    m.compose(p, q, s);
    crowd.setMatrixAt(n, m);
    crowd.setColorAt(n, palette[Math.floor(Math.random() * palette.length)]);
    n++;
  }
  crowd.count = n;
  crowd.instanceMatrix.needsUpdate = true;
  group.add(crowd);
}

export function createStadium(scene, renderer) {
  const world = new THREE.Group();
  const glowTex = radialGlowTexture();
  const detail = window.devicePixelRatio <= 1.5 && window.innerWidth < 900 ? 0.7 : 1;

  createSky(scene);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220),
    new THREE.MeshStandardMaterial({ color: 0x04080f, roughness: 0.95, metalness: 0.05 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.06;
  floor.receiveShadow = true;
  world.add(floor);

  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD.halfWidth * 2, FIELD.halfLength * 2),
    new THREE.MeshStandardMaterial({
      map: grassTexture(),
      roughness: 0.9,
      metalness: 0.02,
      color: 0xd8ecdb,
    })
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  world.add(pitch);

  const markings = new THREE.Group();
  const hw = FIELD.halfWidth;
  const hl = FIELD.halfLength;
  addLine(markings, -hw, -hl, hw, -hl, 0.13);
  addLine(markings, -hw, hl, hw, hl, 0.13);
  addLine(markings, -hw, -hl, -hw, hl, 0.13);
  addLine(markings, hw, -hl, hw, hl, 0.13);
  addLine(markings, -hw, 0, hw, 0, 0.11);
  addRing(markings, 0, 0, 6, 0.1, 0xeafcff, 0.46);
  addRing(markings, 0, 0, 0.28, 0.15, 0xeafcff, 0.5);
  const boxW = 8.4;
  const boxD = 7;
  for (const dir of [-1, 1]) {
    addLine(markings, -boxW, dir * hl, -boxW, dir * (hl - boxD), 0.1);
    addLine(markings, boxW, dir * hl, boxW, dir * (hl - boxD), 0.1);
    addLine(markings, -boxW, dir * (hl - boxD), boxW, dir * (hl - boxD), 0.1);
    addRing(markings, 0, dir * (hl - 1.9), 0.16, 0.12, 0xeafcff, 0.52);
    // penalty arc
    addRing(markings, 0, dir * (hl - 5.2), 5.4, 0.09, 0xeafcff, 0.4, dir > 0 ? 0.35 : Math.PI + 0.35, Math.PI - 0.7);
  }
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      addRing(markings, x * (hw - 1.1), z * (hl - 1.1), 1.05, 0.07, 0xeafcff, 0.35, x > 0 && z > 0 ? Math.PI : x < 0 && z > 0 ? Math.PI / 2 : x > 0 && z < 0 ? -Math.PI / 2 : 0, Math.PI / 2);
    }
  }
  world.add(markings);

  // luminous touchlines just inside the boards
  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, hl * 2), new THREE.MeshBasicMaterial({ color: side > 0 ? TEAMS.away.color : TEAMS.home.color, transparent: true, opacity: 0.32 }));
    strip.position.set(side * (hw - 0.17), 0.03, 0);
    world.add(strip);
  }

  // perimeter boards
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x0a1726, roughness: 0.55, metalness: 0.5 });
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x44f3ff, transparent: true, opacity: 0.55 });
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, FIELD.wallHeight, hl * 2 + 0.6), boardMat);
    wall.position.set(side * (hw + 0.16), FIELD.wallHeight / 2, 0);
    wall.castShadow = true;
    world.add(wall);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.035, hl * 2 + 0.6), ledMat);
    led.position.set(side * (hw + 0.16), FIELD.wallHeight + 0.01, 0);
    world.add(led);
  }
  for (const dir of [-1, 1]) {
    const team = dir > 0 ? TEAMS.home : TEAMS.away;
    const goalW = FIELD.goalWidth / 2;
    const seg = hw - goalW;
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(seg, FIELD.wallHeight, 0.3), boardMat);
      wall.position.set(side * (goalW + seg / 2), FIELD.wallHeight / 2, dir * (hl + 0.16));
      wall.castShadow = true;
      world.add(wall);
      const led = new THREE.Mesh(new THREE.BoxGeometry(seg, 0.035, 0.33), new THREE.MeshBasicMaterial({ color: team.color, transparent: true, opacity: 0.55 }));
      led.position.set(side * (goalW + seg / 2), FIELD.wallHeight + 0.01, dir * (hl + 0.16));
      world.add(led);
    }
  }

  createAds(world);
  createStands(world, glowTex);

  // goals
  const homeGoal = createGoal(TEAMS.home, -hl);
  const awayGoal = createGoal(TEAMS.away, hl);
  world.add(homeGoal, awayGoal);

  // signs behind goals
  const signTex = signTexture();
  for (const dir of [-1, 1]) {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 4.1),
      new THREE.MeshBasicMaterial({ map: signTex, color: 0xffffff, transparent: true, opacity: 0.95 })
    );
    sign.position.set(0, 5.6, dir * (hl + 9.6));
    sign.rotation.y = dir > 0 ? Math.PI : 0;
    world.add(sign);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: dir > 0 ? TEAMS.away.color : TEAMS.home.color }));
    bar.position.set(0, 3.48, dir * (hl + 9.62));
    world.add(bar);
  }

  // floodlights
  const corners = [
    [-hw - 12, -hl - 8],
    [hw + 12, -hl - 8],
    [-hw - 12, hl + 8],
    [hw + 12, hl + 8],
  ];
  for (const [x, z] of corners) {
    world.add(createFloodlight(x, z, new THREE.Vector3(0, 0, 0), glowTex));
  }

  // moon / haze
  const haze = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTex, color: 0x2d6f9e, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
  );
  haze.scale.set(60, 60, 1);
  haze.position.set(-55, 30, -100);
  world.add(haze);

  scene.add(world);

  // lights
  const hemi = new THREE.HemisphereLight(0x9fd4ff, 0x102417, 1.06);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xf0f8ff, 2.55);
  key.position.set(16, 30, -8);
  key.castShadow = true;
  key.shadow.mapSize.set(detail > 0.8 ? 2048 : 1024, detail > 0.8 ? 2048 : 1024);
  key.shadow.camera.left = -34;
  key.shadow.camera.right = 34;
  key.shadow.camera.top = 38;
  key.shadow.camera.bottom = -38;
  key.shadow.camera.near = 4;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0007;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x62c8ff, 0.95);
  rim.position.set(-22, 16, 24);
  scene.add(rim);

  // mid-pitch neon fill, keeps the turf and players readable on phones
  const midCool = new THREE.PointLight(0x7bfff2, 13, 34, 2);
  midCool.position.set(-12, 8, 0);
  scene.add(midCool);
  const midWarm = new THREE.PointLight(0xff77b5, 10, 34, 2);
  midWarm.position.set(12, 8, 0);
  scene.add(midWarm);

  const accentL = new THREE.PointLight(TEAMS.home.color, 24, 22, 2);
  accentL.position.set(0, 3.2, -hl - 1);
  scene.add(accentL);
  const accentR = new THREE.PointLight(TEAMS.away.color, 24, 22, 2);
  accentR.position.set(0, 3.2, hl + 1);
  scene.add(accentR);

  return {
    world,
    pitch,
    goals: [homeGoal, awayGoal],
    lights: { hemi, key, rim },
  };
}
