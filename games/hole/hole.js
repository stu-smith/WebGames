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
const MAX_LEVEL = 24;
const levelR = (lvl) => 1.5 + lvl * 0.5;   // diameter = (3 + level) whole metres
const START_RADIUS = levelR(0);
const START_LIVES = 3;

/* selected map/theme: 'city' (neon night city) or 'pirate' (sunny Caribbean isles) */
let theme = localStorage.getItem('hole-theme') === 'pirate' ? 'pirate' : 'city';

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
const TIERS_PIRATE = [
  { r: 0,    name: 'Rock Pool' },
  { r: 2.0,  name: 'Sand Trap' },
  { r: 2.9,  name: "Smuggler's Hole" },
  { r: 4.0,  name: 'Blowhole' },
  { r: 5.4,  name: 'Devourer' },
  { r: 7.0,  name: 'Maelstrom' },
  { r: 9.0,  name: 'Abyss' },
  { r: 11.5, name: 'Isle Ender' },
];
const tiersNow = () => (theme === 'pirate' ? TIERS_PIRATE : TIERS);

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
const NPC_POOL_PIRATE = [
  { name: "Cap'n Gulp",       color: 0xff4fa3 },
  { name: 'Blackhole Beard',  color: 0x8dff57 },
  { name: 'Davy Sinker',      color: 0xffb347 },
  { name: 'Jolly Swallower',  color: 0xb26bff },
  { name: 'Dread Pit Rob',    color: 0xff5c5c },
  { name: 'Barnacle Bite',    color: 0x57d9ff },
  { name: 'Salty Gulch',      color: 0xf3ff6b },
  { name: 'The Kraken',       color: 0x6bffc9 },
];
const npcPool = () => (theme === 'pirate' ? NPC_POOL_PIRATE : NPC_POOL);

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
const ambient = new THREE.AmbientLight(0x404060, 0.75);
scene.add(ambient);

function applyAtmosphere() {
  if (theme === 'pirate') {
    scene.fog.color.setHex(0xbfe2ee);
    scene.fog.near = 170; scene.fog.far = 540;
    hemi.color.setHex(0xd6ecff); hemi.groundColor.setHex(0x9a8a60); hemi.intensity = 1.2;
    sun.color.setHex(0xfff2cf); sun.intensity = 2.7;
    sun.position.set(150, 230, -150);
    ambient.color.setHex(0x8a97a5); ambient.intensity = 0.55;
    renderer.toneMappingExposure = 1.12;
  } else {
    scene.fog.color.setHex(0x140f2a);
    scene.fog.near = 140; scene.fog.far = 460;
    hemi.color.setHex(0xa89aff); hemi.groundColor.setHex(0x2c3a48); hemi.intensity = 1.35;
    sun.color.setHex(0xffd9b0); sun.intensity = 2.0;
    sun.position.set(130, 190, 90);
    ambient.color.setHex(0x404060); ambient.intensity = 0.75;
    renderer.toneMappingExposure = 1.3;
  }
}

/* remove a themed scene chunk, disposing everything except shared materials */
function disposeGroup(grp) {
  grp.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const m = o.material;
    if (m && m !== matLit) {
      if (m.map) m.map.dispose();
      m.dispose();
    }
  });
  scene.remove(grp);
}

function radialSpriteTexture(size, stops) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const grad = c.createRadialGradient(size / 2, size / 2, size / 16, size / 2, size / 2, size / 2);
  for (const [t, col] of stops) grad.addColorStop(t, col);
  c.fillStyle = grad;
  c.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}

/* Sky dome + celestial dressing (fog-free backdrop). City: stars + moon; pirate: sun + clouds. */
let skyGroup = null;
function buildSky() {
  if (skyGroup) disposeGroup(skyGroup);
  skyGroup = new THREE.Group();
  const pirate = theme === 'pirate';

  const domeGeo = new THREE.SphereGeometry(620, 24, 12);
  const pos = domeGeo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(pirate ? 0x2f8fdd : 0x241549);
  const bottom = new THREE.Color(pirate ? 0xc4e6f4 : 0x0d0a1c);
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
  skyGroup.add(dome);

  if (pirate) {
    const sunSpr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialSpriteTexture(128, [
        [0, 'rgba(255,255,244,1)'],
        [0.35, 'rgba(255,244,190,0.9)'],
        [1, 'rgba(255,236,150,0)'],
      ]),
      fog: false, depthWrite: false, transparent: true,
    }));
    sunSpr.position.set(260, 230, -420);
    sunSpr.scale.set(130, 130, 1);
    skyGroup.add(sunSpr);

    // puffy trade-wind clouds
    const cloudCv = document.createElement('canvas');
    cloudCv.width = 256; cloudCv.height = 128;
    const cc = cloudCv.getContext('2d');
    for (let i = 0; i < 7; i++) {
      const x = 40 + rand(0, 176), y = 50 + rand(0, 40), r = rand(18, 38);
      const grad = cc.createRadialGradient(x, y, 2, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      cc.fillStyle = grad;
      cc.fillRect(0, 0, 256, 128);
    }
    const cloudTex = new THREE.CanvasTexture(cloudCv);
    for (let i = 0; i < 9; i++) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: cloudTex, transparent: true, opacity: rand(0.5, 0.8),
        fog: false, depthWrite: false,
      }));
      const a = rand(0, Math.PI * 2);
      const r = rand(300, 520);
      spr.position.set(Math.cos(a) * r, rand(130, 260), Math.sin(a) * r);
      spr.scale.set(rand(90, 170), rand(32, 58), 1);
      skyGroup.add(spr);
    }
  } else {
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
    skyGroup.add(stars);

    const moon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialSpriteTexture(128, [
        [0, 'rgba(255,224,244,1)'],
        [0.42, 'rgba(255,180,226,0.85)'],
        [1, 'rgba(255,150,210,0)'],
      ]),
      fog: false, depthWrite: false, transparent: true,
    }));
    moon.position.set(260, 230, -420);
    moon.scale.set(110, 110, 1);
    skyGroup.add(moon);
  }
  scene.add(skyGroup);
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
  pop() { this.blip(280, 540, 0.13, 'triangle', 0.35); },
  power() { this.blip(330, 880, 0.18, 'triangle', 0.4); setTimeout(() => this.blip(550, 1320, 0.22, 'triangle', 0.3), 110); },
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
      if (theme === 'pirate') {
        if ((bx === 2 || bx === 3) && (bz === 2 || bz === 3)) {
          d = bx === 2 && bz === 2 ? 'cove' : bx === 3 && bz === 2 ? 'lagoon' : bx === 2 ? 'grove' : 'camp';
        } else if (bx >= 4 && bz <= 2) d = 'wrecks';
        else if (bx <= 1 && bz <= 2) d = 'village';
        else if (bx <= 2 && bz >= 4) d = 'market';
        else if (bx >= 3 && bz >= 4) d = 'fort';
        else if (bx === 2 && bz === 0) d = 'skull';
        else if (bx === 3 && bz === 0) d = 'lighthouse';
        else d = 'jungle';
      } else if ((bx === 2 || bx === 3) && (bz === 2 || bz === 3)) {
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
const DISTRICT_FILL_PIRATE = {
  cove: '#dcc68e', lagoon: '#d8c184', grove: '#59923e', camp: '#c9b078',
  wrecks: '#cbb088', village: '#6a9a48', market: '#d2ba86',
  fort: '#b3a684', skull: '#a9a291', lighthouse: '#c9b784', jungle: '#4c8038',
};

function paintGround() {
  const S = 2048 / WORLD;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 2048;
  const g = cv.getContext('2d');
  const px = (x) => (x + HALF) * S;
  const rect = (x, z, w, h, fill) => { g.fillStyle = fill; g.fillRect(px(x), px(z), w * S, h * S); };

  if (theme === 'pirate') paintPirateGround(g, px, rect, S);
  else paintCityGround(g, px, rect, S);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function paintCityGround(g, px, rect, S) {
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

  // sandy shoreline fringe — the city sits on an island
  const sands = ['#c9b078', '#bda269', '#d3bd88'];
  g.fillStyle = sands[0];
  const fr = 3.5 * S;
  g.fillRect(0, 0, 2048, fr);
  g.fillRect(0, 2048 - fr, 2048, fr);
  g.fillRect(0, 0, fr, 2048);
  g.fillRect(2048 - fr, 0, fr, 2048);
  for (let i = 0; i < 340; i++) {
    const along = rand(-HALF, HALF);
    const depth = rand(2, 7.5);
    const w = rand(2, 6), l = rand(2, 6);
    g.fillStyle = pick(sands);
    const side = randInt(0, 3);
    if (side === 0) g.fillRect(px(-HALF), px(along), depth * S, l * S);
    else if (side === 1) g.fillRect(px(HALF - depth), px(along), depth * S, l * S);
    else if (side === 2) g.fillRect(px(along), px(-HALF), w * S, depth * S);
    else g.fillRect(px(along), px(HALF - depth), w * S, depth * S);
  }
}

function paintPirateGround(g, px, rect, S) {
  // sun-bleached sand base
  g.fillStyle = '#d3bc82';
  g.fillRect(0, 0, 2048, 2048);
  for (let i = 0; i < 520; i++) {
    g.fillStyle = `rgba(${randInt(190, 232)},${randInt(165, 205)},${randInt(110, 152)},0.3)`;
    g.fillRect(px(rand(-HALF, HALF)), px(rand(-HALF, HALF)), rand(2, 10) * S, rand(2, 10) * S);
  }

  // blocks: district fills, with ragged grassy blobs for the green ones
  const greens = ['#4c8038', '#59923e', '#3f7231', '#68a24a'];
  for (let bx = 0; bx < 6; bx++) {
    for (let bz = 0; bz < 6; bz++) {
      const cx = BLOCK_CENTERS[bx], cz = BLOCK_CENTERS[bz];
      const d = districtGrid[bx][bz];
      rect(cx - 15, cz - 15, 30, 30, DISTRICT_FILL_PIRATE[d]);
      if (d === 'jungle' || d === 'grove' || d === 'village') {
        for (let i = 0; i < 26; i++) {
          g.fillStyle = pick(greens);
          g.beginPath();
          g.ellipse(px(cx + rand(-14, 14)), px(cz + rand(-14, 14)),
            rand(1.5, 4) * S, rand(1.5, 4) * S, rand(0, 3), 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }

  // sandy trails where the roads would be
  g.fillStyle = '#c2a468';
  for (const r of ROADS) {
    g.fillRect(px(r - 3.2), 0, 6.4 * S, 2048);
    g.fillRect(0, px(r - 3.2), 2048, 6.4 * S);
  }
  // cart ruts and footprints along the trails
  g.fillStyle = 'rgba(140,110,70,0.4)';
  for (const r of ROADS) {
    for (let t = -HALF + 3; t < HALF - 3; t += rand(4, 9)) {
      g.fillRect(px(r + rand(-2.2, 1.8)), px(t), rand(0.4, 1.2) * S, rand(0.4, 1.2) * S);
      g.fillRect(px(t), px(r + rand(-2.2, 1.8)), rand(0.4, 1.2) * S, rand(0.4, 1.2) * S);
    }
  }

  // the lagoon
  {
    const cx = BLOCK_CENTERS[3], cz = BLOCK_CENTERS[2];
    g.fillStyle = '#e6d7a4';
    g.beginPath(); g.ellipse(px(cx + 1), px(cz - 1), 10.4 * S, 8.2 * S, 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2b9fc0';
    g.beginPath(); g.ellipse(px(cx + 1), px(cz - 1), 9.0 * S, 6.8 * S, 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5ecbdc';
    g.beginPath(); g.ellipse(px(cx - 1), px(cz - 2), 4.8 * S, 3.2 * S, 0.3, 0, Math.PI * 2); g.fill();
  }
  // tide pool in the treasure cove
  {
    const cx = BLOCK_CENTERS[2], cz = BLOCK_CENTERS[2];
    g.fillStyle = '#3fb0c8';
    g.beginPath(); g.ellipse(px(cx - 8), px(cz - 8), 3.4 * S, 2.4 * S, 0.7, 0, Math.PI * 2); g.fill();
  }
  // skull rock plateau
  {
    const cx = BLOCK_CENTERS[2], cz = BLOCK_CENTERS[0];
    g.fillStyle = '#9b957f';
    g.beginPath(); g.ellipse(px(cx), px(cz), 13 * S, 12 * S, 0, 0, Math.PI * 2); g.fill();
  }
  // X marks the spot — red crosses dotted around the isles
  g.strokeStyle = 'rgba(190,40,40,0.85)';
  g.lineWidth = 1.1 * S;
  g.lineCap = 'round';
  const xs = [
    [BLOCK_CENTERS[2], BLOCK_CENTERS[2]],
    [rand(-130, -100), rand(90, 120)],
    [rand(90, 130), rand(-130, -95)],
  ];
  for (const [x, z] of xs) {
    g.beginPath();
    g.moveTo(px(x - 2), px(z - 2)); g.lineTo(px(x + 2), px(z + 2));
    g.moveTo(px(x + 2), px(z - 2)); g.lineTo(px(x - 2), px(z + 2));
    g.stroke();
  }
  // shells and starfish freckles
  for (let i = 0; i < 260; i++) {
    g.fillStyle = pick(['rgba(250,245,230,0.8)', 'rgba(240,220,200,0.7)', 'rgba(230,140,120,0.6)']);
    g.fillRect(px(rand(-HALF, HALF)), px(rand(-HALF, HALF)), rand(0.3, 0.7) * S, rand(0.3, 0.7) * S);
  }
  // wet-sand shoreline fringe
  const wets = ['#c2a468', '#b89a5e', '#ccae74'];
  g.fillStyle = wets[0];
  const fr = 3.5 * S;
  g.fillRect(0, 0, 2048, fr);
  g.fillRect(0, 2048 - fr, 2048, fr);
  g.fillRect(0, 0, fr, 2048);
  g.fillRect(2048 - fr, 0, fr, 2048);
  for (let i = 0; i < 340; i++) {
    const along = rand(-HALF, HALF);
    const depth = rand(2, 7.5);
    const w = rand(2, 6), l = rand(2, 6);
    g.fillStyle = pick(wets);
    const side = randInt(0, 3);
    if (side === 0) g.fillRect(px(-HALF), px(along), depth * S, l * S);
    else if (side === 1) g.fillRect(px(HALF - depth), px(along), depth * S, l * S);
    else if (side === 2) g.fillRect(px(along), px(-HALF), w * S, depth * S);
    else g.fillRect(px(along), px(HALF - depth), w * S, depth * S);
  }
}

let ground;
function buildGround() {
  if (ground) {
    ground.geometry.dispose();
    ground.material.map.dispose();
    ground.material.dispose();
    scene.remove(ground);
  }
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

/* ============================== Ocean — the city is an island ============================== */

const SEA_LEVEL = -1.15;
let updateSea = () => {};

/* a flat square-ish ring following the island perimeter, inner edge at innerS,
 * outer edge at outerS (+ deterministic jitter so the coast isn't ruler-straight) */
function squareRing(innerS, outerS, innerY, outerY, colInner, colOuter, jitterAmp = 0) {
  const N = 200;
  const pos = new Float32Array((N + 1) * 2 * 3);
  const col = new Float32Array((N + 1) * 2 * 3);
  const idx = [];
  const ci = new THREE.Color(colInner), co = new THREE.Color(colOuter);
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const dx = Math.cos(a), dz = Math.sin(a);
    const m = Math.max(Math.abs(dx), Math.abs(dz));
    const ox = dx / m, oz = dz / m;
    const j = jitterAmp * (Math.sin(a * 5) * 0.6 + Math.sin(a * 11 + 2) * 0.4);
    const o = i * 6;
    pos[o] = ox * innerS; pos[o + 1] = innerY; pos[o + 2] = oz * innerS;
    pos[o + 3] = ox * (outerS + j); pos[o + 4] = outerY; pos[o + 5] = oz * (outerS + j);
    col[o] = ci.r; col[o + 1] = ci.g; col[o + 2] = ci.b;
    col[o + 3] = co.r; col[o + 4] = co.g; col[o + 5] = co.b;
    if (i < N) {
      const v = i * 2;
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

let seaGroup = null;
function buildSea() {
  if (seaGroup) disposeGroup(seaGroup);
  seaGroup = new THREE.Group();
  const pirate = theme === 'pirate';

  // water surface: two drifting layers of streaky texture (moonlit or turquoise)
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = pirate ? '#1580a0' : '#0e2338';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 110; i++) {
    g.fillStyle = pirate
      ? `rgba(${randInt(60, 105)},${randInt(175, 215)},${randInt(195, 235)},${rand(0.08, 0.28).toFixed(2)})`
      : `rgba(${randInt(26, 48)},${randInt(80, 125)},${randInt(125, 170)},${rand(0.08, 0.28).toFixed(2)})`;
    g.fillRect(rand(0, 256), rand(0, 256), rand(12, 48), rand(1, 2.5));
  }
  for (let i = 0; i < 30; i++) {
    g.fillStyle = pirate
      ? `rgba(245,255,255,${rand(0.08, 0.2).toFixed(2)})`
      : `rgba(210,228,255,${rand(0.05, 0.15).toFixed(2)})`;
    g.fillRect(rand(0, 256), rand(0, 256), rand(2, 7), 1.2);
  }
  const tex1 = new THREE.CanvasTexture(cv);
  tex1.wrapS = tex1.wrapT = THREE.RepeatWrapping;
  tex1.colorSpace = THREE.SRGBColorSpace;
  tex1.repeat.set(26, 26);
  const tex2 = tex1.clone();
  tex2.needsUpdate = true;
  tex2.repeat.set(15, 15);

  const seaGeo = new THREE.CircleGeometry(600, 48);
  seaGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(seaGeo, new THREE.MeshLambertMaterial({
    map: tex1,
    emissive: pirate ? 0x0e4c58 : 0x0a1626,
    emissiveIntensity: pirate ? 0.5 : 0.55,
  }));
  water.position.y = SEA_LEVEL;
  water.receiveShadow = true;
  seaGroup.add(water);

  const shimmer = new THREE.Mesh(seaGeo, new THREE.MeshLambertMaterial({
    map: tex2, transparent: true, opacity: 0.35, depthWrite: false,
  }));
  shimmer.position.y = SEA_LEVEL + 0.04;
  seaGroup.add(shimmer);

  // beach skirt sloping from the ground edge down under the waterline
  const beach = new THREE.Mesh(
    pirate
      ? squareRing(HALF - 1, HALF + 15, -0.03, -3.4, '#e8d8a4', '#2e6a62', 2.2)
      : squareRing(HALF - 1, HALF + 15, -0.03, -3.4, '#cdb67e', '#3e3830', 2.2),
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
  );
  beach.receiveShadow = true;
  seaGroup.add(beach);

  // surf foam hugging the shoreline (beach slope crosses SEA_LEVEL ~4 units out)
  const foamMat = new THREE.MeshBasicMaterial({
    color: pirate ? 0xf4fbff : 0xdfeaff, transparent: true, opacity: 0.3, depthWrite: false,
  });
  const foam = new THREE.Mesh(
    squareRing(HALF + 3.2, HALF + 6.4, SEA_LEVEL + 0.05, SEA_LEVEL + 0.05, '#ffffff', '#ffffff', 0.74),
    foamMat
  );
  seaGroup.add(foam);

  // glitter lane stretching toward the moon (city) or the sun (pirate)
  const glCv = document.createElement('canvas');
  glCv.width = glCv.height = 128;
  const gl = glCv.getContext('2d');
  const gr = gl.createRadialGradient(64, 64, 4, 64, 64, 64);
  if (pirate) {
    gr.addColorStop(0, 'rgba(255,248,214,0.95)');
    gr.addColorStop(0.5, 'rgba(255,236,170,0.4)');
    gr.addColorStop(1, 'rgba(255,225,140,0)');
  } else {
    gr.addColorStop(0, 'rgba(255,205,235,0.9)');
    gr.addColorStop(0.5, 'rgba(255,170,220,0.35)');
    gr.addColorStop(1, 'rgba(255,150,210,0)');
  }
  gl.fillStyle = gr;
  gl.fillRect(0, 0, 128, 128);
  const mdir = new THREE.Vector2(260, -420).normalize();
  const glGeo = new THREE.PlaneGeometry(46, 250);
  glGeo.rotateX(-Math.PI / 2);
  glGeo.rotateY(Math.atan2(-mdir.x, -mdir.y));
  const glint = new THREE.Mesh(glGeo, new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(glCv), transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  glint.position.set(mdir.x * 300, SEA_LEVEL + 0.08, mdir.y * 300);
  seaGroup.add(glint);

  // small offshore islets — mossy silhouettes at night, sandy palm keys in the sun
  const islets = [
    [-250, -120, 10, true], [240, 150, 8, false], [95, -265, 12, true],
    [-190, 235, 7, true], [290, -40, 5.5, false],
  ];
  for (const [x, z, s, treed] of islets) {
    const rockA = pirate ? '#cfba82' : '#4c5244';
    const rockB = pirate ? '#dcc890' : '#575e4c';
    const parts = [
      sph(s, rockA, 0, 0, 0, 0.5),
      sph(s * 0.6, rockB, s * 0.45, s * 0.06, -s * 0.35, 0.5),
    ];
    if (treed) {
      parts.push(cyl(0.22, 0.32, 3, 6, pirate ? '#8a6a3c' : '#5c3f24', 0, s * 0.42 + 1.5, 0));
      parts.push(sph(1.7, pirate ? '#3fae4e' : '#2f7a3a', 0, s * 0.42 + 3.4, 0, 0.9));
      parts.push(sph(1.0, pirate ? '#58c063' : '#3c8a37', 0.9, s * 0.42 + 2.7, 0.4));
    }
    const islet = new THREE.Mesh(mergeGeometries(parts, false), matLit);
    islet.position.set(x, SEA_LEVEL - s * 0.12, z);
    seaGroup.add(islet);
  }
  scene.add(seaGroup);

  updateSea = (time) => {
    tex1.offset.set(time * 0.0065, time * 0.0042);
    tex2.offset.set(-time * 0.005, time * 0.0075);
    const surge = Math.sin(time * 1.6);
    foamMat.opacity = 0.24 + 0.12 * surge;
    foam.position.y = 0.03 * surge;
    foam.scale.setScalar(1 + 0.004 * surge);
  };
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
function facadeCyl(radius, h, matIndex) {
  const g = new THREE.CylinderGeometry(radius, radius, h, 22, 1);
  const uv = g.attributes.uv;
  const circ = 2 * Math.PI * radius;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / 2.7, uv.getY(i) * h / 2.7);
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

  /* cylindrical structures fit a smaller hole — no corners to catch */
  mergedTemplate('tank', 2.8, () => [
    cyl(2.6, 2.6, 5.2, 14, '#9aa2ae', 0, 2.6, 0),
    cyl(2.7, 2.7, 0.3, 14, '#7a828e', 0, 5.35, 0),
    box(0.2, 6.4, 0.2, '#6a727e', 2.3, 3.2, 0),
  ]);
  mergedTemplate('silo', 2.1, () => [
    cyl(2.0, 2.0, 8.5, 12, '#b8c0cc', 0, 4.25, 0),
    sph(2.0, '#98a0ac', 0, 8.5, 0, 0.5),
    cyl(0.14, 0.14, 8, 6, '#6a727e', 2.12, 4, 0),
  ], true, 30);
  mergedTemplate('watertower', 2.6, () => [
    box(0.28, 6.5, 0.28, '#5a4a3c', -1.7, 3.25, -1.7),
    box(0.28, 6.5, 0.28, '#5a4a3c', 1.7, 3.25, -1.7),
    box(0.28, 6.5, 0.28, '#5a4a3c', -1.7, 3.25, 1.7),
    box(0.28, 6.5, 0.28, '#5a4a3c', 1.7, 3.25, 1.7),
    cyl(2.4, 2.1, 3.6, 12, '#8a6a5a', 0, 8.2, 0),
    cone(2.6, 1.4, 12, '#6a4a3a', 0, 10.7, 0),
  ], true, 40);

  /* small street clutter */
  mergedTemplate('bollard', 0.3, () => [
    cyl(0.1, 0.13, 0.75, 6, '#39405a', 0, 0.38, 0),
    sph(0.11, '#ffd24a', 0, 0.78, 0),
  ], false);
  mergedTemplate('cone', 0.3, () => [
    box(0.55, 0.07, 0.55, '#e06a24', 0, 0.04, 0),
    cone(0.28, 0.7, 8, '#ff7f2a', 0, 0.4, 0),
  ], false);
  mergedTemplate('phonebox', 0.85, () => [
    box(1.1, 2.6, 1.1, '#d03a3a', 0, 1.3, 0),
    box(1.2, 0.25, 1.2, '#a82828', 0, 2.7, 0),
    box(0.75, 1.3, 0.06, '#9adfff', 0, 1.5, 0.56),
  ], false);
  mergedTemplate('dumpster', 1.1, () => [
    box(2.4, 1.3, 1.4, '#3f7a4a', 0, 0.78, 0),
    box(2.5, 0.16, 1.5, '#356540', 0, 1.5, 0, 0.03),
    box(0.5, 0.25, 1.3, '#2c2c34', -0.9, 0.12, 0),
    box(0.5, 0.25, 1.3, '#2c2c34', 0.9, 0.12, 0),
  ], false);
  mergedTemplate('bike', 0.5, () => [
    wheel(0.35, 0.07, '#1a1a20', 0, 0.35, 0.55),
    wheel(0.35, 0.07, '#1a1a20', 0, 0.35, -0.55),
    box(0.06, 0.09, 1.1, pick(['#d04b5a', '#4b7fd0', '#4bd08a']), 0, 0.56, 0),
    box(0.06, 0.5, 0.06, '#3a3a44', 0, 0.8, -0.5),
    box(0.42, 0.05, 0.06, '#3a3a44', 0, 1.05, -0.5),
    box(0.06, 0.35, 0.06, '#3a3a44', 0, 0.75, 0.45),
    box(0.28, 0.06, 0.14, '#4a3520', 0, 0.93, 0.45),
  ], false);
  mergedTemplate('clock', 0.7, () => {
    const face = new THREE.CylinderGeometry(0.5, 0.5, 0.14, 12);
    face.rotateX(Math.PI / 2);
    face.translate(0, 3.6, 0);
    tint(face, '#f0ead0');
    return [
      cyl(0.08, 0.12, 3.2, 6, '#2e4a3c', 0, 1.6, 0),
      face,
      box(0.06, 0.3, 0.02, '#22222c', 0, 3.7, 0.09),
      box(0.2, 0.06, 0.02, '#22222c', 0.08, 3.6, 0.09),
    ];
  }, false);
  mergedTemplate('planter', 0.6, () => [
    cyl(0.55, 0.42, 0.6, 8, '#7a5a48', 0, 0.3, 0),
    sph(0.55, pick(treeGreens), 0, 0.85, 0, 0.8),
  ], false);
  mergedTemplate('picnic', 0.95, () => [
    box(1.8, 0.1, 1.0, '#9a6a3c', 0, 0.75, 0),
    box(1.8, 0.08, 0.45, '#9a6a3c', 0, 0.45, 0.78),
    box(1.8, 0.08, 0.45, '#9a6a3c', 0, 0.45, -0.78),
    box(0.12, 0.75, 1.7, '#7a5230', -0.7, 0.38, 0),
    box(0.12, 0.75, 1.7, '#7a5230', 0.7, 0.38, 0),
  ], false);
  mergedTemplate('swing', 1.3, () => [
    box(0.14, 2.5, 0.14, '#d0576a', -1.5, 1.25, 0),
    box(0.14, 2.5, 0.14, '#d0576a', 1.5, 1.25, 0),
    box(3.3, 0.14, 0.14, '#d0576a', 0, 2.5, 0),
    box(0.05, 1.5, 0.05, '#8a8a96', -0.7, 1.7, 0),
    box(0.05, 1.5, 0.05, '#8a8a96', -0.3, 1.7, 0),
    box(0.5, 0.07, 0.3, '#f0c33c', -0.5, 0.95, 0),
    box(0.05, 1.3, 0.05, '#8a8a96', 0.4, 1.8, 0),
    box(0.05, 1.3, 0.05, '#8a8a96', 0.8, 1.8, 0),
    box(0.5, 0.07, 0.3, '#57d9ff', 0.6, 1.15, 0),
  ], false);
  mergedTemplate('slide', 1.0, () => [
    box(0.8, 0.12, 0.8, '#4b7fd0', 0, 2.0, -1.2),
    box(0.1, 2.0, 0.1, '#4b7fd0', -0.35, 1.0, -1.5),
    box(0.1, 2.0, 0.1, '#4b7fd0', 0.35, 1.0, -1.5),
    box(0.7, 0.1, 2.6, '#f0c33c', 0, 1.15, 0.2, 0).rotateX(-0.6),
  ], false);

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

  /* --- terraced houses: a row is built from individual eatable chunks --- */
  const terraceWalls = ['#c87a6a', '#c8a05a', '#8aa06a', '#7a86b0', '#b07a9a', '#9a8a70'];
  terraceWalls.forEach((wall, i) => {
    const h = 5 + (i % 3) * 0.9;
    mergedTemplate('terrace' + i, 2.0, () => [
      box(3.3, h, 6, wall, 0, h / 2, 0),
      box(3.45, 0.4, 6.2, '#4a4454', 0, h + 0.15, 0),
      box(1.0, 2.0, 0.12, '#5a3a28', -0.8, 1.0, 3.02),
      box(1.1, 0.9, 0.12, '#ffe9b0', 0.7, 1.6, 3.02),
      box(1.1, 0.9, 0.12, '#ffedb8', -0.6, 3.4, 3.02),
      box(1.1, 0.9, 0.12, '#9adfff', 0.7, 3.4, 3.02),
      cyl(0.22, 0.22, 1.0, 6, '#6a5a48', 1.0, h + 0.65, -1.6),
    ], true, 25);
  });

  /* --- office blocks assembled from separate slabs --- */
  for (let i = 0; i < 3; i++) {
    const h = 15 + i * 2.5;
    template('officechunk' + i, 3.6, () => {
      const g = new THREE.Group();
      g.add(facadeBox(4.6, h, 9, i));
      g.add(litMesh(mergeGeometries([
        box(4.8, 0.5, 9.2, '#46425a', 0, h + 0.2, 0),
        box(2.2, 1.4, 0.3, '#ffe9b0', 0, 0.8, 4.62),
      ], false)));
      return g;
    }, 60);
  }

  /* --- cylindrical tower: slips into a smaller hole than a square office --- */
  template('roundtower', 4.8, () => {
    const g = new THREE.Group();
    const h = rand(22, 28);
    g.add(facadeCyl(5.0, h, randInt(0, 2)));
    g.add(litMesh(mergeGeometries([
      cyl(5.2, 5.2, 0.6, 22, '#46425a', 0, h + 0.25, 0),
      cyl(1.4, 1.8, 1.2, 10, '#3a3846', 0, h + 1.1, 0),
      cyl(0.12, 0.12, 5, 5, '#8a8a96', 0, h + 3.5, 0),
      sph(0.28, '#ff5060', 0, h + 6, 0),
    ], false)));
    return g;
  }, 130);

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

  /* ===================== pirate-isle props ===================== */

  const palmGreens = ['#3fae4e', '#2f9a44', '#58c063'];
  const palmFronds = (x, y, count, len) => {
    const parts = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(-0.2, 0.2);
      const fr = new THREE.SphereGeometry(len, 6, 4);
      fr.scale(1, 0.16, 0.34);
      fr.translate(len * 0.75, 0, 0);
      fr.rotateZ(-rand(0.35, 0.6));
      fr.rotateY(a);
      fr.translate(x, y, 0);
      parts.push(tint(fr, pick(palmGreens)));
    }
    return parts;
  };
  mergedTemplate('palm', 1.0, () => [
    cyl(0.16, 0.24, 2.0, 6, '#8a6a3c', 0, 1.0, 0),
    cyl(0.12, 0.16, 1.7, 6, '#97754a', 0.3, 2.75, 0),
    sph(0.17, '#5c4322', 0.15, 3.5, 0.18),
    sph(0.17, '#5c4322', 0.5, 3.45, -0.12),
    ...palmFronds(0.3, 3.65, 6, 0.95),
  ]);
  mergedTemplate('palm-big', 1.45, () => [
    cyl(0.22, 0.32, 2.4, 7, '#84643a', 0, 1.2, 0),
    cyl(0.17, 0.22, 2.0, 6, '#8f6d42', 0.35, 3.35, 0),
    cyl(0.13, 0.17, 1.7, 6, '#97754a', 0.7, 5.1, 0),
    sph(0.2, '#5c4322', 0.5, 5.85, 0.24),
    sph(0.2, '#5c4322', 0.95, 5.8, -0.16),
    ...palmFronds(0.7, 6.0, 7, 1.3),
  ]);

  mergedTemplate('chest', 0.75, () => [
    box(1.15, 0.6, 0.78, '#7a4c28', 0, 0.3, 0),
    box(1.2, 0.22, 0.84, '#8a5a30', 0, 0.68, -0.06),
    box(0.16, 0.66, 0.8, '#d8ac3c', 0, 0.33, 0),
    box(1.18, 0.1, 0.16, '#d8ac3c', 0, 0.62, 0.34),
    sph(0.3, '#ffd24a', 0, 0.72, 0.12, 0.5),
    sph(0.16, '#ffe98a', -0.3, 0.68, 0.1),
    sph(0.14, '#ffe98a', 0.28, 0.66, 0.15),
  ], true, 45);

  mergedTemplate('goldpile', 0.9, () => [
    sph(0.85, '#e8bc3e', 0, 0.25, 0, 0.42),
    sph(0.55, '#ffd24a', 0.25, 0.5, 0.15, 0.5),
    sph(0.35, '#ffe07a', -0.3, 0.55, -0.2, 0.6),
    cyl(0.14, 0.09, 0.34, 6, '#ffd97a', 0.55, 0.75, -0.3),
    sph(0.12, '#ff5c8a', -0.1, 0.75, 0.1),
  ], false, 35);

  mergedTemplate('barrel', 0.55, () => [
    cyl(0.4, 0.34, 0.5, 10, '#8a5f34', 0, 0.25, 0),
    cyl(0.34, 0.4, 0.5, 10, '#8a5f34', 0, 0.75, 0),
    cyl(0.41, 0.41, 0.08, 10, '#4a3a26', 0, 0.3, 0),
    cyl(0.41, 0.41, 0.08, 10, '#4a3a26', 0, 0.72, 0),
  ], false);

  mergedTemplate('rumstack', 1.15, () => [
    wheel(0.42, 1.1, '#8a5f34', -0.45, 0.42, 0),
    wheel(0.42, 1.1, '#7d5630', 0.45, 0.42, 0),
    wheel(0.42, 1.1, '#96693a', 0, 1.14, 0),
  ], false, 10);

  mergedTemplate('cannon', 1.25, () => {
    const barrel = new THREE.CylinderGeometry(0.2, 0.3, 2.3, 9);
    barrel.rotateX(Math.PI / 2 + 0.14);
    barrel.translate(0, 0.85, 0.35);
    const muzzle = new THREE.CylinderGeometry(0.26, 0.26, 0.3, 9);
    muzzle.rotateX(Math.PI / 2 + 0.14);
    muzzle.translate(0, 1.0, 1.4);
    return [
      tint(barrel, '#3a3d46'), tint(muzzle, '#2e3138'),
      box(0.9, 0.5, 1.5, '#7a5230', 0, 0.45, -0.35),
      wheel(0.42, 0.14, '#5c4326', -0.52, 0.42, -0.3),
      wheel(0.42, 0.14, '#5c4326', 0.52, 0.42, -0.3),
      sph(0.16, '#26262e', 0.65, 0.16, 0.55),
      sph(0.16, '#26262e', 0.95, 0.16, 0.35),
      sph(0.16, '#26262e', 0.8, 0.42, 0.45),
    ];
  }, false, 15);

  mergedTemplate('anchor', 0.7, () => {
    const fluke = new THREE.TorusGeometry(0.55, 0.09, 6, 10, Math.PI);
    fluke.rotateZ(Math.PI);
    fluke.translate(0, 0.62, 0);
    const ring = new THREE.TorusGeometry(0.16, 0.05, 6, 10);
    ring.translate(0, 1.95, 0);
    return [
      tint(fluke, '#4a4e58'), tint(ring, '#4a4e58'),
      box(0.12, 1.5, 0.12, '#4a4e58', 0, 1.1, 0),
      box(0.8, 0.1, 0.1, '#4a4e58', 0, 1.6, 0),
    ];
  }, false);

  mergedTemplate('tiki', 0.45, () => [
    cyl(0.07, 0.1, 1.7, 5, '#6a4a26', 0, 0.85, 0),
    cyl(0.16, 0.12, 0.3, 6, '#8a6038', 0, 1.75, 0),
    sph(0.2, '#ff9c30', 0, 2.0, 0, 1.4),
    sph(0.1, '#ffe9a0', 0, 2.12, 0),
  ], false);

  mergedTemplate('campfire', 0.85, () => {
    const parts = [
      box(1.1, 0.15, 0.15, '#5c4326', 0, 0.1, 0, 0.5),
      box(1.1, 0.15, 0.15, '#6a4a26', 0, 0.14, 0, -0.6),
      box(1.1, 0.15, 0.15, '#4e3820', 0, 0.12, 0, 1.7),
      sph(0.32, '#ff8c26', 0, 0.4, 0, 1.5),
      sph(0.18, '#ffd25a', 0, 0.62, 0, 1.4),
    ];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      parts.push(sph(0.13, '#7a7468', Math.cos(a) * 0.75, 0.08, Math.sin(a) * 0.75));
    }
    return parts;
  }, false);

  for (const [i, c] of ['#b04838', '#3f6fae', '#8a6a3a'].entries()) {
    mergedTemplate('tent' + i, 1.5, () => [
      cone(1.7, 2.0, 4, c, 0, 1.0, 0, Math.PI / 4),
      cyl(0.05, 0.05, 0.7, 5, '#6a4a26', 0, 2.2, 0),
      box(0.5, 0.3, 0.05, c, 0.25, 2.3, 0),
    ], false, 10);
  }

  /* thatched huts — the pirate village's houses */
  ['#b89868', '#a8906a', '#c0a070'].forEach((wall, i) => {
    mergedTemplate('hut' + i, 3.3, () => [
      cyl(2.5, 2.7, 2.9, 8, wall, 0, 1.45, 0),
      cone(3.65, 0.7, 8, '#7a6838', 0, 3.15, 0),
      cone(3.4, 2.4, 8, '#9a8648', 0, 4.2, 0),
      box(1.1, 1.7, 0.2, '#5a3a28', 0, 0.85, 2.55),
    ], true, 40);
  });

  mergedTemplate('tavern', 4.2, () => {
    const roof = new THREE.ConeGeometry(1, 1, 4);
    roof.rotateY(Math.PI / 4);
    roof.scale(6.1, 2.6, 4.7);
    roof.translate(0, 5.6, 0);
    tint(roof, '#8a7440');
    return [
      box(8.5, 4.4, 6.5, '#9a7a4c', 0, 2.2, 0),
      roof,
      box(1.4, 2.2, 0.2, '#4e3820', 0, 1.1, 3.3),
      box(1.5, 1.1, 0.15, '#ffdf9a', -2.6, 2.2, 3.3),
      box(1.5, 1.1, 0.15, '#ffdf9a', 2.6, 2.2, 3.3),
      box(1.6, 1.0, 0.12, '#6a4a26', 0, 3.6, 3.35),
      wheel(0.42, 1.0, '#8a5f34', 3.6, 0.42, 2.6),
    ];
  }, true, 70);

  mergedTemplate('rowboat', 1.35, () => [
    box(1.5, 0.55, 3.6, '#7a5230', 0, 0.35, 0),
    box(1.1, 0.4, 3.0, '#33261a', 0, 0.5, 0),
    box(1.56, 0.14, 0.5, '#8a6038', 0, 0.55, -1.6),
    box(1.3, 0.1, 0.35, '#8a6038', 0, 0.5, 0.3),
    box(0.14, 0.1, 2.6, '#a8845a', 0.85, 0.62, 0.2, 0.35),
  ], false, 10);

  mergedTemplate('wreck-sloop', 3.8, () => {
    const mast = new THREE.CylinderGeometry(0.12, 0.2, 7.5, 6);
    mast.rotateZ(0.55);
    mast.translate(1.2, 3.2, -0.5);
    const sail = new THREE.BoxGeometry(0.08, 3.2, 2.0);
    sail.rotateZ(0.55);
    sail.translate(2.4, 4.2, -0.5);
    return [
      box(3.4, 2.4, 9.5, '#6a4a2c', 0, 1.1, 0),
      box(3.6, 0.5, 9.7, '#7d5833', 0, 2.4, 0),
      box(3.0, 1.4, 1.6, '#5c4026', 0, 3.0, -3.6),
      tint(mast, '#5c4326'), tint(sail, '#cdbfa0'),
      box(0.8, 2.6, 0.5, '#4e3820', -1.55, 1.2, 1.5, 0.2),
    ];
  }, true, 90);

  /* beached galleon, served in two courses */
  mergedTemplate('galleon-bow', 6.0, () => {
    const sprit = new THREE.CylinderGeometry(0.1, 0.18, 6, 6);
    sprit.rotateX(-Math.PI / 2 + 0.5);
    sprit.translate(0, 5.6, 7.5);
    const mast = new THREE.CylinderGeometry(0.16, 0.26, 12, 7);
    mast.rotateZ(0.12);
    mast.translate(0.6, 10, -2);
    return [
      box(5.4, 4.6, 12, '#5e4028', 0, 2.3, 0),
      box(5.0, 1.2, 3.5, '#503622', 0, 1.4, 7.0),
      box(3.4, 0.9, 2.4, '#503622', 0, 2.1, 8.2),
      box(5.7, 0.5, 12.2, '#7d5833', 0, 4.85, 0),
      box(0.5, 0.9, 12.2, '#6a4a2c', -2.7, 5.4, 0),
      box(0.5, 0.9, 12.2, '#6a4a2c', 2.7, 5.4, 0),
      tint(sprit, '#5c4326'), tint(mast, '#5c4326'),
      box(4.6, 0.22, 0.5, '#5c4326', 0.6, 12.5, -2),
      box(4.2, 3.2, 0.14, '#cdbfa0', 0.9, 10.6, -1.9),
      sph(0.5, '#ffd24a', 0, 4.2, 9.4),
    ];
  }, true, 150);
  mergedTemplate('galleon-stern', 6.5, () => {
    const mast = new THREE.CylinderGeometry(0.14, 0.24, 10, 7);
    mast.rotateZ(-0.5);
    mast.translate(-1.5, 8, 1);
    return [
      box(5.6, 4.8, 11, '#5e4028', 0, 2.4, 0),
      box(5.8, 0.5, 11.2, '#7d5833', 0, 5.0, 0),
      box(5.6, 3.4, 4.2, '#6a4a2c', 0, 6.8, -3.2),
      box(5.8, 0.6, 4.5, '#503622', 0, 8.7, -3.2),
      box(1.1, 0.9, 0.15, '#ffd97a', -1.6, 6.9, -5.33),
      box(1.1, 0.9, 0.15, '#ffd97a', 0, 6.9, -5.33),
      box(1.1, 0.9, 0.15, '#ffd97a', 1.6, 6.9, -5.33),
      box(0.5, 0.9, 11.2, '#6a4a2c', -2.85, 5.6, 0),
      box(0.5, 0.9, 11.2, '#6a4a2c', 2.85, 5.6, 0),
      tint(mast, '#5c4326'),
      box(0.1, 1.6, 2.4, '#2a2a30', -3.9, 9.6, 1),
    ];
  }, true, 180);

  mergedTemplate('fort-tower', 4.5, () => {
    const parts = [
      cyl(3.0, 3.4, 6.5, 10, '#9a927e', 0, 3.25, 0),
      cyl(3.4, 3.2, 0.8, 10, '#8a8270', 0, 6.9, 0),
    ];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      parts.push(box(0.9, 0.8, 0.5, '#8a8270', Math.cos(a) * 3.0, 7.7, Math.sin(a) * 3.0, -a));
    }
    parts.push(
      box(1.2, 1.8, 0.3, '#3a3026', 0, 0.9, 3.25),
      cyl(0.06, 0.08, 3.2, 5, '#5c4326', 0, 8.9, 0),
      box(1.7, 1.0, 0.08, '#1c1c22', 0.88, 9.9, 0),
      sph(0.16, '#f0f0f5', 0.7, 9.95, 0.06),
    );
    return parts;
  }, true, 90);

  mergedTemplate('fort-wall', 3.0, () => {
    const parts = [box(7.2, 3.2, 1.4, '#9a927e', 0, 1.6, 0)];
    for (let i = -2; i <= 2; i++) parts.push(box(0.9, 0.7, 1.5, '#8a8270', i * 1.5, 3.55, 0));
    return parts;
  }, true, 40);

  mergedTemplate('lighthouse', 4.4, () => [
    cyl(2.6, 3.0, 3.4, 10, '#d8d0c0', 0, 1.7, 0),
    cyl(2.2, 2.6, 3.4, 10, '#c04838', 0, 5.1, 0),
    cyl(1.8, 2.2, 3.4, 10, '#d8d0c0', 0, 8.5, 0),
    cyl(2.3, 2.3, 0.5, 10, '#6a625a', 0, 10.45, 0),
    cyl(1.3, 1.3, 1.6, 8, '#ffe9a0', 0, 11.5, 0),
    cone(1.7, 1.3, 8, '#c04838', 0, 12.95, 0),
    box(1.3, 2.0, 0.2, '#4e3820', 0, 1.0, 2.85),
  ], true, 130);

  mergedTemplate('skullrock', 6.8, () => {
    const parts = [
      sph(6.0, '#a8a291', 0, 3.6, 0, 0.85),
      box(7.2, 2.2, 4.4, '#98927f', 0, 1.1, 0.8),
      sph(1.25, '#2c2a26', -2.1, 5.0, 5.3),
      sph(1.25, '#2c2a26', 2.1, 5.0, 5.3),
      sph(0.55, '#2c2a26', 0, 4.0, 5.75, 1.4),
    ];
    for (let i = -2; i <= 2; i++) {
      parts.push(box(0.6, 1.0, 0.5, '#d8d0be', i * 0.95, 1.5, 3.15));
    }
    return parts;
  }, true, 220);

  mergedTemplate('dock', 1.6, () => {
    const parts = [box(2.6, 0.18, 7.5, '#8a6644', 0, 0.85, 0)];
    for (let i = 0; i < 8; i++) parts.push(box(2.6, 0.04, 0.12, '#6a4a2c', 0, 0.95, -3.4 + i));
    for (const [x, z] of [[-1.1, -3.2], [1.1, -3.2], [-1.1, 0], [1.1, 0], [-1.1, 3.2], [1.1, 3.2]]) {
      parts.push(cyl(0.14, 0.16, 1.1, 6, '#5c4326', x, 0.45, z));
    }
    return parts;
  }, false, 15);
}

/* --- people --- */
const SHIRT = ['#e15b64', '#5bc0e1', '#e1c15b', '#8f5be1', '#5be189', '#e15bb0', '#e8e8ee'];
const SKIN = ['#e8b58e', '#c68a5e', '#8a5a3a', '#f0c8a0'];
const personBodies = [];
const personLegGeos = [];
function buildPersonParts() {
  personBodies.length = 0;
  personLegGeos.length = 0;
  const pirate = theme === 'pirate';
  const shirts = pirate
    ? ['#e8e0cc', '#b03838', '#2e2e3a', '#2e5aa0', '#e8e0cc', '#7a2e50', '#d8b04a', '#3a6e4a']
    : SHIRT;
  for (let i = 0; i < 8; i++) {
    const shirt = pick(shirts), skin = pick(SKIN);
    const parts = [
      box(0.52, 0.62, 0.3, shirt, 0, 1.2, 0),
      sph(0.19, skin, 0, 1.68, 0),
      box(0.13, 0.5, 0.16, shirt, -0.34, 1.2, 0),
      box(0.13, 0.5, 0.16, shirt, 0.34, 1.2, 0),
    ];
    if (pirate) {
      parts.push(sph(0.2, pick(['#c03030', '#2a2a34', '#2e6aae', '#d8b04a']), 0, 1.79, 0, 0.6));
      if (Math.random() < 0.35) parts.push(box(0.11, 0.06, 0.1, '#1a1a20', 0.08, 1.7, 0.15));
    }
    personBodies.push(mergeGeometries(parts, false));
  }
  const pantsSet = pirate ? ['#4a3a2a', '#31394a', '#5a2e2e'] : ['#31394a', '#4a4a52', '#6a5a4a'];
  for (const pants of pantsSet) {
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

/* a row of chunk-buildings laid along the local x axis, rotated by ry */
function placeRow(keys, spacing, cx, cz, ry) {
  const n = keys.length;
  for (let k = 0; k < n; k++) {
    const off = (k - (n - 1) / 2) * spacing;
    placeTemplate(keys[k], cx + Math.cos(ry) * off, cz - Math.sin(ry) * off, ry);
  }
}
function placeTerrace(cx, cz, ry, count = 4) {
  placeRow(Array.from({ length: count }, () => 'terrace' + randInt(0, 5)), 3.4, cx, cz, ry);
}
function placeOfficeRow(cx, cz, ry) {
  placeRow(Array.from({ length: 3 }, () => 'officechunk' + randInt(0, 2)), 4.7, cx, cz, ry);
}

/* ============================== City generation ============================== */

function clearWorld() {
  for (let i = worldGroup.children.length - 1; i >= 0; i--) worldGroup.remove(worldGroup.children[i]);
  props = []; people = []; cars = [];
  for (const h of holes) h.destroy();
  holes = [];
  eatenPropCount = 0;
  clearPickups();
}

function sidewalkFurniture(cx, cz) {
  // props on the pavement ring around a block
  const edge = 14.6;
  const corners = [[-edge, -edge], [edge, -edge], [edge, edge], [-edge, edge]];
  for (const [ox, oz] of corners) {
    if (Math.random() < 0.75) placeTemplate('lamp', cx + ox, cz + oz);
  }
  const smalls = ['hydrant', 'bin', 'mailbox', 'sign-stop', 'sign-warn', 'sign-info', 'bench', 'bush',
    'bollard', 'planter', 'bike', 'bollard'];
  for (let i = 0; i < 7; i++) {
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
    // terrace row along the north edge, detached houses to the south
    placeTerrace(cx, cz - 8, 0);
    for (const [ox, oz] of [[-6.5, 6.5], [6.5, 6.5]]) {
      placeTemplate('house' + randInt(0, 3), cx + ox, cz + oz,
        Math.atan2(-ox, -oz) + rand(-0.15, 0.15));
    }
    placeTemplate('tree', cx + rand(-2, 2), cz + rand(-1, 2));
    for (let i = 0; i < 3; i++) placeTemplate('bush', cx + rand(-11, 11), cz + rand(0, 11));
    if (Math.random() < 0.4) placeTemplate('bike', cx + rand(-8, 8), cz + rand(1, 4));
    scatterPeople(3, 13);
  } else if (d === 'downtown') {
    const big = Math.random() < 0.3 ? 'skyscraper' : 'tower' + randInt(0, 1);
    placeTemplate(big, cx - 6, cz - 5.5, rand(-0.1, 0.1));
    const roll = Math.random();
    if (roll < 0.3) placeTemplate('roundtower', cx + 7, cz + 6);
    else if (roll < 0.7) placeOfficeRow(cx + 8, cz + 2, Math.PI / 2);
    else placeTemplate('office' + randInt(0, 2), cx + 6.5, cz + 6, rand(-0.1, 0.1));
    if (Math.random() < 0.6) placeTemplate('busstop', cx - 8, cz + 13.6, Math.PI);
    if (Math.random() < 0.5) placeTemplate('phonebox', cx - 12, cz + 10);
    if (Math.random() < 0.5) placeTemplate('clock', cx - 13.8, cz - 6);
    scatterPeople(5, 13);
  } else if (d === 'commercial') {
    placeTemplate('shop' + randInt(0, 3), cx - 8, cz - 7, Math.PI / 2);
    placeTemplate('shop' + randInt(0, 3), cx + 6, cz - 7);
    if (bx === 1 && bz === 4) {
      // market square
      for (let i = 0; i < 5; i++) {
        placeTemplate('stall' + randInt(0, 2), cx - 6 + (i % 3) * 6, cz + 4 + Math.floor(i / 3) * 6, rand(0, Math.PI));
      }
      for (let i = 0; i < 4; i++) placeTemplate('crate', cx + rand(-10, 10), cz + rand(2, 11));
      scatterPeople(9, 12);
    } else {
      placeTemplate('shop' + randInt(0, 3), cx - 1, cz + 7, Math.PI);
      placeTemplate('kiosk', cx + 9, cz + 6, -Math.PI / 2);
      placeTemplate('umbrella', cx + 9, cz + 0.5);
      placeTemplate('dumpster', cx - 10, cz + 11, rand(0, Math.PI));
      placeTemplate('phonebox', cx + 12, cz - 10);
      placeTemplate('bike', cx + 5, cz - 10, rand(0, Math.PI));
      scatterPeople(6, 12);
    }
  } else if (d === 'industrial') {
    if (bx === 4 && bz === 4) {
      placeTemplate('factory', cx, cz - 4);
      placeTemplate('silo', cx + 9, cz + 7);
      placeTemplate('watertower', cx - 9, cz + 8);
      placeTemplate('pallets', cx - 3, cz + 9);
      placeTemplate('crate', cx + 2, cz + 10);
    } else {
      placeTemplate('warehouse', cx - 1, cz - 5, bx % 2 ? 0 : Math.PI / 2);
      const yard = Math.random();
      if (yard < 0.4) placeTemplate('tank', cx - 9, cz + 8);
      else if (yard < 0.75) { placeTemplate('silo', cx - 10, cz + 8); placeTemplate('silo', cx - 5.5, cz + 8); }
      else placeTemplate('watertower', cx - 9, cz + 8);
      for (let i = 0; i < 2; i++) {
        placeTemplate('container' + randInt(0, 3), cx + 4 + i * 3.2, cz + 8, rand(-0.15, 0.15));
      }
      placeTemplate('pallets', cx + 10, cz + 2);
      placeTemplate('dumpster', cx + 11, cz - 3, Math.PI / 2);
    }
    scatterPeople(2, 12);
  } else if (d === 'mixed') {
    placeTemplate('midrise' + randInt(0, 2), cx - 6.5, cz - 6, rand(-0.1, 0.1));
    const roll = Math.random();
    if (roll < 0.35) placeTerrace(cx + 2, cz + 7, Math.PI);
    else if (roll < 0.6) placeOfficeRow(cx + 2, cz + 7, 0);
    else placeTemplate(Math.random() < 0.5 ? 'shop' + randInt(0, 3) : 'midrise' + randInt(0, 2), cx + 6.5, cz + 6, Math.PI);
    placeTemplate('tree', cx + 8, cz - 8);
    placeTemplate('tree', cx - 8, cz - 6);
    placeTemplate('planter', cx - 11, cz + 1);
    scatterPeople(4, 12);
  } else if (d === 'stadium') {
    placeTemplate('goal', cx - 11.5, cz, Math.PI / 2);
    placeTemplate('goal', cx + 11.5, cz, Math.PI / 2);
    placeTemplate('bleacher', cx, cz - 11.5);
    placeTemplate('bleacher', cx, cz + 11.5, Math.PI);
    for (const [ox, oz] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) {
      placeTemplate('floodlight', cx + ox * 0.94, cz + oz * 0.94);
    }
    scatterPeople(6, 10);
  } else if (d === 'church') {
    placeTemplate('church', cx, cz - 4);
    for (let i = 0; i < 8; i++) {
      placeTemplate('grave', cx - 9 + (i % 4) * 2.2, cz + 8 + Math.floor(i / 4) * 2.6, rand(-0.2, 0.2));
    }
    placeTemplate('tree-big', cx + 9, cz + 8);
    scatterPeople(2, 12);
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
    placeTemplate('clock', cx + 5, cz - 5);
    placeTemplate('planter', cx - 5, cz - 8);
    placeTemplate('planter', cx - 9, cz + 3);
    placeTemplate('bike', cx + 4, cz + 9, rand(0, Math.PI));
    for (let i = 0; i < 10; i++) spawnPerson(cx + rand(-11, 11), cz + rand(-11, 11));
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
    placeTemplate('picnic', cx - 11, cz - 8, rand(0, Math.PI));
    for (let i = 0; i < 6; i++) spawnPerson(cx + rand(9, 12) * (Math.random() < 0.5 ? 1 : -1), cz + rand(-12, 12));
    return;
  }
  // regular park quarter: fountain centrepiece, or statue + playground
  placeTemplate(bx === 2 && bz === 2 ? 'fountain' : 'statue', cx, cz);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rand(-0.3, 0.3);
    placeTemplate(pick(['tree', 'tree-big', 'tree-pink']), cx + Math.cos(a) * rand(7, 12), cz + Math.sin(a) * rand(7, 12));
  }
  placeTemplate('flowerbed', cx + 5, cz - 5, rand(0, Math.PI));
  if (bx === 2 && bz === 3) {
    placeTemplate('swing', cx - 6, cz + 6, rand(-0.3, 0.3));
    placeTemplate('slide', cx - 3, cz + 8, rand(0, Math.PI * 2));
    placeTemplate('picnic', cx + 7, cz + 6, rand(0, Math.PI));
  } else {
    placeTemplate('flowerbed', cx - 5, cz + 5, rand(0, Math.PI));
    placeTemplate('picnic', cx + 6, cz + 7, rand(0, Math.PI));
  }
  placeTemplate('bench', cx - 5, cz - 5, Math.PI / 4);
  placeTemplate('bench', cx + 5, cz + 5, Math.PI + Math.PI / 4);
  for (let i = 0; i < 8; i++) spawnPerson(cx + rand(-11, 11), cz + rand(-11, 11));
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
  for (let i = 0; i < 8; i++) {
    const side = randInt(0, 3);
    const t = rand(-125, 125);
    const off = rand(137, 144);
    const [x, z] = side === 0 ? [t, -off] : side === 1 ? [t, off] : side === 2 ? [-off, t] : [off, t];
    if (!ROADS.some((r) => Math.abs((side < 2 ? x : z) - r) < 7)) {
      placeTemplate('picnic', x, z, rand(0, Math.PI * 2));
      if (Math.random() < 0.6) spawnPerson(x + rand(-3, 3), z + rand(-3, 3));
    }
  }
}

function genTraffic() {
  // parked cars along road edges
  for (let i = 0; i < 40; i++) {
    const road = pick(ROADS.slice(1, -1));
    const along = rand(-120, 120);
    if (ROADS.some((r) => Math.abs(along - r) < 8)) continue;
    const side = Math.random() < 0.5 ? 1 : -1;
    const kind = Math.random() < 0.15 ? 'van' : 'sedan';
    if (Math.random() < 0.5) spawnCar(kind, along, road + side * (ROAD_HALF - 1.3), Math.PI / 2 + rand(-0.05, 0.05), null);
    else spawnCar(kind, road + side * (ROAD_HALF - 1.3), along, rand(-0.05, 0.05), null);
  }
  // moving traffic
  for (let i = 0; i < 32; i++) {
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
  // roadwork cones scattered near the kerbs
  for (let i = 0; i < 10; i++) {
    const road = pick(ROADS);
    const along = rand(-130, 130);
    if (ROADS.some((r) => Math.abs(along - r) < 8)) continue;
    const off = road + rand(-1, 1) * (ROAD_HALF - 1);
    if (Math.random() < 0.5) placeTemplate('cone', along, off);
    else placeTemplate('cone', off, along);
  }
  // traffic lights on a few intersections
  for (const rx of [-42, 42]) {
    for (const rz of [-42, 0, 42]) {
      placeTemplate('traffic', rx + ROAD_HALF + 1.2, rz + ROAD_HALF + 1.2, Math.PI * 1.25);
      placeTemplate('traffic', rx - ROAD_HALF - 1.2, rz - ROAD_HALF - 1.2, Math.PI * 0.25);
    }
  }
}

/* ============================== Pirate-isle generation ============================== */

function beachClutter(cx, cz) {
  // props on the sandy ring around a block
  const edge = 14.6;
  for (const [ox, oz] of [[-edge, -edge], [edge, -edge], [edge, edge], [-edge, edge]]) {
    if (Math.random() < 0.7) placeTemplate(Math.random() < 0.6 ? 'palm' : 'tiki', cx + ox, cz + oz);
  }
  const smalls = ['barrel', 'crate', 'anchor', 'tiki', 'bush', 'goldpile', 'barrel', 'crate'];
  for (let i = 0; i < 6; i++) {
    const side = randInt(0, 3);
    const t = rand(-10, 10);
    const [ox, oz] = side === 0 ? [t, -edge] : side === 1 ? [t, edge] : side === 2 ? [-edge, t] : [edge, t];
    placeTemplate(pick(smalls), cx + ox, cz + oz, rand(0, Math.PI * 2));
  }
}

function genPirateBlock(bx, bz) {
  const cx = BLOCK_CENTERS[bx], cz = BLOCK_CENTERS[bz];
  const d = districtGrid[bx][bz];
  beachClutter(cx, cz);

  const scatterPeople = (n, r) => {
    for (let i = 0; i < n; i++) spawnPerson(cx + rand(-r, r), cz + rand(-r, r));
  };
  const scatterPalms = (n, r) => {
    for (let i = 0; i < n; i++) {
      placeTemplate(Math.random() < 0.35 ? 'palm-big' : 'palm', cx + rand(-r, r), cz + rand(-r, r), rand(0, Math.PI * 2));
    }
  };

  if (d === 'village') {
    placeTemplate('hut' + randInt(0, 2), cx - 7, cz - 6, rand(0, Math.PI * 2));
    placeTemplate('hut' + randInt(0, 2), cx + 7, cz - 6, rand(0, Math.PI * 2));
    placeTemplate('hut' + randInt(0, 2), cx - 6, cz + 7, rand(0, Math.PI * 2));
    if (Math.random() < 0.5) placeTemplate('tent' + randInt(0, 2), cx + 7, cz + 7, rand(0, Math.PI * 2));
    else placeTemplate('campfire', cx + 7, cz + 7);
    scatterPalms(3, 12);
    for (let i = 0; i < 3; i++) placeTemplate('bush', cx + rand(-11, 11), cz + rand(-11, 11));
    placeTemplate('barrel', cx + rand(-4, 4), cz + rand(-4, 4));
    scatterPeople(3, 13);
  } else if (d === 'wrecks') {
    placeTemplate(Math.random() < 0.5 ? 'galleon-bow' : 'galleon-stern', cx - 5, cz - 4, rand(0, Math.PI * 2));
    placeTemplate('wreck-sloop', cx + 8, cz + 6, rand(0, Math.PI * 2));
    placeTemplate('rowboat', cx + rand(-12, -6), cz + rand(8, 12), rand(0, Math.PI * 2));
    placeTemplate('anchor', cx + rand(4, 10), cz + rand(-12, -8), rand(0, Math.PI * 2));
    for (let i = 0; i < 3; i++) {
      placeTemplate(pick(['barrel', 'crate', 'pallets']), cx + rand(-12, 12), cz + rand(-12, 12), rand(0, Math.PI * 2));
    }
    if (Math.random() < 0.6) placeTemplate('goldpile', cx + rand(-10, 10), cz + rand(-10, 10));
    scatterPalms(2, 13);
    scatterPeople(2, 12);
  } else if (d === 'market') {
    if ((bx + bz) % 2 === 0) placeTemplate('tavern', cx - 6, cz - 7, rand(-0.1, 0.1));
    else {
      placeTemplate('hut' + randInt(0, 2), cx - 7, cz - 7, rand(0, Math.PI * 2));
      placeTemplate('hut' + randInt(0, 2), cx + 2, cz - 8, rand(0, Math.PI * 2));
    }
    if (bx === 1 && bz === 4) {
      // market square
      for (let i = 0; i < 5; i++) {
        placeTemplate('stall' + randInt(0, 2), cx - 6 + (i % 3) * 6, cz + 4 + Math.floor(i / 3) * 6, rand(0, Math.PI));
      }
      for (let i = 0; i < 4; i++) placeTemplate(pick(['crate', 'barrel']), cx + rand(-10, 10), cz + rand(2, 11));
      scatterPeople(9, 12);
    } else {
      placeTemplate('stall' + randInt(0, 2), cx + 6, cz + 6, rand(0, Math.PI));
      placeTemplate('umbrella', cx - 3, cz + 7);
      placeTemplate('rumstack', cx - 9, cz + 9, rand(0, Math.PI));
      placeTemplate('crate', cx + rand(-4, 4), cz + rand(-2, 4));
      scatterPeople(6, 12);
    }
    scatterPalms(2, 13);
  } else if (d === 'fort') {
    if (bx === 4 && bz === 4) {
      placeTemplate('fort-tower', cx, cz - 3);
      placeTemplate('fort-wall', cx, cz + 10);
      placeTemplate('fort-wall', cx - 10, cz + 2, Math.PI / 2);
      placeTemplate('cannon', cx - 5, cz + 6, rand(0, Math.PI * 2));
      placeTemplate('cannon', cx + 6, cz + 5, rand(0, Math.PI * 2));
      placeTemplate('goldpile', cx + 8, cz - 6);
    } else {
      placeTemplate('fort-tower', cx - 7, cz - 6);
      placeTemplate('fort-wall', cx + 4, cz - 10);
      placeTemplate('cannon', cx + 7, cz + 2, rand(0, Math.PI * 2));
      placeTemplate('rumstack', cx - 4, cz + 8, rand(0, Math.PI));
      for (let i = 0; i < 3; i++) placeTemplate(pick(['barrel', 'crate']), cx + rand(-10, 10), cz + rand(4, 12));
      if (Math.random() < 0.5) placeTemplate('chest', cx + rand(-8, 8), cz + rand(6, 11), rand(0, Math.PI * 2));
    }
    scatterPeople(3, 12);
  } else if (d === 'jungle') {
    scatterPalms(7, 12);
    for (let i = 0; i < 4; i++) placeTemplate('bush', cx + rand(-12, 12), cz + rand(-12, 12));
    if (Math.random() < 0.5) placeTemplate('tent' + randInt(0, 2), cx + rand(-8, 8), cz + rand(-8, 8), rand(0, Math.PI * 2));
    if (Math.random() < 0.45) placeTemplate('goldpile', cx + rand(-9, 9), cz + rand(-9, 9));
    if (Math.random() < 0.35) placeTemplate('chest', cx + rand(-9, 9), cz + rand(-9, 9), rand(0, Math.PI * 2));
    scatterPeople(2, 12);
  } else if (d === 'skull') {
    placeTemplate('skullrock', cx, cz - 1);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      placeTemplate('tiki', cx + Math.cos(a) * 11, cz + Math.sin(a) * 11);
    }
    placeTemplate('goldpile', cx - 10, cz + 9);
    placeTemplate('chest', cx + 10, cz + 9, rand(0, Math.PI * 2));
    scatterPeople(2, 13);
  } else if (d === 'lighthouse') {
    placeTemplate('lighthouse', cx, cz - 4);
    for (let i = 0; i < 6; i++) {
      placeTemplate('grave', cx - 7 + (i % 3) * 2.4, cz + 8 + Math.floor(i / 3) * 2.8, rand(-0.25, 0.25));
    }
    placeTemplate('palm-big', cx + 9, cz + 7);
    placeTemplate('anchor', cx - 10, cz + 3, rand(0, Math.PI * 2));
    scatterPeople(2, 12);
  } else if (d === 'cove') {
    // treasure cove — X marks the spot
    placeTemplate('chest', cx, cz, rand(0, Math.PI * 2));
    placeTemplate('chest', cx + 4, cz + 2, rand(0, Math.PI * 2));
    placeTemplate('goldpile', cx - 3, cz + 3);
    placeTemplate('goldpile', cx + 2, cz - 4);
    placeTemplate('rowboat', cx - 9, cz + 8, rand(0, Math.PI * 2));
    scatterPalms(4, 12);
    placeTemplate('tiki', cx - 6, cz - 6);
    placeTemplate('tiki', cx + 6, cz + 6);
    scatterPeople(4, 11);
  } else if (d === 'lagoon') {
    // boats float on the painted lagoon; a dock reaches in from the west
    placeTemplate('dock', cx - 10, cz - 1, Math.PI / 2);
    placeTemplate('rowboat', cx + 1, cz - 1, rand(0, Math.PI * 2));
    placeTemplate('rowboat', cx + 4, cz + 3, rand(0, Math.PI * 2));
    for (let i = 0; i < 4; i++) {
      const a = rand(0, Math.PI * 2);
      placeTemplate(Math.random() < 0.5 ? 'palm' : 'palm-big', cx + Math.cos(a) * 12, cz + Math.sin(a) * 12);
    }
    placeTemplate('bench', cx - 11, cz + 6, Math.PI / 2);
    scatterPeople(4, 13);
  } else if (d === 'grove') {
    scatterPalms(8, 11);
    placeTemplate('picnic', cx + 6, cz + 6, rand(0, Math.PI));
    placeTemplate('campfire', cx - 6, cz - 5);
    scatterPeople(5, 11);
  } else if (d === 'camp') {
    placeTemplate('campfire', cx, cz);
    placeTemplate('tent0', cx - 6, cz - 4, 0.6);
    placeTemplate('tent1', cx + 6, cz - 4, -0.6);
    placeTemplate('tent2', cx - 4, cz + 6, 2.4);
    placeTemplate('rumstack', cx + 6, cz + 5, rand(0, Math.PI));
    placeTemplate('barrel', cx + 3, cz - 2);
    placeTemplate('crate', cx - 3, cz + 2, rand(0, Math.PI));
    placeTemplate('goldpile', cx + 8, cz + 8);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      placeTemplate('tiki', cx + Math.cos(a) * 8, cz + Math.sin(a) * 8);
    }
    scatterPeople(7, 10);
  }
}

function genPiratePerimeter() {
  // palm-lined shores
  for (let i = 0; i < 46; i++) {
    const side = randInt(0, 3);
    const t = rand(-142, 142);
    const off = rand(135, 145);
    const [x, z] = side === 0 ? [t, -off] : side === 1 ? [t, off] : side === 2 ? [-off, t] : [off, t];
    placeTemplate(Math.random() < 0.4 ? 'palm-big' : 'palm', x, z, rand(0, Math.PI * 2));
  }
  // docks jutting out where the trails meet the shore
  for (const r of [ROADS[1], ROADS[3], ROADS[5]]) {
    placeTemplate('dock', r, HALF - 3.4);
    placeTemplate('dock', r, -(HALF - 3.4));
    placeTemplate('dock', HALF - 3.4, r, Math.PI / 2);
    placeTemplate('dock', -(HALF - 3.4), r, Math.PI / 2);
  }
  // beached rowboats, washed-up loot and campfires along the sand
  for (let i = 0; i < 10; i++) {
    const side = randInt(0, 3);
    const t = rand(-130, 130);
    const off = rand(138, 144);
    const [x, z] = side === 0 ? [t, -off] : side === 1 ? [t, off] : side === 2 ? [-off, t] : [off, t];
    const roll = Math.random();
    if (roll < 0.4) placeTemplate('rowboat', x, z, rand(0, Math.PI * 2));
    else if (roll < 0.6) placeTemplate('chest', x, z, rand(0, Math.PI * 2));
    else if (roll < 0.8) {
      placeTemplate('campfire', x, z);
      spawnPerson(x + rand(-3, 3), z + rand(-3, 3));
    } else placeTemplate('crate', x, z, rand(0, Math.PI * 2));
  }
}

let builtTheme = null;
function buildWorld() {
  clearWorld();
  if (builtTheme !== theme) {
    buildTemplates();
    buildPersonParts();
    buildCarGeos();
    builtTheme = theme;
  }
  if (theme === 'pirate') {
    for (let bx = 0; bx < 6; bx++) for (let bz = 0; bz < 6; bz++) genPirateBlock(bx, bz);
    genPiratePerimeter();
  } else {
    for (let bx = 0; bx < 6; bx++) for (let bz = 0; bz < 6; bz++) genBlock(bx, bz);
    genPerimeter();
    genTraffic();
  }
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
    this.level = 0;              // size only changes in whole-metre jumps
    this.food = 0;               // eaten mass banked toward the next jump
    this.vr = levelR(0);         // rendered radius, eases toward r on a jump
    this.score = 0;
    this.maxR = levelR(0);
    this.alive = true;
    this.dying = false;
    this.dyingT = 0;
    this.killer = null;
    this.respawnT = 0;
    this.invuln = 0;
    this.boosts = { speed: 0, size: 0, magnet: 0 };   // seconds remaining per power-up
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

  get baseR() { return levelR(this.level); }
  get r() { return this.boosts.size > 0 ? this.baseR * 1.35 : this.baseR; }
  get area() { return Math.PI * this.r * this.r; }
  setLevel(l) { this.level = clamp(Math.round(l), 0, MAX_LEVEL); this.food = 0; this.vr = this.r; }
  setR(r) { this.setLevel(r * 2 - 3); }
  foodNeed() { return Math.PI * (this.baseR + 0.25) * 0.85; } // mass to fill the next ring
  get depth() { return Math.min(4 + this.r * 2.1, 30); }
  get speed() {
    return (this.isPlayer ? 14 : 12.8) / (1 + this.r * 0.048) * (this.boosts.speed > 0 ? 1.55 : 1);
  }

  visualR() {
    let r = this.vr;
    if (this.dying) r *= Math.max(0, 1 - this.dyingT / 0.55);
    return r;
  }

  gain(growth, points) {
    this.score += points;
    this.food += growth * (this.isPlayer ? 1 : 0.88);
    while (this.food >= this.foodNeed() && this.level < MAX_LEVEL) {
      this.food -= this.foodNeed();
      this.level++;
      this.maxR = Math.max(this.maxR, this.baseR);
      burst(this.pos.x, 0.5, this.pos.z, this.colorHex, 8, this.r * 0.8);
      if (this.isPlayer) AudioFX.pop();
    }
  }

  updateMeshes(time, dt) {
    this.vr += (this.r - this.vr) * Math.min(1, 5 * dt);
    const r = this.visualR();
    const show = this.alive && r > 0.05;
    this.pit.visible = this.rim.visible = this.glow.visible = this.label.sprite.visible = show;
    if (!show) return;
    this.pit.position.set(this.pos.x, 0, this.pos.z);
    this.pit.scale.set(r, this.depth, r);
    this.rim.position.set(this.pos.x, 0.06, this.pos.z);
    this.rim.scale.set(r, 1, r);
    this.glow.position.set(this.pos.x, 0.055, this.pos.z);
    const boosted = this.boosts.speed > 0 || this.boosts.size > 0 || this.boosts.magnet > 0;
    const pulse = 1 + Math.sin(time * (boosted ? 6 : 2.4)) * (boosted ? 0.1 : 0.05);
    this.glow.scale.set(r * pulse, 1, r * pulse);
    this.glow.material.opacity = boosted ? 0.3 + 0.1 * Math.sin(time * 8) : 0.18;
    if (this.invuln > 0) {
      this.rim.material.opacity = 0.35 + 0.6 * Math.abs(Math.sin(time * 10));
    } else this.rim.material.opacity = 0.95;
    const s = 1.1 + r * 0.3;
    this.label.sprite.position.set(this.pos.x, 2.4 + r * 0.55, this.pos.z);
    this.label.sprite.scale.set(s * 4.4, s * 1.1, 1);
    this.label.set(`${this.name} · ${3 + this.level}m`);
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

/* ============================== Power-ups ============================== */

const POWERUPS = {
  speed:  { name: 'Turbo',  icon: '⚡', color: 0xffd24a, css: '#ffd24a', dur: 8,  desc: 'speed boost!' },
  size:   { name: 'Mega',   icon: '🔺', color: 0xff4fa3, css: '#ff4fa3', dur: 10, desc: 'you swell up!' },
  magnet: { name: 'Magnet', icon: '🧲', color: 0xb26bff, css: '#b26bff', dur: 8,  desc: 'loot gets dragged in!' },
};

const matPickup = new THREE.MeshBasicMaterial({ vertexColors: true });
const PICKUP_GEOS = {
  speed: mergeGeometries([
    box(0.44, 0.5, 0.2, '#ffd24a', 0.15, 0.45, 0),
    box(0.44, 0.5, 0.2, '#ffe58a', -0.13, 0, 0),
    box(0.44, 0.5, 0.2, '#ffd24a', 0.15, -0.45, 0),
  ], false),
  size: mergeGeometries([
    cone(0.5, 0.7, 8, '#ff4fa3', 0, 0.45, 0),
    box(0.3, 0.7, 0.3, '#ff7fbc', 0, -0.25, 0),
  ], false),
  magnet: mergeGeometries([
    tint(new THREE.TorusGeometry(0.5, 0.15, 8, 16, Math.PI), '#b26bff'),
    box(0.32, 0.2, 0.3, '#e8e8ee', -0.5, -0.08, 0),
    box(0.32, 0.2, 0.3, '#e8e8ee', 0.5, -0.08, 0),
  ], false),
};
const pickupRingGeo = new THREE.RingGeometry(0.85, 1.2, 26);
pickupRingGeo.rotateX(-Math.PI / 2);
const pickupBeamGeo = new THREE.CylinderGeometry(0.32, 0.5, 5, 10, 1, true);
pickupBeamGeo.translate(0, 2.5, 0);
for (const def of Object.values(POWERUPS)) {
  def.ringMat = new THREE.MeshBasicMaterial({
    color: def.color, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  def.beamMat = new THREE.MeshBasicMaterial({
    color: def.color, transparent: true, opacity: 0.1, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
}

const pickups = [];
const PICKUP_MAX = 4;
const PICKUP_LIFE = 26;
let pickupTimer = 4;
let powerCache = '';

function spawnPickup() {
  const type = pick(Object.keys(POWERUPS));
  const def = POWERUPS[type];
  let x = 0, z = 0;
  for (let i = 0; i < 24; i++) {
    x = rand(-BOUND + 10, BOUND - 10);
    z = rand(-BOUND + 10, BOUND - 10);
    const holeClear = holes.every((h) => !h.alive || Math.hypot(h.pos.x - x, h.pos.z - z) > 18);
    const pkClear = pickups.every((p) => Math.hypot(p.grp.position.x - x, p.grp.position.z - z) > 24);
    if (holeClear && pkClear) break;
  }
  const grp = new THREE.Group();
  const icon = new THREE.Mesh(PICKUP_GEOS[type], matPickup);
  icon.position.y = 1.55;
  const ring = new THREE.Mesh(pickupRingGeo, def.ringMat);
  ring.position.y = 0.08;
  ring.renderOrder = 3;
  const beam = new THREE.Mesh(pickupBeamGeo, def.beamMat);
  grp.add(icon, ring, beam);
  grp.position.set(x, 0, z);
  scene.add(grp);
  pickups.push({ type, grp, icon, ring, life: PICKUP_LIFE, phase: rand(0, 10) });
}

function removePickup(i) {
  scene.remove(pickups[i].grp);
  pickups.splice(i, 1);
}

function clearPickups() {
  while (pickups.length) removePickup(pickups.length - 1);
  pickupTimer = 4;
}

function collectPickup(hole, p, i) {
  const def = POWERUPS[p.type];
  hole.boosts[p.type] = Math.max(hole.boosts[p.type], def.dur);
  burst(p.grp.position.x, 1, p.grp.position.z, def.color, 10, 1.4);
  if (hole.isPlayer) {
    AudioFX.power();
    toast(`${def.icon} ${def.name} — ${def.desc}`, def.css, true);
  }
  removePickup(i);
}

function updatePickups(dt, time) {
  pickupTimer -= dt;
  if (pickupTimer <= 0 && pickups.length < PICKUP_MAX) {
    spawnPickup();
    pickupTimer = rand(5, 10);
  }
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.life -= dt;
    if (p.life <= 0) { removePickup(i); continue; }
    p.icon.rotation.y += dt * 2.4;
    p.icon.position.y = 1.55 + Math.sin(time * 2.2 + p.phase) * 0.22;
    p.icon.visible = p.life > 3 || Math.sin(time * 12) > -0.2;  // blink before fading out
    const pulse = 1 + Math.sin(time * 3 + p.phase) * 0.12;
    p.ring.scale.set(pulse, 1, pulse);
    for (const h of holes) {
      if (!h.alive || h.dying) continue;
      const d = Math.hypot(h.pos.x - p.grp.position.x, h.pos.z - p.grp.position.z);
      if (d < h.r * 0.92 + 0.7) { collectPickup(h, p, i); break; }
    }
  }
}

function updateBoosts(dt) {
  for (const h of holes) {
    for (const k in h.boosts) if (h.boosts[k] > 0) h.boosts[k] = Math.max(0, h.boosts[k] - dt);
  }
}

/* ============================== HUD / DOM ============================== */

const $ = (id) => document.getElementById(id);
const hudScore = $('stat-score'), hudSize = $('stat-size'), hudTier = $('stat-tier'),
  hudLives = $('stat-lives'), hudTime = $('stat-time'), comboBadge = $('combo-badge'),
  boardList = $('board-list'), cityEaten = $('city-eaten'), sizeBar = $('size-bar'),
  toastBox = $('toasts'), minimap = $('minimap'), muteBtn = $('mute-btn'),
  powerBadges = $('powerup-badges');
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
  const tiers = tiersNow();
  let t = tiers[0];
  for (const tier of tiers) if (r >= tier.r) t = tier;
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
  const pct = Math.round(100 * eatenPropCount / Math.max(1, totalPropCount));
  cityEaten.textContent = theme === 'pirate' ? `Isles plundered: ${pct}%` : `City devoured: ${pct}%`;
}

let minimapT = 0;
function drawMinimap() {
  const w = minimap.width;
  const s = w / WORLD;
  const mp = (v) => (v + HALF) * s;
  minimapCtx.clearRect(0, 0, w, w);
  minimapCtx.fillStyle = theme === 'pirate' ? 'rgba(26,20,8,0.72)' : 'rgba(10,10,20,0.75)';
  minimapCtx.fillRect(0, 0, w, w);
  minimapCtx.strokeStyle = theme === 'pirate' ? 'rgba(160,140,90,0.45)' : 'rgba(90,90,120,0.5)';
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
  for (const pk of pickups) {
    minimapCtx.fillStyle = POWERUPS[pk.type].css;
    minimapCtx.fillRect(mp(pk.grp.position.x) - 2, mp(pk.grp.position.z) - 2, 4, 4);
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

function holeEatsProps(hole, dt) {
  if (!hole.alive || hole.dying) return;
  const r = hole.r;
  const capacity = r * 0.8;
  const reach = r * 0.92 + 0.25;
  const magnet = hole.boosts.magnet > 0;
  const pullR = r * 4 + 9;
  for (const p of props) {
    if (!p.alive || p.falling) continue;
    if (p.eatR > capacity) continue;
    const dx = p.root.position.x - hole.pos.x;
    const dz = p.root.position.z - hole.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < reach * reach) { startFall(p, hole); continue; }
    if (magnet && d2 < pullR * pullR) {
      const d = Math.sqrt(d2);
      const pull = (1 - d / pullR) * (13 + r * 1.5);
      p.root.position.x -= dx / d * pull * dt;
      p.root.position.z -= dz / d * pull * dt;
    }
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
  small.boosts.speed = small.boosts.size = small.boosts.magnet = 0;
  big.gain(small.area * 0.55 + small.food * 0.5, 150 + Math.round(small.score * 0.25));
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
  // grab a nearby power-up
  if (Math.random() < 0.55) {
    let bp = null, bd = 46;
    for (const pk of pickups) {
      const d = Math.hypot(pk.grp.position.x - h.pos.x, pk.grp.position.z - h.pos.z);
      if (d < bd) { bd = d; bp = pk; }
    }
    if (bp) {
      h.mode = 'feed';
      h.target = null;
      h.targetPos.set(bp.grp.position.x, 0, bp.grp.position.z);
      return;
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
  const npcs = [...npcPool()].sort(() => Math.random() - 0.5).slice(0, 5);
  npcs.forEach((n, i) => {
    const h = new Hole(n.name, n.color, false);
    const s = shuffled[(i + 1) % shuffled.length];
    h.pos.set(s[0] + rand(-8, 8), 0, s[1] + rand(-8, 8));
    holes.push(h);
  });
}

function spawnMenuHoles() {
  const npcs = [...npcPool()].sort(() => Math.random() - 0.5).slice(0, 5);
  npcs.forEach((n) => {
    const h = new Hole(n.name, n.color, false);
    h.pos.set(rand(-110, 110), 0, rand(-110, 110));
    h.setLevel(randInt(0, 3));
    holes.push(h);
  });
}

function startGame() {
  AudioFX.ensure();
  AudioFX.start();
  buildWorld();
  spawnHoles();
  playerLives = START_LIVES;
  playerTier = tiersNow()[0];
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
    ? (rank === 1
      ? (theme === 'pirate'
        ? 'The isles are yours — every scallywag ate your wake.'
        : 'The city is yours. Every other hole ate your dust.')
      : `The round is over — you finished ${rank}${suffix}.`)
    : `${detail} gulped you down and you're out of lives.`;
  $('final-score').textContent = player.score;
  $('final-size').textContent = Math.round(player.maxR * 2) + 'm';
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
  player.setLevel(Math.floor(player.level * 0.5));
  player.dying = false;
  player.dyingT = 0;
  player.alive = true;
  const s = safeSpot(player.r);
  player.pos.set(s.x, 0, s.z);
  player.vel.set(0, 0, 0);
  player.invuln = 3.5;
  playerTier = tierFor(player.baseR);
  toast(`${playerLives + 1 > 1 ? '' : 'Last life — '}back in the fight!`, '#00e5ff');
}

$('btn-start').addEventListener('click', startGame);
$('btn-restart').addEventListener('click', startGame);

/* ---- starting-area selection ---- */
function buildEnvironment() {
  applyAtmosphere();
  buildSky();
  buildSea();
  buildGround();
}

function syncThemeCards() {
  document.querySelectorAll('.theme-card').forEach((b) => {
    b.classList.toggle('theme-card--selected', b.dataset.theme === theme);
  });
}

function setTheme(t) {
  if (t === theme || state === 'play') return;
  theme = t;
  localStorage.setItem('hole-theme', t);
  syncThemeCards();
  buildEnvironment();
  buildWorld();
  spawnMenuHoles();
  state = 'menu';           // preview orbit behind whichever overlay is open
  updateBoard();
}

document.querySelectorAll('.theme-card').forEach((b) => {
  b.addEventListener('click', () => setTheme(b.dataset.theme));
});

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
          h.setLevel(0);
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
    holeEatsProps(h, dt);
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
  const r = player ? player.vr : START_RADIUS;
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
            h.setLevel(0);
            h.pos.set(rand(-110, 110), 0, rand(-110, 110));
            h.alive = true;
          }
          continue;
        }
        npcMove(h, dt);
        holeEatsProps(h, dt);
      }
      if (state === 'menu') holeVsHole();
    }

    updateBoosts(dt);
    updatePickups(dt, time);
    updatePeople(dt, time);
    updateCars(dt);
    for (const p of props) if (p.falling) updateFalling(p, dt);
    updateParticles(dt);
    for (const h of holes) h.updateMeshes(time, dt);
    updateHoleUniforms();
  }

  updateCamera(dt, time);
  updateSea(time);

  // HUD
  if (state === 'play' && player) {
    const tier = tierFor(player.baseR);
    if (tier !== playerTier) {
      if (tiersNow().indexOf(tier) > tiersNow().indexOf(playerTier)) {
        toast(`You are now a ${tier.name}!`, '#00e5ff', true);
        AudioFX.tier();
      }
      playerTier = tier;
    }
    hudScore.textContent = player.score;
    hudSize.textContent = (3 + player.level) + 'm';
    sizeBar.style.width = Math.min(100, 100 * player.food / player.foodNeed()).toFixed(0) + '%';
    hudTier.textContent = playerTier.name;
    hudTime.textContent = fmtTime(roundTime);
    hudTime.classList.toggle('hud-value--warn', roundTime < 20);
    if (combo.mult > 1) {
      comboBadge.textContent = `COMBO x${combo.mult}`;
      comboBadge.classList.add('combo--on');
    } else {
      comboBadge.classList.remove('combo--on');
    }
    const badges = [];
    for (const k in player.boosts) {
      if (player.boosts[k] > 0) {
        const def = POWERUPS[k];
        badges.push(`<span class="powerup-badge" style="color:${def.css}">${def.icon} ${def.name} · ${Math.ceil(player.boosts[k])}s</span>`);
      }
    }
    const badgeHtml = badges.join('');
    if (badgeHtml !== powerCache) { powerCache = badgeHtml; powerBadges.innerHTML = badgeHtml; }
  } else if (powerCache) {
    powerCache = '';
    powerBadges.innerHTML = '';
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

buildEnvironment();
buildWorld();
spawnMenuHoles();
syncThemeCards();
updateBoard();
animate();

/* debug/testing handle */
window.__hole = {
  get player() { return player; },
  get holes() { return holes; },
  get props() { return props; },
  get state() { return state; },
  get pickups() { return pickups; },
  get theme() { return theme; },
  setTheme,
};
