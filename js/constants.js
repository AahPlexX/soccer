export const SCHEMA_VERSION = 1;
export const AUTOSAVE_KEY = 'u9_tactical_board_state_v1';
export const FALLBACK_PRESETS_KEY = 'u9_tactical_board_presets_v1';
export const DB_NAME = 'u9_tactical_board_v1';
export const DB_VERSION = 1;

export const FORMATION_NAMES = Object.freeze(['1-3-2-1', '1-2-3-1']);
export const TEAM_IDS = Object.freeze(['home', 'away']);

export const PITCH = Object.freeze({
  homeGoalLineX: 0,
  awayGoalLineX: 1,
  halfwayX: 0.5,
  homeBuildOutX: 0.35,
  awayBuildOutX: 0.65,
  penaltyMinY: 0.2,
  penaltyMaxY: 0.8,
  homePenaltyMaxX: 0.2,
  awayPenaltyMinX: 0.8,
  centerCircleRadius: 8 / 60,
});

export const ZONES = Object.freeze({
  left: { label: 'Left zone', x1: 0, x2: 1, y1: 0, y2: 0.5 },
  right: { label: 'Right zone', x1: 0, x2: 1, y1: 0.5, y2: 1 },
  homeBox: { label: 'Our goalkeeper box', x1: 0, x2: 0.2, y1: 0.2, y2: 0.8 },
  homeBuild: { label: 'Our goal to build-out line', x1: 0, x2: 0.35, y1: 0, y2: 1 },
  homeMid: { label: 'Our build-out line to midfield', x1: 0.35, x2: 0.5, y1: 0, y2: 1 },
  awayMid: { label: 'Midfield to opposing build-out line', x1: 0.5, x2: 0.65, y1: 0, y2: 1 },
  awayGoal: { label: 'Opposing build-out line to goal', x1: 0.65, x2: 1, y1: 0, y2: 1 },
  awayBox: { label: 'Opposing goalkeeper box', x1: 0.8, x2: 1, y1: 0.2, y2: 0.8 },
});

export const PALETTE = Object.freeze({
  blue: '#1769ff',
  red: '#ef3340',
  yellow: '#ffd43b',
  neonGreen: '#7cff00',
  orange: '#ff8c1a',
  white: '#ffffff',
  black: '#111111',
  purple: '#7b4dff',
});

export const DEFAULT_COLORS = Object.freeze({
  home: PALETTE.blue,
  homeGoalkeeper: PALETTE.yellow,
  away: PALETTE.red,
  awayGoalkeeper: PALETTE.neonGreen,
});


export function createLocalId(prefix = 'item') {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return `${prefix}-${randomUuid}`;
  const randomPart = globalThis.crypto?.getRandomValues
    ? Array.from(globalThis.crypto.getRandomValues(new Uint32Array(2)), (value) => value.toString(36)).join('-')
    : Math.random().toString(36).slice(2, 12);
  return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
}

export const SIMULATION = Object.freeze({
  fixedStepSeconds: 1 / 60,
  playerSpeed: 0.12,
  ballSpeed: 0.42,
  actionIntervalSeconds: 1.8,
  supportBallShiftX: 0.16,
  supportBallShiftY: 0.12,
  pressureDistance: 0.1,
  // A pass lane is blocked when an opponent stands within this distance of the carrier→receiver line (just under the 0.055 pickup radius).
  passLaneClearance: 0.05,
  // A shot aims at 0.5 + shotAimOffsets[shotCount % length] + (shooter.y - 0.5) * shotAimSpread. The offsets repeat
  // in a fixed order (no RNG, so teaching replays are repeatable): central (caught), near post (parried for a
  // corner), far post (goal), wide of the goal (goal kick). The spread lets a wide shooter's angle shift the aim.
  shotAimOffsets: Object.freeze([0, 0.04, -0.065, 0.12]),
  shotAimSpread: 0.6,
  // Goalkeeper vs. a shot crossing the line inside the goal mouth, by |keeper.y - shot.y|:
  // <= keeperCatchReach holds it, <= keeperParryReach deflects it behind for a corner, otherwise it is a goal.
  keeperCatchReach: 0.02,
  keeperParryReach: 0.05,
});
