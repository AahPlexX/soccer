import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function worker() {
  const handlers = {};
  const calls = { skip: 0, opened: [], added: [], matches: [] };
  const cache = {
    addAll: async (requests) => { calls.added.push(...requests); },
    match: async (request) => { calls.matches.push(request); return { from: 'active cache' }; },
    put: async () => {},
  };
  const self = {
    location: { origin: 'https://example.test' },
    addEventListener: (name, handler) => { handlers[name] = handler; },
    skipWaiting: () => { calls.skip += 1; return Promise.resolve(); },
    clients: { claim: async () => {} },
  };
  const caches = { open: async (name) => { calls.opened.push(name); return cache; }, keys: async () => [] };
  class Request { constructor(url, options) { this.url = url; this.cache = options.cache; } }
  vm.runInNewContext(source, { self, caches, Request, URL, Response, fetch: () => { throw new Error('unexpected fetch'); } });
  return { handlers, calls };
}

test('worker version matches release version and Pages stamps each deployment', () => {
  assert.equal(source.match(/const APP_VERSION = '([^']+)'/)[1], pkg.version);
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(workflow, /GITHUB_SHA.*GITHUB_RUN_ID.*GITHUB_RUN_ATTEMPT/);
});

test('install prepares an isolated shell without activating the update', async () => {
  const { handlers, calls } = worker();
  let task;
  handlers.install({ waitUntil: (promise) => { task = promise; } });
  await task;
  assert.equal(calls.skip, 0);
  assert.ok(calls.opened[0].includes(pkg.version));
  assert.ok(calls.added.length > 0);
  assert.ok(calls.added.every((request) => request.cache === 'reload'));
  assert.ok(calls.added.some((request) => request.url === './js/update.js'));
});

test('version response and explicit update activation use separate messages', () => {
  const { handlers, calls } = worker();
  let version;
  handlers.message({ data: { type: 'GET_VERSION' }, ports: [{ postMessage: (value) => { version = value.version; } }] });
  assert.equal(version, pkg.version);
  assert.equal(calls.skip, 0);
  handlers.message({ data: { type: 'SKIP_WAITING' }, ports: [], waitUntil: () => {} });
  assert.equal(calls.skip, 1);
});

test('fetch consults only this worker’s cache rather than a waiting deployment cache', async () => {
  const { handlers, calls } = worker();
  let response;
  handlers.fetch({ request: { method: 'GET', url: 'https://example.test/soccer/index.html' }, respondWith: (promise) => { response = promise; } });
  assert.equal((await response).from, 'active cache');
  assert.equal(calls.matches.length, 1);
  assert.match(calls.opened[0], /^u9-tactical-board-/);
});
