import { SIMULATION } from './constants.js';
import { distanceToSegment } from './geometry.js';

/**
 * Teammates of `carrier` whose carrier→receiver line has no opponent within SIMULATION.passLaneClearance.
 * The single definition of an open lane: the CPU's receiver choice and the on-screen pass options both use it.
 */
export function openPassReceivers(state, carrier) {
  const onPitch = state.players.filter((player) => !player.benched); // benched players are neither receivers nor blockers
  const opponents = onPitch.filter((player) => player.team !== carrier.team);
  return onPitch.filter((player) => player.team === carrier.team && player.id !== carrier.id
    && opponents.every((defender) => distanceToSegment(defender, carrier, player) > SIMULATION.passLaneClearance));
}

export function availablePassOptions(state) {
  const carrier = state.players.find((player) => player.id === state.simulation.carrierId);
  if (!carrier || state.simulation.ballTarget) return [];
  if (carrier.team === 'away' && !state.awayVisible) return [];
  return openPassReceivers(state, carrier);
}

// Explain why no overlay is visible without inventing possession for a loose ball.
export function passOptionsStatus(state, receivers = availablePassOptions(state)) {
  if (state.simulation.ballTarget) return 'Ball in motion; lines appear when a player gains possession.';
  const carrier = state.players.find((player) => player.id === state.simulation.carrierId);
  if (!carrier) return 'Ball is loose; play until a player gains possession.';
  if (carrier.team === 'away' && !state.awayVisible) return 'Show opponents to see their pass options.';
  if (!receivers.length) return 'No clear pass lanes for the player in possession.';
  return `${receivers.length} clear pass ${receivers.length === 1 ? 'lane' : 'lanes'} shown.`;
}
