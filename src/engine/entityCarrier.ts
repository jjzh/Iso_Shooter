// Entity Carrier — general-purpose physics projectile that carries an entity payload.
// Created by verbs (spike creates one with angled-downward velocity).
// Handles flight, through-hits, and ground impact independently.

import { getGroundHeight } from '../config/terrain';
import { screenShake } from './renderer';
import { emit } from './events';
import { spawnDamageNumber } from '../ui/damageNumbers';

// --------------- Types ---------------

export interface CarrierConfig {
  speed: number;
  gravityMult: number;
  throughDamage: number;
  throughKnockback: number;
  impactDamage: number;
  impactRadius: number;
  impactKnockback: number;
  impactShake: number;
}

interface Carrier {
  payload: any;
  vel: { x: number; y: number; z: number };
  config: CarrierConfig;
  hitSet: Set<any>;
}

// --------------- Constants ---------------

const GRAVITY = 25; // matches JUMP.gravity
const THROUGH_HIT_RADIUS = 1.5; // generous hit radius for through-hits

// --------------- Internal State ---------------

const carriers: Carrier[] = [];

// --------------- Public API ---------------

/**
 * Create a carrier with the given payload, direction, and config.
 * Direction is normalized and scaled by config.speed.
 * The payload's hitSet starts with itself (immune to own carrier).
 */
export function createCarrier(
  payload: any,
  direction: { x: number; y: number; z: number },
  config: CarrierConfig,
): void {
  // Normalize direction
  const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z) || 1;
  const nx = direction.x / len;
  const ny = direction.y / len;
  const nz = direction.z / len;

  const hitSet = new Set<any>();
  hitSet.add(payload);

  carriers.push({
    payload,
    vel: {
      x: nx * config.speed,
      y: ny * config.speed,
      z: nz * config.speed,
    },
    config,
    hitSet,
  });
}

/**
 * Update all active carriers. Called each frame from game loop.
 * Iterates in reverse for safe removal.
 */
export function updateCarriers(dt: number, gameState: any): void {
  for (let i = carriers.length - 1; i >= 0; i--) {
    const carrier = carriers[i];
    const { payload, vel, config, hitSet } = carrier;

    // 1. Apply gravity
    vel.y -= GRAVITY * config.gravityMult * dt;

    // 2. Move payload
    payload.pos.x += vel.x * dt;
    payload.pos.y += vel.y * dt;
    payload.pos.z += vel.z * dt;

    // 3. Sync mesh
    if (payload.mesh && payload.mesh.position) {
      payload.mesh.position.set(payload.pos.x, payload.pos.y, payload.pos.z);
    }

    // 4. Through-hit check
    if (gameState.enemies) {
      for (let j = 0; j < gameState.enemies.length; j++) {
        const enemy = gameState.enemies[j];

        // Skip if already hit, dead, or in pit
        if (hitSet.has(enemy)) continue;
        if (enemy.health <= 0) continue;
        if (enemy.fellInPit) continue;

        // 3D distance check
        const dx = enemy.pos.x - payload.pos.x;
        const dy = enemy.pos.y - payload.pos.y;
        const dz = enemy.pos.z - payload.pos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < THROUGH_HIT_RADIUS) {
          // Deal through damage
          enemy.health -= config.throughDamage;
          enemy.flashTimer = 100;

          // Apply XZ knockback
          const xzDist = Math.sqrt(dx * dx + dz * dz) || 0.1;
          enemy.vel.x += (dx / xzDist) * config.throughKnockback;
          enemy.vel.z += (dz / xzDist) * config.throughKnockback;

          // Add to hitSet (no double-hits)
          hitSet.add(enemy);

          // Emit event
          emit({
            type: 'spikeThrough',
            enemy,
            damage: config.throughDamage,
            position: { x: enemy.pos.x, z: enemy.pos.z },
          });

          // Damage number
          spawnDamageNumber(enemy.pos.x, enemy.pos.z, config.throughDamage, '#ff8844');
        }
      }
    }

    // 5. Ground check
    const groundY = getGroundHeight(payload.pos.x, payload.pos.z);
    if (payload.pos.y <= groundY) {
      // Clamp to ground
      payload.pos.y = groundY;

      // AoE impact damage to nearby enemies (excluding payload)
      if (gameState.enemies) {
        for (let j = 0; j < gameState.enemies.length; j++) {
          const enemy = gameState.enemies[j];
          if (enemy === payload) continue;
          if (enemy.health <= 0) continue;
          if (enemy.fellInPit) continue;

          const dx = enemy.pos.x - payload.pos.x;
          const dz = enemy.pos.z - payload.pos.z;
          const distSq = dx * dx + dz * dz;

          if (distSq < config.impactRadius * config.impactRadius) {
            enemy.health -= config.impactDamage;
            enemy.flashTimer = 100;

            const dist = Math.sqrt(distSq) || 0.1;
            enemy.vel.x += (dx / dist) * config.impactKnockback;
            enemy.vel.z += (dz / dist) * config.impactKnockback;
          }
        }
      }

      // Stop payload velocity
      payload.vel.x = 0;
      payload.vel.y = 0;
      payload.vel.z = 0;

      // Sync mesh to final position
      if (payload.mesh && payload.mesh.position) {
        payload.mesh.position.set(payload.pos.x, payload.pos.y, payload.pos.z);
      }

      // Screen shake
      screenShake(config.impactShake);

      // Emit impact event
      emit({
        type: 'spikeImpact',
        position: { x: payload.pos.x, z: payload.pos.z },
        damage: config.impactDamage,
        radius: config.impactRadius,
      });

      // Damage number
      spawnDamageNumber(payload.pos.x, payload.pos.z, 'IMPACT!', '#ff4444');

      // Remove carrier
      carriers.splice(i, 1);
    }
  }
}

/**
 * Get all active carriers (for inspection/debugging).
 */
export function getActiveCarriers(): readonly Carrier[] {
  return carriers;
}

/**
 * Clear all carriers (for game reset).
 */
export function clearCarriers(): void {
  carriers.length = 0;
}
