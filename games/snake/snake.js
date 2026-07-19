// Snake Arena — a single-player slither.io-style game with AI opponents.
// Steer the head with the mouse; the body follows as a chain of segments.

const ARENA_RADIUS = 1700;
const AI_COUNT = 9;
const FOOD_TARGET = 420;      // orbs kept alive in the arena
const START_LEN = 16;         // starting number of body segments
const MIN_LEN = 10;
const BASE_SPEED = 2.7;       // px per 60fps-frame
const BOOST_SPEED = 4.7;
const TURN_RATE = 0.14;       // max heading change per frame (radians)
const AI_NAMES = [
  'Viper', 'Slinky', 'Coil', 'Fang', 'Noodle', 'Python',
  'Mamba', 'Wriggle', 'Boa', 'Zigzag', 'Hiss', 'Sidewind',
];

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const miniCanvas = document.getElementById('minimap');
const miniCtx = miniCanvas.getContext('2d');

const el = {
  length: document.getElementById('stat-length'),
  rank: document.getElementById('stat-rank'),
  lbList: document.getElementById('leaderboard-list'),
  startOverlay: document.getElementById('start-overlay'),
  gameoverOverlay: document.getElementById('gameover-overlay'),
  finalLength: document.getElementById('final-length'),
  finalRank: document.getElementById('final-rank'),
  btnStart: document.getElementById('btn-start'),
  btnRestart: document.getElementById('btn-restart'),
};

let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
}
window.addEventListener('resize', resize);
resize();

// ---- Utility ----
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const TAU = Math.PI * 2;

// Shortest signed angular difference from a to b, in (-PI, PI].
function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// ---- Game state ----
let snakes = [];
let food = [];
let player = null;
let running = false;
let bestRank = AI_COUNT + 1;
const mouse = { x: 0, y: 0 };   // screen-space
let boosting = false;

// ---- Snake ----
function radiusFor(len) {
  return 7 + Math.min(len - START_LEN, 340) * 0.05;
}

function makeSnake(opts) {
  const len = opts.len ?? START_LEN;
  const s = {
    isPlayer: !!opts.isPlayer,
    name: opts.name,
    hue: opts.hue,
    alive: true,
    x: opts.x,
    y: opts.y,
    angle: opts.angle ?? rand(0, TAU),
    targetLen: len,
    radius: radiusFor(len),
    segments: [],
    boosting: false,
    boostDrain: 0,
    // AI state
    wander: rand(0, TAU),
    boostTimer: 0,
  };
  for (let i = 0; i < len; i++) {
    s.segments.push({ x: opts.x, y: opts.y });
  }
  return s;
}

function spawnSnake(isPlayer, name, hue) {
  // Spawn away from the arena edge and from other snakes.
  let x = 0, y = 0;
  for (let tries = 0; tries < 30; tries++) {
    const a = rand(0, TAU);
    const r = rand(0, ARENA_RADIUS * 0.7);
    x = Math.cos(a) * r;
    y = Math.sin(a) * r;
    let ok = true;
    for (const other of snakes) {
      if (!other.alive) continue;
      if (Math.hypot(other.x - x, other.y - y) < 300) { ok = false; break; }
    }
    if (ok) break;
  }
  // Face roughly toward the arena centre so a fresh snake doesn't wall itself.
  const angle = Math.atan2(-y, -x) + rand(-0.6, 0.6);
  return makeSnake({ isPlayer, name, hue, x, y, angle });
}

// ---- Food ----
function makeFood(x, y, value, hue) {
  return {
    x, y,
    value,
    r: 4 + value * 1.6,
    hue: hue ?? rand(0, 360),
    pulse: rand(0, TAU),
  };
}

function spawnFood() {
  const a = rand(0, TAU);
  const r = ARENA_RADIUS * Math.sqrt(Math.random());
  food.push(makeFood(Math.cos(a) * r, Math.sin(a) * r, 1));
}

function scatterDeath(s) {
  // Convert a dead snake's body into a trail of edible orbs.
  const step = Math.max(1, Math.floor(s.segments.length / 40));
  for (let i = 0; i < s.segments.length; i += step) {
    const seg = s.segments[i];
    food.push(makeFood(
      seg.x + rand(-6, 6),
      seg.y + rand(-6, 6),
      rand(1.5, 3),
      s.hue
    ));
  }
}

// ---- Setup ----
function reset() {
  snakes = [];
  food = [];
  bestRank = AI_COUNT + 1;

  player = spawnSnake(true, 'You', 185);
  snakes.push(player);

  for (let i = 0; i < AI_COUNT; i++) {
    snakes.push(spawnSnake(false, AI_NAMES[i % AI_NAMES.length], rand(0, 360)));
  }

  for (let i = 0; i < FOOD_TARGET; i++) spawnFood();
}

// ---- Update ----
function updateSnakeBody(s, speed) {
  // Move the head.
  s.x += Math.cos(s.angle) * speed;
  s.y += Math.sin(s.angle) * speed;

  // Grow / shrink the segment chain toward the target length.
  s.radius = radiusFor(s.targetLen);
  while (s.segments.length < s.targetLen) {
    const tail = s.segments[s.segments.length - 1];
    s.segments.push({ x: tail.x, y: tail.y });
  }
  while (s.segments.length > s.targetLen && s.segments.length > MIN_LEN) {
    s.segments.pop();
  }

  // Follow-the-leader: each segment trails the one ahead at a fixed gap.
  const gap = s.radius * 0.5;
  let px = s.x, py = s.y;
  for (const seg of s.segments) {
    const dx = seg.x - px;
    const dy = seg.y - py;
    const d = Math.hypot(dx, dy) || 0.0001;
    if (d > gap) {
      seg.x = px + (dx / d) * gap;
      seg.y = py + (dy / d) * gap;
    }
    px = seg.x;
    py = seg.y;
  }
}

function steerToward(s, desired, f) {
  const diff = angleDiff(s.angle, desired);
  s.angle += clamp(diff, -TURN_RATE * f, TURN_RATE * f);
}

function updatePlayer(f) {
  // Aim the head toward the mouse cursor.
  const desired = Math.atan2(mouse.y - H / 2, mouse.x - W / 2);
  steerToward(player, desired, f);

  let speed = BASE_SPEED;
  player.boosting = boosting && player.targetLen > MIN_LEN + 4;
  if (player.boosting) {
    speed = BOOST_SPEED;
    player.boostDrain += f;
    if (player.boostDrain >= 8) {       // shed mass while boosting
      player.boostDrain = 0;
      player.targetLen -= 1;
      const tail = player.segments[player.segments.length - 1];
      food.push(makeFood(tail.x, tail.y, 1, player.hue));
    }
  }
  updateSnakeBody(player, speed * f);
}

function nearestFood(s, range) {
  let best = null, bestD = range * range;
  // Look ahead of the snake so it chases food it can actually reach.
  const fx = s.x + Math.cos(s.angle) * 60;
  const fy = s.y + Math.sin(s.angle) * 60;
  for (const item of food) {
    const dx = item.x - fx, dy = item.y - fy;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = item; }
  }
  return best;
}

// Is there a snake body close ahead of this AI? Returns an avoidance angle.
function threatAvoidance(s) {
  const look = s.radius + 55;
  const hx = s.x + Math.cos(s.angle) * look;
  const hy = s.y + Math.sin(s.angle) * look;
  for (const other of snakes) {
    if (!other.alive) continue;
    const skip = other === s ? 6 : 0; // ignore own neck
    for (let i = skip; i < other.segments.length; i += 2) {
      const seg = other.segments[i];
      const dx = seg.x - hx, dy = seg.y - hy;
      if (dx * dx + dy * dy < (other.radius + s.radius + 14) ** 2) {
        // Steer away from the obstacle.
        const away = Math.atan2(hy - seg.y, hx - seg.x);
        return away;
      }
    }
  }
  return null;
}

function updateAI(s, f) {
  let desired = s.angle;

  const threat = threatAvoidance(s);
  if (threat !== null) {
    desired = threat;
    s.boosting = false;
  } else {
    // Avoid the arena wall.
    const distC = Math.hypot(s.x, s.y);
    if (distC > ARENA_RADIUS - 220) {
      desired = Math.atan2(-s.y, -s.x);
    } else {
      const target = nearestFood(s, 520);
      if (target) {
        desired = Math.atan2(target.y - s.y, target.x - s.x);
      } else {
        s.wander += rand(-0.25, 0.25) * f;
        desired = s.wander;
      }
    }

    // Occasional burst of boost when healthy.
    s.boostTimer -= f;
    if (s.boostTimer <= 0) {
      s.boosting = Math.random() < 0.25 && s.targetLen > 30;
      s.boostTimer = rand(30, 120);
    }
  }

  steerToward(s, desired, f);

  let speed = BASE_SPEED;
  if (s.boosting && s.targetLen > MIN_LEN + 4) {
    speed = BOOST_SPEED;
    s.boostDrain += f;
    if (s.boostDrain >= 10) {
      s.boostDrain = 0;
      s.targetLen -= 1;
      const tail = s.segments[s.segments.length - 1];
      food.push(makeFood(tail.x, tail.y, 1, s.hue));
    }
  }
  updateSnakeBody(s, speed * f);
}

function eatFood(s) {
  const reach = s.radius + 14;
  for (let i = food.length - 1; i >= 0; i--) {
    const item = food[i];
    const dx = item.x - s.x, dy = item.y - s.y;
    if (dx * dx + dy * dy < (reach + item.r) ** 2) {
      s.targetLen += Math.ceil(item.value * 1.5);
      food.splice(i, 1);
    }
  }
}

function checkCollisions() {
  const dead = [];
  for (const s of snakes) {
    if (!s.alive) continue;

    // Arena wall.
    if (Math.hypot(s.x, s.y) > ARENA_RADIUS) {
      dead.push(s);
      continue;
    }

    // Head vs. every other snake's body.
    for (const other of snakes) {
      if (!other.alive || other === s) continue;
      const hitDist = (s.radius + other.radius) * 0.85;
      const hitSq = hitDist * hitDist;
      for (let i = 0; i < other.segments.length; i += 1) {
        const seg = other.segments[i];
        const dx = seg.x - s.x, dy = seg.y - s.y;
        if (dx * dx + dy * dy < hitSq) {
          dead.push(s);
          break;
        }
      }
      if (dead.includes(s)) break;
    }
  }

  for (const s of dead) {
    s.alive = false;
    scatterDeath(s);
  }
}

function respawnAI() {
  const aliveAI = snakes.filter((s) => !s.isPlayer && s.alive).length;
  const needed = AI_COUNT - aliveAI;
  for (let i = 0; i < needed; i++) {
    // Remove a dead AI slot and add a fresh one.
    const idx = snakes.findIndex((s) => !s.isPlayer && !s.alive);
    if (idx >= 0) snakes.splice(idx, 1);
    snakes.push(spawnSnake(false, AI_NAMES[Math.floor(rand(0, AI_NAMES.length))], rand(0, 360)));
  }
}

function update(f) {
  if (player.alive) updatePlayer(f);
  for (const s of snakes) {
    if (s.alive && !s.isPlayer) updateAI(s, f);
  }

  for (const s of snakes) {
    if (s.alive) eatFood(s);
  }

  checkCollisions();

  // Keep food topped up.
  while (food.length < FOOD_TARGET) spawnFood();

  if (player.alive) {
    respawnAI();
    updateHud();
  } else if (running) {
    endGame();
  }
}

// ---- Rendering ----
function view() {
  // Zoom out gently as the player grows.
  const zoom = clamp(1.05 - (player.radius - 7) * 0.02, 0.62, 1.05);
  return {
    zoom,
    ox: W / 2 - player.x * zoom,
    oy: H / 2 - player.y * zoom,
  };
}

function drawSnake(s, v) {
  const r = s.radius * v.zoom;
  // Body — draw tail-first so the head sits on top.
  for (let i = s.segments.length - 1; i >= 0; i--) {
    const seg = s.segments[i];
    const sx = seg.x * v.zoom + v.ox;
    const sy = seg.y * v.zoom + v.oy;
    if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) continue;
    const light = 55 - (i / s.segments.length) * 12;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, TAU);
    ctx.fillStyle = `hsl(${s.hue}, 85%, ${light}%)`;
    ctx.fill();
  }

  // Head.
  const hx = s.x * v.zoom + v.ox;
  const hy = s.y * v.zoom + v.oy;
  ctx.save();
  ctx.shadowColor = `hsl(${s.hue}, 90%, 60%)`;
  ctx.shadowBlur = (s.boosting ? 24 : 12) * v.zoom;
  ctx.beginPath();
  ctx.arc(hx, hy, r * 1.05, 0, TAU);
  ctx.fillStyle = `hsl(${s.hue}, 90%, 62%)`;
  ctx.fill();
  ctx.restore();

  // Eyes.
  const eyeA = r * 0.45;
  const perp = s.angle + Math.PI / 2;
  for (const dir of [-1, 1]) {
    const ex = hx + Math.cos(s.angle) * r * 0.35 + Math.cos(perp) * eyeA * dir;
    const ey = hy + Math.sin(s.angle) * r * 0.35 + Math.sin(perp) * eyeA * dir;
    ctx.beginPath();
    ctx.arc(ex, ey, r * 0.3, 0, TAU);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + Math.cos(s.angle) * r * 0.14, ey + Math.sin(s.angle) * r * 0.14, r * 0.15, 0, TAU);
    ctx.fillStyle = '#12121a';
    ctx.fill();
  }
}

function render() {
  const v = view();

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, W, H);

  // Arena grid.
  const grid = 80 * v.zoom;
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const startX = v.ox % grid;
  const startY = v.oy % grid;
  for (let x = startX; x < W; x += grid) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = startY; y < H; y += grid) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();

  // Arena boundary.
  ctx.beginPath();
  ctx.arc(v.ox, v.oy, ARENA_RADIUS * v.zoom, 0, TAU);
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Food.
  const t = performance.now() * 0.004;
  for (const item of food) {
    const fx = item.x * v.zoom + v.ox;
    const fy = item.y * v.zoom + v.oy;
    if (fx < -20 || fx > W + 20 || fy < -20 || fy > H + 20) continue;
    const pr = (item.r + Math.sin(t + item.pulse) * 0.8) * v.zoom;
    ctx.beginPath();
    ctx.arc(fx, fy, pr, 0, TAU);
    ctx.fillStyle = `hsl(${item.hue}, 90%, 62%)`;
    ctx.fill();
  }

  // Snakes — others first, player last so it renders on top.
  for (const s of snakes) {
    if (s.alive && !s.isPlayer) drawSnake(s, v);
  }
  if (player.alive) drawSnake(player, v);

  drawMinimap();
}

function drawMinimap() {
  const size = miniCanvas.width;
  const scale = size / (ARENA_RADIUS * 2);
  const cx = size / 2, cy = size / 2;
  miniCtx.clearRect(0, 0, size, size);

  miniCtx.beginPath();
  miniCtx.arc(cx, cy, ARENA_RADIUS * scale, 0, TAU);
  miniCtx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
  miniCtx.lineWidth = 1.5;
  miniCtx.stroke();

  for (const s of snakes) {
    if (!s.alive) continue;
    miniCtx.beginPath();
    miniCtx.arc(cx + s.x * scale, cy + s.y * scale, s.isPlayer ? 3.5 : 2.2, 0, TAU);
    miniCtx.fillStyle = s.isPlayer ? '#00e5ff' : `hsl(${s.hue}, 85%, 60%)`;
    miniCtx.fill();
  }
}

// ---- HUD / leaderboard ----
function ranked() {
  return [...snakes]
    .filter((s) => s.alive)
    .sort((a, b) => b.targetLen - a.targetLen);
}

function updateHud() {
  const board = ranked();
  const rank = board.indexOf(player) + 1;
  bestRank = Math.min(bestRank, rank);

  el.length.textContent = player.targetLen;
  el.rank.textContent = `${rank}/${board.length}`;

  el.lbList.innerHTML = '';
  for (const s of board.slice(0, 5)) {
    const li = document.createElement('li');
    if (s.isPlayer) li.className = 'is-player';
    li.innerHTML =
      `<span class="lb-name">${s.name}</span>` +
      `<span class="lb-score">${s.targetLen}</span>`;
    el.lbList.appendChild(li);
  }
}

// ---- Loop ----
let lastTime = 0;
function loop(now) {
  if (!running) return;
  const dt = now - lastTime;
  lastTime = now;
  const f = clamp(dt / 16.667, 0.2, 2.5);
  update(f);
  render();
  requestAnimationFrame(loop);
}

// ---- Game flow ----
function startGame() {
  reset();
  el.startOverlay.classList.add('overlay--hidden');
  el.gameoverOverlay.classList.add('overlay--hidden');
  running = true;
  lastTime = performance.now();
  updateHud();
  requestAnimationFrame(loop);
}

function endGame() {
  running = false;
  el.finalLength.textContent = player.targetLen;
  el.finalRank.textContent = `#${bestRank}`;
  el.gameoverOverlay.classList.remove('overlay--hidden');
}

// ---- Input ----
window.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});
window.addEventListener('mousedown', (e) => { if (e.button === 0) boosting = true; });
window.addEventListener('mouseup', (e) => { if (e.button === 0) boosting = false; });
window.addEventListener('keydown', (e) => { if (e.code === 'Space') boosting = true; });
window.addEventListener('keyup', (e) => { if (e.code === 'Space') boosting = false; });
window.addEventListener('blur', () => { boosting = false; });
// Touch support: steer toward the touch point, hold to boost.
window.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  mouse.x = t.clientX;
  mouse.y = t.clientY;
  boosting = true;
  e.preventDefault();
}, { passive: false });
window.addEventListener('touchend', () => { boosting = false; });

el.btnStart.addEventListener('click', startGame);
el.btnRestart.addEventListener('click', startGame);

// Center the initial cursor target so the player doesn't lurch on spawn.
mouse.x = W / 2;
mouse.y = H / 2;
