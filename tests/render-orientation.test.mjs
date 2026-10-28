import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../js/state.js';

class Element {
  constructor() { this.attributes = {}; this.children = []; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...(selector === '.object-visual' && child.attributes.class?.split(' ').includes('object-visual') ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
}

test('rebuilt tokens retain the current portrait orientation and return upright in landscape', async () => {
  globalThis.document = { addEventListener() {}, createElementNS: () => new Element() };
  const { rebuildObjects, setSceneOrientation } = await import('../js/render.js');
  const svg = new Element();
  const layers = Object.fromEntries(['pitch-world', 'player-layer', 'ball-layer', 'prop-layer', 'drawing-layer'].map((id) => [id, new Element()]));
  svg.querySelector = (selector) => layers[selector.slice(1)] ?? null;
  svg.querySelectorAll = (selector) => Object.values(layers).flatMap((layer) => layer.querySelectorAll(selector));
  const state = createInitialState();

  setSceneOrientation(svg, true);
  rebuildObjects(svg, state);
  assert.ok(svg.querySelectorAll('.object-visual').length > 0);
  assert.ok(svg.querySelectorAll('.object-visual').every((node) => node.getAttribute('transform') === 'rotate(-90)'));
  setSceneOrientation(svg, false);
  rebuildObjects(svg, state);
  assert.ok(svg.querySelectorAll('.object-visual').every((node) => node.getAttribute('transform') === null));
});
