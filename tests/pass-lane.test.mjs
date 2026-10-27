import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceToSegment } from '../js/geometry.js';
import { createInitialState } from '../js/state.js';
import { stepSimulation } from '../js/simulation.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('distanceToSegment measures to the nearest point on the segment', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 1, y: 0 };
  near(distanceToSegment({ x: 0.5, y: 0.2 }, a, b), 0.2);
  near(distanceToSegment({ x: 1.5, y: 0 }, a, b), 0.5);
  near(distanceToSegment({ x: -0.3, y: 0.4 }, a, b), 0.5);
  near(distanceToSegment({ x: 0.3, y: 0.4 }, a, a), 0.5);
});

// home-5 decides to pass on the next frame; `arrange` may reposition players first. Returns the chosen receiver.
function chosenReceiver(arrange = () => {}) {
  const state = createInitialState();
  const carrier = state.players.find((p) => p.id === 'home-5');
  Object.assign(state.simulation, {
    running: true, possessionTeam: 'home', lastTouchTeam: 'home', carrierId: carrier.id, actionClock: 1.79,
  });
  state.balls[0].x = carrier.x;
  state.balls[0].y = carrier.y;
  arrange(state, carrier);
  stepSimulation(state, 1 / 60);
  return state.simulation.receiverId;
}

const onLane = (state, carrier, receiverId, opponentId) => {
  const receiver = state.players.find((p) => p.id === receiverId);
  const opponent = state.players.find((p) => p.id === opponentId);
  opponent.x = (carrier.x + receiver.x) / 2;
  opponent.y = (carrier.y + receiver.y) / 2;
};

test('the carrier passes to a different teammate when an opponent blocks the best lane', () => {
  const best = chosenReceiver();
  assert.match(best, /^home-/);
  const rerouted = chosenReceiver((state, carrier) => onLane(state, carrier, best, 'away-2'));
  assert.match(rerouted, /^home-/);
  assert.notEqual(rerouted, best);
});

test('when every lane is blocked the carrier still passes to a teammate', () => {
  const blocked = chosenReceiver((state, carrier) => {
    const teammates = state.players.filter((p) => p.team === 'home' && p.id !== carrier.id);
    teammates.forEach((teammate, i) => onLane(state, carrier, teammate.id, `away-${i + 1}`));
  });
  assert.match(blocked, /^home-/);
});
