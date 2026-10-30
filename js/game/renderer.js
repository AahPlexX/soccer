import { GOAL_HEIGHT } from '../ball-physics.js';
import { CAMERA, project } from './camera.js';
import { HALF_LENGTH, HALF_MOUTH, HALF_WIDTH, PENALTY_DEPTH, PENALTY_HALF_WIDTH } from './rules.js';
import { BALL_SPRITE, SPRITE, drawBallFrame, drawPlayerFrame, facingFor, pickAnimation, playerPalette, variantFor } from './sprites.js';

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
const PLAYER_HEIGHT_METERS = 1.9; // how tall a sprite's full 26 rows are drawn

export function createRenderer(canvas, { colors = null } = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const cache = new Map();
  let ballPhase = 0;
  let lastTime = 0;

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

  function playerImage(player, animation, facing) {
    const keeper = player.role === 'GK';
    const variant = variantFor(player.id);
    const key = `${player.team}|${variant}|${keeper ? 'k' : 'p'}|${animation.action}|${animation.frame}|${facing}`;
    return cache.get(key) ?? bitmap(key, drawPlayerFrame({ palette: playerPalette(player.team, variant, keeper, colors), action: animation.action, frame: animation.frame, facing, keeper }));
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
    const animation = pickAnimation(player, { time: model.time, celebrating: model.celebrating === player.team });
    const { facing, mirror } = facingFor(player.heading);
    const image = playerImage(player, animation, facing);
    const pixel = (camera.scale * PLAYER_HEIGHT_METERS) / SPRITE.height;
    const feet = project(camera, view, player.x, player.y, 0);
    const top = feet.y - SPRITE.footY * pixel;
    ctx.imageSmoothingEnabled = false;
    if (mirror) {
      ctx.save();
      ctx.translate(feet.x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(image, -SPRITE.anchorX * pixel, top, SPRITE.width * pixel, SPRITE.height * pixel);
      ctx.restore();
    } else {
      ctx.drawImage(image, feet.x - SPRITE.anchorX * pixel, top, SPRITE.width * pixel, SPRITE.height * pixel);
    }
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
    const { match, camera, view, effects } = model;
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
    const target = match.passTarget ? match.players.find((p) => p.id === match.passTarget) : null;
    if (target) {
      const p = project(camera, view, target.x, target.y, 0);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, camera.scale * 0.6, camera.scale * 0.6 * CAMERA.tilt, 0, 0, Math.PI * 2); ctx.stroke();
    }

    // Players and the ball, far to near.
    const order = [...match.players.map((p) => ({ kind: 'player', y: p.y, p })), { kind: 'ball', y: ball.y }].sort((a, b) => a.y - b.y);
    for (const item of order) {
      if (item.kind === 'player') {
        drawPlayer(camera, view, item.p, model, item.p.id === match.activeId);
      } else {
        const at = project(camera, view, ball.x, ball.y, height);
        const size = Math.max(7, Math.min(28, camera.scale * 0.42));
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
  }

  return { resize, draw, dispose() { cache.clear(); } };
}
