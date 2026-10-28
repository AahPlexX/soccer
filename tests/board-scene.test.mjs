import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { ZONES, PALETTE } from '../js/constants.js';
import { PITCH_WORLD } from '../js/camera-orbit.js';
import { buildBoardScene, drawNumberLabel, drawPitchTexture, toWorld } from '../js/board-scene.js';
import { createInitialState } from '../js/state.js';

const near = (actual, expected, message = '') => assert.ok(Math.abs(actual - expected) < 1e-9, `${message} ${actual} != ${expected}`);

function setup() {
  const state = createInitialState();
  const board = buildBoardScene(THREE);
  board.sync(state);
  return { state, board };
}

test('board coordinates map to world space with the 2D board orientation', () => {
  assert.deepEqual(toWorld(0.5, 0.5), { x: 0, z: 0 });
  near(toWorld(0, 0).x, -PITCH_WORLD.length / 2);
  near(toWorld(0, 0).z, -PITCH_WORLD.width / 2);
  near(toWorld(1, 1).x, PITCH_WORLD.length / 2);
  near(toWorld(1, 1).z, PITCH_WORLD.width / 2);
});

test('the scene shows every player, the ball, and one overlay per zone', () => {
  const { board } = setup();
  assert.deepEqual(board.counts(), { players: 14, balls: 1, cones: 0, miniGoals: 0, zones: Object.keys(ZONES).length });
});

test('players and the ball sit at their board positions and follow them when they move', () => {
  const { state, board } = setup();
  const player = state.players.find((p) => p.id === 'home-7');
  const expected = toWorld(player.x, player.y);
  const group = board.objectFor('home-7');
  near(group.position.x, expected.x);
  near(group.position.z, expected.z);
  near(group.position.y, 0);
  near(board.objectFor('ball-main').position.y, 0.45);

  player.x = 0.9;
  player.y = 0.1;
  board.sync(state);
  const moved = toWorld(0.9, 0.1);
  near(group.position.x, moved.x);
  near(group.position.z, moved.z);
});

test('hidden opponents and benched players disappear from the scene without being removed', () => {
  const { state, board } = setup();
  state.awayVisible = false;
  board.sync(state);
  assert.equal(board.objectFor('away-3').visible, false);
  assert.equal(board.objectFor('home-3').visible, true);
  state.awayVisible = true;
  state.players.find((p) => p.id === 'home-4').benched = true;
  board.sync(state);
  assert.equal(board.objectFor('away-3').visible, true);
  assert.equal(board.objectFor('home-4').visible, false);
  assert.equal(board.counts().players, 14);
});

test('team colors are applied to player bodies and follow color changes', () => {
  const { state, board } = setup();
  const body = (id) => board.objectFor(id).children[0].material.color.getHexString();
  assert.equal(body('home-3'), state.colors.home.slice(1).toLowerCase());
  assert.equal(body('home-1'), state.colors.homeGoalkeeper.slice(1).toLowerCase());
  state.colors.home = PALETTE.purple;
  state.players.find((p) => p.id === 'home-5').colorOverride = PALETTE.orange;
  board.sync(state);
  assert.equal(body('home-3'), PALETTE.purple.slice(1).toLowerCase());
  assert.equal(body('home-5'), PALETTE.orange.slice(1).toLowerCase());
});

test('cones and mini goals are added, colored, moved, and removed with the board', () => {
  const { state, board } = setup();
  state.cones.push({ id: 'c1', x: 0.25, y: 0.75, color: PALETTE.blue });
  state.miniGoals.push({ id: 'm1', x: 0.6, y: 0.5 });
  board.sync(state);
  assert.equal(board.counts().cones, 1);
  assert.equal(board.counts().miniGoals, 1);
  assert.equal(board.objectFor('c1').material.color.getHexString(), PALETTE.blue.slice(1).toLowerCase());
  near(board.objectFor('c1').position.x, toWorld(0.25, 0.75).x);
  state.cones[0].color = PALETTE.red;
  state.cones[0].x = 0.4;
  board.sync(state);
  assert.equal(board.objectFor('c1').material.color.getHexString(), PALETTE.red.slice(1).toLowerCase());
  near(board.objectFor('c1').position.x, toWorld(0.4, 0.75).x);
  state.cones = [];
  state.miniGoals = [];
  board.sync(state);
  assert.deepEqual([board.counts().cones, board.counts().miniGoals, board.objectFor('c1'), board.objectFor('m1')], [0, 0, null, null]);
});

test('extra balls appear and the primary ball stays', () => {
  const { state, board } = setup();
  state.balls.push({ id: 'ball-2', x: 0.2, y: 0.2, primary: false });
  board.sync(state);
  assert.equal(board.counts().balls, 2);
  state.balls = state.balls.filter((ball) => ball.primary);
  board.sync(state);
  assert.equal(board.counts().balls, 1);
});

test('selected zones show their overlay with the chosen opacity', () => {
  const { state, board } = setup();
  const overlays = board.scene.children.filter((child) => child.material?.transparent && child.geometry.type === 'PlaneGeometry');
  assert.equal(overlays.length, Object.keys(ZONES).length);
  assert.ok(overlays.every((overlay) => overlay.visible === false));
  state.selectedZones = ['left', 'homeBox'];
  state.zoneOpacity = 0.4;
  board.sync(state);
  assert.equal(overlays.filter((overlay) => overlay.visible).length, 2);
  assert.ok(overlays.every((overlay) => overlay.material.opacity === 0.4));
  state.selectedZones = [];
  board.sync(state);
  assert.ok(overlays.every((overlay) => overlay.visible === false));
});

test('the selected player gets a highlight ring', () => {
  const { state, board } = setup();
  const ring = (id) => board.objectFor(id).children.find((child) => child.geometry.type === 'RingGeometry');
  assert.equal(ring('home-2').visible, false);
  state.selectedObjectId = 'home-2';
  board.sync(state);
  assert.equal(ring('home-2').visible, true);
  assert.equal(ring('home-3').visible, false);
});

test('repeated syncs do not leak objects, and dispose clears the scene bookkeeping', () => {
  const { state, board } = setup();
  const before = board.scene.children.length;
  for (let i = 0; i < 20; i += 1) board.sync(state);
  assert.equal(board.scene.children.length, before);
  board.dispose();
  assert.deepEqual(board.counts(), { players: 0, balls: 0, cones: 0, miniGoals: 0, zones: Object.keys(ZONES).length });
});

test('a textured pitch has a white base color so the grass texture is not darkened', () => {
  const pitchColor = (board) => board.scene.children.find((child) => child.geometry?.type === 'PlaneGeometry' && child.material.type === 'MeshBasicMaterial' && !child.material.transparent && child.position.y === 0).material.color.getHexString();
  assert.equal(pitchColor(buildBoardScene(THREE)), '0d8251', 'flat green without a texture');
  assert.equal(pitchColor(buildBoardScene(THREE, { makeTexture: () => new THREE.Texture() })), 'ffffff');
});

test('the texture painters draw using only the canvas calls they are given', () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_, name) => (typeof name === 'string' ? (...args) => { calls.push(name); return args; } : undefined),
    set: () => true,
  });
  drawPitchTexture(ctx, 1500, 1020);
  assert.ok(calls.includes('strokeRect') && calls.includes('arc') && calls.includes('setLineDash'));
  const before = calls.length;
  drawNumberLabel(ctx, 128, 128, 7);
  assert.ok(calls.length > before && calls.includes('fillText'));
});
