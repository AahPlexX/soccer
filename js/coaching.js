import { createLocalId } from './constants.js';
import { distanceToSegment } from './geometry.js';

export const BRIEF_FIELDS = Object.freeze(['title', 'objective', 'setup', 'instructions', 'cues', 'progression']);
export const MAX_TEACHING_STEPS = 12;
const BOARD_KEYS = ['schemaVersion', 'homeFormation', 'awayFormation', 'awayVisible', 'theme', 'tool', 'speed', 'spacingMode', 'selectedZones', 'zoneRestrictionMode', 'zoneRestrictionScope', 'zoneOpacity', 'zoneColor', 'drawColor', 'drawWidth','colors', 'coneColor', 'players', 'balls', 'cones', 'miniGoals', 'drawings', 'script', 'flipped', 'simulation'];
const clone = (value) => JSON.parse(JSON.stringify(value));
export const emptyCoaching = () => ({ title: '', objective: '', setup: '', instructions: '', cues: '', progression: '', minutes: 5, keepRoster: false, startBoard: null, steps: [] });

// Steps contain only board content, never the sequence itself. Keep files bounded and free of recursive snapshots.
export function captureBoard(state) {
  const board = Object.fromEntries(BOARD_KEYS.filter((key) => state[key] !== undefined).map((key) => [key, clone(state[key])]));
  board.simulation = { ...board.simulation, running: false };
  return board;
}
export function normalizeCoaching(value) {
  const result = emptyCoaching();
  if (!value || typeof value !== 'object') return result;
  for (const key of BRIEF_FIELDS) result[key] = typeof value[key] === 'string' ? value[key].slice(0, key === 'title' ? 80 : 2000) : '';
  result.startBoard = value.startBoard && Array.isArray(value.startBoard.players) ? captureBoard(value.startBoard) : null;
  result.keepRoster = value.keepRoster === true;
  result.minutes = Number.isFinite(Number(value.minutes)) ? Math.min(120, Math.max(1, Math.round(Number(value.minutes)))) : 5;
  result.steps = Array.isArray(value.steps) ? value.steps.slice(0, MAX_TEACHING_STEPS)
    .filter((step) => step && typeof step.title === 'string' && step.board && Array.isArray(step.board.players))
    .map((step, i) => ({ id: typeof step.id === 'string' ? step.id : `step-${i}`, title: step.title.slice(0, 80), board: captureBoard(step.board), brief: Object.fromEntries([...BRIEF_FIELDS, 'minutes'].map((key) => [key, key === 'minutes' ? Math.min(120, Math.max(1, Number(step.brief?.minutes) || 5)) : String(step.brief?.[key] ?? '').slice(0, 2000)])) })) : [];
  return result;
}
export function addTeachingStep(state, title) {
  if (state.coaching.steps.length >= MAX_TEACHING_STEPS) return false;
  state.coaching.steps.push({ id: createLocalId('step'), title: title.trim().slice(0, 80) || `Step ${state.coaching.steps.length + 1}`, board: captureBoard(state), brief: Object.fromEntries([...BRIEF_FIELDS, 'minutes'].map((key) => [key, state.coaching[key]])) });
  return true;
}
export function moveTeachingStep(state, index, direction) {
  const target = index + direction;
  if (index < 0 || index >= state.coaching.steps.length || target < 0 || target >= state.coaching.steps.length) return false;
  const [step] = state.coaching.steps.splice(index, 1); state.coaching.steps.splice(target, 0, step); return true;
}
export function teachingStepState(state, index) {
  const step = state.coaching.steps[index];
  return step ? { ...clone(step.board), coaching: { ...clone(state.coaching), ...clone(step.brief ?? {}) }, currentPresetId: state.currentPresetId, selectedObjectId: null } : null;
}
export function duplicateProp(state) {
  const id = state.selectedObjectId;
  for (const list of ['cones', 'miniGoals', 'balls']) {
    const prop = state[list].find((p) => p.id === id && !p.primary);
    if (!prop) continue;
    const next = { ...prop, id: createLocalId(list === 'balls' ? 'ball' : 'prop'), x: prop.x > 0.94 ? prop.x - 0.05 : prop.x + 0.05 };
    state[list].push(next); state.selectedObjectId = next.id; return true;
  }
  return false;
}
export function clearProps(state) { state.cones = []; state.miniGoals = []; state.balls = state.balls.filter((b) => b.primary); state.selectedObjectId = null; }
export function setPlayerBenched(state, id, benched) {
  const player = state.players.find((p) => p.id === id);
  if (!player) return false;
  player.benched = Boolean(benched);
  if (state.simulation.carrierId === id || state.simulation.receiverId === id) Object.assign(state.simulation, { carrierId: null, receiverId: null, ballTarget: null, restart: null, actionClock: 0 });
  return true;
}
// Real time, independent of simulation speed. The caller supplies a clock, so background time is not lost.
export function createDrillClock(now = () => performance.now()) {
  let remaining = 300000; let started = null;
  const value = () => Math.max(0, remaining - (started === null ? 0 : now() - started));
  return {
    reset(minutes) { remaining = minutes * 60000; started = null; },
    start() { if (started === null && remaining > 0) started = now(); },
    pause() { remaining = value(); started = null; },
    get remaining() { return value(); },
    get running() { return started !== null && value() > 0; },
  };
}

export function retainRoster(current, next) {
  if (!current.coaching.keepRoster) return next;
  next.players.forEach((player) => {
    const previous = current.players.find((p) => p.id === player.id);
    if (previous) { player.number = previous.number; player.label = previous.label === previous.role ? player.role : previous.label; player.colorOverride = previous.colorOverride; }
  });
  next.colors = { ...current.colors };
  next.coaching.keepRoster = true;
  return next;
}

export function setSmallSided(state, count) {
  if (![3, 4].includes(count)) return false;
  for (const team of ['home', 'away']) {
    const field = state.players.filter((p) => p.team === team && p.role !== 'GK').slice(-count);
    state.players.filter((p) => p.team === team).forEach((p) => setPlayerBenched(state, p.id, !field.includes(p)));
  }
  return true;
}

export function eraseDrawingNear(state, point) {
  const scaled = (p) => ({ x: p.x, y: p.y * 0.68 });
  let nearest = -1; let gap = 0.03;
  state.drawings.forEach((drawing, index) => {
    const points = drawing.type === 'freehand' || drawing.type === 'curve' ? drawing.points : drawing.points.slice(0, 2);
    for (let i = 1; i < points.length; i++) {
      const distance = distanceToSegment(scaled(point), scaled(points[i - 1]), scaled(points[i]));
      if (distance < gap) { gap = distance; nearest = index; }
    }
  });
  if (nearest < 0) return false;
  state.drawings.splice(nearest, 1); return true;
}
