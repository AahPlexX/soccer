import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const render = readFileSync(new URL('../js/render.js', import.meta.url), 'utf8');

// SVG's default fill is solid black. The outer pitch rectangle is drawn after (on top of) the zone overlays, so unless
// markings default to no fill it hides the grass and every zone highlight even though the zone logic works.
test('pitch markings default to no fill so zone overlays and the grass stay visible', () => {
  assert.match(css, /\.pitch-markings\s*\{[^}]*\bfill:\s*none\b/);
  assert.ok(render.includes("class: 'pitch-markings'"), 'the markings group must carry the pitch-markings class');
});

test('the zone layer is drawn beneath the pitch markings', () => {
  assert.ok(render.indexOf('parent.append(zones)') < render.indexOf('parent.append(markings)'));
});
