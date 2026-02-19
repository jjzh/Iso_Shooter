// Terrain height zones — axis-aligned rectangular platforms at specified heights.
// Used by getGroundHeight(x, z) to determine the ground level at any point.
// Zones are stacked: if multiple overlap, the highest one wins (entity is "on top").

export interface HeightZone {
  x: number;       // center X
  z: number;       // center Z
  w: number;       // width (X extent)
  d: number;       // depth (Z extent)
  y: number;       // top surface height
  label?: string;  // optional debug label
}

// Active height zones for current room — mutated by setArenaConfig / room loading
export const HEIGHT_ZONES: HeightZone[] = [];

export function setHeightZones(zones: HeightZone[]) {
  HEIGHT_ZONES.length = 0;
  zones.forEach(z => HEIGHT_ZONES.push(z));
}

/**
 * Sample ground height at a world (x, z) position.
 * Returns the highest platform surface the point is inside, or 0 (floor) if none.
 */
export function getGroundHeight(x: number, z: number): number {
  let maxY = 0; // base floor is always 0
  for (const zone of HEIGHT_ZONES) {
    const halfW = zone.w / 2;
    const halfD = zone.d / 2;
    if (
      x >= zone.x - halfW &&
      x <= zone.x + halfW &&
      z >= zone.z - halfD &&
      z <= zone.z + halfD
    ) {
      if (zone.y > maxY) maxY = zone.y;
    }
  }
  return maxY;
}

/**
 * Check if entity at (x, z, y) is standing on a platform (within epsilon of surface).
 */
export function isOnPlatform(x: number, z: number, y: number, epsilon = 0.05): boolean {
  const groundY = getGroundHeight(x, z);
  return groundY > 0 && Math.abs(y - groundY) <= epsilon;
}
