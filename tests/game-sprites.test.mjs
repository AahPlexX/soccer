import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_FRAMES, BALL_SPRITE, FACINGS, SPRITE, VARIANTS, drawBallFrame, drawPlayerFrame, facingFor, kitFromHex, pickAnimation, playerPalette, variantFor } from '../js/game/sprites.js';

const palette = playerPalette('home', 0);
const same = (a, b) => a.data.length === b.data.length && a.data.every((v, i) => v === b.data[i]);
const opaque = (buffer) => { let n = 0; for (let i = 3; i < buffer.data.length; i += 4) if (buffer.data[i] > 0) n += 1; return n; };
/** Bounding box of the opaque pixels: { left, right, top, bottom, width, height }. */
function bounds(buffer) {
  let left = Infinity; let right = -1; let top = Infinity; let bottom = -1;
  for (let y = 0; y < buffer.height; y += 1) for (let x = 0; x < buffer.width; x += 1) {
    if (buffer.data[(y * buffer.width + x) * 4 + 3] === 0) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return { left, right, top, bottom, width: right - left + 1, height: bottom - top + 1 };
}
const draw = (action, frame = 0, facing = 'S', pal = palette) => drawPlayerFrame({ palette: pal, action, frame, facing, keeper: action.startsWith('gk') });

test('every action, frame and facing renders at the sprite size, deterministically, and inside the rectangle', () => {
  for (const [action, frames] of Object.entries(ACTION_FRAMES)) {
    for (const facing of FACINGS) {
      for (let frame = 0; frame < frames; frame += 1) {
        const buffer = draw(action, frame, facing, playerPalette('away', 1, action.startsWith('gk')));
        assert.equal(buffer.width, SPRITE.width);
        assert.equal(buffer.height, SPRITE.height);
        assert.equal(buffer.data.length, SPRITE.width * SPRITE.height * 4);
        assert.ok(opaque(buffer) > 150, `${action} ${facing} ${frame} has a body`);
        const box = bounds(buffer);
        assert.ok(box.left > 0 && box.top > 0 && box.right < SPRITE.width - 1 && box.bottom < SPRITE.height - 1, `${action} ${facing} ${frame} is not clipped by the sprite edge`);
        assert.ok(same(buffer, draw(action, frame, facing, playerPalette('away', 1, action.startsWith('gk')))), 'deterministic');
      }
    }
  }
});

test('eight facings are drawn and each differs; frames wrap; cyclic actions really move', () => {
  assert.equal(FACINGS.length, 8);
  const looks = FACINGS.map((facing) => draw('idle', 0, facing));
  for (let i = 0; i < looks.length; i += 1) for (let j = i + 1; j < looks.length; j += 1) assert.ok(!same(looks[i], looks[j]), `${FACINGS[i]} differs from ${FACINGS[j]}`);
  for (const action of ['walk', 'run', 'sprint', 'celebrate']) {
    const cycle = Array.from({ length: ACTION_FRAMES[action] }, (_, frame) => draw(action, frame, 'E'));
    for (let i = 0; i < cycle.length; i += 1) for (let j = i + 1; j < cycle.length; j += 1) assert.ok(!same(cycle[i], cycle[j]), `${action} frame ${i} differs from ${j}`);
    assert.ok(same(draw(action, ACTION_FRAMES[action], 'E'), cycle[0]), `${action} wraps around`);
  }
  assert.ok(!same(draw('run', 0, 'E'), draw('sprint', 0, 'E')));
  assert.ok(same(draw('idle', -1), draw('idle', ACTION_FRAMES.idle - 1)), 'negative frames wrap');
  assert.ok(same(draw('nonsense', 0), draw('idle', 0)), 'an unknown action draws idle');
});

test('a standing player is a proportioned figure with both feet on the ground line', () => {
  const box = bounds(draw('idle', 0, 'S'));
  assert.ok(box.height >= 42 && box.height <= 52, `height ${box.height}`);
  assert.ok(box.width >= 12 && box.width <= 28, `width ${box.width}`);
  assert.ok(Math.abs(box.bottom - SPRITE.footY) <= 3, `feet at row ${box.bottom}, ground line ${SPRITE.footY}`);
  for (const action of ['walk', 'run', 'sprint', 'kick', 'tackle']) {
    for (let frame = 0; frame < ACTION_FRAMES[action]; frame += 1) {
      const bottom = bounds(draw(action, frame, 'E')).bottom;
      assert.ok(bottom >= SPRITE.footY - 4 && bottom <= SPRITE.footY + 4, `${action} ${frame}: lowest pixel row ${bottom}`);
    }
  }
});

test('sliding, lying and diving poses are long and low, not a standing figure', () => {
  const standing = bounds(draw('idle', 0, 'E'));
  for (const [action, frame, limit] of [['slide', 3, 0.8], ['down', 0, 0.6], ['gk-dive', 3, 0.6], ['gk-dive', 6, 0.6]]) {
    const box = bounds(draw(action, frame, 'E'));
    assert.ok(box.width >= 36, `${action} ${frame} is long (${box.width})`);
    assert.ok(box.height <= standing.height * limit, `${action} ${frame} is low (${box.height})`);
  }
  const airborne = bounds(draw('gk-dive', 2, 'E'));
  const landed = bounds(draw('gk-dive', 6, 'E'));
  assert.ok(airborne.bottom < landed.bottom, 'the keeper is in the air before he lands');
  const header = bounds(draw('header', 2, 'E'));
  assert.ok(header.bottom < SPRITE.footY - 6, 'a header at its peak is off the ground');
});

test('the kit shows in the picture: team color, outline, skin, and keepers differ from field players', () => {
  const has = (buffer, color) => { for (let i = 0; i < buffer.data.length; i += 4) if (buffer.data[i + 3] && buffer.data[i] === color[0] && buffer.data[i + 1] === color[1] && buffer.data[i + 2] === color[2]) return true; return false; };
  const home = draw('idle', 0, 'S', playerPalette('home', 0));
  const away = draw('idle', 0, 'S', playerPalette('away', 0));
  assert.ok(!same(home, away));
  assert.ok(has(home, playerPalette('home', 0).shirt), 'the home shirt color appears');
  assert.ok(has(away, playerPalette('away', 0).shirt), 'the away shirt color appears');
  assert.ok(!same(draw('idle', 0, 'S', playerPalette('home', 1)), home), 'skin and hair variants differ');
  assert.ok(!same(draw('gk-ready', 0, 'S', playerPalette('home', 0, true)), draw('idle', 0, 'S', playerPalette('home', 0, false))));
  const custom = draw('idle', 0, 'S', playerPalette('home', 0, false, { home: '#12ab34' }));
  assert.ok(has(custom, [0x12, 0xab, 0x34]), 'a coach team color is used as the shirt');
  // Every outline pixel (opaque with a transparent neighbor) is dark, so the figure reads on any grass.
  const { width, height, data } = home;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const i = (y * width + x) * 4;
    if (!data[i + 3]) continue;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => x + dx < 0 || y + dy < 0 || x + dx >= width || y + dy >= height || !data[((y + dy) * width + x + dx) * 4 + 3]);
    if (edge) assert.ok(data[i] + data[i + 1] + data[i + 2] < 330, `edge pixel at ${x},${y} is dark`);
  }
});

test('the face is drawn when the player looks at the camera and hidden when he runs away', () => {
  const marked = { ...palette, eye: [255, 0, 255] }; // a color nothing else in the picture can have
  const front = draw('idle', 0, 'S', marked);
  const back = draw('idle', 0, 'N', marked);
  const eyes = (buffer) => { let n = 0; for (let i = 0; i < buffer.data.length; i += 4) if (buffer.data[i + 3] && buffer.data[i] === 255 && buffer.data[i + 1] === 0 && buffer.data[i + 2] === 255) n += 1; return n; };
  assert.ok(eyes(front) >= 1, 'eyes show from the front');
  assert.equal(eyes(back), 0, 'no eyes from behind');
});

test('rendering a frame is cheap enough to build the atlas lazily', () => {
  const started = performance.now();
  let frames = 0;
  for (const action of ['run', 'kick', 'slide', 'gk-dive']) for (let frame = 0; frame < 6; frame += 1) { draw(action, frame, 'SE'); frames += 1; }
  assert.ok((performance.now() - started) / frames < 40, 'under 40 ms per frame on average');
});

test('the ball is a small shaded sphere whose panels turn', () => {
  const frames = Array.from({ length: BALL_SPRITE.frames }, (_, i) => drawBallFrame(i));
  assert.ok(frames.every((f) => f.width === BALL_SPRITE.size && f.height === BALL_SPRITE.size && opaque(f) > 25 && opaque(f) < 60));
  for (let i = 0; i < frames.length; i += 1) for (let j = i + 1; j < frames.length; j += 1) assert.ok(!same(frames[i], frames[j]), 'ball frames differ');
  assert.ok(same(drawBallFrame(4), drawBallFrame(0)) && same(drawBallFrame(-1), drawBallFrame(3)));
});

test('a heading becomes the nearest of eight facings, never mirrored', () => {
  const cases = [[0, 'E'], [Math.PI / 2, 'S'], [-Math.PI / 2, 'N'], [Math.PI, 'W'], [-Math.PI, 'W'], [Math.PI / 4, 'SE'], [-Math.PI / 4, 'NE'], [(3 * Math.PI) / 4, 'SW'], [(-3 * Math.PI) / 4, 'NW'], [Number.NaN, 'E']];
  for (const [heading, facing] of cases) assert.deepEqual(facingFor(heading), { facing, mirror: false }, `heading ${heading}`);
  const seen = new Set();
  for (let a = -Math.PI; a < Math.PI; a += 0.05) seen.add(facingFor(a).facing);
  assert.deepEqual([...seen].sort(), [...FACINGS].sort());
});

test('the animation follows what the player is doing', () => {
  const base = { role: 'CM', vx: 0, vy: 0, down: 0, action: null };
  assert.equal(pickAnimation(base).action, 'idle');
  assert.equal(pickAnimation({ ...base, vx: 1.5 }).action, 'walk');
  assert.equal(pickAnimation({ ...base, vx: 4 }).action, 'run');
  assert.equal(pickAnimation({ ...base, vx: 6.8 }).action, 'sprint');
  assert.deepEqual(pickAnimation({ ...base, down: 1.5 }), { action: 'down', frame: 0 }, 'lying while the timer is long');
  assert.deepEqual(pickAnimation({ ...base, down: 0.5 }), { action: 'down', frame: 1 });
  assert.deepEqual(pickAnimation({ ...base, down: 0.05 }), { action: 'down', frame: 3 }, 'rising as it runs out');
  assert.deepEqual(pickAnimation({ ...base, action: { type: 'slide', t: 0.5, duration: 0.9 } }), { action: 'slide', frame: 3 });
  assert.deepEqual(pickAnimation({ ...base, action: { type: 'kick', t: 0.2, duration: 0.25 } }), { action: 'kick', frame: 4 });
  assert.equal(pickAnimation({ ...base, action: { type: 'tackle', t: 0.1, duration: 0.3 } }).action, 'tackle');
  assert.equal(pickAnimation(base, { celebrating: true }).action, 'celebrate');
  assert.equal(pickAnimation({ ...base, role: 'GK' }).action, 'gk-ready');
  assert.equal(pickAnimation({ ...base, role: 'GK' }, { keeperDive: true }).action, 'gk-dive');
  assert.deepEqual(pickAnimation(base, { throwIn: true }), { action: 'throw', frame: 1 });
  for (const role of ['CM', 'GK']) {
    for (let vx = 0; vx <= 7; vx += 0.35) {
      for (let time = 0; time < 5; time += 0.173) {
        const { action, frame } = pickAnimation({ ...base, role, vx }, { time });
        assert.ok(Number.isInteger(frame) && frame >= 0 && frame < ACTION_FRAMES[action], `${action} frame ${frame}`);
      }
    }
  }
});

test('kit colors from the coach board and stable skin variants', () => {
  assert.deepEqual(kitFromHex('#ff0000').shirt, 0xff0000);
  assert.equal(kitFromHex('red'), null);
  assert.equal(kitFromHex('#12345'), null);
  assert.ok(kitFromHex('#ffffff').trim === 0x222222 && kitFromHex('#101010').trim === 0xffffff, 'trim contrasts with the shirt');
  for (const id of ['home-1', 'away-7', '', 12]) assert.ok(variantFor(id) >= 0 && variantFor(id) < VARIANTS && variantFor(id) === variantFor(id));
});
