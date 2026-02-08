import { OBSTACLES, PITS, ARENA_HALF, WALL_THICKNESS, WALL_HEIGHT } from '../config/arena.js';

const THREE = window.THREE;

let scene, camera, renderer;
const baseFrustum = 12;
let currentFrustum = 12;
const cameraOffset = new THREE.Vector3(20, 20, 20);

// Tracked arena meshes for dynamic rebuild
let obstacleMeshes = [];
let wallMeshes = [];
let pitMeshes = [];

// Screen shake state
let shakeRemaining = 0;
let shakeIntensity = 0;

// Reusable vectors
const _camTarget = new THREE.Vector3();
const _unprojectVec = new THREE.Vector3();
const _camDir = new THREE.Vector3();

export function initRenderer() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a1a);
  scene.fog = new THREE.Fog(0x0a0a1a, 30, 60);

  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.OrthographicCamera(
    -baseFrustum * aspect, baseFrustum * aspect,
    baseFrustum, -baseFrustum, 0.1, 100
  );
  camera.position.copy(cameraOffset);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.body.prepend(renderer.domElement);

  // Lighting
  const ambient = new THREE.AmbientLight(0x6666aa, 0.4);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffeedd, 0.8);
  dirLight.position.set(10, 15, 10);
  scene.add(dirLight);

  const rimLight = new THREE.DirectionalLight(0x4488ff, 0.3);
  rimLight.position.set(-10, 5, -10);
  scene.add(rimLight);

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.9, metalness: 0.1 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Grid overlay
  const grid = new THREE.GridHelper(60, 30, 0x2a4a4a, 0x1a2a3a);
  grid.position.y = 0.01;
  scene.add(grid);

  // Arena obstacles
  createObstacles();

  // Arena pits
  createPits();

  // Resize handler
  window.addEventListener('resize', onResize);

  return { scene, camera, renderer };
}

function clearObstacleMeshes() {
  for (const m of obstacleMeshes) {
    scene.remove(m);
    if (m.geometry) m.geometry.dispose();
  }
  obstacleMeshes = [];
  for (const m of wallMeshes) {
    scene.remove(m);
    if (m.geometry) m.geometry.dispose();
  }
  wallMeshes = [];
}

function createObstacles() {
  clearObstacleMeshes();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x2a2a4a,
    emissive: 0x223355,
    emissiveIntensity: 0.3,
    roughness: 0.7,
    metalness: 0.2
  });

  for (const o of OBSTACLES) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), mat);
    mesh.position.set(o.x, o.h / 2, o.z);
    scene.add(mesh);
    obstacleMeshes.push(mesh);
  }

  // Arena perimeter walls
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a2e,
    emissive: 0x334466,
    emissiveIntensity: 0.4,
    roughness: 0.8
  });

  // North/South walls
  for (const zSign of [-1, 1]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(ARENA_HALF * 2 + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS),
      wallMat
    );
    wall.position.set(0, WALL_HEIGHT / 2, zSign * ARENA_HALF);
    scene.add(wall);
    wallMeshes.push(wall);
  }
  // East/West walls
  for (const xSign of [-1, 1]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, ARENA_HALF * 2 + WALL_THICKNESS),
      wallMat
    );
    wall.position.set(xSign * ARENA_HALF, WALL_HEIGHT / 2, 0);
    scene.add(wall);
    wallMeshes.push(wall);
  }
}

function clearPitMeshes() {
  for (const m of pitMeshes) {
    scene.remove(m);
    if (m.geometry) m.geometry.dispose();
  }
  pitMeshes = [];
}

function createPits() {
  clearPitMeshes();

  const edgeThickness = 0.08;
  const edgeHeight = 0.02;

  const edgeMat = new THREE.MeshBasicMaterial({
    color: 0xff2244,
    transparent: true,
    opacity: 0.8,
  });

  for (const p of PITS) {
    // Dark void floor (slightly below ground)
    const voidMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(p.w, p.d),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    voidMesh.rotation.x = -Math.PI / 2;
    voidMesh.position.set(p.x, -0.05, p.z);
    scene.add(voidMesh);
    pitMeshes.push(voidMesh);

    // North edge
    const nEdge = new THREE.Mesh(
      new THREE.BoxGeometry(p.w + edgeThickness * 2, edgeHeight, edgeThickness),
      edgeMat
    );
    nEdge.position.set(p.x, 0.01, p.z + p.d / 2);
    scene.add(nEdge);
    pitMeshes.push(nEdge);

    // South edge
    const sEdge = new THREE.Mesh(
      new THREE.BoxGeometry(p.w + edgeThickness * 2, edgeHeight, edgeThickness),
      edgeMat
    );
    sEdge.position.set(p.x, 0.01, p.z - p.d / 2);
    scene.add(sEdge);
    pitMeshes.push(sEdge);

    // East edge
    const eEdge = new THREE.Mesh(
      new THREE.BoxGeometry(edgeThickness, edgeHeight, p.d),
      edgeMat
    );
    eEdge.position.set(p.x + p.w / 2, 0.01, p.z);
    scene.add(eEdge);
    pitMeshes.push(eEdge);

    // West edge
    const wEdge = new THREE.Mesh(
      new THREE.BoxGeometry(edgeThickness, edgeHeight, p.d),
      edgeMat
    );
    wEdge.position.set(p.x - p.w / 2, 0.01, p.z);
    scene.add(wEdge);
    pitMeshes.push(wEdge);
  }
}

// Rebuild all arena visuals (obstacles + pits) — called by level editor
export function rebuildArenaVisuals() {
  createObstacles();
  createPits();
}

function onResize() {
  applyFrustum(currentFrustum);
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function applyFrustum(f) {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = -f * aspect;
  camera.right = f * aspect;
  camera.top = f;
  camera.bottom = -f;
  camera.updateProjectionMatrix();
  currentFrustum = f;
}

export function setZoom(frustum) {
  applyFrustum(Math.max(8, Math.min(30, frustum)));
}

export function resetZoom() {
  applyFrustum(baseFrustum);
}

export function getCurrentFrustum() {
  return currentFrustum;
}

export function updateCamera(playerPos, dt) {
  // Snap camera to player — no lerp. Ortho camera + lerp causes a sliding/swimming feel
  // because the lookAt target and position desync subtly each frame.
  camera.position.copy(playerPos).add(cameraOffset);

  // Screen shake (offset from snapped position)
  if (shakeRemaining > 0) {
    shakeRemaining -= dt * 1000;
    const decay = Math.max(0, shakeRemaining / 150);
    const amt = shakeIntensity * decay;
    camera.position.x += (Math.random() - 0.5) * amt * 0.1;
    camera.position.z += (Math.random() - 0.5) * amt * 0.1;
  }

  camera.lookAt(playerPos);
}

export function screenShake(intensity, durationMs) {
  if (durationMs === undefined) durationMs = 100;
  shakeIntensity = intensity;
  shakeRemaining = durationMs;
}

// Convert mouse NDC to world position on y=0 plane
export function screenToWorld(ndcX, ndcY) {
  _unprojectVec.set(ndcX, ndcY, 0);
  _unprojectVec.unproject(camera);

  // Camera direction
  _camDir.set(0, 0, -1).applyQuaternion(camera.quaternion);

  // Intersect ray with y=0 plane
  const t = -_unprojectVec.y / _camDir.y;
  return new THREE.Vector3(
    _unprojectVec.x + _camDir.x * t,
    0,
    _unprojectVec.z + _camDir.z * t
  );
}

export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getRendererInstance() { return renderer; }
