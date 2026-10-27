import { DEFAULT_COLORS, SCHEMA_VERSION } from './constants.js';
import { defaultPlayers } from './formations.js';

const ZONE_RESTRICTION_MODES = Object.freeze(['off', 'keep-in', 'keep-out']);
const ZONE_RESTRICTION_SCOPES = Object.freeze(['home', 'away', 'both']);

export function createInitialState() {
  return {
    schemaVersion: SCHEMA_VERSION,
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
      ballTarget: null,
      receiverId: null,
      lastTouchTeam: 'home',
      // Shots taken so far; selects the next entry of SIMULATION.shotAimOffsets.
      shotCount: 0,
      restart: null,
    },
  };
}

export function normalizeState(candidate) {
  const base = createInitialState();
  if (!candidate || candidate.schemaVersion !== SCHEMA_VERSION) return base;
  return {
    ...base,
    ...candidate,
    colors: { ...base.colors, ...(candidate.colors ?? {}) },
    simulation: { ...base.simulation, ...(candidate.simulation ?? {}), running: false },
    players: Array.isArray(candidate.players) && candidate.players.length === 14 ? candidate.players : base.players,
    balls: Array.isArray(candidate.balls) && candidate.balls.length ? candidate.balls : base.balls,
    cones: Array.isArray(candidate.cones) ? candidate.cones : [],
    miniGoals: Array.isArray(candidate.miniGoals) ? candidate.miniGoals : [],
    drawings: Array.isArray(candidate.drawings) ? candidate.drawings : [],
    selectedZones: Array.isArray(candidate.selectedZones) ? candidate.selectedZones : [],
    zoneRestrictionMode: ZONE_RESTRICTION_MODES.includes(candidate.zoneRestrictionMode)
      ? candidate.zoneRestrictionMode
      : base.zoneRestrictionMode,
    zoneRestrictionScope: ZONE_RESTRICTION_SCOPES.includes(candidate.zoneRestrictionScope)
      ? candidate.zoneRestrictionScope
      : base.zoneRestrictionScope,
  };
}

export function snapshotState(state) {
  return typeof structuredClone === 'function' ? structuredClone(state) : JSON.parse(JSON.stringify(state));
}
