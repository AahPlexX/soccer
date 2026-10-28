import test from 'node:test';
import assert from 'node:assert/strict';
import { setupUpdates } from '../js/update.js';

class Target {
  constructor() { this.listeners = {}; }
  addEventListener(type, handler) { (this.listeners[type] ??= []).push(handler); }
  fire(type, event = {}) { for (const handler of this.listeners[type] ?? []) handler(event); }
}

function environment({ controlled = true, waiting = true, editorOpen = false } = {}) {
  const elements = Object.fromEntries(['update-dialog', 'update-version', 'update-error', 'update-accept', 'update-cancel'].map((id) => [id, new Target()]));
  const dialog = elements['update-dialog'];
  Object.assign(dialog, { open: false, showModal() { this.open = true; }, close() { this.open = false; } });
  const editor = new Target(); editor.open = editorOpen;
  const worker = new Target(); worker.state = 'installed'; worker.messages = [];
  worker.postMessage = (data, ports) => {
    worker.messages.push(data.type);
    if (data.type === 'GET_VERSION') queueMicrotask(() => ports[0].other.onmessage({ data: { version: '1.0.1' } }));
  };
  const sw = new Target();
  sw.controller = controlled ? { state: 'activated' } : null;
  const registration = new Target(); registration.waiting = waiting ? worker : null;
  registration.update = async () => {};
  sw.register = async () => registration;
  const doc = new Target(); doc.visibilityState = 'visible';
  doc.querySelector = (selector) => selector === 'dialog[open]:not(#update-dialog)' ? (editor.open ? editor : null) : elements[selector.slice(1)];
  doc.querySelectorAll = () => [editor];
  const win = new Target();
  let reloads = 0;
  const old = {};
  const globals = { navigator: { serviceWorker: sw }, document: doc, window: win, location: { reload: () => { reloads += 1; } },
    setInterval: () => 1,
    MessageChannel: class { constructor() { this.port1 = { close() {} }; this.port2 = { other: this.port1 }; } },
  };
  for (const [name, value] of Object.entries(globals)) { old[name] = Object.getOwnPropertyDescriptor(globalThis, name); Object.defineProperty(globalThis, name, { value, writable: true, configurable: true }); }
  return { elements, editor, worker, sw, registration, reloads: () => reloads, restore() { for (const [name, descriptor] of Object.entries(old)) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } } };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('a waiting update offers its version; Cancel leaves it waiting and Update saves before activation', async () => {
  const env = environment();
  try {
    let saved = 0;
    await setupUpdates(() => { saved += 1; return true; }, () => assert.fail('registration failed'));
    await settle();
    assert.equal(env.elements['update-dialog'].open, true);
    assert.equal(env.elements['update-version'].textContent, '1.0.1');
    env.elements['update-cancel'].fire('click');
    assert.equal(env.elements['update-dialog'].open, false);
    assert.equal(env.worker.messages.includes('SKIP_WAITING'), false);
    // A later page visit makes the same waiting update available again.
    env.restore();
    const next = environment();
    try {
      await setupUpdates(() => { saved += 1; return true; }, () => {});
      await settle();
      next.elements['update-accept'].fire('click');
      assert.equal(saved, 1);
      assert.ok(next.worker.messages.includes('SKIP_WAITING'));
      assert.equal(next.reloads(), 0);
      next.sw.controller = next.worker;
      next.sw.fire('controllerchange');
      assert.equal(next.reloads(), 1);
    } finally { next.restore(); }
  } finally { env.restore(); }
});

test('first install does not offer an update and editing postpones the offer', async () => {
  const first = environment({ controlled: false, waiting: false });
  try { await setupUpdates(() => true, () => {}); await settle(); assert.equal(first.elements['update-dialog'].open, false); } finally { first.restore(); }
  const edit = environment({ editorOpen: true });
  try {
    await setupUpdates(() => true, () => {}); await settle();
    assert.equal(edit.elements['update-dialog'].open, false);
    edit.editor.open = false; edit.editor.fire('close'); await settle();
    assert.equal(edit.elements['update-dialog'].open, true);
  } finally { edit.restore(); }
});

test('storage failure offers an explicit update without saving', async () => {
  const env = environment();
  try {
    await setupUpdates(() => false, () => {}); await settle();
    env.elements['update-accept'].fire('click');
    assert.equal(env.elements['update-error'].hidden, false);
    assert.equal(env.worker.messages.includes('SKIP_WAITING'), false);
    env.elements['update-accept'].fire('click');
    assert.ok(env.worker.messages.includes('SKIP_WAITING'));
  } finally { env.restore(); }
});
