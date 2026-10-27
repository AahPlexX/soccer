# Project state

Last updated: 2026-10-27
Branch: `main`
PRD status: in progress
Schema version: `1`

## Resume here

Current state: the repository is a working offline-capable U9 7v7 tactical board with pitch rendering, the two required formations, touch/keyboard manipulation, selectable zones, player/team color editing, telestration, cones, mini goals, extra balls, all four built-in teaching scenarios, CPU-vs-CPU passing/dribbling/pressing with opponent-lane avoidance, deterministic varied shooting with goalkeeper catch/parry outcomes, U9 build-out behavior, explicit throw-in/goal-kick/corner/kickoff restart states, optional keep-inside/keep-out zone drill constraints, a categorized saved library with ARIA tabs plus compact select fallback, user-preset title/category editing, two-step in-app deletion, persistence/backup, PWA caching, and an automated validation gate on every push to `main`.

Next action: browser verification of the saved-library tabs/editor/two-step delete and the post-zone responsive layout; then goalkeeper movement toward incoming shots (with the deterministic shot cycle retuned so intended parry/goal outcomes remain reachable), the PRD's optional dashed pass-option lines for the ball carrier, remaining restart procedural detail where useful for teaching, and real-device iPad performance/accessibility/offline verification.

Blockers: no source blocker. Real-device validation on the 2018 iPad baseline has not been executed in this repository session.

## Completed requirements in this work unit

- `FND-001` — Render the PRD pitch geometry from normalized coordinates. Status: implemented. Evidence: `js/constants.js`, `js/render.js`, `tests/geometry.test.mjs`.
- `FND-002` — Limit preset formations to 1-3-2-1 and 1-2-3-1 with independent team selection. Status: implemented and unit-tested. Evidence: `js/formations.js`, `tests/formations.test.mjs`.
- `FND-003` — Support touch/pen/mouse dragging plus a non-drag positioning alternative. Status: implemented. Evidence: `js/app.js`, player editor nudge controls, keyboard arrow handling.
- `FND-004` — Support all eight required selectable zones with multi-select and one-tap clear. Status: implemented. Evidence: `js/constants.js`, `index.html`, `js/app.js`, `js/render.js`.
- `FND-005` — Support custom player number, label, individual color, and team/goalkeeper palettes. Status: implemented. Evidence: `index.html`, `js/app.js`, `js/formations.js`.
- `FND-006` — Provide play/pause/reset, 0.5×/1×/2× speed, good-spacing mode, and bunching demo. Status: implemented. Evidence: `index.html`, `js/simulation.js`, `js/app.js`.
- `FND-007` — Enforce goalkeeper build-out retreat before distribution and omit goalkeeper punt/drop-kick behavior. Status: implemented and unit-tested. Evidence: `js/simulation.js`, `tests/simulation.test.mjs`.
- `FND-008` — Autosave board state and provide a saved-position library plus JSON export/import. Status: implemented. Evidence: `js/storage.js`, `js/app.js`.
- `FND-009` — Provide offline app-shell caching and installable manifest. Status: implemented in source. Evidence: `sw.js`, `manifest.webmanifest`, `icons/`, `tests/pwa-shell.test.mjs`.
- `FND-010` — Maintain mandatory repository documentation. Status: implemented. Evidence: `README.md`, `ARCHITECTURE.md`, `PROJECT_STATE.md`, `PRD.md`.
- `FND-011` — Provide the four required built-in U9 teaching scenarios. Status: implemented and unit-tested. Evidence: `js/builtins.js`, `tests/builtins.test.mjs`.
- `FND-012` — Support extra movable soccer balls in addition to cones. Status: implemented. Evidence: `index.html`, `js/app.js`, `js/render.js`.
- `FND-013` — Keep the full application shell usable in 1024×768 landscape, 768×1024 portrait, and 1366×1024 desktop/tablet rendering without page overflow; keep portrait token labels upright. Status: implemented and previously rendered in headless Chromium. Evidence: `styles.css`, `js/render.js`; three-viewport render pass with zero page errors. Later zone/library layouts still require a repeated rendered-browser matrix.
- `FND-014` — Support drag-and-drop mini-goals/pug goals as drill props (PRD §7.2). Status: implemented; state normalization unit-tested. Evidence: `js/state.js`, `js/render.js`, `js/app.js`, `index.html`, `styles.css`, `tests/state.test.mjs`. Requires physical-iPad touch/hit-area verification.
- `FND-015` — Run repository behavior/integrity tests and runtime syntax checks automatically on every push to `main`. Status: implemented and verified. Evidence: `.github/workflows/validate.yml`, `tests/pwa-shell.test.mjs`.
- `FND-016` — Refresh the offline app-shell cache after mini-goal cached assets changed. Status: implemented; cache advanced from `v2` to `v3`.
- `FND-017` — Add explicit automated restart states for throw-ins, goal kicks, corners, and kickoffs after goals. Status: implemented. Evidence: `js/restarts.js`, `js/simulation.js`, `js/state.js`, `tests/restarts.test.mjs`, `tests/restart-integration.test.mjs`.
- `FND-018` — Preserve loose-ball/pass travel instead of reacquiring a carrier while `ballTarget` is active. Status: implemented as a restart-TDD regression fix. Evidence: `js/simulation.js`, `tests/restart-integration.test.mjs`.
- `FND-019` — Keep restart logic offline-capable. Status: implemented; cache `v4` added `js/restarts.js`.
- `FND-020` — Make shots cross the goal line with varied deterministic aim and goalkeeper catch/parry/goal outcomes. Status: implemented with deterministic replay coverage. Evidence: `js/simulation.js`, `js/constants.js`, `js/state.js`, `tests/shots.test.mjs`.
- `FND-021` — Turn selected zone overlays into optional Keep inside / Keep out simulation constraints for Our team / Opponents / Both. Status: implemented. Evidence: `js/zone-constraints.js`, `js/simulation.js`, `js/state.js`, `index.html`, `js/app.js`, `styles.css`, zone test suites.
- `FND-022` — Preserve mandatory U9 and legal-restart behavior when optional zone constraints conflict. Status: implemented; build-out retreat and explicit restart placement take precedence. Evidence: `js/simulation.js`, `tests/zone-simulation.test.mjs`.
- `FND-023` — Keep the combined shot/keeper and zone-drill runtime offline-capable. Status: implemented; cache `v5` added `js/zone-constraints.js` and refreshed cached runtime files.
- `FND-024` — Filter the saved-position library by category and replace native `confirm()` deletion. Status: implemented. The existing native select filters All/Formations/Positions/Plays/Drills/Rules, and delete uses a two-step in-app “Tap again to delete” confirmation with a 4-second disarm. Evidence: `index.html`, `js/app.js`, `styles.css`.
- `FND-025` — Provide PRD §8.1 category tabs and saved-preset metadata editing. Status: implemented in source, awaiting browser verification. Tablet/iPad layouts expose All/Formations/Positions/Plays/Drills/Rules as an ARIA `tablist` with roving tabindex and Left/Right/Home/End keyboard navigation; <=620 px retains the native select fallback. User presets can be renamed/re-categorized through `savePreset()` while preserving ID and saved board state; built-ins remain immutable. Evidence: `js/library.js`, `js/library-ui.js`, `library.css`, `index.html`, `tests/library.test.mjs`, `tests/library-markup.test.mjs`, `tests/storage-edit.test.mjs`.
- `FND-026` — Make carriers prefer receivers with a clear pass lane. Status: implemented with tests. A receiver is skipped when an opponent is within `SIMULATION.passLaneClearance` (0.05) of the carrier→receiver segment; if every lane is blocked the prior scoring remains the fallback. Evidence: `js/geometry.js` (`distanceToSegment`), `js/simulation.js` (`choosePassTarget`), `js/constants.js`, `tests/pass-lane.test.mjs`.
- `FND-027` — Fix saved-library offline and row/preset identity defects. Status: implemented. `library.css`, `js/library.js`, and `js/library-ui.js` are precached and cache generation is `u9-tactical-board-v7`; saved rows carry stable `data-preset-id` and edit augmentation resolves presets by ID rather than DOM/list position or button text. `js/app.js` reuses `filterPresetsByCategory()`. Evidence: `sw.js`, `js/app.js`, `js/library-ui.js`, `tests/pwa-shell.test.mjs`.

## Partially implemented PRD areas

- CPU-vs-CPU simulation: passing with opponent-lane avoidance, dribbling movement, pressing, deterministic varied shooting, goalkeeper catch/parry outcomes, build-out retreat, spacing modes, simplified offside support, explicit restarts, and optional zone constraints exist. It remains a teaching simulation rather than a complete Laws-of-the-Game engine.
- Restart procedures: ownership and placement flow exist; detailed procedural constraints such as opponent restart distances, throw-in body mechanics, kickoff-half restrictions, and the IFAB five-second anti-delay protocol are not modeled.
- Goal-kick geometry: the board does not draw a separate IFAB goal area; goal kicks use the goalkeeper-side center (`x = 0.08` home / `x = 0.92` away, `y = 0.5`) to preserve existing U9 build-out teaching behavior.
- Goalkeeping: keepers can catch or parry shots deterministically but do not yet use richer shot-tracking movement or positioning logic.
- Coaching props: cones, mini goals, and extra movable soccer balls exist; the PRD §7.2 prop list is complete.
- Saved library: save/load/edit/delete, category tabs/filtering, built-in scenarios, backup import/export, and in-app two-step deletion exist. Browser interaction verification of the newest tabs/editor remains outstanding.
- Zone teaching: highlights, overlap emphasis, Keep inside, and Keep out constraints exist using the same selected-zone geometry as rendering.

## Verification evidence

Baseline before implementation: repository contained only `PRD.md`; no executable application or tests existed.

Automated and targeted checks for this work unit:

- Restart TDD first failed before `js/restarts.js`; integration testing then exposed/fixed the pre-existing in-flight-pass carrier reacquisition defect.
- Shot/keeper testing covers wide shots, catches, parries, goals, both ends, same-team last touches, fixed aim cycle, normal-play restart production, and deterministic replay. Ten simulated minutes in each spacing mode produced kickoffs/corners/goal kicks without the ball or players leaving the pitch.
- Zone TDD added keep-in, then keep-out/overlap union geometry after PRD tracing showed the opponent-exclusion requirement. State compatibility and mandatory build-out precedence are covered.
- Saved-library helper TDD first failed before `js/library.js`, then passed category/filter and keyboard-cycling tests. Static markup tests cover tablist/tabpanel/editor asset wiring; storage regression coverage proves same-ID metadata editing preserves the board snapshot.
- Pass-lane tests cover segment geometry, rerouting around a blocked best lane, and fallback when every lane is blocked.
- `tests/pwa-shell.test.mjs` verifies every app-shell path exists, every install-critical local HTML asset is precached, and every reachable static ES-module dependency is in `APP_SHELL`.
- **Current combined integration evidence:** GitHub Actions run `40431555537` at head `ef6917a574ce2654885442ea2da88ebf22321c81` completed successfully: **68 tests, 68 pass, 0 fail, 0 skipped**, followed by successful `node --check` for every `js/*.js` module and `sw.js`.
- Earlier headless Chromium smoke testing covered 1024×768 landscape, 768×1024 portrait, and 1366×1024 with zero page errors. Later zone/library layouts have source/automated validation but have not repeated that rendered-browser matrix.

Research and standards checked in this work unit:

- IFAB Laws of the Game 2026/27: Laws 8, 15, 16, and 17 for restart ownership/procedure.
- U.S. Soccer / US Youth Soccer Player Development Initiatives: U9/U10 7v7 build-out retreat, no punts/drop-kicks, and development emphasis on width/depth/problem-solving.
- W3C WAI-ARIA Authoring Practices Tabs Pattern: `tablist`/`tab`/`tabpanel`, `aria-selected`, roving tabindex, Left/Right and Home/End keyboard behavior.
- WCAG 2.2 Reflow and keyboard/focus guidance: controls reflow rather than forcing page-level horizontal scrolling; native controls retain keyboard operation/focus styling.
- MDN native form/dialog/module guidance: labeled controls and native `<dialog>`/static ES modules remain the project pattern.

## Known risks

- Locked 60 fps on the 2018 iPad 6th generation remains unverified on physical hardware.
- iPad Safari/PWA offline/update behavior has not been exercised on physical iPad hardware after cache generation `v7`.
- Post-zone/post-library responsive layouts have automated/source validation but have not repeated the browser render matrix or physical-iPad usability check.
- Mini-goal touch dragging/hit-area ergonomics remain physically unverified.
- Saved-library tabs, compact fallback, metadata editor, and two-step delete have not yet been exercised in a rendered browser; automated tests verify markup/helper/storage contracts only.
- Restart flow is intentionally simplified for teaching and is not a full referee/law engine.
- Goalkeeper response is deterministic but goalkeeper locomotion/shot tracking remains simplified.

## Repository invariants

- `main` is authoritative; concurrent-agent changes must be re-read and preserved before every write.
- Do not add preset formations beyond 1-3-2-1 and 1-2-3-1.
- Keep normalized tactical coordinates independent from rendered pixel dimensions.
- Do not persist a running simulation state.
- While `simulation.ballTarget` is active, do not synthesize a carrier before the moving ball reaches a player or a boundary restart.
- Keep zone constraints optional; selected zones are the single source of zone geometry for both highlighting and simulation constraints.
- Mandatory U9 build-out retreat and explicit legal restart placement take precedence over optional coach-created zone constraints.
- Built-in saved scenarios are immutable; metadata editing applies only to user presets and must preserve the saved board snapshot.
- Changes to cached app-shell files or static module dependencies must update `sw.js`; `tests/pwa-shell.test.mjs` must remain green.
- `.github/workflows/validate.yml` must remain green for automated checks on `main`; browser and physical-iPad checks are separate evidence and must not be inferred from CI.
- Update `ARCHITECTURE.md`, `PROJECT_STATE.md`, and relevant README status in the same work unit as behavior changes.
