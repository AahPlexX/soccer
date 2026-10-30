import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  BALL, GOAL_HEIGHT, POST, WORLD, ballEnergy, dragCoefficient, flightAt, goalColliders, groundPassSpeed, isResting, landingRange,
  launchVelocity, lobSpeed, restingBall, restitution, shotElevation, speedOf, stepBall,
} from '../js/ball-physics.js';

const R = BALL.radius;
const run = (ball, seconds, colliders = [], dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) stepBall(ball, dt, colliders);
  return ball;
};
const launch = (speed, heading, elevation, spin = {}) => ({ ...restingBall(0, 0), z: R + 1e-4, ...launchVelocity(speed, heading, elevation), wx: 0, wy: 0, wz: 0, ...spin });

test('a dropped ball falls with gravity (and a little drag), then bounces with the right restitution', () => {
  const ball = { ...restingBall(0, 0), z: R + 2 };
  let t = 0;
  while (ball.z > R + 1e-9 && t < 3) { stepBall(ball, 1 / 240); t += 1 / 240; }
  assert.ok(t > 0.62 && t < 0.7, `fall time ${t}`);
  // Rebound apexes shrink bounce after bounce and the ball ends at rest.
  const dropped = { ...restingBall(0, 0), z: R + 3 };
  const apexes = [];
  let previousVz = 0;
  for (let i = 0; i < 60 * 14; i += 1) {
    stepBall(dropped, 1 / 60);
    if (previousVz > 0 && dropped.vz <= 0) apexes.push(dropped.z - R);
    previousVz = dropped.vz;
  }
  assert.ok(apexes.length >= 3, 'several bounces');
  apexes.slice(1).forEach((apex, i) => assert.ok(apex < apexes[i], 'each bounce is lower'));
  assert.ok(apexes[0] > 0.9 && apexes[0] < 1.6, `first rebound height ${apexes[0]}`);
  assert.ok(isResting(dropped), 'it comes to rest');
});

test('a rolling ball slows on the grass, never reverses, and stops within a sensible distance', () => {
  const ball = launch(10, 0, 0);
  let farthest = 0;
  for (let i = 0; i < 60 * 20; i += 1) {
    stepBall(ball, 1 / 60);
    assert.ok(ball.vx >= -1e-9, 'never rolls backward');
    farthest = Math.max(farthest, ball.x);
  }
  assert.ok(isResting(ball));
  assert.ok(farthest > 15 && farthest < 39, `rolled ${farthest} m`);
});

test('drag is lower past the drag crisis, and slow bounces die out instead of chattering', () => {
  assert.ok(dragCoefficient(5) > dragCoefficient(15) && dragCoefficient(15) > dragCoefficient(30));
  assert.equal(restitution(0.3), 0);
  assert.ok(restitution(8) <= WORLD.restitution + 1e-12);
});

test('Magnus: topspin dips, backspin floats, sidespin curves the right way', () => {
  const heightAfter = (spin) => flightAt(24, 0.3, 14, spin)?.height;
  assert.ok(heightAfter(120) < heightAfter(0), 'topspin (wy > 0 for +x travel) drops sooner');
  assert.ok(heightAfter(-120) > heightAfter(0), 'backspin carries further');
  const curved = launch(22, 0, 0.1, { wz: 100 });
  run(curved, 0.8);
  assert.ok(curved.y > 0.05, 'counter-clockwise spin from above bends the ball toward +y');
  const other = launch(22, 0, 0.1, { wz: -100 });
  run(other, 0.8);
  assert.ok(other.y < -0.05);
});

test('goal posts and the crossbar are solid: the ball rebounds and never passes through them', () => {
  const goal = goalColliders({ halfLength: 27.4, halfMouth: 2.75 });
  assert.equal(goal.length, 6);
  const atPost = { ...launch(20, 0, 0), x: 25, y: -2.75, z: R + 0.3, vx: 20, vz: 0 };
  let minDistance = Infinity;
  for (let i = 0; i < 120; i += 1) {
    stepBall(atPost, 1 / 240, goal);
    minDistance = Math.min(minDistance, Math.hypot(atPost.x - 27.4, atPost.y + 2.75));
  }
  assert.ok(minDistance >= R + POST.radius - 0.02, `closest approach to the post axis ${minDistance}`);
  assert.ok(atPost.vx < 0 || atPost.x < 27.4, 'it came back off the post');
  const bar = { ...restingBall(27.4, 0), z: GOAL_HEIGHT + 0.6, vz: -6 };
  for (let i = 0; i < 240; i += 1) stepBall(bar, 1 / 240, goal);
  assert.ok(bar.z > GOAL_HEIGHT - R, 'a ball dropped on the bar bounces off it');
  const through = { ...launch(20, 0, 0), x: 25, y: 0, z: R + 0.5, vz: 0 };
  run(through, 0.5, goal);
  assert.ok(through.x > 28, 'a shot through the mouth passes the line');
});

test('launch solvers land where they are asked to', () => {
  for (const distance of [8, 15, 25, 38]) {
    const speed = groundPassSpeed(distance);
    const reached = flightAt(speed, 0, distance);
    assert.ok(reached, `a ground pass of ${distance} m arrives`);
    assert.ok(reached.speed >= 5 && reached.speed < 9, `arrival speed ${reached.speed}`);
  }
  for (const distance of [14, 22, 32]) {
    const speed = lobSpeed(distance, 0.5);
    assert.ok(Math.abs(landingRange(speed, 0.5) - distance) < 0.6, `lob of ${distance} m`);
  }
  for (const [distance, height] of [[18, 0.8], [18, 1.4], [26, 1.0]]) {
    const elevation = shotElevation(26, distance, height);
    const reached = flightAt(26, elevation, distance);
    assert.ok(Math.abs(reached.height - height) < 0.12, `shot height ${reached.height} vs ${height}`);
  }
});

test('the integrator is deterministic', () => {
  const a = run(launch(21, 0.4, 0.3, { wx: 30, wy: -80, wz: 60 }), 4);
  const b = run(launch(21, 0.4, 0.3, { wx: 30, wy: -80, wz: 60 }), 4);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

const stateArb = fc.record({
  speed: fc.double({ min: 0, max: 32, noNaN: true }),
  heading: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
  elevation: fc.double({ min: 0, max: 1.3, noNaN: true }),
  wx: fc.double({ min: -150, max: 150, noNaN: true }),
  wy: fc.double({ min: -150, max: 150, noNaN: true }),
  wz: fc.double({ min: -150, max: 150, noNaN: true }),
});

test('property: energy never increases, the ball never sinks into the grass, nothing is NaN', () => {
  fc.assert(fc.property(stateArb, ({ speed, heading, elevation, wx, wy, wz }) => {
    const ball = launch(speed, heading, elevation, { wx, wy, wz });
    const start = ballEnergy(ball);
    for (let i = 0; i < 60 * 6; i += 1) {
      stepBall(ball, 1 / 60);
      if (![ball.x, ball.y, ball.z, ball.vx, ball.vy, ball.vz].every(Number.isFinite)) return false;
      if (ball.z < R - 1e-9) return false;
    }
    return ballEnergy(ball) <= start + 0.05;
  }), { numRuns: 120 });
});

test('property: a half turn about the vertical axis rotates the whole trajectory with it', () => {
  fc.assert(fc.property(stateArb, ({ speed, heading, elevation, wx, wy, wz }) => {
    const a = launch(speed, heading, elevation, { wx, wy, wz });
    const b = { ...a, x: -a.x, y: -a.y, vx: -a.vx, vy: -a.vy, wx: -a.wx, wy: -a.wy };
    run(a, 3);
    run(b, 3);
    return Math.abs(b.x + a.x) < 1e-6 && Math.abs(b.y + a.y) < 1e-6 && Math.abs(b.z - a.z) < 1e-6;
  }), { numRuns: 80 });
});

test('property: a ground ball always comes to rest', () => {
  fc.assert(fc.property(fc.double({ min: 0.5, max: 30, noNaN: true }), (speed) => {
    const ball = launch(speed, 0.3, 0);
    run(ball, 40);
    return isResting(ball) && speedOf(ball) < 0.1;
  }), { numRuns: 60 });
});
