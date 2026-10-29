// Orbit camera math for the 3D view (CAM-003). No Three.js and no DOM: an orbit is plain data, so presets, dragging,
// zooming, and panning are unit-testable. World axes: x runs along the pitch from our goal (x < 0) to theirs, z across
// it (our left touchline at z < 0), y is up. The camera sits at
//   target + distance * (sin(polar) * sin(azimuth), cos(polar), sin(polar) * cos(azimuth))
// and looks at the target. Polar 0 is straight down; azimuth 0 looks along -z from the +z side (the broadcast side).

export const PITCH_WORLD = Object.freeze({ length: 60, width: 40.8 }); // yards; 60:40.8 matches the board's 1000:680

export const ORBIT_LIMITS = Object.freeze({
  polar: Object.freeze({ min: 0.02, max: 1.45 }), // never below the ground
  distance: Object.freeze({ min: 12, max: 110 }),
  panMargin: 10, // how far past the touchlines and goal lines the target may move
});

export const CAMERA_FOV_DEGREES = 40;

// Distances are for a 4:3 viewport; presetOrbit() widens them for narrower ones so the pitch still fits.
export const CAMERA_PRESETS = Object.freeze({
  top: Object.freeze({ label: 'Top-down', azimuth: 0, polar: 0.02, distance: 62 }),
  broadcast: Object.freeze({ label: 'Broadcast', azimuth: 0, polar: 1.05, distance: 72 }),
  goal: Object.freeze({ label: 'Behind our goal', azimuth: -Math.PI / 2, polar: 1.2, distance: 58, goalRelative: true }),
  sideline: Object.freeze({ label: 'Sideline low', azimuth: 0, polar: 1.38, distance: 50 }),
  // Half-field framing (COACH-007): the home team attacks toward +x, so its own half is at -x.
  ourHalf: Object.freeze({ label: 'Our half', azimuth: 0, polar: 0.9, distance: 44, targetX: -PITCH_WORLD.length / 4 }),
  theirHalf: Object.freeze({ label: 'Their half', azimuth: 0, polar: 0.9, distance: 44, targetX: PITCH_WORLD.length / 4 }),
});

export const DEFAULT_PRESET = 'broadcast';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** An orbit for a named preset, centered on the pitch, with the distance widened for viewports narrower than 4:3. */
export function presetOrbit(name, aspect = 4 / 3, flipped = false) {
  const preset = CAMERA_PRESETS[name] ?? CAMERA_PRESETS[DEFAULT_PRESET];
  const widen = Math.max(1, (4 / 3) / (Number.isFinite(aspect) && aspect > 0 ? aspect : 4 / 3));
  return clampOrbit({
    // On a flipped board our goal and our half are on the other side, so goal-relative presets turn with them.
    target: { x: (preset.targetX ?? 0) * (flipped ? -1 : 1), z: preset.targetZ ?? 0 },
    azimuth: preset.goalRelative && flipped ? preset.azimuth + Math.PI : preset.azimuth,
    polar: preset.polar,
    distance: preset.distance * widen,
  });
}

/** Eases the orbit's target a fraction of the way toward a ground point; called every frame by the follow camera. */
export function followOrbit(orbit, point, smoothing = 0.12) {
  return clampOrbit({
    ...orbit,
    target: { x: orbit.target.x + (point.x - orbit.target.x) * smoothing, z: orbit.target.z + (point.z - orbit.target.z) * smoothing },
  });
}

/** Keeps polar and distance in range and the target near the pitch. */
export function clampOrbit(orbit) {
  const limit = ORBIT_LIMITS.panMargin;
  return {
    target: {
      x: clamp(orbit.target.x, -PITCH_WORLD.length / 2 - limit, PITCH_WORLD.length / 2 + limit),
      z: clamp(orbit.target.z, -PITCH_WORLD.width / 2 - limit, PITCH_WORLD.width / 2 + limit),
    },
    azimuth: orbit.azimuth,
    polar: clamp(orbit.polar, ORBIT_LIMITS.polar.min, ORBIT_LIMITS.polar.max),
    distance: clamp(orbit.distance, ORBIT_LIMITS.distance.min, ORBIT_LIMITS.distance.max),
  };
}

/** Camera position in world space. */
export function orbitPosition(orbit) {
  const { azimuth, polar, distance, target } = orbit;
  return {
    x: target.x + distance * Math.sin(polar) * Math.sin(azimuth),
    y: distance * Math.cos(polar),
    z: target.z + distance * Math.sin(polar) * Math.cos(azimuth),
  };
}

/** Drag to rotate: dragging right swings the camera around to the left, dragging down tilts toward top-down. */
export function rotateOrbit(orbit, deltaAzimuth, deltaPolar) {
  return clampOrbit({ ...orbit, azimuth: orbit.azimuth - deltaAzimuth, polar: orbit.polar - deltaPolar });
}

/** Zoom by a factor (greater than 1 moves the camera closer). */
export function zoomOrbit(orbit, factor) {
  return clampOrbit({ ...orbit, distance: orbit.distance / factor });
}

/** Pan the target along the ground by `right` yards to the camera's right and `forward` yards away from the camera. */
export function panOrbit(orbit, right, forward) {
  const sin = Math.sin(orbit.azimuth);
  const cos = Math.cos(orbit.azimuth);
  return clampOrbit({
    ...orbit,
    target: { x: orbit.target.x + right * cos - forward * sin, z: orbit.target.z - right * sin - forward * cos },
  });
}

/** Yards of ground covered by one screen pixel at the target, for a vertical field of view and viewport height. */
export function groundPerPixel(orbit, viewportHeight, fovDegrees = CAMERA_FOV_DEGREES) {
  return (2 * orbit.distance * Math.tan((fovDegrees * Math.PI) / 360)) / Math.max(1, viewportHeight);
}
