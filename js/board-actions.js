import { createLocalId, FORMATION_NAMES, SIMULATION, TEAM_IDS, ZONES } from './constants.js';
import { applyFormation, formationPosition, recordPlayerPosition } from './formations.js';
import { clamp, separatePlayers } from './geometry.js';
import { releaseFormationCarrier, releaseManuallyMovedObject } from './simulation.js';
import { normalizeState, snapshotState } from './state.js';

// Pure board-editing actions. Each function changes only the state it is given (or returns a new state) and never
// touches the DOM, so app.js stays responsible for rendering, autosave, toasts, and dialogs, and every coaching edit
// can be tested in Node. Callers commit (settle, render, autosave) after an action reports a change.

export const KEYBOARD_NUDGE_STEP = 0.01;
export const KEYBOARD_NUDGE_STEP_LARGE = 0.025;
export const DIALOG_NUDGE_STEP = 0.02;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const TEAM_COLOR_KEYS = Object.freeze(['home', 'homeGoalkeeper', 'away', 'awayGoalkeeper']);

const KEYBOARD_DIRECTIONS = Object.freeze({
  ArrowLeft: Object.freeze([-1, 0]),
  ArrowRight: Object.freeze([1, 0]),
  ArrowUp: Object.freeze([0, -1]),
  ArrowDown: Object.freeze([0, 1]),
});

const DIALOG_DIRECTIONS = Object.freeze({
  left: Object.freeze([-1, 0]),
  right: Object.freeze([1, 0]),
  up: Object.freeze([0, -1]),
  down: Object.freeze([0, 1]),
});

/** Prop-placing tools: which state list they append to, the id prefix, the confirmation message, and the new object. */
export const PROP_TOOLS = Object.freeze({
  cone: Object.freeze({
    list: 'cones',
    prefix: 'cone',
    message: 'Cone added',
    create: (id, point, state) => ({ id, x: point.x, y: point.y, color: state.coneColor }),
  }),
  ball: Object.freeze({
    list: 'balls',
    prefix: 'ball',
    message: 'Extra ball added',
    create: (id, point) => ({ id, x: point.x, y: point.y, primary: false }),
  }),
  minigoal: Object.freeze({
    list: 'miniGoals',
    prefix: 'minigoal',
    message: 'Mini goal added',
    create: (id, point) => ({ id, x: point.x, y: point.y }),
  }),
});

const hasOwn = (object, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(object, key);
const isHexColor = (value) => typeof value === 'string' && HEX_COLOR.test(value);
const formationKey = (team) => (team === 'home' ? 'homeFormation' : 'awayFormation');

/** Finds a player, ball, cone, or mini goal by id, or null. */
export function findObject(state, id) {
  if (!id) return null;
  return state.players.find((item) => item.id === id)
    ?? state.balls.find((item) => item.id === id)
    ?? state.cones.find((item) => item.id === id)
    ?? state.miniGoals.find((item) => item.id === id)
    ?? null;
}

export function isPlayerId(state, id) {
  return state.players.some((player) => player.id === id);
}

/**
 * Players are physical: after any coaching change no two may overlap. The selected object (the player the coach just
 * placed) stays put and the others step aside, adopting their new spot as their simulation anchor.
 */
export function settlePlayers(state) {
  const before = state.players.map(({ x, y }) => [x, y]);
  separatePlayers(state.players, SIMULATION.playerSpacing, [state.selectedObjectId]);
  state.players.forEach((player, index) => {
    if (player.x !== before[index][0] || player.y !== before[index][1]) recordPlayerPosition(player);
  });
}

/** Adds or removes a known zone from the selection. Returns false for an unknown zone id. */
export function toggleZone(state, zoneId) {
  if (!hasOwn(ZONES, zoneId)) return false;
  state.selectedZones = state.selectedZones.includes(zoneId)
    ? state.selectedZones.filter((id) => id !== zoneId)
    : [...state.selectedZones, zoneId];
  return true;
}

/** Places the prop for `tool` at `point` and selects it. Returns { id, message }, or null when `tool` places nothing. */
export function addProp(state, tool, point) {
  if (!hasOwn(PROP_TOOLS, tool)) return null;
  const definition = PROP_TOOLS[tool];
  const prop = definition.create(createLocalId(definition.prefix), { x: clamp(point.x), y: clamp(point.y) }, state);
  state[definition.list].push(prop);
  state.selectedObjectId = prop.id;
  return { id: prop.id, message: definition.message };
}

/**
 * Removes the selected cone, mini goal, or extra ball. Players and the primary ball are protected.
 * Returns 'none-selected', 'protected', or 'removed'.
 */
export function removeSelectedProp(state) {
  const selected = state.selectedObjectId;
  if (!selected) return 'none-selected';
  const removable = state.cones.some((item) => item.id === selected)
    || state.miniGoals.some((item) => item.id === selected)
    || state.balls.some((item) => !item.primary && item.id === selected);
  if (!removable) return 'protected';
  state.cones = state.cones.filter((item) => item.id !== selected);
  state.miniGoals = state.miniGoals.filter((item) => item.id !== selected);
  state.balls = state.balls.filter((item) => item.primary || item.id !== selected);
  state.selectedObjectId = null;
  return 'removed';
}

/** Translates an arrow key into a board delta; Shift takes larger steps. Returns null for any other key. */
export function keyboardNudge(key, large = false) {
  if (!hasOwn(KEYBOARD_DIRECTIONS, key)) return null;
  const step = large ? KEYBOARD_NUDGE_STEP_LARGE : KEYBOARD_NUDGE_STEP;
  const [dx, dy] = KEYBOARD_DIRECTIONS[key];
  return [dx * step, dy * step];
}

/**
 * Moves any object by a delta, kept on the pitch, and selects it. Moving the ball carrier or the ball releases
 * possession in place; a moved player's new spot becomes its anchor. Returns false when the id is unknown.
 */
export function moveObjectBy(state, id, dx, dy) {
  const object = findObject(state, id);
  if (!object) return false;
  releaseManuallyMovedObject(state, id);
  object.x = clamp(object.x + dx);
  object.y = clamp(object.y + dy);
  if (isPlayerId(state, id)) recordPlayerPosition(object);
  state.selectedObjectId = id;
  return true;
}

/**
 * Player-editor nudge: 'left' | 'right' | 'up' | 'down' step the player, 'center' returns them to their formation spot.
 * Returns false (changing nothing) for an unknown player or direction.
 */
export function nudgePlayer(state, id, direction) {
  const player = state.players.find((item) => item.id === id);
  if (!player) return false;
  if (direction === 'center') {
    const position = formationPosition(state.players, player, state[formationKey(player.team)]);
    if (!position) return false;
    releaseManuallyMovedObject(state, id);
    Object.assign(player, position);
  } else {
    if (!hasOwn(DIALOG_DIRECTIONS, direction)) return false;
    const [dx, dy] = DIALOG_DIRECTIONS[direction];
    releaseManuallyMovedObject(state, id);
    player.x = clamp(player.x + dx * DIALOG_NUDGE_STEP);
    player.y = clamp(player.y + dy * DIALOG_NUDGE_STEP);
  }
  recordPlayerPosition(player);
  return true;
}

/**
 * Applies (or reapplies) one of the two approved shapes to a team. Names, numbers and colors survive; the old preset
 * identity is cleared and a carrier on that team releases the ball in place. Returns false, changing nothing, for an
 * unknown team or formation.
 */
export function applyTeamFormation(state, team, formation) {
  if (!TEAM_IDS.includes(team) || !FORMATION_NAMES.includes(formation)) return false;
  state[formationKey(team)] = formation;
  releaseFormationCarrier(state, team);
  state.players = applyFormation(state.players, team, formation);
  state.currentPresetId = null;
  return true;
}

/**
 * Applies player-editor values. The number must be an integer from 1 to 99; an empty label falls back to the role and
 * an empty or invalid color clears the override. Returns 'missing', 'invalid-number', or 'updated'.
 */
export function updatePlayerDetails(state, id, { number, label, colorOverride } = {}) {
  const player = state.players.find((item) => item.id === id);
  if (!player) return 'missing';
  if (!Number.isInteger(number) || number < 1 || number > 99) return 'invalid-number';
  player.number = number;
  player.label = typeof label === 'string' && label.trim() ? label.trim() : player.role;
  player.colorOverride = isHexColor(colorOverride) ? colorOverride : null;
  return 'updated';
}

/** Applies the valid hex colors among home, homeGoalkeeper, away and awayGoalkeeper; other keys are ignored. */
export function updateTeamColors(state, colors = {}) {
  for (const key of TEAM_COLOR_KEYS) {
    if (isHexColor(colors[key])) state.colors[key] = colors[key];
  }
}

/** Returns a fresh board from the reset baseline, keeping the coach's view theme and the current preset identity. */
export function resetBoardState(snapshot, current) {
  const next = normalizeState(snapshotState(snapshot));
  next.theme = current.theme;
  next.currentPresetId = current.currentPresetId;
  next.simulation.running = false;
  return next;
}

/** Returns a detached, normalized board for a built-in or saved preset, tagged with that preset's id. */
export function loadPresetState(presetState, presetId) {
  const next = normalizeState(snapshotState(presetState));
  next.currentPresetId = presetId;
  return next;
}
