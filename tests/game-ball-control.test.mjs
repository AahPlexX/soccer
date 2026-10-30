import test from 'node:test';
import assert from 'node:assert/strict';
import { BALL, flightAt, restingBall, stepBall } from '../js/ball-physics.js';
import { CONTROL, assistedAim, bestPassTarget, canControl, carryBall, headerContact, keeperContact, kickPass, kickShot, leadTarget, startTackle, tackleContact, trapBall } from '../js/game/ball-control.js';
import { createPlayer } from '../js/game/player-physics.js';

const player = (id, x, y, team = 'home', extra = {}) => Object.assign(createPlayer({ id, team, role: 'CM', x, y }), extra);
const ballAt = (x, y, extra = {}) => Object.assign(restingBall(x, y), extra);

test('a player controls a close, low, slow ball and nothing else', () => {
  const p = player('home-2', 0, 0);
  assert.ok(canControl(p, ballAt(0.3, 0)));
  assert.ok(!canControl(p, ballAt(0.9, 0)), 'too far');
  assert.ok(!canControl(p, ballAt(0.2, 0, { z: 1.8 })), 'too high');
  assert.ok(!canControl(p, ballAt(0.2, 0, { vx: 12 })), 'too fast relative to the player');
  assert.ok(canControl(Object.assign(p, { vx: 6 }), ballAt(0.2, 0, { vx: 9 })), 'speed is relative to the player');
  assert.ok(!canControl(Object.assign(p, { down: 1 }), ballAt(0.2, 0)), 'not while lying down');
  assert.ok(!canControl(Object.assign(p, { down: 0, action: { type: 'slide', t: 0, duration: 1 } }), ballAt(0.2, 0)), 'not while sliding');
});

test('a first touch kills most of the relative speed', () => {
  const p = player('home-2', 0, 0, 'home', { vx: 2 });
  const ball = ballAt(0.2, 0, { vx: 8, vy: 0 });
  trapBall(p, ball);
  assert.ok(Math.abs(ball.vx - (2 + 6 * CONTROL.trapKeep)) < 1e-9);
});

test('an owner keeps the ball at their feet standing, pushes it ahead running, and loses it when it gets away', () => {
  const standing = player('home-2', 0, 0, 'home', { heading: 0 });
  const held = ballAt(0.6, 0.2);
  const touch = { clock: 0 };
  for (let i = 0; i < 240; i += 1) { assert.ok(carryBall(standing, held, touch, 1 / 120)); stepBall(held, 1 / 120); }
  assert.ok(Math.hypot(held.x - 0.4, held.y) < 0.1, `settles in front of the feet (${held.x}, ${held.y})`);

  const runner = player('home-3', 0, 0, 'home', { heading: 0, vx: 5.5 });
  const rolling = ballAt(0.4, 0, { vx: 5.5 }); // already moving with the runner, as after a first touch
  const runTouch = { clock: 0 };
  let kept = true;
  let maxLead = 0;
  for (let i = 0; i < 360 && kept; i += 1) {
    runner.x += runner.vx / 120;
    kept = carryBall(runner, rolling, runTouch, 1 / 120);
    stepBall(rolling, 1 / 120);
    maxLead = Math.max(maxLead, rolling.x - runner.x);
  }
  assert.ok(kept, 'a runner keeps the ball over three seconds');
  assert.ok(maxLead > 0.4 && maxLead <= 1, `the ball runs ahead of the feet (${maxLead})`);

  assert.equal(carryBall(player('home-4', 0, 0), ballAt(3, 0), { clock: 0 }, 1 / 120), false, 'out of reach');
});

test('a ground pass reaches its target low and still rolling, a lob lands on it', () => {
  const ground = ballAt(0, 0);
  kickPass(ground, { x: 15, y: 4 });
  let peak = 0;
  for (let i = 0; i < 120 * 4; i += 1) { stepBall(ground, 1 / 120); peak = Math.max(peak, ground.z); if (ground.x >= 14.8) break; }
  assert.ok(Math.hypot(ground.x - 15, ground.y - 4) < 1, `arrives near the target (${ground.x}, ${ground.y})`);
  assert.ok(peak < BALL.radius + 0.1, 'stays on the grass');

  const lob = ballAt(0, 0);
  kickPass(lob, { x: 14, y: 0 }, { lob: true });
  let apex = 0;
  let landed = null;
  for (let i = 0; i < 120 * 4 && !landed; i += 1) {
    stepBall(lob, 1 / 120);
    apex = Math.max(apex, lob.z);
    if (i > 20 && lob.z <= BALL.radius + 1e-6) landed = { x: lob.x, y: lob.y };
  }
  assert.ok(apex > 2.5, `a lob goes up (${apex})`);
  assert.ok(landed && Math.abs(landed.x - 14) < 2.5, `and lands near the target (${landed?.x})`);
});

test('leading a pass aims ahead of a running teammate', () => {
  const ball = ballAt(0, 0);
  const lead = leadTarget(ball, { x: 10, y: 0, vx: 0, vy: 5 });
  assert.ok(lead.y > 1 && lead.x === 10);
  assert.deepEqual(leadTarget(ball, { x: 10, y: 3, vx: 0, vy: 0 }), { x: 10, y: 3 });
});

test('pass target selection follows the held direction and prefers open teammates', () => {
  const passer = player('home-5', 0, 0, 'home', { heading: 0 });
  const ahead = player('home-6', 10, 0);
  const up = player('home-7', 0, 10);
  const mates = [passer, ahead, up];
  assert.equal(bestPassTarget(passer, mates, { x: 1, y: 0 }).id, 'home-6');
  assert.equal(bestPassTarget(passer, mates, { x: 0, y: 1 }).id, 'home-7');
  assert.equal(bestPassTarget(passer, mates, { x: -1, y: 0 }), null, 'nobody behind');
  const marker = player('away-3', 5, 0, 'away');
  const free = player('home-3', 10, 6);
  assert.equal(bestPassTarget(passer, [passer, ahead, free], { x: 0, y: 0 }, [marker]).id, 'home-3', 'a marked lane is avoided with no direction held');
  assert.equal(bestPassTarget(passer, [passer, player('home-2', 1, 0)], { x: 0, y: 0 }), null, 'too close to pass to');
  assert.equal(bestPassTarget(passer, [passer, player('home-8', 8, 0, 'home', { down: 1 })], { x: 1, y: 0 }), null, 'not to a player on the floor');
});

test('a bigger shot charge is faster and higher, and aim assist only helps shots already near the goal', () => {
  const soft = ballAt(0, 0);
  const hard = ballAt(0, 0);
  const a = kickShot(soft, 0.1, { x: 1, y: 0 });
  const b = kickShot(hard, 1, { x: 1, y: 0 });
  assert.ok(b.speed > a.speed && b.elevation > a.elevation);
  assert.ok(Math.hypot(hard.vx, hard.vy, hard.vz) > 27 && hard.vz > 8);
  assert.equal(kickShot(ballAt(0, 0), 5, { x: 1, y: 0 }).speed, CONTROL.shotMaxSpeed, 'charge is clamped');
  const curl = ballAt(0, 0);
  kickShot(curl, 0.5, { x: 1, y: 0 }, 1);
  assert.ok(curl.wz > 0);
  const shooter = player('home-7', 18, 5, 'home', { heading: 0 });
  const wide = assistedAim(shooter, { x: 1, y: 1 });
  assert.ok(Math.abs(Math.atan2(wide.y, wide.x) - Math.PI / 4) < 1e-9, 'a 45 degree shot is left alone');
  const near = assistedAim(shooter, { x: 1, y: -0.15 });
  assert.ok(Math.atan2(near.y, near.x) < Math.atan2(-0.15, 1), 'a nearly aimed shot is pulled toward the goal (which is at lower y from here)');
  const flight = flightAt(CONTROL.shotMaxSpeed, 0.45, 20);
  assert.ok(flight && flight.height > 2.44, 'a full charge from range goes over the bar');
});

test('a stand tackle or slide dislodges the ball, and a slide that misses the ball is a foul', () => {
  const tackler = player('away-3', 0, 0, 'away', { heading: 0 });
  const carrier = player('home-6', 1.2, 0);
  const ball = ballAt(0.7, 0);
  assert.ok(startTackle(tackler));
  assert.ok(!startTackle(tackler), 'one tackle at a time');
  tackler.action.t = 0.1;
  assert.equal(tackleContact(tackler, ball, [carrier], 'home-6'), 'ball');
  assert.ok(ball.vx > 3 && carrier.down > 0, 'the ball is knocked away and the carrier is rocked');

  const slider = player('away-4', 0, 0, 'away', { heading: 0 });
  startTackle(slider, { slide: true });
  assert.ok(slider.vx > 7);
  const bystander = player('home-2', 0.5, 0);
  slider.action.t = 0.1;
  assert.equal(tackleContact(slider, ballAt(9, 9), [bystander], 'home-6'), 'foul');
  assert.ok(bystander.down > 0);
  assert.equal(tackleContact(slider, ballAt(9, 9), [player('home-9', 0.5, 0)], 'home-6'), null, 'the action ended with the foul');
  assert.equal(tackleContact(player('away-5', 0, 0, 'away'), ballAt(0.5, 0), [], null), null, 'no tackle, no contact');
});

test('a keeper catches slow low shots, parries hard or high ones, and is beaten by the hardest', () => {
  const keeper = player('away-1', 26, 0, 'away', { heading: Math.PI });
  assert.equal(keeperContact(keeper, ballAt(25.5, 0.2, { vx: 8 })), 'catch');
  const hard = ballAt(25.5, 0.2, { vx: 20 });
  assert.equal(keeperContact(keeper, hard), 'parry');
  assert.ok(hard.vx < 0 && hard.vz > 0, 'a parry pushes the ball back into play and up');
  assert.equal(keeperContact(keeper, ballAt(25.5, 0.2, { vx: 8, z: 2.0 })), 'parry', 'a ball above catching height cannot be held');
  assert.equal(keeperContact(keeper, ballAt(25.5, 0.2, { vx: 30 })), null, 'beaten by pace');
  assert.equal(keeperContact(keeper, ballAt(20, 0, { vx: 8 })), null, 'out of reach');
  assert.equal(keeperContact(keeper, ballAt(25.5, 0, { vx: 8, z: 3 })), null, 'over the keeper');
});

test('a header redirects a ball at head height along the player heading', () => {
  const p = player('home-7', 0, 0, 'home', { heading: 0 });
  const high = ballAt(0.2, 0, { z: 1.6, vx: -4 });
  assert.ok(headerContact(p, high));
  assert.ok(high.vx > 3 && high.vz > 0);
  assert.ok(!headerContact(p, ballAt(0.2, 0, { z: 0.3 })), 'a low ball is not headed');
  assert.ok(!headerContact(p, ballAt(0.2, 0, { z: 3 })), 'out of reach above');
});
