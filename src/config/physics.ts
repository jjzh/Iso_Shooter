// Physics config — tunable via tuning panel
// Controls velocity-based knockback, wall slam damage, and bounce behavior

export const PHYSICS = {
  // Knockback velocity
  friction: 25,              // deceleration rate (units/s²) — higher = snappier stop
  minVelocity: 0.1,          // below this speed, zero out velocity
  pushInstantRatio: 0,       // fraction of knockback as instant position offset (0 = pure velocity)

  // Wall slam
  wallSlamMinSpeed: 3,       // minimum impact speed for wall damage
  wallSlamDamage: 8,         // damage per unit of impact speed above threshold
  wallSlamStun: 400,         // ms stun on wall slam
  wallSlamBounce: 0.4,       // velocity reflection coefficient (0 = dead stop, 1 = perfect bounce)
  wallSlamShake: 3,          // screen shake intensity on wall slam

  // Force push wave occlusion
  pushWaveBlockRadius: 0.8,  // lateral distance for one enemy to block another from push wave

  // Enemy-enemy collision
  enemyBounce: 0.4,          // enemy-enemy restitution coefficient
  impactMinSpeed: 2,         // minimum relative speed for collision damage
  impactDamage: 5,           // damage per unit of relative speed above threshold
  impactStun: 300,           // ms stun when hit by another enemy

  // Y-axis / vertical physics
  gravity: 25,               // units/s² downward acceleration
  terminalVelocity: 20,      // max downward Y velocity
  airControlMult: 1.0,       // XZ movement multiplier while airborne (1.0 = full control)
  landingLagBase: 50,        // ms of landing lag (minimum)
  landingLagPerSpeed: 10,    // ms of landing lag per unit of fall speed
  groundEpsilon: 0.05,       // height threshold for "grounded" detection
};
