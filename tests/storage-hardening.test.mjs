import test from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK_PRESETS_KEY } from '../js/constants.js';
import { createInitialState } from '../js/state.js';
import { deletePreset, importBackup, listPresets, savePreset } from '../js/storage.js';

function installLocalStorage() {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
  return values;
}

// Minimal asynchronous IndexedDB double: getAll/put/delete succeed on a microtask and then commit the transaction.
function installDatabase(initialRows = []) {
  let rows = [...initialRows];
  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          objectStoreNames: { contains: () => true },
          transaction() {
            const tx = {};
            const settle = (value) => {
              const operation = { result: value };
              queueMicrotask(() => { operation.onsuccess?.(); tx.oncomplete?.(); });
              return operation;
            };
            tx.objectStore = () => ({
              getAll: () => settle([...rows]),
              put: (row) => { rows = [...rows.filter((item) => item.id !== row.id), row]; return settle(row.id); },
              delete: (id) => { rows = rows.filter((item) => item.id !== id); return settle(undefined); },
            });
            return tx;
          },
          close() {},
        };
        request.onsuccess();
      });
      return request;
    },
  };
  return () => rows;
}

const presetRow = (id, extra = {}) => ({
  id, title: id, category: 'Positions', updatedAt: '2026-01-01T00:00:00.000Z', state: createInitialState(), ...extra,
});

test('the library survives corrupted fallback rows and repairs their metadata', async () => {
  const values = installLocalStorage();
  delete globalThis.indexedDB;
  values.set(FALLBACK_PRESETS_KEY, JSON.stringify([
    null,
    'junk',
    { id: '' },
    { id: 'gone', deleted: true },
    { id: 'repaired', title: 5, category: 'Legacy', updatedAt: 'not a date', state: createInitialState() },
    { id: 'blank-board', title: 'Blank', category: 'Drills', updatedAt: '2026-03-01T10:00:00.000Z', state: { junk: true } },
  ]));

  const presets = await listPresets();

  assert.deepEqual(presets.map((preset) => preset.id), ['blank-board', 'repaired']);
  const [blank, repaired] = presets;
  assert.equal(repaired.title, 'Untitled position');
  assert.equal(repaired.category, 'Positions');
  assert.equal(repaired.updatedAt, new Date(0).toISOString());
  assert.equal(blank.category, 'Drills');
  assert.deepEqual(blank.state, createInitialState());
  for (const preset of presets) assert.ok(Number.isFinite(Date.parse(preset.updatedAt)));
});

test('an unreadable fallback list is ignored instead of breaking the library', async () => {
  const values = installLocalStorage();
  delete globalThis.indexedDB;
  for (const raw of ['{not json', '{"an":"object"}']) {
    values.set(FALLBACK_PRESETS_KEY, raw);
    assert.deepEqual(await listPresets(), []);
  }
});

test('saving stores a detached, paused snapshot with repaired metadata', async () => {
  installLocalStorage();
  delete globalThis.indexedDB;
  const state = createInitialState();
  const originalX = state.players[0].x;
  state.simulation.running = true;

  const saved = await savePreset({ title: '  Corner shape  ', category: 'Legacy', state });
  state.players[0].x = 0.9;
  state.cones.push({ id: 'late-cone', x: 0.5, y: 0.5 });

  assert.equal(saved.title, 'Corner shape');
  assert.equal(saved.category, 'Positions');
  assert.equal(saved.state.simulation.running, false);
  assert.equal(saved.state.players[0].x, originalX);
  assert.deepEqual(saved.state.cones, []);

  const [listed] = await listPresets();
  assert.equal(listed.state.players[0].x, originalX);

  const untitled = await savePreset({ state: createInitialState() });
  assert.equal(untitled.title, 'Untitled position');
});

test('a file that is not JSON is rejected with a friendly message and writes nothing', async () => {
  installLocalStorage();
  delete globalThis.indexedDB;
  await assert.rejects(importBackup('{not json'), /not a valid board backup/);
  await assert.rejects(importBackup('42'), /not compatible/);
  assert.deepEqual(await listPresets(), []);
});

test('imported presets and the current board are stored normalized', async () => {
  installLocalStorage();
  delete globalThis.indexedDB;
  const currentState = createInitialState();
  currentState.simulation.running = true;
  const presetState = { ...createInitialState(), selectedZones: ['nowhere', 'left', 'left'] };

  const restored = await importBackup(JSON.stringify({
    schemaVersion: 1,
    currentState,
    presets: [presetRow('imported', { title: '  Kept  ', category: 'Legacy', state: presetState })],
  }));

  assert.equal(restored.simulation.running, false);
  const [imported] = await listPresets();
  assert.equal(imported.id, 'imported');
  assert.equal(imported.title, 'Kept');
  assert.equal(imported.category, 'Positions');
  assert.deepEqual(imported.state.selectedZones, ['left']);
});

test('deleting from the database also clears an older fallback copy', async () => {
  const values = installLocalStorage();
  const rows = installDatabase([presetRow('shared')]);
  values.set(FALLBACK_PRESETS_KEY, JSON.stringify([presetRow('shared'), presetRow('other')]));

  await deletePreset('shared');

  assert.deepEqual(rows(), []);
  assert.deepEqual(JSON.parse(values.get(FALLBACK_PRESETS_KEY)).map((row) => row.id), ['other']);
  assert.deepEqual((await listPresets()).map((preset) => preset.id), ['other']);
  delete globalThis.indexedDB;
});

test('a failed fallback cleanup after a database delete is reported accurately', async () => {
  const values = installLocalStorage();
  installDatabase([presetRow('shared')]);
  values.set(FALLBACK_PRESETS_KEY, JSON.stringify([presetRow('shared')]));
  const originalSet = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = (key, value) => {
    if (key === FALLBACK_PRESETS_KEY) throw new Error('quota');
    originalSet(key, value);
  };

  await assert.rejects(deletePreset('shared'), /deleted from the database, but an older fallback copy could not be cleared/);
  delete globalThis.indexedDB;
});
