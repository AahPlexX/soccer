import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { DIFFICULTIES, aiControls, createAi } from '../js/game/ai.js';
import { keeperControl, keeperState } from '../js/game/ai-keeper.js';
import { PITCH_BOUNDS, laneRisk, makeContext, openness, pressureAt, searchSpots, shotQuality } from '../js/game/ai-space.js';
import { arrive, ballAt, blend, capLength, interceptPoint, lerpPoint, separation, shadowPoint } from '../js/game/ai-steering.js';
import { ROLE_PRIORITY, planTeam, shapeTarget } from '../js/game/ai-team.js';
import { ROLE_TRAITS, chooseCarrierAction, planShot, scoreOptions } from '../js/game/ai-utility.js';
import { createMatch, playerById, teamOf } from '../js/game/match.js';
import { HALF_LENGTH, HALF_WIDTH } from '../js/game/rules.js';

const place = (match, id, x, y, extra = {}) => Object.assign(playerById(match, id), { x, y, vx: 0, vy: 0, ...extra });
const scatter = (match, team, x, y) => teamOf(match, team).forEach((p, i) => place(match, p.id, x + (i % 2) * 2, y + i * 2));
const playing = () => { const m = createMatch(); m.phase = 'play'; m.activeId = null; return m; };
const len = (v) => Math.hypot(v.x, v.y);

test('steering: arrive eases in, interception meets a rolling ball, separation pushes apart, blends are capped', () => {
  assert.deepEqual(arrive({ x: 0, y: 0 }, { x: 0.1, y: 0 }), { x: 0, y: 0 });
  assert.ok(len(arrive({ x: 0, y: 0 }, { x: 20, y: 0 }, 1, 3)) === 1);
  assert.ok(len(arrive({ x: 0, y: 0 }, { x: 1.5, y: 0 }, 1, 3)) < 0.6, 'slows near the target');
  assert.deepEqual(ballAt({ x: 0, y: 0, vx: 0, vy: 0 }, 5), { x: 0, y: 0 });
  const rolled = ballAt({ x: 0, y: 0, vx: 7, vy: 0 }, 100);
  assert.ok(rolled.x > 10 && rolled.x < 25, 'a rolling ball stops somewhere sensible');
  const hit = interceptPoint({ x: 0, y: 10 }, 5.5, { x: 0, y: 0, vx: 6, vy: 0 });
  assert.ok(hit.t > 0 && hit.t < 3 && Math.hypot(hit.x, hit.y) > 1, 'meets the ball ahead of where it is now');
  assert.ok(interceptPoint({ x: 0, y: 40 }, 5.5, { x: 0, y: 0, vx: 20, vy: 0 }, 1).t > 1, 'too slow: reports a later time');
  assert.ok(separation({ x: 0, y: 0 }, [{ x: 1, y: 0 }]).x < 0, 'pushed away from a close neighbour');
  assert.deepEqual(separation({ x: 0, y: 0 }, [{ x: 9, y: 0 }]), { x: 0, y: 0 }, 'far neighbours are ignored');
  assert.ok(len(blend([{ v: { x: 1, y: 0 }, w: 1 }, { v: { x: 1, y: 0 }, w: 1 }])) === 1);
  assert.ok(len(capLength({ x: 3, y: 4 })) === 1 && len(capLength({ x: 0.1, y: 0 })) === 0.1);
  assert.deepEqual(lerpPoint({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.3), { x: 3, y: 0 });
  assert.deepEqual(shadowPoint({ x: 0, y: 0 }, { x: 10, y: 0 }, 2), { x: 2, y: 0 });
});

test('space: pressure rises as defenders close in, open space is its complement, lane risk follows the defenders', () => {
  const match = playing();
  scatter(match, 'away', -20, -15);
  scatter(match, 'home', -20, 10);
  const quiet = makeContext(match);
  place(match, 'away-3', 5, 0);
  const near = makeContext(match);
  assert.ok(pressureAt(near, 'home', 5.5, 0) > 0.8 && pressureAt(quiet, 'home', 5.5, 0) < 0.2);
  assert.ok(Math.abs(openness(near, 'home', 5.5, 0) + pressureAt(near, 'home', 5.5, 0) - 1) < 1e-9);
  assert.ok(pressureAt(near, 'home', 0, 0) <= 1);
  const blocked = laneRisk(near, 'home', { x: 0, y: 0 }, { x: 10, y: 0 });
  const clear = laneRisk(near, 'home', { x: 0, y: 6 }, { x: 10, y: 6 });
  assert.ok(blocked > 0.6 && clear < 0.2 && blocked > clear, `blocked ${blocked}, clear ${clear}`);
  assert.equal(laneRisk(near, 'home', { x: 1, y: 1 }, { x: 1, y: 1 }), 0);
});

test('shot quality: best close and central, worse from far or wide, reduced by a blocker', () => {
  const match = playing();
  scatter(match, 'away', -20, -15);
  place(match, 'away-1', HALF_LENGTH - 1, 0);
  place(match, 'home-7', HALF_LENGTH - 8, 0);
  const closeCentral = shotQuality(makeContext(match), playerById(match, 'home-7'));
  place(match, 'home-7', HALF_LENGTH - 22, 0);
  const far = shotQuality(makeContext(match), playerById(match, 'home-7'));
  place(match, 'home-7', HALF_LENGTH - 8, 15);
  const wide = shotQuality(makeContext(match), playerById(match, 'home-7'));
  place(match, 'home-7', HALF_LENGTH - 8, 0);
  place(match, 'away-3', HALF_LENGTH - 4, 0);
  const blocked = shotQuality(makeContext(match), playerById(match, 'home-7'));
  assert.ok(closeCentral > 0.3 && closeCentral > far && closeCentral > wide && closeCentral > blocked, JSON.stringify({ closeCentral, far, wide, blocked }));
  assert.ok([closeCentral, far, wide, blocked].every((q) => q >= 0 && q <= 1));
});

test('spot search returns the best candidate inside the bounds, or null when none qualifies', () => {
  const best = searchSpots({ x: 0, y: 0 }, 6, 2, PITCH_BOUNDS, (p) => -Math.hypot(p.x - 4, p.y - 2));
  assert.deepEqual([best.x, best.y], [4, 2]);
  assert.equal(searchSpots({ x: 0, y: 0 }, 6, 2, PITCH_BOUNDS, () => null), null);
  const edge = searchSpots({ x: HALF_LENGTH, y: 0 }, 6, 2, PITCH_BOUNDS, (p) => p.x);
  assert.ok(edge.x <= PITCH_BOUNDS.maxX, 'never outside the bounds');
});

test('utility: an open goal at close range shoots; a pressed defender clears, passes or dribbles but does not shoot', () => {
  const profile = DIFFICULTIES.hard;
  const match = playing();
  scatter(match, 'away', -20, -15);
  place(match, 'away-1', HALF_LENGTH - 1, 12);
  place(match, 'home-7', HALF_LENGTH - 7, 0);
  Object.assign(match.ball, { x: HALF_LENGTH - 6.6, y: 0 });
  match.owner = 'home-7';
  const ctx = makeContext(match);
  const striker = chooseCarrierAction(ctx, profile, ctx.byId.get('home-7'), {}, 1);
  assert.equal(striker.kind, 'shoot', 'a striker with an open goal shoots');
  assert.ok(striker.control.shoot.power > 0 && Number.isFinite(striker.control.shoot.elevation));

  const back = playing();
  scatter(back, 'away', 5, -10);
  scatter(back, 'home', -15, 12);
  place(back, 'home-3', -22, 0);
  place(back, 'away-4', -20.8, 0);
  place(back, 'home-5', -12, 8);
  Object.assign(back.ball, { x: -21.8, y: 0 });
  back.owner = 'home-3';
  const backCtx = makeContext(back);
  const options = scoreOptions(backCtx, profile, backCtx.byId.get('home-3'), { held: 1 });
  const kinds = new Set(options.map((o) => o.kind));
  assert.ok(kinds.has('pass') && kinds.has('clear') && kinds.has('hold') && kinds.has('dribble'));
  const choice = chooseCarrierAction(backCtx, profile, backCtx.byId.get('home-3'), {}, 1);
  assert.notEqual(choice.kind, 'shoot', `chose ${choice.kind}`);
  assert.ok(options.every((o) => Number.isFinite(o.score)));
});

test('utility: passes wait a moment, a goalkeeper never dribbles or shoots, and role traits differ', () => {
  const match = playing();
  scatter(match, 'away', 12, -12);
  place(match, 'home-5', 0, 0);
  Object.assign(match.ball, { x: 0.3, y: 0 });
  match.owner = 'home-5';
  const ctx = makeContext(match);
  const profile = DIFFICULTIES.normal;
  assert.ok(!scoreOptions(ctx, profile, ctx.byId.get('home-5'), { held: 0.05 }).some((o) => o.kind === 'pass'), 'no pass in the first instant');
  assert.ok(scoreOptions(ctx, profile, ctx.byId.get('home-5'), { held: 1 }).some((o) => o.kind === 'pass'));
  place(match, 'home-1', -25, 0);
  match.owner = 'home-1';
  const keeperCtx = makeContext(match);
  const keeperKinds = new Set(scoreOptions(keeperCtx, profile, keeperCtx.byId.get('home-1'), { held: 2 }).map((o) => o.kind));
  assert.ok(!keeperKinds.has('shoot') && !keeperKinds.has('dribble') && keeperKinds.has('pass'));
  assert.ok(ROLE_TRAITS.ST.shoot > ROLE_TRAITS.CD.shoot && ROLE_TRAITS.CD.pass >= ROLE_TRAITS.ST.pass);
  const shot = planShot(match, profile, playerById(match, 'home-7'));
  assert.ok(shot.shoot.elevation >= 0 && Math.hypot(shot.move.x, shot.move.y) > 0.99);
});

test('team plan: attacking gives a carrier, supporters, runners and recovery cover; defending a presser, cover and markers', () => {
  const profile = DIFFICULTIES.hard;
  const attack = playing();
  place(attack, 'home-5', 0, 0);
  Object.assign(attack.ball, { x: 0.3, y: 0 });
  attack.owner = 'home-5';
  const ctx = makeContext(attack);
  const plan = planTeam(ctx, profile, 'home', attack.ball, null);
  assert.equal(plan.phase, 'attack');
  const roles = (p) => [...p.assignments.values()].map((a) => a.role);
  assert.equal(plan.assignments.get('home-5').role, 'carry');
  assert.ok(roles(plan).includes('support') && roles(plan).includes('run'), roles(plan).join());
  assert.equal(plan.assignments.size, 6, 'every outfield player has exactly one role');
  assert.ok(![...plan.assignments.keys()].includes('home-1'), 'the keeper is not planned here');
  for (const [, a] of plan.assignments) assert.ok(Number.isFinite(a.target.x) && Number.isFinite(a.target.y) && ROLE_PRIORITY[a.role] > 0);

  const defend = planTeam(ctx, profile, 'away', attack.ball, null);
  assert.equal(defend.phase, 'defend');
  const defendRoles = roles(defend);
  assert.equal(defendRoles.filter((r) => r === 'press').length, 1, 'exactly one presser');
  assert.ok(defendRoles.includes('cover') && defendRoles.includes('mark'));
  const presser = [...defend.assignments].find(([, a]) => a.role === 'press');
  assert.equal(presser[1].carrierId, 'home-5');

  const human = planTeam(ctx, profile, 'home', attack.ball, 'home-6');
  assert.ok(!human.assignments.has('home-6'), 'the human-controlled player gets no role');
});

test('team plan: a loose ball sends the fastest player and a cover; a pass in flight sends the receiver and interceptors', () => {
  const profile = DIFFICULTIES.normal;
  const loose = playing();
  Object.assign(loose.ball, { x: 5, y: 3, vx: 0, vy: 0 });
  loose.owner = null;
  const ctx = makeContext(loose);
  const plan = planTeam(ctx, profile, 'home', loose.ball, null);
  assert.equal(plan.phase, 'loose');
  assert.equal([...plan.assignments.values()].filter((a) => a.role === 'chase').length, 1);
  assert.ok([...plan.assignments.values()].some((a) => a.role === 'cover'));

  const flight = playing();
  place(flight, 'home-6', 12, 0);
  Object.assign(flight.ball, { x: 2, y: 0, vx: 9, vy: 0 });
  flight.owner = null;
  flight.passTarget = 'home-6';
  const flightCtx = makeContext(flight);
  const mine = planTeam(flightCtx, profile, 'home', flight.ball, null);
  assert.equal(mine.assignments.get('home-6').role, 'receive');
  const theirs = planTeam(flightCtx, profile, 'away', flight.ball, null);
  assert.equal(theirs.phase, 'defend');
  assert.ok([...theirs.assignments.values()].some((a) => a.role === 'intercept' || a.role === 'press'));
});

test('shape targets follow the ball, defenders stay goal side, strikers push up, everything stays on the pitch', () => {
  const player = (role, x, y) => ({ role, home: { x, y } });
  const ball = { x: 20, y: 5 };
  const striker = shapeTarget(player('ST', -5, 0), ball, 'home', true);
  const defender = shapeTarget(player('CD', -18, 0), ball, 'home', true);
  assert.ok(striker.x > -5 && defender.x < ball.x - 7.9, 'defenders hold back from the ball line');
  fc.assert(fc.property(fc.double({ min: -HALF_LENGTH, max: HALF_LENGTH, noNaN: true }), fc.double({ min: -HALF_WIDTH, max: HALF_WIDTH, noNaN: true }), fc.constantFrom('LD', 'CD', 'LM', 'CM', 'ST'), fc.boolean(), fc.constantFrom('home', 'away'), (x, y, role, attacking, team) => {
    const target = shapeTarget(player(role, team === 'home' ? -10 : 10, 3), { x, y }, team, attacking);
    assert.ok(Math.abs(target.x) <= HALF_LENGTH && Math.abs(target.y) <= HALF_WIDTH);
  }));
});

test('keeper states: tracks a shot, sweeps a loose ball, rushes a runner, otherwise stands on the ball-goal line', () => {
  const profile = DIFFICULTIES.hard;
  const match = playing();
  scatter(match, 'home', -10, -14);
  place(match, 'away-1', HALF_LENGTH - 1.5, 0);
  match.lastTouch = { team: 'home', id: 'home-7' };
  match.owner = null;
  const seen = (b) => ({ x: 0, y: 0, vx: 0, vy: 0, ...b });
  const keeper = () => makeContext(match).byId.get('away-1');
  assert.equal(keeperState(makeContext(match), keeper(), seen({ x: 15, y: 1, vx: 18, vy: 0 })), 'track');
  const shot = keeperControl(makeContext(match), profile, keeper(), seen({ x: 15, y: 2.5, vx: 18, vy: 0 }));
  assert.ok(shot.move.y > 0.2 && shot.sprint, 'moves toward where the shot is going');
  assert.equal(keeperState(makeContext(match), keeper(), seen({ x: 15, y: 1, vx: 18, vy: 20 })), 'set', 'a shot going wide is not tracked');
  Object.assign(match.ball, { x: HALF_LENGTH - 5, y: 2, vx: 1, vy: 0 });
  assert.equal(keeperState(makeContext(match), keeper(), seen({ x: HALF_LENGTH - 5, y: 2, vx: 1, vy: 0 })), 'sweep');
  place(match, 'home-7', HALF_LENGTH - 6, 1);
  assert.equal(keeperState(makeContext(match), keeper(), seen({ x: HALF_LENGTH - 5, y: 2, vx: 1, vy: 0 })), 'set', 'an attacker is closer: do not gamble');
  match.owner = 'home-7';
  assert.equal(keeperState(makeContext(match), keeper(), seen({ x: HALF_LENGTH - 6, y: 1 })), 'rush');
  match.owner = null;
  const calm = keeperControl(makeContext(match), profile, keeper(), seen({ x: 0, y: 8 }));
  assert.ok(!calm.sprint && len(calm.move) <= 0.8 + 1e-9);
});

test('perception: each team has its own reaction time and only about a second of ball history is kept', () => {
  const match = playing();
  scatter(match, 'home', -20, -14);
  scatter(match, 'away', 20, -14);
  const ai = createAi({ home: 'easy', away: 'hard' });
  Object.assign(match.ball, { x: 0, y: 8, vx: 0, vy: 0 });
  for (let i = 0; i < 30; i += 1) { match.time += 0.05; aiControls(match, ai, {}); }
  Object.assign(match.ball, { x: 0, y: -8 }); // the ball jumps across the pitch
  match.time += 0.05;
  const controls = aiControls(match, ai, {});
  assert.ok(Object.values(controls).every((c) => [c.move.x, c.move.y].every(Number.isFinite)));
  assert.ok(ai.profiles.home.reaction > ai.profiles.away.reaction);
  assert.ok(ai.history.length > 10 && ai.history.length < 40, `${ai.history.length} entries`);
  assert.equal(createAi({ home: 'hard' }).profiles.away.label, 'Normal', 'a missing side falls back to normal');
});

test('role hysteresis: roles are recorded, and the player keeps a current assignment with a finite target', () => {
  const match = playing();
  scatter(match, 'home', -20, -14);
  scatter(match, 'away', -3, 0);
  place(match, 'away-4', -1, 0);
  Object.assign(match.ball, { x: 0, y: 0, vx: 0, vy: 0 });
  place(match, 'home-5', 0, 0);
  match.owner = 'home-5';
  const ai = createAi('hard');
  match.time = 1;
  aiControls(match, ai, {});
  const { role, assignment } = ai.brains['away-4'];
  assert.ok(['press', 'cover', 'mark', 'intercept'].includes(role), role);
  assert.ok(assignment && Number.isFinite(assignment.target.x));
  assert.equal(ai.brains['home-5'].role, 'carry');
});

test('whatever the positions and ball, every AI control is finite and within full speed, for every difficulty', () => {
  const spot = fc.record({ x: fc.double({ min: -HALF_LENGTH, max: HALF_LENGTH, noNaN: true }), y: fc.double({ min: -HALF_WIDTH, max: HALF_WIDTH, noNaN: true }), vx: fc.double({ min: -7, max: 7, noNaN: true }), vy: fc.double({ min: -7, max: 7, noNaN: true }) });
  fc.assert(fc.property(
    fc.array(spot, { minLength: 14, maxLength: 14 }),
    fc.record({ x: fc.double({ min: -HALF_LENGTH, max: HALF_LENGTH, noNaN: true }), y: fc.double({ min: -HALF_WIDTH, max: HALF_WIDTH, noNaN: true }), vx: fc.double({ min: -25, max: 25, noNaN: true }), vy: fc.double({ min: -25, max: 25, noNaN: true }) }),
    fc.constantFrom('easy', 'normal', 'hard'),
    fc.constantFrom(null, 'home-3', 'away-5', 'home-1', 'away-1', 'home-7'),
    fc.constantFrom(null, 'away-6', 'home-2'),
    (spots, ball, difficulty, owner, passTarget) => {
      const match = playing();
      match.players.forEach((p, i) => Object.assign(p, spots[i]));
      Object.assign(match.ball, ball);
      match.owner = owner;
      match.passTarget = owner ? null : passTarget;
      const ai = createAi(difficulty);
      for (let i = 0; i < 4; i += 1) {
        match.time += 0.25;
        const controls = aiControls(match, ai, {});
        for (const control of Object.values(controls)) {
          assert.ok([control.move.x, control.move.y, control.speedScale].every(Number.isFinite));
          assert.ok(len(control.move) <= 1.0001);
        }
      }
    },
  ), { numRuns: 120 });
});
