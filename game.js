// Ada's Puzzle — drag-and-drop jigsaw, vanilla JS, no build step.

// ---------- Levels ----------
// Each level: image + grid size (NxN). Progress from easy (3x3) to harder (6x6).
const LEVELS = [
  { id: 1,  image: "images/barbie5.jpg", title: "Welcome to Barbieland", grid: 3  },  // 9
  { id: 2,  image: "images/barbie1.jpg", title: "Three Best Friends",    grid: 3  },  // 9
  { id: 3,  image: "images/barbie3.jpg", title: "Pink Coat Style",       grid: 4  },  // 16
  { id: 4,  image: "images/barbie4.jpg", title: "Roses & Curls",         grid: 4  },  // 16
  { id: 5,  image: "images/barbie2.jpg", title: "Pink Power Suit",       grid: 5  },  // 25
  { id: 6,  image: "images/barbie1.jpg", title: "Pink Hair Day",         grid: 6  },  // 36
  { id: 7,  image: "images/barbie5.jpg", title: "Barbieland Sunset",     grid: 8  },  // 64
  { id: 8,  image: "images/barbie3.jpg", title: "Pink Coat (XL)",        grid: 10 },  // 100
  { id: 9,  image: "images/barbie4.jpg", title: "Rose Garden",           grid: 12 },  // 144
  { id: 10, image: "images/barbie2.jpg", title: "Power Pose",            grid: 15 },  // 225
  { id: 11, image: "images/barbie1.jpg", title: "Mega Pink Squad",       grid: 18 },  // 324
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

function chooseBoardSize(N) {
  // Fit board into the available central area. Pick a generous size based on
  // viewport, then make sure each cell stays a comfortable size for the grid.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const phone = vw < 700;
  // Reserve room for rails on the sides (desktop only) + chrome.
  const availW = phone ? vw - 32 : Math.min(vw - 560, 800);
  const availH = vh - 280;
  let target = Math.max(240, Math.min(availW, availH, 800));
  // Cells should be at least ~24px for tappability
  const minCell = phone ? 24 : 28;
  if (target / N < minCell) {
    target = minCell * N;
  }
  // Even bigger ceiling for very big puzzles
  return Math.floor(target);
}

function startLevel(level) {
  state.level = level;
  state.won = false;
  const N = level.grid;
  const total = N * N;
  state.boardSize = chooseBoardSize(N);
  state.pieceSize = Math.floor(state.boardSize / N);
  state.boardSize = state.pieceSize * N; // adjust to be exact multiple
  // Pieces in the rail show at a fixed comfy size for tappability. Scale a bit
  // smaller for very big puzzles so the rail doesn't dominate.
  state.railPieceSize = N >= 12 ? 56 : N >= 8 ? 64 : Math.min(state.pieceSize, 80);
  // Levels with grid >= 4 get random initial rotations for extra challenge.
  state.useRotation = N >= 4;

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

  // Build pieces (sized for the rail). `cur` is { row, col } when placed on a
  // board cell, null when in the rail. `row, col` are the *target* (correct).
  state.pieces = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const el = document.createElement("div");
      el.className = "piece in-rail";
      el.style.width = state.railPieceSize + "px";
      el.style.height = state.railPieceSize + "px";
      el.style.backgroundImage = `url('${level.image}')`;
      const sliceTotal = state.railPieceSize * N;
      el.style.backgroundSize = `${sliceTotal}px ${sliceTotal}px`;
      el.style.backgroundPosition = `-${c * state.railPieceSize}px -${r * state.railPieceSize}px`;
      attachDrag(el);
      const rotation = state.useRotation ? (Math.floor(Math.random() * 4) * 90) : 0;
      const piece = { row: r, col: c, el, cur: null, rotation };
      applyRotation(piece);
      updateRotatableIndicator(piece);
      state.pieces.push(piece);
    }
  }

  // Shuffle and split between two rails
  shufflePieces();
  showView("game");
}

function applyRotation(piece) {
  piece.el.style.transform = `rotate(${piece.rotation}deg)`;
}

function updateRotatableIndicator(piece) {
  // Show the ↻ indicator whenever the piece's rotation is non-zero (so the
  // kid sees which pieces still need to be rotated to fit).
  piece.el.classList.toggle("rotatable", state.useRotation && piece.rotation !== 0);
}

function isPlaced(piece) {
  return piece.cur !== null;
}
function isCorrectlyPlaced(piece) {
  return piece.cur && piece.cur.row === piece.row && piece.cur.col === piece.col && piece.rotation === 0;
}

function shufflePieces() {
  // Only re-arrange pieces currently in the rails (not the board)
  const inRail = state.pieces.filter((p) => !isPlaced(p));
  const left = $("#pieces-left");
  const right = $("#pieces-right");
  left.innerHTML = "";
  right.innerHTML = "";
  const order = shuffle([...inRail]);
  order.forEach((p, i) => {
    // Reset rail styling
    p.el.classList.remove("in-board", "hint-glow");
    p.el.classList.add("in-rail");
    p.el.style.position = "";
    p.el.style.left = "";
    p.el.style.top = "";
    p.el.style.width = state.railPieceSize + "px";
    p.el.style.height = state.railPieceSize + "px";
    const railTotal = state.railPieceSize * state.level.grid;
    p.el.style.backgroundSize = `${railTotal}px ${railTotal}px`;
    p.el.style.backgroundPosition = `-${p.col * state.railPieceSize}px -${p.row * state.railPieceSize}px`;
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

const DRAG_THRESHOLD = 8; // px movement before we consider it a drag

function onPointerDown(e) {
  if (state.won) return;
  e.preventDefault();
  const el = e.currentTarget;
  const piece = state.pieces.find((p) => p.el === el);
  if (!piece) return;
  const rect = el.getBoundingClientRect();
  state.drag = {
    pieceIndex: state.pieces.indexOf(piece),
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    moved: false,
    wasPlaced: isPlaced(piece),
  };
  try { el.setPointerCapture(e.pointerId); } catch {}
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointercancel", onPointerUp);
}

function onPointerMove(e) {
  if (!state.drag) return;
  const piece = state.pieces[state.drag.pieceIndex];
  if (!state.drag.moved) {
    const dx = e.clientX - state.drag.startX;
    const dy = e.clientY - state.drag.startY;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    state.drag.moved = true;
    // Switch to dragging: detach from current cell if placed, grow to board size
    if (state.drag.wasPlaced) {
      // Free the cell visually but remember the old cell so we can restore on miss
      const oldCell = getCellAt(piece.cur.row, piece.cur.col);
      if (oldCell) oldCell.classList.remove("filled");
      piece.cur = null;
    }
    piece.el.classList.add("dragging");
    piece.el.style.width = state.pieceSize + "px";
    piece.el.style.height = state.pieceSize + "px";
    const totalSlice = state.pieceSize * state.level.grid;
    piece.el.style.backgroundSize = `${totalSlice}px ${totalSlice}px`;
    piece.el.style.backgroundPosition = `-${piece.col * state.pieceSize}px -${piece.row * state.pieceSize}px`;
    state.drag.offsetX = state.pieceSize / 2;
    state.drag.offsetY = state.pieceSize / 2;
  }
  piece.el.style.left = (e.clientX - state.drag.offsetX) + "px";
  piece.el.style.top = (e.clientY - state.drag.offsetY) + "px";
}

function onPointerUp(e) {
  if (!state.drag) return;
  const piece = state.pieces[state.drag.pieceIndex];
  try { piece.el.releasePointerCapture(e.pointerId); } catch {}
  piece.el.removeEventListener("pointermove", onPointerMove);
  piece.el.removeEventListener("pointerup", onPointerUp);
  piece.el.removeEventListener("pointercancel", onPointerUp);

  if (!state.drag.moved) {
    // Tap — rotate 90°
    if (state.useRotation) {
      piece.rotation = (piece.rotation + 90) % 360;
      applyRotation(piece);
      updateRotatableIndicator(piece);
      checkWin();
    }
    state.drag = null;
    return;
  }

  // Drag end — hit-test the drop point against board cells
  const target = findDropCell(e.clientX, e.clientY);
  if (target) {
    // Find any piece currently in that cell
    const occupier = state.pieces.find((p) => p !== piece && p.cur && p.cur.row === target.row && p.cur.col === target.col);
    if (occupier) returnToRail(occupier);
    placeOnCell(piece, target.row, target.col);
  } else {
    returnToRail(piece);
  }
  state.drag = null;
  checkWin();
}

function findDropCell(x, y) {
  const board = $("#board");
  const rect = board.getBoundingClientRect();
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
  const N = state.level.grid;
  const col = Math.floor(((x - rect.left) / rect.width) * N);
  const row = Math.floor(((y - rect.top) / rect.height) * N);
  if (row < 0 || row >= N || col < 0 || col >= N) return null;
  return { row, col };
}

function placeOnCell(piece, row, col) {
  piece.cur = { row, col };
  piece.el.classList.remove("dragging", "in-rail", "hint-glow");
  piece.el.classList.add("in-board");
  piece.el.style.position = "";
  piece.el.style.left = "";
  piece.el.style.top = "";
  const cell = getCellAt(row, col);
  cell.classList.add("filled");
  cell.innerHTML = "";
  cell.appendChild(piece.el);
  piece.el.style.width = "100%";
  piece.el.style.height = "100%";
  const totalSlice = state.pieceSize * state.level.grid;
  piece.el.style.backgroundSize = `${totalSlice}px ${totalSlice}px`;
  piece.el.style.backgroundPosition = `-${piece.col * state.pieceSize}px -${piece.row * state.pieceSize}px`;
  updateRotatableIndicator(piece);
  updateProgress();
}

function returnToRail(piece) {
  piece.cur = null;
  piece.el.classList.remove("dragging", "in-board", "hint-glow");
  piece.el.classList.add("in-rail");
  piece.el.style.position = "";
  piece.el.style.left = "";
  piece.el.style.top = "";
  piece.el.style.width = state.railPieceSize + "px";
  piece.el.style.height = state.railPieceSize + "px";
  const railTotal = state.railPieceSize * state.level.grid;
  piece.el.style.backgroundSize = `${railTotal}px ${railTotal}px`;
  piece.el.style.backgroundPosition = `-${piece.col * state.railPieceSize}px -${piece.row * state.railPieceSize}px`;
  updateRotatableIndicator(piece);
  // Drop into the less full rail
  const left = $("#pieces-left");
  const right = $("#pieces-right");
  (left.children.length <= right.children.length ? left : right).appendChild(piece.el);
  updateProgress();
}

function checkWin() {
  if (state.won) return;
  if (state.pieces.every(isCorrectlyPlaced)) {
    setTimeout(triggerWin, 250);
  }
}

function wiggle(el) {
  el.animate(
    [
      { transform: el.style.transform + " translateX(-6px)" },
      { transform: el.style.transform + " translateX(6px)" },
      { transform: el.style.transform + " translateX(-4px)" },
      { transform: el.style.transform },
    ],
    { duration: 220, easing: "ease-in-out" }
  );
}

function getCellAt(r, c) {
  return $$(".board-cell").find((cell) => +cell.dataset.r === r && +cell.dataset.c === c);
}

function updateProgress() {
  const N = state.level.grid;
  const total = N * N;
  const correct = state.pieces.filter(isCorrectlyPlaced).length;
  $("#game-progress").textContent = `${correct} / ${total}`;
}

// ---------- Hint (show finished board for 5s, then revert) ----------

let hintActive = false;

function giveHint() {
  if (state.won || hintActive) return;
  hintActive = true;
  $("#hint-btn").disabled = true;
  // For each piece not yet correctly placed, drop a translucent "ghost" on
  // its TARGET cell that fades from full opacity to 0 over 5 seconds.
  const ghosts = [];
  state.pieces.forEach((p) => {
    if (isCorrectlyPlaced(p)) return;
    const cell = getCellAt(p.row, p.col);
    const ghost = document.createElement("div");
    ghost.className = "hint-ghost";
    ghost.style.position = "absolute";
    ghost.style.inset = "0";
    ghost.style.width = "100%";
    ghost.style.height = "100%";
    ghost.style.backgroundImage = `url('${state.level.image}')`;
    ghost.style.backgroundSize = `${state.boardSize}px ${state.boardSize}px`;
    ghost.style.backgroundPosition = `-${p.col * state.pieceSize}px -${p.row * state.pieceSize}px`;
    ghost.style.opacity = "0.85";
    ghost.style.transition = "opacity 5s linear";
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "10";
    cell.style.position = "relative";
    cell.appendChild(ghost);
    void ghost.offsetWidth;
    ghost.style.opacity = "0";
    ghosts.push(ghost);
  });
  // Pulse-glow the rail pieces while the hint is up
  state.pieces.forEach((p) => {
    if (!isPlaced(p)) p.el.classList.add("hint-glow");
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
  const dancerImages = [
    "images/dancer1.png", "images/dancer2.png", "images/dancer3.png",
    "images/dancer4.png", "images/dancer5.png", "images/dancer6.png", "images/dancer7.png",
  ];
  // Sprinkle the real dancing Barbies + a few sparkle emojis around them
  const N_DANCERS = 12;
  for (let i = 0; i < N_DANCERS; i++) {
    const d = document.createElement("img");
    d.className = "dancer";
    d.src = dancerImages[i % dancerImages.length];
    d.alt = "";
    d.style.left = (Math.random() * 85) + "%";
    d.style.top = (Math.random() * 70) + "%";
    d.style.animationDelay = (Math.random() * 0.7) + "s";
    d.style.width = (90 + Math.random() * 60) + "px";
    d.style.zIndex = Math.floor(Math.random() * 5);
    container.appendChild(d);
  }
  // Sprinkle a few sparkle emojis in front of/behind the dancers
  const sparkles = ["✨", "🎀", "💖", "⭐"];
  for (let i = 0; i < 8; i++) {
    const s = document.createElement("div");
    s.className = "dancer dancer-sparkle";
    s.textContent = sparkles[i % sparkles.length];
    s.style.left = (Math.random() * 90) + "%";
    s.style.top = (Math.random() * 80) + "%";
    s.style.animationDelay = (Math.random() * 0.7) + "s";
    s.style.fontSize = (2 + Math.random() * 1.5) + "rem";
    container.appendChild(s);
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
