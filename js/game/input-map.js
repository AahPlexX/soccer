// Device-independent input for Game Mode: keyboard, gamepad and touch all feed one sampler that turns presses, releases and
// holds into the human's control frame each step. Pure: no DOM, no timers; time only advances through `sample(dt)`.
//
// Timing rules (docs/GAME_MODE.md section 5.3):
//  - Pass fires on release: a quick tap is a ground pass, a hold of `lobHold` seconds or more is a lofted pass.
//  - Shoot charges while held and fires on release; the charge (0..1 over `chargeSeconds`) is the power.
//  - Tackle fires on press: a slide if a direction is held, otherwise a stand tackle.
//  - Switch fires on press: a cycle, or a directional switch if the direction modifier is held or a swipe/flick happened.

export const ACTIONS = Object.freeze(['up', 'down', 'left', 'right', 'pass', 'shoot', 'sprint', 'tackle', 'switch', 'switchDir', 'pause']);

export const DEFAULT_BINDINGS = Object.freeze({
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  pass: ['KeyJ', 'Space'],
  shoot: ['KeyK', 'Enter'],
  sprint: ['KeyL', 'ShiftLeft', 'ShiftRight'],
  tackle: ['KeyI', 'KeyE'],
  switch: ['Tab', 'KeyQ'],
  switchDir: ['KeyU'],
  pause: ['Escape', 'KeyP'],
});

export const INPUT = Object.freeze({
  lobHold: 0.25, // seconds of holding pass before it becomes a lob
  autoLob: 0.9, // a pass held this long fires by itself as a lob
  chargeSeconds: 0.8, // seconds of holding shoot for full power
  minPower: 0.15,
  stickDeadzone: 0.18,
  flickThreshold: 0.7, // right stick magnitude that counts as a flick
  swipeDistance: 40, // CSS pixels a swipe must travel
  swipeSeconds: 0.35, // and no slower than this
  slideThreshold: 0.3, // held direction magnitude that turns a tackle into a slide
});

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** A stick from a drag of (dx, dy) pixels within `radius`: dead zone removed and rescaled so full deflection is 1. */
export function stickFromDrag(dx, dy, radius, deadzone = INPUT.stickDeadzone) {
  const length = Math.hypot(dx, dy);
  if (radius <= 0 || length === 0) return { x: 0, y: 0 };
  const magnitude = Math.min(1, length / radius);
  if (magnitude <= deadzone) return { x: 0, y: 0 };
  const scaled = (magnitude - deadzone) / (1 - deadzone);
  return { x: (dx / length) * scaled, y: (dy / length) * scaled };
}

/** A swipe's direction as a unit { x, y }, or null if it was too short or too slow. */
export function classifySwipe(dx, dy, seconds) {
  const length = Math.hypot(dx, dy);
  if (length < INPUT.swipeDistance || seconds > INPUT.swipeSeconds) return null;
  return { x: dx / length, y: dy / length };
}

/** Standard-mapping gamepad axes and buttons as { stick, rightStick, buttons } with dead zones applied. */
export function readGamepad(pad) {
  const axis = (index) => (Number.isFinite(pad?.axes?.[index]) ? pad.axes[index] : 0);
  const button = (index) => Boolean(pad?.buttons?.[index]?.pressed) || (pad?.buttons?.[index]?.value ?? 0) > 0.3;
  const stick = stickFromDrag(axis(0), axis(1), 1);
  const rightStick = { x: axis(2), y: axis(3) };
  return { stick, rightStick, buttons: { pass: button(0), shoot: button(1), tackle: button(2), switch: button(3) || button(4), sprint: button(7) || button(5), pause: button(9) } };
}

export function createInput(bindings = DEFAULT_BINDINGS) {
  const byCode = new Map();
  for (const action of ACTIONS) for (const code of bindings[action] ?? []) byCode.set(code, [...(byCode.get(code) ?? []), action]);

  const held = Object.fromEntries(ACTIONS.map((action) => [action, 0]));
  const pressed = new Set();
  const released = new Set();
  const state = { stick: { x: 0, y: 0 }, swipe: null, passFor: 0, shootFor: 0, autoFired: false, rightWasFlicked: false, padButtons: {} };

  function press(action) {
    if (!(action in held)) return;
    held[action] += 1;
    if (held[action] === 1) {
      pressed.add(action);
      if (action === 'pass') { state.passFor = 0; state.autoFired = false; }
      if (action === 'shoot') state.shootFor = 0;
    }
  }
  function release(action) {
    if (!(action in held) || held[action] === 0) return;
    held[action] -= 1;
    if (held[action] === 0) released.add(action);
  }

  return {
    press,
    release,
    keyDown(code) { for (const action of byCode.get(code) ?? []) press(action); return byCode.has(code); },
    keyUp(code) { for (const action of byCode.get(code) ?? []) release(action); return byCode.has(code); },
    /** Analog movement from a touch joystick (already dead-zoned), each axis -1..1. */
    setStick(x, y) { state.stick = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) }; },
    /** A swipe on the pitch: switch toward `dir` ({ x, y }). */
    swipeSwitch(dir) { state.swipe = { x: dir.x, y: dir.y }; },
    /** Feeds a gamepad snapshot (see readGamepad): buttons are edge-detected here, the right stick flick-detected. */
    gamepad(pad) {
      const read = readGamepad(pad);
      state.stick = read.stick;
      for (const [action, down] of Object.entries(read.buttons)) {
        const before = Boolean(state.padButtons[action]);
        if (down && !before) press(action);
        else if (!down && before) release(action);
        state.padButtons[action] = down;
      }
      const magnitude = Math.hypot(read.rightStick.x, read.rightStick.y);
      if (magnitude >= INPUT.flickThreshold && !state.rightWasFlicked) {
        state.swipe = { x: read.rightStick.x / magnitude, y: read.rightStick.y / magnitude };
        state.rightWasFlicked = true;
      } else if (magnitude < INPUT.flickThreshold * 0.6) {
        state.rightWasFlicked = false;
      }
    },
    /** Forgets everything held (the window lost focus, or the game paused). */
    reset() {
      for (const action of ACTIONS) held[action] = 0;
      pressed.clear();
      released.clear();
      Object.assign(state, { stick: { x: 0, y: 0 }, swipe: null, passFor: 0, shootFor: 0, autoFired: false, padButtons: {}, rightWasFlicked: false });
    },
    /** True while `action` is held (for the HUD). */
    isHeld(action) { return held[action] > 0; },
    /**
     * One control frame for the human's active player. `heading` (radians) lets the shot's curl follow the sideways part of the
     * held direction. The edge events (pass, shoot, tackle, switch, pause) appear in exactly one frame.
     */
    sample(dt, heading = 0) {
      let x = (held.right > 0 ? 1 : 0) - (held.left > 0 ? 1 : 0) + state.stick.x;
      let y = (held.down > 0 ? 1 : 0) - (held.up > 0 ? 1 : 0) + state.stick.y;
      const length = Math.hypot(x, y);
      if (length > 1) { x /= length; y /= length; }
      const move = { x, y };
      if (held.pass > 0) state.passFor += dt;
      if (held.shoot > 0) state.shootFor += dt;

      const frame = { move, sprint: held.sprint > 0, pass: null, shoot: null, tackle: null, switch: null, pause: false, charge: held.shoot > 0 ? clamp(state.shootFor / INPUT.chargeSeconds, 0, 1) : 0 };

      if (held.pass > 0 && state.passFor >= INPUT.autoLob && !state.autoFired) { frame.pass = 'lob'; state.autoFired = true; }
      if (released.has('pass')) {
        if (!state.autoFired) frame.pass = state.passFor >= INPUT.lobHold ? 'lob' : 'tap';
        state.passFor = 0;
        state.autoFired = false;
      }
      if (released.has('shoot')) {
        const power = clamp(state.shootFor / INPUT.chargeSeconds, INPUT.minPower, 1);
        const sideways = Math.cos(heading) * move.y - Math.sin(heading) * move.x; // positive when the stick is counter-clockwise of the heading (toward +y for a ball going +x), the way the ball then curls
        frame.shoot = { power, curl: clamp(sideways, -1, 1) };
        state.shootFor = 0;
      }
      if (pressed.has('tackle')) frame.tackle = Math.hypot(move.x, move.y) >= INPUT.slideThreshold ? 'slide' : 'stand';
      if (state.swipe) { frame.switch = { dir: state.swipe }; state.swipe = null; }
      else if (pressed.has('switch')) frame.switch = held.switchDir > 0 && Math.hypot(move.x, move.y) > 0.3 ? { dir: { ...move } } : 'cycle';
      if (pressed.has('pause')) frame.pause = true;
      pressed.clear();
      released.clear();
      return frame;
    },
  };
}

/** Turns a human frame into the controls entry for the active player (what `stepMatch` takes). */
export function frameToControl(frame) {
  return { move: frame.move, sprint: frame.sprint, pass: frame.pass, shoot: frame.shoot, tackle: frame.tackle };
}
