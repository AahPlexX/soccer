import { PITCH_BOUNDS, PLAYER_SPEED, laneRisk, openness, searchSpots } from './ai-space.js';
import { clamp, distance, interceptPoint, lerpPoint, shadowPoint } from './ai-steering.js';
import { HALF_LENGTH, HALF_WIDTH, attackDirection, opponentOf } from './rules.js';

// Team-level AI: once per decision pass it reads the phase of play (attacking, defending, ball loose, pass in flight) and gives
// every outfield player a role with a target, so the team moves as one: one presser, one covering behind them, markers on the
// most dangerous attackers, supporters offering short passes to the carrier, runners going into space, a pair of defenders
// staying back, and the nearest players going for loose balls and passes. Pure; the executor in ai.js turns roles into movement.

/** When two roles compete for a player, the higher priority is kept for a moment even if a new plan disagrees. */
export const ROLE_PRIORITY = Object.freeze({ carry: 5, receive: 5, press: 4, chase: 4, intercept: 3, cover: 3, mark: 2, run: 2, support: 2, recover: 1, hold: 1 });

const ownGoal = (team) => ({ x: -attackDirection(team) * HALF_LENGTH, y: 0 });

/** The formation slot of a player, drifting with the ball and pushing up when the team attacks. Defenders stay goal side. */
export function shapeTarget(player, ball, team, attacking) {
  const dir = attackDirection(team);
  const home = player.home ?? { x: player.x, y: player.y };
  let x = home.x + ball.x * (attacking ? 0.55 : 0.3);
  const limit = attacking ? HALF_LENGTH - 4 : HALF_LENGTH - 8;
  if (player.role === 'ST' && attacking) x += dir * 6;
  if (['LD', 'RD', 'CD'].includes(player.role)) {
    const guard = ball.x - dir * (attacking ? -8 : 4);
    x = dir > 0 ? Math.min(x, guard) : Math.max(x, guard);
  }
  return { x: clamp(x, -limit, limit), y: clamp(home.y + (ball.y - home.y) * 0.28, -HALF_WIDTH + 2, HALF_WIDTH - 2) };
}

const homeOf = (ctx, p) => ctx.match.players.find((q) => q.id === p.id)?.home ?? p;

/**
 * Plans a team's roles. `seen` is the ball as perceived (a reaction time ago); `humanId` (or null) is the player the human is
 * controlling, who is never assigned a role. Returns { phase, assignments: Map(id -> { role, target, markId? }) }.
 */
export function planTeam(ctx, profile, team, seen, humanId = null) {
  const { match } = ctx;
  const dir = attackDirection(team);
  const mine = ctx.byTeam[team];
  const foes = ctx.byTeam[opponentOf(team)];
  const holder = match.owner ? ctx.byId.get(match.owner) : null;
  const inFlight = !holder && match.passTarget ? ctx.byId.get(match.passTarget) : null;
  const phase = holder ? (holder.team === team ? 'attack' : 'defend') : inFlight ? (inFlight.team === team ? 'attack' : 'defend') : 'loose';
  const assignments = new Map();
  const outfield = mine.filter((p) => p.role !== 'GK' && p.down <= 0 && p.id !== humanId);
  const free = new Set(outfield.map((p) => p.id));
  const take = (player, assignment) => { assignments.set(player.id, assignment); free.delete(player.id); };
  const freePlayers = () => outfield.filter((p) => free.has(p.id));
  const attacking = phase === 'attack';
  const goal = ownGoal(team);
  const targetsTaken = [];

  if (holder?.team === team) take(holder, { role: 'carry', target: { x: holder.x, y: holder.y } });

  if (phase === 'attack') {
    const carrier = holder ?? inFlight;
    // Receiver of a pass in flight.
    if (inFlight && inFlight.team === team && free.has(inFlight.id)) take(inFlight, { role: 'receive', target: interceptPoint(inFlight, PLAYER_SPEED, seen) });

    // Runners: forwards and wide players run into open space ahead of the ball.
    const runners = freePlayers().filter((p) => ['ST', 'LM', 'RM', 'CM'].includes(p.role)).sort((a, b) => b.x * dir - a.x * dir).slice(0, profile.runners);
    for (const mate of runners) {
      const home = homeOf(ctx, mate);
      const ahead = { x: carrier.x + dir * 14, y: clamp(home.y, -HALF_WIDTH + 3, HALF_WIDTH - 3) };
      const best = searchSpots(ahead, 9, 3, PITCH_BOUNDS, (spot) => {
        if ((spot.x - carrier.x) * dir < 4) return null;
        let score = 1.3 * openness(ctx, team, spot.x, spot.y) - 0.9 * (Math.abs(dir * HALF_LENGTH - spot.x) / 30);
        score += 0.6 * (1 - laneRisk(ctx, team, carrier, spot)) - 0.5 * (Math.abs(spot.y - mate.y) / 18);
        for (const taken of targetsTaken) if (distance(spot, taken) < 4.5) score -= 0.9;
        return score;
      });
      if (best) { targetsTaken.push(best); take(mate, { role: 'run', target: { x: best.x, y: best.y } }); }
    }

    // Supporters: the nearest teammates find an open spot 4 to 10 m from the carrier with a safe lane back to them.
    const supporters = freePlayers().sort((a, b) => distance(a, carrier) - distance(b, carrier)).slice(0, 2);
    for (const mate of supporters) {
      const home = homeOf(ctx, mate);
      const best = searchSpots(carrier, 11, 2.5, PITCH_BOUNDS, (spot) => {
        const d = distance(spot, carrier);
        if (d < 3.5) return null;
        let score = 1.0 * openness(ctx, team, spot.x, spot.y) + 1.2 * (1 - laneRisk(ctx, team, carrier, spot));
        score += 0.5 * clamp(((spot.x - carrier.x) * dir) / 10, -0.5, 1);
        score -= 0.6 * (distance(spot, shapeTarget({ ...mate, home }, seen, team, true)) / 25);
        if (d < 4.5) score -= 0.8;
        for (const taken of targetsTaken) if (distance(spot, taken) < 4) score -= 0.9;
        return score;
      });
      if (best) { targetsTaken.push(best); take(mate, { role: 'support', target: { x: best.x, y: best.y } }); }
    }

    // Two defenders stay back as cover in case the ball is lost.
    const back = freePlayers().filter((p) => ['LD', 'RD', 'CD'].includes(p.role)).sort((a, b) => a.x * dir - b.x * dir).slice(0, 2);
    for (const mate of back) {
      const home = homeOf(ctx, mate);
      take(mate, { role: 'recover', target: { x: clamp(carrier.x - dir * 10, -HALF_LENGTH + 6, HALF_LENGTH - 6), y: clamp(home.y + (carrier.y - home.y) * 0.3, -HALF_WIDTH + 3, HALF_WIDTH - 3) } });
    }
  } else if (phase === 'defend') {
    const carrier = holder ?? inFlight;
    const reach = (p) => distance(p, carrier) / 5.5 + ((p.x - carrier.x) * dir > 0 ? 0.5 : 0); // players already beaten take longer
    const nearest = freePlayers().sort((a, b) => reach(a) - reach(b));
    if (inFlight && inFlight.team !== team) {
      // Their pass is in the air: those who can get there first go for it.
      const ballPoint = interceptPoint(inFlight, PLAYER_SPEED, seen);
      for (const mate of nearest) {
        const hit = interceptPoint(mate, 5.5, seen);
        if (hit.t < ballPoint.t + 0.3 && assignments.size < 3) take(mate, { role: 'intercept', target: { x: hit.x, y: hit.y } });
      }
    }
    const presser = nearest.find((p) => free.has(p.id) && distance(p, carrier) <= profile.pressRadius);
    if (presser) take(presser, { role: 'press', target: { x: carrier.x, y: carrier.y }, carrierId: carrier.id });
    const cover = freePlayers().sort((a, b) => reach(a) - reach(b))[0];
    if (cover && presser) {
      const behind = shadowPoint(carrier, goal, 5.5);
      take(cover, { role: 'cover', target: { x: behind.x, y: clamp(behind.y * 0.8, -HALF_WIDTH + 2, HALF_WIDTH - 2) } });
    }
    // Markers on the most dangerous attackers (nearest our goal), standing goal side and a little toward the ball.
    const threats = foes.filter((f) => f.role !== 'GK' && f.id !== carrier.id && f.down <= 0).sort((a, b) => distance(a, goal) - distance(b, goal)).slice(0, profile.markers);
    for (const threat of threats) {
      const marker = freePlayers().sort((a, b) => distance(a, threat) - distance(b, threat))[0];
      if (marker) take(marker, { role: 'mark', markId: threat.id, target: lerpPoint(shadowPoint(threat, goal, 2.0), carrier, 0.1) });
    }
  } else {
    // The ball is loose: the fastest to it goes, the next covers behind.
    const times = freePlayers().map((p) => ({ p, hit: interceptPoint(p, 5.5, seen) })).sort((a, b) => a.hit.t - b.hit.t);
    if (times[0]) take(times[0].p, { role: 'chase', target: { x: times[0].hit.x, y: times[0].hit.y } });
    if (times[1] && times[0]) {
      const behind = shadowPoint({ x: times[0].hit.x, y: times[0].hit.y }, goal, 4.5);
      take(times[1].p, { role: 'cover', target: behind });
    }
  }

  // Everyone else holds the team shape.
  for (const p of freePlayers()) take(p, { role: 'hold', target: shapeTarget({ ...p, home: homeOf(ctx, p) }, seen, team, attacking) });
  return { phase, assignments };
}
