import { DIFFICULTIES } from './ai.js';

// Game Mode menus as plain DOM: the title screen (difficulty, half length, kick off), the pause menu, the controls help and the
// full-time summary. Each screen is built fresh when shown, takes focus on its first button and is keyboard and touch friendly.

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, onClick, { primary = false, pressed } = {}) {
  const node = element('button', primary ? 'g-menu-button g-menu-primary' : 'g-menu-button', label);
  node.type = 'button';
  if (pressed !== undefined) node.setAttribute('aria-pressed', String(pressed));
  node.addEventListener('click', onClick);
  return node;
}

/** A row of mutually exclusive buttons ([value, label] pairs) with `current` pressed; picking one calls `onPick(value)`. */
function choice(title, options, current, onPick) {
  const group = element('div', 'g-choice');
  group.append(element('span', 'g-choice-title', title));
  const row = element('div', 'g-choice-row');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', title);
  const nodes = options.map(([value, label]) => button(label, () => {
    onPick(value);
    nodes.forEach((node, i) => node.setAttribute('aria-pressed', String(options[i][0] === value)));
  }, { pressed: value === current }));
  row.append(...nodes);
  group.append(row);
  return group;
}

const CONTROLS_HELP = [
  ['Move', 'Arrow keys or WASD · left stick · touch joystick'],
  ['Pass (tap) / Lob (hold)', 'J or Space · A · Pass button'],
  ['Shoot (hold to charge)', 'K or Enter · B · Shoot button'],
  ['Sprint (hold)', 'L or Shift · right trigger · Sprint button'],
  ['Tackle / Slide (with a direction)', 'I or E · X · Tackle button'],
  ['Switch player', 'Tab or Q · Y · Switch button · U + direction, right stick or a swipe picks one'],
  ['Pause', 'Esc or P · Start · the II button'],
];

export function createMenus(root, { settings, onStart, onResume, onRestart, onExit, onSettings }) {
  const layer = element('div', 'g-menu-layer');
  layer.hidden = true;
  root.append(layer);

  function show(...nodes) {
    layer.replaceChildren(...nodes);
    layer.hidden = false;
    layer.querySelector('button')?.focus();
  }

  const api = {
    layer,
    get visible() { return !layer.hidden; },
    hide() { layer.hidden = true; layer.replaceChildren(); },

    showTitle() {
      const panel = element('div', 'g-menu');
      panel.append(
        element('h2', 'g-title', 'U9 SOCCER'),
        element('p', 'g-subtitle', 'Seven a side. You control one player at a time.'),
        choice('Difficulty', Object.entries(DIFFICULTIES).map(([key, profile]) => [key, profile.label]), settings.difficulty, (value) => { settings.difficulty = value; onSettings?.(settings); }),
        choice('Half length', [[1, '1 min'], [2, '2 min'], [3, '3 min']], settings.halfMinutes, (value) => { settings.halfMinutes = value; onSettings?.(settings); }),
        button('Kick off', () => onStart(settings), { primary: true }),
        button('Controls', () => api.showControls(() => api.showTitle())),
        button('Back to coach', () => onExit()),
      );
      show(panel);
    },

    showPause() {
      const panel = element('div', 'g-menu');
      panel.append(
        element('h2', 'g-title', 'PAUSED'),
        button('Resume', () => onResume(), { primary: true }),
        button('Restart match', () => onRestart()),
        button('Controls', () => api.showControls(() => api.showPause())),
        button('Exit to coach', () => onExit()),
      );
      show(panel);
    },

    showControls(back) {
      const panel = element('div', 'g-menu g-menu-wide');
      panel.append(element('h2', 'g-title', 'CONTROLS'));
      const list = element('dl', 'g-controls');
      for (const [action, keys] of CONTROLS_HELP) list.append(element('dt', '', action), element('dd', '', keys));
      panel.append(list, button('Back', back, { primary: true }));
      show(panel);
    },

    showFullTime(match) {
      const { home, away } = match.score;
      const verdict = home === away ? 'It finished level.' : home > away ? 'You win!' : 'The computer wins.';
      const shots = match.stats.shots;
      const total = match.stats.possession.home + match.stats.possession.away;
      const share = total > 0 ? Math.round((match.stats.possession.home / total) * 100) : 50;
      const panel = element('div', 'g-menu');
      panel.append(
        element('h2', 'g-title', 'FULL TIME'),
        element('p', 'g-final', `${home} - ${away}`),
        element('p', 'g-subtitle', verdict),
        element('p', 'g-stats', `Shots ${shots.home}-${shots.away} · Possession ${share}% - ${100 - share}% · Saves ${match.stats.saves.home}-${match.stats.saves.away}`),
        button('Play again', () => onRestart(), { primary: true }),
        button('Exit to coach', () => onExit()),
      );
      show(panel);
    },
  };
  return api;
}
