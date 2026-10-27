import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../js/state.js';
import { stepSimulation } from '../js/simulation.js';

test('keep-in rule constrains the selected team to the active zone union', () => {
  const state = createInitialState();
  state.simulation.running = true;
  state.zoneRestrictionMode = 'keep-in';
  state.zoneRestrictionScope = 'home';
  state.selectedZones = ['left'];

  stepSimulation(state, 1 / 60);

  assert.ok(state.players.filter((player) => player.team === 'home').every((player) => player.y <= 0.5));
  assert.ok(state.players.filter((player) => player.team === 'away').some((player) => player.y > 0.5));
});

test('keep-out rule moves a scoped player out of the selected zone union', () => {
  const state = createInitialState();
  state.simulation.running = true;
  state.zoneRestrictionMode = 'keep-out';
  state.zoneRestrictionScope = 'away';
  state.selectedZones = ['homeBuild'];
  const player = state.players.find((candidate) => candidate.team === 'away' && candidate.role !== 'GK');
  player.x = 0.2;
  player.y = 0.5;

  stepSimulation(state, 1 / 60);

  assert.ok(player.x > 0.35);
});

test('mandatory U9 build-out retreat overrides a conflicting optional zone rule', () => {
  const state = createInitialState();
  state.simulation.running = true;
  state.simulation.possessionTeam = 'home';
  state.simulation.carrierId = 'home-1';
  state.simulation.lastTouchTeam = 'home';
  state.zoneRestrictionMode = 'keep-in';
  state.zoneRestrictionScope = 'away';
  state.selectedZones = ['homeBuild'];
  state.balls[0].x = 0.1;
  state.balls[0].y = 0.5;

  for (let frame = 0; frame < 240; frame += 1) stepSimulation(state, 1 / 60);

  assert.ok(state.players.filter((player) => player.team === 'away').every((player) => player.x >= 0.35));
});
