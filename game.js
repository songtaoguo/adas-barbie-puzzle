// Ada's Puzzle — drag-and-drop jigsaw, vanilla JS, no build step.

// ---------- Levels ----------
// Each level: image + grid size (NxN). Progress from easy (3x3) to harder (6x6).
const LEVELS = [
  { id: 1, image: "images/barbie5.jpg", title: "Welcome to Barbieland", grid: 3 },
  { id: 2, image: "images/barbie1.jpg", title: "Three Best Friends",    grid: 3 },
  { id: 3, image: "images/barbie3.jpg", title: "Pink Coat Style",       grid: 4 },
  { id: 4, image: "images/barbie4.jpg", title: "Roses & Curls",         grid: 4 },
  { id: 5, image: "images/barbie2.jpg", title: "Pink Power Suit",       grid: 5 },
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
  // Pieces in the rail show at a fixed comfy size (touch-friendly + fits the rail)
  state.railPieceSize = Math.min(state.pieceSize, 80);
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

  // Build pieces (sized for the rail)
  state.pieces = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const el = document.createElement("div");
      el.className = "piece in-rail";
      el.style.width = state.railPieceSize + "px";
      el.style.height = state.railPieceSize + "px";
      el.style.backgroundImage = `url('${level.image}')`;
      // Use the rail size for the slice so each piece shows its part of the image
      const sliceTotal = state.railPieceSize * N;
      el.style.backgroundSize = `${sliceTotal}px ${sliceTotal}px`;
      el.style.backgroundPosition = `-${c * state.railPieceSize}px -${r * state.railPieceSize}px`;
      attachDrag(el);
      // Initial rotation (0 unless we're in rotation mode)
      const rotation = state.useRotation ? (Math.floor(Math.random() * 4) * 90) : 0;
      const piece = { row: r, col: c, el, placed: false, rotation };
      applyRotation(piece);
      if (state.useRotation) el.classList.add("rotatable");
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

const DRAG_THRESHOLD = 8; // px movement before we consider it a drag

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
    startX: e.clientX,
    startY: e.clientY,
    moved: false,
  };
  try { el.setPointerCapture(e.pointerId); } catch {}
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointercancel", onPointerUp);
}

function onPointerMove(e) {
  if (!state.drag) return;
  const piece = state.pieces[state.drag.pieceIndex];
  // Decide drag vs tap based on movement threshold
  if (!state.drag.moved) {
    const dx = e.clientX - state.drag.startX;
    const dy = e.clientY - state.drag.startY;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return; // still might be a tap
    state.drag.moved = true;
    // Switch to dragging — grow to board piece size
    piece.el.classList.add("dragging");
    piece.el.style.width = state.pieceSize + "px";
    piece.el.style.height = state.pieceSize + "px";
    const totalSlice = state.pieceSize * state.level.grid;
    piece.el.style.backgroundSize = `${totalSlice}px ${totalSlice}px`;
    piece.el.style.backgroundPosition = `-${piece.col * state.pieceSize}px -${piece.row * state.pieceSize}px`;
    // Recenter the drag offset so the pointer stays roughly at the same spot
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
    // It was a tap, not a drag — rotate the piece 90°
    if (state.useRotation) {
      piece.rotation = (piece.rotation + 90) % 360;
      applyRotation(piece);
    }
    state.drag = null;
    return;
  }

  // It was a drag — try to snap to the target cell
  const targetCell = getCellAt(piece.row, piece.col);
  const targetRect = targetCell.getBoundingClientRect();
  const pieceRect = piece.el.getBoundingClientRect();
  const dx = (pieceRect.left + pieceRect.width / 2) - (targetRect.left + targetRect.width / 2);
  const dy = (pieceRect.top + pieceRect.height / 2) - (targetRect.top + targetRect.height / 2);
  const dist = Math.hypot(dx, dy);
  const correctRotation = piece.rotation === 0;
  if (dist < state.pieceSize * 0.6 && correctRotation) {
    placePiece(piece);
  } else {
    // Return to rail — restore rail size
    piece.el.classList.remove("dragging");
    piece.el.style.position = "";
    piece.el.style.left = "";
    piece.el.style.top = "";
    piece.el.style.width = state.railPieceSize + "px";
    piece.el.style.height = state.railPieceSize + "px";
    const railTotal = state.railPieceSize * state.level.grid;
    piece.el.style.backgroundSize = `${railTotal}px ${railTotal}px`;
    piece.el.style.backgroundPosition = `-${piece.col * state.railPieceSize}px -${piece.row * state.railPieceSize}px`;
    // Wiggle to hint at wrong rotation if applicable
    if (dist < state.pieceSize * 0.6 && !correctRotation) wiggle(piece.el);
  }
  state.drag = null;
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

function placePiece(piece) {
  piece.placed = true;
  piece.el.classList.remove("dragging", "in-rail", "hint-glow", "rotatable");
  piece.el.classList.add("in-board");
  piece.el.style.position = "";
  piece.el.style.left = "";
  piece.el.style.top = "";
  // Resize to full board cell size; transform back to 0deg
  piece.rotation = 0;
  piece.el.style.transform = "";
  // Move piece DOM into target cell
  const cell = getCellAt(piece.row, piece.col);
  cell.classList.add("filled");
  cell.innerHTML = "";
  cell.appendChild(piece.el);
  piece.el.style.width = "100%";
  piece.el.style.height = "100%";
  const totalSlice = state.pieceSize * state.level.grid;
  piece.el.style.backgroundSize = `${totalSlice}px ${totalSlice}px`;
  piece.el.style.backgroundPosition = `-${piece.col * state.pieceSize}px -${piece.row * state.pieceSize}px`;
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
  // For each unplaced piece, drop a translucent "ghost" on its target cell
  // that fades from full opacity to 0 over the 5-second hint window.
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
    ghost.style.transition = "opacity 5s linear";
    cell.appendChild(ghost);
    // Force layout, then trigger the fade
    void ghost.offsetWidth;
    ghost.style.opacity = "0";
    ghosts.push(ghost);
  });
  // Pulse-glow the rail pieces while the hint is up
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
