import test from 'node:test';
import assert from 'node:assert/strict';
import { BALL } from '../js/ball-physics.js';
import { DIFFICULTIES } from '../js/game/ai.js';
import { keeperControl } from '../js/game/ai-keeper.js';
import { makeContext } from '../js/game/ai-space.js';
import { soundFor } from '../js/game/audio.js';
import { CONTROL, keeperContact, startDive } from '../js/game/ball-control.js';
import { MATCH, createMatch, drainEvents, playerById, stepMatch, teamOf } from '../js/game/match.js';
import { HALF_LENGTH, HALF_MOUTH } from '../js/game/rules.js';
import { ACTION_FRAMES, pickAnimation } from '../js/game/sprites.js';

const place = (match, id, x, y) => Object.assign(playerById(match, id), { x, y, vx: 0, vy: 0 });
const clearField = (match) => { teamOf(match, 'home').forEach((p, i) => place(match, p.id, -8, -14 + i)); teamOf(match, 'away').filter((p) => p.role !== 'GK').forEach((p, i) => place(match, p.id, 8, 14 - i)); };
const play = (match, controls, seconds) => { const out = []; for (let i = 0; i < Math.round(seconds / MATCH.step); i += 1) { stepMatch(match, typeof controls === 'function' ? controls(i) : controls, MATCH.step); out.push(...drainEvents(match)); } return out; };

function shotAt(y, controlsAt = () => ({})) {
  const match = createMatch();
  match.phase = 'play';
  clearField(match);
  place(match, 'away-1', HALF_LENGTH - 1.2, 0);
  Object.assign(match.ball, { x: 18, y: 0, vx: 22, vy: (y / (HALF_LENGTH - 18)) * 22, z: BALL.radius });
  match.owner = null;
  match.lastTouch = { team: 'home', id: 'home-7' };
  const events = play(match, (i) => ({ 'away-1': controlsAt(i, match) }), 1.2);
  return { match, events };
}

test('a diving keeper reaches a shot a standing keeper cannot, and can only push it away', () => {
  const standing = shotAt(2.1);
  assert.equal(standing.match.score.home, 1, 'a shot 2 m wide of a standing keeper is a goal');
  const diving = shotAt(2.1, (i) => (i === 0 ? { dive: 1 } : {}));
  assert.equal(diving.match.score.home, 0, 'the dive keeps it out');
  const saves = diving.events.filter((e) => e.type === 'save');
  assert.equal(saves.length, 1);
  assert.equal(saves[0].held, false, 'a diving keeper parries, he does not hold it');
  assert.equal(CONTROL.keeperDiveReach > CONTROL.keeperCatchReach, true);
});

test('a dive launches sideways, commits for its duration and cannot be started twice or while down', () => {
  const keeper = { x: 26, y: 0, vx: 3, vy: 0, heading: Math.PI, down: 0, action: null };
  assert.ok(startDive(keeper, -1));
  assert.equal(keeper.action.type, 'dive');
  assert.ok(keeper.vy < -CONTROL.keeperDiveSpeed + 1e-9 && keeper.vx < 3);
  assert.equal(startDive(keeper, 1), false, 'already diving');
  assert.equal(startDive({ ...keeper, action: null, down: 1 }, 1), false, 'not while lying down');
  const standing = { team: 'away', x: 26, y: 0, down: 0, action: null };
  const ball = { x: 25.5, y: 1.0, z: BALL.radius, vx: 10, vy: 0, vz: 0 };
  assert.equal(keeperContact(standing, { ...ball }), null, 'out of reach standing');
  assert.equal(keeperContact({ ...standing, action: { type: 'dive' } }, { ...ball }), 'parry', 'in reach diving, and not holdable');
});

test('a catch, a header and a parry give the player the matching animation', () => {
  const held = createMatch();
  held.phase = 'play';
  clearField(held);
  place(held, 'away-1', 26.2, 0);
  Object.assign(held.ball, { x: 25, y: 0.2, vx: 8, vy: 0 });
  held.lastTouch = { team: 'home', id: 'home-7' };
  play(held, {}, 0.3);
  assert.equal(held.owner, 'away-1');
  assert.equal(playerById(held, 'away-1').action?.type, 'catch');
  assert.equal(pickAnimation(playerById(held, 'away-1')).action, 'gk-catch');

  const headed = createMatch();
  headed.phase = 'play';
  clearField(headed);
  place(headed, 'home-6', 0, 0);
  Object.assign(headed.ball, { x: 0.2, y: 0, z: 1.6, vx: -4, vy: 0, vz: 0 });
  headed.owner = null;
  const events = play(headed, {}, 0.05);
  assert.ok(events.some((e) => e.type === 'header'));
  assert.equal(playerById(headed, 'home-6').action?.type, 'header');
  assert.equal(pickAnimation(playerById(headed, 'home-6')).action, 'header');

  const parry = shotAt(2.1, (i) => (i === 0 ? { dive: 1 } : {}));
  assert.equal(pickAnimation({ role: 'GK', vx: 0, vy: 0, down: 0, action: { type: 'dive', t: 0.3, duration: 0.7 } }).action, 'gk-dive');
  assert.ok(parry.events.some((e) => e.type === 'save'));
});

test('every animation the game can pick has frames, including the throw-in pose', () => {
  const base = { role: 'CM', vx: 0, vy: 0, down: 0 };
  const picks = [
    pickAnimation({ ...base, action: { type: 'header', t: 0.1, duration: 0.4 } }),
    pickAnimation({ ...base, action: { type: 'catch', t: 0.1, duration: 0.5 } }),
    pickAnimation({ ...base, role: 'GK', action: { type: 'dive', t: 0.6, duration: 0.7 } }),
    pickAnimation(base, { throwIn: true }),
    pickAnimation(base, { celebrating: true }),
  ];
  for (const { action, frame } of picks) assert.ok(frame >= 0 && frame < ACTION_FRAMES[action], `${action} ${frame}`);
  assert.deepEqual(pickAnimation(base, { throwIn: true }), { action: 'throw', frame: 1 });
});

test('a ball dropped on the grass announces its bounces, and a ball hitting the frame announces the post', () => {
  const dropped = createMatch();
  dropped.phase = 'play';
  clearField(dropped);
  Object.assign(dropped.ball, { x: 0, y: 0, z: 3, vx: 0, vy: 0, vz: 0 });
  dropped.owner = null;
  const bounces = play(dropped, {}, 2).filter((e) => e.type === 'bounce');
  assert.ok(bounces.length >= 2 && bounces[0].speed > bounces[1].speed, `${bounces.length} bounces, each softer`);

  const struck = createMatch();
  struck.phase = 'play';
  clearField(struck);
  place(struck, 'away-1', 0, 15);
  Object.assign(struck.ball, { x: HALF_LENGTH - 3, y: HALF_MOUTH, vx: 20, vy: 0, z: 0.5 });
  struck.owner = null;
  struck.lastTouch = { team: 'home', id: 'home-7' };
  const events = play(struck, {}, 0.6);
  assert.ok(events.some((e) => e.type === 'post'), 'the post is heard');
  assert.equal(struck.score.home, 0, 'and the ball did not go in');
});

test('events map to the right sounds, and quiet bounces make none', () => {
  assert.equal(soundFor({ type: 'post' }), 'post');
  assert.equal(soundFor({ type: 'bounce', speed: 6 }), 'bounce');
  assert.equal(soundFor({ type: 'bounce', speed: 1.8 }), null);
  assert.equal(soundFor({ type: 'goal' }), 'goal');
  assert.equal(soundFor({ type: 'nonsense' }), null);
});

test('the keeper AI dives for a shot beyond arm reach, not for one at him or one far too early', () => {
  const match = createMatch();
  match.phase = 'play';
  clearField(match);
  place(match, 'away-1', HALF_LENGTH - 1.2, 0);
  match.lastTouch = { team: 'home', id: 'home-7' };
  match.owner = null;
  const control = (seen, skill = 1) => keeperControl(makeContext(match), { ...DIFFICULTIES.hard, keeperSkill: skill }, makeContext(match).byId.get('away-1'), seen);
  let dives = 0;
  for (let i = 0; i < 20; i += 1) { match.time += 0.1; if (control({ x: 20, y: 2.1, vx: 22, vy: 0 }).dive === 1) dives += 1; }
  assert.ok(dives > 15, `a good keeper dives toward +y (${dives}/20)`);
  assert.equal(control({ x: 20, y: 0, vx: 22, vy: 0 }).dive, 0, 'a shot at him needs no dive');
  assert.equal(control({ x: 4, y: 2.1, vx: 22, vy: 0 }).dive, 0, 'too early to commit');
});
