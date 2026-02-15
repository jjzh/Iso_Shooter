// Particle System — lightweight pool-based emitter for game effects
// Config-driven bursts: hit sparks, death puffs, dash trails, etc.
// Pre-allocates a fixed pool of mesh particles. No runtime allocation.
// Subscribes to event bus for automatic particle spawning.

import { on } from './events';
import type { GameEvent } from './events';
import { MELEE } from '../config/player';

// ─── Config Types ───

export interface ParticleConfig {
  count: number;       // particles per burst (4-12 typical)
  lifetime: number;    // seconds
  speed: number;       // initial velocity (world units/sec)
  spread: number;      // cone half-angle in radians (Math.PI = sphere)
  size: number;        // world units
  color: number;       // hex color
  fadeOut: boolean;     // alpha decay over lifetime
  gravity: number;     // downward acceleration (0 = floaty, 9.8 = heavy)
  shape: 'box' | 'sphere';
}

// ─── Pre-defined Presets ───

export const HIT_SPARK: ParticleConfig = {
  count: 5,
  lifetime: 0.25,
  speed: 6,
  spread: Math.PI * 0.8,
  size: 0.06,
  color: 0xffffaa,
  fadeOut: true,
  gravity: 4,
  shape: 'box',
};

export const DEATH_PUFF: ParticleConfig = {
  count: 8,
  lifetime: 0.4,
  speed: 3,
  spread: Math.PI,
  size: 0.08,
  color: 0xffffff, // will be overridden with enemy color
  fadeOut: true,
  gravity: 1,
  shape: 'sphere',
};

export const DASH_TRAIL: ParticleConfig = {
  count: 3,
  lifetime: 0.3,
  speed: 1.5,
  spread: Math.PI * 0.3,
  size: 0.05,
  color: 0x44ff88,
  fadeOut: true,
  gravity: 0,
  shape: 'box',
};

export const SHIELD_BREAK_BURST: ParticleConfig = {
  count: 10,
  lifetime: 0.35,
  speed: 8,
  spread: Math.PI,
  size: 0.07,
  color: 0x88eeff,
  fadeOut: true,
  gravity: 3,
  shape: 'box',
};

export const PUSH_BURST: ParticleConfig = {
  count: 4,
  lifetime: 0.2,
  speed: 5,
  spread: Math.PI * 0.5,
  size: 0.05,
  color: 0x44ffaa,
  fadeOut: true,
  gravity: 2,
  shape: 'box',
};

export const CHARGE_BLAST: ParticleConfig = {
  count: 12,
  lifetime: 0.3,
  speed: 10,
  spread: Math.PI * 0.4,
  size: 0.08,
  color: 0x44ffaa,
  fadeOut: true,
  gravity: 2,
  shape: 'sphere',
};

export const ENEMY_IMPACT_SPARK: ParticleConfig = {
  count: 6,
  lifetime: 0.25,
  speed: 5,
  spread: Math.PI,
  size: 0.06,
  color: 0xffaa44,
  fadeOut: true,
  gravity: 4,
  shape: 'sphere',
};

export const WALL_SLAM_SPARK: ParticleConfig = {
  count: 8,
  lifetime: 0.3,
  speed: 7,
  spread: Math.PI * 0.6,
  size: 0.07,
  color: 0xff8844,
  fadeOut: true,
  gravity: 5,
  shape: 'box',
};

export const DOOR_UNLOCK_BURST: ParticleConfig = {
  count: 12,
  lifetime: 0.5,
  speed: 6,
  spread: Math.PI * 0.5,
  size: 0.08,
  color: 0x88bbff,
  fadeOut: true,
  gravity: -2,   // float upward
  shape: 'sphere',
};

// ─── Pool ───

const POOL_SIZE = 80;

interface Particle {
  mesh: any;       // THREE.Mesh
  active: boolean;
  life: number;    // seconds elapsed
  maxLife: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  fadeOut: boolean;
  material: any;   // THREE.MeshBasicMaterial (for opacity)
  baseScale: number; // initial size for non-cumulative shrink
}

const pool: Particle[] = [];
let sceneRef: any = null;

// Shared geometries
let boxGeo: any = null;
let sphereGeo: any = null;

export function initParticles(scene: any): void {
  sceneRef = scene;

  // Create shared geometries
  boxGeo = new THREE.BoxGeometry(1, 1, 1);
  sphereGeo = new THREE.SphereGeometry(0.5, 4, 3);

  // Pre-allocate pool
  for (let i = 0; i < POOL_SIZE; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.visible = false;
    scene.add(mesh);

    pool.push({
      mesh,
      active: false,
      life: 0,
      maxLife: 1,
      vx: 0, vy: 0, vz: 0,
      gravity: 0,
      fadeOut: true,
      material: mat,
      baseScale: 1,
    });
  }

  // Init arc decal pools
  initArcDecals(scene);
  initEnemyArcDecals(scene);

  // Subscribe to events
  wireEventBus();
}

// ─── Melee Arc Decal Pool ───

const ARC_DECAL_POOL_SIZE = 3;
const ARC_DECAL_LIFETIME = 0.25; // seconds

interface ArcDecal {
  mesh: any;       // THREE.Mesh
  active: boolean;
  life: number;    // seconds elapsed
}

const arcDecalPool: ArcDecal[] = [];
let arcDecalGeo: any = null;

function initArcDecals(scene: any): void {
  // CircleGeometry(radius, segments, thetaStart, thetaLength) creates a sector
  // thetaStart is in the XY plane. After rotateX(-PI/2), XY→XZ.
  // Default arc center at thetaStart=0 points along +X. We offset by +PI/2
  // so the arc center points along +Y (pre-rotation) = +Z (post-rotation),
  // which aligns with Three.js rotation.y convention.
  arcDecalGeo = new THREE.CircleGeometry(1, 24, Math.PI / 2 - MELEE.arc / 2, MELEE.arc);
  arcDecalGeo.rotateX(-Math.PI / 2); // lay flat on ground

  for (let i = 0; i < ARC_DECAL_POOL_SIZE; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(arcDecalGeo, mat);
    mesh.visible = false;
    scene.add(mesh);

    arcDecalPool.push({ mesh, active: false, life: 0 });
  }
}

function spawnArcDecal(x: number, z: number, dirX: number, dirZ: number): void {
  // Find inactive decal in pool
  let decal: ArcDecal | null = null;
  for (const d of arcDecalPool) {
    if (!d.active) { decal = d; break; }
  }
  if (!decal) return; // pool exhausted

  decal.active = true;
  decal.life = 0;
  decal.mesh.visible = true;
  decal.mesh.position.set(x, 0.05, z);

  // Scale to match current melee range
  const r = MELEE.range;
  decal.mesh.scale.set(r * 0.3, 1, r * 0.3); // start small, will grow

  // Rotate to face swing direction
  // direction = { -sin(angle), -cos(angle) } from player.ts
  // Recover the original rotation.y angle: atan2(-dirX, -dirZ)
  // Arc geometry is pre-rotated so its center aligns with +Z (rotation.y = 0)
  decal.mesh.rotation.y = Math.atan2(-dirX, -dirZ);

  decal.mesh.material.opacity = 0.4;
}

function updateArcDecals(dt: number): void {
  for (const d of arcDecalPool) {
    if (!d.active) continue;

    d.life += dt;
    if (d.life >= ARC_DECAL_LIFETIME) {
      d.active = false;
      d.mesh.visible = false;
      continue;
    }

    const t = d.life / ARC_DECAL_LIFETIME;
    // easeOutQuad
    const ease = 1 - (1 - t) * (1 - t);

    // Scale: 0.3 → 1.0 of melee range
    const r = MELEE.range;
    const s = r * (0.3 + 0.7 * ease);
    d.mesh.scale.set(s, 1, s);

    // Opacity: 0.4 → 0
    d.mesh.material.opacity = 0.4 * (1 - ease);
  }
}

function clearArcDecals(): void {
  for (const d of arcDecalPool) {
    d.active = false;
    d.mesh.visible = false;
  }
}

// ─── Enemy Telegraph Arc Decal Pool ───

const ENEMY_ARC_POOL_SIZE = 6;  // up to 6 simultaneous enemy telegraphs

interface EnemyArcDecal {
  mesh: any;       // THREE.Mesh
  active: boolean;
  life: number;    // seconds elapsed
  maxLife: number;  // total duration (telegraph + attack)
}

const enemyArcPool: EnemyArcDecal[] = [];

function initEnemyArcDecals(scene: any): void {
  for (let i = 0; i < ENEMY_ARC_POOL_SIZE; i++) {
    // Start with a placeholder geometry — replaced per-spawn with correct arc/range
    const geo = new THREE.CircleGeometry(1, 24, 0, Math.PI);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);

    enemyArcPool.push({ mesh, active: false, life: 0, maxLife: 1 });
  }
}

function spawnEnemyArcDecal(x: number, z: number, rotationY: number, hitArc: number, hitRange: number, durationMs: number): void {
  // Find inactive decal in pool
  let decal: EnemyArcDecal | null = null;
  for (const d of enemyArcPool) {
    if (!d.active) { decal = d; break; }
  }
  if (!decal) return;

  // Replace geometry with correct arc shape for this enemy
  // Arc centered at PI/2 → points +Z after rotateX(-PI/2), same convention as vision cone
  const newGeo = new THREE.CircleGeometry(hitRange, 24, Math.PI / 2 - hitArc / 2, hitArc);
  newGeo.rotateX(-Math.PI / 2);
  decal.mesh.geometry.dispose();
  decal.mesh.geometry = newGeo;

  decal.active = true;
  decal.life = 0;
  decal.maxLife = durationMs / 1000;
  decal.mesh.visible = true;
  decal.mesh.position.set(x, 0.05, z);
  decal.mesh.scale.set(1, 1, 1);
  // Geometry faces -Z at rotation.y=0 (same as model). Just apply rotation.y directly.
  decal.mesh.rotation.set(0, rotationY, 0);
  decal.mesh.material.opacity = 0.35;
}

function updateEnemyArcDecals(dt: number): void {
  for (const d of enemyArcPool) {
    if (!d.active) continue;

    d.life += dt;
    if (d.life >= d.maxLife) {
      d.active = false;
      d.mesh.visible = false;
      continue;
    }

    const t = d.life / d.maxLife;

    // Pulsing opacity during telegraph, then fade in last 20%
    if (t < 0.8) {
      // Pulse between 0.2 and 0.35
      const pulse = 0.275 + 0.075 * Math.sin(d.life * 12);
      d.mesh.material.opacity = pulse;
    } else {
      // Fade out in last 20%
      const fadeT = (t - 0.8) / 0.2;
      d.mesh.material.opacity = 0.35 * (1 - fadeT);
    }
  }
}

function clearEnemyArcDecals(): void {
  for (const d of enemyArcPool) {
    d.active = false;
    d.mesh.visible = false;
  }
}

// ─── Burst API ───

export function burst(
  position: { x: number; y?: number; z: number },
  config: ParticleConfig,
  direction?: { x: number; z: number }
): void {
  if (!sceneRef) return;

  const y = position.y ?? 0.5; // default to waist height

  for (let i = 0; i < config.count; i++) {
    const p = acquireParticle();
    if (!p) break; // pool exhausted

    // Set geometry based on shape
    p.mesh.geometry = config.shape === 'sphere' ? sphereGeo : boxGeo;

    // Size
    const s = config.size * (0.7 + Math.random() * 0.6); // slight variation
    p.mesh.scale.set(s, s, s);
    p.baseScale = s;

    // Color
    p.material.color.setHex(config.color);
    p.material.opacity = 1;

    // Position
    p.mesh.position.set(
      position.x + (Math.random() - 0.5) * 0.1,
      y + (Math.random() - 0.5) * 0.1,
      position.z + (Math.random() - 0.5) * 0.1
    );

    // Velocity — spread around direction (or random sphere)
    let vx: number, vy: number, vz: number;
    if (direction) {
      // Spread around given direction
      const angle = Math.atan2(direction.x, direction.z) + (Math.random() - 0.5) * config.spread;
      const elevAngle = (Math.random() - 0.3) * config.spread * 0.5;
      vx = Math.sin(angle) * Math.cos(elevAngle);
      vy = Math.sin(elevAngle) + Math.random() * 0.3;
      vz = Math.cos(angle) * Math.cos(elevAngle);
    } else {
      // Random sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * config.spread;
      vx = Math.sin(phi) * Math.cos(theta);
      vy = Math.cos(phi) * 0.5 + Math.random() * 0.5;
      vz = Math.sin(phi) * Math.sin(theta);
    }

    const speed = config.speed * (0.6 + Math.random() * 0.8);
    p.vx = vx * speed;
    p.vy = vy * speed;
    p.vz = vz * speed;

    p.gravity = config.gravity;
    p.fadeOut = config.fadeOut;
    p.life = 0;
    p.maxLife = config.lifetime * (0.7 + Math.random() * 0.6);
    p.active = true;
    p.mesh.visible = true;
  }
}

// ─── Update ───

export function updateParticles(dt: number): void {
  updateArcDecals(dt);
  updateEnemyArcDecals(dt);

  for (const p of pool) {
    if (!p.active) continue;

    p.life += dt;
    if (p.life >= p.maxLife) {
      p.active = false;
      p.mesh.visible = false;
      continue;
    }

    // Physics
    p.vy -= p.gravity * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;

    // Floor collision
    if (p.mesh.position.y < 0.02) {
      p.mesh.position.y = 0.02;
      p.vy = 0;
      p.vx *= 0.8; // friction
      p.vz *= 0.8;
    }

    // Fade
    if (p.fadeOut) {
      const t = p.life / p.maxLife;
      p.material.opacity = 1 - t * t; // quadratic fade
    }

    // Shrink slightly near end of life (absolute, not cumulative)
    const lifeRatio = p.life / p.maxLife;
    if (lifeRatio > 0.7) {
      const shrink = 1 - (lifeRatio - 0.7) / 0.3;
      p.mesh.scale.setScalar(p.baseScale * shrink);
    }
  }
}

// ─── Pool Management ───

function acquireParticle(): Particle | null {
  for (const p of pool) {
    if (!p.active) return p;
  }
  return null; // pool exhausted — just skip
}

export function clearParticles(): void {
  for (const p of pool) {
    p.active = false;
    p.mesh.visible = false;
  }
  clearArcDecals();
  clearEnemyArcDecals();
}

// ─── Event Bus Integration ───

function wireEventBus(): void {
  on('enemyHit', (e: GameEvent) => {
    if (e.type === 'enemyHit') {
      burst(
        { x: e.position.x, y: 0.5, z: e.position.z },
        HIT_SPARK
      );
    }
  });

  on('enemyDied', (e: GameEvent) => {
    if (e.type === 'enemyDied') {
      // Use enemy color for death puff
      const color = e.enemy.config?.color ?? DEATH_PUFF.color;
      burst(
        { x: e.position.x, y: 0.4, z: e.position.z },
        { ...DEATH_PUFF, color }
      );
    }
  });

  on('playerDash', (e: GameEvent) => {
    if (e.type === 'playerDash') {
      burst(
        { x: e.position.x, y: 0.4, z: e.position.z },
        DASH_TRAIL,
        { x: -e.direction.x, z: -e.direction.z }
      );
    }
  });

  on('shieldBreak', (e: GameEvent) => {
    if (e.type === 'shieldBreak') {
      burst(
        { x: e.position.x, y: 0.6, z: e.position.z },
        SHIELD_BREAK_BURST
      );
    }
  });

  on('chargeFired', (e: GameEvent) => {
    if (e.type === 'chargeFired') {
      burst(
        { x: e.position.x, y: 0.5, z: e.position.z },
        { ...CHARGE_BLAST, count: Math.round(6 + e.chargeT * 6) },
        { x: e.direction.x, z: e.direction.z }
      );
    }
  });

  on('enemyPushed', (e: GameEvent) => {
    if (e.type === 'enemyPushed') {
      burst(
        { x: e.position.x, y: 0.3, z: e.position.z },
        PUSH_BURST
      );
    }
  });

  on('meleeSwing', (e: GameEvent) => {
    if (e.type === 'meleeSwing') {
      burst(
        { x: e.position.x, y: 0.6, z: e.position.z },
        { ...DASH_TRAIL, count: 2, speed: 3, lifetime: 0.15, color: 0xffffff },
        { x: e.direction.x, z: e.direction.z }
      );
      // Ground arc decal showing melee hit area
      spawnArcDecal(e.position.x, e.position.z, e.direction.x, e.direction.z);
    }
  });

  on('wallSlam', (e: GameEvent) => {
    if (e.type === 'wallSlam') {
      burst(
        { x: e.position.x, y: 0.3, z: e.position.z },
        { ...WALL_SLAM_SPARK, count: Math.round(4 + (e.speed / 5) * 4) }
      );
    }
  });

  on('enemyImpact', (e: GameEvent) => {
    if (e.type === 'enemyImpact') {
      burst(
        { x: e.position.x, y: 0.4, z: e.position.z },
        { ...ENEMY_IMPACT_SPARK, count: Math.round(3 + (e.speed / 5) * 3) }
      );
    }
  });

  on('enemyMeleeTelegraph', (e: GameEvent) => {
    if (e.type === 'enemyMeleeTelegraph') {
      spawnEnemyArcDecal(
        e.position.x, e.position.z,
        e.rotationY, e.hitArc, e.hitRange,
        e.duration
      );
    }
  });

  on('doorUnlocked', (e: GameEvent) => {
    if (e.type === 'doorUnlocked') {
      // Burst particles at the door location (top of far wall)
      // We don't have the exact position here, so emit upward from center-far
      burst({ x: 0, y: 2, z: 0 }, DOOR_UNLOCK_BURST);
    }
  });
}
