// Vision Cone Overlay — flat transparent wedge on ground showing enemy detection cone
// Aggro is directional: enemies only detect the player inside their facing cone + LOS
// Color: green (idle) → yellow/orange/red (detecting) → red flash (aggroed) → fade out
// Visual occlusion: cone vertices are pulled inward when walls block line of sight

// Raycast function injected at init time to avoid pulling in enemy.ts (and THREE)
// at module-level — that breaks tests that import VISION_CONE_CONFIG without THREE.
type RaycastFn = (ox: number, oz: number, dx: number, dz: number, maxDist: number) => number;
let raycastFn: RaycastFn | null = null;

export const VISION_CONE_CONFIG = {
  angle: Math.PI / 3 * 0.8,   // ~48° cone (20% narrower than 60°)
  segments: 16,                 // geometry resolution
  opacity: 0.08,                // idle cone opacity
  idleColor: 0x44ff88,          // green
  detectColor1: 0xffee44,       // yellow (detection start)
  detectColor2: 0xff8800,       // orange (detection mid)
  aggroColor: 0xff4444,         // red (detection full / aggroed)
  fadeAfterAggro: 1000,         // ms — fade duration after aggro flash
  aggroHoldDuration: 250,       // ms — red flash holds at full before fading
  detectionThreshold: 350,      // ms — player must be in cone this long to trigger aggro
  idleTurnRate: 0.4,            // rad/s — how fast idle enemies scan back and forth
  idleScanArc: Math.PI / 3,    // ±60° sweep from initial facing while idle
  turnSpeed: 3.0,               // rad/s — how fast enemies rotate toward their target facing (all states)
};

let sceneRef: any = null;

// Per-enemy cone data
interface ConeData {
  mesh: any;
  basePositions: Float32Array;  // original unclipped vertex positions (for resetting each frame)
  geoAngle: number;             // angle when geometry was created (to detect tuning changes)
  aggroTimer: number;   // ms remaining for aggro flash fade
  holdTimer: number;    // ms remaining for aggro hold before fade
  wasAggroed: boolean;  // track when aggro state changes
}

const coneMap = new Map<any, ConeData>();

// Cache geometry keyed by angle (so tuning panel changes rebuild it)
let cachedGeo: any = null;
let cachedGeoAngle = 0;

export function initVisionCones(scene: any, raycast?: RaycastFn) {
  sceneRef = scene;
  if (raycast) raycastFn = raycast;
}

function getConeGeo(): any {
  const angle = VISION_CONE_CONFIG.angle;
  if (cachedGeo && Math.abs(cachedGeoAngle - angle) < 0.001) {
    return cachedGeo;
  }
  if (cachedGeo) cachedGeo.dispose();

  // Arc centered at PI/2 in XY plane → points +Z after rotateX(-PI/2).
  // Model faces -Z, but cone copies mesh.rotation.y directly, so the rotation
  // naturally aligns them (rotation.y rotates both by the same amount).
  cachedGeo = new THREE.CircleGeometry(
    1,
    VISION_CONE_CONFIG.segments,
    Math.PI / 2 - angle / 2,
    angle
  );
  cachedGeo.rotateX(-Math.PI / 2);
  cachedGeoAngle = angle;
  return cachedGeo;
}

/** Clone the cached geometry and snapshot its base positions for occlusion resets. */
function cloneConeGeo(): { geo: any; basePositions: Float32Array } {
  const geo = getConeGeo().clone();
  const basePositions = new Float32Array(geo.attributes.position.array);
  return { geo, basePositions };
}

/**
 * Check if a point is inside an enemy's vision cone (distance + angle only, no LOS).
 * rotationY is the enemy's mesh.rotation.y (single source of truth for facing).
 */
export function isInsideVisionCone(
  enemyX: number, enemyZ: number,
  rotationY: number,
  targetX: number, targetZ: number,
  radius: number
): boolean {
  const dx = targetX - enemyX;
  const dz = targetZ - enemyZ;
  const distSq = dx * dx + dz * dz;

  if (distSq > radius * radius) return false;

  // atan2(-dx, -dz) converts a direction vector to rotation.y space
  const angleToTarget = Math.atan2(-dx, -dz);
  let angleDiff = angleToTarget - rotationY;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  const halfAngle = VISION_CONE_CONFIG.angle / 2;
  return Math.abs(angleDiff) <= halfAngle;
}

/**
 * Update cone color based on detection timer progress (0→1).
 * Green → yellow → orange → red as detection builds.
 */
function updateDetectionColor(data: ConeData, detectionT: number) {
  if (detectionT <= 0) {
    // Idle — green
    data.mesh.material.color.setHex(VISION_CONE_CONFIG.idleColor);
    data.mesh.material.opacity = VISION_CONE_CONFIG.opacity;
  } else if (detectionT < 0.5) {
    // First half: green → yellow → orange
    const t = detectionT * 2; // 0→1 over first half
    lerpColor(data.mesh.material.color, VISION_CONE_CONFIG.detectColor1, VISION_CONE_CONFIG.detectColor2, t);
    data.mesh.material.opacity = VISION_CONE_CONFIG.opacity + t * 0.12; // brighten
  } else {
    // Second half: orange → red
    const t = (detectionT - 0.5) * 2; // 0→1 over second half
    lerpColor(data.mesh.material.color, VISION_CONE_CONFIG.detectColor2, VISION_CONE_CONFIG.aggroColor, t);
    data.mesh.material.opacity = VISION_CONE_CONFIG.opacity + 0.12 + t * 0.05;
  }
}

// Helper: lerp between two hex colors
const _c1 = { r: 0, g: 0, b: 0 };
const _c2 = { r: 0, g: 0, b: 0 };

function lerpColor(target: any, hex1: number, hex2: number, t: number) {
  _c1.r = (hex1 >> 16) & 0xff;
  _c1.g = (hex1 >> 8) & 0xff;
  _c1.b = hex1 & 0xff;
  _c2.r = (hex2 >> 16) & 0xff;
  _c2.g = (hex2 >> 8) & 0xff;
  _c2.b = hex2 & 0xff;

  const r = Math.round(_c1.r + (_c2.r - _c1.r) * t);
  const g = Math.round(_c1.g + (_c2.g - _c1.g) * t);
  const b = Math.round(_c1.b + (_c2.b - _c1.b) * t);

  target.setRGB(r / 255, g / 255, b / 255);
}

export function addVisionCone(enemy: any) {
  if (!sceneRef) return;
  if (coneMap.has(enemy)) return;

  const aggroRadius = enemy.config.aggroRadius;
  if (!aggroRadius || aggroRadius <= 0) return;

  // Initialize facing if not already set by spawnEnemy
  if (!enemy._facingInitialized) {
    enemy.mesh.rotation.y = (Math.random() - 0.5) * Math.PI * 2;
    enemy.idleBaseRotY = enemy.mesh.rotation.y;
    enemy.idleScanPhase = Math.random() * Math.PI * 2;
    enemy._facingInitialized = true;
  }

  // Each enemy gets its own geometry clone so vertices can be independently
  // modified for LOS occlusion (pulling vertices inward at wall hits).
  const { geo, basePositions } = cloneConeGeo();
  const mat = new THREE.MeshBasicMaterial({
    color: VISION_CONE_CONFIG.idleColor,
    transparent: true,
    opacity: VISION_CONE_CONFIG.opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.set(aggroRadius, 1, aggroRadius);
  mesh.position.set(enemy.pos.x, 0.02, enemy.pos.z);
  mesh.renderOrder = -1;

  sceneRef.add(mesh);
  coneMap.set(enemy, {
    mesh,
    basePositions,
    geoAngle: cachedGeoAngle,
    aggroTimer: 0,
    holdTimer: 0,
    wasAggroed: false,
  });
}

/**
 * Update idle scan facing for non-aggroed, non-patrolling enemies.
 * Must be called BEFORE aggro checks so mesh.rotation.y matches the visual cone.
 */
export function updateIdleFacing(enemies: any[], dt: number) {
  for (const enemy of enemies) {
    if (!enemy.aggroed && enemy.idleBaseRotY != null && !enemy.config.patrol) {
      enemy.idleScanPhase = (enemy.idleScanPhase || 0) + dt * VISION_CONE_CONFIG.idleTurnRate;
      enemy.mesh.rotation.y = enemy.idleBaseRotY + Math.sin(enemy.idleScanPhase) * VISION_CONE_CONFIG.idleScanArc;
    }
  }
}

/**
 * Clip cone vertices to terrain — pull perimeter vertices inward where walls block LOS.
 * Raycasts from enemy center toward each vertex direction; if a wall is closer than
 * the cone radius, the vertex is scaled inward to the hit distance.
 */
function updateConeOcclusion(data: ConeData, enemy: any) {
  if (!raycastFn) return; // no raycast function injected yet
  const positions = data.mesh.geometry.attributes.position.array as Float32Array;
  const base = data.basePositions;
  const aggroRadius = enemy.config.aggroRadius;
  const rotY = enemy.mesh.rotation.y;
  const cosR = Math.cos(rotY);
  const sinR = Math.sin(rotY);
  const segments = VISION_CONE_CONFIG.segments;

  // Vertex 0 is the center (always at origin in local space) — skip it.
  // Vertices 1..segments+1 are the perimeter points.
  for (let i = 1; i <= segments + 1; i++) {
    const bx = base[i * 3 + 0]; // unit-radius local X
    const bz = base[i * 3 + 2]; // unit-radius local Z

    // Rotate local direction by mesh.rotation.y to get world direction
    const worldDirX = bx * cosR + bz * sinR;
    const worldDirZ = -bx * sinR + bz * cosR;

    // Normalize (vertices are at unit radius, but rotateX may have shifted things slightly)
    const len = Math.sqrt(worldDirX * worldDirX + worldDirZ * worldDirZ);
    if (len < 0.001) continue; // degenerate vertex, skip

    const ndx = worldDirX / len;
    const ndz = worldDirZ / len;

    // Raycast from enemy center in this direction
    const hitDist = raycastFn!(enemy.pos.x, enemy.pos.z, ndx, ndz, aggroRadius);

    // Scale vertex: hitDist / aggroRadius gives the fraction of full reach
    // (mesh.scale already multiplies local coords by aggroRadius)
    const scale = Math.min(hitDist / aggroRadius, 1.0);
    positions[i * 3 + 0] = bx * scale;
    positions[i * 3 + 2] = bz * scale;
  }

  data.mesh.geometry.attributes.position.needsUpdate = true;
}

export function updateVisionCones(enemies: any[], dt: number) {
  // Check if cone angle changed via tuning panel — rebuild base geometry if needed
  getConeGeo(); // ensures cachedGeoAngle is current

  for (const enemy of enemies) {
    const data = coneMap.get(enemy);
    if (!data) continue;

    // If cone angle changed via tuning panel, re-clone geometry
    if (Math.abs(data.geoAngle - cachedGeoAngle) > 0.001) {
      data.mesh.geometry.dispose();
      const { geo, basePositions } = cloneConeGeo();
      data.mesh.geometry = geo;
      data.basePositions = basePositions;
      data.geoAngle = cachedGeoAngle;
    }

    // Update position
    data.mesh.position.set(enemy.pos.x, 0.02, enemy.pos.z);

    // Update scale if aggro radius changed via tuning panel
    const aggroRadius = enemy.config.aggroRadius;
    if (aggroRadius && aggroRadius > 0) {
      data.mesh.scale.set(aggroRadius, 1, aggroRadius);
    }

    // Rotate cone to match enemy model — just copy the model's rotation directly.
    // This guarantees cone and model always point the same direction.
    data.mesh.rotation.y = enemy.mesh.rotation.y;

    // Visual LOS occlusion — clip cone at walls (skip for aggroed cones that are fading)
    if (!data.wasAggroed && aggroRadius > 0) {
      updateConeOcclusion(data, enemy);
    }

    // Detection timer color transition (while not yet aggroed)
    if (!enemy.aggroed && !data.wasAggroed) {
      const threshold = VISION_CONE_CONFIG.detectionThreshold;
      const detectionT = threshold > 0
        ? Math.min((enemy.detectionTimer || 0) / threshold, 1)
        : 0;
      updateDetectionColor(data, detectionT);
    }

    // Handle aggro state change
    if (enemy.aggroed && !data.wasAggroed) {
      data.wasAggroed = true;
      data.holdTimer = VISION_CONE_CONFIG.aggroHoldDuration;
      data.aggroTimer = VISION_CONE_CONFIG.fadeAfterAggro;
      data.mesh.material.color.setHex(VISION_CONE_CONFIG.aggroColor);
      data.mesh.material.opacity = 0.25;
    }

    // Aggro flash: hold → fade → hide
    if (data.wasAggroed) {
      if (data.holdTimer > 0) {
        // Hold at full red
        data.holdTimer -= dt * 1000;
      } else if (data.aggroTimer > 0) {
        // Fade out
        data.aggroTimer -= dt * 1000;
        const fadeT = Math.max(0, data.aggroTimer / VISION_CONE_CONFIG.fadeAfterAggro);
        data.mesh.material.opacity = 0.25 * fadeT;

        if (data.aggroTimer <= 0) {
          data.mesh.visible = false;
        }
      }
    }
  }
}

export function removeVisionCone(enemy: any) {
  const data = coneMap.get(enemy);
  if (!data) return;

  if (sceneRef) {
    sceneRef.remove(data.mesh);
  }
  data.mesh.geometry.dispose();
  data.mesh.material.dispose();
  coneMap.delete(enemy);
}

export function clearVisionCones() {
  for (const [enemy, data] of coneMap) {
    if (sceneRef) {
      sceneRef.remove(data.mesh);
    }
    data.mesh.geometry.dispose();
    data.mesh.material.dispose();
  }
  coneMap.clear();
}
