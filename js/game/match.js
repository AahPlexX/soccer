import { BALL, goalColliders, restingBall, stepBall } from '../ball-physics.js';
import {
  CONTROL, assistedAim, bestPassTarget, canControl, carryBall, headerContact, keeperContact, kickPass, kickShot, leadTarget,
  startTackle, tackleContact, trapBall,
} from './ball-control.js';
import { createPlayer, separatePlayers, stepPlayer } from './player-physics.js';
import {
  HALF_LENGTH, HALF_MOUTH, HALF_WIDTH, attackDirection, boundaryRestart, exitCrossing, formationSlots, inPenaltyArea, opponentOf,
} from './rules.js';

// The Game Mode match: state, phases (kickoff, play, goal, restart, halftime, fulltime), clock, score and the rules that
// connect players, ball and restarts. Pure and deterministic: it mutates the match it is given, uses a fixed time step supplied
// by the caller and no wall clock or Math.random. Controls come in as data, so humans, AI and tests all drive it the same way.

export const MATCH = Object.freeze({
  step: 1 / 120,
  kickoffDelay: 1.2,
  goalDelay: 3,
  restartDelay: 1,
  kickerImmunity: 0.3, // seconds a player cannot re-take a ball they just kicked
  blockRadius: 0.45,
  blockSpeed: CONTROL.maxRelativeSpeed,
});

const COLLIDERS = goalColliders({ halfLength: HALF_LENGTH, halfMouth: HALF_MOUTH });
const STILL = Object.freeze({ x: 0, y: 0, sprint: false });

/** The next pseudo-random number in [0, 1) from the match's own seeded generator (mulberry32). */
export function nextRandom(match) {
  match.rng = (match.rng + 0x6d2b79f5) >>> 0;
  let t = match.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function createMatch({ seed = 1, halfSeconds = 120, humanTeam = 'home', homeFormation = '1-3-2-1', awayFormation = '1-2-3-1', kickoffTeam = 'home' } = {}) {
  const slots = [...formationSlots('home', homeFormation), ...formationSlots('away', awayFormation)];
  const match = {
    rng: (seed >>> 0) || 1,
    time: 0,
    half: 1,
    halfSeconds,
    clock: halfSeconds,
    score: { home: 0, away: 0 },
    phase: 'kickoff',
    phaseTime: 0,
    humanTeam,
    activeId: null,
    players: slots.map((slot) => createPlayer(slot, slot.team === 'home' ? 0 : Math.PI)),
    ball: restingBall(0, 0),
    owner: null, // id of the player controlling the ball, or null while it is loose or in flight
    touch: { clock: 0 },
    lastTouch: { team: null, id: null },
    immune: { id: null, until: 0 },
    restart: null,
    kickoffTeam,
    firstKickoffTeam: kickoffTeam,
    passTarget: null, // the intended receiver of the pass in flight, for the active-player switch
    switching: { lockUntil: 0, rank: 0, lastManual: -99, order: [] }, // see switching.js
    stats: { shots: { home: 0, away: 0 }, possession: { home: 0, away: 0 }, saves: { home: 0, away: 0 } },
    events: [],
  };
  placeKickoff(match, kickoffTeam);
  return match;
}

export const playerById = (match, id) => match.players.find((p) => p.id === id) ?? null;
export const teamOf = (match, team) => match.players.filter((p) => p.team === team);
const emit = (match, event) => { match.events.push({ ...event, time: match.time }); };
const currentOwner = (match) => (match.owner ? playerById(match, match.owner) : null);

/** Removes and returns the events raised since the last call (for sound, HUD and replays). */
export function drainEvents(match) {
  return match.events.splice(0, match.events.length);
}

function setOwner(match, player) {
  match.owner = player ? player.id : null;
  match.touch.clock = 0;
  if (player) {
    match.lastTouch = { team: player.team, id: player.id };
    match.passTarget = null;
  }
}

function releaseBall(match) {
  match.owner = null;
  match.touch.clock = 0;
}

function resetBall(match, x, y) {
  Object.assign(match.ball, restingBall(x, y));
}

/** The human team's outfield player nearest the ball (the starting active player). */
export function defaultActive(match) {
  const mine = teamOf(match, match.humanTeam).filter((p) => p.role !== 'GK');
  mine.sort((a, b) => Math.hypot(a.x - match.ball.x, a.y - match.ball.y) - Math.hypot(b.x - match.ball.x, b.y - match.ball.y) || (a.id < b.id ? -1 : 1));
  return mine[0]?.id ?? null;
}

/** Puts both teams on their kickoff positions with the ball at the center, at the feet of the kicking team's striker. */
export function placeKickoff(match, team) {
  match.kickoffTeam = team;
  match.restart = { type: 'kickoff', team, spot: { x: 0, y: 0 } };
  for (const player of match.players) {
    Object.assign(player, { x: player.home.x, y: player.home.y, vx: 0, vy: 0, down: 0, action: null, heading: player.team === 'home' ? 0 : Math.PI });
  }
  const striker = teamOf(match, team).find((p) => p.role === 'ST') ?? teamOf(match, team)[0];
  striker.x = -attackDirection(team) * 0.5;
  striker.y = 0;
  resetBall(match, 0, 0);
  setOwner(match, striker);
  match.phase = 'kickoff';
  match.phaseTime = 0;
  if (match.humanTeam === team) match.activeId = striker.id;
  else if (!match.activeId || playerById(match, match.activeId)?.team !== match.humanTeam) match.activeId = defaultActive(match);
}

/** Sets up a throw-in, corner, goal kick or free kick: the nearest eligible player of the restarting team takes it. */
export function setRestart(match, restart) {
  const { spot, team } = restart;
  const candidates = teamOf(match, team).filter((p) => (restart.type === 'goal-kick' ? p.role === 'GK' : p.role !== 'GK'));
  candidates.sort((a, b) => Math.hypot(a.x - spot.x, a.y - spot.y) - Math.hypot(b.x - spot.x, b.y - spot.y) || (a.id < b.id ? -1 : 1));
  const taker = candidates[0] ?? teamOf(match, team)[0];
  Object.assign(taker, { x: spot.x, y: spot.y, vx: 0, vy: 0, down: 0, action: null });
  taker.heading = restart.type === 'throw-in'
    ? Math.atan2(-Math.sign(spot.y) * 6, attackDirection(team) * 4)
    : Math.atan2(-spot.y, attackDirection(team) * 8);
  // Opponents give the taker room.
  for (const foe of teamOf(match, opponentOf(team))) {
    const gap = Math.hypot(foe.x - spot.x, foe.y - spot.y);
    if (gap >= 3) continue;
    const nx = gap > 1e-6 ? (foe.x - spot.x) / gap : 1;
    const ny = gap > 1e-6 ? (foe.y - spot.y) / gap : 0;
    foe.x = Math.max(-HALF_LENGTH, Math.min(HALF_LENGTH, spot.x + nx * 3));
    foe.y = Math.max(-HALF_WIDTH, Math.min(HALF_WIDTH, spot.y + ny * 3));
  }
  resetBall(match, spot.x, spot.y);
  setOwner(match, taker);
  match.restart = { ...restart, takerId: taker.id };
  match.phase = 'restart';
  match.phaseTime = 0;
  if (team === match.humanTeam) match.activeId = taker.id;
  emit(match, { type: 'whistle', restart: restart.type, team });
}

/** What a player does when nobody tells them: hold their slot, drifting with the ball (a placeholder until the AI drives them). */
export function defaultControl(match, player) {
  const forward = attackDirection(player.team);
  const ball = match.ball;
  const target = player.role === 'GK'
    ? { x: player.home.x, y: Math.max(-3, Math.min(3, ball.y * 0.2)) }
    : { x: player.home.x + ball.x * 0.2 * forward * forward, y: player.home.y + ball.y * 0.25 };
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const gap = Math.hypot(dx, dy);
  if (gap < 0.5) return { move: { x: 0, y: 0 }, sprint: false };
  const ease = Math.min(1, gap / 3) * 0.6;
  return { move: { x: (dx / gap) * ease, y: (dy / gap) * ease }, sprint: false };
}

function kickImmunity(match, player) {
  match.immune = { id: player.id, until: match.time + MATCH.kickerImmunity };
}

function applyOwnerActions(match, player, control) {
  const direction = control.move ?? STILL;
  if (control.shoot) {
    const aim = assistedAim(player, direction);
    const power = control.shoot.power ?? 0.5;
    kickShot(match.ball, power, aim, control.shoot.curl ?? 0, control.shoot.elevation ?? null);
    if (aim.x * attackDirection(player.team) > 0) match.stats.shots[player.team] += 1;
    player.action = { type: 'kick', t: 0, duration: 0.25 };
    kickImmunity(match, player);
    match.lastTouch = { team: player.team, id: player.id };
    releaseBall(match);
    emit(match, { type: 'shot', team: player.team, id: player.id, power });
    return;
  }
  if (control.pass) {
    const lob = control.pass === 'lob';
    // `passTo` names the receiver (the AI's choice); otherwise the held direction and the open lanes decide.
    const named = control.passTo ? playerById(match, control.passTo) : null;
    const mate = named && named.team === player.team && named.id !== player.id
      ? named
      : bestPassTarget(player, teamOf(match, player.team), direction, teamOf(match, opponentOf(player.team)));
    const aimPoint = mate
      ? leadTarget(match.ball, mate, lob)
      : { x: player.x + Math.cos(player.heading) * 10, y: player.y + Math.sin(player.heading) * 10 };
    const miss = control.passError ?? 0; // the AI's inaccuracy: the aim point is turned about the ball by this angle
    if (miss) {
      const dx = aimPoint.x - match.ball.x;
      const dy = aimPoint.y - match.ball.y;
      aimPoint.x = match.ball.x + dx * Math.cos(miss) - dy * Math.sin(miss);
      aimPoint.y = match.ball.y + dx * Math.sin(miss) + dy * Math.cos(miss);
    }
    kickPass(match.ball, aimPoint, { lob });
    player.action = { type: 'kick', t: 0, duration: 0.25 };
    kickImmunity(match, player);
    match.lastTouch = { team: player.team, id: player.id };
    match.passTarget = mate ? mate.id : null;
    releaseBall(match);
    emit(match, { type: 'pass', team: player.team, from: player.id, to: mate ? mate.id : null, lob });
  }
}

function resolveBallContacts(match, dt) {
  const ball = match.ball;
  const holder = currentOwner(match);
  if (holder && !carryBall(holder, ball, match.touch, dt)) releaseBall(match);

  // Tackles dislodge the ball, or are fouls.
  for (const tackler of match.players) {
    if (tackler.action?.type !== 'tackle' && tackler.action?.type !== 'slide') continue;
    const foes = teamOf(match, opponentOf(tackler.team));
    const result = tackleContact(tackler, ball, foes, match.owner);
    if (result === 'ball') {
      const victim = currentOwner(match);
      if (victim && victim.team !== tackler.team) {
        releaseBall(match);
        emit(match, { type: 'tackle', team: tackler.team, id: tackler.id });
      }
      match.lastTouch = { team: tackler.team, id: tackler.id };
      kickImmunity(match, tackler);
    } else if (result === 'foul') {
      const victim = foes.find((foe) => foe.down > 0);
      emit(match, { type: 'foul', team: tackler.team, id: tackler.id });
      setRestart(match, { type: 'free-kick', team: opponentOf(tackler.team), spot: { x: victim?.x ?? tackler.x, y: victim?.y ?? tackler.y } });
      return;
    }
  }

  // Goalkeepers inside their own penalty area save shots that did not come from their own team.
  for (const keeper of match.players) {
    if (keeper.role !== 'GK' || match.owner === keeper.id) continue;
    if (!inPenaltyArea(keeper.team, ball) || match.lastTouch.team === keeper.team) continue;
    const result = keeperContact(keeper, ball);
    if (result === 'catch') {
      resetBall(match, keeper.x, keeper.y); // the keeper gathers it into their hands
      setOwner(match, keeper);
      match.stats.saves[keeper.team] += 1;
      emit(match, { type: 'save', team: keeper.team, id: keeper.id, held: true });
    } else if (result === 'parry') {
      match.lastTouch = { team: keeper.team, id: keeper.id };
      releaseBall(match);
      match.stats.saves[keeper.team] += 1;
      emit(match, { type: 'save', team: keeper.team, id: keeper.id, held: false });
    }
  }
  if (match.owner) return;

  // A loose ball: the nearest player who can control it takes it; a fast ball at the body is blocked; a high one is headed.
  const eligible = match.players.filter((p) => !(p.id === match.immune.id && match.time < match.immune.until));
  let taker = null;
  let nearest = Infinity;
  for (const player of eligible) {
    if (!canControl(player, ball)) continue;
    const gap = Math.hypot(player.x - ball.x, player.y - ball.y);
    if (gap < nearest - 1e-9 || (Math.abs(gap - nearest) <= 1e-9 && taker && player.id < taker.id)) { nearest = gap; taker = player; }
  }
  if (taker) {
    trapBall(taker, ball);
    setOwner(match, taker);
    emit(match, { type: 'touch', team: taker.team, id: taker.id });
    return;
  }
  for (const player of eligible) {
    if (headerContact(player, ball)) {
      match.lastTouch = { team: player.team, id: player.id };
      kickImmunity(match, player); // one touch at a time, or a ball hanging at head height would be headed every step
      emit(match, { type: 'header', team: player.team, id: player.id });
      return;
    }
    const gap = Math.hypot(player.x - ball.x, player.y - ball.y);
    const fast = Math.hypot(ball.vx - player.vx, ball.vy - player.vy) > MATCH.blockSpeed;
    if (fast && gap < MATCH.blockRadius && ball.z - BALL.radius <= CONTROL.maxHeight && player.down <= 0 && player.role !== 'GK') {
      ball.vx = -ball.vx * 0.3 + player.vx * 0.5;
      ball.vy = -ball.vy * 0.3 + player.vy * 0.5;
      match.lastTouch = { team: player.team, id: player.id };
      kickImmunity(match, player);
      emit(match, { type: 'block', team: player.team, id: player.id });
      return;
    }
  }
}

function movePlayers(match, controls, dt, frozen) {
  for (const player of match.players) {
    if (frozen) {
      stepPlayer(player, STILL, dt, { hasBall: match.owner === player.id });
      continue;
    }
    const control = controls[player.id] ?? defaultControl(match, player);
    if (match.owner === player.id) applyOwnerActions(match, player, control);
    else if (control.tackle) startTackle(player, { slide: control.tackle === 'slide' });
    stepPlayer(player, { x: control.move?.x ?? 0, y: control.move?.y ?? 0, sprint: control.sprint }, dt, { hasBall: match.owner === player.id, speedScale: control.speedScale ?? 1 });
  }
  separatePlayers(match.players);
}

function endOfHalf(match) {
  match.phaseTime = 0;
  if (match.half === 1) {
    match.phase = 'halftime';
    emit(match, { type: 'whistle', restart: 'halftime' });
  } else {
    match.phase = 'fulltime';
    emit(match, { type: 'fulltime', score: { ...match.score } });
  }
}

function tickPlay(match, controls, dt) {
  match.clock = Math.max(0, match.clock - dt);
  const holder = currentOwner(match);
  if (holder) match.stats.possession[holder.team] += dt;
  movePlayers(match, controls, dt, false);
  const before = { x: match.ball.x, y: match.ball.y, z: match.ball.z };
  resolveBallContacts(match, dt);
  if (match.phase !== 'play') return; // a foul may already have started a restart
  stepBall(match.ball, dt, COLLIDERS);
  const exit = exitCrossing(before, match.ball);
  if (exit) {
    const restart = boundaryRestart(exit, match.lastTouch.team ?? match.kickoffTeam);
    if (restart?.type === 'kickoff') {
      match.score[restart.scoredBy] += 1;
      match.kickoffTeam = restart.team;
      match.phase = 'goal';
      match.phaseTime = 0;
      resetBall(match, exit.x, exit.y);
      match.owner = null;
      emit(match, { type: 'goal', team: restart.scoredBy, score: { ...match.score } });
    } else if (restart) {
      setRestart(match, restart);
    }
    return;
  }
  if (match.clock <= 0) endOfHalf(match);
}

/**
 * Advances the match by one fixed step. `controls` maps player id to { move, sprint, pass, passTo, passError, shoot, tackle, speedScale }.
 */
export function stepMatch(match, controls, dt = MATCH.step) {
  match.time += dt;
  match.phaseTime += dt;
  switch (match.phase) {
    case 'kickoff':
      movePlayers(match, {}, dt, true);
      if (match.phaseTime >= MATCH.kickoffDelay) { match.phase = 'play'; match.phaseTime = 0; emit(match, { type: 'whistle', restart: 'kickoff' }); }
      break;
    case 'restart':
      movePlayers(match, {}, dt, true);
      if (match.phaseTime >= MATCH.restartDelay) { match.phase = 'play'; match.phaseTime = 0; }
      break;
    case 'play':
      tickPlay(match, controls, dt);
      break;
    case 'goal':
      movePlayers(match, {}, dt, true);
      if (match.phaseTime >= MATCH.goalDelay) placeKickoff(match, match.kickoffTeam);
      break;
    case 'halftime':
      if (match.phaseTime >= MATCH.goalDelay) {
        match.half = 2;
        match.clock = match.halfSeconds;
        placeKickoff(match, opponentOf(match.firstKickoffTeam));
      }
      break;
    default:
      break; // fulltime: the match is over
  }
}
