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

  // Physics objects
  objectFriction: 25,          // deceleration for physics objects
  objectWallSlamMinSpeed: 3,   // min impact speed for wall slam damage
  objectWallSlamDamage: 8,     // damage per unit of speed above threshold
  objectWallSlamStun: 0,       // objects don't stun (no AI)
  objectWallSlamBounce: 0.4,   // velocity reflection coefficient
  objectWallSlamShake: 2,      // screen shake intensity
  objectImpactMinSpeed: 2,     // min relative speed for impact damage
  objectImpactDamage: 5,       // damage per unit of relative speed above threshold
};
