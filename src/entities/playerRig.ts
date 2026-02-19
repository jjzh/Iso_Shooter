// PlayerRig — Procedural bipedal mannequin built from box/sphere primitives.
// Constructs a joint hierarchy suitable for procedural animation.
// No external assets — everything is THREE.js primitives.

import { PLAYER } from '../config/player';

// ─── Exported Types ───

export interface PlayerJoints {
  rigRoot: any;    // whole-body transforms (squash/stretch, lean)
  hip: any;        // pivot for legs, rotates to face movement direction
  torso: any;      // upper body, inherits aim rotation from playerGroup
  head: any;
  shoulderL: any;
  upperArmL: any;
  lowerArmL: any;
  shoulderR: any;
  upperArmR: any;
  lowerArmR: any;
  thighL: any;
  shinL: any;
  thighR: any;
  shinR: any;
}

export interface PlayerRig {
  joints: PlayerJoints;
  meshes: any[];           // all Mesh objects (for world-position sampling)
  materials: any[];        // all MeshStandardMaterial instances (for glow)
}

// ─── Proportions ───
// Tuned for readability at isometric distance. Slightly exaggerated (big head, wide torso).

const P = {
  // Overall scale reference
  scale: 0.9,  // global multiplier if everything feels too big/small

  // Hip (root of legs + torso)
  hipY: 0.5,

  // Torso
  torsoWidth: 0.28,
  torsoHeight: 0.32,
  torsoDepth: 0.18,
  torsoY: 0.22,  // above hip

  // Head
  headRadius: 0.16,
  headY: 0.30,  // above torso

  // Arms
  shoulderOffsetX: 0.19,
  shoulderY: 0.22,        // relative to torso (near top of torso)
  upperArmWidth: 0.08,
  upperArmHeight: 0.20,
  upperArmDepth: 0.08,
  upperArmY: -0.12,       // hangs down from shoulder
  elbowY: -0.20,          // relative to upper arm
  lowerArmWidth: 0.07,
  lowerArmHeight: 0.18,
  lowerArmDepth: 0.07,
  lowerArmY: -0.10,       // hangs down from elbow

  // Legs
  legOffsetX: 0.09,
  thighWidth: 0.10,
  thighHeight: 0.24,
  thighDepth: 0.10,
  thighY: -0.14,          // hangs down from hip
  kneeY: -0.24,           // relative to thigh
  shinWidth: 0.08,
  shinHeight: 0.22,
  shinDepth: 0.08,
  shinY: -0.12,           // hangs down from knee
};

// ─── Color Palette ───
// Green family matching current player. Limbs slightly darker for depth.

const COLORS = {
  torso:    { color: 0x44cc88, emissive: 0x22aa66, emissiveIntensity: 0.4 },
  head:     { color: 0x55ddaa, emissive: 0x33bb88, emissiveIntensity: 0.5 },
  arm:      { color: 0x3ab87a, emissive: 0x1e9960, emissiveIntensity: 0.35 },
  leg:      { color: 0x38b575, emissive: 0x1c9658, emissiveIntensity: 0.35 },
  fist:     { color: 0x55ddaa, emissive: 0x33bb88, emissiveIntensity: 0.5 },
};

// ─── Shared Geometry Cache (created once) ───

let _torsoGeo: any = null;
let _headGeo: any = null;
let _upperArmGeo: any = null;
let _lowerArmGeo: any = null;
let _thighGeo: any = null;
let _shinGeo: any = null;
let _fistGeo: any = null;

function ensureGeometry() {
  if (_torsoGeo) return;
  _torsoGeo    = new THREE.BoxGeometry(P.torsoWidth, P.torsoHeight, P.torsoDepth);
  _headGeo     = new THREE.SphereGeometry(P.headRadius, 8, 6);
  _upperArmGeo = new THREE.BoxGeometry(P.upperArmWidth, P.upperArmHeight, P.upperArmDepth);
  _lowerArmGeo = new THREE.BoxGeometry(P.lowerArmWidth, P.lowerArmHeight, P.lowerArmDepth);
  _thighGeo    = new THREE.BoxGeometry(P.thighWidth, P.thighHeight, P.thighDepth);
  _shinGeo     = new THREE.BoxGeometry(P.shinWidth, P.shinHeight, P.shinDepth);
  _fistGeo = new THREE.BoxGeometry(0.10, 0.08, 0.10);  // chunky fist — wider than forearm for readability
}

function makeMat(palette: { color: number; emissive: number; emissiveIntensity: number }) {
  return new THREE.MeshStandardMaterial({
    color: palette.color,
    emissive: palette.emissive,
    emissiveIntensity: palette.emissiveIntensity,
  });
}

// ─── Rig Construction ───

export function createPlayerRig(parentGroup: any): PlayerRig {
  ensureGeometry();

  const meshes: any[] = [];
  const materials: any[] = [];

  function addMesh(geo: any, palette: any, parent: any, x = 0, y = 0, z = 0) {
    const mat = makeMat(palette);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    meshes.push(mesh);
    materials.push(mat);
    return mesh;
  }

  // rigRoot — whole-body transforms (squash/stretch, forward lean)
  const rigRoot = new THREE.Group();
  rigRoot.scale.setScalar(P.scale);
  parentGroup.add(rigRoot);

  // Hip — root of legs + torso
  const hip = new THREE.Group();
  hip.position.y = P.hipY;
  rigRoot.add(hip);

  // Torso — upper body pivot (inherits aim from playerGroup via hierarchy)
  const torso = new THREE.Group();
  torso.position.y = P.torsoY;
  hip.add(torso);

  // Torso mesh
  addMesh(_torsoGeo, COLORS.torso, torso, 0, P.torsoHeight / 2, 0);

  // Head
  const head = new THREE.Group();
  head.position.y = P.torsoHeight + P.headY * 0.5;
  torso.add(head);
  addMesh(_headGeo, COLORS.head, head, 0, 0, 0);

  // ─── Arms ───

  // Left shoulder pivot (attached to torso)
  const shoulderL = new THREE.Group();
  shoulderL.position.set(-P.shoulderOffsetX, P.shoulderY, 0);
  torso.add(shoulderL);

  // Left upper arm pivot
  const upperArmL = new THREE.Group();
  shoulderL.add(upperArmL);
  addMesh(_upperArmGeo, COLORS.arm, upperArmL, 0, P.upperArmY, 0);

  // Left elbow → lower arm
  const lowerArmL = new THREE.Group();
  lowerArmL.position.y = P.elbowY;
  upperArmL.add(lowerArmL);
  addMesh(_lowerArmGeo, COLORS.arm, lowerArmL, 0, P.lowerArmY, 0);
  addMesh(_fistGeo, COLORS.fist, lowerArmL, 0, P.lowerArmY - P.lowerArmHeight / 2 - 0.02, 0);  // fist at end of forearm

  // Right shoulder pivot
  const shoulderR = new THREE.Group();
  shoulderR.position.set(P.shoulderOffsetX, P.shoulderY, 0);
  torso.add(shoulderR);

  // Right upper arm pivot
  const upperArmR = new THREE.Group();
  shoulderR.add(upperArmR);
  addMesh(_upperArmGeo, COLORS.arm, upperArmR, 0, P.upperArmY, 0);

  // Right elbow → lower arm
  const lowerArmR = new THREE.Group();
  lowerArmR.position.y = P.elbowY;
  upperArmR.add(lowerArmR);
  addMesh(_lowerArmGeo, COLORS.arm, lowerArmR, 0, P.lowerArmY, 0);
  addMesh(_fistGeo, COLORS.fist, lowerArmR, 0, P.lowerArmY - P.lowerArmHeight / 2 - 0.02, 0);  // fist at end of forearm

  // ─── Legs ───

  // Left thigh pivot (attached to hip)
  const thighL = new THREE.Group();
  thighL.position.set(-P.legOffsetX, 0, 0);
  hip.add(thighL);
  addMesh(_thighGeo, COLORS.leg, thighL, 0, P.thighY, 0);

  // Left knee → shin
  const shinL = new THREE.Group();
  shinL.position.y = P.kneeY;
  thighL.add(shinL);
  addMesh(_shinGeo, COLORS.leg, shinL, 0, P.shinY, 0);

  // Right thigh pivot
  const thighR = new THREE.Group();
  thighR.position.set(P.legOffsetX, 0, 0);
  hip.add(thighR);
  addMesh(_thighGeo, COLORS.leg, thighR, 0, P.thighY, 0);

  // Right knee → shin
  const shinR = new THREE.Group();
  shinR.position.y = P.kneeY;
  thighR.add(shinR);
  addMesh(_shinGeo, COLORS.leg, shinR, 0, P.shinY, 0);

  return {
    joints: {
      rigRoot,
      hip,
      torso,
      head,
      shoulderL,
      upperArmL,
      lowerArmL,
      shoulderR,
      upperArmR,
      lowerArmR,
      thighL,
      shinL,
      thighR,
      shinR,
    },
    meshes,
    materials,
  };
}

// ─── Afterimage Helpers ───

// Shared ghost geometries (simplified — just torso + head for performance)
let _ghostTorsoGeo: any = null;
let _ghostHeadGeo: any = null;

export function getGhostGeometries() {
  if (!_ghostTorsoGeo) {
    _ghostTorsoGeo = new THREE.BoxGeometry(P.torsoWidth * P.scale, P.torsoHeight * P.scale, P.torsoDepth * P.scale);
    _ghostHeadGeo  = new THREE.SphereGeometry(P.headRadius * P.scale, 6, 4);
  }
  return { torso: _ghostTorsoGeo, head: _ghostHeadGeo };
}
