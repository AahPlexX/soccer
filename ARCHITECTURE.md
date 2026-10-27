# Architecture

Last updated: 2026-10-26

## Runtime shape

The application is a zero-build static web app. `index.html` loads native ES modules from `js/`, so GitHub Pages can serve the repository directly without a bundler or runtime framework.

The main boundaries are:

- `js/builtins.js`: the four PRD teaching scenarios as deterministic board-state factories.
- `js/constants.js`: schema version, pitch dimensions, zone boundaries, colors, and simulation constants.
- `js/formations.js`: the only permitted formation definitions and player anchor creation.
- `js/geometry.js`: normalized-coordinate math, pointer-to-pitch conversion, movement helpers, and offside boundaries.
- `js/restarts.js`: pure out-of-bounds classification and normalized restart placement for throw-ins, goal kicks, corners, and kickoffs after goals.
- `js/state.js`: board state creation and schema normalization.
- `js/storage.js`: 120 ms autosave to localStorage, IndexedDB saved-position library, localStorage fallback, and JSON backup import/export.
- `js/simulation.js`: CPU-vs-CPU state updates, build-out retreat, positional tethering, pressure, passing, shooting, simplified offside positioning, and automated restart integration.
- `js/render.js`: SVG pitch construction, orientation transform, zone overlays, tokens, props, and drawings.
- `js/app.js`: UI event wiring, Pointer Events, keyboard alternatives, dialogs, persistence triggers, service-worker registration, and the requestAnimationFrame loop.
- `sw.js`: app-shell precache, stale-cache cleanup, same-origin cache-first fetch handling with index fallback.
- `tests/`: Node standard-library behavior and integrity tests, including simulation restart rules and the service-worker app-shell contract.
- `.github/workflows/validate.yml`: automatic `main` validation using the pinned Node.js LTS runtime, behavior/integrity tests, and JavaScript syntax checks.

## Coordinate system

All tactical state uses normalized coordinates from the PRD:

- `x = 0.0`: our goal line.
- `x = 0.5`: halfway line.
- `x = 1.0`: opposing goal line.
- `y = 0.0`: left touchline when attacking left-to-right.
- `y = 1.0`: right touchline.

The SVG world is 1000 × 680 units. Landscape maps `(x, y)` directly to `(x × 1000, y × 680)`. Portrait changes the SVG viewBox to 680 × 1000 and rotates the field world 90 degrees. Player, ball, cone, and mini-goal visual groups counter-rotate so their visual orientation remains usable to the coach. Pointer positions are converted through the inverse `getScreenCTM()` transform, so the normalized model does not change with orientation.

## Pitch constants

The implementation currently uses the PRD's exact normalized boundaries:

- home build-out line: `x = 0.35`.
- opposing build-out line: `x = 0.65`.
- home penalty area: `x = 0.00..0.20`, `y = 0.20..0.80`.
- opposing penalty area: `x = 0.80..1.00`, `y = 0.20..0.80`.
- left zone: `y = 0.00..0.50`.
- right zone: `y = 0.50..1.00`.

Zone rectangles are independent SVG overlays. Selecting overlapping zones causes ordinary alpha compositing, making their intersection visually stronger without introducing a second geometry model.

## Formation model

`formationAnchors(team, formation)` accepts exactly `1-3-2-1` and `1-2-3-1`. Home anchors are canonical. Away anchors mirror both axes so the teams face one another while preserving left/right positional relationships from each team's attacking perspective.

Each player keeps:

- stable ID and team.
- role, jersey number, and short label.
- current normalized position.
- formation anchor position.
- optional individual color override.

## Drill props

Board state holds three prop collections, all in normalized coordinates: `balls` (`{id, x, y, primary}`; exactly one primary match ball that cannot be removed), `cones` (`{id, x, y, color}`), and `miniGoals` (`{id, x, y}`). Props are draggable and keyboard-nudgeable through the shared `findObject()` lookup in `js/app.js`, and are rendered in `#prop-layer` / `#ball-layer` by `js/render.js`. `normalizeState()` defaults a missing or non-array `miniGoals` to `[]`, so saves from before mini goals load unchanged and `SCHEMA_VERSION` stays `1`. The simulation ignores props. Adding a new prop type requires: a state array plus `normalizeState` default, a `build*` renderer and `rebuildObjects`/`renderScene` entries, a `findObject` branch, an add tool in `index.html`/`handleDrawPointerDown`, the remove-selected handler, and CSS for its hit area.

Applying a formation updates role, current position, and anchor position for that team. Free dragging changes only current position until the coach chooses another formation.

## State and persistence

Schema version: `1`.

Current board state is serialized under `u9_tactical_board_state_v1` after a 120 ms debounce. Running simulation state is forced to paused on persistence.

Saved positions are stored in IndexedDB database `u9_tactical_board_v1`, object store `presets`, keyed by UUID. If IndexedDB is unavailable, the saved library falls back to `u9_tactical_board_presets_v1` in localStorage.

A saved preset contains title, category, timestamp, schema version, and the full board state. JSON export contains the current board plus all presets. Import requires the same schema version and merges presets by ID.

The restart integration adds two backward-compatible simulation fields without changing the schema version:

- `lastTouchTeam`: `home` or `away`, used to determine possession for throw-ins, goal kicks, and corners.
- `restart`: `null` during open play, otherwise an object describing the current explicit restart (`type`, `team`, `side`, and `scoredBy` for a kickoff after a goal).

`normalizeState()` merges an older saved simulation object over the new defaults, so saves created before these fields existed receive `lastTouchTeam: 'home'` and `restart: null` automatically. Persisted simulations still always resume paused.

## Simulation state machine

The current engine is a deterministic teaching simulation with these states represented in `state.simulation`:

- possession team.
- carrier ID or loose ball.
- receiver ID while a pass is in flight.
- ball target.
- last-touch team.
- explicit restart state or open play.
- action clock.
- running/paused state.

At each animation frame, `stepSimulation()` scales elapsed time by the selected speed. Player movement uses normalized units per second and is independent of display resolution.

Rules implemented now:

- goalkeeper build-out: while a goalkeeper holds the ball in its penalty-side region, opponents retreat beyond that goalkeeper-side build-out line before the action decision can release the ball.
- no punt/drop-kick action exists in the engine; goalkeeper release uses the same ground-pass target mechanism as other passes.
- formation tethering: non-carriers shift from their saved anchors as the ball moves.
- good-spacing mode preserves anchors; bunching mode moves players toward the ball with small offsets.
- nearest out-of-possession field player presses the ball when no build-out retreat is active.
- attacking support targets are clamped by a simplified build-out-line/second-last-defender/ball offside boundary.
- passes remain loose/in flight until the ball reaches a receiver; `ensureCarrier()` intentionally does not acquire a new carrier while `ballTarget` is active.
- boundary classification creates explicit throw-in, goal-kick, corner, or kickoff states rather than treating every goal-line arrival as a goal.
- a goal through the scaled goal mouth resets both teams to formation anchors and creates a kickoff for the team that conceded.
- an attacking-team last touch over a goal line outside the goal mouth creates a goal kick for the defending team.
- a defending-team last touch over its own goal line outside the goal mouth creates a corner for the attacking team.
- a last touch over either touchline creates a throw-in for the opposing team at the exit `x` coordinate.
- restart takers remain stationary until the next simulation decision releases the ball as a pass. Goal-kick takers use the goalkeeper, so the existing U9 build-out retreat gate remains in force before the restart is released.

### Restart geometry and deliberate simplifications

`js/restarts.js` keeps classification and placement pure so it can be tested independently of animation. The rendered goal width uses the existing 18.5 ft goal on a nominal 40 yd field ratio, and the same scaled mouth is used to distinguish a goal from a ball crossing the goal line outside the posts.

The current pitch model does not draw a separate IFAB goal area, so a goal kick is placed at the team's goalkeeper-side center point (`x = 0.08` home or `x = 0.92` away, `y = 0.5`) to align with the existing goalkeeper anchors and U9 build-out teaching behavior. This is a deliberate teaching approximation, not a claim of full match-law geometry.

The engine does not yet enforce every procedural detail of the 2026/27 Laws of the Game around restarts (for example opponent distance at throw-ins/corners/kickoffs, throw-in body mechanics, or the five-second anti-delay protocol). The implemented scope is the PRD's automated restart flow plus the U9 build-out behavior.

Research basis checked 2026-10-26: IFAB Laws 8, 15, 16, and 17 for restart ownership/procedure; U.S. Soccer / US Youth Soccer Player Development Initiatives for the U9/U10 7v7 build-out retreat and no-punt/drop-kick behavior.

Not yet implemented: foul handling; richer pass-lane scoring; goalkeeper catches; zone-restriction constraints; deterministic seeded scenario playback.

## Rendering and performance

Static pitch geometry is built once. During live simulation, the animation loop mutates only token transforms and active presentation state. Object layers are rebuilt only when object count/content changes, such as adding a cone or mini goal or editing a player label.

`requestAnimationFrame` drives rendering. Simulation delta time is capped at 50 ms to avoid large jumps after backgrounding. The PRD's locked 60 fps target on the 2018 iPad baseline is not yet hardware-verified.

## Input and accessibility

Pointer Events provide one input path for touch, pen, and mouse. The pitch alone uses `touch-action: none` to prevent browser gesture takeover while dragging or drawing. The page does not use `user-scalable=no`; browser zoom is not globally disabled.

Players, balls, cones, and mini goals are keyboard focusable. Extra balls, cones, and mini goals can be removed without exposing deletion for players or the primary match ball. Arrow keys nudge movable objects by 1% of the pitch; Shift+Arrow uses 2.5%. Pressing Enter on a player opens the editor. The player dialog also provides nudge controls, so player positioning is not drag-only.

Every primary control is a native button, select, input, or dialog control. Focus-visible styling uses a 3 px high-contrast outline. The intended minimum interactive target is 48 CSS px.

The shell uses named CSS Grid areas (`top`, `zones`, `workspace`, `bottom`) so hiding the zone panel cannot change auto-placement order. At narrower landscape widths, top controls reflow into a four-column grid and dock control groups wrap. In portrait, the top rail reflows to three columns and the bottom dock stacks its three functional groups, preserving the tactical surface without horizontal page overflow.

## Offline model

`sw.js` precaches the current app shell during install, removes older `u9-tactical-board-*` caches during activation, claims clients, and serves cached same-origin requests before the network. Cache misses that return a successful same-origin basic response are cached for later use.

Any app-shell file added, removed, or renamed requires both `APP_SHELL` and `CACHE_NAME` to be updated in the same change.

The restart integration adds `js/restarts.js` to the static ES-module graph, so the app shell includes it and advances the cache generation to `u9-tactical-board-v4`.

`tests/pwa-shell.test.mjs` protects this contract by verifying that every declared app-shell file exists, every install-critical local asset referenced by `index.html` is precached, and every static ES-module dependency reachable from the cached module graph is also in `APP_SHELL`.

## Validation pipeline

`.github/workflows/validate.yml` runs on every push to `main` and on manual dispatch. It uses Ubuntu 24.04 and Node.js 24.22.1 LTS. Third-party GitHub Actions are pinned to full commit SHAs, checkout credentials are not persisted, and the workflow token has read-only repository-content access.

The validation gate runs:

1. `npm test`, which executes the Node standard-library behavior and repository-integrity test suite.
2. `node --check` against every `js/*.js` runtime module and `sw.js`.

A successful workflow run is repository evidence for those automated checks only. It does not replace rendered-browser checks or physical-iPad performance, touch, standalone-PWA, and offline verification.
