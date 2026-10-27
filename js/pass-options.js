import { SIMULATION } from './constants.js';
import { distanceToSegment } from './geometry.js';

export function availablePassOptions(state) {
  const carrier = state.players.find((player) => player.id === state.simulation.carrierId);
  if (!carrier || state.simulation.ballTarget) return [];
  if (carrier.team === 'away' && !state.awayVisible) return [];

  const teammates = state.players.filter((player) => player.team === carrier.team && player.id !== carrier.id);
  const opponents = state.players.filter((player) => player.team !== carrier.team);
  return teammates.filter((receiver) =>
    opponents.every((defender) => distanceToSegment(defender, carrier, receiver) > SIMULATION.passLaneClearance),
  );
}
