import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { createMatch, playerById, teamOf } from '../js/game/match.js';
import { SWITCH, autoSwitch, cycleSwitch, directionSwitch, switchCandidates } from '../js/game/switching.js';

const place = (match, id, x, y) => Object.assign(playerById(match, id), { x, y, vx: 0, vy: 0 });
// Home outfield players in a line along the pitch at x = -10, -5, 0, 5, 10, 15 (ids home-2..home-7), ball with the opponents.
const lineUp = () => {
  const match = createMatch();
  ['home-2', 'home-3', 'home-4', 'home-5', 'home-6', 'home-7'].forEach((id, i) => place(match, id, -10 + i * 5, 0));
  match.phase = 'play';
  match.owner = null;
  match.passTarget = null;
  match.activeId = 'home-2';
  Object.assign(match.ball, { x: 14, y: 0 });
  match.time = 10;
  return match;
};

test('candidates are the human outfield players on their feet, never the keeper', () => {
  const match = lineUp();
  playerById(match, 'home-4').down = 1;
  const ids = switchCandidates(match).map((p) => p.id);
  assert.ok(!ids.includes('home-1') && !ids.includes('home-4') && ids.length === 5);
  assert.ok(ids.every((id) => id.startsWith('home')));
});

test('the receiver of a pass in flight becomes active', () => {
  const match = lineUp();
  match.passTarget = 'home-6';
  assert.equal(autoSwitch(match), true);
  assert.equal(match.activeId, 'home-6');
  match.passTarget = 'away-3';
  assert.equal(autoSwitch(match), false, 'an opponent receiver is not a candidate');
});

test('the player who wins the ball becomes active', () => {
  const match = lineUp();
  match.owner = 'home-5';
  autoSwitch(match);
  assert.equal(match.activeId, 'home-5');
});

test('a manual switch is respected for a moment even while the team has the ball', () => {
  const match = lineUp();
  match.owner = 'home-5';
  autoSwitch(match);
  cycleSwitch(match);
  const chosen = match.activeId;
  assert.notEqual(chosen, 'home-5');
  match.time += 0.5;
  autoSwitch(match);
  assert.equal(match.activeId, chosen, 'not snapped back at once');
  match.time += SWITCH.manualHold;
  autoSwitch(match);
  assert.equal(match.activeId, 'home-5', 'later the holder is active again');
});

test('when defending, the best-placed defender takes over, but only past the margin and the lockout', () => {
  const match = lineUp();
  Object.assign(match.ball, { x: 12.6, y: 0 });
  match.activeId = 'home-6'; // 2.6 m from the ball; home-7 is 2.4 m away: inside the margin
  autoSwitch(match);
  assert.equal(match.activeId, 'home-6', 'within the margin nothing changes');
  Object.assign(match.ball, { x: 14, y: 0 });
  match.activeId = 'home-2';
  match.switching.lockUntil = match.time + 1;
  assert.equal(autoSwitch(match), false, 'locked out');
  match.time += 1.1;
  assert.equal(autoSwitch(match), true);
  assert.equal(match.activeId, 'home-7', 'the player nearest the ball');
  assert.ok(match.switching.lockUntil > match.time, 'a switch starts a new lockout');
});

test('the active player is replaced if they are the keeper or on the floor', () => {
  const match = lineUp();
  match.activeId = 'home-1';
  autoSwitch(match);
  assert.equal(match.activeId, 'home-7');
  match.activeId = 'home-2';
  playerById(match, 'home-2').down = 1;
  match.switching.lockUntil = Infinity;
  autoSwitch(match);
  assert.notEqual(match.activeId, 'home-2', 'a downed player is replaced even during the lockout');
});

test('the human keeper is active only while holding the ball', () => {
  const match = lineUp();
  match.owner = 'home-1';
  autoSwitch(match);
  assert.equal(match.activeId, 'home-1');
  match.owner = null;
  autoSwitch(match);
  assert.notEqual(match.activeId, 'home-1');
});

test('cycling goes to the nearest teammate to the ball and walks outward on quick repeats', () => {
  const match = lineUp();
  match.activeId = 'home-2';
  cycleSwitch(match);
  assert.equal(match.activeId, 'home-7');
  match.time += 0.3;
  cycleSwitch(match);
  assert.equal(match.activeId, 'home-6', 'second press: next nearest');
  match.time += 0.3;
  cycleSwitch(match);
  assert.equal(match.activeId, 'home-5');
  match.time += 3;
  cycleSwitch(match);
  assert.equal(match.activeId, 'home-7', 'after a pause the cycle restarts at the nearest other player');
});

test('a directional switch picks the teammate in that direction, nearest first, and falls back to cycling', () => {
  const match = lineUp();
  match.activeId = 'home-4'; // x = 0
  directionSwitch(match, { x: 1, y: 0 });
  assert.equal(match.activeId, 'home-5', 'the nearest teammate to the right');
  match.activeId = 'home-4';
  directionSwitch(match, { x: -1, y: 0 });
  assert.equal(match.activeId, 'home-3');
  place(match, 'home-3', 0, 8);
  match.activeId = 'home-4';
  directionSwitch(match, { x: 0, y: 1 });
  assert.equal(match.activeId, 'home-3', 'sideways players are found too');
  match.activeId = 'home-4';
  directionSwitch(match, { x: 0, y: 0 });
  assert.notEqual(match.activeId, 'home-4', 'no direction means a plain cycle');
});

test('whatever the positions, switching only ever selects a valid candidate', () => {
  const spot = fc.record({ x: fc.double({ min: -27, max: 27, noNaN: true }), y: fc.double({ min: -18, max: 18, noNaN: true }), down: fc.boolean() });
  fc.assert(fc.property(
    fc.array(spot, { minLength: 14, maxLength: 14 }),
    fc.record({ x: fc.double({ min: -27, max: 27, noNaN: true }), y: fc.double({ min: -18, max: 18, noNaN: true }) }),
    fc.array(fc.constantFrom('auto', 'cycle', 'left', 'right', 'up', 'down'), { minLength: 1, maxLength: 30 }),
    (spots, ball, actions) => {
      const match = createMatch();
      match.players.forEach((p, i) => Object.assign(p, { x: spots[i].x, y: spots[i].y, down: spots[i].down ? 1 : 0 }));
      // At least one human outfield player must be on their feet for a switch to be possible.
      if (switchCandidates(match).length === 0) match.players.find((p) => p.team === 'home' && p.role !== 'GK').down = 0;
      Object.assign(match.ball, ball);
      match.owner = null;
      for (const action of actions) {
        match.time += 0.2;
        if (action === 'auto') autoSwitch(match);
        else if (action === 'cycle') cycleSwitch(match);
        else directionSwitch(match, { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } }[action]);
        const active = playerById(match, match.activeId);
        assert.ok(active && active.team === 'home', 'always a human-team player');
        assert.ok(active.role !== 'GK' || match.owner === active.id, 'the keeper only while holding the ball');
      }
      assert.equal(teamOf(match, 'home').length, 7);
    },
  ), { numRuns: 150 });
});
