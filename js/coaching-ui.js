import { addTeachingStep, BRIEF_FIELDS, captureBoard, clearProps, createDrillClock, duplicateProp, moveTeachingStep, setPlayerBenched, setSmallSided, teachingStepState } from './coaching.js';
import { normalizeState } from './state.js';
import { initializeScene, renderScene, setSceneOrientation } from './render.js';

export function setupCoaching({ getState, commit, replace, toast, setStart, returnStart, step, saveExisting, newSetup }) {
  const byId = (id) => document.getElementById(id);
  const dialog = byId('coach-dialog');
  const clock = createDrillClock(() => Date.now());
  let currentStep = -1;
  let selectedStepId = null;
  let clockPreset = '';
  let lastTick = '';
  const button = (label, run, disabled = false) => {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = label; node.disabled = disabled; node.addEventListener('click', run); return node;
  };
  const report = (message) => { byId('coach-feedback').textContent = message; toast(message); };
  function resetClock() { clock.reset(getState().coaching.minutes); lastTick = ''; tick(); }
  function tick() {
    const seconds = Math.ceil(clock.remaining / 1000);
    const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    if (text === lastTick) return;
    lastTick = text;
    byId('drill-clock').textContent = text;
    const clockStatus = seconds === 0 ? 'Time finished. Pause for water or rotate players.' : clock.running ? 'Drill clock running' : 'Drill clock paused';
    if (byId('clock-status').textContent !== clockStatus) byId('clock-status').textContent = clockStatus;
    byId('clock-toggle').textContent = seconds === 0 ? 'Clock finished' : clock.running ? 'Pause clock' : 'Start clock';
    byId('clock-toggle').disabled = seconds === 0;
  }
  function go(index) {
    const next = teachingStepState(getState(), index);
    if (!next) return;
    currentStep = index; selectedStepId = getState().coaching.steps[index].id; replace(normalizeState(next), { baseline: false }); resetClock(); fillBrief(); drawRoster(); drawSequence();
    report(`Teaching step ${index + 1}: ${getState().coaching.steps[index].title}`);
  }
  function drawSequence() {
    const list = byId('teaching-steps'); list.replaceChildren();
    const state = getState();
    state.coaching.steps.forEach((item, index) => {
      const row = document.createElement('li');
      const title = document.createElement('input'); title.type = 'text'; title.maxLength = 80; title.value = item.title;
      title.setAttribute('aria-label', `Name of step ${index + 1}`);
      title.addEventListener('change', () => { item.title = title.value.trim() || `Step ${index + 1}`; commit(); drawSequence(); });
      row.append(title, button(`Load step ${index + 1}`, () => go(index)),
        button('Replace snapshot', () => {
          item.board = captureBoard(getState()); item.brief = Object.fromEntries([...BRIEF_FIELDS, 'minutes'].map((key) => [key, getState().coaching[key]]));
          commit(); drawSequence(); report('Step snapshot and teaching points replaced');
        }),
        button('↑', () => { moveTeachingStep(state, index, -1); currentStep = -1; selectedStepId = null; commit(); drawSequence(); }, index === 0),
        button('↓', () => { moveTeachingStep(state, index, 1); currentStep = -1; selectedStepId = null; commit(); drawSequence(); }, index === state.coaching.steps.length - 1),
        button('Remove step', () => { state.coaching.steps.splice(index, 1); currentStep = -1; selectedStepId = null; commit(); drawSequence(); }));
      row.children[3].setAttribute('aria-label', `Move step ${index + 1} earlier`);
      row.children[4].setAttribute('aria-label', `Move step ${index + 1} later`);
      list.append(row);
    });
    byId('teaching-position').textContent = currentStep < 0 ? `${state.coaching.steps.length} saved steps` : `${currentStep + 1}/${state.coaching.steps.length}: ${state.coaching.steps[currentStep]?.title ?? ''}`;
    byId('teaching-prev').disabled = currentStep <= 0;
    byId('teaching-next').disabled = !state.coaching.steps.length || currentStep >= state.coaching.steps.length - 1;
  }
  function drawRoster() {
    const list = byId('coach-roster'); list.replaceChildren();
    for (const team of ['home', 'away']) {
      const fieldset = document.createElement('fieldset'); const legend = document.createElement('legend');
      const players = getState().players.filter((p) => p.team === team);
      legend.textContent = `${team === 'home' ? 'Our team' : 'Opponents'} · ${players.filter((p) => !p.benched).length} on pitch`;
      fieldset.append(legend);
      players.forEach((player) => {
        const label = document.createElement('label'); const checkbox = document.createElement('input');
        checkbox.type = 'checkbox'; checkbox.checked = !player.benched; checkbox.dataset.rosterPlayer = player.id;
        checkbox.addEventListener('change', () => { setPlayerBenched(getState(), player.id, !checkbox.checked); commit(); drawRoster(); });
        label.append(checkbox, document.createTextNode(`#${player.number} ${player.label || player.role}`)); fieldset.append(label);
      });
      fieldset.append(button('Put all on pitch', () => { players.forEach((p) => setPlayerBenched(getState(), p.id, false)); commit(); drawRoster(); }),
        button('Bench team', () => { players.forEach((p) => setPlayerBenched(getState(), p.id, true)); commit(); drawRoster(); }));
      list.append(fieldset);
    }
    byId('keep-roster').checked = getState().coaching.keepRoster;
  }
  function fillBrief() {
    const brief = getState().coaching;
    for (const key of [...BRIEF_FIELDS, 'minutes']) byId(`coach-${key}`).value = brief[key];
  }
  function applyBrief() {
    const brief = getState().coaching;
    const previousMinutes = brief.minutes;
    for (const key of BRIEF_FIELDS) brief[key] = byId(`coach-${key}`).value.trim().slice(0, key === 'title' ? 80 : 2000);
    brief.minutes = Math.min(120, Math.max(1, Math.round(Number(byId('coach-minutes').value) || 5)));
    commit(); if (brief.minutes !== previousMinutes) resetClock(); report('Teaching points applied. Save this setup to keep it in your library.');
  }
  byId('coach-open').addEventListener('click', () => {
    getState().simulation.running = false; commit(); fillBrief(); drawRoster(); drawSequence(); dialog.showModal();
  });
  byId('coach-close').addEventListener('click', () => dialog.close());
  byId('brief-apply').addEventListener('click', applyBrief);
  byId('coach-save-existing').addEventListener('click', async () => {
    applyBrief();
    try { await saveExisting(); report('Loaded setup updated.'); }
    catch (error) { report(error instanceof Error ? error.message : 'Unable to save changes.'); }
  });
  for (const count of [3, 4]) byId(`small-sided-${count}`).addEventListener('click', () => { setSmallSided(getState(), count); commit(); drawRoster(); report(`${count}v${count} set without goalkeepers. Adjust positions on the board.`); });
  byId('keep-roster').addEventListener('change', (event) => { getState().coaching.keepRoster = event.target.checked; commit(); });
  byId('teaching-capture').addEventListener('click', () => {
    applyBrief();
    if (!addTeachingStep(getState(), byId('teaching-title').value)) { report('A sequence can contain up to 12 steps.'); return; }
    byId('teaching-title').value = ''; currentStep = getState().coaching.steps.length - 1; selectedStepId = getState().coaching.steps[currentStep].id; commit(); drawSequence(); report('Step captured. Move the board, then capture the next step.');
  });
  byId('teaching-prev').addEventListener('click', () => go(currentStep - 1));
  byId('teaching-next').addEventListener('click', () => go(currentStep + 1));
  byId('clock-toggle').addEventListener('click', () => { if (clock.running) clock.pause(); else clock.start(); lastTick = ''; tick(); });
  byId('clock-reset').addEventListener('click', resetClock);
  byId('simulation-step').addEventListener('click', step);
  byId('coach-new').addEventListener('click', () => {
    const control = byId('coach-new');
    if (control.dataset.armed !== 'true') {
      control.dataset.armed = 'true'; control.textContent = 'Tap again to start a new drill';
      setTimeout(() => { control.dataset.armed = ''; control.textContent = 'New drill · keep roster'; }, 4000); return;
    }
    selectedStepId = null; currentStep = -1; newSetup(); fillBrief(); drawRoster(); drawSequence(); resetClock();
    control.dataset.armed = ''; control.textContent = 'New drill · keep roster'; report('New setup ready. Names, numbers and colors retained.');
  });
  byId('set-start').addEventListener('click', () => { setStart(); report('Current board is now the drill starting setup.'); });
  byId('return-start').addEventListener('click', returnStart);
  byId('prop-duplicate').addEventListener('click', () => { if (duplicateProp(getState())) commit({ rebuild: true }); else report('Select a cone, mini goal, or extra ball in 2D first.'); });
  byId('props-clear').addEventListener('click', () => {
    if (byId('props-clear').dataset.armed !== 'true') {
      byId('props-clear').dataset.armed = 'true'; byId('props-clear').textContent = 'Tap again to clear props';
      setTimeout(() => { byId('props-clear').dataset.armed = ''; byId('props-clear').textContent = 'Clear all props'; }, 4000); return;
    }
    clearProps(getState()); commit({ rebuild: true }); byId('props-clear').dataset.armed = ''; byId('props-clear').textContent = 'Clear all props';
  });
  byId('coach-print').addEventListener('click', () => {
    applyBrief(); getState().simulation.running = false; commit();
    const sheet = byId('coach-print-sheet'); sheet.replaceChildren();
    const sequence = byId('print-sequence').checked && getState().coaching.steps.length;
    const pages = sequence ? getState().coaching.steps.map((item, index) => ({ state: normalizeState(teachingStepState(getState(), index)), title: item.title })) : [{ state: getState(), title: '' }];
    pages.forEach(({ state, title }, index) => {
      const article = document.createElement('article');
      const heading = document.createElement('h1'); heading.textContent = title || state.coaching.title || 'Coaching setup'; article.append(heading);
      if (title && state.coaching.title) { const subtitle = document.createElement('p'); subtitle.textContent = state.coaching.title; article.append(subtitle); }
      const diagram = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      initializeScene(diagram, state); setSceneOrientation(diagram, false);
      diagram.setAttribute('aria-label', 'Coaching diagram');
      // Each printed page owns its marker definitions, with no duplicate DOM ids.
      diagram.querySelectorAll('[id]').forEach((node) => {
        const previous = node.id; const next = `print-${index}-${previous}`;
        node.id = next;
        diagram.querySelectorAll('[marker-end]').forEach((arrow) => {
          if (arrow.getAttribute('marker-end') === `url(#${previous})`) arrow.setAttribute('marker-end', `url(#${next})`);
        });
      });
      diagram.classList.add('print-pitch'); article.append(diagram);
      const minutes = document.createElement('p'); minutes.textContent = `Duration: ${state.coaching.minutes} minutes · ${state.players.filter((p) => p.team === 'home' && !p.benched).length} v ${state.players.filter((p) => p.team === 'away' && !p.benched).length}`; article.append(minutes);
      for (const key of BRIEF_FIELDS.filter((key) => key !== 'title')) {
        const text = state.coaching[key]; if (!text) continue;
        const label = document.querySelector(`label[for="coach-${key}"]`); const h = document.createElement('h2'); h.textContent = label.textContent;
        const paragraph = document.createElement('p'); paragraph.textContent = text; article.append(h, paragraph);
      }
      sheet.append(article);
    });
    renderScene(byId('pitch'), getState()); // restore live renderer references after preparing print-only SVGs
    window.print();
  });
  setInterval(tick, 250);
  function sync() {
    const key = String(getState().coaching.minutes);
    if (key !== clockPreset) { clockPreset = key; resetClock(); }
    currentStep = selectedStepId ? getState().coaching.steps.findIndex((item) => item.id === selectedStepId) : -1;
    byId('teaching-prev').disabled = currentStep <= 0;
    byId('teaching-next').disabled = !getState().coaching.steps.length || currentStep >= getState().coaching.steps.length - 1;
    byId('teaching-position').textContent = currentStep < 0 ? `${getState().coaching.steps.length} saved steps` : `${currentStep + 1}/${getState().coaching.steps.length}: ${getState().coaching.steps[currentStep]?.title ?? ''}`;
    byId('coach-save-existing').disabled = !getState().currentPresetId || getState().currentPresetId.startsWith('builtin-');

  }
  sync();
  return { sync, captureCurrent() {
    if (!addTeachingStep(getState(), '')) { report('A sequence can contain up to 12 steps.'); return; }
    currentStep = getState().coaching.steps.length - 1; selectedStepId = getState().coaching.steps[currentStep].id;
    getState().simulation.running = false; commit(); drawSequence(); report(`Captured teaching step ${currentStep + 1}.`);
  }, onLoad() { selectedStepId = null; currentStep = -1; resetClock(); } };
}
