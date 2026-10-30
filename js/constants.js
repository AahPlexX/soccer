export const SCHEMA_VERSION = 1;
export const AUTOSAVE_KEY = 'u9_tactical_board_state_v1';
export const FALLBACK_PRESETS_KEY = 'u9_tactical_board_presets_v1';
export const DB_NAME = 'u9_tactical_board_v1';
export const DB_VERSION = 1;

export const FORMATION_NAMES = Object.freeze(['1-3-2-1', '1-2-3-1']);
export const TEAM_IDS = Object.freeze(['home', 'away']);

// The 7v7 pitch is 60 x 40.8 yards (the 3D scene's world units); ball physics works in meters.
export const PITCH_METERS = Object.freeze({ length: 60 * 0.9144, width: 40.8 * 0.9144 });

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
  // PRD 4.2's optional Center Channel: the middle third, the gap between the 0.33 and 0.67 wing channels.
  center: { label: 'Center channel', x1: 0, x2: 1, y1: 1 / 3, y2: 2 / 3 },
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
  attackSupportAdvance: 0.8,
  supportBallShiftY: 0.12,
  pressureDistance: 0.1,
  // Minimum on-screen distance between player centers: one token diameter (discs are 25 SVG units in radius on a 1000-unit pitch length).
  playerSpacing: 0.05,
  // An outfield defender within this on-screen distance (just outside token contact, so it must exceed playerSpacing)
  // wins possession; protect the new carrier briefly to avoid flicker.
  tackleDistance: 0.06,
  tackleCooldownSeconds: 5,
  receiveProtectionSeconds: 0.3,
  // A pass lane is blocked when an opponent stands within this distance of the carrier→receiver line (just under the 0.055 pickup radius).
  passLaneClearance: 0.05,
  // A shot aims at 0.5 + side * shotAimOffsets[shotCount % length] (side is -1 for a shooter below the center line, else 1) + (shooter.y - 0.5) * shotAimSpread. The offsets repeat
  // in a fixed order (no RNG, so teaching replays are repeatable): central, near post, far post, and wide.
  // In the centered reference setup these produce a catch, parry, goal, and goal kick respectively; player positions
  // and the shooter's angle can change those results.
  shotAimOffsets: Object.freeze([0, 0.04, -0.07, 0.12]),
  shotAimSpread: 0.05,
  // A keeper tracks an incoming shot more slowly than an outfield player moves, leaving limited reaction time.
  keeperTrackingSpeed: 0.03,
  // Goalkeeper vs. a shot crossing the line inside the goal mouth, by |keeper.y - shot.y|:
  // <= keeperCatchReach holds it, <= keeperParryReach deflects it behind for a corner, otherwise it is a goal.
  keeperCatchReach: 0.02,
  keeperParryReach: 0.05,
  // Ball physics (js/ball-physics.js). Speeds are m/s, heights are the ball center's height in meters, elevations radians.
  shotSpeed: 27,
  // Height a shot aims at on the goal line, on the same cycle as shotAimOffsets: low, mid, high corner, and mid but wide.
  shotHeights: Object.freeze([0.85, 1.2, 1.5, 1.0]),
  passArriveSpeed: 6, // a ground pass reaches its receiver still rolling at about this speed
  drivenElevation: 0.12, // open passes longer than drivenMinDistance are driven: low, fast and flat
  drivenMinDistance: 28,
  lobElevation: 0.75, // a pass whose lane is blocked, at least lobMinDistance long, is lofted over the defender
  lobMinDistance: 8,
  controlHeight: 1.9, // a ball whose bottom is higher than this passes over players' heads
  maxControlSpeed: 20, // a faster ball cannot be taken under control (a shot zips past a defender)
  pickupDistance: 0.04, // on-screen distance within which a player takes a ball in flight (the intended receiver: 0.055)
  keeperCatchHeight: 1.7, // a keeper holds a shot only if it crosses the line at or below this height
  looseSpeed: 3, // below this speed on the ground a passed ball is a loose ball again
  kickImmunitySeconds: 0.4, // a kicker cannot take their own ball straight back
});
