// Character renderer for Game Mode: a jointed 3D body (head, torso, arms, legs, boots, kit) posed by poses.js, viewed from any of
// eight directions at a fixed 3/4 camera, and rasterized to crisp pixel art. Every body part is a small set of ellipsoids that are
// ray-cast per pixel (orthographic, nearest wins), lit by one directional light and quantized to four tones, with a colored
// one-pixel outline. Because it is one body seen from different angles, every facing and every animation stays consistent.
// Pure: returns RGBA buffers ({ width, height, data }); no DOM.

import { poseFor } from './poses.js';

/** The canvas for a player drawn at `ppm` pixels per meter: sized in meters (2.96 x 2.81, feet 2.44 m down), so every scale shows the same picture. */
export function viewFor(ppm) {
  return { width: Math.ceil((80 / 27) * ppm), height: Math.ceil((76 / 27) * ppm), anchorX: Math.round((40 / 27) * ppm), footY: Math.round((66 / 27) * ppm), scale: ppm, pitch: 0.42 };
}
/** The reference view (27 px per meter) that tests and the sprite sheet use. */
export const VIEW = Object.freeze(viewFor(27));

const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const rx = (a) => { const c = Math.cos(a); const s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const ry = (a) => { const c = Math.cos(a); const s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rz = (a) => { const c = Math.cos(a); const s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
const mul = (a, b) => { const r = new Array(9); for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]; return r; };
const apply = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const applyT = (m, v) => [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const LIGHT = unit([-0.45, 0.65, 0.62]);
const TONES = [0.52, 0.76, 1, 1.2];

/** A chain of spheres from `a` to `b` tapering from radius `r0` to `r1`, over the span t0..t1 of the segment. */
function limb(out, a, b, r0, r1, mat, t0 = 0, t1 = 1) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const steps = Math.max(2, Math.ceil((length * (t1 - t0)) / (Math.min(r0, r1) * 0.55)));
  for (let i = 0; i <= steps; i += 1) {
    const t = t0 + ((t1 - t0) * i) / steps;
    const r = (r0 + (r1 - r0) * t) * 1.14;
    out.push({ c: lerp3(a, b, t), M: null, r: [r, r, r], mat: typeof mat === 'function' ? (u) => mat(u, t) : mat });
  }
}
const ellipsoid = (out, c, M, r, mat) => out.push({ c, M, r, mat });

// Materials: a key into the palette, or a function of the unit-sphere point `u` of the hit that returns one.
const head = (u) => {
  const { x, y, z } = u;
  if (Math.abs(x) > 0.9 && y < 0.3 && y > -0.3 && z > -0.35 && z < 0.45) return 'skin'; // ears
  if (y > 0.36 || (z < -0.2 && y > -0.5)) return 'hair';
  if (z > 0.35) {
    if (y > 0.2 && y < 0.34 && Math.abs(x) > 0.2 && Math.abs(x) < 0.62) return 'hair'; // brows
    if (y > -0.02 && y < 0.18 && Math.abs(x) > 0.26 && Math.abs(x) < 0.58) return 'eye';
    if (y > -0.5 && y < -0.38 && Math.abs(x) < 0.25) return 'mouth';
    if (y > -0.22 && y < -0.04 && Math.abs(x) < 0.12 && z > 0.85) return 'skinLight';
  }
  return 'skin';
};
const chest = (u) => {
  const { x, y, z } = u;
  if (z > 0.1 && y > 0.7) return Math.abs(x) < 0.2 && z > 0.3 ? 'skin' : 'trim'; // v-neck and collar
  if (z > 0.55 && x < -0.38 && x > -0.64 && y > 0.1 && y < 0.34) return 'trim'; // crest
  if (z < -0.35 && y > -0.2 && y < 0.5 && Math.abs(x) < 0.12) return 'trim'; // number stroke on the back
  if (z < -0.35 && y > 0.58 && y < 0.7) return 'trim'; // yoke
  return 'shirt';
};
const hem = (u) => (u.y < -0.72 ? 'trim' : 'shirt');
const boot = (u) => (u.y < -0.62 ? 'sole' : u.z > 0.55 && u.y > 0.35 ? 'bootLace' : 'boots');
const glove = (u) => (u.y < -0.3 && u.z > 0 ? 'trim' : 'glove');

/** Every body part for `pose` as ellipsoids in body space (y up, facing +z, feet near y = 0). */
function buildBody(pose, keeper) {
  const out = [];
  const P = [0, 0.97, 0];
  const Rt = mul(rz(pose.bend), mul(rx(pose.lean), ry(pose.twist)));
  const Rh = mul(Rt, mul(rx(pose.hp), ry(pose.hy)));
  const at = (R, o) => add(P, apply(R, o));

  ellipsoid(out, at(I, [0, 0.0, 0]), I, [0.175, 0.13, 0.125], 'shorts');
  ellipsoid(out, at(Rt, [0, 0.2, 0]), Rt, [0.17, 0.17, 0.12], hem);
  ellipsoid(out, at(Rt, [0, 0.4, 0]), Rt, [0.21, 0.17, 0.138], chest);
  limb(out, at(Rt, [0, 0.52, 0.01]), at(Rt, [0, 0.64, 0.02]), 0.046, 0.042, 'skin');
  ellipsoid(out, at(Rt, [0, 0.74, 0.02]), Rh, [0.1, 0.122, 0.108], head);

  const arm = (side, f, ab, e) => {
    const S = at(Rt, [side * 0.2, 0.5, 0]);
    const d1 = apply(Rt, unit([side * Math.sin(ab), -Math.cos(ab) * Math.cos(f), Math.cos(ab) * Math.sin(f)]));
    const E = add(S, scale(d1, 0.29));
    const d2 = apply(Rt, unit([side * Math.sin(ab) * 0.6, -Math.cos(ab) * Math.cos(f + e), Math.cos(ab) * Math.sin(f + e)]));
    const W = add(E, scale(d2, 0.26));
    out.push({ c: S, M: null, r: [0.07, 0.07, 0.07], mat: 'shirt' });
    limb(out, S, E, 0.056, 0.048, 'shirt', 0, keeper ? 1 : 0.7);
    if (!keeper) limb(out, S, E, 0.05, 0.047, 'skin', 0.7, 1);
    limb(out, E, W, 0.045, 0.036, keeper ? 'shirt' : 'skin', 0, 1);
    if (keeper) limb(out, E, W, 0.05, 0.044, 'trim', 0.82, 0.95);
    const hand = add(W, scale(d2, 0.045));
    out.push({ c: hand, M: null, r: keeper ? [0.066, 0.066, 0.066] : [0.043, 0.043, 0.043], mat: keeper ? glove : 'skin' });
  };
  arm(-1, pose.af, pose.aa, pose.ae);
  arm(1, pose.bf, pose.ba, pose.be);

  const leg = (side, f, ab, k, b) => {
    const H = [side * 0.095, 0.95, 0];
    const d1 = unit([side * Math.sin(ab), -Math.cos(ab) * Math.cos(f), Math.cos(ab) * Math.sin(f)]);
    const K = add(H, scale(d1, 0.45));
    const a2 = f - k;
    const d2 = unit([side * Math.sin(ab) * 0.35, -Math.cos(a2), Math.sin(a2)]);
    const A = add(K, scale(d2, 0.45));
    limb(out, H, K, 0.08, 0.06, 'skin');
    limb(out, H, K, 0.103, 0.084, 'shorts', 0, 0.6);
    limb(out, K, A, 0.054, 0.04, 'skin');
    limb(out, K, A, 0.06, 0.045, (u, t) => (t < 0.28 ? 'trim' : 'socks'), 0.12, 1);
    const fd = [0, -Math.sin(b), Math.cos(b)];
    ellipsoid(out, add(add(A, scale(fd, 0.075)), [0, -0.03, 0]), rx(b), [0.052, 0.048, 0.135], boot);
  };
  leg(-1, pose.lf, pose.la, pose.lk, pose.lb);
  leg(1, pose.rf, pose.ra, pose.rk, pose.rb);
  return out;
}

/** The lowest world-space y reached by an ellipsoid (centre minus its vertical extent). */
function lowest(b) {
  if (!b.M) return b.c[1] - b.r[0];
  const e = Math.hypot(b.M[3] * b.r[0], b.M[4] * b.r[1], b.M[5] * b.r[2]);
  return b.c[1] - e;
}

const shade = (rgb, factor) => [Math.min(255, rgb[0] * factor), Math.min(255, rgb[1] * factor), Math.min(255, rgb[2] * factor)];

function colors(palette) {
  const mouth = [Math.min(255, palette.skin[0] * 0.78 + 30), palette.skin[1] * 0.5, palette.skin[2] * 0.5];
  return {
    skin: palette.skin, skinLight: shade(palette.skin, 1.12), hair: palette.hair, shirt: palette.shirt, shorts: palette.shorts, socks: palette.socks,
    trim: palette.trim, boots: palette.boots, bootLace: [200, 200, 205], sole: [232, 232, 236], glove: palette.glove, eye: palette.eye, mouth,
  };
}

/**
 * Renders one frame: `palette` from sprites.js, `action`/`frame` for the pose, `yaw` in radians (0 faces the camera, pi/2 faces
 * screen-right), `keeper` for the long-sleeved kit with gloves. `ppm` is the pixels per meter to draw at (the on-screen scale, so the picture is shown 1:1). Returns an RGBA buffer viewFor(ppm).width x height.
 */
export function renderPlayer({ palette, action, frame, yaw, keeper, ppm = VIEW.scale }) {
  const view = viewFor(ppm);
  const pose = poseFor(action, frame);
  const blobs = buildBody(pose, keeper);

  // Root rotation about the pelvis (lying poses), then rest the lowest point on the ground and lift by `air`.
  const Rroot = mul(rx(pose.rootPitch), rz(pose.rootRoll));
  const pivot = [0, 0.97, 0];
  for (const b of blobs) {
    b.c = add(pivot, apply(Rroot, add(b.c, scale(pivot, -1))));
    if (b.M) b.M = mul(Rroot, b.M);
    b.c[2] += pose.sz;
  }
  let floor = Infinity;
  for (const b of blobs) floor = Math.min(floor, lowest(b));
  for (const b of blobs) b.c[1] += -floor + pose.air;

  // World to camera: yaw about y, then the camera's downward tilt.
  const cp = Math.cos(view.pitch);
  const sp = Math.sin(view.pitch);
  const Rcam = mul([1, 0, 0, 0, cp, -sp, 0, sp, cp], ry(yaw));
  for (const b of blobs) { b.c = apply(Rcam, b.c); b.M = b.M ? mul(Rcam, b.M) : null; }

  const { width: W, height: H, anchorX: ox, footY: oy, scale: s } = view;
  const depth = new Float32Array(W * H).fill(-Infinity);
  const out = new Uint8ClampedArray(W * H * 4);
  const table = colors(palette);

  for (const b of blobs) {
    const reach = Math.max(b.r[0], b.r[1], b.r[2]);
    const x0 = Math.max(0, Math.floor(ox + (b.c[0] - reach) * s));
    const x1 = Math.min(W - 1, Math.ceil(ox + (b.c[0] + reach) * s));
    const y0 = Math.max(0, Math.floor(oy - (b.c[1] + reach) * s));
    const y1 = Math.min(H - 1, Math.ceil(oy - (b.c[1] - reach) * s));
    const M = b.M ?? I;
    const qd = applyT(M, [0, 0, 1]).map((v, i) => v / b.r[i]);
    const a = qd[0] * qd[0] + qd[1] * qd[1] + qd[2] * qd[2];
    for (let py = y0; py <= y1; py += 1) {
      for (let px = x0; px <= x1; px += 1) {
        const rel = [(px + 0.5 - ox) / s - b.c[0], (oy - (py + 0.5)) / s - b.c[1], -b.c[2]];
        const q0 = applyT(M, rel).map((v, i) => v / b.r[i]);
        const bb = q0[0] * qd[0] + q0[1] * qd[1] + q0[2] * qd[2];
        const cc = q0[0] * q0[0] + q0[1] * q0[1] + q0[2] * q0[2] - 1;
        const disc = bb * bb - a * cc;
        if (disc < 0) continue;
        const t = (-bb + Math.sqrt(disc)) / a;
        const index = py * W + px;
        if (t <= depth[index]) continue;
        const u = { x: q0[0] + t * qd[0], y: q0[1] + t * qd[1], z: q0[2] + t * qd[2] };
        const n = unit(apply(M, [u.x / b.r[0], u.y / b.r[1], u.z / b.r[2]]));
        const light = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
        const tone = light > 0.6 ? 3 : light > 0.12 ? 2 : light > -0.4 ? 1 : 0;
        const key = typeof b.mat === 'function' ? b.mat(u) : b.mat;
        const rgb = shade(table[key] ?? table.skin, TONES[tone]);
        depth[index] = t;
        out[index * 4] = rgb[0]; out[index * 4 + 1] = rgb[1]; out[index * 4 + 2] = rgb[2]; out[index * 4 + 3] = 255;
      }
    }
  }

  // A one-pixel outline in a dark tone of the colour it borders, so the figure reads on any grass.
  const result = new Uint8ClampedArray(out);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      if (out[i + 3]) continue;
      for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0], [0, -1]]) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = (ny * W + nx) * 4;
        if (!out[j + 3]) continue;
        result[i] = out[j] * 0.28 + 6; result[i + 1] = out[j + 1] * 0.28 + 6; result[i + 2] = out[j + 2] * 0.28 + 8; result[i + 3] = 255;
        break;
      }
    }
  }
  return { width: W, height: H, data: result };
}
