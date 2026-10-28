import { emptyCoaching, normalizeCoaching } from './coaching.js';
import { DEFAULT_COLORS, FORMATION_NAMES, PALETTE, SCHEMA_VERSION, TEAM_IDS, ZONES } from './constants.js';
import { defaultPlayers } from './formations.js';

// Every persisted enumeration in one place. normalizeState() falls back to the createInitialState() value whenever a
// stored value is not listed here, so a corrupted or hand-edited autosave, preset, or backup cannot break the board.
export const THEMES = Object.freeze(['turf', 'dark', 'field']);
export const TOOLS = Object.freeze(['move', 'draw', 'arrow', 'run', 'curve', 'erase', 'cone', 'minigoal', 'ball']);
export const SPEEDS = Object.freeze([0.5, 1, 2]);
export const SPACING_MODES = Object.freeze(['good', 'swarm']);
export const ZONE_RESTRICTION_MODES = Object.freeze(['off', 'keep-in', 'keep-out']);
export const ZONE_RESTRICTION_SCOPES = Object.freeze(['home', 'away', 'both']);
export const RESTART_TYPES = Object.freeze(['throw-in', 'goal-kick', 'corner', 'kickoff']);
// 'arrow' is the solid pass/shot arrow and 'run' the dashed player run/dribble arrow (PRD 7.1); both are two-point lines.
export const DRAWING_TYPES = Object.freeze(['freehand', 'arrow', 'run', 'curve']);
export const ZONE_OPACITY_RANGE = Object.freeze({ min: 0.1, max: 0.45 });

const PLAYERS_PER_TEAM = 7;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const isHexColor = (value) => typeof value === 'string' && HEX_COLOR.test(value);
const isPoint = (value) => isRecord(value) && Number.isFinite(value.x) && Number.isFinite(value.y);
const isPositionedObject = (value) => isPoint(value) && isNonEmptyString(value.id);
const clampRange = (value, min, max) => Math.min(max, Math.max(min, value));
const clamp01 = (value) => clampRange(value, 0, 1);
const oneOf = (allowed, value, fallback) => (allowed.includes(value) ? value : fallback);
const nonNegativeNumber = (value) => (Number.isFinite(value) && value > 0 ? value : 0);
const stringOrNull = (value) => (isNonEmptyString(value) ? value : null);

export function createInitialState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    coaching: emptyCoaching(),
    homeFormation: '1-3-2-1',
    awayFormation: '1-2-3-1',
    awayVisible: true,
    theme: 'turf',
    tool: 'move',
    speed: 1,
    spacingMode: 'good',
    selectedZones: [],
    zoneRestrictionMode: 'off',
    zoneRestrictionScope: 'home',
    zoneOpacity: 0.2,
    colors: { ...DEFAULT_COLORS },
    // Color of newly placed cones, and of the selected cone when the coach picks one (PRD 7.2).
    coneColor: PALETTE.orange,
    players: defaultPlayers(),
    balls: [{ id: 'ball-main', x: 0.5, y: 0.5, primary: true }],
    cones: [],
    miniGoals: [],
    drawings: [],
    selectedObjectId: null,
    currentPresetId: null,
    simulation: {
      running: false,
      possessionTeam: 'home',
      carrierId: null,
      actionClock: 0,
      tackleCooldown: 0,
      ballTarget: null,
      receiverId: null,
      lastTouchTeam: 'home',
      // Shots taken so far; selects the next entry of SIMULATION.shotAimOffsets.
      shotCount: 0,
      restart: null,
    },
  };
}

function normalizeColors(colors, fallback) {
  const result = { ...fallback };
  if (!isRecord(colors)) return result;
  for (const key of Object.keys(fallback)) {
    if (isHexColor(colors[key])) result[key] = colors[key];
  }
  return result;
}

// The roster is all-or-nothing: exactly seven players per team with unique ids, a team, a role, and finite
// coordinates. Anything else falls back to the default roster rather than half-repairing a broken team.
// Within a valid roster, recoverable fields (missing anchors, bad jersey numbers, empty labels, unknown
// override colors, off-pitch coordinates) are repaired per player while unknown extra fields are preserved.
function normalizePlayers(players, fallback) {
  if (!Array.isArray(players) || players.length !== PLAYERS_PER_TEAM * TEAM_IDS.length) return fallback;
  const ids = new Set();
  const counts = Object.fromEntries(TEAM_IDS.map((team) => [team, 0]));
  for (const player of players) {
    if (!isPositionedObject(player) || !TEAM_IDS.includes(player.team) || !isNonEmptyString(player.role) || ids.has(player.id)) {
      return fallback;
    }
    ids.add(player.id);
    counts[player.team] += 1;
  }
  if (TEAM_IDS.some((team) => counts[team] !== PLAYERS_PER_TEAM)) return fallback;

  const teamIndex = Object.fromEntries(TEAM_IDS.map((team) => [team, 0]));
  return players.map((player) => {
    teamIndex[player.team] += 1;
    const x = clamp01(player.x);
    const y = clamp01(player.y);
    return {
      ...player,
      x,
      y,
      anchorX: Number.isFinite(player.anchorX) ? clamp01(player.anchorX) : x,
      anchorY: Number.isFinite(player.anchorY) ? clamp01(player.anchorY) : y,
      number: Number.isInteger(player.number) && player.number >= 1 && player.number <= 99 ? player.number : teamIndex[player.team],
      label: typeof player.label === 'string' && player.label.trim() ? player.label : player.role,
      colorOverride: isHexColor(player.colorOverride) ? player.colorOverride : null,
      benched: player.benched === true,
    };
  });
}

// Keeps valid positioned objects (unique non-empty id, finite x/y) in their stored order, clamped onto the pitch.
// Duplicate ids are dropped because each object is rendered with a document-unique SVG element id.
function normalizePositionedList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  for (const item of list) {
    if (!isPositionedObject(item) || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push({ ...item, x: clamp01(item.x), y: clamp01(item.y) });
  }
  return result;
}

// The simulation always drives balls[0] and the remove-prop control never deletes the primary ball, so exactly one
// primary ball is kept and it is stored first. With no valid ball at all, the default centre ball is restored.
function normalizeBalls(balls, fallback) {
  const valid = normalizePositionedList(balls);
  if (!valid.length) return fallback;
  const primaryIndex = Math.max(0, valid.findIndex((ball) => ball.primary === true));
  const primary = { ...valid[primaryIndex], primary: true };
  const extras = valid.filter((_, index) => index !== primaryIndex).map((ball) => ({ ...ball, primary: false }));
  return [primary, ...extras];
}

function normalizeDrawings(drawings) {
  if (!Array.isArray(drawings)) return [];
  return drawings
    .filter((drawing) => isRecord(drawing) && Array.isArray(drawing.points) && drawing.points.length > 0 && drawing.points.every(isPoint))
    .map((drawing) => ({
      ...drawing,
      type: oneOf(DRAWING_TYPES, drawing.type, 'freehand'),
      points: drawing.points.map((point) => ({ x: clamp01(point.x), y: clamp01(point.y) })),
    }));
}

function normalizeSelectedZones(selectedZones) {
  if (!Array.isArray(selectedZones)) return [];
  const known = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(ZONES, id);
  return [...new Set(selectedZones.filter(known))];
}

function normalizeZoneOpacity(value, fallback) {
  return Number.isFinite(value) ? clampRange(value, ZONE_OPACITY_RANGE.min, ZONE_OPACITY_RANGE.max) : fallback;
}

function normalizeSpeed(value, fallback) {
  const speed = Number(value);
  return SPEEDS.includes(speed) ? speed : fallback;
}

function normalizeRestart(restart) {
  if (!isRecord(restart) || !RESTART_TYPES.includes(restart.type) || !TEAM_IDS.includes(restart.team)) return null;
  return { ...restart };
}

// A running simulation is never restored. References must name a player on the restored roster, and a ball target
// is kept unclamped because shot targets deliberately extend past the goal line.
function normalizeSimulation(simulation, fallback, players) {
  const merged = { ...fallback, ...(isRecord(simulation) ? simulation : {}) };
  const playerIds = new Set(players.filter((player) => !player.benched).map((player) => player.id));
  const playerReference = (id) => (typeof id === 'string' && playerIds.has(id) ? id : null);
  return {
    ...merged,
    running: false,
    possessionTeam: oneOf(TEAM_IDS, merged.possessionTeam, fallback.possessionTeam),
    lastTouchTeam: oneOf(TEAM_IDS, merged.lastTouchTeam, fallback.lastTouchTeam),
    carrierId: playerReference(merged.carrierId),
    receiverId: playerReference(merged.receiverId),
    ballTarget: isPoint(merged.ballTarget) ? { x: merged.ballTarget.x, y: merged.ballTarget.y } : null,
    actionClock: nonNegativeNumber(merged.actionClock),
    tackleCooldown: nonNegativeNumber(merged.tackleCooldown),
    shotCount: Number.isInteger(merged.shotCount) && merged.shotCount >= 0 ? merged.shotCount : 0,
    restart: normalizeRestart(merged.restart),
  };
}

/**
 * Returns a board state that is safe to render, simulate, and persist. Input from a different schema version, or that
 * is not an object, yields a fresh initial state. Otherwise every known field is validated independently: valid values
 * are kept, invalid ones fall back to their createInitialState() defaults, and unknown top-level keys are preserved
 * for forward compatibility. The input is never mutated, and normalizing an already-normalized state is a no-op.
 */
export function normalizeState(candidate) {
  const base = createInitialState();
  if (!isRecord(candidate) || candidate.schemaVersion !== SCHEMA_VERSION) return base;
  const players = normalizePlayers(candidate.players, base.players);
  return {
    ...base,
    ...candidate,
    schemaVersion: SCHEMA_VERSION,
    coaching: normalizeCoaching(candidate.coaching),
    homeFormation: oneOf(FORMATION_NAMES, candidate.homeFormation, base.homeFormation),
    awayFormation: oneOf(FORMATION_NAMES, candidate.awayFormation, base.awayFormation),
    awayVisible: typeof candidate.awayVisible === 'boolean' ? candidate.awayVisible : base.awayVisible,
    theme: oneOf(THEMES, candidate.theme, base.theme),
    tool: oneOf(TOOLS, candidate.tool, base.tool),
    speed: normalizeSpeed(candidate.speed, base.speed),
    spacingMode: oneOf(SPACING_MODES, candidate.spacingMode, base.spacingMode),
    selectedZones: normalizeSelectedZones(candidate.selectedZones),
    zoneRestrictionMode: oneOf(ZONE_RESTRICTION_MODES, candidate.zoneRestrictionMode, base.zoneRestrictionMode),
    zoneRestrictionScope: oneOf(ZONE_RESTRICTION_SCOPES, candidate.zoneRestrictionScope, base.zoneRestrictionScope),
    zoneOpacity: normalizeZoneOpacity(candidate.zoneOpacity, base.zoneOpacity),
    colors: normalizeColors(candidate.colors, base.colors),
    players,
    balls: normalizeBalls(candidate.balls, base.balls),
    cones: normalizePositionedList(candidate.cones),
    miniGoals: normalizePositionedList(candidate.miniGoals),
    drawings: normalizeDrawings(candidate.drawings),
    coneColor: isHexColor(candidate.coneColor) ? candidate.coneColor : base.coneColor,
    selectedObjectId: stringOrNull(candidate.selectedObjectId),
    currentPresetId: stringOrNull(candidate.currentPresetId),
    simulation: normalizeSimulation(candidate.simulation, base.simulation, players),
  };
}

export function snapshotState(state) {
  return typeof structuredClone === 'function' ? structuredClone(state) : JSON.parse(JSON.stringify(state));
}
