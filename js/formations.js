import { DEFAULT_COLORS, FORMATION_NAMES } from './constants.js';

const HOME_FORMATIONS = Object.freeze({
  '1-3-2-1': [
    ['GK', 0.08, 0.5], ['LD', 0.25, 0.34], ['RD', 0.25, 0.66],
    ['LM', 0.46, 0.18], ['CM', 0.46, 0.5], ['RM', 0.46, 0.82], ['ST', 0.72, 0.5],
  ],
  '1-2-3-1': [
    ['GK', 0.08, 0.5], ['LD', 0.27, 0.3], ['CD', 0.24, 0.5], ['RD', 0.27, 0.7],
    ['LM', 0.49, 0.28], ['RM', 0.49, 0.72], ['ST', 0.72, 0.5],
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
    return { ...player, role, label: role, x, y, anchorX: x, anchorY: y };
  });
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
