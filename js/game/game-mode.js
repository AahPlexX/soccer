import { aiControls, createAi } from './ai.js';
import { createAudio, soundFor } from './audio.js';
import { cameraTarget, createCamera, snapCamera, stepCamera } from './camera.js';
import { addFromEvent, addFromMotion, createEffects, stepEffects } from './effects.js';
import { createHud } from './hud.js';
import { ACTIONS, DEFAULT_BINDINGS, createInput, frameToControl } from './input-map.js';
import { MATCH, createMatch, drainEvents, playerById, stepMatch } from './match.js';
import { createMenus } from './menus.js';
import { clearReplay, createReplay, recordReplay, replayFrameAt, replayFrames } from './replay.js';
import { createRenderer } from './renderer.js';
import { effectiveBindings, loadSettings, saveSettings } from './settings.js';
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

  const session = { charge: 0, match: null, ai: null, mode: 'menu', time: 0, steps: 0, aiMap: {}, scorer: null, goalClock: 0, replayClock: 0, replayFrames: null, accumulator: 0, over: false };
  let touch = null;

  const hud = createHud(root, { onPause: () => pause(), onMute: () => { settings.sound = !settings.sound; audio.setMuted(!settings.sound); saveSettings(storage, settings, ACTIONS); } });
  hud.setVisible(false);
  const menus = createMenus(root, {
    settings,
    onStart: () => { audio.resume(); audio.play('select'); beginMatch(); },
    onResume: () => resume(),
    onRestart: () => beginMatch(),
    onExit: () => onExit(),
    onSettings: () => saveSettings(storage, settings, ACTIONS),
  });

  function beginMatch() {
    saveSettings(storage, settings, ACTIONS);
    session.match = createMatch({ seed: (Date.now() & 0xffff) || 1, halfSeconds: settings.halfMinutes * 60, humanTeam: 'home', homeFormation: board?.homeFormation, awayFormation: board?.awayFormation });
    session.ai = createAi(settings.difficulty);
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
    if (isTouchDevice() && !touch) touch = mountTouchControls(root, input, { scale: settings.touchScale, haptics: settings.haptics });
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
      if (event.type === 'goal') { session.scorer = event.team; session.goalClock = 0; }
    }
  }

  function stepOnce(frame, first) {
    const { match, ai } = session;
    if (session.steps % AI_EVERY === 0) session.aiMap = aiControls(match, ai, {});
    const controls = { ...session.aiMap };
    if (match.activeId) controls[match.activeId] = first ? frameToControl(frame) : { move: frame.move, sprint: frame.sprint };
    stepMatch(match, controls);
    autoSwitch(match);
    handleEvents(match, drainEvents(match));
    recordReplay(replay, match, MATCH.step);
    session.steps += 1;
  }

  function updatePlaying(dt) {
    const { match } = session;
    const active = playerById(match, match.activeId);
    const frame = input.sample(dt, active?.heading ?? 0);
    if (frame.pause) { pause(); return; }
    if (frame.switch === 'cycle') cycleSwitch(match);
    else if (frame.switch) directionSwitch(match, frame.switch.dir);

    session.accumulator += dt;
    let first = true;
    while (session.accumulator >= MATCH.step) {
      stepOnce(frame, first);
      first = false;
      session.accumulator -= MATCH.step;
    }
    touch?.setCharge(frame.charge);
    session.charge = frame.charge;

    if (match.phase === 'goal') {
      session.goalClock += dt;
      if (session.goalClock >= REPLAY_DELAY && replayFrames(replay).length > 20) {
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
    else input.sample(dt); // keep edge events from piling up in menus

    const match = session.match;
    if (match) {
      const showing = session.mode === 'replay' ? replayFrameAt(session.replayFrames, session.replayClock, 0.75) : null;
      const model = showing ? { ...showing, ball: showing.ball, players: showing.players, activeId: showing.activeId, passTarget: null } : match;
      if (session.mode !== 'paused' && session.mode !== 'over') { addFromMotion(effects, match, dt); }
      stepEffects(effects, dt);
      stepCamera(camera, cameraTarget(model, camera, view), dt, view, Math.hypot(model.ball.vx, model.ball.vy));
      renderer.draw({ match: model, camera, view, effects, time: session.time, celebrating: match.phase === 'goal' ? session.scorer : null, aim: session.mode === 'playing' });
      hud.update({ match, charge: session.mode === 'playing' ? (session.charge ?? 0) : 0, replaying: session.mode === 'replay', muted: !settings.sound, showRadar: settings.radar });
      root.dataset.score = `${match.score.home}-${match.score.away}`;
    } else {
      // Behind the title screen: a quiet empty pitch.
      const idle = createMatch({ seed: 1 });
      renderer.draw({ match: idle, camera, view, effects: null, time: session.time, celebrating: null, aim: false });
    }
  }

  function onKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    audio.resume();
    if (session.mode === 'menu' || session.mode === 'over' || menus.visible) {
      if (event.code === 'Escape' && session.mode === 'paused') { resume(); event.preventDefault(); }
      else if (event.code === 'Escape' && session.mode === 'menu') onExit();
      return;
    }
    if (event.repeat) { if (input.keyDown(event.code)) event.preventDefault(); return; }
    if (input.keyDown(event.code)) event.preventDefault();
  }
  function onKeyUp(event) { if (input.keyUp(event.code)) event.preventDefault(); }
  function onBlur() { input.reset(); if (session.mode === 'playing') pause(); }
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
  root.addEventListener('pointerdown', () => audio.resume(), { passive: true });
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
