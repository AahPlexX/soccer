import test from 'node:test';
import assert from 'node:assert/strict';
import { aiControls, createAi } from '../js/game/ai.js';
import { MATCH, createMatch, drainEvents, stepMatch } from '../js/game/match.js';

// Plays AI-vs-AI matches (fixed seeds, so the result is exact and repeatable) and counts what each side did. A pass is
// "completed" if the next touch of the ball is by the passer's team.
function play(spec, seeds, seconds = 150) {
  const sides = { home: { goals: 0, shots: 0, possession: 0, passes: 0, completed: 0 }, away: { goals: 0, shots: 0, possession: 0, passes: 0, completed: 0 } };
  for (const seed of seeds) {
    const match = createMatch({ seed, humanTeam: 'none', halfSeconds: seconds });
    match.activeId = null;
    const ai = createAi(spec);
    let controls = {};
    let pending = null;
    for (let i = 0; i < 120 * seconds; i += 1) {
      if (i % 6 === 0) controls = aiControls(match, ai, {});
      stepMatch(match, controls, MATCH.step);
      for (const event of drainEvents(match)) {
        if (event.type === 'pass') { pending = event.team; sides[event.team].passes += 1; }
        else if (['touch', 'tackle', 'header', 'block', 'save'].includes(event.type) && pending) { if (event.team === pending) sides[pending].completed += 1; pending = null; }
        if (event.type === 'goal') sides[event.team].goals += 1;
      }
    }
    for (const team of ['home', 'away']) { sides[team].shots += match.stats.shots[team]; sides[team].possession += match.stats.possession[team]; }
  }
  return sides;
}

const SEEDS = [1, 2, 3, 4];
const sum = (a, b) => ({ goals: a.goals + b.goals, shots: a.shots + b.shots, possession: a.possession + b.possession, passes: a.passes + b.passes, completed: a.completed + b.completed });

test('a harder AI beats an easier one, whichever side it plays: more of the ball, more shots, better passing, more goals', () => {
  const hardHome = play({ home: 'hard', away: 'easy' }, SEEDS);
  const hardAway = play({ home: 'easy', away: 'hard' }, SEEDS);
  const hard = sum(hardHome.home, hardAway.away);
  const easy = sum(hardHome.away, hardAway.home);
  assert.ok(hard.possession > easy.possession * 1.4, `possession ${hard.possession.toFixed(0)} vs ${easy.possession.toFixed(0)}`);
  assert.ok(hard.shots > easy.shots * 2, `shots ${hard.shots} vs ${easy.shots}`);
  assert.ok(hard.completed / hard.passes > easy.completed / easy.passes + 0.1, `pass completion ${(hard.completed / hard.passes).toFixed(2)} vs ${(easy.completed / easy.passes).toFixed(2)}`);
  assert.ok(hard.goals > easy.goals, `goals ${hard.goals} vs ${easy.goals}`);
});

test('two normal teams play a balanced, real game: both pass, keep the ball, shoot and score between them', () => {
  const { home, away } = play('normal', SEEDS);
  for (const side of [home, away]) {
    assert.ok(side.passes > 60, `${side.passes} passes`);
    assert.ok(side.completed / side.passes > 0.45, `completion ${(side.completed / side.passes).toFixed(2)}`);
    assert.ok(side.possession > 30, `possession ${side.possession.toFixed(0)} s`);
    assert.ok(side.shots >= 3, `${side.shots} shots`);
  }
  assert.ok(home.goals + away.goals >= 1, 'goals happen');
  assert.ok(Math.abs(home.possession - away.possession) < 0.4 * (home.possession + away.possession), 'neither side owns the ball');
});
