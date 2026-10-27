import { BUILT_IN_PRESETS } from './builtins.js';
import { createLocalId, PALETTE, ZONES } from './constants.js';
import { applyFormation } from './formations.js';
import { clamp, pitchPointFromClient } from './geometry.js';
import { initializeScene, rebuildObjects, renderScene, setSceneOrientation } from './render.js';
import { stepSimulation } from './simulation.js';
import { createInitialState, normalizeState } from './state.js';
import { deletePreset, exportBackup, importBackup, listPresets, loadAutosave, saveAutosave, savePreset } from './storage.js';

const svg = document.querySelector('#pitch');
const homeFormation = document.querySelector('#home-formation');
const awayFormation = document.querySelector('#away-formation');
const awayVisible = document.querySelector('#away-visible');
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
const saveDialog = document.querySelector('#save-dialog');
const saveForm = document.querySelector('#save-form');
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
let savedFilter = 'All'; // view-only library filter; not persisted
const toast = document.querySelector('#toast');
const dragStatus = document.querySelector('#drag-status');

let state = loadAutosave() ?? createInitialState();
let world = initializeScene(svg, state);
let resetSnapshot = structuredCloneSafe(state);
let autosaveTimer = null;
let toastTimer = null;
let drag = null;
let drawSession = null;
let lastFrame = performance.now();
let orientationPortrait = matchMedia('(orientation: portrait)').matches;

function structuredCloneSafe(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => saveAutosave(state), 120);
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
}

function syncControls() {
  homeFormation.value = state.homeFormation;
  awayFormation.value = state.awayFormation;
  awayVisible.setAttribute('aria-pressed', String(state.awayVisible));
  awayVisible.textContent = state.awayVisible ? 'Hide opponents' : 'Show opponents';
  themeSelect.value = state.theme;
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
  syncControls();
}

function commitChange(options) {
  render(options);
  scheduleAutosave();
}

function buildZoneButtons() {
  const fragment = document.createDocumentFragment();
  Object.entries(ZONES).forEach(([id, zone]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.zone = id;
    button.textContent = zone.label;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      state.selectedZones = state.selectedZones.includes(id)
        ? state.selectedZones.filter((zoneId) => zoneId !== id)
        : [...state.selectedZones, id];
      commitChange();
    });
    fragment.append(button);
  });
  zoneButtons.append(fragment);
}

function findObject(id) {
  return state.players.find((item) => item.id === id)
    ?? state.balls.find((item) => item.id === id)
    ?? state.cones.find((item) => item.id === id)
    ?? state.miniGoals.find((item) => item.id === id)
    ?? null;
}

function nudgeObject(id, dx, dy) {
  const object = findObject(id);
  if (!object) return;
  object.x = clamp(object.x + dx);
  object.y = clamp(object.y + dy);
  state.selectedObjectId = id;
  commitChange();
}

function openPlayerEditor(id) {
  const player = state.players.find((item) => item.id === id);
  if (!player) return;
  playerId.value = player.id;
  playerNumber.value = String(player.number);
  playerLabel.value = player.label ?? player.role;
  playerColor.value = player.colorOverride ?? '';
  if (!playerDialog.open) playerDialog.showModal();
  playerNumber.focus();
}

function handleObjectPointerDown(event, target) {
  if (state.tool !== 'move') return;
  const id = target.dataset.objectId;
  const object = findObject(id);
  if (!object) return;
  state.selectedObjectId = id;
  drag = { id, pointerId: event.pointerId, moved: false, startX: event.clientX, startY: event.clientY };
  target.setPointerCapture(event.pointerId);
  target.classList.add('is-dragging');
  render();
}

function handleDrawPointerDown(event) {
  const point = pitchPointFromClient(svg, world, event.clientX, event.clientY);
  if (state.tool === 'cone') {
    state.cones.push({ id: createLocalId('cone'), x: point.x, y: point.y, color: '#ff8c1a' });
    state.selectedObjectId = state.cones[state.cones.length - 1].id;
    commitChange({ rebuild: true });
    showToast('Cone added');
    return;
  }
  if (state.tool === 'ball') {
    state.balls.push({ id: createLocalId('ball'), x: point.x, y: point.y, primary: false });
    state.selectedObjectId = state.balls[state.balls.length - 1].id;
    commitChange({ rebuild: true });
    showToast('Extra ball added');
    return;
  }
  if (state.tool === 'minigoal') {
    state.miniGoals.push({ id: createLocalId('minigoal'), x: point.x, y: point.y });
    state.selectedObjectId = state.miniGoals[state.miniGoals.length - 1].id;
    commitChange({ rebuild: true });
    showToast('Mini goal added');
    return;
  }
  if (!['draw', 'arrow'].includes(state.tool)) return;
  svg.setPointerCapture(event.pointerId);
  drawSession = {
    pointerId: event.pointerId,
    drawing: { id: createLocalId('drawing'), type: state.tool === 'arrow' ? 'arrow' : 'freehand', points: [point] },
  };
  state.drawings.push(drawSession.drawing);
  render({ rebuild: true });
}

svg.addEventListener('pointerdown', (event) => {
  const target = event.target.closest('[data-object-id]');
  if (target) handleObjectPointerDown(event, target);
  else handleDrawPointerDown(event);
});

svg.addEventListener('pointermove', (event) => {
  if (drag?.pointerId === event.pointerId) {
    const object = findObject(drag.id);
    if (!object) return;
    const point = pitchPointFromClient(svg, world, event.clientX, event.clientY);
    object.x = point.x;
    object.y = point.y;
    drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5;
    renderScene(svg, state);
    return;
  }
  if (drawSession?.pointerId === event.pointerId) {
    const point = pitchPointFromClient(svg, world, event.clientX, event.clientY);
    if (drawSession.drawing.type === 'arrow') drawSession.drawing.points[1] = point;
    else drawSession.drawing.points.push(point);
    rebuildObjects(svg, state);
    world = svg.querySelector('#pitch-world');
    renderScene(svg, state);
  }
});

function finishPointer(event) {
  if (drag?.pointerId === event.pointerId) {
    const node = svg.querySelector(`#object-${drag.id}`);
    node?.classList.remove('is-dragging');
    const finishedDrag = drag;
    const isPlayer = finishedDrag.id.startsWith('home-') || finishedDrag.id.startsWith('away-');
    if (!finishedDrag.moved && isPlayer) openPlayerEditor(finishedDrag.id);
    dragStatus.textContent = `${finishedDrag.id} ${finishedDrag.moved ? 'moved' : 'selected'}.`;
    drag = null;
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
  const step = event.shiftKey ? 0.025 : 0.01;
  const keys = {
    ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
  };
  if (keys[event.key]) {
    event.preventDefault();
    nudgeObject(id, ...keys[event.key]);
    dragStatus.textContent = `${id} moved with keyboard.`;
  } else if (event.key === 'Enter' && target.dataset.objectType === 'player') {
    event.preventDefault();
    openPlayerEditor(id);
  }
});

homeFormation.addEventListener('change', () => {
  state.homeFormation = homeFormation.value;
  state.players = applyFormation(state.players, 'home', state.homeFormation);
  resetSnapshot = structuredCloneSafe(state);
  commitChange({ rebuild: true });
});
awayFormation.addEventListener('change', () => {
  state.awayFormation = awayFormation.value;
  state.players = applyFormation(state.players, 'away', state.awayFormation);
  resetSnapshot = structuredCloneSafe(state);
  commitChange({ rebuild: true });
});
awayVisible.addEventListener('click', () => { state.awayVisible = !state.awayVisible; commitChange(); });
zonesToggle.addEventListener('click', () => {
  const expanded = zonesToggle.getAttribute('aria-expanded') === 'true';
  zonesToggle.setAttribute('aria-expanded', String(!expanded));
  zonePanel.hidden = expanded;
});
zonesClear.addEventListener('click', () => { state.selectedZones = []; commitChange(); });
zoneOpacity.addEventListener('input', () => { state.zoneOpacity = Number(zoneOpacity.value); commitChange(); });
zoneRestrictionMode.addEventListener('change', () => { state.zoneRestrictionMode = zoneRestrictionMode.value; commitChange(); });
zoneRestrictionScope.addEventListener('change', () => { state.zoneRestrictionScope = zoneRestrictionScope.value; commitChange(); });
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
  const selected = state.selectedObjectId;
  if (!selected) { showToast('Select a cone, mini goal, or extra ball first'); return; }
  const propCount = state.cones.length + state.miniGoals.length + state.balls.length;
  state.cones = state.cones.filter((item) => item.id !== selected);
  state.miniGoals = state.miniGoals.filter((item) => item.id !== selected);
  state.balls = state.balls.filter((item) => item.primary || item.id !== selected);
  if (state.cones.length + state.miniGoals.length + state.balls.length === propCount) {
    showToast('Players and the main ball cannot be removed');
    return;
  }
  state.selectedObjectId = null;
  commitChange({ rebuild: true });
  showToast('Prop removed');
});

playToggle.addEventListener('click', () => {
  state.simulation.running = !state.simulation.running;
  state.tool = 'move';
  commitChange();
});
resetBoard.addEventListener('click', () => {
  const keepTheme = state.theme;
  const keepSavedId = state.currentPresetId;
  state = normalizeState(structuredCloneSafe(resetSnapshot));
  state.theme = keepTheme;
  state.currentPresetId = keepSavedId;
  state.simulation.running = false;
  commitChange({ rebuild: true });
  showToast('Board reset to starting position');
});

playerForm.addEventListener('submit', (event) => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault();
  const player = state.players.find((item) => item.id === playerId.value);
  if (!player) return;
  const number = Number(playerNumber.value);
  if (!Number.isInteger(number) || number < 1 || number > 99) {
    playerNumber.setCustomValidity('Use a jersey number from 1 to 99.');
    playerNumber.reportValidity();
    return;
  }
  playerNumber.setCustomValidity('');
  player.number = number;
  player.label = playerLabel.value.trim() || player.role;
  player.colorOverride = playerColor.value || null;
  playerDialog.close();
  commitChange({ rebuild: true });
  showToast('Player updated');
});

playerDialog.querySelectorAll('[data-nudge]').forEach((button) => {
  button.addEventListener('click', () => {
    const player = state.players.find((item) => item.id === playerId.value);
    if (!player) return;
    const direction = button.dataset.nudge;
    if (direction === 'center') { player.x = player.anchorX; player.y = player.anchorY; }
    if (direction === 'left') player.x = clamp(player.x - 0.02);
    if (direction === 'right') player.x = clamp(player.x + 0.02);
    if (direction === 'up') player.y = clamp(player.y - 0.02);
    if (direction === 'down') player.y = clamp(player.y + 0.02);
    commitChange();
  });
});

const paletteLabels = {
  blue: 'Blue', red: 'Red', yellow: 'Yellow', neonGreen: 'Neon green', orange: 'Orange', white: 'White', black: 'Black', purple: 'Purple',
};
colorsForm.querySelectorAll('select').forEach((select) => {
  Object.entries(PALETTE).forEach(([name, value]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = paletteLabels[name];
    select.append(option);
  });
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
  state.colors.home = colorsForm.elements.home.value;
  state.colors.homeGoalkeeper = colorsForm.elements.homeGoalkeeper.value;
  state.colors.away = colorsForm.elements.away.value;
  state.colors.awayGoalkeeper = colorsForm.elements.awayGoalkeeper.value;
  colorsDialog.close();
  commitChange();
  showToast('Team colors updated');
});

saveAs.addEventListener('click', () => {
  presetTitle.value = '';
  presetCategory.value = 'Positions';
  saveDialog.showModal();
  presetTitle.focus();
});
saveForm.addEventListener('submit', async (event) => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault();
  const preset = await savePreset({ title: presetTitle.value, category: presetCategory.value, state });
  state.currentPresetId = preset.id;
  resetSnapshot = structuredCloneSafe(preset.state);
  saveDialog.close();
  scheduleAutosave();
  showToast('Position saved');
});

async function refreshSavedList() {
  const matchesFilter = (preset) => savedFilter === 'All' || preset.category === savedFilter;
  const presets = (await listPresets()).filter(matchesFilter);
  savedList.replaceChildren();

  BUILT_IN_PRESETS.filter(matchesFilter).forEach((preset) => {
    const item = document.createElement('div');
    item.className = 'saved-item';
    const text = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = preset.title;
    const meta = document.createElement('span');
    meta.textContent = `Built in · ${preset.category} · ${preset.description}`;
    text.append(title, meta);
    const load = document.createElement('button');
    load.type = 'button'; load.textContent = 'Load';
    load.addEventListener('click', () => {
      state = normalizeState(preset.createState());
      state.currentPresetId = preset.id;
      resetSnapshot = structuredCloneSafe(state);
      savedDialog.close();
      commitChange({ rebuild: true });
      showToast(`Loaded ${preset.title}`);
    });
    item.append(text, load);
    savedList.append(item);
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
    const item = document.createElement('div');
    item.className = 'saved-item';
    const text = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = preset.title;
    const meta = document.createElement('span');
    meta.textContent = `${preset.category} · ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(preset.updatedAt))}`;
    text.append(title, meta);
    const load = document.createElement('button');
    load.type = 'button'; load.textContent = 'Load';
    load.addEventListener('click', () => {
      state = normalizeState(structuredCloneSafe(preset.state));
      state.currentPresetId = preset.id;
      resetSnapshot = structuredCloneSafe(state);
      savedDialog.close();
      commitChange({ rebuild: true });
      showToast(`Loaded ${preset.title}`);
    });
    const remove = document.createElement('button');
    remove.type = 'button'; remove.textContent = 'Delete';
    remove.addEventListener('click', async () => {
      // Two-step in-app confirmation (confirm() is unreliable in standalone Home Screen apps).
      if (remove.dataset.armed !== 'true') {
        remove.dataset.armed = 'true';
        remove.textContent = 'Tap again to delete';
        showToast(`Tap Delete again to remove “${preset.title}”`);
        setTimeout(() => { remove.dataset.armed = ''; remove.textContent = 'Delete'; }, 4000);
        return;
      }
      await deletePreset(preset.id);
      await refreshSavedList();
      showToast('Saved position deleted');
    });
    item.append(text, load, remove);
    savedList.append(item);
  });
}
savedFilterSelect.addEventListener('change', () => { savedFilter = savedFilterSelect.value; refreshSavedList(); });
savedOpen.addEventListener('click', async () => { await refreshSavedList(); savedDialog.showModal(); });
savedClose.addEventListener('click', () => savedDialog.close());

exportButton.addEventListener('click', async () => {
  const text = await exportBackup(state);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `u9-tactical-board-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  showToast('Backup exported');
});
importButton.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  try {
    state = await importBackup(await file.text());
    resetSnapshot = structuredCloneSafe(state);
    commitChange({ rebuild: true });
    showToast('Backup imported');
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Backup import failed');
  } finally {
    importFile.value = '';
  }
});

function updateOrientation() {
  orientationPortrait = matchMedia('(orientation: portrait)').matches;
  setSceneOrientation(svg, orientationPortrait);
}
matchMedia('(orientation: portrait)').addEventListener?.('change', updateOrientation);
window.addEventListener('resize', updateOrientation, { passive: true });

function animationLoop(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  if (state.simulation.running && !drag && !drawSession) {
    stepSimulation(state, dt);
    renderScene(svg, state);
  }
  requestAnimationFrame(animationLoop);
}

buildZoneButtons();
updateOrientation();
syncControls();
saveAutosave(state);
requestAnimationFrame(animationLoop);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {
    showToast('Offline mode could not be enabled in this browser.');
  }));
}
