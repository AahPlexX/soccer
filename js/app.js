import { setupCoaching } from './coaching-ui.js';
import { captureBoard, eraseDrawingNear, retainRoster } from './coaching.js';
import {
  addProp, applyTeamFormation, findObject, isPlayerId, keyboardNudge, loadPresetState, moveObjectBy, nudgePlayer,
  removeSelectedProp, resetBoardState, settlePlayers, toggleZone, updatePlayerDetails, updateTeamColors,
} from './board-actions.js';
import { BUILT_IN_PRESETS } from './builtins.js';
import { PALETTE, ZONES } from './constants.js';
import { createHistory } from './history.js';
import { IDENTITY_VIEW, ZOOM_RANGE, clampView, panBy, viewBoxSize, viewTransform, zoomAt } from './view-zoom.js';
import { CAMERA_PRESETS, DEFAULT_PRESET } from './camera-orbit.js';
import { recordPlayerPosition } from './formations.js';
import { pitchPointFromClient } from './geometry.js';
import { filterPresetsByCategory } from './library.js';
import { initializeScene, rebuildObjects, renderScene, setSceneOrientation } from './render.js';
import { releaseManuallyMovedObject, stepSimulation } from './simulation.js';
import { createInitialState, normalizeState, snapshotState } from './state.js';
import { deletePreset, exportBackup, importBackup, listPresets, loadAutosave, saveAutosave, savePreset } from './storage.js';
import { setupUpdates } from './update.js';

// app.js owns the DOM: element lookup, event wiring, rendering, autosave, dialogs and toasts.
// Board mutations live in board-actions.js so they stay testable without a browser.

const svg = document.querySelector('#pitch');
const homeFormation = document.querySelector('#home-formation');
const awayFormation = document.querySelector('#away-formation');
const awayVisible = document.querySelector('#away-visible');
const coneColorSelect = document.querySelector('#cone-color');
const undoButton = document.querySelector('#undo');
const redoButton = document.querySelector('#redo');
const zoomInButton = document.querySelector('#zoom-in');
const zoomOutButton = document.querySelector('#zoom-out');
const zoomFitButton = document.querySelector('#zoom-fit');
const view3dToggle = document.querySelector('#view-3d-toggle');
const view3dContainer = document.querySelector('#view3d');
const cameraPresetControl = document.querySelector('#camera-preset-control');
const cameraPresetSelect = document.querySelector('#camera-preset');
const zonesToggle = document.querySelector('#zones-toggle');
const zonePanel = document.querySelector('#zone-panel');
const zoneButtons = document.querySelector('#zone-buttons');
const zoneOpacity = document.querySelector('#zone-opacity');
const zoneRestrictionMode = document.querySelector('#zone-restriction-mode');
const zoneRestrictionScope = document.querySelector('#zone-restriction-scope');
const zonesClear = document.querySelector('#zones-clear');
const themeSelect = document.querySelector('#theme-select');
const playToggle = document.querySelector('#play-toggle');
const resetBoard = document.querySelector('#reset-board');
const speedSelect = document.querySelector('#speed-select');
const spacingSelect = document.querySelector('#spacing-select');
const drawingsClear = document.querySelector('#drawings-clear');
const removeSelected = document.querySelector('#remove-selected');
const saveAs = document.querySelector('#save-as');
const exportButton = document.querySelector('#export-backup');
const importButton = document.querySelector('#import-backup');
const importFile = document.querySelector('#import-file');
const playerDialog = document.querySelector('#player-dialog');
const playerForm = document.querySelector('#player-form');
const playerId = document.querySelector('#player-id');
const playerNumber = document.querySelector('#player-number');
const playerLabel = document.querySelector('#player-label');
const playerColor = document.querySelector('#player-color');
const playerBenched = document.querySelector('#player-benched');
const benchStrip = document.querySelector('#bench');
const saveDialog = document.querySelector('#save-dialog');
const saveForm = document.querySelector('#save-form');
const saveError = document.querySelector('#save-error');
const presetTitle = document.querySelector('#preset-title');
const presetCategory = document.querySelector('#preset-category');
const savedOpen = document.querySelector('#saved-open');
const colorsOpen = document.querySelector('#colors-open');
const colorsDialog = document.querySelector('#colors-dialog');
const colorsForm = document.querySelector('#colors-form');
const savedDialog = document.querySelector('#saved-dialog');
const savedClose = document.querySelector('#saved-close');
const savedList = document.querySelector('#saved-list');
const savedFilterSelect = document.querySelector('#saved-filter');
const toast = document.querySelector('#toast');
const dragStatus = document.querySelector('#drag-status');

const AUTOSAVE_DELAY_MS = 120;
const TOAST_DURATION_MS = 2600;
const DELETE_CONFIRM_MS = 4000;
const DRAG_THRESHOLD_PX = 5;
const PALETTE_LABELS = Object.freeze({
  blue: 'Blue', red: 'Red', yellow: 'Yellow', neonGreen: 'Neon green', orange: 'Orange', white: 'White', black: 'Black', purple: 'Purple',
});
const REMOVE_MESSAGES = Object.freeze({
  'none-selected': 'Select a cone, mini goal, or extra ball first',
  protected: 'Players and the main ball cannot be removed',
  removed: 'Prop removed',
});

let savedFilter = 'All'; // view-only library filter; not persisted
let state = loadAutosave() ?? createInitialState();
let world = initializeScene(svg, state);
let resetSnapshot = snapshotState(state);
let resetSnapshotVersion = 0;
const boardHistory = createHistory();
boardHistory.reset(state);
let view = IDENTITY_VIEW; // 2D zoom and pan; view-only, not persisted
const viewGroup = svg.querySelector('#pitch-view');
let resetBaselineReady;
let autosaveTimer = null;
let toastTimer = null;
let drag = null;
let drawSession = null;
// Drawing tools and the drawing type each creates. Arrow types are two-point lines; freehand collects points.
const DRAWING_TYPE_BY_TOOL = new Map([['draw', 'freehand'], ['arrow', 'arrow'], ['run', 'run'], ['curve', 'curve']]);
let lastFrame = performance.now();
let coachingUI;

// ---------------------------------------------------------------------------------------------------------------------
// Reset baseline, autosave, toast, rendering.
// ---------------------------------------------------------------------------------------------------------------------

// Restore the saved preset's original snapshot after a reload, while allowing a newer
// formation/load/save action to win over the asynchronous IndexedDB lookup.
function setResetSnapshot(snapshot) {
  resetSnapshot = snapshotState(snapshot);
  resetSnapshotVersion += 1;
}

async function restoreResetBaseline() {
  const presetId = state.currentPresetId;
  const version = resetSnapshotVersion;
  if (!presetId) return;
  const builtIn = BUILT_IN_PRESETS.find((preset) => preset.id === presetId);
  const snapshot = builtIn ? builtIn.createState() : (await listPresets()).find((preset) => preset.id === presetId)?.state;
  if (snapshot && state.currentPresetId === presetId && resetSnapshotVersion === version) setResetSnapshot(snapshot);
}

resetBaselineReady = restoreResetBaseline();

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => saveAutosave(state), AUTOSAVE_DELAY_MS);
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, TOAST_DURATION_MS);
}

function syncControls() {
  homeFormation.value = state.homeFormation;
  awayFormation.value = state.awayFormation;
  awayVisible.setAttribute('aria-pressed', String(state.awayVisible));
  awayVisible.textContent = state.awayVisible ? 'Hide opponents' : 'Show opponents';
  themeSelect.value = state.theme;
  coneColorSelect.value = state.coneColor;
  undoButton.disabled = !boardHistory.canUndo;
  redoButton.disabled = !boardHistory.canRedo;
  zoneOpacity.value = String(state.zoneOpacity);
  zoneRestrictionMode.value = state.zoneRestrictionMode;
  zoneRestrictionScope.value = state.zoneRestrictionScope;
  speedSelect.value = String(state.speed);
  spacingSelect.value = state.spacingMode;
  playToggle.textContent = state.simulation.running ? 'Pause simulation' : 'Play simulation';
  document.querySelectorAll('.tool-button[data-tool]').forEach((button) => {
    const active = button.dataset.tool === state.tool;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  coachingUI?.sync();
  zoneButtons.querySelectorAll('button').forEach((button) => {
    button.setAttribute('aria-pressed', String(state.selectedZones.includes(button.dataset.zone)));
  });
}

function render({ rebuild = false } = {}) {
  if (rebuild) {
    rebuildObjects(svg, state);
    world = svg.querySelector('#pitch-world');
  }
  renderScene(svg, state);
  renderBench();
  syncControls();
}

// Benched players are invisible on the pitch, so each gets a chip over the pitch that returns them.
function renderBench() {
  const benched = state.players.filter((player) => player.benched);
  benchStrip.hidden = benched.length === 0;
  benchStrip.replaceChildren(...benched.map((player) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.textContent = `Return ${player.team === 'home' ? '' : 'opp. '}#${player.number} ${player.label}`;
    chip.addEventListener('click', () => {
      updatePlayerDetails(state, player.id, { number: player.number, label: player.label, colorOverride: player.colorOverride, benched: false });
      state.selectedObjectId = player.id;
      commitChange();
    });
    return chip;
  }));
}

function commitChange(options) {
  settlePlayers(state);
  // While the simulation runs it moves players on its own; that is not an edit, so the baseline follows silently.
  if (state.simulation.running) boardHistory.rebase(state); else boardHistory.record(state);
  render(options);
  scheduleAutosave();
}

/** Replaces the whole board (load, reset, import) and makes it the new reset baseline. */
function replaceBoard(next, { baseline = true } = {}) {
  state = next;
  if (baseline) setResetSnapshot(state);
  commitChange({ rebuild: true });
}

// ---------------------------------------------------------------------------------------------------------------------
// Undo / redo.
// ---------------------------------------------------------------------------------------------------------------------

function stepHistory(direction) {
  if (!boardHistory[direction](state)) { showToast(direction === 'undo' ? 'Nothing to undo' : 'Nothing to redo'); return; }
  // The restored board has its own ball and players, so any pass, restart, or run in progress no longer applies.
  state.selectedObjectId = null;
  Object.assign(state.simulation, {
    running: false, carrierId: null, receiverId: null, ballTarget: null, restart: null, actionClock: 0, tackleCooldown: 0,
  });
  render({ rebuild: true });
  scheduleAutosave();
  showToast(direction === 'undo' ? 'Undid the last change' : 'Redid the change');
}

undoButton.addEventListener('click', () => stepHistory('undo'));
redoButton.addEventListener('click', () => stepHistory('redo'));
// Ctrl/Cmd+Z undoes, Shift+Ctrl/Cmd+Z or Ctrl+Y redoes; text fields and open dialogs keep their own behavior.
document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.target.closest?.('input, textarea, select, dialog[open]')) return;
  const key = event.key.toLowerCase();
  if (key !== 'z' && key !== 'y') return;
  event.preventDefault();
  stepHistory(key === 'y' || event.shiftKey ? 'redo' : 'undo');
});

// ---------------------------------------------------------------------------------------------------------------------
// Zoom and pan (CAM-001). The view is a transform on #pitch-view, so pitchPointFromClient (which inverts the world's
// screen matrix) stays correct at any zoom.
// ---------------------------------------------------------------------------------------------------------------------

const ZOOM_STEP = 1.4;
const gesturePointers = new Map(); // active touch pointers: id -> { x, y }
let gesture = null; // two-finger pinch: last finger distance and midpoint
let panSession = null; // one-pointer pan of the zoomed board
let view3d = null; // the 3D camera view, created on first use (js/view3d.js)
let mode3d = false; // true while the 3D view is showing instead of the 2D board

function applyView(next) {
  const { width, height } = viewBoxSize(svg.getAttribute('viewBox'));
  view = clampView(next, width, height);
  viewGroup.setAttribute('transform', viewTransform(view));
  if (mode3d) return; // the 3D camera owns the zoom buttons while it is showing
  zoomInButton.disabled = view.scale >= ZOOM_RANGE.max;
  zoomOutButton.disabled = view.scale <= ZOOM_RANGE.min;
  zoomFitButton.disabled = view === IDENTITY_VIEW || (view.scale === 1 && view.x === 0 && view.y === 0);
}

function clientToViewBox(clientX, clientY) {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

// Zooms by `factor` around a screen point, or around the middle of the board when none is given.
function zoomBy(factor, clientX, clientY) {
  const { width, height } = viewBoxSize(svg.getAttribute('viewBox'));
  const focus = clientX === undefined ? { x: width / 2, y: height / 2 } : clientToViewBox(clientX, clientY);
  applyView(zoomAt(view, factor, focus.x, focus.y, width, height));
}

function panByClient(dx, dy) {
  const { width, height } = viewBoxSize(svg.getAttribute('viewBox'));
  const unitsPerPixel = 1 / svg.getScreenCTM().a;
  applyView(panBy(view, dx * unitsPerPixel, dy * unitsPerPixel, width, height));
}

// A second finger turns an edit that the first finger just started into a zoom gesture, so drop that edit.
function cancelEditSessions() {
  if (drag) {
    svg.querySelector(`#object-${drag.id}`)?.classList.remove('is-dragging');
    drag = null;
  }
  if (drawSession) {
    state.drawings = state.drawings.filter((drawing) => drawing !== drawSession.drawing);
    drawSession = null;
    render({ rebuild: true });
  }
}

function pinchState() {
  const [a, b] = [...gesturePointers.values()];
  return { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

zoomInButton.addEventListener('click', () => (mode3d ? view3d.zoom(ZOOM_STEP) : zoomBy(ZOOM_STEP)));
zoomOutButton.addEventListener('click', () => (mode3d ? view3d.zoom(1 / ZOOM_STEP) : zoomBy(1 / ZOOM_STEP)));
zoomFitButton.addEventListener('click', () => (mode3d ? view3d.reset() : applyView(IDENTITY_VIEW)));
svg.addEventListener('wheel', (event) => {
  event.preventDefault();
  zoomBy(Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)), event.clientX, event.clientY);
}, { passive: false });

// Capture phase, so the gesture layer sees pointers before the move/draw handlers and can cancel their sessions.
svg.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch') {
    gesturePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesturePointers.size === 2) {
      cancelEditSessions();
      panSession = null;
      gesture = pinchState();
      return;
    }
  }
  if (state.tool === 'move' && view.scale > 1 && !gesture && !event.target.closest('[data-object-id]')) {
    panSession = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    svg.setPointerCapture(event.pointerId);
  }
}, true);
svg.addEventListener('pointermove', (event) => {
  if (gesturePointers.has(event.pointerId)) gesturePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (gesture && gesturePointers.size === 2) {
    const next = pinchState();
    zoomBy(next.distance / gesture.distance, next.x, next.y);
    panByClient(next.x - gesture.x, next.y - gesture.y);
    gesture = next;
  } else if (panSession?.pointerId === event.pointerId) {
    panByClient(event.clientX - panSession.x, event.clientY - panSession.y);
    panSession.x = event.clientX;
    panSession.y = event.clientY;
  }
}, true);
const endGesturePointer = (event) => {
  gesturePointers.delete(event.pointerId);
  if (gesturePointers.size < 2) gesture = null;
  if (panSession?.pointerId === event.pointerId) panSession = null;
};
svg.addEventListener('pointerup', endGesturePointer, true);
svg.addEventListener('pointercancel', endGesturePointer, true);

// ---------------------------------------------------------------------------------------------------------------------
// 3D camera view (CAM-002, CAM-003, CAM-007). js/view3d.js and Three.js load on first use; the 2D board stays the
// editing view, and any failure to start 3D leaves the app in 2D.
// ---------------------------------------------------------------------------------------------------------------------

Object.entries(CAMERA_PRESETS).forEach(([id, preset]) => {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = preset.label;
  cameraPresetSelect.append(option);
});
cameraPresetSelect.value = DEFAULT_PRESET;

async function setView3D(on) {
  if (on && !view3d) {
    view3dToggle.disabled = true;
    showToast('Loading the 3D view…');
    try {
      const { createView3D } = await import('./view3d.js');
      view3d = await createView3D({
        container: view3dContainer,
        getState: () => state,
        onContextLost: () => {
          view3d?.dispose();
          view3d = null;
          setView3D(false);
          showToast('The 3D view stopped. Back to the 2D board.');
        },
      });
      view3d.setPreset(cameraPresetSelect.value);
    } catch (error) {
      view3d = null;
      showToast('The 3D view is not available on this device. Staying in 2D.');
      return;
    } finally {
      view3dToggle.disabled = false;
    }
  }
  mode3d = on;
  view3dToggle.setAttribute('aria-pressed', String(on));
  svg.style.display = on ? 'none' : '';
  view3dContainer.hidden = !on;
  cameraPresetControl.hidden = !on;
  if (on) {
    [zoomInButton, zoomOutButton, zoomFitButton].forEach((button) => { button.disabled = false; });
    view3d.start();
    showToast('3D view: drag to rotate, scroll or pinch to zoom, two fingers to pan. Switch back to 2D to edit.');
  } else {
    view3d?.stop();
    applyView(view);
  }
}

view3dToggle.addEventListener('click', () => setView3D(!mode3d));
cameraPresetSelect.addEventListener('change', () => view3d?.setPreset(cameraPresetSelect.value));

// ---------------------------------------------------------------------------------------------------------------------
// Zones.
// ---------------------------------------------------------------------------------------------------------------------

function buildZoneButtons() {
  const fragment = document.createDocumentFragment();
  Object.entries(ZONES).forEach(([id, zone]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.zone = id;
    button.textContent = zone.label;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => { if (toggleZone(state, id)) commitChange(); });
    fragment.append(button);
  });
  zoneButtons.append(fragment);
}

zonesToggle.addEventListener('click', () => {
  const expanded = zonesToggle.getAttribute('aria-expanded') === 'true';
  zonesToggle.setAttribute('aria-expanded', String(!expanded));
  zonePanel.hidden = expanded;
});
zonesClear.addEventListener('click', () => { state.selectedZones = []; commitChange(); });
zoneOpacity.addEventListener('input', () => { state.zoneOpacity = Number(zoneOpacity.value); commitChange(); });
zoneRestrictionMode.addEventListener('change', () => { state.zoneRestrictionMode = zoneRestrictionMode.value; commitChange(); });
zoneRestrictionScope.addEventListener('change', () => { state.zoneRestrictionScope = zoneRestrictionScope.value; commitChange(); });

// ---------------------------------------------------------------------------------------------------------------------
// Pitch pointer and keyboard input.
// ---------------------------------------------------------------------------------------------------------------------

function openPlayerEditor(id) {
  const player = state.players.find((item) => item.id === id);
  if (!player) return;
  playerId.value = player.id;
  playerNumber.value = String(player.number);
  playerNumber.setCustomValidity('');
  playerLabel.value = player.label ?? player.role;
  playerColor.value = player.colorOverride ?? '';
  playerBenched.checked = player.benched === true;
  if (!playerDialog.open) playerDialog.showModal();
  playerNumber.focus();
}

function handleObjectPointerDown(event, target) {
  const id = target.dataset.objectId;
  if (!findObject(state, id)) return;
  state.selectedObjectId = id;
  drag = { id, pointerId: event.pointerId, moved: false, startX: event.clientX, startY: event.clientY };
  target.setPointerCapture(event.pointerId);
  target.classList.add('is-dragging');
  render();
}

function handleToolPointerDown(event) {
  const point = pitchPointFromClient(svg, world, event.clientX, event.clientY);
  if (state.tool === 'erase') {
    if (eraseDrawingNear(state, point)) commitChange({ rebuild: true }); else showToast('Tap near a drawing to erase it. Players and props are protected.');
    return;
  }
  const added = addProp(state, state.tool, point);
  if (added) {
    commitChange({ rebuild: true });
    showToast(added.message);
    return;
  }
  const drawingType = DRAWING_TYPE_BY_TOOL.get(state.tool);
  if (!drawingType) return;
  svg.setPointerCapture(event.pointerId);
  drawSession = {
    pointerId: event.pointerId,
    drawing: { id: `drawing-${Date.now().toString(36)}-${state.drawings.length}`, type: drawingType, points: [point] },
  };
  state.drawings.push(drawSession.drawing);
  render({ rebuild: true });
}

svg.addEventListener('pointerdown', (event) => {
  const target = event.target.closest('[data-object-id]');
  if (state.tool === 'move') {
    if (target) handleObjectPointerDown(event, target);
    return;
  }
  handleToolPointerDown(event);
});

svg.addEventListener('pointermove', (event) => {
  if (drag?.pointerId === event.pointerId) {
    const object = findObject(state, drag.id);
    if (!object) return;
    const point = pitchPointFromClient(svg, world, event.clientX, event.clientY);
    if (point.x !== object.x || point.y !== object.y) releaseManuallyMovedObject(state, drag.id);
    object.x = point.x;
    object.y = point.y;
    drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > DRAG_THRESHOLD_PX;
    renderScene(svg, state);
    return;
  }
  if (drawSession?.pointerId === event.pointerId) {
    const point = pitchPointFromClient(svg, world, event.clientX, event.clientY);
    if (!['freehand', 'curve'].includes(drawSession.drawing.type)) drawSession.drawing.points[1] = point;
    else drawSession.drawing.points.push(point);
    rebuildObjects(svg, state);
    world = svg.querySelector('#pitch-world');
    renderScene(svg, state);
  }
});

function finishPointer(event) {
  if (drag?.pointerId === event.pointerId) {
    svg.querySelector(`#object-${drag.id}`)?.classList.remove('is-dragging');
    const finishedDrag = drag;
    drag = null;
    if (isPlayerId(state, finishedDrag.id)) {
      if (finishedDrag.moved) {
        const player = findObject(state, finishedDrag.id);
        if (player) recordPlayerPosition(player);
      } else {
        openPlayerEditor(finishedDrag.id);
      }
    }
    dragStatus.textContent = `${finishedDrag.id} ${finishedDrag.moved ? 'moved' : 'selected'}.`;
    commitChange();
  }
  if (drawSession?.pointerId === event.pointerId) {
    drawSession = null;
    commitChange({ rebuild: true });
  }
}
svg.addEventListener('pointerup', finishPointer);
svg.addEventListener('pointercancel', finishPointer);

svg.addEventListener('keydown', (event) => {
  const target = event.target.closest('[data-object-id]');
  if (!target) return;
  const id = target.dataset.objectId;
  const delta = keyboardNudge(event.key, event.shiftKey);
  if (delta) {
    event.preventDefault();
    if (moveObjectBy(state, id, ...delta)) {
      commitChange();
      dragStatus.textContent = `${id} moved with keyboard.`;
    }
  } else if (event.key === 'Enter' && target.dataset.objectType === 'player') {
    event.preventDefault();
    openPlayerEditor(id);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Top rail and toolbar.
// ---------------------------------------------------------------------------------------------------------------------

function applySelectedFormation(team) {
  const select = team === 'home' ? homeFormation : awayFormation;
  if (!applyTeamFormation(state, team, select.value)) {
    syncControls();
    return false;
  }
  setResetSnapshot(state);
  commitChange({ rebuild: true });
  return true;
}
homeFormation.addEventListener('change', () => applySelectedFormation('home'));
awayFormation.addEventListener('change', () => applySelectedFormation('away'));
document.querySelector('#home-formation-apply').addEventListener('click', () => {
  if (applySelectedFormation('home')) showToast('Our shape reapplied');
});
document.querySelector('#away-formation-apply').addEventListener('click', () => {
  if (applySelectedFormation('away')) showToast('Their shape reapplied');
});

awayVisible.addEventListener('click', () => { state.awayVisible = !state.awayVisible; commitChange(); });
themeSelect.addEventListener('change', () => { state.theme = themeSelect.value; commitChange(); });
speedSelect.addEventListener('change', () => { state.speed = Number(speedSelect.value); commitChange(); });
spacingSelect.addEventListener('change', () => { state.spacingMode = spacingSelect.value; commitChange(); });

document.querySelectorAll('.tool-button[data-tool]').forEach((button) => {
  button.addEventListener('click', () => { state.tool = button.dataset.tool; commitChange(); });
});

drawingsClear.addEventListener('click', () => {
  state.drawings = [];
  commitChange({ rebuild: true });
  showToast('Drawings cleared');
});

removeSelected.addEventListener('click', () => {
  const result = removeSelectedProp(state);
  if (result === 'removed') commitChange({ rebuild: true });
  showToast(REMOVE_MESSAGES[result]);
});

playToggle.addEventListener('click', () => {
  if (!state.players.some((player) => !player.benched)) { showToast('Put at least one player on the pitch in Coach workspace.'); return; }
  state.simulation.running = !state.simulation.running;
  state.tool = 'move';
  commitChange();
});

resetBoard.addEventListener('click', async () => {
  await resetBaselineReady;
  const baseline = { ...(state.coaching.startBoard ?? resetSnapshot), coaching: state.coaching };
  replaceBoard(resetBoardState(baseline, state), { baseline: false });
  showToast('Board reset to starting position');
});

// ---------------------------------------------------------------------------------------------------------------------
// Player editor.
// ---------------------------------------------------------------------------------------------------------------------

// A custom validity message blocks every later submit until cleared, so clear it as soon as the coach edits the number.
playerNumber.addEventListener('input', () => playerNumber.setCustomValidity(''));

playerForm.addEventListener('submit', (event) => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault();
  const result = updatePlayerDetails(state, playerId.value, {
    number: Number(playerNumber.value),
    label: playerLabel.value,
    colorOverride: playerColor.value,
    benched: playerBenched.checked,
  });
  if (result === 'missing') return;
  if (result === 'invalid-number') {
    playerNumber.setCustomValidity('Use a jersey number from 1 to 99.');
    playerNumber.reportValidity();
    return;
  }
  playerNumber.setCustomValidity('');
  playerDialog.close();
  commitChange({ rebuild: true });
  showToast('Player updated');
});

playerDialog.querySelectorAll('[data-nudge]').forEach((button) => {
  button.addEventListener('click', () => {
    if (nudgePlayer(state, playerId.value, button.dataset.nudge)) commitChange();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Team colors.
// ---------------------------------------------------------------------------------------------------------------------

[...colorsForm.querySelectorAll('select'), coneColorSelect].forEach((select) => {
  Object.entries(PALETTE).forEach(([name, value]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = PALETTE_LABELS[name];
    select.append(option);
  });
});
// The cone color applies to new cones and recolors the selected cone.
coneColorSelect.addEventListener('change', () => {
  state.coneColor = coneColorSelect.value;
  const selectedCone = state.cones.find((cone) => cone.id === state.selectedObjectId);
  if (selectedCone) selectedCone.color = state.coneColor;
  commitChange({ rebuild: true });
});
colorsOpen.addEventListener('click', () => {
  colorsForm.elements.home.value = state.colors.home;
  colorsForm.elements.homeGoalkeeper.value = state.colors.homeGoalkeeper;
  colorsForm.elements.away.value = state.colors.away;
  colorsForm.elements.awayGoalkeeper.value = state.colors.awayGoalkeeper;
  colorsDialog.showModal();
});
colorsForm.addEventListener('submit', (event) => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault();
  updateTeamColors(state, {
    home: colorsForm.elements.home.value,
    homeGoalkeeper: colorsForm.elements.homeGoalkeeper.value,
    away: colorsForm.elements.away.value,
    awayGoalkeeper: colorsForm.elements.awayGoalkeeper.value,
  });
  colorsDialog.close();
  commitChange();
  showToast('Team colors updated');
});

// ---------------------------------------------------------------------------------------------------------------------
// Save and saved-positions library. library-ui.js augments user rows: it relies on data-preset-id on each saved row
// and inserts its Edit button before the row's last child, which must remain the Delete button.
// ---------------------------------------------------------------------------------------------------------------------

saveAs.addEventListener('click', () => {
  presetTitle.value = '';
  presetCategory.value = 'Positions';
  saveError.hidden = true;
  saveDialog.showModal();
  presetTitle.focus();
});
saveForm.addEventListener('submit', async (event) => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault();
  try {
    const preset = await savePreset({ title: presetTitle.value, category: presetCategory.value, state });
    state.currentPresetId = preset.id;
    setResetSnapshot(preset.state);
    saveDialog.close();
    scheduleAutosave();
    showToast('Position saved');
  } catch (error) {
    saveError.textContent = error instanceof Error ? error.message : 'Unable to save position.';
    saveError.hidden = false;
  }
});

const savedDateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function savedRow(titleText, metaText, ...buttons) {
  const item = document.createElement('div');
  item.className = 'saved-item';
  const text = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = titleText;
  const meta = document.createElement('span');
  meta.textContent = metaText;
  text.append(title, meta);
  item.append(text, ...buttons);
  return item;
}

function rowButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function loadIntoBoard(next, title) {
  savedDialog.close();
  replaceBoard(retainRoster(state, next));
  coachingUI?.onLoad();
  showToast(`Loaded ${title}`);
}

function deleteButton(preset) {
  const remove = rowButton('Delete', async () => {
    // Two-step in-app confirmation (confirm() is unreliable in standalone Home Screen apps).
    if (remove.dataset.armed !== 'true') {
      remove.dataset.armed = 'true';
      remove.textContent = 'Tap again to delete';
      showToast(`Tap Delete again to remove ${preset.title}`);
      setTimeout(() => { remove.dataset.armed = ''; remove.textContent = 'Delete'; }, DELETE_CONFIRM_MS);
      return;
    }
    try {
      await deletePreset(preset.id);
      await refreshSavedList();
      showToast('Saved position deleted');
    } catch (error) {
      remove.dataset.armed = '';
      remove.textContent = 'Delete';
      showToast(error instanceof Error ? error.message : 'Unable to delete saved position');
    }
  });
  return remove;
}

async function refreshSavedList() {
  const presets = filterPresetsByCategory(await listPresets(), savedFilter);
  savedList.replaceChildren();

  filterPresetsByCategory(BUILT_IN_PRESETS, savedFilter).forEach((preset) => {
    const load = rowButton('Load', () => loadIntoBoard(loadPresetState(preset.createState(), preset.id), preset.title));
    savedList.append(savedRow(preset.title, `Built in · ${preset.category} · ${preset.description}`, load));
  });

  if (!presets.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = savedFilter === 'All'
      ? 'Your saved positions will appear below the built-in teaching scenarios.'
      : `No saved ${savedFilter.toLowerCase()} yet. Use Save as to add one.`;
    savedList.append(empty);
    return;
  }

  presets.forEach((preset) => {
    const load = rowButton('Load', () => loadIntoBoard(loadPresetState(preset.state, preset.id), preset.title));
    const item = savedRow(preset.title, `${preset.category} · ${savedDateFormat.format(new Date(preset.updatedAt))}`, load, deleteButton(preset));
    item.dataset.presetId = preset.id;
    savedList.append(item);
  });
}
savedFilterSelect.addEventListener('change', () => { savedFilter = savedFilterSelect.value; refreshSavedList(); });
savedOpen.addEventListener('click', async () => { await refreshSavedList(); savedDialog.showModal(); });
savedClose.addEventListener('click', () => savedDialog.close());

// ---------------------------------------------------------------------------------------------------------------------
// Backup export/import.
// ---------------------------------------------------------------------------------------------------------------------

exportButton.addEventListener('click', async () => {
  try {
    const text = await exportBackup(state);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `u9-tactical-board-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    showToast('Backup exported');
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Backup export failed');
  }
});
importButton.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  try {
    replaceBoard(await importBackup(await file.text()));
    coachingUI?.onLoad();
    resetBaselineReady = restoreResetBaseline();
    showToast('Backup imported');
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Backup import failed');
  } finally {
    importFile.value = '';
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Orientation, animation loop, startup.
// ---------------------------------------------------------------------------------------------------------------------

const portraitQuery = matchMedia('(orientation: portrait)');
function updateOrientation() {
  setSceneOrientation(svg, portraitQuery.matches);
  applyView(view); // the viewport shape changed, so re-fit the pan limits
}
portraitQuery.addEventListener?.('change', updateOrientation);
window.addEventListener('resize', updateOrientation, { passive: true });

function animationLoop(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  if (state.simulation.running && !drag && !drawSession) {
    stepSimulation(state, dt);
    renderScene(svg, state);
    if (!state.simulation.running) syncControls();
  }
  requestAnimationFrame(animationLoop);
}

coachingUI = setupCoaching({
  getState: () => state, commit: commitChange, replace: replaceBoard, toast: showToast,
  newSetup: () => replaceBoard(retainRoster({ ...state, coaching: { ...state.coaching, keepRoster: true } }, createInitialState())),
  saveExisting: async () => {
    const current = (await listPresets()).find((preset) => preset.id === state.currentPresetId);
    if (!current) throw new Error('Save a new position first; built-in setups stay unchanged.');
    const saved = await savePreset({ id: current.id, title: current.title, category: current.category, state });
    setResetSnapshot(saved.state); scheduleAutosave();
  },
  setStart: () => { state.simulation.running = false; state.coaching.startBoard = captureBoard(state); setResetSnapshot(state); commitChange(); },
  returnStart: () => resetBoard.click(),
  step: () => {
    if (!state.players.some((p) => !p.benched)) { showToast('Put a player on the pitch first.'); return; }
    const speed = state.speed; state.speed = 1; state.simulation.running = true;
    try { for (let i = 0; i < 60; i++) stepSimulation(state, 1 / 60); }
    finally { state.simulation.running = false; state.speed = speed; }
    commitChange(); showToast('Advanced one simulated second; paused for discussion.');
  },
});
buildZoneButtons();
renderBench();
updateOrientation();
syncControls();
saveAutosave(state);
requestAnimationFrame(animationLoop);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => setupUpdates(() => {
    clearTimeout(autosaveTimer);
    return saveAutosave(state);
  }, () => showToast('Offline mode could not be enabled in this browser.')));
}
