import test from 'node:test';
import assert from 'node:assert/strict';
import { BALL } from '../js/ball-physics.js';
import { CONTROL, carryBall } from '../js/game/ball-control.js';
import { MATCH, createMatch, drainEvents, playerById, stepMatch, teamOf } from '../js/game/match.js';
import { PLAYER, createPlayer, stepPlayer } from '../js/game/player-physics.js';

const DT = MATCH.step;

/** A lone dribbler and a ball on the grass, stepped the way the match steps them (the ball rolls on whatever carryBall sets). */
function rig() {
  const player = createPlayer({ id: 'p', team: 'home', role: 'CM', x: 0, y: 0 }, 0);
  const ball = { x: 0.35, y: 0, z: BALL.radius, vx: 0, vy: 0, vz: 0 };
  const touch = { clock: 0 };
  let owned = true;
  let widest = 0;
  return {
    player, ball, touch,
    get owned() { return owned; }, get widest() { return widest; },
    step(wish) {
      stepPlayer(player, wish, DT, { hasBall: true });
      owned = carryBall(player, ball, touch, DT) && owned;
      ball.x += ball.vx * DT; ball.y += ball.vy * DT;
      widest = Math.max(widest, Math.hypot(ball.x - player.x, ball.y - player.y));
    },
    run(wish, seconds) { for (let i = 0; i < Math.round(seconds / DT); i += 1) this.step(wish); },
    /** The ball's position along and across the player's heading, in meters. */
    local() {
      const ox = ball.x - player.x; const oy = ball.y - player.y;
      return { ahead: ox * Math.cos(player.heading) + oy * Math.sin(player.heading), side: -ox * Math.sin(player.heading) + oy * Math.cos(player.heading) };
    },
  };
}

test('standing still, the ball settles at the feet and stays there', () => {
  const r = rig();
  r.ball.x = 0.9; r.ball.y = 0.4; // a loose touch away from the feet
  r.run({ x: 0, y: 0, sprint: false }, 0.5);
  const { ahead, side } = r.local();
  assert.ok(Math.abs(ahead - CONTROL.dribbleLead) < 0.03 && Math.abs(side) < 0.03, `settled at ${ahead.toFixed(2)} ahead, ${side.toFixed(2)} across`);
  assert.equal(r.owned, true);
});

test('running straight, the ball stays just ahead of the feet on the line, at every speed', () => {
  for (const sprint of [false, true]) {
    const r = rig();
    r.run({ x: 1, y: 0, sprint }, 2.5);
    const { ahead, side } = r.local();
    assert.ok(ahead > 0.15 && ahead < 0.75, `${sprint ? 'sprint' : 'run'}: ${ahead.toFixed(2)} m ahead`);
    assert.ok(Math.abs(side) < 0.05, `${sprint ? 'sprint' : 'run'}: ${side.toFixed(2)} m off the line`);
    assert.equal(r.owned, true);
    assert.ok(r.widest < 0.8, `never further than ${r.widest.toFixed(2)} m`);
  }
});

test('a full-speed reversal keeps the ball: it sweeps round to the new front instead of rolling away', () => {
  const r = rig();
  r.run({ x: 1, y: 0, sprint: true }, 2);
  r.run({ x: -1, y: 0, sprint: true }, 0.4); // a 180 degree turn at sprint speed
  assert.equal(r.owned, true, 'possession never lost');
  assert.ok(r.widest < 1.2, `the ball swung out to ${r.widest.toFixed(2)} m at most`);
  r.run({ x: -1, y: 0, sprint: true }, 0.6);
  const { ahead, side } = r.local();
  assert.ok(ahead > 0.15 && Math.abs(side) < 0.1, `then it is in front again (${ahead.toFixed(2)} ahead, ${side.toFixed(2)} across)`);
  assert.ok(r.ball.x < r.player.x, 'and in front means on the new side');
});

test('stopping dead, cutting and zig-zagging never lose the ball (random steering, many seeds)', () => {
  for (let seed = 1; seed <= 25; seed += 1) {
    let state = (seed * 2654435761) >>> 0;
    const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
    const r = rig();
    for (let move = 0; move < 40; move += 1) {
      const angle = random() * Math.PI * 2;
      const still = random() < 0.2;
      r.run({ x: still ? 0 : Math.cos(angle), y: still ? 0 : Math.sin(angle), sprint: random() < 0.5 }, 0.1 + random() * 0.8);
      assert.equal(r.owned, true, `seed ${seed} move ${move}: possession lost`);
    }
    assert.ok(r.widest < CONTROL.holdRadius * 0.85, `seed ${seed}: the ball strayed ${r.widest.toFixed(2)} m`);
  }
});

test('a tackle still wins the ball from a sticky dribbler (and the ball is not pulled back)', () => {
  const match = createMatch({ seed: 5, humanTeam: 'home' });
  match.phase = 'play';
  match.players.forEach((p, i) => Object.assign(p, { x: p.team === 'home' ? -20 : 20, y: (i % 7) * 3 - 9, vx: 0, vy: 0 }));
  const me = playerById(match, match.activeId);
  const foe = teamOf(match, 'away').find((p) => p.role !== 'GK');
  Object.assign(me, { x: 0, y: 0, heading: 0 });
  Object.assign(foe, { x: 0.9, y: 0, heading: Math.PI });
  Object.assign(match.ball, { x: 0.3, y: 0, z: BALL.radius, vx: 0, vy: 0 });
  match.owner = me.id;
  let won = false;
  for (let i = 0; i < Math.round(1 / DT) && !won; i += 1) {
    stepMatch(match, { [foe.id]: { move: { x: 0, y: 0 }, tackle: 'stand' }, [me.id]: { move: { x: 0, y: 0 } } }, DT);
    won = drainEvents(match).some((event) => event.type === 'tackle');
  }
  assert.ok(won, 'the tackle took the ball');
  assert.notEqual(match.owner, me.id, 'the dribbler no longer owns it');
  assert.ok(Math.hypot(match.ball.vx, match.ball.vy) > 1, 'and it is moving away, not held');
});

test('the dribble constants keep the ball inside the hold radius with margin', () => {
  const widest = CONTROL.dribbleLead + CONTROL.sprintSpeedRef * CONTROL.dribbleLeadPerSpeed + CONTROL.dribbleBob;
  assert.ok(widest < CONTROL.holdRadius * 0.7, `the furthest the ball is aimed is ${widest.toFixed(2)} m, hold radius ${CONTROL.holdRadius}`);
  assert.ok(widest < 0.8, 'and it is held tight to the feet');
  assert.ok(CONTROL.dribbleLead > PLAYER.radius * 0.7, 'but not inside the body');
});
