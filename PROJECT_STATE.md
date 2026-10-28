# Project state — handoff entry point

Last updated: 2026-10-28
Branch: `main` · application version: **1.0.4** · persistence schema: `1`
Status: field-coaching integration implemented; 219 local tests, syntax and rendered-browser checks pass. Production deployment verification is pending.

## Resume here

The app is a single-coach U9 7v7 tactical board on GitHub Pages: https://aahplexx.github.io/soccer/. After the concurrent per-player bench release 1.0.3 at `a1a05c9`, version 1.0.4 integrates preparation, small-sided participants, teaching snapshots, drill briefs, a field clock, controlled CPU stepping, annotations and print/PDF. Read [COACH_WORKFLOWS.md](./COACH_WORKFLOWS.md) for the actual user flows and limitations.

The local release passed `npm test` (219/219), runtime syntax and app-shell/deployment-integrity checks, plus rendered tablet/compact interactions. Verify the corresponding GitHub validation and Pages deployment before calling it live. After release, next priorities are physical-iPad field testing and the remaining 3D editing/camera gaps; do not infer touch/offline/performance from desktop Chromium or CI.

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
- 2D zoom/pan; lazy vendored Three.js 3D scene with orbit, zoom, pan and four camera presets. 3D shows diagrams, run/pass/route arrows and optional pass-option lines as well as participants and props. Ball visibility is protected through occluders and a carried ball is displayed beside its carrier without changing physics. Editing is still in 2D.
- Offline app shell, native manifest, versioned Update/Cancel prompt. Each Pages deployment has an isolated cache/build identity. The version begins at 1.0.0 and **each significant update increments patch by one**; `package.json` and `APP_VERSION` in `sw.js` must match. Current release is 1.0.4. No collaboration features.

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

## Verification for this work unit

Work began on version 1.0.2 at `f6fcd98`, 201 automated tests; integrated the concurrent 1.0.3 bench release at `a1a05c9` before publishing. Focused new tests cover bench/keeper exclusion, all-benched behavior, snapshot detachment and normalization, sequence bounds/order, briefs/bench undo and backup round trips, real elapsed clock, equipment protection, roster retention, route erasure, loose-ball recovery and 3D annotations/pass lines.

Rendered Chromium so far: 1024×768 and 390×844 brief/save/reload, 3v3 participant counts, two captured steps, previous/next, one-second stepping, clock start/pause, update loaded preset and print preparation; multi-page PDF produced locally. Route draw→erase→Undo and 3D visibility pass without page errors. Responsive page-overflow checks include 768×1024. Final local suite: **219 tests, 219 pass, 0 fail**; syntax and diff checks pass. Additional Chromium checks covered opt-in roster reuse across a built-in load, new-drill roster preservation, duplicate/confirmed clear/Undo for props, persistent start/reset, route draw/erase/Undo and 3D annotation display. No page errors were observed. Production evidence is pending deployment.

## Stable requirement ledger

Earlier FND-001..039 evidence and original COACH/CAM decisions are archived in [docs/PROJECT_STATE_through_1.0.2.md](./docs/PROJECT_STATE_through_1.0.2.md); its statuses are historical.

- COACH-001 Undo/Redo: done.
- COACH-002 Bench/return editor and return chips: shipped in 1.0.3; roster-wide and small-sided shortcuts added in 1.0.4.
- COACH-003 Print/PDF: done in 1.0.4, with optional multi-page snapshots.
- COACH-004 Teaching notes: done in 1.0.4; stored with the board/preset and captured steps.
- COACH-005 Flip attack direction: deferred; the home team still attacks toward increasing x. 3D orbit offers alternate viewing angles but does not change tactical direction.
- COACH-006 Reuse roster: done in 1.0.4 as opt-in names/numbers/colors retention when loading; no external team database.
- COACH-007 Dedicated half-field preset: deferred; existing 2D zoom/pan and 3D camera can frame areas manually.
- COACH-008 Controlled stepping: done as exactly one simulated second; not one whole AI decision.
- COACH-009 Duplicate/clear props: done in 1.0.4, protected main ball and reversible clear.
- COACH-010 Drill timer: original rejection superseded by owner's broader real-world coaching integration request; done in 1.0.4.
- COACH-011 Scoreboard: deferred; no match scoring/standings UI.
- COACH-012 Authored practice/teaching sequence: done in 1.0.4, up to 12 snapshots with own briefs.
- COACH-013 Persistent starting setup and update named drill: done in 1.0.4.
- COACH-014 Route arrows and individual erase: done in 1.0.4.
- CAM-001/002/003/007 zoom/perspective/presets/fallback: implemented. CAM-005 annotations/pass options in 3D: implemented in 1.0.4. CAM-004 3D editing and CAM-006 follow cameras remain unimplemented.

## Known limits and next work

1. Physical iPad 2018 baseline: no verified 60 fps, outdoor readability, Safari/Home Screen offline/update lifecycle or touch ergonomics. Test on device before changing these statuses.
2. CPU is a simplified teaching model, not full referee logic: no fouls, complete offside adjudication, detailed restart distances or mini-goal scoring. Written notes, cones, extra balls and arrows do not command the engine. Use snapshots for exact sequences.
3. 3D is a viewing surface; editing remains in 2D. Dedicated half-field presets, view reversal and follow cameras are future work.
4. Player editor is a centered dialog, not a player-adjacent popover. Team colors remain native selects rather than swatches. Some inherited token/control hit targets still need physical-device review.
5. Captured sequences are limited to 12; time remaining is not restored after reload, and printing relies on the browser's print/PDF support. Local-only browser storage is not cross-device sync. Back up files before clearing site data.
6. No accounts, invites, chat, remote database, concurrent editing or collaboration will be added within this request.

## Repository rules

- `main` is authoritative. Fetch and preserve concurrent changes before every write/push; never force-push over others.
- Only the two approved preset formations; normalized coordinates independent of rendering size.
- Never persist running simulation or timer state. Respect primary-ball travel, legal restarts, build-out precedence and immutable built-ins.
- Bump app patch version for significant updates and keep worker/package versions equal. Add all new static modules to `APP_SHELL` and ensure the Pages artifact contains them.
- Keep README, PRD, ARCHITECTURE and this handoff current with behavior and verification evidence. Distinguish automated, rendered-browser and physical-device evidence.
