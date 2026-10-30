import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { rotateSpatial } from '../js/board-rotation.js';
import { stepSimulation } from '../js/simulation.js';
import { createInitialState, normalizeState } from '../js/state.js';

// Anything a corrupted save, an old version or a hand-edited import could contain.
const junk = fc.letrec((tie) => ({
  value: fc.oneof(
    { depthSize: 'small' },
    fc.constant(null), fc.boolean(), fc.integer(), fc.double({ noNaN: false }), fc.string({ maxLength: 8 }),
    fc.array(tie('value'), { maxLength: 4 }),
    fc.dictionary(fc.string({ maxLength: 8 }), tie('value'), { maxKeys: 4 }),
  ),
})).value;

// A valid state with some of its top-level fields replaced by junk. Saves and imports arrive as JSON, so the candidate
// takes a JSON round trip (which also removes null-prototype objects and NaN that JSON.parse can never produce).
const damagedState = fc.dictionary(
  fc.constantFrom('players', 'balls', 'cones', 'drawings', 'simulation', 'selectedZones', 'colors', 'script', 'speed', 'theme', 'flipped', 'zoneOpacity'),
  junk,
).map((damage) => JSON.parse(JSON.stringify({ ...createInitialState(), ...damage })));

test('normalizeState never throws and always returns a usable, idempotent state', () => {
  fc.assert(fc.property(damagedState, (candidate) => {
    const once = normalizeState(candidate);
    assert.ok(Array.isArray(once.players) && once.players.length === 14);
    assert.ok(once.balls.length >= 1 && once.balls[0].primary);
    assert.ok(Number.isFinite(once.balls[0].z) && once.balls[0].z >= 0.105);
    assert.equal(once.simulation.running, false);
    assert.deepEqual(normalizeState(once), once);
  }), { numRuns: 300 });
});

test('a normalized state steps without producing NaN or leaving the pitch', () => {
  fc.assert(fc.property(damagedState, (candidate) => {
    const state = normalizeState(candidate);
    state.simulation.running = true;
    for (let i = 0; i < 120; i += 1) stepSimulation(state, 1 / 60);
    for (const ball of state.balls) assert.ok([ball.x, ball.y, ball.z].every(Number.isFinite) && ball.x >= 0 && ball.x <= 1 && ball.y >= 0 && ball.y <= 1);
    for (const p of state.players) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
    assert.ok(Object.values(state.simulation.ballVelocity).every(Number.isFinite));
  }), { numRuns: 40 });
});

test('a half turn applied twice returns every position (to float precision) and every velocity', () => {
  fc.assert(fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 1, max: 30, noNaN: true }), (x, y, v) => {
    const state = createInitialState();
    Object.assign(state.balls[0], { x, y });
    state.simulation.ballVelocity = { x: v, y: -v, z: 2 };
    rotateSpatial(state);
    rotateSpatial(state);
    assert.ok(Math.abs(state.balls[0].x - x) < 1e-12 && Math.abs(state.balls[0].y - y) < 1e-12);
    assert.deepEqual(state.simulation.ballVelocity, { x: v, y: -v, z: 2 });
  }), { numRuns: 200 });
});
