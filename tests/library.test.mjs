import test from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY_FILTERS, PRESET_CATEGORIES, filterPresetsByCategory, nextLibraryFilter } from '../js/library.js';

test('library exposes PRD categories in order and keeps All as an extra view', () => {
  assert.deepEqual(PRESET_CATEGORIES, ['Formations', 'Positions', 'Plays', 'Drills', 'Rules']);
  assert.deepEqual(LIBRARY_FILTERS, ['All', ...PRESET_CATEGORIES]);
});

test('filter selects matching category and All preserves the full input order', () => {
  const source = [
    { id: 'a', category: 'Drills' },
    { id: 'b', category: 'Rules' },
    { id: 'c', category: 'Drills' },
  ];
  assert.deepEqual(filterPresetsByCategory(source, 'Drills').map((item) => item.id), ['a', 'c']);
  assert.deepEqual(filterPresetsByCategory(source, 'All').map((item) => item.id), ['a', 'b', 'c']);
  assert.equal(source.length, 3);
});

test('arrow cycling wraps filters and Home/End jump', () => {
  assert.equal(nextLibraryFilter('All', 'ArrowLeft'), 'Rules');
  assert.equal(nextLibraryFilter('Rules', 'ArrowRight'), 'All');
  assert.equal(nextLibraryFilter('Plays', 'Home'), 'All');
  assert.equal(nextLibraryFilter('Plays', 'End'), 'Rules');
});

test('irrelevant keys preserve the active filter', () => {
  assert.equal(nextLibraryFilter('Drills', 'ArrowDown'), 'Drills');
});
