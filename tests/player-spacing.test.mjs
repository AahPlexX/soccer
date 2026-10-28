import test from 'node:test';
import assert from 'node:assert/strict';
import { SIMULATION } from '../js/constants.js';
import { BUILT_IN_PRESETS } from '../js/builtins.js';
import { applyFormation } from '../js/formations.js';
import { separatePlayers, spacingDistance } from '../js/geometry.js';
import { stepSimulation } from '../js/simulation.js';
import { createInitialState, normalizeState } from '../js/state.js';

const MIN = SIMULATION.playerSpacing;
const EPSILON = 1e-9;
const player = (id, x, y) => ({ id, x, y });

function smallestGap(players) {
  let smallest = Infinity;
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) smallest = Math.min(smallest, spacingDistance(players[i], players[j]));
  }
  return smallest;
}

test('separatePlayers splits an overlap evenly and leaves spaced players alone', () => {
  const pair = [player('a', 0.5, 0.5), player('b', 0.52, 0.5)];
  separatePlayers(pair, MIN);
  assert.ok(smallestGap(pair) >= MIN - EPSILON);
  // The 0.02 gap needs a 0.03 push, split evenly: 0.015 each.
  assert.ok(Math.abs(pair[0].x - 0.485) < 1e-6 && Math.abs(pair[1].x - 0.535) < 1e-6);

  const spaced = [player('a', 0.2, 0.2), player('b', 0.8, 0.8)];
  separatePlayers(spaced, MIN);
  assert.deepEqual(spaced.map((p) => [p.x, p.y]), [[0.2, 0.2], [0.8, 0.8]]);
});

test('separatePlayers separates coincident players and keeps fixed players in place', () => {
  const stacked = [player('a', 0.5, 0.5), player('b', 0.5, 0.5)];
  separatePlayers(stacked, MIN, ['a']);
  assert.deepEqual([stacked[0].x, stacked[0].y], [0.5, 0.5]);
  assert.ok(spacingDistance(stacked[0], stacked[1]) >= MIN - EPSILON);
});

test('separatePlayers measures distance as drawn: the pitch is shorter vertically than horizontally', () => {
  const pair = [player('a', 0.5, 0.5), player('b', 0.5, 0.54)];
  separatePlayers(pair, MIN);
  assert.ok(spacingDistance(pair[0], pair[1]) >= MIN - EPSILON);
});

test('separatePlayers keeps players on the pitch when they are pinned in a corner', () => {
  const corner = [player('a', 0, 0), player('b', 0, 0), player('c', 0.01, 0.01)];
  separatePlayers(corner, MIN);
  corner.forEach((p) => assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
  assert.ok(smallestGap(corner) >= MIN - 1e-3);
});

test('opposing strikers placed on the same spot are pulled apart in one simulation step', () => {
  const state = createInitialState();
  Object.assign(state.players.find((p) => p.id === 'home-7'), { x: 0.5, y: 0.5 });
  Object.assign(state.players.find((p) => p.id === 'away-7'), { x: 0.5, y: 0.5 });
  state.simulation.running = true;
  stepSimulation(state, 1 / 60);
  assert.ok(smallestGap(state.players) >= MIN - EPSILON);
});

for (const mode of ['good', 'swarm']) {
  test(`players never overlap over a 10 minute match in ${mode} spacing mode, and tackles still happen`, () => {
    const state = createInitialState();
    state.spacingMode = mode;
    state.simulation.running = true;
    let worst = Infinity;
    let possessionChanges = 0;
    let previousTeam = null;
    for (let i = 0; i < 60 * 600; i += 1) {
      stepSimulation(state, 1 / 60);
      worst = Math.min(worst, smallestGap(state.players));
      const team = state.simulation.carrierId?.split('-')[0];
      if (team && previousTeam && team !== previousTeam) possessionChanges += 1;
      if (team) previousTeam = team;
    }
    assert.ok(worst >= MIN * 0.99, `smallest on-screen gap was ${worst}`);
    assert.ok(possessionChanges > 0, 'no possession changes: tackles can no longer happen');
  });
}

test('every pairing of the two formations starts with players clear of each other', () => {
  for (const home of ['1-3-2-1', '1-2-3-1']) {
    for (const away of ['1-3-2-1', '1-2-3-1']) {
      let players = createInitialState().players;
      players = applyFormation(players, 'home', home);
      players = applyFormation(players, 'away', away);
      assert.ok(smallestGap(players) >= MIN - EPSILON, `${home} vs ${away}`);
    }
  }
});

test('built-in scenarios load with no overlapping players once settled, without moving anyone far', () => {
  for (const preset of BUILT_IN_PRESETS) {
    const { players } = normalizeState(preset.createState());
    const before = players.map(({ x, y }) => ({ x, y }));
    separatePlayers(players, MIN);
    assert.ok(smallestGap(players) >= MIN - 1e-3, preset.id);
    players.forEach((p, i) => {
      assert.ok(spacingDistance(p, before[i]) <= MIN, `${preset.id}: ${p.id} moved too far`);
    });
  }
});

 test('fourteen coincident players at a corner settle with full disc separation', () => {
  const players = Array.from({length:14}, (_,i)=>player(String(i),0,0));
  separatePlayers(players,MIN,['0']);
  assert.deepEqual([players[0].x,players[0].y],[0,0]);
  assert.ok(smallestGap(players)>=MIN-EPSILON);
});
