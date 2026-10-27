# U9 Tactical Soccer Board

AahPlexX/soccer is an offline-capable 7v7 tactical board and teaching simulator for a single youth soccer coach. The product follows the requirements in [PRD.md](./PRD.md): two approved formations, selectable teaching zones, draggable players and ball, local persistence, telestration, and a CPU-vs-CPU teaching simulation.

## Run locally

The application has no build step and no runtime dependencies. Serve the repository root over HTTP because service workers do not run from `file://` URLs.

```bash
python -m http.server 8080
```

Open `http://localhost:8080/`.

Tests use the Node.js standard test runner:

```bash
npm test
```

## Validation

Every push to `main` runs `.github/workflows/validate.yml`. The workflow runs the behavior/integrity test suite and syntax-checks every runtime JavaScript module plus `sw.js`. The repository-integrity tests also verify that the service-worker app shell does not reference missing files and does not omit install-critical local assets or reachable static ES-module dependencies.

The current combined runtime gate has passed 56/56 tests plus JavaScript syntax checks. A green workflow proves only those automated checks. Physical-iPad touch behavior, standalone Home Screen behavior, offline use, outdoor readability, and the PRD's 2018-iPad 60 fps target require separate browser or real-device evidence before they can be marked verified.

## GitHub Pages

Deployment target: `https://aahplexx.github.io/soccer/`.

The repository is intentionally static. `index.html` loads native ES modules, and `sw.js` precaches the complete app shell for offline use after the first successful visit.

### Add to Home Screen on iPad

1. Open the GitHub Pages URL in Safari.
2. Use Share → Add to Home Screen.
3. Launch the saved app from the Home Screen for a standalone coaching workspace.

## Current feature set

- 7v7 pitch with halfway line, penalty areas, build-out lines, goals, center circle, penalty spots, and corner arcs.
- Independent 1-3-2-1 and 1-2-3-1 formations for both teams. No other preset formations exist.
- Touch, pen, mouse, and keyboard player/ball movement through Pointer Events and keyboard nudging.
- Multi-select teaching zones with adjustable opacity; overlaps naturally emphasize intersections.
- Optional zone drill rules: keep Our team, Opponents, or Both teams inside or out of the currently selected zone union. Mandatory U9 build-out retreat and legal restart placement take precedence over optional drill constraints.
- Player number, label, individual color editing, and team/goalkeeper color palettes.
- Opponent visibility toggle, turf/dark/field themes, landscape and portrait pitch rendering.
- Freehand telestration, arrows, cones, mini goals, extra soccer balls, clear drawings, play/pause/reset, 0.5×/1×/2× simulation speed, and good-spacing/bunching teaching modes.
- CPU-vs-CPU passing (receivers with an opponent-blocked lane are skipped), dribbling movement, pressing, U9 build-out retreat, simplified offside support, and explicit automated throw-in, goal-kick, corner, and kickoff restart states.
- Deterministic varied shooting with goalkeeper catch/parry/goal outcomes; the fixed sequence keeps teaching replays reproducible instead of introducing random results.
- Four built-in teaching scenarios: goal-kick build-out, press the opponent build-out, U9 offside visualizer, and switching the field.
- Autosave within a 120 ms debounce, IndexedDB saved positions with localStorage fallback, category tabs over built-in and saved items, a title/category editor for saved presets, a two-step in-app delete confirmation, and JSON backup export/import.
- Offline app-shell caching and installable web-app manifest; current cache generation `v7` includes the restart and zone-constraint module graph plus the current shot/goalkeeper runtime.

## Documentation

- [PRD.md](./PRD.md) — authoritative product requirements.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — current technical design and invariants.
- [PROJECT_STATE.md](./PROJECT_STATE.md) — live implementation status, verification evidence, known gaps, and next work.

Keep these files synchronized with code changes. `PROJECT_STATE.md` is the handoff entry point for continuation work.
