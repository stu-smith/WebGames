import { ANSWERS, EXTRA } from "./words.js";

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;

// Set of every word accepted as a guess.
const VALID_WORDS = new Set([...ANSWERS, ...EXTRA]);

const STATS_KEY = "webgames.wordle.stats";

// ---- DOM ----
const boardEl = document.getElementById("board");
const keyboardEl = document.getElementById("keyboard");
const toastEl = document.getElementById("toast");
const overlayEl = document.getElementById("end-overlay");
const endTitleEl = document.getElementById("end-title");
const endMessageEl = document.getElementById("end-message");
const endStatsEl = document.getElementById("end-stats");

// ---- Game state ----
let answer = "";
let currentRow = 0;
let currentGuess = "";
let gameOver = false;
let tiles = []; // tiles[row][col]
const keyEls = {}; // letter -> button element

const KEY_ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["enter", "z", "x", "c", "v", "b", "n", "m", "back"],
];

// Ranking of states so a key only ever "upgrades" its colour.
const STATE_RANK = { absent: 0, present: 1, correct: 2 };

function buildBoard() {
  boardEl.innerHTML = "";
  tiles = [];
  for (let r = 0; r < MAX_GUESSES; r++) {
    const row = document.createElement("div");
    row.className = "board-row";
    const rowTiles = [];
    for (let c = 0; c < WORD_LENGTH; c++) {
      const tile = document.createElement("div");
      tile.className = "tile";
      row.appendChild(tile);
      rowTiles.push(tile);
    }
    boardEl.appendChild(row);
    tiles.push(rowTiles);
  }
}

function buildKeyboard() {
  keyboardEl.innerHTML = "";
  for (const rowKeys of KEY_ROWS) {
    const rowEl = document.createElement("div");
    rowEl.className = "keyboard-row";
    for (const key of rowKeys) {
      const btn = document.createElement("button");
      btn.className = "key";
      if (key === "enter" || key === "back") {
        btn.classList.add("key--wide");
        btn.textContent = key === "enter" ? "Enter" : "⌫";
      } else {
        btn.textContent = key;
        keyEls[key] = btn;
      }
      btn.addEventListener("click", () => handleKey(key));
      rowEl.appendChild(btn);
    }
    keyboardEl.appendChild(rowEl);
  }
}

function newGame() {
  answer = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
  currentRow = 0;
  currentGuess = "";
  gameOver = false;
  overlayEl.classList.add("overlay--hidden");
  buildBoard();
  // Reset keyboard colours.
  for (const btn of Object.values(keyEls)) {
    btn.classList.remove("key--correct", "key--present", "key--absent");
  }
}

function handleKey(key) {
  if (gameOver) return;

  if (key === "enter") {
    submitGuess();
  } else if (key === "back") {
    if (currentGuess.length > 0) {
      currentGuess = currentGuess.slice(0, -1);
      renderCurrentRow();
    }
  } else if (/^[a-z]$/.test(key)) {
    if (currentGuess.length < WORD_LENGTH) {
      currentGuess += key;
      renderCurrentRow();
    }
  }
}

function renderCurrentRow() {
  const rowTiles = tiles[currentRow];
  for (let c = 0; c < WORD_LENGTH; c++) {
    const tile = rowTiles[c];
    const letter = currentGuess[c] || "";
    tile.textContent = letter;
    tile.classList.toggle("tile--filled", letter !== "");
  }
}

function submitGuess() {
  if (currentGuess.length < WORD_LENGTH) {
    invalidRow("Not enough letters");
    return;
  }
  if (!VALID_WORDS.has(currentGuess)) {
    invalidRow("Not in word list");
    return;
  }

  const result = scoreGuess(currentGuess, answer);
  revealRow(currentRow, result);

  const won = currentGuess === answer;
  const guessNumber = currentRow + 1;
  const finishedGuess = currentGuess;

  currentRow++;
  currentGuess = "";

  if (won) {
    gameOver = true;
    setTimeout(() => {
      celebrateRow(currentRow - 1);
      recordAndShowEnd(true, guessNumber);
    }, WORD_LENGTH * 300 + 200);
  } else if (currentRow >= MAX_GUESSES) {
    gameOver = true;
    setTimeout(() => recordAndShowEnd(false, guessNumber), WORD_LENGTH * 300 + 200);
  }
}

// Returns an array of "correct" | "present" | "absent" for each position,
// handling duplicate letters the way Wordle does.
function scoreGuess(guess, target) {
  const result = new Array(WORD_LENGTH).fill("absent");
  const counts = {};
  for (const ch of target) counts[ch] = (counts[ch] || 0) + 1;

  // First pass: exact matches.
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === target[i]) {
      result[i] = "correct";
      counts[guess[i]]--;
    }
  }
  // Second pass: present-but-misplaced, limited by remaining counts.
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === "correct") continue;
    const ch = guess[i];
    if (counts[ch] > 0) {
      result[i] = "present";
      counts[ch]--;
    }
  }
  return result;
}

function revealRow(row, result) {
  const rowTiles = tiles[row];
  for (let c = 0; c < WORD_LENGTH; c++) {
    const tile = rowTiles[c];
    const state = result[c];
    // Stagger the flip; apply colour at the midpoint of each flip.
    setTimeout(() => {
      tile.classList.add("tile--reveal");
      setTimeout(() => {
        tile.classList.remove("tile--filled");
        tile.classList.add(`tile--${state}`);
        updateKey(rowTiles[c].textContent.toLowerCase(), state);
      }, 250);
    }, c * 300);
  }
}

function updateKey(letter, state) {
  const btn = keyEls[letter];
  if (!btn) return;
  const current =
    (btn.classList.contains("key--correct") && "correct") ||
    (btn.classList.contains("key--present") && "present") ||
    (btn.classList.contains("key--absent") && "absent") ||
    null;
  if (current && STATE_RANK[current] >= STATE_RANK[state]) return;
  btn.classList.remove("key--correct", "key--present", "key--absent");
  btn.classList.add(`key--${state}`);
}

function celebrateRow(row) {
  const rowTiles = tiles[row];
  rowTiles.forEach((tile, i) => {
    setTimeout(() => {
      tile.classList.add("tile--win");
      setTimeout(() => tile.classList.remove("tile--win"), 600);
    }, i * 100);
  });
}

function invalidRow(message) {
  showToast(message);
  const rowEl = boardEl.children[currentRow];
  rowEl.classList.add("board-row--invalid");
  setTimeout(() => rowEl.classList.remove("board-row--invalid"), 400);
}

let toastTimer = null;
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("toast--show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("toast--show"), 1500);
}

// ---- Stats (localStorage) ----
function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore corrupt/unavailable storage */
  }
  return { played: 0, wins: 0, streak: 0, maxStreak: 0 };
}

function saveStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    /* storage may be unavailable; stats simply won't persist */
  }
}

function recordAndShowEnd(won, guessNumber) {
  const stats = loadStats();
  stats.played++;
  if (won) {
    stats.wins++;
    stats.streak++;
    stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
  } else {
    stats.streak = 0;
  }
  saveStats(stats);
  showEnd(won, guessNumber, stats);
}

function showEnd(won, guessNumber, stats) {
  if (won) {
    endTitleEl.textContent = guessNumber === 1 ? "Genius!" : "You got it!";
    endMessageEl.textContent = `Solved in ${guessNumber} ${guessNumber === 1 ? "guess" : "guesses"}.`;
  } else {
    endTitleEl.textContent = "Out of guesses";
    endMessageEl.innerHTML = `The word was <strong>${answer.toUpperCase()}</strong>.`;
  }

  const winPct = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
  endStatsEl.innerHTML = `
    <div class="end-stat"><span class="end-stat__value">${stats.played}</span><span class="end-stat__label">Played</span></div>
    <div class="end-stat"><span class="end-stat__value">${winPct}%</span><span class="end-stat__label">Win %</span></div>
    <div class="end-stat"><span class="end-stat__value">${stats.streak}</span><span class="end-stat__label">Streak</span></div>
    <div class="end-stat"><span class="end-stat__value">${stats.maxStreak}</span><span class="end-stat__label">Best</span></div>
  `;
  overlayEl.classList.remove("overlay--hidden");
}

// ---- Input wiring ----
document.addEventListener("keydown", (e) => {
  if (!overlayEl.classList.contains("overlay--hidden")) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key;
  if (key === "Enter") {
    handleKey("enter");
  } else if (key === "Backspace") {
    handleKey("back");
  } else if (/^[a-zA-Z]$/.test(key)) {
    handleKey(key.toLowerCase());
  }
});

document.getElementById("btn-new").addEventListener("click", newGame);
document.getElementById("btn-play-again").addEventListener("click", newGame);

buildKeyboard();
newGame();
