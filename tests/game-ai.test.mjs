import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { DIFFICULTIES, aiControls, createAi } from '../js/game/ai.js';
import { MATCH, createMatch, drainEvents, playerById, stepMatch, teamOf } from '../js/game/match.js';
import { HALF_LENGTH, HALF_WIDTH } from '../js/game/rules.js';

const place = (match, id, x, y) => Object.assign(playerById(match, id), { x, y, vx: 0, vy: 0 });
const playing = (humanTeam = 'home') => { const m = createMatch({ humanTeam }); m.phase = 'play'; return m; };
const finite = (control) => [control.move.x, control.move.y, control.speedScale].every(Number.isFinite);

test('difficulty profiles get harder in the right direction and unknown names fall back to normal', () => {
  const { easy, normal, hard } = DIFFICULTIES;
  assert.ok(easy.speed < normal.speed && normal.speed <= hard.speed);
  assert.ok(easy.think > normal.think && normal.think > hard.think, 'a harder AI reacts faster');
  assert.ok(easy.passNoise > normal.passNoise && normal.passNoise > hard.passNoise);
  assert.ok(easy.shotError > normal.shotError && normal.shotError > hard.shotError);
  assert.ok(easy.keeperSkill < normal.keeperSkill && normal.keeperSkill < hard.keeperSkill);
  assert.equal(createAi('legendary').difficulty, 'normal');
  assert.equal(createAi('hard').difficulty, 'hard');
  assert.equal(createAi('toString').difficulty, 'normal', 'inherited object keys are not difficulties');
});

test('every player except the human active one gets a control, scaled by the difficulty speed', () => {
  const match = playing();
  const ai = createAi('easy');
  const controls = aiControls(match, ai);
  assert.equal(Object.keys(controls).length, 13);
  assert.ok(!(match.activeId in controls));
  const speeds = Object.entries(controls).map(([id, control]) => [id, control.speedScale]);
  assert.ok(Object.values(controls).every(finite));
  assert.ok(speeds.every(([id, scale]) => (id.endsWith('-1') ? scale > DIFFICULTIES.easy.speed && scale <= DIFFICULTIES.easy.speed * 1.12 + 1e-9 : scale === DIFFICULTIES.easy.speed)), 'outfield players use the difficulty speed, keepers a little more');
  const passed = { 'home-3': { move: { x: 1, y: 0 } } };
  assert.strictEqual(aiControls(match, ai, passed), passed, 'fills and returns the map it is given');
});

test('a goalkeeper moves to cover an incoming shot and otherwise stands between the ball and the goal', () => {
  const match = playing();
  place(match, 'away-1', 26, 0);
  Object.assign(match.ball, { x: 10, y: 4, vx: 20, vy: 0 });
  match.lastTouch = { team: 'home', id: 'home-7' };
  match.owner = null;
  const hard = aiControls(match, createAi('hard'));
  assert.ok(hard['away-1'].move.y > 0.3, 'moves toward the shot at +y');
  const easy = aiControls(match, createAi('easy'));
  assert.ok(Math.abs(easy['away-1'].move.y) <= Math.abs(hard['away-1'].move.y) + 1e-9, 'an easy keeper commits less');
  Object.assign(match.ball, { x: -5, y: 8, vx: 0, vy: 0 });
  const calm = aiControls(match, createAi('normal'));
  assert.ok(Math.hypot(calm['away-1'].move.x, calm['away-1'].move.y) <= 0.8 + 1e-9, 'it does not sprint around when nothing is happening');
});

test('a carrier with a clear shot near goal shoots, aimed at the goal with a sane elevation', () => {
  const match = playing('away');
  const ai = createAi('normal');
  for (const p of teamOf(match, 'away').filter((q) => q.id !== 'away-7')) place(match, p.id, -10, 15);
  for (const p of teamOf(match, 'home').filter((q) => q.id !== 'home-1' && q.id !== 'home-7')) place(match, p.id, -15, -12);
  place(match, 'away-7', -10, 15);
  place(match, 'home-1', 26.2, 0);
  place(match, 'home-7', 20, 3);
  Object.assign(match.ball, { x: 20.3, y: 3 });
  match.owner = 'home-7';
  let shot = null;
  for (let i = 0; i < 40 && !shot; i += 1) { match.time += 0.3; shot = aiControls(match, ai)['home-7'].shoot; }
  assert.ok(shot, 'it shoots within a few decisions');
  assert.ok(Number.isFinite(shot.elevation) && shot.elevation >= 0 && shot.elevation < 0.9);
  assert.ok(shot.power > 0 && shot.power <= 1);
});

test('a pressed carrier passes to an open teammate after holding the ball a moment', () => {
  const match = playing('away');
  const ai = createAi('hard');
  for (const p of match.players) place(match, p.id, p.team === 'home' ? -20 : 20, 16 - Number(p.id.split('-')[1]));
  place(match, 'home-5', 0, 0);
  place(match, 'away-4', 1.2, 0);
  place(match, 'home-7', 12, -4);
  Object.assign(match.ball, { x: 0.3, y: 0 });
  match.owner = 'home-5';
  let decision = null;
  for (let i = 0; i < 20 && !decision?.pass; i += 1) { match.time += 0.15; decision = aiControls(match, ai)['home-5']; }
  assert.ok(decision.pass, 'it passes');
  assert.ok(playerById(match, decision.passTo).team === 'home' && decision.passTo !== 'home-5');
  assert.ok(Math.abs(decision.passError) <= DIFFICULTIES.hard.passNoise);
});

test('the nearest defender presses the carrier and tackles when close', () => {
  const match = playing('away');
  const ai = createAi('hard');
  for (const p of match.players) place(match, p.id, p.team === 'home' ? -20 : 20, 16 - Number(p.id.split('-')[1]));
  place(match, 'home-5', 0, 0);
  place(match, 'away-4', 0.9, 0);
  Object.assign(match.ball, { x: 0.3, y: 0 });
  match.owner = 'home-5';
  let tackled = false;
  for (let i = 0; i < 40 && !tackled; i += 1) { match.time += 0.1; const c = aiControls(match, ai)['away-4']; tackled = c.tackle === 'stand'; }
  assert.ok(tackled);
  place(match, 'away-4', 6, 0);
  const chase = aiControls(match, createAi('hard'))['away-4'];
  assert.ok(chase.move.x < 0, 'closing the carrier down');
});

test('the AI-driven match is deterministic and produces real football: passes, shots, tackles and goals', () => {
  const play = (seed) => {
    const match = createMatch({ seed, humanTeam: 'none', halfSeconds: 100 });
    match.activeId = null;
    const ai = createAi('normal');
    const seen = {};
    let controls = {};
    for (let i = 0; i < 120 * 200; i += 1) {
      if (i % 6 === 0) controls = aiControls(match, ai, {});
      stepMatch(match, controls, MATCH.step);
      for (const event of drainEvents(match)) seen[event.type] = (seen[event.type] ?? 0) + 1;
    }
    return { match, seen };
  };
  const a = play(11);
  assert.deepEqual(a.match, play(11).match);
  const totals = {};
  for (const seen of [a.seen, play(12).seen, play(13).seen]) for (const [type, count] of Object.entries(seen)) totals[type] = (totals[type] ?? 0) + count;
  assert.ok(totals.pass > 20 && totals.touch > 20 && totals.shot >= 1 && totals.tackle >= 1, JSON.stringify(totals));
  assert.ok(totals.goal >= 1, `goals happen: ${JSON.stringify(totals)}`);
});

test('whatever the positions, the AI produces finite controls for everyone', () => {
  const spot = fc.record({ x: fc.double({ min: -HALF_LENGTH, max: HALF_LENGTH, noNaN: true }), y: fc.double({ min: -HALF_WIDTH, max: HALF_WIDTH, noNaN: true }) });
  fc.assert(fc.property(
    fc.array(spot, { minLength: 14, maxLength: 14 }),
    fc.record({ x: fc.double({ min: -HALF_LENGTH, max: HALF_LENGTH, noNaN: true }), y: fc.double({ min: -HALF_WIDTH, max: HALF_WIDTH, noNaN: true }), vx: fc.double({ min: -25, max: 25, noNaN: true }), vy: fc.double({ min: -25, max: 25, noNaN: true }) }),
    fc.constantFrom('easy', 'normal', 'hard'),
    fc.constantFrom(null, 'home-3', 'away-5', 'home-1', 'away-1'),
    (spots, ball, difficulty, owner) => {
      const match = playing();
      match.players.forEach((p, i) => Object.assign(p, spots[i]));
      Object.assign(match.ball, ball);
      match.owner = owner;
      const ai = createAi(difficulty);
      for (let i = 0; i < 5; i += 1) {
        match.time += 0.25;
        const controls = aiControls(match, ai, {});
        assert.ok(Object.values(controls).every(finite));
        for (const control of Object.values(controls)) assert.ok(Math.hypot(control.move.x, control.move.y) <= 1.0001, 'never asks for more than full speed');
      }
    },
  ), { numRuns: 150 });
});
