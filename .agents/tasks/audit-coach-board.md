# Coach's Board audit (fresh-eyes, read-only)

Scope: tactics board only (formations, drawing, plays/teaching steps, library, pass options, 2D/3D view, history, storage, PWA). Read: `js/*.js` (non-game), `index.html`, the four CSS files, `sw.js`, `manifest.webmanifest`, `tests/` (non-game). No source was modified.

## Summary

For a coach, the board is a capable 7v7 positional whiteboard that works offline and autosaves. The biggest problems are not crashes but workflow traps that quietly discard setup work, and a narrow feature scope.

1. **High: "Reset setup" returns to the formation (or the last Save/Load), not to the layout the coach dragged.** Pressing Play and then Reset throws away the coach's custom starting positions and any hand-drawn arrows.
2. **High: scope is fixed to U9 7v7 on one pitch size.** There is no way to run 5v5, 9v9 or 11v11, no custom formations, no text labels, and no image export or share.
3. **Medium: several actions overwrite the board without warning** (Teaching-step Next/Previous, Library Load, Import). Undo is the only recovery and the toasts mostly do not say so.
4. **Medium: the backup import silently overwrites same-id library items, and a future schema bump would silently reset the board.**
5. **Medium: undo history is polluted** by every zone-opacity slider tick, and by invisible junk drawings.
6. **Medium: small text and tokens on phones, and no keyboard shortcuts for the tools.**

Verification run: `node --test` on the 48 non-game test files gives 294 passing and 2 failing out of 296. Both failures (`tests/ball-physics.test.mjs`, `tests/properties.test.mjs`) are `ERR_MODULE_NOT_FOUND: fast-check` because `node_modules` is not installed. They are environment failures, not logic failures. `npm run lint` and `npm run typecheck` could not run for the same reason (`@eslint/js` missing). `scripts/capture.cjs` needs Playwright with a browser, which is not installed here, so no screenshots were taken. All UI findings below come from reading code, not from observing the running UI. Items marked "(verify)" are the ones most worth confirming in a browser.

---

## Findings

Format: **[severity] Title**, location, what is wrong for a coach, suggested fix.

### A. Data loss and surprise-overwrite risks

**A1. [high] Reset does not go back to the coach's own setup.**
Location: `js/app.js:800-805` (`resetBoard` handler), `setResetSnapshot` calls at `app.js` (formation apply, `replaceBoard`, save), `js/coaching-ui.js` `set-start` button (hidden inside Coach workspace).
Problem: the baseline is only refreshed when a formation is applied, a preset is loaded or saved, or the coach finds "Use current board as starting setup" in the Coach workspace dialog. Dragging players into a drill layout does not update it. Flow: arrange players, draw run arrows, press Play, press Reset. Players snap back to the formation and the hand-drawn arrows disappear (only `source === 'action'` arrows survive, `board-actions.js` `resetBoardState`). The toast says "Board reset to the starting position", which the coach will read as their own setup.
Fix: capture an automatic "pre-Play" snapshot when Play (or Step) starts from a paused edit state, and Reset to that. Keep the explicit "Set start" as an override, and surface it as a visible button next to Reset. Keep hand-drawn drawings on reset or ask.

**A2. [med] Teaching-step Previous/Next, Load step and Library Load replace the board with no unsaved-changes warning.**
Location: `js/coaching-ui.js:29-35` (`go`), `js/app.js:937` (`loadIntoBoard`), `app.js:1011+` (import).
Problem: an edit made after the last "Capture step" is lost when the coach taps → during a session. Undo recovers it, but only `Import` and `Reset` toasts mention Undo. A coach pressing → mid-explanation on a phone can lose a layout.
Fix: when the current board differs from the loaded step/preset, offer "Replace step snapshot / Discard / Cancel", or auto-update the current step. At minimum add "Undo brings it back" to those toasts.

**A3. [med] Backup import silently overwrites library items with the same id and ignores `updatedAt`.**
Location: `js/storage.js:290-315` (`importBackup` calls `storePreset` for each preset unconditionally).
Problem: restoring an older backup replaces newer on-device versions of the same preset with no comparison and no prompt. Presets are also written one at a time, so a failure mid-import leaves a partly merged library.
Fix: skip or ask when the existing copy is newer; write all presets in one IndexedDB transaction; show "N added, M updated, K skipped".

**A4. [med] A schema bump would silently wipe the user's autosave and library views.**
Location: `js/state.js:234` (`normalizeState` returns a fresh board when `schemaVersion !== SCHEMA_VERSION`), `js/storage.js` `validBackupState` rejects any other version, `app.js` startup calls `saveAutosave(state)` immediately after load.
Problem: there is no migration path. Today `SCHEMA_VERSION = 1`, so it is dormant, but the first schema change overwrites the old autosave on first launch and makes all older backups unimportable. Also, a corrupt autosave string returns `null` (`loadAutosave` catch) and is then overwritten on startup, so a coach cannot salvage it.
Fix: add `migrate(version → version+1)` steps; keep the raw previous autosave under a `…_prev` key before overwriting.

**A5. [med] "Save" always creates a new library item.**
Location: `index.html` `#save-as` ("Save"), `js/app.js:891-935`; the overwrite action `coach-save-existing` is only inside Coach workspace → Drill brief.
Problem: pressing Save five times while refining a play makes five near-identical items ("Positions" by default, empty title required each time). Coaches expect Save to update the thing they loaded.
Fix: if the board came from a user preset, make the top-bar button "Save" (update) with "Save as copy" beside it. Prefill the title with the loaded preset title.

**A6. [low] Autosave is debounced 120 ms and not flushed on page hide.**
Location: `js/app.js:94,168-171`. No `pagehide`/`visibilitychange` flush. An iOS app switch within 120 ms of the last edit loses it. Fix: flush in `pagehide` and `visibilitychange`.

**A7. [low] Storage errors are misleading.**
Location: `js/storage.js` `fallbackWrite`. A full localStorage (quota) reports "browser storage is unavailable". Autosave of a 12-step sequence is about 45 KB (measured), so large libraries on the localStorage fallback can hit the limit. Fix: distinguish `QuotaExceededError`.

**A8. [low] Undo restores the board but drops "who has the ball".**
Location: `js/app.js:274-288` (`stepHistory` resets `carrierId`, `receiverId`, ball velocity), `js/history.js` `EDIT_KEYS` excludes `simulation`. After "Give ball" then any other edit then Undo, possession is cleared and pass options show "Ball is loose". Fix: include `simulation.carrierId`/`possessionTeam` in the history snapshot.

### B. Usability and workflow

**B1. [med] The zone-opacity slider creates one undo step per tick.**
Location: `js/app.js:576` (`input` event → `commitChange`), `js/history.js` `EDIT_KEYS` includes `zoneOpacity`. Dragging the slider across its range pushes about 7 steps and with the 200-step limit can evict real edits. Fix: commit on `change`, or exclude view-style keys (`zoneOpacity`, `zoneColor`, `coneColor`) from history.

**B2. [med] Invisible, unerasable junk drawings.**
Location: `js/app.js:618-640` (`handleToolPointerDown` pushes the new drawing immediately), `js/render.js` `buildDrawing` (a 1-point arrow/run falls through to a freehand path with no visible stroke), `js/coaching.js:93-104` (`eraseDrawingNear` needs at least 2 points), `js/state.js` `normalizeDrawings` keeps drawings with `points.length > 0` (verified by running a probe: a 1-point arrow is kept and cannot be erased). A tap with an arrow tool adds an undo step, a hidden object and file bloat. Fix: drop drawings with fewer than 2 points (or fewer than 2 distinct points) in `finishPointer`, and in `normalizeDrawings` for arrow types.

**B3. [med] The Erase tool can delete a script arrow while its play task survives.**
Location: `js/coaching.js:93` iterates all drawings including `source: 'action'`. The arrow disappears but the queued pass/run still executes on Play, so the board no longer explains what will happen. Fix: erase the matching script task too, or protect action arrows from the eraser like props.

**B4. [med] Fixed to one game format.**
Location: `js/constants.js` (`FORMATION_NAMES` has 4 shapes, `PITCH_METERS` 60×40.8 yd), `js/state.js` `PLAYERS_PER_TEAM = 7`, `js/storage.js`, `index.html` ("U9 Tactical Board", "7V7"). A coach of U11/U13/adult (9v9, 11v11), 5v5, or futsal cannot use it. Small-sided is limited to 3v3/4v4 by benching (`coaching.js:84`, `setSmallSided`). There are no custom formations, no adding a player, and no pitch-size selection. Fix (large): parameterise team size and pitch; at minimum add 5v5, 9v9, 11v11 presets and a "save my formation" action.

**B5. [med] The core annotations a coach reaches for are missing.**
No text labels or notes on the pitch, no shapes (circle, rectangle, grid areas for rondos), no dribble/zig-zag arrow, no measuring tool, no offside line (the built-in "U9 offside visualizer" in `js/builtins.js` only highlights a zone; it draws no offside line). Drawings do not attach to players, so moving a player leaves the arrow behind. Fix: add a text tool, a rectangle/circle area tool, an optional offside-line overlay, and "attach arrow to player".

**B6. [med] No image export or share.**
Location: `js/coaching-ui.js` print flow is the only output (`window.print()`, via "Print / Save PDF" in Coach workspace → Setup & equipment actions). There is no PNG, no Web Share, no copy to clipboard. On a phone, the usual need is "send this play to the group chat". Backup JSON export is not shareable with players. Fix: add "Save image / Share" using canvas or `navigator.share` with a rendered SVG→PNG.

**B7. [med] Teaching steps do not animate and are capped at 12.**
Location: `js/coaching.js` (`MAX_TEACHING_STEPS = 12`), `coaching-ui.js` `go`. Next/Previous jump instantly; there is no tween between snapshots, so a coach cannot show a play unfolding without using the CPU simulation (which does not follow their drawings; see the in-app note "arrows illustrate intent and do not command the CPU"). Fix: interpolate player/ball positions between consecutive steps.

**B8. [low] The CPU simulation is the main way to "play" a setup, but it is opaque and can contradict the coach's plan.**
Location: `js/simulation.js`, UI note in `index.html` (teaching steps panel). Only pass/run/shoot script tasks (max 24 stages, 4 tasks per stage, `js/play-script.js`) are scripted; opponents cannot be scripted. A coach demonstrating "if they press, we switch" cannot control the opponent. Fix: allow opponent runs in the script, and a "freeze opponents" toggle.

**B9. [low] Drill clock stops silently and has no alert.**
Location: `js/coaching-ui.js:16-24,166`. At 0:00 only text changes (the button shows "Clock finished"); no sound or vibration. Pressing → on teaching steps calls `resetClock()` (`go`), which pauses a running clock mid-drill. Fix: optional beep/vibrate at zero; do not reset the clock on step change unless the step has its own minutes.

**B10. [low] Hidden behaviours and naming.**
- Tapping the active tool again silently returns to Move (`app.js` tool button handler). "Pass arrow" / "Run arrow" / "Route arrow" are not explained next to the buttons.
- "Reset setup" appears in two places; "Coach workspace" holds Save-over, print, set-start, small-sided and the clock; important actions are buried (see A1, A5).
- "Tools" drawer on narrow screens hides all tools behind a button (`board-surface.js` `setPanel`).
Fix: rename "Coach workspace" to something task-like; promote Save/Update, Set start, Print to the main bar.

**B11. [low] Jersey numbers can be duplicated within a team.**
Location: `js/board-actions.js` `updatePlayerDetails` only checks 1–99 integer. Two #7s are accepted, and the bench chips ("Return #7 …") become ambiguous. Fix: warn on duplicate numbers per team.

**B12. [low] Library has no search, no preview, no duplicate/reorder.**
Location: `js/app.js:960-999` (`refreshSavedList`), `js/library-ui.js`. Rows show title, category and date only. With 30+ plays a coach cannot find or preview one without loading it (and loading replaces the board, see A2). Fix: thumbnail (render the SVG to a small image), search box, "Duplicate".

**B13. [low] Settings that reset every launch.**
Pass options toggle (`js/pass-options-ui.js`, `dataset.passOptions = 'false'`) and the Library filter (`savedFilter`) and zoom (`view`) are not remembered. A coach who always uses pass options must re-enable each time.

### C. Correctness and interaction bugs

**C1. [med] Freehand strokes have unbounded point counts and re-render the whole scene every pointer move.**
Location: `js/app.js:668-678` (`pointermove` while drawing calls `rebuildObjects(svg, state)` which recreates all 14 players, hit targets, balls, props and every drawing), `js/state.js`. Each stroke stores a point per `pointermove` with no simplification (a 600-point stroke adds about 17 KB per snapshot, measured), and every snapshot is copied into the undo stack (`history.js`, up to 200) and the autosave. On a low-end tablet this makes drawing laggy and can drop focus from the player tokens mid-stroke. Fix: update only the active drawing's path element; thin points by distance (for example 0.004 in normalized units) before storing.

**C2. [low] Any mouse button draws.**
Location: `js/app.js` svg `pointerdown` (`handleToolPointerDown`, `handleObjectPointerDown`) never checks `event.button`. A right-click or middle-click with a drawing tool starts a stroke or drags a player. Fix: ignore `event.button !== 0` for mouse pointers.

**C3. [low] Zoomed-in drawing cannot be panned with one pointer.**
Location: `js/app.js:~305` (`pointerdown` capture): one-pointer pan only works when `state.tool === 'move'`. With a draw tool active and zoomed in, a mouse user has no way to pan except switching tools (touch users can two-finger pan). Fix: Space-drag or middle-drag pan.

**C4. [low] Eraser reach does not scale with zoom or device.**
Location: `js/coaching.js:93` uses a fixed 0.03 normalized distance and a literal `0.68` instead of `PITCH_ASPECT` (`js/geometry.js`). On a phone-sized pitch 0.03 is about 12 px, hard to hit; zoomed in it is the same board distance. Fix: derive the threshold from the screen size and zoom.

**C5. [low] Tokens' ARIA labels promise things that do not work.**
Location: `js/render.js` `buildBall`/`buildCone`/`buildMiniGoal` say "Enter to edit", but `app.js` keydown only opens the editor for `data-object-type === 'player'`. Fix: correct the labels.

**C6. [low] Layer-order risk: oversized player hit targets sit below props.** `js/render.js` (`#hit-layer` before `#prop-layer`). By design, but a cone placed on a player's token steals the tap and the coach cannot pick the player without moving the cone. Fix: select the closest of overlapping objects, or offer a long-press menu.

### D. Accessibility

**D1. [med] Text and tokens are small on phones.** `styles.css`/`board-ui.css` set most controls to 12 px (`.tool-grid button`, `.board-hint`, `.selection-actions button`, `.simulation-group button`, `.teaching-strip`). On the SVG, jersey numbers are 22 units and labels 15 units on a 1000-unit pitch (`styles.css:219-220`), which is about 8 px and 6 px on a 390 px-wide phone in landscape. Hard to read at a distance or in sun (verify). Fix: scale labels with pitch size, raise control text to at least 14 px, add a "large tokens" option.

**D2. [low] Team distinction relies on color.** Home/away tokens differ only by fill (`js/formations.js` `playerColor`). Defaults are blue vs red and yellow vs neon-green keepers; with the color override a coach can make teams indistinguishable, and red/green are an issue for color-blind users. Fix: an outline/shape cue for the opponent team (a ring or a dashed halo).

**D3. [low] Information only in `title` attributes** (for example the "Pass options" explanation, the Undo/Redo shortcuts, Flip direction). Not available on touch or for many screen-reader users. Fix: visible helper text or `aria-describedby`.

**D4. [low] Toasts last 2.6 s regardless of length.** `js/app.js:94-95,173`. Messages such as "Board reset to the starting position. Undo brings your last setup back." are about 70 characters, and a toast cannot be re-read. Fix: duration proportional to length, plus a notification history, or a persistent "Undo" action on the toast.

**D5. [low] No keyboard shortcuts for tools or Play.** Only Ctrl/Cmd+Z/Y and Esc exist (`app.js:~250`, `board-surface.js` Escape handler). Desktop coaches would expect single-key tools (`M`, `D`, `A`, `R`, `E`) and Space for play/pause. Fix: add them with a visible cheat sheet.

### E. Mobile and touch

**E1. [med] Controls are in horizontally scrolling rows.** `styles.css:~376-385` makes `.simulation-group`, `.tool-group`, `.view-group` `nowrap` with `overflow-x: auto` in landscape, and `.top-rail` scrolls too. On a phone, Play/Step/Reset/Pass options and the drill clock can sit off-screen with no scroll affordance (verify on a 390×800 and an 800×390 viewport). Fix: wrap, or collapse into a menu with the most-used actions (Play, Reset, Undo) pinned.

**E2. [low] Scroll and gesture conflicts.** The pitch uses `touch-action: none` (`styles.css:194`) and `wheel` handler `preventDefault()` (`app.js`), so desktop users cannot scroll the page by wheel over the pitch, and on a phone the board consumes all swipes. Acceptable for a board; ensure there is always some area outside the pitch to scroll. Low priority.

**E3. [low] Export on iOS standalone.** `app.js:1001-1017` downloads via a synthetic `<a download>` click; in an installed iOS Home Screen app this often fails silently or opens the file. There is no share-sheet fallback. Fix: use `navigator.share({ files })` where available.

### F. PWA and offline

**F1. [med] The service-worker precache is a hand-maintained list and is all-or-nothing.**
Location: `sw.js:4-12` (`APP_SHELL`) and `cache.addAll`. One 404 anywhere in that list (for example a renamed file) fails the whole install, so the coach never gets an offline copy and nothing tells them. The list includes the vendored Three.js bundles, which makes first install heavy for a board that most coaches use in 2D. A test (`tests/pwa-shell.test.mjs`) guards the list, which helps, but not at runtime. Fix: precache the 2D essentials as required and the 3D vendor files as best-effort; generate the list at build time.

**F2. [low] Cache-first fetch with no navigation preload or stale indicator.** `sw.js:35-41`. Updates arrive only through a new cache name (version or build id), and `setupUpdates` prompts. This works, but if `BUILD_ID` is not replaced on deploy, an updated file with the same version never reaches users. Fix: assert `BUILD_ID !== 'development'` in the deploy workflow.

**F3. [low] Manifest.** `manifest.webmanifest`: one icon entry per size with `purpose: "any maskable"`; maskable icons need a safe zone and should be separate entries, otherwise Android crops the artwork. No `id`, `lang`, `categories` or shortcuts. Fix: supply separate maskable icons; add `id` and shortcuts ("New board", "Library").

**F4. [low] The update dialog can wait behind open dialogs** (`js/update.js` `offer`/`pending`). Reasonable, but a coach who leaves the Library open all session never sees an update. Low.

### G. Performance

**G1. [low] Undo snapshots serialise the entire `coaching` object including all teaching steps and the start board on every commit.** `js/history.js:8` (`read` = `JSON.stringify` of all `EDIT_KEYS`). Measured: about 45 KB with 12 steps and a start board, times up to 200 undo entries is roughly 9–12 MB of strings, plus `JSON.stringify` on each commit. The 50-commit loop took 14 ms in Node, so it is fine on desktop and likely acceptable on phones; memory grows with long sessions. Fix: store diffs, or keep the steps out of the undo snapshot.

**G2. [low] The animation loop re-queries the DOM by id for every object each frame** (`js/render.js` `renderScene`: `svg.querySelector('#object-…')` for about 16 objects at 60 fps) and keeps rendering the hidden 2D scene while the 3D view is open (`app.js` `animationLoop`, `setView3D`). Minor; cache element references.

**G3. [low] `coaching-ui.js` runs `setInterval(tick, 250)` forever** (`:166`) even when the clock is idle. Negligible, but it wakes the CPU on mobile. Fix: start only while running.

### H. Code quality

**H1. [med] `js/app.js` (about 1130 lines) is a single module with top-level DOM lookups and event wiring; most of it cannot be unit-tested.** Several features are reached by globals or custom DOM events rather than explicit interfaces: `render.js` keeps `latestPassOptionSvg/State` module globals and listens for a `pass-options-change` document event; `pass-options-ui.js` injects its button into `.simulation-group` at import time; `library-ui.js` augments rows built by `app.js` through a `MutationObserver` and "insert before last child must remain Delete" (a comment in `app.js` documents this fragility). Each pass re-reads the library from IndexedDB a second time. Fix: have `app.js` render the Edit button itself; pass state explicitly.

**H2. [low] Dense one-line style in `coaching-ui.js` and `coaching.js`** (multiple statements per line, `row.children[3]` index lookups for aria-labels at `coaching-ui.js:44-45`) is hard to review and easy to break. Fix: split and name the elements.

**H3. [low] Duplicated option lists.** Formation names live in `constants.js` and again as `<option>`s in `index.html` (both selects); the palette is duplicated as `<option>`s in the player dialog. Adding a formation requires edits in three places. Fix: build options from the constants.

**H4. [low] `index.html` is machine-formatted** (stray `class=""` attributes, `hidden=""`, odd indentation, text nodes between tags), which makes diffs noisy. Cosmetic.

**H5. [low] Naming baked into storage.** Keys and DB name are `u9_tactical_board_*`; the export `product` field is `AahPlexX/soccer`. Renaming the product later forces a migration. Fix: decouple storage keys from branding now.

**H6. [low] Tests and tooling.** 296 non-game tests exist and are strong on pure logic (state, storage, history, simulation). There are almost no DOM/integration tests for `app.js` flows (reset baseline, step navigation, import overwrite), which is where the high-severity issues above sit. Add tests for A1, A2, A3, B2, B3. `npm test` needs `npm ci` first (two property-test files fail without `fast-check`).

---

## Conclusions and recommended order of work

1. **Fix the trust-breaking behaviours first:** A1 (Reset baseline), A2 (step/load overwrite), A3 (import overwrite), A5 (Save updates the loaded item), A8 (undo keeps possession). Each is small and testable in Node via `board-actions.js` / `history.js` / `storage.js`.
2. **Then clean the drawing pipeline:** B2 (drop degenerate drawings), B3 (eraser vs script), C1 (incremental stroke render and point thinning), B1 (slider history).
3. **Then accessibility and mobile polish:** D1, E1, D2, D4, D5, F3.
4. **Then feature gaps** in the order a coach would feel them: image/share export (B6), text and shape annotations (B5), other formats and custom formations (B4), animated steps (B7), library search/preview (B12).
5. **Engineering hygiene:** F1 (SW install resilience), H1 (decouple `app.js`, library, pass options), H3 (single source for option lists), and add DOM-level tests for the flows above.

Unverified items (need a browser pass): D1 pixel sizes, E1 off-screen controls, E3 iOS export, C6 tap-steal. All other findings were confirmed by reading the cited code; B2, G1 and A4 were additionally confirmed by running small probes against `js/state.js`, `js/coaching.js` and `js/history.js`.
