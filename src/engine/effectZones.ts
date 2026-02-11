/**
 * Effect Zones — Spatial volumes that apply effects to entities inside them.
 *
 * Zones are 3D shapes placed in the world. When an entity enters a zone,
 * the zone's effect is applied. When they leave, effects tied to the zone
 * are removed (unless the effect has its own longer duration).
 *
 * Supports:
 * - Multiple shape primitives (sphere, cube, box, cylinder, cone, torus, half-sphere)
 * - Zone attachment to entities (moving zones)
 * - Zone evolution (expand, shrink, pulse)
 * - Visual rendering (ground circles/shapes)
 * - Integration with effectSystem (apply/remove effects on enter/exit)
 */

import { resolveEffectType } from '../config/effectTypes';
import { applyEffect, removeEffectsByZone, getModifiers } from './effectSystem';
import type { EffectZone, Entity, Vector3, ZoneShape, ZoneEvolution } from '../types/index';

// ═══════════════════════════════════════════════════════════════════════════
// ZONE REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

let sceneRef: any = null;
const activeZones: EffectZone[] = [];
let nextZoneId = 1;

// Shared geometries for zone visuals
let _circleGeo: any = null;
let _ringGeo: any = null;

export function initEffectZones(scene: any) {
  sceneRef = scene;
}

// ═══════════════════════════════════════════════════════════════════════════
// ZONE CREATION
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateZoneOpts {
  effectTypeId: string;
  position: Vector3;
  shape: ZoneShape;
  duration?: number;
  source?: Entity | null;
  attachedTo?: Entity | null;
  attachOffset?: Vector3;
  evolution?: ZoneEvolution | null;
  effectOverrides?: any;
  reapplyInterval?: number;
  persistsOnDeath?: boolean;
}

export function createZone(opts: CreateZoneOpts): EffectZone | null {
  const resolved = resolveEffectType(opts.effectTypeId);
  if (!resolved) return null;

  const zone: EffectZone = {
    id: nextZoneId++,
    effectTypeId: opts.effectTypeId,
    effectOverrides: opts.effectOverrides || undefined,
    position: { ...opts.position },
    shape: { ...opts.shape } as ZoneShape,
    attachedTo: opts.attachedTo || null,
    attachOffset: opts.attachOffset || { x: 0, y: 0, z: 0 },
    evolution: opts.evolution || null,
    duration: opts.duration ?? resolved.duration ?? 5000,
    elapsed: 0,
    persistsOnDeath: opts.persistsOnDeath ?? resolved.persistsOnDeath ?? false,
    source: opts.source || null,
    mesh: null,
    entitiesInside: new Set(),
    reapplyInterval: opts.reapplyInterval ?? 0,
    reapplyTimers: new Map(),
  };

  // Create visual mesh
  zone.mesh = createZoneMesh(zone, resolved);
  if (zone.mesh && sceneRef) {
    sceneRef.add(zone.mesh);
  }

  activeZones.push(zone);
  return zone;
}

// ═══════════════════════════════════════════════════════════════════════════
// ZONE VISUALS
// ═══════════════════════════════════════════════════════════════════════════

function createZoneMesh(zone: EffectZone, resolved: any): any {
  const visual = resolved.visual;
  if (!visual || !visual.zone) return null;

  const color = visual.zone.color;
  const opacity = visual.zone.opacity;

  // Create a ground indicator based on shape
  const shape = zone.shape;
  let mesh: any;

  switch (shape.type) {
    case 'sphere':
    case 'cylinder':
    case 'halfSphere': {
      const radius = shape.type === 'cylinder' ? shape.radius : shape.radius;
      mesh = createCircleIndicator(radius, color, opacity);
      break;
    }
    case 'cube': {
      mesh = createRectIndicator(shape.size, shape.size, 0, color, opacity);
      break;
    }
    case 'box': {
      mesh = createRectIndicator(shape.width, shape.depth, shape.rotation || 0, color, opacity);
      break;
    }
    case 'cone': {
      // Cone shows as a circle for now
      mesh = createCircleIndicator(shape.radius, color, opacity);
      break;
    }
    case 'torus': {
      mesh = createCircleIndicator(shape.majorRadius + shape.minorRadius, color, opacity);
      break;
    }
    default:
      return null;
  }

  if (mesh) {
    mesh.position.set(zone.position.x, 0.03, zone.position.z);
  }

  return mesh;
}

function createCircleIndicator(radius: number, color: number, opacity: number): any {
  // Ring outline
  if (!_ringGeo) {
    _ringGeo = new THREE.RingGeometry(0.85, 1.0, 32);
    _ringGeo.rotateX(-Math.PI / 2);
  }
  if (!_circleGeo) {
    _circleGeo = new THREE.CircleGeometry(1, 32);
    _circleGeo.rotateX(-Math.PI / 2);
  }

  const group = new THREE.Group();

  // Ring
  const ringMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: opacity * 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(_ringGeo, ringMat);
  group.add(ring);

  // Fill
  const fillMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: opacity * 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const fill = new THREE.Mesh(_circleGeo, fillMat);
  group.add(fill);

  group.scale.set(radius, radius, radius);

  // Store material refs for cleanup and animation
  (group as any).__zoneMats = [ringMat, fillMat];

  return group;
}

function createRectIndicator(width: number, depth: number, rotation: number, color: number, opacity: number): any {
  const group = new THREE.Group();

  const fillGeo = new THREE.PlaneGeometry(width, depth);
  fillGeo.rotateX(-Math.PI / 2);
  const fillMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: opacity * 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const fill = new THREE.Mesh(fillGeo, fillMat);
  group.add(fill);

  const edgeGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(width, depth));
  edgeGeo.rotateX(-Math.PI / 2);
  const borderMat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: opacity * 0.8,
    depthWrite: false,
  });
  const border = new THREE.LineSegments(edgeGeo, borderMat);
  group.add(border);

  if (rotation) {
    group.rotation.y = rotation;
  }

  (group as any).__zoneMats = [fillMat, borderMat];
  (group as any).__zoneGeos = [fillGeo, edgeGeo];

  return group;
}

// ═══════════════════════════════════════════════════════════════════════════
// OVERLAP DETECTION
// ═══════════════════════════════════════════════════════════════════════════

function isEntityInZone(entity: Entity, zone: EffectZone): boolean {
  const ex = entity.pos.x;
  const ey = entity.pos.y || 0;
  const ez = entity.pos.z;

  const zx = zone.position.x;
  const zy = zone.position.y || 0;
  const zz = zone.position.z;

  const shape = zone.shape;

  switch (shape.type) {
    case 'sphere': {
      const dx = ex - zx;
      const dy = ey - zy;
      const dz = ez - zz;
      return (dx * dx + dy * dy + dz * dz) <= shape.radius * shape.radius;
    }

    case 'cylinder': {
      const dx = ex - zx;
      const dz = ez - zz;
      const distXZ = dx * dx + dz * dz;
      const halfH = shape.height / 2;
      return distXZ <= shape.radius * shape.radius &&
             ey >= zy - halfH && ey <= zy + halfH;
    }

    case 'cube': {
      const half = shape.size / 2;
      return Math.abs(ex - zx) <= half &&
             Math.abs(ey - zy) <= half &&
             Math.abs(ez - zz) <= half;
    }

    case 'box': {
      // Rotate entity position into box local space
      const dx = ex - zx;
      const dz = ez - zz;
      const rot = -(shape.rotation || 0);
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;
      const halfH = shape.height / 2;
      return Math.abs(localX) <= shape.width / 2 &&
             Math.abs(localZ) <= shape.depth / 2 &&
             Math.abs(ey - zy) <= halfH;
    }

    case 'cone': {
      // 2D cone: check angle and distance from zone center
      const dx = ex - zx;
      const dz = ez - zz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > shape.radius) return false;

      const entityAngle = Math.atan2(dx, dz);
      let angleDiff = entityAngle - shape.direction;
      // Normalize to [-PI, PI]
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      return Math.abs(angleDiff) <= shape.angle / 2;
    }

    case 'torus': {
      const dx = ex - zx;
      const dz = ez - zz;
      const distFromCenter = Math.sqrt(dx * dx + dz * dz);
      const distFromRing = Math.abs(distFromCenter - shape.majorRadius);
      return distFromRing <= shape.minorRadius;
    }

    case 'halfSphere': {
      const dx = ex - zx;
      const dy = ey - zy;
      const dz = ez - zz;
      const dist = dx * dx + dy * dy + dz * dz;
      if (dist > shape.radius * shape.radius) return false;
      return shape.upper ? dy >= 0 : dy <= 0;
    }

    default:
      return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ZONE UPDATE
// ═══════════════════════════════════════════════════════════════════════════

export function updateEffectZones(dt: number, entities: Entity[]) {
  const dtMs = dt * 1000;

  for (let i = activeZones.length - 1; i >= 0; i--) {
    const zone = activeZones[i];
    zone.elapsed += dtMs;

    // Update attached position
    if (zone.attachedTo) {
      zone.position.x = zone.attachedTo.pos.x + zone.attachOffset.x;
      zone.position.y = (zone.attachedTo.pos.y || 0) + zone.attachOffset.y;
      zone.position.z = zone.attachedTo.pos.z + zone.attachOffset.z;
    }

    // Update evolution
    if (zone.evolution) {
      updateZoneEvolution(zone, dt);
    }

    // Update visual position
    if (zone.mesh) {
      zone.mesh.position.set(zone.position.x, 0.03, zone.position.z);
    }

    // Check zone expiry
    if (zone.elapsed >= zone.duration) {
      removeZone(zone);
      activeZones.splice(i, 1);
      continue;
    }

    // Fade visual near end
    const resolved = resolveEffectType(zone.effectTypeId);
    const fadeTime = resolved?.visual?.zone?.fadeTime || 500;
    const remaining = zone.duration - zone.elapsed;
    if (remaining < fadeTime && zone.mesh) {
      const fadeFactor = remaining / fadeTime;
      const mats = (zone.mesh as any).__zoneMats;
      if (mats) {
        for (const mat of mats) {
          mat.opacity = mat.opacity * fadeFactor;
        }
      }
    }

    // Check entity overlaps
    for (const entity of entities) {
      const wasInside = zone.entitiesInside.has(entity);
      const isInside = isEntityInZone(entity, zone);

      if (isInside && !wasInside) {
        // Entity entered zone
        onEntityEnterZone(entity, zone);
      } else if (!isInside && wasInside) {
        // Entity exited zone
        onEntityExitZone(entity, zone);
      } else if (isInside && wasInside && zone.reapplyInterval > 0) {
        // Continuous reapplication
        const timer = zone.reapplyTimers.get(entity) || 0;
        const newTimer = timer + dtMs;
        if (newTimer >= zone.reapplyInterval) {
          zone.reapplyTimers.set(entity, 0);
          applyEffect(entity, zone.effectTypeId, {
            source: zone.source,
            zone: zone as any,
            ...zone.effectOverrides,
          });
        } else {
          zone.reapplyTimers.set(entity, newTimer);
        }
      }
    }
  }
}

function updateZoneEvolution(zone: EffectZone, dt: number) {
  if (!zone.evolution) return;
  const evo = zone.evolution;
  const shape = zone.shape;

  // Get the current size parameter to evolve
  let currentSize = getShapeRadius(shape);
  if (currentSize === null) return;

  switch (evo.type) {
    case 'expand':
      currentSize += evo.rate * dt;
      if (evo.max !== undefined) currentSize = Math.min(currentSize, evo.max);
      break;
    case 'shrink':
      currentSize -= evo.rate * dt;
      if (evo.min !== undefined) currentSize = Math.max(currentSize, evo.min);
      if (currentSize <= 0) currentSize = 0.01;
      break;
    case 'pulse': {
      const phase = (zone.elapsed / 1000) * evo.rate;
      const min = evo.min || currentSize * 0.5;
      const max = evo.max || currentSize * 1.5;
      const mid = (min + max) / 2;
      const amp = (max - min) / 2;
      currentSize = mid + amp * Math.sin(phase * Math.PI * 2);
      break;
    }
  }

  setShapeRadius(shape, currentSize);

  // Update visual scale
  if (zone.mesh) {
    zone.mesh.scale.set(currentSize, currentSize, currentSize);
  }
}

function getShapeRadius(shape: ZoneShape): number | null {
  switch (shape.type) {
    case 'sphere': return shape.radius;
    case 'cylinder': return shape.radius;
    case 'halfSphere': return shape.radius;
    case 'cube': return shape.size;
    case 'cone': return shape.radius;
    default: return null;
  }
}

function setShapeRadius(shape: ZoneShape, value: number) {
  switch (shape.type) {
    case 'sphere': (shape as any).radius = value; break;
    case 'cylinder': (shape as any).radius = value; break;
    case 'halfSphere': (shape as any).radius = value; break;
    case 'cube': (shape as any).size = value; break;
    case 'cone': (shape as any).radius = value; break;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ZONE ENTER/EXIT
// ═══════════════════════════════════════════════════════════════════════════

function onEntityEnterZone(entity: Entity, zone: EffectZone) {
  zone.entitiesInside.add(entity);
  zone.reapplyTimers.set(entity, 0);

  // Apply the zone's effect
  applyEffect(entity, zone.effectTypeId, {
    source: zone.source,
    zone: zone as any,
    ...zone.effectOverrides,
  });
}

function onEntityExitZone(entity: Entity, zone: EffectZone) {
  zone.entitiesInside.delete(entity);
  zone.reapplyTimers.delete(entity);

  // Remove effects that were applied by this zone
  // (only zone-sourced effects — the effect may have its own duration that outlasts the zone)
  removeEffectsByZone(entity, zone as any);
}

// ═══════════════════════════════════════════════════════════════════════════
// ZONE REMOVAL
// ═══════════════════════════════════════════════════════════════════════════

function removeZone(zone: EffectZone) {
  // Remove effects from all entities inside
  for (const entity of zone.entitiesInside) {
    removeEffectsByZone(entity, zone as any);
  }
  zone.entitiesInside.clear();
  zone.reapplyTimers.clear();

  // Clean up visual
  if (zone.mesh && sceneRef) {
    const mats = (zone.mesh as any).__zoneMats;
    if (mats) {
      for (const mat of mats) {
        mat.dispose();
      }
    }
    const geos = (zone.mesh as any).__zoneGeos;
    if (geos) {
      for (const geo of geos) {
        geo.dispose();
      }
    }
    sceneRef.remove(zone.mesh);
    zone.mesh = null;
  }
}

export function removeZoneById(zoneId: number) {
  const idx = activeZones.findIndex(z => z.id === zoneId);
  if (idx !== -1) {
    removeZone(activeZones[idx]);
    activeZones.splice(idx, 1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE DEATH
// ═══════════════════════════════════════════════════════════════════════════

export function onZoneSourceDeath(source: Entity) {
  for (let i = activeZones.length - 1; i >= 0; i--) {
    const zone = activeZones[i];
    if (zone.source === source && !zone.persistsOnDeath) {
      removeZone(zone);
      activeZones.splice(i, 1);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════════════

export function getActiveZones(): EffectZone[] {
  return activeZones;
}

export function getZonesAtPosition(x: number, z: number): EffectZone[] {
  const pos: Entity = { pos: { x, y: 0, z }, health: 0 };
  return activeZones.filter(zone => isEntityInZone(pos, zone));
}

export function getZonesByType(effectTypeId: string): EffectZone[] {
  return activeZones.filter(zone => zone.effectTypeId === effectTypeId);
}

// ═══════════════════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════════════════

export function clearEffectZones() {
  for (const zone of activeZones) {
    removeZone(zone);
  }
  activeZones.length = 0;
}
