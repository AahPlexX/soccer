# Product Requirements Document (PRD): U9 Tactical Soccer Board & Match Simulator

- **Repository:** AahPlexX/soccer
- **Deployment Target:** GitHub Pages (Offline-Capable PWA)
- **Target Hardware:** Apple iPad (2018 6th Generation through current iPad, iPad Air, iPad Mini, and iPad Pro models)
- **Primary User:** Single Youth Soccer Coach (U9 / 7v7 Format)
- **Authentication:** None (Single-user local architecture with client-side persistence)

---

## 1. Mandatory Agent Continuity & Documentation Directive

> **CRITICAL DIRECTIVE FOR ALL AI AGENTS AND DEVELOPERS:**
> **"Make sure as you work -all associated internal documentation updated and does not become stale, because at any point any other model from any other provider could assume continuing the project from any point (now or in the future) that you stop."**

### 1.1 Operationalizing the Continuity Directive
Because this project may be developed, maintained, or extended across multiple sessions by different AI models and providers, every contributor must adhere to the following documentation lifecycle during every task:

1. **Live Architecture & State Tracking (ARCHITECTURE.md & PROJECT_STATE.md):**
   - Maintain a root-level **PROJECT_STATE.md** that logs completed features, in-progress modules, known bugs, data schema versions, and the exact next steps in the implementation roadmap.
   - Maintain an **ARCHITECTURE.md** detailing the state management schema, rendering pipeline, coordinate system, and AI simulation state machines.
2. **Synchronized Updates:**
   - No code change is considered complete until its corresponding internal documentation, inline JSDoc/TypeScript comments, and **PROJECT_STATE.md** entries are updated to reflect the current reality of the codebase.
3. **Self-Contained Context:**
   - Avoid implicit assumptions. Document all constants, pitch coordinate ratios, simulation weights, and iPad Safari WebKit workarounds directly in the code and markdown documentation so a newly initialized model has $100\%$ context upon reading the repository.

---

## 2. Executive Summary & Product Vision

### 2.1 Purpose
**AahPlexX/soccer** is an ultra-intuitive, touch-first tactical soccer board and live match simulator built specifically for teaching **U9 (7v7) soccer** on an iPad out on the practice field or sideline.

Coaching U9 players requires visual, interactive explanations of spatial awareness, pitch zones, the U9 Build-Out Line rule, positional discipline, drills, and set plays. Rather than acting only as a static magnet board, this tool includes a **Computer vs. Computer (CPU vs. CPU) simulation engine** that allows the coach to press "Play" and visually show $8$- and $9$-year-old players how formations move, why spacing matters, and how plays unfold dynamically.

### 2.2 Core Value Propositions
1. **Field-Ready Ergonomics:** High-contrast visuals readable in direct sunlight, large touch targets for rapid finger manipulation on an iPad screen, and full offline functionality (Service Worker caching) for soccer fields without Wi-Fi.
2. **U9-Specific Pitch & Rules:** Built strictly around the US Youth Soccer 7v7 pitch layout, featuring accurate **Build-Out Lines**, goalkeeper boxes, selectable tactical zones, and strictly the two approved team formations (**1-3-2-1** and **1-2-3-1**).
3. **Interactive CPU vs. CPU Simulation:** Autonomous player movement and ball physics that respect U9 rules (such as the Build-Out Line retreat rule and no goalkeeper punting) so players can watch tactical concepts come to life.
4. **Zero-Friction Persistence:** Instant saving and loading of custom positions, drills, plays, player numbers, and team colors locally on the iPad without logins, accounts, or servers.

---

## 3. Target Hardware & Platform Specifications

### 3.1 Supported iPad Matrix (2018 – Present)
The application must run at a locked $60\text{ fps}$ with zero layout shift across all iPad models from 2018 onward, including:
- **Baseline Device:** iPad (6th Generation, 2018) — Apple A10 Fusion chip, $2\text{ GB}$ RAM, $9.7\text{-inch}$ display ($2048 \times 1536\text{ px}$ at $264\text{ ppi}$, $4:3$ aspect ratio).
- **Modern Devices:** iPad (7th–11th Gen, $10.2\text{-inch}$ & $10.9\text{-inch}$), iPad Mini (5th–7th Gen), iPad Air (3rd Gen–M-series), iPad Pro ($11\text{-inch}$ and $12.9\text{-inch}$ / $13\text{-inch}$ models).

### 3.2 iPadOS & Safari WebKit Optimization
- **Viewport & Gesture Locking:**
  - Must prevent default Safari pull-to-refresh, pinch-to-zoom, double-tap zoom, and elastic rubber-banding (*touch-action: none; user-select: none; -webkit-user-select: none; overflow: hidden;* on the main workspace).
  - Use dynamic viewport units ($100\text{dvh}$, $100\text{dvw}$) to account for iPadOS status bars and Safari tabs, plus full support for **"Add to Home Screen"** standalone Web App mode (*apple-mobile-web-app-capable*).
- **Orientation Support:**
  - Primarily optimized for **Landscape orientation** (full horizontal pitch view with top/bottom coaching docks), with automatic responsive reflow if rotated to **Portrait orientation** (vertical pitch view).
- **Outdoor / Sunlight Readability Mode:**
  - Provide a high-contrast "Field Mode" theme alongside standard dark/turf themes, utilizing bold stroke widths ($\ge 3\text{ px}$), high-luminance zone highlights, and crisp drop shadows on player tokens.
- **Offline First (PWA):**
  - Since the iPad will be carried out to grass soccer fields without cellular or Wi-Fi coverage, a Service Worker (**sw.js**) and **manifest.json** must cache $100\%$ of application assets after the first visit to GitHub Pages.

---

## 4. U9 Pitch Geometry & Selectable Zone System

### 4.1 7v7 Pitch Specifications
The tactical board represents a standard U9 (7v7) soccer field with an aspect ratio approximating $1.35:1$ to $1.5:1$ (standard dimensions: $55\text{--}65\text{ yards}$ long by $35\text{--}45\text{ yards}$ wide).

Required permanent pitch markings:
1. **Touchlines (Sidelines) & Goal Lines (Endlines)**
2. **Halfway Line (Midfield Line)** & **Center Circle** ($8\text{-yard}$ radius scaled)
3. **Home & Away Goals** ($6.5\text{ ft} \times 18.5\text{ ft}$ scaled representation)
4. **Home & Away Goalkeeper Boxes (Penalty Areas)** ($12\text{ yards}$ deep $\times 24\text{ yards}$ wide scaled) with Penalty Spots ($10\text{ yards}$)
5. **Home & Away Build-Out Lines:** Dashed lines drawn completely across the width of the field, equidistant between the top of the Goalkeeper Box (Penalty Area) and the Halfway Line.
6. **Corner Arcs**

### 4.2 Interactive Selectable Zones
The coach must be able to tap a **"Zones"** control bar or tap directly on the pitch in Zone Mode to toggle visual highlight overlays (with customizable opacity, pulsing borders, and distinct colors) for specific regions of the field. Multi-select must be supported so the coach can highlight one or multiple zones simultaneously.

#### Required Selectable Zones:
1. **Lateral / Flank Zones (Longitudinal Splits):**
   - **Left Zone (Left Side):** The left side/channel of the pitch.
   - **Right Zone (Right Side):** The right side/channel of the pitch.
   - *(Optional Center Channel toggle to complement Left and Right).*
2. **Horizontal Pitch Bands (Goal-to-Goal Divisions):**
   - **Our Build-Out Zone (Between Our Goalkeeper/Goal Line and Our Build-Out Line):** The defensive build-out area between our endline/goalkeeper box and our Build-Out Line.
   - **Our Midfield Zone (Between Our Build-Out Line and Midfield):** The area between our Build-Out Line and the Halfway (Midfield) Line.
   - **Opposing Midfield Zone (Between Midfield and Opposing Team's Build-Out Line):** The area between the Halfway (Midfield) Line and the opposing team's Build-Out Line.
   - **Opposing Goal Zone (Between Opposing Team's Build-Out Line and Opposing Team's Goal):** The attacking area between the opposing team's Build-Out Line and the opposing team's goal line/goalkeeper box.
3. **Goalkeeper Boxes (Penalty Areas):**
   - **Our Goalkeeper Box:** Independent toggleable zone covering our team's penalty area.
   - **Opposing Team's Goalkeeper Box:** Independent toggleable zone covering the opponent's penalty area.

#### Zone Intersection & Teaching Modes:
- **Combined Selection:** If the coach selects both "Left Side" and "Between Our Build-Out Line and Midfield", the board can highlight both regions or emphasize their intersection so players immediately see the exact pocket of space being discussed.
- **Zone Restriction Drills:** In simulation or drill mode, the coach can optionally constrain players to active zones to visually demonstrate concepts like *"Stay wide in the left and right zones during build-out"* or *"Opponents cannot enter the zone between our goalkeeper and the build-out line until the ball is in play."*

---

## 5. Formations, Players & Customization

### 5.1 Strictly Enforced Preset Formations
Per U9 7v7 coaching requirements, **only two preset formations** may be included in the application. No other preset formations (e.g., no 11v11 presets or unapproved 7v7 formations) may clutter the UI.

Both formations account for $7$ players on the field per team ($1$ Goalkeeper + $6$ Field Players):

| Preset Name | Breakdown (Front-to-Back Description) | Tactical Role Mapping |
| :--- | :--- | :--- |
| **1-3-2-1** | **1 Striker, 3 Midfielders, 2 Defenders, 1 Goalkeeper** | GK (1), LD (2), RD (3), LM (4), CM (5), RM (6), ST (7) |
| **1-2-3-1** | **1 Striker, 2 Midfielders, 3 Defenders, 1 Goalkeeper** | GK (1), LD (2), CD (3), RD (4), LM (5), RM (6), ST (7) |

- **Independent Team Assignment:** The coach can independently set **Our Team (Home)** and the **Opposing Team (Away)** to either **1-3-2-1** or **1-2-3-1** with a single tap (for example, demonstrating how our **1-3-2-1** plays against an opponent's **1-2-3-1**).
- **Single-Team or Full-Pitch View:** The coach can toggle the opposing team on or off (or move specific players off-pitch to the bench) when running unopposed drills or half-field exercises.
- **Custom Positional Overrides:** While **1-3-2-1** and **1-2-3-1** are the only two formation presets, the coach can freely drag any player token to any coordinate on the pitch and save that custom arrangement as a named **Saved Position / Play / Drill**.

The ball must remain visible during possession and play in both 2D and 3D views, including when a player body would otherwise obscure it.

### 5.2 Player Tokens & Customization
Each of the $14$ players on the pitch ($7$ Home, $7$ Away) must support:
1. **Player Numbering:**
   - Editable jersey numbers ($1\text{--}99$) displayed boldly in the center of the token.
   - Optional secondary role or short name label beneath the token (e.g., `#7` with sub-label `ST` or a player's first name for game-day positioning).
2. **Player & Team Color Customization:**
   - **Team-Level Palette:** Quick-select color swatches for Our Team, Our Goalkeeper, Opposing Team, and Opposing Goalkeeper (Blue, Red, Yellow, Neon Green, Orange, White, Black, Purple).
   - **Individual Player Color Override:** Ability to tap any individual player token and assign a custom color (useful for showing players wearing different colored scrimmage pinnies or highlighting specific positional groups like midfielders vs. defenders).

---

## 6. Computer vs. Computer (CPU vs. CPU) Simulation Engine

### 6.1 Overview
A core requirement of **AahPlexX/soccer** is the live **CPU vs. CPU simulation engine**. At any point—whether starting from a default **1-3-2-1** vs. **1-2-3-1** alignment or from a custom-dragged coach scenario—the coach can tap **Play** to let the computer control both teams and play out the scenario interactively.

### 6.2 U9 Rules Engine & Behavioral Accuracy
The simulation must model realistic U9 7v7 soccer rules and tactical principles so the visual behavior reinforces the coach's lessons:

1. **The U9 Build-Out Line Rule (Mandatory):**
   - Whenever a Goalkeeper possesses the ball in their hands or sets up for a **Goal Kick**:
     - All opposing players automatically retreat behind their corresponding **Build-Out Line** (moving into the Midfield Zone).
     - The Goalkeeper waits until opponents have retreated behind the Build-Out Line before passing or rolling the ball to a teammate.
     - Once the ball is put into play, opponents may cross the Build-Out Line to pressure the ball.
   - **No Punting / Drop-Kicking:** The Goalkeeper AI never punts or drop-kicks the ball over the Build-Out Line; instead, the Goalkeeper passes or rolls the ball to defenders/midfielders who drop wide to build out of the back.
2. **Offside Enforcement (At the Attacking Build-Out Line):**
   - In U9 7v7 soccer, the attacking Build-Out Line serves as the offside line. Attacking CPU players time their forward runs relative to the opposing team's Build-Out Line and last defender.
3. **Positional Tethering & Formation Shape:**
   - Each player agent has a **Home Anchor Coordinate** $\vec{P}_{\text{anchor}}$ determined by their formation (**1-3-2-1** or **1-2-3-1**) or their last saved custom position.
   - As the ball $\vec{B} = (B_x, B_y)$ moves across the pitch, each player's dynamic target position $\vec{P}_{\text{target}}$ shifts smoothly based on ball location while maintaining formation discipline:
     $$\vec{P}_{\text{target}} = \vec{P}_{\text{anchor}} + k_x (B_x - C_x)\hat{i} + k_y (B_y - C_y)\hat{j}$$
     where $(C_x, C_y)$ is the pitch center and $(k_x, k_y)$ are tactical compactness weights.
   - **"Good Spacing" vs. "Bunching Up (Magnet Ball)" Teaching Toggle:**
     - **Good Spacing Mode (Default):** Players hold their formation zones (**1-3-2-1** or **1-2-3-1**), stay wide, and create passing triangles.
     - **Bunching Up / Swarm Demo Mode:** An educational toggle that makes players chase the ball in a pack so the coach can visually show U9 kids why bunching up leaves wide zones completely unprotected.

### 6.3 Autonomous Player Decision Loop (Utility AI / State Machine)
At each simulation frame ($\Delta t \approx 16.67\text{ ms}$ at $60\text{ fps}$), each player evaluates one of four core states:
1. **IN_POSSESSION (Ball Carrier):**
   - Evaluates open teammates (calculating pass lane clearance, distance, and forward progression), dribbles into open space, or shoots when inside the attacking zone with a clear lane to goal.
   - Optionally displays dashed decision lines showing available passes so the coach can pause and ask the players: *"Where should #5 pass the ball right now?"*
2. **SUPPORTING_ATTACK (Teammates of Ball Carrier):**
   - Moves to create passing angles (triangles and diamonds) within their assigned zone while maintaining width and depth.
3. **DEFENDING_PRESS & DEFENDING_COVER (Out of Possession):**
   - The nearest defender pressures the ball carrier while teammates shift to cover passing lanes and protect the middle of the field.
4. **BUILD_OUT_RETREAT & SET_PIECES:**
   - Enforces automatic retreat behind the Build-Out Line during opposing GK possession/goal kicks, plus automated restarts for Goal Kicks, Throw-Ins, Corner Kicks, and Kickoffs.

### 6.4 Interactive Simulation Controls
- **Play / Pause:** Instant freeze-frame at any moment during live play.
- **Live Drag-and-Resume:** While paused (or while playing), the coach can drag any player or the ball to a new spot on the pitch. Tapping Play immediately continues the CPU vs. CPU simulation from those exact positions.
- **Reset to Saved Position:** Rewinds all players and the ball back to the starting positions of the current saved snapshot.
- **Simulation Speed Control:** $0.5\times$ (Slow Motion for step-by-step teaching), $1.0\times$ (Normal), and $2.0\times$ (Fast).

---

## 7. Coaching Tools: Drills, Plays, Rules & Annotations

To help the coach visually teach rules, best practices, zones, drills, plays, and formations on the field:

### 7.1 Telestrator & Drawing Layer
- **Pass / Shot Arrow (Solid Line):** Draw straight or curved ball paths.
- **Player Run / Dribble Arrow (Dashed/Wavy Line):** Draw player movement routes.
- **Freehand Marker:** Circle open space, highlight passing triangles, or point out defensive traps.
- **One-Tap Clear Drawings:** Erases drawn ink without resetting player positions.

### 7.2 Training Equipment & Drill Props
- Drag-and-drop **Cones** (multiple colors), **Mini-Goals / Pug Goals**, and **Extra Soccer Balls** onto the field to lay out practice drills visually before players step onto the pitch.

### 7.3 Built-In U9 Teaching Presets
Pre-loaded (and customizable) starter scenarios included out of the box:
1. **Goal Kick Build-Out (1-3-2-1 & 1-2-3-1):** Shows defenders splitting wide outside the Goalkeeper Box, midfielders checking into open lanes, and opponents waiting behind the Build-Out Line.
2. **Pressing the Opponent's Build-Out:** Shows where our Striker and Midfielders line up along the opposing team's Build-Out Line and how to press once the ball is played.
3. **U9 Offside Rule Visualizer:** Demonstrates how offside only applies between the opposing team's Build-Out Line and the opposing team's goal line.
4. **Switching the Field (Left Zone to Right Zone):** Demonstrates using defenders or the central midfielder to shift the attack from a crowded side to the weak side.

---

## 8. Persistence & Data Management

### 8.1 Local Storage & IndexedDB Architecture
Because the tool is designed for a single coach on GitHub Pages without user authentication or external databases, all persistence is handled locally on the iPad:
- **Instant Auto-Save:** Every drag, number edit, color change, formation switch, or zone selection is automatically saved to **localStorage** / **IndexedDB** (*u9_tactical_board_state_v1*) within $200\text{ ms}$ so refreshing Safari or closing the iPad cover never loses the current board.
- **Saved Positions, Plays & Drills Library:**
  - The coach can save an unlimited number of custom presets categorized by tabs: **Formations**, **Positions**, **Plays**, **Drills**, and **Rules**.
  - Each saved preset stores:
    - Title, category, and timestamp.
    - Active formations (**1-3-2-1** or **1-2-3-1**) for both teams.
    - Normalized $(x, y)$ coordinates ($[0.0, 1.0]$) of all players, balls, and drill cones.
    - Player numbers, custom labels, and individual/team colors.
    - Active selected zones.
    - Drawn telestrator annotations.

### 8.2 JSON Backup Export / Import (iPad Files & AirDrop Ready)
- **Export Backup (.json):** One-tap export of all saved positions, plays, and drills to a `.json` file in iPad Files / iCloud Drive.
- **Import Backup (.json):** Restores or merges a saved `.json` backup file via the native iPadOS file picker.

---

## 9. UI/UX & Touch Ergonomics

### 9.1 Workspace Layout
    +-------------------------------------------------------------------------+
    | [Us: 1-3-2-1 | 1-2-3-1] [Them: 1-3-2-1 | 1-2-3-1] [Zones] [Saved Plays] | <- Top Bar
    +-------------------------------------------------------------------------+
    |                                                                         |
    |   +---------------+                |                +---------------+   |
    |   |               |       :        |        :       |               |   |
    |   |    GK Box     |   Build-Out    |    Build-Out   |    GK Box     |   |
    |   |  +----+       |     Line       |      Line      |       +----+  |   |
    |   |  |GK 1|       |       :        |        :       |       |1 GK|  |   |
    |   |  +----+       |       :   (O)  |        :       |       +----+  |   |
    |   |               |       :        |        :       |               |   |
    |   +---------------+                |                +---------------+   |
    |                                                                         |
    |    Our GK->Build     Build->Mid    |   Mid->OppBld   OppBld->OppGoal    |
    +-------------------------------------------------------------------------+
    | [Move] [Draw] [Cones] | [|> Play CPUvCPU] [Reset] [0.5x/1x] | [Save As] | <- Bottom Dock
    +-------------------------------------------------------------------------+

### 9.2 Touch Interaction Rules for iPad
1. **Large Touch Targets:** All buttons, zone toggles, and player tokens must have a minimum hit-box of $48 \times 48\text{ CSS pixels}$ (exceeding Apple's $44\text{ pt}$ Human Interface Guideline minimum).
2. **Finger Halo While Dragging:** When dragging a player token on an iPad touch screen, a clear highlight ring renders around the token so the player number and exact placement remain visible under the coach's finger.
3. **Single-Tap Player Popover:** Tapping a player token opens a compact popover right next to the token to quickly change:
   - Player Number ($1\text{--}99$)
   - Player Name / Role Label
   - Individual Player Color or Team Color
4. **Dedicated Zone Selector Bar:** A visual zone selector bar allowing one-tap toggling of any combination of:
   - **Left Zone**
   - **Right Zone**
   - **Our Goalkeeper Box**
   - **Between Our Goalkeeper and Build-Out Line**
   - **Between Our Build-Out Line and Midfield**
   - **Between Midfield and Opposing Build-Out Line**
   - **Between Opposing Build-Out Line and Opposing Goal**
   - **Opposing Goalkeeper Box**

---

## 10. Technical Architecture & Repository Standards

### 10.1 Clean GitHub Pages Architecture
- **GitHub Pages deployment:** The application must build and deploy cleanly and reliably to GitHub Pages (`https://aahplexx.github.io/soccer/`). Frameworks, languages, build tools, and client-side dependencies may be chosen based on product and engineering needs. The deployed output must work on GitHub Pages and support the offline requirements.
- **Retina Canvas / SVG Rendering:** Scales automatically using `window.devicePixelRatio` so pitch markings, text labels, and player tokens remain razor-sharp on all Retina iPad screens.
- **Amendment 2026-10-28 (owner request: real-time perspective, camera angle, and zoom control):** the 2D SVG board remains the default view and the precise editing surface. An optional **3D camera view** (perspective camera, orbit, tilt, zoom, preset angles) may use the Three.js library as the project's first runtime dependency, vendored as a pinned file so deployment stays a static, build-step-free GitHub Pages site and the file is precached for offline use. The 3D view is lazy-loaded and must fail gracefully (2D unaffected) on devices without WebGL. Requirements `CAM-001` to `CAM-007` are tracked in `PROJECT_STATE.md`. Migrating to a bundler, React, or TypeScript is not required by this amendment (see the historical decision log in `docs/PROJECT_STATE_through_1.0.2.md`).

### 10.2 App versions and updates

- The initial official application version is **1.0.0**. Each significant update increments the patch component by one (for example, 1.0.0 → 1.0.1).
- When a new deployment is available, show a modal with its available version and **Update** and **Cancel** choices. Update applies the new version; Cancel leaves the current session in use. No release description is required.

### 10.3 Normalized Pitch Coordinate System
All internal pitch logic, zone boundaries, saved positions, and CPU simulation physics operate on a resolution-independent normalized coordinate space:
- **Horizontal Length:** $x \in [0.0, 1.0]$ (where $x = 0.0$ is Our Goal Line, $x = 0.50$ is the Midfield Line, and $x = 1.0$ is the Opposing Goal Line).
- **Vertical Width:** $y \in [0.0, 1.0]$ (where $y = 0.0$ is the Left Touchline and $y = 1.0$ is the Right Touchline when attacking left-to-right).
- **Exact Zone Coordinate Boundaries:**
  - **Left Zone:** $x \in [0.0, 1.0], y \in [0.0, 0.50]$ (or configurable Left Wing channel $y \in [0.0, 0.33]$)
  - **Right Zone:** $x \in [0.0, 1.0], y \in [0.50, 1.0]$ (or configurable Right Wing channel $y \in [0.67, 1.0]$)
  - **Our Goalkeeper Box:** $x \in [0.0, 0.20], y \in [0.20, 0.80]$
  - **Between Our Goalkeeper and Build-Out Line:** $x \in [0.0, 0.35], y \in [0.0, 1.0]$ (with option to exclude or overlay Our Goalkeeper Box)
  - **Between Our Build-Out Line and Midfield:** $x \in [0.35, 0.50], y \in [0.0, 1.0]$
  - **Between Midfield and Opposing Build-Out Line:** $x \in [0.50, 0.65], y \in [0.0, 1.0]$
  - **Between Opposing Build-Out Line and Opposing Goal:** $x \in [0.65, 1.0], y \in [0.0, 1.0]$
  - **Opposing Goalkeeper Box:** $x \in [0.80, 1.0], y \in [0.20, 0.80]$

### 10.4 Mandatory Repository Documentation Files
In accordance with Section 1, the repository must maintain the following documentation files at all times:
1. **README.md** — Project overview, iPad setup instructions ("Add to Home Screen"), feature guide, and GitHub Pages URL.
2. **PRD.md** — This Product Requirements Document.
3. **ARCHITECTURE.md** — Detailed technical design covering the coordinate system, zone geometry, simulation AI state machine, and storage schema.
4. **PROJECT_STATE.md** — Living handoff document updated during every work session detailing current implementation status, completed milestones, active work, and technical decisions so any AI model from any provider can seamlessly pick up development at any point.

---

## 11. Acceptance Criteria & Verification Checklist

1. **Formations Restriction:**
   - [ ] Only **1-3-2-1** (1 Striker, 3 Midfielders, 2 Defenders, 1 Goalkeeper) and **1-2-3-1** (1 Striker, 2 Midfielders, 3 Defenders, 1 Goalkeeper) are included as preset formations.
   - [ ] Both Our Team and the Opposing Team can independently switch between **1-3-2-1** and **1-2-3-1**.
2. **Selectable Zones:**
   - [ ] Coach can select and highlight: Left side, Right side, Our Goalkeeper Box, Opposing Goalkeeper Box, between Our Goalkeeper and Build-Out Line, between Our Build-Out Line and Midfield, between Midfield and Opposing Build-Out Line, and between Opposing Build-Out Line and Opposing Goal.
   - [ ] Multiple zones can be selected simultaneously or cleared in one tap.
3. **Player Customization & Persistence:**
   - [ ] Every player token supports custom numbers and custom colors (team-wide and individual player overrides).
   - [ ] Custom positions, formations, player numbers/colors, active zones, and drawings persist automatically via local storage and can be saved/loaded as named presets or exported/imported as JSON.
4. **CPU vs. CPU Simulation:**
   - [ ] Pressing "Play" runs a $60\text{ fps}$ Computer vs. Computer simulation where both teams pass, dribble, defend, and shoot autonomously.
   - [ ] Simulation enforces U9 Build-Out Line rules (opponents retreat behind the Build-Out Line on GK possession/goal kicks; GK passes/rolls out of the back instead of punting).
   - [ ] Coach can pause at any time, drag players or the ball to new positions, and resume or reset.
5. **iPad Compatibility (2018–Present):**
   - [ ] Full compatibility and smooth touch dragging across all iPad models from 2018 to present without accidental viewport zooming or scrolling.
   - [ ] Offline-capable PWA hosted cleanly on GitHub Pages without user authentication.
6. **Agent Continuity Mandate:**
   - [ ] All internal documentation (**ARCHITECTURE.md**, **PROJECT_STATE.md**, and inline code documentation) is kept $100\%$ up to date during every step of work so any model from any provider can resume the project seamlessly.

## 12. Field-coaching workflows (1.0.4)

The owner requested a practical single-coach tool for drill teaching, simulation and general coaching. This section supersedes earlier backlog deferrals for the implemented workflow below. Collaboration is explicitly excluded: no accounts, shared workspace, invitations, chat, remote synchronization or simultaneous editing.

1. **Prepare:** choose the two allowed shapes, retain player names/numbers/colors when desired, bench/return individual players or select 3v3/4v4 without keepers, and set up colored equipment. A new drill may retain roster identities; the coach can duplicate or confirm clearing props while protecting the primary ball and players. Hidden opponents and benched opponents are distinct.
2. **Brief:** save a title, learning objective, setup/equipment, instructions, coaching cues/questions, easier/harder progression and 1–120 minute duration with each local saved board. Existing user setups can be updated by ID; built-ins remain immutable and include example briefs.
3. **Teach:** capture up to 12 independent, named board snapshots with their own briefs; rename, reorder, replace and remove them. Previous/Next must load paused snapshots, enabling an exact authored play, drill progression or ordered practice plan. This is separate from autonomous simulation. Annotations include freehand, straight pass/run arrows, a dragged route arrow, individual erasure and Undo. 3D must display the same teaching annotations and optional pass-option lines.
4. **Explore:** Play/Pause or advance exactly one simulated second at normal speed. All benched players are excluded from physics, passing, defending, keeping, offside support and restarts. A saved starting setup must survive reload and restore the board paused while preserving the current brief/sequence.
5. **Run:** provide an independent real-time countdown with pause/reset and visible completion. It must account for elapsed background time, remain independent of CPU speed and start paused after reload. No automatic progression or audio alarm is required.
6. **Take away:** print the full 2D diagram with its applied brief or a multi-page captured plan using the browser's print/Save PDF interface. Backups must include briefs, participants, starting setups and captured steps. No upload is involved.

The CPU is a simplified U9 teaching model. Written drill rules, arrows, cones, extra balls and mini goals are visual aids; custom scoring and arbitrary route execution are not claimed. Exact demonstrations use paused snapshots. Physical-iPad touch, outdoor use, Safari printing, offline/Home Screen updates and the baseline 60 fps target require device evidence separate from unit tests and Chromium checks.
