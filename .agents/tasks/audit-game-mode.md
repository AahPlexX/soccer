# Game Mode audit (fresh-player review)

Scope: the playable match game in `js/game/` plus `docs/GAME_MODE.md` and the launch wiring (`index.html` toggle, `#game-root`). The Coach's Board, PROJECT_STATE.md and earlier audits were not opened. No source was modified.

## Summary

Game Mode has a solid simulation core (deterministic fixed-step engine, layered AI, 94 game tests). One defect makes the keyboard unplayable on real hardware, and several others change how the game feels or hide controls. The top findings:

1. **High: holding any key leaves it stuck "down" after release.** `game-mode.js:281` feeds OS auto-repeat `keydown` events into `input.keyDown`, which increments a hold counter that `keyUp` decrements only once. A held arrow key or sprint runs on forever. A shot held past about 0.5 s never fires.
2. **High (by CSS stacking, unverified in a browser): on touch the pause and mute buttons are likely covered** by the touch joystick zone, so a phone player has no pause button.
3. **High: the Kids difficulty does not persist.** It is offered in the menu, but `normalizeSettings` drops it and reloads as Normal.
4. **Med/High: difficulty changes both teams.** On Easy and Kids your own teammates and your own goalkeeper get worse too, so the game is not clearly easier for the human.
5. **Med: a goal can trigger up to three replays**, because `goalClock` is never reset after a replay ends or is skipped (by code reading).
6. **Med: mashing the stand-tackle button wins the ball** most of the time (measured below), and manual player switching is overridden after 0.4 s when defending.

## How this was checked

- Read every file in `js/game/` (except the sprite rig and pose tables) and `game.css`.
- `node --test tests/game-*.test.mjs`: 86 of 94 tests pass. The 8 failing test files fail only with `ERR_MODULE_NOT_FOUND: fast-check`, because `node_modules` is not installed. That is environmental, not a code failure. `npm ci` would fix it.
- No browser or Playwright is installed, so `scripts/capture-game.cjs` could not run and nothing was played live. Findings marked "unverified" come from code and CSS reading.
- Small headless simulations were run against the pure modules (`/tmp/sim1..5.mjs`, not added to the repo). Results are quoted where used.

## Findings

Severity: high = breaks play or a core feature; med = clearly hurts feel, fairness or access; low = polish or maintainability.

### A. Controls and input

**A1. HIGH. Stuck keys from auto-repeat.**
- Location: `js/game/game-mode.js:281` (`if (event.repeat) { if (input.keyDown(event.code)) ... }`) with `input-map.js` `press()`/`release()`, which use a counter (`held[action] += 1` / `-= 1`).
- Situation: hold ArrowRight or Shift for about half a second, then release.
- Problem: each auto-repeat `keydown` calls `press()` again and raises the counter, but one `keyup` lowers it by one. Reproduced headless: after 20 repeat events and one `keyUp`, `isHeld('right')` is `true` and `sample().move` is `{x:1,y:0}`. The player keeps running or sprinting until the player pauses or the window blurs (`input.reset()`).
- Same cause breaks shooting: holding shoot past the OS repeat delay (about 0.5 s; the full charge takes 0.8 s) means release never reaches counter 0, so the shot never fires and the meter keeps filling. Pass-hold and auto-lob are affected after 0.5 s.
- Why it was missed: Playwright `keyboard.down` sends no repeat events (capture script), and the input tests call `keyDown` once.
- Fix: in the repeat branch only call `preventDefault()` when the code is bound; never call `input.keyDown`. Better, track held codes in a `Set` per action so a duplicate press is idempotent. Add a test that sends N repeat presses and one release.

**A2. MED. Pass fires on key release.** `input-map.js:164`. Every ground pass waits for release (about 80 to 150 ms for a tap). Combined with A3 this makes passing feel laggy compared with press-to-pass. Fix: fire a short pass on press unless the button is still down after a lob threshold, or fire on press and upgrade to a lob with a separate modifier.

**A3. MED. No input buffer.** A pass, shot or tackle tapped just before the ball arrives (or just after a restart whistle) is discarded because only the owner consumes `control.pass` (`match.js` `applyOwnerActions`). Fix: keep a pass/shoot request for about 120 ms and apply it when the player gains the ball.

**A4. MED. Manual player switch is overridden when defending.** `switching.js:45-52`: `manualHold` is checked only when your team has the ball. Defending, the auto rule takes the active player back after `autoLockout` (0.4 s) whenever another teammate is more than 2 m nearer the ball. Reproduced: manual pick of the farthest player with a loose ball was reversed at 0.40 s. Fix: apply `manualHold` (1.5 s) to the defending branch too.

**A5. MED. The human can never control the goalkeeper in defence.** `switchCandidates` excludes the keeper. The documented "Goalkeeper: dive: Tackle with left or right held" (`menus.js` controls list, `frameToControl`, `input-map.js:199`) can only run when the keeper holds the ball after a catch or goal kick, when a dive is pointless. The Controls screen advertises an unreachable feature. Fix: either allow switching to the keeper when the ball is in the box and a shot is incoming, or remove the dive line from Controls.

**A6. LOW/MED. Gamepad.** `input-map.js:124`: `state.stick = read.stick` is overwritten every frame while any pad is connected, so a pad connected beside a touch screen (or drifting) cancels the touch joystick. `readGamepad` ignores the D-pad (buttons 12 to 15) for movement. `pollGamepad` takes the first connected pad without checking `pad.mapping === 'standard'`. No rumble. Fix: use D-pad as movement, check the mapping, and only let the pad override `stick` when it is outside the dead zone.

**A7. LOW. Default key layout is awkward.** Movement on arrows (right hand) and actions on J/K/L/I (also right hand) conflict; WASD plus J/K/L is the usable pair, and `switchDir` is on U. Key labels (`keyLabel`) show physical QWERTY letters; AZERTY or Dvorak users see "W" for the key labelled Z. Rebinding an action replaces all its keys with one (`settings.js` `rebind`), so a player who rebinds "up" loses the arrow/WASD pair. Fix: show `KeyboardEvent.key` via `navigator.keyboard.getLayoutMap()` when available; let rebinding add a key instead of replacing.

**A8. LOW. Tab is bound to Switch** (`DEFAULT_BINDINGS.switch: ['Tab','KeyQ']`). `preventDefault` on Tab during play takes away normal keyboard navigation. Keep Q only, or ship Tab off by default.

### B. Rules and match flow

**B1. MED. Replay can run up to three times per goal (by code reading, not run in a browser).**
- Location: `game-mode.js:186-196` and `updateReplay`.
- Mechanism: `goalClock` is set to 0 only on the goal event. The replay starts at 1.4 s. When it finishes or is skipped, `clearReplay` empties the buffer but `goalClock` stays above 1.4 s, and the match goal phase still has about 1.6 s left. `recordReplay` keeps adding a frame every 1/30 s of match time, so after 21 frames (0.7 s) the condition `goalClock >= 1.4 && frames > 20` is true again and a second, celebration-only replay starts. A third can follow.
- Player impact: skipping the replay brings it back; the banner flickers REPLAY / GOAL.
- Fix: add a `session.replayShown` flag set when a replay starts and cleared on the next `goal` event.

**B2. MED. Fouls inside the penalty area get an ordinary free kick** (`match.js` foul branch; docs say "no penalties" by design). Defenders can slide in their own box with no extra cost. Also opponents only retreat 3 m at a free kick (`setRestart`), so free kicks are just passes under pressure. Fix: at least a 5 to 6 m exclusion for free kicks and corners; consider a penalty for fouls in the box for older kids.

**B3. MED. Stand-tackle spam is a strong strategy.** `ball-control.js` `tackleContact` takes the ball whenever it is within 0.9 m and in front, with no chance of failure, and a stand tackle has no cooldown or foul risk (`startTackle`: only blocks while an action is active, 0.3 s). Headless test: a human sprinting at an AI carrier and pressing stand tackle continuously regained the ball in 22/30 trials at Normal and 18/30 at Hard within 6 s (0/30 at Kids, where the carrier ran away). Fix: add a 0.6 to 1.0 s cooldown after a stand tackle that touches nothing, and make the success depend on the carrier's facing and speed.

**B4. LOW/MED. Dribbling has no risk.** `carryBall` glues the ball to the owner by a stiff spring; the ball can only be lost by a tackle, so holding sprint toward goal beats the player's own skill. Combined with B3, play reduces to run-and-tackle. Consider letting a sharp turn or a body-block loosen the ball.

**B5. LOW. Sides are not swapped at half time**, and the half-time pause is a fixed 3 s with a banner only (`stepMatch` halftime case). Draws end the match with no extra time or shoot-out (documented). Acceptable for a short game; mention in the full-time screen.

**B6. LOW. Time-up with a restart pending.** The clock only ticks in `tickPlay`, so a throw-in or free kick awarded at 0:00 is taken and the half ends on the first play tick afterward. Players lose the chance to use it without being told. Fix: end the half when the whistle for the restart is blown, or show "last play".

**B7. LOW. "GOAL!" is shown for the opponent's goal with the same jingle, confetti, white flash and vibration** (`handleEvents`, `bannerFor`). It never says who scored. Fix: "GOAL! (CPU)", a gentler sound and no confetti for goals against the human.

### C. AI quality and difficulty

**C1. MED/HIGH. Difficulty affects both teams.** `game-mode.js:102` `createAi(settings.difficulty)` with a string sets both `profiles.home` and `profiles.away` to the same profile (`ai.js:35-38`); `aiControls` applies `speedScale`, pass noise, shot error, keeper skill and tackle chance to every non-active player. On Kids/Easy your teammates run at 0.7 to 0.82 speed, pass badly, and your keeper has keeper skill 0.1 to 0.3 (errors up to about ±4 m). On Hard they all improve. So the setting changes the shape of the match more than the human's odds. Fix: use `createAi({ home: 'normal', away: level })` (keeping a separate fixed profile for your side).

**C2. LOW/MED. AI uses the same reaction for both teams and has no stamina or foul awareness.** AI sprint draws stamina like the human (good), but the AI tackles with fixed probabilities and never reasons about the 1.6 s slide cooldown. Hard has `speed: 1`, equal to the human's walk and run; the human's sprint (6.8) is faster only while stamina lasts.

**C3. LOW. AI one-shot controls repeat for up to six steps.** `aiMap` persists for `AI_EVERY` = 6 steps (`game-mode.js:150-153`), so `pass`, `shoot` or `tackle` flags are re-sent. Harmless today because the owner changes after the first step, but it is a trap for anyone adding a stateful one-shot action. Fix: drop one-shot keys from `aiMap` after the first step.

**C4. LOW. After a manual switch, the newly-AI player has no AI control for up to 50 ms** (no `aiMap` entry until the next 20 Hz tick), so `defaultControl` (the placeholder "drift to formation") runs briefly.

### D. Touch and mobile

**D1. HIGH (unverified in a browser). Pause and mute buttons are likely unreachable by touch.** `.g-hud` has no `z-index` (`game.css`), the touch layer `.g-touch` has `z-index: 2`, and `.g-zone-left` is `left:0; width:45%; top:0; bottom:0; pointer-events:auto`. The pause/mute buttons sit top-left inside that zone. Pointer events on them go to the joystick zone, which sets pointer capture and calls `preventDefault`. Touch players have no other pause (no Esc, blur only). Verify with `document.elementFromPoint` over the II button on a touch device. Fix: give `.g-buttons` `z-index: 3` with `pointer-events:auto`, or inset the zones.

**D2. MED. `isTouchDevice()` is true on any device with `ontouchstart`** (`touch-controls.js:22`), including touch laptops. They get the touch overlay, the touch-only Controls screen and no "Change keys" entry (`menus.js` `touch ? ... : showKeys`). Fix: use only `(pointer: coarse)` and `(any-pointer: coarse)` with `(hover: none)`; or show both help blocks.

**D3. MED. Changing any setting rebuilds the touch controls and can re-open the tips card.** `onSettings` (`game-mode.js:84-88`) destroys and re-mounts the touch layer each time, and re-shows tips if `tipsSeen` is false; a mid-match difficulty change from the pause menu can show the "match waits" card under the menu. Fix: only remount when `touchScale` or `haptics` changed, and never reopen tips from there.

**D4. LOW/MED. Touch tip text is tiny** (`.g-hint` 8 px, tips card 42% width). The rotate prompt shows only under 700 px wide portrait; a tablet in portrait gets a cramped view. The first-run card pauses the match until dismissed (good) but also auto-dismisses after 14 s without telling the player the match was waiting.

**D5. LOW. Swipe-to-switch** only works on empty right-hand area (`event.target !== swipeZone`), so a swipe that starts on a button is lost. A swipe must be under 0.35 s, which is tight for a thumb.

### E. Settings and persistence

**E1. HIGH. Kids difficulty is not saved.** `settings.js:19` `DIFFICULTY_KEYS = ['easy','normal','hard']`, while `ai.js` `DIFFICULTIES` and the menus offer `kids`. Verified: `normalizeSettings({difficulty:'kids'}).difficulty` is `'normal'`. For an app aimed at under-9s, the easiest level silently resets on every reload and after every Kick off (`beginMatch` saves, but the next `loadSettings` returns Normal). Fix: derive the allowed keys from `DIFFICULTIES` (single source of truth) and add a regression test.

**E2. LOW. Half length is limited to 1, 2 or 3 minutes**, no longer matches; other settings are fine. The key-binding map is stored with limits (4 codes per action) but the UI can only set one.

**E3. LOW. `saveSettings` failure is silent** (private mode). Show a one-line "Settings will not be remembered" note once.

### F. Camera, rendering and performance

**F1. MED (perf, measured in Node, not on device). Sprite cache misses cost about 3.5 ms each.** `drawPlayerFrame` (rig rasterizer) averaged 3.2 to 3.7 ms per sprite on this machine. The cache key includes `ppm` and the facing/frame; when dynamic zoom (`targetWidth`) crosses the 8% hysteresis, all 14 players re-render in one frame (about 50 ms on desktop, likely 150 to 250 ms on a mid phone), and facings/animation frames are filled lazily during play. Fix: pre-warm the cache for common facings and actions at match start, and render missed sprites over several frames (draw a fallback until ready).

**F2. LOW. Idle work.** The title screen builds a new `createMatch({seed:1})` every animation frame (`game-mode.js:267`); the loop keeps drawing the full scene while paused and in menus. Cache the idle match and stop drawing when paused (or drop to 10 fps).

**F3. LOW. Zoom pumping.** `targetWidth` widens up to the whole pitch when the active player is far from the ball, which shrinks sprites to the 14 px/m floor on phones. Consider keeping the active player larger and relying on the edge arrows.

**F4. LOW. Stamina flicker at the floor.** `player-physics.js`: sprint is refused below 0.05 and allowed immediately above it, so an empty-stamina sprint alternates every few frames. Add hysteresis (resume at 0.2).

### G. Accessibility

**G1. MED. Score is not announced** (`hud.js`: `aria-live="off"` on the scoreboard). The GOAL / HALF TIME / FULL TIME banner is polite-live, but the score and clock are not. Add a short live announcement of the goal ("Goal, you 1 - 0").

**G2. MED. Menus are not a modal dialog.** The panel has no `role="dialog"`/`aria-modal`, there is no focus trap and focus is not returned on close. `onKeyDown` lets Tab through, so keyboard users can tab out to whatever is behind the overlay (verify whether the coach page is `inert`).

**G3. LOW/MED. Colour only.** Teams are blue vs red (or coach colours via `board.colors`; two similar colours would be hard to tell apart and are not checked). No colour-blind palette or high-contrast option. The canvas `aria-label` says "you play the team in blue" even when custom colours are used.

**G4. LOW. Motion and flashes.** `prefers-reduced-motion` disables only the banner pop and power pulse; the goal full-screen flash, confetti and camera easing remain. No setting for camera shake (none) or text size; many HUD texts are 11 to 14 px.

**G5. LOW. `confirmButton` text change ("Tap again to confirm") is not announced** (no live region).

### H. Audio

**H1. LOW. All sound is synthesized with one master gain of 0.5 and no volume control**, only on/off. The goal jingle and whistle are loud and identical for both sides (see B7). No music or crowd; a hum of ambient noise would help the feel. Audio starts only after the first key/pointer (correct) but the gamepad does not call `audio.resume()`.

### I. Code quality

- **I1. MED. The DOM layer is untested.** `game-mode.js`, `renderer.js`, `hud.js`, `touch-controls.js`, `audio.js` have no unit tests (the docs say they are "checked by captures"). A1, B1, D1 and D3 all live there. Add jsdom/fake-DOM tests for `onKeyDown`, the replay state machine and the HUD/touch z-order, and make the capture script part of a documented manual checklist.
- **I2. LOW. Duplicated truth.** Difficulty keys (`settings.js` vs `ai.js`), charge time (`CONTROL.chargeSeconds` vs `INPUT.chargeSeconds`), and three copies of the `element()` DOM helper (`menus.js`, `hud.js`, `touch-controls.js`).
- **I3. LOW. `game-mode.js` is a 325-line closure** mixing loop, input, replay and mode state in one `session` object that is also returned (`session` exposure). A small state machine for `menu | playing | paused | replay | over` would remove cases like B1.
- **I4. LOW. Leftovers and magic numbers.** `defaultControl` is documented as "a placeholder until the AI drives them"; `humanTeam: 'none'` branches exist in the HUD only; `match.headerUntil` is not part of `createMatch`'s state shape; many tuning numbers sit inline in `match.js`, `ai-utility.js` and `ai-team.js`.
- **I5. LOW. Test environment.** `npm test` fails here until `npm ci` installs `fast-check`; `package.json` has no `pretest` check or README note for this.

## What works well (keep)

- Deterministic fixed-step engine with a seeded RNG; AI is layered (perception lag, roles with hysteresis, utility scoring, keeper states).
- Restarts wait for the human with a visible countdown and hint; pass-target preview ring; camera dead zone and edge arrows; screen-to-world move correction for the tilt.
- Settings are validated on load and never throw; menus are usable with keyboard and gamepad; restart and exit need confirmation.

## Recommended order of work

1. A1 stuck keys, E1 Kids persistence, D1 touch pause button (small, high impact).
2. C1 difficulty per team, A4 manual-switch hold, B1 replay loop, B3 tackle cooldown.
3. A2/A3 input feel (buffering, pass on press), D2/D3 touch fixes, G1/G2 accessibility.
4. F1 sprite pre-warming, F2 idle work, I1 tests for the DOM layer.
