import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFormation, createTeamPlayers, formationAnchors, formationPosition, recordPlayerPosition } from '../js/formations.js';
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


test('manually placed players use their new support anchor while formation reset retains the approved slot', () => {
  const state = createInitialState();
  for (const team of ['home', 'away']) {
    const player = state.players.find((item) => item.id === `${team}-4`);
    const formation = team === 'home' ? state.homeFormation : state.awayFormation;
    const original = { x: player.x, y: player.y };
    player.x = 0.65;
    player.y = 0.22;
    recordPlayerPosition(player);
    assert.deepEqual({ x: player.anchorX, y: player.anchorY }, { x: 0.65, y: 0.22 });
    assert.deepEqual(formationPosition(state.players, player, formation), original);
  }
});


test('both team formations begin in their own halves, face forward, and do not overlap opponents', () => {
  const formations = ['1-3-2-1', '1-2-3-1'];
  for (const homeFormation of formations) for (const awayFormation of formations) {
    const home = createTeamPlayers('home', homeFormation);
    const away = createTeamPlayers('away', awayFormation);
    assert.ok(home.every((p) => p.x < 0.5));
    assert.ok(away.every((p) => p.x > 0.5));
    for (const team of [home, away]) {
      const forward = team.find((p) => p.role === 'ST');
      const midfield = team.filter((p) => p.role.endsWith('M'));
      const defense = team.filter((p) => p.role.endsWith('D'));
      const towardOpposingGoal = team[0].team === 'home' ? (a, b) => a > b : (a, b) => a < b;
      assert.ok(midfield.every((p) => towardOpposingGoal(forward.x, p.x)));
      assert.ok(midfield.every((mid) => defense.every((def) => towardOpposingGoal(mid.x, def.x))));
    }
    // Player discs have a 25-unit radius on the 1000 × 680 pitch viewBox.
    for (const a of home) for (const b of away) {
      assert.ok(Math.hypot((a.x - b.x) * 1000, (a.y - b.y) * 680) >= 50);
    }
  }
});


test('changing formation preserves custom names, numbers and colors while updating default role labels', () => {
  const state = createInitialState();
  const custom = state.players.find((player) => player.id === 'home-4');
  Object.assign(custom, { label: 'Alex', number: 42, colorOverride: '#ffffff' });
  const next = applyFormation(state.players, 'home', '1-2-3-1');
  assert.deepEqual(Object.fromEntries(['role', 'label', 'number', 'colorOverride'].map((key) => [key, next.find((p) => p.id === 'home-4')[key]])),
    { role: 'RD', label: 'Alex', number: 42, colorOverride: '#ffffff' });
  assert.equal(next.find((p) => p.id === 'home-3').label, 'CD');
  assert.deepEqual(next.filter((p) => p.team === 'away'), state.players.filter((p) => p.team === 'away'));
});
