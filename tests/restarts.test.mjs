import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBoundaryRestart, restartPoint } from '../js/restarts.js';

test('touchline exit awards a throw-in to the other team', () => {
  assert.deepEqual(classifyBoundaryRestart({ x: 0.44, y: 1 }, 'home'), {
    type: 'throw-in',
    team: 'away',
    side: 'right',
  });
});

test('attacker touching the ball last over a goal line outside the goal awards a goal kick', () => {
  assert.deepEqual(classifyBoundaryRestart({ x: 1, y: 0.12 }, 'home'), {
    type: 'goal-kick',
    team: 'away',
    side: 'away',
  });
});

test('defender touching the ball last over its own goal line awards a corner', () => {
  assert.deepEqual(classifyBoundaryRestart({ x: 1, y: 0.88 }, 'away'), {
    type: 'corner',
    team: 'home',
    side: 'away',
  });
});

test('ball crossing through the goal mouth is classified as a goal and kickoff', () => {
  assert.deepEqual(classifyBoundaryRestart({ x: 1, y: 0.5 }, 'home'), {
    type: 'kickoff',
    team: 'away',
    side: 'away',
    scoredBy: 'home',
  });
});

test('restartPoint keeps throw-ins on the touchline and corners at the corner', () => {
  assert.deepEqual(restartPoint({ type: 'throw-in', team: 'away', side: 'left' }, { x: 0.37, y: 0 }), { x: 0.37, y: 0 });
  assert.deepEqual(restartPoint({ type: 'corner', team: 'home', side: 'away' }, { x: 1, y: 0.88 }), { x: 1, y: 1 });
});
