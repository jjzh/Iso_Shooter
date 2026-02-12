// EnemyRig — Builds distinctive silhouettes for each enemy type from primitives.
// Each type has unique proportions and identifying details (ears, ribs, hat, etc.)
// while sharing the same construction pattern. No animation — just static models
// with a shared hit reaction system.

// ─── Per-Type Silhouette Config ───
// Proportions are expressed as multipliers relative to cfg.size.radius and cfg.size.height.

interface SilhouetteConfig {
  // Proportions (multiplied by cfg.size dimensions)
  headScale: number;        // head radius as fraction of body radius
  torsoW: number;           // torso width multiplier
  torsoH: number;           // torso height multiplier
  torsoD: number;           // torso depth multiplier
  armW: number;             // arm width multiplier
  armLen: number;           // arm length multiplier
  legW: number;             // leg width multiplier
  legLen: number;           // leg length multiplier
  legSpread: number;        // horizontal distance between legs
  hipY: number;             // hip height as fraction of total height
  // Color adjustments
  limbDarken: number;       // how much to darken limbs (0 = same, 0.3 = 30% darker)
  headBrighten: number;     // how much to brighten head (0 = same, 0.2 = 20% brighter)
  // Extras
  extras: string[];
}

// Multipliers are relative to cfg.size (radius, height).
// Old enemies were: cylinder(radius, height*0.6) + sphere(radius*0.7).
// These are tuned so each type fits within roughly the same bounding volume
// as the old primitives, while reading as distinct silhouettes.

const SILHOUETTES: Record<string, SilhouetteConfig> = {
  goblin: {
    headScale: 1.2,       // big exaggerated head — dominant feature
    torsoW: 0.55, torsoH: 0.30, torsoD: 0.50,
    armW: 0.28, armLen: 0.42,   // long-ish dangling arms
    legW: 0.30, legLen: 0.28,   // short stubby legs
    legSpread: 0.30,
    hipY: 0.35,
    limbDarken: 0.15,
    headBrighten: 0.1,
    extras: ['snout', 'ears'],
  },
  skeletonArcher: {
    headScale: 0.7,        // small skull
    torsoW: 0.38, torsoH: 0.42, torsoD: 0.30,  // narrow tall
    armW: 0.18, armLen: 0.38,
    legW: 0.20, legLen: 0.45,
    legSpread: 0.22,
    hipY: 0.45,
    limbDarken: 0.1,
    headBrighten: 0.05,
    extras: ['bow', 'ribs'],
  },
  iceMortarImp: {
    headScale: 0.9,
    torsoW: 0.55, torsoH: 0.28, torsoD: 0.50,  // wide round body, scaled down
    armW: 0.18, armLen: 0.20,   // stubby arms
    legW: 0.22, legLen: 0.20,   // tiny legs
    legSpread: 0.25,
    hipY: 0.28,
    limbDarken: 0.1,
    headBrighten: 0.15,
    extras: ['hat'],
  },
  stoneGolem: {
    headScale: 0.5,        // tiny head sunk in shoulders
    torsoW: 0.70, torsoH: 0.40, torsoD: 0.60,   // massive (golem already has large cfg.size)
    armW: 0.38, armLen: 0.45,   // thick heavy arms
    legW: 0.38, legLen: 0.38,   // thick legs
    legSpread: 0.32,
    hipY: 0.40,
    limbDarken: 0.1,
    headBrighten: 0.05,
    extras: ['shoulders'],
  },
};

// Default silhouette for unknown types
const DEFAULT_SILHOUETTE: SilhouetteConfig = {
  headScale: 0.9,
  torsoW: 0.50, torsoH: 0.35, torsoD: 0.45,
  armW: 0.25, armLen: 0.35,
  legW: 0.28, legLen: 0.35,
  legSpread: 0.25,
  hipY: 0.40,
  limbDarken: 0.1,
  headBrighten: 0.1,
  extras: [],
};

// ─── Color Utilities ───

function darkenColor(color: number, amount: number): number {
  const r = Math.max(0, ((color >> 16) & 0xff) * (1 - amount)) | 0;
  const g = Math.max(0, ((color >> 8) & 0xff) * (1 - amount)) | 0;
  const b = Math.max(0, (color & 0xff) * (1 - amount)) | 0;
  return (r << 16) | (g << 8) | b;
}

function brightenColor(color: number, amount: number): number {
  const r = Math.min(255, ((color >> 16) & 0xff) * (1 + amount)) | 0;
  const g = Math.min(255, ((color >> 8) & 0xff) * (1 + amount)) | 0;
  const b = Math.min(255, (color & 0xff) * (1 + amount)) | 0;
  return (r << 16) | (g << 8) | b;
}

// ─── Build Enemy Model ───

export interface EnemyModel {
  bodyMesh: any;       // main torso mesh (backward compat for flash)
  headMesh: any;       // head mesh (backward compat for flash)
  allMeshes: any[];    // every mesh part (for comprehensive effects)
  allMaterials: any[]; // every material (for flash/transparency)
}

export function buildEnemyModel(typeName: string, cfg: any, group: any): EnemyModel {
  const sil = SILHOUETTES[typeName] || DEFAULT_SILHOUETTE;
  const r = cfg.size.radius;
  const h = cfg.size.height;

  const allMeshes: any[] = [];
  const allMaterials: any[] = [];

  function addMesh(geo: any, color: number, emissive: number, emissiveI: number, parent: any, x = 0, y = 0, z = 0) {
    const mat = new THREE.MeshStandardMaterial({
      color, emissive, emissiveIntensity: emissiveI,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    allMeshes.push(mesh);
    allMaterials.push(mat);
    return mesh;
  }

  const bodyColor = cfg.color;
  const bodyEmissive = cfg.emissive;
  const headColor = brightenColor(bodyColor, sil.headBrighten);
  const headEmissive = brightenColor(bodyEmissive, sil.headBrighten);
  const limbColor = darkenColor(bodyColor, sil.limbDarken);
  const limbEmissive = darkenColor(bodyEmissive, sil.limbDarken);

  // ─── Core body parts ───

  const hipY = h * sil.hipY;
  const torsoW = r * 2 * sil.torsoW;
  const torsoH = h * sil.torsoH;
  const torsoD = r * 2 * sil.torsoD;
  const torsoY = hipY + torsoH / 2 + r * 0.05;

  // Torso
  const torsoGeo = new THREE.BoxGeometry(torsoW, torsoH, torsoD);
  const bodyMesh = addMesh(torsoGeo, bodyColor, bodyEmissive, 0.5, group, 0, torsoY, 0);

  // Head
  const headRadius = r * sil.headScale * 0.7;
  const headY = torsoY + torsoH / 2 + headRadius * 0.8;
  const headGeo = new THREE.SphereGeometry(headRadius, 8, 6);
  const headMesh = addMesh(headGeo, headColor, headEmissive, 0.6, group, 0, headY, 0);

  // Arms
  const shoulderY = torsoY + torsoH * 0.3;
  const armW = r * sil.armW;
  const armLen = h * sil.armLen;
  const armGeo = new THREE.BoxGeometry(armW, armLen, armW);

  addMesh(armGeo, limbColor, limbEmissive, 0.4, group,
    -(torsoW / 2 + armW / 2), shoulderY - armLen / 2, 0);
  addMesh(armGeo, limbColor, limbEmissive, 0.4, group,
    (torsoW / 2 + armW / 2), shoulderY - armLen / 2, 0);

  // Legs
  const legW = r * sil.legW;
  const legLen = h * sil.legLen;
  const legSpread = r * sil.legSpread;
  const legGeo = new THREE.BoxGeometry(legW, legLen, legW);

  addMesh(legGeo, limbColor, limbEmissive, 0.4, group,
    -legSpread, hipY - legLen / 2, 0);
  addMesh(legGeo, limbColor, limbEmissive, 0.4, group,
    legSpread, hipY - legLen / 2, 0);

  // ─── Type-specific extras ───

  if (sil.extras.includes('snout')) {
    const snoutGeo = new THREE.ConeGeometry(headRadius * 0.35, headRadius * 0.7, 5);
    const snout = addMesh(snoutGeo, headColor, headEmissive, 0.5, group,
      0, headY - headRadius * 0.15, -(headRadius + headRadius * 0.15));
    snout.rotation.x = -Math.PI / 2;
  }

  if (sil.extras.includes('ears')) {
    const earGeo = new THREE.ConeGeometry(headRadius * 0.25, headRadius * 0.7, 4);

    const earL = addMesh(earGeo, headColor, headEmissive, 0.5, group,
      -(headRadius + headRadius * 0.1), headY + headRadius * 0.3, 0);
    earL.rotation.z = Math.PI / 2 + 0.4;

    const earR = addMesh(earGeo, headColor, headEmissive, 0.5, group,
      (headRadius + headRadius * 0.1), headY + headRadius * 0.3, 0);
    earR.rotation.z = -(Math.PI / 2 + 0.4);
  }

  if (sil.extras.includes('bow')) {
    const bowGeo = new THREE.BoxGeometry(armW * 0.4, h * 0.35, armW * 0.8);
    addMesh(bowGeo, darkenColor(bodyColor, 0.4), darkenColor(bodyEmissive, 0.4), 0.3, group,
      -(torsoW / 2 + armW * 1.5), shoulderY - armLen * 0.4, -r * 0.4);
  }

  if (sil.extras.includes('ribs')) {
    const ribColor = brightenColor(bodyColor, 0.15);
    const ribEmissive = brightenColor(bodyEmissive, 0.1);
    for (let i = 0; i < 3; i++) {
      const ribGeo = new THREE.BoxGeometry(torsoW * 1.15, h * 0.012, torsoD * 0.6);
      const ribY = torsoY + torsoH * (0.25 - i * 0.25);
      addMesh(ribGeo, ribColor, ribEmissive, 0.3, group, 0, ribY, 0);
    }
  }

  if (sil.extras.includes('hat')) {
    const hatGeo = new THREE.ConeGeometry(headRadius * 0.9, h * 0.28, 6);
    const hat = addMesh(hatGeo, darkenColor(bodyColor, 0.25), darkenColor(bodyEmissive, 0.25), 0.4, group,
      0, headY + headRadius * 0.6 + h * 0.1, 0);
    hat.rotation.z = 0.15; // jaunty tilt
  }

  if (sil.extras.includes('shoulders')) {
    const shW = torsoW * 0.4;
    const shH = torsoH * 0.25;
    const shGeo = new THREE.BoxGeometry(shW, shH, shW);

    addMesh(shGeo, darkenColor(bodyColor, 0.1), darkenColor(bodyEmissive, 0.1), 0.35, group,
      -(torsoW / 2 + shW * 0.1), shoulderY + shH * 0.5, 0);
    addMesh(shGeo, darkenColor(bodyColor, 0.1), darkenColor(bodyEmissive, 0.1), 0.35, group,
      (torsoW / 2 + shW * 0.1), shoulderY + shH * 0.5, 0);
  }

  return { bodyMesh, headMesh, allMeshes, allMaterials };
}

// ─── Hit Reaction ───
// Shared squash/bounce on damage — applied to any enemy mesh group.
// Call triggerHitReaction on damage, updateHitReaction each frame.

export interface HitReactionState {
  active: boolean;
  timer: number;      // seconds elapsed
  duration: number;   // total duration (seconds)
}

export function createHitReaction(): HitReactionState {
  return { active: false, timer: 0, duration: 0.12 };
}

export function triggerHitReaction(state: HitReactionState) {
  state.active = true;
  state.timer = 0;
}

export function updateHitReaction(state: HitReactionState, meshGroup: any, dt: number) {
  if (!state.active) return;

  state.timer += dt;
  const t = Math.min(state.timer / state.duration, 1);

  if (t < 0.3) {
    // Squash phase — compress vertically, widen
    const squashT = t / 0.3;
    meshGroup.scale.set(1 + 0.12 * squashT, 1 - 0.15 * squashT, 1 + 0.12 * squashT);
  } else {
    // Bounce back — overshoot slightly then settle
    const bounceT = (t - 0.3) / 0.7;
    const ease = 1 - Math.pow(1 - bounceT, 3); // ease out cubic
    const overshoot = bounceT < 0.5 ? 1.06 : 1 + 0.06 * (1 - (bounceT - 0.5) * 2);
    const scaleY = (1 - 0.15) + (overshoot - (1 - 0.15)) * ease;
    const scaleXZ = (1 + 0.12) + (1 - (1 + 0.12)) * ease;
    meshGroup.scale.set(scaleXZ, scaleY, scaleXZ);
  }

  if (t >= 1) {
    state.active = false;
    meshGroup.scale.set(1, 1, 1);
  }
}
