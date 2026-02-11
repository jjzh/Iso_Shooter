/**
 * Effect Type Definitions
 *
 * Defines all effect types in the game with their default properties.
 * Effects use hierarchical naming (e.g., 'fire.major') where children
 * inherit from parents and can override specific properties.
 *
 * Key concepts:
 * - Modifiers: Multipliers/values applied to entity attributes
 * - Stacking: How multiple instances of same effect combine
 * - Periodic: Damage/heal ticks while effect is active
 * - Visual: How the effect appears (zones and entity feedback)
 */

export const EFFECT_TYPES = {
  // ═══════════════════════════════════════════════════════════════════════════
  // ICE EFFECTS — Speed up movement and knockback
  // ═══════════════════════════════════════════════════════════════════════════
  'ice': {
    name: 'Ice',
    description: 'Slippery surface that increases movement speed and knockback',
    modifiers: {
      speedMult: 2.0,
      knockbackMult: 2.0,
    },
    stacking: {
      maxStacks: 1,
      rule: 'multiplicative',  // Multiple ice effects multiply together
    },
    duration: 2000,
    periodic: null,
    targets: {
      player: true,
      enemies: true,
      tags: [],
    },
    visual: {
      zone: {
        color: 0x80E0FF,
        opacity: 0.5,
        fadeTime: 500,
      },
      entity: {
        tint: 0x80E0FF,
        tintIntensity: 0.3,
        icon: 'ice',
      },
    },
    persistsOnDeath: true,  // Zone persists if source dies
  },

  'ice.minor': {
    parent: 'ice',
    name: 'Minor Ice',
    description: 'Weak ice patch with reduced effect',
    modifiers: {
      speedMult: 1.5,
      knockbackMult: 1.5,
    },
    duration: 1500,
  },

  'ice.major': {
    parent: 'ice',
    name: 'Major Ice',
    description: 'Powerful ice field with enhanced effect',
    modifiers: {
      speedMult: 3.0,
      knockbackMult: 3.0,
    },
    duration: 3000,
    stacking: {
      maxStacks: 2,
      rule: 'multiplicative',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FIRE EFFECTS — Damage over time
  // ═══════════════════════════════════════════════════════════════════════════
  'fire': {
    name: 'Fire',
    description: 'Burning damage over time',
    modifiers: {},
    stacking: {
      maxStacks: 3,
      rule: 'additive',  // Fire stacks add damage together
    },
    duration: 3000,
    periodic: {
      interval: 500,      // Tick every 0.5s
      damage: 5,
      heal: 0,
      applyOnEnter: true, // First tick immediately on application
    },
    targets: {
      player: true,
      enemies: true,
      tags: [],
    },
    visual: {
      zone: {
        color: 0xFF4400,
        opacity: 0.4,
        fadeTime: 300,
      },
      entity: {
        tint: 0xFF4400,
        tintIntensity: 0.4,
        icon: 'fire',
      },
    },
    persistsOnDeath: false,
  },

  'fire.minor': {
    parent: 'fire',
    name: 'Minor Fire',
    description: 'Small flames with light damage',
    periodic: {
      interval: 500,
      damage: 3,
      heal: 0,
      applyOnEnter: true,
    },
    duration: 2000,
  },

  'fire.major': {
    parent: 'fire',
    name: 'Major Fire',
    description: 'Intense flames with heavy damage',
    periodic: {
      interval: 500,
      damage: 10,
      heal: 0,
      applyOnEnter: true,
    },
    duration: 5000,
    stacking: {
      maxStacks: 5,
      rule: 'additive',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SLOW EFFECTS — Reduce movement speed
  // ═══════════════════════════════════════════════════════════════════════════
  'slow': {
    name: 'Slowed',
    description: 'Reduced movement speed',
    modifiers: {
      speedMult: 0.5,
    },
    stacking: {
      maxStacks: 1,
      rule: 'lowest',  // Multiple slows take the worst (lowest speedMult)
    },
    duration: 1000,
    periodic: null,
    targets: {
      player: true,
      enemies: true,
      tags: [],
    },
    visual: {
      zone: null,  // Slow typically applied directly, not via zone
      entity: {
        tint: 0x8844AA,
        tintIntensity: 0.3,
        icon: 'slow',
      },
    },
    persistsOnDeath: false,
  },

  'slow.minor': {
    parent: 'slow',
    name: 'Minor Slow',
    modifiers: {
      speedMult: 0.7,
    },
    duration: 800,
  },

  'slow.major': {
    parent: 'slow',
    name: 'Major Slow',
    modifiers: {
      speedMult: 0.3,
    },
    duration: 2000,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STUN EFFECTS — Complete movement/action stop
  // ═══════════════════════════════════════════════════════════════════════════
  'stun': {
    name: 'Stunned',
    description: 'Cannot move or act',
    modifiers: {
      speedMult: 0,
      canAct: false,
    },
    stacking: {
      maxStacks: 1,
      rule: 'longest',  // Multiple stuns extend to longest duration
    },
    duration: 500,
    periodic: null,
    targets: {
      player: false,  // Player typically can't be stunned (or has different handling)
      enemies: true,
      tags: [],
    },
    visual: {
      zone: null,
      entity: {
        tint: 0xFFFF00,
        tintIntensity: 0.5,
        icon: 'stun',
      },
    },
    persistsOnDeath: false,
  },

  'stun.short': {
    parent: 'stun',
    name: 'Brief Stun',
    duration: 300,
  },

  'stun.long': {
    parent: 'stun',
    name: 'Long Stun',
    duration: 1500,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // POISON EFFECTS — Damage over time (stacking)
  // ═══════════════════════════════════════════════════════════════════════════
  'poison': {
    name: 'Poison',
    description: 'Toxic damage over time that stacks',
    modifiers: {},
    stacking: {
      maxStacks: 5,
      rule: 'additive',
    },
    duration: 4000,
    periodic: {
      interval: 1000,
      damage: 3,
      heal: 0,
      applyOnEnter: false,  // First tick after interval
    },
    targets: {
      player: true,
      enemies: true,
      tags: [],
    },
    visual: {
      zone: {
        color: 0x44FF44,
        opacity: 0.35,
        fadeTime: 500,
      },
      entity: {
        tint: 0x44FF44,
        tintIntensity: 0.35,
        icon: 'poison',
      },
    },
    persistsOnDeath: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BUFF EFFECTS — Positive effects (healing, speed boost, etc.)
  // ═══════════════════════════════════════════════════════════════════════════
  'haste': {
    name: 'Haste',
    description: 'Increased movement speed',
    modifiers: {
      speedMult: 1.5,
    },
    stacking: {
      maxStacks: 1,
      rule: 'highest',
    },
    duration: 3000,
    periodic: null,
    targets: {
      player: true,
      enemies: false,
    },
    visual: {
      zone: {
        color: 0x44FFFF,
        opacity: 0.3,
        fadeTime: 300,
      },
      entity: {
        tint: 0x44FFFF,
        tintIntensity: 0.25,
        icon: 'haste',
      },
    },
    persistsOnDeath: false,
  },

  'regen': {
    name: 'Regeneration',
    description: 'Healing over time',
    modifiers: {},
    stacking: {
      maxStacks: 3,
      rule: 'additive',
    },
    duration: 5000,
    periodic: {
      interval: 500,
      damage: 0,
      heal: 2,
      applyOnEnter: true,
    },
    targets: {
      player: true,
      enemies: false,
    },
    visual: {
      zone: {
        color: 0x44FF88,
        opacity: 0.3,
        fadeTime: 500,
      },
      entity: {
        tint: 0x44FF88,
        tintIntensity: 0.3,
        icon: 'regen',
      },
    },
    persistsOnDeath: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SILENCE — Prevents abilities
  // ═══════════════════════════════════════════════════════════════════════════
  'silence': {
    name: 'Silenced',
    description: 'Cannot use abilities',
    modifiers: {
      canUseAbilities: false,
    },
    stacking: {
      maxStacks: 1,
      rule: 'longest',
    },
    duration: 2000,
    periodic: null,
    targets: {
      player: true,
      enemies: true,
      tags: [],
    },
    visual: {
      zone: null,
      entity: {
        tint: 0x884488,
        tintIntensity: 0.4,
        icon: 'silence',
      },
    },
    persistsOnDeath: false,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// MODIFIER AGGREGATION RULES
// ═══════════════════════════════════════════════════════════════════════════
// Defines how different modifier types combine when multiple effects are active

export const MODIFIER_AGGREGATION = {
  // Multiplicative modifiers (speed, knockback) — multiply all together
  speedMult: {
    default: 1.0,
    aggregation: 'multiplicative',
    min: 0,
    max: 10.0,
  },
  knockbackMult: {
    default: 1.0,
    aggregation: 'multiplicative',
    min: 0,
    max: 10.0,
  },

  // Boolean modifiers — last applied wins
  canAct: {
    default: true,
    aggregation: 'lastWins',
  },
  canUseAbilities: {
    default: true,
    aggregation: 'lastWins',
  },

  // Additive modifiers (damage bonuses, etc.)
  damageBonus: {
    default: 0,
    aggregation: 'additive',
    min: -100,
    max: 1000,
  },

  // Periodic effects — additive (multiple fire = more DPS)
  damagePerSec: {
    default: 0,
    aggregation: 'additive',
    min: 0,
    max: 1000,
  },
  healPerSec: {
    default: 0,
    aggregation: 'additive',
    min: 0,
    max: 1000,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// EFFECT TYPE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve an effect type by merging with parent chain.
 * @param {string} typeId - Effect type ID (e.g., 'fire.major')
 * @returns {Object} Fully resolved effect type with all inherited properties
 */
export function resolveEffectType(typeId) {
  const type = EFFECT_TYPES[typeId];
  if (!type) {
    console.warn(`Unknown effect type: ${typeId}`);
    return null;
  }

  // No parent — return as-is
  if (!type.parent) {
    return { ...type, id: typeId };
  }

  // Recursively resolve parent
  const parentResolved = resolveEffectType(type.parent);
  if (!parentResolved) {
    return { ...type, id: typeId };
  }

  // Deep merge: child overrides parent
  return deepMerge(parentResolved, { ...type, id: typeId });
}

/**
 * Check if an effect type matches a query (including parent matching).
 * E.g., 'fire.major' matches query 'fire'
 * @param {string} typeId - Effect type to check
 * @param {string} query - Query to match against
 * @returns {boolean} True if typeId matches query
 */
export function effectTypeMatches(typeId, query) {
  if (typeId === query) return true;

  // Check if query is a parent of typeId
  // 'fire.major' starts with 'fire.' — matches 'fire'
  if (typeId.startsWith(query + '.')) return true;

  return false;
}

/**
 * Get all effect types that match a query.
 * E.g., query 'fire' returns ['fire', 'fire.minor', 'fire.major']
 * @param {string} query - Query to match
 * @returns {string[]} Array of matching type IDs
 */
export function getMatchingEffectTypes(query) {
  return Object.keys(EFFECT_TYPES).filter(typeId => effectTypeMatches(typeId, query));
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Deep merge objects
// ═══════════════════════════════════════════════════════════════════════════

function deepMerge(target, source) {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (source[key] === undefined) continue;

    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] !== null &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      // Recursively merge objects
      result[key] = deepMerge(target[key], source[key]);
    } else {
      // Override with source value
      result[key] = source[key];
    }
  }

  return result;
}
