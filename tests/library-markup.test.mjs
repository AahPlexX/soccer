import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');

const has = (pattern, message) => assert.match(html, pattern, message);

test('saved library exposes a WAI-style category tablist and panel', () => {
  has(/id="saved-tabs"[^>]*role="tablist"/, 'saved-tabs must be a tablist');
  has(/id="saved-list"[^>]*role="tabpanel"[^>]*aria-labelledby="saved-tab-all"/, 'saved list must be a labelled tabpanel');
  const tabs = [...html.matchAll(/role="tab"[^>]*data-library-filter="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(tabs, ['All', 'Formations', 'Positions', 'Plays', 'Drills', 'Rules']);
});

test('saved library keeps the compact select fallback', () => {
  has(/<select id="saved-filter">/, 'saved-filter select must remain available as the compact fallback');
});

test('saved preset metadata editor has title and category fields', () => {
  has(/<dialog id="preset-edit-dialog"[^>]*aria-labelledby="preset-edit-heading"/, 'metadata editor must be a labelled dialog');
  has(/id="preset-edit-title"[^>]*required/, 'metadata editor title must be required');
  has(/id="preset-edit-category"/, 'metadata editor must expose category selection');
});

test('library enhancement scripts and stylesheet are loaded', () => {
  has(/href="\.\/library\.css"/, 'library.css must be linked');
  has(/type="module" src="\.\/js\/library-ui\.js"/, 'library-ui.js must be loaded as a module');
});
