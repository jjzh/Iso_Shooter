// Particle System — lightweight pool-based emitter for game effects
// Config-driven bursts: hit sparks, death puffs, dash trails, etc.
// Pre-allocates a fixed pool of mesh particles. No runtime allocation.
// Subscribes to event bus for automatic particle spawning.

import { on } from './events';
import type { GameEvent } from './events';

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

  // Subscribe to events
  wireEventBus();
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
}
