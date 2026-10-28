import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The service worker precaches APP_SHELL with cache.addAll(), which rejects (and the whole install fails) if any file
// 404s. The Pages workflow publishes only the files and folders it copies, so every cached path must be one of them.
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');

const shell = [...sw.match(/const APP_SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'(\.[^']*)'/g)].map((match) => match[1]);
const copyLines = workflow.split('\n').filter((line) => /^\s*cp\s/.test(line));
const copiedFiles = copyLines.filter((line) => !line.includes('-R')).flatMap((line) => line.trim().split(/\s+/).slice(1, -1));
const copiedDirectories = copyLines.filter((line) => line.includes('-R')).flatMap((line) => line.trim().split(/\s+/).slice(2, -1));

function isPublished(path) {
  if (path === './') return true;
  const [first, ...rest] = path.replace(/^\.\//, '').split('/');
  if (rest.length) return copiedDirectories.includes(first);
  return copiedFiles.some((entry) => entry === first || (entry.startsWith('./*.') && first.endsWith(entry.slice(3))) || (entry.startsWith('*.') && first.endsWith(entry.slice(1))));
}

test('the app shell list was parsed', () => {
  assert.ok(shell.length > 20 && shell.includes('./js/app.js'));
  assert.ok(copiedDirectories.includes('js') && copiedFiles.includes('sw.js'));
});

test('every path the service worker precaches is published by the Pages workflow', () => {
  const missing = shell.filter((path) => !isPublished(path));
  assert.deepEqual(missing, [], `cached but not copied into the Pages artifact: ${missing.join(', ')}`);
});
