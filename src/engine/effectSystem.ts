/**
 * Effect System — Core effect logic for the game
 *
 * Handles applying effects to entities, computing aggregated modifiers,
 * tracking effect sources, immunities, and periodic ticks.
 *
 * Inspired by Unreal's Gameplay Ability System but lightweight for browser.
 */

import {
  EFFECT_TYPES,
  MODIFIER_AGGREGATION,
  resolveEffectType,
  effectTypeMatches,
} from '../config/effectTypes';
import { spawnDamageNumber } from '../ui/damageNumbers';

// ═══════════════════════════════════════════════════════════════════════════
// EFFECT INSTANCE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

let nextEffectId = 1;

/**
 * Create an effect instance from a type definition.
 */
export function createEffect(typeId: string, overrides: any = {}) {
  const resolved = resolveEffectType(typeId);
  if (!resolved) return null;

  const instance = {
    id: nextEffectId++,
    typeId,
    type: resolved,

    // Timing
    duration: overrides.duration ?? resolved.duration,
    elapsed: 0,
    periodicTimer: 0,

    // Stack tracking
    stackCount: 1,
    maxStacks: resolved.stacking?.maxStacks ?? 1,
    stackRule: resolved.stacking?.rule ?? 'replace',

    // Modifiers (can be overridden per-instance)
    modifiers: { ...resolved.modifiers, ...overrides.modifiers },

    // Periodic (can be overridden)
    periodic: overrides.periodic ?? resolved.periodic,

    // Source tracking
    source: overrides.source ?? null,  // Entity that created this
    zone: overrides.zone ?? null,      // Zone that applied this (if any)

    // Timestamps
    appliedAt: performance.now(),
    lastRefreshedAt: performance.now(),
  };

  return instance;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTITY EFFECT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize effect tracking on an entity.
 * Call this when spawning enemies or setting up the player.
 */
export function initEntityEffects(entity: any, immunities: string[] = []) {
  entity.effects = {
    active: [],           // Currently applied effect instances
    immunities: [...immunities],
    modifiersCache: null, // Cached aggregated modifiers (invalidated on change)
    modifiersOrder: [],   // Order of modifier application (for lastWins)
  };
}

/**
 * Check if an entity has the effect component initialized.
 */
export function hasEffectComponent(entity: any) {
  return entity && entity.effects && Array.isArray(entity.effects.active);
}

// ═══════════════════════════════════════════════════════════════════════════
// IMMUNITY SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if an entity is immune to an effect type.
 * Immunity to 'fire' also blocks 'fire.minor', 'fire.major', etc.
 */
export function isImmuneTo(entity: any, typeId: string) {
  if (!hasEffectComponent(entity)) return false;

  for (const immunity of entity.effects.immunities) {
    if (effectTypeMatches(typeId, immunity)) {
      return true;
    }
  }
  return false;
}

/**
 * Grant immunity to an effect type.
 * If the entity currently has effects of this type, they are removed.
 */
export function grantImmunity(entity: any, typeId: string, duration: number | null = null) {
  if (!hasEffectComponent(entity)) return;

  // Add immunity
  if (!entity.effects.immunities.includes(typeId)) {
    entity.effects.immunities.push(typeId);
  }

  // Remove any existing effects of this type
  removeEffectsByType(entity, typeId);

  // If temporary, schedule removal
  if (duration !== null) {
    setTimeout(() => {
      revokeImmunity(entity, typeId);
    }, duration);
  }
}

/**
 * Revoke immunity to an effect type.
 */
export function revokeImmunity(entity: any, typeId: string) {
  if (!hasEffectComponent(entity)) return;

  const idx = entity.effects.immunities.indexOf(typeId);
  if (idx !== -1) {
    entity.effects.immunities.splice(idx, 1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// APPLYING EFFECTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply an effect to an entity.
 * Handles immunity checks, stacking rules, and refresh logic.
 */
export function applyEffect(entity: any, typeId: string, opts: any = {}) {
  if (!hasEffectComponent(entity)) {
    initEntityEffects(entity);
  }

  // Immunity check
  if (isImmuneTo(entity, typeId)) {
    return null;
  }

  // Target filter check
  const resolved = resolveEffectType(typeId);
  if (!resolved) return null;

  const isPlayer = entity.isPlayer === true;
  if (isPlayer && resolved.targets && !resolved.targets.player) {
    return null;
  }
  if (!isPlayer && resolved.targets && !resolved.targets.enemies) {
    return null;
  }

  // Check for existing effect of same type
  const existing = entity.effects.active.find((e: any) => e.typeId === typeId);

  if (existing) {
    return handleStacking(entity, existing, typeId, opts);
  }

  // Create new effect instance
  const effect = createEffect(typeId, opts);
  if (!effect) return null;

  entity.effects.active.push(effect);
  entity.effects.modifiersOrder.push(effect.id);
  invalidateModifiersCache(entity);

  // Apply first periodic tick if configured
  if (effect.periodic?.applyOnEnter) {
    applyPeriodicTick(entity, effect);
  }

  return effect;
}

/**
 * Handle stacking when applying an effect that already exists.
 */
function handleStacking(entity: any, existing: any, typeId: string, opts: any) {
  const resolved = resolveEffectType(typeId);
  const rule = resolved.stacking?.rule ?? 'replace';
  const maxStacks = resolved.stacking?.maxStacks ?? 1;

  switch (rule) {
    case 'replace':
      // Replace existing with new
      existing.duration = opts.duration ?? resolved.duration;
      existing.elapsed = 0;
      existing.modifiers = { ...resolved.modifiers, ...opts.modifiers };
      existing.lastRefreshedAt = performance.now();
      break;

    case 'multiplicative':
    case 'additive':
      // Add stack if under max
      if (existing.stackCount < maxStacks) {
        existing.stackCount++;
      }
      // Refresh duration
      existing.elapsed = 0;
      existing.lastRefreshedAt = performance.now();
      break;

    case 'longest': {
      // Only refresh if new duration is longer than remaining
      const remaining = existing.duration - existing.elapsed;
      const newDuration = opts.duration ?? resolved.duration;
      if (newDuration > remaining) {
        existing.duration = newDuration;
        existing.elapsed = 0;
        existing.lastRefreshedAt = performance.now();
      }
      break;
    }

    case 'lowest':
    case 'highest': {
      // Compare modifier values and keep extreme
      const newModifiers = { ...resolved.modifiers, ...opts.modifiers };
      for (const key of Object.keys(newModifiers)) {
        if (existing.modifiers[key] !== undefined) {
          if (rule === 'lowest') {
            existing.modifiers[key] = Math.min(existing.modifiers[key], newModifiers[key]);
          } else {
            existing.modifiers[key] = Math.max(existing.modifiers[key], newModifiers[key]);
          }
        }
      }
      // Refresh duration
      existing.elapsed = 0;
      existing.lastRefreshedAt = performance.now();
      break;
    }
  }

  // Update order (move to end for lastWins)
  const orderIdx = entity.effects.modifiersOrder.indexOf(existing.id);
  if (orderIdx !== -1) {
    entity.effects.modifiersOrder.splice(orderIdx, 1);
    entity.effects.modifiersOrder.push(existing.id);
  }

  invalidateModifiersCache(entity);
  return existing;
}

// ═══════════════════════════════════════════════════════════════════════════
// REMOVING EFFECTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Remove a specific effect instance from an entity.
 */
export function removeEffect(entity: any, effect: any) {
  if (!hasEffectComponent(entity)) return;

  const idx = entity.effects.active.indexOf(effect);
  if (idx !== -1) {
    entity.effects.active.splice(idx, 1);

    const orderIdx = entity.effects.modifiersOrder.indexOf(effect.id);
    if (orderIdx !== -1) {
      entity.effects.modifiersOrder.splice(orderIdx, 1);
    }

    invalidateModifiersCache(entity);
  }
}

/**
 * Remove all effects of a specific type from an entity.
 */
export function removeEffectsByType(entity: any, typeId: string) {
  if (!hasEffectComponent(entity)) return;

  for (let i = entity.effects.active.length - 1; i >= 0; i--) {
    const effect = entity.effects.active[i];
    if (effectTypeMatches(effect.typeId, typeId)) {
      entity.effects.active.splice(i, 1);

      const orderIdx = entity.effects.modifiersOrder.indexOf(effect.id);
      if (orderIdx !== -1) {
        entity.effects.modifiersOrder.splice(orderIdx, 1);
      }
    }
  }

  invalidateModifiersCache(entity);
}

/**
 * Remove all effects from a specific source.
 */
export function removeEffectsBySource(entity: any, source: any) {
  if (!hasEffectComponent(entity)) return;

  for (let i = entity.effects.active.length - 1; i >= 0; i--) {
    const effect = entity.effects.active[i];
    if (effect.source === source) {
      entity.effects.active.splice(i, 1);

      const orderIdx = entity.effects.modifiersOrder.indexOf(effect.id);
      if (orderIdx !== -1) {
        entity.effects.modifiersOrder.splice(orderIdx, 1);
      }
    }
  }

  invalidateModifiersCache(entity);
}

/**
 * Remove all effects from a specific zone.
 */
export function removeEffectsByZone(entity: any, zone: any) {
  if (!hasEffectComponent(entity)) return;

  for (let i = entity.effects.active.length - 1; i >= 0; i--) {
    const effect = entity.effects.active[i];
    if (effect.zone === zone) {
      entity.effects.active.splice(i, 1);

      const orderIdx = entity.effects.modifiersOrder.indexOf(effect.id);
      if (orderIdx !== -1) {
        entity.effects.modifiersOrder.splice(orderIdx, 1);
      }
    }
  }

  invalidateModifiersCache(entity);
}

/**
 * Clear all effects from an entity.
 */
export function clearAllEffects(entity: any) {
  if (!hasEffectComponent(entity)) return;

  entity.effects.active.length = 0;
  entity.effects.modifiersOrder.length = 0;
  invalidateModifiersCache(entity);
}

// ═══════════════════════════════════════════════════════════════════════════
// MODIFIER AGGREGATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Invalidate the cached modifiers for an entity.
 * Called when effects are added/removed/changed.
 */
function invalidateModifiersCache(entity: any) {
  if (entity.effects) {
    entity.effects.modifiersCache = null;
  }
}

/**
 * Get aggregated modifiers for an entity.
 * Combines all active effects according to aggregation rules.
 */
export function getModifiers(entity: any) {
  if (!hasEffectComponent(entity)) {
    return getDefaultModifiers();
  }

  // Return cached if valid
  if (entity.effects.modifiersCache) {
    return entity.effects.modifiersCache;
  }

  // Compute aggregated modifiers
  const result: any = getDefaultModifiers();
  const lastWinsValues: Record<string, any> = {}; // Track last value for lastWins aggregation

  // Process effects in application order
  const orderedEffects: any[] = [];
  for (const effectId of entity.effects.modifiersOrder) {
    const effect = entity.effects.active.find((e: any) => e.id === effectId);
    if (effect) orderedEffects.push(effect);
  }

  for (const effect of orderedEffects) {
    const stackMult = getStackMultiplier(effect);

    for (const [key, value] of Object.entries(effect.modifiers)) {
      const aggRule = (MODIFIER_AGGREGATION as any)[key];
      if (!aggRule) {
        // Unknown modifier — just use it directly
        result[key] = value;
        continue;
      }

      switch (aggRule.aggregation) {
        case 'multiplicative': {
          // Apply stack multiplier for multiplicative effects
          const multValue = 1 + ((value as number) - 1) * stackMult;
          result[key] *= multValue;
          break;
        }

        case 'additive':
          result[key] += (value as number) * stackMult;
          break;

        case 'lastWins':
          lastWinsValues[key] = value;
          break;

        case 'lowest':
          result[key] = Math.min(result[key], value as number);
          break;

        case 'highest':
          result[key] = Math.max(result[key], value as number);
          break;
      }
    }
  }

  // Apply lastWins values at the end
  for (const [key, value] of Object.entries(lastWinsValues)) {
    result[key] = value;
  }

  // Clamp to bounds
  for (const [key, value] of Object.entries(result)) {
    const aggRule = (MODIFIER_AGGREGATION as any)[key];
    if (aggRule) {
      if (aggRule.min !== undefined) result[key] = Math.max(result[key], aggRule.min);
      if (aggRule.max !== undefined) result[key] = Math.min(result[key], aggRule.max);
    }
  }

  // Cache result
  entity.effects.modifiersCache = result;
  return result;
}

/**
 * Get default modifier values.
 */
function getDefaultModifiers() {
  const result: Record<string, any> = {};
  for (const [key, rule] of Object.entries(MODIFIER_AGGREGATION as Record<string, any>)) {
    result[key] = rule.default;
  }
  return result;
}

/**
 * Calculate stack multiplier for an effect.
 * For multiplicative stacking: 2 stacks of 2x = 4x (2^2)
 * For additive stacking: 2 stacks of +5 = +10
 */
function getStackMultiplier(effect: any) {
  const rule = effect.stackRule;

  switch (rule) {
    case 'multiplicative':
      return effect.stackCount;  // Linear for the exponent
    case 'additive':
      return effect.stackCount;
    default:
      return 1;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EFFECT QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if an entity has an effect of a specific type.
 * 'fire' matches 'fire', 'fire.minor', 'fire.major'
 */
export function hasEffect(entity: any, typeId: string) {
  if (!hasEffectComponent(entity)) return false;

  return entity.effects.active.some((e: any) => effectTypeMatches(e.typeId, typeId));
}

/**
 * Get all active effects of a specific type.
 */
export function getEffectsOfType(entity: any, typeId: string) {
  if (!hasEffectComponent(entity)) return [];

  return entity.effects.active.filter((e: any) => effectTypeMatches(e.typeId, typeId));
}

/**
 * Get all effects applied by a specific source.
 */
export function getEffectsFromSource(entity: any, source: any) {
  if (!hasEffectComponent(entity)) return [];

  return entity.effects.active.filter((e: any) => e.source === source);
}

/**
 * Get all effects applied by a specific zone.
 */
export function getEffectsFromZone(entity: any, zone: any) {
  if (!hasEffectComponent(entity)) return [];

  return entity.effects.active.filter((e: any) => e.zone === zone);
}

// ═══════════════════════════════════════════════════════════════════════════
// EFFECT UPDATE LOOP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Update all effects on an entity.
 * Call this every frame for each entity.
 */
export function updateEntityEffects(entity: any, dt: number) {
  if (!hasEffectComponent(entity)) return;

  const dtMs = dt * 1000;
  let modifiersChanged = false;

  for (let i = entity.effects.active.length - 1; i >= 0; i--) {
    const effect = entity.effects.active[i];

    // Update elapsed time
    effect.elapsed += dtMs;

    // Handle periodic effects
    if (effect.periodic) {
      effect.periodicTimer += dtMs;

      while (effect.periodicTimer >= effect.periodic.interval) {
        effect.periodicTimer -= effect.periodic.interval;
        applyPeriodicTick(entity, effect);
      }
    }

    // Check expiration
    if (effect.elapsed >= effect.duration) {
      // Effect expired — remove it
      entity.effects.active.splice(i, 1);

      const orderIdx = entity.effects.modifiersOrder.indexOf(effect.id);
      if (orderIdx !== -1) {
        entity.effects.modifiersOrder.splice(orderIdx, 1);
      }

      modifiersChanged = true;
    }
  }

  if (modifiersChanged) {
    invalidateModifiersCache(entity);
  }
}

/**
 * Apply a periodic tick (damage/heal) from an effect.
 */
function applyPeriodicTick(entity: any, effect: any) {
  const periodic = effect.periodic;
  if (!periodic) return;

  // Apply damage
  if (periodic.damage > 0) {
    const damage = periodic.damage * effect.stackCount;

    if (entity.health !== undefined) {
      entity.health -= damage;

      // Spawn damage number
      if (entity.pos) {
        const color = effect.type?.visual?.entity?.tint
          ? '#' + effect.type.visual.entity.tint.toString(16).padStart(6, '0')
          : '#ff4400';
        spawnDamageNumber(entity.pos.x, entity.pos.z, damage, color);
      }
    }

    // For player (handled differently)
    if (entity.isPlayer && entity.gameState) {
      entity.gameState.playerHealth -= damage;
      if (entity.gameState.playerHealth <= 0) {
        entity.gameState.playerHealth = 0;
        entity.gameState.phase = 'gameOver';
      }
    }
  }

  // Apply heal
  if (periodic.heal > 0) {
    const heal = periodic.heal * effect.stackCount;

    if (entity.health !== undefined && entity.maxHealth !== undefined) {
      entity.health = Math.min(entity.health + heal, entity.maxHealth);

      if (entity.pos) {
        spawnDamageNumber(entity.pos.x, entity.pos.z, '+' + heal, '#44ff88');
      }
    }

    if (entity.isPlayer && entity.gameState) {
      const maxHealth = entity.maxHealth ?? 100;
      entity.gameState.playerHealth = Math.min(
        entity.gameState.playerHealth + heal,
        maxHealth
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE DEATH HANDLING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Handle a source entity dying.
 * Removes effects from all entities if persistsOnDeath is false.
 */
export function onSourceDeath(source: any, allEntities: any[]) {
  for (const entity of allEntities) {
    if (!hasEffectComponent(entity)) continue;

    for (let i = entity.effects.active.length - 1; i >= 0; i--) {
      const effect = entity.effects.active[i];

      if (effect.source === source && !effect.type.persistsOnDeath) {
        entity.effects.active.splice(i, 1);

        const orderIdx = entity.effects.modifiersOrder.indexOf(effect.id);
        if (orderIdx !== -1) {
          entity.effects.modifiersOrder.splice(orderIdx, 1);
        }
      }
    }

    invalidateModifiersCache(entity);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export { resolveEffectType, effectTypeMatches } from '../config/effectTypes';
