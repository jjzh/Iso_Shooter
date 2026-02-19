// ═══════════════════════════════════════════════════════════════════════════
// VECTOR & POSITION
// ═══════════════════════════════════════════════════════════════════════════

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Position extends Vector3 {}

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════════════════════════════════════

export type PlayerProfile = 'base' | 'assassin' | 'rule-bending' | 'vertical';

// ═══════════════════════════════════════════════════════════════════════════
// MODIFIERS
// ═══════════════════════════════════════════════════════════════════════════

export interface ModifierSet {
  speedMult: number;
  knockbackMult: number;
  canAct: boolean;
  canUseAbilities: boolean;
  damageBonus: number;
  damagePerSec: number;
  healPerSec: number;
  [key: string]: number | boolean;
}

export type ModifierKey = keyof ModifierSet;

export type AggregationRule = 'multiplicative' | 'additive' | 'lastWins' | 'lowest' | 'highest';

export interface ModifierAggregationConfig {
  default: number | boolean;
  aggregation: AggregationRule;
  min?: number;
  max?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// EFFECT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type StackingRule = 'replace' | 'multiplicative' | 'additive' | 'longest' | 'lowest' | 'highest';

export interface StackingConfig {
  maxStacks: number;
  rule: StackingRule;
}

export interface PeriodicConfig {
  interval: number;
  damage: number;
  heal: number;
  applyOnEnter: boolean;
}

export interface EffectVisualConfig {
  zone: {
    color: number;
    opacity: number;
    fadeTime: number;
  } | null;
  entity: {
    tint: number;
    tintIntensity: number;
    icon: string;
  } | null;
}

export interface EffectTargets {
  player: boolean;
  enemies: boolean;
  tags?: string[];
}

export interface EffectTypeDefinition {
  name: string;
  description?: string;
  parent?: string;
  modifiers: Partial<ModifierSet>;
  stacking: StackingConfig;
  duration: number;
  periodic: PeriodicConfig | null;
  targets: EffectTargets;
  visual: EffectVisualConfig;
  persistsOnDeath: boolean;
}

export interface ResolvedEffectType extends EffectTypeDefinition {
  id: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// EFFECT INSTANCES
// ═══════════════════════════════════════════════════════════════════════════

export interface EffectInstance {
  id: number;
  typeId: string;
  type: ResolvedEffectType;
  duration: number;
  elapsed: number;
  periodicTimer: number;
  stackCount: number;
  maxStacks: number;
  stackRule: StackingRule;
  modifiers: Partial<ModifierSet>;
  periodic: PeriodicConfig | null;
  source: Entity | null;
  zone: EffectZone | null;
  appliedAt: number;
  lastRefreshedAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTITY EFFECTS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export interface EntityEffectsComponent {
  active: EffectInstance[];
  immunities: string[];
  modifiersCache: ModifierSet | null;
  modifiersOrder: number[];
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTITIES
// ═══════════════════════════════════════════════════════════════════════════

export interface Entity {
  pos: Vector3;
  health: number;
  maxHealth?: number;
  isPlayer?: boolean;
  effects?: EntityEffectsComponent;
  mesh?: any; // THREE.Group
  config?: EnemyConfig;
  gameState?: GameState;
}

export interface Enemy extends Entity {
  config: EnemyConfig;
  mesh: any; // THREE.Group
  bodyMesh: any; // THREE.Mesh
  headMesh?: any; // THREE.Mesh
  type: string;
  behavior: string;
  lastAttackTime: number;
  flashTimer: number;
  stunTimer: number;
  slowTimer: number;
  slowMult: number;
  knockbackResist: number;
  isCharging: boolean;
  chargeTimer: number;
  chargeCooldown: number;
  chargeDir: any; // THREE.Vector3
  shieldHealth: number;
  shieldActive: boolean;
  shieldMesh: any;
  sniperPhase: string;
  sniperTimer: number;
  sniperAimAngle: number;
  sniperAimCenter: { x: number; z: number };
  mortarPhase: string;
  mortarTimer: number;
  mortarTarget: { x: number; z: number };
  mortarArcLine: any;
  mortarGroundCircle: any;
  vel: { x: number; z: number };  // knockback velocity (physics system)
  wasDeflected: boolean;
  fellInPit: boolean;
  isLeaping: boolean;
  leapElapsed: number;
  leapDuration: number;
  leapStartX: number;
  leapStartZ: number;
  leapTargetX: number;
  leapTargetZ: number;
  leapArcHeight: number;
  leapCooldown: number;
  pitEdgeTimer: number;
  deathTimer?: number;
  deathTelegraph?: any;
}

export interface SizeConfig {
  radius: number;
  height: number;
}

export interface DropsConfig {
  currency: { min: number; max: number };
  healthChance: number;
}

export interface EnemyConfig {
  name: string;
  color: number;
  emissive: number;
  health: number;
  speed: number;
  damage: number;
  attackRange: number;
  attackRate: number;
  knockbackResist: number;
  mass?: number;            // physics mass (default 1.0) — heavier enemies resist momentum transfer
  behavior: string;
  size: SizeConfig;
  drops: DropsConfig;
  immunities?: string[];
  rush?: { stopDistance: number };
  kite?: { preferredRangeMult: number; retreatBuffer: number; advanceBuffer: number };
  sniper?: {
    telegraphDuration: number;
    shotWidth: number;
    shotLength: number;
    damage: number;
    color: number;
    lingerDuration: number;
    slowDuration: number;
    slowMult: number;
  };
  mortar?: {
    aimDuration: number;
    projectileSpeed: number;
    arcHeight: number;
    blastRadius: number;
    damage: number;
    color: number;
    inaccuracy: number;
    slowDuration: number;
    slowMult: number;
    explosionDuration: number;
    circleStartScale: number;
    circleScaleTime: number;
    icePatch?: {
      enabled: boolean;
      duration: number;
      color: number;
      speedMult: number;
      knockbackMult: number;
      affectsPlayer: boolean;
      affectsEnemies: boolean;
    };
  };
  tank?: {
    chargeSpeedMult: number;
    chargeDuration: number;
    chargeCooldownMin: number;
    chargeCooldownMax: number;
    chargeMinDist: number;
    chargeMaxDist: number;
    chargeDamageMult: number;
    telegraphDuration: number;
  };
  shield?: {
    maxHealth: number;
    stunRadius: number;
    stunDuration: number;
    breakRingDuration: number;
    color: number;
    emissive: number;
    opacity: number;
  };
  deathExplosion?: {
    radius: number;
    damage: number;
    color: number;
    ringDuration: number;
    stunDuration: number;
    telegraphDuration: number;
  };
  melee?: {
    telegraphDuration: number;
    attackDuration: number;
    recoveryDuration: number;
    lungeDistance?: number;
    damage: number;
    hitArc: number;
    hitRange: number;
  };
  pitLeap?: {
    edgeTimeRequired: number;
    leapSpeed: number;
    arcHeight: number;
    cooldown: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EFFECT ZONES
// ═══════════════════════════════════════════════════════════════════════════

export type ZoneShape =
  | { type: 'sphere'; radius: number }
  | { type: 'cube'; size: number }
  | { type: 'box'; width: number; height: number; depth: number; rotation?: number }
  | { type: 'cylinder'; radius: number; height: number }
  | { type: 'cone'; radius: number; height: number; angle: number; direction: number }
  | { type: 'torus'; majorRadius: number; minorRadius: number }
  | { type: 'halfSphere'; radius: number; upper: boolean };

export interface ZoneEvolution {
  type: 'expand' | 'shrink' | 'pulse';
  rate: number;
  min?: number;
  max?: number;
}

export interface EffectZone {
  id: number;
  effectTypeId: string;
  effectOverrides?: Partial<EffectInstance>;
  position: Vector3;
  shape: ZoneShape;
  attachedTo: Entity | null;
  attachOffset: Vector3;
  evolution: ZoneEvolution | null;
  duration: number;
  elapsed: number;
  persistsOnDeath: boolean;
  source: Entity | null;
  mesh: any; // THREE.Object3D | null
  entitiesInside: Set<Entity>;
  reapplyInterval: number;
  reapplyTimers: Map<Entity, number>;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export interface PlayerConfig {
  maxHealth: number;
  speed: number;
  fireRate: number;
  projectile: {
    speed: number;
    damage: number;
    color: number;
    size: number;
  };
  size: SizeConfig;
}

// ═══════════════════════════════════════════════════════════════════════════
// ABILITIES
// ═══════════════════════════════════════════════════════════════════════════

export interface DashAbilityConfig {
  name: string;
  key: string;
  cooldown: number;
  duration: number;
  distance: number;
  curve: string;
  invincible: boolean;
  iFrameStart: number;
  iFrameEnd: number;
  directionSource: string;
  afterimageCount: number;
  afterimageFadeDuration: number;
  ghostColor: number;
  trailColor: number;
  screenShakeOnStart: number;
  canShootDuring: boolean;
  canAbilityCancel: boolean;
  endLag: number;
  description: string;
}

export interface UltimateAbilityConfig {
  name: string;
  key: string;
  cooldown: number;
  chargeTimeMs: number;
  minLength: number;
  maxLength: number;
  width: number;
  minKnockback: number;
  maxKnockback: number;
  color: number;
  telegraphOpacity: number;
  chargeMoveSpeedMult: number;
  description: string;
}

export interface AbilitiesConfig {
  dash: DashAbilityConfig;
  ultimate: UltimateAbilityConfig;
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface AbilityState {
  cooldownRemaining: number;
  active?: boolean;
  activeRemaining?: number;
  charging?: boolean;
  chargeT?: number;
}

export interface GameState {
  phase: 'waiting' | 'playing' | 'gameOver' | 'editorPaused';
  playerHealth: number;
  playerMaxHealth: number;
  currency: number;
  currentWave: number;
  enemies: Enemy[];
  abilities: {
    dash: AbilityState;
    ultimate: AbilityState;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// WAVES
// ═══════════════════════════════════════════════════════════════════════════

export interface SpawnEntry {
  type: string;
  x: number;
  z: number;
}

export interface WaveGroup {
  id: string;
  triggerDelay: number;
  telegraphDuration: number;
  stagger: number;
  spawns: SpawnEntry[];
}

export interface WaveDefinition {
  wave: number;
  message: string;
  groups: WaveGroup[];
}

// ═══════════════════════════════════════════════════════════════════════════
// INCREMENTAL SPAWNS (replaces waves for room manager)
// ═══════════════════════════════════════════════════════════════════════════

export type SpawnZone = 'ahead' | 'sides' | 'far' | 'behind';

export interface SpawnPack {
  enemies: { type: string }[];   // 2-3 enemies per pack
  spawnZone: SpawnZone;          // where to spawn relative to player
}

export interface RoomSpawnBudget {
  packs: SpawnPack[];            // ordered list of packs to dispatch
  maxConcurrent: number;         // max alive enemies at once
  telegraphDuration: number;     // ms for spawn telegraph per pack
}

// ═══════════════════════════════════════════════════════════════════════════
// ARENA
// ═══════════════════════════════════════════════════════════════════════════

export interface Obstacle {
  x: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

export interface Pit {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// INPUT
// ═══════════════════════════════════════════════════════════════════════════

export interface InputState {
  moveX: number;
  moveZ: number;
  aimWorldPos: Vector3;
  mouseNDC: { x: number; y: number };
  dash: boolean;
  attack: boolean;
  ultimate: boolean;
  ultimateHeld: boolean;
  toggleEditor: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// BOSS
// ═══════════════════════════════════════════════════════════════════════════

export interface BossPhase {
  healthThreshold: number;
  behavior: string;
  attackRate: number;
  speed?: number;
  spawnMinions?: { type: string; count: number };
}

export interface BossConfig {
  name: string;
  health: number;
  speed: number;
  damage: number;
  size: SizeConfig;
  color: number;
  emissive: number;
  phases: BossPhase[];
}

// ═══════════════════════════════════════════════════════════════════════════
// PUSH EVENT (from player charge push)
// ═══════════════════════════════════════════════════════════════════════════

export interface PushEvent {
  x: number;
  z: number;
  width: number;
  length: number;
  rotation: number;
  force: number;
  dirX: number;
  dirZ: number;
}
