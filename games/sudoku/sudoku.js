/* Sudoku.
 *
 * Every puzzle is carved out of a randomly generated complete grid and is
 * verified to have exactly one solution, so it is always solvable. Difficulty
 * is controlled by which solving techniques the puzzle can be cracked with:
 * clues are only removed while a human-style logical solver, limited to the
 * techniques allowed at that level, can still finish the grid.
 */

// ---- Board geometry ----
const ALL = 0x1ff; // bits 0..8 == digits 1..9

const ROW_OF = new Uint8Array(81);
const COL_OF = new Uint8Array(81);
const BOX_OF = new Uint8Array(81);
for (let i = 0; i < 81; i++) {
  ROW_OF[i] = (i / 9) | 0;
  COL_OF[i] = i % 9;
  BOX_OF[i] = ((ROW_OF[i] / 3) | 0) * 3 + ((COL_OF[i] / 3) | 0);
}

// 27 units: rows 0-8, columns 9-17, boxes 18-26.
const UNITS = [];
const CELLS = [...Array(81).keys()];
for (let u = 0; u < 9; u++) UNITS.push(CELLS.filter((i) => ROW_OF[i] === u));
for (let u = 0; u < 9; u++) UNITS.push(CELLS.filter((i) => COL_OF[i] === u));
for (let u = 0; u < 9; u++) UNITS.push(CELLS.filter((i) => BOX_OF[i] === u));

// The 20 cells that share a row, column or box with each cell.
const PEERS = CELLS.map((i) => {
  const set = new Set();
  for (const u of [ROW_OF[i], 9 + COL_OF[i], 18 + BOX_OF[i]]) {
    for (const j of UNITS[u]) if (j !== i) set.add(j);
  }
  return [...set];
});

function popcount(mask) {
  let n = 0;
  while (mask) {
    mask &= mask - 1;
    n++;
  }
  return n;
}

function firstDigit(mask) {
  for (let d = 1; d <= 9; d++) if (mask & (1 << (d - 1))) return d;
  return 0;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeMasks(grid) {
  const row = new Uint16Array(9);
  const col = new Uint16Array(9);
  const box = new Uint16Array(9);
  for (let i = 0; i < 81; i++) {
    if (!grid[i]) continue;
    const b = 1 << (grid[i] - 1);
    row[ROW_OF[i]] |= b;
    col[COL_OF[i]] |= b;
    box[BOX_OF[i]] |= b;
  }
  return { row, col, box };
}

// ---- Brute-force solver ----

/* Counts solutions, stopping as soon as `limit` have been found. Picks the
 * most constrained empty cell first, which keeps the search tiny. */
function countSolutions(input, limit) {
  const grid = Uint8Array.from(input);
  const { row, col, box } = makeMasks(grid);
  let found = 0;

  function search() {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (grid[i]) continue;
      const mask = ALL & ~(row[ROW_OF[i]] | col[COL_OF[i]] | box[BOX_OF[i]]);
      const n = popcount(mask);
      if (n === 0) return false;
      if (n < bestCount) {
        bestCount = n;
        bestMask = mask;
        best = i;
        if (n === 1) break;
      }
    }
    if (best === -1) {
      found++;
      return found >= limit;
    }
    const r = ROW_OF[best];
    const c = COL_OF[best];
    const x = BOX_OF[best];
    for (let d = 1; d <= 9; d++) {
      const b = 1 << (d - 1);
      if (!(bestMask & b)) continue;
      grid[best] = d;
      row[r] |= b; col[c] |= b; box[x] |= b;
      const stop = search();
      grid[best] = 0;
      row[r] &= ~b; col[c] &= ~b; box[x] &= ~b;
      if (stop) return true;
    }
    return false;
  }

  search();
  return found;
}

/* Builds a complete, valid grid by filling cells in a random digit order. */
function generateSolution() {
  const grid = new Uint8Array(81);
  const { row, col, box } = makeMasks(grid);

  function fill() {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (grid[i]) continue;
      const mask = ALL & ~(row[ROW_OF[i]] | col[COL_OF[i]] | box[BOX_OF[i]]);
      const n = popcount(mask);
      if (n === 0) return false;
      if (n < bestCount) {
        bestCount = n;
        bestMask = mask;
        best = i;
        if (n === 1) break;
      }
    }
    if (best === -1) return true;

    const digits = [];
    for (let d = 1; d <= 9; d++) if (bestMask & (1 << (d - 1))) digits.push(d);
    shuffle(digits);

    const r = ROW_OF[best];
    const c = COL_OF[best];
    const x = BOX_OF[best];
    for (const d of digits) {
      const b = 1 << (d - 1);
      grid[best] = d;
      row[r] |= b; col[c] |= b; box[x] |= b;
      if (fill()) return true;
      grid[best] = 0;
      row[r] &= ~b; col[c] &= ~b; box[x] &= ~b;
    }
    return false;
  }

  fill();
  return grid;
}

// ---- Human-style logical solver (used to grade difficulty) ----

const RANK_SINGLES = 1; // naked + hidden singles
const RANK_LOCKED = 2; // + pointing / claiming
const RANK_SUBSETS = 3; // + naked and hidden pairs, triples, quads
const RANK_GUESS = 4; // needs more than the above

function forEachCombination(n, k, fn) {
  const idx = new Array(k);
  (function pick(start, depth) {
    if (depth === k) {
      fn(idx);
      return;
    }
    for (let i = start; i <= n - (k - depth); i++) {
      idx[depth] = i;
      pick(i + 1, depth + 1);
    }
  })(0, 0);
}

/* Returns true when the puzzle can be solved using only techniques up to
 * `maxRank`. Never guesses. */
function logicalSolve(input, maxRank) {
  const grid = Uint8Array.from(input);
  const cand = new Uint16Array(81);
  const { row, col, box } = makeMasks(grid);
  let empty = 0;

  for (let i = 0; i < 81; i++) {
    if (grid[i]) continue;
    empty++;
    cand[i] = ALL & ~(row[ROW_OF[i]] | col[COL_OF[i]] | box[BOX_OF[i]]);
    if (cand[i] === 0) return false;
  }

  function place(i, d) {
    grid[i] = d;
    cand[i] = 0;
    empty--;
    const b = 1 << (d - 1);
    for (const j of PEERS[i]) {
      if (grid[j]) continue;
      cand[j] &= ~b;
      if (cand[j] === 0) return false;
    }
    return true;
  }

  // Drops `mask` from every cell of `unit` outside `keep`.
  function eliminate(unit, keep, mask) {
    let changed = false;
    for (const i of unit) {
      if (grid[i] || keep.includes(i)) continue;
      if (cand[i] & mask) {
        cand[i] &= ~mask;
        changed = true;
      }
    }
    return changed;
  }

  // Returns true on progress, false when stuck, null on a contradiction.
  function singles() {
    let progress = false;
    for (let i = 0; i < 81; i++) {
      if (grid[i] || popcount(cand[i]) !== 1) continue;
      if (!place(i, firstDigit(cand[i]))) return null;
      progress = true;
    }
    for (const unit of UNITS) {
      for (let d = 1; d <= 9; d++) {
        const b = 1 << (d - 1);
        let spot = -1;
        let n = 0;
        let already = false;
        for (const i of unit) {
          if (grid[i] === d) {
            already = true;
            break;
          }
          if (!grid[i] && cand[i] & b) {
            spot = i;
            n++;
          }
        }
        if (already || n !== 1) continue;
        if (!place(spot, d)) return null;
        progress = true;
      }
    }
    return progress;
  }

  function lockedCandidates() {
    let progress = false;
    // Pointing: a digit confined to one line inside a box clears the rest of that line.
    for (let x = 0; x < 9; x++) {
      const unit = UNITS[18 + x];
      for (let d = 1; d <= 9; d++) {
        const b = 1 << (d - 1);
        const spots = unit.filter((i) => !grid[i] && cand[i] & b);
        if (spots.length < 2) continue;
        if (spots.every((i) => ROW_OF[i] === ROW_OF[spots[0]])) {
          if (eliminate(UNITS[ROW_OF[spots[0]]], spots, b)) progress = true;
        }
        if (spots.every((i) => COL_OF[i] === COL_OF[spots[0]])) {
          if (eliminate(UNITS[9 + COL_OF[spots[0]]], spots, b)) progress = true;
        }
      }
    }
    // Claiming: a digit confined to one box inside a line clears the rest of that box.
    for (let u = 0; u < 18; u++) {
      const unit = UNITS[u];
      for (let d = 1; d <= 9; d++) {
        const b = 1 << (d - 1);
        const spots = unit.filter((i) => !grid[i] && cand[i] & b);
        if (spots.length < 2) continue;
        if (spots.every((i) => BOX_OF[i] === BOX_OF[spots[0]])) {
          if (eliminate(UNITS[18 + BOX_OF[spots[0]]], spots, b)) progress = true;
        }
      }
    }
    return progress;
  }

  function subsets() {
    let progress = false;
    for (const unit of UNITS) {
      const cells = unit.filter((i) => !grid[i]);
      if (cells.length < 3) continue;

      // Naked subset: k cells holding only k digits between them own those digits.
      for (let size = 2; size <= 4 && size < cells.length; size++) {
        forEachCombination(cells.length, size, (idx) => {
          let mask = 0;
          for (const k of idx) mask |= cand[cells[k]];
          if (popcount(mask) !== size) return;
          if (eliminate(unit, idx.map((k) => cells[k]), mask)) progress = true;
        });
      }

      // Hidden subset: k digits that fit in only k cells push everything else out.
      const digits = [];
      for (let d = 1; d <= 9; d++) {
        const b = 1 << (d - 1);
        if (cells.some((i) => cand[i] & b)) digits.push(d);
      }
      for (let size = 2; size <= 3 && size < digits.length; size++) {
        forEachCombination(digits.length, size, (idx) => {
          let mask = 0;
          for (const k of idx) mask |= 1 << (digits[k] - 1);
          const holders = cells.filter((i) => cand[i] & mask);
          if (holders.length !== size) return;
          for (const i of holders) {
            if (cand[i] & ~mask) {
              cand[i] &= mask;
              progress = true;
            }
          }
        });
      }
    }
    return progress;
  }

  while (empty > 0) {
    const advanced = singles();
    if (advanced === null) return false;
    if (advanced) continue;
    if (maxRank >= RANK_LOCKED && lockedCandidates()) continue;
    if (maxRank >= RANK_SUBSETS && subsets()) continue;
    return false;
  }
  return true;
}

function gradePuzzle(puzzle) {
  for (const rank of [RANK_SINGLES, RANK_LOCKED, RANK_SUBSETS]) {
    if (logicalSolve(puzzle, rank)) return rank;
  }
  return RANK_GUESS;
}

// ---- Puzzle generation ----

/* `clueTarget` is where symmetric carving stops; `clueFloor` is how far the
 * puzzle may be carved further if it is still easier than the level promises. */
const DIFFICULTIES = {
  easy: { label: "Easy", maxRank: RANK_SINGLES, clueTarget: 40, clueFloor: 40 },
  medium: { label: "Medium", maxRank: RANK_LOCKED, clueTarget: 36, clueFloor: 26 },
  hard: { label: "Hard", maxRank: RANK_SUBSETS, clueTarget: 30, clueFloor: 24 },
  expert: { label: "Expert", maxRank: RANK_GUESS, clueTarget: 25, clueFloor: 21 },
};

const RANK_LABEL = {
  [RANK_SINGLES]: "Singles only",
  [RANK_LOCKED]: "Locked candidates",
  [RANK_SUBSETS]: "Pairs & triples",
  [RANK_GUESS]: "Advanced",
};

/* Removes clues while the grid keeps a unique solution and stays crackable
 * within `maxRank`. The first pass drops cells in 180°-symmetric pairs for a
 * tidy grid; if that leaves the puzzle easier than the level promises, a
 * second pass removes single cells until it needs the advertised technique. */
function carve(solution, { maxRank, clueTarget, clueFloor }) {
  const grid = Uint8Array.from(solution);
  let clues = 81;

  function dig(floor, symmetric, stopWhen) {
    for (const i of shuffle([...CELLS])) {
      if (clues <= floor) break;
      const j = 80 - i;
      const group = symmetric && i !== j ? [i, j] : [i];
      if (group.some((c) => grid[c] === 0)) continue;
      if (clues - group.length < floor) continue;

      const saved = group.map((c) => grid[c]);
      for (const c of group) grid[c] = 0;

      const ok =
        countSolutions(grid, 2) === 1 &&
        (maxRank >= RANK_GUESS || logicalSolve(grid, maxRank));
      if (ok) {
        clues -= group.length;
        if (stopWhen && stopWhen()) break;
      } else {
        group.forEach((c, k) => {
          grid[c] = saved[k];
        });
      }
    }
  }

  dig(clueTarget, true, null);
  if (maxRank > RANK_SINGLES && gradePuzzle(grid) < maxRank) {
    dig(clueFloor, false, () => gradePuzzle(grid) >= maxRank);
  }
  return grid;
}

/* Tries a few carvings and keeps the one that best matches the level — hardest
 * grade first, then fewest clues. */
function generatePuzzle(diffId) {
  const diff = DIFFICULTIES[diffId];
  let best = null;

  for (let attempt = 0; attempt < 6; attempt++) {
    const solution = generateSolution();
    const puzzle = carve(solution, diff);
    const rank = gradePuzzle(puzzle);
    const clues = puzzle.reduce((n, v) => n + (v ? 1 : 0), 0);

    if (!best || rank > best.rank || (rank === best.rank && clues < best.clues)) {
      best = { puzzle, solution, rank, clues };
    }
    if (rank === diff.maxRank) break;
  }
  return best;
}

// ---- DOM ----
const boardEl = document.getElementById("board");
const numpadEl = document.getElementById("numpad");
const diffPickerEl = document.getElementById("diff-picker");
const statTimeEl = document.getElementById("stat-time");
const statLeftEl = document.getElementById("stat-left");
const statMistakesEl = document.getElementById("stat-mistakes");
const statTechniqueEl = document.getElementById("stat-technique");
const btnNotes = document.getElementById("btn-notes");
const btnErase = document.getElementById("btn-erase");
const btnUndo = document.getElementById("btn-undo");
const btnHint = document.getElementById("btn-hint");
const overlayEl = document.getElementById("end-overlay");
const endTitleEl = document.getElementById("end-title");
const endMessageEl = document.getElementById("end-message");
const endStatsEl = document.getElementById("end-stats");
const toastEl = document.getElementById("toast");

const BEST_KEY = "webgames.sudoku.best";

// ---- Game state ----
let difficulty = "easy";
let given = new Uint8Array(81); // the clues; 0 where the player must fill in
let solution = new Uint8Array(81);
let values = new Uint8Array(81); // what is on the board right now
let notes = new Uint16Array(81); // pencil marks, one bit per digit
let hinted = new Uint8Array(81); // cells revealed by the Hint button
let undoStack = [];
let selected = -1;
let notesMode = false;
let mistakes = 0;
let hintsUsed = 0;
let solved = false;
let seconds = 0;
let timerId = null;
let cellEls = [];
let padEls = [];

function buildBoard() {
  boardEl.innerHTML = "";
  cellEls = [];
  for (let i = 0; i < 81; i++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    const r = ROW_OF[i];
    const c = COL_OF[i];
    if (c % 3 === 2 && c !== 8) cell.classList.add("cell--band-r");
    if (r % 3 === 2 && r !== 8) cell.classList.add("cell--band-b");
    if (c === 8) cell.classList.add("cell--last-col");
    if (r === 8) cell.classList.add("cell--last-row");

    const value = document.createElement("span");
    value.className = "cell__value";
    cell.appendChild(value);

    const noteGrid = document.createElement("span");
    noteGrid.className = "cell__notes";
    for (let d = 1; d <= 9; d++) {
      const n = document.createElement("span");
      n.textContent = d;
      noteGrid.appendChild(n);
    }
    cell.appendChild(noteGrid);

    cell.addEventListener("click", () => select(i));
    boardEl.appendChild(cell);
    cellEls.push(cell);
  }
}

function buildNumpad() {
  numpadEl.innerHTML = "";
  padEls = [];
  for (let d = 1; d <= 9; d++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pad-btn";
    btn.innerHTML = `<span class="pad-btn__digit">${d}</span><span class="pad-btn__count"></span>`;
    btn.addEventListener("click", () => enterDigit(d));
    numpadEl.appendChild(btn);
    padEls.push(btn);
  }
}

function buildDifficultyPicker() {
  for (const btn of diffPickerEl.querySelectorAll(".seg__btn")) {
    btn.addEventListener("click", () => {
      difficulty = btn.dataset.diff;
      newGame();
    });
  }
}

// ---- New game ----
function newGame() {
  stopTimer();
  solved = true; // block input while we generate
  overlayEl.classList.add("overlay--hidden");
  boardEl.classList.add("board--loading");
  for (const btn of diffPickerEl.querySelectorAll(".seg__btn")) {
    btn.classList.toggle("is-active", btn.dataset.diff === difficulty);
  }
  statTechniqueEl.textContent = "…";

  // Let the loading state paint before the generator blocks the thread.
  setTimeout(() => {
    const { puzzle, solution: sol, rank } = generatePuzzle(difficulty);
    given = puzzle;
    solution = sol;
    values = Uint8Array.from(puzzle);
    notes = new Uint16Array(81);
    hinted = new Uint8Array(81);
    undoStack = [];
    selected = -1;
    notesMode = false;
    mistakes = 0;
    hintsUsed = 0;
    seconds = 0;
    solved = false;

    statTechniqueEl.textContent = RANK_LABEL[rank];
    boardEl.classList.remove("board--loading");
    render();
    startTimer();
  }, 20);
}

// ---- Input ----
function select(i) {
  selected = i;
  render();
}

function move(dr, dc) {
  if (selected < 0) {
    select(0);
    return;
  }
  const r = Math.min(8, Math.max(0, ROW_OF[selected] + dr));
  const c = Math.min(8, Math.max(0, COL_OF[selected] + dc));
  select(r * 9 + c);
}

// Records the pre-change state of the given cells so Undo can restore it.
function pushUndo(indices) {
  undoStack.push(indices.map((i) => [i, values[i], notes[i], hinted[i]]));
  if (undoStack.length > 200) undoStack.shift();
}

function enterDigit(d) {
  if (solved || selected < 0) return;
  const i = selected;
  if (given[i]) {
    flash(i);
    return;
  }

  if (notesMode) {
    if (values[i]) return;
    pushUndo([i]);
    notes[i] ^= 1 << (d - 1);
    render();
    return;
  }

  if (values[i] === d) {
    // Tapping the same digit again clears the cell.
    pushUndo([i]);
    values[i] = 0;
    hinted[i] = 0;
    render();
    return;
  }

  // Placing a digit also strips it from the pencil marks of every peer.
  const touched = [i, ...PEERS[i].filter((j) => !values[j] && notes[j] & (1 << (d - 1)))];
  pushUndo(touched);
  values[i] = d;
  notes[i] = 0;
  hinted[i] = 0;
  for (const j of touched.slice(1)) notes[j] &= ~(1 << (d - 1));

  if (d !== solution[i]) {
    mistakes++;
    flash(i);
  }
  render();
  checkWin();
}

function eraseCell() {
  if (solved || selected < 0) return;
  const i = selected;
  if (given[i] || (!values[i] && !notes[i])) return;
  pushUndo([i]);
  values[i] = 0;
  notes[i] = 0;
  hinted[i] = 0;
  render();
}

function undo() {
  if (solved || undoStack.length === 0) return;
  for (const [i, v, n, h] of undoStack.pop()) {
    values[i] = v;
    notes[i] = n;
    hinted[i] = h;
  }
  render();
}

function hint() {
  if (solved) return;
  // Fill the selected cell if it needs it, otherwise pick any empty cell.
  let target = selected >= 0 && !given[selected] && values[selected] !== solution[selected]
    ? selected
    : -1;
  if (target === -1) {
    const empties = CELLS.filter((i) => !given[i] && values[i] !== solution[i]);
    if (empties.length === 0) return;
    target = empties[Math.floor(Math.random() * empties.length)];
  }

  const d = solution[target];
  const touched = [target, ...PEERS[target].filter((j) => !values[j] && notes[j] & (1 << (d - 1)))];
  pushUndo(touched);
  values[target] = d;
  notes[target] = 0;
  hinted[target] = 1;
  for (const j of touched.slice(1)) notes[j] &= ~(1 << (d - 1));

  hintsUsed++;
  selected = target;
  render();
  checkWin();
}

function toggleNotes() {
  notesMode = !notesMode;
  btnNotes.classList.toggle("is-active", notesMode);
  btnNotes.setAttribute("aria-pressed", notesMode ? "true" : "false");
}

// ---- Rendering ----
function render() {
  const selValue = selected >= 0 ? values[selected] : 0;

  for (let i = 0; i < 81; i++) {
    const cell = cellEls[i];
    const value = values[i];
    const wrong = value !== 0 && value !== solution[i];

    cell.classList.toggle("cell--given", given[i] !== 0);
    cell.classList.toggle("cell--hinted", hinted[i] !== 0);
    cell.classList.toggle("cell--error", wrong);
    cell.classList.toggle("cell--selected", i === selected);
    cell.classList.toggle(
      "cell--peer",
      selected >= 0 &&
        i !== selected &&
        (ROW_OF[i] === ROW_OF[selected] ||
          COL_OF[i] === COL_OF[selected] ||
          BOX_OF[i] === BOX_OF[selected])
    );
    cell.classList.toggle("cell--match", selValue !== 0 && value === selValue && i !== selected);

    cell.firstChild.textContent = value || "";
    const noteSpans = cell.lastChild.children;
    const showNotes = !value && notes[i] !== 0;
    cell.classList.toggle("cell--has-notes", showNotes);
    for (let d = 1; d <= 9; d++) {
      noteSpans[d - 1].classList.toggle("is-on", showNotes && (notes[i] & (1 << (d - 1))) !== 0);
    }
  }

  let left = 0;
  const counts = new Array(10).fill(0);
  for (let i = 0; i < 81; i++) {
    if (values[i]) counts[values[i]]++;
    else left++;
  }
  for (let d = 1; d <= 9; d++) {
    padEls[d - 1].classList.toggle("is-done", counts[d] >= 9);
    padEls[d - 1].lastChild.textContent = Math.max(0, 9 - counts[d]);
  }

  statLeftEl.textContent = left;
  statMistakesEl.textContent = mistakes;
  btnUndo.disabled = undoStack.length === 0;
}

function flash(i) {
  const cell = cellEls[i];
  cell.classList.remove("cell--flash");
  void cell.offsetWidth; // restart the animation
  cell.classList.add("cell--flash");
}

let toastTimer = null;
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("toast--show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("toast--show"), 1600);
}

// ---- Timer ----
function formatTime(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function startTimer() {
  statTimeEl.textContent = formatTime(0);
  timerId = setInterval(() => {
    seconds++;
    statTimeEl.textContent = formatTime(seconds);
  }, 1000);
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
}

// ---- Win ----
function checkWin() {
  for (let i = 0; i < 81; i++) if (values[i] !== solution[i]) return;
  solved = true;
  stopTimer();

  const clean = mistakes === 0 && hintsUsed === 0;
  const best = loadBest();
  const previous = best[difficulty];
  const isRecord = clean && (previous == null || seconds < previous);
  if (isRecord) {
    best[difficulty] = seconds;
    saveBest(best);
  }

  setTimeout(() => {
    boardEl.classList.add("board--solved");
    endTitleEl.textContent = clean ? "Flawless!" : "Solved!";
    endMessageEl.textContent = isRecord
      ? `New best time on ${DIFFICULTIES[difficulty].label}.`
      : clean
        ? `No mistakes, no hints — a clean ${DIFFICULTIES[difficulty].label} grid.`
        : `${DIFFICULTIES[difficulty].label} grid complete.`;
    endStatsEl.innerHTML = `
      <div class="end-stat"><span class="end-stat__value">${formatTime(seconds)}</span><span class="end-stat__label">Time</span></div>
      <div class="end-stat"><span class="end-stat__value">${mistakes}</span><span class="end-stat__label">Mistakes</span></div>
      <div class="end-stat"><span class="end-stat__value">${hintsUsed}</span><span class="end-stat__label">Hints</span></div>
      <div class="end-stat"><span class="end-stat__value">${best[difficulty] != null ? formatTime(best[difficulty]) : "—"}</span><span class="end-stat__label">Best</span></div>
    `;
    overlayEl.classList.remove("overlay--hidden");
    setTimeout(() => boardEl.classList.remove("board--solved"), 900);
  }, 300);
}

// Best times are only recorded for runs with no mistakes and no hints.
function loadBest() {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore corrupt/unavailable storage */
  }
  return {};
}

function saveBest(best) {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    /* storage may be unavailable; best times simply won't persist */
  }
}

// ---- Wiring ----
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  if (!overlayEl.classList.contains("overlay--hidden")) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      newGame();
    }
    return;
  }

  const key = e.key;
  if (/^[1-9]$/.test(key)) {
    enterDigit(Number(key));
  } else if (key === "0" || key === "Backspace" || key === "Delete") {
    eraseCell();
  } else if (key === "ArrowUp") {
    move(-1, 0);
  } else if (key === "ArrowDown") {
    move(1, 0);
  } else if (key === "ArrowLeft") {
    move(0, -1);
  } else if (key === "ArrowRight") {
    move(0, 1);
  } else if (key === "n" || key === "N") {
    toggleNotes();
  } else if (key === "h" || key === "H") {
    hint();
  } else if (key === "u" || key === "U") {
    undo();
  } else {
    return;
  }
  e.preventDefault();
});

btnNotes.addEventListener("click", toggleNotes);
btnErase.addEventListener("click", eraseCell);
btnUndo.addEventListener("click", undo);
btnHint.addEventListener("click", () => {
  if (solved) return;
  hint();
  showToast("Hint used");
});
document.getElementById("btn-new").addEventListener("click", newGame);
document.getElementById("btn-play-again").addEventListener("click", newGame);

buildBoard();
buildNumpad();
buildDifficultyPicker();
newGame();
