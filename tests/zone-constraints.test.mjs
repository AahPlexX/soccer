import test from 'node:test';
import assert from 'node:assert/strict';
import { constrainPlayerPositionForZones, constrainPointToZones, shouldRestrictTeam } from '../js/zone-constraints.js';

test('point already inside any selected zone is unchanged', () => {
  assert.deepEqual(constrainPointToZones({ x: 0.7, y: 0.2 }, ['left']), { x: 0.7, y: 0.2 });
});

test('point outside a selected zone is projected to its nearest edge', () => {
  assert.deepEqual(constrainPointToZones({ x: 0.7, y: 0.8 }, ['left']), { x: 0.7, y: 0.5 });
});

test('multiple selected zones behave as an allowed union', () => {
  assert.deepEqual(constrainPointToZones({ x: 0.7, y: 0.8 }, ['left', 'right']), { x: 0.7, y: 0.8 });
});

test('nearest selected rectangle is chosen when zones are disjoint', () => {
  assert.deepEqual(constrainPointToZones({ x: 0.58, y: 0.9 }, ['homeBox', 'awayBox']), { x: 0.8, y: 0.8 });
});

test('no valid selected zones leaves the target unchanged', () => {
  assert.deepEqual(constrainPointToZones({ x: 0.3, y: 0.9 }, []), { x: 0.3, y: 0.9 });
  assert.deepEqual(constrainPointToZones({ x: 0.3, y: 0.9 }, ['missing']), { x: 0.3, y: 0.9 });
});

test('restriction scope can target our team, opponents, both, or neither', () => {
  assert.equal(shouldRestrictTeam('off', 'home'), false);
  assert.equal(shouldRestrictTeam('home', 'home'), true);
  assert.equal(shouldRestrictTeam('home', 'away'), false);
  assert.equal(shouldRestrictTeam('away', 'away'), true);
  assert.equal(shouldRestrictTeam('both', 'home'), true);
  assert.equal(shouldRestrictTeam('both', 'away'), true);
});

test('restricted team positions are projected while unrestricted teams are untouched', () => {
  const state = { selectedZones: ['left'], zoneRestrictionScope: 'home' };
  assert.deepEqual(constrainPlayerPositionForZones(state, { team: 'home' }, { x: 0.4, y: 0.8 }), { x: 0.4, y: 0.5 });
  assert.deepEqual(constrainPlayerPositionForZones(state, { team: 'away' }, { x: 0.4, y: 0.8 }), { x: 0.4, y: 0.8 });
});
