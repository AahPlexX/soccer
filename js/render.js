import { PITCH, ZONES } from './constants.js';
import { playerColor } from './formations.js';
import { availablePassOptions, passOptionsStatus } from './pass-options.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 1000;
const H = 680;
const sx = (x) => x * W;
const sy = (y) => y * H;
let latestPassOptionSvg = null;
let latestPassOptionState = null;

document.addEventListener('pass-options-change', () => {
  if (latestPassOptionSvg && latestPassOptionState) renderPassOptions(latestPassOptionSvg, latestPassOptionState);
});

function el(name, attrs = {}, text = '') {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  if (text) node.textContent = text;
  return node;
}

function line(parent, x1, y1, x2, y2, className, extra = {}) {
  parent.append(el('line', { x1, y1, x2, y2, class: className, ...extra }));
}

function buildPitchMarkings(parent) {
  const zones = el('g', { id: 'zone-layer', 'aria-hidden': 'true' });
  Object.entries(ZONES).forEach(([id, zone]) => {
    zones.append(el('rect', {
      id: `zone-${id}`,
      x: sx(zone.x1), y: sy(zone.y1), width: sx(zone.x2 - zone.x1), height: sy(zone.y2 - zone.y1),
      class: 'zone-overlay',
      'data-zone-id': id,
    }));
  });
  parent.append(zones);

  const markings = el('g', { class: 'pitch-markings', 'aria-hidden': 'true' });
  markings.append(el('rect', { x: 3, y: 3, width: W - 6, height: H - 6, rx: 16, class: 'field-line' }));
  line(markings, sx(PITCH.halfwayX), 0, sx(PITCH.halfwayX), H, 'field-line');
  markings.append(el('circle', { cx: sx(0.5), cy: sy(0.5), r: sx(PITCH.centerCircleRadius), class: 'field-line field-fill-none' }));
  markings.append(el('circle', { cx: sx(0.5), cy: sy(0.5), r: 5, class: 'field-dot' }));

  markings.append(el('rect', { x: 0, y: sy(0.2), width: sx(0.2), height: sy(0.6), class: 'field-line field-fill-none' }));
  markings.append(el('rect', { x: sx(0.8), y: sy(0.2), width: sx(0.2), height: sy(0.6), class: 'field-line field-fill-none' }));
  markings.append(el('circle', { cx: sx(10 / 60), cy: sy(0.5), r: 5, class: 'field-dot' }));
  markings.append(el('circle', { cx: sx(1 - (10 / 60)), cy: sy(0.5), r: 5, class: 'field-dot' }));
  line(markings, sx(PITCH.homeBuildOutX), 0, sx(PITCH.homeBuildOutX), H, 'build-out-line');
  line(markings, sx(PITCH.awayBuildOutX), 0, sx(PITCH.awayBuildOutX), H, 'build-out-line');

  const goalWidthRatio = (18.5 / 3) / 40; // 18.5 ft on a nominal 40 yd wide field.
  const goalY = (1 - goalWidthRatio) / 2;
  markings.append(el('rect', { x: -18, y: sy(goalY), width: 18, height: sy(goalWidthRatio), class: 'goal-net' }));
  markings.append(el('rect', { x: W, y: sy(goalY), width: 18, height: sy(goalWidthRatio), class: 'goal-net' }));

  const arcRadius = 18;
  markings.append(el('path', { d: `M 0 ${arcRadius} A ${arcRadius} ${arcRadius} 0 0 0 ${arcRadius} 0`, class: 'field-line field-fill-none' }));
  markings.append(el('path', { d: `M ${W - arcRadius} 0 A ${arcRadius} ${arcRadius} 0 0 0 ${W} ${arcRadius}`, class: 'field-line field-fill-none' }));
  markings.append(el('path', { d: `M ${W} ${H - arcRadius} A ${arcRadius} ${arcRadius} 0 0 0 ${W - arcRadius} ${H}`, class: 'field-line field-fill-none' }));
  markings.append(el('path', { d: `M ${arcRadius} ${H} A ${arcRadius} ${arcRadius} 0 0 0 0 ${H - arcRadius}`, class: 'field-line field-fill-none' }));
  parent.append(markings);
}

function buildPassOptionLayer() {
  const layer = el('g', { id: 'pass-option-layer', 'aria-hidden': 'true' });
  for (let index = 0; index < 6; index += 1) {
    layer.append(el('line', {
      class: 'pass-option-line',
      'data-pass-slot': index,
      style: 'display:none',
    }));
  }
  return layer;
}

function renderPassOptions(svg, state) {
  const lines = [...svg.querySelectorAll('.pass-option-line')];
  const enabled = document.documentElement.dataset.passOptions === 'true';
  const carrier = enabled ? state.players.find((player) => player.id === state.simulation.carrierId) : null;
  const receivers = carrier ? availablePassOptions(state) : [];
  const status = document.querySelector('#pass-options-status');
  if (status) {
    status.hidden = !enabled;
    const message = enabled ? passOptionsStatus(state, receivers) : '';
    if (status.textContent !== message) status.textContent = message;
  }

  lines.forEach((node, index) => {
    const receiver = receivers[index];
    if (!carrier || !receiver) {
      node.style.display = 'none';
      return;
    }
    node.style.display = '';
    node.setAttribute('x1', String(sx(carrier.x)));
    node.setAttribute('y1', String(sy(carrier.y)));
    node.setAttribute('x2', String(sx(receiver.x)));
    node.setAttribute('y2', String(sy(receiver.y)));
  });
}

function buildPlayer(player, state) {
  const group = el('g', {
    id: `object-${player.id}`,
    class: `player-token team-${player.team}`,
    tabindex: '0',
    role: 'button',
    'aria-label': `${player.team === 'home' ? 'Our' : 'Opposing'} ${player.label || player.role}, number ${player.number}. Drag to move or use arrow keys.`,
    'data-object-id': player.id,
    'data-object-type': 'player',
  });
  const visual = el('g', { class: 'object-visual player-visual' });
  visual.append(el('circle', { r: 31, class: 'player-halo' }));
  visual.append(el('circle', { r: 25, class: 'player-disc', fill: playerColor(player, state) }));
  visual.append(el('text', { y: 2, class: 'player-number' }, String(player.number)));
  visual.append(el('text', { y: 47, class: 'player-label' }, player.label || player.role));
  group.append(visual);
  return group;
}

function buildBall(ball) {
  const group = el('g', {
    id: `object-${ball.id}`,
    class: 'ball-token',
    tabindex: '0',
    role: 'button',
    'aria-label': 'Soccer ball. Drag to move or use arrow keys.',
    'data-object-id': ball.id,
    'data-object-type': 'ball',
  });
  const visual = el('g', { class: 'object-visual ball-visual' });
  visual.append(el('circle', { r: 18, class: 'ball-hit' }));
  visual.append(el('circle', { r: 12, class: 'ball-core' }));
  visual.append(el('path', { d: 'M0-7 6-2 4 6-4 6-6-2Z', class: 'ball-patch' }));
  group.append(visual);
  return group;
}

function buildCone(cone) {
  const group = el('g', {
    id: `object-${cone.id}`,
    class: 'cone-token',
    tabindex: '0',
    role: 'button',
    'aria-label': 'Training cone. Drag to move or use arrow keys.',
    'data-object-id': cone.id,
    'data-object-type': 'cone',
  });
  const visual = el('g', { class: 'object-visual cone-visual' });
  visual.append(el('circle', { r: 24, class: 'cone-hit' }));
  visual.append(el('path', { d: 'M-14 13 0-18 14 13Z', class: 'cone-shape', fill: cone.color || '#ff8c1a' }));
  visual.append(el('rect', { x: -18, y: 12, width: 36, height: 6, rx: 3, class: 'cone-base', fill: cone.color || '#ff8c1a' }));
  group.append(visual);
  return group;
}

function buildMiniGoal(goal) {
  const group = el('g', {
    id: `object-${goal.id}`,
    class: 'minigoal-token',
    tabindex: '0',
    role: 'button',
    'aria-label': 'Mini goal. Drag to move or use arrow keys.',
    'data-object-id': goal.id,
    'data-object-type': 'minigoal',
  });
  const visual = el('g', { class: 'object-visual minigoal-visual' });
  visual.append(el('rect', { x: -28, y: -20, width: 56, height: 40, class: 'minigoal-hit' }));
  visual.append(el('rect', { x: -22, y: -14, width: 44, height: 28, class: 'minigoal-net' }));
  visual.append(el('path', { d: 'M-22 14V-14H22V14', class: 'minigoal-frame' }));
  group.append(visual);
  return group;
}

function drawingPath(points) {
  if (!points?.length) return '';
  return points.map((point, index) => `${index ? 'L' : 'M'}${sx(point.x)} ${sy(point.y)}`).join(' ');
}

function buildDrawing(drawing) {
  if (drawing.type !== 'freehand' && drawing.points.length >= 2) {
    const [start, end] = drawing.points;
    return el('line', {
      x1: sx(start.x), y1: sy(start.y), x2: sx(end.x), y2: sy(end.y),
      class: drawing.type === 'run' ? 'drawing-arrow drawing-run' : 'drawing-arrow', 'marker-end': 'url(#arrowhead)',
    });
  }
  return el('path', { d: drawingPath(drawing.points), class: 'drawing-freehand' });
}

export function initializeScene(svg, state) {
  svg.replaceChildren();
  svg.setAttribute('viewBox', '0 0 1000 680');
  const defs = el('defs');
  const marker = el('marker', { id: 'arrowhead', markerWidth: 10, markerHeight: 10, refX: 8, refY: 3, orient: 'auto', markerUnits: 'strokeWidth' });
  marker.append(el('path', { d: 'M0,0 L0,6 L9,3 z', class: 'arrow-head' }));
  defs.append(marker);
  svg.append(defs);

  const world = el('g', { id: 'pitch-world' });
  buildPitchMarkings(world);
  world.append(buildPassOptionLayer());
  world.append(el('g', { id: 'drawing-layer', 'aria-hidden': 'true' }));
  world.append(el('g', { id: 'prop-layer' }));
  world.append(el('g', { id: 'player-layer' }));
  world.append(el('g', { id: 'ball-layer' }));
  // #pitch-view carries the 2D zoom/pan transform (js/view-zoom.js); the world inside keeps the orientation transform.
  const view = el('g', { id: 'pitch-view' });
  view.append(world);
  svg.append(view);
  rebuildObjects(svg, state);
  renderScene(svg, state);
  return world;
}

export function rebuildObjects(svg, state) {
  const playerLayer = svg.querySelector('#player-layer');
  const ballLayer = svg.querySelector('#ball-layer');
  const propLayer = svg.querySelector('#prop-layer');
  const drawingLayer = svg.querySelector('#drawing-layer');
  playerLayer.replaceChildren(...state.players.map((player) => buildPlayer(player, state)));
  ballLayer.replaceChildren(...state.balls.map(buildBall));
  propLayer.replaceChildren(...state.cones.map(buildCone), ...state.miniGoals.map(buildMiniGoal));
  drawingLayer.replaceChildren(...state.drawings.map(buildDrawing));
  orientObjectVisuals(svg, svg.getAttribute('data-scene-orientation') === 'portrait');
}

function orientObjectVisuals(svg, portrait) {
  svg.querySelectorAll('.object-visual').forEach((node) => {
    if (portrait) node.setAttribute('transform', 'rotate(-90)');
    else node.removeAttribute('transform');
  });
}

export function setSceneOrientation(svg, portrait) {
  const world = svg.querySelector('#pitch-world');
  if (!world) return;
  svg.setAttribute('data-scene-orientation', portrait ? 'portrait' : 'landscape');
  if (portrait) {
    svg.setAttribute('viewBox', '0 0 680 1000');
    world.setAttribute('transform', 'translate(680 0) rotate(90)');
  } else {
    svg.setAttribute('viewBox', '0 0 1000 680');
    world.removeAttribute('transform');
  }
  orientObjectVisuals(svg, portrait);
}

export function renderScene(svg, state) {
  latestPassOptionSvg = svg;
  latestPassOptionState = state;
  document.documentElement.dataset.theme = state.theme;
  svg.querySelectorAll('.zone-overlay').forEach((node) => {
    const active = state.selectedZones.includes(node.dataset.zoneId);
    node.classList.toggle('is-active', active);
    node.style.setProperty('--zone-opacity', String(state.zoneOpacity));
  });
  renderPassOptions(svg, state);

  state.players.forEach((player) => {
    const node = svg.querySelector(`#object-${player.id}`);
    if (!node) return;
    node.setAttribute('transform', `translate(${sx(player.x)} ${sy(player.y)})`);
    node.toggleAttribute('hidden', (player.team === 'away' && !state.awayVisible) || player.benched === true);
    node.classList.toggle('is-selected', state.selectedObjectId === player.id);
    const disc = node.querySelector('.player-disc');
    if (disc) disc.setAttribute('fill', playerColor(player, state));
    const number = node.querySelector('.player-number');
    if (number) number.textContent = String(player.number);
    const label = node.querySelector('.player-label');
    if (label) label.textContent = player.label || player.role;
  });

  state.balls.forEach((ball) => {
    const node = svg.querySelector(`#object-${ball.id}`);
    if (node) {
      node.setAttribute('transform', `translate(${sx(ball.x)} ${sy(ball.y)})`);
      node.classList.toggle('is-selected', state.selectedObjectId === ball.id);
    }
  });
  [...state.cones, ...state.miniGoals].forEach((prop) => {
    const node = svg.querySelector(`#object-${prop.id}`);
    if (node) {
      node.setAttribute('transform', `translate(${sx(prop.x)} ${sy(prop.y)})`);
      node.classList.toggle('is-selected', state.selectedObjectId === prop.id);
    }
  });
}
