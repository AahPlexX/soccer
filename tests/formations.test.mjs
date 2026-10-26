import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFormation, createTeamPlayers, formationAnchors } from '../js/formations.js';
import { createInitialState } from '../js/state.js';

test('only PRD-approved formations are accepted', () => {
  assert.equal(formationAnchors('home', '1-3-2-1').length, 7);
  assert.equal(formationAnchors('home', '1-2-3-1').length, 7);
  assert.throws(() => formationAnchors('home', '4-4-2'), /Unsupported formation/);
});

test('away formation mirrors the home coordinate system', () => {
  const home = formationAnchors('home', '1-3-2-1');
  const away = formationAnchors('away', '1-3-2-1');
  assert.equal(home[0][1] + away[0][1], 1);
  assert.equal(home[0][2] + away[0][2], 1);
});

test('switching formation keeps seven players and updates anchors', () => {
  const state = createInitialState();
  const updated = applyFormation(state.players, 'home', '1-2-3-1');
  const home = updated.filter((player) => player.team === 'home');
  assert.equal(home.length, 7);
  assert.deepEqual(home.map((player) => player.role), ['GK', 'LD', 'CD', 'RD', 'LM', 'RM', 'ST']);
  assert.ok(home.every((player) => player.x === player.anchorX && player.y === player.anchorY));
});

test('team factory creates stable IDs and jersey numbers', () => {
  const players = createTeamPlayers('away', '1-2-3-1');
  assert.deepEqual(players.map((player) => player.id), ['away-1','away-2','away-3','away-4','away-5','away-6','away-7']);
  assert.deepEqual(players.map((player) => player.number), [1,2,3,4,5,6,7]);
});
