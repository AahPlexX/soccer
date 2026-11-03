# Audit tasks (Nov 2026 fresh-eyes audits)

Full reports: `.agents/tasks/audit-coach-board.md` and `.agents/tasks/audit-game-mode.md`. IDs match those reports.

## Done in this change
- [x] CB-A1 Reset returns to the board as it was when Play/Step began (keeps dragged layout and hand-drawn arrows)
- [x] CB-A3 Backup import keeps a newer same-id preset already on the device
- [x] CB-A6 Autosave flushes on `pagehide` / tab hidden
- [x] CB-B1 Zone-opacity slider: one undo step per drag
- [x] CB-B2 One-point drawings discarded (on draw and on load)
- [x] CB-B3 Eraser no longer deletes play-script arrows
- [x] CB-C2 Right/middle mouse click no longer draws or drags
- [x] CB-C5 Ball/cone/goal aria-labels no longer promise "Enter to edit"
- [x] GM-A1 Stuck keys from OS auto-repeat
- [x] GM-A4 Manual player switch also holds while defending
- [x] GM-B1 Replay no longer re-triggers after skip/finish
- [x] GM-C1 Difficulty applies to the opponent only
- [x] GM-D1 Pause/mute buttons raised above the touch joystick zone
- [x] GM-E1 Kids difficulty persists

## Open: Coach's Board
- [ ] A2 Warn before step/Load/Import replaces unsaved edits
- [ ] A4 Schema migration path; keep previous autosave
- [ ] A5 Save updates the loaded item (Save as copy separate)
- [ ] A7 Distinguish quota errors; A8 keep possession through Undo
- [ ] B3-follow-up erase script task with arrow; B4 other team sizes; B5 text/shape tools; B6 image export/share; B7 animated steps; B8 opponent scripts; B9 clock alert; B11 duplicate numbers; B12 library search/preview; B13 persist settings
- [ ] C1 incremental stroke render + point thinning; C3/C4/C6 pan, eraser reach, tap-steal
- [ ] D1-D5 accessibility; E1 mobile control rows; E3 iOS share; F1-F4 PWA; G1-G3 perf; H1-H6 code quality/tests

## Open: Game Mode
- [ ] A2 pass on press; A3 input buffer; A5 keeper dive unreachable; A6 gamepad D-pad/mapping; A7 key labels/rebind; A8 Tab binding
- [ ] B2 free-kick distance / box fouls; B3 stand-tackle cooldown; B4-B7 dribbling risk, half-time, time-up restart, goal-against feedback
- [ ] C2-C4 AI polish; D2 touch detection; D3 settings remount; D4-D5 touch text/swipe
- [ ] E2-E3 settings; F1-F4 sprite prewarm, idle work, zoom, stamina hysteresis
- [ ] G1-G5 accessibility; H1 audio volume; I1-I5 DOM-layer tests, dedupe, state machine
