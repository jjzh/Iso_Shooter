import { PlayerConfig } from '../types/index';

export const PLAYER: PlayerConfig = {
  maxHealth: 100,
  speed: 5,
  fireRate: 410,
  projectile: { speed: 16, damage: 10, color: 0x44ff88, size: 0.2 },
  size: { radius: 0.35, height: 1.2 }
};

// Jump config — tunable via tuning panel
export const JUMP = {
  initialVelocity: 12,     // upward velocity on jump
  gravity: 25,              // player gravity (may differ from enemy gravity)
  airControlMult: 1.0,      // XZ speed multiplier while airborne
  landingLag: 50,           // ms of end-lag on landing
  coyoteTime: 80,           // ms of grace period after walking off ledge
};

// Melee combat config — tunable via tuning panel
export const MELEE = {
  damage: 10,
  range: 2.2,           // how far the swing reaches from player center
  arc: 2.4,             // radians (~137°) — generous cone
  cooldown: 380,         // ms between swings
  knockback: 1.5,        // units pushed on hit
  autoTargetRange: 3.0,  // radius to search for snap-targeting
  autoTargetArc: 2.8,    // radians (~160°) — wide search for auto-target
  screenShake: 1.5,      // shake intensity on hit
  hitPause: 40,          // ms of freeze-frame on hit (juice)
};

// Aerial strike config — LMB while airborne
export const AERIAL_STRIKE = {
  damage: 20,              // bonus damage (more than ground melee)
  range: 2.5,              // XZ range to find target
  slamVelocity: -18,       // downward velocity applied to enemy (negative = down)
  screenShake: 2.5,        // bigger shake than ground melee
  hitPause: 60,            // longer freeze-frame for impact
  cooldown: 300,           // ms between aerial strikes (shorter than ground melee)
};

// Grab and dunk config — E while airborne near airborne enemy
export const DUNK = {
  slamVelocity: -25,       // downward velocity for both player + enemy
  damage: 35,              // big damage on impact (the payoff)
  landingShake: 4.0,       // massive screen shake
  landingLag: 200,         // ms of end-lag
  aoeRadius: 1.5,          // splash damage radius on impact
  aoeDamage: 10,           // splash damage to other nearby enemies
  aoeKnockback: 10,        // knockback to nearby enemies
  targetRadius: 6.0,       // radius of landing target circle (world units)
  homing: 60,              // XZ homing speed toward target (units/sec) — high to compensate for arc ease-in
  grabPause: 60,           // ms freeze-frame on grab (punctuates the moment)
  grabShake: 1.5,          // screen shake on grab (smaller than landing shake)
  carryOffsetY: -0.4,      // enemy offset below player during slam fall
  carryOffsetZ: 0.35,      // enemy offset forward (toward landing) during slam fall
  // Float phase — zero-gravity hang time when player & enemy converge mid-air
  floatDuration: 600,      // ms of zero-gravity float (aim window before dunk)
  floatConvergeDist: 3.5,  // Y distance threshold to trigger float (enemy descends within this of player)
  floatEnemyOffsetY: 0.6,  // enemy hovers this far above player during float
  floatDriftSpeed: 3,      // XZ drift speed toward each other during float (units/sec)
  // Arc rise — upward boost after grab before slam descent
  arcRiseVelocity: 8,      // upward velocity at grab start (creates wind-up arc)
  arcXzFraction: 0.3,      // fraction of XZ distance to landing covered during rise phase
};

// Self-slam config — E while airborne, no enemy nearby
export const SELF_SLAM = {
  slamVelocity: -30,       // fast downward velocity
  landingShake: 3.0,       // screen shake on impact
  landingLag: 150,         // ms of end-lag (longer than normal landing)
  damageRadius: 2.5,       // AoE damage radius on impact
  damage: 15,              // AoE damage to nearby grounded enemies
  knockback: 8,            // knockback force on nearby enemies
};

// Launch verb config — E while grounded near an enemy
// Velocities are derived from JUMP.initialVelocity via multipliers so tuning jump auto-tunes launch.
export const LAUNCH = {
  range: 3.0,             // max range to find a target
  enemyVelMult: 1.3,      // enemy launch velocity = JUMP.initialVelocity × this (goes higher than player)
  playerVelMult: 1.15,    // player hop velocity = JUMP.initialVelocity × this (slightly higher to stay airborne for catch)
  cooldown: 600,          // ms cooldown between launches
  damage: 5,              // small chip damage on launch
  arcFraction: 0.7,       // fraction of XZ distance covered by arc velocity at launch
  // Rock pillar visual
  pillarDuration: 500,    // total animation time ms
  pillarRiseTime: 150,    // ms to emerge from ground
  pillarHoldTime: 100,    // ms at peak before sinking
  pillarHeight: 1.2,      // rise height above ground
  pillarRadius: 0.3,      // cylinder radius
  pillarColor: 0x887766,  // stone gray-brown
  // Launch telegraph
  windupDuration: 120,         // ms delay between E press and launch execution
  indicatorColor: 0xffaa00,    // ring + emissive color (matches "LAUNCH!" text)
  indicatorRingRadius: 0.6,    // outer radius of ground ring
  indicatorOpacity: 0.4,       // base ring opacity (passive mode)
};

// Float selector config — shared aerial verb selection window
export const FLOAT_SELECTOR = {
  holdThreshold: 180,        // ms to differentiate tap (spike) vs hold (dunk)
  chargeVisualDelay: 50,     // ms before charge ring starts filling
  floatDriftRate: 6,         // exponential decay rate for XZ drift during float
};

// Spike verb config — volleyball spike, enemy becomes projectile
export const SPIKE = {
  damage: 15,                // hit damage to spiked enemy on strike
  projectileSpeed: 25,       // enemy flight speed (units/sec)
  projectileAngle: 35,       // degrees below horizontal toward aim point
  throughDamage: 20,         // damage to enemies hit along flight path
  throughKnockback: 8,       // knockback to path-hit enemies
  impactDamage: 15,          // AoE damage on ground impact
  impactRadius: 2.0,         // AoE radius on ground impact
  impactKnockback: 10,       // knockback on ground impact
  windupDuration: 80,        // ms windup before strike
  hangDuration: 150,         // ms hang after strike (follow-through)
  fastFallGravityMult: 2.5,  // enhanced gravity during post-spike fall
  screenShake: 3.0,          // shake on spike strike
  impactShake: 2.5,          // shake on enemy ground impact
};
