import { classifySwipe, stickFromDrag } from './input-map.js';

// Touch controls for phones and tablets: a floating joystick wherever the left thumb lands, big action buttons on the right
// (Pass, Shoot with a charge ring, Sprint, Tackle) and a Switch button, plus swipe-to-switch on the free area of the right half.
// Every control uses Pointer Events with pointer capture, so move + action work together with multi-touch. All they do is call
// the input sampler (see input-map.js); nothing else in the game knows touch exists.

const STICK_RADIUS = 56; // CSS pixels of drag for full deflection (before the scale setting)

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

export function mountTouchControls(root, input, { scale = 1, haptics = true } = {}) {
  const layer = element('div', 'g-touch');
  layer.style.setProperty('--g-touch-scale', String(scale));

  // The left half is the joystick zone.
  const stickZone = element('div', 'g-zone-left');
  const base = element('div', 'g-stick-base');
  const knob = element('div', 'g-stick-knob');
  base.append(knob);
  base.hidden = true;
  stickZone.append(base);
  let stickPointer = null;
  let origin = { x: 0, y: 0 };
  const radius = STICK_RADIUS * scale;

  stickZone.addEventListener('pointerdown', (event) => {
    if (stickPointer !== null) return;
    stickPointer = event.pointerId;
    stickZone.setPointerCapture(event.pointerId);
    const box = stickZone.getBoundingClientRect();
    origin = { x: event.clientX, y: event.clientY };
    base.style.left = `${origin.x - box.left}px`;
    base.style.top = `${origin.y - box.top}px`;
    base.hidden = false;
    knob.style.transform = 'translate(0px, 0px)';
    event.preventDefault();
  });
  stickZone.addEventListener('pointermove', (event) => {
    if (event.pointerId !== stickPointer) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    const stick = stickFromDrag(dx, dy, radius);
    input.setStick(stick.x, stick.y);
    const length = Math.min(radius, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    knob.style.transform = `translate(${Math.cos(angle) * length}px, ${Math.sin(angle) * length}px)`;
  });
  const endStick = (event) => {
    if (event.pointerId !== stickPointer) return;
    stickPointer = null;
    input.setStick(0, 0);
    base.hidden = true;
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
  function makeButton(name, label, className, { hold = true } = {}) {
    const node = element('button', `g-action ${className}`, label);
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
    makeButton('shoot', 'SHOOT', 'g-shoot'),
    makeButton('pass', 'PASS', 'g-pass'),
    makeButton('sprint', 'RUN', 'g-sprint'),
    makeButton('tackle', 'TACKLE', 'g-tackle', { hold: false }),
  );
  const switcher = makeButton('switch', 'SWITCH', 'g-switch', { hold: false });

  layer.append(stickZone, swipeZone, cluster, switcher);
  root.append(layer);

  return {
    layer,
    /** Shows the shot charge (0..1) as a ring around the Shoot button. */
    setCharge(value) { buttons.shoot.style.setProperty('--charge', `${Math.round(Math.max(0, Math.min(1, value)) * 360)}deg`); },
    setVisible(visible) { layer.hidden = !visible; },
    destroy() { input.setStick(0, 0); layer.remove(); },
  };
}
