# Field coaching workflows

Version 1.0.4 · single coach · local device · offline after installation

## Before practice: prepare an activity

1. Load one of the four built-in scenarios, or use **Coach workspace → Setup & equipment actions → New drill · keep roster**. New drill requires a second tap; Undo recovers the previous board.
2. Choose the two approved team shapes. Use **Players on pitch & bench** for 3v3, 4v4, unequal numbers, or an unopposed walk-through. You can also bench a player from its editor and return it using its bench chip. The count shortcuts omit goalkeepers; add a keeper with its checkbox if the activity needs one. Bench selections affect the CPU, not just visibility. **Hide opponents** is a visual switch and does not bench them.
3. Name players through their editor, set colors, and optionally keep this roster when loading other setups. Only names, numbers and colors are reused; the loaded activity retains its own positions and participant selections.
4. Place and color cones, mini goals and extra balls in 2D. Select a prop before duplicating or removing it. Clear all props requires a second tap, preserves the match ball and players, and can be undone.
5. Apply a brief: objective, setup/equipment, instructions, coaching cues/questions, an easier or harder progression, and 1–120 minute duration. Notes are plain text, not simulation commands.
6. Set the current board as the starting setup. Save a named Position, Play or Drill. The starting board, notes, bench, and teaching sequence are included in that saved item and in JSON backups. **Save changes to loaded setup** updates a user preset by the same ID; built-ins stay immutable. **Save position** creates a new copy.

The four built-ins contain example briefs: goal-kick build-out, press the opponent build-out, U9 offside discussion, and switching the field. Adapt their teaching points to the children and your league's local rules.

## Teach a play or rehearse a progression

- Use the solid pass arrow, dashed run arrow, freehand drawing or **Route arrow** (drag a route with an arrowhead). **Erase drawing** removes the nearest stroke/arrow without deleting players or props. Undo restores edits.
- In **Teaching / practice sequence**, name and capture a board with its applied brief. Move the players/ball, revise the notes if needed, and capture the next stage. Up to 12 independent snapshots can represent a passing pattern, drill variations, or an ordered practice plan.
- Rename, reorder, replace or remove steps in the workspace. The board's Previous/Next controls load them paused; they do not animate an authored pass. The CPU explores play independently and does not follow arrows.
- 2D is the editing surface. In 3D, drawings, zones and optional clear pass lanes are shown along with the live participants, ball and equipment. Camera presets and orbit controls help explain the same situation from different viewpoints.

## Explore a scenario with the CPU

- Play/Pause freezes discussion immediately. **Advance 1 second** pauses and advances exactly one simulated second at normal simulation speed, irrespective of the speed selector. It is a time step, not a guarantee of one pass or decision.
- Move a player or the ball, then continue. A moved player becomes a new tactical anchor; moving the ball/carrier clears the previous pass/restart. Benched players do not receive passes, press, tackle, save, take restarts, constrain offside positions, or block collision space.
- Use **Pass options** to discuss open lanes; its status explains when the ball is loose, in flight, or has no visible option. Compare good spacing against bunching while markers stay physically separated.
- Use zone highlights alone, or optional keep-in/keep-out rules. U9 build-out and legal restart placement take precedence over drill constraints. **Return to starting setup** (or Reset) restores the saved start, paused, while retaining the latest brief and sequence.

The CPU remains a simplified U9 teaching simulation. It uses the main goals and the primary ball; cones, mini goals, extra balls, written rules and arrows are visual teaching aids. It does not enforce custom scoring, every offside/foul law, or a coach-authored route. For exact prescribed patterns use the paused snapshots. With all players benched the simulation stays paused. A goalkeeper alone has no distribution option.

## Run the activity on the field

- The drill clock uses real elapsed time, not simulation speed. Start/pause/reset it independently while showing the board. It catches up after a backgrounded tab and displays completion; it does not sound an alarm or automatically advance the session. A reload starts the clock paused at the configured duration.
- Use the brief for one or two cues, rotate participants through the bench, then load the easier/harder captured variation. You can edit notes without restarting an unchanged-duration clock.
- Setups and notes autosave. A named library save is the reusable drill; export JSON to make a separate backup in Files. JSON import restores the board and merges saved presets. Keep a backup before clearing browser/site data.

## Take a copy to the field

**Print / Save PDF** prepares the full landscape 2D diagram and applied brief using the browser's print dialog. Check **Include captured sequence** for a multi-page practice/teaching plan. Choose the browser's Save as PDF option if desired; no upload or server is involved. The printable view hides controls and shows active participants, drawings and props.

## Boundaries and future work

This release has no accounts, multi-user editing, chat, shared workspaces, remote sync, invites or collaboration features. Saved boards belong to the current browser/device. The product is a tactical teaching aid, not attendance software, a match officiating system or a player-tracking service.

Still requiring real-device evidence: 2018 iPad performance, touch comfort, Home Screen/offline update behavior, and Safari printing. Optional future improvements include editing on the 3D ground plane, player-follow cameras, and richer drill-rule enforcement. No claim of verified 60 fps is made.
