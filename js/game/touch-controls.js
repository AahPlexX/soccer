import { classifySwipe, shapeStick, stickFromDrag } from './input-map.js';

// Touch controls for phones and tablets. The left thumb only ever steers: a ring labelled MOVE always rests where a thumb naturally
// sits, and touching anywhere in the left half re-centers it under the finger (a floating stick). The right thumb has every button:
// Shoot (with a charge ring), Pass, Sprint, Tackle and Switch, plus swipe-to-switch on the free area of the right half. The first
// time, a short card explains each control and the buttons show what they do; after that only the labels remain.
// Every control uses Pointer Events with pointer capture, so move + action work together with multi-touch. All they do is call
// the input sampler (see input-map.js); nothing else in the game knows touch exists.

const STICK_RADIUS = 56; // CSS pixels of drag for full deflection (before the scale setting)
const TIPS_SECONDS = 14;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** True on devices whose primary pointer is a finger. */
export function isTouchDevice() {
  return Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches) || 'ontouchstart' in globalThis;
}

/** What each control does, as shown on the first-run card and in the Controls screen on a touch device. */
export const TOUCH_HELP = Object.freeze([
  ['Move', 'Drag your left thumb anywhere on the left half. Push about two thirds of the way for full speed.'],
  ['Pass', 'Tap to pass to the teammate you are pushing toward (a yellow ring shows who gets it). Hold for a high lob.'],
  ['Shoot', 'Hold to charge the power ring, let go to shoot at goal.'],
  ['Run', 'Hold to sprint while moving. It drains stamina.'],
  ['Tackle', 'Tap near the player with the ball. Hold a direction first to slide.'],
  ['Switch', 'Tap to change player, or swipe on the right half toward the teammate you want.'],
]);

/** The same controls in one short line each, for the first-run card (small enough to sit between the ring and the buttons). */
export const TOUCH_TIPS = Object.freeze([
  ['Move', 'drag with your left thumb'],
  ['Pass', 'tap; ring shows who gets it'],
  ['Shoot', 'hold, then let go'],
  ['Run', 'hold to sprint'],
  ['Tackle', 'tap; add a direction to slide'],
  ['Switch', 'tap, or swipe to a teammate'],
]);

export function mountTouchControls(root, input, { scale = 1, haptics = true, onTipsDone = null } = {}) {
  const layer = element('div', 'g-touch');
  layer.style.setProperty('--g-touch-scale', String(scale));

  // The left half is the joystick zone.
  const stickZone = element('div', 'g-zone-left');
  const base = element('div', 'g-stick-base');
  const knob = element('div', 'g-stick-knob');
  base.append(element('span', 'g-stick-label', 'MOVE'), knob);
  stickZone.append(base);
  let stickPointer = null;
  let origin = { x: 0, y: 0 };
  const radius = STICK_RADIUS * scale;

  /** Rests the ring where a left thumb naturally sits, so there is always something to put a thumb on. */
  function restBase() {
    const box = stickZone.getBoundingClientRect();
    base.style.left = `${Math.max(radius + 14, Math.min(box.width * 0.5, 140))}px`;
    base.style.top = `${box.height * 0.64}px`;
    knob.style.transform = 'translate(0px, 0px)';
    base.classList.remove('g-active');
  }

  stickZone.addEventListener('pointerdown', (event) => {
    if (stickPointer !== null) return;
    stickPointer = event.pointerId;
    stickZone.setPointerCapture(event.pointerId);
    const box = stickZone.getBoundingClientRect();
    origin = { x: event.clientX, y: event.clientY };
    base.style.left = `${origin.x - box.left}px`;
    base.style.top = `${origin.y - box.top}px`;
    base.classList.add('g-active');
    knob.style.transform = 'translate(0px, 0px)';
    event.preventDefault();
  });
  stickZone.addEventListener('pointermove', (event) => {
    if (event.pointerId !== stickPointer) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    const stick = shapeStick(stickFromDrag(dx, dy, radius));
    input.setStick(stick.x, stick.y);
    const length = Math.min(radius, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    knob.style.transform = `translate(${Math.cos(angle) * length}px, ${Math.sin(angle) * length}px)`;
  });
  const endStick = (event) => {
    if (event.pointerId !== stickPointer) return;
    stickPointer = null;
    input.setStick(0, 0);
    restBase();
  };
  stickZone.addEventListener('pointerup', endStick);
  stickZone.addEventListener('pointercancel', endStick);

  // The right half: a free area for swipe-to-switch, with the buttons on top of it.
  const swipeZone = element('div', 'g-zone-right');
  let swipe = null;
  swipeZone.addEventListener('pointerdown', (event) => {
    if (event.target !== swipeZone || swipe) return;
    swipe = { id: event.pointerId, x: event.clientX, y: event.clientY, t: event.timeStamp };
    swipeZone.setPointerCapture(event.pointerId);
  });
  swipeZone.addEventListener('pointerup', (event) => {
    if (!swipe || event.pointerId !== swipe.id) return;
    const direction = classifySwipe(event.clientX - swipe.x, event.clientY - swipe.y, (event.timeStamp - swipe.t) / 1000);
    swipe = null;
    if (direction) input.swipeSwitch(direction);
  });
  swipeZone.addEventListener('pointercancel', () => { swipe = null; });

  const buttons = {};
  // `hold` buttons stay pressed while the finger is down (pass, shoot, sprint); the others fire once on touch (tackle, switch).
  function makeButton(name, label, hint, className, { hold = true } = {}) {
    const node = element('button', `g-action ${className}`);
    node.append(element('span', 'g-label', label), element('span', 'g-hint', hint));
    node.type = 'button';
    node.setAttribute('aria-label', name);
    let pointer = null;
    node.addEventListener('pointerdown', (event) => {
      if (pointer !== null) return;
      pointer = event.pointerId;
      node.setPointerCapture(event.pointerId);
      node.classList.add('g-down');
      input.press(name);
      if (haptics) globalThis.navigator?.vibrate?.(8);
      if (!hold) input.release(name);
      if (name === 'pass' || name === 'shoot') hideTips();
      event.preventDefault();
    });
    const up = (event) => {
      if (event.pointerId !== pointer) return;
      pointer = null;
      node.classList.remove('g-down');
      if (hold) input.release(name);
    };
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('contextmenu', (event) => event.preventDefault());
    buttons[name] = node;
    return node;
  }

  const cluster = element('div', 'g-cluster');
  cluster.append(
    makeButton('shoot', 'SHOOT', 'hold', 'g-shoot'),
    makeButton('pass', 'PASS', 'hold: lob', 'g-pass'),
    makeButton('sprint', 'RUN', 'hold', 'g-sprint'),
    makeButton('tackle', 'TACKLE', '+dir: slide', 'g-tackle', { hold: false }),
    makeButton('switch', 'SWITCH', 'player', 'g-switch', { hold: false }),
  );

  // First-run card: what each control does. It goes away on its button, on the first pass or shot, or after a while.
  const tips = element('div', 'g-tips');
  tips.hidden = true;
  tips.setAttribute('role', 'dialog');
  tips.setAttribute('aria-label', 'How to play');
  const list = element('dl', 'g-tips-list');
  for (const [name, text] of TOUCH_TIPS) list.append(element('dt', '', name), element('dd', '', text));
  const gotIt = element('button', 'g-tips-ok', 'Got it');
  gotIt.type = 'button';
  gotIt.addEventListener('click', () => hideTips());
  tips.append(element('strong', 'g-tips-title', 'Your player has the yellow marker'), list, element('p', 'g-tips-note', 'The match waits until you close this card.'), gotIt);
  let tipsTimer = 0;
  function hideTips() {
    if (tips.hidden) return;
    tips.hidden = true;
    layer.classList.remove('g-hints');
    clearTimeout(tipsTimer);
    onTipsDone?.();
  }

  layer.append(stickZone, swipeZone, cluster, tips);
  root.append(layer);
  restBase();
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (stickPointer === null) restBase(); }) : null;
  observer?.observe(stickZone);

  return {
    layer,
    /** Shows the shot charge (0..1) as a ring around the Shoot button. */
    setCharge(value) { buttons.shoot.style.setProperty('--charge', `${Math.round(Math.max(0, Math.min(1, value)) * 360)}deg`); },
    setVisible(visible) { layer.hidden = !visible; },
    /** Shows the first-run card and the hint under each button until dismissed. */
    showTips() {
      tips.hidden = false;
      layer.classList.add('g-hints');
      clearTimeout(tipsTimer);
      tipsTimer = setTimeout(hideTips, TIPS_SECONDS * 1000);
    },
    destroy() { clearTimeout(tipsTimer); observer?.disconnect(); input.setStick(0, 0); layer.remove(); },
  };
}
