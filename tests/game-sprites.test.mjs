import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_FRAMES, BALL_SPRITE, FACINGS, SPRITE, VARIANTS, drawBallFrame, drawPlayerFrame, facingFor, pickAnimation, playerPalette, variantFor } from '../js/game/sprites.js';

const opaque = (buffer) => { let n = 0; for (let i = 3; i < buffer.data.length; i += 4) if (buffer.data[i] > 0) n += 1; return n; };
const same = (a, b) => a.data.length === b.data.length && a.data.every((v, i) => v === b.data[i]);
const colorAt = (buffer, x, y) => { const i = (y * buffer.width + x) * 4; return buffer.data[i + 3] ? [...buffer.data.slice(i, i + 3)].join(',') : null; };
const palette = playerPalette('home', 0);

test('every action, facing and frame draws a real, correctly sized, deterministic player', () => {
  for (const [action, frames] of Object.entries(ACTION_FRAMES)) {
    for (const facing of FACINGS) {
      for (let frame = 0; frame < frames; frame += 1) {
        const buffer = drawPlayerFrame({ palette, action, frame, facing, keeper: action.startsWith('gk') });
        assert.equal(buffer.width, SPRITE.width);
        assert.equal(buffer.height, SPRITE.height);
        assert.equal(buffer.data.length, SPRITE.width * SPRITE.height * 4);
        assert.ok(opaque(buffer) > 40, `${action}/${facing}/${frame} is not empty`);
        assert.ok(same(buffer, drawPlayerFrame({ palette, action, frame, facing, keeper: action.startsWith('gk') })), 'deterministic');
      }
    }
  }
});

test('animation cycles really animate and the facings really differ', () => {
  const run = Array.from({ length: ACTION_FRAMES.run }, (_, frame) => drawPlayerFrame({ palette, action: 'run', frame, facing: 'E' }));
  const distinct = run.filter((frame, i) => run.findIndex((other) => same(other, frame)) === i).length;
  assert.ok(distinct >= 4, `${distinct} distinct run frames`);
  const looks = FACINGS.map((facing) => drawPlayerFrame({ palette, action: 'idle', frame: 0, facing }));
  for (let i = 0; i < looks.length; i += 1) for (let j = i + 1; j < looks.length; j += 1) assert.ok(!same(looks[i], looks[j]), `${FACINGS[i]} differs from ${FACINGS[j]}`);
  assert.ok(!same(drawPlayerFrame({ palette, action: 'idle', frame: 0 }), drawPlayerFrame({ palette, action: 'sprint', frame: 0 })));
  assert.ok(same(drawPlayerFrame({ palette, action: 'run', frame: 6 }), drawPlayerFrame({ palette, action: 'run', frame: 0 })), 'frames wrap around');
});

test('team palettes swap only kit colors, and skin variants swap only skin and hair', () => {
  const home = drawPlayerFrame({ palette: playerPalette('home', 0), action: 'idle', frame: 0, facing: 'S' });
  const away = drawPlayerFrame({ palette: playerPalette('away', 0), action: 'idle', frame: 0, facing: 'S' });
  const skinAt = (buffer) => { const hit = []; for (let y = 0; y < buffer.height; y += 1) for (let x = 0; x < buffer.width; x += 1) if (colorAt(buffer, x, y) === playerPalette('home', 0).skin.join(',')) hit.push(`${x},${y}`); return hit; };
  assert.ok(skinAt(home).length > 10);
  assert.deepEqual(skinAt(home), skinAt(away), 'skin is untouched by the team');
  assert.ok(!same(home, away), 'but the kit differs');
  const otherSkin = drawPlayerFrame({ palette: playerPalette('home', 1), action: 'idle', frame: 0, facing: 'S' });
  assert.ok(!same(home, otherSkin));
  const silhouette = (buffer) => Array.from({ length: buffer.data.length / 4 }, (_, i) => buffer.data[i * 4 + 3]).join('');
  assert.equal(silhouette(home), silhouette(away), 'palette swaps never change the shape');
  assert.equal(silhouette(home), silhouette(otherSkin));
  const keeper = drawPlayerFrame({ palette: playerPalette('home', 0, true), action: 'gk-ready', frame: 0, facing: 'S', keeper: true });
  const keeperColors = Array.from({ length: keeper.data.length / 4 }, (_, i) => `${keeper.data[i * 4]},${keeper.data[i * 4 + 1]},${keeper.data[i * 4 + 2]}`);
  assert.ok(keeperColors.includes(playerPalette('home', 0, true).glove.join(',')), 'a keeper wears gloves');
  assert.deepEqual(playerPalette('nonsense', 99), playerPalette('home', 99 % VARIANTS), 'unknown teams and big variants fall back safely');
});

test('sprites have a dark outline and stay inside the sprite rectangle', () => {
  const buffer = drawPlayerFrame({ palette, action: 'idle', frame: 0, facing: 'S' });
  const outline = palette.outline.join(',');
  let outlined = 0;
  for (let y = 0; y < buffer.height; y += 1) for (let x = 0; x < buffer.width; x += 1) if (colorAt(buffer, x, y) === outline) outlined += 1;
  assert.ok(outlined > 30);
  for (let x = 0; x < buffer.width; x += 1) assert.equal(colorAt(buffer, x, 0), null, 'the top row is empty');
});

test('variants are stable per player and spread over all variants', () => {
  assert.equal(variantFor('home-3'), variantFor('home-3'));
  const seen = new Set(Array.from({ length: 14 }, (_, i) => variantFor(`${i < 7 ? 'home' : 'away'}-${(i % 7) + 1}`)));
  assert.equal(seen.size, VARIANTS);
  assert.ok([...seen].every((v) => v >= 0 && v < VARIANTS));
});

test('the ball draws as a round sprite with different frames as it turns', () => {
  const frames = Array.from({ length: BALL_SPRITE.frames }, (_, i) => drawBallFrame(i));
  assert.ok(frames.every((f) => f.width === BALL_SPRITE.size && f.height === BALL_SPRITE.size && opaque(f) > 25 && opaque(f) < 60));
  assert.equal(colorAt(frames[0], 0, 0), null, 'the corners are transparent');
  assert.ok(new Set(frames.map((f) => Array.from(f.data).join())).size >= 3, 'the panels turn');
  assert.ok(same(drawBallFrame(4), drawBallFrame(0)) && same(drawBallFrame(-1), drawBallFrame(3)));
});

test('a heading becomes one of eight facings: five drawn, west mirrored', () => {
  const cases = [[0, 'E', false], [Math.PI, 'E', true], [Math.PI / 2, 'S', false], [-Math.PI / 2, 'N', false], [Math.PI / 4, 'SE', false], [-Math.PI / 4, 'NE', false], [(3 * Math.PI) / 4, 'SE', true], [(-3 * Math.PI) / 4, 'NE', true], [Number.NaN, 'E', false]];
  for (const [heading, facing, mirror] of cases) assert.deepEqual(facingFor(heading), { facing, mirror }, `heading ${heading}`);
  const seen = new Set();
  for (let a = -Math.PI; a < Math.PI; a += 0.05) { const f = facingFor(a); seen.add(`${f.facing}${f.mirror ? 'm' : ''}`); }
  assert.deepEqual([...seen].sort(), ['E', 'Em', 'N', 'NE', 'NEm', 'S', 'SE', 'SEm'].sort());
});

test('the animation follows what the player is doing', () => {
  const base = { role: 'CM', vx: 0, vy: 0, down: 0, action: null };
  assert.equal(pickAnimation(base).action, 'idle');
  assert.equal(pickAnimation({ ...base, vx: 3 }).action, 'run');
  assert.equal(pickAnimation({ ...base, vx: 6.8 }).action, 'sprint');
  assert.equal(pickAnimation({ ...base, down: 0.5 }).action, 'down');
  assert.deepEqual(pickAnimation({ ...base, action: { type: 'slide', t: 0.5, duration: 0.9 } }), { action: 'slide', frame: 1 });
  assert.equal(pickAnimation({ ...base, action: { type: 'kick', t: 0.2, duration: 0.25 } }).action, 'kick');
  assert.equal(pickAnimation(base, { celebrating: true }).action, 'celebrate');
  assert.equal(pickAnimation({ ...base, role: 'GK' }).action, 'gk-ready');
  assert.equal(pickAnimation({ ...base, role: 'GK' }, { keeperDive: true }).action, 'gk-dive');
  for (let time = 0; time < 5; time += 0.13) {
    for (const vx of [0, 1, 3, 5.5, 7]) {
      const { action, frame } = pickAnimation({ ...base, vx }, { time });
      assert.ok(Number.isInteger(frame) && frame >= 0 && frame < ACTION_FRAMES[action], `${action} frame ${frame}`);
    }
  }
});
