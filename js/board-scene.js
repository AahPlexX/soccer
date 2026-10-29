import { availablePassOptions } from './pass-options.js';
// The 3D board scene (CAM-002): builds a Three.js scene for the pitch and keeps it in step with the board state. Three.js
// is injected (this file never imports it) so the heavy library loads lazily and tests can build the scene in Node;
// textures come from an injected factory because canvases only exist in a browser. World axes are in camera-orbit.js:
// the board's x runs along world x and its y across world z, so the 3D view has the same orientation as the 2D board.
import { PITCH, ZONES } from './constants.js';
import { PITCH_WORLD } from './camera-orbit.js';
import { playerColor } from './formations.js';

const { length: L, width: W } = PITCH_WORLD;
const SKIN = '#f1c27d';
const GRASS_TEXTURE = Object.freeze({ width: 1500, height: 1020 }); // same 60:40.8 shape as the pitch

/** Board coordinates (0 to 1) to world x and z. */
export const toWorld = (x, y) => ({ x: (x - 0.5) * L, z: (y - 0.5) * W });

/** Inverse world-to-board conversion, clamped to the pitch. */
export const fromWorld = (x, z) => ({ x: Math.min(1, Math.max(0, x / L + 0.5)), y: Math.min(1, Math.max(0, z / W + 0.5)) });

// The View menu (Turf, Dark, Field mode) also restyles the 3D scene; styles.css uses the same pitch stripes in 2D.
export const THEME_COLORS = Object.freeze({
  turf: Object.freeze({ sky: '#8fc9f2', surround: '#1f6b45', stripes: ['#0d8251', '#0b7448'] }),
  dark: Object.freeze({ sky: '#08110d', surround: '#0a1a12', stripes: ['#0e4f34', '#0b432d'] }),
  field: Object.freeze({ sky: '#ecf7e8', surround: '#b9dfae', stripes: ['#2e9e5f', '#27915a'] }),
});

// Pitch markings on a canvas whose pixel (px, py) is board point (px / width, py / height).
export function drawPitchTexture(ctx, width, height, stripes = THEME_COLORS.turf.stripes) {
  const sx = (x) => x * width;
  const sy = (y) => y * height;
  for (let i = 0; i < 10; i += 1) {
    ctx.fillStyle = stripes[i % 2];
    ctx.fillRect(sx(i / 10), 0, sx(0.1) + 1, height);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 7;
  ctx.strokeRect(6, 6, width - 12, height - 12);
  ctx.beginPath();
  ctx.moveTo(sx(PITCH.halfwayX), 0);
  ctx.lineTo(sx(PITCH.halfwayX), height);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sx(0.5), sy(0.5), sx(PITCH.centerCircleRadius), 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sx(0.5), sy(0.5), 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeRect(0, sy(PITCH.penaltyMinY), sx(PITCH.homePenaltyMaxX), sy(PITCH.penaltyMaxY - PITCH.penaltyMinY));
  ctx.strokeRect(sx(PITCH.awayPenaltyMinX), sy(PITCH.penaltyMinY), sx(1 - PITCH.awayPenaltyMinX), sy(PITCH.penaltyMaxY - PITCH.penaltyMinY));
  for (const x of [10 / 60, 1 - 10 / 60]) {
    ctx.beginPath();
    ctx.arc(sx(x), sy(0.5), 8, 0, Math.PI * 2);
    ctx.fill();
  }
  // The U9 build-out lines, dashed like the 2D board.
  ctx.strokeStyle = '#ffd43b';
  ctx.setLineDash([26, 20]);
  for (const x of [PITCH.homeBuildOutX, PITCH.awayBuildOutX]) {
    ctx.beginPath();
    ctx.moveTo(sx(x), 0);
    ctx.lineTo(sx(x), height);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// A jersey number on a transparent canvas, shown above each player so numbers stay readable from any angle.
export function drawNumberLabel(ctx, width, height, number) {
  ctx.clearRect(0, 0, width, height);
  ctx.font = `bold ${Math.round(height * 0.7)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.round(height * 0.12);
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(String(number), width / 2, height / 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(number), width / 2, height / 2);
}

export function buildBoardScene(THREE, { makeTexture = () => null } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8fc9f2');
  scene.add(new THREE.HemisphereLight('#ffffff', '#4a7a4a', 1.5));
  const sun = new THREE.DirectionalLight('#ffffff', 1.4);
  sun.position.set(-20, 60, 30);
  scene.add(sun);

  const surround = new THREE.Mesh(new THREE.PlaneGeometry(L * 3, W * 4), new THREE.MeshBasicMaterial({ color: '#1f6b45' }));
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.05;
  scene.add(surround);

  // A material's color multiplies its texture, so the textured pitch needs a white base; flat green is the fallback.
  const pitchTexture = makeTexture((ctx, w, h) => drawPitchTexture(ctx, w, h), GRASS_TEXTURE.width, GRASS_TEXTURE.height);
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(L, W),
    new THREE.MeshBasicMaterial({ color: pitchTexture ? '#ffffff' : '#0d8251', map: pitchTexture }),
  );
  pitch.rotation.x = -Math.PI / 2;
  scene.add(pitch);

  let theme = 'turf';
  function applyTheme(name) {
    theme = THEME_COLORS[name] ? name : 'turf';
    const colors = THEME_COLORS[theme];
    scene.background.set(colors.sky);
    surround.material.color.set(colors.surround);
    if (pitchTexture) {
      drawPitchTexture(pitchTexture.image.getContext('2d'), GRASS_TEXTURE.width, GRASS_TEXTURE.height, colors.stripes);
      pitchTexture.needsUpdate = true;
    } else pitch.material.color.set(colors.stripes[0]);
  }

  const white = new THREE.MeshStandardMaterial({ color: '#ffffff' });
  const box = (w, h, d, x, y, z, material = white) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    return mesh;
  };
  // Goals face along x; the mouth width is the drawn goal width on a 40.8 yard wide pitch.
  const goalHalf = (PITCH.goalWidth * W) / 2;
  for (const side of [-1, 1]) {
    const goal = new THREE.Group();
    goal.add(box(0.3, 2.2, 0.3, 0, 1.1, -goalHalf), box(0.3, 2.2, 0.3, 0, 1.1, goalHalf), box(0.3, 0.3, goalHalf * 2 + 0.3, 0, 2.2, 0));
    goal.position.x = (side * L) / 2;
    scene.add(goal);
  }

  const zones = new Map();
  for (const [id, zone] of Object.entries(ZONES)) {
    const a = toWorld(zone.x1, zone.y1);
    const b = toWorld(zone.x2, zone.y2);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(b.x - a.x, b.z - a.z),
      new THREE.MeshBasicMaterial({ color: '#ffd43b', transparent: true, opacity: 0.2, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((a.x + b.x) / 2, 0.04, (a.z + b.z) / 2);
    mesh.visible = false;
    scene.add(mesh);
    zones.set(id, mesh);
  }

  const labelTextures = new Map();
  const labelTexture = (number) => {
    if (!labelTextures.has(number)) labelTextures.set(number, makeTexture((ctx, w, h) => drawNumberLabel(ctx, w, h, number), 128, 128));
    return labelTextures.get(number);
  };

  const players = new Map();
  const balls = new Map();
  const cones = new Map();
  const miniGoals = new Map();
  const drawings = new Map();
  const passLines = new THREE.Group();
  scene.add(passLines);
  const passSlots = Array.from({ length: 6 }, () => {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: '#ffd43b', dashSize: 0.65, gapSize: 0.4, depthTest: false, transparent: true }));
    line.renderOrder = 10; line.visible = false; passLines.add(line); return line;
  });

  function pathGroup(points, dashed, arrow) {
    const group = new THREE.Group();
    if (points.length < 2) return group;
    const vectors = points.map((point) => { const p = toWorld(point.x, point.y); return new THREE.Vector3(p.x, 0.12, p.z); });
    const material = dashed ? new THREE.LineDashedMaterial({ color: '#ffd43b', dashSize: 0.65, gapSize: 0.4, depthTest: false, transparent: true })
      : new THREE.LineBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(vectors), material);
    line.computeLineDistances(); line.renderOrder = 10; group.add(line);
    if (arrow) {
      const end = vectors.at(-1); const direction = end.clone().sub(vectors.at(-2));
      if (direction.lengthSq() > 1e-8) {
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 12), new THREE.MeshBasicMaterial({ color: dashed ? '#ffd43b' : '#ffffff', depthTest: false, transparent: true }));
        head.position.copy(end); head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); head.renderOrder = 11; group.add(head);
      }
    }
    return group;
  }


  function createPlayer() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.2, 24), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
    body.position.y = 1.1;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshStandardMaterial({ color: SKIN }));
    head.position.y = 2.75;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.55, 32), new THREE.MeshBasicMaterial({ color: '#ffd43b', side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    ring.visible = false;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
    label.scale.set(2.2, 2.2, 1);
    label.position.y = 4.1;
    group.add(body, head, ring, label);
    return { group, body, ring, label, color: '', number: null };
  }

  function updatePlayer(entry, player, state) {
    const { x, z } = toWorld(player.x, player.y);
    entry.group.position.set(x, 0, z);
    entry.group.visible = !(player.team === 'away' && !state.awayVisible) && !player.benched;
    const color = playerColor(player, state);
    if (color !== entry.color) {
      entry.color = color;
      entry.body.material.color.set(color);
    }
    if (player.number !== entry.number) {
      entry.number = player.number;
      entry.label.material.map = labelTexture(player.number);
      entry.label.material.needsUpdate = true;
    }
    entry.ring.visible = state.selectedObjectId === player.id;
  }

  function createBall() {
    // Render the teaching ball last, including over players and zone overlays.
    // It must remain trackable from low camera angles and while passing a body.
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), new THREE.MeshStandardMaterial({
      color: '#ffffff', transparent: true, depthTest: false, depthWrite: false,
    }));
    mesh.renderOrder = 100;
    return { group: mesh };
  }

  function createCone() {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.4, 16), new THREE.MeshStandardMaterial({ color: '#ff8c1a' }));
    return { group: mesh, color: '' };
  }

  function createMiniGoal() {
    const group = new THREE.Group();
    group.add(box(0.12, 1.8, 0.12, 0, 0.9, -1.9), box(0.12, 1.8, 0.12, 0, 0.9, 1.9), box(0.12, 0.12, 3.9, 0, 1.8, 0));
    return { group };
  }

  // Adds an object for each new id, updates every object, and removes the ones no longer in the state.
  function reconcile(map, items, create, update) {
    const live = new Set(items.map((item) => item.id));
    for (const [id, entry] of map) {
      if (live.has(id)) continue;
      scene.remove(entry.group);
      disposeObject(entry.group);
      map.delete(id);
    }
    for (const item of items) {
      if (!map.has(item.id)) {
        const entry = create();
        map.set(item.id, entry);
        entry.group.userData.objectId = item.id;
        scene.add(entry.group);
      }
      update(map.get(item.id), item);
    }
  }

  function sync(state, { showPassOptions = false } = {}) {
    if ((state.theme ?? 'turf') !== theme) applyTheme(state.theme);
    reconcile(drawings, state.drawings, () => ({ group: new THREE.Group(), signature: '' }), (entry, drawing) => {
      const signature = JSON.stringify(drawing);
      if (entry.signature === signature) return;
      entry.signature = signature;
      [...entry.group.children].forEach((child) => { disposeObject(child); entry.group.remove(child); });
      entry.group.add(pathGroup(['freehand', 'curve'].includes(drawing.type) ? drawing.points : drawing.points.slice(0, 2), drawing.type === 'run', drawing.type !== 'freehand'));
    });
    const carrier = state.players.find((player) => player.id === state.simulation.carrierId && !player.benched);
    const receivers = showPassOptions ? availablePassOptions(state) : [];
    passSlots.forEach((line, index) => {
      const receiver = receivers[index]; line.visible = Boolean(carrier && receiver);
      if (!line.visible) return;
      const from = toWorld(carrier.x, carrier.y); const to = toWorld(receiver.x, receiver.y);
      const positions = line.geometry.attributes.position;
      positions.setXYZ(0, from.x, 0.12, from.z); positions.setXYZ(1, to.x, 0.12, to.z); positions.needsUpdate = true;
      line.geometry.computeBoundingSphere(); line.computeLineDistances();
    });
    for (const [id, mesh] of zones) {
      mesh.visible = state.selectedZones.includes(id);
      mesh.material.opacity = state.zoneOpacity;
    }
    reconcile(players, state.players, createPlayer, (entry, player) => updatePlayer(entry, player, state));
    reconcile(balls, state.balls, createBall, (entry, ball) => {
      const position = toWorld(ball.x, ball.y);
      const carrier = ball.id === state.balls[0]?.id
        ? state.players.find((player) => player.id === state.simulation.carrierId && !player.benched
          && (player.team === 'home' || state.awayVisible)) : null;
      if (carrier) {
        // Presentation only: keep possession physics at the player's coordinate,
        // but show the ball outside the radius-1 body rather than embedded in it.
        const direction = carrier.team === 'home' ? 1 : -1;
        const offset = 1.65;
        const ahead = position.x + direction * offset;
        position.x = Math.abs(ahead) <= L / 2 - 0.45 ? ahead : position.x - direction * offset;
      }
      entry.group.position.set(position.x, 0.45, position.z);
    });
    reconcile(cones, state.cones, createCone, (entry, cone) => {
      const { x, z } = toWorld(cone.x, cone.y);
      entry.group.position.set(x, 0.7, z);
      if (cone.color !== entry.color) {
        entry.color = cone.color;
        entry.group.material.color.set(cone.color);
      }
    });
    reconcile(miniGoals, state.miniGoals, createMiniGoal, (entry, goal) => {
      const { x, z } = toWorld(goal.x, goal.y);
      entry.group.position.set(x, 0, z);
    });
  }

  function disposeObject(root) {
    root.traverse((node) => {
      node.geometry?.dispose();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => material?.dispose());
    });
  }

  function dispose() {
    disposeObject(scene);
    labelTextures.forEach((texture) => texture?.dispose());
    labelTextures.clear();
    [players, balls, cones, miniGoals, drawings].forEach((map) => map.clear());
  }

  return {
    scene,
    sync,
    dispose,
    pickableObjects: () => [...players.values(), ...balls.values(), ...cones.values(), ...miniGoals.values()].map((entry) => entry.group).filter((group) => group.visible),
    passOptions: () => passSlots.filter((line) => line.visible).length,
    counts: () => ({ players: players.size, balls: balls.size, cones: cones.size, miniGoals: miniGoals.size, zones: zones.size }),
    objectFor: (id) => (players.get(id) ?? balls.get(id) ?? cones.get(id) ?? miniGoals.get(id) ?? drawings.get(id))?.group ?? null,
  };
}
