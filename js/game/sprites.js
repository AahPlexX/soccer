// Procedural pixel-art sprites for Game Mode, generated entirely in code so the repository stays text-only and offline.
// Pure: every function returns plain RGBA buffers ({ width, height, data }) that the renderer turns into canvas images.
//
// A player is built from body parts (head, hair, face, shirt with a number stripe, arms, shorts, socks, boots) drawn from a pose
// (action, animation frame, facing), then given a one-pixel dark outline. Facing is one of five views (S, SE, E, NE, N); the
// west-facing views are the east ones mirrored by the renderer, which gives the eight directions. Team and skin/hair variants are
// palette swaps of the same drawing, so kits are always consistent.

export const SPRITE = Object.freeze({ width: 18, height: 26, anchorX: 9, footY: 24 });

/** Frames per action. 'gk-*' actions are the goalkeeper's. */
export const ACTION_FRAMES = Object.freeze({
  idle: 2, run: 6, sprint: 6, kick: 3, slide: 3, down: 3, header: 2, celebrate: 4,
  'gk-idle': 2, 'gk-ready': 1, 'gk-dive': 3, 'gk-catch': 2,
});
export const FACINGS = Object.freeze(['S', 'SE', 'E', 'NE', 'N']);
export const VARIANTS = 3;

const hex = (value) => [(value >> 16) & 255, (value >> 8) & 255, value & 255];
const SKIN_TONES = [0xf2c49b, 0xd9a273, 0x8d5a3a];
const HAIR_COLORS = [0x2b1d12, 0x6b3f1d, 0xc9a24b];
const TEAM_KITS = {
  home: { shirt: 0x1769ff, shirtShade: 0x0f48b3, shorts: 0x14327a, socks: 0x1769ff, trim: 0xffffff },
  away: { shirt: 0xef3340, shirtShade: 0xa6212b, shorts: 0x7a1820, socks: 0xef3340, trim: 0xffffff },
};
const KEEPER_KITS = {
  home: { shirt: 0xffd43b, shirtShade: 0xc9a21a, shorts: 0x3a3a3a, socks: 0xffd43b, trim: 0x222222 },
  away: { shirt: 0x7cff00, shirtShade: 0x56b000, shorts: 0x3a3a3a, socks: 0x7cff00, trim: 0x222222 },
};

/** The palette for a player of `team` ('home' | 'away'), skin/hair `variant` (0..VARIANTS-1), as RGB triples. */
export function playerPalette(team, variant = 0, keeper = false) {
  const kit = (keeper ? KEEPER_KITS : TEAM_KITS)[team === 'away' ? 'away' : 'home'];
  const v = ((Math.trunc(variant) % VARIANTS) + VARIANTS) % VARIANTS;
  return {
    skin: hex(SKIN_TONES[v]), hair: hex(HAIR_COLORS[(v + 1) % HAIR_COLORS.length]),
    shirt: hex(kit.shirt), shirtShade: hex(kit.shirtShade), shorts: hex(kit.shorts), socks: hex(kit.socks), trim: hex(kit.trim),
    boots: hex(0x1b1b1b), glove: hex(keeper ? 0xff7a1a : kit.trim), outline: hex(0x0d0d0d), eye: hex(0x151515),
  };
}

/** A stable skin/hair variant for a player id, so a player always looks the same. */
export function variantFor(id) {
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % VARIANTS;
}

function createBuffer() {
  return { width: SPRITE.width, height: SPRITE.height, data: new Uint8ClampedArray(SPRITE.width * SPRITE.height * 4) };
}

function put(buffer, x, y, color) {
  const px = Math.round(x) + 1;
  const py = Math.round(y) + 1; // a one-pixel margin keeps the outline inside the sprite
  if (px < 0 || py < 0 || px >= buffer.width || py >= buffer.height) return;
  const i = (py * buffer.width + px) * 4;
  buffer.data[i] = color[0]; buffer.data[i + 1] = color[1]; buffer.data[i + 2] = color[2]; buffer.data[i + 3] = 255;
}

function rect(buffer, x, y, w, h, color) {
  for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) put(buffer, x + i, y + j, color);
}

function outline(buffer, color) {
  const { width, height, data } = buffer;
  const solid = (x, y) => x >= 0 && y >= 0 && x < width && y < height && data[(y * width + x) * 4 + 3] > 0;
  const marks = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) marks.push([x, y]);
    }
  }
  for (const [x, y] of marks) {
    const i = (y * width + x) * 4;
    data[i] = color[0]; data[i + 1] = color[1]; data[i + 2] = color[2]; data[i + 3] = 255;
  }
}

const POSE = {
  // facing -> how turned (0 front/back, 1 profile) and whether we see the back
  S: { turn: 0, back: false }, SE: { turn: 0.5, back: false }, E: { turn: 1, back: false }, NE: { turn: 0.5, back: true }, N: { turn: 0, back: true },
};

/** Body motion for an action frame: bob (vertical), stride (leg swing, about -1..1), arms [left, right] raise, and flags. */
function motion(action, frame) {
  const phase = (frame / 6) * Math.PI * 2;
  const cycle = (count, amount) => Math.sin((frame / count) * Math.PI * 2) * amount;
  // A running leg swings (sine) and is lifted as it passes under the body (cosine), so all six frames of the cycle differ.
  const lifts = [Math.max(0, Math.cos(phase)), Math.max(0, -Math.cos(phase))];
  switch (action) {
    case 'run': return { bob: Math.cos(phase * 2) > 0.2 ? -1 : 0, stride: cycle(6, 1), lifts, arms: [cycle(6, -1), cycle(6, 1)] };
    case 'sprint': return { bob: Math.cos(phase * 2) > 0 ? -1 : 0, stride: cycle(6, 1.3), lifts, arms: [cycle(6, -1.4), cycle(6, 1.4)], lean: 1 };
    case 'kick': return { bob: 0, stride: [-0.9, 1.2, 0.4][frame % 3], arms: [0.6, -0.6], kick: frame % 3 };
    case 'header': return { bob: frame % 2 === 0 ? -3 : -1, stride: 0.4, arms: [-1.5, -1.5] };
    case 'celebrate': return { bob: frame % 2 === 0 ? 0 : -2, stride: 0, arms: [-2, -2] };
    case 'gk-ready': return { bob: 1, stride: 0.6, arms: [0.4, 0.4], wide: true };
    case 'gk-catch': return { bob: frame % 2 === 0 ? 0 : -1, stride: 0, arms: [-1.2, -1.2], reach: true };
    case 'gk-idle': return { bob: frame % 2 === 0 ? 0 : -1, stride: 0, arms: [0.2, 0.2] };
    default: return { bob: frame % 2 === 0 ? 0 : -1, stride: 0, arms: [0, 0] }; // idle
  }
}

function drawStanding(buffer, palette, action, frame, facing, keeper) {
  const { turn, back } = POSE[facing];
  const m = motion(action, frame);
  const bob = m.bob ?? 0;
  const lean = m.lean ?? 0;
  const cx = 8; // sprite center column before the margin
  const headX = cx - 3 + Math.round(turn * 1.5) + lean;
  const torsoW = Math.round(8 - 3 * turn);
  const torsoX = cx - Math.floor(torsoW / 2) + lean;

  // Legs first (behind the torso).
  const legTop = 17 + bob;
  const swing = m.stride ?? 0;
  const legs = [
    { x: cx - 3 + Math.round(turn * swing * 2), lift: (m.lifts ? m.lifts[0] : Math.max(0, swing)) * 1.5 * (1 - turn * 0.4) },
    { x: cx + 1 - Math.round(turn * swing * 2), lift: (m.lifts ? m.lifts[1] : Math.max(0, -swing)) * 1.5 * (1 - turn * 0.4) },
  ];
  legs.forEach((leg, i) => {
    const forward = m.kick === 1 && i === 1 ? 2 : 0;
    const x = leg.x + forward * Math.round(turn + 0.5);
    const y = legTop + 1 - Math.round(leg.lift);
    rect(buffer, x, y, 3, 2, palette.shorts);
    rect(buffer, x, y + 2, 3, 2, palette.socks);
    rect(buffer, x, y + 4, 3, 1, palette.boots);
  });

  // Torso and shorts.
  rect(buffer, torsoX, 10 + bob, torsoW, 7, palette.shirt);
  rect(buffer, torsoX, 15 + bob, torsoW, 2, palette.shirtShade);
  rect(buffer, torsoX, 16 + bob, torsoW, 2, palette.shorts);
  if (back) rect(buffer, cx - 1 + lean, 11 + bob, 2, 3, palette.trim); // number block on the back
  else rect(buffer, cx - 1 + lean, 11 + bob, 1, 3, palette.trim); // a stripe on the front

  // Arms swing opposite the legs; goalkeepers wear gloves.
  const raise = (a) => Math.round(-a * 2);
  const handColor = keeper ? palette.glove : palette.skin;
  const armTop = 10 + bob;
  const armYs = [armTop + 1 + raise(m.arms?.[0] ?? 0), armTop + 1 + raise(m.arms?.[1] ?? 0)];
  const spread = m.wide ? 2 : 0;
  if (turn < 0.9) {
    rect(buffer, torsoX - 1 - spread, armYs[0], 1, 4, palette.shirt);
    put(buffer, torsoX - 1 - spread, armYs[0] + 4, handColor);
    rect(buffer, torsoX + torsoW + spread, armYs[1], 1, 4, palette.shirt);
    put(buffer, torsoX + torsoW + spread, armYs[1] + 4, handColor);
  } else {
    rect(buffer, cx - 1 + lean, armYs[1], 2, 4, palette.shirtShade);
    put(buffer, cx + lean, armYs[1] + 4, handColor);
  }
  if (m.reach) { put(buffer, cx - 3, armTop - 2, handColor); put(buffer, cx + 2, armTop - 2, handColor); }

  // Head: skin, then hair, then the face if we can see it.
  rect(buffer, headX, 2 + bob, 6, 7, palette.skin);
  rect(buffer, headX, 2 + bob, 6, back ? 7 : 2, palette.hair);
  if (!back) {
    const eyeShift = Math.round(turn * 1.5);
    put(buffer, headX + 1 + eyeShift, 5 + bob, palette.eye);
    if (turn < 0.9) put(buffer, headX + 4 + Math.min(eyeShift, 0), 5 + bob, palette.eye);
    if (turn > 0.9) put(buffer, headX + 6, 6 + bob, palette.skin); // the nose in profile
  } else if (turn > 0.2) {
    put(buffer, headX + 5, 5 + bob, palette.skin); // an ear
  }
}

function drawLying(buffer, palette, action, frame, keeper) {
  // Slides, tackled players and goalkeeper dives are drawn lying along the ground, head to the right (the renderer mirrors it).
  const stretch = action === 'gk-dive' ? [0, 3, 2][frame % 3] : action === 'slide' ? [0, 2, 3][frame % 3] : [0, 1, 1][frame % 3];
  const y0 = action === 'gk-dive' ? [14, 12, 15][frame % 3] : 15;
  const handColor = keeper ? palette.glove : palette.skin;
  rect(buffer, 1, y0 + 2, 4 + (action === 'slide' ? stretch : 0), 2, palette.socks);
  rect(buffer, 0, y0 + 2, 1, 2, palette.boots);
  rect(buffer, 4, y0, 4, 5, palette.shorts);
  rect(buffer, 7, y0 - 1, 5, 6, palette.shirt);
  rect(buffer, 7, y0 + 3, 5, 2, palette.shirtShade);
  rect(buffer, 12, y0 - 1, 5, 5, palette.skin);
  rect(buffer, 12, y0 - 1, 5, 2, palette.hair);
  put(buffer, 15, y0 + 1, palette.eye);
  const armY = y0 + 1 - (action === 'gk-dive' ? 1 : 0);
  rect(buffer, 11, armY, 3 + stretch, 1, palette.shirt);
  put(buffer, 14 + stretch, armY, handColor);
}

/** Draws one animation frame. `facing` is one of FACINGS; the result is an RGBA buffer SPRITE.width x SPRITE.height. */
export function drawPlayerFrame({ palette, action = 'idle', frame = 0, facing = 'S', keeper = false }) {
  const buffer = createBuffer();
  const count = ACTION_FRAMES[action] ?? 1;
  const f = ((Math.trunc(frame) % count) + count) % count;
  if (action === 'slide' || action === 'down' || action === 'gk-dive') drawLying(buffer, palette, action, f, keeper);
  else drawStanding(buffer, palette, action, f, FACINGS.includes(facing) ? facing : 'S', keeper);
  outline(buffer, palette.outline);
  return buffer;
}

/** The ball: a white sphere with dark panels that appear to turn over `frames` frames. */
export const BALL_SPRITE = Object.freeze({ size: 8, frames: 4 });
export function drawBallFrame(frame = 0) {
  const size = BALL_SPRITE.size;
  const data = new Uint8ClampedArray(size * size * 4);
  const f = ((Math.trunc(frame) % BALL_SPRITE.frames) + BALL_SPRITE.frames) % BALL_SPRITE.frames;
  const center = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      const r = Math.hypot(dx, dy);
      if (r > center + 0.2) continue;
      const rim = r > center - 0.8;
      const panel = ((dx + f * 1.5) * 0.9) % 3 > 1.6 && r < center - 1 && (x + y + f) % 2 === 0;
      const color = rim ? [24, 24, 24] : panel ? [40, 40, 44] : r < center - 2 && dx + dy < 0 ? [255, 255, 255] : [226, 230, 236];
      const i = (y * size + x) * 4;
      data[i] = color[0]; data[i + 1] = color[1]; data[i + 2] = color[2]; data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

/** The sprite facing for a heading in radians (x right, y down the screen): one of FACINGS plus whether to mirror it (west). */
export function facingFor(heading) {
  const angle = Number.isFinite(heading) ? heading : 0;
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  const octant = Math.atan2(y, Math.abs(x)); // -pi/2 (north) .. pi/2 (south) on the east half
  let facing;
  if (octant > (3 * Math.PI) / 8) facing = 'S';
  else if (octant > Math.PI / 8) facing = 'SE';
  else if (octant > -Math.PI / 8) facing = 'E';
  else if (octant > (-3 * Math.PI) / 8) facing = 'NE';
  else facing = 'N';
  return { facing, mirror: x < -0.01 && facing !== 'S' && facing !== 'N' };
}

/**
 * Chooses an animation for a player from their state. `time` (seconds) drives frame progression; running speeds the cycle up.
 * Returns { action, frame }.
 */
export function pickAnimation(player, { time = 0, celebrating = false, keeperDive = false } = {}) {
  const keeper = player.role === 'GK';
  const speed = Math.hypot(player.vx ?? 0, player.vy ?? 0);
  if (player.down > 0) return { action: 'down', frame: Math.min(2, Math.floor((0.6 - Math.min(0.6, player.down)) * 6)) };
  const act = player.action;
  if (act?.type === 'slide') return { action: 'slide', frame: Math.min(2, Math.floor((act.t / act.duration) * 3)) };
  if (act?.type === 'kick') return { action: 'kick', frame: Math.min(2, Math.floor((act.t / act.duration) * 3)) };
  if (act?.type === 'tackle') return { action: 'kick', frame: 1 };
  if (celebrating) return { action: 'celebrate', frame: Math.floor(time * 6) % 4 };
  if (keeper && keeperDive) return { action: 'gk-dive', frame: 1 };
  if (speed > 6.2) return { action: 'sprint', frame: Math.floor(time * (6 + speed)) % 6 };
  if (speed > 0.7) return { action: 'run', frame: Math.floor(time * (3 + speed * 1.2)) % 6 };
  return { action: keeper ? 'gk-ready' : 'idle', frame: keeper ? 0 : Math.floor(time * 2) % 2 };
}
