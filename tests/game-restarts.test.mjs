import test from 'node:test';
import assert from 'node:assert/strict';
import { BALL } from '../js/ball-physics.js';
import { scaleFor, visibleWidthFor } from '../js/game/camera.js';
import { bannerFor, hintFor } from '../js/game/hud.js';
import { MATCH, createMatch, drainEvents, playerById, stepMatch, teamOf } from '../js/game/match.js';
import { ACTION_FRAMES } from '../js/game/poses.js';
import { HALF_WIDTH } from '../js/game/rules.js';
import { BALL_SPRITE, drawBallFrame, pickAnimation } from '../js/game/sprites.js';

const DT = MATCH.step;

/** A match in play with everybody parked far from the action, and the ball just about to cross the top touchline. */
function ballOut({ lastTouch, humanTeam = 'home', x = 5 }) {
  const match = createMatch({ seed: 11, humanTeam });
  match.phase = 'play';
  match.players.forEach((p, i) => Object.assign(p, { x: p.team === 'home' ? -22 : 22, y: (i % 7) * 4 - 12, vx: 0, vy: 0 }));
  Object.assign(match.ball, { x, y: HALF_WIDTH - 0.2, z: BALL.radius, vx: 0, vy: 6, vz: 0 });
  match.owner = null;
  match.lastTouch = { team: lastTouch, id: `${lastTouch}-3` };
  for (let i = 0; i < 120 && match.phase === 'play'; i += 1) stepMatch(match, {}, DT);
  drainEvents(match);
  return match;
}

function run(match, controls, seconds) {
  const events = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) { stepMatch(match, typeof controls === 'function' ? controls(match) : controls, DT); events.push(...drainEvents(match)); }
  return events;
}

test('a throw-in goes to the team that did NOT touch the ball last, whichever team that is', () => {
  for (const lastTouch of ['home', 'away']) {
    for (const humanTeam of ['home', 'away']) {
      const match = ballOut({ lastTouch, humanTeam });
      assert.equal(match.phase, 'restart');
      assert.equal(match.restart.type, 'throw-in');
      assert.equal(match.restart.team, lastTouch === 'home' ? 'away' : 'home', `${lastTouch} kicked it out`);
    }
  }
});

test('at a throw-in the taker stands on the line holding the ball overhead, and nobody plays until it is thrown', () => {
  const match = ballOut({ lastTouch: 'away', humanTeam: 'home' });
  const taker = playerById(match, match.restart.takerId);
  assert.equal(taker.team, 'home');
  assert.equal(match.activeId, taker.id, 'the human controls his own taker');
  const spot = { ...match.restart.spot };
  run(match, { [taker.id]: { move: { x: 0, y: -1 }, sprint: true } }, 0.8);
  assert.equal(match.phase, 'restart', 'still waiting');
  assert.ok(Math.hypot(taker.x - spot.x, taker.y - spot.y) < 1e-9, 'he cannot walk off the line or dribble away');
  assert.ok(match.ball.z > 1.8, `the ball is over his head (${match.ball.z.toFixed(2)} m)`);
  assert.ok(Math.hypot(match.ball.x - spot.x, match.ball.y - spot.y) < 1e-9);
  assert.equal(match.owner, taker.id);
});

test('the computer takes its throw-in by itself after a moment, with a throwing action, to a teammate', () => {
  const match = ballOut({ lastTouch: 'home', humanTeam: 'home' }); // away's throw-in
  const taker = playerById(match, match.restart.takerId);
  assert.equal(taker.team, 'away');
  const events = [];
  let sawThrowAction = false;
  for (let i = 0; i < Math.round(3 / DT) && match.phase === 'restart'; i += 1) {
    stepMatch(match, {}, DT);
    events.push(...drainEvents(match));
    if (taker.action?.type === 'throw') sawThrowAction = true;
  }
  assert.equal(match.phase, 'play', 'play resumes');
  assert.ok(sawThrowAction, 'the taker threw with the throw action');
  const pass = events.find((event) => event.type === 'pass');
  assert.ok(pass?.throwIn && pass.lob, 'a high throw');
  assert.equal(pass.team, 'away');
  assert.ok(pass.to && playerById(match, pass.to).team === 'away', 'to a teammate');
  assert.equal(match.passTarget, pass.to);
  assert.ok(match.ball.z > 1 && Math.hypot(match.ball.vx, match.ball.vy) > 4, 'the ball is in the air and moving');
  assert.equal(match.owner, null);
});

test('the human aims the throw with the stick and throws with pass; he can take his time', () => {
  const match = ballOut({ lastTouch: 'away', humanTeam: 'home', x: 0 });
  const taker = playerById(match, match.restart.takerId);
  // One teammate to the left and one to the right, both down the pitch, so the aim decides who gets it.
  const [left, right] = teamOf(match, 'home').filter((p) => p.id !== taker.id && p.role !== 'GK');
  Object.assign(left, { x: taker.x - 10, y: taker.y - 5 });
  Object.assign(right, { x: taker.x + 10, y: taker.y - 5 });
  const aim = { x: 1, y: -0.5 };
  run(match, { [taker.id]: { move: aim } }, 3);
  assert.equal(match.phase, 'restart', 'he is still deciding after three seconds');
  assert.ok(Math.cos(taker.heading) > 0.5, 'he turned to face the way he is aiming');
  const events = run(match, () => ({ [taker.id]: { move: aim, pass: 'tap' } }), 1);
  const pass = events.find((event) => event.type === 'pass' && event.throwIn);
  assert.ok(pass, 'he threw');
  assert.equal(pass.to, right.id, 'to the teammate he aimed at');
  assert.equal(match.phase, 'play');
});

test('a human who does nothing is not stuck forever: the throw happens by itself', () => {
  const match = ballOut({ lastTouch: 'away', humanTeam: 'home' });
  const events = run(match, {}, MATCH.throwIn.humanTimeout + 1);
  assert.ok(events.some((event) => event.type === 'pass' && event.throwIn));
  assert.equal(match.phase, 'play');
});

test('the banner names the restart and who takes it, and the human is told how to throw', () => {
  const mine = ballOut({ lastTouch: 'away', humanTeam: 'home' });
  assert.equal(bannerFor(mine), 'THROW-IN · HOME');
  assert.match(hintFor(mine), /PASS/);
  const theirs = ballOut({ lastTouch: 'home', humanTeam: 'home' });
  assert.equal(bannerFor(theirs), 'THROW-IN · AWAY');
  assert.equal(hintFor(theirs), '', 'no instructions at the computer\'s throw-in');
  assert.equal(bannerFor({ phase: 'play' }), '');
  assert.equal(bannerFor({ phase: 'goal' }), 'GOAL!');
  mine.restart.state = 'throwing';
  assert.equal(hintFor(mine), '', 'and none once the throw has started');
});

test('the thrower is shown holding the ball up, then throwing', () => {
  const match = ballOut({ lastTouch: 'away', humanTeam: 'home' });
  const taker = playerById(match, match.restart.takerId);
  assert.deepEqual(pickAnimation(taker, { throwIn: true }), { action: 'throw', frame: 1 }, 'arms up while he waits');
  taker.action = { type: 'throw', t: 0.35, duration: 0.6 };
  const pose = pickAnimation(taker, { throwIn: true });
  assert.equal(pose.action, 'throw');
  assert.ok(pose.frame >= 0 && pose.frame < ACTION_FRAMES.throw);
  assert.ok(pose.frame >= 2, 'the release frame is the forward swing');
});

test('a teammate running onto a ground pass controls it instead of the ball bouncing off him', () => {
  for (const runSpeed of [0, 3, 5.5, 6.8]) {
    const match = createMatch({ seed: 4, humanTeam: 'none' });
    match.phase = 'play';
    match.activeId = null;
    match.players.forEach((p, i) => Object.assign(p, { x: p.team === 'home' ? -24 : 24, y: (i % 7) * 4 - 12, vx: 0, vy: 0 }));
    const [passer, receiver] = teamOf(match, 'home').filter((p) => p.role !== 'GK');
    Object.assign(passer, { x: 0, y: 0, heading: 0 });
    Object.assign(receiver, { x: 12, y: 0, vx: -runSpeed, heading: Math.PI });
    Object.assign(match.ball, { x: 0.3, y: 0, z: BALL.radius, vx: 0, vy: 0 });
    match.owner = passer.id;
    const events = run(match, { [passer.id]: { pass: 'tap', passTo: receiver.id }, [receiver.id]: { move: { x: -runSpeed / 5.5, y: 0 }, sprint: runSpeed > 5 } }, 3);
    const touches = events.filter((event) => event.type === 'touch' && event.id === receiver.id);
    assert.ok(touches.length >= 1, `the receiver (running at ${runSpeed} m/s) got a touch`);
    assert.equal(events.filter((event) => event.type === 'block' && event.team === 'home').length, 0, 'and it did not bounce off him');
  }
});

test('on a short phone screen the pitch is zoomed in so players and ball are readable; other screens are unchanged', () => {
  assert.equal(visibleWidthFor(1.78), visibleWidthFor(1.78, 720), 'a laptop is as before');
  assert.ok(visibleWidthFor(2.16, 390) < visibleWidthFor(2.16, 900) * 0.85, 'a phone sees noticeably less pitch');
  assert.ok(visibleWidthFor(2.16, 390) >= 24, 'but never a keyhole');
  assert.ok(scaleFor({ width: 844, height: 390 }) > 24, 'more than 24 px per meter on a 844x390 phone (it was 20)');
});

test('the ball is drawn at any size, round, shaded, turning, and unchanged at its small size', () => {
  for (const size of [BALL_SPRITE.size, 14, 22, 36]) {
    const frames = Array.from({ length: BALL_SPRITE.frames }, (_, f) => drawBallFrame(f, size));
    for (const frame of frames) {
      assert.equal(frame.width, size);
      let opaque = 0;
      for (let i = 3; i < frame.data.length; i += 4) if (frame.data[i]) opaque += 1;
      const area = opaque / (size * size);
      assert.ok(area > 0.68 && area < 0.84, `size ${size}: a disc (${area.toFixed(2)} of the square)`);
    }
    const key = (f) => Array.from(f.data).join(',');
    assert.ok(new Set(frames.map(key)).size === frames.length, `size ${size}: every frame differs, so it looks like it turns`);
  }
});
