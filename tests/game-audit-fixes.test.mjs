import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { BALL } from '../js/ball-physics.js';
import { DIFFICULTIES, aiControls, createAi } from '../js/game/ai.js';
import { bannerFor, hintFor, playerLabel } from '../js/game/hud.js';
import { ACTIONS, DEFAULT_BINDINGS, mergeFrames } from '../js/game/input-map.js';
import { MATCH, createMatch, drainEvents, playerById, setRestart, stepMatch, teamOf } from '../js/game/match.js';
import { createMenus } from '../js/game/menus.js';
import { HALF_LENGTH } from '../js/game/rules.js';
import { autoSwitch } from '../js/game/switching.js';
import { effectiveBindings, normalizeSettings } from '../js/game/settings.js';

const DT = MATCH.step;
const run = (match, controls, seconds) => {
  const events = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) { stepMatch(match, typeof controls === 'function' ? controls(match) : controls, DT); events.push(...drainEvents(match)); }
  return events;
};
const park = (match) => match.players.forEach((p, i) => Object.assign(p, { x: p.team === 'home' ? -12 : 12, y: (i % 7) * 4 - 12, vx: 0, vy: 0 }));

test('G-01: taps from a frame that ran no step are kept for the next frame, and never lost or doubled', () => {
  const quiet = { move: { x: 0, y: 0 }, sprint: false, pass: null, shoot: null, tackle: null, switch: null, pause: false, charge: 0 };
  assert.equal(mergeFrames(null, quiet), quiet);
  const tapped = { ...quiet, pass: 'tap', shoot: { power: 0.7, curl: 0 }, tackle: 'slide', switch: 'cycle', pause: true };
  const next = { ...quiet, move: { x: 1, y: 0 }, sprint: true };
  const merged = mergeFrames(tapped, next);
  assert.equal(merged.pass, 'tap');
  assert.deepEqual(merged.shoot, { power: 0.7, curl: 0 });
  assert.equal(merged.tackle, 'slide');
  assert.equal(merged.switch, 'cycle');
  assert.equal(merged.pause, true);
  assert.deepEqual(merged.move, { x: 1, y: 0 }, 'the newer frame\'s held values win');
  assert.equal(merged.sprint, true);
  assert.equal(mergeFrames(tapped, { ...quiet, pass: 'lob' }).pass, 'lob', 'a newer tap wins over a kept one');
});

test('G-03: a corner, a goal kick and a free kick wait for the human, who aims and kicks with pass or shoot', () => {
  const cases = [
    ['corner', (m) => { park(m); Object.assign(m.ball, { x: HALF_LENGTH - 0.2, y: 9, z: BALL.radius, vx: 6, vy: 0, vz: 0 }); m.lastTouch = { team: 'away', id: 'away-3' }; }, { x: -1, y: -0.3 }],
    ['goal-kick', (m) => { park(m); Object.assign(m.ball, { x: -HALF_LENGTH + 0.2, y: 3, z: BALL.radius, vx: -6, vy: 0, vz: 0 }); m.lastTouch = { team: 'away', id: 'away-3' }; }, { x: 1, y: 0.2 }],
    ['free-kick', null, { x: 1, y: 0.2 }],
  ];
  for (const [type, setup, aim] of cases) {
    const match = createMatch({ seed: 9, humanTeam: 'home' });
    match.phase = 'play';
    park(match);
    match.owner = null;
    if (setup) { setup(match); for (let i = 0; i < 120 && match.phase === 'play'; i += 1) stepMatch(match, {}, DT); } else setRestart(match, { type: 'free-kick', team: 'home', foulBy: 'away', spot: { x: 5, y: 4 } });
    assert.equal(match.phase, 'restart', `${type}: whistle`);
    assert.equal(match.restart.type, type);
    assert.equal(match.restart.team, 'home', `${type}: the human's`);
    drainEvents(match);
    const taker = playerById(match, match.restart.takerId);
    const spot = { ...match.restart.spot };
    run(match, { [taker.id]: { move: aim } }, 2.5);
    assert.equal(match.phase, 'restart', `${type}: still waiting for the human after 2.5 s`);
    assert.ok(Math.hypot(taker.x - spot.x, taker.y - spot.y) < 1e-9, `${type}: the taker stays on the spot`);
    assert.ok(Math.cos(taker.heading) * aim.x + Math.sin(taker.heading) * aim.y > 0.6, `${type}: he turned to aim`);
    assert.match(hintFor(match), /PASS or SHOOT/);
    const events = run(match, () => ({ [taker.id]: { move: aim, shoot: { power: 0.6, curl: 0 } } }), 0.2);
    assert.equal(match.phase, 'play', `${type}: play resumes with the kick`);
    assert.ok(events.some((event) => event.type === 'shot' && event.id === taker.id), `${type}: the kick was taken`);
  }
});

test('G-03: the computer takes its set pieces by itself, and a human who does nothing is not stuck', () => {
  const match = createMatch({ seed: 9, humanTeam: 'home' });
  match.phase = 'play';
  park(match);
  setRestart(match, { type: 'corner', team: 'away', outBy: 'home', spot: { x: HALF_LENGTH - 0.05, y: 18.6 } });
  assert.equal(bannerFor(match), 'CORNER KICK · COMPUTER');
  run(match, {}, 1.2);
  assert.equal(match.phase, 'restart', 'the computer takes a moment too');
  run(match, {}, 0.6);
  assert.equal(match.phase, 'play');
  const idle = createMatch({ seed: 9, humanTeam: 'home' });
  idle.phase = 'play';
  park(idle);
  setRestart(idle, { type: 'free-kick', team: 'home', foulBy: 'away', spot: { x: 0, y: 0 } });
  run(idle, {}, MATCH.setPiece.humanTimeout + 0.5);
  assert.equal(idle.phase, 'play', 'play resumes by itself after the timeout');
});

test('G-17: a header is not headed straight back: one header per 0.7 s', () => {
  const match = createMatch({ seed: 3, humanTeam: 'none' });
  match.phase = 'play';
  match.activeId = null;
  park(match);
  const [a, b] = teamOf(match, 'home').filter((p) => p.role !== 'GK');
  Object.assign(a, { x: 0, y: 0, heading: 0 });
  Object.assign(b, { x: 0.45, y: 0, heading: Math.PI });
  Object.assign(match.ball, { x: 0.2, y: 0, z: 1.6, vx: 0, vy: 0, vz: 0 });
  match.owner = null;
  const events = run(match, {}, 0.65);
  assert.ok(events.filter((event) => event.type === 'header').length <= 1, 'at most one header in 0.65 s');
});

test('G-04: the computer wins the ball from a carrier who stands still, at every level', () => {
  for (const level of ['kids', 'easy', 'normal', 'hard']) {
    let tackles = 0;
    for (const seed of [1, 2, 3]) {
      const match = createMatch({ seed, humanTeam: 'home', halfSeconds: 120 });
      const ai = createAi(level);
      let controls = {};
      for (let i = 0; i < 120 * 60; i += 1) {
        if (i % 6 === 0) controls = aiControls(match, ai, {});
        controls[match.activeId] = { move: { x: 0, y: 0 } }; // the human does nothing
        stepMatch(match, controls, DT);
        autoSwitch(match);
        for (const event of drainEvents(match)) if (event.type === 'tackle' && event.team === 'away') tackles += 1;
      }
    }
    assert.ok(tackles >= 3, `${level}: ${tackles} tackles on a player standing still in 3 minutes (it used to be 0 to 1 a match)`);
  }
});

test('G-06: there is a gentler Kids level below Easy, and the levels get steadily stronger', () => {
  const order = ['kids', 'easy', 'normal', 'hard'];
  assert.deepEqual(Object.keys(DIFFICULTIES), order, 'listed from gentlest to hardest, so the title screen shows them that way');
  assert.equal(DIFFICULTIES.kids.label, 'Kids');
  for (const key of ['speed', 'keeperSkill', 'tackleChance', 'shootRange', 'pressRadius', 'aggression']) {
    for (let i = 1; i < order.length; i += 1) assert.ok(DIFFICULTIES[order[i]][key] > DIFFICULTIES[order[i - 1]][key], `${key}: ${order[i]} is stronger than ${order[i - 1]}`);
  }
  for (const key of ['passNoise', 'shotError', 'think', 'reaction']) {
    for (let i = 1; i < order.length; i += 1) assert.ok(DIFFICULTIES[order[i]][key] < DIFFICULTIES[order[i - 1]][key], `${key}: ${order[i]} is sharper than ${order[i - 1]}`);
  }
});

test('G-21: the HUD says Striker and Defender, not ST and RD', () => {
  assert.equal(playerLabel({ id: 'home-7', role: 'ST' }), '#7 Striker');
  assert.equal(playerLabel({ id: 'home-4', role: 'RD' }), '#4 Defender');
  assert.equal(playerLabel({ id: 'home-1', role: 'GK' }), '#1 Keeper');
  assert.equal(playerLabel({ id: 'home-9', role: 'XX' }), '#9 XX', 'an unknown role is shown as it is');
  assert.equal(playerLabel(null), '');
});

// A just-enough DOM for the menus.
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.listeners = {}; this.className = ''; this.textContent = ''; this.hidden = false; this.dataset = {}; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  click() { for (const fn of this.listeners.click ?? []) fn(); }
  focus() { globalThis.document.activeElement = this; }
  all() { return [this, ...this.children.flatMap((child) => child.all())]; }
  contains(node) { return this.all().includes(node); }
  querySelectorAll(selector) { return selector === 'button' ? this.all().filter((n) => n.tag === 'button') : []; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}
globalThis.document = { createElement: (tag) => new Node(tag), activeElement: null };

function menus(calls = {}) {
  const settings = normalizeSettings(null, ACTIONS);
  const note = (name) => () => { calls[name] = (calls[name] ?? 0) + 1; };
  return createMenus(new Node('div'), {
    settings, onStart: note('start'), onResume: note('resume'), onRestart: note('restart'), onExit: note('exit'), onSettings() {},
    bindings: () => effectiveBindings(DEFAULT_BINDINGS, settings), defaultBindings: DEFAULT_BINDINGS, onBindings() {},
  });
}
const press = (layer, label) => { const found = layer.querySelectorAll('button').find((n) => n.textContent.startsWith(label)); assert.ok(found, `button ${label}`); found.click(); return found; };

test('G-10: Esc and B always mean one level back, and never throw you out of the match by surprise', () => {
  const calls = {};
  const m = menus(calls);
  assert.equal(m.back(), false, 'nothing to go back from before a screen is shown');
  m.showTitle();
  press(m.layer, 'Controls');
  assert.equal(m.back(), true);
  assert.ok(m.layer.querySelectorAll('button').some((n) => n.textContent === 'Kick off'), 'back from Controls is the title screen, not leaving the game');
  assert.equal(calls.exit ?? 0, 0);
  m.back();
  assert.equal(calls.exit, 1, 'back from the title screen itself leaves for the coach board');
  m.showPause();
  press(m.layer, 'Settings');
  m.back();
  assert.ok(m.layer.querySelectorAll('button').some((n) => n.textContent === 'Resume'), 'back from pause Settings is the pause menu, the match is still paused');
  assert.equal(calls.resume ?? 0, 0);
  m.back();
  assert.equal(calls.resume, 1, 'back from the pause menu resumes');
  m.showFullTime({ score: { home: 1, away: 0 }, stats: { shots: { home: 1, away: 0 }, possession: { home: 1, away: 1 }, saves: { home: 0, away: 0 } } });
  assert.equal(m.back(), false, 'full time has nowhere to go back to');
});

test('G-02: a gamepad can move through the menus and press a button (focus and activate)', () => {
  const calls = {};
  const m = menus(calls);
  m.showTitle();
  const names = () => m.layer.querySelectorAll('button').map((n) => n.textContent);
  const first = globalThis.document.activeElement;
  assert.equal(first.textContent, names()[0], 'the first button has focus');
  m.moveFocus(1);
  assert.equal(globalThis.document.activeElement.textContent, names()[1]);
  m.moveFocus(-1); m.moveFocus(-1);
  assert.equal(globalThis.document.activeElement.textContent, names().at(-1), 'focus wraps around');
  const kickOff = m.layer.querySelectorAll('button').find((n) => n.textContent === 'Kick off');
  kickOff.focus();
  m.activate();
  assert.equal(calls.start, 1, 'A presses the focused button');
});

test('G-11: Restart match and Exit to coach need a second press within three seconds', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const calls = {};
    const m = menus(calls);
    m.showPause();
    const restart = press(m.layer, 'Restart match');
    assert.equal(calls.restart ?? 0, 0, 'one press does nothing yet');
    assert.match(restart.textContent, /again/i);
    mock.timers.tick(3100);
    assert.equal(restart.textContent, 'Restart match', 'the confirmation lapses');
    restart.click();
    restart.click();
    assert.equal(calls.restart, 1, 'two presses restart');
    const exit = press(m.layer, 'Exit to coach');
    assert.equal(calls.exit ?? 0, 0);
    exit.click();
    assert.equal(calls.exit, 1);
  } finally { mock.timers.reset(); }
});
