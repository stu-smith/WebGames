/* Klondike Solitaire — WebGames
 * Vanilla JS. Cards are absolutely positioned in the board and animated via
 * CSS transitions on `transform`, so every state change eases smoothly.
 */
(() => {
  'use strict';

  const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
  const SYMBOL = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
  const RED = new Set(['hearts', 'diamonds']);
  const RANK_LABEL = [null, 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  // Pip coordinates (x,y as fraction of the pip area) for ranks A–10.
  const PIPS = {
    1: [[0.5, 0.5]],
    2: [[0.5, 0.16], [0.5, 0.84]],
    3: [[0.5, 0.16], [0.5, 0.5], [0.5, 0.84]],
    4: [[0.28, 0.16], [0.72, 0.16], [0.28, 0.84], [0.72, 0.84]],
    5: [[0.28, 0.16], [0.72, 0.16], [0.5, 0.5], [0.28, 0.84], [0.72, 0.84]],
    6: [[0.28, 0.16], [0.72, 0.16], [0.28, 0.5], [0.72, 0.5], [0.28, 0.84], [0.72, 0.84]],
    7: [[0.28, 0.16], [0.72, 0.16], [0.5, 0.33], [0.28, 0.5], [0.72, 0.5], [0.28, 0.84], [0.72, 0.84]],
    8: [[0.28, 0.16], [0.72, 0.16], [0.5, 0.33], [0.28, 0.5], [0.72, 0.5], [0.5, 0.67], [0.28, 0.84], [0.72, 0.84]],
    9: [[0.28, 0.15], [0.72, 0.15], [0.28, 0.38], [0.72, 0.38], [0.5, 0.5], [0.28, 0.62], [0.72, 0.62], [0.28, 0.85], [0.72, 0.85]],
    10: [[0.28, 0.15], [0.72, 0.15], [0.5, 0.27], [0.28, 0.38], [0.72, 0.38], [0.28, 0.62], [0.72, 0.62], [0.5, 0.73], [0.28, 0.85], [0.72, 0.85]],
  };

  // ---- DOM refs ----
  const board = document.getElementById('board');
  const elTime = document.getElementById('time');
  const elMoves = document.getElementById('moves');
  const elScore = document.getElementById('score');
  const winOverlay = document.getElementById('win-overlay');
  const winSummary = document.getElementById('win-summary');

  // ---- Layout metrics (recomputed on resize) ----
  const L = { cardW: 100, cardH: 140, colGap: 12, fanDown: 16, fanUp: 30, wasteFan: 22, topH: 0, cols: [] };

  // ---- Game state ----
  // A "card" = { id, suit, rank, faceUp, el, x, y }
  // Piles: stock[], waste[], foundations[4][], tableau[7][]
  let stock, waste, foundations, tableau, allCards;
  let moves, score, drawCount, startTime, timerId, gameWon, animating;

  // ========================================================================
  // Layout
  // ========================================================================
  function computeLayout() {
    const wrapW = board.parentElement.clientWidth;
    const avail = Math.min(wrapW - 24, 1040);
    // 7 columns with gaps of 0.11 * cardW
    const gapRatio = 0.11;
    const cardW = Math.max(52, avail / (7 + 6 * gapRatio));
    const colGap = cardW * gapRatio;
    L.cardW = Math.round(cardW);
    L.cardH = Math.round(cardW * 1.4);
    L.colGap = Math.round(colGap);
    L.fanDown = Math.round(L.cardH * 0.13);
    L.fanUp = Math.round(L.cardH * 0.26);
    L.wasteFan = Math.round(L.cardW * 0.28);
    L.topH = L.cardH + Math.round(L.cardH * 0.32);

    L.cols = [];
    for (let i = 0; i < 7; i++) L.cols[i] = Math.round(i * (L.cardW + L.colGap));

    const boardW = L.cols[6] + L.cardW;
    board.style.setProperty('--card-w', L.cardW + 'px');
    board.style.setProperty('--card-h', L.cardH + 'px');
    board.style.width = boardW + 'px';
    board.style.height = (L.topH + L.cardH * 4.5) + 'px';
  }

  // Anchor (top-left) position for a pile.
  function pileAnchor(kind, index) {
    if (kind === 'stock') return { x: L.cols[0], y: 0 };
    if (kind === 'waste') return { x: L.cols[1], y: 0 };
    if (kind === 'foundation') return { x: L.cols[3 + index], y: 0 };
    return { x: L.cols[index], y: L.topH }; // tableau
  }

  // Position for a card at `idx` within a pile.
  function cardPosition(kind, pileIndex, idx, pile) {
    const a = pileAnchor(kind, pileIndex);
    if (kind === 'tableau') {
      let y = a.y;
      for (let i = 0; i < idx; i++) y += pile[i].faceUp ? L.fanUp : L.fanDown;
      return { x: a.x, y };
    }
    if (kind === 'waste') {
      // Fan the last up-to-3 waste cards to the right.
      const shown = Math.min(3, pile.length);
      const start = pile.length - shown;
      const rel = Math.max(0, idx - start);
      return { x: a.x + rel * L.wasteFan, y: a.y };
    }
    return { x: a.x, y: a.y };
  }

  // ========================================================================
  // Deck / setup
  // ========================================================================
  function makeDeck() {
    const deck = [];
    let id = 0;
    for (const suit of SUITS)
      for (let rank = 1; rank <= 13; rank++)
        deck.push({ id: id++, suit, rank, faceUp: false, el: null, x: 0, y: 0 });
    return deck;
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildCardElement(card) {
    const el = document.createElement('div');
    el.className = 'card' + (RED.has(card.suit) ? ' red' : '');
    el.dataset.id = card.id;

    const inner = document.createElement('div');
    inner.className = 'card__inner';

    const back = document.createElement('div');
    back.className = 'card__back';

    const front = document.createElement('div');
    front.className = 'card__front';
    front.appendChild(cornerEl('tl', card));
    front.appendChild(cornerEl('br', card));

    if (card.rank <= 10) {
      const pips = document.createElement('div');
      pips.className = 'card__pips';
      const sym = SYMBOL[card.suit];
      for (const [x, y] of PIPS[card.rank]) {
        const p = document.createElement('span');
        p.className = 'pip' + (y > 0.5 ? ' flip' : '');
        p.textContent = sym;
        // Pip area is inset from the corners.
        p.style.left = (18 + x * 64) + '%';
        p.style.top = (12 + y * 76) + '%';
        pips.appendChild(p);
      }
      front.appendChild(pips);
    } else {
      const art = document.createElement('div');
      art.className = 'card__face-art';
      const suit = document.createElement('span');
      suit.className = 'card__face-suit';
      suit.textContent = SYMBOL[card.suit];
      const letter = document.createElement('span');
      letter.className = 'card__face-letter';
      letter.textContent = RANK_LABEL[card.rank];
      art.appendChild(suit);
      art.appendChild(letter);
      front.appendChild(art);
    }

    inner.appendChild(back);
    inner.appendChild(front);
    el.appendChild(inner);
    el.addEventListener('pointerdown', onPointerDown);
    card.el = el;
    return el;
  }

  function cornerEl(pos, card) {
    const c = document.createElement('div');
    c.className = 'card__corner card__corner--' + pos;
    const r = document.createElement('span');
    r.className = 'rank';
    r.textContent = RANK_LABEL[card.rank];
    const s = document.createElement('span');
    s.className = 'suit';
    s.textContent = SYMBOL[card.suit];
    c.appendChild(r);
    c.appendChild(s);
    return c;
  }

  function buildSlots() {
    board.querySelectorAll('.pile-slot').forEach((s) => s.remove());
    const add = (kind, index, mark, extraClass) => {
      const a = pileAnchor(kind, index);
      const slot = document.createElement('div');
      slot.className = 'pile-slot' + (extraClass ? ' ' + extraClass : '');
      slot.style.transform = `translate(${a.x}px, ${a.y}px)`;
      slot.dataset.kind = kind;
      slot.dataset.index = index;
      if (mark) {
        const m = document.createElement('span');
        m.className = 'pile-slot__mark';
        m.textContent = mark;
        slot.appendChild(m);
      }
      board.insertBefore(slot, board.firstChild);
      return slot;
    };
    stockSlot = add('stock', 0, '↻', 'pile-slot--recycle');
    stockSlot.addEventListener('click', onStockClick);
    add('waste', 0, '', 'pile-slot--waste');
    for (let i = 0; i < 4; i++) add('foundation', i, SYMBOL[SUITS[i]], 'pile-slot--foundation');
    for (let i = 0; i < 7; i++) add('tableau', i, '', 'pile-slot--tableau');
  }
  let stockSlot;

  // ========================================================================
  // Rendering
  // ========================================================================
  function positionCard(card, kind, pileIndex, idx, pile, instant) {
    const pos = cardPosition(kind, pileIndex, idx, pile);
    card.x = pos.x;
    card.y = pos.y;
    if (instant) {
      card.el.style.transition = 'none';
      card.el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      // Force reflow then restore transition.
      void card.el.offsetWidth;
      card.el.style.transition = '';
    } else {
      card.el.style.transition = '';
      card.el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    }
    card.el.classList.toggle('face-down', !card.faceUp);
  }

  function render(instant) {
    let z = 0;
    const place = (pile, kind, pileIndex) => {
      pile.forEach((card, idx) => {
        card.el.style.zIndex = z++;
        positionCard(card, kind, pileIndex, idx, pile, instant);
        updateMovable(card, pile, idx, kind);
      });
    };
    place(stock, 'stock', 0);
    place(waste, 'waste', 0);
    foundations.forEach((f, i) => place(f, 'foundation', i));
    tableau.forEach((t, i) => place(t, 'tableau', i));
  }

  function updateMovable(card, pile, idx, kind) {
    let movable = false;
    if (kind === 'waste') movable = idx === pile.length - 1;
    else if (kind === 'foundation') movable = idx === pile.length - 1;
    else if (kind === 'tableau') movable = card.faceUp && isSequence(pile.slice(idx));
    card.el.classList.toggle('movable', movable);
  }

  // ========================================================================
  // Rules
  // ========================================================================
  function isSequence(cards) {
    for (let i = 0; i < cards.length - 1; i++) {
      const a = cards[i], b = cards[i + 1];
      if (!a.faceUp || !b.faceUp) return false;
      if (RED.has(a.suit) === RED.has(b.suit)) return false;
      if (b.rank !== a.rank - 1) return false;
    }
    return true;
  }

  function canDropOnFoundation(card, foundation) {
    if (foundation.length === 0) return card.rank === 1;
    const top = foundation[foundation.length - 1];
    return top.suit === card.suit && card.rank === top.rank + 1;
  }

  function canDropOnTableau(card, pile) {
    if (pile.length === 0) return card.rank === 13;
    const top = pile[pile.length - 1];
    if (!top.faceUp) return false;
    return RED.has(top.suit) !== RED.has(card.suit) && card.rank === top.rank - 1;
  }

  // ========================================================================
  // Locating cards
  // ========================================================================
  function findCard(id) {
    for (const kind of ['stock', 'waste']) {
      const pile = kind === 'stock' ? stock : waste;
      const idx = pile.findIndex((c) => c.id === id);
      if (idx >= 0) return { kind, pileIndex: 0, idx, pile };
    }
    for (let i = 0; i < foundations.length; i++) {
      const idx = foundations[i].findIndex((c) => c.id === id);
      if (idx >= 0) return { kind: 'foundation', pileIndex: i, idx, pile: foundations[i] };
    }
    for (let i = 0; i < tableau.length; i++) {
      const idx = tableau[i].findIndex((c) => c.id === id);
      if (idx >= 0) return { kind: 'tableau', pileIndex: i, idx, pile: tableau[i] };
    }
    return null;
  }

  // ========================================================================
  // Moves
  // ========================================================================
  function bumpMoves() { moves++; elMoves.textContent = moves; }
  function addScore(n) { score = Math.max(0, score + n); elScore.textContent = score; }

  function flipExposed(pile) {
    if (pile.length) {
      const top = pile[pile.length - 1];
      if (!top.faceUp) { top.faceUp = true; addScore(5); return true; }
    }
    return false;
  }

  // Move a group of cards (by id of the bottom card) to a destination pile.
  function commitMove(cardId, dest) {
    const src = findCard(cardId);
    if (!src) return false;
    const moving = src.pile.slice(src.idx);
    src.pile.splice(src.idx);

    let destPile;
    if (dest.kind === 'foundation') { destPile = foundations[dest.pileIndex]; addScore(10); }
    else destPile = tableau[dest.pileIndex];

    // Landing feedback
    moving.forEach((c) => {
      destPile.push(c);
      c.el.classList.remove('just-landed');
      void c.el.offsetWidth;
      c.el.classList.add('just-landed');
    });

    if (src.kind === 'tableau') flipExposed(src.pile);
    if (src.kind === 'waste' || src.kind === 'foundation') { /* no flip */ }
    bumpMoves();
    render(false);
    checkWin();
    return true;
  }

  // Try to auto-send a card (double-click) to a foundation, else nothing.
  function tryAutoFoundation(cardId) {
    const src = findCard(cardId);
    if (!src) return false;
    if (src.idx !== src.pile.length - 1) return false; // only single top card
    const card = src.pile[src.idx];
    if (!card.faceUp) return false;
    for (let i = 0; i < 4; i++) {
      if (canDropOnFoundation(card, foundations[i])) {
        commitMove(cardId, { kind: 'foundation', pileIndex: i });
        return true;
      }
    }
    return false;
  }

  // ========================================================================
  // Stock / waste
  // ========================================================================
  function onStockClick() {
    if (gameWon || animating) return;
    if (stock.length === 0) {
      if (waste.length === 0) return;
      // Recycle waste -> stock (reversed, face down)
      while (waste.length) {
        const c = waste.pop();
        c.faceUp = false;
        stock.push(c);
      }
      addScore(-2);
      bumpMoves();
      startTimerIfNeeded();
      render(false);
      return;
    }
    const n = Math.min(drawCount, stock.length);
    for (let i = 0; i < n; i++) {
      const c = stock.pop();
      c.faceUp = true;
      waste.push(c);
    }
    bumpMoves();
    startTimerIfNeeded();
    render(false);
  }

  // ========================================================================
  // Drag & drop (pointer events)
  // ========================================================================
  let drag = null;

  function onPointerDown(e) {
    if (gameWon || animating) return;
    if (e.button !== undefined && e.button !== 0) return;
    const el = e.currentTarget;
    const id = Number(el.dataset.id);
    const loc = findCard(id);
    if (!loc) return;

    // Stock cards cover the stock slot, so its click handler never fires.
    // Treat a press on any stock card as a deal.
    if (loc.kind === 'stock') { onStockClick(); return; }

    const card = loc.pile[loc.idx];
    if (!card.faceUp) return;

    // Determine the group being grabbed.
    let group;
    if (loc.kind === 'tableau') {
      group = loc.pile.slice(loc.idx);
      if (!isSequence(group)) return;
    } else {
      if (loc.idx !== loc.pile.length - 1) return; // waste/foundation top only
      group = [card];
    }

    startTimerIfNeeded();

    const rect = board.getBoundingClientRect();
    drag = {
      id,
      loc,
      group,
      startX: e.clientX,
      startY: e.clientY,
      boardRect: rect,
      offsets: group.map((c) => ({ x: c.x, y: c.y })),
      moved: false,
      pointerId: e.pointerId,
      lastTarget: null,
    };

    group.forEach((c) => { c.el.classList.add('dragging'); c.el.style.transition = 'none'; });
    // Re-stack dragged group above everything.
    group.forEach((c, i) => { c.el.style.zIndex = 10000 + i; });

    el.setPointerCapture(e.pointerId);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
    drag.group.forEach((c, i) => {
      const x = drag.offsets[i].x + dx;
      const y = drag.offsets[i].y + dy;
      c.x = x;
      c.y = y;
      c.el.style.transform = `translate(${x}px, ${y}px)`;
    });
    highlightTarget(findDropTarget());
  }

  function onPointerUp(e) {
    if (!drag) return;
    const el = e.currentTarget;
    el.releasePointerCapture?.(drag.pointerId);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointercancel', onPointerUp);

    const grp = drag.group;
    const wasClick = !drag.moved;
    const target = drag.moved ? findDropTarget() : null;
    highlightTarget(null);
    grp.forEach((c) => { c.el.classList.remove('dragging'); c.el.style.transition = ''; });

    const d = drag;
    drag = null;

    if (wasClick) {
      // Treat a click/tap as "send to foundation if possible".
      render(false);
      tryAutoFoundation(d.id);
      return;
    }

    if (target) {
      commitMove(d.id, target);
    } else {
      render(false); // snap back
    }
  }

  // Find the best pile the dragged group's base card overlaps.
  function findDropTarget() {
    if (!drag) return null;
    const base = drag.group[0];
    const bx = base.x, by = base.y;
    const bw = L.cardW, bh = L.cardH;

    let best = null, bestArea = 0;

    const consider = (kind, pileIndex, pile) => {
      // Skip dropping onto the group's own source pile at same spot handled by validity.
      let px, py;
      if (kind === 'tableau') {
        const p = cardPosition('tableau', pileIndex, pile.length, pile);
        px = p.x; py = p.y;
      } else {
        const a = pileAnchor('foundation', pileIndex);
        px = a.x; py = a.y;
      }
      const ox = Math.max(0, Math.min(bx + bw, px + L.cardW) - Math.max(bx, px));
      const oy = Math.max(0, Math.min(by + bh, py + L.cardH) - Math.max(by, py));
      const area = ox * oy;
      if (area <= bestArea) return;

      let ok = false;
      if (kind === 'foundation') ok = drag.group.length === 1 && canDropOnFoundation(base, foundations[pileIndex]);
      else ok = canDropOnTableau(base, pile);
      if (ok) { best = { kind, pileIndex }; bestArea = area; }
    };

    for (let i = 0; i < 4; i++) consider('foundation', i, foundations[i]);
    for (let i = 0; i < 7; i++) consider('tableau', i, tableau[i]);
    return bestArea > (bw * bh) * 0.12 ? best : null;
  }

  function highlightTarget(target) {
    if (drag && drag.lastTarget === JSON.stringify(target)) return;
    board.querySelectorAll('.pile-slot--drop-target').forEach((s) => s.classList.remove('pile-slot--drop-target'));
    if (target) {
      const kind = target.kind;
      const sel = `.pile-slot[data-kind="${kind}"][data-index="${target.pileIndex}"]`;
      const slot = board.querySelector(sel);
      if (slot) slot.classList.add('pile-slot--drop-target');
    }
    if (drag) drag.lastTarget = JSON.stringify(target);
  }

  // ========================================================================
  // Win / auto-complete
  // ========================================================================
  function checkWin() {
    const total = foundations.reduce((s, f) => s + f.length, 0);
    if (total === 52) { onWin(); return; }
    // Offer auto-finish when everything is face up and stock/waste playable.
    maybeAutoFinish();
  }

  function allFaceUp() {
    return tableau.every((t) => t.every((c) => c.faceUp)) && stock.length === 0 && waste.length <= 1;
  }

  function maybeAutoFinish() {
    if (gameWon || animating) return;
    if (!allFaceUp()) return;
    // Auto-play remaining cards to foundations with a nice cascade.
    animating = true;
    const step = () => {
      const move = nextFoundationMove();
      if (!move) { animating = false; return; }
      commitMoveSilent(move.cardId, move.dest);
      render(false);
      const total = foundations.reduce((s, f) => s + f.length, 0);
      if (total === 52) { animating = false; onWin(); return; }
      setTimeout(step, 140);
    };
    setTimeout(step, 200);
  }

  function nextFoundationMove() {
    const tops = [];
    if (waste.length) tops.push(waste[waste.length - 1]);
    for (const t of tableau) if (t.length) tops.push(t[t.length - 1]);
    for (const c of tops) {
      if (!c.faceUp) continue;
      for (let i = 0; i < 4; i++) {
        if (canDropOnFoundation(c, foundations[i])) return { cardId: c.id, dest: { kind: 'foundation', pileIndex: i } };
      }
    }
    return null;
  }

  function commitMoveSilent(cardId, dest) {
    const src = findCard(cardId);
    if (!src) return;
    const moving = src.pile.slice(src.idx);
    src.pile.splice(src.idx);
    foundations[dest.pileIndex].push(...moving);
    addScore(10);
    if (src.kind === 'tableau') flipExposed(src.pile);
    bumpMoves();
  }

  function onWin() {
    if (gameWon) return;
    gameWon = true;
    stopTimer();
    const secs = Math.floor((Date.now() - startTime) / 1000);
    launchWinCascade();
    setTimeout(() => {
      winSummary.textContent = `Cleared in ${formatTime(secs)} with ${moves} moves — score ${score}.`;
      winOverlay.classList.remove('overlay--hidden');
      spawnConfetti();
    }, 1400);
  }

  // Fling all foundation cards across the screen (classic solitaire finish).
  function launchWinCascade() {
    const cards = [];
    foundations.forEach((f) => f.forEach((c) => cards.push(c)));
    const vw = window.innerWidth, vh = window.innerHeight;
    const rect = board.getBoundingClientRect();
    cards.forEach((c, i) => {
      setTimeout(() => {
        c.el.style.transition = 'transform 1.4s cubic-bezier(0.3, 0, 0.7, 1)';
        c.el.style.zIndex = 20000 + i;
        const destX = (Math.random() * vw - rect.left) - L.cardW / 2;
        const destY = (vh - rect.top) + Math.random() * 200;
        c.el.style.transform = `translate(${destX}px, ${destY}px) rotate(${(Math.random() * 120 - 60)}deg)`;
      }, i * 45);
    });
  }

  function spawnConfetti() {
    const colors = ['#00e5ff', '#a855f7', '#ec4899', '#22c55e', '#f97316', '#ffd166'];
    for (let i = 0; i < 90; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = (2.5 + Math.random() * 2) + 's';
      c.style.animationDelay = Math.random() * 0.6 + 's';
      c.style.opacity = 0.85;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 5000);
    }
  }

  // ========================================================================
  // Timer & stats
  // ========================================================================
  function formatTime(s) {
    const m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }
  function startTimerIfNeeded() {
    if (timerId || gameWon) return;
    startTime = Date.now();
    timerId = setInterval(() => {
      elTime.textContent = formatTime(Math.floor((Date.now() - startTime) / 1000));
    }, 500);
  }
  function stopTimer() { clearInterval(timerId); timerId = null; }

  // ========================================================================
  // New game / deal
  // ========================================================================
  function newGame() {
    stopTimer();
    gameWon = false;
    animating = true;
    moves = 0; score = 0;
    elMoves.textContent = '0'; elScore.textContent = '0'; elTime.textContent = '0:00';
    startTime = null; timerId = null;
    winOverlay.classList.add('overlay--hidden');

    // Clear old card elements.
    board.querySelectorAll('.card').forEach((c) => c.remove());

    computeLayout();
    buildSlots();

    const deck = shuffle(makeDeck());
    allCards = deck;
    stock = []; waste = [];
    foundations = [[], [], [], []];
    tableau = [[], [], [], [], [], [], []];

    // Build elements, start every card stacked on the stock, face down.
    deck.forEach((card) => {
      card.faceUp = false;
      board.appendChild(buildCardElement(card));
      card.el.classList.add('face-down');
      const a = pileAnchor('stock', 0);
      card.el.style.transition = 'none';
      card.el.style.transform = `translate(${a.x}px, ${a.y}px)`;
    });
    void board.offsetWidth;

    // Deal into tableau (standard Klondike triangular layout).
    const dealPlan = [];
    for (let col = 0; col < 7; col++) {
      for (let row = col; row < 7; row++) {
        dealPlan.push({ col: row, faceUp: row === col });
      }
    }
    // Remaining cards go to stock.
    let di = 0;
    const dealt = [];
    for (const step of dealPlan) {
      const card = deck[di++];
      tableau[step.col].push(card);
      card._targetFaceUp = step.faceUp;
      dealt.push(card);
    }
    for (; di < deck.length; di++) stock.push(deck[di]);

    // Animate the deal with a stagger.
    let delay = 0;
    dealt.forEach((card, i) => {
      setTimeout(() => {
        const loc = findCard(card.id);
        card.el.style.transition = '';
        positionCard(card, 'tableau', loc.pileIndex, loc.idx, tableau[loc.pileIndex], false);
        card.el.style.zIndex = 1000 + i;
      }, delay);
      delay += 55;
    });

    // After dealing, flip the exposed cards and finalize.
    setTimeout(() => {
      dealt.forEach((card) => { if (card._targetFaceUp) card.faceUp = true; });
      render(false);
      animating = false;
    }, delay + 260);
  }

  // ========================================================================
  // Controls
  // ========================================================================
  document.getElementById('btn-new').addEventListener('click', newGame);
  document.getElementById('btn-win-new').addEventListener('click', newGame);

  const drawBtn = document.getElementById('btn-draw-mode');
  drawCount = 1;
  drawBtn.addEventListener('click', () => {
    drawCount = drawCount === 1 ? 3 : 1;
    drawBtn.textContent = 'Draw ' + drawCount;
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!allCards) return;
      computeLayout();
      buildSlots();
      render(true);
    }, 120);
  });

  // Kick things off.
  newGame();
})();
