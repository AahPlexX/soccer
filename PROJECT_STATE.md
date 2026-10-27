# Project state

Last updated: 2026-10-26
Branch: `main`
PRD status: in progress
Schema version: `1`

## Resume here

Current state: the repository has moved from PRD-only to a working static-board foundation with pitch rendering, the two required formations, touch/keyboard manipulation, selectable zones, player and team color editing, telestration, cones, mini goals, extra balls, all four built-in teaching scenarios, CPU-vs-CPU passing/dribbling/pressing, deterministic varied shooting with goalkeeper catch/parry outcomes, U9 build-out behavior, explicit throw-in/goal-kick/corner/kickoff restart states, optional keep-inside/keep-out zone drill constraints, persistence, JSON backup, PWA caching, and an automated validation gate on every push to `main`.

Next action: implement the remaining PRD coaching/library completeness in this order: browser verification of the saved-library category filter and two-step delete (never run in a real browser); optional saved-preset rename/re-categorize; richer pass-lane and goalkeeper movement behavior; remaining restart procedural detail where useful for teaching; real-device iPad performance/accessibility/offline verification.

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
- `FND-013` — Keep the full application shell usable in 1024×768 landscape, 768×1024 portrait, and 1366×1024 desktop/tablet rendering without page overflow; keep portrait token labels upright. Status: implemented and previously rendered in headless Chromium. Evidence: `styles.css`, `js/render.js`; three-viewport render pass with zero page errors. The later zone-control layout has automated/source verification but has not yet repeated this rendered-browser matrix.
- `FND-014` — Support drag-and-drop mini-goals/pug goals as drill props (PRD §7.2). Status: implemented; state normalization unit-tested. Evidence: `js/state.js` (`miniGoals`), `js/render.js` (`buildMiniGoal`), `js/app.js` (`minigoal` tool, `findObject`, remove-selected), `index.html`, `styles.css`, `tests/state.test.mjs`. Requires physical-iPad verification of touch drag and hit-area ergonomics.
- `FND-015` — Run repository behavior/integrity tests and runtime syntax checks automatically on every push to `main`. Status: implemented and verified. Evidence: `.github/workflows/validate.yml`, `tests/pwa-shell.test.mjs`.
- `FND-016` — Refresh the offline app-shell cache after the mini-goal feature changed cached HTML/CSS/JS assets. Status: implemented. Evidence: commit `1d4643807a356a5185ce792f3db076536c3bcd18` advanced the cache generation from `v2` to `v3`.
- `FND-017` — Add explicit automated restart states for throw-ins, goal kicks, corners, and kickoffs after goals. Status: implemented with pure rules tests and simulation integration tests. Evidence: `js/restarts.js`, `js/simulation.js`, `js/state.js`, `tests/restarts.test.mjs`, `tests/restart-integration.test.mjs`.
- `FND-018` — Preserve loose-ball/pass travel instead of reacquiring a carrier while `ballTarget` is active. Status: implemented as a regression fix discovered during restart TDD. Evidence: `js/simulation.js`, `tests/restart-integration.test.mjs` (`a pass in flight is not immediately reacquired by ensureCarrier`).
- `FND-019` — Keep the restart module offline-capable. Status: implemented. Evidence: `sw.js` includes `./js/restarts.js`; the cache advanced to `v4` with restart integration and later to `v5` for the combined shot/zone runtime.
- `FND-020` — Make shots cross the goal line with a varied, deterministic aim and a goalkeeper response, so goals, corners, and goal kicks occur in normal play. Status: implemented with tests. Evidence: `js/simulation.js` (`beginShot`, `keeperResponse`), `js/constants.js` (`SIMULATION.shotAimOffsets`, `shotAimSpread`, `keeperCatchReach`, `keeperParryReach`), `js/state.js` (`shotCount`), `tests/shots.test.mjs`. Before this change a 10-minute simulated match produced no goals, corners, or goal kicks because the pickup radius collected every shot before it crossed the line.
- `FND-021` — Let the coach turn selected zone overlays into optional simulation constraints. Status: implemented. `Zone rule` supports Off, Keep inside, and Keep out; `Applies to` supports Our team, Opponents, and Both teams. Selected zones form a union. Evidence: `js/zone-constraints.js`, `js/simulation.js`, `js/state.js`, `index.html`, `js/app.js`, `styles.css`, `tests/zone-constraints.test.mjs`, `tests/zone-restriction-state.test.mjs`, `tests/zone-simulation.test.mjs`.
- `FND-022` — Preserve mandatory U9 and legal-restart behavior when optional zone constraints conflict. Status: implemented. Build-out retreat and explicit restart-taker placement take precedence over a coach-created zone rule; after the mandatory phase ends, the optional rule becomes active again. Evidence: `js/simulation.js`, `tests/zone-simulation.test.mjs`.
- `FND-024` — Filter the saved-position library by category and replace native `confirm()` with an in-app two-step delete (PRD §8.1 category tabs; standalone-PWA presentation). Status: implemented in source, awaiting browser verification (see Known risks). Evidence: `index.html` (`#saved-filter`), `js/app.js` (`refreshSavedList`, `savedFilter`), `styles.css` (`.saved-filter`). No schema change; `sw.js` advances `CACHE_NAME` to `u9-tactical-board-v6` because cached app-shell files changed (no new file, so `APP_SHELL` is unchanged).
- `FND-023` — Keep the combined shot/keeper and zone-drill runtime offline-capable. Status: implemented. Evidence: `sw.js` advances to `u9-tactical-board-v5` and precaches `./js/zone-constraints.js` along with the rest of the static ES-module graph.

## Partially implemented PRD areas

- CPU-vs-CPU simulation: passing, dribbling movement, pressing, deterministic varied shooting, goalkeeper catch/parry outcomes, build-out retreat, spacing modes, simplified offside support positioning, explicit boundary restarts, and optional zone constraints exist. It remains a teaching simulation rather than a complete Laws-of-the-Game engine.
- Restart procedures: ownership and placement flow for throw-ins, goal kicks, corners, and kickoffs are implemented. Detailed procedural constraints such as opponent restart distances, throw-in body mechanics, kickoff-half restrictions, and the IFAB five-second anti-delay protocol are not modeled.
- Goal-kick geometry: the board does not draw a separate IFAB goal area; simulation goal kicks use the goalkeeper-side center (`x = 0.08` home / `x = 0.92` away, `y = 0.5`) to preserve the project’s existing U9 build-out teaching behavior.
- Goalkeeping: keepers can catch or parry shots deterministically, but they do not yet use richer shot-tracking movement or decision logic.
- Coaching props: cones, mini goals, and extra movable soccer balls exist. The PRD §7.2 prop list is complete.
- Saved library: save/load/delete, backup import/export, and the four built-in teaching scenarios exist. The library dialog has a category filter (All, Formations, Positions, Plays, Drills, Rules) covering built-in and saved items, and delete uses a two-step in-app confirmation. Renaming or re-categorizing an existing saved preset is not implemented; the coach saves a new one with Save as.
- Zone teaching: highlights, overlap emphasis, Keep inside, and Keep out constraints exist. The rule is deliberately optional and uses the same selected-zone geometry as the overlays rather than a second zone model.

## Verification evidence

Baseline before implementation: repository contained only `PRD.md`; no executable application or tests existed.

Automated and targeted checks for this work unit:

- Restart TDD cycle 1: `tests/restarts.test.mjs` was run before `js/restarts.js` existed and failed with `ERR_MODULE_NOT_FOUND`; after the minimal rules module was added, all five restart rules tests passed locally.
- Restart TDD cycle 2: `tests/restart-integration.test.mjs` initially failed the boundary-restart cases against the pre-change simulation. The cycle exposed the pre-existing `ensureCarrier()` in-flight reacquisition defect; after the minimum simulation/state changes, the targeted restart/simulation set passed locally, including backward-compatible save normalization and the pass-in-flight regression.
- Shot/keeper change (`FND-020`): the deterministic shot suite covers wide shots, goalkeeper catches, goalkeeper parries, goals, both ends of the pitch, same-team last touches, the fixed aim cycle, normal-play restart production, and deterministic replay. A 10-minute simulated match in each spacing mode produced kickoffs, corners, and goal kicks with zero frames of ball or players off the pitch. Throw-ins are covered by rules and integration tests but do not arise in normal simulated play because no current pass or shot intentionally travels over a touchline.
- Zone TDD: the pure constraint suite was first run before the module existed and failed with `ERR_MODULE_NOT_FOUND`; after the minimum geometry implementation, keep-in, team-scope, and no-op tests passed. The design was then expanded after PRD tracing showed it also needed “opponents cannot enter this zone”; keep-out and overlapping-union tests were added before implementation and then passed. State compatibility tests cover safe defaults and invalid persisted values.
- Zone CI correction: run `40430329252` correctly caught an overlong precedence test. The test had simulated four seconds, long enough for the legal goal-kick release to occur and the optional zone rule to resume. It was corrected to assert during the one-second retreat phase, before the 1.15-second action/release decision, without weakening runtime behavior.
- **Current integration evidence:** GitHub Actions run `40430420966` at head `3e80215e957c894941eeb3544a919ea18b4ec23f` completed successfully on 2026-10-26 local time: **56 tests, 56 pass, 0 fail, 0 skipped**, followed by successful `node --check` for every `js/*.js` module and `sw.js`.
- `tests/pwa-shell.test.mjs` verifies every declared app-shell path exists, every install-critical local `index.html` asset is precached, and every static ES-module dependency reachable from cached modules is included in `APP_SHELL`. The combined runtime therefore advances to cache generation `v5` and includes `js/zone-constraints.js`.
- Earlier headless Chromium render smoke testing covered 1024×768 landscape, 768×1024 portrait, and 1366×1024 with zero page errors. The newly added zone controls use responsive grid reflow, but that exact post-zone layout has not yet been browser-rendered or physically iPad-verified.

Research and standards checked in this work unit:

- IFAB Laws of the Game 2026/27: Law 8 (kick-off/start and restart), Law 15 (throw-in), Law 16 (goal kick), and Law 17 (corner kick).
- U.S. Soccer / US Youth Soccer Player Development Initiatives: U9/U10 7v7 build-out-line retreat and goalkeeper pass/throw/roll distribution with punts/drop-kicks prohibited; current small-sided guidance also emphasizes width, depth, and player problem-solving appropriate to zone-based teaching constraints.
- MDN form-control guidance: the zone-rule and team-scope controls use native labeled `<select>` elements rather than custom widgets.
- WCAG 2.2 Reflow and keyboard/focus considerations: zone controls reflow into additional rows at narrower portrait/landscape widths rather than forcing page-level horizontal scrolling; existing native controls retain keyboard operation and focus styling.
- MDN JavaScript modules: static relative ES-module imports/exports remain the project pattern; `js/zone-constraints.js` adds no dependency or build step.

## Known risks

- Locked 60 fps on the 2018 iPad 6th generation is a PRD requirement but remains unverified on physical hardware.
- iPad Safari/PWA offline behavior is implemented from current platform guidance but has not yet been exercised on physical iPad hardware after cache generation `v6`.
- The post-zone-control responsive layout has automated/source validation but has not yet repeated the browser render matrix or physical-iPad usability check.
- Mini-goal touch dragging and hit-area ergonomics have not yet been verified on a physical iPad.
- Restart flow is intentionally simplified for teaching and is not a full referee/law engine; procedural restart restrictions listed above remain unmodeled.
- Goalkeeper response is deterministic and useful for teaching simulation, but goalkeeper locomotion/positioning toward an incoming shot remains simplified.
- The saved-library filter (`#saved-filter`, `savedFilter` in `js/app.js`) and the two-step "Tap again to delete" confirmation have only been checked by syntax, the static id check, and the existing test suite. The DOM behavior was not exercised in a browser because browser automation from Bash was blocked by a session hook; a human or browser run should confirm filtering built-in and saved items, the filtered empty state, the 4 s disarm, and 48 px touch targets.

## Repository invariants

- `main` is the authoritative branch.
- Do not add preset formations beyond 1-3-2-1 and 1-2-3-1.
- Keep normalized tactical coordinates independent from rendered pixel dimensions.
- Do not persist a running simulation state.
- While `simulation.ballTarget` is active, do not synthesize a carrier before the moving ball reaches a player or a boundary restart.
- Keep zone constraints optional; selected zones are the single source of zone geometry for both highlighting and simulation constraints.
- Mandatory U9 build-out retreat and explicit legal restart placement take precedence over optional coach-created zone constraints.
- Changes to cached app-shell files or static module dependencies must update `sw.js` cache version/list; `tests/pwa-shell.test.mjs` must remain green.
- `.github/workflows/validate.yml` must remain green for automated checks on `main`; browser and physical-iPad checks are separate evidence and must not be inferred from CI.
- Update `ARCHITECTURE.md` and this file in the same work unit as behavior changes.
