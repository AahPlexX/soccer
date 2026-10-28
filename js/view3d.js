// The 3D camera view (CAM-002, CAM-003, CAM-007). Loaded lazily by js/app.js the first time the coach asks for 3D, so
// Three.js (vendor/three) costs nothing until then. createView3D() throws when WebGL is unavailable; the caller falls
// back to the 2D board. The camera is an orbit (js/camera-orbit.js): drag to rotate and tilt, wheel or pinch to zoom,
// two fingers, right-drag, or Shift-drag to pan. The scene reads the live board state every frame (js/board-scene.js).
import { buildBoardScene } from './board-scene.js';
import { CAMERA_FOV_DEGREES, DEFAULT_PRESET, groundPerPixel, orbitPosition, panOrbit, presetOrbit, rotateOrbit, zoomOrbit } from './camera-orbit.js';

const ROTATE_RADIANS_PER_PIXEL = 0.006;
const WHEEL_ZOOM_PER_PIXEL = 0.0015;
const PINCH_WHEEL_ZOOM_PER_PIXEL = 0.01; // a trackpad pinch arrives as a wheel event with ctrlKey

export async function createView3D({ container, getState, onContextLost = () => {} }) {
  const THREE = await import('../vendor/three/three.module.js');
  const renderer = new THREE.WebGLRenderer({ antialias: true }); // throws without WebGL
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', '3D view of the pitch. Drag to rotate, scroll or pinch to zoom, two fingers to pan.');
  canvas.setAttribute('role', 'img');
  container.append(canvas);

  const makeTexture = (draw, width, height) => {
    const surface = document.createElement('canvas');
    surface.width = width;
    surface.height = height;
    draw(surface.getContext('2d'), width, height);
    const texture = new THREE.CanvasTexture(surface);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  };
  const board = buildBoardScene(THREE, { makeTexture });
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEGREES, 4 / 3, 0.5, 400);

  let preset = DEFAULT_PRESET;
  let orbit = presetOrbit(preset);
  let frame = 0;
  let width = 0;
  let height = 0;

  function resize() {
    const { clientWidth, clientHeight } = container;
    if (!clientWidth || !clientHeight || (clientWidth === width && clientHeight === height)) return;
    width = clientWidth;
    height = clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function render() {
    frame = requestAnimationFrame(render);
    resize();
    if (!width) return;
    board.sync(getState());
    const position = orbitPosition(orbit);
    camera.position.set(position.x, position.y, position.z);
    camera.lookAt(orbit.target.x, 0, orbit.target.z);
    renderer.render(board.scene, camera);
  }

  const pointers = new Map(); // active pointers: id -> { x, y, button }
  let pinch = null; // two-pointer gesture: last finger distance and midpoint

  const pinchState = () => {
    const [a, b] = [...pointers.values()];
    return { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const panByPixels = (dx, dy) => {
    const ground = groundPerPixel(orbit, height || 1);
    orbit = panOrbit(orbit, -dx * ground, dy * ground);
  };

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, button: event.button });
    pinch = pointers.size === 2 ? pinchState() : null;
  });
  canvas.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    pointers.set(event.pointerId, { ...previous, x: event.clientX, y: event.clientY });
    if (pinch && pointers.size === 2) {
      const next = pinchState();
      orbit = zoomOrbit(orbit, next.distance / pinch.distance);
      panByPixels(next.x - pinch.x, next.y - pinch.y);
      pinch = next;
    } else if (pointers.size === 1) {
      if (previous.button === 2 || event.shiftKey) panByPixels(dx, dy);
      else orbit = rotateOrbit(orbit, dx * ROTATE_RADIANS_PER_PIXEL, dy * ROTATE_RADIANS_PER_PIXEL);
    }
  });
  const endPointer = (event) => {
    pointers.delete(event.pointerId);
    pinch = pointers.size === 2 ? pinchState() : null;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    orbit = zoomOrbit(orbit, Math.exp(-event.deltaY * (event.ctrlKey ? PINCH_WHEEL_ZOOM_PER_PIXEL : WHEEL_ZOOM_PER_PIXEL)));
  }, { passive: false });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    cancelAnimationFrame(frame);
    frame = 0;
    onContextLost();
  });

  return {
    /** Starts drawing frames (also after the container was hidden). */
    start() { if (!frame) frame = requestAnimationFrame(render); },
    /** Stops drawing; the scene and renderer stay ready for the next start. */
    stop() { cancelAnimationFrame(frame); frame = 0; },
    /** Moves the camera to a named preset (js/camera-orbit.js). */
    setPreset(name) { preset = name; orbit = presetOrbit(name, width && height ? width / height : 4 / 3); },
    /** Returns the camera to the current preset. */
    reset() { orbit = presetOrbit(preset, width && height ? width / height : 4 / 3); },
    /** Zooms by a factor (greater than 1 moves closer). */
    zoom(factor) { orbit = zoomOrbit(orbit, factor); },
    get orbit() { return orbit; },
    dispose() {
      cancelAnimationFrame(frame);
      frame = 0;
      board.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
