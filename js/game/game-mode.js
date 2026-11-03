import { aiControls, createAi } from './ai.js';
import { createAudio, soundFor } from './audio.js';
import { cameraTarget, createCamera, screenToWorldMove, snapCamera, stepCamera } from './camera.js';
import { addFromEvent, addFromMotion, createEffects, stepEffects } from './effects.js';
import { createHud } from './hud.js';
import { ACTIONS, DEFAULT_BINDINGS, createInput, frameToControl, mergeFrames } from './input-map.js';
import { bestPassTarget } from './ball-control.js';
import { MATCH, createMatch, drainEvents, playerById, stepMatch, teamOf } from './match.js';
import { opponentOf } from './rules.js';
import { createMenus } from './menus.js';
import { clearReplay, createReplay, recordReplay, replayFrameAt, replayFrames } from './replay.js';
import { createRenderer } from './renderer.js';
import { effectiveBindings, loadSettings, saveSettings, withBindings } from './settings.js';
import { autoSwitch, cycleSwitch, directionSwitch } from './switching.js';
import { isTouchDevice, mountTouchControls } from './touch-controls.js';

// Game Mode entry point and loop. The only module the Coach app imports (lazily, from app.js); see docs/GAME_MODE.md.
// It owns everything the game needs while it is open and removes all of it on stop(): the canvas, HUD, menus, touch controls,
// audio, key and gamepad listeners and the animation loop. The coach board is never touched.

const STYLE_URL = new URL('./game.css', import.meta.url).href;
const AI_EVERY = 6; // fixed steps between AI decisions (20 Hz at 120 Hz steps)
const REPLAY_DELAY = 1.4; // seconds after a goal before its replay starts

/** localStorage, or null where the browser blocks it (private windows, blocked site data); settings then simply do not persist. */
function safeStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

function loadStyles() {
  if (document.querySelector('link[data-game-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = STYLE_URL;
  link.dataset.gameStyle = '';
  document.head.append(link);
}

/**
 * Mounts Game Mode into `root` and returns { stop }. `onExit` is called when the player leaves from inside the game;
 * `stop()` removes everything the game added.
 */
export function startGame({ root, onExit, board = null, storage = safeStorage() }) {
  loadStyles();
  root.replaceChildren();
  root.hidden = false;
  root.dataset.gamePhase = 'menu';

  const settings = loadSettings(storage, ACTIONS);
  const canvas = document.createElement('canvas');
  canvas.className = 'g-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Soccer match: you play the team in blue against the computer. The score and clock are in the bar above the pitch.');
  const stage = document.createElement('div');
  stage.className = 'g-stage';
  stage.append(canvas);
  const rotate = document.createElement('div');
  rotate.className = 'g-rotate';
  rotate.textContent = 'Turn your device sideways to play';
  rotate.hidden = true;
  root.append(stage, rotate);

  const renderer = createRenderer(canvas, { colors: board?.colors ?? null });
  const audio = createAudio({ muted: !settings.sound });
  const input = createInput(effectiveBindings(DEFAULT_BINDINGS, settings));
  const effects = createEffects(7);
  const replay = createReplay();
  const camera = createCamera();
  let view = renderer.resize(root.clientWidth || 800, root.clientHeight || 450);

  const session = { carry: null, tipsOpen: false, padPrev: {}, charge: 0, match: null, ai: null, mode: 'menu', time: 0, steps: 0, aiMap: {}, scorer: null, goalClock: 0, replayShown: false, replayClock: 0, replayFrames: null, accumulator: 0, over: false };
  let touch = null;

  const hud = createHud(root, { onPause: () => pause(), onMute: () => { settings.sound = !settings.sound; audio.setMuted(!settings.sound); saveSettings(storage, settings, ACTIONS); } });
  hud.setVisible(false);
  const tipsDone = () => { session.tipsOpen = false; settings.tipsSeen = true; saveSettings(storage, settings, ACTIONS); };
  const menus = createMenus(root, {
    settings,
    touch: isTouchDevice(),
    onStart: () => { audio.resume(); audio.play('select'); beginMatch(); },
    onResume: () => resume(),
    onRestart: () => beginMatch(),
    onExit: () => onExit(),
    onSettings: () => {
      audio.setMuted(!settings.sound);
      saveSettings(storage, settings, ACTIONS);
      if (touch) { touch.destroy(); touch = mountTouchControls(root, input, { scale: settings.touchScale, haptics: settings.haptics, onTipsDone: tipsDone }); if (!settings.tipsSeen) { touch.showTips(); session.tipsOpen = true; } } // size and vibration apply at once
    },
    bindings: () => effectiveBindings(DEFAULT_BINDINGS, settings),
    defaultBindings: DEFAULT_BINDINGS,
    onDifficulty: (level) => { if (session.match) session.ai = createAi(level); }, // takes effect at once, mid-match
    onBindings: (bindings) => {
      Object.assign(settings, withBindings(settings, DEFAULT_BINDINGS, bindings));
      saveSettings(storage, settings, ACTIONS);
      input.setBindings(effectiveBindings(DEFAULT_BINDINGS, settings));
    },
  });

  function beginMatch() {
    saveSettings(storage, settings, ACTIONS);
    session.match = createMatch({ seed: (Date.now() & 0xffff) || 1, halfSeconds: settings.halfMinutes * 60, humanTeam: 'home', homeFormation: board?.homeFormation, awayFormation: board?.awayFormation });
    session.ai = createAi({ home: 'normal', away: settings.difficulty }); // difficulty changes the opponent only, not your own teammates and keeper
    session.mode = 'playing';
    session.steps = 0;
    session.aiMap = {};
    session.over = false;
    session.scorer = null;
    session.accumulator = 0;
    clearReplay(replay);
    input.reset();
    snapCamera(camera, session.match.ball, view);
    menus.hide();
    hud.setVisible(true);
    if (isTouchDevice() && !touch) {
      touch = mountTouchControls(root, input, { scale: settings.touchScale, haptics: settings.haptics, onTipsDone: tipsDone });
      if (!settings.tipsSeen) { touch.showTips(); session.tipsOpen = true; }
    }
    root.dataset.gamePhase = 'playing';
    root.focus?.();
  }

  function pause() {
    if (session.mode !== 'playing') return;
    session.mode = 'paused';
    input.reset();
    root.dataset.gamePhase = 'paused';
    menus.showPause();
  }
  function resume() {
    if (session.mode !== 'paused') return;
    session.mode = 'playing';
    menus.hide();
    root.dataset.gamePhase = 'playing';
  }

  function handleEvents(match, events) {
    for (const event of events) {
      addFromEvent(effects, event, match);
      const sound = soundFor(event);
      if (sound) audio.play(sound);
      if (settings.haptics) {
        if (event.type === 'goal') globalThis.navigator?.vibrate?.([60, 40, 60]);
        else if (event.type === 'tackle' || event.type === 'foul') globalThis.navigator?.vibrate?.(15);
      }
      if (event.type === 'goal') { session.scorer = event.team; session.goalClock = 0; session.replayShown = false; }
    }
  }

  function stepOnce(frame, first) {
    const { match, ai } = session;
    if (session.steps % AI_EVERY === 0) session.aiMap = aiControls(match, ai, {});
    const controls = { ...session.aiMap };
    if (match.activeId) controls[match.activeId] = first ? frameToControl(frame, playerById(match, match.activeId)) : { move: frame.move, sprint: frame.sprint };
    stepMatch(match, controls);
    const before = match.activeId;
    autoSwitch(match);
    if (match.activeId !== before) { audio.play('blip'); if (settings.haptics) globalThis.navigator?.vibrate?.(10); } // the game changed your player: say so
    handleEvents(match, drainEvents(match));
    recordReplay(replay, match, MATCH.step);
    session.steps += 1;
  }

  function updatePlaying(dt) {
    const { match } = session;
    const active = playerById(match, match.activeId);
    const frame = mergeFrames(session.carry, input.sample(dt, active?.heading ?? 0, screenToWorldMove)); // the stick and keys are screen directions; the pitch is drawn squashed
    session.carry = null;
    if (frame.pause) { pause(); return; }
    if (frame.switch === 'cycle') cycleSwitch(match);
    else if (frame.switch) directionSwitch(match, frame.switch.dir);

    if (session.tipsOpen) { touch?.setCharge(0); return; }
    session.accumulator += dt;
    let first = true;
    while (session.accumulator >= MATCH.step) {
      stepOnce(frame, first);
      first = false;
      session.accumulator -= MATCH.step;
    }
    if (first) session.carry = { ...frame, switch: null, pause: false }; // no step ran on this frame (a screen faster than 120 Hz): keep its taps for the next one
    touch?.setCharge(frame.charge);
    // Show who a pass would go to right now (the same choice the pass makes), so a pass is never a surprise.
    session.preview = null;
    if (match.phase === 'play' && active && match.owner === active.id) session.preview = bestPassTarget(active, teamOf(match, active.team), frame.move, teamOf(match, opponentOf(active.team)))?.id ?? null;
    session.charge = frame.charge;

    if (match.phase === 'goal') {
      session.goalClock += dt;
      if (!session.replayShown && session.goalClock >= REPLAY_DELAY && replayFrames(replay).length > 20) {
        session.replayShown = true; // once per goal; a skipped or finished replay must not start again
        session.replayFrames = replayFrames(replay);
        session.replayClock = 0;
        session.mode = 'replay';
        root.dataset.gamePhase = 'replay';
      }
    }
    if (match.phase === 'fulltime' && !session.over) {
      session.over = true;
      session.mode = 'over';
      root.dataset.gamePhase = 'over';
      menus.showFullTime(match);
    }
  }

  function updateReplay(dt, frame) {
    session.replayClock += dt;
    if (frame.pause || frame.pass || frame.shoot || frame.switch || replayFrameAt(session.replayFrames, session.replayClock, 0.75) === null) {
      clearReplay(replay);
      session.replayFrames = null;
      session.mode = 'playing';
      root.dataset.gamePhase = 'playing';
    }
  }

  /** A gamepad in the menus: up/down (D-pad or stick) moves the focus, A presses, B goes back. */
  function padMenus() {
    const pad = Array.from(globalThis.navigator?.getGamepads?.() ?? []).find((p) => p?.connected);
    if (!pad || !menus.visible) { session.padPrev = {}; return; }
    const now = { up: Boolean(pad.buttons[12]?.pressed) || pad.axes[1] < -0.6, down: Boolean(pad.buttons[13]?.pressed) || pad.axes[1] > 0.6, a: Boolean(pad.buttons[0]?.pressed), b: Boolean(pad.buttons[1]?.pressed) };
    const edge = (key) => now[key] && !session.padPrev[key];
    if (edge('up')) menus.moveFocus(-1);
    if (edge('down')) menus.moveFocus(1);
    if (edge('a')) menus.activate();
    if (edge('b')) menus.back();
    session.padPrev = now;
  }

  function pollGamepad() {
    const pads = globalThis.navigator?.getGamepads?.() ?? [];
    const pad = Array.from(pads).find((p) => p?.connected);
    if (pad) input.gamepad(pad);
  }

  let last = performance.now();
  let rafId = 0;
  function loop(now) {
    rafId = requestAnimationFrame(loop);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    session.time += dt;
    pollGamepad();
    const touchRotated = !rotate.hidden;
    if (session.mode === 'playing' && !touchRotated) updatePlaying(dt);
    else if (session.mode === 'replay') updateReplay(dt, input.sample(dt));
    else {
      const idle = input.sample(dt); // keep edge events from piling up in menus
      if (session.mode === 'paused' && idle.pause) resume();
      padMenus();
    }

    const match = session.match;
    if (match) {
      const showing = session.mode === 'replay' ? replayFrameAt(session.replayFrames, session.replayClock, 0.75) : null;
      const model = showing ? { ...showing, ball: showing.ball, players: showing.players, activeId: showing.activeId, passTarget: null } : match;
      if (session.mode !== 'paused' && session.mode !== 'over') { addFromMotion(effects, match, dt); }
      stepEffects(effects, dt);
      // At a restart the taker stands on the line under the HUD: frame the spot a little further in.
      const camModel = model.phase === 'restart' ? { ...model, ball: { ...model.ball, x: model.ball.x * 0.88, y: model.ball.y * 0.86 } } : model;
      stepCamera(camera, cameraTarget(camModel, camera, view), dt, view, Math.hypot(model.ball.vx, model.ball.vy));
      renderer.draw({ match: model, camera, view, effects, time: session.time, celebrating: match.phase === 'goal' ? session.scorer : null, aim: session.mode === 'playing', passPreview: session.mode === 'playing' ? session.preview : null });
      hud.update({ match, charge: session.mode === 'playing' ? (session.charge ?? 0) : 0, replaying: session.mode === 'replay', muted: !settings.sound, showRadar: settings.radar });
      root.dataset.score = `${match.score.home}-${match.score.away}`;
      root.dataset.restart = match.phase === 'restart' && match.restart ? `${match.restart.type}:${match.restart.team}` : ''; // for the capture script
      const mine = playerById(match, match.activeId);
      if (mine) root.dataset.activeAt = `${mine.x.toFixed(2)},${mine.y.toFixed(2)}`; // for the capture script
    } else {
      // Behind the title screen: a quiet empty pitch.
      const idle = createMatch({ seed: 1 });
      renderer.draw({ match: idle, camera, view, effects: null, time: session.time, celebrating: null, aim: false });
    }
  }

  const heldKeys = new Map();
  function onKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    audio.resume();
    if (menus.handleKey(event)) { event.preventDefault(); return; }
    if (session.mode === 'menu' || session.mode === 'over' || menus.visible) {
      if (event.code === 'Escape' && menus.back()) event.preventDefault(); // Esc is always one level back
      else if (event.code === 'ArrowDown' || event.code === 'ArrowUp') { menus.moveFocus(event.code === 'ArrowDown' ? 1 : -1); event.preventDefault(); }
      return;
    }
    // OS auto-repeat sends more keydowns for a key already held; counting them would leave the key stuck after one keyup.
    if (heldKeys.has(event.code)) { if (heldKeys.get(event.code)) event.preventDefault(); return; }
    const bound = input.keyDown(event.code);
    heldKeys.set(event.code, bound);
    if (bound) event.preventDefault();
  }
  function onKeyUp(event) { heldKeys.delete(event.code); if (input.keyUp(event.code)) event.preventDefault(); }
  function onBlur() { heldKeys.clear(); input.reset(); if (session.mode === 'playing') pause(); }
  function onVisibility() { if (document.hidden) onBlur(); }

  const observer = new ResizeObserver(() => {
    view = renderer.resize(root.clientWidth || 800, root.clientHeight || 450);
    rotate.hidden = !(isTouchDevice() && view.width < 700 && view.height > view.width);
    if (session.match) snapCamera(camera, session.match.ball, view);
  });
  observer.observe(root);
  rotate.hidden = !(isTouchDevice() && view.width < 700 && view.height > view.width);

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  // A finger on a device that counted as a laptop (a touchscreen laptop): bring up the on-screen pad quietly, no choice to make.
  root.addEventListener('pointerdown', (event) => {
    audio.resume();
    if (event.pointerType === 'touch' && !touch && session.mode === 'playing') touch = mountTouchControls(root, input, { scale: settings.touchScale, haptics: settings.haptics, onTipsDone: tipsDone });
  }, { passive: true });
  root.tabIndex = -1;

  menus.showTitle();
  rafId = requestAnimationFrame(loop);

  return {
    session,
    stop() {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      touch?.destroy();
      hud.destroy();
      audio.dispose();
      renderer.dispose();
      root.replaceChildren();
      root.hidden = true;
      delete root.dataset.gamePhase;
      delete root.dataset.score;
    },
  };
}
