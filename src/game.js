// The task/environment — FREE PLAY on a CELLS x CELLS grid.
//
// There is no prescribed order. The visitor clicks anywhere in the grid, in
// whatever order, and develops their own habit. Each cell owns a SwiftTD
// predictor; the click lands in a cell, that cell's predictor is rewarded, and
// that cell becomes the "context" (the one-hot the horde conditions on). The
// horde learns whatever regularity emerges and predicts the next click.
//
// All positions/cursor are normalized to [0, 1] within a square play area; the
// UI maps them to pixels.

import { FEATURE_CONFIG, cellIndex, encode } from "./features.js";

export function createGame(opts = {}) {
  const CELLS = opts.cells ?? FEATURE_CONFIG.CELLS;
  const N = CELLS * CELLS;

  // Cell centers (normalized) for rendering markers/bursts.
  const cells = [];
  for (let i = 0; i < N; i++) {
    const cx = i % CELLS;
    const cy = Math.floor(i / CELLS);
    cells.push({ x: (cx + 0.5) / CELLS, y: (cy + 0.5) / CELLS, cx, cy });
  }

  let cursor = { x: 0.5, y: 0.5 };
  let lastCell = -1; // context: the previously clicked cell (-1 before any click)
  let pendingClick = null; // a cell clicked since last tick, or null
  let stats = { ticks: 0, clicks: 0 };

  return {
    cells, N, CELLS,
    get cursor() { return cursor; },
    get stats() { return { ...stats }; },
    get lastCell() { return lastCell; },

    onMove(nx, ny) { cursor = { x: nx, y: ny }; },

    onDown(nx, ny) {
      cursor = { x: nx, y: ny };
      pendingClick = cellIndex(nx, ny); // anywhere in the arena hits some cell
    },

    // Shared feature vector for THIS tick: context = last clicked cell + cursor.
    // Must be read BEFORE consumeTick(), which advances the context.
    features() {
      return encode(lastCell, cursor.x, cursor.y);
    },

    // Cumulants for this tick; a click rewards that cell's predictor and becomes
    // the new context.
    consumeTick() {
      stats.ticks++;
      const rewards = new Array(N).fill(0);
      let rewarded = null;
      if (pendingClick !== null) {
        rewards[pendingClick] = 1;
        rewarded = pendingClick;
        stats.clicks++;
        lastCell = pendingClick;
        pendingClick = null;
      }
      return { rewards, rewarded };
    },

    reset() {
      cursor = { x: 0.5, y: 0.5 };
      lastCell = -1;
      pendingClick = null;
      stats = { ticks: 0, clicks: 0 };
    },
  };
}
