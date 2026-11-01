// Procedural pixel-art sprites for Game Mode, generated entirely in code so the repository stays text-only and offline.
// Pure: every function returns plain RGBA buffers ({ width, height, data }) that the renderer turns into canvas images.
//
// A player is a jointed 3D body (rig.js, poses in poses.js: head with face and hair, shirt with collar and crest, arms with gloves
// for keepers, shorts, socks, boots) shaded and rasterized to pixel art from any of eight directions, with a colored outline.
// Team and skin/hair variants are palette swaps of the same body, so kits are always consistent.

import { ACTION_FRAMES } from './poses.js';
import { VIEW, renderPlayer, viewFor } from './rig.js';

export { ACTION_FRAMES };
/** The sprite canvas at `ppm` pixels per meter: { width, height, anchorX, footY } in pixels, the feet at (anchorX, footY). */
export const spriteSize = (ppm) => { const { width, height, anchorX, footY } = viewFor(ppm); return { width, height, anchorX, footY }; };
export const SPRITE = Object.freeze({ width: VIEW.width, height: VIEW.height, anchorX: VIEW.anchorX, footY: VIEW.footY, pixelsPerMeter: VIEW.scale });

/** The eight facings, clockwise from facing the camera; each is drawn directly (no mirroring), so the lighting stays consistent. */
export const FACINGS = Object.freeze(['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']);
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

/** A kit from one '#rrggbb' shirt color (the coach board's team color): shade and shorts are darker tones of it. Null if invalid. */
export function kitFromHex(text) {
  if (typeof text !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(text)) return null;
  const value = parseInt(text.slice(1), 16);
  const scale = (factor) => ((Math.round(((value >> 16) & 255) * factor) << 16) | (Math.round(((value >> 8) & 255) * factor) << 8) | Math.round((value & 255) * factor));
  const light = ((((value >> 16) & 255) * 299 + ((value >> 8) & 255) * 587 + (value & 255) * 114) / 1000) > 150;
  return { shirt: value, shirtShade: scale(0.72), shorts: scale(0.45), socks: value, trim: light ? 0x222222 : 0xffffff };
}

/**
 * The palette for a player of `team` ('home' | 'away'), skin/hair `variant` (0..VARIANTS-1), as RGB triples. `colors` optionally
 * carries the coach's team colors ({ home, away, homeGoalkeeper, awayGoalkeeper } as '#rrggbb'); invalid entries are ignored.
 */
export function playerPalette(team, variant = 0, keeper = false, colors = null) {
  const side = team === 'away' ? 'away' : 'home';
  const custom = colors ? kitFromHex(colors[keeper ? `${side}Goalkeeper` : side]) : null;
  const kit = custom ?? (keeper ? KEEPER_KITS : TEAM_KITS)[side];
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

/** Draws one animation frame. `facing` is one of FACINGS; the result is an RGBA buffer SPRITE.width x SPRITE.height. */
export function drawPlayerFrame({ palette, action = 'idle', frame = 0, facing = 'S', keeper = false, ppm = VIEW.scale }) {
  const known = action in ACTION_FRAMES ? action : 'idle';
  const count = ACTION_FRAMES[known];
  const f = ((Math.trunc(frame) % count) + count) % count;
  const index = Math.max(0, FACINGS.indexOf(facing));
  return renderPlayer({ palette, action: known, frame: f, yaw: (index * Math.PI) / 4, keeper, ppm });
}


/** The ball sprite at its smallest, and how many rotation frames it has. `drawBallFrame` can draw it at any larger size. */
export const BALL_SPRITE = Object.freeze({ size: 8, frames: 4 });

// The twelve dark patches of a football sit at the vertices of an icosahedron.
const PATCHES = (() => {
  const g = (1 + Math.sqrt(5)) / 2;
  return [[0, 1, g], [0, -1, g], [0, 1, -g], [0, -1, -g], [1, g, 0], [-1, g, 0], [1, -g, 0], [-1, -g, 0], [g, 0, 1], [-g, 0, 1], [g, 0, -1], [-g, 0, -1]]
    .map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; });
})();

/**
 * The ball as a lit sphere (white with dark patches and an outline) turned a little further each frame, drawn at `size` pixels
 * so it stays crisp at any zoom. `frame` wraps over BALL_SPRITE.frames.
 */
export function drawBallFrame(frame = 0, size = BALL_SPRITE.size) {
  const data = new Uint8ClampedArray(size * size * 4);
  const f = ((Math.trunc(frame) % BALL_SPRITE.frames) + BALL_SPRITE.frames) % BALL_SPRITE.frames;
  const turn = f * 0.95;
  const [ca, sa] = [Math.cos(turn), Math.sin(turn)];
  const [cb, sb] = [Math.cos(0.55), Math.sin(0.55)];
  const center = (size - 1) / 2;
  const radius = size / 2 - 0.1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - center) / radius;
      const dy = (y - center) / radius;
      const r2 = dx * dx + dy * dy;
      if (r2 > 1) continue;
      const dz = Math.sqrt(1 - r2);
      // Into the ball's own frame: turned about x, then about y.
      const y1 = dy * ca - dz * sa;
      const z1 = dy * sa + dz * ca;
      const local = [dx * cb + z1 * sb, y1, -dx * sb + z1 * cb];
      const patch = PATCHES.some((p) => p[0] * local[0] + p[1] * local[1] + p[2] * local[2] > 0.9);
      const light = Math.max(0, Math.min(1, dx * -0.45 + dy * -0.55 + dz * 0.7));
      const edge = Math.sqrt(r2) * radius > radius - 1;
      const tone = edge ? 0.12 : 0.6 + 0.4 * light;
      const base = edge ? 255 : patch ? 34 : 246;
      const i = (y * size + x) * 4;
      const value = Math.round(base * tone);
      data[i] = value; data[i + 1] = value; data[i + 2] = edge ? value : Math.min(255, value + (patch ? 4 : 2)); data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

/** The sprite facing for a heading in radians (x right, y down the screen): the nearest of the eight FACINGS. `mirror` is always false (every facing is drawn). */
export function facingFor(heading) {
  const angle = Number.isFinite(heading) ? heading : 0;
  const yaw = Math.PI / 2 - angle; // heading 0 (screen right) is E, which is index 2
  const index = ((Math.round(yaw / (Math.PI / 4)) % 8) + 8) % 8;
  return { facing: FACINGS[index], mirror: false };
}

const frameCount = (action) => ACTION_FRAMES[action];
const progress = (act, action) => Math.min(frameCount(action) - 1, Math.floor((act.t / act.duration) * frameCount(action)));

/**
 * Chooses an animation for a player from their state. `time` (seconds) drives frame progression; running speeds the cycle up.
 * Returns { action, frame }.
 */
export function pickAnimation(player, { time = 0, celebrating = false, keeperDive = false, throwIn = false } = {}) {
  const keeper = player.role === 'GK';
  const speed = Math.hypot(player.vx ?? 0, player.vy ?? 0);
  // Lying on the grass is frame 0 (held while the timer is long); the last 0.6 s plays the sit, kneel and rise frames.
  if (player.down > 0) return { action: 'down', frame: player.down > 0.6 ? 0 : 1 + Math.min(2, Math.floor((0.6 - player.down) / 0.2)) };
  const act = player.action;
  if (act?.type === 'slide') return { action: 'slide', frame: progress(act, 'slide') };
  if (act?.type === 'kick') return { action: 'kick', frame: progress(act, 'kick') };
  if (act?.type === 'tackle') return { action: 'tackle', frame: progress(act, 'tackle') };
  if (act?.type === 'header') return { action: 'header', frame: progress(act, 'header') };
  if (act?.type === 'catch') return { action: 'gk-catch', frame: progress(act, 'gk-catch') };
  if (act?.type === 'dive') return { action: 'gk-dive', frame: progress(act, 'gk-dive') };
  if (act?.type === 'throw') return { action: 'throw', frame: progress(act, 'throw') };
  if (throwIn) return { action: 'throw', frame: 1 }; // both arms overhead, ball above the head
  if (celebrating) return { action: 'celebrate', frame: Math.floor(time * 8) % 8 };
  if (keeper && keeperDive) return { action: 'gk-dive', frame: 2 };
  // The stride follows the ground speed: about one gait cycle (8 frames) per 2.4 m run, per 1.4 m walk.
  if (speed > 6.2) return { action: 'sprint', frame: Math.floor(time * speed * 3.6) % 8 };
  if (speed > 2.8) return { action: 'run', frame: Math.floor(time * speed * 3.4) % 8 };
  if (speed > 0.6) return { action: 'walk', frame: Math.floor(time * speed * 5.7) % 8 };
  return { action: keeper ? 'gk-ready' : 'idle', frame: Math.floor(time * 2) % (keeper ? 2 : 4) };
}
