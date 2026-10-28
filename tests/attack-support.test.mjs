import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../js/state.js';
import { stepSimulation } from '../js/simulation.js';

test('attacking support advances from own-half anchors in both directions', () => {
  for (const team of ['home', 'away']) {
    const state = createInitialState();
    const carrier = state.players.find((p) => p.id === `${team}-5`);
    const striker = state.players.find((p) => p.id === `${team}-7`);
    const initialX = striker.x;
    carrier.x = team === 'home' ? 0.6 : 0.4;
    carrier.y = 0.1;
    Object.assign(state.balls[0], { x: carrier.x, y: carrier.y });
    state.players.filter((p) => p.team !== team).forEach((p) => { p.x = team === 'home' ? 0.95 : 0.05; p.y = 0.95; });
    Object.assign(state.simulation, { running: true, carrierId: carrier.id, possessionTeam: team, lastTouchTeam: team });
    for (let i = 0; i < 30; i++) stepSimulation(state, 1 / 60);
    assert.ok(team === 'home' ? striker.x > initialX : striker.x < initialX,
      `${team} striker should advance with possession`);
  }
});
