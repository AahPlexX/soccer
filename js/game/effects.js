// Visual effects for Game Mode as plain data: dust, grass flecks, ball trails, goal confetti and a net ripple. Pure and
// deterministic (a tiny seeded generator, no Math.random); the renderer only draws what is here. Effects are spawned from match
// events and from continuous motion (slides, sprints, a fast ball).

export const EFFECT_LIMIT = 400; // the hard cap, so a long goal celebration can never pile up

const GRAVITY = 9.81;

function random(effects) {
  effects.seed = (effects.seed + 0x6d2b79f5) >>> 0;
  let t = effects.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function createEffects(seed = 1) {
  return { seed: (seed >>> 0) || 1, particles: [], ripple: null, flash: 0, time: 0, accumulators: {} };
}

function spawn(effects, particle) {
  if (effects.particles.length >= EFFECT_LIMIT) effects.particles.shift();
  effects.particles.push({ t: 0, vx: 0, vy: 0, vz: 0, size: 1, color: '#ffffff', gravity: true, ...particle });
}

/** Little bursts of kicked-up turf and dust at a point. */
export function burst(effects, x, y, { count = 6, color = '#d8e8b0', speed = 2.5, life = 0.5, up = 1.5 } = {}) {
  for (let i = 0; i < count; i += 1) {
    const angle = random(effects) * Math.PI * 2;
    const push = (0.4 + random(effects)) * speed;
    spawn(effects, { type: 'dust', x, y, z: 0.05, vx: Math.cos(angle) * push, vy: Math.sin(angle) * push * 0.6, vz: (0.5 + random(effects)) * up, life: life * (0.6 + random(effects) * 0.6), size: 1 + random(effects), color });
  }
}

/** Confetti over the pitch for a goal. */
export function confetti(effects, x, y, count = 60) {
  const colors = ['#ffd43b', '#ffffff', '#ef3340', '#1769ff', '#7cff00'];
  for (let i = 0; i < count; i += 1) {
    const angle = random(effects) * Math.PI * 2;
    const push = 1 + random(effects) * 5;
    spawn(effects, { type: 'confetti', x, y, z: 1.5 + random(effects) * 2, vx: Math.cos(angle) * push, vy: Math.sin(angle) * push * 0.5, vz: random(effects) * 4, life: 1.6 + random(effects) * 1.2, size: 1 + random(effects) * 1.5, color: colors[i % colors.length] });
  }
}

/** Turns a match event into effects. `match` supplies positions. */
export function addFromEvent(effects, event, match) {
  const player = event.id ? match.players.find((p) => p.id === event.id) : null;
  switch (event.type) {
    case 'shot':
    case 'pass':
      if (player || event.from) burst(effects, match.ball.x, match.ball.y, { count: event.type === 'shot' ? 8 : 4, speed: event.type === 'shot' ? 3.5 : 2 });
      break;
    case 'tackle':
    case 'foul':
      if (player) burst(effects, player.x, player.y, { count: 10, speed: 3, life: 0.6 });
      break;
    case 'goal':
      effects.flash = 1;
      effects.ripple = { x: match.ball.x, y: match.ball.y, t: 0 };
      confetti(effects, match.ball.x, match.ball.y);
      break;
    case 'save':
      burst(effects, match.ball.x, match.ball.y, { count: 5, color: '#ffffff', speed: 2 });
      break;
    default:
      break;
  }
}

/** Continuous effects while players move: slides and sprints raise dust, a fast ball leaves a short trail. */
export function addFromMotion(effects, match, dt) {
  const acc = effects.accumulators;
  for (const p of match.players) {
    const sliding = p.action?.type === 'slide';
    const speed = Math.hypot(p.vx, p.vy);
    if (sliding || speed > 6.2) {
      acc[p.id] = (acc[p.id] ?? 0) + dt * (sliding ? 40 : 12);
      while (acc[p.id] >= 1) { acc[p.id] -= 1; burst(effects, p.x - p.vx * 0.04, p.y - p.vy * 0.04, { count: 1, speed: 1, life: 0.35, up: 0.8 }); }
    }
  }
  const speed = Math.hypot(match.ball.vx, match.ball.vy, match.ball.vz);
  if (speed > 16) {
    acc.ball = (acc.ball ?? 0) + dt * 60;
    while (acc.ball >= 1) { acc.ball -= 1; spawn(effects, { type: 'trail', x: match.ball.x, y: match.ball.y, z: match.ball.z, life: 0.18, size: 2, color: '#ffffff', gravity: false }); }
  }
}

/** Advances every effect by `dt`: particles fly and fall, the flash fades, the net ripple ages. */
export function stepEffects(effects, dt) {
  effects.time += dt;
  for (const p of effects.particles) {
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.gravity) p.vz -= GRAVITY * dt;
    if (p.z < 0) { p.z = 0; p.vz = 0; p.vx *= 0.5; p.vy *= 0.5; }
  }
  effects.particles = effects.particles.filter((p) => p.t < p.life);
  effects.flash = Math.max(0, effects.flash - dt * 2);
  if (effects.ripple) { effects.ripple.t += dt; if (effects.ripple.t > 1) effects.ripple = null; }
  return effects;
}
