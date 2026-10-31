import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, DEFAULT_BINDINGS, INPUT, createInput, frameToControl } from '../js/game/input-map.js';
import { createMenus, keyLabel } from '../js/game/menus.js';
import { DEFAULT_SETTINGS, effectiveBindings, normalizeSettings, rebind, withBindings } from '../js/game/settings.js';

// A just-enough DOM: elements with children, text, attributes and click listeners, and a document that makes them.
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.listeners = {}; this.className = ''; this.textContent = ''; this.hidden = false; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  click() { this.listeners.click?.(); }
  focus() { Node.focused = this; }
  all() { return [this, ...this.children.flatMap((child) => child.all())]; }
  querySelector(selector) { return selector === 'button' ? this.all().find((n) => n.tag === 'button' && n !== this) ?? null : null; }
}
globalThis.document = { createElement: (tag) => new Node(tag) };
const buttons = (layer) => layer.all().filter((n) => n.tag === 'button');
const press = (layer, label) => { const found = buttons(layer).find((n) => n.textContent.startsWith(label)); assert.ok(found, `button "${label}" exists`); found.click(); return found; };

function menus(overrides = {}) {
  const settings = normalizeSettings(null, ACTIONS);
  const calls = { settings: 0, bindings: [] };
  let current = effectiveBindings(DEFAULT_BINDINGS, settings);
  const api = createMenus(new Node('div'), {
    settings, onStart() {}, onResume() {}, onRestart() {}, onExit() {},
    onSettings() { calls.settings += 1; },
    bindings: () => current, defaultBindings: DEFAULT_BINDINGS,
    onBindings(next) { current = next; calls.bindings.push(next); },
    ...overrides,
  });
  return { api, settings, calls, get current() { return current; } };
}

test('rebind replaces an action\'s keys and takes the key from another action that keeps one', () => {
  const result = rebind(DEFAULT_BINDINGS, 'pass', 'KeyH');
  assert.equal(result.ok, true);
  assert.deepEqual(result.bindings.pass, ['KeyH']);
  assert.deepEqual(result.bindings.shoot, DEFAULT_BINDINGS.shoot);
  const steal = rebind(DEFAULT_BINDINGS, 'pass', 'KeyK'); // shoot has Enter too
  assert.equal(steal.ok, true);
  assert.deepEqual(steal.bindings.shoot, ['Enter']);
  assert.equal(Object.values(steal.bindings).flat().filter((c) => c === 'KeyK').length, 1, 'one key serves one action');
});

test('rebind refuses to strand an action, to move Escape, and bad input', () => {
  assert.equal(rebind(DEFAULT_BINDINGS, 'pass', 'KeyU').ok, false, 'U is the only switchDir key');
  assert.match(rebind(DEFAULT_BINDINGS, 'pass', 'Escape').reason, /Esc/);
  assert.equal(rebind(DEFAULT_BINDINGS, 'nope', 'KeyH').ok, false);
  assert.equal(rebind(DEFAULT_BINDINGS, 'pass', '').ok, false);
  assert.equal(rebind(DEFAULT_BINDINGS, 'pass', 'x'.repeat(40)).ok, false);
  const pause = rebind(DEFAULT_BINDINGS, 'pause', 'KeyH');
  assert.deepEqual(pause.bindings.pause, ['Escape', 'KeyH'], 'pause always keeps Escape');
});

test('every rebind keeps each action bound and every key unique, for any action and key', () => {
  for (const action of ACTIONS) {
    for (const code of ['KeyH', 'KeyJ', 'ArrowUp', 'Space', 'KeyU', 'Tab', 'Escape']) {
      const result = rebind(DEFAULT_BINDINGS, action, code);
      if (!result.ok) continue;
      assert.ok(Object.values(result.bindings).every((codes) => codes.length > 0), `${action}<-${code}`);
      const seen = new Map();
      for (const [name, codes] of Object.entries(result.bindings)) for (const c of codes) { assert.ok(!seen.has(c), `${c} used twice (${seen.get(c)}, ${name})`); seen.set(c, name); }
    }
  }
});

test('only changed actions are stored, and they survive a save/load round trip', () => {
  const bound = rebind(DEFAULT_BINDINGS, 'pass', 'KeyH').bindings;
  const stored = withBindings(DEFAULT_SETTINGS, DEFAULT_BINDINGS, bound);
  assert.deepEqual(Object.keys(stored.bindings), ['pass']);
  const loaded = normalizeSettings(JSON.parse(JSON.stringify(stored)), ACTIONS);
  assert.deepEqual(effectiveBindings(DEFAULT_BINDINGS, loaded), bound);
  assert.deepEqual(withBindings(DEFAULT_SETTINGS, DEFAULT_BINDINGS, DEFAULT_BINDINGS).bindings, {}, 'defaults store nothing');
});

test('setBindings swaps keys in place, drops held keys and leaves touch presses working', () => {
  const input = createInput();
  input.keyDown('KeyJ');
  input.setBindings(rebind(DEFAULT_BINDINGS, 'pass', 'KeyH').bindings);
  assert.equal(input.isHeld('pass'), false, 'nothing stays stuck after a change');
  assert.equal(input.keyDown('KeyJ'), false, 'the old key no longer does anything');
  assert.equal(input.keyDown('KeyH'), true);
  input.keyUp('KeyH');
  assert.equal(input.sample(0.05).pass, 'tap');
  input.press('shoot'); // a touch button goes through press(), not the key map
  assert.equal(input.isHeld('shoot'), true);
});

test('the tackle button with a side held makes a goalkeeper dive that way, and a field player slide', () => {
  const frame = (y) => ({ move: { x: 0, y }, sprint: false, pass: null, shoot: null, tackle: 'slide', switch: null, pause: false, charge: 0 });
  assert.deepEqual([frameToControl(frame(1), { role: 'GK' }).dive, frameToControl(frame(-1), { role: 'GK' }).dive], [1, -1]);
  assert.equal(frameToControl(frame(1), { role: 'GK' }).tackle, null, 'the dive replaces the tackle');
  assert.equal(frameToControl(frame(1), { role: 'CM' }).dive, 0);
  assert.equal(frameToControl(frame(1), { role: 'CM' }).tackle, 'slide');
  assert.equal(frameToControl(frame(INPUT.slideThreshold / 2), { role: 'GK' }).dive, 0, 'no direction, no dive');
  assert.equal(frameToControl(frame(1)).dive, 0, 'no player given');
});

test('key labels read as a person would', () => {
  assert.deepEqual(['KeyJ', 'ArrowUp', 'ShiftLeft', 'Space', 'Digit1'].map(keyLabel), ['J', 'Up', 'Shift Left', 'Space', '1']);
});

test('the settings screen changes each setting and tells the game', () => {
  const m = menus();
  m.api.showSettings(() => {});
  press(m.api.layer, 'Off'); // the first Off is Sound
  assert.equal(m.settings.sound, false);
  const sizes = buttons(m.api.layer).filter((n) => ['Small', 'Normal', 'Large'].includes(n.textContent));
  sizes.find((n) => n.textContent === 'Large').click();
  assert.equal(m.settings.touchScale, 1.25);
  assert.equal(sizes.find((n) => n.textContent === 'Large').attributes['aria-pressed'], 'true');
  assert.equal(sizes.find((n) => n.textContent === 'Normal').attributes['aria-pressed'], 'false');
  assert.equal(m.calls.settings, 2);
});

test('picking an action then pressing a key rebinds it; Escape cancels; a refused key explains why', () => {
  const m = menus();
  m.api.showKeys(() => {});
  assert.equal(m.api.handleKey({ code: 'KeyH' }), false, 'keys pass through when nothing is being picked');
  press(m.api.layer, 'Pass');
  assert.equal(m.api.handleKey({ code: 'KeyH' }), true, 'the next key is taken');
  assert.deepEqual(m.current.pass, ['KeyH']);
  assert.ok(buttons(m.api.layer).some((n) => n.textContent === 'Pass (tap) / Lob (hold): H'), 'the list shows the new key');

  press(m.api.layer, 'Shoot');
  m.api.handleKey({ code: 'Escape' });
  assert.deepEqual(m.current.shoot, DEFAULT_BINDINGS.shoot, 'Escape cancels without changing');
  assert.equal(m.calls.bindings.length, 1);

  press(m.api.layer, 'Shoot');
  m.api.handleKey({ code: 'KeyU' });
  const status = m.api.layer.all().find((n) => n.attributes.role === 'status');
  assert.match(status.textContent, /only one for switchDir/);

  press(m.api.layer, 'Reset to defaults');
  assert.deepEqual(m.current, DEFAULT_BINDINGS);
});

test('the controls help shows the keys in force, not the defaults', () => {
  const changed = rebind(DEFAULT_BINDINGS, 'pass', 'KeyH').bindings;
  const live = menus({ bindings: () => changed });
  live.api.showControls(() => {});
  assert.match(live.api.layer.all().map((n) => n.textContent).join('\n'), /H · A · Pass button/);
  const plain = menus();
  plain.api.showControls(() => {});
  assert.match(plain.api.layer.all().map((n) => n.textContent).join('\n'), /J or Space · A · Pass button/);
});
