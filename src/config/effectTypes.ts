import { ModifierAggregationConfig } from '../types/index';

export const EFFECT_TYPES: Record<string, any> = {
  'ice': {
    name: 'Ice',
    description: 'Slippery surface that increases movement speed and knockback',
    modifiers: { speedMult: 2.0, knockbackMult: 2.0 },
    stacking: { maxStacks: 1, rule: 'multiplicative' },
    duration: 2000,
    periodic: null,
    targets: { player: true, enemies: true, tags: [] },
    visual: {
      zone: { color: 0x80E0FF, opacity: 0.5, fadeTime: 500 },
      entity: { tint: 0x80E0FF, tintIntensity: 0.3, icon: 'ice' },
    },
    persistsOnDeath: true,
  },
  'ice.minor': {
    parent: 'ice',
    name: 'Minor Ice',
    description: 'Weak ice patch with reduced effect',
    modifiers: { speedMult: 1.5, knockbackMult: 1.5 },
    duration: 1500,
  },
  'ice.major': {
    parent: 'ice',
    name: 'Major Ice',
    description: 'Powerful ice field with enhanced effect',
    modifiers: { speedMult: 3.0, knockbackMult: 3.0 },
    duration: 3000,
    stacking: { maxStacks: 2, rule: 'multiplicative' },
  },
  'fire': {
    name: 'Fire',
    description: 'Burning damage over time',
    modifiers: {},
    stacking: { maxStacks: 3, rule: 'additive' },
    duration: 3000,
    periodic: { interval: 500, damage: 5, heal: 0, applyOnEnter: true },
    targets: { player: true, enemies: true, tags: [] },
    visual: {
      zone: { color: 0xFF4400, opacity: 0.4, fadeTime: 300 },
      entity: { tint: 0xFF4400, tintIntensity: 0.4, icon: 'fire' },
    },
    persistsOnDeath: false,
  },
  'fire.minor': {
    parent: 'fire',
    name: 'Minor Fire',
    description: 'Small flames with light damage',
    periodic: { interval: 500, damage: 3, heal: 0, applyOnEnter: true },
    duration: 2000,
  },
  'fire.major': {
    parent: 'fire',
    name: 'Major Fire',
    description: 'Intense flames with heavy damage',
    periodic: { interval: 500, damage: 10, heal: 0, applyOnEnter: true },
    duration: 5000,
    stacking: { maxStacks: 5, rule: 'additive' },
  },
  'slow': {
    name: 'Slowed',
    description: 'Reduced movement speed',
    modifiers: { speedMult: 0.5 },
    stacking: { maxStacks: 1, rule: 'lowest' },
    duration: 1000,
    periodic: null,
    targets: { player: true, enemies: true, tags: [] },
    visual: {
      zone: null,
      entity: { tint: 0x8844AA, tintIntensity: 0.3, icon: 'slow' },
    },
    persistsOnDeath: false,
  },
  'slow.minor': {
    parent: 'slow',
    name: 'Minor Slow',
    modifiers: { speedMult: 0.7 },
    duration: 800,
  },
  'slow.major': {
    parent: 'slow',
    name: 'Major Slow',
    modifiers: { speedMult: 0.3 },
    duration: 2000,
  },
  'stun': {
    name: 'Stunned',
    description: 'Cannot move or act',
    modifiers: { speedMult: 0, canAct: false },
    stacking: { maxStacks: 1, rule: 'longest' },
    duration: 500,
    periodic: null,
    targets: { player: false, enemies: true, tags: [] },
    visual: {
      zone: null,
      entity: { tint: 0xFFFF00, tintIntensity: 0.5, icon: 'stun' },
    },
    persistsOnDeath: false,
  },
  'stun.short': { parent: 'stun', name: 'Brief Stun', duration: 300 },
  'stun.long': { parent: 'stun', name: 'Long Stun', duration: 1500 },
  'poison': {
    name: 'Poison',
    description: 'Toxic damage over time that stacks',
    modifiers: {},
    stacking: { maxStacks: 5, rule: 'additive' },
    duration: 4000,
    periodic: { interval: 1000, damage: 3, heal: 0, applyOnEnter: false },
    targets: { player: true, enemies: true, tags: [] },
    visual: {
      zone: { color: 0x44FF44, opacity: 0.35, fadeTime: 500 },
      entity: { tint: 0x44FF44, tintIntensity: 0.35, icon: 'poison' },
    },
    persistsOnDeath: true,
  },
  'haste': {
    name: 'Haste',
    description: 'Increased movement speed',
    modifiers: { speedMult: 1.5 },
    stacking: { maxStacks: 1, rule: 'highest' },
    duration: 3000,
    periodic: null,
    targets: { player: true, enemies: false },
    visual: {
      zone: { color: 0x44FFFF, opacity: 0.3, fadeTime: 300 },
      entity: { tint: 0x44FFFF, tintIntensity: 0.25, icon: 'haste' },
    },
    persistsOnDeath: false,
  },
  'regen': {
    name: 'Regeneration',
    description: 'Healing over time',
    modifiers: {},
    stacking: { maxStacks: 3, rule: 'additive' },
    duration: 5000,
    periodic: { interval: 500, damage: 0, heal: 2, applyOnEnter: true },
    targets: { player: true, enemies: false },
    visual: {
      zone: { color: 0x44FF88, opacity: 0.3, fadeTime: 500 },
      entity: { tint: 0x44FF88, tintIntensity: 0.3, icon: 'regen' },
    },
    persistsOnDeath: false,
  },
  'silence': {
    name: 'Silenced',
    description: 'Cannot use abilities',
    modifiers: { canUseAbilities: false },
    stacking: { maxStacks: 1, rule: 'longest' },
    duration: 2000,
    periodic: null,
    targets: { player: true, enemies: true, tags: [] },
    visual: {
      zone: null,
      entity: { tint: 0x884488, tintIntensity: 0.4, icon: 'silence' },
    },
    persistsOnDeath: false,
  },
};

export const MODIFIER_AGGREGATION: Record<string, ModifierAggregationConfig> = {
  speedMult: { default: 1.0, aggregation: 'multiplicative', min: 0, max: 10.0 },
  knockbackMult: { default: 1.0, aggregation: 'multiplicative', min: 0, max: 10.0 },
  canAct: { default: true, aggregation: 'lastWins' },
  canUseAbilities: { default: true, aggregation: 'lastWins' },
  damageBonus: { default: 0, aggregation: 'additive', min: -100, max: 1000 },
  damagePerSec: { default: 0, aggregation: 'additive', min: 0, max: 1000 },
  healPerSec: { default: 0, aggregation: 'additive', min: 0, max: 1000 },
};

export function resolveEffectType(typeId: string): any | null {
  const type = EFFECT_TYPES[typeId];
  if (!type) {
    console.warn(`Unknown effect type: ${typeId}`);
    return null;
  }

  if (!type.parent) {
    return { ...type, id: typeId };
  }

  const parentResolved = resolveEffectType(type.parent);
  if (!parentResolved) {
    return { ...type, id: typeId };
  }

  return deepMerge(parentResolved, { ...type, id: typeId });
}

export function effectTypeMatches(typeId: string, query: string): boolean {
  if (typeId === query) return true;
  if (typeId.startsWith(query + '.')) return true;
  return false;
}

export function getMatchingEffectTypes(query: string): string[] {
  return Object.keys(EFFECT_TYPES).filter(typeId => effectTypeMatches(typeId, query));
}

function deepMerge(target: any, source: any): any {
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
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}
