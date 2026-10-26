import { AUTOSAVE_KEY, createLocalId, DB_NAME, DB_VERSION, FALLBACK_PRESETS_KEY, SCHEMA_VERSION } from './constants.js';
import { normalizeState } from './state.js';

function storageAvailable() {
  try {
    const key = '__u9_test__';
    localStorage.setItem(key, key);
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function loadAutosave() {
  if (!storageAvailable()) return null;
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveAutosave(state) {
  if (!storageAvailable()) return false;
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ ...state, simulation: { ...state.simulation, running: false } }));
    return true;
  } catch {
    return false;
  }
}

function openDatabase() {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('IndexedDB unavailable'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('presets')) db.createObjectStore('presets', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

async function withStore(mode, operation) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('presets', mode);
      const store = tx.objectStore('presets');
      const request = operation(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB operation failed'));
    });
  } finally {
    db.close();
  }
}

function fallbackRead() {
  if (!storageAvailable()) return [];
  try { return JSON.parse(localStorage.getItem(FALLBACK_PRESETS_KEY) ?? '[]'); } catch { return []; }
}

function fallbackWrite(presets) {
  if (!storageAvailable()) return;
  localStorage.setItem(FALLBACK_PRESETS_KEY, JSON.stringify(presets));
}

export async function listPresets() {
  try {
    const db = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('presets', 'readonly');
        const request = tx.objectStore('presets').getAll();
        request.onsuccess = () => resolve(request.result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  } catch {
    return fallbackRead();
  }
}

export async function savePreset({ id = createLocalId('preset'), title, category = 'Positions', state }) {
  const preset = {
    id,
    title: title.trim() || 'Untitled position',
    category,
    updatedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    state: { ...state, simulation: { ...state.simulation, running: false } },
  };
  try {
    await withStore('readwrite', (store) => store.put(preset));
  } catch {
    const presets = fallbackRead().filter((item) => item.id !== id);
    presets.push(preset);
    fallbackWrite(presets);
  }
  return preset;
}

export async function deletePreset(id) {
  try {
    await withStore('readwrite', (store) => store.delete(id));
  } catch {
    fallbackWrite(fallbackRead().filter((item) => item.id !== id));
  }
}

export async function exportBackup(currentState) {
  const payload = {
    product: 'AahPlexX/soccer',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    currentState: { ...currentState, simulation: { ...currentState.simulation, running: false } },
    presets: await listPresets(),
  };
  return JSON.stringify(payload, null, 2);
}

export async function importBackup(text) {
  const payload = JSON.parse(text);
  if (payload?.schemaVersion !== SCHEMA_VERSION || !Array.isArray(payload.presets)) {
    throw new Error('This backup is not compatible with the current board schema.');
  }
  for (const preset of payload.presets) {
    if (!preset?.id || !preset?.state) continue;
    try { await withStore('readwrite', (store) => store.put(preset)); }
    catch {
      const current = fallbackRead().filter((item) => item.id !== preset.id);
      current.push(preset);
      fallbackWrite(current);
    }
  }
  return normalizeState(payload.currentState);
}
