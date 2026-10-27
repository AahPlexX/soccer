import { SIMULATION } from './constants.js';
import { distanceToSegment } from './geometry.js';

/**
 * Teammates of `carrier` whose carrier→receiver line has no opponent within SIMULATION.passLaneClearance.
 * The single definition of an open lane: the CPU's receiver choice and the on-screen pass options both use it.
 */
export function openPassReceivers(state, carrier) {
  const opponents = state.players.filter((player) => player.team !== carrier.team);
  return state.players.filter((player) => player.team === carrier.team && player.id !== carrier.id
    && opponents.every((defender) => distanceToSegment(defender, carrier, player) > SIMULATION.passLaneClearance));
}

export function availablePassOptions(state) {
  const carrier = state.players.find((player) => player.id === state.simulation.carrierId);
  if (!carrier || state.simulation.ballTarget) return [];
  if (carrier.team === 'away' && !state.awayVisible) return [];
  return openPassReceivers(state, carrier);
}
