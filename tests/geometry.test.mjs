import test from 'node:test';
import assert from 'node:assert/strict';
import { awayAttackOffsideLimit, clamp, clampSupportForOffside, homeAttackOffsideLimit, moveToward } from '../js/geometry.js';
import { createInitialState } from '../js/state.js';

test('clamp keeps normalized coordinates inside the pitch', () => {
  assert.equal(clamp(-0.5), 0);
  assert.equal(clamp(0.4), 0.4);
  assert.equal(clamp(1.5), 1);
});

test('moveToward never overshoots its target', () => {
  assert.deepEqual(moveToward({ x: 0, y: 0 }, { x: 0.1, y: 0 }, 0.2), { x: 0.1, y: 0 });
  assert.deepEqual(moveToward({ x: 0, y: 0 }, { x: 1, y: 0 }, 0.2), { x: 0.2, y: 0 });
});

test('offside limits never move inside the build-out boundary', () => {
  const state = createInitialState();
  const ball = { x: 0.5, y: 0.5 };
  assert.ok(homeAttackOffsideLimit(state.players, ball) >= 0.65);
  assert.ok(awayAttackOffsideLimit(state.players, ball) <= 0.35);
});

test('support targets are clamped to the offside limit', () => {
  const state = createInitialState();
  const player = state.players.find((item) => item.id === 'home-7');
  const target = clampSupportForOffside(player, { x: 0.99, y: 0.5 }, state.players, state.balls[0]);
  assert.ok(target.x < 1);
  assert.ok(target.x <= homeAttackOffsideLimit(state.players, state.balls[0]));
});
