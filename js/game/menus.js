import { DIFFICULTIES } from './ai.js';
import { rebind } from './settings.js';
import { TOUCH_HELP } from './touch-controls.js';

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

/** A button that must be pressed twice (the second press within 3 s) before it does something that cannot be undone. */
function confirmButton(label, onConfirm) {
  const node = button(label, () => {
    if (node.dataset) {
      if (node.dataset.armed) { onConfirm(); return; }
      node.dataset.armed = '1';
    }
    node.textContent = 'Tap again to confirm';
    setTimeout(() => { if (node.dataset) delete node.dataset.armed; node.textContent = label; }, 3000);
  });
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

/** A key code as a person reads it: KeyJ -> J, ArrowUp -> Up, ShiftLeft -> Shift Left. */
export function keyLabel(code) {
  return code.replace(/^(Key|Digit|Arrow)/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

const keysText = (codes) => codes.map(keyLabel).join(' or ');

const BINDABLE = [
  ['up', 'Move up'], ['down', 'Move down'], ['left', 'Move left'], ['right', 'Move right'],
  ['pass', 'Pass (tap) / Lob (hold)'], ['shoot', 'Shoot (hold to charge)'], ['sprint', 'Sprint (hold)'],
  ['tackle', 'Tackle / Slide / Keeper dive'], ['switch', 'Switch player'], ['switchDir', 'Switch direction modifier'], ['pause', 'Pause'],
];

const TOUCH_SIZES = [[0.8, 'Small'], [1, 'Normal'], [1.25, 'Large']];
const onOff = [[true, 'On'], [false, 'Off']];

export function createMenus(root, { settings, onStart, onResume, onRestart, onExit, onSettings, bindings, defaultBindings, onBindings, onDifficulty, touch = false }) {
  const layer = element('div', 'g-menu-layer');
  layer.hidden = true;
  root.append(layer);
  let currentBack = null; // what one level back (Esc, or B on a gamepad) does on the screen shown
  let capturing = null; // { action, done } while the next key press is being taken as a new binding

  function show(...nodes) {
    layer.replaceChildren(...nodes);
    layer.hidden = false;
    layer.querySelector('button')?.focus();
  }

  const api = {
    layer,
    get visible() { return !layer.hidden; },
    hide() { capturing = null; currentBack = null; layer.hidden = true; layer.replaceChildren(); },

    /** One level back (Esc, or B on a gamepad). Returns true if there was somewhere to go. */
    back() {
      if (!currentBack) return false;
      currentBack();
      return true;
    },
    /** Moves the keyboard or gamepad focus through the buttons on screen. */
    moveFocus(step) {
      const nodes = [...(layer.querySelectorAll?.('button') ?? [])];
      if (nodes.length === 0) return;
      const at = nodes.indexOf(document.activeElement);
      nodes[(at + step + nodes.length) % nodes.length].focus();
    },
    /** Presses the focused button (A on a gamepad). */
    activate() {
      const node = document.activeElement;
      if (node && layer.contains?.(node)) node.click?.();
    },

    /** Offers a key press to the menus; true when it was consumed (while a new key is being picked for an action). */
    handleKey(event) {
      if (!capturing) return false;
      const { action, done } = capturing;
      if (event.code === 'Escape' && action !== 'pause') { capturing = null; done('Cancelled.'); return true; }
      const result = rebind(bindings(), action, event.code);
      capturing = null;
      if (result.ok) onBindings(result.bindings);
      done(result.ok ? '' : result.reason);
      return true;
    },

    showTitle() {
      currentBack = () => onExit();
      const panel = element('div', 'g-menu');
      panel.append(
        element('h2', 'g-title', 'U9 SOCCER'),
        element('p', 'g-subtitle', 'Seven a side. You control one player at a time.'),
        choice('Difficulty', Object.entries(DIFFICULTIES).map(([key, profile]) => [key, profile.label]), settings.difficulty, (value) => { settings.difficulty = value; onSettings?.(settings); }),
        choice('Half length', [[1, '1 min'], [2, '2 min'], [3, '3 min']], settings.halfMinutes, (value) => { settings.halfMinutes = value; onSettings?.(settings); }),
        button('Kick off', () => onStart(settings), { primary: true }),
        button('Controls', () => api.showControls(() => api.showTitle())),
        button('Settings', () => api.showSettings(() => api.showTitle())),
        button('Back to coach', () => onExit()),
      );
      show(panel);
    },

    showPause() {
      currentBack = () => onResume();
      const panel = element('div', 'g-menu');
      panel.append(
        element('h2', 'g-title', 'PAUSED'),
        choice('Difficulty', Object.entries(DIFFICULTIES).map(([key, profile]) => [key, profile.label]), settings.difficulty, (value) => { settings.difficulty = value; onSettings?.(settings); onDifficulty?.(value); }),
        button('Resume', () => onResume(), { primary: true }),
        confirmButton('Restart match', () => onRestart()),
        button('Controls', () => api.showControls(() => api.showPause())),
        button('Settings', () => api.showSettings(() => api.showPause())),
        confirmButton('Exit to coach', () => onExit()),
      );
      show(panel);
    },

    showControls(back) {
      currentBack = back;
      const panel = element('div', 'g-menu g-menu-wide');
      panel.append(element('h2', 'g-title', 'CONTROLS'));
      const list = element('dl', 'g-controls');
      const keys = bindings();
      const rows = [
        ['Move', `${keysText(keys.up)} / ${keysText(keys.left)} / ${keysText(keys.down)} / ${keysText(keys.right)} · left stick · touch joystick`],
        ['Pass (tap) / Lob (hold)', `${keysText(keys.pass)} · A · Pass button`],
        ['Shoot (hold to charge)', `${keysText(keys.shoot)} · B · Shoot button`],
        ['Sprint (hold)', `${keysText(keys.sprint)} · right trigger · Sprint button`],
        ['Tackle / Slide (with a direction)', `${keysText(keys.tackle)} · X · Tackle button`],
        ['Goalkeeper: dive', 'Tackle with left or right held'],
        ['Switch player', `${keysText(keys.switch)} · Y · Switch button · ${keysText(keys.switchDir)} + direction, right stick or a swipe picks one`],
        ['Pause', `${keysText(keys.pause)} · Start · the II button`],
      ];
      for (const [action, text] of touch ? TOUCH_HELP : rows) list.append(element('dt', '', action), element('dd', '', text));
      panel.append(list);
      if (touch) panel.append(button('Show these tips at the next kickoff', () => { settings.tipsSeen = false; onSettings?.(settings); }));
      else panel.append(button('Change keys', () => api.showKeys(back)));
      panel.append(button('Back', back, { primary: true }));
      show(panel);
    },

    showSettings(back) {
      currentBack = back;
      const panel = element('div', 'g-menu');
      const set = (key) => (value) => { settings[key] = value; onSettings?.(settings); };
      panel.append(
        element('h2', 'g-title', 'SETTINGS'),
        choice('Sound', onOff, settings.sound, set('sound')),
        choice('Vibration', onOff, settings.haptics, set('haptics')),
        choice('Radar', onOff, settings.radar, set('radar')),
        choice('Touch buttons', TOUCH_SIZES, settings.touchScale, set('touchScale')),
        touch ? button('Show the touch tips at the next kickoff', () => { settings.tipsSeen = false; onSettings?.(settings); }) : button('Change keys', () => api.showKeys(() => api.showSettings(back))),
        button('Back', back, { primary: true }),
      );
      show(panel);
    },

    /** Lists every action with its keys; picking one waits for the next key press (Esc cancels) and rebinds it. */
    showKeys(back, message = '') {
      currentBack = back;
      const panel = element('div', 'g-menu g-menu-wide');
      const status = element('p', 'g-subtitle', message || 'Pick an action, then press the key you want.');
      status.setAttribute('role', 'status');
      const list = element('div', 'g-keys');
      const current = bindings();
      for (const [action, label] of BINDABLE) {
        const row = button(`${label}: ${keysText(current[action])}`, () => {
          row.textContent = `${label}: press a key…`;
          capturing = { action, done: (note) => api.showKeys(back, note) };
        });
        list.append(row);
      }
      panel.append(
        element('h2', 'g-title', 'CHANGE KEYS'), status, list,
        button('Reset to defaults', () => { onBindings(defaultBindings); api.showKeys(back, 'Keys reset.'); }),
        button('Back', back, { primary: true }),
      );
      show(panel);
    },

    showFullTime(match) {
      currentBack = null;
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
