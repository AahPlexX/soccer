// Game Mode entry point. The only module the Coach app imports (lazily, from app.js); see docs/GAME_MODE.md.
// Phase G0: mounts the full-screen layer and exits cleanly. Later phases add the match, input, rendering and menus here.

const STYLE_URL = new URL('./game.css', import.meta.url).href;

function loadStyles() {
  if (document.querySelector('link[data-game-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = STYLE_URL;
  link.dataset.gameStyle = '';
  document.head.append(link);
}

/**
 * Mounts Game Mode into `root` and returns { stop }. `onExit` is called when the player leaves from inside the game;
 * `stop()` removes everything the game added (the Coach UI is never touched).
 */
export function startGame({ root, onExit }) {
  loadStyles();
  const title = document.createElement('h2');
  title.textContent = 'Game Mode';
  const note = document.createElement('p');
  note.textContent = 'The match engine is being built in phases. Press Escape or Back to return to the coach board.';
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Back to coach';
  back.addEventListener('click', () => onExit());
  const panel = document.createElement('div');
  panel.className = 'game-panel';
  panel.append(title, note, back);

  const onKey = (event) => { if (event.key === 'Escape') onExit(); };
  document.addEventListener('keydown', onKey);
  root.replaceChildren(panel);
  root.hidden = false;
  back.focus();

  return {
    stop() {
      document.removeEventListener('keydown', onKey);
      root.replaceChildren();
      root.hidden = true;
    },
  };
}
