export const PRESET_CATEGORIES = Object.freeze(['Formations', 'Positions', 'Plays', 'Drills', 'Rules']);
export const LIBRARY_FILTERS = Object.freeze(['All', ...PRESET_CATEGORIES]);

export function filterPresetsByCategory(presets, filter) {
  return filter === 'All' ? [...presets] : presets.filter((preset) => preset.category === filter);
}

export function nextLibraryFilter(current, key) {
  const index = LIBRARY_FILTERS.indexOf(current);
  if (key === 'Home') return LIBRARY_FILTERS[0];
  if (key === 'End') return LIBRARY_FILTERS[LIBRARY_FILTERS.length - 1];
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return current;
  const step = key === 'ArrowRight' ? 1 : -1;
  const safeIndex = index >= 0 ? index : 0;
  return LIBRARY_FILTERS[(safeIndex + step + LIBRARY_FILTERS.length) % LIBRARY_FILTERS.length];
}
