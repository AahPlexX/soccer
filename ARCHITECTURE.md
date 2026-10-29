# Architecture

Last updated: 2026-10-28

## Runtime shape

The application is a zero-build static web app. `index.html` loads native ES modules from `js/`, so GitHub Pages can serve the repository directly without a bundler or runtime framework.

The main boundaries are:

- `js/builtins.js`: the four PRD teaching scenarios as deterministic board-state factories.
- `js/constants.js`: schema version, pitch dimensions, zone boundaries, colors, and simulation constants.
- `js/formations.js`: the only permitted formation definitions and player anchor creation.
- `js/geometry.js`: normalized-coordinate math, pointer-to-pitch conversion, movement helpers, and offside boundaries.
- `js/restarts.js`: pure out-of-bounds classification and normalized restart placement for throw-ins, goal kicks, corners, and kickoffs after goals.
- `js/zone-constraints.js`: pure keep-inside/keep-out geometry over the existing selected-zone union plus team-scope checks.
- `js/library.js` and `js/library-ui.js`: saved-library filtering, keyboard tabs, and metadata editing.
- `js/pass-options.js` and `js/pass-options-ui.js`: shared open-lane calculation and the optional pass-options toggle.
- `js/state.js`: board state creation and schema normalization.
- `js/storage.js`: 120 ms autosave to localStorage, IndexedDB saved-position library, localStorage fallback, and JSON backup import/export.
- `js/simulation.js`: CPU-vs-CPU state updates, build-out retreat, positional tethering, pressure, passing, deterministic shooting/goalkeeper outcomes, simplified offside positioning, automated restarts, and optional zone constraints.
- `js/render.js`: SVG pitch construction, orientation transform, zone overlays, tokens, props, and drawings.
- `js/app.js`: UI event wiring, Pointer Events, keyboard alternatives, dialogs, persisted zone controls, service-worker registration, and the requestAnimationFrame loop.
- `sw.js`: app-shell precache, stale-cache cleanup, same-origin cache-first fetch handling with index fallback.
- `tests/`: Node standard-library behavior and integrity tests, including simulation, restart, shot/goalkeeper, zone-constraint, state-compatibility, and service-worker app-shell coverage.
- `.github/workflows/validate.yml`: automatic `main` validation using the pinned Node.js LTS runtime, behavior/integrity tests, and JavaScript syntax checks.
- `.github/workflows/pages.yml`: validates and stages the static app for deployment to the GitHub Pages environment on `main` pushes or manual dispatch.

## Coordinate system

All tactical state uses normalized coordinates from the PRD:

- `x = 0.0`: our goal line.
- `x = 0.5`: halfway line.
- `x = 1.0`: opposing goal line.
- `y = 0.0`: left touchline when attacking left-to-right.
- `y = 1.0`: right touchline.

The SVG world is 1000 × 680 units. Landscape maps `(x, y)` directly to `(x × 1000, y × 680)`. Portrait changes the SVG viewBox to 680 × 1000 and rotates the field world 90 degrees. Player, ball, cone, and mini-goal visual groups counter-rotate so their visual orientation remains usable to the coach. Pointer positions are converted through the inverse `getScreenCTM()` transform, so the normalized model does not change with orientation.

## Pitch constants and zones

The implementation currently uses the PRD's exact normalized boundaries:

- home build-out line: `x = 0.35`.
- opposing build-out line: `x = 0.65`.
- home penalty area: `x = 0.00..0.20`, `y = 0.20..0.80`.
- opposing penalty area: `x = 0.80..1.00`, `y = 0.20..0.80`.
- left zone: `y = 0.00..0.50`.
- right zone: `y = 0.50..1.00`.

Zone rectangles are independent SVG overlays backed by the single `ZONES` object in `js/constants.js`. Selecting overlapping zones causes ordinary alpha compositing, making their intersection visually stronger without introducing a second geometry model. The simulation constraint layer consumes the same selected zone IDs and the same `ZONES` rectangles, so rendering and rules cannot silently drift into two incompatible definitions. Paint order inside `#pitch-world`: the zone layer is drawn first and the `.pitch-markings` group (outer boundary, lines, circles, goals) on top of it, so every markings shape must be unfilled: `.pitch-markings { fill: none }` in `styles.css` sets that default (SVG's default fill is solid black, and an unfilled-by-accident outer rectangle hides the grass and all zone highlights); shapes that need a fill, such as `.field-dot`, set their own. `tests/pitch-markings.test.mjs` guards the rule and the layer order.

### Zone-constraint model

The coach controls two persisted fields:

- `zoneRestrictionMode`: `off`, `keep-in`, or `keep-out`.
- `zoneRestrictionScope`: `home`, `away`, or `both`.

The selected zones form a union.

- **Keep inside:** a scoped player's requested target and resulting movement position are projected to the nearest point in the selected-zone union when they would otherwise leave it.
- **Keep out:** if a scoped player occupies the selected-zone union, the point is projected to the nearest legal point outside that union. Candidate x/y coordinates are derived from rectangle boundaries plus a small epsilon and checked against every selected rectangle, so overlapping zone selections are exited as a union rather than one rectangle at a time.
- **Off or no selected zones:** movement is unchanged.

Simulation movement constrains both the target and the post-step position. This prevents a large step from crossing through a restricted boundary between frames.

Rule precedence is intentional:

1. explicit legal restart-taker placement and the goalkeeper's mandatory U9 build-out hold remain fixed;
2. mandatory U9 opponent build-out retreat ignores optional coach zone constraints until retreat/release requirements are satisfied;
3. ordinary open-play movement then applies the coach's optional zone rule.

After the mandatory phase ends, the optional zone constraint becomes active again. This priority prevents a drill setting from making the project's required U9 rule behavior impossible.

## Formation model

`formationAnchors(team, formation)` accepts exactly `1-3-2-1` and `1-2-3-1`. Home anchors are canonical. Away anchors mirror both axes so the teams face one another while preserving left/right positional relationships from each team's attacking perspective.

Each player keeps:

- stable ID and team.
- role, jersey number, and short label.
- current normalized position.
- formation anchor position.
- optional individual color override.

Applying a formation updates role, current position, and anchor position for that team. Free dragging changes only current position until the coach chooses another formation.

## Saved library UI

`js/app.js` (`refreshSavedList()`) renders the dialog list: built-in scenarios first, then saved presets, both through `filterPresetsByCategory()` from `js/library.js` using the view-only `savedFilter` (not persisted). `#saved-filter` (a native `<select>`) holds the filter value; the tab strip in `js/library-ui.js` (ARIA `tablist`; click, ArrowLeft/ArrowRight with wrap, Home, End) sets the select and dispatches `change`, and the select's listener re-syncs the tabs. Every saved row carries `data-preset-id`; `augmentCustomRows()` in `js/library-ui.js` looks the preset up by that id and inserts an Edit button before the row's Delete button. Edit opens `#preset-edit-dialog` (title up to 48 characters, category from `PRESET_CATEGORIES`) and persists through the existing `savePreset()`. Built-in scenarios have no Edit or Delete. Delete is a two-step in-app confirmation (first tap arms "Tap again to delete" for 4 seconds) instead of native `confirm()`, which is unreliable in standalone Home Screen apps.

## Pass-options overlay

The optional Pass options button is a view-only pressed-state toggle created by `js/pass-options-ui.js`. It dispatches `pass-options-change` to request an immediate redraw even while paused. `js/render.js` reuses six noninteractive, `aria-hidden` SVG lines and shows the open receivers returned by `availablePassOptions()`; no lines appear without a stationary visible carrier. `openPassReceivers()` is shared with the CPU pass selector, including its opponent-lane clearance calculation. A live status explains a loose or in-flight ball, hidden carrier, blocked lanes, or the number of available lanes. The overlay itself is not persisted. The CPU falls back to a blocked receiver if no lane is open, so an empty overlay does not mean that the CPU cannot pass.

## 3D camera view

Three layers keep the 3D view testable and lazy. `js/camera-orbit.js` is pure data and math: an orbit `{ target, azimuth, polar, distance }` (polar 0 is straight down, azimuth 0 is the broadcast side at +z), the presets (`top`, `broadcast`, `goal`, `sideline`), and `rotateOrbit`, `zoomOrbit`, `panOrbit`, `clampOrbit` (polar and distance limited, the pan target kept near the pitch), with distances widened for viewports narrower than 4:3. `js/board-scene.js` receives Three.js as an argument and never imports it or touches a canvas: `buildBoardScene(THREE, { makeTexture })` returns `{ scene, sync(state), dispose, counts, objectFor }`; `sync()` reconciles players, balls, cones, and mini goals by id each frame (adds, updates, removes and disposes), shows zone overlays from `selectedZones` and `zoneOpacity`, hides hidden opponents and benched players (`player.benched`: simulation, pass options and spacing also ignore them; see `stepSimulation`), and shows a selection ring. `toWorld(x, y)` maps board coordinates to world space (board x along world x, board y across world z, 60 × 40.8 yards, the 2D board's shape and orientation), and the pitch texture is painted with `drawPitchTexture()` so canvas pixel (px, py) is board point (px / width, py / height). `js/view3d.js` owns the WebGL renderer, the render loop, and the pointer, pinch, and wheel controls; `js/app.js` imports it with a dynamic `import()` the first time the coach presses "3D view", so Three.js (`vendor/three/`, pinned `0.186.1`, see `vendor/three/README.md` for provenance and the update procedure) is never loaded for 2D use. If `createView3D()` throws (no WebGL) or the WebGL context is lost, the app shows a message and stays on, or returns to, the 2D board. While 3D shows, the SVG board is hidden (`display: none`) and the Zoom in, Zoom out, and Fit buttons drive the 3D camera; 2D remains the annotation surface; 1.0.6 adds opt-in 3D ground-plane object dragging. A texture multiplies a material's color, so a textured material must have a white base color. Ground-plane raycasting is implemented by CAM-004 in 1.0.6.

## Zoom and pan

The 2D board's zoom and pan is a view `{ scale, x, y }` (`js/view-zoom.js`, scale 1 to 4, `x`/`y` in viewBox units) applied as `translate(x y) scale(scale)` to the `#pitch-view` group that wraps `#pitch-world` (which keeps the portrait orientation transform). `clampView()` keeps the zoomed content covering the viewport, so the pitch can never be panned off screen; `zoomAt()` keeps the focus point fixed on screen. `js/app.js` drives it from the Zoom in, Zoom out, and Fit buttons, the wheel (a trackpad pinch arrives as a wheel event with `ctrlKey`), a two-finger touch pinch plus pan, and a one-pointer pan on empty space with the Move tool. The gesture handlers are capture-phase listeners that run before the move and draw handlers; a second finger cancels any drag or stroke the first finger started. Because every pointer position is converted with `pitchPointFromClient()`, which inverts the world's `getScreenCTM()` (including ancestor transforms), moving, drawing, and placing stay accurate at any zoom with no per-feature changes. The view is not persisted, not part of undo history, and is re-clamped when the viewBox changes with device orientation. The implemented 3D camera keeps its own orbit and zoom (`CAM-002`, `CAM-003`, `CAM-007`).

## Undo and redo

`createHistory()` in `js/history.js` stores JSON snapshots of `EDIT_KEYS`, the content a coach builds, and nothing transient (no tool, theme, speed, selection, or `simulation`). `commitChange()` in `js/app.js` is the single funnel for coaching changes, so it calls `record()` after `settlePlayers()`: a step is added only when the serialized content differs from the baseline, which makes one drag, stroke, editor save, preset load, import, or reset exactly one step and tool or theme changes zero steps. While `state.simulation.running`, it calls `rebase()` instead (the simulation moving players is not an edit). `stepHistory()` applies a snapshot, then clears `selectedObjectId`, stops the simulation, and drops any carrier, pass target, and restart because the restored players and ball make them stale, then re-renders with a rebuild. The cap is 50 steps; history is in memory only and is re-seeded from the autosaved board on load. Adding a new edited field to the board state requires adding its key to `EDIT_KEYS`, otherwise changes to it will not be undoable.

## Drawing tools

Tools live in `TOOLS` (`js/state.js`); each drawing is `{ id, type, points }` with `type` in `DRAWING_TYPES`: `freehand` (a point trail), `arrow` (solid pass/shot arrow) and `run` (dashed player run/dribble arrow, PRD 7.1). `DRAWING_TYPE_BY_TOOL` in `js/app.js` maps the `draw`, `arrow`, and `run` tools to their type; every type except `freehand` is a two-point line whose second point follows the pointer. `js/render.js` draws two-point types as a line with the shared arrowhead marker and adds the `drawing-run` class for `run`; `styles.css` gives it `stroke-dasharray`. An unknown stored type normalizes to `freehand`. Curved arrows are not implemented.

Cone color: `state.coneColor` (hex, default `PALETTE.orange`, validated in `normalizeState`) is the color of newly placed cones, passed to prop factories through `addProp(state, tool, point)`; the "Cone color" select in the toolbar changes it and also recolors the selected cone (`js/app.js`).

## Drill props

Board state holds three prop collections, all in normalized coordinates: `balls` (`{id, x, y, primary}`; exactly one primary match ball that cannot be removed), `cones` (`{id, x, y, color}`), and `miniGoals` (`{id, x, y}`). Props are draggable and keyboard-nudgeable through the shared `findObject()` lookup in `js/app.js`, and are rendered in `#prop-layer` / `#ball-layer` by `js/render.js`. `normalizeState()` defaults a missing or non-array `miniGoals` to `[]`, so saves from before mini goals load unchanged and `SCHEMA_VERSION` stays `1`. The simulation ignores props.

Adding a new prop type requires: a state array plus `normalizeState` default, a `build*` renderer and `rebuildObjects`/`renderScene` entries, a `findObject` branch, an add tool in `index.html`/`handleDrawPointerDown`, the remove-selected handler, and CSS for its hit area.

## State and persistence

Schema version: `1`.

Current board state is serialized under `u9_tactical_board_state_v1` after a 120 ms debounce. Running simulation state is forced to paused on persistence.

Saved positions are stored in IndexedDB database `u9_tactical_board_v1`, object store `presets`, keyed by UUID. If IndexedDB is unavailable, the saved library falls back to `u9_tactical_board_presets_v1` in localStorage. Reads merge both stores; fallback tombstones prevent deleted database entries from reappearing. Writes wait for transaction completion and report failures to the coach.

A saved preset contains title, category, timestamp, schema version, and the full board state. JSON export contains the current board plus all presets. Import validates metadata and the schema version before merging presets by ID. The loaded saved preset is restored as the reset baseline after reload; for an unsaved board the autosaved board becomes the baseline on reload.

Backward-compatible additive state currently includes:

- `simulation.lastTouchTeam`: `home` or `away`, used to determine restart ownership.
- `simulation.restart`: `null` during open play, otherwise the current explicit restart object.
- `simulation.shotCount`: selects the next deterministic shot-aim offset.
- `zoneRestrictionMode`: defaults to `off` for saves created before zone constraints existed.
- `zoneRestrictionScope`: defaults to `home`; invalid persisted values normalize to safe supported values.

`normalizeState()` merges older saved state over current defaults and validates zone-rule enums while leaving `SCHEMA_VERSION` at `1`. Persisted simulations always resume paused.

## Simulation state machine

The current engine is a deterministic teaching simulation with these states represented in `state.simulation`:

- possession team.
- carrier ID or loose ball.
- receiver ID while a pass is in flight.
- ball target.
- last-touch team.
- explicit restart state or open play.
- shot count: selects the next entry of the fixed shot-aim cycle (`SIMULATION.shotAimOffsets`).
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
- a goal through the scaled goal mouth resets both teams to formation anchors and creates a kickoff for the team that conceded. Each player is placed and held in their own half until the kickoff is released, even when custom anchors or optional zone constraints conflict; the taker occupies the center spot.
- an attacking-team last touch over a goal line outside the goal mouth creates a goal kick for the defending team.
- a defending-team last touch over its own goal line outside the goal mouth creates a corner for the attacking team.
- a last touch over either touchline creates a throw-in for the opposing team at the exit `x` coordinate.
- a shot aims at `0.5 + shotAimOffsets[shotCount % 4] + (shooter.y - 0.5) * shotAimSpread`; the offsets are `[0, 0.04, -0.07, 0.12]` and spread is `0.15`. They repeat without RNG. In a centered reference scenario the sequence yields a catch, parry, goal, and miss, but positions and shot angles can change the outcome. The ball target is extended 0.05 past the goal line along the shot's own line so boundary classification receives it.
- while an opposing shot is in flight (no receiver and a target at or beyond the keeper's goal line), the defending keeper moves at `keeperTrackingSpeed` (0.03 normalized units per simulated second) toward its projected goal-line crossing, clamped between the same goal posts used for restart classification. A keeper already inside its penalty-area x range tracks laterally; one outside moves back toward that range. A path crossing a touchline before the goal line is not tracked. Ordinary optional zone constraints still apply, and mandatory build-out retreat takes precedence.
- a shot crossing the goal line inside the goal mouth meets the defending goalkeeper first (`keeperResponse()`), provided the keeper is inside its own penalty area and the last touch was by the opponent. By `|keeper.y - shot.y|`, at most `keeperCatchReach` (0.02) the keeper holds the ball and the U9 build-out gate applies; at most `keeperParryReach` (0.05) it is deflected behind for an attacking corner; otherwise it is a goal. Save reach is an intentionally simplified lateral threshold, not a physical collision model.
- A manually moved ball or carrier releases stale possession, pass, and restart state; a loose ball remains in place until a nearby player collects it. Manual player placements update their tactical anchors.
- A nearby opposing outfield player can win possession deterministically; a five-second simulated cooldown prevents immediate repeated turnovers and held restarts and goalkeeper build-outs are protected. Attacking support advances from the own-half formation anchors as the ball progresses, subject to offside limits. This is a simplified teaching mechanic without fouls or tackle animation. "Nearby" means within `SIMULATION.tackleDistance` (0.06) of on-screen distance (see `spacingDistance()`), just outside token contact, so it must stay above `SIMULATION.playerSpacing`.
- players never overlap. `separatePlayers()` in `js/geometry.js` runs as the last step of every `stepSimulation()` call, so the invariant holds on every rendered frame: it pushes any two players closer than `SIMULATION.playerSpacing` (0.05, one token diameter) apart, splitting each overlap evenly, then the ball is re-synced to its carrier. Distances use `spacingDistance()`, which scales y by `PITCH_ASPECT` (0.68 = 680/1000, the SVG world's shape) because the pitch is shorter vertically than horizontally on screen. A held restart taker is pinned (others yield to them), and the legal kickoff half still takes precedence over spacing. Pressing players still walk to the ball and tackle, but stop at token contact instead of standing on the carrier. In `js/app.js`, `commitChange()` runs the same separation after every coaching change (drag, nudge, editor, preset or formation load): the selected player, the one the coach just placed, stays and others step aside and adopt their new spot as their anchor via `recordPlayerPosition()`. Built-in scenario coordinates themselves are tighter than one token in places and are separated when loaded.
- receiver choice (`choosePassTarget()`) skips teammates whose carrier→receiver line has any opponent within `SIMULATION.passLaneClearance` (0.05, just under the 0.055 pickup radius; the single definition is `openPassReceivers()` in `js/pass-options.js`, shared by this CPU choice and the on-screen pass options so they cannot drift apart; it measures with `distanceToSegment()` in `js/geometry.js`, so a closely marked receiver counts as blocked). Among clear receivers the existing forward-progress/lateral/distance score picks the winner; if every lane is blocked the choice falls back to all teammates, so a carrier always passes.
- restart takers remain stationary until the next simulation decision releases the ball as a pass. Goal-kick takers use the goalkeeper, so the existing U9 build-out retreat gate remains in force before the restart is released.
- ordinary player targets and positions can be constrained to remain inside or outside the coach-selected zone union for the selected team scope.

### Restart geometry and deliberate simplifications

`js/restarts.js` keeps classification and placement pure so it can be tested independently of animation. The rendered goal width uses the existing 18.5 ft goal on a nominal 40 yd field ratio, and the same scaled mouth is used to distinguish a goal from a ball crossing the goal line outside the posts.

The current pitch model does not draw a separate IFAB goal area, so a goal kick is placed at the team's goalkeeper-side center point (`x = 0.08` home or `x = 0.92` away, `y = 0.5`) to align with the existing goalkeeper anchors and U9 build-out teaching behavior. This is a deliberate teaching approximation, not a claim of full match-law geometry.

The engine does not yet enforce every procedural detail of the 2026/27 Laws of the Game around restarts (for example opponent distance at throw-ins/corners/kickoffs, throw-in body mechanics, or the five-second anti-delay protocol). The implemented scope is the PRD's automated restart flow plus the U9 build-out behavior.

Research basis checked 2026-10-26: IFAB Laws 8, 15, 16, and 17 for restart ownership/procedure; U.S. Soccer / US Youth Soccer Player Development Initiatives for the U9/U10 7v7 build-out retreat and no-punt/drop-kick behavior.

Not yet implemented: foul handling; richer pass-lane scoring; detailed goalkeeper diving/collision physics; optional procedural restart-distance enforcement; deterministic seeded scenario playback beyond the current fixed deterministic simulation behavior.

## Rendering, responsive layout, and performance

Static pitch geometry is built once. During live simulation, the animation loop mutates only token transforms and active presentation state. Object layers are rebuilt only when object count/content changes, such as adding a cone or mini goal or editing a player label.

`requestAnimationFrame` drives rendering. Simulation delta time is capped at 50 ms to avoid large jumps after backgrounding. The PRD's locked 60 fps target on the 2018 iPad baseline is not yet hardware-verified.

The shell uses named CSS Grid areas (`top`, `zones`, `workspace`, `bottom`) so hiding the zone panel cannot change auto-placement order. The expanded zone panel uses responsive reflow rather than shrinking all controls into one row:

- wide layouts: zone buttons plus opacity/rule/scope/clear controls share the panel row;
- portrait and landscape widths up to 1100 px: zone buttons occupy their own horizontally scrollable row and four settings reflow beneath;
- widths up to 760 px: the panel becomes two columns, keeps rule/scope controls side by side, preserves the prior compact behavior of hiding the opacity slider, and gives Clear zones a full row.

This keeps the tactical workspace from being squeezed by the new controls and avoids page-level horizontal overflow. The pitch remains an intentionally two-dimensional interactive surface.

The coaching layout has rendered Chromium coverage at 1024×768, 768×1024 and 390×844; physical-iPad validation remains outstanding.

## Input and accessibility

Pointer Events provide one input path for touch, pen, and mouse. The pitch alone uses `touch-action: none` to prevent browser gesture takeover while dragging or drawing. The page does not use `user-scalable=no`; browser zoom is not globally disabled.

Players, balls, cones, and mini goals are keyboard focusable. Extra balls, cones, and mini goals can be removed without exposing deletion for players or the primary match ball. Arrow keys nudge movable objects by 1% of the pitch; Shift+Arrow uses 2.5%. Pressing Enter on a player opens the editor. The player dialog also provides nudge controls, so player positioning is not drag-only.

Every primary control is a native button, select, input, or dialog control. The zone-rule and zone-scope additions are native `<select>` elements with explicit `<label for>` associations. Focus-visible styling uses a 3 px high-contrast outline. The intended minimum interactive target remains 48 CSS px, while zone selectors retain at least 44 px internal height in the compact zone panel.

## Offline model

`sw.js` precaches the current app shell during install, removes older `u9-tactical-board-*` caches during activation, claims clients, and serves cached same-origin requests before the network. Cache misses that return a successful same-origin basic response are cached for later use.

The Pages deployment stamp changes the cache identity for each deployment. Increment the app patch version for significant updates and keep the package and worker versions in sync. New static module dependencies must also be added to `APP_SHELL`.

Cache history relevant to the current runtime:

- `v4`: added `js/restarts.js` to the offline module graph.
- `v5`: refreshes the combined deterministic shot/goalkeeper runtime plus the new zone-control HTML/CSS/app/state/simulation changes, and adds `js/zone-constraints.js` to `APP_SHELL`.
- `v6`: refreshes the saved-library category filter and two-step delete confirmation in `index.html`, `styles.css`, and `js/app.js`; no `APP_SHELL` change.
- `v7`: adds `./library.css`, `./js/library.js`, and `./js/library-ui.js` to `APP_SHELL`. They were referenced by `index.html` / the static module graph but were not precached, so the saved-library tabs, editor, and styling would have been missing offline (`tests/pwa-shell.test.mjs` failed on this at `431ef15`).
- `v8`: adds the pass-option stylesheet and modules to the app shell.
- `v9`: refreshes the shot, goalkeeper, and restart modules for goalkeeper tracking; the app-shell path list is unchanged.
- `v10`: refreshes the simulation module for kickoff half restrictions and the compact portrait control layout; the app-shell path list is unchanged.
- `v11`: refreshes board interaction, simulation, persistence, pass-option feedback, and portrait rendering assets; the app-shell path list is unchanged.
- `v12`: refreshes formation anchors, reapply controls, and attacking support; the app-shell path list is unchanged.

`tests/pwa-shell.test.mjs` protects this contract by verifying that every declared app-shell file exists, every install-critical local asset referenced by `index.html` is precached, and every static ES-module dependency reachable from the cached module graph is also in `APP_SHELL`.

## Validation pipeline

`.github/workflows/validate.yml` runs on every push to `main` and on manual dispatch. It uses Ubuntu 24.04 and Node.js 24.22.1 LTS. Third-party GitHub Actions are pinned to full commit SHAs, checkout credentials are not persisted, and the workflow token has read-only repository-content access.

The validation gate runs:

1. `npm test`, which executes the Node standard-library behavior and repository-integrity test suite.
2. `node --check` against every `js/*.js` runtime module and `sw.js`.

Automated evidence: GitHub Actions run `40565756748` at implementation commit `5da47a0f0117e43477ff1053f3724fda1309032c` completed with 81 tests, 81 pass, 0 fail, 0 skipped, followed by successful JavaScript syntax checks. Inspect the latest workflow run for later commits.

The Pages workflow runs the same tests and syntax checks before uploading only the static application files and deploying with environment-scoped Pages and OIDC permissions. Deployment requires a successful workflow run; adding the workflow alone does not establish hosted availability.

A successful workflow run is repository evidence for those automated checks only. It does not replace rendered-browser checks or physical-iPad performance, touch, standalone-PWA, and offline verification.

Formation templates start both teams in their own half with distinct defensive, midfield, and forward lines. Away positions rotate the home anchors to face the opposite goal. Shape changes and explicit reapply buttons preserve custom player labels, numbers, and colors; when the affected team has the carrier, the ball is released in place before repositioning. Existing saved and autosaved positions are not migrated.

## Versioned deployments and update consent

`APP_VERSION` in `sw.js` and the `package.json` version are both 1.0.6 and must match; each significant update increments the patch component. The Pages workflow stamps its staged worker with a unique build ID for each deployment, even when the displayed version does not change. Each worker uses its own cache, so an installing build does not replace the active shell.

A waiting worker reports its version by message. `js/update.js` prompts the coach to Update or Cancel, defers the prompt while another dialog is open, and checks for updates on visibility, reconnect and periodically. Update saves the current board before activating and reloading; if storage fails, the coach can explicitly choose to update without saving. Cancel does not reload the page. When another tab activates an update, the current tab is offered a reload instead of being reloaded automatically. The pre-1.0 client lacks this code and must be closed and reopened before it can receive future prompts. Physical iPad Safari behavior remains to be verified.

Player separation first relaxes pairwise overlaps, then places any unresolved dense edge clusters in nearby free positions using the 1000×680 pitch metric. Fixed restart players retain priority in both passes.

The 3D ball is drawn after transparent overlays with depth testing/writing disabled, so player bodies cannot hide it at low camera angles. For possession, a display-only 1.65-yard offset puts the sphere outside the carrier body; it points forward unless that crosses a goal line, in which case it points inward. Simulation coordinates and 2D foreground rendering remain authoritative. Loose and extra balls retain their exact board coordinates.

## Field coaching integration (1.0.4)

`js/coaching.js` is the DOM-free model: `coaching` holds six bounded plain-text brief fields, a 1–120 minute duration, opt-in roster retention, an optional `startBoard`, and at most 12 named `{id, title, board, brief}` steps. Captures use a whitelist of board keys and omit `coaching`, selection and preset identity, preventing recursively nested plans. Step loading normalizes its board, preserves the current sequence/preset identity, restores that step's brief, and always pauses. `normalizeState()` defaults old saves and normalizes new coaching content without changing persistence schema 1. The existing library and backup serialization carry the fields; save-existing updates by ID and built-ins remain immutable.

`js/coaching-ui.js` receives app callbacks for commit/replace/reset/save/step. It owns the workspace, roster controls, authored sequence navigation, print preparation and a separate runtime clock. Opening the workspace pauses simulation. Brief inputs are drafts until Apply; capture/print/save-existing applies them explicitly. Changing a duration resets the clock; editing only notes does not. `createDrillClock()` uses an injected elapsed-time source (Date.now in the browser), so background suspension catches up. Remaining time and clock running state are deliberately outside persisted state and edit history; reload starts paused.

`player.benched` is a normalized boolean. The public simulation step temporarily exposes only active players to the engine, including keeper, offside, pass and restart logic, and restores the roster in `finally`. With no participants it stops. Bench actions release a benched carrier/receiver; a restart without an available taker becomes loose play. Public pass-option queries and board collision settlement also omit benched players. 2D and 3D hide their tokens; they remain in the roster for return and backups. Opponent visibility is independent and does not change participation. Roster retention copies only names/numbers/custom colors and team colors across loads, preserving the loaded shape and bench configuration.

`history.js` includes coaching fields and participant edits; new drill, captures, erasure and equipment cleanup remain undoable. `coaching.startBoard` is used by Reset/Return to start while retaining the latest brief and sequence. The app's explicit one-second step runs 60 fixed steps at speed 1, restores the selected speed and pauses; it does not promise one AI decision or pass. A completed pass with no receiver becomes a loose ball, preventing deadlocks during changed scenarios.

3D drawings reconcile by ID and content signature; route/freehand paths use their full sampled points, pass/run arrows use endpoints, and runs are dashed. Six pass-line slots are preallocated and driven by the same availablePassOptions() query as 2D. Geometry/materials are disposed when drawings change or disappear. The heavy renderer remains lazy and reads the live state. The later 1.0.6 surface adds explicit 3D edit controls as described below.

Print builds dedicated landscape 2D SVGs from normalized board snapshots and briefs. Each page receives unique SVG IDs/marker references; the live renderer reference is restored after preparing print pages. Print CSS hides controls/dialogs and can include one diagram or all captured steps. PDF production is delegated to the browser, with no server or network upload.

The Coach workspace and control rows reflow; on landscape tablets tools scroll in their own row rather than consuming most of the pitch. New controls are native labeled inputs/buttons. No accounts, team services, multi-user state or collaboration capability is present. See COACH_WORKFLOWS.md and PROJECT_STATE.md for usage, verification and remaining limits.

## Workspace and direct manipulation (1.0.6)

`board-ui.css` is the final visual layer: semantic light/dark/field tokens, a 232px tool rail on wide layouts, an inert-background/focus-managed drawer below 1100 CSS px, a larger pitch, compact playback/teaching controls and a reserved contextual strip. Context actions replace the hint within a fixed-height space, preventing selection from moving the pitch under a held pointer. The UI uses local inline SVG tool symbols and adds no library or external asset request.

`js/board-interactions.js` provides pure rigid unit translation and possession setup. Shared deltas clamp against all selected objects' boundaries, preserving relative positions. `settlePlayers(state, fixedIds)` lets unselected players yield while the selected unit remains rigid. `js/app.js` owns a view-only selected-ID set (not persisted or in history); pointer/keyboard selection, nudging and dragging feed the same board model and history. A single tap selects contextual actions; Enter or Edit player opens the existing details dialog. Give ball pauses and clears stale passes/restarts before assigning possession.

`js/board-surface.js` owns the tool drawer, presentation state, live board heading, contextual actions, quick capture and selection styling. Presentation is view-only: it hides editing chrome and blocks manual pointer edits, keyboard edits and Undo while retaining intentional simulation/teaching controls and view navigation. Escape closes the drawer, exits presentation or clears selection as appropriate. Mobile drawer background is inert, focus is contained, and focus returns on closing.

3D editing remains opt-in. Scene roots carry stable object IDs and `pickableObjects()` excludes hidden/benched players. The view raycasts visible objects, projects pointer displacement onto the ground plane, and emits select/move/commit callbacks to the app. Actual board changes use the same possession-release, collision, anchor, history and autosave paths as 2D. Picking a carried ball begins from its rendered position, avoiding a visual jump when possession is released. Multi-touch or wheel camera gestures finish an object drag first. Drawing, prop placement and unit-selection tools switch to 2D; Move can enable 3D editing. No parallel scene state is persisted.

## Play script (1.0.12)

`js/play-script.js` is the pure data layer; `js/simulation.js` (`advanceScript`) is the only executor. `state.script` is an ordered list of stages `{ id, tasks, started, age }`; tasks are `pass` (`player`, `to`), `run` (`player`, `point`) or `shoot` (`player`), each with `done` and, for ball tasks, `sent`. `js/player-actions.js` appends a stage per action together with the arrows it draws (tagged `source: "action"`).

Each simulation step, after the ball moves and before the CPU decides: `scriptRunTargets` makes `advancePlayers` move scripted runners to their points (ignoring zone rules, at normal speed, slower for a carrier); `advanceScript` starts the first unfinished stage (handing the ball to its passer or shooter), performs `beginPass`/`beginShot` when that player holds the ball, and marks a ball task done when the ball is no longer in flight. `decideAction` returns early for the player `pendingBallPlayer` names, so the CPU never acts for them. A stage ends when all tasks are done or after `SCRIPT_LIMITS.timeoutSeconds` simulated seconds, and tasks whose players are benched or missing are marked done; with no unfinished stage the CPU plays freely.

Progress is stored in the script, so `history.js` (`script` is an edit key), saves, presets and snapshots carry it. `resetBoardState` keeps the script (progress cleared by `resetScript`) and the action arrows; `normalizeScript` validates and caps stored scripts (24 stages, 4 tasks). The app shows `Clear script (N)` in the simulation group. Not modeled: conditional plans, timing between stages beyond completion, and scripted behavior for the opposing team beyond what the coach authors for it.

## Color swatches and Center Channel (1.0.13)

`js/color-swatches.js` (`addSwatches`) layers a radiogroup of eight 48px swatches over each palette `<select>`; the select stays the source of truth (hidden) so forms, saves and tests are unchanged, and `app.js` keeps one `refresh` per select (`swatchRefreshers`) that it calls after setting a value from code. `ZONES.center` (js/constants.js) is the PRD 4.2 optional Center Channel: the middle third, y 1/3 to 2/3 across the full length; every zone consumer iterates `ZONES`, so buttons, 2D and 3D overlays, validation and keep-in/keep-out rules include it without further changes.

## Player hit areas (1.0.14)

`js/render.js` adds a `#hit-layer` below `#prop-layer` and `#player-layer` holding one transparent `.player-hit` circle per player (`PLAYER_HIT_RADIUS`, 38 SVG units). Hit circles are positioned and hidden together with their token in `renderScene`, carry `data-hit-for` rather than `data-object-id` (so they are never focusable or counted as objects), and `app.js` resolves a press on one to the token via `#object-<id>`. Because they sit below props and tokens, a visible token or cone always wins a tap over a neighbour larger target.
