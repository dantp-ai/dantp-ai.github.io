// Feature encoder for the SwiftTD click-anticipation demo (free play, grid).
//
// The play area is a CELLS x CELLS grid; each cell owns its own SwiftTD predictor
// (a General Value Function: "how soon will THIS cell be clicked?"). Every
// predictor shares one set of active binary feature indices each tick:
//
//   [0, N_CELLS)                         one-hot(cell you last clicked)
//       -> the transition structure: "after cell A I tend to click B".
//
//   [N_CELLS, N_CELLS + TILINGS*GRID*GRID)   tile-coded cursor (x, y)
//       -> the approach structure: neighboring cursor positions share most of
//          their active tiles, so a value learned at one spot generalizes to
//          nearby spots (Sutton-style tile coding). This gives the value field
//          its smooth shape and the "rises as you approach" behavior.
//
// Tile coding overlays TILINGS copies of a GRID x GRID grid, each displaced by an
// asymmetric offset (the canonical odd-number (1, 3) displacement) so the tilings
// decorrelate and cover the space evenly.

export const FEATURE_CONFIG = {
  CELLS: 6,     // click grid (one predictor per cell)
  TILINGS: 8,   // cursor tile coding
  GRID: 12,
};

FEATURE_CONFIG.N_CELLS = FEATURE_CONFIG.CELLS * FEATURE_CONFIG.CELLS;
FEATURE_CONFIG.TILES_PER_TILING = FEATURE_CONFIG.GRID * FEATURE_CONFIG.GRID;
FEATURE_CONFIG.TILE_BASE = FEATURE_CONFIG.N_CELLS;
FEATURE_CONFIG.NUM_FEATURES =
  FEATURE_CONFIG.N_CELLS + FEATURE_CONFIG.TILINGS * FEATURE_CONFIG.TILES_PER_TILING;

const clampUnit = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampInt = (v, hi) => (v < 0 ? 0 : v > hi ? hi : v);

// Asymmetric per-tiling displacement (tiles3-style "first odd integers"): tiling
// i is shifted by i*(1, 3) tile-widths, wrapped into one tile.
const DISP = [1, 3];
function tilingOffset(i, tilings) {
  return {
    ox: ((i * DISP[0]) % tilings) / tilings,
    oy: ((i * DISP[1]) % tilings) / tilings,
  };
}

// Which grid cell a normalized point falls in (0 .. N_CELLS-1).
export function cellIndex(x, y, cfg = FEATURE_CONFIG) {
  const cx = clampInt(Math.floor(clampUnit(x) * cfg.CELLS), cfg.CELLS - 1);
  const cy = clampInt(Math.floor(clampUnit(y) * cfg.CELLS), cfg.CELLS - 1);
  return cy * cfg.CELLS + cx;
}

// Tile indices for a normalized cursor (x, y in [0, 1]).
export function tileIndices(x, y, cfg = FEATURE_CONFIG) {
  const { TILINGS, GRID, TILES_PER_TILING, TILE_BASE } = cfg;
  const nx = clampUnit(x);
  const ny = clampUnit(y);
  const out = new Array(TILINGS);
  for (let i = 0; i < TILINGS; i++) {
    const { ox, oy } = tilingOffset(i, TILINGS);
    const gx = clampInt(Math.floor(nx * GRID + ox), GRID - 1);
    const gy = clampInt(Math.floor(ny * GRID + oy), GRID - 1);
    out[i] = TILE_BASE + i * TILES_PER_TILING + gy * GRID + gx;
  }
  return out;
}

// Full shared feature vector: tile-coded cursor + one-hot(last clicked cell).
export function encode(lastCell, x, y, cfg = FEATURE_CONFIG) {
  const feats = tileIndices(x, y, cfg);
  if (lastCell >= 0 && lastCell < cfg.N_CELLS) feats.push(lastCell);
  return feats;
}

// Sanity check: every index a cursor/context can produce stays within budget.
export function selfCheck(cfg = FEATURE_CONFIG) {
  let maxIdx = -1;
  for (let gy = 0; gy <= 20; gy++) {
    for (let gx = 0; gx <= 20; gx++) {
      const feats = encode(cfg.N_CELLS - 1, gx / 20, gy / 20, cfg);
      for (const f of feats) {
        if (f < 0 || f >= cfg.NUM_FEATURES) {
          throw new Error(`feature index ${f} out of range [0, ${cfg.NUM_FEATURES})`);
        }
        if (f > maxIdx) maxIdx = f;
      }
    }
  }
  return { numFeatures: cfg.NUM_FEATURES, maxIndexSeen: maxIdx };
}
