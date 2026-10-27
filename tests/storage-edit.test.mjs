import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../js/state.js';
import { listPresets, savePreset } from '../js/storage.js';

function installLocalStorage() {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
  return values;
}

test('editing preset metadata reuses the id and preserves its board snapshot', async () => {
  installLocalStorage();
  const state = createInitialState();
  state.players[0].x = 0.123;

  const original = await savePreset({ id: 'preset-edit-test', title: 'Old title', category: 'Positions', state });
  const edited = await savePreset({ id: original.id, title: 'Renamed drill', category: 'Drills', state: original.state });
  const presets = await listPresets();

  assert.equal(presets.length, 1);
  assert.equal(edited.id, original.id);
  assert.equal(presets[0].title, 'Renamed drill');
  assert.equal(presets[0].category, 'Drills');
  assert.equal(presets[0].state.players[0].x, 0.123);
  assert.equal(presets[0].state.simulation.running, false);
});
