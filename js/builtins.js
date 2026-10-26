import { applyFormation } from './formations.js';
import { createInitialState } from './state.js';

function base(homeFormation = '1-3-2-1', awayFormation = '1-2-3-1') {
  const state = createInitialState();
  state.homeFormation = homeFormation;
  state.awayFormation = awayFormation;
  state.players = applyFormation(state.players, 'home', homeFormation);
  state.players = applyFormation(state.players, 'away', awayFormation);
  return state;
}

function move(state, id, x, y) {
  const player = state.players.find((item) => item.id === id);
  if (!player) return;
  player.x = x; player.y = y; player.anchorX = x; player.anchorY = y;
}

function goalKickBuildOut() {
  const state = base('1-3-2-1', '1-2-3-1');
  move(state, 'home-1', 0.08, 0.5);
  move(state, 'home-2', 0.22, 0.2);
  move(state, 'home-3', 0.22, 0.8);
  move(state, 'home-4', 0.4, 0.2);
  move(state, 'home-5', 0.38, 0.5);
  move(state, 'home-6', 0.4, 0.8);
  move(state, 'home-7', 0.56, 0.5);
  state.players.filter((p) => p.team === 'away').forEach((player, index) => {
    player.x = Math.max(player.x, 0.39 + (index % 3) * 0.025);
    player.anchorX = player.x;
  });
  state.balls[0].x = 0.09; state.balls[0].y = 0.5;
  state.simulation.possessionTeam = 'home'; state.simulation.carrierId = 'home-1';
  state.selectedZones = ['homeBuild', 'homeMid'];
  return state;
}

function pressOpponentBuildOut() {
  const state = base('1-3-2-1', '1-2-3-1');
  move(state, 'home-7', 0.62, 0.5);
  move(state, 'home-4', 0.58, 0.24);
  move(state, 'home-5', 0.56, 0.5);
  move(state, 'home-6', 0.58, 0.76);
  move(state, 'away-1', 0.92, 0.5);
  move(state, 'away-2', 0.78, 0.2);
  move(state, 'away-3', 0.76, 0.5);
  move(state, 'away-4', 0.78, 0.8);
  state.balls[0].x = 0.91; state.balls[0].y = 0.5;
  state.simulation.possessionTeam = 'away'; state.simulation.carrierId = 'away-1';
  state.selectedZones = ['awayMid', 'awayGoal'];
  return state;
}

function offsideVisualizer() {
  const state = base('1-3-2-1', '1-2-3-1');
  move(state, 'home-6', 0.58, 0.72);
  move(state, 'home-7', 0.72, 0.5);
  move(state, 'away-2', 0.77, 0.3);
  move(state, 'away-3', 0.74, 0.5);
  move(state, 'away-4', 0.77, 0.7);
  state.balls[0].x = 0.58; state.balls[0].y = 0.72;
  state.simulation.possessionTeam = 'home'; state.simulation.carrierId = 'home-6';
  state.selectedZones = ['awayGoal'];
  return state;
}

function switchField() {
  const state = base('1-3-2-1', '1-2-3-1');
  move(state, 'home-4', 0.46, 0.16);
  move(state, 'home-5', 0.42, 0.5);
  move(state, 'home-6', 0.48, 0.84);
  move(state, 'home-2', 0.28, 0.3);
  move(state, 'home-3', 0.28, 0.7);
  state.balls[0].x = 0.46; state.balls[0].y = 0.16;
  state.simulation.possessionTeam = 'home'; state.simulation.carrierId = 'home-4';
  state.selectedZones = ['left', 'right'];
  state.drawings = [{
    id: 'builtin-switch-arrow',
    type: 'freehand',
    points: [{ x: 0.46, y: 0.16 }, { x: 0.42, y: 0.5 }, { x: 0.48, y: 0.84 }],
  }];
  return state;
}

export const BUILT_IN_PRESETS = Object.freeze([
  {
    id: 'builtin-goal-kick-build-out',
    title: 'Goal kick build-out',
    category: 'Drills',
    description: 'Defenders split wide, midfielders show for the ball, and opponents wait beyond the build-out line.',
    createState: goalKickBuildOut,
  },
  {
    id: 'builtin-press-build-out',
    title: 'Press the opponent build-out',
    category: 'Drills',
    description: 'Striker and midfield line organize near the opposing build-out line before pressure begins.',
    createState: pressOpponentBuildOut,
  },
  {
    id: 'builtin-offside-visualizer',
    title: 'U9 offside visualizer',
    category: 'Rules',
    description: 'Highlights the attacking zone beyond the opposing build-out line with a forward positioned inside it.',
    createState: offsideVisualizer,
  },
  {
    id: 'builtin-switch-field',
    title: 'Switch the field',
    category: 'Plays',
    description: 'Shows the ball moving from the left side through central support to the weak-side player.',
    createState: switchField,
  },
]);
