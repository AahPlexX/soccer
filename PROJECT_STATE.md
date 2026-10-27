# Project state

Last updated: 2026-10-26
Branch: `main`
PRD status: in progress
Schema version: `1`

## Resume here

Current state: the repository has moved from PRD-only to a working static-board foundation with pitch rendering, the two required formations, touch/keyboard manipulation, selectable zones, player and team color editing, telestration, cones, mini goals, extra balls, all four built-in teaching scenarios, CPU-vs-CPU passing/dribbling/pressing/shooting, U9 build-out behavior, explicit throw-in/goal-kick/corner/kickoff restart states, persistence, JSON backup, PWA caching, and an automated validation gate on every push to `main`.

Next action: implement the remaining PRD coaching content and simulation completeness in this order: zone-restriction drills; richer saved-library category filtering/editing and an in-app delete confirmation replacing `confirm()`; richer pass-lane/goalkeeper behavior; real-device iPad performance/accessibility/offline verification.

Blockers: no source blocker. Real-device validation on the 2018 iPad baseline has not been executed in this repository session.

## Completed requirements in this work unit

- `FND-001` — Render the PRD pitch geometry from normalized coordinates. Status: implemented. Evidence: `js/constants.js`, `js/render.js`, `tests/geometry.test.mjs`.
- `FND-002` — Limit preset formations to 1-3-2-1 and 1-2-3-1 with independent team selection. Status: implemented and unit-tested. Evidence: `js/formations.js`, `tests/formations.test.mjs`.
- `FND-003` — Support touch/pen/mouse dragging plus a non-drag positioning alternative. Status: implemented. Evidence: `js/app.js`, player editor nudge controls, keyboard arrow handling.
- `FND-004` — Support all eight required selectable zones with multi-select and one-tap clear. Status: implemented. Evidence: `js/constants.js`, `index.html`, `js/app.js`, `js/render.js`.
- `FND-005` — Support custom player number, label, individual color, and team/goalkeeper palettes. Status: implemented. Evidence: `index.html`, `js/app.js`, `js/formations.js`.
- `FND-006` — Provide play/pause/reset, 0.5×/1×/2× speed, good-spacing mode, and bunching demo. Status: implemented. Evidence: `index.html`, `js/simulation.js`, `js/app.js`.
- `FND-007` — Enforce goalkeeper build-out retreat before distribution and omit goalkeeper punt/drop-kick behavior. Status: implemented and unit-tested at the engine level. Evidence: `js/simulation.js`, `tests/simulation.test.mjs`.
- `FND-008` — Autosave board state and provide a saved-position library plus JSON export/import. Status: implemented. Evidence: `js/storage.js`, `js/app.js`.
- `FND-009` — Provide offline app-shell caching and installable manifest. Status: implemented in source. Evidence: `sw.js`, `manifest.webmanifest`, `icons/`, `tests/pwa-shell.test.mjs`.
- `FND-010` — Maintain mandatory repository documentation. Status: implemented. Evidence: `README.md`, `ARCHITECTURE.md`, `PROJECT_STATE.md`, `PRD.md`.
- `FND-011` — Provide the four required built-in U9 teaching scenarios. Status: implemented and unit-tested. Evidence: `js/builtins.js`, `tests/builtins.test.mjs`.
- `FND-012` — Support extra movable soccer balls in addition to cones. Status: implemented. Evidence: `index.html`, `js/app.js`, `js/render.js`.
- `FND-013` — Keep the full application shell usable in 1024×768 landscape, 768×1024 portrait, and 1366×1024 desktop/tablet rendering without page overflow; keep portrait token labels upright. Status: implemented and rendered in headless Chromium. Evidence: `styles.css`, `js/render.js`; three viewport render pass with zero page errors.
- `FND-014` — Support drag-and-drop mini-goals/pug goals as drill props (PRD §7.2). Status: implemented; state normalization unit-tested. Evidence: `js/state.js` (`miniGoals`), `js/render.js` (`buildMiniGoal`), `js/app.js` (`minigoal` tool, `findObject`, remove-selected), `index.html`, `styles.css`, `tests/state.test.mjs`. Requires human/browser verification of the touch drag and hit area; not yet exercised on a physical iPad.
- `FND-015` — Run repository behavior/integrity tests and runtime syntax checks automatically on every push to `main`. Status: implemented and verified. Evidence: `.github/workflows/validate.yml`, `tests/pwa-shell.test.mjs`.
- `FND-016` — Refresh the offline app-shell cache after the mini-goal feature changed cached HTML/CSS/JS assets. Status: implemented. Evidence: commit `1d4643807a356a5185ce792f3db076536c3bcd18` advanced the cache generation from `v2` to `v3`.
- `FND-017` — Add explicit automated restart states for throw-ins, goal kicks, corners, and kickoffs after goals. Status: implemented with pure rules tests and simulation integration tests. Evidence: `js/restarts.js`, `js/simulation.js`, `js/state.js`, `tests/restarts.test.mjs`, `tests/restart-integration.test.mjs`.
- `FND-018` — Preserve loose-ball/pass travel instead of reacquiring a carrier while `ballTarget` is active. Status: implemented as a regression fix discovered during restart TDD. Evidence: `js/simulation.js`, `tests/restart-integration.test.mjs` (`a pass in flight is not immediately reacquired by ensureCarrier`).
- `FND-020` — Make shots cross the goal line with a varied, deterministic aim and a goalkeeper response, so goals, corners, and goal kicks occur in normal play. Status: implemented with tests. Evidence: `js/simulation.js` (`beginShot`, `keeperResponse`), `js/constants.js` (`SIMULATION.shotAimOffsets`, `shotAimSpread`, `keeperCatchReach`, `keeperParryReach`), `js/state.js` (`shotCount`), `tests/shots.test.mjs`. Before this change a 10-minute simulated match produced no goals, corners, or goal kicks because the pickup radius collected every shot before it crossed the line.
- `FND-019` — Keep the new restart module offline-capable. Status: implemented. Evidence: `sw.js` includes `./js/restarts.js` and advances cache generation from `u9-tactical-board-v3` to `u9-tactical-board-v4`.

## Partially implemented PRD areas

- CPU-vs-CPU simulation: passing, dribbling movement, pressing, shooting, build-out retreat, spacing modes, simplified offside support positioning, and explicit boundary restarts exist. It is still a teaching simulation rather than a complete Laws-of-the-Game engine.
- Restart procedures: ownership and placement flow for throw-ins, goal kicks, corners, and kickoffs are implemented. Detailed procedural constraints such as opponent restart distances, throw-in body mechanics, kickoff-half restrictions, and the IFAB five-second anti-delay protocol are not modeled.
- Goal-kick geometry: the board does not draw a separate IFAB goal area; simulation goal kicks use the goalkeeper-side center (`x = 0.08` home / `x = 0.92` away, `y = 0.5`) to preserve the project’s existing U9 build-out teaching behavior.
- Coaching props: cones, mini goals, and extra movable soccer balls exist. The PRD §7.2 prop list is complete.
- Saved library: save/load/delete, backup import/export, and the four built-in teaching scenarios exist. Category filtering/editing is not yet implemented.
- Zone teaching: highlights and overlap emphasis exist. Simulation zone-restriction constraints are not yet implemented.

## Verification evidence

Baseline before implementation: repository contained only `PRD.md`; no executable application or tests existed.

Automated and targeted checks for this work unit:

- Restart TDD cycle 1: `tests/restarts.test.mjs` was run before `js/restarts.js` existed and failed with `ERR_MODULE_NOT_FOUND`; after the minimal rules module was added, all five restart rules tests passed locally.
- Restart TDD cycle 2: `tests/restart-integration.test.mjs` initially failed all four boundary-restart cases against the pre-change simulation. The cycle exposed the pre-existing `ensureCarrier()` in-flight reacquisition defect; after the minimum simulation/state changes, the targeted restart/simulation set passed 14/14 locally, including backward-compatible save normalization and the pass-in-flight regression.
- Shot/keeper change (`FND-020`): local `npm test` 2026-10-27, 40 tests, 40 pass, 0 fail, plus `node --check` on every `js/*.js` and `sw.js`. A 10-minute simulated match in each spacing mode produced kickoffs, corners, and goal kicks with zero frames of ball or players off the pitch. `tests/restart-integration.test.mjs` goal case was moved from y 0.5 to y 0.57 because a shot at the centred keeper is now caught. Throw-ins are covered by rules and integration tests but do not arise in normal simulated play: no pass or shot currently travels over a touchline.
- Repository CI remains the authoritative automated integration gate: `npm test` plus `node --check` for all runtime modules and `sw.js` on every push to `main`. The post-integration run must be green before this work unit is considered fully verified.
- `tests/pwa-shell.test.mjs` verifies every declared app-shell path exists, every install-critical local `index.html` asset is precached, and every static ES-module dependency reachable from cached modules is included in `APP_SHELL`. Adding `js/restarts.js` therefore required the `v4` cache update in the same work unit.
- Earlier headless Chromium render smoke testing covered 1024×768 landscape, 768×1024 portrait, and 1366×1024 with zero page errors. The restart change has no new UI controls or layout surfaces, but physical-iPad simulation/restart behavior remains unverified.

Research and standards checked in this work unit:

- IFAB Laws of the Game 2026/27: Law 8 (kick-off/start and restart), Law 15 (throw-in), Law 16 (goal kick), and Law 17 (corner kick).
- U.S. Soccer / US Youth Soccer Player Development Initiatives: U9/U10 7v7 build-out-line retreat and goalkeeper pass/throw/roll distribution with punts/drop-kicks prohibited.
- MDN JavaScript modules: static relative ES-module imports/exports remain the project pattern; the new module uses no dependency or bundler.
- WCAG 2.2 keyboard-operability/focus requirements were rechecked; this work unit adds no UI control or interaction surface, so existing keyboard/touch behavior is unchanged.

## Known risks

- Locked 60 fps on the 2018 iPad 6th generation is a PRD requirement but remains unverified on physical hardware.
- iPad Safari/PWA offline behavior is implemented from current platform guidance but has not yet been exercised on physical iPad hardware after cache generation `v4`.
- Mini-goal touch dragging and hit-area ergonomics have not yet been verified on a physical iPad.
- Restart flow is intentionally simplified for teaching and is not a full referee/law engine; procedural restart restrictions listed above remain unmodeled.
- The simulation still lacks foul handling, richer pass-lane scoring, goalkeeper catches, zone-restriction constraints, and deterministic seeded scenario playback.
- `confirm()` is currently used before deleting a saved preset. It is functional but should be replaced by an in-app confirmation dialog for consistent standalone-PWA presentation.

## Repository invariants

- `main` is the authoritative branch.
- Do not add preset formations beyond 1-3-2-1 and 1-2-3-1.
- Keep normalized tactical coordinates independent from rendered pixel dimensions.
- Do not persist a running simulation state.
- While `simulation.ballTarget` is active, do not synthesize a carrier before the moving ball reaches a player or a boundary restart.
- Changes to cached app-shell files or static module dependencies must update `sw.js` cache version/list; `tests/pwa-shell.test.mjs` must remain green.
- `.github/workflows/validate.yml` must remain green for automated checks on `main`; browser and physical-iPad checks are separate evidence and must not be inferred from CI.
- Update `ARCHITECTURE.md` and this file in the same work unit as behavior changes.
