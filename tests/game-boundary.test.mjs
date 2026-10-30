import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';

// The Game Mode separation rules from docs/GAME_MODE.md section 2.
const JS = resolve('js');
const GAME = join(JS, 'game');
const SHARED_PURE = new Set(['ball-physics.js', 'constants.js', 'geometry.js', 'formations.js', 'restarts.js', 'state.js']);

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const importsOf = (file) => [...readFileSync(file, 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"`;]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)]
  .map((match) => match[1] ?? match[2]);

test('coach modules reach Game Mode only through one lazy import in app.js', () => {
  for (const file of walk(JS).filter((path) => path.endsWith('.js') && !path.startsWith(GAME))) {
    const toGame = importsOf(file).filter((target) => target.includes('/game/'));
    if (relative(JS, file) === 'app.js') {
      assert.ok(toGame.every((target) => target === './game/game-mode.js'), `app.js may only import ./game/game-mode.js, found ${toGame}`);
      assert.ok(!/(^|\n)\s*import\b[^('"`]*from\s*['"]\.\/game\//.test(readFileSync(file, 'utf8')), 'the import must be dynamic (lazy), never static');
    } else {
      assert.deepEqual(toGame, [], `${relative(JS, file)} must not import from js/game`);
    }
  }
});

test('Game Mode modules import only each other and the shared pure modules, never Coach UI', () => {
  for (const file of walk(GAME).filter((path) => path.endsWith('.js'))) {
    for (const target of importsOf(file)) {
      if (!target.startsWith('.')) continue; // no bare packages are used in this repo
      const resolved = resolve(dirname(file), target);
      if (resolved.startsWith(`${GAME}/`) || resolved === GAME) continue;
      assert.equal(dirname(resolved), JS, `${relative(JS, file)} imports outside js: ${target}`);
      assert.ok(SHARED_PURE.has(resolved.slice(JS.length + 1)), `${relative(JS, file)} imports ${target}, which is not on the shared pure list`);
    }
  }
});

test('every Game Mode module is in the service worker shell so Game Mode works offline', () => {
  const shell = readFileSync('sw.js', 'utf8');
  for (const file of walk(GAME)) {
    assert.ok(shell.includes(`'./js/game/${relative(GAME, file)}'`), `sw.js APP_SHELL is missing ./js/game/${relative(GAME, file)}`);
  }
});
