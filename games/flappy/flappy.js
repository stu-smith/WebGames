// Neon Flap — a one-button flappy game. Tap to pulse upward and thread the
// gaps between neon towers. All physics constants are in "reference pixels"
// (an 800px-tall screen) and scaled to the real viewport so the game feels
// the same on any display.

const REF_H = 800;
const GRAVITY = 1950;        // ref-px per second²
const FLAP_VY = -560;        // ref-px per second
const MAX_FALL = 900;
const BIRD_R = 16;
const PIPE_W = 84;
const GROUND_H = 56;
const BASE_SPEED = 235;      // ref-px per second, rises with score
const PIPE_HUES = [190, 275, 330];   // cyan, purple, pink

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const el = {
  score: document.getElementById('stat-score'),
  best: document.getElementById('stat-best'),
  startOverlay: document.getElementById('start-overlay'),
  gameoverOverlay: document.getElementById('gameover-overlay'),
  gameoverTitle: document.getElementById('gameover-title'),
  gameoverMessage: document.getElementById('gameover-message'),
  finalScore: document.getElementById('final-score'),
  finalBest: document.getElementById('final-best'),
  btnStart: document.getElementById('btn-start'),
  btnRestart: document.getElementById('btn-restart'),
};

let W = 0, H = 0, DPR = 1, S = 1;   // S: scale from reference to real pixels
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  S = H / REF_H;
}
window.addEventListener('resize', resize);
resize();

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const TAU = Math.PI * 2;

// ---- State ----
let mode = 'idle';            // idle | play | dying
let bird = null;
let pipes = [];
let particles = [];
let trail = [];
let score = 0;
let best = Number(localStorage.getItem('neonflap-best')) || 0;
let shake = 0;
let idleT = 0;                // drives the idle bob
let scorePulse = 0;           // pops the big score when a point lands

el.best.textContent = best;

function reset() {
  bird = {
    x: Math.max(W * 0.28, 120),
    y: H * 0.45,
    vy: 0,
    wing: 0,               // wing flap animation phase, decays after each flap
  };
  pipes = [];
  particles = [];
  trail = [];
  score = 0;
  shake = 0;
  scorePulse = 0;
  el.score.textContent = '0';
}
reset();

// ---- Difficulty curve ----
function speed() {
  return (BASE_SPEED + Math.min(score, 80) * 2.1) * S;
}
function gapHeight() {
  return Math.max(0.245, 0.335 - score * 0.0012) * H;
}
function pipeSpacing() {
  return clamp(W * 0.42, 300 * S, 540 * S);
}

// ---- Actions ----
function flap() {
  if (mode === 'idle') {
    startGame();
  }
  if (mode !== 'play') return;
  bird.vy = FLAP_VY * S;
  bird.wing = 1;
  // little downward exhaust puff
  for (let i = 0; i < 6; i++) {
    particles.push({
      x: bird.x - rand(2, 8) * S,
      y: bird.y + rand(6, 14) * S,
      vx: rand(-60, -10) * S,
      vy: rand(40, 140) * S,
      r: rand(1.5, 3.5) * S,
      life: 1,
      decay: rand(2.2, 3.5),
      hue: 190,
    });
  }
}

function startGame() {
  reset();
  mode = 'play';
  el.startOverlay.classList.add('overlay--hidden');
  el.gameoverOverlay.classList.add('overlay--hidden');
}

let newRecord = false;

function die() {
  mode = 'dying';
  shake = 1;
  newRecord = score > best;
  bird.vy = Math.max(bird.vy, -150 * S);
  const hue = PIPE_HUES[Math.floor(rand(0, PIPE_HUES.length))];
  for (let i = 0; i < 42; i++) {
    const a = rand(0, TAU);
    const sp = rand(60, 420) * S;
    particles.push({
      x: bird.x,
      y: bird.y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 120 * S,
      r: rand(1.5, 4.5) * S,
      life: 1,
      decay: rand(0.8, 1.6),
      hue: Math.random() < 0.5 ? 190 : hue,
    });
  }
  if (score > best) {
    best = score;
    localStorage.setItem('neonflap-best', String(best));
    el.best.textContent = best;
  }
}

function showGameOver() {
  mode = 'over';
  el.gameoverTitle.textContent = newRecord ? 'New Record!' : 'Crashed!';
  el.gameoverMessage.textContent = newRecord
    ? 'A new personal best lights up the grid.'
    : score === 0
      ? 'The first tower is always the meanest.'
      : 'So close. The next gap had your name on it.';
  el.finalScore.textContent = score;
  el.finalBest.textContent = best;
  el.gameoverOverlay.classList.remove('overlay--hidden');
}

// ---- Input ----
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (mode === 'over') {
      startGame();
      return;
    }
    flap();
  }
});
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  flap();
});
el.btnStart.addEventListener('click', startGame);
el.btnRestart.addEventListener('click', startGame);

// ---- Update ----
let pipeCount = 0;

function spawnPipes() {
  const last = pipes[pipes.length - 1];
  if (last && last.x > W - pipeSpacing()) return;
  const gapH = gapHeight();
  const groundY = H - GROUND_H * S;
  const cy = rand(gapH / 2 + 80 * S, groundY - gapH / 2 - 50 * S);
  pipes.push({
    x: W + 40 * S,
    cy,
    gapH,
    w: PIPE_W * S,
    hue: PIPE_HUES[pipeCount++ % PIPE_HUES.length],
    scored: false,
  });
}

function hitRect(cx, cy, r, x, y, w, h) {
  const nx = clamp(cx, x, x + w);
  const ny = clamp(cy, y, y + h);
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

function collides(p) {
  const r = BIRD_R * S * 0.92;   // slightly forgiving hitbox
  const topEdge = p.cy - p.gapH / 2;
  const botEdge = p.cy + p.gapH / 2;
  return hitRect(bird.x, bird.y, r, p.x, 0, p.w, topEdge)
    || hitRect(bird.x, bird.y, r, p.x, botEdge, p.w, H - botEdge);
}

function update(dt) {
  idleT += dt;
  shake = Math.max(0, shake - dt * 2.2);
  scorePulse = Math.max(0, scorePulse - dt * 3);

  // particles always simmer
  for (const pt of particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vy += 500 * S * dt;
    pt.life -= pt.decay * dt;
  }
  particles = particles.filter((pt) => pt.life > 0);

  if (mode === 'over') return;

  if (mode === 'idle') {
    bird.y = H * 0.45 + Math.sin(idleT * 2.2) * 14 * S;
    return;
  }

  // bird physics (play + dying)
  bird.vy = Math.min(bird.vy + GRAVITY * S * dt, MAX_FALL * S);
  bird.y += bird.vy * dt;
  bird.wing = Math.max(0, bird.wing - dt * 5);

  if (mode === 'dying') {
    if (bird.y > H + 120 * S) showGameOver();
    return;
  }

  // ceiling: bump, don't kill
  const r = BIRD_R * S;
  if (bird.y < r) {
    bird.y = r;
    bird.vy = Math.max(bird.vy, 0);
  }

  // trail
  trail.push({ x: bird.x, y: bird.y, life: 1 });
  for (const t of trail) {
    t.x -= speed() * dt;
    t.life -= dt * 2.4;
  }
  trail = trail.filter((t) => t.life > 0);

  // pipes
  spawnPipes();
  const v = speed() * dt;
  for (const p of pipes) p.x -= v;
  pipes = pipes.filter((p) => p.x + p.w > -60 * S);

  for (const p of pipes) {
    if (!p.scored && p.x + p.w < bird.x - r) {
      p.scored = true;
      score++;
      scorePulse = 1;
      el.score.textContent = score;
    }
    if (collides(p)) {
      die();
      return;
    }
  }

  // ground
  if (bird.y + r > H - GROUND_H * S) {
    bird.y = H - GROUND_H * S - r;
    die();
  }
}

// ---- Drawing ----
let bgOffset = 0;

function drawBackground(dt) {
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, W, H);

  // soft ambient glows
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

  // scrolling parallax grid
  const cell = 60 * S;
  if (mode !== 'over') bgOffset = (bgOffset + speed() * 0.25 * dt) % cell;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -bgOffset; x < W; x += cell) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = 0; y < H; y += cell) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
}

function drawGround() {
  const gy = H - GROUND_H * S;
  const grad = ctx.createLinearGradient(0, gy, 0, H);
  grad.addColorStop(0, 'rgba(0, 229, 255, 0.10)');
  grad.addColorStop(1, 'rgba(0, 229, 255, 0.02)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, gy, W, GROUND_H * S);

  ctx.save();
  ctx.shadowColor = 'rgba(0, 229, 255, 0.9)';
  ctx.shadowBlur = 14 * S;
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.85)';
  ctx.lineWidth = 2 * S;
  ctx.beginPath();
  ctx.moveTo(0, gy);
  ctx.lineTo(W, gy);
  ctx.stroke();
  ctx.restore();
}

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

function drawPipeHalf(p, y, h, capAtBottom) {
  const { x, w, hue } = p;
  if (h <= 0) return;

  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, `hsla(${hue}, 90%, 55%, 0.16)`);
  grad.addColorStop(0.5, `hsla(${hue}, 90%, 65%, 0.30)`);
  grad.addColorStop(1, `hsla(${hue}, 90%, 55%, 0.16)`);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // glowing side rails
  ctx.save();
  ctx.shadowColor = `hsla(${hue}, 95%, 60%, 0.9)`;
  ctx.shadowBlur = 12 * S;
  ctx.strokeStyle = `hsla(${hue}, 95%, 65%, 0.9)`;
  ctx.lineWidth = 2 * S;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + h);
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.stroke();

  // bright lip cap at the gap edge
  const capH = 12 * S;
  const capY = capAtBottom ? y + h - capH : y;
  ctx.shadowBlur = 18 * S;
  ctx.fillStyle = `hsla(${hue}, 95%, 68%, 0.95)`;
  roundRect(x - 5 * S, capY, w + 10 * S, capH, 5 * S);
  ctx.fill();
  ctx.restore();
}

function drawPipes() {
  const groundY = H - GROUND_H * S;
  for (const p of pipes) {
    const topEdge = p.cy - p.gapH / 2;
    const botEdge = p.cy + p.gapH / 2;
    drawPipeHalf(p, 0, topEdge, true);
    drawPipeHalf(p, botEdge, groundY - botEdge, false);
  }
}

function drawTrail() {
  for (const t of trail) {
    const a = t.life * 0.35;
    const r = BIRD_R * S * 0.55 * t.life;
    if (r <= 0) continue;
    const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, r * 2);
    g.addColorStop(0, `rgba(0, 229, 255, ${a})`);
    g.addColorStop(1, 'rgba(0, 229, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(t.x, t.y, r * 2, 0, TAU);
    ctx.fill();
  }
}

function drawBird() {
  if (mode === 'dying' && bird.y > H) return;
  const r = BIRD_R * S;
  const tilt = clamp(bird.vy / (900 * S), -0.45, 1) * 0.9;

  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(tilt);

  // halo
  const halo = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 3);
  halo.addColorStop(0, 'rgba(0, 229, 255, 0.35)');
  halo.addColorStop(1, 'rgba(0, 229, 255, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, r * 3, 0, TAU);
  ctx.fill();

  // wing (behind body): a swept ellipse that beats on flap
  const beat = Math.sin(bird.wing * Math.PI);
  ctx.save();
  ctx.translate(-r * 0.35, 0);
  ctx.rotate(-0.5 - beat * 1.1);
  ctx.fillStyle = `rgba(168, 85, 247, ${0.55 + beat * 0.4})`;
  ctx.shadowColor = 'rgba(168, 85, 247, 0.9)';
  ctx.shadowBlur = 12 * S;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.7, r * 0.5, r * 1.05, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // body
  const body = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.15, 0, 0, r);
  body.addColorStop(0, '#c8f9ff');
  body.addColorStop(0.45, '#00e5ff');
  body.addColorStop(1, '#0088bb');
  ctx.shadowColor = 'rgba(0, 229, 255, 0.9)';
  ctx.shadowBlur = 20 * S;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;

  // eye
  ctx.fillStyle = '#0a0a12';
  ctx.beginPath();
  ctx.arc(r * 0.45, -r * 0.25, r * 0.22, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(r * 0.52, -r * 0.32, r * 0.08, 0, TAU);
  ctx.fill();

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

function drawScore() {
  if (mode === 'idle') return;
  const size = (54 + scorePulse * 14) * S;
  ctx.save();
  ctx.font = `700 ${size}px Outfit, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0, 229, 255, 0.85)';
  ctx.shadowBlur = 22 * S;
  ctx.fillStyle = 'rgba(240, 240, 245, 0.95)';
  ctx.fillText(score, W / 2, 28 * S);
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
    const s = shake * shake * 10 * S;
    ctx.translate(rand(-s, s), rand(-s, s));
  }

  drawBackground(dt);
  drawPipes();
  drawGround();
  drawTrail();
  drawParticles();
  drawBird();
  drawScore();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
