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

// Launch verb config — E while grounded near an enemy
export const LAUNCH = {
  range: 3.0,             // max range to find a target
  launchVelocity: 15,     // upward velocity given to enemy
  cooldown: 600,          // ms cooldown between launches
  damage: 5,              // small chip damage on launch
  selfJumpVelocity: 10,   // player also hops up to follow
};
