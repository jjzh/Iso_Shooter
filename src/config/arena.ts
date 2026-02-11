import { Obstacle, Pit, AABB } from '../types/index';

export const ARENA_HALF = 20;

export const OBSTACLES: Obstacle[] = [
  { x: 5, z: 9, w: 2, h: 1.5, d: 3 },
  { x: -9, z: -7.5, w: 4, h: 1.5, d: 2 },
  { x: 3.5, z: -3, w: 1.5, h: 2, d: 1.5 },
  { x: 3.5, z: -9.5, w: 1.5, h: 2, d: 1.5 },
  { x: 1, z: 10, w: 9, h: 1, d: 1 },
  { x: 8.5, z: -8, w: 3, h: 1, d: 1 },
  { x: 10, z: 9, w: 1, h: 2.5, d: 1 },
  { x: -7.5, z: 8, w: 1, h: 2.5, d: 1 },
];

export const WALL_THICKNESS = 0.5;
export const WALL_HEIGHT = 2;

export const PITS: Pit[] = [
  { x: 0, z: 7.5, w: 8, d: 3 },
  { x: 16, z: -17, w: 4.5, d: 4.5 },
  { x: -7.5, z: 0, w: 2.5, d: 8 },
  { x: -0.5, z: -7, w: 8.5, d: 2.5 },
  { x: 8, z: 0, w: 3, d: 9 },
];

export function getPitBounds(): AABB[] {
  return PITS.map(p => ({
    minX: p.x - p.w / 2,
    maxX: p.x + p.w / 2,
    minZ: p.z - p.d / 2,
    maxZ: p.z + p.d / 2,
  }));
}

export function getCollisionBounds(): AABB[] {
  const bounds: AABB[] = [];

  for (const o of OBSTACLES) {
    bounds.push({
      minX: o.x - o.w / 2,
      maxX: o.x + o.w / 2,
      minZ: o.z - o.d / 2,
      maxZ: o.z + o.d / 2,
    });
  }

  const h = ARENA_HALF;
  const t = WALL_THICKNESS;
  bounds.push({ minX: -h - t/2, maxX: h + t/2, minZ: h - t/2, maxZ: h + t/2 });
  bounds.push({ minX: -h - t/2, maxX: h + t/2, minZ: -h - t/2, maxZ: -h + t/2 });
  bounds.push({ minX: h - t/2, maxX: h + t/2, minZ: -h - t/2, maxZ: h + t/2 });
  bounds.push({ minX: -h - t/2, maxX: -h + t/2, minZ: -h - t/2, maxZ: h + t/2 });

  return bounds;
}
