// The 3D camera view (CAM-002, CAM-003, CAM-007). Loaded lazily by js/app.js the first time the coach asks for 3D, so
// Three.js (vendor/three) costs nothing until then. createView3D() throws when WebGL is unavailable; the caller falls
// back to the 2D board. The camera is an orbit (js/camera-orbit.js): drag to rotate and tilt, wheel or pinch to zoom,
// two fingers, right-drag, or Shift-drag to pan. The scene reads the live board state every frame (js/board-scene.js).
import { buildBoardScene, fromWorld, toWorld } from './board-scene.js';
import { CAMERA_FOV_DEGREES, DEFAULT_PRESET, followOrbit, groundPerPixel, orbitPosition, panOrbit, presetOrbit, rotateOrbit, zoomOrbit } from './camera-orbit.js';

const ROTATE_RADIANS_PER_PIXEL = 0.006;
const WHEEL_ZOOM_PER_PIXEL = 0.0015;
const PINCH_WHEEL_ZOOM_PER_PIXEL = 0.01; // a trackpad pinch arrives as a wheel event with ctrlKey

export async function createView3D({ container, getState, onContextLost = () => {}, isEditing = () => false, onObjectSelect = () => {}, onObjectMove = () => {}, onObjectCommit = () => {}, onGroundTap = () => {}, onFollowChange = () => {} }) {
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
  let follow = 'off'; // 'ball' or 'selected': the camera target eases toward it each frame; panning by hand turns it off
  let frame = 0;
  let width = 0;
  let height = 0;

  // What the follow camera tracks: the match ball, or the selected player (or ball) when one is selected.
  function followSubject(state) {
    if (follow === 'ball') return state.balls[0] ?? null;
    if (follow !== 'selected') return null;
    return [...state.players.filter((player) => !player.benched), ...state.balls].find((item) => item.id === state.selectedObjectId) ?? null;
  }

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
    board.sync(getState(), { showPassOptions: document.documentElement.dataset.passOptions === 'true' });
    const subject = followSubject(getState());
    if (subject) orbit = followOrbit(orbit, toWorld(subject.x, subject.y));
    const position = orbitPosition(orbit);
    camera.position.set(position.x, position.y, position.z);
    camera.lookAt(orbit.target.x, 0, orbit.target.z);
    renderer.render(board.scene, camera);
  }

  const pointers = new Map(); // active pointers: id -> { x, y, button }
  let pinch = null; // two-pointer gesture: last finger distance and midpoint
  let objectDrag = null;
  let groundTap = null; // an editing press on empty ground: a tap (no camera drag) places the selected equipment tool
  const raycaster = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function pointerRay(event) {
    const rect = canvas.getBoundingClientRect();
    camera.updateMatrixWorld();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), camera);
  }
  function groundPoint() { return raycaster.ray.intersectPlane(ground, new THREE.Vector3()); }
  function finishObjectDrag() {
    if (!objectDrag) return;
    const moved = objectDrag.moved; objectDrag = null; onObjectCommit(moved);
  }

  const pinchState = () => {
    const [a, b] = [...pointers.values()];
    return { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const panByPixels = (dx, dy) => {
    if (follow !== 'off') { follow = 'off'; onFollowChange('off'); }
    const ground = groundPerPixel(orbit, height || 1);
    orbit = panOrbit(orbit, -dx * ground, dy * ground);
  };

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, button: event.button });
    pinch = pointers.size === 2 ? pinchState() : null;
    if (pointers.size > 1) { finishObjectDrag(); return; }
    if (isEditing() && event.button === 0 && !event.shiftKey) {
      pointerRay(event);
      const hit = raycaster.intersectObjects(board.pickableObjects(), true)[0];
      let root = hit?.object;
      while (root && !root.userData.objectId) root = root.parent;
      const start = groundPoint();
      if (root && start) {
        objectDrag = { id: root.userData.objectId, pointerId: event.pointerId, start, x: root.position.x, z: root.position.z, moved: false };
        onObjectSelect(objectDrag.id);
      } else if (start) groundTap = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, point: start };
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    if (objectDrag?.pointerId === event.pointerId && pointers.size === 1) {
      pointers.set(event.pointerId, { ...previous, x: event.clientX, y: event.clientY });
      pointerRay(event); const point = groundPoint();
      if (point) {
        const x = objectDrag.x + point.x - objectDrag.start.x;
        const z = objectDrag.z + point.z - objectDrag.start.z;
        objectDrag.moved ||= Math.hypot(point.x - objectDrag.start.x, point.z - objectDrag.start.z) > 0.03;
        if (objectDrag.moved) onObjectMove(objectDrag.id, fromWorld(x, z));
      }
      return;
    }
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    if (groundTap?.pointerId === event.pointerId && Math.hypot(event.clientX - groundTap.x, event.clientY - groundTap.y) > 6) groundTap = null;
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
    if (objectDrag?.pointerId === event.pointerId) finishObjectDrag();
    if (groundTap?.pointerId === event.pointerId && event.type === 'pointerup' && pointers.size === 1) onGroundTap(fromWorld(groundTap.point.x, groundTap.point.z));
    if (groundTap?.pointerId === event.pointerId) groundTap = null;
    pointers.delete(event.pointerId);
    pinch = pointers.size === 2 ? pinchState() : null;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    finishObjectDrag();
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
    setEditing(active) {
      if (!active) finishObjectDrag();
      canvas.style.cursor = active ? 'crosshair' : 'grab';
      canvas.setAttribute('aria-label', active ? '3D editing view. Drag players, balls or equipment on the ground. Use the 2D board or selection arrow controls for keyboard positioning.' : '3D camera view. Drag to rotate, scroll or pinch to zoom, two fingers to pan.');
    },
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
    /** Keeps the camera centered on the 'ball' or the 'selected' player (CAM-006) until 'off' or the coach pans by hand. */
    setFollow(mode) { follow = mode === 'ball' || mode === 'selected' ? mode : 'off'; },
    get orbit() { return orbit; },
    dispose() {
      finishObjectDrag();
      cancelAnimationFrame(frame);
      frame = 0;
      board.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
