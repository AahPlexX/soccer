# Game Mode: scope, design and tracker

Status: **released in 1.1.0; further work is listed under Roadmap and Known limits** (the Tracker at the bottom is the source of truth for what is done).
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
| `ball-control.js` | yes | Player-ball interaction: sticky dribble (spring), trap, pass, shoot, lob, tackle, slide, header, keeper catch/parry/dive. Uses `ball-physics.js` for flight. |
| `ai.js` | yes | AI facade: perception delay, role state machine, executes roles with steering; difficulty profiles (see 5.5). |
| `ai-team.js`, `ai-utility.js`, `ai-space.js`, `ai-steering.js`, `ai-keeper.js` | yes | Team roles and plans; utility scoring for the ball carrier; influence/space, lane risk and shot quality; steering and interception; goalkeeper states. |
| `switching.js` | yes | Active-player selection: automatic, manual cycle, directional. |
| `input-map.js` | yes | Device-independent actions from keyboard, gamepad and touch; remapping. |
| `touch-controls.js` | no (DOM) | Floating joystick and action buttons for phones and tablets. |
| `camera.js` | yes | Follow camera: ball-led target with look-ahead, dead zone, smoothing, pitch clamp, zoom to fit the viewport. |
| `sprites.js` | no (pure RGBA buffers) | Palettes, kits (`kitFromHex`), `drawPlayerFrame` (renders a frame at a given `ppm`), the ball, `facingFor` (8 directions, no mirroring) and `pickAnimation` (what a player is doing to action and frame). |
| `rig.js` | no (pure) | The character renderer: a jointed 3D body of ellipsoids, ray-cast per pixel, lit and quantized to four tones with a colored outline; any facing, any resolution (`viewFor(ppm)`). |
| `poses.js` | no (pure) | Joint-angle poses and `ACTION_FRAMES`: procedural gait cycles and keyframed kick, tackle, slide, down, header, celebrate, throw-in and keeper actions. |
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
A player **controls** a loose ball when it is within 0.55 m of their feet, below 1.1 m high and slower than 7 m/s relative to them (a first touch takes most of the speed off it). Once a player has it the ball is **sticky** (since 1.2.2): a stiff, damped spring (`carryBall`, `CONTROL.dribbleStiffness`) holds it on a spot just ahead of the feet along the player's heading (0.30 m standing, up to about 0.5 m at a sprint, plus a small stride bob so it still looks like dribbling), so it stays under the player's control whatever they do: when they turn, the ball sweeps round to the new front instead of rolling on the old way, and it is held tight through stops, cuts and reversals. It used to be pushed every 0.35 s and left to roll, which made it hard to steer. The ball is only lost to a tackle (which releases it with a push), a pass, a shot, or the 1.4 m hold radius. The ball is drawn in front of the player who owns it. Loose balls are contested by touch radius and speed; ties go to the player the ball is moving toward.

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

### 5.5 Computer team (AI), full stack since 1.1.1
Layered like a commercial sports game (modules `ai.js` facade, `ai-team.js`, `ai-utility.js`, `ai-space.js`, `ai-steering.js`, `ai-keeper.js`; all pure, deterministic, tested):
- **Perception**: each team sees the ball as it was `reaction` seconds ago (0.35 s Easy, 0.2 Normal, 0.08 Hard).
- **Team plan** (`planTeam`, every decision pass): reads the phase (attack, defend, loose ball, pass in flight) and gives each outfield player one role with a target: carry, receive, press, cover, mark, intercept, chase, run, support, recover, hold. Defending: one presser (nearest, goal-side preferred), one cover behind them, markers on the most dangerous attackers (goal side, shading to the ball). Attacking: runners go into open space ahead (searched over a grid with openness, lane safety, goal proximity), supporters offer short passes 4 to 10 m from the carrier, two defenders stay back. Loose ball: the fastest interceptor goes, one covers. Their pass in the air: those who can get there first intercept.
- **Role state machine**: roles have priorities and a minimum dwell (0.3 s), so a player does not flicker between jobs.
- **Utility scoring for the carrier** (`chooseCarrierAction`): every option is scored: shoot (shot quality from the angle the goal subtends, distance, blockers, keeper position), each pass (progress, receiver's open space, lane-cut risk from a time-to-intercept model, running receivers), eight dribble directions plus straight at goal (space ahead, blocked lanes, edge penalties), hold/shield and clear. Role traits weight them (a striker shoots, a centre back passes). Seeded noise and a stick-with-it bonus keep it human and steady; a pass waits 0.45 s unless a defender is within 1.3 m.
- **Influence/space model** (`ai-space.js`): `pressureAt` (Gaussian influence of opponents at their predicted positions), `openness`, `laneRisk`, `shotQuality`, `searchSpots`.
- **Steering** (`ai-steering.js`): arrive, pursue the predicted position, ball interception (earliest meeting point with a rolling ball), separation from teammates, weighted blending; the presser jockeys goal side inside 4 m and tackles on a cooldown when the ball runs away from the carrier; aggressive levels slide.
- **Goalkeeper** (`ai-keeper.js`): states set (on the ball-goal line, deeper when the ball is far), track (predict the crossing point of a shot, skill-limited error), sweep (collect a loose ball nobody else can reach first), rush (narrow the angle of a runner). With the ball it uses the carrier utility, holding it 1.2 s first.
- **Difficulty** (`DIFFICULTIES`): reaction, think interval, speed, pass noise, shot error and power, decision noise, press radius, keeper skill, tackle chance, shoot range, runners, markers, aggression. `createAi({ home, away })` lets each team have its own level.
- **Measured** (`tests/game-ai-quality.test.mjs`, fixed seeds): over 8 matches of 150 s, Hard beats Easy from either side (about 2.5x the possession, 5x the shots, 70% vs 35% pass completion, more goals); two Normal teams are balanced (about 55% pass completion, 15 shots and 4 goals per 10 minutes).
(Earlier design text kept below for reference.)

### 5.5a Original AI sketch
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

`camera.js` (pure): target = ball position + velocity x 0.35 s look-ahead, biased toward the attacking goal when the human team has the ball; a **dead zone** of 12% of the view; critically damped smoothing (time constant 0.25 s, shorter when the ball is fast so it never leaves the screen); clamped to the pitch plus a 3 m margin; zoom chosen so about 28 m of pitch width is visible (varies with aspect), widening dynamically (`targetWidth`) to keep both the active player and the ball in view (never beyond the whole pitch); the camera snaps to whole screen pixels and sprites use whole-pixel sizes so pixel art stays crisp; an edge arrow (`edgeIndicator`) points to the ball or active player when off screen. Kickoff, restarts and goals use short eased camera moves (0.6 s). Test: across recorded matches the ball stays inside the central 80% of the view.

## 8. Sprites and rendering

All art is generated in code, so the repo stays text-only and offline:
- 3/4 top-down view with fake depth (draw order by y), soft shadows that shrink and fade with height, ball lifted along its arc.
- **Sprites** (since 1.2.0; `sprites.js`, `rig.js`, `poses.js`): a jointed 3D character (about 1.77 m: head with eyes, brows, mouth, nose, ears and hair; neck; shirt with collar, crest and back number stroke; upper and lower arms with hands, and long sleeves and gloves for keepers; shorts; thighs, shins, socks with a trim band; boots with laces and soles) built from ellipsoids, posed by joint angles, ray-cast per pixel at a fixed 3/4 camera (pitch 0.42 rad), lit by one directional light quantized to four tones, with a colored one-pixel outline. The picture is rendered **at the on-screen resolution** (`ppm`, pixels per meter, from the camera scale and device pixel ratio) so it is shown 1:1 with no resampling; `renderer.js` `spritePpm()` only switches resolution when the zoom moves more than 8%, so zooming never re-renders every player each step. The canvas is sized in meters (2.96 x 2.81 m, feet 2.44 m down; `viewFor(ppm)`, 80x76 px at the reference 27 px per meter), tall enough for arms overhead and wide enough for a keeper's dive. Because it is one body seen from different angles, all **8 facings are drawn directly** (no mirroring, so the light stays on the same side) and every animation is consistent. Team and skin/hair variants are palette swaps; the coach's team colors become the shirt. The lowest point of the body is rested on the ground for every frame, so strides bob naturally; `air` lifts jumps and dives.
- **Animations** (`poses.js`; counts in `ACTION_FRAMES`): idle 4, walk 8, run 8, sprint 8 (gait cycles generated from a phase: counter-swinging legs and arms, knees folding through the swing, torso twist, lean), kick 6 (wind-up, strike, follow-through), tackle 4 (lunge), slide 6, down 4 (lying, sit, kneel, rise), header 6 (jump, arch, strike, land), celebrate 8, throw-in 4, keeper idle 4, ready 2 (crouched, hands out), dive 7 (launch, flight, landing slide) and catch 3. Keyframed actions are eased between keys; cyclic ones are procedural. `pickAnimation` picks the action from the player's state and sets the stride frame from ground speed. Frames are rendered on demand (a few ms each) and cached by player, action, frame, facing and resolution; the cache is cleared past 3000 entries.
- Motion: animation speed follows ground speed; a lean into turns; ball spin shown by rotating panels; dust puffs on slides; net ripple on goals; crowd flash on a goal.
- Pitch: mown stripes, penalty areas, center circle, corner arcs, goals with nets and posts that read in 3/4 view.
- Budget: canvas 2D, one atlas, no per-frame allocation in the hot path, 60 fps on a 2018 iPad.

## 9. Controls and device mapping

Keyboard (remappable under Settings, Change keys; Esc always pauses and a key serves one action):

| Action | Keys |
| --- | --- |
| Move | Arrow keys or WASD |
| Pass / lob (hold) | J or Space |
| Shoot (hold to charge) | K or Enter |
| Sprint | L or Shift |
| Tackle / slide (with direction); a goalkeeper dives left/right | I or E |
| Switch player | Tab or Q (cycle); U + direction (directional) |
| Pause | Esc or P |

Gamepad (standard mapping): left stick move; A pass; B shoot; X tackle/slide; Y switch (cycle); right stick directional switch; RT sprint; Start pause.

Touch (phones and tablets, landscape): a **labelled MOVE ring** always rests at the lower left where a thumb sits, and touching anywhere in the left 45% of the screen re-centers it under the finger (floating stick); the left thumb only ever steers. The stick reaches full speed at about 62% of its travel (`shapeStick`), because a finger cannot hold a precise half push; below that speed scales smoothly. All five buttons are under the right thumb (>= 56 px, 48 px minimum, safe-area aware): **Pass** (tap; hold for lob), **Shoot** (hold to charge, ring fills), **Sprint** (hold), **Tackle** and **Switch** (they were once at the left, in the steering thumb's way). On the first run a card explains every control (`TOUCH_HELP` in `touch-controls.js`) and each button shows a one-line hint; it closes on Got it, on the first pass or shot, or after 14 s, and is remembered (`tipsSeen` in the settings); Settings and the Controls screen can show it again. On a touch device the Controls screen lists the touch controls, not keyboard keys. A swipe on the pitch from the active player toward a teammate is a directional switch. Multi-touch is required (move + action together). Controls are an overlay covering at most 25% of the view. Phone portrait shows a rotate prompt; tablets in portrait use a taller pitch crop. Haptics through `navigator.vibrate` on goals and tackles where available. Pointer Events with `touch-action: none` on the game surface.

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
- [x] G1 Match engine core (1.0.23): `rules.js` (pitch, exit crossing, restarts with height, penalty area, 7v7 formation slots), `player-physics.js` (acceleration, turn rate, stamina, separation), `ball-control.js` (control, dribble touches, pass/lob with lead, charged shot, aim assist, tackle/slide/foul, header, keeper catch/parry), `match.js` (phases kickoff/play/goal/restart/halftime/fulltime, clock, score, stats, events, seeded RNG, deterministic fixed-step `stepMatch(match, controls, dt)`). Tests: `tests/game-rules-physics.test.mjs`, `tests/game-ball-control.test.mjs`, `tests/game-match.test.mjs` (including a property test over random controls and a step-cost bound).
- [x] G2 AI and switching (1.0.24): `ai.js` (`createAi(difficulty)`, `aiControls(match, ai, controls)` for every player except the human's active one, call at about 20 Hz; difficulty profiles easy/normal/hard; shape from formation slots, pressing by the two nearest, support runs, carrier decisions: shoot with a solved elevation, pass with a named receiver and noise, lob over a blocked lane, dribble with avoidance; goalkeeper predicts the crossing and gathers loose balls; minimum hold time before a pass) and `switching.js` (`autoSwitch`, `cycleSwitch`, `directionSwitch`, `switchCandidates`; receiver of a pass in flight, ball winner, best defender with margin and lockout, manual switch respected 1.5 s, keeper only while holding the ball). Tests: `tests/game-ai.test.mjs`, `tests/game-switching.test.mjs` (including AI-vs-AI determinism with goals and properties).
- [x] G3 Input, settings and camera (touch controls and wiring landed in G4): done (1.0.25): `input-map.js` (`createInput(bindings)` with `keyDown/keyUp/press/release/setStick/swipeSwitch/gamepad/reset/sample(dt, heading)`; pass fires on release, tap = ground, hold >= 0.25 s = lob, auto-lob at 0.9 s; shoot charges over 0.8 s and fires on release with curl from the stick; tackle on press, slide if a direction is held; switch on press, cycle or directional with the `KeyU` modifier, a swipe or a right-stick flick; helpers `stickFromDrag`, `classifySwipe`, `readGamepad`, `frameToControl`), `settings.js` (versioned schema under localStorage key `u9-game-settings`, never throws), `camera.js` (look-ahead, dead zone, critically damped follow, pitch clamp, 3/4 `project`/`unproject`, active-player pull; tests show the ball stays on screen over a whole AI match on laptop, phone-landscape and tablet-portrait sizes). Still to do in G3: `touch-controls.js` (floating joystick and buttons) and the live keyboard/gamepad wiring in `game-mode.js`.
- [x] G4 Presentation (1.0.26): `sprites.js` (palettes, kits, the ball, animation picking; the players themselves are drawn by the 1.2.0 character rig `rig.js` with poses in `poses.js`: 8 directly drawn facings, 15 animated actions, team and skin palettes, shaded and outlined at the screen resolution), `effects.js` (dust, trail, confetti, net ripple), `replay.js` (rolling 6 s buffer), `renderer.js` (striped pitch, markings, goals with nets, shadows, depth-sorted sprites, ball height, active marker, aim line), `hud.js` (scoreboard, clock, active player and stamina, power meter, radar, banners), `audio.js` (WebAudio synth), `menus.js` (title, pause, controls, full time), `touch-controls.js` (floating joystick, SHOOT/PASS/RUN/TACKLE, SWITCH, swipe-to-switch), and the live loop in `game-mode.js` (fixed 120 Hz step, AI at 20 Hz, goal replay at 0.75x, pause on blur/hidden, rotate prompt on portrait phones). Verified in a browser at 1280x720 and 844x390 touch with no console errors. Reviewed with screen captures and tuned in 1.0.27.
- [x] G5 Integration (1.1.0): menus, start from the coach board's formations and colors, responsive layouts (phone landscape, tablet, laptop; rotate prompt on portrait phones), offline (every module is in the service worker shell, guarded by tests), capture review (`scripts/capture-game.cjs`), toggle released, docs finalized.

### Resume notes
(Latest first; update at every stop.)
- 1.2.2: sticky ball. User playtest: the game is realistic but the ball could not be controlled as intended, because there was no sticky dribble. Replaced the free-rolling dribble (a touch every 0.35 s, ball aimed along the lagging heading, lost past 0.95 m) with a spring that holds the ball in front of the feet (see section 5.2). Tuning notes: the lead distance is the sensitive knob. At 0.42 m standing / 0.8 m sprint the AI-vs-AI pass completion fell from about 0.53 to 0.43 (balls held further out meant worse passing), at 0.30 / 0.5 m it is back to 0.55 with more passes, so keep the ball tight to the feet; `tests/game-ai-quality.test.mjs` guards it. Tests: `tests/game-dribble.test.mjs` (settling, straight runs, a full-speed reversal, 25 random-steering seeds never lose the ball, a tackle still wins it).
- 1.2.1 also: the pass receiver is previewed live. While you hold the ball, a yellow ring and dashed line show who a pass would go to right now (the same `bestPassTarget` the pass uses: best open teammate within 35 degrees of the held direction, or the way you face if you hold none); it was only highlighted after the pass, so passing was a guess. The game also gives a short blip and a buzz when it switches your controlled player automatically.
- 1.2.1: touch control clarity (user tested on a phone: it worked but how to move was ambiguous and felt inconsistent). Fixed: the joystick was invisible until touched (now a persistent labelled ring); Switch sat in the steering thumb's area (moved to the right cluster); partial stick deflection gave partial, unpredictable speed (full speed at 62%); the stick and keys were applied as world directions although the pitch is drawn squashed vertically, so a 45 degree thumb drag moved the player at about 38 degrees on screen (now `screenToWorldMove` in `camera.js`, passed to `input.sample`; sprites face their on-screen direction through `worldHeadingToScreen`); no first-run explanation (now the tips card). The capture script measures it: a 45 degree touch drag moves the player 1.28 world y per x, which is exactly a 45 degree line on screen. Tests: `tests/game-touch-controls.test.mjs` (fake DOM).
- 1.2.0: players and animation rebuilt (see section 8). The old 18x26 rigid pixel poses were replaced by a posed 3D rig rendered to pixel art at the screen resolution, drawn 1.3x larger than life (`PLAYER_SCALE` in `renderer.js`) so faces, limbs and kit read on a phone. To tune a movement edit the joint angles in `poses.js` (frame it with a sheet: render `renderPlayer` for each action and facing); to change the look edit the body in `rig.js` `buildBody` and the materials above it. The tests (`tests/game-sprites.test.mjs`) check structure: every frame renders unclipped, feet on the ground line, lying poses long and low, kit colors present, faces from the front only, 8 distinct facings, cyclic actions really animate. Visual quality is verified by looking: the capture script (`scripts/capture-game.cjs`) and a sprite sheet. Known and open: the ball is still the small 8 px sprite (a shaded sphere at the screen resolution is next); keeper dives run head first in the facing direction rather than sideways; there are no per-player faces or hairstyles beyond three skin and hair variants; a fast-check property in `tests/properties.test.mjs` ("normalizeState never throws...") failed once in a full run and did not reproduce in 30,000 further runs of the same property, so it is recorded but unexplained.
- 1.1.2: weakness sweep, nothing known is left open. Added: dynamic zoom (`targetWidth`), pixel snapping (`snapToPixels`, `wholePixels`) and edge arrows (`edgeIndicator`) in `camera.js`/`renderer.js`; keeper dive (`startDive` in `ball-control.js`, AI dives in `ai-keeper.js`, a human keeper dives with Tackle plus a held left/right direction via `frameToControl(frame, player)`); `header`/`catch`/`dive` actions and `bounce`/`post` events with matching animations and sounds; Settings screen and key rebinding UI in `menus.js` (`rebind` and `withBindings` in `settings.js`, `input.setBindings`). Tests: `tests/game-keeper-events.test.mjs`, `tests/game-settings-keys.test.mjs` (menus against a fake DOM). Remaining limits (all need real play or a physical device): AI balance against human play, touch ergonomics and 60 fps on a physical iPad; no offside, penalties or fouls beyond slide tackles. `renderer.js`, `hud.js`, `touch-controls.js` and `game-mode.js` are still checked by captures, not unit tests.
- G4 mostly done (1.0.26): open the app with `?game`, press the header Game mode button, Kick off. `root.dataset.gamePhase` (menu, playing, paused, replay, over) and `root.dataset.score` expose state for capture scripts. DOM modules (renderer, hud, menus, touch-controls, audio, game-mode) are not unit-tested; they are checked with browser captures. Visual review notes go here.
- G3 pure parts done (1.0.25). `createInput(effectiveBindings(DEFAULT_BINDINGS, settings))`; each fixed step call `input.sample(dt, activePlayer.heading)` and put `frameToControl(frame)` into `controls[match.activeId]`; `frame.switch` is `'cycle'` or `{ dir }` for `cycleSwitch`/`directionSwitch`; `frame.pause` toggles the pause menu; `frame.charge` (0..1) drives the power meter. Camera loop: `stepCamera(camera, cameraTarget(match, camera, view), dt, view, ballSpeed)`; draw with `project(camera, view, x, y, z)`.
- G2 done (1.0.24). The loop that G3 builds (in `game-mode.js`) runs: fixed step 1/120 s accumulator; every 6th step `aiControls(match, ai, controls)`; the human's active player gets controls from `input-map.js`; call `autoSwitch(match)` each step and `cycleSwitch`/`directionSwitch` on the switch actions; `stepMatch(match, controls)`; drain events for sound and HUD. `match.humanTeam` may be `'none'` for AI-vs-AI (set `activeId = null`). Tuning notes: AI-vs-AI matches of 200 s produce roughly 1 goal, 7 passes and several tackles per minute at normal difficulty; revisit once it can be watched.
- G1 done (1.0.23). `stepMatch` takes `controls` = `{ [playerId]: { move:{x,y}, sprint, pass:'tap'|'lob'|null, shoot:{power,curl}|null, tackle:'stand'|'slide'|null } }`; players with no entry use `defaultControl` (hold shape, a placeholder for the AI). `match.activeId` is the human's player; `match.passTarget` and the `pass` event carry the receiver for auto-switching; `drainEvents(match)` returns sound/HUD events (whistle, pass, shot, goal, save, tackle, foul, header, block, touch, fulltime). Next: G2 `ai.js` (team and keeper AI, difficulty profiles) and `switching.js` (auto, cycle, directional), pure with tests; add each to `tsconfig.json` include and `sw.js` APP_SHELL. The precache dependency test now resolves imports relative to the importing module.
- G0 done (1.0.22): open the app with `?game` to see the header "Game mode" button; it mounts a placeholder panel in `#game-root`, makes the coach regions `inert`, adds `body.game-active` (the coach keyboard shortcuts stop), and Escape or Back restores everything. Next: G1 match engine core (`js/game/match.js`, `rules.js`, `player-physics.js`, `ball-control.js`) as pure modules with tests; add each to `tsconfig.json` include and `sw.js` APP_SHELL.
- 1.1.1: the AI was rebuilt as the full stack (see 5.5): team plan with roles, role state machine, utility scoring, space model, steering with interception, keeper states, perception delay and per-team difficulty. To tune: edit `DIFFICULTIES` (ai.js), `ROLE_TRAITS` and the score weights (ai-utility.js), and re-run `node --test tests/game-ai-quality.test.mjs`; `createAi({ home: 'hard', away: 'easy' })` is the way to compare levels. Ideas: dive animation for the keeper from the `track` state, set-piece routines, learned weights by self-play.
- 1.1.0 FINAL for the first release. Known limits (also in PROJECT_STATE.md): the DOM modules are checked by captures, not unit tests; the AI is the full layered stack (1.1.1) and is measured by AI-vs-AI tests, but its balance against real human play is untested, so expect to tune `DIFFICULTIES` in `ai.js` after real play; key rebinding had no UI and the match emitted no dive state (both fixed in 1.1.2); no offside, penalties or fouls beyond slide tackles; touch ergonomics and 60 fps on a physical iPad are unverified. Ideas for next: rebinding UI, penalty shootout, tournament mode, two-player local, tutorial drills from coach setups.
- 1.0.27: released. The toggle is visible to everyone; the match starts from the coach board's formations and team colors. Visual review by screenshots at 1280x720 and 844x390 touch found and fixed: unreadable pause buttons (coach button styles leaking in), a clipped title menu on short screens, a label crossing the halfway line, tight touch buttons, and a camera that was too close. Remaining for the final G5 pass: README and COACH_WORKFLOWS sections, a committed capture script for the game, version 1.1.0.
- Scope written. Integration facts gathered: header buttons live in `index.html` `.header-actions` (ids `undo`, `redo`, `saved-open`, `save-as`, `coach-open`, `presentation-toggle`); the lazy-load pattern to copy is `setView3D` in `js/app.js` (dynamic `import('./view3d.js')`, toast while loading, graceful fallback); `presentation` mode is toggled in `js/board-surface.js`; `sw.js` `APP_SHELL` is an explicit list; `pages.yml` copies `js/` wholesale; `tsconfig.json` `include` is an explicit list. Next: G0 skeleton.
