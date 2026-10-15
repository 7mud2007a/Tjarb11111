// jellyScene.js
// Framework-free pieces of the jelly slider: scene constants, the spring
// physics, geometry builders and the % label painter. No three.js imports.

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---- World layout (units are arbitrary; the groove is 6 long) -------------
export const GROOVE_LENGTH = 6;
export const GROOVE_WIDTH = 0.95;
export const X_LEFT = -2.45; // where the jelly is anchored
export const X_MIN = -1.9; // handle position at 0 %
export const X_MAX = 2.45; // handle position at 100 %
export const REST_VALUE = 48;

export const NODES = 72; // samples along the jelly
export const SECTION = 24; // samples around its cross-section (8 + 8 + 8)
export const SHADOW_ROWS = 6;

export const VIEW_WIDTH = 9.1; // world width the camera frames
export const CAMERA_DIR = [0, 0.788, 0.616]; // from target towards camera
export const CAMERA_TARGET = [0, 0.2, 0];
export const LIGHT = [0.5, 0.85, -0.55]; // towards the light (behind, right)
export const TEXT_RECT = [0.28, 2.76, 0.0, 0.31]; // x0, x1, zCenter, zHalf

// ---- Jelly body tuning ----------------------------------------------------
const H0 = 1.45; // wall height at rest
const HALF_T = 0.085; // half thickness of the wall
const BEND_MAX = 0.76; // max sideways S-bend (stays inside the groove)
const CAP_W = 0.17; // rounded end-cap length
const KNOB_W = 0.30; // reach of the handle bulb
const KN = 5200; // chain stiffness
const KT = 170; // pull back to even spacing (higher = catches up faster)

const L_REST = X_MIN + (REST_VALUE / 100) * (X_MAX - X_MIN) - X_LEFT;

// Height profile along the jelly: tall rounded hump at the left, tapering
// down towards the handle.
function profile(f) {
  const rise = 0.55 + 0.45 * Math.sin(Math.min(f / 0.14, 1) * Math.PI * 0.5);
  const fall = 1 - 0.34 * sstep(0.12, 0.92, f);
  return rise * fall;
}

export class JellyChain {
  constructor(value = REST_VALUE) {
    this.x = new Float32Array(NODES);
    this.vx = new Float32Array(NODES);
    this.z = new Float32Array(NODES);
    this.h = new Float32Array(NODES);
    this.knob = new Float32Array(NODES);
    this.shear = new Float32Array(NODES);
    this.handleX = 0;
    this.handleV = 0;
    this.target = 0;
    this.bend = 0;
    this.bendV = 0;
    this.thin = 0.5;
    this.setValue(value, true);
  }

  valueToX(v) {
    return X_MIN + (clamp(v, 0, 100) / 100) * (X_MAX - X_MIN);
  }

  xToValue(x) {
    return clamp(((x - X_MIN) / (X_MAX - X_MIN)) * 100, 0, 100);
  }

  get value() {
    return this.xToValue(this.handleX);
  }

  setTargetX(x) {
    this.target = clamp(x, X_MIN, X_MAX);
  }

  setValue(v, snap = false) {
    const x = this.valueToX(v);
    this.target = x;
    if (!snap) return;
    this.handleX = x;
    this.handleV = 0;
    const L = x - X_LEFT;
    for (let i = 0; i < NODES; i++) {
      this.x[i] = X_LEFT + (L * i) / (NODES - 1);
      this.vx[i] = 0;
    }
    this.bend = BEND_MAX * sstep(1.9, 0.6, L / L_REST);
    this.bendV = 0;
    this.derive();
  }

  isSettled() {
    if (Math.abs(this.target - this.handleX) > 1e-3) return false;
    if (Math.abs(this.handleV) > 1e-2 || Math.abs(this.bendV) > 1e-2) return false;
    const L = this.handleX - X_LEFT;
    if (Math.abs(this.bend - BEND_MAX * sstep(1.9, 0.6, L / L_REST)) > 2e-3) return false;
    for (let i = 1; i < NODES - 1; i++) {
      if (Math.abs(this.vx[i]) > 1e-2) return false;
      if (Math.abs(this.x[i] - (X_LEFT + (L * i) / (NODES - 1))) > 2e-3) return false;
    }
    return true;
  }

  step(dtFrame, calm = false) {
    const SUB = 4;
    const dt = Math.min(dtFrame, 1 / 30) / SUB;
    const kH = calm ? 700 : 420;
    const cH = calm ? 55 : 30;
    const cN = calm ? 20 : 9;
    const kB = calm ? 320 : 260;
    const cB = calm ? 34 : 9;
    const n = NODES;
    const x = this.x;
    const vx = this.vx;

    for (let s = 0; s < SUB; s++) {
      // The handle chases the pointer on a slightly under-damped spring.
      const ah = kH * (this.target - this.handleX) - cH * this.handleV;
      this.handleV += ah * dt;
      this.handleX = clamp(this.handleX + this.handleV * dt, X_MIN - 0.3, X_MAX + 0.12);

      const L = Math.max(this.handleX - X_LEFT, 0.25);
      const ell = L / (n - 1);
      x[0] = X_LEFT;
      vx[0] = 0;
      x[n - 1] = this.handleX;
      vx[n - 1] = this.handleV;

      // Mass-spring chain between the anchor and the handle -> ripples.
      for (let i = 1; i < n - 1; i++) {
        const a =
          KN * (x[i + 1] - 2 * x[i] + x[i - 1]) - cN * vx[i] + KT * (X_LEFT + ell * i - x[i]);
        vx[i] += a * dt;
      }
      for (let i = 1; i < n - 1; i++) {
        x[i] += vx[i] * dt;
        const lo = x[i - 1] + ell * 0.15;
        if (x[i] < lo) {
          x[i] = lo;
          if (vx[i] < 0) vx[i] = 0;
        }
      }
      // Nodes bunch up against the handle instead of overtaking it.
      for (let i = n - 2; i >= 1; i--) {
        const hi = x[i + 1] - ell * 0.15;
        if (x[i] > hi) {
          x[i] = hi;
          if (vx[i] > 0) vx[i] = 0;
        }
      }

      // Sideways S-bend: the sheet buckles when compressed, flattens when
      // stretched. Its own wobbly spring gives the squishy overshoot.
      const bt = BEND_MAX * sstep(1.9, 0.6, L / L_REST);
      const ab = kB * (bt - this.bend) - cB * this.bendV;
      this.bendV += ab * dt;
      this.bend = clamp(this.bend + this.bendV * dt, -0.15, BEND_MAX + 0.12);
    }
    this.derive();
  }

  // Turns the simulation state into per-node height / sideways offset.
  derive() {
    const n = NODES;
    const L = Math.max(this.handleX - X_LEFT, 0.25);
    const ellRest = L_REST / (n - 1);
    const r = L / L_REST;
    this.thin = clamp((r - 0.55) / 1.0, 0, 1);
    // When stretched the sheet evens out into a long, flat, glowing strip.
    const flat = 0.7 * sstep(1.1, 1.8, r);

    for (let i = 0; i < n; i++) {
      // Measured over a window of nodes so fast flicks stay smooth, not jagged.
      const i0 = Math.max(i - 4, 0);
      const i1 = Math.min(i + 4, n - 1);
      let vs = 0;
      for (let k = i0; k <= i1; k++) vs += this.vx[k];
      this.shear[i] = vs / (i1 - i0 + 1);
      // Local stretch -> volume is conserved: stretched = low, squashed = tall.
      const span = (this.x[i1] - this.x[i0]) / ((i1 - i0) * ellRest);
      // Squashing grows the wall, but with a soft ceiling (~1.4x rest height).
      const raw = Math.pow(1 / Math.max(span, 0.05), 1.25);
      const local = raw <= 1 ? Math.max(raw, 0.3) : 1 + 0.4 * (1 - Math.exp(-(raw - 1) / 0.5));

      const db = (this.handleX - this.x[i]) / KNOB_W;
      const knob = Math.exp(-db * db);
      this.knob[i] = knob;

      const d = Math.min(this.x[i] - X_LEFT, this.handleX - this.x[i]);
      let cap = 1;
      if (d < CAP_W) {
        const u = 1 - Math.max(d, 0) / CAP_W;
        cap = Math.sqrt(Math.max(0, 1 - u * u));
      }

      const prof = profile(i / (n - 1)) * (1 - flat) + 0.8 * flat;
      this.h[i] = H0 * (prof * local + 0.2 * knob) * cap;
      const fx = clamp((this.x[i] - X_LEFT) / L, 0, 1);
      this.z[i] = (sstep(0, 1, fx) - 0.5) * this.bend;
    }

    // One soft [1 2 1] pass keeps the top edge fluid (end caps stay put).
    let prev = this.h[0];
    for (let i = 1; i < n - 1; i++) {
      const cur = this.h[i];
      this.h[i] = (prev + 2 * cur + this.h[i + 1]) * 0.25;
      prev = cur;
    }
  }
}

// ---- Geometry -------------------------------------------------------------
export function jellyIndices() {
  const idx = [];
  for (let i = 0; i < NODES - 1; i++) {
    for (let j = 0; j < SECTION - 1; j++) {
      const a = i * SECTION + j;
      const b = (i + 1) * SECTION + j;
      const c = (i + 1) * SECTION + j + 1;
      const d = i * SECTION + j + 1;
      idx.push(a, b, c, a, c, d);
    }
  }
  return new Uint16Array(idx);
}

export function shadowIndices() {
  const idx = [];
  for (let i = 0; i < NODES - 1; i++) {
    for (let r = 0; r < SHADOW_ROWS - 1; r++) {
      const a = i * SHADOW_ROWS + r;
      const b = (i + 1) * SHADOW_ROWS + r;
      const c = (i + 1) * SHADOW_ROWS + r + 1;
      const d = i * SHADOW_ROWS + r + 1;
      idx.push(a, b, c, a, c, d);
    }
  }
  return new Uint16Array(idx);
}

export const JELLY_VERTS = NODES * SECTION;
export const SHADOW_VERTS = NODES * SHADOW_ROWS;

// Writes the thick, curved wall into position/uv buffers.
export function fillJelly(chain, pos, uv) {
  const n = NODES;
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(i - 1, 0);
    const i1 = Math.min(i + 1, n - 1);
    let tx = chain.x[i1] - chain.x[i0];
    let tz = chain.z[i1] - chain.z[i0];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    const nx = -tz; // plan-view normal, roughly +z (towards the viewer)
    const nz = tx;
    const H = chain.h[i];
    const kb = chain.knob[i];
    const rr = Math.min(HALF_T * (1 + 1.6 * kb), H * 0.5);
    const sCol = i / (n - 1);
    const cs = sCol + (1 - sCol) * kb;
    // The top lags behind the base when the jelly moves (inertia).
    const shear = -clamp(chain.shear[i] * 0.05, -0.35, 0.35);

    for (let j = 0; j < SECTION; j++) {
      let y;
      let o;
      if (j < 8) {
        y = (H - rr) * (j / 7);
        o = -rr;
      } else if (j < 16) {
        const th = ((j - 8 + 0.5) / 8) * Math.PI;
        o = -rr * Math.cos(th);
        y = H - rr + rr * Math.sin(th);
      } else {
        y = (H - rr) * (1 - (j - 16) / 7);
        o = rr;
      }
      const sx = shear * (y / H0);
      const v = i * SECTION + j;
      pos[v * 3] = chain.x[i] + nx * o + sx;
      pos[v * 3 + 1] = y;
      pos[v * 3 + 2] = chain.z[i] + nz * o;
      uv[v * 2] = cs;
      uv[v * 2 + 1] = H > 1e-4 ? y / H : 0;
    }
  }
}

export function computeNormals(pos, idx, nor) {
  nor.fill(0);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3;
    const b = idx[t + 1] * 3;
    const c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a];
    const uy = pos[b + 1] - pos[a + 1];
    const uz = pos[b + 2] - pos[a + 2];
    const wx = pos[c] - pos[a];
    const wy = pos[c + 1] - pos[a + 1];
    const wz = pos[c + 2] - pos[a + 2];
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    for (const k of [a, b, c]) {
      nor[k] += nx;
      nor[k + 1] += ny;
      nor[k + 2] += nz;
    }
  }
  for (let k = 0; k < nor.length; k += 3) {
    const l = Math.hypot(nor[k], nor[k + 1], nor[k + 2]) || 1;
    nor[k] /= l;
    nor[k + 1] /= l;
    nor[k + 2] /= l;
  }
}

// Soft coloured shadow streak thrown on the surface, away from the light.
export function fillShadow(chain, pos, uv, aH) {
  const n = NODES;
  const sdx = -0.42;
  const sdz = 0.91;
  for (let i = 0; i < n; i++) {
    const len = chain.h[i] * 1.15;
    for (let r = 0; r < SHADOW_ROWS; r++) {
      const v = r / (SHADOW_ROWS - 1);
      const k = i * SHADOW_ROWS + r;
      pos[k * 3] = chain.x[i] + sdx * len * v;
      pos[k * 3 + 1] = 0.003;
      pos[k * 3 + 2] = chain.z[i] + sdz * len * v;
      uv[k * 2] = i / (n - 1);
      uv[k * 2 + 1] = v;
      aH[k] = chain.h[i] / H0;
    }
  }
}

// ---- % label --------------------------------------------------------------
export const LABEL_W = 512;
export const LABEL_H = 128;

export function drawLabel(canvas, value, fontFamily) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#000';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  const base = h * 0.8;
  ctx.font = `500 ${Math.round(h * 0.34)}px ${fontFamily}`;
  const pw = ctx.measureText('%').width;
  ctx.fillText('%', w - 6, base);
  ctx.font = `600 ${Math.round(h * 0.78)}px ${fontFamily}`;
  ctx.fillText(String(Math.round(value)), w - 10 - pw, base);
}
