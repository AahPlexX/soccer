# Project state

Last updated: 2026-10-26
Branch: `main`
PRD status: in progress
Schema version: `1`

## Resume here

Current state: the repository has moved from PRD-only to a working static-board foundation with pitch rendering, the two required formations, touch/keyboard manipulation, selectable zones, player and team color editing, telestration, cones, mini goals, extra balls, all four built-in teaching scenarios, a first CPU-vs-CPU teaching simulation, persistence, JSON backup, and PWA caching.

Next action: implement the remaining PRD coaching content and simulation completeness in this order: explicit set-piece restart states (out-of-bounds detection, goal kick, throw-in, corner, kickoff); zone-restriction drills; richer saved-library category filtering/editing and an in-app delete confirmation replacing `confirm()`; real-device iPad performance/accessibility verification.

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
- `FND-009` — Provide offline app-shell caching and installable manifest. Status: implemented in source. Evidence: `sw.js`, `manifest.webmanifest`, `icons/`.
- `FND-010` — Maintain mandatory repository documentation. Status: implemented. Evidence: `README.md`, `ARCHITECTURE.md`, `PROJECT_STATE.md`, `PRD.md`.
- `FND-011` — Provide the four required built-in U9 teaching scenarios. Status: implemented and unit-tested. Evidence: `js/builtins.js`, `tests/builtins.test.mjs`.
- `FND-012` — Support extra movable soccer balls in addition to cones. Status: implemented. Evidence: `index.html`, `js/app.js`, `js/render.js`.
- `FND-013` — Keep the full application shell usable in 1024×768 landscape, 768×1024 portrait, and 1366×1024 desktop/tablet rendering without page overflow; keep portrait token labels upright. Status: implemented and rendered in headless Chromium. Evidence: `styles.css`, `js/render.js`; three viewport render pass with zero page errors.

- `FND-014` — Support drag-and-drop mini-goals/pug goals as drill props (PRD §7.2). Status: implemented; state normalization unit-tested. Evidence: `js/state.js` (`miniGoals`), `js/render.js` (`buildMiniGoal`), `js/app.js` (`minigoal` tool, `findObject`, remove-selected), `index.html`, `styles.css`, `tests/state.test.mjs`. Requires human/browser verification of the touch drag and hit area; not yet exercised in a browser.

## Partially implemented PRD areas

- CPU-vs-CPU simulation: basic passing, dribbling movement, pressing, shooting, build-out retreat, spacing modes, and simplified offside support positioning exist. Explicit throw-in, corner, kickoff, and goal-kick restart state machines do not yet exist.
- Coaching props: cones, mini goals, and extra movable soccer balls exist. The PRD §7.2 prop list is complete.
- Saved library: save/load/delete, backup import/export, and the four built-in teaching scenarios exist. Category filtering/editing is not yet implemented.
- Zone teaching: highlights and overlap emphasis exist. Simulation zone-restriction constraints are not yet implemented.

## Verification evidence

Baseline before implementation: repository contained only `PRD.md`; no executable application or tests existed.

Automated checks for this work unit:

- `npm test` — must pass before integration; covers approved formation restriction, mirrored anchors, coordinate clamps, offside support boundaries, carrier acquisition, build-out retreat, goalkeeper wait behavior, built-in presets, and board-state normalization including `miniGoals`. Last run 2026-10-26: 17 tests, 17 pass, 0 fail.
- JavaScript syntax checks — must pass for all `js/*.js` and `sw.js` before integration.
- Headless Chromium render smoke test — actual application modules rendered at 1024×768, 768×1024, and 1366×1024 with 14 player tokens, eight zone overlays, and zero page errors. The connected remote Playwright service returned an upstream 404, so this validation used the local Chromium binary with an in-memory document rather than HTTP navigation. Service-worker behavior is therefore not covered by this render smoke test.

Browser/source standards applied in this work unit:

- Pointer Events with `touch-action` on the interactive surface.
- WCAG 2.2 keyboard focus and non-drag alternative considerations.
- Native service-worker install/activate/fetch caching for the fixed app shell.
- Apple standalone web-app meta support without globally disabling viewport zoom.

## Known risks

- Locked 60 fps on the 2018 iPad 6th generation is a PRD requirement but remains unverified on physical hardware.
- iPad Safari/PWA offline behavior is implemented from current platform guidance but has not yet been exercised on physical iPad hardware.
- The current simulation is a teaching model, not a complete match-law engine. Remaining set-piece and goalkeeper behaviors are tracked above.
- `confirm()` is currently used before deleting a saved preset. It is functional but should be replaced by an in-app confirmation dialog for consistent standalone-PWA presentation.

## Repository invariants

- `main` is the authoritative branch.
- Do not add preset formations beyond 1-3-2-1 and 1-2-3-1.
- Keep normalized tactical coordinates independent from rendered pixel dimensions.
- Do not persist a running simulation state.
- Changes to cached app-shell files must update `sw.js` cache version/list.
- Update `ARCHITECTURE.md` and this file in the same change as behavior changes.
