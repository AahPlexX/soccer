import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMERA_PRESETS, ORBIT_LIMITS, PITCH_WORLD, clampOrbit, followOrbit, groundPerPixel, orbitPosition, panOrbit, presetOrbit, rotateOrbit, zoomOrbit,
} from '../js/camera-orbit.js';

const near = (actual, expected, message = '') => assert.ok(Math.abs(actual - expected) < 1e-9, `${message} ${actual} != ${expected}`);

test('the top-down preset looks straight down from above the middle of the pitch', () => {
  const position = orbitPosition(presetOrbit('top'));
  near(position.x, 0);
  assert.ok(position.y > 60, 'high above the pitch');
  assert.ok(Math.abs(position.z) < 2, 'nearly over the center');
});

test('the broadcast preset is above and beyond the near touchline, looking across the pitch', () => {
  const position = orbitPosition(presetOrbit('broadcast'));
  near(position.x, 0);
  assert.ok(position.z > PITCH_WORLD.width / 2, 'beyond the +z touchline');
  assert.ok(position.y > 20 && position.y < position.z * 2);
});

test('the behind-our-goal preset sits beyond our goal line (negative x) at the pitch centerline', () => {
  const position = orbitPosition(presetOrbit('goal'));
  assert.ok(position.x < -PITCH_WORLD.length / 2, 'behind our goal');
  assert.ok(Math.abs(position.z) < 1e-9);
  assert.ok(position.y > 5);
});

test('the sideline preset is the lowest preset', () => {
  const heights = Object.keys(CAMERA_PRESETS).map((name) => orbitPosition(presetOrbit(name)).y);
  assert.equal(orbitPosition(presetOrbit('sideline')).y, Math.min(...heights));
});

test('the follow camera eases its target toward a point, converges, and stays near the pitch', () => {
  let orbit = presetOrbit('broadcast');
  const point = { x: 20, z: -10 };
  const first = followOrbit(orbit, point);
  assert.ok(first.target.x > orbit.target.x && first.target.z < orbit.target.z);
  assert.ok(Math.abs(first.target.x - point.x) < Math.abs(orbit.target.x - point.x));
  for (let i = 0; i < 120; i += 1) orbit = followOrbit(orbit, point);
  assert.ok(Math.abs(orbit.target.x - point.x) < 0.01 && Math.abs(orbit.target.z - point.z) < 0.01);
  assert.equal(orbit.distance, presetOrbit('broadcast').distance, 'zoom and angle are untouched');
  const far = followOrbit(presetOrbit('top'), { x: 1000, z: 1000 }, 1);
  assert.ok(far.target.x <= PITCH_WORLD.length / 2 + ORBIT_LIMITS.panMargin);
});

test('half-field presets center on their own half and share the pitch-fitting widening', () => {
  assert.equal(presetOrbit('ourHalf').target.x, -PITCH_WORLD.length / 4);
  assert.equal(presetOrbit('theirHalf').target.x, PITCH_WORLD.length / 4);
  assert.equal(presetOrbit('broadcast').target.x, 0);
  assert.ok(presetOrbit('ourHalf', 0.6).distance > presetOrbit('ourHalf', 4 / 3).distance);
});

test('narrow viewports back the camera off so the pitch still fits; wide ones keep the base distance', () => {
  const base = presetOrbit('broadcast', 4 / 3).distance;
  assert.ok(presetOrbit('broadcast', 0.6).distance > base);
  near(presetOrbit('broadcast', 2).distance, base);
  near(presetOrbit('broadcast', Number.NaN).distance, base);
  assert.deepEqual(presetOrbit('nope'), presetOrbit('broadcast'));
});

test('dragging right swings the camera around and dragging down tilts toward top-down', () => {
  const start = presetOrbit('broadcast');
  const turned = rotateOrbit(start, 0.5, 0);
  assert.ok(turned.azimuth < start.azimuth);
  assert.equal(turned.polar, start.polar);
  assert.ok(rotateOrbit(start, 0, 0.2).polar < start.polar);
});

test('tilting is limited so the camera never goes under the ground or flips over the top', () => {
  assert.equal(rotateOrbit(presetOrbit('broadcast'), 0, -9).polar, ORBIT_LIMITS.polar.max);
  assert.equal(rotateOrbit(presetOrbit('broadcast'), 0, 9).polar, ORBIT_LIMITS.polar.min);
  assert.ok(orbitPosition(rotateOrbit(presetOrbit('broadcast'), 0, -9)).y > 0);
});

test('zooming halves or doubles the distance and stays within limits', () => {
  const start = { ...presetOrbit('broadcast'), distance: 60 };
  near(zoomOrbit(start, 2).distance, 30);
  near(zoomOrbit(start, 0.5).distance, 110);
  assert.equal(zoomOrbit(start, 1000).distance, ORBIT_LIMITS.distance.min);
  assert.equal(zoomOrbit(start, 0.001).distance, ORBIT_LIMITS.distance.max);
});

test('panning moves the target along the ground relative to the camera direction', () => {
  const facingAcross = { ...presetOrbit('broadcast'), azimuth: 0 };
  const right = panOrbit(facingAcross, 5, 0);
  near(right.target.x, 5);
  near(right.target.z, 0);
  const forward = panOrbit(facingAcross, 0, 5);
  near(forward.target.x, 0);
  near(forward.target.z, -5);
  const fromTheSide = { ...presetOrbit('broadcast'), azimuth: Math.PI / 2 };
  near(panOrbit(fromTheSide, 0, 5).target.x, -5);
  near(panOrbit(fromTheSide, 5, 0).target.z, -5);
});

test('the pan target cannot leave the pitch area', () => {
  const far = panOrbit(presetOrbit('top'), 9999, 9999); // far right and far forward (away from the camera, toward -z)
  assert.equal(far.target.x, PITCH_WORLD.length / 2 + ORBIT_LIMITS.panMargin);
  assert.equal(far.target.z, -PITCH_WORLD.width / 2 - ORBIT_LIMITS.panMargin);
  assert.deepEqual(clampOrbit(far), far);
});

test('ground per pixel shrinks as the camera zooms in', () => {
  const closer = groundPerPixel({ distance: 30 }, 800);
  const farther = groundPerPixel({ distance: 60 }, 800);
  near(farther, closer * 2);
  assert.ok(Number.isFinite(groundPerPixel({ distance: 30 }, 0)));
});
