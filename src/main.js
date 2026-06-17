// Orchestrates the FREE-PLAY grid demo: load the WASM horde, run a fixed-timestep
// simulation, feed the shared feature vector (last-clicked cell + tile-coded
// cursor) to every cell's predictor each tick, and drive the renderer. The horde
// predicts your NEXT click (the most-confident cell, excluding the one you just
// clicked) and pre-lights it; the full set of cell values IS the intent heatmap.
// Logic runs at 30 Hz; rendering runs every animation frame.

import { selfCheck } from "./features.js";
import { createGame } from "./game.js";
import { createHorde } from "./horde.js";
import { createRenderer } from "./ui.js";

const $ = (id) => document.getElementById(id);
const TICK_MS = 1000 / 30;
const HISTORY = 200;
const ACC_WINDOW = 24;

selfCheck(); // throws if the tile coder ever escapes the feature budget

const game = createGame();
const renderer = createRenderer({
  arena: $("arena"),
  scope: $("scope"),
  gaugeArc: $("gauge-arc"),
  gaugeValue: $("gauge-value"),
});

const view = { predicted: -1, anticipation: 0, values: new Array(game.N).fill(0), lastCell: -1 };
const history = [];
const accWindow = [];
let streak = 0;
let heatmapOn = true;
let paused = false;
let horde = null;

// ---- slider <-> hyperparameter mapping -------------------------------------
const metaFromSlider = (s) => Math.pow(10, -5 + 3 * (s / 100)); // 1e-5 .. 1e-2
const lambdaFromSlider = (s) => s / 100; // 0 .. 0.99

function currentParams() {
  return {
    metaStepSize: metaFromSlider(+$("s-meta").value),
    lambda: lambdaFromSlider(+$("s-lambda").value),
  };
}

function syncParamLabels() {
  $("v-meta").textContent = metaFromSlider(+$("s-meta").value).toExponential(1);
  $("v-lambda").textContent = lambdaFromSlider(+$("s-lambda").value).toFixed(2);
}

// ---- input -----------------------------------------------------------------
function arenaCoords(e) {
  const r = $("arena").getBoundingClientRect();
  const nx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const ny = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  return { nx, ny };
}
$("arena").addEventListener("pointermove", (e) => {
  const { nx, ny } = arenaCoords(e);
  game.onMove(nx, ny);
});
$("arena").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const { nx, ny } = arenaCoords(e);
  game.onDown(nx, ny);
});

// ---- controls --------------------------------------------------------------
function softReset() {
  if (horde) horde.reset(currentParams());
  game.reset();
  history.length = 0;
  accWindow.length = 0;
  streak = 0;
  view.predicted = -1;
  view.anticipation = 0;
  view.lastCell = -1;
  view.values = new Array(game.N).fill(0);
}

$("s-meta").addEventListener("input", () => { syncParamLabels(); softReset(); });
$("s-lambda").addEventListener("input", () => { syncParamLabels(); softReset(); });
$("btn-reset").addEventListener("click", softReset);
$("btn-heatmap").addEventListener("click", (e) => {
  heatmapOn = !heatmapOn;
  e.currentTarget.setAttribute("aria-pressed", String(heatmapOn));
});
$("btn-pause").addEventListener("click", (e) => {
  paused = !paused;
  e.currentTarget.setAttribute("aria-pressed", String(paused));
  e.currentTarget.textContent = paused ? "Resume" : "Pause";
});

window.addEventListener("resize", () => renderer.resize());

// ---- simulation ------------------------------------------------------------
// Predict the next click: the most-confident cell, excluding the one you just
// clicked (you rarely click the same cell twice in a row).
function bestExcluding(values, exclude) {
  let best = -Infinity, idx = -1;
  for (let k = 0; k < values.length; k++) {
    if (k === exclude) continue;
    if (values[k] > best) { best = values[k]; idx = k; }
  }
  if (idx === -1) idx = 0;
  return { idx, val: best === -Infinity ? 0 : best };
}

function logicTick() {
  const standing = view.predicted; // guess shown up to this moment
  const phi = game.features(); // context = last clicked + cursor — read BEFORE consumeTick
  const { rewards, rewarded } = game.consumeTick(); // a click sets the new context

  const values = horde.step(phi, rewards);
  const pred = bestExcluding(values, game.lastCell);
  view.values = values;
  view.predicted = pred.idx;
  view.anticipation = pred.val;
  view.lastCell = game.lastCell;

  history.push({ a: Math.max(0, pred.val), r: rewarded !== null });
  while (history.length > HISTORY) history.shift();

  if (rewarded !== null) {
    const c = game.cells[rewarded];
    renderer.addBurst(c.x, c.y);
    const correct = standing === rewarded;
    accWindow.push(correct ? 1 : 0);
    while (accWindow.length > ACC_WINDOW) accWindow.shift();
    streak = correct ? streak + 1 : 0;
  }

  updateReadouts();
}

function updateReadouts() {
  renderer.setGauge(view.anticipation);
  const st = game.stats;
  $("m-clicks").textContent = String(st.clicks);
  $("m-streak").textContent = String(streak);
  $("m-rate").textContent = horde.actualRateOfLearning(view.predicted >= 0 ? view.predicted : 0).toFixed(3);
  if (accWindow.length >= 4) {
    const acc = accWindow.reduce((a, b) => a + b, 0) / accWindow.length;
    $("m-accuracy").textContent = `${Math.round(acc * 100)}%`;
  } else {
    $("m-accuracy").textContent = "—";
  }
}

function render() {
  renderer.renderArena({
    cells: game.cells,
    cols: game.CELLS,
    cursor: game.cursor,
    predicted: view.predicted,
    lastCell: view.lastCell,
    values: view.values,
    anticipation: view.anticipation,
    heatmapOn,
  });
  renderer.renderScope(history);
}

// ---- boot ------------------------------------------------------------------
let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = now - last;
  last = now;
  if (dt > 250) dt = 250; // don't spiral after a background tab
  if (!paused && horde) {
    acc += dt;
    while (acc >= TICK_MS) { logicTick(); acc -= TICK_MS; }
  }
  render();
}

async function boot() {
  syncParamLabels();
  renderer.resize();
  requestAnimationFrame(frame); // start rendering immediately (idle arena)
  try {
    horde = await createHorde(game.N, currentParams());
    $("status-dot").classList.add("ready");
    $("status-text").textContent = "live";
  } catch (err) {
    console.error(err);
    $("status-text").textContent = "failed to load wasm";
  }
}

boot();
