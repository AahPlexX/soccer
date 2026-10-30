import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = { addEventListener() {}, createElementNS: () => ({ setAttribute() {}, append() {} }) };
const { ballHeightLook } = await import('../js/render.js');

test('a ball on the grass is drawn unlifted, full size, with a full shadow', () => {
  assert.deepEqual(ballHeightLook(0.105), { lift: 0, scale: 1, opacity: 1 });
  assert.deepEqual(ballHeightLook(), ballHeightLook(0.105));
});

test('a ball in the air rises, grows and loses its shadow, within sane limits', () => {
  const low = ballHeightLook(1);
  const high = ballHeightLook(5);
  assert.ok(high.lift > low.lift && low.lift > 0);
  assert.ok(high.scale > low.scale && low.scale > 1);
  assert.ok(high.opacity < low.opacity && low.opacity < 1);
  const absurd = ballHeightLook(1000);
  assert.ok(absurd.lift <= 60 && absurd.scale <= 1.4 && absurd.opacity > 0);
});

test('a missing, underground or non-finite height never produces NaN', () => {
  for (const z of [undefined, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
    const look = ballHeightLook(z);
    assert.ok(Object.values(look).every(Number.isFinite), String(z));
  }
});
