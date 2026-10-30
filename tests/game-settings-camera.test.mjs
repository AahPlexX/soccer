import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { aiControls, createAi } from '../js/game/ai.js';
import { CAMERA, cameraTarget, createCamera, halfExtents, inCentralView, project, scaleFor, snapCamera, stepCamera, unproject, visibleWidthFor } from '../js/game/camera.js';
import { ACTIONS, DEFAULT_BINDINGS } from '../js/game/input-map.js';
import { MATCH, createMatch, stepMatch } from '../js/game/match.js';
import { HALF_LENGTH, HALF_WIDTH } from '../js/game/rules.js';
import { DEFAULT_SETTINGS, SETTINGS_KEY, effectiveBindings, loadSettings, normalizeSettings, saveSettings } from '../js/game/settings.js';

const memoryStorage = (initial = {}) => { const data = { ...initial }; return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data }; };

test('settings default sensibly, and junk never gets through', () => {
  assert.deepEqual(normalizeSettings(null), { ...DEFAULT_SETTINGS, bindings: {} });
  const messy = normalizeSettings({ difficulty: 'godlike', halfMinutes: 7, sound: 'yes', touchScale: 99, radar: 0, extra: 1, bindings: { pass: ['KeyP', 'KeyP', 5, ''], nonsense: ['KeyZ'], shoot: 'KeyK' } }, ACTIONS);
  assert.deepEqual(messy, { schemaVersion: 1, difficulty: 'normal', halfMinutes: 2, sound: true, haptics: true, touchScale: 1.4, radar: true, bindings: { pass: ['KeyP'] } });
  assert.equal(normalizeSettings({ difficulty: 'hard', halfMinutes: 3, sound: false, touchScale: 0.1 }).touchScale, 0.8);
  assert.equal(normalizeSettings([]).difficulty, 'normal');
  assert.deepEqual(normalizeSettings(normalizeSettings({ difficulty: 'easy' })), normalizeSettings({ difficulty: 'easy' }), 'idempotent');
});

test('custom bindings replace whole actions and leave the rest alone', () => {
  const bindings = effectiveBindings(DEFAULT_BINDINGS, normalizeSettings({ bindings: { pass: ['KeyX'] } }, ACTIONS));
  assert.deepEqual(bindings.pass, ['KeyX']);
  assert.deepEqual(bindings.shoot, DEFAULT_BINDINGS.shoot);
});

test('settings load from and save to storage, and every failure falls back to the defaults', () => {
  const storage = memoryStorage();
  assert.deepEqual(loadSettings(storage), { ...DEFAULT_SETTINGS, bindings: {} });
  assert.equal(saveSettings(storage, { difficulty: 'hard', halfMinutes: 3 }), true);
  assert.equal(JSON.parse(storage.data[SETTINGS_KEY]).difficulty, 'hard');
  assert.equal(loadSettings(storage).halfMinutes, 3);
  assert.equal(loadSettings(memoryStorage({ [SETTINGS_KEY]: '{not json' })).difficulty, 'normal');
  assert.equal(loadSettings({ getItem() { throw new Error('blocked'); } }).difficulty, 'normal');
  assert.equal(loadSettings(null).difficulty, 'normal');
  assert.equal(saveSettings({ setItem() { throw new Error('quota'); } }, {}), false);
  assert.ok(!SETTINGS_KEY.includes('board'), 'the key cannot collide with the coach board state');
});

test('wide screens show more pitch than portrait ones, within limits, and the scale follows', () => {
  assert.ok(visibleWidthFor(2) > visibleWidthFor(1) && visibleWidthFor(1) > visibleWidthFor(0.5));
  assert.equal(visibleWidthFor(100), 30);
  assert.equal(visibleWidthFor(0), 16);
  assert.equal(visibleWidthFor(Number.NaN), 22);
  assert.ok(Math.abs(scaleFor({ width: 1280, height: 720 }) * visibleWidthFor(1280 / 720) - 1280) < 1e-9);
});

test('project and unproject are inverses on the grass, and height lifts a point up the screen', () => {
  const camera = { ...createCamera(), x: 4, y: -2, scale: 25 };
  const view = { width: 1000, height: 600 };
  const screen = project(camera, view, 10, 3);
  const ground = unproject(camera, view, screen.x, screen.y);
  assert.ok(Math.abs(ground.x - 10) < 1e-9 && Math.abs(ground.y - 3) < 1e-9);
  assert.ok(project(camera, view, 10, 3, 2).y < screen.y, 'higher is further up the screen');
  assert.deepEqual(project(camera, view, 4, -2), { x: 500, y: 300 }, 'the camera point is the screen center');
});

test('the target leads the ball, favours the attack when the human has it, and brings a far active player into view', () => {
  const view = { width: 1000, height: 600 };
  const camera = { ...createCamera(), scale: scaleFor(view) };
  const match = createMatch();
  match.owner = null;
  Object.assign(match.ball, { x: 0, y: 0, vx: 0, vy: 0 });
  match.activeId = 'home-2';
  Object.assign(match.players.find((p) => p.id === 'home-2'), { x: 0, y: 0 });
  assert.deepEqual(cameraTarget(match, camera, view), { x: 0, y: 0 });
  Object.assign(match.ball, { vx: 10, vy: -5 });
  const led = cameraTarget(match, camera, view);
  assert.ok(led.x > 3 && led.y < -1.5);
  Object.assign(match.ball, { vx: 100, vy: 0 });
  assert.ok(cameraTarget(match, camera, view).x <= CAMERA.maxLead + 1e-9, 'the lead is capped');
  Object.assign(match.ball, { vx: 0, vy: 0 });
  match.owner = 'home-7';
  assert.equal(cameraTarget(match, camera, view).x, CAMERA.attackBias, 'the human team attacking +x pulls the view forward');
  match.owner = null;
  Object.assign(match.players.find((p) => p.id === 'home-2'), { x: -40, y: 0 });
  assert.ok(cameraTarget(match, camera, view).x < 0, 'leans toward the far player');
});

test('the camera ignores small ball movements, then follows smoothly without overshooting', () => {
  const view = { width: 1000, height: 600 };
  const camera = snapCamera(createCamera(), { x: 0, y: 0 }, view);
  for (let i = 0; i < 60; i += 1) stepCamera(camera, { x: 1, y: 0.5 }, 1 / 60, view);
  assert.ok(Math.abs(camera.x) < 1e-6 && Math.abs(camera.y) < 1e-6, 'inside the dead zone nothing moves');
  let previous = camera.x;
  let overshoot = false;
  for (let i = 0; i < 600; i += 1) {
    stepCamera(camera, { x: 12, y: 0 }, 1 / 60, view);
    if (camera.x > 12 + 1e-6) overshoot = true;
    assert.ok(camera.x >= previous - 1e-9, 'moves monotonically toward the target');
    previous = camera.x;
  }
  assert.ok(!overshoot);
  assert.ok(camera.x > 12 - halfExtents(camera, view).hx * 2 * CAMERA.deadzone - 0.01, 'ends within the dead zone of the target');
});

test('the camera never shows more than the pitch plus the margin', () => {
  const view = { width: 1000, height: 600 };
  const camera = snapCamera(createCamera(), { x: 0, y: 0 }, view);
  for (let i = 0; i < 1200; i += 1) stepCamera(camera, { x: 500, y: 500 }, 1 / 60, view);
  const { hx, hy } = halfExtents(camera, view);
  assert.ok(camera.x + hx <= HALF_LENGTH + CAMERA.margin + 1e-6 && camera.y + hy <= HALF_WIDTH + CAMERA.margin + 1e-6);
  assert.ok(inCentralView({ ...createCamera(), x: 0, y: 0, scale: 20 }, view, { x: 1, y: 1 }));
  assert.ok(!inCentralView({ ...createCamera(), x: 0, y: 0, scale: 20 }, view, { x: 24, y: 0 }));
});

for (const [name, view] of [['a laptop', { width: 1280, height: 720 }], ['a phone in landscape', { width: 844, height: 390 }], ['a tablet in portrait', { width: 820, height: 1180 }]]) {
  test(`over a whole AI match the ball stays on screen on ${name}`, () => {
    const match = createMatch({ seed: 21, humanTeam: 'none', halfSeconds: 60 });
    match.activeId = null;
    const ai = createAi('normal');
    const camera = snapCamera(createCamera(), { x: 0, y: 0 }, view);
    let controls = {};
    let frames = 0;
    let inCentral = 0;
    let onScreen = 0;
    for (let i = 0; i < 120 * 90; i += 1) {
      if (i % 6 === 0) controls = aiControls(match, ai, {});
      stepMatch(match, controls, MATCH.step);
      if (i % 2 === 0) {
        stepCamera(camera, cameraTarget(match, camera, view), 1 / 60, view, Math.hypot(match.ball.vx, match.ball.vy));
        frames += 1;
        if (inCentralView(camera, view, match.ball, 0.9)) inCentral += 1;
        if (inCentralView(camera, view, match.ball, 1)) onScreen += 1;
      }
    }
    assert.ok(onScreen / frames > 0.99, `ball on screen ${((onScreen / frames) * 100).toFixed(1)}% of frames`);
    assert.ok(inCentral / frames > 0.9, `ball in the central 90% ${((inCentral / frames) * 100).toFixed(1)}% of frames`);
  });
}

test('camera values stay finite for any target and step size', () => {
  fc.assert(fc.property(
    fc.array(fc.record({ x: fc.double({ min: -200, max: 200, noNaN: true }), y: fc.double({ min: -200, max: 200, noNaN: true }), dt: fc.double({ min: 0, max: 0.5, noNaN: true }), speed: fc.double({ min: 0, max: 60, noNaN: true }) }), { minLength: 1, maxLength: 80 }),
    fc.constantFrom({ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 300, height: 300 }),
    (steps, view) => {
      const camera = snapCamera(createCamera(), { x: 0, y: 0 }, view);
      for (const s of steps) {
        stepCamera(camera, { x: s.x, y: s.y }, s.dt, view, s.speed);
        assert.ok([camera.x, camera.y, camera.vx, camera.vy, camera.scale].every(Number.isFinite));
      }
    },
  ), { numRuns: 100 });
});
