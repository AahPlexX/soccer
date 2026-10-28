// 2D zoom and pan (CAM-001). A view is { scale, x, y }: the board is drawn with `translate(x y) scale(scale)` inside the
// SVG, in viewBox units, so scale 1 with x = y = 0 shows the whole pitch.
export const ZOOM_RANGE = Object.freeze({ min: 1, max: 4 });
export const IDENTITY_VIEW = Object.freeze({ scale: 1, x: 0, y: 0 });

const clampScale = (scale) => Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, scale));

/** Limits the scale and pan so the zoomed board always covers the `width` × `height` viewport. */
export function clampView(view, width, height) {
  const scale = clampScale(view.scale);
  return {
    scale,
    x: Math.min(0, Math.max(width * (1 - scale), view.x)),
    y: Math.min(0, Math.max(height * (1 - scale), view.y)),
  };
}

/** Zooms by `factor` while the viewBox point (focusX, focusY) stays fixed on screen. */
export function zoomAt(view, factor, focusX, focusY, width, height) {
  const scale = clampScale(view.scale * factor);
  const ratio = scale / view.scale;
  return clampView({ scale, x: focusX - (focusX - view.x) * ratio, y: focusY - (focusY - view.y) * ratio }, width, height);
}

/** Pans by (dx, dy) in viewBox units. */
export const panBy = (view, dx, dy, width, height) => clampView({ ...view, x: view.x + dx, y: view.y + dy }, width, height);

export const viewTransform = (view) => `translate(${view.x} ${view.y}) scale(${view.scale})`;

/** Width and height from an SVG `viewBox` attribute such as "0 0 1000 680". */
export function viewBoxSize(viewBox) {
  const [, , width, height] = String(viewBox).trim().split(/[\s,]+/).map(Number);
  return { width, height };
}
