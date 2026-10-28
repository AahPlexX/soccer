import { DEFAULT_COLORS, FORMATION_NAMES } from './constants.js';

const HOME_FORMATIONS = Object.freeze({
  '1-3-2-1': [
    ['GK', 0.08, 0.5], ['LD', 0.20, 0.34], ['RD', 0.20, 0.66],
    ['LM', 0.31, 0.18], ['CM', 0.31, 0.5], ['RM', 0.31, 0.82], ['ST', 0.43, 0.5],
  ],
  '1-2-3-1': [
    ['GK', 0.08, 0.5], ['LD', 0.20, 0.3], ['CD', 0.18, 0.5], ['RD', 0.20, 0.7],
    ['LM', 0.31, 0.28], ['RM', 0.31, 0.72], ['ST', 0.43, 0.5],
  ],
});

export function assertFormationName(name) {
  if (!FORMATION_NAMES.includes(name)) throw new RangeError(`Unsupported formation: ${name}`);
}

function mirrorAnchor(anchor) {
  return [anchor[0], 1 - anchor[1], 1 - anchor[2]];
}

export function formationAnchors(team, formation) {
  assertFormationName(formation);
  const anchors = HOME_FORMATIONS[formation];
  return team === 'home' ? anchors : anchors.map(mirrorAnchor);
}

export function createTeamPlayers(team, formation) {
  return formationAnchors(team, formation).map(([role, x, y], index) => ({
    id: `${team}-${index + 1}`,
    team,
    role,
    number: index + 1,
    label: role,
    x,
    y,
    anchorX: x,
    anchorY: y,
    colorOverride: null,
    benched: false, // true takes the player off the pitch (small-sided drills); see stepSimulation
  }));
}

export function applyFormation(players, team, formation) {
  const anchors = formationAnchors(team, formation);
  const teamPlayers = players.filter((player) => player.team === team);
  if (teamPlayers.length !== anchors.length) throw new Error(`Expected seven ${team} players.`);

  return players.map((player) => {
    if (player.team !== team) return player;
    const index = teamPlayers.findIndex((candidate) => candidate.id === player.id);
    const [role, x, y] = anchors[index];
    return { ...player, role, label: player.label && player.label !== player.role ? player.label : role, x, y, anchorX: x, anchorY: y };
  });
}

// Coaching repositioning becomes the player's support anchor for the simulation.
export function recordPlayerPosition(player) {
  player.anchorX = player.x;
  player.anchorY = player.y;
}

export function formationPosition(players, player, formation) {
  const index = players.filter((item) => item.team === player.team).findIndex((item) => item.id === player.id);
  const anchor = formationAnchors(player.team, formation)[index];
  return anchor ? { x: anchor[1], y: anchor[2] } : null;
}

export function playerColor(player, state) {
  if (player.colorOverride) return player.colorOverride;
  if (player.role === 'GK') return player.team === 'home' ? state.colors.homeGoalkeeper : state.colors.awayGoalkeeper;
  return player.team === 'home' ? state.colors.home : state.colors.away;
}

export function defaultPlayers() {
  return [
    ...createTeamPlayers('home', '1-3-2-1'),
    ...createTeamPlayers('away', '1-2-3-1'),
  ];
}

export const DEFAULT_TEAM_COLORS = DEFAULT_COLORS;
