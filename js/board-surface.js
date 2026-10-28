import { findObject } from './board-actions.js';
import { duplicateProp, setPlayerBenched } from './coaching.js';
import { giveBallToPlayer } from './board-interactions.js';

const HINTS = {
  move: 'Drag to move. Tap an object for coaching actions; Enter edits a player.',
  select: 'Tap or use Enter/Space to select objects. Drag a selected object to move the unit; arrows nudge.',
  draw: 'Draw a coaching mark on the pitch. Undo recovers the last stroke.',
  arrow: 'Drag from the passer to the intended receiver.',
  run: 'Drag a dashed running route for a player.',
  curve: 'Drag a route to trace a curved pass or movement.',
  erase: 'Tap near a drawing to remove it. Players and equipment stay safe.',
  cone: 'Tap the pitch to place a cone. Choose its color in Equipment.',
  minigoal: 'Tap the pitch to place a mini goal for your drill.',
  ball: 'Tap the pitch to add a spare ball. The CPU uses the main ball.',
};

export function setupBoardSurface({ getState, getSelection, clearSelection, commit, edit, nudge, capture, mode3D, edit3D, onPresentation }) {
  const byId = (id) => document.getElementById(id);
  const icons = {
    move: '<path d="M5 3l14 10-7 1-3 7z"/>',
    select: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="2"/>',
    draw: '<path d="M4 20l4-1L20 7l-3-3L5 16zM14 7l3 3"/>',
    arrow: '<path d="M3 12h17m-6-6l6 6-6 6"/>',
    run: '<path d="M3 12h17" stroke-dasharray="3 3"/><path d="M14 6l6 6-6 6"/>',
    curve: '<path d="M3 18c1-13 12-15 17-6m-6-1l6 1-1-6"/>',
    erase: '<path d="M3 14l10-10 8 8-8 8H9zM8 9l8 8M13 20h8"/>',
  };
  for (const [tool, path] of Object.entries(icons)) {
    const span = document.createElement('span'); span.className = 'tool-symbol'; span.setAttribute('aria-hidden', 'true');
    span.innerHTML = `<svg viewBox="0 0 24 24">${path}</svg>`;
    document.querySelector(`[data-tool="${tool}"]`).prepend(span);
  }
  const panel = byId('board-panel'); const narrow = matchMedia('(max-width: 1099px)');
  let previousFocus;
  function setPanel(open) {
    open = Boolean(open && narrow.matches);
    document.body.classList.toggle('panel-open', open);
    byId('panel-toggle').setAttribute('aria-expanded', String(open));
    for (const node of [document.querySelector('.top-rail'), byId('workspace'), document.querySelector('.bottom-dock')]) node.inert = open;
    if (open) {
      previousFocus = document.activeElement; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); byId('panel-close').focus();
    } else {
      panel.removeAttribute('role'); panel.removeAttribute('aria-modal');
      if (previousFocus && narrow.matches) previousFocus.focus();
      else if (panel.contains(document.activeElement)) {
        if (narrow.matches) byId('panel-toggle').focus();
        else if (document.activeElement === byId('panel-close')) panel.querySelector('[data-tool]').focus();
      }
      previousFocus = null;
    }
  }
  byId('panel-toggle').addEventListener('click', () => setPanel(true));
  byId('panel-close').addEventListener('click', () => setPanel(false));
  byId('panel-scrim').addEventListener('click', () => setPanel(false));
  narrow.addEventListener?.('change', () => setPanel(false));
  panel.addEventListener('click', (event) => { if (event.target.closest('[data-tool]')) setPanel(false); });
  panel.addEventListener('keydown', (event) => {
    if (!document.body.classList.contains('panel-open') || document.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setPanel(false); return; }
    if (event.key === 'Tab') {
      const nodes = [...panel.querySelectorAll('button:not(:disabled), select, input, summary')].filter((node) => node.getClientRects().length);
      const first = nodes[0]; const last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  byId('presentation-toggle').addEventListener('click', () => {
    setPanel(false); getState().tool = 'move'; clearSelection();
    const active = !document.body.classList.contains('presentation');
    document.body.classList.toggle('presentation', active);
    byId('presentation-toggle').setAttribute('aria-pressed', String(active));
    byId('presentation-toggle').textContent = active ? 'Exit presentation' : 'Present';
    onPresentation(active);
    window.dispatchEvent(new Event('resize'));
  });
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape' && !document.querySelector('dialog[open]') && !document.body.classList.contains('panel-open')) {
      if (document.body.classList.contains('presentation')) byId('presentation-toggle').click();
      else clearSelection();
    }
  });
  byId('quick-capture').addEventListener('click', capture);
  byId('selection-capture').addEventListener('click', capture);
  byId('selection-edit').addEventListener('click', () => edit(getState().selectedObjectId));
  byId('selection-ball').addEventListener('click', () => { if (giveBallToPlayer(getState(), getState().selectedObjectId)) commit(); });
  byId('selection-bench').addEventListener('click', () => {
    const ids = getSelection().length ? getSelection() : [getState().selectedObjectId];
    ids.forEach((id) => setPlayerBenched(getState(), id, true)); clearSelection(); commit();
  });
  byId('selection-duplicate').addEventListener('click', () => { if (duplicateProp(getState())) commit({ rebuild: true }); });
  byId('selection-remove').addEventListener('click', () => byId('remove-selected').click());
  byId('selection-clear').addEventListener('click', clearSelection);
  const directions = { left: [-.01,0], right: [.01,0], up: [0,-.01], down: [0,.01] };
  document.querySelectorAll('[data-selection-nudge]').forEach((button) => button.addEventListener('click', () => nudge(...directions[button.dataset.selectionNudge])));

  function sync() {
    const state = getState(); const ids = getSelection().filter((id) => { const object = findObject(state, id); return object && !object.benched; });
    const object = findObject(state, state.selectedObjectId);
    const many = ids.length > 1; const player = object?.team && !object.benched;
    const prop = object && !object.team && !object.primary;
    const visible = many || (object && !object.benched);
    byId('selection-bar').hidden = !visible;
    document.querySelector('.board-hint').classList.toggle('has-selection', Boolean(visible));
    const selectionTitle = many ? `${ids.length} objects selected` : player ? `#${object.number} ${object.label || object.role}` : object?.primary ? 'Match ball' : object ? 'Drill equipment' : '';
    if (byId('selection-title').textContent !== selectionTitle) byId('selection-title').textContent = selectionTitle;
    byId('selection-detail').textContent = many ? 'Move the unit together · arrow keys or drag' : player ? `${object.team === 'home' ? 'Our team' : 'Opponents'} · ${object.role}` : 'Drag to reposition · arrow keys to nudge';
    byId('selection-edit').hidden = many || !player;
    byId('selection-ball').hidden = many || !player;
    byId('selection-bench').hidden = !(many ? ids.some((id) => findObject(state,id)?.team) : player);
    byId('selection-duplicate').hidden = many || !prop;
    byId('selection-remove').hidden = many || !prop;
    document.querySelectorAll('#pitch [data-object-id]').forEach((node) => {
      const selected = ids.includes(node.dataset.objectId); const presenting = document.body.classList.contains('presentation');
      node.classList.toggle('is-multiselected', selected); node.setAttribute('aria-describedby', 'board-tool-hint');
      node.setAttribute('tabindex', presenting ? '-1' : '0');
      if (presenting) node.setAttribute('aria-disabled', 'true'); else node.removeAttribute('aria-disabled');
      if (state.tool === 'select') node.setAttribute('aria-pressed', String(selected)); else node.removeAttribute('aria-pressed');
    });
    byId('board-title').textContent = state.coaching.title || 'Untitled coaching setup';
    const count = (team) => state.players.filter((p) => p.team === team && !p.benched).length;
    byId('board-summary').textContent = `${state.simulation.running ? 'Playing' : 'Paused'} · ${count('home')} v ${count('away')} · ${state.homeFormation} / ${state.awayFormation}`;
    byId('board-tool-hint').textContent = mode3D() ? edit3D() ? 'Drag a player, ball or prop on the ground. Two fingers or right-drag moves the camera.' : 'Drag to orbit. Enable Edit in 3D to reposition players, balls and equipment.' : HINTS[state.tool];
  }
  return { sync, closePanel: () => setPanel(false) };
}
