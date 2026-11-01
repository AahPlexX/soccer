import { GOAL_HEIGHT } from '../ball-physics.js';
import { CAMERA, edgeIndicator, project, snapToPixels, wholePixels, worldHeadingToScreen } from './camera.js';
import { HALF_LENGTH, HALF_MOUTH, HALF_WIDTH, PENALTY_DEPTH, PENALTY_HALF_WIDTH } from './rules.js';
import { BALL_SPRITE, drawBallFrame, spriteSize, drawPlayerFrame, facingFor, pickAnimation, playerPalette, variantFor } from './sprites.js';

// Draws a Game Mode frame on a 2D canvas: the striped pitch with its markings and goals, soft shadows, depth-sorted pixel-art
// players, the ball lifted by its height, the active-player marker and effects. It only reads the view model it is handed and
// writes to its canvas; all game logic lives in the pure modules.

const COLORS = {
  apron: '#1b5e31',
  grassA: '#2f8a45',
  grassB: '#2a7d3f',
  line: 'rgba(255,255,255,0.92)',
  net: 'rgba(255,255,255,0.28)',
  netLine: 'rgba(255,255,255,0.5)',
  post: '#ffffff',
  active: '#ffd43b',
};
const STRIPE = 5; // meters per mown stripe
const GOAL_DEPTH = 2.2;
const SPRITE_PPM = Object.freeze({ min: 14, max: 56, hysteresis: 0.08 }); // sprites are drawn at the screen scale; see spritePpm()
const SPRITE_CACHE_LIMIT = 3000;
const PLAYER_SCALE = 1.3; // players are drawn this much larger than life so faces, limbs and kit stay readable on a phone (as in most soccer games)

export function createRenderer(canvas, { colors = null } = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const cache = new Map();
  let currentPpm = 0;
  let ballPhase = 0;
  let lastTime = 0;
  const pixelRatio = () => Math.min(2, globalThis.devicePixelRatio || 1);

  function bitmap(key, buffer) {
    let image = cache.get(key);
    if (!image) {
      image = document.createElement('canvas');
      image.width = buffer.width;
      image.height = buffer.height;
      image.getContext('2d').putImageData(new ImageData(buffer.data, buffer.width, buffer.height), 0, 0);
      cache.set(key, image);
    }
    return image;
  }

  /**
   * The resolution to draw sprites at: the camera's pixels per meter (in device pixels), so the picture is shown about 1:1 and keeps its
   * detail. It only changes when the zoom moves more than the hysteresis, so zooming does not re-render every player each step.
   */
  function spritePpm(wanted) {
    const target = Math.max(SPRITE_PPM.min, Math.min(SPRITE_PPM.max, wanted));
    if (!currentPpm || Math.abs(target - currentPpm) / currentPpm > SPRITE_PPM.hysteresis) {
      currentPpm = Math.round(target);
      if (cache.size > SPRITE_CACHE_LIMIT) cache.clear();
    }
    return currentPpm;
  }

  function playerImage(player, animation, facing, ppm) {
    const keeper = player.role === 'GK';
    const variant = variantFor(player.id);
    const key = `${player.team}|${variant}|${keeper ? 'k' : 'p'}|${animation.action}|${animation.frame}|${facing}|${ppm}`;
    return cache.get(key) ?? bitmap(key, drawPlayerFrame({ palette: playerPalette(player.team, variant, keeper, colors), action: animation.action, frame: animation.frame, facing, keeper, ppm }));
  }

  function ballImage(frame) {
    const key = `ball|${frame}`;
    return cache.get(key) ?? bitmap(key, drawBallFrame(frame));
  }

  /** Sizes the canvas backing store for the device pixel ratio and returns the CSS-pixel view. */
  function resize(cssWidth, cssHeight) {
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(cssWidth * ratio));
    canvas.height = Math.max(1, Math.round(cssHeight * ratio));
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { width: cssWidth, height: cssHeight };
  }

  function drawPitch(camera, view) {
    const at = (x, y, z = 0) => project(camera, view, x, y, z);
    ctx.fillStyle = COLORS.apron;
    ctx.fillRect(0, 0, view.width, view.height);
    // Mown stripes across the length of the pitch.
    for (let i = 0; i * STRIPE < HALF_LENGTH * 2; i += 1) {
      const a = at(-HALF_LENGTH + i * STRIPE, -HALF_WIDTH);
      const b = at(Math.min(HALF_LENGTH, -HALF_LENGTH + (i + 1) * STRIPE), HALF_WIDTH);
      ctx.fillStyle = i % 2 === 0 ? COLORS.grassA : COLORS.grassB;
      ctx.fillRect(a.x, a.y, b.x - a.x + 0.5, b.y - a.y);
    }
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = Math.max(2, camera.scale * 0.12);
    ctx.lineJoin = 'round';
    const rectLine = (x0, y0, x1, y1) => {
      const a = at(x0, y0);
      const b = at(x1, y1);
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    };
    rectLine(-HALF_LENGTH, -HALF_WIDTH, HALF_LENGTH, HALF_WIDTH);
    const mid = at(0, -HALF_WIDTH);
    const midEnd = at(0, HALF_WIDTH);
    ctx.beginPath(); ctx.moveTo(mid.x, mid.y); ctx.lineTo(midEnd.x, midEnd.y); ctx.stroke();
    const center = at(0, 0);
    ctx.beginPath(); ctx.ellipse(center.x, center.y, 5 * camera.scale, 5 * camera.scale * CAMERA.tilt, 0, 0, Math.PI * 2); ctx.stroke();
    for (const side of [-1, 1]) {
      const goalX = side * HALF_LENGTH;
      const inner = goalX - side * PENALTY_DEPTH;
      rectLine(Math.min(goalX, inner), -PENALTY_HALF_WIDTH, Math.max(goalX, inner), PENALTY_HALF_WIDTH);
      const small = goalX - side * 3.5;
      rectLine(Math.min(goalX, small), -5, Math.max(goalX, small), 5);
      const spot = at(goalX - side * 7, 0);
      ctx.fillStyle = COLORS.line;
      ctx.beginPath(); ctx.arc(spot.x, spot.y, Math.max(2, camera.scale * 0.14), 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = COLORS.line;
    ctx.beginPath(); ctx.arc(center.x, center.y, Math.max(2, camera.scale * 0.16), 0, Math.PI * 2); ctx.fill();
  }

  function goalBack(camera, view, side, ripple) {
    const at = (x, y, z = 0) => project(camera, view, x, y, z);
    const x0 = side * HALF_LENGTH;
    const x1 = side * (HALF_LENGTH + GOAL_DEPTH);
    const wobble = ripple ? Math.sin(ripple.t * 18) * (1 - ripple.t) * 0.35 : 0;
    const quad = (points, fill) => {
      ctx.beginPath();
      points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    // Floor, back and the two sides of the net.
    quad([at(x0, -HALF_MOUTH), at(x1, -HALF_MOUTH), at(x1 + side * wobble, HALF_MOUTH), at(x0, HALF_MOUTH)], 'rgba(0,0,0,0.18)');
    quad([at(x1, -HALF_MOUTH, 0), at(x1, HALF_MOUTH, 0), at(x1 + side * wobble, HALF_MOUTH, GOAL_HEIGHT * 0.8), at(x1, -HALF_MOUTH, GOAL_HEIGHT * 0.8)], COLORS.net);
    quad([at(x0, -HALF_MOUTH, GOAL_HEIGHT), at(x1, -HALF_MOUTH, GOAL_HEIGHT * 0.8), at(x1, -HALF_MOUTH, 0), at(x0, -HALF_MOUTH, 0)], COLORS.net);
    quad([at(x0, HALF_MOUTH, GOAL_HEIGHT), at(x1, HALF_MOUTH, GOAL_HEIGHT * 0.8), at(x1, HALF_MOUTH, 0), at(x0, HALF_MOUTH, 0)], COLORS.net);
    ctx.strokeStyle = COLORS.netLine;
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i += 1) {
      const y = -HALF_MOUTH + (i / 6) * HALF_MOUTH * 2;
      const a = at(x1, y, 0);
      const b = at(x1, y, GOAL_HEIGHT * 0.8);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }

  function goalFrame(camera, view, side, nearOnly) {
    const at = (x, y, z = 0) => project(camera, view, x, y, z);
    const x = side * HALF_LENGTH;
    ctx.strokeStyle = COLORS.post;
    ctx.lineWidth = Math.max(2, camera.scale * 0.16);
    ctx.lineCap = 'round';
    const post = (y) => { const a = at(x, y, 0); const b = at(x, y, GOAL_HEIGHT); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
    if (nearOnly) {
      post(HALF_MOUTH);
    } else {
      post(-HALF_MOUTH);
      const a = at(x, -HALF_MOUTH, GOAL_HEIGHT);
      const b = at(x, HALF_MOUTH, GOAL_HEIGHT);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  function shadow(camera, view, x, y, radius, alpha) {
    const p = project(camera, view, x, y, 0);
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, radius * camera.scale, radius * camera.scale * CAMERA.tilt, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayer(camera, view, player, model, isActive) {
    const animation = pickAnimation(player, { time: model.time, celebrating: model.celebrating === player.team, throwIn: model.match.phase === 'restart' && model.match.restart?.type === 'throw-in' && model.match.restart.takerId === player.id });
    const { facing } = facingFor(worldHeadingToScreen(player.heading)); // the pitch is drawn squashed, so a sprite faces its on-screen direction
    const ratio = pixelRatio();
    const wanted = camera.scale * ratio * PLAYER_SCALE; // device pixels per (enlarged) meter on screen
    const ppm = spritePpm(wanted);
    const image = playerImage(player, animation, facing, ppm);
    const size = spriteSize(ppm);
    const fit = wanted / ppm; // within the hysteresis of 1: the sprite is drawn at its exact on-screen size
    const projected = project(camera, view, player.x, player.y, 0);
    // Whole device pixels for the feet, so the figure does not shimmer while the camera moves.
    const feet = { x: Math.round(projected.x * ratio) / ratio, y: Math.round(projected.y * ratio) / ratio };
    const top = feet.y - (size.footY * fit) / ratio;
    ctx.imageSmoothingEnabled = Math.abs(fit - 1) > 0.002;
    ctx.drawImage(image, feet.x - (size.anchorX * fit) / ratio, top, (size.width * fit) / ratio, (size.height * fit) / ratio);
    ctx.imageSmoothingEnabled = false;
    if (isActive) {
      const bob = Math.sin(model.time * 6) * camera.scale * 0.12;
      ctx.fillStyle = COLORS.active;
      ctx.strokeStyle = '#0d0d0d';
      ctx.lineWidth = 2;
      const tipY = top - camera.scale * 0.3 + bob;
      ctx.beginPath();
      ctx.moveTo(feet.x, tipY);
      ctx.lineTo(feet.x - camera.scale * 0.45, tipY - camera.scale * 0.7);
      ctx.lineTo(feet.x + camera.scale * 0.45, tipY - camera.scale * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  /** Draws one frame. `model` = { match (or replay snapshot), camera, view, effects, time, celebrating, aim }. */
  function draw(model) {
    const { match, view, effects } = model;
    const camera = snapToPixels(model.camera, pixelRatio());
    const dt = Math.min(0.1, Math.max(0, model.time - lastTime));
    lastTime = model.time;
    ballPhase += Math.hypot(match.ball.vx, match.ball.vy) * dt * 0.8;

    drawPitch(camera, view);
    goalBack(camera, view, -1, effects?.ripple && effects.ripple.x < 0 ? effects.ripple : null);
    goalBack(camera, view, 1, effects?.ripple && effects.ripple.x >= 0 ? effects.ripple : null);
    goalFrame(camera, view, -1, false);
    goalFrame(camera, view, 1, false);

    // Shadows first, so no shadow is ever drawn over a sprite.
    for (const player of match.players) shadow(camera, view, player.x, player.y, 0.5, 0.28);
    const ball = match.ball;
    const height = Math.max(0, ball.z - 0.105);
    shadow(camera, view, ball.x, ball.y, 0.2 * (1 + height * 0.12), 0.38 / (1 + height * 0.35));

    // The active player's ring on the grass, and the aim line while they have the ball.
    const active = match.players.find((p) => p.id === match.activeId);
    if (active) {
      const p = project(camera, view, active.x, active.y, 0);
      ctx.strokeStyle = COLORS.active;
      ctx.lineWidth = Math.max(2, camera.scale * 0.1);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, camera.scale * 0.8, camera.scale * 0.8 * CAMERA.tilt, 0, 0, Math.PI * 2); ctx.stroke();
      if (model.aim && match.owner === active.id) {
        const tip = project(camera, view, active.x + Math.cos(active.heading) * 2.6, active.y + Math.sin(active.heading) * 2.6, 0);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.setLineDash([camera.scale * 0.25, camera.scale * 0.2]);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // The receiver of the pass just made, or (while you hold the ball) of the pass you would make now, joined to you by a dashed line.
    const previewing = !match.passTarget && model.passPreview;
    const targetId = match.passTarget ?? (previewing ? model.passPreview : null);
    const target = targetId ? match.players.find((p) => p.id === targetId) : null;
    if (target) {
      const p = project(camera, view, target.x, target.y, 0);
      const carrier = previewing ? match.players.find((q) => q.id === match.activeId) : null;
      if (carrier) {
        const from = project(camera, view, carrier.x, carrier.y, 0);
        ctx.strokeStyle = 'rgba(255,212,59,0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([camera.scale * 0.3, camera.scale * 0.25]);
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = previewing ? 'rgba(255,212,59,0.95)' : 'rgba(255,255,255,0.8)';
      ctx.lineWidth = previewing ? 3 : 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, camera.scale * 0.6, camera.scale * 0.6 * CAMERA.tilt, 0, 0, Math.PI * 2); ctx.stroke();
    }

    // Players and the ball, far to near.
    // The ball of a player who has it is drawn in front of him, so running away from the camera never hides the ball behind his legs.
    const holder = match.owner ? match.players.find((p) => p.id === match.owner) : null;
    const order = [...match.players.map((p) => ({ kind: 'player', y: p.y, p })), { kind: 'ball', y: holder ? Math.max(ball.y, holder.y + 0.02) : ball.y }].sort((a, b) => a.y - b.y);
    for (const item of order) {
      if (item.kind === 'player') {
        drawPlayer(camera, view, item.p, model, item.p.id === match.activeId);
      } else {
        const at = project(camera, view, ball.x, ball.y, height);
        const size = wholePixels(Math.max(7, Math.min(28, camera.scale * 0.42)), pixelRatio());
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(ballImage(Math.floor(ballPhase * 3) % BALL_SPRITE.frames), at.x - size / 2, at.y - size / 2, size, size);
      }
    }
    goalFrame(camera, view, -1, true);
    goalFrame(camera, view, 1, true);

    // Effects on top.
    if (effects) {
      for (const particle of effects.particles) {
        const at = project(camera, view, particle.x, particle.y, particle.z);
        ctx.globalAlpha = Math.max(0, Math.min(1, (1 - particle.t / particle.life) * (particle.type === 'trail' ? 0.5 : 1)));
        ctx.fillStyle = particle.color;
        const size = Math.max(2, camera.scale * 0.06 * particle.size);
        ctx.fillRect(at.x - size / 2, at.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      if (effects.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${effects.flash * 0.28})`;
        ctx.fillRect(0, 0, view.width, view.height);
      }
    }

    // Arrows at the edge of the screen for the active player and the ball when either is out of view.
    const markers = [];
    if (active) markers.push({ at: edgeIndicator(camera, view, active, 34), color: COLORS.active });
    markers.push({ at: edgeIndicator(camera, view, ball, 34, height), color: '#ffffff' });
    for (const { at, color } of markers) {
      if (!at) continue;
      ctx.save();
      ctx.translate(at.x, at.y);
      ctx.rotate(at.angle);
      ctx.fillStyle = color;
      ctx.strokeStyle = '#0d0d0d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, -10);
      ctx.lineTo(-8, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  return { resize, draw, dispose() { cache.clear(); } };
}
