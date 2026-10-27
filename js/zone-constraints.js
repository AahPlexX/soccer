import { ZONES } from './constants.js';

const EPSILON = 1e-6;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const clamp01 = (value) => clamp(value, 0, 1);

function selectedZones(selectedZoneIds) {
  return selectedZoneIds.map((id) => ZONES[id]).filter(Boolean);
}

function pointInsideZone(point, zone) {
  return point.x >= zone.x1 && point.x <= zone.x2 && point.y >= zone.y1 && point.y <= zone.y2;
}

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
  const zones = selectedZones(selectedZoneIds);
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

export function constrainPointOutsideZones(point, selectedZoneIds) {
  const zones = selectedZones(selectedZoneIds);
  if (!zones.length || !zones.some((zone) => pointInsideZone(point, zone))) return { ...point };

  const xs = [point.x];
  const ys = [point.y];
  for (const zone of zones) {
    xs.push(clamp01(zone.x1 - EPSILON), clamp01(zone.x2 + EPSILON));
    ys.push(clamp01(zone.y1 - EPSILON), clamp01(zone.y2 + EPSILON));
  }

  let nearest = null;
  let nearestDistance = Infinity;
  for (const x of xs) {
    for (const y of ys) {
      const candidate = { x, y };
      if (zones.some((zone) => pointInsideZone(candidate, zone))) continue;
      const distance = squaredDistance(point, candidate);
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }
  }

  return nearest ?? { ...point };
}

export function shouldRestrictTeam(scope, team) {
  return scope === 'both' || scope === team;
}

export function constrainPlayerPositionForZones(state, player, point) {
  if (state.zoneRestrictionMode === 'off' || !shouldRestrictTeam(state.zoneRestrictionScope, player.team)) return { ...point };
  if (state.zoneRestrictionMode === 'keep-in') return constrainPointToZones(point, state.selectedZones ?? []);
  if (state.zoneRestrictionMode === 'keep-out') return constrainPointOutsideZones(point, state.selectedZones ?? []);
  return { ...point };
}
