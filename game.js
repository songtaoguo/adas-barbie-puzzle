// Ada's Puzzle — drag-and-drop jigsaw, vanilla JS, no build step.

// ---------- Levels ----------
// Each level: image + grid size (NxN). Progress from easy (3x3) to harder (6x6).
const LEVELS = [
  { id: 1, image: "images/crown.svg",    title: "Royal Crown",    grid: 3 },
  { id: 2, image: "images/castle.svg",   title: "Pink Castle",    grid: 3 },
  { id: 3, image: "images/wand.svg",     title: "Magic Wand",     grid: 4 },
  { id: 4, image: "images/unicorn.svg",  title: "Rainbow Unicorn",grid: 4 },
  { id: 5, image: "images/princess.svg", title: "Pretty Princess",grid: 5 },
  { id: 6, image: "images/teaparty.svg", title: "Tea Party",      grid: 5 },
];

// ---------- Storage (completed levels) ----------
const STORAGE_KEY = "ada-puzzle-v1";

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { completed: {} };
    return JSON.parse(raw);
  } catch { return { completed: {} }; }
}
function saveStore(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

// ---------- DOM helpers ----------
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function showView(id) {
  ["welcome", "game", "win"].forEach((v) => {
    document.getElementById(v).classList.toggle("hidden", v !== id);
  });
}

// ---------- Level picker ----------

function renderLevels() {
  const list = $("#level-list");
  const store = loadStore();
  list.innerHTML = "";
  LEVELS.forEach((lvl) => {
    const card = document.createElement("button");
    card.className = "level-card";
    if (store.completed[lvl.id]) card.classList.add("completed");
    card.innerHTML = `
      <div class="level-thumb" style="background-image:url('${lvl.image}')"></div>
      <div class="level-num">${store.completed[lvl.id] ? "⭐" : ""} Level ${lvl.id}</div>
      <div class="level-title">${lvl.title}</div>
      <div class="level-size">${lvl.grid}×${lvl.grid} pieces</div>
    `;
    card.addEventListener("click", () => startLevel(lvl));
    list.appendChild(card);
  });
}

// ---------- Game state ----------

const state = {
  level: null,
  pieceSize: 80, // px
  boardSize: 0,
  pieces: [],    // [{ row, col, el, placed }]
  drag: null,    // { pieceIndex, offsetX, offsetY }
  won: false,
};

function chooseBoardSize() {
  // Fit board into available area; min 200, max 480
  const vw = window.innerWidth;
  if (vw < 700) return Math.min(380, vw - 40);
  return 480;
}

function startLevel(level) {
  state.level = level;
  state.won = false;
  const N = level.grid;
  const total = N * N;
  state.boardSize = chooseBoardSize();
  state.pieceSize = Math.floor(state.boardSize / N);
  state.boardSize = state.pieceSize * N; // adjust to be exact multiple

  $("#game-title").textContent = `${level.title} · ${N}×${N}`;
  $("#game-progress").textContent = `0 / ${total}`;

  // Build empty board grid
  const board = $("#board");
  board.style.gridTemplateColumns = `repeat(${N}, ${state.pieceSize}px)`;
  board.style.gridTemplateRows = `repeat(${N}, ${state.pieceSize}px)`;
  board.style.width = state.boardSize + "px";
  board.style.height = state.boardSize + "px";
  board.innerHTML = "";
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const cell = document.createElement("div");
      cell.className = "board-cell";
      cell.dataset.r = r;
      cell.dataset.c = c;
      board.appendChild(cell);
    }
  }

  // Build pieces
  state.pieces = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const el = document.createElement("div");
      el.className = "piece in-rail";
      el.style.width = state.pieceSize + "px";
      el.style.height = state.pieceSize + "px";
      el.style.backgroundImage = `url('${level.image}')`;
      el.style.backgroundSize = `${state.boardSize}px ${state.boardSize}px`;
      el.style.backgroundPosition = `-${c * state.pieceSize}px -${r * state.pieceSize}px`;
      attachDrag(el);
      state.pieces.push({ row: r, col: c, el, placed: false });
    }
  }

  // Shuffle and split between two rails
  shufflePieces();

  showView("game");
}

function shufflePieces() {
  // Move all unplaced pieces back to rails in random order
  state.pieces.forEach((p) => {
    if (!p.placed) {
      p.el.classList.remove("in-board", "hint-glow");
      p.el.classList.add("in-rail");
      p.el.style.position = "";
      p.el.style.left = "";
      p.el.style.top = "";
    }
  });
  const left = $("#pieces-left");
  const right = $("#pieces-right");
  left.innerHTML = "";
  right.innerHTML = "";
  const unplaced = state.pieces.filter((p) => !p.placed);
  const order = shuffle([...unplaced]);
  order.forEach((p, i) => {
    if (i % 2 === 0) left.appendChild(p.el);
    else right.appendChild(p.el);
  });
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- Drag and drop ----------

function attachDrag(el) {
  el.addEventListener("pointerdown", onPointerDown);
}

function onPointerDown(e) {
  if (state.won) return;
  e.preventDefault();
  const el = e.currentTarget;
  const piece = state.pieces.find((p) => p.el === el);
  if (!piece || piece.placed) return;
  const rect = el.getBoundingClientRect();
  state.drag = {
    pieceIndex: state.pieces.indexOf(piece),
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
    pointerId: e.pointerId,
  };
  el.setPointerCapture(e.pointerId);
  el.classList.add("dragging");
  el.style.left = (e.clientX - state.drag.offsetX) + "px";
  el.style.top = (e.clientY - state.drag.offsetY) + "px";
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointercancel", onPointerUp);
}

function onPointerMove(e) {
  if (!state.drag) return;
  const piece = state.pieces[state.drag.pieceIndex];
  piece.el.style.left = (e.clientX - state.drag.offsetX) + "px";
  piece.el.style.top = (e.clientY - state.drag.offsetY) + "px";
}

function onPointerUp(e) {
  if (!state.drag) return;
  const piece = state.pieces[state.drag.pieceIndex];
  piece.el.releasePointerCapture(e.pointerId);
  piece.el.removeEventListener("pointermove", onPointerMove);
  piece.el.removeEventListener("pointerup", onPointerUp);
  piece.el.removeEventListener("pointercancel", onPointerUp);
  // Try to snap to its target cell on the board
  const targetCell = getCellAt(piece.row, piece.col);
  const targetRect = targetCell.getBoundingClientRect();
  const pieceRect = piece.el.getBoundingClientRect();
  const dx = (pieceRect.left + pieceRect.width / 2) - (targetRect.left + targetRect.width / 2);
  const dy = (pieceRect.top + pieceRect.height / 2) - (targetRect.top + targetRect.height / 2);
  const dist = Math.hypot(dx, dy);
  // Snap threshold: 60% of piece size
  if (dist < state.pieceSize * 0.6) {
    placePiece(piece);
  } else {
    // Return to rail (clear inline drag styling)
    piece.el.classList.remove("dragging");
    piece.el.style.position = "";
    piece.el.style.left = "";
    piece.el.style.top = "";
    // Already in DOM in its rail; no parent change needed
  }
  state.drag = null;
}

function getCellAt(r, c) {
  return $$(".board-cell").find((cell) => +cell.dataset.r === r && +cell.dataset.c === c);
}

function placePiece(piece) {
  piece.placed = true;
  piece.el.classList.remove("dragging", "in-rail", "hint-glow");
  piece.el.classList.add("in-board");
  piece.el.style.position = "";
  piece.el.style.left = "";
  piece.el.style.top = "";
  // Move piece DOM into target cell, occupy it
  const cell = getCellAt(piece.row, piece.col);
  cell.classList.add("filled");
  cell.innerHTML = "";
  cell.appendChild(piece.el);
  piece.el.style.width = "100%";
  piece.el.style.height = "100%";
  updateProgress();
  if (state.pieces.every((p) => p.placed)) {
    setTimeout(triggerWin, 250);
  }
}

function updateProgress() {
  const N = state.level.grid;
  const total = N * N;
  const done = state.pieces.filter((p) => p.placed).length;
  $("#game-progress").textContent = `${done} / ${total}`;
}

// ---------- Hint (show finished board for 5s, then revert) ----------

let hintActive = false;

function giveHint() {
  if (state.won || hintActive) return;
  hintActive = true;
  $("#hint-btn").disabled = true;
  // For each unplaced piece, temporarily render the full image in its target cell.
  // We do this by adding a translucent "ghost" element with the full image cropped.
  const N = state.level.grid;
  const ghosts = [];
  state.pieces.forEach((p) => {
    if (p.placed) return;
    const cell = getCellAt(p.row, p.col);
    const ghost = document.createElement("div");
    ghost.className = "piece in-board hint-ghost";
    ghost.style.width = "100%";
    ghost.style.height = "100%";
    ghost.style.backgroundImage = `url('${state.level.image}')`;
    ghost.style.backgroundSize = `${state.boardSize}px ${state.boardSize}px`;
    ghost.style.backgroundPosition = `-${p.col * state.pieceSize}px -${p.row * state.pieceSize}px`;
    ghost.style.opacity = "0.85";
    cell.appendChild(ghost);
    ghosts.push(ghost);
  });
  // Glow the rail pieces so kid can find them
  state.pieces.forEach((p) => {
    if (!p.placed) p.el.classList.add("hint-glow");
  });
  setTimeout(() => {
    ghosts.forEach((g) => g.remove());
    state.pieces.forEach((p) => p.el.classList.remove("hint-glow"));
    hintActive = false;
    $("#hint-btn").disabled = false;
  }, 5000);
}

// ---------- Win ----------

function triggerWin() {
  state.won = true;
  // Mark level as completed
  const store = loadStore();
  store.completed[state.level.id] = true;
  saveStore(store);
  renderDancers();
  showView("win");
  playWinTune();
}

function renderDancers() {
  const container = $("#dancers");
  container.innerHTML = "";
  // Sprinkle a mix of princess-y emojis dancing in random positions
  const cast = ["👸", "🦄", "🎀", "💃", "✨", "👑", "💖", "🌸", "🩰", "🍰"];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const d = document.createElement("div");
    d.className = "dancer";
    d.textContent = cast[Math.floor(Math.random() * cast.length)];
    d.style.left = (Math.random() * 88) + "%";
    d.style.top = (Math.random() * 70) + "%";
    d.style.animationDelay = (Math.random() * 0.7) + "s";
    d.style.fontSize = (3 + Math.random() * 2) + "rem";
    container.appendChild(d);
  }
}

// ---------- Sound (Web Audio API) ----------

let audioCtx = null;
function ensureCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function note(freq, startOffset, durationSec, volume = 0.2, type = "sine") {
  const c = ensureCtx();
  if (!c) return;
  const t0 = c.currentTime + startOffset;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(c.destination);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);
  osc.start(t0);
  osc.stop(t0 + durationSec + 0.02);
}

function playWinTune() {
  // Cheerful little pop melody in C major
  const F = { C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, B5: 988, C6: 1046, D6: 1175, E6: 1319 };
  const seq = [
    [F.C5, 0.00, 0.20], [F.E5, 0.18, 0.20], [F.G5, 0.36, 0.20], [F.C6, 0.54, 0.30],
    [F.A5, 0.85, 0.20], [F.G5, 1.03, 0.20], [F.E5, 1.21, 0.20], [F.C5, 1.39, 0.30],
    [F.D5, 1.70, 0.20], [F.G5, 1.88, 0.20], [F.B5, 2.06, 0.20], [F.D6, 2.24, 0.40],
    [F.C6, 2.65, 0.50, 0.25],
  ];
  seq.forEach(([f, t, d, v]) => note(f, t, d, v || 0.2, "triangle"));
  // Sparkle chimes
  [F.C6, F.E6, F.G5].forEach((f, i) => note(f * 2, 0.4 + i * 0.3, 0.15, 0.08, "sine"));
}

// ---------- Boot ----------

document.addEventListener("DOMContentLoaded", () => {
  renderLevels();

  $("#back-btn").addEventListener("click", () => { renderLevels(); showView("welcome"); });
  $("#hint-btn").addEventListener("click", giveHint);
  $("#shuffle-btn").addEventListener("click", shufflePieces);
  $("#replay-btn").addEventListener("click", () => startLevel(state.level));
  $("#next-btn").addEventListener("click", () => {
    const idx = LEVELS.findIndex((l) => l.id === state.level.id);
    const next = LEVELS[idx + 1] || LEVELS[0]; // wrap to first if done
    startLevel(next);
  });

  // Re-size board if window resizes mid-play
  window.addEventListener("resize", () => {
    if (!state.level) return;
    if ($("#game").classList.contains("hidden")) return;
    startLevel(state.level); // simple: re-init the puzzle
  });
});
