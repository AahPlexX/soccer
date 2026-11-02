import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { BALL, flightAt } from '../js/ball-physics.js';
import { CONTROL, assistedAim, goalShotElevation, startTackle } from '../js/game/ball-control.js';
import { createPlayer, stepPlayer } from '../js/game/player-physics.js';
import { DIFFICULTIES, aiControls, createAi } from '../js/game/ai.js';
import { bannerFor, hintFor, playerLabel } from '../js/game/hud.js';
import { ACTIONS, DEFAULT_BINDINGS, mergeFrames } from '../js/game/input-map.js';
import { MATCH, createMatch, drainEvents, playerById, setRestart, stepMatch, teamOf } from '../js/game/match.js';
import { createMenus } from '../js/game/menus.js';
import { HALF_LENGTH, HALF_MOUTH } from '../js/game/rules.js';
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
    settings, onStart: note('start'), onResume: note('resume'), onRestart: note('restart'), onExit: note('exit'), onSettings() {}, onDifficulty: (level) => { calls.difficulty = level; },
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

test('G-05: a human shot at goal crosses the line under the bar however hard it is charged', () => {
  for (const power of [0.15, 0.4, 0.7, 1]) {
    for (const meters of [8, 14, 20, 26]) {
      const ball = { x: HALF_LENGTH - meters, y: 0 };
      const elevation = goalShotElevation(ball, { x: 1, y: 0 }, 'home', power);
      assert.ok(elevation !== null && elevation > 0, `power ${power} at ${meters} m has an elevation`);
      if (power < 0.3) { assert.ok(elevation <= 0.05, 'a gentle tap is a rolling shot'); continue; }
      const speed = CONTROL.shotMinSpeed + (CONTROL.shotMaxSpeed - CONTROL.shotMinSpeed) * power;
      const crossing = flightAt(speed, elevation, meters);
      if (!crossing) continue; // it lands short of the goal and rolls in: certainly not over the bar
      assert.ok(crossing.height > 0.05 && crossing.height < 1.8, `power ${power} at ${meters} m crosses the line at ${crossing.height.toFixed(2)} m, under the bar`);
    }
  }
  assert.equal(goalShotElevation({ x: 0, y: 0 }, { x: -1, y: 0 }, 'home', 0.8), null, 'a shot away from the goal keeps the old loft');
  assert.equal(goalShotElevation({ x: -20, y: 0 }, { x: 1, y: 0 }, 'home', 0.8), null, 'and so does a shot from the far end');
  assert.ok(goalShotElevation({ x: -HALF_LENGTH + 14, y: 0 }, { x: -1, y: 0 }, 'away', 0.8) > 0, 'the away team attacks the left goal');
  assert.equal(goalShotElevation({ x: -HALF_LENGTH + 14, y: 0 }, { x: 1, y: 0 }, 'away', 0.8), null, 'and a shot back up the pitch is not a shot at goal');
});

test('G-05: the aim assist rescues a shot that is just wide but keeps the corner you aimed at', () => {
  const striker = { team: 'home', x: HALF_LENGTH - 14, y: 0, heading: 0 };
  const at = (yAtGoal) => { const d = { x: 14, y: yAtGoal }; const l = Math.hypot(d.x, d.y); return assistedAim(striker, { x: d.x / l, y: d.y / l }); };
  const crossingY = (aim) => striker.y + aim.y * (14 / aim.x);
  assert.ok(Math.abs(crossingY(at(2.4)) - 2.4) < 0.05, 'a shot at the near corner stays at the corner');
  assert.ok(Math.abs(crossingY(at(-1.1)) + 1.1) < 0.05, 'and one at the other side');
  assert.ok(Math.abs(crossingY(at(HALF_MOUTH + 1)) - (HALF_MOUTH - 0.4)) < 0.05, 'a shot 1 m wide is pulled just inside the post');
  assert.ok(Math.abs(crossingY(at(HALF_MOUTH + 4)) - (HALF_MOUTH + 4)) < 0.05, 'a shot far wide is left alone');
  assert.deepEqual(assistedAim(striker, { x: -1, y: 0 }), { x: -1, y: 0 }, 'and one aimed away from the goal');
});

test('G-05: goals can be scored against every keeper, easier at the lower levels (shots spread across the goal)', () => {
  const rate = (level) => {
    let goals = 0;
    const trials = 40;
    for (let n = 0; n < trials; n += 1) {
      const match = createMatch({ seed: 100 + n, humanTeam: 'home', halfSeconds: 60 });
      match.phase = 'play';
      match.players.forEach((p, i) => Object.assign(p, { x: p.team === 'home' ? -15 : 15, y: (i % 7) * 4 - 12, vx: 0, vy: 0 }));
      Object.assign(match.players.find((p) => p.team === 'away' && p.role === 'GK'), { x: HALF_LENGTH - 1.2, y: 0 });
      const striker = playerById(match, match.activeId);
      Object.assign(striker, { x: HALF_LENGTH - (10 + (n % 9)), y: ((n * 7) % 11) - 5, heading: 0, vx: 0, vy: 0 });
      Object.assign(match.ball, { x: striker.x + 0.3, y: striker.y, z: BALL.radius, vx: 0, vy: 0, vz: 0 });
      match.owner = striker.id;
      const aimY = (((n * 13) % 9) - 4) * (HALF_MOUTH * 0.85) / 4;
      const length = Math.hypot(HALF_LENGTH - striker.x, aimY - striker.y);
      const direction = { x: (HALF_LENGTH - striker.x) / length, y: (aimY - striker.y) / length };
      const ai = createAi(level);
      let controls = {};
      for (let i = 0; i < 120 * 3 && match.phase === 'play'; i += 1) {
        if (i % 6 === 0) controls = aiControls(match, ai, {});
        controls[match.activeId] = i === 0 ? { move: direction, shoot: { power: 0.85, curl: 0 } } : { move: { x: 0, y: 0 } };
        stepMatch(match, controls, DT);
        if (drainEvents(match).some((event) => event.type === 'goal')) goals += 1;
      }
    }
    return goals / trials;
  };
  const kids = rate('kids');
  const normal = rate('normal');
  const hard = rate('hard');
  assert.ok(hard >= 0.05, `even Hard concedes sometimes (${(hard * 100).toFixed(0)}%; it was 0% at every level)`);
  assert.ok(kids >= 0.25 && kids <= 0.6, `Kids lets a good shot in about a third of the time (${(kids * 100).toFixed(0)}%)`);
  assert.ok(kids > normal && normal > hard - 0.02, `harder levels save more (${(kids * 100).toFixed(0)}% > ${(normal * 100).toFixed(0)}% >= ${(hard * 100).toFixed(0)}%)`);
});

test('G-09: a slide has a cooldown, so it is a decision and not a habit', () => {
  const player = createPlayer({ id: 'p', team: 'home', role: 'CM', x: 0, y: 0 }, 0);
  assert.equal(startTackle(player, { slide: true }), true);
  player.action = null; // the slide is over
  assert.equal(startTackle(player, { slide: true }), false, 'cannot slide again at once');
  assert.equal(startTackle(player), true, 'but a standing tackle is still allowed');
  player.action = null;
  for (let i = 0; i < Math.round((CONTROL.slideCooldown + 0.1) / DT); i += 1) stepPlayer(player, { x: 0, y: 0 }, DT);
  assert.equal(startTackle(player, { slide: true }), true, 'and after the cooldown it can');
});

test('G-22 and G-23: the restart prompt counts down before the match goes on by itself, and half-time shows the score', () => {
  const match = createMatch({ seed: 5, humanTeam: 'home' });
  match.phase = 'play';
  park(match);
  setRestart(match, { type: 'throw-in', team: 'home', outBy: 'away', spot: { x: 0, y: 18.6 } });
  assert.equal(match.restart.limit, MATCH.throwIn.humanTimeout);
  assert.doesNotMatch(hintFor(match), /play on/, 'no countdown at first');
  match.restart.waited = match.restart.limit - 3.2;
  assert.match(hintFor(match), /play on in 4/);
  match.restart.waited = match.restart.limit - 0.4;
  assert.match(hintFor(match), /play on in 1/);
  const theirs = createMatch({ seed: 5, humanTeam: 'home' });
  theirs.phase = 'play';
  park(theirs);
  setRestart(theirs, { type: 'throw-in', team: 'away', outBy: 'home', spot: { x: 0, y: 18.6 } });
  theirs.restart.waited = theirs.restart.limit - 0.4;
  assert.doesNotMatch(hintFor(theirs), /play on/, 'the computer\'s throw is not the human\'s business');
  assert.equal(bannerFor({ phase: 'halftime', score: { home: 2, away: 1 } }), 'HALF TIME · 2 - 1');
  assert.equal(bannerFor({ phase: 'fulltime', score: { home: 2, away: 1 } }), 'FULL TIME');
});

test('G-24: the difficulty can be changed from the pause menu and takes effect at once', () => {
  const calls = {};
  const m = menus(calls);
  m.showPause();
  const hard = m.layer.querySelectorAll('button').find((n) => n.textContent === 'Hard');
  assert.ok(hard, 'the pause menu offers the difficulty levels');
  assert.ok(m.layer.querySelectorAll('button').some((n) => n.textContent === 'Kids'), 'including Kids');
  hard.click();
  assert.equal(calls.difficulty, 'hard');
});
