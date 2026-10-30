import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { ACTIONS, DEFAULT_BINDINGS, INPUT, classifySwipe, createInput, frameToControl, readGamepad, stickFromDrag } from '../js/game/input-map.js';

const STEP = 1 / 60;
const run = (input, seconds, heading = 0) => { let frame; for (let i = 0; i < Math.round(seconds / STEP); i += 1) frame = input.sample(STEP, heading); return frame; };

test('every action has at least one default key and no key is bound twice', () => {
  const seen = new Set();
  for (const action of ACTIONS) {
    assert.ok(DEFAULT_BINDINGS[action].length >= 1, action);
    for (const code of DEFAULT_BINDINGS[action]) { assert.ok(!seen.has(code), `${code} is bound twice`); seen.add(code); }
  }
});

test('movement keys and the stick combine, diagonals are normalized, opposite keys cancel', () => {
  const input = createInput();
  input.keyDown('ArrowRight');
  assert.deepEqual(input.sample(STEP).move, { x: 1, y: 0 });
  input.keyDown('KeyS');
  const diagonal = input.sample(STEP).move;
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-9 && diagonal.x > 0 && diagonal.y > 0);
  input.keyDown('ArrowLeft');
  assert.equal(input.sample(STEP).move.x, 0, 'left and right cancel');
  input.keyUp('ArrowLeft'); input.keyUp('ArrowRight'); input.keyUp('KeyS');
  assert.deepEqual(input.sample(STEP).move, { x: 0, y: 0 });
  input.setStick(0.5, -0.25);
  assert.deepEqual(input.sample(STEP).move, { x: 0.5, y: -0.25 });
  input.setStick(5, 5);
  assert.ok(Math.hypot(...Object.values(input.sample(STEP).move)) <= 1 + 1e-9, 'an oversized stick is clamped');
});

test('two keys for one action work together and the action stays down until both are up', () => {
  const input = createInput();
  input.keyDown('ShiftLeft'); input.keyDown('KeyL');
  assert.ok(input.sample(STEP).sprint);
  input.keyUp('ShiftLeft');
  assert.ok(input.sample(STEP).sprint, 'still held by the other key');
  input.keyUp('KeyL');
  assert.ok(!input.sample(STEP).sprint);
  assert.equal(input.keyDown('KeyZ'), false, 'unbound keys are not reported as handled');
});

test('a quick pass tap is a ground pass and a held pass is a lob, both on release', () => {
  const input = createInput();
  input.keyDown('KeyJ');
  assert.equal(input.sample(STEP).pass, null, 'nothing fires on press');
  input.keyUp('KeyJ');
  assert.equal(input.sample(STEP).pass, 'tap');
  assert.equal(input.sample(STEP).pass, null, 'the event appears in one frame only');
  input.keyDown('Space');
  run(input, INPUT.lobHold + 0.1);
  input.keyUp('Space');
  assert.equal(input.sample(STEP).pass, 'lob');
});

test('a pass held too long lobs by itself and the release then does nothing', () => {
  const input = createInput();
  input.keyDown('KeyJ');
  let fired = null;
  for (let i = 0; i < 120 && !fired; i += 1) fired = input.sample(STEP).pass;
  assert.equal(fired, 'lob');
  input.keyUp('KeyJ');
  assert.equal(input.sample(STEP).pass, null);
});

test('shooting charges while held, fires on release, clamps the power and curls with the stick', () => {
  const input = createInput();
  input.keyDown('KeyK');
  const charging = run(input, INPUT.chargeSeconds / 2);
  assert.ok(charging.charge > 0.4 && charging.charge < 0.6 && charging.shoot === null);
  input.keyUp('KeyK');
  const half = input.sample(STEP).shoot;
  assert.ok(half.power > 0.45 && half.power < 0.65 && half.curl === 0);
  input.keyDown('Enter');
  run(input, 5);
  input.keyUp('Enter');
  assert.equal(input.sample(STEP).shoot.power, 1, 'power is capped at full charge');
  input.keyDown('KeyK'); input.keyUp('KeyK');
  assert.equal(input.sample(STEP).shoot.power, INPUT.minPower, 'a tap is a weak shot, not nothing');
  input.keyDown('KeyK'); input.keyDown('ArrowDown');
  run(input, 0.4);
  input.keyUp('KeyK');
  assert.equal(input.sample(STEP, 0).shoot.curl, 1, 'stick counter-clockwise of the heading curls the ball that way');
  input.keyUp('ArrowDown');
});

test('a tackle is a slide when a direction is held and a stand tackle otherwise', () => {
  const input = createInput();
  input.keyDown('KeyE');
  assert.equal(input.sample(STEP).tackle, 'stand');
  assert.equal(input.sample(STEP).tackle, null, 'one frame only');
  input.keyUp('KeyE');
  input.keyDown('ArrowRight'); input.keyDown('KeyI');
  assert.equal(input.sample(STEP).tackle, 'slide');
});

test('switching cycles, switches by direction with the modifier or a swipe, and pause is an edge', () => {
  const input = createInput();
  input.keyDown('Tab');
  assert.equal(input.sample(STEP).switch, 'cycle');
  input.keyUp('Tab');
  input.keyDown('KeyU'); input.keyDown('ArrowLeft'); input.keyDown('KeyQ');
  assert.deepEqual(input.sample(STEP).switch, { dir: { x: -1, y: 0 } });
  input.reset();
  input.swipeSwitch({ x: 0, y: -1 });
  assert.deepEqual(input.sample(STEP).switch, { dir: { x: 0, y: -1 } });
  assert.equal(input.sample(STEP).switch, null);
  input.keyDown('Escape');
  assert.equal(input.sample(STEP).pause, true);
  assert.equal(input.sample(STEP).pause, false);
});

test('reset forgets held keys, charges and pending events', () => {
  const input = createInput();
  input.keyDown('KeyK'); input.keyDown('ArrowUp'); input.setStick(1, 0);
  run(input, 0.3);
  input.reset();
  const frame = input.sample(STEP);
  assert.deepEqual(frame.move, { x: 0, y: 0 });
  assert.equal(frame.charge, 0);
  input.keyUp('KeyK');
  assert.equal(input.sample(STEP).shoot, null, 'releasing after a reset does not fire');
});

test('joystick math removes the dead zone, scales to full deflection and ignores zero radius', () => {
  assert.deepEqual(stickFromDrag(3, 0, 50), { x: 0, y: 0 });
  const half = stickFromDrag(25, 0, 50);
  assert.ok(half.x > 0.35 && half.x < 0.45 && half.y === 0);
  const full = stickFromDrag(500, 0, 50);
  assert.ok(Math.abs(full.x - 1) < 1e-9);
  assert.deepEqual(stickFromDrag(10, 10, 0), { x: 0, y: 0 });
  const diagonal = stickFromDrag(100, -100, 50);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-9 && diagonal.y < 0);
});

test('swipes need distance and speed', () => {
  assert.deepEqual(classifySwipe(60, 0, 0.2), { x: 1, y: 0 });
  assert.equal(classifySwipe(10, 0, 0.1), null, 'too short');
  assert.equal(classifySwipe(100, 0, 0.8), null, 'too slow, it is a drag');
});

test('gamepad buttons are edge-detected, sticks dead-zoned and right-stick flicks switch once', () => {
  const buttons = (...pressedIndexes) => Array.from({ length: 12 }, (_, i) => ({ pressed: pressedIndexes.includes(i), value: pressedIndexes.includes(i) ? 1 : 0 }));
  const pad = (over = {}) => ({ axes: [0, 0, 0, 0], buttons: buttons(), ...over });
  const input = createInput();
  input.gamepad(pad({ buttons: buttons(0) }));
  assert.equal(input.isHeld('pass'), true);
  input.gamepad(pad({ buttons: buttons(0) }));
  input.gamepad(pad({ buttons: buttons() }));
  assert.equal(input.sample(STEP).pass, 'tap', 'press then release is a tap');
  input.gamepad(pad({ axes: [0.9, 0, 0, 0] }));
  assert.ok(input.sample(STEP).move.x > 0.8);
  input.gamepad(pad({ axes: [0.1, 0.1, 0, 0] }));
  assert.deepEqual(input.sample(STEP).move, { x: 0, y: 0 });
  input.gamepad(pad({ axes: [0, 0, 0, -1] }));
  assert.deepEqual(input.sample(STEP).switch, { dir: { x: 0, y: -1 } });
  input.gamepad(pad({ axes: [0, 0, 0, -1] }));
  assert.equal(input.sample(STEP).switch, null, 'holding the stick over does not switch again');
  input.gamepad(pad({ axes: [0, 0, 0, 0] }));
  input.gamepad(pad({ axes: [0, 0, 0, 1] }));
  assert.deepEqual(input.sample(STEP).switch, { dir: { x: 0, y: 1 } }, 'a new flick after returning to center');
  assert.deepEqual(readGamepad(null).stick, { x: 0, y: 0 }, 'a missing pad reads as idle');
  assert.ok(Number.isFinite(readGamepad({ axes: [Number.NaN, 2] }).stick.x), 'a broken axis reads as zero, not NaN');
});

test('frameToControl keeps only what the match needs', () => {
  const input = createInput();
  const control = frameToControl(input.sample(STEP));
  assert.deepEqual(Object.keys(control).sort(), ['move', 'pass', 'shoot', 'sprint', 'tackle']);
});

test('random input streams never produce NaN, an oversized move, or a power outside the range', () => {
  const codes = [...Object.values(DEFAULT_BINDINGS).flat(), 'KeyZ'];
  const event = fc.oneof(
    fc.record({ kind: fc.constant('down'), code: fc.constantFrom(...codes) }),
    fc.record({ kind: fc.constant('up'), code: fc.constantFrom(...codes) }),
    fc.record({ kind: fc.constant('stick'), x: fc.double({ min: -3, max: 3, noNaN: true }), y: fc.double({ min: -3, max: 3, noNaN: true }) }),
    fc.record({ kind: fc.constant('wait'), dt: fc.double({ min: 0, max: 0.5, noNaN: true }) }),
  );
  fc.assert(fc.property(fc.array(event, { maxLength: 80 }), (events) => {
    const input = createInput();
    for (const e of events) {
      if (e.kind === 'down') input.keyDown(e.code);
      else if (e.kind === 'up') input.keyUp(e.code);
      else if (e.kind === 'stick') input.setStick(e.x, e.y);
      const frame = input.sample(e.kind === 'wait' ? e.dt : STEP, 1);
      assert.ok(Number.isFinite(frame.move.x) && Number.isFinite(frame.move.y) && Math.hypot(frame.move.x, frame.move.y) <= 1 + 1e-9);
      assert.ok(frame.charge >= 0 && frame.charge <= 1);
      if (frame.shoot) assert.ok(frame.shoot.power >= INPUT.minPower && frame.shoot.power <= 1 && Math.abs(frame.shoot.curl) <= 1);
    }
  }), { numRuns: 200 });
});
