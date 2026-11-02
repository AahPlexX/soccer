import { HALF_LENGTH, HALF_WIDTH } from './rules.js';

// The Game Mode heads-up display: scoreboard and clock, the active player's name and stamina, the shot power meter, a radar
// mini-map, big banners (GOAL!, HALF TIME, FULL TIME) and pause/sound buttons. Plain DOM plus one small canvas; no game logic.

const PHASE_BANNERS = { goal: 'GOAL!', halftime: 'HALF TIME', fulltime: 'FULL TIME' };
const ROLE_NAMES = { GK: 'Keeper', LD: 'Defender', RD: 'Defender', CD: 'Defender', LM: 'Midfielder', RM: 'Midfielder', CM: 'Midfielder', ST: 'Striker' };
const RESTART_BANNERS = { 'throw-in': 'THROW-IN', corner: 'CORNER KICK', 'goal-kick': 'GOAL KICK', 'free-kick': 'FREE KICK' };

/** Seconds as m:ss (never negative, never NaN). */
export function formatClock(seconds) {
  const whole = Math.max(0, Math.ceil(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** The big banner text for a match state, or '' for none. */
export function bannerFor(match, replaying = false) {
  if (replaying) return 'REPLAY';
  if (match.phase === 'restart' && match.restart) return `${RESTART_BANNERS[match.restart.type] ?? 'RESTART'} · ${whose(match, match.restart.team)}`;
  if (match.phase === 'halftime' && match.score) return `HALF TIME · ${match.score.home} - ${match.score.away}`;
  return PHASE_BANNERS[match.phase] ?? '';
}

/** Whose restart it is, from the human's point of view (HOME or AWAY when nobody is playing). */
function whose(match, team) {
  if (match.humanTeam === 'none') return team === 'home' ? 'HOME' : 'AWAY';
  return team === match.humanTeam ? 'YOUR BALL' : 'COMPUTER';
}

function who(match, team) {
  if (match.humanTeam === 'none') return team === 'home' ? 'Home' : 'Away';
  return team === match.humanTeam ? 'You' : 'Computer';
}

/**
 * The line under the banner during a restart: why the other team has the ball (who put it out, or who fouled), and at the human's own
 * throw-in what to do. '' when there is nothing to say.
 */
export function hintFor(match) {
  const restart = match.restart;
  if (match.phase !== 'restart' || !restart) return '';
  const cause = restart.foulBy ? `${who(match, restart.foulBy)} fouled` : restart.outBy ? `${who(match, restart.outBy)} put it out` : '';
  const mine = restart.state === 'wait' && restart.team === match.humanTeam;
  const prompt = !mine ? '' : restart.type === 'throw-in' ? 'aim with the stick, then tap PASS to throw' : 'aim with the stick, then tap PASS or SHOOT to kick';
  const remaining = mine && restart.limit ? Math.ceil(restart.limit - restart.waited) : Infinity;
  const countdown = remaining <= 4 ? `play on in ${Math.max(1, remaining)}` : '';
  return [cause, prompt, countdown].filter(Boolean).join(' · ');
}

/** "#7 ST" for the player, or '' for none. */
export function playerLabel(player) {
  return player ? `#${String(player.id).split('-')[1] ?? ''} ${ROLE_NAMES[player.role] ?? player.role}` : '';
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createHud(root, { onPause, onMute } = {}) {
  const layer = element('div', 'g-hud');
  const score = element('div', 'g-score');
  const home = element('span', 'g-team g-home', 'HOME');
  const homeGoals = element('span', 'g-goals', '0');
  const clock = element('span', 'g-clock', '0:00');
  const awayGoals = element('span', 'g-goals', '0');
  const away = element('span', 'g-team g-away', 'AWAY');
  const half = element('span', 'g-half', '1st half');
  score.append(home, homeGoals, clock, awayGoals, away);
  score.setAttribute('role', 'status');
  score.setAttribute('aria-live', 'off');

  const label = element('div', 'g-player');
  const labelText = element('span', 'g-player-name');
  const stamina = element('i', 'g-stamina');
  const staminaBar = element('span', 'g-stamina-bar');
  staminaBar.append(stamina);
  label.append(labelText, staminaBar);

  const power = element('div', 'g-power');
  const powerFill = element('i');
  power.append(powerFill);
  power.hidden = true;

  const banner = element('div', 'g-banner');
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  banner.hidden = true;
  const restartHint = element('div', 'g-restart-hint');
  restartHint.hidden = true;

  const radar = document.createElement('canvas');
  radar.className = 'g-radar';
  radar.width = 132;
  radar.height = 88;
  const radarCtx = radar.getContext('2d');

  const buttons = element('div', 'g-buttons');
  const pause = element('button', 'g-button', 'II');
  pause.type = 'button';
  pause.setAttribute('aria-label', 'Pause');
  pause.addEventListener('click', () => onPause?.());
  const mute = element('button', 'g-button', '♪');
  mute.type = 'button';
  mute.setAttribute('aria-label', 'Sound');
  mute.addEventListener('click', () => onMute?.());
  buttons.append(pause, mute);

  layer.append(score, half, label, power, banner, restartHint, radar, buttons);
  root.append(layer);

  let lastBanner = '';
  return {
    layer,
    update({ match, charge = 0, replaying = false, muted = false, showRadar = true }) {
      // Who is who and which way each side attacks (home attacks to the right).
      home.textContent = match.humanTeam === 'none' ? 'HOME ▶' : match.humanTeam === 'home' ? 'YOU ▶' : 'CPU ▶';
      away.textContent = match.humanTeam === 'none' ? '◀ AWAY' : match.humanTeam === 'away' ? '◀ YOU' : '◀ CPU';
      homeGoals.textContent = String(match.score.home);
      awayGoals.textContent = String(match.score.away);
      clock.textContent = formatClock(match.clock);
      half.textContent = match.half === 1 ? '1st half' : '2nd half';
      const active = match.players.find((p) => p.id === match.activeId);
      labelText.textContent = playerLabel(active);
      stamina.style.width = `${Math.round((active?.stamina ?? 0) * 100)}%`;
      label.hidden = !active;
      power.hidden = charge <= 0;
      powerFill.style.width = `${Math.round(charge * 100)}%`;
      power.classList.toggle('g-power-full', charge >= 1);
      const text = bannerFor(match, replaying);
      if (text !== lastBanner) {
        lastBanner = text;
        banner.textContent = text === 'REPLAY' ? 'REPLAY · tap anything to skip' : text;
        banner.classList.toggle('g-banner-replay', text === 'REPLAY');
        banner.hidden = text === '';
        banner.classList.toggle('g-banner-goal', text === 'GOAL!');
      }
      banner.classList.toggle('g-banner-restart', match.phase === 'restart');
      const hint = hintFor(match);
      restartHint.textContent = hint;
      restartHint.hidden = hint === '';
      mute.textContent = muted ? '✕' : '♪';
      mute.setAttribute('aria-pressed', String(muted));
      radar.hidden = !showRadar;
      if (showRadar) drawRadar(radarCtx, radar.width, radar.height, match);
    },
    setVisible(visible) { layer.hidden = !visible; },
    destroy() { layer.remove(); },
  };
}

function drawRadar(ctx, width, height, match) {
  const x = (value) => ((value + HALF_LENGTH) / (HALF_LENGTH * 2)) * (width - 8) + 4;
  const y = (value) => ((value + HALF_WIDTH) / (HALF_WIDTH * 2)) * (height - 8) + 4;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(14,60,30,0.72)';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  ctx.strokeRect(4, 4, width - 8, height - 8);
  ctx.beginPath(); ctx.moveTo(width / 2, 4); ctx.lineTo(width / 2, height - 4); ctx.stroke();
  for (const player of match.players) {
    ctx.fillStyle = player.team === 'home' ? '#4f8cff' : '#ff5b66';
    ctx.beginPath(); ctx.arc(x(player.x), y(player.y), player.id === match.activeId ? 3.6 : 2.4, 0, Math.PI * 2); ctx.fill();
    if (player.id === match.activeId) { ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; }
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x(match.ball.x), y(match.ball.y), 2.2, 0, Math.PI * 2); ctx.fill();
}
