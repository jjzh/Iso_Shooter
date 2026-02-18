// Pure math utilities for melee combat — no THREE.js dependency
// Extracted for testability

/**
 * Check if a target is within a melee arc.
 * @param playerX Player X position
 * @param playerZ Player Z position
 * @param swingAngle Player facing angle (radians, atan2 convention: atan2(-dx,-dz))
 * @param targetX Target X position
 * @param targetZ Target Z position
 * @param range Max hit distance
 * @param arc Total arc width in radians
 */
export function isInMeleeArc(
  playerX: number, playerZ: number, swingAngle: number,
  targetX: number, targetZ: number, range: number, arc: number
): boolean {
  const dx = targetX - playerX;
  const dz = targetZ - playerZ;
  const distSq = dx * dx + dz * dz;
  if (distSq > range * range) return false;
  if (distSq < 0.001) return true; // on top of player = always hit

  const angleToTarget = Math.atan2(-dx, -dz);
  let angleDiff = angleToTarget - swingAngle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  return Math.abs(angleDiff) <= arc / 2;
}
