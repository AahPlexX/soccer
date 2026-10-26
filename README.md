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
- Player number, label, individual color editing, and team/goalkeeper color palettes.
- Opponent visibility toggle, turf/dark/field themes, landscape and portrait pitch rendering.
- Freehand telestration, arrows, cones, extra soccer balls, clear drawings, play/pause/reset, 0.5×/1×/2× simulation speed, and good-spacing/bunching teaching modes.
- Four built-in teaching scenarios: goal-kick build-out, press the opponent build-out, U9 offside visualizer, and switching the field.
- Autosave within a 120 ms debounce, IndexedDB saved positions with localStorage fallback, JSON backup export/import.
- Offline app-shell caching and installable web-app manifest.

## Documentation

- [PRD.md](./PRD.md) — authoritative product requirements.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — current technical design and invariants.
- [PROJECT_STATE.md](./PROJECT_STATE.md) — live implementation status, verification evidence, known gaps, and next work.

Keep these files synchronized with code changes. `PROJECT_STATE.md` is the handoff entry point for continuation work.
