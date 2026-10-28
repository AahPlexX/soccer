// Undo/redo for coaching edits. A snapshot holds only what the coach builds (players, props, drawings, zones, colors,
// shapes), never the tool, theme, selection, or the running simulation, so changing tools is not an undo step.
export const EDIT_KEYS = Object.freeze([
  'homeFormation', 'awayFormation', 'awayVisible', 'selectedZones', 'zoneRestrictionMode', 'zoneRestrictionScope',
  'coaching', 'zoneOpacity', 'colors', 'coneColor', 'players', 'balls', 'cones', 'miniGoals', 'drawings',
]);

const read = (state) => JSON.stringify(EDIT_KEYS.map((key) => state[key]));
const apply = (state, snapshot) => JSON.parse(snapshot).forEach((value, index) => { state[EDIT_KEYS[index]] = value; });

export function createHistory(limit = 50) {
  const undoStack = [];
  const redoStack = [];
  let baseline = '';

  const move = (from, to, state) => {
    if (!from.length) return false;
    to.push(baseline);
    baseline = from.pop();
    apply(state, baseline);
    return true;
  };

  return {
    /** Starts a fresh history from the board as it is now. */
    reset(state) { baseline = read(state); undoStack.length = 0; redoStack.length = 0; },
    /** Adopts the current content as the baseline without a step (the simulation moving players is not an edit). */
    rebase(state) { baseline = read(state); },
    /** Adds an undo step when the edited content changed since the baseline. Returns whether a step was added. */
    record(state) {
      const content = read(state);
      if (content === baseline) return false;
      undoStack.push(baseline);
      if (undoStack.length > limit) undoStack.shift();
      redoStack.length = 0;
      baseline = content;
      return true;
    },
    undo: (state) => move(undoStack, redoStack, state),
    redo: (state) => move(redoStack, undoStack, state),
    get canUndo() { return undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; },
  };
}
