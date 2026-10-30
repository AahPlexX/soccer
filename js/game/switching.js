// Choosing which player the human controls (one at a time). Three routes, all ending in the same `match.activeId` change:
// automatic (the receiver of a pass, the player who wins the ball, the best defender), manual cycle (nearest to the ball,
// repeated presses walk outward) and directional (the teammate best matching a held direction). Pure; mutates the match.

export const SWITCH = Object.freeze({
  autoLockout: 0.4, // seconds after any switch before the automatic rule may switch again, so it never flickers
  defendMargin: 2, // meters nearer the ball a teammate must be before the automatic rule takes the defender role from the current player
  manualHold: 1.5, // seconds a manual switch is respected before the ball-holder rule may take the active player back
  cycleWindow: 1, // presses within this many seconds keep walking outward through the candidates
  directionCone: (65 * Math.PI) / 180,
});

const distanceToBall = (match, player) => Math.hypot(player.x - match.ball.x, player.y - match.ball.y);
const byDistanceThenId = (match) => (a, b) => distanceToBall(match, a) - distanceToBall(match, b) || (a.id < b.id ? -1 : 1);

/** The players the human may switch to: their outfield players who are on their feet (never the goalkeeper). */
export function switchCandidates(match) {
  return match.players.filter((p) => p.team === match.humanTeam && p.role !== 'GK' && p.down <= 0);
}

function setActive(match, id, manual = false) {
  if (match.activeId === id) return false;
  match.activeId = id;
  match.switching.lockUntil = match.time + SWITCH.autoLockout;
  if (manual) match.switching.lastManual = match.time;
  return true;
}

/**
 * The automatic rule, called every step. Returns true if the active player changed.
 *  1. A pass from the human team in flight: the receiver becomes active.
 *  2. A human-team player has the ball (the goalkeeper too, while holding it to distribute): they are active.
 *  3. Otherwise the best defender: the candidate nearest the ball, switching only past `defendMargin` and the lockout.
 */
export function autoSwitch(match) {
  const mine = switchCandidates(match);
  if (mine.length === 0) return false;
  const holder = match.owner ? match.players.find((p) => p.id === match.owner) : null;

  if (!holder && match.passTarget) {
    const receiver = mine.find((p) => p.id === match.passTarget);
    if (receiver) return setActive(match, receiver.id);
  }
  // A deliberate manual switch is respected for a moment even while the team has the ball.
  if (holder?.team === match.humanTeam) return match.time - match.switching.lastManual < SWITCH.manualHold ? false : setActive(match, holder.id);

  // Defending, or the ball is loose or in flight with no human receiver.
  const current = match.players.find((p) => p.id === match.activeId);
  const best = mine.slice().sort(byDistanceThenId(match))[0];
  if (!current || current.team !== match.humanTeam || current.role === 'GK' || current.down > 0) return setActive(match, best.id);
  if (match.time < match.switching.lockUntil) return false;
  if (best.id !== current.id && distanceToBall(match, current) - distanceToBall(match, best) > SWITCH.defendMargin) return setActive(match, best.id);
  return false;
}

/**
 * Manual cycle: the nearest teammate to the ball that is not the current one. Pressing again within `cycleWindow` seconds walks to
 * the next nearest, so a quick triple press reaches the third.
 */
export function cycleSwitch(match) {
  const state = match.switching;
  const mine = switchCandidates(match);
  const repeat = match.time - state.lastManual <= SWITCH.cycleWindow && Array.isArray(state.order) && state.order.length > 0;
  if (!repeat) {
    state.order = mine.filter((p) => p.id !== match.activeId).sort(byDistanceThenId(match)).map((p) => p.id);
    state.rank = 0;
  } else {
    state.rank += 1;
  }
  const order = state.order.filter((id) => mine.some((p) => p.id === id));
  if (order.length === 0) return false;
  return setActive(match, order[state.rank % order.length], true);
}

/** Directional switch: the teammate best matching `dir` ({ x, y }) from the current player, falling back to the cycle. */
export function directionSwitch(match, dir) {
  const length = Math.hypot(dir.x, dir.y);
  const current = match.players.find((p) => p.id === match.activeId);
  if (length < 0.3 || !current) return cycleSwitch(match);
  const wanted = Math.atan2(dir.y, dir.x);
  let best = null;
  let bestScore = -Infinity;
  for (const mate of switchCandidates(match)) {
    if (mate.id === current.id) continue;
    const dx = mate.x - current.x;
    const dy = mate.y - current.y;
    const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - wanted), Math.cos(Math.atan2(dy, dx) - wanted)));
    if (off > SWITCH.directionCone) continue;
    const score = -off * 4 - Math.hypot(dx, dy) * 0.25;
    if (score > bestScore || (score === bestScore && best && mate.id < best.id)) { bestScore = score; best = mate; }
  }
  return best ? setActive(match, best.id, true) : cycleSwitch(match);
}
