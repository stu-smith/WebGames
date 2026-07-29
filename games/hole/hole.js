/* Neon Hole — a hole.io-style city devourer.
 * One shader-cut ground plane, a procedural neon city, and six hungry holes. */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ============================== Constants ============================== */

const WORLD = 300;               // city is WORLD x WORLD units
const HALF = WORLD / 2;
const BOUND = 146;               // hole travel limit
const ROADS = [-126, -84, -42, 0, 42, 84, 126];
const ROAD_HALF = 4.5;
const BLOCK_CENTERS = [-105, -63, -21, 21, 63, 105];
const BLOCK_INNER = 13;          // buildable half-extent inside a block
const MAX_HOLES = 8;
const ROUND_TIME = 180;
const START_RADIUS = 1.35;
const START_LIVES = 3;

const TIERS = [
  { r: 0,    name: 'Pothole' },
  { r: 2.0,  name: 'Drain' },
  { r: 2.9,  name: 'Sinkhole' },
  { r: 4.0,  name: 'Crater' },
  { r: 5.4,  name: 'Devourer' },
  { r: 7.0,  name: 'Chasm' },
  { r: 9.0,  name: 'Abyss' },
  { r: 11.5, name: 'City Ender' },
];

const NPC_POOL = [
  { name: 'Gulp',          color: 0xff4fa3 },
  { name: 'Sir Sinksalot', color: 0x8dff57 },
  { name: 'Voidney',       color: 0xffb347 },
  { name: 'Nibbles',       color: 0xb26bff },
  { name: 'The Pit',       color: 0xff5c5c },
  { name: 'Kerb Krusher',  color: 0x57d9ff },
  { name: 'Doom Drain',    color: 0xf3ff6b },
  { name: 'Slurp',         color: 0x6bffc9 },
];

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = THREE.MathUtils.clamp;

/* ============================== Renderer / scene ============================== */

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x140f2a, 140, 460);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.5, 1200);
camera.position.set(0, 80, 110);
camera.lookAt(0, 0, 0);

const hemi = new THREE.HemisphereLight(0xa89aff, 0x2c3a48, 1.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9b0, 2.0);
sun.position.set(130, 190, 90);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -175;
sun.shadow.camera.right = 175;
sun.shadow.camera.top = 175;
sun.shadow.camera.bottom = -175;
sun.shadow.camera.near = 20;
sun.shadow.camera.far = 500;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(new THREE.AmbientLight(0x404060, 0.75));

/* Sky dome + stars + moon (fog-free backdrop) */
{
  const domeGeo = new THREE.SphereGeometry(620, 24, 12);
  const pos = domeGeo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0x241549);
  const bottom = new THREE.Color(0x0d0a1c);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = clamp(pos.getY(i) / 620, 0, 1);
    c.lerpColors(bottom, top, t);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  domeGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dome = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  dome.renderOrder = -10;
  scene.add(dome);

  const starPos = new Float32Array(260 * 3);
  for (let i = 0; i < 260; i++) {
    const a = rand(0, Math.PI * 2);
    const e = rand(0.12, 1.4);
    const r2 = 560;
    starPos[i * 3] = Math.cos(a) * Math.cos(e) * r2;
    starPos[i * 3 + 1] = Math.sin(e) * r2;
    starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r2;
  }
  const stars = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPos, 3)),
    new THREE.PointsMaterial({ color: 0xcdd6ff, size: 2.2, fog: false, sizeAttenuation: false })
  );
  scene.add(stars);

  const moonCanvas = document.createElement('canvas');
  moonCanvas.width = moonCanvas.height = 128;
  const mc = moonCanvas.getContext('2d');
  const grad = mc.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,224,244,1)');
  grad.addColorStop(0.42, 'rgba(255,180,226,0.85)');
  grad.addColorStop(1, 'rgba(255,150,210,0)');
  mc.fillStyle = grad;
  mc.fillRect(0, 0, 128, 128);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(moonCanvas), fog: false, depthWrite: false, transparent: true,
  }));
  moon.position.set(260, 230, -420);
  moon.scale.set(110, 110, 1);
  scene.add(moon);
}

/* ============================== Audio ============================== */

const AudioFX = {
  ctx: null,
  master: null,
  muted: localStorage.getItem('hole-muted') === '1',
  ensure() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    } catch (e) { /* audio unsupported */ }
  },
  blip(f0, f1, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol || 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },
  eat(size) {
    const f = clamp(620 - size * 55, 90, 620);
    this.blip(f, f * 0.28, 0.16 + Math.min(0.25, size * 0.03), 'sine', 0.55);
    if (size > 2.4) this.blip(90, 32, 0.5, 'sine', 0.7);
  },
  tier() { this.blip(420, 620, 0.12, 'square', 0.22); setTimeout(() => this.blip(620, 900, 0.16, 'square', 0.22), 110); },
  hurt() { this.blip(320, 55, 0.55, 'sawtooth', 0.5); },
  devour() { this.blip(150, 30, 0.7, 'sine', 0.85); this.blip(500, 120, 0.3, 'triangle', 0.3); },
  start() { this.blip(240, 480, 0.2, 'triangle', 0.3); },
  over() { this.blip(400, 80, 0.9, 'sawtooth', 0.35); },
};

/* ============================== Ground (painted city + hole shader) ============================== */

const holesUniform = { value: [] };
for (let i = 0; i < MAX_HOLES; i++) holesUniform.value.push(new THREE.Vector3(0, 0, -1));

const districtGrid = [];          // [bx][bz] -> district string
function computeDistricts() {
  for (let bx = 0; bx < 6; bx++) {
    districtGrid[bx] = [];
    for (let bz = 0; bz < 6; bz++) {
      let d;
      if ((bx === 2 || bx === 3) && (bz === 2 || bz === 3)) {
        d = bx === 3 && bz === 3 ? 'plaza' : bx === 3 && bz === 2 ? 'pondpark' : 'park';
      } else if (bx >= 4 && bz <= 2) d = 'downtown';
      else if (bx <= 1 && bz <= 2) d = 'residential';
      else if (bx <= 2 && bz >= 4) d = 'commercial';
      else if (bx >= 3 && bz >= 4) d = 'industrial';
      else if (bx === 2 && bz === 0) d = 'stadium';
      else if (bx === 3 && bz === 0) d = 'church';
      else d = 'mixed';
      districtGrid[bx][bz] = d;
    }
  }
}

const DISTRICT_FILL = {
  park: '#3d7a42', pondpark: '#3d7a42', plaza: '#5c5568',
  downtown: '#4a4a5a', residential: '#417044', commercial: '#564e5c',
  industrial: '#4e4a46', stadium: '#3a8a42', church: '#456a3e', mixed: '#4a4e58',
};

function paintGround() {
  const S = 2048 / WORLD;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 2048;
  const g = cv.getContext('2d');
  const px = (x) => (x + HALF) * S;
  const rect = (x, z, w, h, fill) => { g.fillStyle = fill; g.fillRect(px(x), px(z), w * S, h * S); };

  // base: perimeter grass
  g.fillStyle = '#31582c';
  g.fillRect(0, 0, 2048, 2048);
  // subtle noise patches
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(${randInt(30, 65)},${randInt(70, 105)},${randInt(30, 60)},0.25)`;
    const x = rand(-HALF, HALF), z = rand(-HALF, HALF);
    g.fillRect(px(x), px(z), rand(2, 9) * S, rand(2, 9) * S);
  }

  // blocks: pavement ring then district fill
  for (let bx = 0; bx < 6; bx++) {
    for (let bz = 0; bz < 6; bz++) {
      const cx = BLOCK_CENTERS[bx], cz = BLOCK_CENTERS[bz];
      const h = 16.5;
      rect(cx - h, cz - h, h * 2, h * 2, '#75757f');
      rect(cx - h + 3.4, cz - h + 3.4, (h - 3.4) * 2, (h - 3.4) * 2, DISTRICT_FILL[districtGrid[bx][bz]]);
    }
  }

  // roads
  g.fillStyle = '#2e2e3c';
  for (const r of ROADS) {
    g.fillRect(px(r - ROAD_HALF), 0, ROAD_HALF * 2 * S, 2048);
    g.fillRect(0, px(r - ROAD_HALF), 2048, ROAD_HALF * 2 * S);
  }
  // centre dashes (skip intersections)
  g.fillStyle = '#b9a94a';
  const nearRoad = (v) => ROADS.some((r) => Math.abs(v - r) < 7);
  for (const r of ROADS) {
    for (let t = -HALF + 2; t < HALF - 2; t += 6) {
      if (!nearRoad(t + 1.5)) {
        g.fillRect(px(r - 0.22), px(t), 0.44 * S, 3 * S);
        g.fillRect(px(t), px(r - 0.22), 3 * S, 0.44 * S);
      }
    }
  }
  // crosswalks
  g.fillStyle = 'rgba(230,230,240,0.85)';
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      for (let i = -3; i <= 3; i++) {
        g.fillRect(px(rx + i * 1.3 - 0.45), px(rz - ROAD_HALF - 2.6), 0.9 * S, 2.2 * S);
        g.fillRect(px(rx + i * 1.3 - 0.45), px(rz + ROAD_HALF + 0.4), 0.9 * S, 2.2 * S);
        g.fillRect(px(rx - ROAD_HALF - 2.6), px(rz + i * 1.3 - 0.45), 2.2 * S, 0.9 * S);
        g.fillRect(px(rx + ROAD_HALF + 0.4), px(rz + i * 1.3 - 0.45), 2.2 * S, 0.9 * S);
      }
    }
  }

  // park paths (cross through the 2x2 park cluster)
  const pkMin = BLOCK_CENTERS[2] - 13, pkMax = BLOCK_CENTERS[3] + 13;
  g.fillStyle = '#8d7f63';
  g.fillRect(px(pkMin), px(-2), (pkMax - pkMin) * S, 4 * S);
  g.fillRect(px(-2), px(pkMin), 4 * S, (pkMax - pkMin) * S);

  // pond in the pondpark block
  {
    const cx = BLOCK_CENTERS[3], cz = BLOCK_CENTERS[2];
    g.fillStyle = '#7d7259';
    g.beginPath(); g.ellipse(px(cx + 1), px(cz - 1), 9.6 * S, 7.6 * S, 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2e6f8f';
    g.beginPath(); g.ellipse(px(cx + 1), px(cz - 1), 8.4 * S, 6.4 * S, 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3f8fae';
    g.beginPath(); g.ellipse(px(cx - 1), px(cz - 2), 4.5 * S, 3 * S, 0.3, 0, Math.PI * 2); g.fill();
  }

  // plaza tiles
  {
    const cx = BLOCK_CENTERS[3], cz = BLOCK_CENTERS[3];
    for (let ix = -6; ix < 6; ix++) {
      for (let iz = -6; iz < 6; iz++) {
        if ((ix + iz) % 2 === 0) rect(cx + ix * 2.15, cz + iz * 2.15, 2.15, 2.15, '#585264');
      }
    }
  }

  // stadium pitch
  {
    const cx = BLOCK_CENTERS[2], cz = BLOCK_CENTERS[0];
    for (let i = 0; i < 6; i++) rect(cx - 12 + i * 4, cz - 8, 4, 16, i % 2 ? '#2e6b33' : '#35793b');
    g.strokeStyle = 'rgba(240,240,240,0.9)';
    g.lineWidth = 0.4 * S;
    g.strokeRect(px(cx - 11.5), px(cz - 7.5), 23 * S, 15 * S);
    g.beginPath(); g.moveTo(px(cx), px(cz - 7.5)); g.lineTo(px(cx), px(cz + 7.5)); g.stroke();
    g.beginPath(); g.arc(px(cx), px(cz), 3 * S, 0, Math.PI * 2); g.stroke();
  }

  // church gravel path
  {
    const cx = BLOCK_CENTERS[3], cz = BLOCK_CENTERS[0];
    rect(cx - 1.5, cz, 3, 15, '#8d7f63');
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

let ground;
function buildGround() {
  computeDistricts();
  const tex = paintGround();
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHoles = holesUniform;
    shader.vertexShader = 'varying vec3 vGroundPos;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvGroundPos = position;'
    );
    shader.fragmentShader = `uniform vec3 uHoles[${MAX_HOLES}];\nvarying vec3 vGroundPos;\n` +
      shader.fragmentShader.replace(
        '#include <clipping_planes_fragment>',
        `for (int i = 0; i < ${MAX_HOLES}; i++) {
           if (uHoles[i].z > 0.0 && distance(vGroundPos.xz, uHoles[i].xy) < uHoles[i].z) discard;
         }
         #include <clipping_planes_fragment>`
      );
  };
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, 1, 1);
  geo.rotateX(-Math.PI / 2);
  ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  scene.add(ground);
}
buildGround();

/* ============================== Geometry helpers + prop templates ============================== */

const matLit = new THREE.MeshLambertMaterial({ vertexColors: true });

function tint(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
function box(w, h, d, color, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return tint(g, color);
}
function cyl(rt, rb, h, seg, color, x = 0, y = 0, z = 0) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y, z);
  return tint(g, color);
}
function cone(r, h, seg, color, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.ConeGeometry(r, h, seg);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return tint(g, color);
}
function sph(r, color, x = 0, y = 0, z = 0, sy = 1) {
  const g = new THREE.SphereGeometry(r, 10, 8);
  if (sy !== 1) g.scale(1, sy, 1);
  g.translate(x, y, z);
  return tint(g, color);
}
function wheel(r, w, color, x, y, z) {
  const g = new THREE.CylinderGeometry(r, r, w, 10);
  g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return tint(g, color);
}
function litMesh(geo, shadow = true) {
  const m = new THREE.Mesh(geo, matLit);
  m.castShadow = shadow;
  return m;
}

/* window-facade textures for taller buildings */
function windowTexture(facade, litColors) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = facade;
  g.fillRect(0, 0, 64, 64);
  for (let ix = 0; ix < 4; ix++) {
    for (let iy = 0; iy < 4; iy++) {
      g.fillStyle = Math.random() < 0.62 ? pick(litColors) : '#141824';
      g.fillRect(ix * 16 + 4, iy * 16 + 3, 8, 10);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}
const facadeMats = [
  ['#2c3242', ['#ffd98a', '#ffe9b8', '#9adfff']],
  ['#3a3040', ['#ffc2e0', '#ffd98a', '#b5f0ff']],
  ['#26333a', ['#a0f0d8', '#ffe9b8', '#ffd98a']],
].map(([f, lit]) => {
  const t = windowTexture(f, lit);
  return new THREE.MeshLambertMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.4 });
});

function scaleBoxUV(geo, w, h, d, cell) {
  const uv = geo.attributes.uv;
  const face = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * face[f][0] / cell, uv.getY(i) * face[f][1] / cell);
    }
  }
}
function facadeBox(w, h, d, matIndex) {
  const g = new THREE.BoxGeometry(w, h, d);
  scaleBoxUV(g, w, h, d, 2.7);
  g.translate(0, h / 2, 0);
  const m = new THREE.Mesh(g, facadeMats[matIndex % facadeMats.length]);
  m.castShadow = true;
  return m;
}

function signTexture(text, color) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#12101e';
  g.fillRect(0, 0, 256, 64);
  g.font = '700 40px "Outfit", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 16;
  g.fillStyle = color;
  g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const roofSignMats = ['NEON', 'VOID inc', 'HOLE FOODS'].map((txt, i) =>
  new THREE.MeshBasicMaterial({
    map: signTexture(txt, ['#00e5ff', '#ff4fa3', '#8dff57'][i]),
    side: THREE.DoubleSide,
  }));

/* --- template registry: key -> { obj, eatR, score } --- */
const TEMPLATES = {};
function template(key, eatR, buildFn, scoreBonus = 0) {
  const obj = buildFn();
  obj.userData.eatR = eatR;
  TEMPLATES[key] = { obj, eatR, score: Math.round(5 + eatR * eatR * 6) + scoreBonus };
}
function mergedTemplate(key, eatR, parts, shadow = true, scoreBonus = 0) {
  template(key, eatR, () => litMesh(mergeGeometries(parts(), false), shadow), scoreBonus);
}

function buildTemplates() {
  const T = TEMPLATES;
  for (const k in T) delete T[k];

  mergedTemplate('lamp', 0.55, () => [
    cyl(0.09, 0.13, 5.2, 6, '#39405a', 0, 2.6, 0),
    box(0.14, 0.12, 1.3, '#39405a', 0, 5.1, 0.55),
    sph(0.3, '#ffedb0', 0, 5.0, 1.1),
  ], false);

  mergedTemplate('bench', 0.7, () => [
    box(2.0, 0.12, 0.55, '#9a6a3c', 0, 0.55, 0),
    box(2.0, 0.5, 0.1, '#9a6a3c', 0, 0.95, -0.26),
    box(0.12, 0.55, 0.5, '#2c2c34', -0.85, 0.28, 0),
    box(0.12, 0.55, 0.5, '#2c2c34', 0.85, 0.28, 0),
  ], false);

  mergedTemplate('hydrant', 0.38, () => [
    cyl(0.22, 0.26, 0.75, 8, '#e34b4b', 0, 0.38, 0),
    sph(0.2, '#e34b4b', 0, 0.8, 0),
    box(0.62, 0.14, 0.14, '#c23a3a', 0, 0.5, 0),
  ], false);

  mergedTemplate('bin', 0.42, () => [
    cyl(0.34, 0.3, 0.9, 8, '#3c5a46', 0, 0.45, 0),
    cyl(0.37, 0.37, 0.08, 8, '#2c4234', 0, 0.92, 0),
  ], false);

  mergedTemplate('mailbox', 0.45, () => [
    cyl(0.06, 0.06, 0.9, 6, '#333340', 0, 0.45, 0),
    box(0.55, 0.45, 0.4, '#d04b5a', 0, 1.1, 0),
  ], false);

  mergedTemplate('sign-stop', 0.48, () => [
    cyl(0.05, 0.06, 2.4, 6, '#8a8a96', 0, 1.2, 0),
    cyl(0.42, 0.42, 0.06, 8, '#e04444', 0, 2.6, 0),
  ], false);
  mergedTemplate('sign-warn', 0.48, () => [
    cyl(0.05, 0.06, 2.4, 6, '#8a8a96', 0, 1.2, 0),
    cone(0.45, 0.7, 3, '#f0c33c', 0, 2.6, 0),
  ], false);
  mergedTemplate('sign-info', 0.48, () => [
    cyl(0.05, 0.06, 2.4, 6, '#8a8a96', 0, 1.2, 0),
    box(0.7, 0.55, 0.06, '#3c6ce0', 0, 2.55, 0),
  ], false);

  mergedTemplate('traffic', 0.6, () => [
    cyl(0.09, 0.11, 4.6, 6, '#2e2e38', 0, 2.3, 0),
    box(0.42, 1.1, 0.35, '#22222c', 0, 4.4, 0),
    box(0.2, 0.2, 0.08, '#ff5050', 0, 4.78, 0.18),
    box(0.2, 0.2, 0.08, '#ffc250', 0, 4.42, 0.18),
    box(0.2, 0.2, 0.08, '#50ff78', 0, 4.06, 0.18),
  ], false);

  mergedTemplate('busstop', 1.3, () => [
    box(0.12, 2.4, 0.12, '#39405a', -1.6, 1.2, -0.5),
    box(0.12, 2.4, 0.12, '#39405a', 1.6, 1.2, -0.5),
    box(3.8, 0.12, 1.6, '#57e0d0', 0, 2.45, 0),
    box(3.5, 1.2, 0.08, '#6ab0c8', 0, 1.15, -0.62),
    box(3.0, 0.1, 0.45, '#9a6a3c', 0, 0.55, -0.25),
  ], false);

  const treeGreens = ['#2f7a3a', '#3c8a37', '#57a03c'];
  mergedTemplate('tree', 1.05, () => [
    cyl(0.18, 0.26, 1.6, 6, '#6a4a2c', 0, 0.8, 0),
    sph(1.25, pick(treeGreens), 0, 2.6, 0, 1.1),
    sph(0.8, pick(treeGreens), 0.6, 2.0, 0.3),
  ]);
  mergedTemplate('tree-big', 1.45, () => [
    cyl(0.28, 0.4, 2.4, 7, '#5c3f24', 0, 1.2, 0),
    sph(1.9, pick(treeGreens), 0, 4.0, 0, 1.05),
    sph(1.1, pick(treeGreens), 1.0, 3.0, 0.5),
    sph(0.9, pick(treeGreens), -0.9, 3.2, -0.4),
  ]);
  mergedTemplate('tree-pink', 1.05, () => [
    cyl(0.16, 0.24, 1.5, 6, '#6a4a2c', 0, 0.75, 0),
    sph(1.2, '#e08ac0', 0, 2.4, 0, 1.0),
    sph(0.7, '#f0a8d0', 0.55, 1.9, 0.3),
  ]);

  mergedTemplate('bush', 0.55, () => [sph(0.7, pick(treeGreens), 0, 0.5, 0, 0.8)], false);

  mergedTemplate('railing', 0.6, () => {
    const parts = [];
    for (let i = -1; i <= 1; i++) parts.push(box(0.1, 1.0, 0.1, '#3c6448', i * 2.6, 0.5, 0));
    parts.push(box(5.6, 0.09, 0.07, '#3c6448', 0, 0.95, 0));
    parts.push(box(5.6, 0.07, 0.07, '#3c6448', 0, 0.55, 0));
    return parts;
  }, false);

  mergedTemplate('flowerbed', 0.8, () => {
    const parts = [box(1.8, 0.3, 1.1, '#6e5138', 0, 0.15, 0)];
    for (let i = 0; i < 7; i++) {
      parts.push(sph(0.14, pick(['#ff5f8a', '#ffc85f', '#b08aff', '#ff8a5f']),
        rand(-0.7, 0.7), 0.42, rand(-0.35, 0.35)));
    }
    return parts;
  }, false);

  mergedTemplate('fountain', 2.4, () => [
    cyl(2.2, 2.4, 0.7, 14, '#7d7a8c', 0, 0.35, 0),
    cyl(2.0, 2.0, 0.1, 14, '#39c8e8', 0, 0.72, 0),
    cyl(0.3, 0.4, 1.6, 8, '#7d7a8c', 0, 1.3, 0),
    cyl(0.9, 0.7, 0.3, 10, '#8d8a9c', 0, 2.1, 0),
    sph(0.35, '#7ae0f5', 0, 2.5, 0),
  ]);

  mergedTemplate('statue', 2.0, () => [
    box(1.8, 1.0, 1.8, '#5c5a6a', 0, 0.5, 0),
    box(1.3, 0.5, 1.3, '#6c6a7a', 0, 1.25, 0),
    box(0.55, 1.5, 0.45, '#d8b04a', 0, 2.25, 0),
    sph(0.28, '#d8b04a', 0, 3.2, 0),
    box(0.9, 0.18, 0.3, '#d8b04a', 0.2, 2.7, 0, 0.5),
  ]);

  mergedTemplate('obelisk', 3.0, () => [
    box(3.2, 1.0, 3.2, '#55515f', 0, 0.5, 0),
    box(2.2, 0.7, 2.2, '#65616f', 0, 1.35, 0),
    cyl(0.45, 0.85, 8.5, 4, '#7b7689', 0, 5.9, 0),
    cone(0.5, 0.9, 4, '#ffd97a', 0, 10.6, 0),
  ]);

  mergedTemplate('grave', 0.5, () => [
    box(0.7, 0.9, 0.16, '#8a8894', 0, 0.45, 0),
    cyl(0.35, 0.35, 0.16, 8, '#8a8894', 0, 0.9, 0),
  ], false);

  mergedTemplate('crate', 0.6, () => [
    box(0.9, 0.9, 0.9, '#a87840', 0, 0.45, 0),
    box(0.96, 0.14, 0.96, '#8a5f30', 0, 0.45, 0),
  ], false);

  mergedTemplate('pallets', 0.9, () => [
    box(1.6, 0.22, 1.3, '#a87840', 0, 0.11, 0),
    box(1.6, 0.22, 1.3, '#97672f', 0, 0.36, 0, 0.08),
    box(1.6, 0.22, 1.3, '#b5854a', 0, 0.61, 0, -0.06),
  ], false);

  for (const [i, c] of ['#e05555', '#4fae62', '#4f7fd0'].entries()) {
    mergedTemplate('stall' + i, 1.7, () => [
      box(0.14, 1.9, 0.14, '#6e5138', -1.4, 0.95, -0.9),
      box(0.14, 1.9, 0.14, '#6e5138', 1.4, 0.95, -0.9),
      box(0.14, 1.9, 0.14, '#6e5138', -1.4, 0.95, 0.9),
      box(0.14, 1.9, 0.14, '#6e5138', 1.4, 0.95, 0.9),
      box(3.0, 0.5, 1.9, '#8a5f30', 0, 0.85, 0),
      box(0.8, 0.35, 1.2, '#e0c060', -0.7, 1.25, 0),
      box(0.7, 0.3, 1.0, '#d06a5a', 0.8, 1.22, 0),
      cone(2.4, 0.9, 4, c, 0, 2.4, 0, Math.PI / 4),
    ], false);
  }

  mergedTemplate('umbrella', 1.1, () => [
    cyl(0.5, 0.55, 0.75, 8, '#7a7686', 0, 0.4, 0),
    cyl(0.05, 0.05, 2.2, 6, '#44404e', 0, 1.6, 0),
    cone(1.4, 0.6, 8, pick(['#e0557f', '#4fae92', '#e0a04f']), 0, 2.6, 0),
  ], false);

  mergedTemplate('kiosk', 1.9, () => [
    box(2.6, 2.4, 2.2, '#4a5a78', 0, 1.2, 0),
    box(2.9, 0.3, 2.5, '#e0557f', 0, 2.55, 0),
    box(1.8, 1.0, 0.1, '#ffe9b0', 0, 1.35, 1.11),
  ]);

  mergedTemplate('goal', 1.4, () => [
    box(0.14, 2.4, 0.14, '#f0f0f5', -3.4, 1.2, 0),
    box(0.14, 2.4, 0.14, '#f0f0f5', 3.4, 1.2, 0),
    box(7.0, 0.14, 0.14, '#f0f0f5', 0, 2.45, 0),
  ], false);

  mergedTemplate('bleacher', 3.6, () => {
    const parts = [];
    for (let i = 0; i < 4; i++) {
      parts.push(box(15, 0.85, 1.4, i % 2 ? '#4a5a90' : '#5a6aa5', 0, 0.42 + i * 0.85, -i * 1.4));
    }
    parts.push(box(15, 0.4, 5.9, '#3a3a4a', 0, 0.2, -2.1));
    return parts;
  });

  mergedTemplate('floodlight', 1.2, () => [
    cyl(0.16, 0.24, 9, 6, '#4a4a58', 0, 4.5, 0),
    box(1.9, 1.1, 0.3, '#33333f', 0, 9.3, 0),
    box(1.7, 0.9, 0.1, '#fff7d0', 0, 9.3, 0.18),
  ]);

  mergedTemplate('tank', 3.4, () => [
    cyl(2.6, 2.6, 5.2, 14, '#9aa2ae', 0, 2.6, 0),
    cyl(2.7, 2.7, 0.3, 14, '#7a828e', 0, 5.35, 0),
    box(0.2, 6.4, 0.2, '#6a727e', 2.3, 3.2, 0),
  ]);

  for (const [i, c] of ['#c85a3c', '#3c78c8', '#4fae62', '#c8a03c'].entries()) {
    mergedTemplate('container' + i, 2.1, () => [
      box(2.4, 2.5, 6.0, c, 0, 1.25, 0),
      box(2.5, 0.2, 6.1, '#2a2a32', 0, 2.55, 0),
    ]);
  }

  /* --- houses --- */
  const houseWalls = ['#c8b89a', '#b0c4d8', '#d8b0b0', '#b8d0a8'];
  houseWalls.forEach((wall, i) => {
    mergedTemplate('house' + i, 3.4, () => [
      box(6.5, 4.2, 5.5, wall, 0, 2.1, 0),
      cone(5.4, 2.6, 4, '#8a4a3a', 0, 5.5, 0, Math.PI / 4),
      box(1.2, 2.0, 0.15, '#5a3a28', 0, 1.0, 2.78),
      box(1.3, 1.1, 0.12, '#ffe9b0', -2.0, 2.4, 2.78),
      box(1.3, 1.1, 0.12, '#ffe9b0', 2.0, 2.4, 2.78),
      box(1.1, 1.0, 0.12, '#9adfff', -2.2, 2.4, -2.78),
      cyl(0.35, 0.35, 1.8, 6, '#7a5a48', 2.0, 6.0, -1.2),
    ], true, 40);
  });

  /* --- shops --- */
  const awnings = ['#e0557f', '#4fae92', '#e0a04f', '#7f6ae0'];
  awnings.forEach((aw, i) => {
    mergedTemplate('shop' + i, 3.2, () => [
      box(8.0, 4.6, 6.5, '#6a6276', 0, 2.3, 0),
      box(8.3, 0.5, 6.8, '#544e60', 0, 4.85, 0),
      box(6.6, 1.7, 0.15, '#ffedb8', 0, 1.5, 3.28),
      box(8.2, 0.35, 1.5, aw, 0, 3.1, 3.6),
      box(6.0, 0.8, 0.2, aw, 0, 4.0, 3.3),
    ], true, 40);
  });

  /* --- taller buildings: textured facade + lit details, grouped --- */
  function facadeBuilding(w, h, d, matIndex, extras, signIndex = -1) {
    const group = new THREE.Group();
    group.add(facadeBox(w, h, d, matIndex));
    const parts = [box(w + 0.4, 0.55, d + 0.4, '#46425a', 0, h + 0.22, 0),
      box(w * 0.98, 0.7, d * 0.98, '#302e3e', 0, 0.35, 0),
      box(w * 0.35, 1.6, 0.3, '#ffe9b0', 0, 0.9, d / 2 + 0.05)];
    if (extras) parts.push(...extras(w, h, d));
    group.add(litMesh(mergeGeometries(parts, false)));
    if (signIndex >= 0) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, w * 0.24), roofSignMats[signIndex % roofSignMats.length]);
      sign.position.set(0, h + 1.4 + w * 0.12, 0);
      group.add(sign);
    }
    return group;
  }
  const roofClutter = (w, h) => [
    box(1.6, 1.1, 1.4, '#3a3846', -w * 0.22, h + 1.0, -1.0),
    cyl(0.35, 0.35, 1.6, 6, '#4a4856', w * 0.2, h + 1.2, 0.8),
  ];

  for (let i = 0; i < 3; i++) {
    template('midrise' + i, 4.8, () => facadeBuilding(9, rand(11, 16), 8.5, i, roofClutter), 70);
  }
  for (let i = 0; i < 3; i++) {
    template('office' + i, 6.5, () => facadeBuilding(12, rand(20, 26), 11, i + 1, roofClutter), 120);
  }
  for (let i = 0; i < 2; i++) {
    template('tower' + i, 8.2, () =>
      facadeBuilding(13, rand(33, 40), 12.5, i, (w, h) => [
        ...roofClutter(w, h),
        cyl(0.12, 0.12, 6, 5, '#8a8a96', 0, h + 3.2, 0),
        sph(0.3, '#ff5060', 0, h + 6.3, 0),
      ], i), 200);
  }
  template('skyscraper', 9.8, () => {
    const g = new THREE.Group();
    g.add(facadeBuilding(16, 34, 15, 0, null, 2));
    const upper = facadeBox(11, 18, 10.5, 1);
    upper.position.y = 34;
    g.add(upper);
    const crown = litMesh(mergeGeometries([
      box(11.5, 0.6, 11, '#46425a', 0, 52.2, 0),
      cyl(0.15, 0.15, 8, 5, '#8a8a96', 0, 56, 0),
      sph(0.35, '#ff5060', 0, 60.1, 0),
    ], false));
    g.add(crown);
    return g;
  }, 350);

  mergedTemplate('warehouse', 5.0, () => {
    const roof = new THREE.ConeGeometry(1, 1, 4);
    roof.rotateY(Math.PI / 4);
    roof.scale(9.9, 2.2, 7.1);
    roof.translate(0, 6.6, 0);
    tint(roof, '#615d6e');
    return [
      box(14, 5.5, 10, '#7a7684', 0, 2.75, 0),
      roof,
      box(3.5, 3.4, 0.2, '#4a4656', -3, 1.7, 5.05),
      box(3.5, 3.4, 0.2, '#3d3a48', 3, 1.7, 5.05),
    ];
  }, true, 90);

  mergedTemplate('factory', 5.6, () => [
    box(13, 7, 10, '#8a6a5a', 0, 3.5, 0),
    box(13.3, 0.6, 10.3, '#6a4a3a', 0, 7.3, 0),
    cyl(0.9, 1.1, 12, 8, '#9a8a80', -4, 9, -2.5),
    cyl(0.9, 0.9, 1.2, 8, '#c84a4a', -4, 14.5, -2.5),
    cyl(0.7, 0.9, 9, 8, '#9a8a80', 4.2, 8, -2.5),
    box(4, 2.5, 0.2, '#3d3a48', 0, 1.25, 5.05),
  ], true, 100);

  template('church', 4.6, () => {
    const g = new THREE.Group();
    g.add(litMesh(mergeGeometries([
      box(7.5, 6, 12, '#b0a898', 0, 3, 1),
      cone(5.6, 3.2, 4, '#6a5a80', 0, 7.6, 1, Math.PI / 4),
      box(3.2, 10, 3.2, '#b0a898', 0, 5, -6),
      box(1.4, 2.6, 0.15, '#7a5a3a', 0, 1.3, -7.66),
      cyl(1.0, 1.0, 0.1, 10, '#e8d9a0', 0, 8.2, -7.62),
      box(0.16, 1.5, 0.16, '#e8d9a0', 0, 13.7, -6),
      box(0.8, 0.16, 0.16, '#e8d9a0', 0, 13.9, -6),
    ], false)));
    const spire = litMesh(cone(2.3, 4.5, 8, '#5a4a70', 0, 12.2, -6));
    g.add(spire);
    return g;
  }, 120);
}

/* --- people --- */
const SHIRT = ['#e15b64', '#5bc0e1', '#e1c15b', '#8f5be1', '#5be189', '#e15bb0', '#e8e8ee'];
const SKIN = ['#e8b58e', '#c68a5e', '#8a5a3a', '#f0c8a0'];
const personBodies = [];
const personLegGeos = [];
function buildPersonParts() {
  personBodies.length = 0;
  personLegGeos.length = 0;
  for (let i = 0; i < 8; i++) {
    const shirt = pick(SHIRT), skin = pick(SKIN);
    personBodies.push(mergeGeometries([
      box(0.52, 0.62, 0.3, shirt, 0, 1.2, 0),
      sph(0.19, skin, 0, 1.68, 0),
      box(0.13, 0.5, 0.16, shirt, -0.34, 1.2, 0),
      box(0.13, 0.5, 0.16, shirt, 0.34, 1.2, 0),
    ], false));
  }
  for (const pants of ['#31394a', '#4a4a52', '#6a5a4a']) {
    const g = new THREE.BoxGeometry(0.17, 0.62, 0.2);
    g.translate(0, -0.31, 0);
    personLegGeos.push(tint(g, pants));
  }
}

function spawnPerson(x, z) {
  const root = new THREE.Group();
  const body = new THREE.Mesh(pick(personBodies), matLit);
  const legGeo = pick(personLegGeos);
  const legL = new THREE.Mesh(legGeo, matLit);
  const legR = new THREE.Mesh(legGeo, matLit);
  legL.position.set(-0.13, 0.9, 0);
  legR.position.set(0.13, 0.9, 0);
  root.add(body, legL, legR);
  root.position.set(x, 0, z);
  root.rotation.y = rand(0, Math.PI * 2);
  worldGroup.add(root);
  const p = makeProp(root, 0.45, 'person');
  p.score = 15;
  p.legL = legL; p.legR = legR;
  p.heading = root.rotation.y;
  p.walkSpeed = rand(1.0, 2.1);
  p.turnT = rand(1, 4);
  p.phase = rand(0, 10);
  people.push(p);
  return p;
}

/* --- cars --- */
const CAR_COLORS = ['#d04b5a', '#4b7fd0', '#4bd08a', '#d0b34b', '#b06ad0', '#e8e8ee', '#3a3a44'];
const carGeos = { sedan: [], taxi: null, van: null, bus: null };
function buildCarGeos() {
  carGeos.sedan = CAR_COLORS.map((c) => mergeGeometries([
    box(1.9, 0.55, 4.2, c, 0, 0.62, 0),
    box(1.7, 0.5, 2.1, '#1d2430', 0, 1.12, -0.2),
    wheel(0.34, 0.28, '#15151c', -0.95, 0.34, 1.35), wheel(0.34, 0.28, '#15151c', 0.95, 0.34, 1.35),
    wheel(0.34, 0.28, '#15151c', -0.95, 0.34, -1.35), wheel(0.34, 0.28, '#15151c', 0.95, 0.34, -1.35),
    box(0.4, 0.14, 0.1, '#fff3c0', -0.6, 0.66, 2.11), box(0.4, 0.14, 0.1, '#fff3c0', 0.6, 0.66, 2.11),
    box(0.4, 0.14, 0.1, '#ff6060', -0.6, 0.66, -2.11), box(0.4, 0.14, 0.1, '#ff6060', 0.6, 0.66, -2.11),
  ], false));
  carGeos.taxi = mergeGeometries([
    box(1.9, 0.55, 4.2, '#f0c030', 0, 0.62, 0),
    box(1.7, 0.5, 2.1, '#1d2430', 0, 1.12, -0.2),
    box(0.8, 0.3, 0.5, '#f0f0f5', 0, 1.5, -0.2),
    wheel(0.34, 0.28, '#15151c', -0.95, 0.34, 1.35), wheel(0.34, 0.28, '#15151c', 0.95, 0.34, 1.35),
    wheel(0.34, 0.28, '#15151c', -0.95, 0.34, -1.35), wheel(0.34, 0.28, '#15151c', 0.95, 0.34, -1.35),
  ], false);
  carGeos.van = mergeGeometries([
    box(2.1, 1.7, 5.0, '#b8c0cc', 0, 1.05, 0),
    box(2.11, 0.7, 1.4, '#1d2430', 0, 1.55, 1.7),
    wheel(0.4, 0.3, '#15151c', -1.05, 0.4, 1.6), wheel(0.4, 0.3, '#15151c', 1.05, 0.4, 1.6),
    wheel(0.4, 0.3, '#15151c', -1.05, 0.4, -1.6), wheel(0.4, 0.3, '#15151c', 1.05, 0.4, -1.6),
  ], false);
  carGeos.bus = mergeGeometries([
    box(2.4, 2.4, 9.0, '#d0576a', 0, 1.55, 0),
    box(2.42, 0.8, 7.6, '#9adfff', 0, 2.2, 0),
    wheel(0.45, 0.34, '#15151c', -1.2, 0.45, 3.0), wheel(0.45, 0.34, '#15151c', 1.2, 0.45, 3.0),
    wheel(0.45, 0.34, '#15151c', -1.2, 0.45, -3.0), wheel(0.45, 0.34, '#15151c', 1.2, 0.45, -3.0),
  ], false);
}

function spawnCar(kind, x, z, ry, moving) {
  const geo = kind === 'sedan' ? pick(carGeos.sedan)
    : kind === 'taxi' ? carGeos.taxi : kind === 'van' ? carGeos.van : carGeos.bus;
  const mesh = litMesh(geo);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = ry;
  worldGroup.add(mesh);
  const eatR = kind === 'bus' ? 3.2 : kind === 'van' ? 1.8 : 1.5;
  const p = makeProp(mesh, eatR, 'car');
  if (moving) {
    p.moving = true;
    p.axis = moving.axis;
    p.dir = moving.dir;
    p.carSpeed = moving.speed;
    cars.push(p);
  }
  return p;
}

/* ============================== World state ============================== */

const worldGroup = new THREE.Group();
scene.add(worldGroup);

let props = [];
let people = [];
let cars = [];
let holes = [];
let totalPropCount = 0;
let eatenPropCount = 0;

function makeProp(root, eatR, type) {
  const p = {
    root, eatR, type,
    growth: 0.3 + eatR * eatR * 0.55,
    score: Math.round(5 + eatR * eatR * 6),
    alive: true, falling: false, counted: false,
    eater: null, fv: null, av: null,
  };
  props.push(p);
  return p;
}

function placeTemplate(key, x, z, ry = 0) {
  const t = TEMPLATES[key];
  const root = t.obj.clone();
  root.position.set(x, 0, z);
  root.rotation.y = ry;
  worldGroup.add(root);
  const p = makeProp(root, t.eatR, key);
  p.score = t.score;
  return p;
}

/* ============================== City generation ============================== */

function clearWorld() {
  for (let i = worldGroup.children.length - 1; i >= 0; i--) worldGroup.remove(worldGroup.children[i]);
  props = []; people = []; cars = [];
  for (const h of holes) h.destroy();
  holes = [];
  eatenPropCount = 0;
}

function sidewalkFurniture(cx, cz) {
  // props on the pavement ring around a block
  const edge = 14.6;
  const corners = [[-edge, -edge], [edge, -edge], [edge, edge], [-edge, edge]];
  for (const [ox, oz] of corners) {
    if (Math.random() < 0.75) placeTemplate('lamp', cx + ox, cz + oz);
  }
  const smalls = ['hydrant', 'bin', 'mailbox', 'sign-stop', 'sign-warn', 'sign-info', 'bench', 'bush'];
  for (let i = 0; i < 4; i++) {
    const side = randInt(0, 3);
    const t = rand(-10, 10);
    const [ox, oz] = side === 0 ? [t, -edge] : side === 1 ? [t, edge] : side === 2 ? [-edge, t] : [edge, t];
    const ry = side === 0 ? Math.PI : side === 1 ? 0 : side === 2 ? Math.PI / 2 : -Math.PI / 2;
    placeTemplate(pick(smalls), cx + ox, cz + oz, ry);
  }
}

function genBlock(bx, bz) {
  const cx = BLOCK_CENTERS[bx], cz = BLOCK_CENTERS[bz];
  const d = districtGrid[bx][bz];
  sidewalkFurniture(cx, cz);

  const scatterPeople = (n, r) => {
    for (let i = 0; i < n; i++) spawnPerson(cx + rand(-r, r), cz + rand(-r, r));
  };

  if (d === 'residential') {
    for (const [ox, oz] of [[-6.5, -6.5], [6.5, -6.5], [-6.5, 6.5], [6.5, 6.5]]) {
      placeTemplate('house' + randInt(0, 3), cx + ox, cz + oz,
        Math.atan2(-ox, -oz) + rand(-0.15, 0.15));
    }
    placeTemplate('tree', cx + rand(-2, 2), cz + rand(-2, 2));
    for (let i = 0; i < 3; i++) placeTemplate('bush', cx + rand(-11, 11), cz + rand(-11, 11));
    scatterPeople(2, 13);
  } else if (d === 'downtown') {
    const big = Math.random() < 0.3 ? 'skyscraper' : 'tower' + randInt(0, 1);
    placeTemplate(big, cx - 6, cz - 5.5, rand(-0.1, 0.1));
    placeTemplate('office' + randInt(0, 2), cx + 6.5, cz + 6, rand(-0.1, 0.1));
    if (Math.random() < 0.6) placeTemplate('busstop', cx - 8, cz + 13.6, Math.PI);
    scatterPeople(3, 13);
  } else if (d === 'commercial') {
    placeTemplate('shop' + randInt(0, 3), cx - 8, cz - 7, Math.PI / 2);
    placeTemplate('shop' + randInt(0, 3), cx + 6, cz - 7);
    if (bx === 1 && bz === 4) {
      // market square
      for (let i = 0; i < 5; i++) {
        placeTemplate('stall' + randInt(0, 2), cx - 6 + (i % 3) * 6, cz + 4 + Math.floor(i / 3) * 6, rand(0, Math.PI));
      }
      for (let i = 0; i < 4; i++) placeTemplate('crate', cx + rand(-10, 10), cz + rand(2, 11));
      scatterPeople(6, 12);
    } else {
      placeTemplate('shop' + randInt(0, 3), cx - 1, cz + 7, Math.PI);
      placeTemplate('kiosk', cx + 9, cz + 6, -Math.PI / 2);
      placeTemplate('umbrella', cx + 9, cz + 0.5);
      scatterPeople(4, 12);
    }
  } else if (d === 'industrial') {
    if (bx === 4 && bz === 4) {
      placeTemplate('factory', cx, cz - 4);
      placeTemplate('pallets', cx - 8, cz + 8);
      placeTemplate('crate', cx - 4, cz + 9);
    } else {
      placeTemplate('warehouse', cx - 1, cz - 5, bx % 2 ? 0 : Math.PI / 2);
      if (Math.random() < 0.7) placeTemplate('tank', cx - 9, cz + 8);
      for (let i = 0; i < 2; i++) {
        placeTemplate('container' + randInt(0, 3), cx + 4 + i * 3.2, cz + 8, rand(-0.15, 0.15));
      }
      placeTemplate('pallets', cx + 10, cz + 2);
    }
    scatterPeople(1, 12);
  } else if (d === 'mixed') {
    placeTemplate('midrise' + randInt(0, 2), cx - 6.5, cz - 6, rand(-0.1, 0.1));
    placeTemplate(Math.random() < 0.5 ? 'shop' + randInt(0, 3) : 'midrise' + randInt(0, 2), cx + 6.5, cz + 6, Math.PI);
    placeTemplate('tree', cx + 8, cz - 8);
    placeTemplate('tree', cx - 8, cz + 8);
    scatterPeople(3, 12);
  } else if (d === 'stadium') {
    placeTemplate('goal', cx - 11.5, cz, Math.PI / 2);
    placeTemplate('goal', cx + 11.5, cz, Math.PI / 2);
    placeTemplate('bleacher', cx, cz - 11.5);
    placeTemplate('bleacher', cx, cz + 11.5, Math.PI);
    for (const [ox, oz] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) {
      placeTemplate('floodlight', cx + ox * 0.94, cz + oz * 0.94);
    }
    scatterPeople(4, 10);
  } else if (d === 'church') {
    placeTemplate('church', cx, cz - 4);
    for (let i = 0; i < 8; i++) {
      placeTemplate('grave', cx - 9 + (i % 4) * 2.2, cz + 8 + Math.floor(i / 4) * 2.6, rand(-0.2, 0.2));
    }
    placeTemplate('tree-big', cx + 9, cz + 8);
    scatterPeople(1, 12);
  } else if (d === 'park' || d === 'pondpark' || d === 'plaza') {
    genParkBlock(bx, bz, cx, cz, d);
  }
}

function genParkBlock(bx, bz, cx, cz, d) {
  // railings around each park block, with gaps where the central paths cross
  const edge = 13.2;
  for (let i = -1; i <= 1; i++) {
    const t = i * 8.8;
    if (Math.abs(cx + t) > 5) {
      placeTemplate('railing', cx + t, cz - edge);
      placeTemplate('railing', cx + t, cz + edge);
    }
    if (Math.abs(cz + t) > 5) {
      placeTemplate('railing', cx - edge, cz + t, Math.PI / 2);
      placeTemplate('railing', cx + edge, cz + t, Math.PI / 2);
    }
  }

  if (d === 'plaza') {
    placeTemplate('obelisk', cx, cz);
    placeTemplate('kiosk', cx - 9, cz - 9, Math.PI / 4);
    placeTemplate('umbrella', cx + 8, cz - 8);
    placeTemplate('umbrella', cx + 9, cz + 7);
    placeTemplate('bench', cx - 8, cz + 8, -Math.PI / 4);
    for (let i = 0; i < 8; i++) spawnPerson(cx + rand(-11, 11), cz + rand(-11, 11));
    return;
  }
  if (d === 'pondpark') {
    // keep the pond clear; trees & benches around it
    for (let i = 0; i < 5; i++) {
      const a = rand(0, Math.PI * 2);
      placeTemplate(Math.random() < 0.4 ? 'tree-pink' : 'tree', cx + Math.cos(a) * 11.5, cz + Math.sin(a) * 11.5);
    }
    placeTemplate('bench', cx - 11, cz + 3, Math.PI / 2);
    placeTemplate('bench', cx + 11, cz - 3, -Math.PI / 2);
    for (let i = 0; i < 4; i++) spawnPerson(cx + rand(9, 12) * (Math.random() < 0.5 ? 1 : -1), cz + rand(-12, 12));
    return;
  }
  // regular park quarter: fountain or statue centrepiece
  placeTemplate(bx === 2 && bz === 2 ? 'fountain' : 'statue', cx, cz);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rand(-0.3, 0.3);
    placeTemplate(pick(['tree', 'tree-big', 'tree-pink']), cx + Math.cos(a) * rand(7, 12), cz + Math.sin(a) * rand(7, 12));
  }
  placeTemplate('flowerbed', cx + 5, cz - 5, rand(0, Math.PI));
  placeTemplate('flowerbed', cx - 5, cz + 5, rand(0, Math.PI));
  placeTemplate('bench', cx - 5, cz - 5, Math.PI / 4);
  placeTemplate('bench', cx + 5, cz + 5, Math.PI + Math.PI / 4);
  for (let i = 0; i < 6; i++) spawnPerson(cx + rand(-11, 11), cz + rand(-11, 11));
}

function genPerimeter() {
  // fence ring with gaps where roads exit, plus a tree line
  const F = 133;
  for (let t = -HALF + 8; t < HALF - 8; t += 6.2) {
    const nearRoad = ROADS.some((r) => Math.abs(t - r) < 7.5);
    if (!nearRoad) {
      placeTemplate('railing', t, -F);
      placeTemplate('railing', t, F);
      placeTemplate('railing', -F, t, Math.PI / 2);
      placeTemplate('railing', F, t, Math.PI / 2);
    }
  }
  for (let i = 0; i < 34; i++) {
    const side = randInt(0, 3);
    const t = rand(-140, 140);
    const off = rand(136, 145);
    const [x, z] = side === 0 ? [t, -off] : side === 1 ? [t, off] : side === 2 ? [-off, t] : [off, t];
    if (!ROADS.some((r) => Math.abs((side < 2 ? x : z) - r) < 7)) {
      placeTemplate(Math.random() < 0.75 ? 'tree' : 'tree-big', x, z);
    }
  }
}

function genTraffic() {
  // parked cars along road edges
  for (let i = 0; i < 26; i++) {
    const road = pick(ROADS.slice(1, -1));
    const along = rand(-120, 120);
    if (ROADS.some((r) => Math.abs(along - r) < 8)) continue;
    const side = Math.random() < 0.5 ? 1 : -1;
    const kind = Math.random() < 0.15 ? 'van' : 'sedan';
    if (Math.random() < 0.5) spawnCar(kind, along, road + side * (ROAD_HALF - 1.3), Math.PI / 2 + rand(-0.05, 0.05), null);
    else spawnCar(kind, road + side * (ROAD_HALF - 1.3), along, rand(-0.05, 0.05), null);
  }
  // moving traffic
  for (let i = 0; i < 20; i++) {
    const axis = Math.random() < 0.5 ? 'x' : 'z';
    const road = pick(ROADS);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const lane = road + dir * 2.3;
    const start = rand(-140, 140);
    const kind = Math.random() < 0.12 ? 'bus' : Math.random() < 0.25 ? 'taxi' : Math.random() < 0.2 ? 'van' : 'sedan';
    const speed = kind === 'bus' ? rand(7, 8.5) : rand(8.5, 13);
    const [x, z] = axis === 'x' ? [start, lane] : [lane, start];
    const ry = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    spawnCar(kind, x, z, ry, { axis, dir, speed });
  }
  // traffic lights on a few intersections
  for (const rx of [-42, 42]) {
    for (const rz of [-42, 0, 42]) {
      placeTemplate('traffic', rx + ROAD_HALF + 1.2, rz + ROAD_HALF + 1.2, Math.PI * 1.25);
      placeTemplate('traffic', rx - ROAD_HALF - 1.2, rz - ROAD_HALF - 1.2, Math.PI * 0.25);
    }
  }
}

function buildWorld() {
  clearWorld();
  if (!TEMPLATES.skyscraper) {
    buildTemplates();
    buildPersonParts();
    buildCarGeos();
  }
  for (let bx = 0; bx < 6; bx++) for (let bz = 0; bz < 6; bz++) genBlock(bx, bz);
  genPerimeter();
  genTraffic();
  totalPropCount = props.length;
}

/* ============================== Holes ============================== */

function makePitGroup(colorHex) {
  const group = new THREE.Group();
  const wallGeo = new THREE.CylinderGeometry(1, 0.82, 1, 40, 1, true);
  wallGeo.translate(0, -0.5, 0);
  {
    const pos = wallGeo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const top = new THREE.Color(colorHex).multiplyScalar(0.17);
    const bot = new THREE.Color(0x000000);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      c.lerpColors(bot, top, clamp(pos.getY(i) + 1, 0, 1));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    wallGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const wall = new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  const floorGeo = new THREE.CircleGeometry(0.85, 40);
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, -1, 0);
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshBasicMaterial({ color: 0x030308, fog: false }));
  group.add(wall, floor);
  return group;
}

function makeLabel(color) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.renderOrder = 30;
  return {
    sprite, cv, tex, color, lastText: '',
    set(text) {
      if (text === this.lastText) return;
      this.lastText = text;
      const g = this.cv.getContext('2d');
      g.clearRect(0, 0, 512, 128);
      g.font = '700 52px "Outfit", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = 'rgba(0,0,0,0.9)';
      g.shadowBlur = 10;
      g.lineWidth = 8;
      g.strokeStyle = 'rgba(8,8,16,0.85)';
      g.strokeText(text, 256, 64);
      g.fillStyle = this.color;
      g.fillText(text, 256, 64);
      this.tex.needsUpdate = true;
    },
  };
}

class Hole {
  constructor(name, colorHex, isPlayer) {
    this.name = name;
    this.colorHex = colorHex;
    this.colorCss = '#' + new THREE.Color(colorHex).getHexString();
    this.isPlayer = isPlayer;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.area = Math.PI * START_RADIUS * START_RADIUS;
    this.score = 0;
    this.maxR = START_RADIUS;
    this.alive = true;
    this.dying = false;
    this.dyingT = 0;
    this.killer = null;
    this.respawnT = 0;
    this.invuln = 0;
    // AI
    this.target = null;
    this.targetPos = new THREE.Vector3();
    this.mode = 'feed';
    this.thinkT = rand(0, 0.4);
    this.aggression = rand(0.35, 1);

    this.pit = makePitGroup(colorHex);
    const ringGeo = new THREE.RingGeometry(0.93, 1.04, 48);
    ringGeo.rotateX(-Math.PI / 2);
    this.rim = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.95, fog: false, depthWrite: false,
    }));
    this.rim.position.y = 0.06;
    this.rim.renderOrder = 5;
    const glowGeo = new THREE.RingGeometry(1.04, 1.35, 48);
    glowGeo.rotateX(-Math.PI / 2);
    this.glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.18, fog: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.glow.position.y = 0.055;
    this.glow.renderOrder = 4;
    this.label = makeLabel(this.colorCss);
    scene.add(this.pit, this.rim, this.glow, this.label.sprite);
  }

  get r() { return Math.sqrt(this.area / Math.PI); }
  setR(r) { this.area = Math.PI * r * r; }
  get depth() { return Math.min(4 + this.r * 2.1, 30); }
  get speed() { return (this.isPlayer ? 14 : 12.8) / (1 + this.r * 0.048); }

  visualR() {
    let r = this.r;
    if (this.dying) r *= Math.max(0, 1 - this.dyingT / 0.55);
    return r;
  }

  gain(growth, points) {
    this.area += growth * (this.isPlayer ? 1 : 0.88);
    this.score += points;
    this.maxR = Math.max(this.maxR, this.r);
  }

  updateMeshes(time) {
    const r = this.visualR();
    const show = this.alive && r > 0.05;
    this.pit.visible = this.rim.visible = this.glow.visible = this.label.sprite.visible = show;
    if (!show) return;
    this.pit.position.set(this.pos.x, 0, this.pos.z);
    this.pit.scale.set(r, this.depth, r);
    this.rim.position.set(this.pos.x, 0.06, this.pos.z);
    this.rim.scale.set(r, 1, r);
    this.glow.position.set(this.pos.x, 0.055, this.pos.z);
    const pulse = 1 + Math.sin(time * 2.4) * 0.05;
    this.glow.scale.set(r * pulse, 1, r * pulse);
    if (this.invuln > 0) {
      this.rim.material.opacity = 0.35 + 0.6 * Math.abs(Math.sin(time * 10));
    } else this.rim.material.opacity = 0.95;
    const s = 1.1 + r * 0.3;
    this.label.sprite.position.set(this.pos.x, 2.4 + r * 0.55, this.pos.z);
    this.label.sprite.scale.set(s * 4.4, s * 1.1, 1);
    this.label.set(`${this.name} · ${(r * 2).toFixed(1)}m`);
  }

  destroy() {
    scene.remove(this.pit, this.rim, this.glow, this.label.sprite);
    this.label.tex.dispose();
  }
}

function updateHoleUniforms() {
  let i = 0;
  for (const h of holes) {
    if (i >= MAX_HOLES) break;
    const r = h.alive ? h.visualR() : -1;
    holesUniform.value[i].set(h.pos.x, h.pos.z, r > 0.05 ? r : -1);
    i++;
  }
  for (; i < MAX_HOLES; i++) holesUniform.value[i].set(0, 0, -1);
}

/* ============================== Particles ============================== */

const particles = [];
{
  const pGeo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
  for (let i = 0; i < 70; i++) {
    const m = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ transparent: true, fog: false }));
    m.visible = false;
    scene.add(m);
    particles.push({ mesh: m, life: 0, vel: new THREE.Vector3() });
  }
}
function burst(x, y, z, colorHex, n, spread) {
  let placed = 0;
  for (const p of particles) {
    if (placed >= n) break;
    if (p.life > 0) continue;
    p.life = rand(0.4, 0.8);
    p.maxLife = p.life;
    p.mesh.visible = true;
    p.mesh.material.color.setHex(colorHex);
    p.mesh.material.opacity = 1;
    p.mesh.position.set(x + rand(-spread, spread), y, z + rand(-spread, spread));
    p.vel.set(rand(-4, 4), rand(4, 9), rand(-4, 4));
    p.mesh.scale.setScalar(rand(0.6, 1.6));
    placed++;
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.vel.y -= 22 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += dt * 6;
    p.mesh.rotation.z += dt * 5;
    p.mesh.material.opacity = p.life / p.maxLife;
  }
}

/* ============================== HUD / DOM ============================== */

const $ = (id) => document.getElementById(id);
const hudScore = $('stat-score'), hudSize = $('stat-size'), hudTier = $('stat-tier'),
  hudLives = $('stat-lives'), hudTime = $('stat-time'), comboBadge = $('combo-badge'),
  boardList = $('board-list'), cityEaten = $('city-eaten'),
  toastBox = $('toasts'), minimap = $('minimap'), muteBtn = $('mute-btn');
const minimapCtx = minimap.getContext('2d');

function toast(text, colorCss, big) {
  const el = document.createElement('div');
  el.className = 'toast' + (big ? ' toast--big' : '');
  el.textContent = text;
  if (colorCss) el.style.color = colorCss;
  toastBox.appendChild(el);
  setTimeout(() => el.remove(), 2600);
  while (toastBox.children.length > 4) toastBox.firstChild.remove();
}

function tierFor(r) {
  let t = TIERS[0];
  for (const tier of TIERS) if (r >= tier.r) t = tier;
  return t;
}

function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

let boardT = 0;
function updateBoard() {
  const sorted = [...holes].sort((a, b) => b.score - a.score);
  boardList.innerHTML = sorted.map((h, i) =>
    `<li class="${h.isPlayer ? 'board-row board-row--you' : 'board-row'}${h.alive ? '' : ' board-row--dead'}">
      <span class="board-rank">${i + 1}</span>
      <span class="board-dot" style="background:${h.colorCss}"></span>
      <span class="board-name">${h.name}</span>
      <span class="board-score">${h.score}</span>
    </li>`).join('');
  cityEaten.textContent = `City devoured: ${Math.round(100 * eatenPropCount / Math.max(1, totalPropCount))}%`;
}

let minimapT = 0;
function drawMinimap() {
  const w = minimap.width;
  const s = w / WORLD;
  const mp = (v) => (v + HALF) * s;
  minimapCtx.clearRect(0, 0, w, w);
  minimapCtx.fillStyle = 'rgba(10,10,20,0.75)';
  minimapCtx.fillRect(0, 0, w, w);
  minimapCtx.strokeStyle = 'rgba(90,90,120,0.5)';
  minimapCtx.lineWidth = 2;
  for (const r of ROADS) {
    minimapCtx.beginPath(); minimapCtx.moveTo(mp(r), 0); minimapCtx.lineTo(mp(r), w); minimapCtx.stroke();
    minimapCtx.beginPath(); minimapCtx.moveTo(0, mp(r)); minimapCtx.lineTo(w, mp(r)); minimapCtx.stroke();
  }
  minimapCtx.fillStyle = 'rgba(170,170,190,0.55)';
  for (const p of props) {
    if (!p.alive || p.falling || p.type === 'person') continue;
    const size = p.eatR > 3 ? 3 : p.eatR > 1 ? 2 : 1;
    minimapCtx.fillRect(mp(p.root.position.x) - size / 2, mp(p.root.position.z) - size / 2, size, size);
  }
  for (const h of holes) {
    if (!h.alive) continue;
    minimapCtx.fillStyle = h.colorCss;
    minimapCtx.beginPath();
    minimapCtx.arc(mp(h.pos.x), mp(h.pos.z), Math.max(2.5, h.r * s), 0, Math.PI * 2);
    minimapCtx.fill();
    if (h.isPlayer) {
      minimapCtx.strokeStyle = '#ffffff';
      minimapCtx.lineWidth = 1.5;
      minimapCtx.stroke();
    }
  }
}

muteBtn.addEventListener('click', () => {
  AudioFX.muted = !AudioFX.muted;
  localStorage.setItem('hole-muted', AudioFX.muted ? '1' : '0');
  muteBtn.textContent = AudioFX.muted ? '🔇' : '🔊';
});
muteBtn.textContent = AudioFX.muted ? '🔇' : '🔊';

/* ============================== Input ============================== */

const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'KeyP' && state === 'play') setPaused(!paused);
  if (e.code === 'KeyM') muteBtn.click();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

const pointer = { active: false, x: 0, y: 0 };
canvas.addEventListener('pointerdown', (e) => {
  pointer.active = true;
  pointer.x = e.clientX; pointer.y = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (pointer.active) { pointer.x = e.clientX; pointer.y = e.clientY; }
});
canvas.addEventListener('pointerup', () => { pointer.active = false; });
canvas.addEventListener('pointercancel', () => { pointer.active = false; });

const _v = new THREE.Vector3();
function pointerWorld() {
  _v.set((pointer.x / window.innerWidth) * 2 - 1, -(pointer.y / window.innerHeight) * 2 + 1, 0.5);
  _v.unproject(camera);
  _v.sub(camera.position).normalize();
  const t = -camera.position.y / _v.y;
  return {
    x: camera.position.x + _v.x * t,
    z: camera.position.z + _v.z * t,
  };
}

function playerInputDir(out) {
  out.set(0, 0, 0);
  if (pointer.active) {
    const w = pointerWorld();
    const dx = w.x - player.pos.x, dz = w.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > Math.max(1.2, player.r * 0.5)) out.set(dx / d, 0, dz / d);
    return out;
  }
  if (keys.has('KeyW') || keys.has('ArrowUp')) out.z -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) out.z += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) out.x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) out.x += 1;
  if (out.lengthSq() > 0) out.normalize();
  return out;
}

/* ============================== Eat logic ============================== */

const combo = { count: 0, timer: 0, mult: 1 };

function startFall(p, hole) {
  p.falling = true;
  p.eater = hole;
  eatenPropCount++;
  const points = p.score;
  if (hole.isPlayer) {
    combo.count++;
    combo.timer = 2.5;
    combo.mult = combo.count >= 16 ? 4 : combo.count >= 9 ? 3 : combo.count >= 4 ? 2 : 1;
    hole.gain(p.growth, points * combo.mult);
    AudioFX.eat(p.eatR);
    const tier = tierFor(hole.r);
    if (tier !== playerTier) {
      playerTier = tier;
      toast(`You are now a ${tier.name}!`, '#00e5ff', true);
      AudioFX.tier();
    }
  } else {
    hole.gain(p.growth, points);
  }
  burst(hole.pos.x, 0.4, hole.pos.z, hole.colorHex, Math.min(8, 2 + p.eatR * 2), hole.r * 0.7);

  const dx = hole.pos.x - p.root.position.x, dz = hole.pos.z - p.root.position.z;
  const d = Math.hypot(dx, dz) || 1;
  const pop = p.eatR < 1 ? rand(1.5, 3) : 0;
  p.fv = new THREE.Vector3(dx / d * rand(2, 4), pop, dz / d * rand(2, 4));
  const spin = 4 / (1 + p.eatR * 0.5);
  p.av = new THREE.Vector3(rand(-spin, spin), rand(-spin, spin) * 0.5, rand(-spin, spin));
}

function updateFalling(p, dt) {
  const hole = p.eater;
  const hx = hole ? hole.pos.x : p.root.position.x;
  const hz = hole ? hole.pos.z : p.root.position.z;
  p.fv.y -= 30 * dt;
  p.fv.x += (hx - p.root.position.x) * 5 * dt;
  p.fv.z += (hz - p.root.position.z) * 5 * dt;
  p.fv.x *= 1 - 1.4 * dt;
  p.fv.z *= 1 - 1.4 * dt;
  p.root.position.addScaledVector(p.fv, dt);
  p.root.rotation.x += p.av.x * dt;
  p.root.rotation.y += p.av.y * dt;
  p.root.rotation.z += p.av.z * dt;
  const limit = hole && hole.alive ? hole.depth + 3 : 34;
  if (p.root.position.y < -limit) {
    p.alive = false;
    p.falling = false;
    worldGroup.remove(p.root);
  }
}

function holeEatsProps(hole) {
  if (!hole.alive || hole.dying) return;
  const r = hole.r;
  const capacity = r * 0.8;
  const reach = r * 0.92 + 0.25;
  for (const p of props) {
    if (!p.alive || p.falling) continue;
    if (p.eatR > capacity) continue;
    const dx = p.root.position.x - hole.pos.x;
    const dz = p.root.position.z - hole.pos.z;
    if (dx * dx + dz * dz < reach * reach) startFall(p, hole);
  }
}

function holeVsHole() {
  for (let i = 0; i < holes.length; i++) {
    for (let j = i + 1; j < holes.length; j++) {
      const a = holes[i], b = holes[j];
      if (!a.alive || !b.alive || a.dying || b.dying) continue;
      const big = a.r >= b.r ? a : b;
      const small = big === a ? b : a;
      if (small.invuln > 0 || big.invuln > 0) continue;
      if (big.r < small.r * 1.18) continue;
      const d = big.pos.distanceTo(small.pos);
      if (d < big.r * 0.8) devourHole(big, small);
    }
  }
}

function devourHole(big, small) {
  small.dying = true;
  small.dyingT = 0;
  small.killer = big;
  big.area += small.area * 0.55;
  big.score += 150 + Math.round(small.score * 0.25);
  big.maxR = Math.max(big.maxR, big.r);
  burst(big.pos.x, 0.6, big.pos.z, small.colorHex, 14, big.r * 0.8);
  if (small.isPlayer) {
    AudioFX.hurt();
    shake = 0.9;
    toast(`${big.name} swallowed you!`, '#ff5c5c', true);
  } else if (big.isPlayer) {
    AudioFX.devour();
    toast(`You devoured ${small.name}! +${150 + Math.round(small.score * 0.25)}`, '#8dff57', true);
  }
}

function safeSpot(forR) {
  let best = null, bestD = -1;
  for (let i = 0; i < 24; i++) {
    const x = rand(-BOUND + 10, BOUND - 10);
    const z = rand(-BOUND + 10, BOUND - 10);
    let minD = Infinity;
    for (const h of holes) {
      if (!h.alive || h.r < forR * 1.1) continue;
      minD = Math.min(minD, Math.hypot(h.pos.x - x, h.pos.z - z));
    }
    if (minD > bestD) { bestD = minD; best = { x, z }; }
  }
  return best;
}

/* ============================== NPC AI ============================== */

function npcThink(h) {
  const r = h.r;
  // threats
  let fx = 0, fz = 0, threat = false;
  for (const o of holes) {
    if (o === h || !o.alive || o.dying) continue;
    if (o.r > r * 1.18) {
      const d = h.pos.distanceTo(o.pos);
      const danger = o.r + r + 16 + o.speed * 1.5;
      if (d < danger) {
        threat = true;
        const w = (danger - d) / danger;
        fx += (h.pos.x - o.pos.x) / (d || 1) * w;
        fz += (h.pos.z - o.pos.z) / (d || 1) * w;
      }
    }
  }
  if (threat) {
    h.mode = 'flee';
    const len = Math.hypot(fx, fz) || 1;
    h.targetPos.set(clamp(h.pos.x + fx / len * 40, -BOUND, BOUND), 0, clamp(h.pos.z + fz / len * 40, -BOUND, BOUND));
    return;
  }
  // prey (other holes)
  if (r > 2.2 && h.aggression > 0.5) {
    for (const o of holes) {
      if (o === h || !o.alive || o.dying || o.invuln > 0) continue;
      if (o.r < r * 0.75) {
        const d = h.pos.distanceTo(o.pos);
        if (d < 34 + r * 2) {
          h.mode = 'hunt';
          h.target = o;
          return;
        }
      }
    }
  }
  // feed: best value/distance prop
  h.mode = 'feed';
  let best = null, bestScore = -1;
  const capacity = r * 0.8;
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if (!p.alive || p.falling || p.eatR > capacity) continue;
    const d = Math.hypot(p.root.position.x - h.pos.x, p.root.position.z - h.pos.z);
    const v = p.growth / (6 + d) * rand(0.8, 1.2);
    if (v > bestScore) { bestScore = v; best = p; }
  }
  h.target = best;
  if (best) h.targetPos.set(best.root.position.x, 0, best.root.position.z);
  else h.targetPos.set(rand(-100, 100), 0, rand(-100, 100));
}

function npcMove(h, dt) {
  h.thinkT -= dt;
  if (h.thinkT <= 0) {
    h.thinkT = 0.35 + Math.random() * 0.2;
    npcThink(h);
  }
  let tx, tz;
  if (h.mode === 'hunt' && h.target && h.target.alive) {
    tx = h.target.pos.x; tz = h.target.pos.z;
  } else if (h.mode === 'feed' && h.target && h.target.alive && !h.target.falling) {
    tx = h.target.root.position.x; tz = h.target.root.position.z;
  } else {
    tx = h.targetPos.x; tz = h.targetPos.z;
  }
  const dx = tx - h.pos.x, dz = tz - h.pos.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.5) {
    const sp = h.speed * (h.mode === 'flee' ? 1.12 : 1);
    h.vel.x += (dx / d * sp - h.vel.x) * Math.min(1, 3.5 * dt);
    h.vel.z += (dz / d * sp - h.vel.z) * Math.min(1, 3.5 * dt);
  } else {
    h.vel.multiplyScalar(1 - 3 * dt);
  }
  h.pos.x = clamp(h.pos.x + h.vel.x * dt, -BOUND, BOUND);
  h.pos.z = clamp(h.pos.z + h.vel.z * dt, -BOUND, BOUND);
}

/* ============================== Mobile world updates ============================== */

function updatePeople(dt, time) {
  for (const p of people) {
    if (!p.alive || p.falling) continue;
    p.turnT -= dt;
    if (p.turnT <= 0) {
      p.turnT = rand(1.5, 5);
      p.heading += rand(-1.6, 1.6);
    }
    // flee nearby holes
    for (const h of holes) {
      if (!h.alive) continue;
      const dx = p.root.position.x - h.pos.x, dz = p.root.position.z - h.pos.z;
      const d2 = dx * dx + dz * dz;
      const panicR = h.r + 7;
      if (d2 < panicR * panicR) {
        p.heading = Math.atan2(dx, dz);
        p.turnT = 0.5;
        break;
      }
    }
    const sp = p.walkSpeed;
    p.root.position.x += Math.sin(p.heading) * sp * dt;
    p.root.position.z += Math.cos(p.heading) * sp * dt;
    if (Math.abs(p.root.position.x) > 146 || Math.abs(p.root.position.z) > 146) {
      p.heading += Math.PI;
    }
    p.root.rotation.y = p.heading;
    const swing = Math.sin(time * 9 + p.phase) * 0.55;
    p.legL.rotation.x = swing;
    p.legR.rotation.x = -swing;
  }
}

function updateCars(dt) {
  for (const c of cars) {
    if (!c.alive || c.falling) continue;
    if (c.axis === 'x') {
      c.root.position.x += c.dir * c.carSpeed * dt;
      if (c.root.position.x > 149) c.root.position.x = -149;
      if (c.root.position.x < -149) c.root.position.x = 149;
    } else {
      c.root.position.z += c.dir * c.carSpeed * dt;
      if (c.root.position.z > 149) c.root.position.z = -149;
      if (c.root.position.z < -149) c.root.position.z = 149;
    }
  }
}

/* ============================== Game state ============================== */

let state = 'menu';           // menu | play | over
let paused = false;
let player = null;
let playerLives = START_LIVES;
let playerTier = TIERS[0];
let roundTime = ROUND_TIME;
let respawnTimer = 0;
let pendingRespawn = false;
let shake = 0;
let menuAngle = 0;
const camTarget = new THREE.Vector3();
const inputDir = new THREE.Vector3();

const startOverlay = $('start-overlay'), gameoverOverlay = $('gameover-overlay'),
  pauseOverlay = $('pause-overlay');

function setPaused(v) {
  paused = v;
  pauseOverlay.classList.toggle('overlay--hidden', !v);
}

function spawnHoles() {
  const spots = [[-105, -105], [105, -105], [-105, 105], [105, 105], [0, -126], [126, 0]];
  const shuffled = [...spots].sort(() => Math.random() - 0.5);
  player = new Hole('You', 0x00e5ff, true);
  const ps = shuffled[0];
  player.pos.set(ps[0], 0, ps[1]);
  holes.push(player);
  const npcs = [...NPC_POOL].sort(() => Math.random() - 0.5).slice(0, 5);
  npcs.forEach((n, i) => {
    const h = new Hole(n.name, n.color, false);
    const s = shuffled[(i + 1) % shuffled.length];
    h.pos.set(s[0] + rand(-8, 8), 0, s[1] + rand(-8, 8));
    holes.push(h);
  });
}

function spawnMenuHoles() {
  const npcs = [...NPC_POOL].sort(() => Math.random() - 0.5).slice(0, 5);
  npcs.forEach((n) => {
    const h = new Hole(n.name, n.color, false);
    h.pos.set(rand(-110, 110), 0, rand(-110, 110));
    h.setR(rand(1.4, 3.2));
    holes.push(h);
  });
}

function startGame() {
  AudioFX.ensure();
  AudioFX.start();
  buildWorld();
  spawnHoles();
  playerLives = START_LIVES;
  playerTier = TIERS[0];
  roundTime = ROUND_TIME;
  combo.count = 0; combo.timer = 0; combo.mult = 1;
  pendingRespawn = false;
  state = 'play';
  setPaused(false);
  startOverlay.classList.add('overlay--hidden');
  gameoverOverlay.classList.add('overlay--hidden');
  camTarget.copy(player.pos);
  updateLivesHud();
}

function updateLivesHud() {
  hudLives.textContent = '●'.repeat(Math.max(0, playerLives)) || '—';
}

function endGame(reason, detail) {
  state = 'over';
  AudioFX.over();
  const sorted = [...holes].sort((a, b) => b.score - a.score);
  const rank = sorted.indexOf(player) + 1;
  const suffix = ['', 'st', 'nd', 'rd'][rank] || 'th';
  $('go-title').textContent = reason === 'time' ? "Time's Up!" : 'Swallowed!';
  $('go-message').textContent = reason === 'time'
    ? (rank === 1 ? 'The city is yours. Every other hole ate your dust.' : `The round is over — you finished ${rank}${suffix}.`)
    : `${detail} gulped you down and you're out of lives.`;
  $('final-score').textContent = player.score;
  $('final-size').textContent = (player.maxR * 2).toFixed(1) + 'm';
  $('final-rank').textContent = rank + suffix;
  const best = Math.max(player.score, parseInt(localStorage.getItem('hole-best') || '0', 10));
  localStorage.setItem('hole-best', String(best));
  $('final-best').textContent = best;
  gameoverOverlay.classList.remove('overlay--hidden');
}

function handlePlayerDeath() {
  playerLives--;
  updateLivesHud();
  if (playerLives < 0) {
    endGame('eaten', player.killer ? player.killer.name : 'The city');
    return;
  }
  pendingRespawn = true;
  respawnTimer = 1.4;
}

function respawnPlayer() {
  const newR = Math.max(START_RADIUS, player.r * 0.55);
  player.setR(newR);
  player.dying = false;
  player.dyingT = 0;
  player.alive = true;
  const s = safeSpot(newR);
  player.pos.set(s.x, 0, s.z);
  player.vel.set(0, 0, 0);
  player.invuln = 3.5;
  playerTier = tierFor(player.r);
  toast(`${playerLives + 1 > 1 ? '' : 'Last life — '}back in the fight!`, '#00e5ff');
}

$('btn-start').addEventListener('click', startGame);
$('btn-restart').addEventListener('click', startGame);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'play') setPaused(true);
});

/* ============================== Main loop ============================== */

const clock = new THREE.Clock();

function updateDying(h, dt) {
  h.dyingT += dt;
  if (h.killer) {
    h.pos.lerp(h.killer.pos, Math.min(1, 5 * dt));
  }
  if (h.dyingT >= 0.55) {
    h.dying = false;
    if (h.isPlayer) {
      h.alive = false;
      handlePlayerDeath();
    } else {
      h.alive = false;
      h.respawnT = 6;
    }
  }
}

function updateHoles(dt) {
  for (const h of holes) {
    if (h.invuln > 0) h.invuln -= dt;
    if (h.dying) { updateDying(h, dt); continue; }
    if (!h.alive) {
      if (!h.isPlayer) {
        h.respawnT -= dt;
        if (h.respawnT <= 0) {
          h.setR(START_RADIUS);
          const s = safeSpot(START_RADIUS);
          h.pos.set(s.x, 0, s.z);
          h.vel.set(0, 0, 0);
          h.alive = true;
          h.invuln = 2;
        }
      }
      continue;
    }
    if (h.isPlayer) {
      playerInputDir(inputDir);
      const sp = h.speed;
      h.vel.x += (inputDir.x * sp - h.vel.x) * Math.min(1, 5 * dt);
      h.vel.z += (inputDir.z * sp - h.vel.z) * Math.min(1, 5 * dt);
      h.pos.x = clamp(h.pos.x + h.vel.x * dt, -BOUND, BOUND);
      h.pos.z = clamp(h.pos.z + h.vel.z * dt, -BOUND, BOUND);
    } else {
      npcMove(h, dt);
    }
    holeEatsProps(h);
  }
  holeVsHole();
}

function updateCamera(dt, time) {
  if (state === 'menu') {
    menuAngle += dt * 0.07;
    camera.position.set(Math.sin(menuAngle) * 120, 85, Math.cos(menuAngle) * 120);
    camera.lookAt(0, 0, 0);
    return;
  }
  const r = player ? player.r : START_RADIUS;
  camTarget.lerp(player.pos, Math.min(1, 4 * dt));
  const h = 17 + r * 4.6;
  const back = h * 0.62;
  let ox = 0, oz = 0;
  if (shake > 0) {
    shake -= dt;
    ox = rand(-1, 1) * shake * 1.6;
    oz = rand(-1, 1) * shake * 1.6;
  }
  camera.position.set(camTarget.x + ox, h, camTarget.z + back + oz);
  camera.lookAt(camTarget.x, 0, camTarget.z - r * 0.4);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  if (!paused) {
    if (state === 'play') {
      roundTime -= dt;
      if (roundTime <= 0) {
        roundTime = 0;
        endGame('time');
      }
      if (pendingRespawn) {
        respawnTimer -= dt;
        if (respawnTimer <= 0) {
          pendingRespawn = false;
          respawnPlayer();
        }
      }
      combo.timer -= dt;
      if (combo.timer <= 0 && combo.count > 0) {
        combo.count = 0;
        combo.mult = 1;
      }
      updateHoles(dt);
    } else if (state === 'menu' || state === 'over') {
      // idle simulation keeps the city alive behind the overlay
      for (const h of holes) {
        if (h.isPlayer) continue;
        if (h.dying) { updateDying(h, dt); continue; }
        if (!h.alive) {
          h.respawnT -= dt;
          if (h.respawnT <= 0) {
            h.setR(START_RADIUS);
            h.pos.set(rand(-110, 110), 0, rand(-110, 110));
            h.alive = true;
          }
          continue;
        }
        npcMove(h, dt);
        holeEatsProps(h);
      }
      if (state === 'menu') holeVsHole();
    }

    updatePeople(dt, time);
    updateCars(dt);
    for (const p of props) if (p.falling) updateFalling(p, dt);
    updateParticles(dt);
    for (const h of holes) h.updateMeshes(time);
    updateHoleUniforms();
  }

  updateCamera(dt, time);

  // HUD
  if (state === 'play' && player) {
    hudScore.textContent = player.score;
    hudSize.textContent = (player.r * 2).toFixed(1) + 'm';
    hudTier.textContent = playerTier.name;
    hudTime.textContent = fmtTime(roundTime);
    hudTime.classList.toggle('hud-value--warn', roundTime < 20);
    if (combo.mult > 1) {
      comboBadge.textContent = `COMBO x${combo.mult}`;
      comboBadge.classList.add('combo--on');
    } else {
      comboBadge.classList.remove('combo--on');
    }
  }
  boardT -= dt;
  if (boardT <= 0) { boardT = 0.3; updateBoard(); }
  minimapT -= dt;
  if (minimapT <= 0) { minimapT = 0.15; drawMinimap(); }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ============================== Boot ============================== */

buildWorld();
spawnMenuHoles();
updateBoard();
animate();

/* debug/testing handle */
window.__hole = {
  get player() { return player; },
  get holes() { return holes; },
  get props() { return props; },
  get state() { return state; },
};
