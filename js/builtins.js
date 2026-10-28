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
  Object.assign(state.coaching, {"title": "Goal kick build-out", "objective": "Create width and a safe first pass out of the back.", "setup": "7v7 board. Defenders split to either side of the goalkeeper. Opponents retreat behind the build-out line.", "instructions": "Start paused. Ask the goalkeeper to identify two options. Play the scenario, pause at the first reception, then return to the starting setup and compare options.", "cues": "Can the receiver see the next pass? Where is the space when an opponent presses? Support behind and beside the ball.", "progression": "Easier: bench two opponents. Harder: apply pressure after distribution and require the receiving player to find a different teammate.", "minutes": 6});
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
  Object.assign(state.coaching, {"title": "Press the opponent build-out", "objective": "One player presses while teammates protect passing lanes.", "setup": "Opponent goalkeeper has the ball. Organize the striker and midfield line behind the build-out line.", "instructions": "Wait for the goalkeeper to distribute. Pause when the first defender presses. Identify the covering players before resuming.", "cues": "Who goes to the ball? Who protects the middle? Approach under control and show the ball toward a teammate.", "progression": "Easier: pause and move covering players manually. Harder: switch to good spacing and compare against the bunching demonstration.", "minutes": 5});
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
  Object.assign(state.coaching, {"title": "U9 offside discussion", "objective": "Recognize space beyond the attacking build-out line and time forward support.", "setup": "Use the highlighted attacking zone. The forward begins inside it, with defenders between the forward and goal.", "instructions": "Move the forward and defenders while paused. Ask whether being in this zone alone means offside. Then advance one second at a time to discuss the ball and second-last defender.", "cues": "Where is the ball? Where is the second-last defender? Time the run rather than waiting behind the defense.", "progression": "Repeat with the ball farther forward or a defender dropping back. The CPU uses simplified support positioning, not a full referee model.", "minutes": 4});
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
  Object.assign(state.coaching, {"title": "Switch the field", "objective": "Find the far-side space instead of crowding the ball.", "setup": "Wide players on both sides, central support and two defenders. The drawing shows an illustrative route to the opposite wing.", "instructions": "Show the board before playing. Capture a teaching step for each intended reception. Use Previous / Next for the authored sequence, or Play to explore the CPU choices.", "cues": "Look across the field before receiving. Can a supporting player face both sides? What space appears when everyone follows the ball?", "progression": "Easier: bench opponents for an unopposed walk-through. Harder: add pressure and compare the clear pass options.", "minutes": 5});
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
