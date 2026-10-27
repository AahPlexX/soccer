import { ZONES } from './constants.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function projectToZone(point, zone) {
  return {
    x: clamp(point.x, zone.x1, zone.x2),
    y: clamp(point.y, zone.y1, zone.y2),
  };
}

function squaredDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function constrainPointToZones(point, selectedZoneIds) {
  const zones = selectedZoneIds.map((id) => ZONES[id]).filter(Boolean);
  if (!zones.length) return { ...point };

  let nearest = null;
  let nearestDistance = Infinity;
  for (const zone of zones) {
    const projected = projectToZone(point, zone);
    const distance = squaredDistance(point, projected);
    if (distance === 0) return { ...point };
    if (distance < nearestDistance) {
      nearest = projected;
      nearestDistance = distance;
    }
  }
  return nearest ?? { ...point };
}

export function shouldRestrictTeam(scope, team) {
  return scope === 'both' || scope === team;
}

export function constrainPlayerPositionForZones(state, player, point) {
  if (!shouldRestrictTeam(state.zoneRestrictionScope, player.team)) return { ...point };
  return constrainPointToZones(point, state.selectedZones ?? []);
}
