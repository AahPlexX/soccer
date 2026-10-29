import test from 'node:test';
import assert from 'node:assert/strict';
import { activeStage, normalizeScript, resetScript, SCRIPT_LIMITS } from '../js/play-script.js';
import { applyPlayerAction, applySoloAction } from '../js/player-actions.js';
import { resetBoardState } from '../js/board-actions.js';
import { spacingDistance } from '../js/geometry.js';
import { stepSimulation } from '../js/simulation.js';
import { createInitialState, normalizeState } from '../js/state.js';

const player = (state, id) => state.players.find((p) => p.id === id);
function play(state, seconds, until = () => false) {
  state.simulation.running = true;
  for (let i = 0; i < Math.round(seconds * 60); i += 1) {
    stepSimulation(state, 1 / 60);
    if (until(state)) return i / 60;
  }
  return seconds;
}
const place = (state, id, x, y) => Object.assign(player(state, id), { x, y, anchorX: x, anchorY: y });

test('a pass action is queued and the simulation makes that exact pass', () => {
  const state = createInitialState();
  place(state, 'home-6', 0.3, 0.4);
  place(state, 'home-7', 0.5, 0.45);
  assert.ok(applyPlayerAction(state, 'pass', 'home-6', 'home-7') > 0);
  assert.equal(state.script.length, 1);
  assert.deepEqual(state.script[0].tasks.map((t) => [t.type, t.player, t.to]), [['pass', 'home-6', 'home-7']]);
  let passed = false;
  play(state, 8, (s) => { passed ||= s.simulation.receiverId === 'home-7'; return !activeStage(s.script); });
  assert.ok(passed, 'the ball was sent to the named receiver');
  assert.equal(activeStage(state.script), null, 'the stage finished');
});

test('a run action moves that player to the point while the CPU leaves them alone', () => {
  const state = createInitialState();
  place(state, 'home-3', 0.3, 0.3);
  assert.equal(applySoloAction(state, 'run-forward', 'home-3'), 1);
  const goal = state.script[0].tasks[0].point;
  play(state, 8, (s) => !activeStage(s.script));
  assert.ok(spacingDistance(player(state, 'home-3'), goal) < 0.05, 'arrived near the end of the arrow');
  assert.equal(activeStage(state.script), null);
});

test('stages run in the order they were added, and pass-and-follow passes then runs on', () => {
  const state = createInitialState();
  place(state, 'home-6', 0.3, 0.4);
  place(state, 'home-7', 0.5, 0.45);
  assert.ok(applyPlayerAction(state, 'pass-and-follow', 'home-6', 'home-7') > 0);
  assert.deepEqual(state.script.map((s) => s.tasks[0].type), ['pass', 'run']);
  const order = [];
  play(state, 14, (s) => { const type = activeStage(s.script)?.tasks[0].type; if (type && order.at(-1) !== type) order.push(type); return !activeStage(s.script); });
  assert.deepEqual(order, ['pass', 'run']);
  assert.equal(activeStage(state.script), null);
});

test('a shoot action takes a shot at the goal that player attacks', () => {
  const state = createInitialState();
  place(state, 'home-7', 0.75, 0.5);
  assert.equal(applySoloAction(state, 'shoot', 'home-7'), 1);
  const shots = state.simulation.shotCount;
  play(state, 6, (s) => s.simulation.shotCount > shots);
  assert.equal(state.simulation.shotCount, shots + 1);
});

test('the CPU does not pass or shoot for the player the script is waiting on', () => {
  const state = createInitialState();
  place(state, 'home-7', 0.9, 0.5);
  state.simulation.carrierId = 'home-7';
  state.script = normalizeScript([{ id: 's', tasks: [{ type: 'run', player: 'home-3', point: { x: 0.5, y: 0.2 } }, { type: 'pass', player: 'home-7', to: 'home-6' }] }]);
  state.script[0].started = true; // the ball stays with home-7 until the script says so
  const shots = state.simulation.shotCount;
  play(state, 0.3);
  assert.equal(state.simulation.shotCount, shots);
});

test('a stage that cannot finish times out and the next stage still runs', () => {
  const state = createInitialState();
  place(state, 'home-3', 0.3, 0.3);
  state.script = normalizeScript([
    { id: 'a', tasks: [{ type: 'pass', player: 'home-3', to: 'missing' }] },
    { id: 'b', tasks: [{ type: 'run', player: 'home-4', point: { x: 0.4, y: 0.7 } }] },
  ]);
  play(state, SCRIPT_LIMITS.timeoutSeconds + 8, (s) => !activeStage(s.script));
  assert.equal(activeStage(state.script), null);
});

test('benched players drop out of the script instead of blocking it', () => {
  const state = createInitialState();
  applySoloAction(state, 'run-forward', 'home-3');
  player(state, 'home-3').benched = true;
  play(state, 1, (s) => !activeStage(s.script));
  assert.equal(activeStage(state.script), null);
});

test('scripts survive normalization and drop malformed stages; reset keeps the play with progress cleared', () => {
  const state = createInitialState();
  place(state, 'home-6', 0.3, 0.4);
  place(state, 'home-7', 0.5, 0.45);
  applyPlayerAction(state, 'pass', 'home-6', 'home-7');
  const round = normalizeState(JSON.parse(JSON.stringify(state)));
  assert.equal(round.script.length, 1);
  assert.equal(round.drawings.at(-1).source, 'action');
  const messy = normalizeScript([null, { tasks: 'x' }, { tasks: [{ type: 'fly', player: 'a' }] }, { id: 'ok', tasks: [{ type: 'run', player: 'a', point: { x: 5, y: -2 } }] }]);
  assert.equal(messy.length, 1);
  assert.deepEqual(messy[0].tasks[0].point, { x: 1, y: 0 });

  play(state, 8, (s) => !activeStage(s.script));
  assert.equal(activeStage(state.script), null);
  const fresh = resetBoardState(createInitialState(), state);
  assert.equal(fresh.script.length, 1);
  assert.ok(activeStage(fresh.script), 'the play can run again after Reset');
  assert.ok(fresh.drawings.some((d) => d.source === 'action'), 'its arrow comes back too');
  assert.deepEqual(resetScript(state.script)[0].tasks[0].done, false);
});

test('the script is capped so a stored play cannot grow without limit', () => {
  const stages = Array.from({ length: 100 }, (_, i) => ({ id: `s${i}`, tasks: [{ type: 'run', player: 'home-3', point: { x: 0.5, y: 0.5 } }] }));
  assert.equal(normalizeScript(stages).length, SCRIPT_LIMITS.stages);
  const state = createInitialState();
  state.script = normalizeScript(stages);
  assert.equal(applySoloAction(state, 'run-forward', 'home-3'), 0, 'a full script refuses more actions');
});
