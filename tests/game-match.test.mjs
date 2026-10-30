import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { BALL } from '../js/ball-physics.js';
import { MATCH, createMatch, defaultActive, drainEvents, nextRandom, playerById, stepMatch, teamOf } from '../js/game/match.js';
import { HALF_LENGTH, HALF_WIDTH } from '../js/game/rules.js';

const STEP = MATCH.step;
const seconds = (match, controls, time) => { for (let i = 0; i < Math.round(time / STEP); i += 1) stepMatch(match, typeof controls === 'function' ? controls(match, i) : controls, STEP); };
const inPlay = (match) => { match.phase = 'play'; match.phaseTime = 0; return match; };
const place = (match, id, x, y) => Object.assign(playerById(match, id), { x, y, vx: 0, vy: 0 });
// Every away player is moved well off to one side so a test can run the home team's play undisturbed.
const clearAway = (match) => teamOf(match, 'away').forEach((p, i) => place(match, p.id, 8 + i * 1.5, 16));

test('a new match starts at kickoff with the home striker on the ball and the human controlling them', () => {
  const match = createMatch({ seed: 7 });
  assert.equal(match.players.length, 14);
  assert.equal(match.phase, 'kickoff');
  assert.deepEqual(match.score, { home: 0, away: 0 });
  assert.equal(match.owner, 'home-7');
  assert.equal(match.activeId, 'home-7');
  assert.ok(match.players.every((p) => (p.team === 'home' ? p.x <= 0.51 : p.x >= -0.51)), 'every player starts in their own half');
  assert.equal(match.ball.z, BALL.radius);
  const awayKickoff = createMatch({ kickoffTeam: 'away' });
  assert.equal(awayKickoff.owner, 'away-7');
  assert.ok(playerById(awayKickoff, awayKickoff.activeId).team === 'home' && playerById(awayKickoff, awayKickoff.activeId).role !== 'GK', 'the human is given the outfield player nearest the ball');
});

test('play begins after the kickoff delay with a whistle, and the clock then runs', () => {
  const match = createMatch();
  seconds(match, {}, MATCH.kickoffDelay - 0.1);
  assert.equal(match.phase, 'kickoff');
  assert.equal(match.clock, match.halfSeconds, 'the clock waits for the whistle');
  seconds(match, {}, 0.3);
  assert.equal(match.phase, 'play');
  assert.ok(drainEvents(match).some((e) => e.type === 'whistle' && e.restart === 'kickoff'));
  seconds(match, {}, 2);
  assert.ok(Math.abs(match.clock - (match.halfSeconds - 2 - 0.2)) < 0.3);
});

test('the active player passes to a teammate in the held direction and the ball travels there', () => {
  const match = inPlay(createMatch());
  place(match, 'home-6', 8, 0);
  const controls = { 'home-7': { move: { x: 1, y: 0 }, pass: 'tap' } };
  stepMatch(match, controls, STEP);
  const events = drainEvents(match);
  const pass = events.find((e) => e.type === 'pass');
  assert.ok(pass, 'a pass was made');
  assert.equal(pass.to, 'home-6');
  assert.equal(match.owner, null, 'the ball is in flight');
  assert.equal(match.passTarget, 'home-6');
  const before = match.ball.x;
  seconds(match, {}, 1);
  assert.ok(match.ball.x > before + 3, 'the ball moved toward the target');
});

test('the kicker cannot take the ball straight back', () => {
  const match = inPlay(createMatch());
  stepMatch(match, { 'home-7': { move: { x: 1, y: 0 }, pass: 'tap' } }, STEP);
  stepMatch(match, {}, STEP);
  assert.notEqual(match.owner, 'home-7');
});

test('a low shot past the keeper is a goal: score, celebration, then the other team kicks off', () => {
  const match = inPlay(createMatch());
  clearAway(match);
  place(match, 'home-7', 20, 0.3);
  Object.assign(playerById(match, 'home-7'), { heading: 0 });
  Object.assign(match.ball, { x: 20.4, y: 0.3 });
  match.owner = 'home-7';
  stepMatch(match, { 'home-7': { move: { x: 1, y: 0 }, shoot: { power: 0.35 } } }, STEP);
  assert.ok(drainEvents(match).some((e) => e.type === 'shot'));
  seconds(match, {}, 2);
  assert.equal(match.phase, 'goal');
  assert.deepEqual(match.score, { home: 1, away: 0 });
  assert.ok(drainEvents(match).some((e) => e.type === 'goal' && e.team === 'home'));
  for (let i = 0; i < 120 * 4 && match.phase === 'goal'; i += 1) stepMatch(match, {}, STEP);
  assert.equal(match.phase, 'kickoff');
  assert.equal(match.owner, 'away-7', 'the team that conceded kicks off');
  assert.equal(match.ball.x, 0);
});

test('a shot over the bar is a goal kick for the defenders, taken by their keeper', () => {
  const match = inPlay(createMatch());
  clearAway(match);
  place(match, 'home-7', 18, 0);
  Object.assign(match.ball, { x: 18.4, y: 0 });
  match.owner = 'home-7';
  stepMatch(match, { 'home-7': { move: { x: 1, y: 0 }, shoot: { power: 1 } } }, STEP);
  seconds(match, {}, 3);
  assert.equal(match.restart.type, 'goal-kick');
  assert.equal(match.restart.team, 'away');
  assert.equal(playerById(match, match.restart.takerId).role, 'GK');
  assert.deepEqual(match.score, { home: 0, away: 0 });
});

test('the keeper holds a soft shot at them', () => {
  const match = inPlay(createMatch());
  for (const p of teamOf(match, 'away').filter((q) => q.role !== 'GK')) place(match, p.id, 10, 16);
  place(match, 'away-1', 26.2, 0);
  place(match, 'home-7', 20, 0);
  Object.assign(match.ball, { x: 20.4, y: 0 });
  match.owner = 'home-7';
  stepMatch(match, { 'home-7': { move: { x: 1, y: 0 }, shoot: { power: 0.0 } } }, STEP);
  seconds(match, { 'away-1': { move: { x: 0, y: 0 } } }, 3);
  assert.equal(match.owner, 'away-1');
  assert.equal(match.stats.saves.away, 1);
});

test('a ball over the sideline is a throw-in for the other team, taken at the line', () => {
  const match = inPlay(createMatch());
  clearAway(match);
  Object.assign(match.ball, { x: 5, y: HALF_WIDTH - 0.3, vy: 6 });
  match.owner = null;
  match.lastTouch = { team: 'home', id: 'home-3' };
  seconds(match, {}, 0.5);
  assert.equal(match.phase, 'restart');
  assert.deepEqual([match.restart.type, match.restart.team], ['throw-in', 'away']);
  const taker = playerById(match, match.restart.takerId);
  assert.ok(Math.abs(taker.y) > HALF_WIDTH - 0.2 && taker.team === 'away');
  assert.equal(match.owner, taker.id);
  assert.ok(drainEvents(match).some((e) => e.type === 'whistle' && e.restart === 'throw-in'));
});

test('a slide that takes the player but not the ball is a foul and gives a free kick', () => {
  const match = inPlay(createMatch());
  place(match, 'away-3', 0, 5);
  place(match, 'home-5', 0.5, 5);
  Object.assign(playerById(match, 'away-3'), { heading: 0 });
  Object.assign(match.ball, { x: -10, y: -10 });
  match.owner = null;
  stepMatch(match, { 'away-3': { tackle: 'slide' } }, STEP);
  seconds(match, {}, 0.3);
  assert.equal(match.restart?.type, 'free-kick');
  assert.equal(match.restart.team, 'home');
});

test('the match plays two halves, the second kicked off by the other team, then ends', () => {
  const match = createMatch({ halfSeconds: 3 });
  seconds(match, {}, MATCH.kickoffDelay + 3.3);
  assert.equal(match.phase, 'halftime');
  seconds(match, {}, MATCH.goalDelay + 0.1);
  assert.equal(match.half, 2);
  assert.equal(match.phase, 'kickoff');
  assert.equal(match.owner, 'away-7', 'the other team kicks off the second half');
  assert.equal(match.clock, 3);
  seconds(match, {}, MATCH.kickoffDelay + 3.5);
  assert.equal(match.phase, 'fulltime');
  assert.ok(drainEvents(match).some((e) => e.type === 'fulltime'));
  const frozen = JSON.stringify(match.players);
  seconds(match, {}, 1);
  assert.equal(JSON.stringify(match.players), frozen, 'nothing moves after full time');
});

test('possession time is tracked for the team on the ball', () => {
  const match = inPlay(createMatch());
  seconds(match, {}, 2);
  assert.ok(match.stats.possession.home > 1.5 && match.stats.possession.away === 0);
});

test('the seeded generator is repeatable and stays in [0, 1)', () => {
  const a = createMatch({ seed: 42 });
  const b = createMatch({ seed: 42 });
  const sequence = Array.from({ length: 50 }, () => nextRandom(a));
  assert.deepEqual(sequence, Array.from({ length: 50 }, () => nextRandom(b)));
  assert.ok(sequence.every((value) => value >= 0 && value < 1));
  assert.notDeepEqual(sequence, Array.from({ length: 50 }, () => nextRandom(createMatch({ seed: 43 }))));
});

test('defaultActive picks an outfield player of the human team', () => {
  const match = createMatch();
  assert.ok(['home-2', 'home-3', 'home-4', 'home-5', 'home-6', 'home-7'].includes(defaultActive(match)));
});

const scripted = (match, i) => {
  const t = i / 120;
  const id = match.activeId;
  return { [id]: { move: { x: Math.cos(t * 0.7), y: Math.sin(t * 1.3) }, sprint: Math.sin(t) > 0, pass: i % 300 === 299 ? 'tap' : null, shoot: i % 700 === 699 ? { power: 0.6 } : null, tackle: i % 500 === 499 ? 'stand' : null } };
};

test('a long scripted match is deterministic', () => {
  const run = () => { const m = createMatch({ seed: 5, halfSeconds: 20 }); seconds(m, scripted, 50); return m; };
  const a = run();
  const b = run();
  assert.deepEqual(a, b);
  assert.ok(a.stats.shots.home + a.stats.possession.home > 0);
});

test('whatever the controls, the match stays finite, the ball stays above the grass and the score never drops', () => {
  const control = fc.record({
    move: fc.record({ x: fc.double({ min: -1.5, max: 1.5, noNaN: true }), y: fc.double({ min: -1.5, max: 1.5, noNaN: true }) }),
    sprint: fc.boolean(),
    pass: fc.constantFrom(null, 'tap', 'lob'),
    shoot: fc.constantFrom(null, { power: 0.2 }, { power: 1, curl: 1 }),
    tackle: fc.constantFrom(null, 'stand', 'slide'),
  });
  fc.assert(fc.property(fc.array(control, { minLength: 1, maxLength: 40 }), fc.integer({ min: 1, max: 99 }), (script, seed) => {
    const match = createMatch({ seed, halfSeconds: 15 });
    let lastScore = 0;
    for (let i = 0; i < 120 * 25; i += 1) {
      stepMatch(match, { [match.activeId]: script[Math.floor(i / 75) % script.length] }, STEP);
      const { ball } = match;
      assert.ok([ball.x, ball.y, ball.z, ball.vx, ball.vy, ball.vz].every(Number.isFinite));
      assert.ok(ball.z >= BALL.radius - 1e-9);
      assert.ok(Math.abs(ball.x) <= HALF_LENGTH + 3 && Math.abs(ball.y) <= HALF_WIDTH + 3, 'the ball never wanders off');
      const total = match.score.home + match.score.away;
      assert.ok(total >= lastScore);
      lastScore = total;
    }
    assert.ok(match.players.every((p) => [p.x, p.y, p.vx, p.vy, p.stamina].every(Number.isFinite)));
  }), { numRuns: 12 });
});

test('a match step is cheap enough for 60 fps with room to spare (generous bound, catches gross regressions)', () => {
  const match = createMatch({ seed: 9, halfSeconds: 60 });
  const started = process.hrtime.bigint();
  const steps = 120 * 10;
  for (let i = 0; i < steps; i += 1) stepMatch(match, scripted(match, i), STEP);
  const perStep = Number(process.hrtime.bigint() - started) / 1e6 / steps;
  assert.ok(perStep < 2, `${perStep.toFixed(3)} ms per step`);
});
