import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, normalizeState } from '../js/state.js';

test('zone restriction defaults off for our team', () => {
  const state = createInitialState();
  assert.equal(state.zoneRestrictionMode, 'off');
  assert.equal(state.zoneRestrictionScope, 'home');
});

test('older saves gain safe zone restriction defaults without a schema migration', () => {
  const legacy = createInitialState();
  delete legacy.zoneRestrictionMode;
  delete legacy.zoneRestrictionScope;
  const normalized = normalizeState(legacy);
  assert.equal(normalized.zoneRestrictionMode, 'off');
  assert.equal(normalized.zoneRestrictionScope, 'home');
});

test('invalid persisted zone restriction values fall back to safe defaults', () => {
  const candidate = { ...createInitialState(), zoneRestrictionMode: 'teleport', zoneRestrictionScope: 'everyone' };
  const normalized = normalizeState(candidate);
  assert.equal(normalized.zoneRestrictionMode, 'off');
  assert.equal(normalized.zoneRestrictionScope, 'home');
});
