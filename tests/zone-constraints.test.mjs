import test from 'node:test';
import assert from 'node:assert/strict';
import {
  constrainPlayerPositionForZones,
  constrainPointOutsideZones,
  constrainPointToZones,
  shouldRestrictTeam,
} from '../js/zone-constraints.js';

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

test('keep-out projects a point inside one selected zone to the nearest legal edge', () => {
  const result = constrainPointOutsideZones({ x: 0.2, y: 0.4 }, ['homeBuild']);
  assert.ok(result.x > 0.35);
  assert.equal(result.y, 0.4);
});

test('keep-out handles overlapping selected zones by leaving their union', () => {
  const result = constrainPointOutsideZones({ x: 0.2, y: 0.3 }, ['homeBuild', 'left']);
  assert.ok(result.x > 0.35);
  assert.ok(result.y > 0.5);
});

test('player rule supports keep-in, keep-out, and off', () => {
  const player = { team: 'away' };
  assert.deepEqual(
    constrainPlayerPositionForZones(
      { selectedZones: ['homeBuild'], zoneRestrictionMode: 'keep-in', zoneRestrictionScope: 'away' },
      player,
      { x: 0.6, y: 0.5 },
    ),
    { x: 0.35, y: 0.5 },
  );

  const keptOut = constrainPlayerPositionForZones(
    { selectedZones: ['homeBuild'], zoneRestrictionMode: 'keep-out', zoneRestrictionScope: 'away' },
    player,
    { x: 0.2, y: 0.5 },
  );
  assert.ok(keptOut.x > 0.35);

  assert.deepEqual(
    constrainPlayerPositionForZones(
      { selectedZones: ['homeBuild'], zoneRestrictionMode: 'off', zoneRestrictionScope: 'away' },
      player,
      { x: 0.2, y: 0.5 },
    ),
    { x: 0.2, y: 0.5 },
  );
});

test('restriction is inert for teams outside the selected scope', () => {
  const state = { selectedZones: ['left'], zoneRestrictionMode: 'keep-in', zoneRestrictionScope: 'home' };
  assert.deepEqual(constrainPlayerPositionForZones(state, { team: 'away' }, { x: 0.4, y: 0.8 }), { x: 0.4, y: 0.8 });
});
