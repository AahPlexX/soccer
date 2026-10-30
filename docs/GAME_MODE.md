# Game Mode: scope, design and tracker

Status: **scoped; implementation in progress** (the Tracker at the bottom is the source of truth for what is done).
Owner: the project was handed over with administrative authority; any model or person continuing it starts with the Tracker and the Resume notes.

## 1. What it is

A toggle in the header switches the app from the **Coach UI** (tactical board, drills, the simulation as a teaching tool) to **Game Mode**: a real-time, human-versus-computer 7v7 match. The human controls **one player at a time** and can switch players. The Coach UI is untouched and keeps working underneath; Game Mode is a full-screen layer on top of it.

Baseline parity target: *Nintendo World Cup* (Nekketsu Koko Soccer, 1990): a top-down 3/4 pitch that scrolls with the ball, one highlighted controlled player, pass / shoot / slide, power shots, a goalkeeper, a clock and scoreboard, chiptune audio. We exceed it with real ball physics (height, spin, bounce, posts), smooth animated 8-direction sprites with team colors, a camera that anticipates play, touch and gamepad support, difficulty levels, goal replays, settings, and starting a match from the coach's own board.

Non-goals: online play, accounts, licensed names or art, referee fouls beyond a simple slide-tackle rule, injuries, a league or career mode (see the Roadmap).

## 2. Separation of logic paths (the architecture rule)

New folder tree: **`js/game/`**. It deploys with no pipeline change because `pages.yml` already runs `cp -R js icons vendor _site/`. ESLint (`eslint .`) already covers it; the explicit `include` list in `tsconfig.json` must be extended with the pure game modules as they are added. Every new module is also listed in `sw.js` `APP_SHELL` (a test already guards that).

Rules, enforced by `tests/game-boundary.test.mjs`:

1. Coach code (`js/*.js`) never imports from `js/game/` except **one lazy `import('./game/game-mode.js')`** in `js/app.js`, run the first time the player presses "Game mode" (the same pattern as the lazy 3D view). Coach-only users load nothing extra at start.
2. `js/game/**` never imports Coach UI modules (`app.js`, `render.js`, `board-*.js`, `coaching*.js`, `storage.js`, `history.js`, `view3d.js`, `library*.js`, `*-ui.js`, `update.js`). It may import only these shared pure modules: `ball-physics.js`, `constants.js`, `geometry.js`, `formations.js`, `restarts.js`, and (read-only, to start from a board) `state.js`. Sharing anything else needs a justification added here first.
3. Game state is never saved into the coach board state or its undo history. Game settings use their own localStorage key `u9-game-settings`.
4. The game runs its own loop (`requestAnimationFrame`) only while active and tears down fully on exit (listeners, audio, canvas, gamepad polling).
5. Entering Game Mode pauses the coach simulation (`running = false`); leaving it restores the Coach UI exactly as it was.

## 3. Module map (`js/game/`)

| Module | Pure? | Purpose |
| --- | --- | --- |
| `game-mode.js` | no (DOM) | Entry point: mounts the full-screen layer, wires input, loop, menu, exit. The only file the coach app imports. |
| `match.js` | yes | Match state and `stepMatch(match, input, dt)`; clock, score, possession, restarts. Deterministic given a seed. |
| `rules.js` | yes | Pitch geometry in meters, restart classification (uses `restarts.js` semantics), goal detection with height. |
| `player-physics.js` | yes | Player motion: acceleration, top speed, sprint stamina, turning, facing, player separation. |
| `ball-control.js` | yes | Player-ball interaction: dribble touches, trap, pass, shoot, lob, tackle, slide, header, keeper catch/parry/dive. Uses `ball-physics.js` for flight. |
| `ai.js` | yes | Team AI (roles, support runs, pressing, marking, pass and shot choice) and goalkeeper AI; difficulty profiles. |
| `switching.js` | yes | Active-player selection: automatic, manual cycle, directional. |
| `input-map.js` | yes | Device-independent actions from keyboard, gamepad and touch; remapping. |
| `touch-controls.js` | no (DOM) | Floating joystick and action buttons for phones and tablets. |
| `camera.js` | yes | Follow camera: ball-led target with look-ahead, dead zone, smoothing, pitch clamp, zoom to fit the viewport. |
| `sprites.js` | yes (canvas injected) | Procedural pixel-art atlas generated in code (no binary assets): players in 8 directions, idle/run/kick/slide/dive/celebrate/tackled, keeper, ball, shadows, team palette swap. |
| `renderer.js` | no (canvas) | Draws pitch, lines, goals, nets, shadows, sprites (depth sorted), ball height, active-player marker, effects. |
| `hud.js` | no (DOM/canvas) | Score, clock, half, power meter, player name/number, radar, goal banner, menus. |
| `audio.js` | no (WebAudio) | Synthesized chiptune effects and short jingles, master mute. |
| `settings.js` | yes | Settings schema, validation, defaults, persistence helpers. |
| `replay.js` | yes | Rolling buffer of recent frames for goal replays. |

Pure modules have no DOM and are unit-tested in Node, like the rest of the repo.

## 4. Coordinates and units

SI units in meters, origin at the pitch center, x along the pitch (the human team attacks +x), y across it. The coach board is normalized (0..1) over 54.864 m x 37.2672 m (`PITCH_METERS`); conversion helpers exist in `simulation.js` (`ballBody`). Ball state is exactly the `ball-physics.js` body `{x,y,z,vx,vy,vz,wx,wy,wz}`, so flight, bounce, drag, Magnus and posts are identical to the coach simulation. Players are 2D discs (radius 0.35 m) with a reach height (1.2 m, keeper 2.2 m). Fixed timestep 1/120 s with an accumulator; rendering interpolates.

## 5. Gameplay logic

### 5.1 Player movement
Top speed 5.5 m/s, sprint 6.8 m/s while stamina lasts (stamina 0..1, drains 0.18/s, recovers 0.12/s). Acceleration 14 m/s^2; turn rate limited to 540 deg/s so direction changes read as motion. A player with the ball runs at 92% speed. Facing is one of 8 directions for sprites; the true heading is continuous.

### 5.2 Ball and possession
There is no "attached" ball. A player **controls** the ball when it is within 0.55 m of their feet, below 1.1 m high and slower than 7 m/s relative to them. A dribbler touches the ball forward about every 0.35 s (a small kick), so defenders can really poke it away. Loose balls are contested by touch radius and speed; ties go to the player the ball is moving toward.

### 5.3 Actions (device independent)
- **Move**: analog vector (stick or keys).
- **Pass** (tap): ground pass to the best teammate within +-35 degrees of the held direction (or the best open teammate with no direction), speed from `groundPassSpeed`. **Hold** pass: lofted pass (`lobSpeed`) with a landing marker.
- **Shoot** (hold to charge, release to strike): power 0..1 over 0.8 s; aim from the held direction and the goal; elevation grows with the charge, so a high charge can go over the bar (the physics decides). Sideways stick at release adds curl (spin).
- **Sprint** (hold): uses stamina.
- **Tackle**: a stand tackle (short lunge) and, with a direction held, a **slide** (1.0 s commitment, long reach). A slide that hits the player before the ball gives a free kick (simplified foul), so slides are a risk.
- **Switch**: see 5.4. **Pause**.
- Goalkeepers are AI controlled. The human may take the keeper only on a goal kick or when the keeper holds the ball (distribute: pass or punt).

### 5.4 Switching the active player (one at a time)
The active player has a ring and arrow. Three mechanisms, all producing `switchTo(playerId)`:
1. **Automatic**: when the human team does not have the ball, switch to the teammate best placed to defend (closest to the ball, weighted toward goal side) with a 0.4 s lockout and hysteresis so it never flickers; when a pass is released, switch to the receiver as the ball travels.
2. **Manual cycle** (Switch button / Tab / Q / gamepad Y): the teammate nearest the ball that is not the current one; repeated presses cycle by distance.
3. **Directional** (flick the right stick, hold Switch + a direction, or swipe on the pitch): the teammate best matching that direction from the current player.
Invariants (tested): never the keeper except on a keeper restart, never a benched or off-pitch player, lockout honored, deterministic for equal distances.

### 5.5 Computer team (AI)
Layered and cheap, run at 20 Hz per player with seeded randomness:
- **Roles from formations** (`formations.js`): each player has a home position that shifts with the ball (compact block, width, depth).
- **With the ball**: choose between dribble toward goal, pass (score = progress + openness - interception risk from the physics lane test), shoot (distance, angle, keeper position) and clear.
- **Without the ball**: the nearest two press, the others mark or hold shape; the keeper stands on the line between ball and goal and dives toward the predicted crossing (`flightAt`) after a reaction delay by difficulty.
- **Difficulty** (Easy / Normal / Hard): reaction delay, speed factor, pass and shot noise, keeper skill, press intensity.

### 5.6 Rules and flow
7v7, two halves (1 / 2 / 3 minutes each, default 2), kickoff by the team that conceded, optional golden goal in a draw. Restarts: throw-in, goal kick, corner, free kick (slide fouls), kickoff. A goal counts only if the ball crosses the line between the posts at or below the crossbar (`classifyBoundaryRestart` with height). Goal banner, optional replay, then kickoff. U9 flavor kept: no offside, no penalties.

## 6. Physics scope

Reused unchanged from `ball-physics.js`: gravity, drag crisis, Magnus, bounce and rolling friction, posts and crossbar. New in Game Mode:
- Player-ball **touch impulses** (dribble touch, trap that absorbs part of the ball speed, header that redirects with the player's heading and height, keeper catch/parry/dive).
- Player-player **separation** and light collisions (a shoulder bump slows both; a slide hit takes the target down for 0.6 s).
- Sprint stamina and turn limits.
- A **swept collision pass** for fast balls against players, so a 27 m/s shot cannot skip a defender (same per-substep travel cap as `ball-physics.js`).
- Determinism: fixed timestep, seeded RNG, no `Date.now()` or `Math.random()` in pure modules; `tests/game-determinism.test.mjs` replays an input script and compares end states.

## 7. Camera

`camera.js` (pure): target = ball position + velocity x 0.35 s look-ahead, biased toward the attacking goal when the human team has the ball; a **dead zone** of 12% of the view; critically damped smoothing (time constant 0.25 s, shorter when the ball is fast so it never leaves the screen); clamped to the pitch plus a 3 m margin; zoom chosen so about 28 m of pitch width is visible (varies with aspect), widening to keep both the active player and the ball in view (never beyond the whole pitch). Kickoff, restarts and goals use short eased camera moves (0.6 s). Test: across recorded matches the ball stays inside the central 80% of the view.

## 8. Sprites and rendering

All art is generated in code, so the repo stays text-only and offline:
- 3/4 top-down view with fake depth (draw order by y), soft shadows that shrink and fade with height, ball lifted along its arc.
- **Sprites** (`sprites.js`): 16x24 logical pixels scaled by an integer factor with nearest-neighbor, drawn from palette-indexed pixel maps so team palettes swap cleanly (head, hair, shirt with number stripe, shorts, socks, boots). Animations: idle (2 frames), run (6), sprint (6), kick (3), slide (3), tackled (3), header (2), celebrate (4), keeper idle/ready/dive/catch, throw-in. 8 facing directions via flipping plus unique rows (up, down, side, two diagonals). Frames are built once into an offscreen atlas.
- Motion: animation speed follows ground speed; a lean into turns; ball spin shown by rotating panels; dust puffs on slides; net ripple on goals; crowd flash on a goal.
- Pitch: mown stripes, penalty areas, center circle, corner arcs, goals with nets and posts that read in 3/4 view.
- Budget: canvas 2D, one atlas, no per-frame allocation in the hot path, 60 fps on a 2018 iPad.

## 9. Controls and device mapping

Keyboard (remappable in settings):

| Action | Keys |
| --- | --- |
| Move | Arrow keys or WASD |
| Pass / lob (hold) | J or Space |
| Shoot (hold to charge) | K or Enter |
| Sprint | L or Shift |
| Tackle / slide (with direction) | I or E |
| Switch player | Tab or Q (cycle); U + direction (directional) |
| Pause | Esc or P |

Gamepad (standard mapping): left stick move; A pass; B shoot; X tackle/slide; Y switch (cycle); right stick directional switch; RT sprint; Start pause.

Touch (phones and tablets, landscape): a **floating joystick** appears where the left thumb lands (left 45% of the screen); the right side has large buttons (>= 56 px, 48 px minimum, safe-area aware): **Pass** (tap; hold for lob), **Shoot** (hold to charge, ring fills), **Sprint** (hold), **Tackle**, and a larger **Switch** button near the joystick. A swipe on the pitch from the active player toward a teammate is a directional switch. Multi-touch is required (move + action together). Controls are an overlay covering at most 25% of the view. Phone portrait shows a rotate prompt; tablets in portrait use a taller pitch crop. Haptics through `navigator.vibrate` on goals and tackles where available. Pointer Events with `touch-action: none` on the game surface.

## 10. Audio
WebAudio only (no files): square/triangle/noise voices for kick, pass, bounce, post hit, whistle, goal jingle, crowd swell, menu blips. Starts after the first user gesture (browser policy); mute is persisted.

## 11. UI flow
Header toggle "Game mode" -> title screen (Kick off, Difficulty, Match length, Start from my board, Controls, Back to coach) -> match -> pause menu (Resume, Restart, Settings, Controls, Exit to coach) -> full-time summary (score, shots, possession, rematch). The settings schema is versioned (`schemaVersion`), validated on load, and never throws.

## 12. Testing strategy
- Unit: every pure module (movement limits, control rules, pass target selection, switching rules, input mapping, camera, AI choices, rules, settings validation, sprite atlas structure).
- Property (fast-check): the ball is always on the pitch or in a restart; no NaN after random input streams; the camera keeps the ball in view; switching never selects an invalid player; a whole AI-vs-AI match is deterministic and terminates.
- Boundary test: an import-graph check of rule 2 in section 2.
- Visual: `scripts/capture.cjs` extended to capture the game screens at desktop, tablet and phone sizes; reviewed and recorded in the Tracker.
- Performance: a Node benchmark of `stepMatch` (budget 1 ms per step for 14 players).

## 13. Risks and decisions
- Scope is large; mitigated by phases that each ship working and tested. Game Mode sits behind the toggle, so partial phases never affect coaches.
- No binary art: procedural sprites cost code but keep the offline size tiny and the art reviewable as text.
- Touch precision: floating joystick, generous buttons, auto-switch to cut required taps.
- Determinism with frame and gamepad jitter: input is sampled per fixed step.
- iOS audio and fullscreen quirks: audio starts from a user gesture; `viewport-fit=cover`.

## 14. Roadmap beyond the first release
Replays with camera angles, tournament mode, custom team names and kits, statistics history, two-human local play, tutorial drills that reuse the coach's setups, an optional 3D renderer reusing `board-scene.js`.

## 15. Tracker

Legend: [x] done, [~] in progress, [ ] not started. Update this list in the same commit as the work.

- [x] G0 Scope document (this file)
- [x] G0 Boundary test (`tests/game-boundary.test.mjs`), `js/game/` skeleton (`game-mode.js`, `game.css`), lazy toggle in `js/app.js` (hidden unless the address has `?game` until G5), `#game-root` layer in `index.html`, service worker shell entries, doc pointers (1.0.22)
- [ ] G1 Match engine core: player physics, ball control, rules and restarts, clock and score (+ tests)
- [ ] G2 AI: team AI, goalkeeper AI, difficulty, player switching (+ tests)
- [ ] G3 Input: keyboard, gamepad, touch controls, remapping, settings (+ tests)
- [ ] G4 Presentation: sprites, renderer, camera, HUD, audio, goal replay
- [ ] G5 Integration: menus, start from coach board, responsive layouts, offline, capture review, version 1.1.0, docs finalized

### Resume notes
(Latest first; update at every stop.)
- G0 done (1.0.22): open the app with `?game` to see the header "Game mode" button; it mounts a placeholder panel in `#game-root`, makes the coach regions `inert`, adds `body.game-active` (the coach keyboard shortcuts stop), and Escape or Back restores everything. Next: G1 match engine core (`js/game/match.js`, `rules.js`, `player-physics.js`, `ball-control.js`) as pure modules with tests; add each to `tsconfig.json` include and `sw.js` APP_SHELL.
- Scope written. Integration facts gathered: header buttons live in `index.html` `.header-actions` (ids `undo`, `redo`, `saved-open`, `save-as`, `coach-open`, `presentation-toggle`); the lazy-load pattern to copy is `setView3D` in `js/app.js` (dynamic `import('./view3d.js')`, toast while loading, graceful fallback); `presentation` mode is toggled in `js/board-surface.js`; `sw.js` `APP_SHELL` is an explicit list; `pages.yml` copies `js/` wholesale; `tsconfig.json` `include` is an explicit list. Next: G0 skeleton.
