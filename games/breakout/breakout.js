// Neon Breakout — smash symmetrical neon brick walls with paddle and ball.
// Levels are auto-generated and mirrored around the centre line; destroyed
// bricks have a random chance to drop powerups (and the occasional
// powerdown). Higher levels pack more, smaller bricks and faster balls.
//
// All layout constants are in "reference pixels" (an 800px-tall screen)
// and scaled to the real viewport so the game feels the same anywhere.

const REF_H = 800;
const BALL_R = 9;
const PADDLE_W = 132;
const PADDLE_H = 15;
const PADDLE_Y = 74;          // ref-px above bottom
const BALL_SPEED = 430;       // ref-px/s at level 1, rises per level
const PICKUP_VY = 175;        // ref-px/s fall speed of pickups
const PICKUP_R = 15;
const LASER_SPEED = 760;
const DROP_CHANCE = 0.22;     // chance a destroyed brick drops a pickup
const ROW_HUES = [330, 275, 190, 120, 25];   // pink, purple, cyan, green, orange
const MAX_BALLS = 12;

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const el = {
  score: document.getElementById('stat-score'),
  level: document.getElementById('stat-level'),
  balls: document.getElementById('stat-balls'),
  best: document.getElementById('stat-best'),
  startOverlay: document.getElementById('start-overlay'),
  gameoverOverlay: document.getElementById('gameover-overlay'),
  gameoverTitle: document.getElementById('gameover-title'),
  gameoverMessage: document.getElementById('gameover-message'),
  finalScore: document.getElementById('final-score'),
  finalLevel: document.getElementById('final-level'),
  finalBest: document.getElementById('final-best'),
  btnStart: document.getElementById('btn-start'),
  btnRestart: document.getElementById('btn-restart'),
};

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const TAU = Math.PI * 2;

let W = 0, H = 0, DPR = 1, S = 1;
let FX = 0, FW = 0;           // playfield left edge and width
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  S = H / REF_H;
  FW = Math.min(W - 16, H * 0.95, 920);
  FX = (W - FW) / 2;
  if (bricks.length) layoutBricks();
  if (paddle) {
    paddle.y = H - PADDLE_Y * S;
    paddle.x = clamp(paddle.x, FX, FX + FW - paddleWidth());
  }
}

// ---- State ----
let mode = 'idle';            // idle | serve | play | over
let paddle = null;
let balls = [];
let bricks = [];
let grid = null;              // level layout, kept so bricks can re-layout on resize
let pickups = [];
let lasers = [];
let particles = [];
let level = 1;
let lives = 3;
let score = 0;
let best = Number(localStorage.getItem('neonbreakout-best')) || 0;
let shake = 0;
let banner = null;            // { text, sub, life }
let laserCooldown = 0;
let newRecord = false;
const fx = { wide: 0, shrink: 0, laser: 0, slow: 0, fast: 0, pierce: 0, boom: 0 };

el.best.textContent = best;

function paddleWidth() {
  let w = PADDLE_W * S;
  if (fx.wide > 0) w *= 1.55;
  if (fx.shrink > 0) w *= 0.6;
  return w;
}

function ballSpeed() {
  let v = (BALL_SPEED + Math.min(level - 1, 10) * 26) * S;
  if (fx.slow > 0) v *= 0.72;
  if (fx.fast > 0) v *= 1.32;
  return v;
}

// ---- Level generation ----
// Levels are mirrored around the centre column so every layout is
// symmetrical. Higher levels get more columns (smaller bricks), more rows,
// tougher multi-hit bricks and a few unbreakable steel bricks.
function generateLevel(n) {
  const cols = Math.min(9 + Math.floor((n - 1) / 2) * 2, 19);
  const rows = Math.min(5 + Math.floor((n - 1) / 3), 9);
  const half = Math.ceil(cols / 2);
  const cells = [];   // { cx, cy, hp, steel }

  // pick a pattern family for this level
  const style = Math.floor(rand(0, 4));
  const density = rand(0.6, 0.85);
  const freq = rand(0.5, 1.3);
  const phase = rand(0, TAU);
  const midX = (cols - 1) / 2;
  const midY = (rows - 1) / 2;
  const ringW = rand(1.4, 2.4);

  const p2 = Math.min(0.06 + (n - 1) * 0.05, 0.4);          // 2-hit bricks
  const p3 = n >= 4 ? Math.min((n - 3) * 0.04, 0.22) : 0;   // 3-hit bricks
  const pSteel = n >= 3 ? Math.min(0.02 + (n - 3) * 0.012, 0.08) : 0;
  let steelPairs = 0;
  const maxSteelPairs = Math.min(1 + Math.floor(n / 3), 4);

  const filled = [];
  for (let y = 0; y < rows; y++) filled.push(new Array(cols).fill(false));

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < half; x++) {
      let fill;
      const dx = Math.abs(x - midX) / (midX || 1);
      const dy = Math.abs(y - midY) / (midY || 1);
      switch (style) {
        case 0:   // scattered noise
          fill = Math.random() < density;
          break;
        case 1:   // diamond rings
          fill = ((dx + dy) * rows) % (ringW * 2) < ringW || Math.random() < 0.15;
          break;
        case 2:   // checker weave
          fill = (x + y) % 2 === 0 || Math.random() < 0.35;
          break;
        default:  // sine-wave skyline
          fill = y <= midY + Math.sin(x * freq + phase) * rows * 0.4 || Math.random() < 0.12;
          break;
      }
      filled[y][x] = filled[y][cols - 1 - x] = !!fill;
    }
  }

  // guarantee a decent wall
  let count = 0;
  for (const row of filled) for (const f of row) if (f) count++;
  while (count < rows * cols * 0.4) {
    const x = Math.floor(rand(0, half));
    const y = Math.floor(rand(0, rows));
    if (!filled[y][x]) {
      filled[y][x] = filled[y][cols - 1 - x] = true;
      count += x === cols - 1 - x ? 1 : 2;
    }
  }

  // assign brick types on the left half, mirrored, so types are symmetrical too
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < half; x++) {
      if (!filled[y][x]) continue;
      let hp = 1, steel = false;
      const roll = Math.random();
      if (roll < pSteel && steelPairs < maxSteelPairs && y < rows - 1) {
        steel = true;
        steelPairs++;
      } else if (roll < pSteel + p3) {
        hp = 3;
      } else if (roll < pSteel + p3 + p2) {
        hp = 2;
      }
      cells.push({ cx: x, cy: y, hp, steel });
      const mx = cols - 1 - x;
      if (mx !== x) cells.push({ cx: mx, cy: y, hp, steel });
    }
  }

  return { cols, rows, cells };
}

function layoutBricks() {
  const { cols, rows } = grid;
  const gap = 4 * S;
  const top = 86 * S;
  const bw = (FW - gap * (cols + 1)) / cols;
  const bh = clamp((H * 0.36 - gap * rows) / rows, 16 * S, 30 * S);
  for (const b of bricks) {
    b.x = FX + gap + b.cx * (bw + gap);
    b.y = top + b.cy * (bh + gap);
    b.w = bw;
    b.h = bh;
  }
}

function buildLevel(n) {
  grid = generateLevel(n);
  bricks = grid.cells.map((c) => ({
    cx: c.cx, cy: c.cy,
    x: 0, y: 0, w: 0, h: 0,
    hp: c.steel ? Infinity : c.hp,
    maxHp: c.hp,
    steel: c.steel,
    hue: c.steel ? 220 : ROW_HUES[c.cy % ROW_HUES.length],
    flash: 0,
  }));
  layoutBricks();
  pickups = [];
  lasers = [];
  for (const k in fx) fx[k] = 0;
}

// ---- Ball / paddle helpers ----
function serveBall() {
  balls = [{
    x: paddle.x + paddleWidth() / 2,
    y: paddle.y - BALL_R * S - 2,
    vx: 0, vy: 0,
    stuck: true,
    trail: [],
  }];
  mode = 'serve';
}

function launchBall() {
  for (const b of balls) {
    if (!b.stuck) continue;
    b.stuck = false;
    const a = rand(-0.35, 0.35) - Math.PI / 2;
    const v = ballSpeed();
    b.vx = Math.cos(a) * v;
    b.vy = Math.sin(a) * v;
  }
  mode = 'play';
}

function startGame() {
  score = 0;
  level = 1;
  lives = 3;
  shake = 0;
  particles = [];
  newRecord = false;
  paddle = { x: 0, y: H - PADDLE_Y * S };
  buildLevel(level);
  paddle.x = FX + FW / 2 - paddleWidth() / 2;
  serveBall();
  updateHud();
  banner = { text: `Level ${level}`, sub: 'Click or press Space to launch', life: 2.2 };
  el.startOverlay.classList.add('overlay--hidden');
  el.gameoverOverlay.classList.add('overlay--hidden');
}

function updateHud() {
  el.score.textContent = score;
  el.level.textContent = level;
  el.balls.textContent = lives;
}

function addScore(n) {
  score += n;
  if (score > best) {
    best = score;
    newRecord = true;
    localStorage.setItem('neonbreakout-best', String(best));
    el.best.textContent = best;
  }
  el.score.textContent = score;
}

function gameOver() {
  mode = 'over';
  el.gameoverTitle.textContent = newRecord ? 'New Record!' : 'Game Over';
  el.gameoverMessage.textContent = newRecord
    ? 'A new high score burns into the grid.'
    : level === 1
      ? 'The wall stands. Grab a powerup next run.'
      : 'The wall claims another paddle.';
  el.finalScore.textContent = score;
  el.finalLevel.textContent = level;
  el.finalBest.textContent = best;
  el.gameoverOverlay.classList.remove('overlay--hidden');
}

// ---- Pickups ----
// type: id, good?, label, hue
const PICKUP_TYPES = [
  { id: 'multi', good: true, label: 'M', hue: 190, name: 'Multi-ball' },
  { id: 'life', good: true, label: '+', hue: 120, name: 'Extra ball' },
  { id: 'laser', good: true, label: 'L', hue: 330, name: 'Lasers' },
  { id: 'wide', good: true, label: 'W', hue: 275, name: 'Wide paddle' },
  { id: 'slow', good: true, label: 'S', hue: 160, name: 'Slow-mo' },
  { id: 'pierce', good: true, label: 'P', hue: 25, name: 'Power ball' },
  { id: 'boom', good: true, label: 'E', hue: 48, name: 'Blast ball' },
  { id: 'shrink', good: false, label: '−', hue: 0, name: 'Shrunk!' },
  { id: 'fast', good: false, label: 'F', hue: 25, name: 'Speed up!' },
];

function dropPickup(x, y) {
  const goodOnes = PICKUP_TYPES.filter((t) => t.good);
  const badOnes = PICKUP_TYPES.filter((t) => !t.good);
  const pool = Math.random() < 0.74 ? goodOnes : badOnes;
  const type = pool[Math.floor(rand(0, pool.length))];
  pickups.push({ x, y, type, spin: rand(0, TAU) });
}

function applyPickup(p) {
  const t = p.type;
  addScore(25);
  banner = { text: t.name, sub: null, life: 1.1, hue: t.hue, small: true };
  burst(p.x, p.y, t.hue, 16);
  switch (t.id) {
    case 'multi': {
      const spawned = [];
      for (const b of balls) {
        if (balls.length + spawned.length >= MAX_BALLS) break;
        const sp = Math.hypot(b.vx, b.vy) || ballSpeed();
        const a0 = Math.atan2(b.vy, b.vx);
        for (const da of [-0.5, 0.5]) {
          if (balls.length + spawned.length >= MAX_BALLS) break;
          spawned.push({
            x: b.x, y: b.y,
            vx: Math.cos(a0 + da) * sp,
            vy: Math.sin(a0 + da) * sp,
            stuck: false, trail: [],
          });
        }
      }
      balls.push(...spawned);
      break;
    }
    case 'life':
      lives++;
      updateHud();
      break;
    case 'laser':
      fx.laser = 10;
      break;
    case 'wide':
      fx.wide = 12;
      fx.shrink = 0;
      break;
    case 'slow':
      fx.slow = 8;
      fx.fast = 0;
      break;
    case 'pierce':
      fx.pierce = 7;
      break;
    case 'boom':
      fx.boom = 10;
      break;
    case 'shrink':
      fx.shrink = 10;
      fx.wide = 0;
      break;
    case 'fast':
      fx.fast = 8;
      fx.slow = 0;
      break;
  }
}

// ---- Particles ----
function burst(x, y, hue, n, spread = 260) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const sp = rand(40, spread) * S;
    particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      r: rand(1.5, 4) * S,
      life: 1,
      decay: rand(1.4, 2.6),
      hue,
    });
  }
}

// ---- Brick hits ----
// chain=true marks damage dealt by an explosion, which never re-explodes
function damageBrick(b, hx, hy, chain) {
  b.flash = 1;
  if (b.steel) {
    burst(hx, hy, b.hue, 4, 120);
    return;
  }
  const idx = bricks.indexOf(b);
  if (idx === -1) return;   // already destroyed earlier this frame
  b.hp--;
  if (b.hp <= 0) {
    bricks.splice(idx, 1);
    addScore(50 * b.maxHp);
    burst(b.x + b.w / 2, b.y + b.h / 2, b.hue, 14);
    if (Math.random() < DROP_CHANCE) dropPickup(b.x + b.w / 2, b.y + b.h / 2);
  } else {
    addScore(20);
    burst(hx, hy, b.hue, 6, 140);
  }
  if (!chain && fx.boom > 0) explodeAt(hx, hy);
  if (!bricks.some((br) => !br.steel)) levelClear();
}

// blast-ball explosion: damages every non-steel brick near the impact
function explodeAt(x, y) {
  const bw = bricks.length ? bricks[0].w : 80 * S;
  const radius = bw * 1.3;
  shake = Math.max(shake, 0.45);
  burst(x, y, 48, 26, 460);
  const targets = bricks.filter((b) => {
    if (b.steel) return false;
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    return (x - cx) ** 2 + (y - cy) ** 2 < radius * radius;
  });
  for (const t of targets) damageBrick(t, t.x + t.w / 2, t.y + t.h / 2, true);
}

function levelClear() {
  addScore(250 + level * 50);
  level++;
  updateHud();
  buildLevel(level);
  serveBall();
  banner = { text: `Level ${level}`, sub: 'Bricks shrink, speed rises — launch when ready', life: 2.4 };
}

// ---- Physics ----
function moveBall(b, dt) {
  const speed = Math.hypot(b.vx, b.vy);
  if (speed > 0) {
    // keep speed synced to current level / slow / fast effects
    const target = ballSpeed();
    const k = target / speed;
    b.vx *= k;
    b.vy *= k;
  }
  // sub-step so fast balls can't tunnel through thin bricks
  const steps = Math.max(1, Math.ceil((ballSpeed() * dt) / (BALL_R * S)));
  const sdt = dt / steps;
  for (let i = 0; i < steps; i++) {
    b.x += b.vx * sdt;
    b.y += b.vy * sdt;
    collideBall(b);
    if (b.dead) return;
  }
}

function collideBall(b) {
  const r = BALL_R * S;

  // walls
  if (b.x < FX + r) { b.x = FX + r; b.vx = Math.abs(b.vx); }
  if (b.x > FX + FW - r) { b.x = FX + FW - r; b.vx = -Math.abs(b.vx); }
  if (b.y < r + 8 * S) { b.y = r + 8 * S; b.vy = Math.abs(b.vy); }

  // lost
  if (b.y > H + r * 2) { b.dead = true; return; }

  // paddle
  const pw = paddleWidth();
  const ph = PADDLE_H * S;
  if (b.vy > 0
    && b.y + r > paddle.y && b.y - r < paddle.y + ph
    && b.x > paddle.x - r && b.x < paddle.x + pw + r) {
    b.y = paddle.y - r;
    const off = clamp((b.x - (paddle.x + pw / 2)) / (pw / 2), -1, 1);
    const angle = -Math.PI / 2 + off * 1.05;   // up to ~60° off vertical
    const v = ballSpeed();
    b.vx = Math.cos(angle) * v;
    b.vy = Math.sin(angle) * v;
    burst(b.x, paddle.y, 190, 4, 90);
  }

  // bricks — hit at most one per sub-step
  for (const brk of bricks) {
    const nx = clamp(b.x, brk.x, brk.x + brk.w);
    const ny = clamp(b.y, brk.y, brk.y + brk.h);
    const ddx = b.x - nx;
    const ddy = b.y - ny;
    if (ddx * ddx + ddy * ddy >= r * r) continue;

    // power ball smashes straight through anything but steel
    if (fx.pierce > 0 && !brk.steel) {
      brk.hp = 1;
      damageBrick(brk, nx, ny);
      break;
    }

    // reflect off the axis with the smaller penetration
    const overlapX = r - Math.abs(ddx);
    const overlapY = r - Math.abs(ddy);
    if (ddx === 0 && ddy === 0) {
      b.vy = -b.vy;   // centre hit, rare
    } else if (overlapX < overlapY) {
      b.vx = ddx > 0 ? Math.abs(b.vx) : -Math.abs(b.vx);
      b.x += ddx > 0 ? overlapX : -overlapX;
    } else {
      b.vy = ddy > 0 ? Math.abs(b.vy) : -Math.abs(b.vy);
      b.y += ddy > 0 ? overlapY : -overlapY;
    }
    damageBrick(brk, nx, ny);
    break;
  }

  // never let the ball go dead-horizontal
  const v = Math.hypot(b.vx, b.vy);
  if (v > 0 && Math.abs(b.vy) < v * 0.18) {
    b.vy = (b.vy >= 0 ? 1 : -1) * v * 0.18;
    b.vx = Math.sign(b.vx || 1) * Math.sqrt(v * v - b.vy * b.vy);
  }
}

function update(dt) {
  shake = Math.max(0, shake - dt * 2.2);
  if (banner) {
    banner.life -= dt;
    if (banner.life <= 0) banner = null;
  }

  for (const pt of particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vy += 420 * S * dt;
    pt.life -= pt.decay * dt;
  }
  particles = particles.filter((pt) => pt.life > 0);

  if (mode !== 'play' && mode !== 'serve') return;

  for (const k in fx) fx[k] = Math.max(0, fx[k] - dt);

  // keyboard paddle movement
  const pw = paddleWidth();
  const kv = 640 * S * dt;
  if (keys.left) paddle.x -= kv;
  if (keys.right) paddle.x += kv;
  paddle.x = clamp(paddle.x, FX, FX + FW - pw);

  // stuck balls ride the paddle
  for (const b of balls) {
    if (b.stuck) {
      b.x = paddle.x + pw / 2;
      b.y = paddle.y - BALL_R * S - 2;
    }
  }

  if (mode === 'serve') return;

  // balls
  for (const b of balls) {
    if (!b.stuck) moveBall(b, dt);
    b.trail.push({ x: b.x, y: b.y, life: 1 });
    for (const t of b.trail) t.life -= dt * 3;
    b.trail = b.trail.filter((t) => t.life > 0);
  }
  const before = balls.length;
  balls = balls.filter((b) => !b.dead);
  if (balls.length < before && balls.length === 0) {
    lives--;
    updateHud();
    shake = 1;
    burst(paddle.x + pw / 2, paddle.y, 0, 30);
    if (lives <= 0) {
      gameOver();
      return;
    }
    serveBall();
    banner = { text: 'Ball lost', sub: `${lives} ball${lives === 1 ? '' : 's'} left`, life: 1.6, hue: 0, small: true };
  }

  // pickups
  for (const p of pickups) {
    p.y += PICKUP_VY * S * dt;
    p.spin += dt * 3;
    if (p.y > paddle.y - PICKUP_R * S && p.y < paddle.y + PADDLE_H * S + PICKUP_R * S
      && p.x > paddle.x - PICKUP_R * S && p.x < paddle.x + pw + PICKUP_R * S) {
      p.dead = true;
      applyPickup(p);
    }
  }
  pickups = pickups.filter((p) => !p.dead && p.y < H + 40 * S);

  // lasers
  laserCooldown -= dt;
  if (fx.laser > 0 && laserCooldown <= 0) {
    laserCooldown = 0.33;
    const y = paddle.y - 4 * S;
    lasers.push({ x: paddle.x + 8 * S, y }, { x: paddle.x + pw - 8 * S, y });
  }
  for (const l of lasers) {
    l.y -= LASER_SPEED * S * dt;
    if (l.y < 0) { l.dead = true; continue; }
    for (const brk of bricks) {
      if (l.x > brk.x && l.x < brk.x + brk.w && l.y > brk.y && l.y < brk.y + brk.h) {
        l.dead = true;
        damageBrick(brk, l.x, brk.y + brk.h);
        break;
      }
    }
  }
  lasers = lasers.filter((l) => !l.dead);
}

// ---- Input ----
const keys = { left: false, right: false };

window.addEventListener('keydown', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (mode === 'idle') startGame();
    else if (mode === 'over') startGame();
    else if (mode === 'serve') launchBall();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
});

function pointToPaddle(clientX) {
  if (!paddle) return;
  const pw = paddleWidth();
  paddle.x = clamp(clientX - pw / 2, FX, FX + FW - pw);
}
canvas.addEventListener('pointermove', (e) => pointToPaddle(e.clientX));
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  pointToPaddle(e.clientX);
  if (mode === 'serve') launchBall();
});
el.btnStart.addEventListener('click', startGame);
el.btnRestart.addEventListener('click', startGame);

// ---- Drawing ----
function roundRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBackground() {
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, W, H);

  let g = ctx.createRadialGradient(W * 0.8, H * 0.15, 0, W * 0.8, H * 0.15, H * 0.7);
  g.addColorStop(0, 'rgba(0, 229, 255, 0.07)');
  g.addColorStop(1, 'rgba(0, 229, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W * 0.15, H * 0.85, 0, W * 0.15, H * 0.85, H * 0.7);
  g.addColorStop(0, 'rgba(236, 72, 153, 0.06)');
  g.addColorStop(1, 'rgba(236, 72, 153, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const cell = 60 * S;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = FX % cell; x < W; x += cell) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = 0; y < H; y += cell) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
}

function drawField() {
  // glowing side and top rails of the playfield
  ctx.save();
  ctx.shadowColor = 'rgba(0, 229, 255, 0.8)';
  ctx.shadowBlur = 12 * S;
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.55)';
  ctx.lineWidth = 2 * S;
  ctx.beginPath();
  ctx.moveTo(FX, H);
  ctx.lineTo(FX, 8 * S);
  ctx.lineTo(FX + FW, 8 * S);
  ctx.lineTo(FX + FW, H);
  ctx.stroke();
  ctx.restore();

  // danger line under the paddle
  const dy = H - 26 * S;
  ctx.strokeStyle = 'rgba(236, 72, 153, 0.25)';
  ctx.setLineDash([8 * S, 10 * S]);
  ctx.lineWidth = 1.5 * S;
  ctx.beginPath();
  ctx.moveTo(FX, dy);
  ctx.lineTo(FX + FW, dy);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawBricks() {
  for (const b of bricks) {
    b.flash = Math.max(0, b.flash - 0.06);
    const { x, y, w, h, hue } = b;
    ctx.save();
    if (b.steel) {
      const grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, 'rgba(200, 210, 230, 0.35)');
      grad.addColorStop(1, 'rgba(120, 130, 150, 0.22)');
      ctx.fillStyle = grad;
      roundRect(x, y, w, h, 4 * S);
      ctx.fill();
      ctx.strokeStyle = 'rgba(220, 228, 245, 0.6)';
      ctx.lineWidth = 1.5 * S;
      ctx.stroke();
      // rivets
      ctx.fillStyle = 'rgba(230, 238, 255, 0.5)';
      const rr = 1.6 * S;
      const ox = 6 * S, oy = 5 * S;
      for (const [rx, ry] of [[ox, oy], [w - ox, oy], [ox, h - oy], [w - ox, h - oy]]) {
        ctx.beginPath();
        ctx.arc(x + rx, y + ry, rr, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      continue;
    }

    const frac = b.hp / b.maxHp;
    const lum = 38 + frac * 24;
    const alpha = 0.5 + frac * 0.4;
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, `hsla(${hue}, 90%, ${lum + 12}%, ${alpha})`);
    grad.addColorStop(1, `hsla(${hue}, 90%, ${lum - 6}%, ${alpha * 0.85})`);
    ctx.shadowColor = `hsla(${hue}, 95%, 60%, ${0.35 + b.flash * 0.6})`;
    ctx.shadowBlur = (6 + b.flash * 14) * S;
    ctx.fillStyle = grad;
    roundRect(x, y, w, h, 4 * S);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `hsla(${hue}, 95%, 70%, ${0.5 + b.flash * 0.5})`;
    ctx.lineWidth = 1.2 * S;
    ctx.stroke();

    // multi-hit bricks show inner bars for remaining hp
    if (b.maxHp > 1) {
      ctx.fillStyle = `hsla(${hue}, 95%, 80%, 0.75)`;
      const bw2 = 5 * S, gap2 = 3 * S;
      const total = b.hp * bw2 + (b.hp - 1) * gap2;
      for (let i = 0; i < b.hp; i++) {
        ctx.fillRect(x + w / 2 - total / 2 + i * (bw2 + gap2), y + h / 2 - 1.2 * S, bw2, 2.4 * S);
      }
    }

    ctx.restore();
  }
}

function drawPaddle() {
  if (!paddle || mode === 'idle' || mode === 'over') return;
  const pw = paddleWidth();
  const ph = PADDLE_H * S;
  const { x, y } = paddle;

  ctx.save();
  const hue = fx.shrink > 0 ? 0 : fx.wide > 0 ? 275 : 190;
  ctx.shadowColor = `hsla(${hue}, 95%, 60%, 0.9)`;
  ctx.shadowBlur = 18 * S;
  const grad = ctx.createLinearGradient(x, y, x, y + ph);
  grad.addColorStop(0, `hsl(${hue}, 95%, 78%)`);
  grad.addColorStop(0.5, `hsl(${hue}, 95%, 58%)`);
  grad.addColorStop(1, `hsl(${hue}, 90%, 40%)`);
  ctx.fillStyle = grad;
  roundRect(x, y, pw, ph, ph / 2);
  ctx.fill();

  // laser cannons
  if (fx.laser > 0) {
    ctx.fillStyle = '#ff6ab8';
    ctx.shadowColor = 'rgba(236, 72, 153, 0.9)';
    ctx.shadowBlur = 10 * S;
    for (const cx of [x + 8 * S, x + pw - 8 * S]) {
      roundRect(cx - 3 * S, y - 7 * S, 6 * S, 8 * S, 2 * S);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawBalls() {
  // ball colour reflects the active ball effect: fiery orange while
  // piercing, gold while explosive, neon cyan otherwise
  const hue = fx.pierce > 0 ? 25 : fx.boom > 0 ? 48 : 190;
  for (const b of balls) {
    for (const t of b.trail) {
      const a = t.life * 0.3;
      const r = BALL_R * S * 0.6 * t.life;
      if (r <= 0) continue;
      const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, r * 2);
      g.addColorStop(0, `hsla(${hue}, 95%, 60%, ${a})`);
      g.addColorStop(1, `hsla(${hue}, 95%, 60%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(t.x, t.y, r * 2, 0, TAU);
      ctx.fill();
    }
    const r = BALL_R * S;
    ctx.save();
    const body = ctx.createRadialGradient(b.x - r * 0.35, b.y - r * 0.35, r * 0.15, b.x, b.y, r);
    body.addColorStop(0, `hsl(${hue}, 100%, 88%)`);
    body.addColorStop(0.45, `hsl(${hue}, 100%, 55%)`);
    body.addColorStop(1, `hsl(${hue}, 95%, 36%)`);
    ctx.shadowColor = `hsla(${hue}, 95%, 60%, 0.9)`;
    ctx.shadowBlur = 16 * S;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function drawPickups(now) {
  for (const p of pickups) {
    const r = PICKUP_R * S;
    const bob = Math.sin(p.spin) * 2 * S;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    const { hue, good, label } = p.type;
    ctx.shadowColor = `hsla(${hue}, 95%, 60%, 0.9)`;
    ctx.shadowBlur = 14 * S;
    const grad = ctx.createLinearGradient(0, -r, 0, r);
    grad.addColorStop(0, `hsla(${hue}, 90%, 65%, 0.95)`);
    grad.addColorStop(1, `hsla(${hue}, 90%, 42%, 0.95)`);
    ctx.fillStyle = grad;
    roundRect(-r, -r * 0.72, r * 2, r * 1.44, r * 0.7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = good ? 'rgba(255,255,255,0.7)' : 'rgba(255, 80, 80, 0.9)';
    ctx.lineWidth = 1.5 * S;
    ctx.stroke();
    ctx.fillStyle = '#0a0a12';
    ctx.font = `700 ${Math.round(15 * S)}px Outfit, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 1 * S);
    ctx.restore();
  }
}

function drawLasers() {
  if (!lasers.length) return;
  ctx.save();
  ctx.shadowColor = 'rgba(236, 72, 153, 0.9)';
  ctx.shadowBlur = 10 * S;
  ctx.strokeStyle = '#ff6ab8';
  ctx.lineWidth = 3 * S;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const l of lasers) {
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(l.x, l.y - 16 * S);
  }
  ctx.stroke();
  ctx.restore();
}

function drawParticles() {
  for (const pt of particles) {
    ctx.globalAlpha = Math.max(0, pt.life);
    ctx.fillStyle = `hsl(${pt.hue}, 95%, 65%)`;
    ctx.shadowColor = `hsl(${pt.hue}, 95%, 60%)`;
    ctx.shadowBlur = 8 * S;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawBanner() {
  if (!banner) return;
  const a = clamp(banner.life / 0.5, 0, 1);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  const hue = banner.hue ?? 190;
  ctx.shadowColor = `hsla(${hue}, 95%, 60%, 0.85)`;
  ctx.shadowBlur = 22 * S;
  ctx.fillStyle = 'rgba(240, 240, 245, 0.95)';
  const size = banner.small ? 30 : 52;
  ctx.font = `700 ${Math.round(size * S)}px Outfit, system-ui, sans-serif`;
  ctx.fillText(banner.text, W / 2, H * 0.56);
  if (banner.sub) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(136, 136, 160, 0.95)';
    ctx.font = `400 ${Math.round(17 * S)}px Outfit, system-ui, sans-serif`;
    ctx.fillText(banner.sub, W / 2, H * 0.56 + 34 * S);
  }
  ctx.restore();
}

function drawEffectTimers() {
  // small pills above the HUD showing active timed effects
  const active = Object.entries(fx).filter(([, t]) => t > 0);
  if (!active.length) return;
  const labels = { wide: 'WIDE', shrink: 'SHRUNK', laser: 'LASER', slow: 'SLOW', fast: 'FAST', pierce: 'POWER', boom: 'BLAST' };
  const hues = { wide: 275, shrink: 0, laser: 330, slow: 160, fast: 25, pierce: 25, boom: 48 };
  ctx.save();
  ctx.font = `600 ${Math.round(11 * S)}px Outfit, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let y = H - 120 * S;
  for (const [id, t] of active) {
    const hue = hues[id];
    const w = 76 * S, h = 20 * S;
    const x = FX + FW - w - 12 * S;
    ctx.fillStyle = `hsla(${hue}, 80%, 55%, 0.18)`;
    roundRect(x, y, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = `hsla(${hue}, 90%, 60%, 0.6)`;
    ctx.lineWidth = 1 * S;
    ctx.stroke();
    ctx.fillStyle = `hsl(${hue}, 90%, 75%)`;
    ctx.fillText(`${labels[id]} ${Math.ceil(t)}`, x + w / 2, y + h / 2 + 0.5 * S);
    y -= 26 * S;
  }
  ctx.restore();
}

// ---- Main loop ----
let lastT = performance.now();
function frame(now) {
  const dt = Math.min((now - lastT) / 1000, 1 / 30);
  lastT = now;

  update(dt);

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (shake > 0) {
    const s = shake * shake * 9 * S;
    ctx.translate(rand(-s, s), rand(-s, s));
  }

  drawBackground();
  drawField();
  drawBricks();
  drawLasers();
  drawPickups(now);
  drawPaddle();
  drawBalls();
  drawParticles();
  drawBanner();
  drawEffectTimers();

  requestAnimationFrame(frame);
}

resize();
window.addEventListener('resize', resize);
// idle background shows a generated wall behind the start overlay
grid = generateLevel(1);
bricks = grid.cells.map((c) => ({
  cx: c.cx, cy: c.cy, x: 0, y: 0, w: 0, h: 0,
  hp: c.steel ? Infinity : c.hp, maxHp: c.hp,
  steel: c.steel,
  hue: c.steel ? 220 : ROW_HUES[c.cy % ROW_HUES.length],
  flash: 0,
}));
layoutBricks();
requestAnimationFrame(frame);
