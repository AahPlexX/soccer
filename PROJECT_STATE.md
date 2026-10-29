# Project state — handoff entry point

Last updated: 2026-10-28
Branch: `main` · application version: **1.0.11** · persistence schema: `1`
Status: 1.0.6 released; 228 tests, runtime syntax, responsive/interaction Chromium checks, CI and GitHub Pages deployment passed.

## Resume here

The app is a single-coach U9 7v7 tactical board on GitHub Pages: https://aahplexx.github.io/soccer/. After the concurrent per-player bench release 1.0.3 at `a1a05c9`, version 1.0.4 integrates preparation, small-sided participants, teaching snapshots, drill briefs, a field clock, controlled CPU stepping, annotations and print/PDF. Version 1.0.6 adds the redesigned tool rail/drawer, contextual selection actions, rigid unit movement, quick possession/snapshot setup, presentation lock and opt-in 3D object dragging. Read [COACH_WORKFLOWS.md](./COACH_WORKFLOWS.md) for the actual user flows and limitations.

Concurrent release `e1fa605` added ground-plane 3D dragging in 1.0.5 while this workspace was in progress. This 1.0.6 integration preserves the picking/conversion helpers and tests, and refines editing with mesh picking, opt-in mode, contextual actions and collision settlement.

Previous release implementation `c1305db` passed [Validate main](https://github.com/AahPlexX/soccer/actions/runs/40776203794) and [Pages deployment](https://github.com/AahPlexX/soccer/actions/runs/40776203853). A fresh Chromium session on the hosted app verified the coaching flow without page errors. Check later workflow runs for any subsequent documentation or implementation commits. Next priorities are physical-iPad field testing, dedicated half-field framing and follow-camera gaps; do not infer touch/offline/performance from desktop Chromium or CI.

## Current implemented behavior

- Only 1-3-2-1 and 1-2-3-1 preset shapes, independently assigned. Reapply buttons preserve custom identities. Player discs cannot overlap; corner crowding is resolved. Manual placement, keyboard nudges and Undo/Redo work in 2D.
- Touch/keyboard board, player/goalkeeper palettes, individual numbers/names/colors, cones, mini goals and extra balls. Solid pass arrows, dashed run arrows, freehand and route arrows; erase one drawing, duplicate/remove a prop, and confirmed clear-all-props. These edits support Undo.
- Zones with union-based optional keep-in/keep-out constraints; mandatory build-out and restarts take precedence.
- CPU passing, dribbling, pressing/contact turnovers, deterministic varied shots, keeper tracking/catch/parry, simplified offside support, explicit restarts, and good-spacing/bunching modes. Play/Pause and one-second advancement, reset to a persistent starting snapshot. A pass whose receiver has moved away becomes a collectable loose ball.
- Individual bench and return, 3v3/4v4 shortcuts without keepers, and per-team restore/bench. Benched players remain in the roster and saved data but are excluded from simulation, collisions, offside calculations, saves and pass-option lanes. All-benched play stays paused. Hidden opponents remain participants unless benched.
- Coach workspace: objective, setup, instructions, questions/cues, progression and duration. Up to 12 named, ordered teaching/practice snapshots capture independent board states plus brief. Previous/Next loads paused snapshots; this is authored teaching, not animated CPU choreography. Replace/reorder/rename/remove steps; persistent start snapshot; optional reuse of names/numbers/colors across loaded setups. New drill preserves roster metadata.
- Real-time drill clock, independent of simulation speed; pause/reset/completion and background elapsed time. Runtime countdown is not persisted or automatically advanced and has no audio alarm.
- Four built-ins now include coaching briefs. User presets save all coaching fields, bench flags, starting snapshot and steps; update a loaded user preset or save a new copy. Built-ins are immutable. Backups include the complete content.
- Print or browser Save as PDF for current diagram/brief, or a captured multi-page plan. Print is local and uses the full 2D diagram even when viewing 3D.
- 2D zoom/pan; lazy vendored Three.js 3D scene with orbit, zoom, pan and four camera presets. 3D shows diagrams, run/pass/route arrows and optional pass-option lines as well as participants and props. Ball visibility is protected through occluders and a carried ball is displayed beside its carrier without changing physics. Ground-plane object editing is opt-in in 3D; drawing and unit selection stay in 2D.
- Offline app shell, native manifest, versioned Update/Cancel prompt. Each Pages deployment has an isolated cache/build identity. The version begins at 1.0.0 and **each significant update increments patch by one**; `package.json` and `APP_VERSION` in `sw.js` must match. Current release is 1.0.11. No collaboration features.

## Workspace integration — 1.0.6

- A quiet light/forest interface gives the pitch priority. Wide screens have a left tool rail; tablet/phone screens use a focus-managed drawer. Playback and teaching controls are compact and the selected-object strip occupies a stable reserved region, so it cannot move the pitch during a drag. Dark and Field themes remain supported.
- Select unit supports pointer and Enter/Space selection, rigid group dragging and arrow nudges. Nearby players yield; selected members share field limits and anchors update. Single-tap actions include Edit, Give ball (paused setup), bench, duplicate/remove, nudge and Capture step. Enter still opens the player editor from Move mode.
- Present hides edit chrome and blocks manual/keyboard edits while allowing deliberate simulation, clock, snapshot and view controls. Escape exits.
- Edit in 3D raycasts visible players/balls/props, moves them on the ground, pauses play and commits through the same board model. Camera-only mode is default; right/Shift-drag, two fingers and background drag manipulate the camera. Selecting a drawing, placement or unit tool switches back to 2D.
- Modules: `board-ui.css` is the final visual layer, `js/board-surface.js` owns surface controls and view-only selection feedback, `js/board-interactions.js` holds testable group translation/possession setup. All are in the app shell and deploy artifact.
- Local tests: **228/228 pass**. Chromium verified unit drag, possession, quick capture, presentation lock and actual 3D dragging, plus keyboard/drawer/Escape/reduced-motion/long-title and no page overflow at 320, 390, 683, 768, 1024 and 1366 CSS px. Themes were visually inspected. Actual browser zoom, screen-reader operation and physical iPad touch/performance are not certified by these checks. Release `8a5fd8f` passed [Validate main](https://github.com/AahPlexX/soccer/actions/runs/40784096632) and [Pages deployment](https://github.com/AahPlexX/soccer/actions/runs/40784096672). Fresh hosted Chromium sessions repeated unit drag, Give ball, capture, presentation lock, actual 3D editing and 3D→drawing switching, plus 3v3 roster, two-step teaching plan, print/PDF preparation, clock, save/reload and 3D playback with no page errors. The deployed worker reports 1.0.6 and build `8a5fd8f2c41d51a7c72008dadbe3688ca0af16b3-40784096672-1`.
- 1.0.8 usability fixes from coach feedback: a labelled bench tray with Return all; pressing an active tool again or Escape returns to Move; cone, mini goal and ball placement now works in 3D (tap the ground) instead of dropping back to 2D; the View theme (Turf, Dark, Field mode) restyles the pitch in 2D and the whole 3D scene (`THEME_COLORS`, `--pitch-a/--pitch-b`); clearer labels: Step 1 sec, Reset view, Zone rule and Pass options tooltips.
- 1.0.11 audit fixes and solo actions: a real-browser audit at 1280x800, 1024x768, 768x1024 and 390x844 found no console errors or page overflow, a working keyboard nudge, Escape put-down and 3D start. It did find text under 11px (eyebrows, board hints, selection detail), a thick accent side border on the selection bar, cramped selection-bar padding and 29px-wide step buttons, all fixed in board-ui.css (11px floor, uniform border, 10px/12px padding, 44px minimum width). Contrast measured clean in Turf, Dark and Field mode, so the hook's low-contrast finding is unreproduced. One selected player now also gets solo actions (Shoot at goal, Run forward, Track back) toward the goal that team attacks (\`soloDrawing\`, \`applySoloAction\`).
- 1.0.10 player action steps: Shift-click (laptop) or the Select unit tool (touch) selects two players; the selection bar's Player action button opens a dialog (Pass, Receive from, Run to, Pass and follow, Swap places, plus Swap order) and the chosen action is drawn as ordinary pass/run arrows in the current drawing color and size (js/player-actions.js, unit-tested). They are annotations: one Undo removes them, they print, save and show in 3D, and they do not command the CPU simulation. Rendered-browser smoke check at 1280x800: Shift-select, dialog, drawn pass with style, dark theme variable, bench tray and return, tool put-down; no page errors.
- 1.0.9 customization: zone color (`state.zoneColor`, 2D `--zone-color`, 3D overlay color) and drawing style (`state.drawColor/drawWidth` stamped onto each new drawing as optional `color`/`width`; per-color SVG arrowhead markers; 3D uses the color, not the width). Unstyled legacy drawings keep the original look.

## Modules and storage

- `js/app.js`: app state, DOM glue, history, autosave, scene, reset baseline, library/load/save and update setup.
- `js/coaching.js`: bounded brief normalization, nonrecursive board captures, snapshots, roster/bench helpers, equipment actions, eraser and injected-clock model. No DOM.
- `js/coaching-ui.js`: Coach workspace, roster list, brief application, sequences, timer, start/reset actions and print pages. Receives app callbacks rather than owning another live board.
- `js/state.js`: defaults and normalization; missing coaching fields in old saves gain safe defaults. `player.benched` is a validated boolean. Snapshot boards exclude coaching entirely to prevent recursive sequence/start snapshots.
- `js/simulation.js`: only active players participate; the public step temporarily presents the active roster to the existing engine and restores the complete roster in `finally`. No participants stops play. `js/pass-options.js` uses the same active-player definition.
- `js/history.js`: coaching content and participant edits are reversible; live clock state is outside history. `js/board-actions.js` settles only on-pitch players.
- `js/board-scene.js`: pure Three.js scene with injected textures; 3D drawings reconcile by ID/signature and six pass lines are reused across frames. `js/view3d.js` supplies the view-only pass-option toggle state.
- `js/storage.js`: normalized detached snapshots, IndexedDB with localStorage fallback/tombstones, validated backup merging and surfaced failures. Schema remains 1. New brief/steps survive through existing state serialization without a separate database.
- `sw.js` and `.github/workflows/pages.yml`: full native module graph and vendor assets cached and published; build stamp uses SHA/run/attempt. Update acceptance saves before reload; unavailable storage requires explicit continuation without saving. Pre-1.0 clients needed a one-time close-all-tabs transition.

## Verification for the 1.0.4 foundation

Work began on version 1.0.2 at `f6fcd98`, 201 automated tests; integrated the concurrent 1.0.3 bench release at `a1a05c9` before publishing. Focused new tests cover bench/keeper exclusion, all-benched behavior, snapshot detachment and normalization, sequence bounds/order, briefs/bench undo and backup round trips, real elapsed clock, equipment protection, roster retention, route erasure, loose-ball recovery and 3D annotations/pass lines.

Rendered Chromium so far: 1024×768 and 390×844 brief/save/reload, 3v3 participant counts, two captured steps, previous/next, one-second stepping, clock start/pause, update loaded preset and print preparation; multi-page PDF produced locally. Route draw→erase→Undo and 3D visibility pass without page errors. Responsive page-overflow checks include 768×1024. Final local suite: **219 tests, 219 pass, 0 fail**; syntax and diff checks pass. Additional Chromium checks covered opt-in roster reuse across a built-in load, new-drill roster preservation, duplicate/confirmed clear/Undo for props, persistent start/reset, route draw/erase/Undo and 3D annotation display. No page errors were observed. Hosted Chromium repeated the 3v3 bench, two-step capture, print preparation, clock, update-existing/save/reload and 3D checks successfully after deployment. The generated practice PDF had two landscape pages. The live worker reported version 1.0.4 with the deployment build stamp.

## Stable requirement ledger

Earlier FND-001..039 evidence and original COACH/CAM decisions are archived in [docs/PROJECT_STATE_through_1.0.2.md](./docs/PROJECT_STATE_through_1.0.2.md); its statuses are historical.

- COACH-001 Undo/Redo: done.
- COACH-002 Bench/return editor and return chips: shipped in 1.0.3; roster-wide and small-sided shortcuts added in 1.0.4.
- COACH-003 Print/PDF: done in 1.0.4, with optional multi-page snapshots.
- COACH-004 Teaching notes: done in 1.0.4; stored with the board/preset and captured steps.
- COACH-005 Flip attack direction: deferred; the home team still attacks toward increasing x. 3D orbit offers alternate viewing angles but does not change tactical direction.
- COACH-006 Reuse roster: done in 1.0.4 as opt-in names/numbers/colors retention when loading; no external team database.
- COACH-007 Half-field framing: done in 1.0.7 for the 3D view as "Our half" and "Their half" camera presets (home attacks toward +x, so its half is at -x); the 2D board still frames halves manually with zoom/pan.
- COACH-008 Controlled stepping: done as exactly one simulated second; not one whole AI decision.
- COACH-009 Duplicate/clear props: done in 1.0.4, protected main ball and reversible clear.
- COACH-010 Drill timer: original rejection superseded by owner's broader real-world coaching integration request; done in 1.0.4.
- COACH-011 Scoreboard: deferred; no match scoring/standings UI.
- COACH-012 Authored practice/teaching sequence: done in 1.0.4, up to 12 snapshots with own briefs.
- COACH-013 Persistent starting setup and update named drill: done in 1.0.4.
- COACH-014 Route arrows and individual erase: done in 1.0.4.
- CAM-001/002/003/007 zoom/perspective/presets/fallback: implemented. CAM-005 annotations/pass options in 3D: implemented in 1.0.4. CAM-004 opt-in ground-plane object editing is implemented in 1.0.6; CAM-006 follow cameras remain unimplemented.
- BOARD-001 Rigid multi-object unit selection/movement: implemented in 1.0.6.
- BOARD-002 Quick possession setup and contextual actions: implemented in 1.0.6.
- COACH-015 Presentation lock and uncluttered workspace: implemented in 1.0.6.

## Known limits and next work

1. Physical iPad 2018 baseline: no verified 60 fps, outdoor readability, Safari/Home Screen offline/update lifecycle or touch ergonomics. Test on device before changing these statuses.
2. CPU is a simplified teaching model, not full referee logic: no fouls, complete offside adjudication, detailed restart distances or mini-goal scoring. Written notes, cones, extra balls and arrows do not command the engine. Use snapshots for exact sequences.
3. 3D can move objects, but drawing, placement and group selection use 2D. View reversal and follow cameras are future work.
4. Tapping selects a contextual action strip; details use a centered dialog. Team colors remain native selects rather than swatches. Some inherited token/control hit targets still need physical-device review.
5. Captured sequences are limited to 12; time remaining is not restored after reload, and printing relies on the browser's print/PDF support. Local-only browser storage is not cross-device sync. Back up files before clearing site data.
6. No accounts, invites, chat, remote database, concurrent editing or collaboration will be added within this request.

## Repository rules

- `main` is authoritative. Fetch and preserve concurrent changes before every write/push; never force-push over others.
- Only the two approved preset formations; normalized coordinates independent of rendering size.
- Never persist running simulation or timer state. Respect primary-ball travel, legal restarts, build-out precedence and immutable built-ins.
- Bump app patch version for significant updates and keep worker/package versions equal. Add all new static modules to `APP_SHELL` and ensure the Pages artifact contains them.
- Keep README, PRD, ARCHITECTURE and this handoff current with behavior and verification evidence. Distinguish automated, rendered-browser and physical-device evidence.
