import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { HALF_LENGTH, HALF_MOUTH, HALF_WIDTH, boundaryRestart, exitCrossing, formationSlots, inPenaltyArea } from '../js/game/rules.js';
import { PLAYER, createPlayer, separatePlayers, stepPlayer, turnToward } from '../js/game/player-physics.js';

const STEP = 1 / 120;
const runner = (x = 0, y = 0) => createPlayer({ id: 'home-2', team: 'home', role: 'LD', x, y });

test('formations give each team seven players on their own side, mirrored for the away team', () => {
  for (const name of ['1-3-2-1', '1-2-3-1']) {
    const home = formationSlots('home', name);
    const away = formationSlots('away', name);
    assert.equal(home.length, 7);
    assert.equal(home.filter((slot) => slot.role === 'GK').length, 1);
    assert.ok(home.every((slot) => slot.x < 0 && Math.abs(slot.x) <= HALF_LENGTH && Math.abs(slot.y) <= HALF_WIDTH), 'home starts in its own half');
    assert.ok(away.every((slot) => slot.x > 0), 'away starts in its own half');
    assert.deepEqual(away.map((slot) => slot.id), away.map((_, i) => `away-${i + 1}`));
    assert.ok(Math.abs(home[0].x) > HALF_LENGTH - 3 && home[0].role === 'GK', 'the goalkeeper stands near the goal line');
  }
  assert.deepEqual(formationSlots('home', 'nonsense'), formationSlots('home', '1-3-2-1'));
});

test('a ball leaving the pitch is cut at the exact line crossing', () => {
  const crossing = exitCrossing({ x: HALF_LENGTH - 1, y: 2, z: 1 }, { x: HALF_LENGTH + 1, y: 4, z: 3 });
  assert.ok(Math.abs(crossing.x - HALF_LENGTH) < 1e-9 && Math.abs(crossing.y - 3) < 1e-9 && Math.abs(crossing.z - 2) < 1e-9);
  assert.equal(exitCrossing({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }), null);
  const corner = exitCrossing({ x: HALF_LENGTH - 0.5, y: HALF_WIDTH - 0.5, z: 0 }, { x: HALF_LENGTH + 1, y: HALF_WIDTH + 0.2, z: 0 });
  assert.ok(Math.abs(corner.x - HALF_LENGTH) < 1e-9 || Math.abs(corner.y - HALF_WIDTH) < 1e-9, 'the first boundary reached wins');
});

test('restarts follow the football rules, and height decides goal versus over the bar', () => {
  const goal = boundaryRestart({ x: HALF_LENGTH, y: 0.5, z: 1 }, 'home');
  assert.equal(goal.type, 'kickoff');
  assert.equal(goal.scoredBy, 'home');
  assert.ok(Math.abs(goal.spot.x) < 1e-9 && Math.abs(goal.spot.y) < 1e-9, 'kickoff is at the center');
  assert.equal(boundaryRestart({ x: HALF_LENGTH, y: 0, z: 2.6 }, 'home').type, 'goal-kick', 'over the bar is a goal kick');
  assert.equal(boundaryRestart({ x: HALF_LENGTH, y: HALF_MOUTH + 3, z: 0.1 }, 'away').type, 'corner');
  const throwIn = boundaryRestart({ x: 5, y: HALF_WIDTH, z: 0 }, 'home');
  assert.deepEqual([throwIn.type, throwIn.team], ['throw-in', 'away']);
  assert.ok(Math.abs(throwIn.spot.y) <= HALF_WIDTH && Math.abs(throwIn.spot.y) > HALF_WIDTH - 0.2, 'the throw-in is taken at the line');
  assert.equal(boundaryRestart({ x: 0, y: 0, z: 0 }, 'home'), null);
});

test('the penalty area belongs to the defending team only', () => {
  assert.ok(inPenaltyArea('home', { x: -HALF_LENGTH + 2, y: 0 }));
  assert.ok(!inPenaltyArea('home', { x: HALF_LENGTH - 2, y: 0 }));
  assert.ok(inPenaltyArea('away', { x: HALF_LENGTH - 2, y: 3 }));
  assert.ok(!inPenaltyArea('away', { x: HALF_LENGTH - 2, y: 15 }));
});

test('a player accelerates to, but not past, top speed, and sprinting is faster but tires', () => {
  const walker = runner();
  for (let i = 0; i < 240; i += 1) stepPlayer(walker, { x: 1, y: 0, sprint: false }, STEP);
  assert.ok(Math.abs(Math.hypot(walker.vx, walker.vy) - PLAYER.topSpeed) < 0.01);
  const sprinter = runner();
  for (let i = 0; i < 240; i += 1) stepPlayer(sprinter, { x: 1, y: 0, sprint: true }, STEP);
  assert.ok(sprinter.vx > PLAYER.topSpeed && sprinter.vx <= PLAYER.sprintSpeed + 1e-9);
  assert.ok(sprinter.stamina < 1 && sprinter.stamina > 0.5);
  const tired = runner();
  tired.stamina = 0;
  for (let i = 0; i < 240; i += 1) stepPlayer(tired, { x: 1, y: 0, sprint: true }, STEP);
  assert.ok(tired.vx <= PLAYER.topSpeed + 1e-9, 'no sprint without stamina');
});

test('a player with the ball is slower, and acceleration is limited so speed never jumps', () => {
  const carrier = runner();
  for (let i = 0; i < 240; i += 1) stepPlayer(carrier, { x: 1, y: 0 }, STEP, { hasBall: true });
  assert.ok(Math.abs(carrier.vx - PLAYER.topSpeed * PLAYER.ballSpeedFactor) < 0.01);
  const fresh = runner();
  stepPlayer(fresh, { x: 1, y: 0 }, STEP);
  assert.ok(Math.abs(fresh.vx - PLAYER.acceleration * STEP) < 1e-9, 'one step adds at most acceleration x dt');
});

test('facing turns at a limited rate toward the movement direction, the short way round', () => {
  assert.ok(Math.abs(turnToward(0, Math.PI / 2, 0.1) - 0.1) < 1e-12);
  assert.ok(Math.abs(turnToward(3, -3, 0.1) - (3.1 - 2 * Math.PI)) < 1e-9 || Math.abs(turnToward(3, -3, 0.1) - 3.1) < 1e-9, 'wraps across pi');
  assert.equal(turnToward(0, 0.05, 0.1), 0.05);
  const turner = runner();
  stepPlayer(turner, { x: 0, y: 1 }, STEP);
  assert.ok(turner.heading > 0 && turner.heading <= PLAYER.turnRate * STEP + 1e-12);
});

test('a downed player cannot run and slows to a stop, then recovers', () => {
  const faller = runner();
  faller.vx = 5;
  faller.down = 0.5;
  for (let i = 0; i < 30; i += 1) stepPlayer(faller, { x: 1, y: 0, sprint: true }, STEP);
  assert.ok(faller.vx < 1.5, 'friction while down');
  for (let i = 0; i < 120; i += 1) stepPlayer(faller, { x: 1, y: 0 }, STEP);
  assert.equal(faller.down, 0);
  assert.ok(faller.vx > 3);
});

test('players are pushed apart and a downed player is not shoved', () => {
  const a = runner(0, 0);
  const b = { ...runner(0.2, 0), id: 'away-2', team: 'away' };
  separatePlayers([a, b]);
  assert.ok(Math.hypot(b.x - a.x, b.y - a.y) >= PLAYER.radius * 2 - 1e-9);
  const standing = runner(0, 0);
  const lying = { ...runner(0.2, 0), id: 'away-3', team: 'away', down: 1 };
  separatePlayers([standing, lying]);
  assert.equal(lying.x, 0.2, 'the downed player stays put');
  const same = [runner(1, 1), { ...runner(1, 1), id: 'away-4', team: 'away' }];
  separatePlayers(same);
  assert.ok(Number.isFinite(same[0].x) && same[0].x !== same[1].x, 'coincident players separate deterministically');
});

test('players stay within the margin around the pitch whatever the input', () => {
  fc.assert(fc.property(fc.array(fc.record({ x: fc.double({ min: -3, max: 3, noNaN: true }), y: fc.double({ min: -3, max: 3, noNaN: true }), sprint: fc.boolean() }), { minLength: 1, maxLength: 200 }), (wishes) => {
    const player = runner(HALF_LENGTH, HALF_WIDTH);
    for (const wish of wishes) stepPlayer(player, wish, STEP);
    assert.ok(Math.abs(player.x) <= HALF_LENGTH + PLAYER.margin + 1e-9 && Math.abs(player.y) <= HALF_WIDTH + PLAYER.margin + 1e-9);
    assert.ok(Math.hypot(player.vx, player.vy) <= PLAYER.sprintSpeed + 1e-6, 'even oversized input never exceeds sprint speed');
    assert.ok(player.stamina >= 0 && player.stamina <= 1);
  }), { numRuns: 100 });
});
