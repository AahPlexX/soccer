import {
  AUTOSAVE_KEY, createLocalId, DB_NAME, DB_VERSION, FALLBACK_PRESETS_KEY, FORMATION_NAMES, SCHEMA_VERSION, TEAM_IDS,
} from './constants.js';
import { PRESET_CATEGORIES } from './library.js';
import { normalizeState, snapshotState } from './state.js';

const PRESET_STORE = 'presets';
const PLAYERS_PER_TEAM = 7;
const UNTITLED_PRESET = 'Untitled position';
const DEFAULT_CATEGORY = 'Positions';
const EPOCH_TIMESTAMP = new Date(0).toISOString();

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const isTombstone = (preset) => isRecord(preset) && isNonEmptyString(preset.id) && preset.deleted === true;

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

// ---------------------------------------------------------------------------------------------------------------------
// Preset metadata. Every preset that leaves this module (listed, saved, or imported) passes through these helpers, so
// the library UI can always format its date, match its category tab, and load its board without guarding itself.
// ---------------------------------------------------------------------------------------------------------------------

function presetTitle(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : UNTITLED_PRESET;
}

function presetCategory(value) {
  return PRESET_CATEGORIES.includes(value) ? value : DEFAULT_CATEGORY;
}

function presetTimestamp(value) {
  const time = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : EPOCH_TIMESTAMP;
}

/** Repairs a stored preset row for display and loading, or returns null when the row has no usable id. */
function sanitizeStoredPreset(preset) {
  if (!isRecord(preset) || !isNonEmptyString(preset.id)) return null;
  return {
    ...preset,
    title: presetTitle(preset.title),
    category: presetCategory(preset.category),
    updatedAt: presetTimestamp(preset.updatedAt),
    schemaVersion: SCHEMA_VERSION,
    state: normalizeState(preset.state),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Autosave (localStorage, synchronous, best effort).
// ---------------------------------------------------------------------------------------------------------------------

export function loadAutosave() {
  if (!storageAvailable()) return null;
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

// Autosave runs on every committed change, so it stays a cheap serialization; normalizeState() runs on load instead.
export function saveAutosave(state) {
  if (!storageAvailable()) return false;
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ ...state, simulation: { ...state.simulation, running: false } }));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// IndexedDB preset store.
// ---------------------------------------------------------------------------------------------------------------------

function openDatabase() {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('IndexedDB unavailable'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PRESET_STORE)) db.createObjectStore(PRESET_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

/** Runs a write and resolves only after the transaction commits. */
async function withStore(mode, operation) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PRESET_STORE, mode);
      const store = tx.objectStore(PRESET_STORE);
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

/** Reads every database row; a read needs no commit, so it resolves as soon as the request succeeds. */
async function readDatabasePresets() {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(PRESET_STORE, 'readonly').objectStore(PRESET_STORE).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
    });
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// localStorage fallback: holds saves made while IndexedDB was unavailable, plus tombstones for deletions that could not
// reach the database, so an older database copy cannot reappear after IndexedDB recovers.
// ---------------------------------------------------------------------------------------------------------------------

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

const fallbackHas = (rows, id) => rows.some((item) => isRecord(item) && item.id === id);
const fallbackWithout = (rows, id) => rows.filter((item) => !isRecord(item) || item.id !== id);

// ---------------------------------------------------------------------------------------------------------------------
// Public preset API.
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Lists saved presets, newest first. Database rows and fallback rows are merged by id (the newer copy wins, a fallback
 * tombstone removes the id). Rows without a usable id are skipped and the rest are repaired by sanitizeStoredPreset(),
 * so one corrupted row can never stop the library from opening.
 */
export async function listPresets() {
  let databasePresets = [];
  try {
    databasePresets = await readDatabasePresets();
  } catch {
    // The fallback may contain saves made while IndexedDB was unavailable.
  }
  const merged = new Map();
  for (const row of databasePresets) {
    const preset = sanitizeStoredPreset(row);
    if (preset) merged.set(preset.id, preset);
  }
  for (const row of fallbackRead()) {
    if (isTombstone(row)) { merged.delete(row.id); continue; }
    const preset = sanitizeStoredPreset(row);
    if (!preset) continue;
    const existing = merged.get(preset.id);
    if (!existing || preset.updatedAt >= existing.updatedAt) merged.set(preset.id, preset);
  }
  return [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function storePreset(preset) {
  try {
    await withStore('readwrite', (store) => store.put(preset));
  } catch {
    const presets = fallbackWithout(fallbackRead(), preset.id);
    presets.push(preset);
    fallbackWrite(presets);
    return;
  }
  // Clear a previous fallback copy or tombstone after the database commit.
  let fallback;
  try { fallback = readFallback(); } catch {
    throw new Error('Position saved to the database, but fallback storage could not be checked.');
  }
  if (fallbackHas(fallback, preset.id)) {
    try { fallbackWrite(fallbackWithout(fallback, preset.id)); } catch {
      throw new Error('Position saved to the database, but an older fallback copy could not be cleared.');
    }
  }
}

/**
 * Saves (or, with an existing id, overwrites) a preset. The board is stored as a detached, normalized snapshot with the
 * simulation paused, so later edits to the live board never leak into the saved copy.
 */
export async function savePreset({ id = createLocalId('preset'), title, category = DEFAULT_CATEGORY, state }) {
  const preset = {
    id,
    title: presetTitle(title),
    category: presetCategory(category),
    updatedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    state: normalizeState(snapshotState(state)),
  };
  await storePreset(preset);
  return preset;
}

export async function deletePreset(id) {
  const fallback = fallbackRead();
  try {
    await withStore('readwrite', (store) => store.delete(id));
  } catch {
    // A tombstone prevents an older database copy from reappearing after recovery.
    fallbackWrite([...fallbackWithout(fallback, id), { id, deleted: true }]);
    return;
  }
  if (fallbackHas(fallback, id)) {
    try { fallbackWrite(fallbackWithout(fallback, id)); } catch {
      throw new Error('Position deleted from the database, but an older fallback copy could not be cleared.');
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Backup export/import.
// ---------------------------------------------------------------------------------------------------------------------

export async function exportBackup(currentState) {
  const payload = {
    product: 'AahPlexX/soccer',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    currentState: normalizeState(snapshotState(currentState)),
    presets: await listPresets(),
  };
  return JSON.stringify(payload, null, 2);
}

// Import is deliberately stricter than normalizeState(): a backup with structurally broken boards is rejected outright
// rather than silently repaired, so the coach learns the file is damaged before anything is written.
function validBackupState(state) {
  if (!isRecord(state) || state.schemaVersion !== SCHEMA_VERSION) return false;
  const position = (item) => isRecord(item) && isNonEmptyString(item.id) && Number.isFinite(item.x) && Number.isFinite(item.y);
  const point = (item) => isRecord(item) && Number.isFinite(item.x) && Number.isFinite(item.y);
  const list = (name, validate) => state[name] === undefined || (Array.isArray(state[name]) && state[name].every(validate));

  if (state.players !== undefined && (!Array.isArray(state.players) ||
    state.players.length !== PLAYERS_PER_TEAM * TEAM_IDS.length ||
    !state.players.every((player) => position(player) && TEAM_IDS.includes(player.team) &&
      typeof player.role === 'string' && Number.isFinite(player.anchorX) && Number.isFinite(player.anchorY)))) return false;
  if (!list('balls', position) || (Array.isArray(state.balls) && !state.balls.length) ||
    !list('cones', position) || !list('miniGoals', position) ||
    !list('drawings', (drawing) => isRecord(drawing) && Array.isArray(drawing.points) && drawing.points.every(point)) ||
    !list('selectedZones', (zone) => typeof zone === 'string')) return false;
  return ['homeFormation', 'awayFormation'].every((key) => state[key] === undefined || FORMATION_NAMES.includes(state[key])) &&
    ['colors', 'simulation'].every((key) => state[key] === undefined || isRecord(state[key]));
}

function validBackupPreset(preset) {
  return isRecord(preset) && isNonEmptyString(preset.id) &&
    typeof preset.title === 'string' && typeof preset.category === 'string' &&
    typeof preset.updatedAt === 'string' && Number.isFinite(Date.parse(preset.updatedAt)) &&
    validBackupState(preset.state);
}

/**
 * Imports a backup: the whole file is validated before anything is written, then each preset is stored normalized
 * (repaired title/category/timestamp, normalized board). Returns the normalized current board for the caller to load.
 */
export async function importBackup(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('This file is not a valid board backup.');
  }
  if (!isRecord(payload) || payload.schemaVersion !== SCHEMA_VERSION || !Array.isArray(payload.presets)) {
    throw new Error('This backup is not compatible with the current board schema.');
  }
  if (!validBackupState(payload.currentState) || !payload.presets.every(validBackupPreset)) {
    throw new Error('This backup contains invalid saved positions.');
  }
  for (const preset of payload.presets) {
    await storePreset({
      id: preset.id,
      title: presetTitle(preset.title),
      category: presetCategory(preset.category),
      updatedAt: presetTimestamp(preset.updatedAt),
      schemaVersion: SCHEMA_VERSION,
      state: normalizeState(preset.state),
    });
  }
  return normalizeState(payload.currentState);
}
