import test from 'node:test';
import assert from 'node:assert/strict';
import { IDENTITY_VIEW, ZOOM_RANGE, clampView, panBy, viewBoxSize, viewTransform, zoomAt } from '../js/view-zoom.js';

const W = 1000;
const H = 680;
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} ${actual} != ${expected}`);

test('the identity view shows the whole pitch and survives clamping', () => {
  assert.deepEqual(clampView(IDENTITY_VIEW, W, H), { scale: 1, x: 0, y: 0 });
  assert.equal(viewTransform(IDENTITY_VIEW), 'translate(0 0) scale(1)');
});

test('scale is limited to the zoom range', () => {
  assert.equal(clampView({ scale: 99, x: 0, y: 0 }, W, H).scale, ZOOM_RANGE.max);
  assert.equal(clampView({ scale: 0.1, x: 0, y: 0 }, W, H).scale, ZOOM_RANGE.min);
});

test('zooming keeps the focus point fixed on screen', () => {
  for (const [fx, fy] of [[500, 340], [100, 50], [900, 600]]) {
    const view = zoomAt(IDENTITY_VIEW, 2.5, fx, fy, W, H);
    near(view.scale * fx + view.x, fx, `x focus ${fx}`);
    near(view.scale * fy + view.y, fy, `y focus ${fy}`);
  }
});

test('zoomed content always covers the viewport, so the pitch never leaves the screen', () => {
  const zoomed = zoomAt(IDENTITY_VIEW, 2, 0, 0, W, H);
  const pannedFar = panBy(zoomed, -5000, -5000, W, H);
  assert.deepEqual([pannedFar.x, pannedFar.y], [W * (1 - 2), H * (1 - 2)]);
  const pannedOtherWay = panBy(zoomed, 5000, 5000, W, H);
  assert.deepEqual([pannedOtherWay.x, pannedOtherWay.y], [0, 0]);
});

test('zooming at the limit changes nothing and zooming back out returns to the full pitch', () => {
  let view = IDENTITY_VIEW;
  for (let i = 0; i < 10; i += 1) view = zoomAt(view, 1.4, 700, 200, W, H);
  assert.equal(view.scale, ZOOM_RANGE.max);
  const atLimit = zoomAt(view, 1.4, 700, 200, W, H);
  assert.deepEqual(atLimit, view);
  for (let i = 0; i < 12; i += 1) view = zoomAt(view, 1 / 1.4, 700, 200, W, H);
  assert.deepEqual(view, { scale: 1, x: 0, y: 0 });
});

test('portrait boards clamp against their own viewport size', () => {
  const view = panBy(zoomAt(IDENTITY_VIEW, 2, 0, 0, 680, 1000), -9999, -9999, 680, 1000);
  assert.deepEqual([view.x, view.y], [-680, -1000]);
});

test('the viewport size is read from the SVG viewBox attribute', () => {
  assert.deepEqual(viewBoxSize('0 0 1000 680'), { width: 1000, height: 680 });
  assert.deepEqual(viewBoxSize('0 0 680 1000'), { width: 680, height: 1000 });
  assert.deepEqual(viewBoxSize(' 0,0,1000,680 '), { width: 1000, height: 680 });
});
