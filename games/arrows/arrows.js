// Arrows — a "fire the arrows off the board" puzzle.
//
// Every generated board is guaranteed solvable. We build the puzzle in REVERSE:
// arrows are placed one at a time into empty space, and each new arrow's escape
// ray (from its head, in the direction it points, to the board edge) must be
// clear of arrows *already placed*. Playing the removal order as the reverse of
// the placement order is then always a valid solution — and it can be shown that
// at least one arrow is always escapable from the starting position.

const U = 100; // SVG user units per cell

const DIRS = {
  up:    { dx: 0, dy: -1 },
  down:  { dx: 0, dy: 1 },
  left:  { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};
const DIR_LIST = Object.values(DIRS);

// ---------------------------------------------------------------------------
// Puzzle generation
// ---------------------------------------------------------------------------

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const inBounds = (x, y, N) => x >= 0 && y >= 0 && x < N && y < N;

// The board is split into four triangular regions by nearest edge. Every arrow
// lives in one region and points toward that region's edge, and its HEAD is the
// region's extreme cell (topmost for the top region, leftmost for the left,
// etc.). Two facts make every board solvable:
//   1. An arrow's escape ray never leaves its region (heading further toward the
//      edge keeps you in the same nearest-edge triangle).
//   2. Removing a region's arrows in head-extreme order (outer edge first) is
//      always safe: any not-yet-removed arrow's cells all sit "behind" its own
//      head, i.e. never in front of the head being fired.
// So generation just needs to tile each region with head-extreme arrows — no
// search, no backtracking, linear in the number of cells.
const REGIONS = {
  up:    { dir: DIRS.up,    into: DIRS.down,  extreme: (a, b) => (a.y - b.y) || (a.x - b.x) },
  down:  { dir: DIRS.down,  into: DIRS.up,    extreme: (a, b) => (b.y - a.y) || (a.x - b.x) },
  left:  { dir: DIRS.left,  into: DIRS.right, extreme: (a, b) => (a.x - b.x) || (a.y - b.y) },
  right: { dir: DIRS.right, into: DIRS.left,  extreme: (a, b) => (b.x - a.x) || (a.y - b.y) },
};

// Which edge is cell (x, y) nearest to? Ties broken by a per-board random
// priority so the diagonal seams between regions vary between games.
function classifyRegion(x, y, N, priority) {
  const dist = { up: y, down: N - 1 - y, left: x, right: N - 1 - x };
  let best = priority[0];
  for (const name of priority) if (dist[name] < dist[best]) best = name;
  return best;
}

// Grow a self-avoiding arrow body starting from its head. It stays inside the
// region on empty cells and prefers to step "into" the region first, so the
// head reads as pointing straight out along the shaft.
function growArrow(head, name, cfg, occupied, region, N, maxLen) {
  const path = [head];
  const inPath = new Set([head.y * N + head.x]);
  const targetLen = 1 + Math.floor(Math.random() * maxLen);

  while (path.length < targetLen) {
    const last = path[path.length - 1];
    const dirs = shuffle(DIR_LIST.slice());
    if (path.length === 1) dirs.sort((a, b) => (b === cfg.into) - (a === cfg.into));

    let stepped = false;
    for (const d of dirs) {
      const nx = last.x + d.dx, ny = last.y + d.dy;
      if (!inBounds(nx, ny, N) || occupied[ny][nx] !== -1 || region[ny][nx] !== name) continue;
      const k = ny * N + nx;
      if (inPath.has(k)) continue;
      path.push({ x: nx, y: ny });
      inPath.add(k);
      stepped = true;
      break;
    }
    if (!stepped) break;
  }
  return path;
}

function generatePuzzle(N) {
  const maxLen = Math.min(5, Math.max(2, N - 2));
  const priority = shuffle(['up', 'down', 'left', 'right']);

  const occupied = Array.from({ length: N }, () => new Array(N).fill(-1));
  const region = Array.from({ length: N }, (_, y) =>
    Array.from({ length: N }, (_, x) => classifyRegion(x, y, N, priority)));

  const arrows = [];

  for (const name of ['up', 'down', 'left', 'right']) {
    const cfg = REGIONS[name];
    while (true) {
      // The head is the still-empty region cell furthest toward the edge.
      let head = null;
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++)
          if (region[y][x] === name && occupied[y][x] === -1) {
            const c = { x, y };
            if (!head || cfg.extreme(c, head) < 0) head = c;
          }
      if (!head) break;

      const path = growArrow(head, name, cfg, occupied, region, N, maxLen);
      const id = arrows.length;
      for (const cell of path) occupied[cell.y][cell.x] = id;
      arrows.push({ id, cells: path, head: { x: head.x, y: head.y }, dir: cfg.dir });
    }
  }
  return arrows;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';

function arrowColor(i, total) {
  const hue = Math.round((i * 137.508) % 360);
  return {
    body: `hsl(${hue} 70% 58%)`,
    head: `hsl(${hue} 78% 68%)`,
  };
}

function center(cell) {
  return { cx: (cell.x + 0.5) * U, cy: (cell.y + 0.5) * U };
}

function createArrowEl(arrow) {
  const g = document.createElementNS(SVG_NS, 'g');
  g.classList.add('arrow');
  g.dataset.id = arrow.id;

  // Body: a thick rounded polyline through the cell centres.
  const body = document.createElementNS(SVG_NS, 'polyline');
  const pts = arrow.cells.map(c => {
    const { cx, cy } = center(c);
    return `${cx},${cy}`;
  }).join(' ');
  body.setAttribute('points', pts);
  body.setAttribute('fill', 'none');
  body.setAttribute('stroke', arrow.color.body);
  body.setAttribute('stroke-width', U * 0.6);
  body.setAttribute('stroke-linecap', 'round');
  body.setAttribute('stroke-linejoin', 'round');
  body.classList.add('arrow__body');
  g.appendChild(body);

  // Head: a triangle at the head cell, pointing outward.
  const { cx, cy } = center(arrow.head);
  const d = arrow.dir;
  const px = -d.dy, py = d.dx; // perpendicular
  const tip = `${cx + d.dx * U * 0.5},${cy + d.dy * U * 0.5}`;
  const l = `${cx + px * U * 0.42 - d.dx * U * 0.14},${cy + py * U * 0.42 - d.dy * U * 0.14}`;
  const r = `${cx - px * U * 0.42 - d.dx * U * 0.14},${cy - py * U * 0.42 - d.dy * U * 0.14}`;
  const headEl = document.createElementNS(SVG_NS, 'polygon');
  headEl.setAttribute('points', `${tip} ${l} ${r}`);
  headEl.setAttribute('fill', arrow.color.head);
  headEl.classList.add('arrow__head');
  g.appendChild(headEl);

  return g;
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

const boardEl = document.getElementById('board');
const endOverlay = document.getElementById('end-overlay');
const els = {
  cleared: document.getElementById('stat-cleared'),
  left: document.getElementById('stat-left'),
  moves: document.getElementById('stat-moves'),
  undo: document.getElementById('btn-undo'),
  endTitle: document.getElementById('end-title'),
  endMessage: document.getElementById('end-message'),
  endStats: document.getElementById('end-stats'),
};

const game = {
  N: 6,
  arrows: new Map(), // id -> arrow (with .el)
  occupied: [],
  moves: 0,
  cleared: 0,
  total: 0,
  history: [],
  hints: false,
  busy: false,
  over: false,
};

function newGame(N = game.N) {
  game.N = N;
  let arrows = generatePuzzle(N);
  while (!arrows) arrows = generatePuzzle(N);

  game.arrows.clear();
  game.occupied = Array.from({ length: N }, () => new Array(N).fill(-1));
  game.moves = 0;
  game.cleared = 0;
  game.total = arrows.length;
  game.history = [];
  game.busy = false;
  game.over = false;

  boardEl.setAttribute('viewBox', `0 0 ${N * U} ${N * U}`);
  boardEl.style.setProperty('--cells', N);
  boardEl.innerHTML = '';

  for (const a of arrows) {
    a.color = arrowColor(a.id, arrows.length);
    for (const c of a.cells) game.occupied[c.y][c.x] = a.id;
    const el = createArrowEl(a);
    a.el = el;
    boardEl.appendChild(el);
    game.arrows.set(a.id, a);
    wireArrow(a);
  }

  endOverlay.classList.add('overlay--hidden');
  updateStats();
}

function updateStats() {
  els.cleared.textContent = game.cleared;
  els.left.textContent = game.arrows.size;
  els.moves.textContent = game.moves;
  els.undo.disabled = game.history.length === 0;
}

// Ray check against the live board (ignoring the arrow itself).
function rayResult(arrow) {
  const { N, occupied } = game;
  let x = arrow.head.x + arrow.dir.dx;
  let y = arrow.head.y + arrow.dir.dy;
  while (x >= 0 && y >= 0 && x < N && y < N) {
    const id = occupied[y][x];
    if (id !== -1 && id !== arrow.id) return { blocked: true, blockerId: id };
    x += arrow.dir.dx;
    y += arrow.dir.dy;
  }
  return { blocked: false };
}

function wireArrow(arrow) {
  arrow.el.addEventListener('click', () => attemptRemove(arrow));
  arrow.el.addEventListener('mouseenter', () => {
    if (!game.hints || game.busy || game.over) return;
    arrow.el.classList.add(rayResult(arrow).blocked ? 'arrow--danger' : 'arrow--safe');
  });
  arrow.el.addEventListener('mouseleave', () => {
    arrow.el.classList.remove('arrow--safe', 'arrow--danger');
  });
}

function attemptRemove(arrow) {
  if (game.busy || game.over || !game.arrows.has(arrow.id)) return;
  const res = rayResult(arrow);
  if (res.blocked) {
    crash(arrow, game.arrows.get(res.blockerId));
    return;
  }
  fireOff(arrow);
}

function fireOff(arrow) {
  game.busy = true;
  arrow.el.classList.remove('arrow--safe', 'arrow--danger');
  arrow.el.classList.add('arrow--firing');

  // Free its cells and update model immediately.
  for (const c of arrow.cells) game.occupied[c.y][c.x] = -1;
  game.arrows.delete(arrow.id);
  game.moves++;
  game.cleared++;
  game.history.push(arrow);

  // Slide the whole arrow off the board in its heading direction.
  const dist = (game.N + 1) * U;
  arrow.el.style.transform = `translate(${arrow.dir.dx * dist}px, ${arrow.dir.dy * dist}px)`;

  const finish = () => {
    arrow.el.remove();
    game.busy = false;
    updateStats();
    if (game.arrows.size === 0) win();
    else if (isDeadlocked()) deadlock();
  };
  arrow.el.addEventListener('transitionend', finish, { once: true });
  setTimeout(finish, 500); // fallback if transitionend doesn't fire
}

function crash(arrow, blocker) {
  game.busy = true;
  game.over = true;
  arrow.el.classList.remove('arrow--safe', 'arrow--danger');
  arrow.el.classList.add('arrow--crash');
  if (blocker) blocker.el.classList.add('arrow--hit');
  setTimeout(() => {
    showEnd('Crash!', `That arrow slammed straight into another one. You cleared
      ${game.cleared} of ${game.total} arrows.`, false);
  }, 700);
}

function isDeadlocked() {
  for (const arrow of game.arrows.values())
    if (!rayResult(arrow).blocked) return false;
  return true;
}

function deadlock() {
  game.over = true;
  showEnd('Stuck!', `No arrow can escape anymore — the remaining ${game.arrows.size}
    are all blocking each other. There was a way through from the start; try undoing
    or start fresh.`, false);
}

function win() {
  game.over = true;
  showEnd('Board Cleared!', `You fired every arrow off the board without a single
    collision.`, true);
}

function showEnd(title, message, won) {
  els.endTitle.textContent = title;
  els.endMessage.textContent = message.replace(/\s+/g, ' ').trim();
  els.endStats.innerHTML = `
    <div class="end-stat"><span class="end-stat__value">${game.cleared}/${game.total}</span>
      <span class="end-stat__label">Cleared</span></div>
    <div class="end-stat"><span class="end-stat__value">${game.moves}</span>
      <span class="end-stat__label">Moves</span></div>`;
  els.endTitle.classList.toggle('end-title--win', won);
  endOverlay.classList.remove('overlay--hidden');
}

function undo() {
  if (game.busy || game.history.length === 0) return;
  const arrow = game.history.pop();

  // Restore model + element.
  for (const c of arrow.cells) game.occupied[c.y][c.x] = arrow.id;
  game.arrows.set(arrow.id, arrow);
  const el = createArrowEl(arrow);
  arrow.el = el;
  boardEl.appendChild(el);
  wireArrow(arrow);

  game.moves++;
  game.cleared--;
  game.over = false;
  game.busy = false;
  endOverlay.classList.add('overlay--hidden');
  updateStats();
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const sizeRange = document.getElementById('size-range');
const sizeValue = document.getElementById('size-value');

// Live label while dragging; regenerate only when the slider is released.
sizeRange.addEventListener('input', () => {
  const n = Number(sizeRange.value);
  sizeValue.textContent = `${n} × ${n}`;
});
sizeRange.addEventListener('change', () => newGame(Number(sizeRange.value)));

document.getElementById('hints-toggle').addEventListener('change', (e) => {
  game.hints = e.target.checked;
});

document.getElementById('btn-new').addEventListener('click', () => newGame());
document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-undo-overlay').addEventListener('click', undo);
document.getElementById('btn-play-again').addEventListener('click', () => newGame());

newGame(Number(sizeRange.value));
