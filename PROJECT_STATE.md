# Project state

Last updated: 2026-10-28
Branch: `main`
PRD status: in progress
Schema version: `1`
Application version: `1.0.0`

## Resume here

Current state: the source implements an offline-capable U9 7v7 tactical board with pitch rendering, the two required formations, touch/keyboard manipulation, selectable zones, player/team color editing, telestration, cones, mini goals, extra balls, all four built-in teaching scenarios, CPU-vs-CPU passing/dribbling/pressing with opponent-lane avoidance and an optional dashed pass-options overlay, deterministic varied shooting with goalkeeper shot tracking and catch/parry outcomes, U9 build-out behavior, explicit throw-in/goal-kick/corner/kickoff restart states with post-goal kickoff half restrictions, optional keep-inside/keep-out zone drill constraints, a categorized saved library with ARIA tabs plus compact select fallback, user-preset title/category editing, two-step in-app deletion, persistence/backup, PWA caching, and an automated validation gate on every push to `main`.

Next action: close the PRD gaps listed under Open PRD gaps (per-player bench first), then verify goalkeeper movement, passing lines, and post-zone layout on a physical iPad and continue testing interactions across real device conditions. Continue with remaining restart procedural detail where useful for teaching and real-device iPad performance/accessibility/offline verification. Check the latest validation workflow for the current `main` commit before continuing.

Blockers: real-device validation on the 2018 iPad baseline has not been executed in this repository session.

## Versioned update prompt

- Official application version begins at `1.0.0`. Increment its patch component by one for each significant update; keep `package.json` and `APP_VERSION` in `sw.js` synchronized. Each Pages deployment receives its own build identifier even if the version is unchanged.
- A waiting worker announces its version to a modal with Update and Cancel. The coach can defer, update after the current board is saved, or explicitly update without saving if storage fails. Existing open dialogs are respected. The pre-1.0 client cannot show its first update prompt; close all old tabs or standalone windows and reopen it to adopt the new worker.
- Local Chromium verified first install, a 1.0.0→1.0.1 upgrade, Cancel and reoffer, board preservation, another tab, and offline reload. Physical iPad Safari and standalone update behavior remain unverified.

## Formation correction

- Both approved shapes now start each team in its own half, with separated defensive, midfield and forward lines. Custom names, numbers and colors survive a shape change. Each team has a reapply control for coaches using an older autosaved board; existing custom positions are not automatically replaced. Changing a carrier's team shape releases the ball in place.
- Attacking support advances with the ball, and five seconds of post-tackle protection prevent midfield possession oscillation. Simulations at all three speeds produced shots, turnovers and kickoff, corner and goal-kick restarts. These remain simplified teaching behaviors.
- All four shape matchups and the reapply control were rendered at desktop, tablet and compact widths. Cache `v12` refreshes the updated app shell.

## Latest control wiring work

- Corrected manual ball placement and loose-ball pursuit, player anchor updates, drawing and prop placement over objects, portrait token orientation after rebuild, and saved-preset reset after reload. Formation changes clear the old preset identity. An unsaved reset baseline is not separately persisted across reloads.
- Added deterministic close-range turnovers with protected restarts/build-out and a cooldown; this remains a simplified simulation without fouls or tackle animation. Pass options now explain when lines cannot be displayed.
- Fixed cancel buttons blocked by required fields, surfaced storage failures, merged IndexedDB and fallback records with deletion tombstones, and validated imported preset metadata. Cache generation `v11` refreshes changed assets.
- Rendered Chromium checks covered formations, zones, visibility, player and color editing, simulation movement and ball placement, tools over players, prop removal, saved presets and reset after reload, export/import, pass-option status and portrait rebuilding at 1024×768 and 768×1024. Physical iPad behavior and actual pass lines/goalkeeper movement remain to be checked.
- The user clarified that GitHub Pages is the deployment target, not a constraint to hand-authored HTML or a ban on frameworks/build tools. The current zero-build implementation is a choice, not a requirement.

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
- `FND-025` — Provide PRD §8.1 category tabs and saved-preset metadata editing. Status: implemented and exercised in rendered Chromium. Tablet/iPad layouts expose All/Formations/Positions/Plays/Drills/Rules as an ARIA `tablist` with roving tabindex and Left/Right/Home/End keyboard navigation; <=620 px retains the native select fallback. User presets can be renamed/re-categorized through `savePreset()` while preserving ID and saved board state; built-ins remain immutable. Evidence: `js/library.js`, `js/library-ui.js`, `library.css`, `index.html`, `tests/library.test.mjs`, `tests/library-markup.test.mjs`, `tests/storage-edit.test.mjs`.
- `FND-026` — Make carriers prefer receivers with a clear pass lane. Status: implemented with tests. A receiver is skipped when an opponent is within `SIMULATION.passLaneClearance` (0.05) of the carrier→receiver segment; if every lane is blocked the prior scoring remains the fallback. Evidence: `js/geometry.js` (`distanceToSegment`), `js/simulation.js` (`choosePassTarget`), `js/constants.js`, `tests/pass-lane.test.mjs`.
- `FND-027` — Fix saved-library offline and row/preset identity defects. Status: implemented. `library.css`, `js/library.js`, and `js/library-ui.js` are precached and cache generation is `u9-tactical-board-v7`; saved rows carry stable `data-preset-id` and edit augmentation resolves presets by ID rather than DOM/list position or button text. `js/app.js` reuses `filterPresetsByCategory()`. Evidence: `sw.js`, `js/app.js`, `js/library-ui.js`, `tests/pwa-shell.test.mjs`.
- `FND-028` — Keep one definition of an open pass lane. The on-screen pass options (`availablePassOptions`) had re-implemented the lane predicate that the CPU receiver choice (`choosePassTarget`) uses, so tuning one would have silently desynchronized what the coach sees from what the CPU does. Both now call `openPassReceivers()` in `js/pass-options.js`. Status: implemented with no behavior change (20-minute simulations produce identical restart counts); `tests/pass-lane.test.mjs` asserts the CPU's chosen receiver is always among the displayed options. Local `npm test` 2026-10-27: 76 tests, 76 pass, 0 fail. Evidence: `js/pass-options.js`, `js/simulation.js`, `tests/pass-lane.test.mjs`.
- `FND-029` — Provide optional dashed pass-options lines and refresh them immediately while paused. Status: implemented in source and covered by model/markup tests, but not interactively browser-verified. Evidence: `js/pass-options.js`, `js/pass-options-ui.js`, `js/render.js`, `pass-options.css`, `tests/pass-options*.test.mjs`; cache `v8` included these assets.
- `FND-034` — Add the PRD §7.1 player run/dribble arrow: a dashed straight arrow, separate from the solid pass/shot arrow. New `run` tool and `run` drawing type (`TOOLS` and `DRAWING_TYPES` in `js/state.js`); the toolbar now reads "Pass arrow" and "Run arrow"; `js/app.js` maps tools to drawing types in `DRAWING_TYPE_BY_TOOL` and treats every non-freehand type as a two-point line; `js/render.js` adds class `drawing-run` (`stroke-dasharray` in `styles.css`). Older saves are unaffected and an unknown stored type still normalizes to freehand. Status: implemented with tests; the pointer-drawing path was not exercised in a browser. Evidence: `js/state.js`, `js/app.js`, `js/render.js`, `index.html`, `styles.css`, `tests/drawing-tools.test.mjs`.
- `FND-035` — Add the PRD §7.2 multi-color cones: a "Cone color" picker (the 8 palette colors) sets the color of newly placed cones and recolors the selected cone. New persisted `coneColor` state field (hex-validated in `normalizeState`, default `PALETTE.orange`, additive so `SCHEMA_VERSION` stays 1); `addProp` now passes `state` to prop factories and the cone factory uses `state.coneColor` instead of a fixed constant. Status: implemented with tests; a DOM-emulator boot confirmed the picker lists 8 colors and changes without errors. Evidence: `js/state.js`, `js/board-actions.js`, `js/app.js`, `index.html`, `styles.css`, `tests/drawing-tools.test.mjs`. Local `npm test` 2026-10-28: 158 tests, 158 pass, 0 fail.
- `FND-033` — Fix: the zone highlights were never visible (owner report 2026-10-28: after the owner's refactor, "the whole zone system appears to be broken/non-functioning"). Diagnosis: the zone logic and wiring are intact. A DOM-emulator run of the real `index.html`, `app.js`, `library-ui.js`, and `pass-options-ui.js` booted with no errors, built 8 zone buttons and 8 overlays, toggled an overlay's `is-active` state, applied `--zone-opacity`, opened the panel, cleared the selection, and applied the zone-rule select; all imports/exports and `querySelector` ids resolve; the owner's refactor of `app.js`, `board-actions.js`, `state.js`, `storage.js`, and `sw.js` changed no zone behavior (listeners moved, `toggleZone` extracted, `selectedZones` now filtered to known ids on load). Cause: the pitch's outer rectangle (`js/render.js`, class `field-line`) had no fill, SVG's default fill is solid black, and the `.pitch-markings` group is painted after the zone layer, so a black rectangle covered the grass and every zone overlay (`render.js` and the CSS are unchanged since before the refactor, so this predates it). Fix: `.pitch-markings { fill: none; }` in `styles.css`; `.field-dot` keeps its own fill and `.goal-net` stays unfilled. Evidence: `styles.css`, `tests/pitch-markings.test.mjs`. Not verified in a real browser (no Chrome is available to this agent session; the emulator has no layout or painting), so the visible result needs a human check: select Left zone, the left half of the pitch should show a yellow tint over grass. If zones still look wrong after this, capture the browser console and what the zone panel and pitch show, and check for a stale service worker serving old modules: `BUILD_ID` is the constant `development` outside the Pages build, so the cache name never changes locally; unregister the service worker and clear site data.
- `FND-032` — Fix: players could overlap (reported by the owner: the strikers stood on top of each other). Cause: nothing separated players. Pressing defenders walked to the carrier's exact position, tackles fired only within 0.025 (tokens are 0.05 across, so a tackle meant fully stacked tokens), and drags, nudges, and preset loads could stack players. Fix: `separatePlayers()` and the aspect-corrected `spacingDistance()` in `js/geometry.js` keep every pair at least `SIMULATION.playerSpacing` (0.05) apart at the end of every simulation step (restart taker pinned, kickoff half preserved, ball re-synced to its carrier), and `commitChange()` in `js/app.js` applies the same rule after every coaching change (placed player stays, others step aside and take the new spot as their anchor). `SIMULATION.tackleDistance` moved from 0.025 to 0.06 on-screen distance so tackles still fire at token contact. Evidence: `js/geometry.js`, `js/simulation.js`, `js/constants.js`, `js/app.js`, `tests/player-spacing.test.mjs` (geometry, strikers stacked, two 10-minute matches asserting no overlap and that tackles still happen, all four formation pairings, built-in scenarios). Local `npm test` 2026-10-28: 118 tests, 118 pass, 0 fail; over 10 simulated minutes the smallest on-screen gap was 0.05 in good-spacing mode and 0.0497 in bunching mode. The built-in scenarios' authored coordinates have players only 0.01 to 0.02 apart; they are separated on load rather than re-authored, and no change moves a player more than one token width. The DOM path (drag, nudge, load settling in `commitChange`) has no automated test and was not exercised in a browser. Source for the owner's report: owner message to the agent, 2026-10-28.
- `FND-031` — Place and hold players in their own half for a post-goal kickoff until release, including when custom anchors and optional zone constraints conflict. Status: implemented with integration coverage; cache `v10` refreshes the simulation and compact layout. Evidence: `js/simulation.js`, `tests/restart-integration.test.mjs`.
- `FND-030` — Move the defending goalkeeper toward an opposing shot's projected goal-line crossing. Status: implemented and locally tested at both ends; ordinary zone constraints apply and keepers outside their own penalty area cannot make a remote save. The fixed shot cycle was retuned and its actual catch/parry/goal/miss outcomes were exercised in a centered reference scenario at all three speeds. Evidence: `js/simulation.js`, `js/constants.js`, `js/restarts.js`, `tests/shots.test.mjs`; cache `v9` refreshes the runtime.

## Open PRD gaps

The PRD is not complete. An independent clause-by-clause audit on 2026-10-28 (code read, no browser) found these gaps; each is real work, not verified-as-done, and is ordered by importance.

- PRD §5.1 per-player bench: only the whole opposing team can be hidden (`#away-visible`); no individual player can be moved off the pitch for unopposed drills.
- PRD §7.1 curved arrows: pass and run arrows are straight lines; "straight or curved ball paths" is only half met.
- PRD §9.2.3 player popover: tapping a player opens a centered modal `<dialog>` (`#player-dialog`, `openPlayerEditor` in `js/app.js`), not a compact popover next to the token.
- PRD §5.2.2 color swatches: team and goalkeeper colors are chosen from `<select>` lists in `#colors-dialog`, not quick-select swatches.
- PRD §9.2.1 hit areas: some targets are below 48 CSS px: theme/formation selects, zone buttons, and zone selects are 44px in `styles.css`; ball hit radius 18 (36px) and cone hit radius 24 in `js/render.js`.
- PRD §4.2 optional Center Channel zone: not in `ZONES`. Open question for the owner: the PRD defines Left and Right as halves (§10.2) but also as configurable wing channels (y 0 to 0.33 and 0.67 to 1), so the Center Channel's y range is undefined.
- PRD §6.2 offside at the build-out line: implemented as a support-position clamp (`clampSupportForOffside` in `js/geometry.js`); whether it fully enforces the build-out line was not verified.

## Partially implemented PRD areas

- CPU-vs-CPU simulation: passing with opponent-lane avoidance, dribbling movement, pressing, deterministic varied shooting, goalkeeper catch/parry outcomes, build-out retreat, spacing modes, simplified offside support, explicit restarts, and optional zone constraints exist. It remains a teaching simulation rather than a complete Laws-of-the-Game engine.
- Restart procedures: ownership and placement flow exist; detailed procedural constraints such as opponent restart distances, throw-in body mechanics, and the IFAB five-second anti-delay protocol are not modeled.
- Goal-kick geometry: the board does not draw a separate IFAB goal area; goal kicks use the goalkeeper-side center (`x = 0.08` home / `x = 0.92` away, `y = 0.5`) to preserve existing U9 build-out teaching behavior.
- Goalkeeping: keepers track an incoming shot and can catch or parry it deterministically, but save reach is a simplified lateral threshold rather than a full collision or diving model.
- Coaching props: cones, mini goals, and extra movable soccer balls exist; the PRD §7.2 prop list is complete.
- Saved library: save/load/edit/delete, category tabs/filtering, built-in scenarios, backup import/export, and in-app two-step deletion exist. Rendered Chromium interaction verification covered tabs, editor, and deletion; physical-iPad testing remains outstanding.
- Zone teaching: highlights, overlap emphasis, Keep inside, and Keep out constraints exist using the same selected-zone geometry as rendering.

## Verification evidence

Baseline before implementation: repository contained only `PRD.md`; no executable application or tests existed.

Automated and targeted checks for this work unit:

- Restart TDD first failed before `js/restarts.js`; integration testing then exposed/fixed the pre-existing in-flight-pass carrier reacquisition defect.
- Shot/keeper testing covers wide shots, catches, parries, goals, both ends, same-team last touches, fixed aim cycle, normal-play restart production, and deterministic replay. Ten simulated minutes in each spacing mode produced kickoffs/corners/goal kicks without the ball or players leaving the pitch.
- Zone TDD added keep-in, then keep-out/overlap union geometry after PRD tracing showed the opponent-exclusion requirement. State compatibility and mandatory build-out precedence are covered.
- Saved-library helper TDD first failed before `js/library.js`, then passed category/filter and keyboard-cycling tests. Static markup tests cover tablist/tabpanel/editor asset wiring; storage regression coverage proves same-ID metadata editing preserves the board snapshot.
- Pass-lane tests cover segment geometry, rerouting around a blocked best lane, and fallback when every lane is blocked.
- Goalkeeper tests cover projected crossings at both ends, non-shot passes, zone restrictions, no remote saves, generated shot-cycle outcomes at 0.5×/1×/2×, normal-play restarts, and deterministic replay. On 2026-10-27 the goalkeeper implementation passed 81/81 tests. The current local suite passed 82/82 tests and syntax checks for all `js/*.js` and `sw.js`.
- `tests/pwa-shell.test.mjs` verifies every app-shell path exists, every install-critical local HTML asset is precached, and every reachable static ES-module dependency is in `APP_SHELL`.
- **Implementation integration evidence:** GitHub Actions run `40565756748` at `5da47a0f0117e43477ff1053f3724fda1309032c` completed successfully: **81 tests, 81 pass, 0 fail, 0 skipped**, followed by successful `node --check` for every `js/*.js` module and `sw.js`. The later documentation commit `7be5e93` also passed [Validate main](https://github.com/AahPlexX/soccer/actions/runs/40565960401). Inspect Actions for later commits.
- Rendered Chromium testing covered 1024×768, 768×1024, and 390×844: saved-library save, edit, filter, and delete worked, including keyboard tabs and the compact select; no page errors or horizontal page overflow were observed. Compact portrait formation and View selectors were widened and checked at 390×844 and 320×700. Pass-option lines, goalkeeper movement, and physical iPad behavior remain unverified.

Research and standards checked in this work unit:

- IFAB Laws of the Game 2026/27: Laws 8, 15, 16, and 17 for restart ownership/procedure.
- U.S. Soccer / US Youth Soccer Player Development Initiatives: U9/U10 7v7 build-out retreat, no punts/drop-kicks, and development emphasis on width/depth/problem-solving.
- W3C WAI-ARIA Authoring Practices Tabs Pattern: `tablist`/`tab`/`tabpanel`, `aria-selected`, roving tabindex, Left/Right and Home/End keyboard behavior.
- WCAG 2.2 Reflow and keyboard/focus guidance: controls reflow rather than forcing page-level horizontal scrolling; native controls retain keyboard operation/focus styling.
- MDN native form/dialog/module guidance: labeled controls and native `<dialog>`/static ES modules remain the project pattern.
- Rechecked 2026-10-27: [W3C WCAG 2.2 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [MDN responsive design](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design), and [GitHub Pages publishing-source guidance](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site). These references do not substitute for rendered or physical-device testing.

## Known risks

- Locked 60 fps on the 2018 iPad 6th generation remains unverified on physical hardware.
- iPad Safari/PWA offline/update behavior has not been exercised on physical iPad hardware after cache generation `v12`.
- Post-zone/post-library layouts have rendered Chromium coverage at three sizes; physical-iPad usability remains unverified.
- Mini-goal touch dragging/hit-area ergonomics remain physically unverified.
- Saved-library controls have rendered Chromium interaction coverage; physical-iPad touch usability remains unverified.
- Restart flow is intentionally simplified for teaching and is not a full referee/law engine.
- Goalkeeper tracking and save reach remain a simplified teaching model and have not been verified visually in a browser.
- Pages returned HTTP 404 on 2026-10-27 before the deployment workflow existed. On 2026-10-28 [deployment run 40610498638](https://github.com/AahPlexX/soccer/actions/runs/40610498638) succeeded; the hosted URL returned HTTP 200 and the board loaded in Chromium at 1024×768 without page errors. [Validation run 40610498524](https://github.com/AahPlexX/soccer/actions/runs/40610498524) passed for commit `eb53a03`.

## Repository invariants

- `main` is authoritative; concurrent-agent changes must be re-read and preserved before every write.
- Do not add preset formations beyond 1-3-2-1 and 1-2-3-1.
- Keep normalized tactical coordinates independent from rendered pixel dimensions.
- Do not persist a running simulation state.
- While `simulation.ballTarget` is active, do not synthesize a carrier before the moving ball reaches a player or a boundary restart.
- Keep zone constraints optional; selected zones are the single source of zone geometry for both highlighting and simulation constraints.
- Mandatory U9 build-out retreat and explicit legal restart placement take precedence over optional coach-created zone constraints.
- Built-in saved scenarios are immutable; metadata editing applies only to user presets and must preserve the saved board snapshot.
- Keep new static module dependencies in the `sw.js` app shell and `tests/pwa-shell.test.mjs` green. Each Pages deployment stamps a new cache identity; bump the application patch version for significant updates.
- `.github/workflows/validate.yml` must remain green for automated checks on `main`; browser and physical-iPad checks are separate evidence and must not be inferred from CI.
- Update `ARCHITECTURE.md`, `PROJECT_STATE.md`, and relevant README status in the same work unit as behavior changes.
