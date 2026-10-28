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
      let result;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error ?? new Error('IndexedDB operation failed'));
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    });
  } finally {
    db.close();
  }
}

function readFallback() {
  if (typeof localStorage === 'undefined') return [];
  const value = JSON.parse(localStorage.getItem(FALLBACK_PRESETS_KEY) ?? '[]');
  if (!Array.isArray(value)) throw new Error('Saved position storage is invalid.');
  return value;
}

function fallbackRead() {
  try { return readFallback(); } catch { return []; }
}

function fallbackWrite(presets) {
  if (!storageAvailable()) throw new Error('Unable to save: browser storage is unavailable.');
  localStorage.setItem(FALLBACK_PRESETS_KEY, JSON.stringify(presets));
}

export async function listPresets() {
  let databasePresets = [];
  try {
    const db = await openDatabase();
    try {
      databasePresets = await new Promise((resolve, reject) => {
        const tx = db.transaction('presets', 'readonly');
        const request = tx.objectStore('presets').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  } catch {
    // The fallback may contain saves made while IndexedDB was unavailable.
  }
  const merged = new Map(databasePresets.map((preset) => [preset.id, preset]));
  for (const preset of fallbackRead()) {
    if (preset.deleted === true) { merged.delete(preset.id); continue; }
    const existing = merged.get(preset.id);
    if (!existing || String(preset.updatedAt ?? '') >= String(existing.updatedAt ?? '')) merged.set(preset.id, preset);
  }
  return [...merged.values()].sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
}

async function storePreset(preset) {
  try {
    await withStore('readwrite', (store) => store.put(preset));
  } catch {
    const presets = fallbackRead().filter((item) => item.id !== preset.id);
    presets.push(preset);
    fallbackWrite(presets);
    return;
  }
  // Clear a previous fallback copy or tombstone after the database commit.
  let fallback;
  try { fallback = readFallback(); } catch {
    throw new Error('Position saved to the database, but fallback storage could not be checked.');
  }
  if (fallback.some((item) => item.id === preset.id)) {
    try { fallbackWrite(fallback.filter((item) => item.id !== preset.id)); } catch {
      throw new Error('Position saved to the database, but an older fallback copy could not be cleared.');
    }
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
  await storePreset(preset);
  return preset;
}

export async function deletePreset(id) {
  const fallback = fallbackRead();
  try {
    await withStore('readwrite', (store) => store.delete(id));
    if (fallback.some((item) => item.id === id)) fallbackWrite(fallback.filter((item) => item.id !== id));
  } catch {
    // A tombstone prevents an older database copy from reappearing after recovery.
    fallbackWrite([...fallback.filter((item) => item.id !== id), { id, deleted: true }]);
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

function validBackupState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state) || state.schemaVersion !== SCHEMA_VERSION) return false;
  const position = (item) => item && typeof item === 'object' && !Array.isArray(item) &&
    typeof item.id === 'string' && item.id && Number.isFinite(item.x) && Number.isFinite(item.y);
  const list = (name, validate) => state[name] === undefined ||
    (Array.isArray(state[name]) && state[name].every(validate));
  if (state.players !== undefined && (!Array.isArray(state.players) || state.players.length !== 14 ||
    !state.players.every((player) => position(player) && ['home', 'away'].includes(player.team) &&
      typeof player.role === 'string' && Number.isFinite(player.anchorX) && Number.isFinite(player.anchorY)))) return false;
  if (!list('balls', position) || (Array.isArray(state.balls) && !state.balls.length) ||
    !list('cones', position) || !list('miniGoals', position) ||
    !list('drawings', (drawing) => drawing && typeof drawing === 'object' &&
      Array.isArray(drawing.points) && drawing.points.every((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))) ||
    !list('selectedZones', (zone) => typeof zone === 'string')) return false;
  return ['homeFormation', 'awayFormation'].every((key) => state[key] === undefined || ['1-3-2-1', '1-2-3-1'].includes(state[key])) &&
    ['colors', 'simulation'].every((key) => state[key] === undefined || (state[key] && typeof state[key] === 'object' && !Array.isArray(state[key])));
}

export async function importBackup(text) {
  const payload = JSON.parse(text);
  if (payload?.schemaVersion !== SCHEMA_VERSION || !Array.isArray(payload.presets)) {
    throw new Error('This backup is not compatible with the current board schema.');
  }
  // Validate the entire library before writing anything, so a malformed backup cannot
  // introduce rows that break the library when it formats dates or sorts entries.
  if (!validBackupState(payload.currentState) || payload.presets.some((preset) =>
    !preset || typeof preset.id !== 'string' || !preset.id ||
    typeof preset.title !== 'string' || typeof preset.category !== 'string' ||
    typeof preset.updatedAt !== 'string' || !Number.isFinite(Date.parse(preset.updatedAt)) ||
    !validBackupState(preset.state))) {
    throw new Error('This backup contains invalid saved positions.');
  }
  for (const preset of payload.presets) await storePreset(preset);
  return normalizeState(payload.currentState);
}
