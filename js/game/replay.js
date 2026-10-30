// A rolling buffer of recent match frames for goal replays. It stores plain, match-shaped snapshots (just what the renderer needs),
// so playing one back is the same draw call as drawing the live match. Pure.

export const REPLAY = Object.freeze({ seconds: 6, interval: 1 / 30 });

/** A recorder holding about `seconds` of play. */
export function createReplay(seconds = REPLAY.seconds) {
  return { capacity: Math.max(2, Math.round(seconds / REPLAY.interval)), frames: [], clock: 0 };
}

const snapshotPlayer = (p) => ({ id: p.id, team: p.team, role: p.role, x: p.x, y: p.y, vx: p.vx, vy: p.vy, heading: p.heading, down: p.down, action: p.action ? { ...p.action } : null });

/** Takes a snapshot of the match if enough time has passed since the last one. `dt` is the time since the previous call. */
export function recordReplay(replay, match, dt) {
  replay.clock += dt;
  if (replay.clock < REPLAY.interval) return false;
  replay.clock -= REPLAY.interval;
  replay.frames.push({
    time: match.time,
    ball: { x: match.ball.x, y: match.ball.y, z: match.ball.z, vx: match.ball.vx, vy: match.ball.vy, vz: match.ball.vz },
    players: match.players.map(snapshotPlayer),
    owner: match.owner,
    activeId: match.activeId,
    humanTeam: match.humanTeam,
    score: { ...match.score },
  });
  if (replay.frames.length > replay.capacity) replay.frames.shift();
  return true;
}

/** The recorded frames, oldest first, as a copy that later recording cannot change. */
export function replayFrames(replay) {
  return replay.frames.slice();
}

/** The frame to show `elapsed` seconds into a replay that started at its first frame, or null once it has finished. */
export function replayFrameAt(frames, elapsed, speed = 1) {
  if (frames.length === 0) return null;
  const index = Math.floor((elapsed * speed) / REPLAY.interval);
  return index < frames.length ? frames[Math.max(0, index)] : null;
}

/** Forgets the recording (a new match, or after a replay has been shown). */
export function clearReplay(replay) {
  replay.frames.length = 0;
  replay.clock = 0;
}
