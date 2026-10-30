// Game Mode settings: a small versioned schema that is validated on load and never throws, stored under its own localStorage key
// so it can never touch the coach board's saved state. Pure: the storage object is passed in.

export const SETTINGS_KEY = 'u9-game-settings';
export const SETTINGS_VERSION = 1;

export const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: SETTINGS_VERSION,
  difficulty: 'normal',
  halfMinutes: 2,
  sound: true,
  haptics: true,
  touchScale: 1,
  radar: true,
  bindings: {}, // action -> array of key codes, merged over the defaults
});

const DIFFICULTY_KEYS = ['easy', 'normal', 'hard'];
const HALF_MINUTES = [1, 2, 3];

const clampNumber = (value, low, high, fallback) => (Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback);

/** A valid settings object from anything (a parsed save, a partial object, junk). Unknown keys are dropped. */
export function normalizeSettings(raw, knownActions = []) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const bindings = {};
  if (source.bindings && typeof source.bindings === 'object' && !Array.isArray(source.bindings)) {
    for (const action of knownActions) {
      const codes = source.bindings[action];
      if (Array.isArray(codes)) {
        const clean = [...new Set(codes.filter((code) => typeof code === 'string' && code.length > 0 && code.length <= 32))].slice(0, 4);
        if (clean.length > 0) bindings[action] = clean;
      }
    }
  }
  return {
    schemaVersion: SETTINGS_VERSION,
    difficulty: DIFFICULTY_KEYS.includes(source.difficulty) ? source.difficulty : DEFAULT_SETTINGS.difficulty,
    halfMinutes: HALF_MINUTES.includes(source.halfMinutes) ? source.halfMinutes : DEFAULT_SETTINGS.halfMinutes,
    sound: typeof source.sound === 'boolean' ? source.sound : DEFAULT_SETTINGS.sound,
    haptics: typeof source.haptics === 'boolean' ? source.haptics : DEFAULT_SETTINGS.haptics,
    touchScale: clampNumber(source.touchScale, 0.8, 1.4, DEFAULT_SETTINGS.touchScale),
    radar: typeof source.radar === 'boolean' ? source.radar : DEFAULT_SETTINGS.radar,
    bindings,
  };
}

/** The key bindings in force: the defaults with the player's own choices replacing whole actions. */
export function effectiveBindings(defaults, settings) {
  return Object.fromEntries(Object.entries(defaults).map(([action, codes]) => [action, settings.bindings?.[action] ?? codes]));
}

/** Loads settings from a Storage-like object; any failure (missing, blocked, corrupt) gives the defaults. */
export function loadSettings(storage, knownActions = []) {
  try {
    const text = storage?.getItem(SETTINGS_KEY);
    return normalizeSettings(text ? JSON.parse(text) : null, knownActions);
  } catch {
    return normalizeSettings(null, knownActions);
  }
}

/** Saves settings; returns false (and changes nothing) if storage is unavailable or full. */
export function saveSettings(storage, settings, knownActions = []) {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings, knownActions)));
    return true;
  } catch {
    return false;
  }
}
