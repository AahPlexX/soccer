import { PALETTE } from './constants.js';

/**
 * Quick-select color swatches (PRD 5.2) over a palette <select>. The select stays the source of truth, so forms, saves
 * and tests keep working; it is hidden and the swatches mirror it. Returns refresh(), which re-reads the select after
 * its value was set from code. Each swatch is 48px with a check mark on the chosen one, so color is never the only cue.
 */
export function addSwatches(select, labels) {
  const group = document.createElement('div');
  group.className = 'swatches';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', select.closest('label')?.firstChild?.textContent?.trim() || 'Color');
  const swatches = Object.entries(PALETTE).map(([name, value]) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'swatch';
    swatch.dataset.value = value;
    swatch.style.setProperty('--swatch', value);
    swatch.setAttribute('role', 'radio');
    swatch.setAttribute('aria-label', labels[name] ?? name);
    swatch.addEventListener('click', () => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      refresh();
    });
    return swatch;
  });
  function refresh() {
    const known = swatches.some((swatch) => swatch.dataset.value === select.value);
    swatches.forEach((swatch, index) => {
      const checked = swatch.dataset.value === select.value;
      swatch.setAttribute('aria-checked', String(checked));
      swatch.tabIndex = checked || (!known && index === 0) ? 0 : -1;
    });
  }
  group.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const at = swatches.findIndex((swatch) => swatch.dataset.value === select.value);
    const next = swatches[(Math.max(at, 0) + step + swatches.length) % swatches.length];
    next.click();
    next.focus();
  });
  group.append(...swatches);
  select.after(group);
  select.hidden = true;
  refresh();
  return refresh;
}
