# U9 Tactical Soccer Board

AahPlexX/soccer is an offline-capable 7v7 tactical board and teaching simulator for a single youth soccer coach. The product follows the requirements in [PRD.md](./PRD.md): two approved formations, selectable teaching zones, draggable players and ball, local persistence, telestration, and a CPU-vs-CPU teaching simulation.

## Version and updates

The official app version is **1.0.17**. Increment the patch version by one for every significant update, keeping `package.json` and `APP_VERSION` in `sw.js` in sync. Each Pages deployment produces a separately cached build. When a new build is ready, the app displays its version and lets the coach choose Update or Cancel; no release description is required. The previous pre-1.0 app cannot show this first prompt, so close all its tabs or standalone windows and reopen it to receive 1.0.0.

## Board workspace (1.0.6)

The pitch is central, with grouped setup and equipment controls in a left tool panel (a drawer on tablets/phones), a compact playback bar, and a contextual selection strip. Turf, Dark and Field modes use a consistent control palette. **Present** hides editing controls and prevents accidental moves while keeping playback, the clock and teaching steps available.

- Tap an object for actions. **Edit player** (or Enter) opens player details; **Give ball** pauses and places possession with that player.
- **Select unit** lets you tap or use Enter/Space to select multiple players/props, then drag them together or nudge with arrow keys. The group shares a boundary limit and surrounding players yield without collapsing the unit.
- **Edit in 3D** enables ground-plane dragging of players, balls and props; camera mode remains the default. Two fingers, right-drag or Shift-drag still move the camera. Drawing, placement and unit selection tools take you back to 2D.
- **Capture teaching step** is available directly below the board and in selection actions.

## Coach on the field

Open **Coach workspace** to prepare a drill brief, choose participants (including 3v3/4v4 or unopposed setups), capture an ordered teaching/practice sequence, set a persistent starting setup, update a saved drill, and print the board or a multi-page plan. The board has a real-time drill clock and Previous/Next snapshot controls. **Advance 1 second** pauses the CPU for controlled discussion.

Use **Route arrow** for an authored path, **Erase drawing** for one annotation, and Undo for corrections. Cones, mini goals and extra balls can be duplicated or cleared without deleting the match ball. 3D shows annotations and optional pass lanes and supports opt-in object dragging; drawing and unit selection remain in 2D. Written instructions, arrows and mini goals are teaching aids; the CPU uses simplified U9 rules and the main goals.

Read [COACH_WORKFLOWS.md](./COACH_WORKFLOWS.md) for preparation, rehearsal, field use, saving and PDF workflows. Everything remains on one coach's device; no collaboration features or accounts are included.

## Run locally

The application has no build step and needs no package installation; the optional Three.js renderer is vendored for offline use. Serve the repository root over HTTP because service workers do not run from `file://` URLs.

```bash
python -m http.server 8080
```

Open `http://localhost:8080/`.

Tests use the Node.js standard test runner:

```bash
npm test
```

## Validation

Every push to `main` runs `.github/workflows/validate.yml`. The workflow runs the behavior/integrity test suite and syntax-checks every runtime JavaScript module plus `sw.js`. The repository-integrity tests also verify that the service-worker app shell does not reference missing files and does not omit install-critical local assets or reachable static ES-module dependencies.

Version 1.0.6 passed 228 tests and runtime syntax checks in [GitHub Actions](https://github.com/AahPlexX/soccer/actions/runs/40784096632), followed by a successful [Pages deployment](https://github.com/AahPlexX/soccer/actions/runs/40784096672). Hosted Chromium verified group movement, possession, teaching steps, presentation lock, 3D editing, printing and save/reload without page errors. Check the [latest Actions run](https://github.com/AahPlexX/soccer/actions/workflows/validate.yml) for later commits. A green workflow proves only those automated checks. Physical-iPad touch behavior, standalone Home Screen behavior, offline use, outdoor readability, and the PRD's 2018-iPad 60 fps target require separate browser or real-device evidence before they can be marked verified.

## GitHub Pages

Deployment target: `https://aahplexx.github.io/soccer/`. On 2026-10-27 the Pages API reported a GitHub Actions publishing source, but no Pages deployment existed and the address returned HTTP 404. `.github/workflows/pages.yml` is configured to validate and deploy the static app on pushes to `main` or manual dispatch. On 2026-10-28 the [deployment workflow](https://github.com/AahPlexX/soccer/actions/runs/40610498638) succeeded, and the hosted board loaded in Chromium without page errors.

The repository is intentionally static. `index.html` loads native ES modules, and `sw.js` precaches the complete app shell for offline use after the first successful visit.

### Add to Home Screen on iPad

1. Open the GitHub Pages URL in Safari.
2. Use Share → Add to Home Screen.
3. Launch the saved app from the Home Screen for a standalone coaching workspace.

## Current feature set

- 7v7 pitch with halfway line, penalty areas, build-out lines, goals, center circle, penalty spots, and corner arcs.
- Independent 1-3-2-1 and 1-2-3-1 formations for both teams, with each starting in its own half. Use the ↺ button beside a team’s shape to reapply it; saved custom arrangements are preserved until changed. No other preset formations exist.
- Touch, pen, mouse, and keyboard player/ball movement through Pointer Events and keyboard nudging.
- Multi-select teaching zones with adjustable opacity; overlaps naturally emphasize intersections.
- Optional zone drill rules: keep Our team, Opponents, or Both teams inside or out of the currently selected zone union. Mandatory U9 build-out retreat and legal restart placement take precedence over optional drill constraints.
- Player number, label, individual color editing, and team/goalkeeper color palettes.
- Opponent visibility toggle, turf/dark/field themes, landscape and portrait pitch rendering.
- Freehand telestration, solid pass arrows, dashed run arrows, cones in selectable colors, mini goals, extra soccer balls, clear drawings, play/pause/reset, 0.5×/1×/2× simulation speed, and good-spacing/bunching teaching modes.
- Players are solid: the simulation, tackles, and coach drags or nudges never leave two players overlapping; a player you place stays put and others step aside.
- Undo and redo (toolbar buttons, Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z) for up to 50 board edits; moving a player, drawing, placing a prop, loading a play, or resetting is one step each.
- Zoom and pan the board (Zoom in, Zoom out, and Fit buttons, mouse wheel or trackpad pinch, two-finger pinch on iPad, one-finger pan when zoomed) from 1× to 4×.
- 3D view: switch the board to a live 3D camera (Top-down, Broadcast, Behind our goal, Sideline low, Our half, Their half presets; drag to rotate, scroll or pinch to zoom, two fingers to pan). It shows the same players, ball, cones, goals, and zones, and the simulation plays in it; edit in the 2D board. Needs WebGL; without it the app stays in 2D. Uses a vendored copy of Three.js (`vendor/three/`).
- CPU-vs-CPU passing (receivers with an opponent-blocked lane are skipped), deterministic close-range turnovers, an optional dashed pass-options overlay, dribbling movement, pressing, U9 build-out retreat, simplified offside support, and explicit automated throw-in, goal-kick, corner, and kickoff restart states, with players held in their own half until a post-goal kickoff is released.
- Deterministic varied shooting with goalkeeper movement toward incoming shots and catch/parry/goal outcomes; the fixed aim sequence keeps teaching replays reproducible instead of introducing random results.
- Four built-in teaching scenarios: goal-kick build-out, press the opponent build-out, U9 offside visualizer, and switching the field.
- Autosave within a 120 ms debounce, IndexedDB saved positions with localStorage fallback, category tabs over built-in and saved items, a title/category editor for saved presets, a two-step in-app delete confirmation, and JSON backup export/import.
- Offline app-shell caching and installable web-app manifest; versioned deployment caches include the complete app shell. Actual offline operation on iPad remains to be verified.

## Documentation

- [COACH_WORKFLOWS.md](./COACH_WORKFLOWS.md) — field workflow guide and product boundaries.
- [PRD.md](./PRD.md) — authoritative product requirements.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — current technical design and invariants.
- [PROJECT_STATE.md](./PROJECT_STATE.md) — live implementation status, verification evidence, known gaps, and next work.

Keep these files synchronized with code changes. `PROJECT_STATE.md` is the handoff entry point for continuation work.

Version 1.0.1 completes player separation at crowded pitch edges, including fixed restart takers.

Version 1.0.2 keeps the 3D ball visible during possession and behind other players; its display sits beside the carrier without changing the tactical ball coordinates.

Version 1.0.7 adds "Our half" and "Their half" 3D camera presets for half-field work (`targetX` in `CAMERA_PRESETS`, js/camera-orbit.js).

Version 1.0.8 fixes coach-reported gaps: a labelled bench tray, tools that can be put down (press again or Escape), equipment placement in 3D, and a View theme that restyles the pitch in 2D and 3D.

Version 1.0.9 adds zone color and drawing color and size controls (Drawing color and Line size under Board tools, Zone color under Zones).

Version 1.0.10 adds player action steps: select two players (Shift-click, or the Select unit tool on touch screens), press Player action, and choose Pass, Receive from, Run to, Pass and follow or Swap places to draw it as arrows.

Version 1.0.11 fixes legibility and spacing found in a multi-viewport audit (11px text floor, no accent side border, larger tap widths) and gives a single selected player run and shoot actions.

Version 1.0.12 makes player actions run in the simulation: each action is queued in a play script that the players carry out when you press Play, in the order you added them; Reset replays it and Clear script removes it.

Version 1.0.13 adds the optional Center Channel zone and quick-select color swatches for team, cone, zone and drawing colors.

Version 1.0.14 gives player tokens invisible 48px-plus hit areas on iPad-width screens (PRD 9.2) so taps near a token select it.

Version 1.0.15 adds a Follow ball camera for the 3D view and fixes the 3D goals, which were never drawn.

Version 1.0.16 turns the 3D Follow control into a menu (Off, Ball, Selected player), hides it outside 3D, and compacts the color swatches.

Version 1.0.17 adds a Frame menu (Whole pitch, Our half, Their half) that zooms the 2D board, or moves the 3D camera, to one half.
