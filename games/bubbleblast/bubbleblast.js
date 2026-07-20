/* ------------------------------------------------------------------ *
 *  Bubble Chain Blast — a chain-reaction tap puzzle.                        *
 *  Tap a bubble to add a dot; at 4 dots it bursts, firing sparks in   *
 *  the four cardinal directions. Each spark hits the next bubble in   *
 *  its path, adding a dot there and potentially chaining. Clear the   *
 *  whole board within the tap budget.                                 *
 *                                                                     *
 *  Levels are randomly generated with an enforced symmetry, then a    *
 *  breadth-first solver measures the minimum number of taps — which   *
 *  becomes your exact budget. Every board is guaranteed solvable.     *
 * ------------------------------------------------------------------ */

const BURST = 4;
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // up, down, left, right
const MAX_LEVEL_SLIDER = 9;

/* ---------- Core simulation (shared by solver + animator) ---------- */

// Tap cell `idx`, resolve every burst wave, and return the final board
// plus a wave-by-wave description the animator can replay.
function computeWaves(source, N, idx) {
  const board = source.slice();
  const waves = [];
  board[idx] += 1;
  let current = board[idx] >= BURST ? [idx] : [];

  while (current.length) {
    // All cells bursting this wave empty simultaneously...
    for (const c of current) board[c] = 0;

    const bursts = [];
    const inc = new Map();
    for (const c of current) {
      const cr = (c / N) | 0, cc = c % N;
      const sparks = [];
      for (const [dr, dc] of DIRS) {
        let r = cr + dr, col = cc + dc, dist = 1, target = null;
        while (r >= 0 && r < N && col >= 0 && col < N) {
          const t = r * N + col;
          if (board[t] > 0) { target = t; break; }
          r += dr; col += dc; dist++;
        }
        sparks.push({ dr, dc, target, dist });
        if (target !== null) inc.set(target, (inc.get(target) || 0) + 1);
      }
      bursts.push({ cell: c, sparks });
    }

    // ...then all sparks land simultaneously.
    const increments = [];
    const next = [];
    for (const [t, n] of inc) {
      board[t] += n;
      increments.push([t, n]);
      if (board[t] >= BURST) next.push(t);
    }

    waves.push({ bursts, increments });
    current = next;
  }

  return { board, waves };
}

const isEmpty = (b) => b.every((v) => v === 0);

// Minimum taps to clear the board (breadth-first). Every board is
// solvable, but very busy boards can exceed the node cap → returns null.
function minTaps(board, N, nodeCap = 140000) {
  if (isEmpty(board)) return 0;
  const visited = new Set([board.join(',')]);
  let frontier = [board];
  let depth = 0, nodes = 0;
  while (frontier.length) {
    depth++;
    const nextFrontier = [];
    for (const b of frontier) {
      for (let i = 0; i < b.length; i++) {
        if (b[i] === 0) continue;
        const nb = computeWaves(b, N, i).board;
        if (isEmpty(nb)) return depth;
        if (++nodes > nodeCap) return null;
        const key = nb.join(',');
        if (!visited.has(key)) {
          visited.add(key);
          nextFrontier.push(nb);
        }
      }
    }
    frontier = nextFrontier;
  }
  return null;
}

// Guaranteed-clearing upper bound, used only if the BFS bails out.
function greedyTaps(board, N) {
  let b = board.slice();
  let taps = 0, guard = 0;
  while (!isEmpty(b) && guard++ < 10000) {
    const i = b.findIndex((v) => v > 0);
    taps += BURST - b[i];   // taps to push this bubble to a burst
    b[i] = BURST - 1;
    b = computeWaves(b, N, i).board;
  }
  return taps;
}

/* ---------------------- Symmetric generation ---------------------- */

// All grid cells in the symmetry orbit of (r, c).
function symImages(r, c, N, sym) {
  const M = N - 1;
  let pts = [[r, c]];
  const grow = (fn) => { pts = pts.concat(pts.map(([a, b]) => fn(a, b))); };
  if (sym === 'h') grow((a, b) => [a, M - b]);
  else if (sym === 'v') grow((a, b) => [M - a, b]);
  else if (sym === 'rot') grow((a, b) => [M - a, M - b]);
  else if (sym === 'diag') grow((a, b) => [b, a]);
  else if (sym === 'hv') { grow((a, b) => [a, M - b]); grow((a, b) => [M - a, b]); }

  const seen = new Set(), out = [];
  for (const [a, b] of pts) {
    const k = a * N + b;
    if (!seen.has(k)) { seen.add(k); out.push([a, b]); }
  }
  return out;
}

// Force `board` to obey `sym` by making every orbit share one value.
function symmetrize(board, N, sym) {
  const out = board.slice();
  const done = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) {
    if (done[i]) continue;
    const orbit = symImages((i / N) | 0, i % N, N, sym).map(([a, b]) => a * N + b);
    let v = 0;
    for (const o of orbit) v = Math.max(v, board[o]);
    for (const o of orbit) { out[o] = v; done[o] = 1; }
  }
  return out;
}

const SYMS = ['h', 'v', 'rot', 'diag', 'hv', 'hv', 'rot'];

// Build a symmetric, solvable level tuned to `level`.
function generateLevel(level) {
  const N = Math.min(5 + Math.floor((level - 1) / 2), 10);
  const density = Math.min(0.16 + level * 0.02, 0.34);
  const targetLo = Math.min(1 + Math.floor((level - 1) / 2), 6);
  const targetHi = targetLo + 2;

  let best = null;
  for (let attempt = 0; attempt < 200; attempt++) {
    const sym = SYMS[(Math.random() * SYMS.length) | 0];
    let board = new Array(N * N).fill(0);
    for (let i = 0; i < N * N; i++) {
      if (Math.random() < density) board[i] = 1 + ((Math.random() * 3) | 0);
    }
    board = symmetrize(board, N, sym);

    const count = board.filter((v) => v > 0).length;
    if (count < 3 || count > 4 * N + 2) continue;

    const m = minTaps(board, N);
    const taps = m == null ? greedyTaps(board, N) : m;
    const cand = { board, N, taps, sym };
    if (taps >= targetLo && taps <= targetHi) return cand;
    if (!best || Math.abs(taps - targetLo) < Math.abs(best.taps - targetLo)) best = cand;
  }
  return best;
}

/* ----------------------------- UI -------------------------------- */

const PIP_LAYOUT = {
  1: [[50, 50]],
  2: [[33, 33], [67, 67]],
  3: [[50, 27], [29, 68], [71, 68]],
};

const $ = (id) => document.getElementById(id);
const board = $('board');
const diffRange = $('diff-range');
const diffValue = $('diff-value');
const statLevel = $('stat-level');
const statTaps = $('stat-taps');
const statBubbles = $('stat-bubbles');
const overlay = $('end-overlay');
const endTitle = $('end-title');
const endMessage = $('end-message');
const btnNext = $('btn-next');

const state = {
  level: 1,
  N: 5,
  board: [],
  initial: [],
  tapsLeft: 0,
  cells: [],
  pitch: 0,
  busy: false,
};

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function bubbleMarkup(v) {
  const pips = PIP_LAYOUT[Math.min(v, 3)] || [];
  const dots = pips
    .map(([x, y]) => `<span class="pip" style="left:${x}%;top:${y}%"></span>`)
    .join('');
  return `<button class="bubble bubble--v${Math.min(v, 3)}" tabindex="-1">${dots}</button>`;
}

function buildGrid() {
  const N = state.N;
  board.style.setProperty('--cells', N);
  board.innerHTML = '';
  state.cells = [];
  for (let i = 0; i < N * N; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.idx = i;
    cell.dataset.v = '0';
    board.appendChild(cell);
    state.cells.push(cell);
  }
  // Cell-to-cell pixel pitch, for spark trajectories.
  state.pitch = state.cells[1].offsetLeft - state.cells[0].offsetLeft;
  paintBoard();
}

// Render cell `i` to value `v`, but only touch the DOM when it actually
// changed — otherwise every repaint would replay the pop-in animation on
// bubbles that never moved. Returns the bubble element (if any).
function setCell(i, v) {
  const cell = state.cells[i];
  if (cell.dataset.v !== String(v)) {
    cell.dataset.v = String(v);
    cell.innerHTML = v > 0 ? bubbleMarkup(v) : '';
  }
  return cell.firstChild;
}

function paintBoard() {
  for (let i = 0; i < state.board.length; i++) setCell(i, state.board[i]);
}

function updateStats() {
  statLevel.textContent = state.level;
  statTaps.textContent = state.tapsLeft;
  statBubbles.textContent = state.board.filter((v) => v > 0).length;
}

function cellCenter(idx) {
  const el = state.cells[idx];
  return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 };
}

// Glow colour keyed to the value of the bubble that burst.
const FX_GLOW = {
  1: 'rgba(0, 229, 255, 0.78)',
  2: 'rgba(168, 85, 247, 0.78)',
  3: 'rgba(249, 140, 60, 0.82)',
};

function spawnSpark(from, spark) {
  const dot = document.createElement('span');
  dot.className = 'spark';
  const start = cellCenter(from);
  dot.style.left = start.x + 'px';
  dot.style.top = start.y + 'px';

  // Comet tail: stacked shadows trailing opposite the direction of travel.
  const ux = spark.dc, uy = spark.dr;
  const tail = [];
  for (let k = 1; k <= 5; k++) {
    const off = k * 5;
    const a = (0.5 * (1 - k / 6)).toFixed(2);
    tail.push(`${-ux * off}px ${-uy * off}px ${4 + k * 2}px rgba(127, 236, 255, ${a})`);
  }
  dot.style.boxShadow = `0 0 12px #ffffff, 0 0 24px rgba(0, 229, 255, 0.85), ${tail.join(',')}`;
  board.appendChild(dot);

  let dx, dy, fade;
  if (spark.target !== null) {
    const end = cellCenter(spark.target);
    dx = end.x - start.x;
    dy = end.y - start.y;
    fade = false;
  } else {
    dx = spark.dc * state.pitch * spark.dist;
    dy = spark.dr * state.pitch * spark.dist;
    fade = true;
  }
  // Kick off the transition on the next frame.
  requestAnimationFrame(() => {
    dot.style.transform = `translate(${dx}px, ${dy}px)`;
    if (fade) dot.style.opacity = '0';
  });
  setTimeout(() => dot.remove(), 460);
}

// Shockwave ring + flash at a bursting bubble.
function spawnBurstFX(idx, value) {
  const c = cellCenter(idx);
  const size = state.cells[idx].offsetWidth || state.pitch;
  const glow = FX_GLOW[Math.min(value, 3)] || FX_GLOW[3];
  for (const cls of ['burst-flash', 'burst-ring']) {
    const el = document.createElement('span');
    el.className = cls;
    el.style.left = c.x + 'px';
    el.style.top = c.y + 'px';
    el.style.setProperty('--rs', size * (cls === 'burst-ring' ? 1.15 : 1.3) + 'px');
    el.style.setProperty('--fx-glow', glow);
    board.appendChild(el);
    setTimeout(() => el.remove(), 620);
  }
}

async function resolveTap(idx) {
  const { board: finalBoard, waves } = computeWaves(state.board, N_of(), idx);

  // The tapped bubble gains a dot.
  state.board[idx] += 1;
  if (state.board[idx] < BURST) {
    const b = setCell(idx, state.board[idx]);
    if (b) b.classList.add('is-hit');
    return finalBoard;
  }

  for (const wave of waves) {
    // Bursting bubbles detonate: pop, shockwave, and flash.
    for (const { cell: c } of wave.bursts) {
      const b = state.cells[c].firstChild;
      if (b) b.classList.add('is-bursting');
      spawnBurstFX(c, state.board[c]);
    }
    // Sparks fly outward.
    for (const { cell: c, sparks } of wave.bursts) {
      for (const spark of sparks) spawnSpark(c, spark);
    }
    await sleep(210);
    for (const { cell: c } of wave.bursts) {
      state.board[c] = 0;
      setCell(c, 0);
    }
    // Wait for the sparks to reach their targets, then land the hits.
    await sleep(180);
    for (const [t, n] of wave.increments) {
      state.board[t] += n;
      const b = setCell(t, state.board[t]);
      if (b) b.classList.add('is-hit');
    }
    await sleep(120);
  }

  return finalBoard;
}

function N_of() { return state.N; }

async function onTap(idx) {
  if (state.busy || state.tapsLeft <= 0) return;
  if (state.board[idx] <= 0) return;

  state.busy = true;
  state.tapsLeft -= 1;
  updateStats();

  const finalBoard = await resolveTap(idx);
  state.board = finalBoard.slice();
  paintBoard();
  updateStats();

  state.busy = false;

  if (isEmpty(state.board)) {
    win();
  } else if (state.tapsLeft <= 0) {
    lose();
  }
}

/* --------------------------- Flow -------------------------------- */

function loadLevel(level, freshBoard = true) {
  state.level = level;
  hideOverlay();
  if (freshBoard) {
    const lvl = generateLevel(level);
    state.N = lvl.N;
    state.initial = lvl.board.slice();
    state.taps = lvl.taps;
  }
  state.board = state.initial.slice();
  state.tapsLeft = state.taps;
  state.busy = false;
  diffRange.value = Math.min(level, MAX_LEVEL_SLIDER);
  diffValue.textContent = 'Level ' + level;
  buildGrid();
  updateStats();
  try { localStorage.setItem('bubbleblast.level', String(level)); } catch (e) {}
}

function win() {
  endTitle.textContent = 'Cleared!';
  endMessage.textContent = `Level ${state.level} down. Ready for a bigger blast?`;
  btnNext.textContent = 'Next Level';
  btnNext.dataset.action = 'next';
  showOverlay();
}

function lose() {
  endTitle.textContent = 'Out of Taps';
  endMessage.textContent = 'A few bubbles survived. Line up a tighter chain and try again.';
  btnNext.textContent = 'Try Again';
  btnNext.dataset.action = 'retry';
  showOverlay();
}

function showOverlay() { overlay.classList.remove('overlay--hidden'); }
function hideOverlay() { overlay.classList.add('overlay--hidden'); }

/* --------------------------- Wiring ------------------------------ */

board.addEventListener('click', (e) => {
  const cell = e.target.closest('.cell');
  if (!cell) return;
  onTap(Number(cell.dataset.idx));
});

$('btn-new').addEventListener('click', () => loadLevel(state.level, true));
$('btn-retry').addEventListener('click', () => loadLevel(state.level, false));
$('btn-retry-overlay').addEventListener('click', () => loadLevel(state.level, false));
btnNext.addEventListener('click', () => {
  if (btnNext.dataset.action === 'retry') loadLevel(state.level, false);
  else loadLevel(state.level + 1, true);
});

diffRange.addEventListener('input', () => {
  diffValue.textContent = 'Level ' + diffRange.value;
});
diffRange.addEventListener('change', () => {
  loadLevel(Number(diffRange.value), true);
});

window.addEventListener('resize', () => {
  if (state.cells.length) {
    state.pitch = state.cells[1].offsetLeft - state.cells[0].offsetLeft;
  }
});

let start = 1;
try {
  const saved = parseInt(localStorage.getItem('bubbleblast.level') || '1', 10);
  if (saved >= 1 && saved <= 40) start = saved;
} catch (e) {}
loadLevel(start, true);
