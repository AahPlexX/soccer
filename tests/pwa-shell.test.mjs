import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(resolve(repoRoot, relativePath), 'utf8');

function extractAppShell(source) {
  const declaration = source.match(/const\s+APP_SHELL\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(declaration, 'sw.js must declare APP_SHELL as a literal array');
  return [...declaration[1].matchAll(/['"](\.\/[^'"]*)['"]/g)].map((match) => match[1]);
}

function localRefsFromHtml(source) {
  return [...source.matchAll(/(?:href|src)=["'](\.\/[^"']+)["']/g)].map((match) => match[1]);
}

test('service worker app shell references only repository files', () => {
  const entries = extractAppShell(read('sw.js'));
  assert.ok(entries.includes('./'), 'APP_SHELL must include the GitHub Pages scope root');

  for (const entry of entries) {
    if (entry === './') continue;
    assert.ok(existsSync(resolve(repoRoot, entry.slice(2))), `Cached app-shell file does not exist: ${entry}`);
  }
});

test('install-critical local HTML assets are precached', () => {
  const shell = new Set(extractAppShell(read('sw.js')));
  const htmlRefs = localRefsFromHtml(read('index.html'));
  const criticalRefs = htmlRefs.filter((ref) => /(?:\.css|\.js|\.webmanifest|apple-touch-icon\.png)$/.test(ref));

  for (const ref of criticalRefs) {
    assert.ok(shell.has(ref), `Install-critical asset is missing from APP_SHELL: ${ref}`);
  }
});

test('all static ES-module dependencies reachable from cached modules are precached', () => {
  const shell = new Set(extractAppShell(read('sw.js')));
  const queue = [...shell].filter((entry) => entry.startsWith('./js/') && entry.endsWith('.js'));
  const visited = new Set();

  while (queue.length) {
    const current = queue.pop();
    if (visited.has(current)) continue;
    visited.add(current);

    const source = read(current.slice(2));
    for (const match of source.matchAll(/(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"](\.\/[^'"]+)['"]/g)) {
      const dependency = `./js/${match[1].slice(2)}`;
      assert.ok(shell.has(dependency), `Static module dependency is missing from APP_SHELL: ${dependency}`);
      queue.push(dependency);
    }
  }
});
