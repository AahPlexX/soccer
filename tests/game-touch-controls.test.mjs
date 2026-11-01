import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA, screenToWorldMove, worldHeadingToScreen } from '../js/game/camera.js';
import { bestPassTarget } from '../js/game/ball-control.js';
import { ACTIONS, DEFAULT_BINDINGS, createInput, shapeStick, stickFromDrag } from '../js/game/input-map.js';
import { createMatch, drainEvents, playerById, stepMatch, teamOf } from '../js/game/match.js';
import { createMenus } from '../js/game/menus.js';
import { effectiveBindings, normalizeSettings } from '../js/game/settings.js';
import { TOUCH_HELP, TOUCH_TIPS, mountTouchControls } from '../js/game/touch-controls.js';

// A just-enough DOM: elements with children, classes, style, attributes and listeners, and events dispatched by hand.
class Node {
  constructor(tag) {
    this.tag = tag; this.children = []; this.attributes = {}; this.listeners = {}; this.className = ''; this.textContent = ''; this.hidden = false; this.style = { props: {}, setProperty(k, v) { this.props[k] = v; } };
    this.classList = { add: (c) => { if (!this.has(c)) this.className = `${this.className} ${c}`.trim(); }, remove: (c) => { this.className = this.className.split(' ').filter((x) => x !== c).join(' '); }, contains: (c) => this.has(c) };
    this.captured = [];
  }
  has(c) { return this.className.split(' ').includes(c); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  remove() { this.removed = true; }
  setAttribute(name, value) { this.attributes[name] = value; }
  setPointerCapture(id) { this.captured.push(id); }
  focus() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 360, height: 360 }; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  fire(type, event = {}) { for (const fn of this.listeners[type] ?? []) fn({ pointerId: 1, clientX: 0, clientY: 0, timeStamp: 0, target: this, preventDefault() {}, ...event }); }
  all() { return [this, ...this.children.flatMap((child) => child.all())]; }
  find(className) { return this.all().find((n) => n.has(className)); }
  querySelector(selector) { return selector === 'button' ? this.all().find((n) => n.tag === 'button' && n !== this) ?? null : null; }
}
globalThis.document = { createElement: (tag) => new Node(tag) };

function recorder() {
  const calls = [];
  return { calls, press: (n) => calls.push(['press', n]), release: (n) => calls.push(['release', n]), setStick: (x, y) => calls.push(['stick', x, y]), swipeSwitch: (d) => calls.push(['swipe', d]) };
}

test('a thumb reaches full speed at about two thirds of the stick travel and keeps its direction', () => {
  assert.deepEqual(shapeStick({ x: 0, y: 0 }), { x: 0, y: 0 });
  const half = shapeStick({ x: 0.31, y: 0 });
  assert.ok(Math.abs(half.x - 0.5) < 1e-9, 'half of the full-speed travel is half speed');
  for (const magnitude of [0.62, 0.8, 1]) assert.ok(Math.abs(Math.hypot(...Object.values(shapeStick({ x: magnitude, y: 0 }))) - 1) < 1e-9, `${magnitude} is full speed`);
  for (let angle = 0; angle < Math.PI * 2; angle += 0.37) {
    for (const magnitude of [0.1, 0.4, 0.9]) {
      const out = shapeStick({ x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude });
      assert.ok(Math.abs(Math.atan2(out.y, out.x) - Math.atan2(Math.sin(angle), Math.cos(angle))) < 1e-9, 'direction unchanged');
      assert.ok(Math.hypot(out.x, out.y) <= 1 + 1e-9);
    }
  }
  assert.equal(stickFromDrag(3, 0, 56).x, 0, 'the dead zone still removes jitter before shaping');
});

test('a direction pushed on the screen moves the player that way on the screen', () => {
  assert.deepEqual(screenToWorldMove({ x: 0, y: 0 }), { x: 0, y: 0 });
  for (let angle = 0; angle < Math.PI * 2; angle += 0.21) {
    for (const length of [0.3, 1]) {
      const push = { x: Math.cos(angle) * length, y: Math.sin(angle) * length };
      const world = screenToWorldMove(push);
      assert.ok(Math.abs(Math.hypot(world.x, world.y) - length) < 1e-9, 'a half push stays a half push');
      // The pitch is drawn with y squashed by CAMERA.tilt; the result must point along the pushed direction on the screen.
      const onScreen = { x: world.x, y: world.y * CAMERA.tilt };
      assert.ok(Math.abs(onScreen.x * push.y - onScreen.y * push.x) < 1e-9, `angle ${angle.toFixed(2)} stays on the same line`);
      assert.ok(onScreen.x * push.x + onScreen.y * push.y > 0, 'and the same way');
    }
  }
  const diagonal = screenToWorldMove({ x: 1, y: 1 });
  assert.ok(diagonal.y > diagonal.x, 'a screen diagonal needs more world y than x');
});

test('a sprite faces the direction it appears to move on the screen', () => {
  assert.equal(worldHeadingToScreen(0), 0);
  assert.ok(Math.abs(worldHeadingToScreen(Math.PI / 2) - Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(Math.abs(worldHeadingToScreen(Math.PI)) - Math.PI) < 1e-12);
  const world = screenToWorldMove({ x: 1, y: 1 });
  assert.ok(Math.abs(worldHeadingToScreen(Math.atan2(world.y, world.x)) - Math.PI / 4) < 1e-9, 'moving at 45 degrees on screen faces 45 degrees');
});

test('keys, the stick and swipes are mapped to the world only when asked', () => {
  const input = createInput();
  input.keyDown('ArrowRight'); input.keyDown('ArrowDown');
  const plain = input.sample(0.01);
  assert.ok(Math.abs(plain.move.x - plain.move.y) < 1e-9, 'without a mapping the move is untouched');
  const mapped = input.sample(0.01, 0, screenToWorldMove);
  assert.ok(mapped.move.y > mapped.move.x, 'with the mapping a down-right key press is steeper in the world');
  assert.ok(Math.abs(Math.hypot(mapped.move.x, mapped.move.y) - 1) < 1e-9);
  input.reset();
  input.swipeSwitch({ x: 0, y: 1 });
  const swiped = input.sample(0.01, 0, screenToWorldMove).switch;
  assert.ok(Math.abs(swiped.dir.x) < 1e-12 && Math.abs(swiped.dir.y - 1) < 1e-12, 'a straight swipe stays straight');
});

test('touch layout: a labelled ring is always there, and every button is under the right thumb', () => {
  const input = recorder();
  const touch = mountTouchControls(new Node('div'), input, {});
  const base = touch.layer.find('g-stick-base');
  assert.ok(base, 'the joystick ring exists before any touch');
  assert.equal(base.hidden, false);
  assert.equal(base.find('g-stick-label').textContent, 'MOVE');
  assert.ok(base.style.left && base.style.top, 'and rests at a position');
  assert.equal(base.has('g-active'), false);
  const cluster = touch.layer.find('g-cluster');
  const names = cluster.children.map((b) => b.attributes['aria-label']).sort();
  assert.deepEqual(names, ['pass', 'shoot', 'sprint', 'switch', 'tackle'], 'Switch is with the other buttons, not under the steering thumb');
  assert.equal(touch.layer.find('g-zone-left').all().some((n) => n.attributes['aria-label'] === 'switch'), false);
  touch.destroy();
});

test('the stick floats under the finger, runs at full speed past two thirds, and rests when released', () => {
  const input = recorder();
  const touch = mountTouchControls(new Node('div'), input, { scale: 1 });
  const zone = touch.layer.find('g-zone-left');
  const base = touch.layer.find('g-stick-base');
  zone.fire('pointerdown', { clientX: 100, clientY: 200 });
  assert.ok(base.has('g-active'));
  assert.equal(base.style.left, '100px');
  assert.equal(base.style.top, '200px');
  zone.fire('pointermove', { clientX: 100 + 50, clientY: 200 });
  const [, x, y] = input.calls.filter((c) => c[0] === 'stick').at(-1);
  assert.ok(Math.abs(x - 1) < 1e-9 && Math.abs(y) < 1e-9, `a 50 px push of a 56 px stick is full speed (${x}, ${y})`);
  zone.fire('pointermove', { clientX: 100, clientY: 200 + 8 });
  assert.deepEqual(input.calls.filter((c) => c[0] === 'stick').at(-1), ['stick', 0, 0], 'a tiny wobble is ignored');
  zone.fire('pointermove', { pointerId: 2, clientX: 300, clientY: 300 });
  assert.deepEqual(input.calls.filter((c) => c[0] === 'stick').at(-1), ['stick', 0, 0], 'another finger does not steer');
  zone.fire('pointerup');
  assert.deepEqual(input.calls.at(-1), ['stick', 0, 0]);
  assert.equal(base.has('g-active'), false);
  assert.notEqual(base.style.left, '100px', 'the ring went back to its resting place');
  touch.destroy();
});

test('buttons: hold buttons press and release with the finger, tap buttons fire once', () => {
  const input = recorder();
  const touch = mountTouchControls(new Node('div'), input, { haptics: false });
  const button = (name) => touch.layer.find('g-cluster').children.find((b) => b.attributes['aria-label'] === name);
  button('pass').fire('pointerdown'); button('pass').fire('pointerup');
  button('tackle').fire('pointerdown'); button('tackle').fire('pointerup');
  assert.deepEqual(input.calls, [['press', 'pass'], ['release', 'pass'], ['press', 'tackle'], ['release', 'tackle']]);
  assert.ok(button('shoot').all().some((n) => n.has('g-hint')), 'every button carries a hint that shows on the first run');
  touch.destroy();
});

test('the first-run tips explain every control, and go away on Got it, on the first pass, or after a while', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    for (const dismiss of ['button', 'pass', 'timeout']) {
      const input = recorder();
      let done = 0;
      const touch = mountTouchControls(new Node('div'), input, { onTipsDone: () => { done += 1; } });
      const tips = touch.layer.find('g-tips');
      assert.equal(tips.hidden, true, 'hidden until asked');
      touch.showTips();
      assert.equal(tips.hidden, false);
      assert.ok(touch.layer.has('g-hints'), 'buttons show their hints');
      const text = tips.all().map((n) => n.textContent).join(' ');
      for (const [name] of TOUCH_HELP) assert.ok(text.includes(name), `the card mentions ${name}`);
      assert.deepEqual(TOUCH_TIPS.map(([name]) => name), TOUCH_HELP.map(([name]) => name), 'the card and the Controls screen cover the same controls');
      assert.ok(TOUCH_TIPS.every(([, line]) => line.length <= 32), 'each card line is short enough for the compact card');
      assert.ok(text.includes('yellow marker'), 'it says which player you control');
      if (dismiss === 'button') tips.find('g-tips-ok').fire('click');
      else if (dismiss === 'pass') touch.layer.find('g-pass').fire('pointerdown');
      else mock.timers.tick(15000);
      assert.equal(tips.hidden, true, `dismissed by ${dismiss}`);
      assert.equal(touch.layer.has('g-hints'), false);
      assert.equal(done, 1, 'the game is told exactly once');
      touch.layer.find('g-tips-ok').fire('click');
      assert.equal(done, 1, 'a second dismissal does nothing');
      touch.destroy();
    }
  } finally { mock.timers.reset(); }
});

test('on a touch device the Controls screen shows touch help, not keyboard keys, and the tips can be asked for again', () => {
  const settings = normalizeSettings({ tipsSeen: true }, ACTIONS);
  let saved = 0;
  const menus = createMenus(new Node('div'), { settings, onStart() {}, onResume() {}, onRestart() {}, onExit() {}, onSettings() { saved += 1; }, bindings: () => effectiveBindings(DEFAULT_BINDINGS, settings), defaultBindings: DEFAULT_BINDINGS, onBindings() {}, touch: true });
  menus.showControls(() => {});
  const text = menus.layer.all().map((n) => n.textContent).join('\n');
  assert.match(text, /left thumb/);
  assert.doesNotMatch(text, /Arrow keys|Space|WASD/);
  assert.equal(menus.layer.all().some((n) => n.textContent === 'Change keys'), false, 'no key rebinding on a phone');
  menus.layer.all().find((n) => n.tag === 'button' && n.textContent.startsWith('Show these tips')).fire('click');
  assert.equal(settings.tipsSeen, false);
  assert.equal(saved, 1);
});

test('the pass preview names the very receiver the pass then goes to, for every direction held', () => {
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
    for (const held of [true, false]) {
      const match = createMatch({ seed: 7, humanTeam: 'home' });
      match.phase = 'play';
      const me = playerById(match, match.activeId);
      match.owner = me.id;
      Object.assign(match.ball, { x: me.x, y: me.y, z: 0.105, vx: 0, vy: 0 });
      const move = held ? { x: Math.cos(angle), y: Math.sin(angle) } : { x: 0, y: 0 };
      const preview = bestPassTarget(me, teamOf(match, 'home'), move, teamOf(match, 'away'));
      drainEvents(match);
      stepMatch(match, { [me.id]: { move, pass: 'tap' } });
      const pass = drainEvents(match).find((event) => event.type === 'pass');
      assert.ok(pass, 'the pass happened');
      assert.equal(pass.to, preview?.id ?? null, `held ${held}, angle ${angle.toFixed(2)}`);
    }
  }
});
