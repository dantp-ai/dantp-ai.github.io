// Renderer for the minimal "blueprint" instrument (light theme): the grid arena
// (intent heatmap = per-cell predicted value, predicted-next cell, last-clicked
// context, reward bursts, slick ink cursor), the value-trace scope, and the
// radial anticipation gauge. Drawing is a pure function of the snapshot the main
// loop hands in; only short-lived effects (bursts) are owned here.

const INK = "#16181d";   // near-black: cursor, context marker, text
const BLUE = "#2b39e0";  // the accent: value / prediction / intent field
const CELLSEP = "rgba(20, 23, 28, 0.10)";

const VMAX = 0.7; // value mapped to "fully lit"

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const litness = (v) => Math.pow(clamp01(v / VMAX), 0.7);

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function createRenderer({ arena, scope, gaugeArc, gaugeValue }) {
  const actx = arena.getContext("2d");
  const sctx = scope.getContext("2d");

  let A = { w: 0, h: 0 };
  let S = { w: 0, h: 0 };
  const bursts = []; // {x, y, t0} in normalized arena coords

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const [cv, ctx, store] of [[arena, actx, A], [scope, sctx, S]]) {
      const r = cv.getBoundingClientRect();
      store.w = r.width;
      store.h = r.height;
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  // ---- Arena (grid) --------------------------------------------------------
  function renderArena(snap) {
    const t = performance.now();
    const W = A.w, H = A.h;
    const cols = snap.cols;
    const cw = W / cols, ch = H / cols;
    actx.clearRect(0, 0, W, H);

    // intent heatmap: each cell tinted by its predicted next-click value
    if (snap.heatmapOn) {
      for (let i = 0; i < snap.cells.length; i++) {
        const lit = litness(snap.values[i] ?? 0);
        if (lit <= 0.01) continue;
        const c = snap.cells[i];
        actx.fillStyle = rgba(BLUE, 0.5 * lit);
        actx.fillRect(c.cx * cw + 1, c.cy * ch + 1, cw - 2, ch - 2);
      }
    }

    // grid separators
    actx.strokeStyle = CELLSEP;
    actx.lineWidth = 1;
    actx.beginPath();
    for (let k = 0; k <= cols; k++) {
      const x = Math.round(k * cw) + 0.5;
      const y = Math.round(k * ch) + 0.5;
      actx.moveTo(x, 0); actx.lineTo(x, H);
      actx.moveTo(0, y); actx.lineTo(W, y);
    }
    actx.stroke();

    // last-clicked cell — your current context ("you are here")
    if (snap.lastCell >= 0) {
      const c = snap.cells[snap.lastCell];
      actx.strokeStyle = rgba(INK, 0.45);
      actx.lineWidth = 1.5;
      actx.strokeRect(c.cx * cw + 4, c.cy * ch + 4, cw - 8, ch - 8);
    }

    // predicted next cell — the horde's guess of where you'll click
    if (snap.predicted >= 0) {
      const c = snap.cells[snap.predicted];
      actx.strokeStyle = BLUE;
      actx.lineWidth = 2;
      actx.strokeRect(c.cx * cw + 2.5, c.cy * ch + 2.5, cw - 5, ch - 5);
      const px = (c.cx + 0.5) * cw, py = (c.cy + 0.5) * ch;
      actx.fillStyle = BLUE;
      actx.beginPath();
      actx.arc(px, py, 2.5, 0, Math.PI * 2);
      actx.fill();
    }

    drawBursts(t);
    drawCursor(snap.cursor.x * W, snap.cursor.y * H);
  }

  function drawBursts(t) {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      const age = (t - b.t0) / 520;
      if (age >= 1) { bursts.splice(i, 1); continue; }
      const x = b.x * A.w, y = b.y * A.h;
      const s = (0.5 + age * 1.6) * Math.min(A.w, A.h) * 0.08;
      actx.strokeStyle = rgba(BLUE, 1 - age);
      actx.lineWidth = 2 * (1 - age) + 0.5;
      actx.strokeRect(x - s, y - s, s * 2, s * 2);
    }
  }

  function drawCursor(x, y) {
    actx.strokeStyle = rgba(INK, 0.7);
    actx.lineWidth = 1;
    actx.beginPath();
    actx.arc(x, y, 6, 0, Math.PI * 2);
    actx.stroke();
    actx.fillStyle = rgba(INK, 0.85);
    actx.beginPath();
    actx.arc(x, y, 1.6, 0, Math.PI * 2);
    actx.fill();
  }

  function addBurst(nx, ny) {
    bursts.push({ x: nx, y: ny, t0: performance.now() });
  }

  // ---- Oscilloscope --------------------------------------------------------
  function renderScope(history) {
    const W = S.w, H = S.h;
    sctx.clearRect(0, 0, W, H);
    const YMAX = 1.0;
    const yOf = (v) => H - clamp01(v / YMAX) * (H - 6) - 3;

    sctx.strokeStyle = rgba(INK, 0.07);
    sctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const y = (H / 4) * g + 0.5;
      sctx.beginPath();
      sctx.moveTo(0, y);
      sctx.lineTo(W, y);
      sctx.stroke();
    }

    const n = history.length;
    if (n < 2) return;
    const dx = W / (n - 1);

    // reward impulses
    sctx.strokeStyle = rgba(INK, 0.32);
    sctx.lineWidth = 1.25;
    for (let i = 0; i < n; i++) {
      if (history[i].r) {
        const x = i * dx;
        sctx.beginPath();
        sctx.moveTo(x, H);
        sctx.lineTo(x, 4);
        sctx.stroke();
      }
    }

    // value of the predicted next click
    sctx.strokeStyle = BLUE;
    sctx.lineWidth = 1.75;
    sctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = i * dx, y = yOf(history[i].a);
      i ? sctx.lineTo(x, y) : sctx.moveTo(x, y);
    }
    sctx.stroke();
  }

  // ---- Gauge ---------------------------------------------------------------
  function setGauge(value) {
    const fill = clamp01(value / 1.0) * 100;
    gaugeArc.style.strokeDasharray = `${fill} 100`;
    gaugeArc.style.stroke = BLUE;
    gaugeValue.textContent = (value < 0 ? 0 : value).toFixed(2);
  }

  return { resize, renderArena, renderScope, setGauge, addBurst };
}
