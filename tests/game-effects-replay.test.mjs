import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { EFFECT_LIMIT, addFromEvent, addFromMotion, burst, confetti, createEffects, stepEffects } from '../js/game/effects.js';
import { MATCH, createMatch, stepMatch } from '../js/game/match.js';
import { REPLAY, clearReplay, createReplay, recordReplay, replayFrameAt, replayFrames } from '../js/game/replay.js';

test('bursts and confetti spawn particles that fly, fall, land and expire', () => {
  const effects = createEffects(3);
  burst(effects, 1, 2, { count: 6 });
  confetti(effects, 0, 0, 20);
  assert.equal(effects.particles.length, 26);
  assert.ok(effects.particles.every((p) => Number.isFinite(p.x) && p.life > 0));
  for (let i = 0; i < 60; i += 1) stepEffects(effects, 1 / 60);
  assert.ok(effects.particles.length < 26, 'short-lived dust is gone after a second');
  assert.ok(effects.particles.every((p) => p.z >= 0), 'nothing sinks below the grass');
  for (let i = 0; i < 300; i += 1) stepEffects(effects, 1 / 60);
  assert.equal(effects.particles.length, 0, 'everything expires');
});

test('effects are deterministic for a seed and different for another', () => {
  const run = (seed) => { const e = createEffects(seed); burst(e, 0, 0, { count: 8 }); stepEffects(e, 0.2); return JSON.stringify(e.particles); };
  assert.equal(run(5), run(5));
  assert.notEqual(run(5), run(6));
});

test('the particle count is capped however much is spawned', () => {
  const effects = createEffects();
  for (let i = 0; i < 20; i += 1) confetti(effects, 0, 0, 100);
  assert.equal(effects.particles.length, EFFECT_LIMIT);
});

test('match events turn into the right effects', () => {
  const match = createMatch();
  const effects = createEffects();
  addFromEvent(effects, { type: 'goal', team: 'home' }, match);
  assert.equal(effects.flash, 1);
  assert.ok(effects.ripple && effects.particles.length > 20);
  stepEffects(effects, 0.25);
  assert.ok(effects.flash < 1 && effects.flash > 0);
  stepEffects(effects, 2);
  assert.equal(effects.ripple, null, 'the net ripple ends');
  const before = effects.particles.length;
  addFromEvent(effects, { type: 'tackle', id: 'home-4' }, match);
  assert.ok(effects.particles.length > before);
  const quiet = createEffects();
  addFromEvent(quiet, { type: 'whistle' }, match);
  addFromEvent(quiet, { type: 'tackle', id: 'nobody' }, match);
  assert.equal(quiet.particles.length, 0, 'unknown players and unrelated events do nothing');
});

test('sliding, sprinting and a hard-hit ball leave dust and a trail, a walking player does not', () => {
  const match = createMatch();
  const effects = createEffects();
  addFromMotion(effects, match, 0.5);
  assert.equal(effects.particles.length, 0);
  Object.assign(match.players[1], { vx: 7, vy: 0 });
  match.players[2].action = { type: 'slide', t: 0.1, duration: 0.9 };
  Object.assign(match.ball, { vx: 25, vy: 0, vz: 0 });
  addFromMotion(effects, match, 0.5);
  const types = new Set(effects.particles.map((p) => p.type));
  assert.ok(types.has('dust') && types.has('trail'));
});

test('replay keeps about the last two seconds asked for, oldest first, and playback ends cleanly', () => {
  const match = createMatch();
  const replay = createReplay(2);
  let taken = 0;
  for (let i = 0; i < 120 * 10; i += 1) { stepMatch(match, {}, MATCH.step); if (recordReplay(replay, match, MATCH.step)) taken += 1; }
  assert.ok(taken > 250 && taken < 350, `${taken} snapshots in 10 s at 30 per second`);
  const frames = replayFrames(replay);
  assert.equal(frames.length, replay.capacity);
  assert.ok(frames[0].time < frames.at(-1).time);
  assert.ok(Math.abs(frames.at(-1).time - frames[0].time - 2) < 0.2, 'about two seconds are kept');
  assert.ok(frames.every((f) => f.players.length === 14 && Number.isFinite(f.ball.x)));
  assert.strictEqual(replayFrameAt(frames, 0), frames[0]);
  assert.ok(replayFrameAt(frames, 1.0));
  assert.equal(replayFrameAt(frames, 100), null, 'finished');
  assert.equal(replayFrameAt([], 0), null);
  assert.ok(replayFrameAt(frames, 0.5, 2), 'a faster replay skips ahead');
  frames.length = 0;
  assert.ok(replay.frames.length > 0, 'the returned list is separate from the recorder');
  clearReplay(replay);
  assert.equal(replay.frames.length, 0);
});

test('replay snapshots do not change when the live match moves on', () => {
  const match = createMatch();
  const replay = createReplay();
  recordReplay(replay, match, REPLAY.interval);
  const x = replay.frames[0].players[3].x;
  match.players[3].x += 50;
  match.players[3].action = { type: 'slide', t: 0, duration: 1 };
  assert.equal(replay.frames[0].players[3].x, x);
  assert.equal(replay.frames[0].players[3].action, null);
});

test('effects stay finite and bounded for any sequence of events and steps', () => {
  fc.assert(fc.property(fc.array(fc.oneof(
    fc.constantFrom('goal', 'shot', 'pass', 'tackle', 'foul', 'save', 'whistle').map((type) => ({ kind: 'event', type })),
    fc.double({ min: 0, max: 0.2, noNaN: true }).map((dt) => ({ kind: 'step', dt })),
  ), { maxLength: 120 }), (script) => {
    const match = createMatch();
    const effects = createEffects(7);
    for (const item of script) {
      if (item.kind === 'event') addFromEvent(effects, { type: item.type, id: 'home-3', from: 'home-3' }, match);
      else { addFromMotion(effects, match, item.dt); stepEffects(effects, item.dt); }
      assert.ok(effects.particles.length <= EFFECT_LIMIT);
      assert.ok(effects.particles.every((p) => [p.x, p.y, p.z, p.vx, p.vy, p.vz, p.t].every(Number.isFinite)));
    }
  }), { numRuns: 80 });
});
