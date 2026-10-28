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

test('save reports failure when neither storage backend is available', async () => {
  delete globalThis.indexedDB;
  delete globalThis.localStorage;
  await assert.rejects(savePreset({ title: 'Unsaved', state: createInitialState() }), /storage is unavailable/);
});

test('invalid backup is rejected before any preset is written', async () => {
  installLocalStorage();
  const { importBackup } = await import('../js/storage.js');
  const payload = { schemaVersion: 1, currentState: createInitialState(), presets: [
    { id: 'valid', title: 'Valid', category: 'Positions', updatedAt: new Date().toISOString(), state: createInitialState() },
    { id: 'bad', state: createInitialState() },
  ] };
  await assert.rejects(importBackup(JSON.stringify(payload)), /invalid saved positions/);
  assert.deepEqual(await listPresets(), []);
});

test('fallback tombstones prevent deleted database presets from reappearing', async () => {
  installLocalStorage();
  const { deletePreset } = await import('../js/storage.js');
  const oldPreset = { id: 'old', title: 'Old', category: 'Positions', updatedAt: new Date().toISOString(), state: createInitialState() };
  delete globalThis.indexedDB;
  await deletePreset('old');
  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          transaction() { return { objectStore() { return { getAll() { const result = { result: [oldPreset] }; queueMicrotask(() => result.onsuccess()); return result; } }; } }; },
          close() {},
        };
        request.onsuccess();
      });
      return request;
    },
  };
  assert.deepEqual(await listPresets(), []);
  delete globalThis.indexedDB;
});

test('a failed fallback cleanup is reported even when IndexedDB commits', async () => {
  const { FALLBACK_PRESETS_KEY } = await import('../js/constants.js');
  for (const stale of [{ id: 'same', deleted: true }, { id: 'same', title: 'Stale', updatedAt: '9999-01-01T00:00:00.000Z' }]) {
    const values = installLocalStorage();
    values.set(FALLBACK_PRESETS_KEY, JSON.stringify([stale]));
    const originalSet = globalThis.localStorage.setItem;
    globalThis.localStorage.setItem = (key, value) => {
      if (key === FALLBACK_PRESETS_KEY) throw new Error('quota');
      originalSet(key, value);
    };
    globalThis.indexedDB = {
      open() {
        const request = {};
        queueMicrotask(() => {
          request.result = {
            transaction() {
              const tx = { objectStore() { return { put() { const result = {}; queueMicrotask(() => { result.onsuccess(); tx.oncomplete(); }); return result; } }; } };
              return tx;
            },
            close() {},
          };
          request.onsuccess();
        });
        return request;
      },
    };
    await assert.rejects(savePreset({ id: 'same', title: 'New', state: createInitialState() }), /fallback copy could not be cleared/);
    delete globalThis.indexedDB;
  }
});

test('backup rejects malformed board objects before importing presets', async () => {
  installLocalStorage();
  delete globalThis.indexedDB;
  const { importBackup } = await import('../js/storage.js');
  const valid = createInitialState();
  const preset = { id: 'good', title: 'Good', category: 'Positions', updatedAt: new Date().toISOString(), state: valid };
  for (const invalid of [
    { ...valid, players: Array(14).fill(null) },
    { ...valid, balls: [null] },
    { ...valid, drawings: [{ points: [null] }] },
  ]) {
    await assert.rejects(importBackup(JSON.stringify({ schemaVersion: 1, currentState: invalid, presets: [preset] })), /invalid saved positions/);
    await assert.rejects(importBackup(JSON.stringify({ schemaVersion: 1, currentState: valid, presets: [{ ...preset, state: invalid }] })), /invalid saved positions/);
    assert.deepEqual(await listPresets(), []);
  }
});
