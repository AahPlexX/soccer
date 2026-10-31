// Pose data for the Game Mode character rig (rig.js). A pose is a flat object of joint angles in radians; everything omitted is
// the rest pose. Cyclic actions (idle, walk, run, sprint, celebrate, gk-idle, gk-ready) are generated from a phase; the rest are
// keyframed and eased between keys. Pure: no DOM, no randomness.
//
// Conventions (character faces +z, y up, x to the character's right-hand side of the picture when facing the viewer):
//  - flex: positive swings a limb forward (+z); knee/elbow flex bends the lower limb back toward the body.
//  - abd: swings a limb out to the side. lean: torso forward; twist: torso about its axis; bend: torso sideways.
//  - hp/hy: head pitch (positive looks down) and yaw. rootPitch: whole body forward (positive) or back (negative) about the pelvis.
//  - air: lift above the ground in meters. sz: shifts the body forward/back so long poses stay inside the sprite.
//  - l* is the left leg, r* the right leg; a* the left arm, b* the right arm.

export const ACTION_FRAMES = Object.freeze({
  idle: 4, walk: 8, run: 8, sprint: 8, kick: 6, tackle: 4, slide: 6, down: 4, header: 6, celebrate: 8, throw: 4,
  'gk-idle': 4, 'gk-ready': 2, 'gk-dive': 7, 'gk-catch': 3,
});

const REST = Object.freeze({
  rootPitch: 0, rootRoll: 0, air: 0, sz: 0, lean: 0, twist: 0, bend: 0, hp: 0, hy: 0,
  lf: 0, la: 0.04, lk: 0.06, lb: 0, rf: 0, ra: 0.04, rk: 0.06, rb: 0,
  af: 0, aa: 0.1, ae: 0.2, bf: 0, ba: 0.1, be: 0.2,
});
const POSE_KEYS = Object.keys(REST);
const full = (partial) => ({ ...REST, ...partial });
const smooth = (t) => t * t * (3 - 2 * t);

/** Eases through `keys` (partial poses) and returns the full pose for `frame` of `count`. */
function keyed(keys, frame, count) {
  const position = count > 1 ? (frame / (count - 1)) * (keys.length - 1) : 0;
  const i = Math.min(keys.length - 2, Math.floor(position));
  const u = smooth(position - i);
  const a = full(keys[i]);
  const b = full(keys[i + 1]);
  const pose = {};
  for (const key of POSE_KEYS) pose[key] = a[key] + (b[key] - a[key]) * u;
  return pose;
}

const clamp0 = (v) => Math.max(0, v);

/** One gait cycle at phase `p`: legs half a cycle apart, arms opposite their leg, knees fold while a leg swings through. */
function gait(p, o) {
  const leg = (q) => ({
    f: o.hip * Math.sin(q) + o.fwd,
    k: o.kneeBase + o.kneeSwing * clamp0(Math.cos(q)) ** 1.2,
    b: 0.45 * clamp0(-Math.sin(q)) + 0.15 * clamp0(Math.cos(q)),
  });
  const left = leg(p);
  const right = leg(p + Math.PI);
  const armL = -o.arm * Math.sin(p);
  const armR = o.arm * Math.sin(p);
  return full({
    lf: left.f, lk: left.k, lb: left.b, rf: right.f, rk: right.k, rb: right.b,
    af: armL, ae: o.elbow + 0.4 * clamp0(armL), aa: 0.12 + o.out, bf: armR, be: o.elbow + 0.4 * clamp0(armR), ba: 0.12 + o.out,
    lean: o.lean, twist: -o.twist * Math.sin(p), hy: o.twist * 0.5 * Math.sin(p), air: o.air * clamp0(-Math.cos(2 * p)),
    la: 0.05, ra: 0.05,
  });
}

const GAITS = {
  walk: { hip: 0.4, fwd: 0.04, kneeBase: 0.1, kneeSwing: 0.55, arm: 0.5, elbow: 0.3, out: 0, lean: 0.05, twist: 0.1, air: 0 },
  run: { hip: 0.7, fwd: 0.1, kneeBase: 0.25, kneeSwing: 1.1, arm: 0.95, elbow: 1.35, out: 0.02, lean: 0.17, twist: 0.2, air: 0.05 },
  sprint: { hip: 0.82, fwd: 0.12, kneeBase: 0.3, kneeSwing: 1.3, arm: 1.2, elbow: 1.5, out: 0.04, lean: 0.33, twist: 0.24, air: 0.1 },
};

const KEYS = {
  kick: [
    { lean: 0.15, rf: -0.75, rk: 1.3, rb: 0.5, lf: 0.1, lk: 0.25, af: 0.6, bf: -0.5, aa: 0.5 },
    { lean: 0.1, rf: -1.05, rk: 1.75, rb: 0.6, lf: 0.15, lk: 0.3, af: 0.7, bf: -0.7, aa: 0.6, twist: -0.2 },
    { lean: -0.02, rf: 1.15, rk: 0.35, rb: 0.6, lf: 0.1, lk: 0.2, af: -0.5, bf: 0.8, aa: 0.5, twist: 0.25 },
    { lean: -0.12, rf: 1.65, rk: 0.1, rb: 0.7, lf: 0.05, lk: 0.1, af: -0.6, bf: 0.9, aa: 0.7, air: 0.08, twist: 0.3 },
    { lean: 0.02, rf: 1.0, rk: 0.7, rb: 0.4, lf: 0.1, lk: 0.2, af: -0.2, bf: 0.4, aa: 0.4, air: 0.04 },
    { lean: 0.1, rf: 0.1, rk: 0.3, lf: 0.1, lk: 0.2 },
  ],
  tackle: [
    { lean: 0.22, lf: 0.55, lk: 0.5, rf: -0.5, rk: 0.7, af: 0.5, bf: -0.4, aa: 0.8 },
    { lean: 0.4, lf: 1.0, lk: 0.5, rf: -0.8, rk: 0.9, af: 0.2, bf: -0.2, aa: 1.0, sz: -0.1 },
    { lean: 0.5, lf: 1.45, lk: 0.1, rf: -0.9, rk: 1.1, af: 0, bf: 0, aa: 1.2, sz: -0.2 },
    { lean: 0.25, lf: 0.8, lk: 0.5, rf: -0.4, rk: 0.6, aa: 0.7, sz: -0.1 },
  ],
  slide: [
    { lean: 0.35, lf: 0.8, lk: 0.5, rf: -0.6, rk: 1.2, af: 0.9, bf: -0.7, aa: 0.5 },
    { rootPitch: -0.55, lean: 0.25, lf: 0.5, lk: 0.2, rf: -0.4, rk: 1.3, af: -0.2, bf: -0.5, aa: 0.8, sz: -0.1 },
    { rootPitch: -1.1, lean: 0.4, lf: 0.25, lk: 0.1, rf: -0.15, rk: 1.6, af: -0.9, bf: -0.8, aa: 0.9, ae: 0.1, be: 0.1, sz: -0.25 },
    { rootPitch: -1.25, lean: 0.45, lf: 0.2, lk: 0.05, rf: -0.1, rk: 1.7, af: -1.0, bf: -0.9, aa: 0.8, ae: 0.1, be: 0.1, sz: -0.3 },
    { rootPitch: -1.25, lean: 0.5, lf: 0.2, lk: 0.05, rf: -0.1, rk: 1.7, af: -1.0, bf: -0.9, aa: 0.8, ae: 0.1, be: 0.1, sz: -0.3 },
    { rootPitch: -1.0, lean: 0.6, lf: 0.35, lk: 0.2, rf: -0.2, rk: 1.8, af: -0.5, bf: -0.5, aa: 0.7, sz: -0.2 },
  ],
  // Frame 0 is lying on the back (the long state); 1 to 3 are the get-up (sit, kneel, rise) played as the timer runs out.
  down: [
    { rootPitch: -1.5, lean: 0.05, lf: 0.05, lk: 0.1, rf: 0.45, rk: 1.0, af: 0.1, bf: -0.1, aa: 0.9, ba: 0.9, hp: -0.3, sz: -0.2 },
    { rootPitch: -0.15, lean: -0.1, lf: 1.45, lk: 0.25, rf: 1.35, rk: 0.35, af: -0.7, bf: -0.7, aa: 0.5, ba: 0.5, ae: 0.1, be: 0.1, sz: -0.5 },
    { lean: 0.2, lf: 1.25, lk: 1.9, rf: -0.25, rk: 2.5, af: 0.5, bf: 0.3, aa: 0.3 },
    { lean: 0.38, lf: 0.9, lk: 1.1, rf: 0.7, rk: 1.0, af: 0.5, bf: 0.5, aa: 0.3 },
  ],
  header: [
    { lean: 0.3, lf: 0.5, lk: 0.9, rf: 0.5, rk: 0.9, af: -0.7, bf: -0.7, aa: 0.4, ba: 0.4 },
    { air: 0.25, lean: -0.05, lf: 0.2, lk: 0.9, rf: -0.1, rk: 1.0, af: 0.6, bf: 0.6, aa: 0.8, ba: 0.8 },
    { air: 0.42, lean: -0.38, hp: -0.25, lf: 0.1, lk: 0.8, rf: -0.2, rk: 1.1, af: 0.3, bf: 0.3, aa: 1.0, ba: 1.0 },
    { air: 0.4, lean: 0.35, hp: 0.35, lf: 0.2, lk: 0.7, rf: -0.1, rk: 0.9, af: 0.7, bf: 0.7, aa: 0.8, ba: 0.8 },
    { air: 0.16, lean: 0.2, lf: 0.3, lk: 0.6, rf: 0.2, rk: 0.6, af: 0.4, bf: 0.4, aa: 0.5, ba: 0.5 },
    { lean: 0.22, lf: 0.45, lk: 0.8, rf: 0.45, rk: 0.8, af: 0.2, bf: 0.2, aa: 0.4, ba: 0.4 },
  ],
  throw: [
    { lean: -0.25, lf: 0.1, lk: 0.2, rf: -0.1, rk: 0.2, af: 2.4, bf: 2.4, ae: 1.6, be: 1.6, aa: 0.3, ba: 0.3, hp: -0.2 },
    { lean: -0.12, lf: 0.1, lk: 0.15, rf: -0.1, rk: 0.15, af: 3.0, bf: 3.0, ae: 0.4, be: 0.4, aa: 0.25, ba: 0.25, hp: -0.3 },
    { lean: 0.28, lf: 0.35, lk: 0.5, rf: -0.2, rk: 0.4, af: 2.0, bf: 2.0, ae: 0.1, be: 0.1, aa: 0.2, ba: 0.2 },
    { lean: 0.32, lf: 0.45, lk: 0.5, rf: -0.25, rk: 0.4, af: 1.2, bf: 1.2, ae: 0.1, be: 0.1, aa: 0.2, ba: 0.2 },
  ],
  // The keeper dives head first toward the direction he faces; frames 4 to 6 are the landing and slide.
  'gk-dive': [
    { rootPitch: 0.3, lean: 0.2, lf: 0.8, lk: 1.2, rf: 0.8, rk: 1.2, af: 1.4, bf: 1.4, aa: 0.5, ba: 0.5 },
    { rootPitch: 0.9, air: 0.3, lf: 0.1, lk: 0.6, rf: -0.2, rk: 0.8, af: 2.6, bf: 2.6, aa: 0.2, ba: 0.2, ae: 0.1, be: 0.1, sz: -0.2 },
    { rootPitch: 1.35, air: 0.5, lf: -0.25, lk: 0.4, rf: -0.4, rk: 0.6, af: 2.95, bf: 2.95, aa: 0.1, ba: 0.1, ae: 0.05, be: 0.05, sz: -0.45 },
    { rootPitch: 1.45, air: 0.34, lf: -0.3, lk: 0.4, rf: -0.45, rk: 0.5, af: 2.95, bf: 2.95, aa: 0.1, ba: 0.1, ae: 0.05, be: 0.05, sz: -0.5 },
    { rootPitch: 1.5, air: 0.12, lf: -0.2, lk: 0.5, rf: -0.4, rk: 0.7, af: 2.9, bf: 2.9, aa: 0.1, ba: 0.1, ae: 0.1, be: 0.1, sz: -0.5 },
    { rootPitch: 1.5, lf: -0.1, lk: 0.8, rf: -0.3, rk: 1.0, af: 2.7, bf: 2.7, aa: 0.2, ba: 0.2, ae: 0.2, be: 0.2, sz: -0.5 },
    { rootPitch: 1.5, lf: 0, lk: 0.9, rf: -0.2, rk: 1.1, af: 2.6, bf: 2.6, aa: 0.25, ba: 0.25, ae: 0.3, be: 0.3, sz: -0.5 },
  ],
  'gk-catch': [
    { lean: 0.2, lf: 0.35, lk: 0.6, rf: 0.35, rk: 0.6, af: 1.25, bf: 1.25, aa: 0.7, ba: 0.7, ae: 0.3, be: 0.3, hp: 0.1 },
    { lean: 0.25, lf: 0.4, lk: 0.7, rf: 0.4, rk: 0.7, af: 1.0, bf: 1.0, aa: 0.15, ba: 0.15, ae: 1.6, be: 1.6, hp: 0.2 },
    { lean: 0.22, lf: 0.3, lk: 0.5, rf: 0.3, rk: 0.5, af: 0.8, bf: 0.8, aa: 0.1, ba: 0.1, ae: 1.9, be: 1.9, hp: 0.2 },
  ],
};

/** The full pose for `frame` (already wrapped to 0..count-1) of `action`. */
export function poseFor(action, frame) {
  const count = ACTION_FRAMES[action] ?? 1;
  const p = (frame / count) * Math.PI * 2;
  if (GAITS[action]) return gait(p, GAITS[action]);
  if (KEYS[action]) return keyed(KEYS[action], frame, count);
  switch (action) {
    case 'celebrate': {
      const arm = 2.7 + 0.3 * Math.sin(2 * p);
      return full({ air: 0.14 * Math.abs(Math.sin(p)), lean: -0.12 + 0.05 * Math.sin(p + 1), bend: 0.08 * Math.sin(p + 0.8), hy: 0.25 * Math.sin(p), lf: 0.15, lk: 0.35 + 0.3 * Math.abs(Math.cos(p)), rf: 0.1, rk: 0.4, af: arm + 0.25 * Math.sin(p + 0.8), bf: arm - 0.15 - 0.25 * Math.sin(p + 0.8), aa: 0.5, ba: 0.55, ae: 0.25, be: 0.25 });
    }
    case 'gk-ready':
      return full({ lean: 0.28 + 0.03 * Math.sin(p), lf: 0.5, lk: 0.95, rf: 0.5, rk: 0.95, la: 0.2, ra: 0.2, af: 0.9, bf: 0.9, aa: 0.55, ba: 0.55, ae: 0.5, be: 0.5, hp: -0.18 });
    case 'gk-idle':
      return full({ lean: 0.06, lf: 0.12 + 0.05 * Math.sin(p), lk: 0.25 + 0.12 * Math.sin(p), rf: 0.06, rk: 0.2, af: 0.6, bf: 0.6, aa: 0.3, ba: 0.3, ae: 1.1, be: 1.1, hy: 0.15 * Math.sin(p) });
    default: // idle: weight on one leg, a slow breath and a look around
      return full({ lean: 0.04 + 0.015 * Math.sin(p), lf: 0.08 + 0.03 * Math.sin(p), lk: 0.14, rf: -0.02, rk: 0.06, la: 0.06, ra: 0.1, af: 0.05 * Math.sin(p), bf: -0.05 * Math.sin(p), ae: 0.3, be: 0.3, aa: 0.14, ba: 0.14, hy: 0.18 * Math.sin(p), bend: 0.02 * Math.sin(p) });
  }
}
