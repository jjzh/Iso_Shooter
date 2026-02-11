// Built with esbuild
const THREE = window.THREE;
const nipplejs = window.nipplejs;

// src/config/arena.ts
var ARENA_HALF = 20;
var OBSTACLES = [
  { x: 5, z: 9, w: 2, h: 1.5, d: 3 },
  { x: -9, z: -7.5, w: 4, h: 1.5, d: 2 },
  { x: 3.5, z: -3, w: 1.5, h: 2, d: 1.5 },
  { x: 3.5, z: -9.5, w: 1.5, h: 2, d: 1.5 },
  { x: 1, z: 10, w: 9, h: 1, d: 1 },
  { x: 8.5, z: -8, w: 3, h: 1, d: 1 },
  { x: 10, z: 9, w: 1, h: 2.5, d: 1 },
  { x: -7.5, z: 8, w: 1, h: 2.5, d: 1 }
];
var WALL_THICKNESS = 0.5;
var WALL_HEIGHT = 2;
var PITS = [
  { x: 0, z: 7.5, w: 8, d: 3 },
  { x: 16, z: -17, w: 4.5, d: 4.5 },
  { x: -7.5, z: 0, w: 2.5, d: 8 },
  { x: -0.5, z: -7, w: 8.5, d: 2.5 },
  { x: 8, z: 0, w: 3, d: 9 }
];
function getPitBounds() {
  return PITS.map((p) => ({
    minX: p.x - p.w / 2,
    maxX: p.x + p.w / 2,
    minZ: p.z - p.d / 2,
    maxZ: p.z + p.d / 2
  }));
}
function getCollisionBounds() {
  const bounds = [];
  for (const o of OBSTACLES) {
    bounds.push({
      minX: o.x - o.w / 2,
      maxX: o.x + o.w / 2,
      minZ: o.z - o.d / 2,
      maxZ: o.z + o.d / 2
    });
  }
  const h = ARENA_HALF;
  const t = WALL_THICKNESS;
  bounds.push({ minX: -h - t / 2, maxX: h + t / 2, minZ: h - t / 2, maxZ: h + t / 2 });
  bounds.push({ minX: -h - t / 2, maxX: h + t / 2, minZ: -h - t / 2, maxZ: -h + t / 2 });
  bounds.push({ minX: h - t / 2, maxX: h + t / 2, minZ: -h - t / 2, maxZ: h + t / 2 });
  bounds.push({ minX: -h - t / 2, maxX: -h + t / 2, minZ: -h - t / 2, maxZ: h + t / 2 });
  return bounds;
}

// src/engine/renderer.ts
var scene;
var camera;
var renderer;
var baseFrustum = 12;
var currentFrustum = 12;
var cameraOffset = new THREE.Vector3(20, 20, 20);
var obstacleMeshes = [];
var wallMeshes = [];
var pitMeshes = [];
var shakeRemaining = 0;
var shakeIntensity = 0;
var _camTarget = new THREE.Vector3();
var _unprojectVec = new THREE.Vector3();
var _camDir = new THREE.Vector3();
function initRenderer() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(657946);
  scene.fog = new THREE.Fog(657946, 30, 60);
  const { w, h } = getViewportSize();
  const aspect = w / h;
  camera = new THREE.OrthographicCamera(
    -baseFrustum * aspect,
    baseFrustum * aspect,
    baseFrustum,
    -baseFrustum,
    0.1,
    100
  );
  camera.position.copy(cameraOffset);
  camera.lookAt(0, 0, 0);
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (hasTouch) applyFrustum(8);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.body.prepend(renderer.domElement);
  const ambient = new THREE.AmbientLight(6710954, 0.4);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(16772829, 0.8);
  dirLight.position.set(10, 15, 10);
  scene.add(dirLight);
  const rimLight = new THREE.DirectionalLight(4491519, 0.3);
  rimLight.position.set(-10, 5, -10);
  scene.add(rimLight);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 1710638, roughness: 0.9, metalness: 0.1 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const grid = new THREE.GridHelper(60, 30, 2771530, 1714746);
  grid.position.y = 0.01;
  scene.add(grid);
  createObstacles();
  createPits();
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", () => {
    setTimeout(onResize, 150);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onResize);
  }
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
    color: 2763338,
    emissive: 2241365,
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
  const wallMat = new THREE.MeshStandardMaterial({
    color: 1710638,
    emissive: 3359846,
    emissiveIntensity: 0.4,
    roughness: 0.8
  });
  for (const zSign of [-1, 1]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(ARENA_HALF * 2 + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS),
      wallMat
    );
    wall.position.set(0, WALL_HEIGHT / 2, zSign * ARENA_HALF);
    scene.add(wall);
    wallMeshes.push(wall);
  }
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
    color: 16720452,
    transparent: true,
    opacity: 0.8
  });
  for (const p of PITS) {
    const voidMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(p.w, p.d),
      new THREE.MeshBasicMaterial({ color: 0 })
    );
    voidMesh.rotation.x = -Math.PI / 2;
    voidMesh.position.set(p.x, -0.05, p.z);
    scene.add(voidMesh);
    pitMeshes.push(voidMesh);
    const nEdge = new THREE.Mesh(
      new THREE.BoxGeometry(p.w + edgeThickness * 2, edgeHeight, edgeThickness),
      edgeMat
    );
    nEdge.position.set(p.x, 0.01, p.z + p.d / 2);
    scene.add(nEdge);
    pitMeshes.push(nEdge);
    const sEdge = new THREE.Mesh(
      new THREE.BoxGeometry(p.w + edgeThickness * 2, edgeHeight, edgeThickness),
      edgeMat
    );
    sEdge.position.set(p.x, 0.01, p.z - p.d / 2);
    scene.add(sEdge);
    pitMeshes.push(sEdge);
    const eEdge = new THREE.Mesh(
      new THREE.BoxGeometry(edgeThickness, edgeHeight, p.d),
      edgeMat
    );
    eEdge.position.set(p.x + p.w / 2, 0.01, p.z);
    scene.add(eEdge);
    pitMeshes.push(eEdge);
    const wEdge = new THREE.Mesh(
      new THREE.BoxGeometry(edgeThickness, edgeHeight, p.d),
      edgeMat
    );
    wEdge.position.set(p.x - p.w / 2, 0.01, p.z);
    scene.add(wEdge);
    pitMeshes.push(wEdge);
  }
}
function rebuildArenaVisuals() {
  createObstacles();
  createPits();
}
function getViewportSize() {
  if (window.visualViewport) {
    return { w: window.visualViewport.width, h: window.visualViewport.height };
  }
  return { w: window.innerWidth, h: window.innerHeight };
}
function onResize() {
  const { w, h } = getViewportSize();
  applyFrustum(currentFrustum);
  renderer.setSize(w, h);
}
function applyFrustum(f) {
  const { w, h } = getViewportSize();
  const aspect = w / h;
  camera.left = -f * aspect;
  camera.right = f * aspect;
  camera.top = f;
  camera.bottom = -f;
  camera.updateProjectionMatrix();
  currentFrustum = f;
}
function setZoom(frustum) {
  applyFrustum(Math.max(8, Math.min(30, frustum)));
}
function resetZoom() {
  applyFrustum(baseFrustum);
}
function getCurrentFrustum() {
  return currentFrustum;
}
function updateCamera(playerPos2, dt) {
  camera.position.copy(playerPos2).add(cameraOffset);
  if (shakeRemaining > 0) {
    shakeRemaining -= dt * 1e3;
    const decay = Math.max(0, shakeRemaining / 150);
    const amt = shakeIntensity * decay;
    camera.position.x += (Math.random() - 0.5) * amt * 0.1;
    camera.position.z += (Math.random() - 0.5) * amt * 0.1;
  }
  camera.lookAt(playerPos2);
}
function screenShake(intensity, durationMs = 100) {
  shakeIntensity = intensity;
  shakeRemaining = durationMs;
}
function screenToWorld(ndcX, ndcY) {
  _unprojectVec.set(ndcX, ndcY, 0);
  _unprojectVec.unproject(camera);
  _camDir.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const t = -_unprojectVec.y / _camDir.y;
  return new THREE.Vector3(
    _unprojectVec.x + _camDir.x * t,
    0,
    _unprojectVec.z + _camDir.z * t
  );
}
function getScene() {
  return scene;
}
function getCamera() {
  return camera;
}
function getRendererInstance() {
  return renderer;
}

// src/config/player.ts
var PLAYER = {
  maxHealth: 100,
  speed: 5,
  fireRate: 410,
  projectile: { speed: 16, damage: 10, color: 4521864, size: 0.2 },
  size: { radius: 0.35, height: 1.2 }
};

// src/config/abilities.ts
var ABILITIES = {
  dash: {
    name: "Shadow Dash",
    key: "Space",
    cooldown: 3e3,
    duration: 200,
    distance: 5,
    curve: "easeOut",
    invincible: true,
    iFrameStart: 0,
    iFrameEnd: 200,
    directionSource: "movement",
    afterimageCount: 3,
    afterimageFadeDuration: 300,
    ghostColor: 4521898,
    trailColor: 4521864,
    screenShakeOnStart: 1.5,
    canShootDuring: false,
    canAbilityCancel: false,
    endLag: 50,
    description: "Dash forward, briefly invincible"
  },
  ultimate: {
    name: "Force Push",
    key: "E",
    cooldown: 5e3,
    chargeTimeMs: 1500,
    minLength: 3,
    maxLength: 12,
    width: 3,
    minKnockback: 1.5,
    maxKnockback: 5,
    color: 4521898,
    telegraphOpacity: 0.3,
    chargeMoveSpeedMult: 0.4,
    description: "Charge a directional push \u2014 hold to extend range"
  }
};

// src/engine/pools.ts
var ObjectPool = class {
  constructor(createFn, initialSize = 50) {
    this.pool = [];
    this.active = [];
    this.createFn = createFn;
    for (let i = 0; i < initialSize; i++) {
      const obj = createFn();
      obj.mesh.visible = false;
      this.pool.push(obj);
    }
  }
  acquire() {
    let obj = this.pool.pop();
    if (!obj) {
      obj = this.createFn();
    }
    obj.mesh.visible = true;
    this.active.push(obj);
    return obj;
  }
  release(obj) {
    obj.mesh.visible = false;
    const idx = this.active.indexOf(obj);
    if (idx !== -1) {
      const last = this.active.length - 1;
      if (idx !== last) this.active[idx] = this.active[last];
      this.active.length = last;
    }
    this.pool.push(obj);
  }
  releaseAll() {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const obj = this.active[i];
      obj.mesh.visible = false;
      this.pool.push(obj);
    }
    this.active.length = 0;
  }
  getActive() {
    return this.active;
  }
};

// src/entities/projectile.ts
var playerPool;
var enemyPool;
var sceneRef;
var basePlayerProjSize;
function initProjectilePool(scene2) {
  sceneRef = scene2;
  basePlayerProjSize = PLAYER.projectile.size;
  const playerProjGeo = new THREE.SphereGeometry(basePlayerProjSize, 6, 4);
  const playerProjMat = new THREE.MeshStandardMaterial({
    color: PLAYER.projectile.color,
    emissive: PLAYER.projectile.color,
    emissiveIntensity: 0.8
  });
  playerPool = new ObjectPool(() => {
    const mesh = new THREE.Mesh(playerProjGeo, playerProjMat.clone());
    scene2.add(mesh);
    return { mesh, dir: new THREE.Vector3(), speed: 0, damage: 0, life: 0, isEnemy: false };
  }, 80);
  const enemyProjGeo = new THREE.SphereGeometry(0.1, 6, 4);
  enemyPool = new ObjectPool(() => {
    const mesh = new THREE.Mesh(
      enemyProjGeo,
      new THREE.MeshStandardMaterial({
        color: 16729190,
        emissive: 16720452,
        emissiveIntensity: 0.8
      })
    );
    scene2.add(mesh);
    return { mesh, dir: new THREE.Vector3(), speed: 0, damage: 0, life: 0, isEnemy: true };
  }, 40);
}
function fireProjectile(origin, direction, config, isEnemy) {
  if (isEnemy === void 0) isEnemy = false;
  const pool2 = isEnemy ? enemyPool : playerPool;
  const p = pool2.acquire();
  p.mesh.position.set(origin.x, 0.8, origin.z);
  p.dir.copy(direction).normalize();
  p.speed = config.speed;
  p.damage = config.damage;
  p.life = 0;
  if (!isEnemy && basePlayerProjSize) {
    const s = PLAYER.projectile.size / basePlayerProjSize;
    p.mesh.scale.set(s, s, s);
  }
  if (isEnemy && config.color) {
    p.mesh.material.color.setHex(config.color);
    p.mesh.material.emissive.setHex(config.color);
  }
  return p;
}
function updateProjectiles(dt) {
  const maxLife = 2;
  for (const pool2 of [playerPool, enemyPool]) {
    const active2 = pool2.getActive();
    for (let i = active2.length - 1; i >= 0; i--) {
      const p = active2[i];
      p.mesh.position.x += p.dir.x * p.speed * dt;
      p.mesh.position.z += p.dir.z * p.speed * dt;
      p.life += dt;
      if (p.life > maxLife) {
        pool2.release(p);
      }
    }
  }
}
function getPlayerProjectiles() {
  return playerPool ? playerPool.getActive() : [];
}
function getEnemyProjectiles() {
  return enemyPool ? enemyPool.getActive() : [];
}
function releaseProjectile(p) {
  if (p.isEnemy) {
    enemyPool.release(p);
  } else {
    playerPool.release(p);
  }
}
function releaseAllProjectiles() {
  if (playerPool) playerPool.releaseAll();
  if (enemyPool) enemyPool.releaseAll();
}

// src/ui/damageNumbers.ts
var canvas;
var ctx;
var POOL_SIZE = 40;
var LIFETIME = 600;
var FLOAT_DISTANCE = 40;
var pool = [];
for (let i = 0; i < POOL_SIZE; i++) {
  pool.push({ active: false, x: 0, y: 0, value: 0, life: 0, color: "#ffffff" });
}
var _projVec = new THREE.Vector3();
function initDamageNumbers() {
  canvas = document.createElement("canvas");
  canvas.id = "damage-canvas";
  canvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:15;";
  document.body.appendChild(canvas);
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
}
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
function spawnDamageNumber(worldX, worldZ, value, color) {
  if (!color) color = "#ffffff";
  let slot = null;
  for (let i = 0; i < POOL_SIZE; i++) {
    if (!pool[i].active) {
      slot = pool[i];
      break;
    }
  }
  if (!slot) {
    let oldest = pool[0];
    for (let i = 1; i < POOL_SIZE; i++) {
      if (pool[i].life > oldest.life) oldest = pool[i];
    }
    slot = oldest;
  }
  const camera2 = getCamera();
  _projVec.set(worldX, 1.5, worldZ);
  _projVec.project(camera2);
  slot.active = true;
  slot.x = (_projVec.x * 0.5 + 0.5) * canvas.width;
  slot.y = (-_projVec.y * 0.5 + 0.5) * canvas.height;
  slot.value = typeof value === "string" ? value : Math.round(value);
  slot.life = 0;
  slot.color = color;
  slot.x += (Math.random() - 0.5) * 20;
}
function updateDamageNumbers(dt) {
  if (!ctx) ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const dtMs = dt * 1e3;
  for (let i = 0; i < POOL_SIZE; i++) {
    const slot = pool[i];
    if (!slot.active) continue;
    slot.life += dtMs;
    if (slot.life >= LIFETIME) {
      slot.active = false;
      continue;
    }
    const t = slot.life / LIFETIME;
    const alpha = 1 - t * t;
    const yOffset = -FLOAT_DISTANCE * t;
    const scale = 1 + t * 0.3;
    const x = slot.x;
    const y = slot.y + yOffset;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${Math.round(16 * scale)}px 'SF Mono', 'Consolas', monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = slot.color;
    ctx.fillText(slot.value, x, y);
    ctx.restore();
  }
}
function clearDamageNumbers() {
  for (let i = 0; i < POOL_SIZE; i++) {
    pool[i].active = false;
  }
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// src/engine/aoeTelegraph.ts
var sceneRef2;
var activeTelegraphs = [];
var pendingEffects = [];
var ringGeo;
var planeGeo;
function easeOutQuad(t) {
  return t * (2 - t);
}
function initAoeTelegraph(scene2) {
  sceneRef2 = scene2;
}
function createAoeRing(x, z, maxRadius, durationMs, color) {
  if (!ringGeo) {
    ringGeo = new THREE.RingGeometry(0.8, 1, 32);
    ringGeo.rotateX(-Math.PI / 2);
  }
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(ringGeo, mat);
  mesh.position.set(x, 0.05, z);
  mesh.scale.set(0.01, 0.01, 0.01);
  sceneRef2.add(mesh);
  const telegraph = {
    type: "ring",
    mesh,
    material: mat,
    center: { x, z },
    maxRadius,
    duration: durationMs,
    elapsed: 0,
    color
  };
  activeTelegraphs.push(telegraph);
  return telegraph;
}
function createAoeRect(x, z, width, height, rotation, durationMs, color) {
  if (!planeGeo) {
    planeGeo = new THREE.PlaneGeometry(1, 1);
    planeGeo.rotateX(-Math.PI / 2);
  }
  const group = new THREE.Group();
  group.position.set(x, 0.05, z);
  group.rotation.y = rotation;
  const fillMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    // ramps up over first 30%
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const fillMesh = new THREE.Mesh(planeGeo, fillMat);
  fillMesh.scale.set(width * 0.8, 1, height * 0.8);
  group.add(fillMesh);
  const edgeGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(width, height));
  edgeGeo.rotateX(-Math.PI / 2);
  const borderMat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
    depthWrite: false
  });
  const borderMesh = new THREE.LineSegments(edgeGeo, borderMat);
  group.add(borderMesh);
  sceneRef2.add(group);
  const telegraph = {
    type: "rect",
    mesh: group,
    fillMesh,
    fillMaterial: fillMat,
    borderMesh,
    borderMaterial: borderMat,
    borderEdgeGeo: edgeGeo,
    center: { x, z },
    width,
    height,
    rotation,
    duration: durationMs,
    elapsed: 0,
    color
  };
  activeTelegraphs.push(telegraph);
  return telegraph;
}
function isInRotatedRect(ex, ez, cx, cz, w, h, rotation, padding) {
  const pad = padding || 0;
  const dx = ex - cx;
  const dz = ez - cz;
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return Math.abs(localX) < w / 2 + pad && Math.abs(localZ) < h / 2 + pad;
}
function updateAoeTelegraphs(dt) {
  const dtMs = dt * 1e3;
  for (let i = activeTelegraphs.length - 1; i >= 0; i--) {
    const t = activeTelegraphs[i];
    t.elapsed += dtMs;
    const progress = Math.min(t.elapsed / t.duration, 1);
    if (t.type === "ring") {
      updateRing(t, progress);
    } else if (t.type === "rect") {
      updateRect(t, progress);
    }
    if (progress >= 1) {
      removeTelegraph(t);
      activeTelegraphs.splice(i, 1);
    }
  }
}
function updateRing(t, progress) {
  const easedProgress = easeOutQuad(progress);
  const currentRadius = t.maxRadius * easedProgress;
  t.mesh.scale.set(currentRadius, currentRadius, currentRadius);
  t.material.opacity = 0.8 * (1 - progress);
}
function updateRect(t, progress) {
  const easedProgress = easeOutQuad(progress);
  let fillOpacity;
  if (progress < 0.3) {
    fillOpacity = 0.3 * (progress / 0.3);
  } else {
    fillOpacity = 0.3 * (1 - (progress - 0.3) / 0.7);
  }
  t.fillMaterial.opacity = Math.max(0, fillOpacity);
  const scaleMult = 0.8 + 0.2 * easedProgress;
  t.fillMesh.scale.set(t.width * scaleMult, 1, t.height * scaleMult);
  const freq = 2 + 6 * progress;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() * freq * 628e-5);
  t.borderMaterial.opacity = 0.4 + 0.5 * pulse;
  const flashThreshold = 1 - 100 / t.duration;
  if (progress > flashThreshold) {
    const flashProgress = (progress - flashThreshold) / (1 - flashThreshold);
    t.fillMaterial.opacity = 0.3 + 0.5 * flashProgress;
    t.borderMaterial.opacity = 0.8 + 0.2 * flashProgress;
    const r = (t.color >> 16 & 255) / 255;
    const g = (t.color >> 8 & 255) / 255;
    const b = (t.color & 255) / 255;
    t.fillMaterial.color.setRGB(
      r + (1 - r) * flashProgress * 0.6,
      g + (1 - g) * flashProgress * 0.6,
      b + (1 - b) * flashProgress * 0.6
    );
    t.borderMaterial.color.setRGB(
      r + (1 - r) * flashProgress * 0.6,
      g + (1 - g) * flashProgress * 0.6,
      b + (1 - b) * flashProgress * 0.6
    );
  } else if (progress > 0.8) {
    const fadeProgress = (progress - 0.8) / (flashThreshold - 0.8);
    t.borderMaterial.opacity *= 1 - fadeProgress * 0.5;
    t.fillMaterial.opacity *= 1 - fadeProgress * 0.5;
  }
}
function removeTelegraph(t) {
  if (t.type === "ring") {
    t.material.dispose();
    sceneRef2.remove(t.mesh);
  } else if (t.type === "rect") {
    t.fillMaterial.dispose();
    t.borderMaterial.dispose();
    t.borderEdgeGeo.dispose();
    sceneRef2.remove(t.mesh);
  }
}
function schedulePendingEffect(enemy, delayMs, callback) {
  pendingEffects.push({ enemy, delay: delayMs, callback });
}
function scheduleCallback(delayMs, callback) {
  pendingEffects.push({ enemy: null, delay: delayMs, callback });
}
function updatePendingEffects(dt) {
  const dtMs = dt * 1e3;
  for (let i = pendingEffects.length - 1; i >= 0; i--) {
    const p = pendingEffects[i];
    p.delay -= dtMs;
    if (p.delay <= 0) {
      if (p.enemy) {
        p.callback(p.enemy);
      } else {
        p.callback();
      }
      pendingEffects.splice(i, 1);
    }
  }
}
function applyAoeEffect({ x, z, radius, durationMs, color, label, effectFn, gameState: gameState2, excludeEnemy }) {
  createAoeRing(x, z, radius, durationMs, color);
  const colorStr = "#" + color.toString(16).padStart(6, "0");
  for (const enemy of gameState2.enemies) {
    if (enemy === excludeEnemy) continue;
    const dx = enemy.pos.x - x;
    const dz = enemy.pos.z - z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < radius) {
      const delayMs = dist / radius * durationMs;
      schedulePendingEffect(enemy, delayMs, (e) => {
        effectFn(e);
        e.flashTimer = 200;
        e.bodyMesh.material.emissive.setHex(color);
        if (e.headMesh) e.headMesh.material.emissive.setHex(color);
        if (label) {
          spawnDamageNumber(e.pos.x, e.pos.z, label, colorStr);
        }
      });
    }
  }
}
function applyAoeRectEffect({
  x,
  z,
  width,
  height,
  rotation,
  telegraphDurationMs,
  lingerDurationMs,
  color,
  damage,
  playerDamageFn,
  enemyDamageFn,
  gameState: gameState2,
  excludeEnemy
}) {
  createAoeRect(x, z, width, height, rotation, telegraphDurationMs, color);
  const colorStr = "#" + color.toString(16).padStart(6, "0");
  scheduleCallback(telegraphDurationMs, () => {
    createAoeRect(x, z, width, height, rotation, lingerDurationMs, color);
    for (const enemy of gameState2.enemies) {
      if (enemy === excludeEnemy) continue;
      const enemyRadius = enemy.config && enemy.config.size ? enemy.config.size.radius : 0;
      if (isInRotatedRect(enemy.pos.x, enemy.pos.z, x, z, width, height, rotation, enemyRadius)) {
        if (enemyDamageFn) {
          enemyDamageFn(enemy);
        }
        enemy.flashTimer = 200;
        enemy.bodyMesh.material.emissive.setHex(color);
        if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(color);
        spawnDamageNumber(enemy.pos.x, enemy.pos.z, damage, colorStr);
      }
    }
    if (playerDamageFn) {
      playerDamageFn(x, z, width, height, rotation);
    }
  });
}
function clearAoeTelegraphs() {
  for (const t of activeTelegraphs) {
    removeTelegraph(t);
  }
  activeTelegraphs.length = 0;
  pendingEffects.length = 0;
}

// src/config/enemies.ts
var ENEMY_TYPES = {
  goblin: {
    name: "Goblin",
    health: 30,
    speed: 2.45,
    damage: 10,
    attackRange: 1.5,
    attackRate: 800,
    behavior: "rush",
    knockbackResist: 0,
    color: 16729190,
    emissive: 16720452,
    size: { radius: 0.3, height: 0.8 },
    drops: { currency: { min: 1, max: 3 }, healthChance: 0.1 },
    rush: { stopDistance: 0.5 },
    pitLeap: {
      edgeTimeRequired: 1500,
      leapSpeed: 7,
      arcHeight: 2,
      cooldown: 4e3
    }
  },
  skeletonArcher: {
    name: "Skeleton Archer",
    health: 20,
    speed: 1.4,
    damage: 15,
    attackRange: 12,
    attackRate: 2500,
    behavior: "kite",
    knockbackResist: 0.1,
    color: 11176191,
    emissive: 8930508,
    size: { radius: 0.25, height: 1 },
    drops: { currency: { min: 2, max: 4 }, healthChance: 0.05 },
    kite: { preferredRangeMult: 0.7, retreatBuffer: 1, advanceBuffer: 3 },
    sniper: {
      telegraphDuration: 800,
      shotWidth: 1.2,
      shotLength: 14,
      damage: 15,
      color: 11158783,
      lingerDuration: 200,
      slowDuration: 1e3,
      slowMult: 0.5
    }
  },
  iceMortarImp: {
    name: "Ice Mortar Imp",
    health: 25,
    speed: 1.6,
    damage: 12,
    attackRange: 15.5,
    attackRate: 3e3,
    behavior: "mortar",
    knockbackResist: 0.1,
    color: 4513279,
    emissive: 13391104,
    size: { radius: 0.3, height: 0.9 },
    drops: { currency: { min: 2, max: 5 }, healthChance: 0.08 },
    kite: { preferredRangeMult: 0.65, retreatBuffer: 1.5, advanceBuffer: 3 },
    mortar: {
      aimDuration: 900,
      projectileSpeed: 11,
      arcHeight: 6,
      blastRadius: 2.5,
      damage: 18,
      color: 5765887,
      inaccuracy: 1.5,
      slowDuration: 800,
      slowMult: 0.6,
      explosionDuration: 300,
      circleStartScale: 0.25,
      circleScaleTime: 800,
      icePatch: {
        enabled: true,
        duration: 2e3,
        color: 8454143,
        speedMult: 2,
        knockbackMult: 2,
        affectsPlayer: true,
        affectsEnemies: true
      }
    }
  },
  stoneGolem: {
    name: "Stone Golem",
    health: 80,
    speed: 1.05,
    damage: 25,
    attackRange: 2,
    attackRate: 1200,
    behavior: "tank",
    knockbackResist: 0.6,
    color: 16746547,
    emissive: 2263244,
    size: { radius: 0.5, height: 1.4 },
    drops: { currency: { min: 3, max: 6 }, healthChance: 0.2 },
    tank: {
      chargeSpeedMult: 3,
      chargeDuration: 500,
      chargeCooldownMin: 3e3,
      chargeCooldownMax: 5e3,
      chargeMinDist: 2,
      chargeMaxDist: 10,
      chargeDamageMult: 1.5,
      telegraphDuration: 300
    },
    shield: {
      maxHealth: 40,
      stunRadius: 5,
      stunDuration: 1500,
      breakRingDuration: 400,
      color: 8974079,
      emissive: 4508927,
      opacity: 0.35
    },
    deathExplosion: {
      radius: 4,
      damage: 20,
      color: 4513279,
      ringDuration: 400,
      stunDuration: 0,
      telegraphDuration: 1200
    }
  }
};

// src/entities/enemy.ts
var sceneRef3;
var shieldGeo;
var _bodyGeoCache = {};
var _headGeoCache = {};
var _mortarFillGeoShared = null;
var _deathFillGeoShared = null;
function initEnemySystem(scene2) {
  sceneRef3 = scene2;
}
function createShieldMesh(cfg) {
  const shieldCfg = cfg.shield;
  const radius = cfg.size.radius * 1.8;
  if (!shieldGeo) shieldGeo = new THREE.SphereGeometry(1, 16, 12);
  const mat = new THREE.MeshStandardMaterial({
    color: shieldCfg.color || 8974079,
    emissive: shieldCfg.emissive || 4508927,
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: shieldCfg.opacity || 0.35,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(shieldGeo, mat);
  mesh.scale.set(radius, radius, radius);
  return mesh;
}
function spawnEnemy(typeName, position, gameState2) {
  const cfg = ENEMY_TYPES[typeName];
  if (!cfg) return null;
  const group = new THREE.Group();
  if (!_bodyGeoCache[typeName]) {
    _bodyGeoCache[typeName] = new THREE.CylinderGeometry(cfg.size.radius, cfg.size.radius, cfg.size.height * 0.6, 6);
  }
  const bodyMesh = new THREE.Mesh(
    _bodyGeoCache[typeName],
    new THREE.MeshStandardMaterial({
      color: cfg.color,
      emissive: cfg.emissive,
      emissiveIntensity: 0.5
    })
  );
  bodyMesh.position.y = cfg.size.height * 0.3;
  group.add(bodyMesh);
  if (!_headGeoCache[typeName]) {
    _headGeoCache[typeName] = new THREE.SphereGeometry(cfg.size.radius * 0.7, 6, 4);
  }
  const headMesh = new THREE.Mesh(
    _headGeoCache[typeName],
    new THREE.MeshStandardMaterial({
      color: cfg.color,
      emissive: cfg.emissive,
      emissiveIntensity: 0.6
    })
  );
  headMesh.position.y = cfg.size.height * 0.75;
  group.add(headMesh);
  group.position.copy(position);
  sceneRef3.add(group);
  const enemy = {
    mesh: group,
    bodyMesh,
    headMesh,
    type: typeName,
    config: cfg,
    health: cfg.health,
    pos: position.clone(),
    behavior: cfg.behavior,
    lastAttackTime: 0,
    flashTimer: 0,
    stunTimer: 0,
    // Tank-specific
    chargeTimer: 0,
    chargeCooldown: 4e3,
    isCharging: false,
    chargeDir: new THREE.Vector3(),
    // Shield
    shieldHealth: 0,
    shieldActive: false,
    shieldMesh: null,
    // Slow debuff
    slowTimer: 0,
    slowMult: 1,
    // speed multiplier while slowed (e.g., 0.5 = half speed)
    // Sniper (kite behavior)
    sniperPhase: "idle",
    // 'idle' | 'telegraphing' | 'cooldown'
    sniperTimer: 0,
    sniperAimAngle: 0,
    // locked aim direction (radians)
    sniperAimCenter: { x: 0, z: 0 },
    // center of the damage rect
    // Mortar
    mortarPhase: "idle",
    // 'idle' | 'aiming' | 'cooldown'
    mortarTimer: 0,
    mortarTarget: { x: 0, z: 0 },
    // aimed landing position
    mortarArcLine: null,
    // THREE.Line for aim arc preview
    mortarGroundCircle: null,
    // THREE.Mesh for persistent ground circle
    // Pit / edge-slide
    wasDeflected: false,
    // true when movement was deflected by collision (edge-sliding)
    fellInPit: false,
    // true when killed by falling into a pit
    // Pit leap (goblins)
    pitEdgeTimer: 0,
    // ms spent hugging a pit edge (wasDeflected near pit)
    isLeaping: false,
    // true during arc leap over pit
    leapElapsed: 0,
    // time into leap
    leapDuration: 0,
    // total flight time
    leapStartX: 0,
    leapStartZ: 0,
    leapTargetX: 0,
    leapTargetZ: 0,
    leapArcHeight: 0,
    leapCooldown: 0
    // ms until next leap allowed
  };
  if (cfg.shield && cfg.shield.maxHealth > 0) {
    enemy.shieldHealth = cfg.shield.maxHealth;
    enemy.shieldActive = true;
    enemy.shieldMesh = createShieldMesh(cfg);
    enemy.shieldMesh.position.y = cfg.size.height * 0.5;
    group.add(enemy.shieldMesh);
  }
  gameState2.enemies.push(enemy);
  return enemy;
}
var _toPlayer = new THREE.Vector3();
var _collisionBounds = null;
var _pitBoundsCache = null;
function pitAt(x, z, margin) {
  if (!_pitBoundsCache) _pitBoundsCache = getPitBounds();
  for (const pit of _pitBoundsCache) {
    if (x > pit.minX - margin && x < pit.maxX + margin && z > pit.minZ - margin && z < pit.maxZ + margin) {
      return pit;
    }
  }
  return null;
}
function pitAwareDir(x, z, dx, dz, lookahead) {
  const ahead = pitAt(x + dx * lookahead, z + dz * lookahead, 0.5);
  if (!ahead) return { dx, dz };
  const pcx = (ahead.minX + ahead.maxX) / 2;
  const pcz = (ahead.minZ + ahead.maxZ) / 2;
  const ax = x + dz * lookahead, az = z + -dx * lookahead;
  const bx = x + -dz * lookahead, bz = z + dx * lookahead;
  const distA = (ax - pcx) * (ax - pcx) + (az - pcz) * (az - pcz);
  const distB = (bx - pcx) * (bx - pcx) + (bz - pcz) * (bz - pcz);
  if (distA >= distB) {
    if (!pitAt(ax, az, 0.5)) return { dx: dz, dz: -dx };
    if (!pitAt(bx, bz, 0.5)) return { dx: -dz, dz: dx };
  } else {
    if (!pitAt(bx, bz, 0.5)) return { dx: -dz, dz: dx };
    if (!pitAt(ax, az, 0.5)) return { dx: dz, dz: -dx };
  }
  return { dx: 0, dz: 0 };
}
function raycastTerrainDist(ox, oz, dx, dz, maxDist) {
  if (!_collisionBounds) _collisionBounds = getCollisionBounds();
  let closest = maxDist;
  for (const box of _collisionBounds) {
    let tmin, tmax;
    if (Math.abs(dx) < 1e-8) {
      if (ox < box.minX || ox > box.maxX) continue;
      tmin = -Infinity;
      tmax = Infinity;
    } else {
      const invDx = 1 / dx;
      let t1 = (box.minX - ox) * invDx;
      let t2 = (box.maxX - ox) * invDx;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = t1;
      tmax = t2;
    }
    if (Math.abs(dz) < 1e-8) {
      if (oz < box.minZ || oz > box.maxZ) continue;
    } else {
      const invDz = 1 / dz;
      let t1 = (box.minZ - oz) * invDz;
      let t2 = (box.maxZ - oz) * invDz;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
    }
    if (tmax < 0 || tmin > tmax) continue;
    const t = tmin > 0 ? tmin : tmax;
    if (t > 0 && t < closest) {
      closest = t;
    }
  }
  return closest;
}
function updateEnemies(dt, playerPos2, gameState2) {
  for (let i = gameState2.enemies.length - 1; i >= 0; i--) {
    const enemy = gameState2.enemies[i];
    if (enemy.isLeaping) {
      updateLeap(enemy, dt);
    } else if (enemy.stunTimer > 0) {
      enemy.stunTimer -= dt * 1e3;
    } else {
      switch (enemy.behavior) {
        case "rush":
          behaviorRush(enemy, playerPos2, dt);
          break;
        case "kite":
          behaviorKite(enemy, playerPos2, dt, gameState2);
          break;
        case "tank":
          behaviorTank(enemy, playerPos2, dt);
          break;
        case "mortar":
          behaviorMortar(enemy, playerPos2, dt, gameState2);
          break;
      }
    }
    enemy.pos.x = Math.max(-19, Math.min(19, enemy.pos.x));
    enemy.pos.z = Math.max(-19, Math.min(19, enemy.pos.z));
    if (enemy.isLeaping) {
      enemy.mesh.position.x = enemy.pos.x;
      enemy.mesh.position.z = enemy.pos.z;
    } else {
      enemy.mesh.position.copy(enemy.pos);
    }
    if (enemy.flashTimer > 0) {
      enemy.flashTimer -= dt * 1e3;
      if (enemy.flashTimer <= 0) {
        enemy.bodyMesh.material.emissive.setHex(enemy.config.emissive);
        if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(enemy.config.emissive);
      }
    }
    if (enemy.slowTimer > 0) {
      enemy.slowTimer -= dt * 1e3;
      if (enemy.slowTimer <= 0) {
        enemy.slowTimer = 0;
        enemy.slowMult = 1;
      }
    }
    if (enemy.shieldActive && enemy.shieldMesh) {
      const shieldCfg = enemy.config.shield;
      const ratio = enemy.shieldHealth / shieldCfg.maxHealth;
      const baseOpacity = shieldCfg.opacity || 0.35;
      let opacity = baseOpacity * (0.3 + 0.7 * ratio);
      const r = Math.round(68 + (255 - 68) * (1 - ratio));
      const g = Math.round(204 * ratio);
      const b = Math.round(255 * ratio);
      enemy.shieldMesh.material.emissive.setRGB(r / 255, g / 255, b / 255);
      if (ratio < 0.25) {
        const flicker = 0.5 + 0.5 * Math.sin(performance.now() * 0.06);
        opacity *= 0.5 + 0.5 * flicker;
      } else {
        opacity += 0.05 * Math.sin(performance.now() * 3e-3);
      }
      enemy.shieldMesh.material.opacity = Math.max(0.05, opacity);
    }
    if (enemy.deathTimer > 0) {
      enemy.deathTimer -= dt * 1e3;
      updateDeathTelegraph(enemy, dt);
      enemy.mesh.position.copy(enemy.pos);
      if (enemy.fellInPit) {
        removeDeathTelegraph(enemy);
        if (enemy.shieldMesh) {
          enemy.shieldMesh.geometry.dispose();
          enemy.shieldMesh.material.dispose();
        }
        removeMortarArcLine(enemy);
        removeMortarGroundCircle(enemy);
        sceneRef3.remove(enemy.mesh);
        gameState2.enemies.splice(i, 1);
        const drops = enemy.config.drops;
        gameState2.currency += Math.floor(
          drops.currency.min + Math.random() * (drops.currency.max - drops.currency.min + 1)
        );
        continue;
      }
      if (enemy.deathTimer <= 0) {
        if (enemy.config.deathExplosion && !enemy.fellInPit) {
          onDeathExplosion(enemy, gameState2);
        }
        removeDeathTelegraph(enemy);
        if (enemy.shieldMesh) {
          enemy.shieldMesh.geometry.dispose();
          enemy.shieldMesh.material.dispose();
        }
        removeMortarArcLine(enemy);
        removeMortarGroundCircle(enemy);
        sceneRef3.remove(enemy.mesh);
        gameState2.enemies.splice(i, 1);
        const drops = enemy.config.drops;
        gameState2.currency += Math.floor(
          drops.currency.min + Math.random() * (drops.currency.max - drops.currency.min + 1)
        );
      }
      continue;
    }
    if (enemy.health <= 0) {
      const deathCfg = enemy.config.deathExplosion;
      if (deathCfg && deathCfg.telegraphDuration && !enemy.fellInPit) {
        enemy.deathTimer = deathCfg.telegraphDuration;
        enemy.stunTimer = deathCfg.telegraphDuration + 100;
        createDeathTelegraph(enemy);
        continue;
      }
      if (deathCfg && !enemy.fellInPit) {
        onDeathExplosion(enemy, gameState2);
      }
      if (enemy.shieldMesh) {
        enemy.shieldMesh.geometry.dispose();
        enemy.shieldMesh.material.dispose();
      }
      removeMortarArcLine(enemy);
      removeMortarGroundCircle(enemy);
      sceneRef3.remove(enemy.mesh);
      gameState2.enemies.splice(i, 1);
      const drops = enemy.config.drops;
      gameState2.currency += Math.floor(
        drops.currency.min + Math.random() * (drops.currency.max - drops.currency.min + 1)
      );
    }
  }
}
function behaviorRush(enemy, playerPos2, dt) {
  if (enemy.isLeaping) return;
  _toPlayer.subVectors(playerPos2, enemy.pos);
  _toPlayer.y = 0;
  const dist = _toPlayer.length();
  const stopDist = enemy.config.rush && enemy.config.rush.stopDistance || 0.5;
  if (dist > stopDist) {
    _toPlayer.normalize();
    const slideBoost = enemy.wasDeflected ? 1.175 : 1;
    const iceEffects = getIceEffects(enemy.pos.x, enemy.pos.z, false);
    const speed = enemy.config.speed * (enemy.slowTimer > 0 ? enemy.slowMult : 1) * slideBoost * iceEffects.speedMult;
    enemy.pos.x += _toPlayer.x * speed * dt;
    enemy.pos.z += _toPlayer.z * speed * dt;
  }
  if (dist > 0.1) {
    enemy.mesh.rotation.y = Math.atan2(-_toPlayer.x, -_toPlayer.z);
  }
  const leapCfg = enemy.config.pitLeap;
  if (!leapCfg) return;
  if (enemy.leapCooldown > 0) {
    enemy.leapCooldown -= dt * 1e3;
    enemy.pitEdgeTimer = 0;
    return;
  }
  if (enemy.wasDeflected && pitAt(enemy.pos.x, enemy.pos.z, 1)) {
    enemy.pitEdgeTimer += dt * 1e3;
  } else {
    enemy.pitEdgeTimer = 0;
  }
  if (enemy.pitEdgeTimer >= leapCfg.edgeTimeRequired) {
    startPitLeap(enemy, playerPos2, leapCfg);
  }
}
function startPitLeap(enemy, playerPos2, leapCfg) {
  const dx = playerPos2.x - enemy.pos.x;
  const dz = playerPos2.z - enemy.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.1) return;
  const dirX = dx / dist;
  const dirZ = dz / dist;
  let leapDist = 3;
  for (let probe = 1; probe <= 15; probe += 0.5) {
    const px = enemy.pos.x + dirX * probe;
    const pz = enemy.pos.z + dirZ * probe;
    if (!pitAt(px, pz, 0.3)) {
      leapDist = probe + 1;
      break;
    }
    leapDist = probe + 1;
  }
  leapDist = Math.min(leapDist, 12);
  enemy.isLeaping = true;
  enemy.leapStartX = enemy.pos.x;
  enemy.leapStartZ = enemy.pos.z;
  enemy.leapTargetX = enemy.pos.x + dirX * leapDist;
  enemy.leapTargetZ = enemy.pos.z + dirZ * leapDist;
  enemy.leapArcHeight = leapCfg.arcHeight || 3;
  enemy.leapElapsed = 0;
  enemy.pitEdgeTimer = 0;
  const flightDist = leapDist + 2 * enemy.leapArcHeight * enemy.leapArcHeight / Math.max(leapDist, 0.1);
  enemy.leapDuration = flightDist / (leapCfg.leapSpeed || 12);
}
function updateLeap(enemy, dt) {
  enemy.leapElapsed += dt;
  const t = Math.min(enemy.leapElapsed / enemy.leapDuration, 1);
  enemy.pos.x = enemy.leapStartX + (enemy.leapTargetX - enemy.leapStartX) * t;
  enemy.pos.z = enemy.leapStartZ + (enemy.leapTargetZ - enemy.leapStartZ) * t;
  const arcY = 4 * enemy.leapArcHeight * t * (1 - t);
  enemy.mesh.position.set(enemy.pos.x, arcY, enemy.pos.z);
  const dx = enemy.leapTargetX - enemy.leapStartX;
  const dz = enemy.leapTargetZ - enemy.leapStartZ;
  if (dx * dx + dz * dz > 0.01) {
    enemy.mesh.rotation.y = Math.atan2(-dx, -dz);
  }
  if (t >= 1) {
    enemy.isLeaping = false;
    enemy.leapCooldown = enemy.config.pitLeap && enemy.config.pitLeap.cooldown || 4e3;
    enemy.mesh.position.set(enemy.pos.x, 0, enemy.pos.z);
  }
}
function behaviorKite(enemy, playerPos2, dt, gameState2) {
  _toPlayer.subVectors(playerPos2, enemy.pos);
  _toPlayer.y = 0;
  const dist = _toPlayer.length();
  const kite = enemy.config.kite || {};
  const sniper = enemy.config.sniper || {};
  const preferredRange = enemy.config.attackRange * (kite.preferredRangeMult || 0.7);
  const isTelegraphing = enemy.sniperPhase === "telegraphing";
  if (!isTelegraphing) {
    const slideBoost = enemy.wasDeflected ? 1.175 : 1;
    const iceEffects = getIceEffects(enemy.pos.x, enemy.pos.z, false);
    const speed = enemy.config.speed * (enemy.slowTimer > 0 ? enemy.slowMult : 1) * slideBoost * iceEffects.speedMult;
    if (dist < preferredRange - (kite.retreatBuffer || 1)) {
      _toPlayer.normalize();
      const retreat = pitAwareDir(enemy.pos.x, enemy.pos.z, -_toPlayer.x, -_toPlayer.z, 2.5);
      enemy.pos.x += retreat.dx * speed * dt;
      enemy.pos.z += retreat.dz * speed * dt;
    } else if (dist > preferredRange + (kite.advanceBuffer || 3)) {
      _toPlayer.normalize();
      const advance = pitAwareDir(enemy.pos.x, enemy.pos.z, _toPlayer.x, _toPlayer.z, 2.5);
      enemy.pos.x += advance.dx * speed * dt;
      enemy.pos.z += advance.dz * speed * dt;
    }
  }
  if (isTelegraphing) {
    enemy.mesh.rotation.y = enemy.sniperAimAngle + Math.PI;
  } else if (dist > 0.1) {
    const nx = _toPlayer.x / dist;
    const nz = _toPlayer.z / dist;
    enemy.mesh.rotation.y = Math.atan2(-nx, -nz);
  }
  const now = performance.now();
  if (enemy.sniperPhase === "idle") {
    if (dist < enemy.config.attackRange && now - enemy.lastAttackTime > enemy.config.attackRate) {
      enemy.sniperPhase = "telegraphing";
      enemy.sniperTimer = sniper.telegraphDuration || 800;
      const aimAngle = Math.atan2(playerPos2.x - enemy.pos.x, playerPos2.z - enemy.pos.z);
      enemy.sniperAimAngle = aimAngle;
      const maxShotLength = sniper.shotLength || 14;
      const dirX = Math.sin(aimAngle);
      const dirZ = Math.cos(aimAngle);
      const terrainDist = raycastTerrainDist(enemy.pos.x, enemy.pos.z, dirX, dirZ, maxShotLength);
      const shotLength = Math.min(maxShotLength, terrainDist);
      enemy.sniperAimCenter.x = enemy.pos.x + dirX * (shotLength / 2);
      enemy.sniperAimCenter.z = enemy.pos.z + dirZ * (shotLength / 2);
      enemy.flashTimer = sniper.telegraphDuration || 800;
      enemy.bodyMesh.material.emissive.setHex(sniper.color || 11158783);
      if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(sniper.color || 11158783);
      const shotWidth = sniper.shotWidth || 1.2;
      const dmg = sniper.damage || 15;
      const color = sniper.color || 11158783;
      const lingerMs = sniper.lingerDuration || 200;
      applyAoeRectEffect({
        x: enemy.sniperAimCenter.x,
        z: enemy.sniperAimCenter.z,
        width: shotWidth,
        height: shotLength,
        rotation: aimAngle,
        telegraphDurationMs: sniper.telegraphDuration || 800,
        lingerDurationMs: lingerMs,
        color,
        damage: dmg,
        enemyDamageFn: (e) => {
          e.health -= dmg;
          const slowDur = sniper.slowDuration || 1e3;
          const slowMul = sniper.slowMult || 0.5;
          slowEnemy(e, slowDur, slowMul);
          spawnDamageNumber(e.pos.x, e.pos.z, "SLOWED", "#cc88ff");
        },
        playerDamageFn: (cx, cz, w, h, rot) => {
          if (isPlayerInvincible()) return;
          const pp = getPlayerPos();
          if (isInRotatedRect(pp.x, pp.z, cx, cz, w, h, rot)) {
            gameState2.playerHealth -= dmg;
            screenShake(3, 100);
            spawnDamageNumber(pp.x, pp.z, dmg, "#ff4466");
            if (gameState2.playerHealth <= 0) {
              gameState2.playerHealth = 0;
              gameState2.phase = "gameOver";
            }
          }
        },
        gameState: gameState2,
        excludeEnemy: enemy
      });
    }
  } else if (enemy.sniperPhase === "telegraphing") {
    enemy.sniperTimer -= dt * 1e3;
    if (enemy.sniperTimer <= 0) {
      enemy.sniperPhase = "idle";
      enemy.lastAttackTime = now;
    }
  }
}
function behaviorMortar(enemy, playerPos2, dt, gameState2) {
  _toPlayer.subVectors(playerPos2, enemy.pos);
  _toPlayer.y = 0;
  const dist = _toPlayer.length();
  const kite = enemy.config.kite || {};
  const mortar = enemy.config.mortar || {};
  const preferredRange = enemy.config.attackRange * (kite.preferredRangeMult || 0.65);
  const isAiming = enemy.mortarPhase === "aiming";
  if (!isAiming) {
    const slideBoost = enemy.wasDeflected ? 1.175 : 1;
    const iceEffects = getIceEffects(enemy.pos.x, enemy.pos.z, false);
    const speed = enemy.config.speed * (enemy.slowTimer > 0 ? enemy.slowMult : 1) * slideBoost * iceEffects.speedMult;
    if (dist < preferredRange - (kite.retreatBuffer || 1.5)) {
      _toPlayer.normalize();
      const retreat = pitAwareDir(enemy.pos.x, enemy.pos.z, -_toPlayer.x, -_toPlayer.z, 2.5);
      enemy.pos.x += retreat.dx * speed * dt;
      enemy.pos.z += retreat.dz * speed * dt;
    } else if (dist > preferredRange + (kite.advanceBuffer || 3)) {
      _toPlayer.normalize();
      const advance = pitAwareDir(enemy.pos.x, enemy.pos.z, _toPlayer.x, _toPlayer.z, 2.5);
      enemy.pos.x += advance.dx * speed * dt;
      enemy.pos.z += advance.dz * speed * dt;
    }
  }
  if (isAiming) {
    const dx = enemy.mortarTarget.x - enemy.pos.x;
    const dz = enemy.mortarTarget.z - enemy.pos.z;
    if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
      enemy.mesh.rotation.y = Math.atan2(-dx, -dz);
    }
  } else if (dist > 0.1) {
    const nx = _toPlayer.x / dist;
    const nz = _toPlayer.z / dist;
    enemy.mesh.rotation.y = Math.atan2(-nx, -nz);
  }
  const now = performance.now();
  if (enemy.mortarPhase === "idle") {
    if (dist < enemy.config.attackRange && now - enemy.lastAttackTime > enemy.config.attackRate) {
      enemy.mortarPhase = "aiming";
      enemy.mortarTimer = mortar.aimDuration || 1200;
      const inaccuracy = mortar.inaccuracy || 1.5;
      const angle = Math.random() * Math.PI * 2;
      enemy.mortarTarget.x = playerPos2.x + Math.cos(angle) * Math.random() * inaccuracy;
      enemy.mortarTarget.z = playerPos2.z + Math.sin(angle) * Math.random() * inaccuracy;
      enemy.mortarTarget.x = Math.max(-19, Math.min(19, enemy.mortarTarget.x));
      enemy.mortarTarget.z = Math.max(-19, Math.min(19, enemy.mortarTarget.z));
      enemy.flashTimer = mortar.aimDuration || 1200;
      enemy.bodyMesh.material.emissive.setHex(mortar.color || 16737826);
      if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(mortar.color || 16737826);
      createMortarArcLine(enemy);
      createMortarGroundCircle(enemy);
    }
  } else if (enemy.mortarPhase === "aiming") {
    enemy.mortarTimer -= dt * 1e3;
    updateMortarArcLine(enemy);
    if (enemy.mortarGroundCircle) {
      const gc = enemy.mortarGroundCircle;
      const aimDuration = mortar.aimDuration || 1200;
      const aimProgress = 1 - enemy.mortarTimer / aimDuration;
      gc.scaleElapsed += dt;
      const scaleT = Math.min(gc.scaleElapsed / gc.scaleDuration, 1);
      const eased = 1 - (1 - scaleT) * (1 - scaleT);
      const startS = gc.circleStartScale;
      const s = gc.targetRadius * (startS + (1 - startS) * eased);
      gc.group.scale.set(s, s, s);
      const freq = 4e-3 + 8e-3 * aimProgress;
      const pulse = 0.85 + 0.15 * Math.sin(performance.now() * freq);
      gc.ringMat.opacity = (0.3 + 0.15 * aimProgress) * pulse;
      gc.fillMat.opacity = 0.08 + 0.04 * aimProgress;
    }
    if (enemy.mortarTimer <= 0) {
      enemy.mortarPhase = "idle";
      enemy.lastAttackTime = now;
      removeMortarArcLine(enemy);
      const groundCircle = enemy.mortarGroundCircle;
      enemy.mortarGroundCircle = null;
      fireMortarProjectile({
        startX: enemy.pos.x,
        startZ: enemy.pos.z,
        targetX: enemy.mortarTarget.x,
        targetZ: enemy.mortarTarget.z,
        arcHeight: mortar.arcHeight || 6,
        speed: mortar.projectileSpeed || 8,
        color: mortar.color || 16737826,
        blastRadius: mortar.blastRadius || 2.5,
        damage: mortar.damage || 18,
        slowDuration: mortar.slowDuration || 800,
        slowMult: mortar.slowMult || 0.6,
        explosionDuration: mortar.explosionDuration || 300,
        icePatch: mortar.icePatch || null,
        gameState: gameState2,
        sourceEnemy: enemy,
        groundCircle
      });
    }
  }
}
var ARC_SEGMENTS = 20;
var _arcLineGeo = null;
function createMortarArcLine(enemy) {
  if (!_arcLineGeo) {
    const positions = new Float32Array((ARC_SEGMENTS + 1) * 3);
    _arcLineGeo = new THREE.BufferGeometry();
    _arcLineGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  }
  const geo = _arcLineGeo.clone();
  geo.setAttribute("position", new THREE.BufferAttribute(
    new Float32Array((ARC_SEGMENTS + 1) * 3),
    3
  ));
  const mat = new THREE.LineBasicMaterial({
    color: enemy.config.mortar?.color || 16737826,
    transparent: true,
    opacity: 0.6,
    depthWrite: false
  });
  const line = new THREE.Line(geo, mat);
  sceneRef3.add(line);
  enemy.mortarArcLine = line;
  updateMortarArcLine(enemy);
}
function updateMortarArcLine(enemy) {
  if (!enemy.mortarArcLine) return;
  const mortar = enemy.config.mortar || {};
  const sx = enemy.pos.x;
  const sz = enemy.pos.z;
  const tx = enemy.mortarTarget.x;
  const tz = enemy.mortarTarget.z;
  const arcH = mortar.arcHeight || 6;
  const startY = 0.8;
  const positions = enemy.mortarArcLine.geometry.attributes.position.array;
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const t = i / ARC_SEGMENTS;
    const x = sx + (tx - sx) * t;
    const z = sz + (tz - sz) * t;
    const y = startY + 4 * arcH * t * (1 - t);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }
  enemy.mortarArcLine.geometry.attributes.position.needsUpdate = true;
  const pulse = 0.3 + 0.3 * Math.sin(performance.now() * 8e-3);
  enemy.mortarArcLine.material.opacity = pulse;
}
function removeMortarArcLine(enemy) {
  if (enemy.mortarArcLine) {
    enemy.mortarArcLine.geometry.dispose();
    enemy.mortarArcLine.material.dispose();
    sceneRef3.remove(enemy.mortarArcLine);
    enemy.mortarArcLine = null;
  }
}
var _circleGeo = null;
function createMortarGroundCircle(enemy) {
  const mortar = enemy.config.mortar || {};
  const radius = mortar.blastRadius || 2.5;
  const color = mortar.color || 16737826;
  if (!_circleGeo) {
    _circleGeo = new THREE.RingGeometry(0.85, 1, 32);
    _circleGeo.rotateX(-Math.PI / 2);
  }
  const ringMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const ringMesh = new THREE.Mesh(_circleGeo, ringMat);
  if (!_mortarFillGeoShared) {
    _mortarFillGeoShared = new THREE.CircleGeometry(1, 32);
    _mortarFillGeoShared.rotateX(-Math.PI / 2);
  }
  const fillMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const fillMesh = new THREE.Mesh(_mortarFillGeoShared, fillMat);
  const group = new THREE.Group();
  group.add(ringMesh);
  group.add(fillMesh);
  group.position.set(enemy.mortarTarget.x, 0.05, enemy.mortarTarget.z);
  const circleStartScale = mortar.circleStartScale || 0.25;
  const startScale = radius * circleStartScale;
  group.scale.set(startScale, startScale, startScale);
  sceneRef3.add(group);
  enemy.mortarGroundCircle = {
    group,
    ringMat,
    fillMat,
    color,
    targetRadius: radius,
    circleStartScale,
    scaleElapsed: 0,
    // tracks time for scale-in animation
    scaleDuration: (mortar.circleScaleTime || 200) / 1e3
    // convert ms -> seconds
  };
}
function removeMortarGroundCircle(enemy) {
  if (enemy.mortarGroundCircle) {
    const gc = enemy.mortarGroundCircle;
    gc.ringMat.dispose();
    gc.fillMat.dispose();
    sceneRef3.remove(gc.group);
    enemy.mortarGroundCircle = null;
  }
}
var _deathCircleGeo = null;
function createDeathTelegraph(enemy) {
  const cfg = enemy.config.deathExplosion;
  const radius = cfg.radius;
  const color = cfg.color;
  if (!_deathCircleGeo) {
    _deathCircleGeo = new THREE.RingGeometry(0.85, 1, 32);
    _deathCircleGeo.rotateX(-Math.PI / 2);
  }
  const ringMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const ringMesh = new THREE.Mesh(_deathCircleGeo, ringMat);
  if (!_deathFillGeoShared) {
    _deathFillGeoShared = new THREE.CircleGeometry(1, 32);
    _deathFillGeoShared.rotateX(-Math.PI / 2);
  }
  const fillMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const fillMesh = new THREE.Mesh(_deathFillGeoShared, fillMat);
  const group = new THREE.Group();
  group.add(ringMesh);
  group.add(fillMesh);
  group.position.set(enemy.pos.x, 0.05, enemy.pos.z);
  group.scale.set(0.1, 0.1, 0.1);
  sceneRef3.add(group);
  enemy.deathTelegraph = {
    group,
    ringMat,
    fillMat,
    targetRadius: radius
  };
}
function updateDeathTelegraph(enemy, _dt) {
  const tg = enemy.deathTelegraph;
  if (!tg) return;
  const cfg = enemy.config.deathExplosion;
  const duration = (cfg.telegraphDuration || 200) / 1e3;
  const elapsed = (cfg.telegraphDuration - enemy.deathTimer) / 1e3;
  const t = Math.min(elapsed / duration, 1);
  const scale = tg.targetRadius * t;
  tg.group.scale.set(scale, scale, scale);
  tg.group.position.set(enemy.pos.x, 0.05, enemy.pos.z);
  const pulse = 0.5 + 0.3 * Math.sin(performance.now() * 0.02);
  tg.ringMat.opacity = pulse;
  tg.fillMat.opacity = 0.12 + 0.08 * t;
}
function removeDeathTelegraph(enemy) {
  const tg = enemy.deathTelegraph;
  if (!tg) return;
  tg.ringMat.dispose();
  tg.fillMat.dispose();
  sceneRef3.remove(tg.group);
  enemy.deathTelegraph = null;
}
function onDeathExplosion(enemy, gameState2) {
  const cfg = enemy.config.deathExplosion;
  const x = enemy.pos.x;
  const z = enemy.pos.z;
  screenShake(5, 250);
  const colorStr = "#" + cfg.color.toString(16).padStart(6, "0");
  spawnDamageNumber(x, z, "BOOM", colorStr);
  applyAoeEffect({
    x,
    z,
    radius: cfg.radius,
    durationMs: cfg.ringDuration || 400,
    color: cfg.color,
    label: cfg.damage + "",
    effectFn: (e) => {
      e.health -= cfg.damage;
      if (cfg.stunDuration > 0) {
        stunEnemy(e, cfg.stunDuration);
      }
    },
    gameState: gameState2,
    excludeEnemy: enemy
    // exclude the dying enemy itself
  });
  const pp = getPlayerPos();
  const pdx = pp.x - x;
  const pdz = pp.z - z;
  const playerDist = Math.sqrt(pdx * pdx + pdz * pdz);
  if (playerDist < cfg.radius && !isPlayerInvincible()) {
    gameState2.playerHealth -= cfg.damage;
    screenShake(4, 200);
    spawnDamageNumber(pp.x, pp.z, cfg.damage, "#ff4466");
    if (gameState2.playerHealth <= 0) {
      gameState2.playerHealth = 0;
      gameState2.phase = "gameOver";
    }
  }
}
function behaviorTank(enemy, playerPos2, dt) {
  const tank = enemy.config.tank || {};
  _toPlayer.subVectors(playerPos2, enemy.pos);
  _toPlayer.y = 0;
  const dist = _toPlayer.length();
  const slowFactor = enemy.slowTimer > 0 ? enemy.slowMult : 1;
  const slideBoost = enemy.wasDeflected ? 1.175 : 1;
  const iceEffects = getIceEffects(enemy.pos.x, enemy.pos.z, false);
  if (enemy.isCharging) {
    const speedMult = tank.chargeSpeedMult || 3;
    enemy.pos.x += enemy.chargeDir.x * enemy.config.speed * speedMult * slowFactor * slideBoost * iceEffects.speedMult * dt;
    enemy.pos.z += enemy.chargeDir.z * enemy.config.speed * speedMult * slowFactor * slideBoost * iceEffects.speedMult * dt;
    enemy.chargeTimer -= dt * 1e3;
    if (enemy.chargeTimer <= 0) {
      enemy.isCharging = false;
      const cdMin = tank.chargeCooldownMin || 3e3;
      const cdMax = tank.chargeCooldownMax || 5e3;
      enemy.chargeCooldown = cdMin + Math.random() * (cdMax - cdMin);
    }
  } else {
    if (dist > 1) {
      _toPlayer.normalize();
      enemy.pos.x += _toPlayer.x * enemy.config.speed * slowFactor * slideBoost * iceEffects.speedMult * dt;
      enemy.pos.z += _toPlayer.z * enemy.config.speed * slowFactor * slideBoost * iceEffects.speedMult * dt;
    }
    enemy.chargeCooldown -= dt * 1e3;
    const minD = tank.chargeMinDist || 2;
    const maxD = tank.chargeMaxDist || 10;
    if (enemy.chargeCooldown <= 0 && dist < maxD && dist > minD) {
      enemy.isCharging = true;
      enemy.chargeTimer = tank.chargeDuration || 500;
      _toPlayer.subVectors(playerPos2, enemy.pos).normalize();
      enemy.chargeDir.copy(_toPlayer);
      const telegraphMs = tank.telegraphDuration || 300;
      enemy.flashTimer = telegraphMs;
      enemy.bodyMesh.material.emissive.setHex(16777215);
      if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(16777215);
    }
  }
  if (dist > 0.1) {
    const nx = playerPos2.x - enemy.pos.x;
    const nz = playerPos2.z - enemy.pos.z;
    const l = Math.sqrt(nx * nx + nz * nz);
    if (l > 0) {
      enemy.mesh.rotation.y = Math.atan2(-nx / l, -nz / l);
    }
  }
}
function slowEnemy(enemy, durationMs, mult) {
  enemy.slowTimer = durationMs;
  enemy.slowMult = mult;
}
function stunEnemy(enemy, durationMs) {
  enemy.stunTimer = durationMs;
  enemy.isCharging = false;
  if (enemy.sniperPhase === "telegraphing") {
    enemy.sniperPhase = "idle";
  }
  if (enemy.mortarPhase === "aiming") {
    enemy.mortarPhase = "idle";
    removeMortarArcLine(enemy);
    removeMortarGroundCircle(enemy);
  }
}
function clearEnemies(gameState2) {
  for (const enemy of gameState2.enemies) {
    if (enemy.shieldMesh) {
      enemy.shieldMesh.geometry.dispose();
      enemy.shieldMesh.material.dispose();
    }
    removeMortarArcLine(enemy);
    removeMortarGroundCircle(enemy);
    removeDeathTelegraph(enemy);
    sceneRef3.remove(enemy.mesh);
  }
  gameState2.enemies.length = 0;
  _collisionBounds = null;
  _pitBoundsCache = null;
}

// src/entities/mortarProjectile.ts
var sceneRef4;
var activeMortars = [];
var activeIcePatches = [];
var shellGeo;
function initMortarSystem(scene2) {
  sceneRef4 = scene2;
}
function fireMortarProjectile(opts) {
  if (!shellGeo) {
    shellGeo = new THREE.SphereGeometry(0.15, 6, 4);
  }
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color,
    emissive: opts.color,
    emissiveIntensity: 0.8
  });
  const mesh = new THREE.Mesh(shellGeo, mat);
  mesh.position.set(opts.startX, 0.8, opts.startZ);
  sceneRef4.add(mesh);
  const trailPositions = new Float32Array(30 * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
  const trailMat = new THREE.LineBasicMaterial({
    color: opts.color,
    transparent: true,
    opacity: 0.5,
    depthWrite: false
  });
  const trail = new THREE.Line(trailGeo, trailMat);
  sceneRef4.add(trail);
  const dx = opts.targetX - opts.startX;
  const dz = opts.targetZ - opts.startZ;
  const groundDist = Math.sqrt(dx * dx + dz * dz);
  const arcLen = groundDist > 0.1 ? groundDist + 2 * opts.arcHeight * opts.arcHeight / groundDist : opts.arcHeight * 2;
  const flightTime = arcLen / opts.speed;
  const mortar = {
    mesh,
    trail,
    trailGeo,
    trailMat,
    mat,
    startX: opts.startX,
    startZ: opts.startZ,
    targetX: opts.targetX,
    targetZ: opts.targetZ,
    arcHeight: opts.arcHeight,
    flightTime,
    elapsed: 0,
    color: opts.color,
    blastRadius: opts.blastRadius,
    damage: opts.damage,
    slowDuration: opts.slowDuration,
    slowMult: opts.slowMult,
    explosionDuration: opts.explosionDuration,
    icePatch: opts.icePatch || null,
    gameState: opts.gameState,
    sourceEnemy: opts.sourceEnemy,
    trailHistory: [],
    // past positions for trail
    groundCircle: opts.groundCircle || null
    // persistent ground circle from aim phase
  };
  activeMortars.push(mortar);
  return mortar;
}
function updateMortarProjectiles(dt) {
  for (let i = activeMortars.length - 1; i >= 0; i--) {
    const m = activeMortars[i];
    m.elapsed += dt;
    const t = Math.min(m.elapsed / m.flightTime, 1);
    const x = m.startX + (m.targetX - m.startX) * t;
    const z = m.startZ + (m.targetZ - m.startZ) * t;
    const y = 0.8 + 4 * m.arcHeight * t * (1 - t);
    m.mesh.position.set(x, y, z);
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.01);
    m.mat.emissiveIntensity = pulse;
    m.trailHistory.push({ x, y, z });
    if (m.trailHistory.length > 30) m.trailHistory.shift();
    const positions = m.trailGeo.attributes.position.array;
    for (let j = 0; j < 30; j++) {
      const idx = j < m.trailHistory.length ? j : m.trailHistory.length - 1;
      const p = m.trailHistory[idx];
      positions[j * 3] = p.x;
      positions[j * 3 + 1] = p.y;
      positions[j * 3 + 2] = p.z;
    }
    m.trailGeo.attributes.position.needsUpdate = true;
    m.trailGeo.setDrawRange(0, m.trailHistory.length);
    m.trailMat.opacity = 0.5 * (1 - t * 0.5);
    if (m.groundCircle) {
      const gc = m.groundCircle;
      const ringOpacity = 0.3 + 0.6 * t;
      const fillOpacity = 0.08 + 0.27 * t;
      const gcPulse = 0.85 + 0.15 * Math.sin(performance.now() * (6e-3 + 0.012 * t));
      gc.ringMat.opacity = ringOpacity * gcPulse;
      gc.fillMat.opacity = fillOpacity;
    }
    if (t >= 1) {
      onMortarImpact(m);
      removeMortar(m);
      activeMortars.splice(i, 1);
    }
  }
}
function onMortarImpact(m) {
  const tx = m.targetX;
  const tz = m.targetZ;
  screenShake(3, 150);
  applyAoeEffect({
    x: tx,
    z: tz,
    radius: m.blastRadius,
    durationMs: m.explosionDuration,
    color: m.color,
    label: "SLOWED",
    effectFn: (e) => {
      e.health -= m.damage;
      slowEnemy(e, m.slowDuration, m.slowMult);
    },
    gameState: m.gameState,
    excludeEnemy: m.sourceEnemy
  });
  const pp = getPlayerPos();
  const pdx = pp.x - tx;
  const pdz = pp.z - tz;
  const playerDist = Math.sqrt(pdx * pdx + pdz * pdz);
  if (playerDist < m.blastRadius && !isPlayerInvincible()) {
    m.gameState.playerHealth -= m.damage;
    screenShake(4, 200);
    spawnDamageNumber(pp.x, pp.z, m.damage, "#ff4466");
    if (m.gameState.playerHealth <= 0) {
      m.gameState.playerHealth = 0;
      m.gameState.phase = "gameOver";
    }
  }
  if (m.icePatch && m.icePatch.enabled) {
    createIcePatch(tx, tz, m.blastRadius, m.icePatch);
  }
}
function createIcePatch(x, z, radius, config) {
  const geo = new THREE.CircleGeometry(radius, 32);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: config.color || 8446207,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0.02, z);
  sceneRef4.add(mesh);
  const patch = {
    x,
    z,
    radius,
    mesh,
    mat,
    geo,
    duration: config.duration,
    elapsed: 0,
    speedMult: config.speedMult,
    knockbackMult: config.knockbackMult,
    affectsPlayer: config.affectsPlayer,
    affectsEnemies: config.affectsEnemies
  };
  activeIcePatches.push(patch);
  return patch;
}
function updateIcePatches(dt) {
  for (let i = activeIcePatches.length - 1; i >= 0; i--) {
    const patch = activeIcePatches[i];
    patch.elapsed += dt * 1e3;
    const remaining = patch.duration - patch.elapsed;
    if (remaining < 500) {
      patch.mat.opacity = 0.5 * (remaining / 500);
    }
    if (patch.elapsed >= patch.duration) {
      patch.geo.dispose();
      patch.mat.dispose();
      sceneRef4.remove(patch.mesh);
      activeIcePatches.splice(i, 1);
    }
  }
}
function getIcePatchAt(x, z) {
  for (const patch of activeIcePatches) {
    const dx = x - patch.x;
    const dz = z - patch.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= patch.radius) {
      return patch;
    }
  }
  return null;
}
function getIceEffects(x, z, isPlayer) {
  const patch = getIcePatchAt(x, z);
  if (!patch) {
    return { speedMult: 1, knockbackMult: 1 };
  }
  if (isPlayer && !patch.affectsPlayer) {
    return { speedMult: 1, knockbackMult: 1 };
  }
  if (!isPlayer && !patch.affectsEnemies) {
    return { speedMult: 1, knockbackMult: 1 };
  }
  return {
    speedMult: patch.speedMult,
    knockbackMult: patch.knockbackMult
  };
}
function removeMortar(m) {
  m.mat.dispose();
  sceneRef4.remove(m.mesh);
  m.trailGeo.dispose();
  m.trailMat.dispose();
  sceneRef4.remove(m.trail);
  if (m.groundCircle) {
    const gc = m.groundCircle;
    gc.ringMat.dispose();
    gc.fillMat.dispose();
    sceneRef4.remove(gc.group);
    m.groundCircle = null;
  }
}
function clearMortarProjectiles() {
  for (const m of activeMortars) {
    removeMortar(m);
  }
  activeMortars.length = 0;
}
function clearIcePatches() {
  for (const patch of activeIcePatches) {
    patch.geo.dispose();
    patch.mat.dispose();
    sceneRef4.remove(patch.mesh);
  }
  activeIcePatches.length = 0;
}

// src/entities/player.ts
var playerGroup;
var body;
var head;
var aimIndicator;
var playerPos = new THREE.Vector3(0, 0, 0);
var bobPhase = 0;
var lastFireTime = 0;
var isDashing = false;
var dashTimer = 0;
var dashDuration = 0;
var dashDistance = 0;
var dashDir = new THREE.Vector3();
var dashStartPos = new THREE.Vector3();
var isInvincible = false;
var endLagTimer = 0;
var afterimages = [];
var pushEvent = null;
var isCharging = false;
var chargeTimer = 0;
var chargeAimAngle = 0;
var chargeTelegraphGroup = null;
var chargeFillMesh = null;
var chargeBorderMesh = null;
var chargeBorderGeo = null;
var _fireDir = new THREE.Vector3();
var _playerGhostBodyGeo = null;
var _playerGhostHeadGeo = null;
var BODY_EMISSIVE = 2271846;
var HEAD_EMISSIVE = 3390344;
function createPlayer(scene2) {
  playerGroup = new THREE.Group();
  body = new THREE.Mesh(
    new THREE.CylinderGeometry(PLAYER.size.radius, PLAYER.size.radius + 0.05, PLAYER.size.height * 0.6, 8),
    new THREE.MeshStandardMaterial({
      color: 4508808,
      emissive: BODY_EMISSIVE,
      emissiveIntensity: 0.4
    })
  );
  body.position.y = 0.7;
  playerGroup.add(body);
  head = new THREE.Mesh(
    new THREE.SphereGeometry(PLAYER.size.radius * 0.85, 8, 6),
    new THREE.MeshStandardMaterial({
      color: 5627306,
      emissive: HEAD_EMISSIVE,
      emissiveIntensity: 0.5
    })
  );
  head.position.y = 1.45;
  playerGroup.add(head);
  aimIndicator = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.6, 4),
    new THREE.MeshStandardMaterial({
      color: 4521864,
      emissive: 4521864,
      emissiveIntensity: 0.8
    })
  );
  aimIndicator.rotation.x = -Math.PI / 2;
  aimIndicator.position.set(0, 0.8, -0.7);
  playerGroup.add(aimIndicator);
  scene2.add(playerGroup);
  return playerGroup;
}
function updatePlayer(inputState2, dt, gameState2) {
  const now = performance.now();
  for (const key of Object.keys(gameState2.abilities)) {
    if (gameState2.abilities[key].cooldownRemaining > 0) {
      gameState2.abilities[key].cooldownRemaining -= dt * 1e3;
    }
  }
  if (isCharging) {
    updateCharge(inputState2, dt, gameState2);
  }
  if (endLagTimer > 0) {
    endLagTimer -= dt * 1e3;
    playerGroup.position.copy(playerPos);
    updateAfterimages(dt);
    return;
  }
  if (isDashing) {
    updateDash(dt, gameState2);
    playerGroup.position.copy(playerPos);
    aimAtCursor(inputState2);
    updateAfterimages(dt);
    return;
  }
  if (inputState2.dash && gameState2.abilities.dash.cooldownRemaining <= 0) {
    startDash(inputState2, gameState2);
  }
  if (inputState2.ultimate && gameState2.abilities.ultimate.cooldownRemaining <= 0 && !isCharging) {
    startCharge(inputState2, gameState2);
  }
  if (Math.abs(inputState2.moveX) > 0.01 || Math.abs(inputState2.moveZ) > 0.01) {
    const chargeSlow = isCharging ? ABILITIES.ultimate.chargeMoveSpeedMult : 1;
    const iceEffects = getIceEffects(playerPos.x, playerPos.z, true);
    const speedMod = chargeSlow * iceEffects.speedMult;
    playerPos.x += inputState2.moveX * PLAYER.speed * speedMod * dt;
    playerPos.z += inputState2.moveZ * PLAYER.speed * speedMod * dt;
    bobPhase += dt * 12;
    body.position.y = 0.7 + Math.sin(bobPhase) * 0.05;
    head.position.y = 1.45 + Math.sin(bobPhase) * 0.07;
  }
  playerPos.x = Math.max(-19.5, Math.min(19.5, playerPos.x));
  playerPos.z = Math.max(-19.5, Math.min(19.5, playerPos.z));
  playerGroup.position.copy(playerPos);
  aimAtCursor(inputState2);
  const dashCfg = ABILITIES.dash;
  const canShoot = (!isDashing || dashCfg.canShootDuring) && !isCharging;
  if (canShoot && now - lastFireTime > PLAYER.fireRate) {
    _fireDir.set(
      -Math.sin(playerGroup.rotation.y),
      0,
      -Math.cos(playerGroup.rotation.y)
    );
    fireProjectile(playerPos, _fireDir, { speed: PLAYER.projectile.speed, damage: PLAYER.projectile.damage, color: PLAYER.projectile.color }, false);
    lastFireTime = now;
  }
  updateAfterimages(dt);
}
function aimAtCursor(inputState2) {
  const dx = inputState2.aimWorldPos.x - playerPos.x;
  const dz = inputState2.aimWorldPos.z - playerPos.z;
  if (dx * dx + dz * dz > 0.01) {
    playerGroup.rotation.y = Math.atan2(-dx, -dz);
  }
}
function startDash(inputState2, gameState2) {
  const cfg = ABILITIES.dash;
  isDashing = true;
  dashTimer = 0;
  dashDuration = cfg.duration;
  dashDistance = cfg.distance;
  dashStartPos.copy(playerPos);
  const override = getAbilityDirOverride();
  const hasMovement = Math.abs(inputState2.moveX) > 0.01 || Math.abs(inputState2.moveZ) > 0.01;
  if (override) {
    dashDir.set(override.x, 0, override.z).normalize();
    clearAbilityDirOverride();
  } else if (cfg.directionSource === "movement" && hasMovement) {
    dashDir.set(inputState2.moveX, 0, inputState2.moveZ).normalize();
  } else if (cfg.directionSource === "aim") {
    dashDir.set(
      inputState2.aimWorldPos.x - playerPos.x,
      0,
      inputState2.aimWorldPos.z - playerPos.z
    ).normalize();
  } else {
    if (hasMovement) {
      dashDir.set(inputState2.moveX, 0, inputState2.moveZ).normalize();
    } else {
      dashDir.set(
        inputState2.aimWorldPos.x - playerPos.x,
        0,
        inputState2.aimWorldPos.z - playerPos.z
      ).normalize();
    }
  }
  gameState2.abilities.dash.cooldownRemaining = cfg.cooldown;
  if (cfg.screenShakeOnStart > 0) {
    screenShake(cfg.screenShakeOnStart, 80);
  }
}
function updateDash(dt, gameState2) {
  const cfg = ABILITIES.dash;
  dashTimer += dt * 1e3;
  const t = Math.min(dashTimer / dashDuration, 1);
  let easedT;
  switch (cfg.curve) {
    case "easeOut":
      easedT = 1 - (1 - t) * (1 - t);
      break;
    case "easeIn":
      easedT = t * t;
      break;
    case "easeInOut":
      easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      break;
    default:
      easedT = t;
  }
  playerPos.copy(dashStartPos);
  playerPos.x += dashDir.x * dashDistance * easedT;
  playerPos.z += dashDir.z * dashDistance * easedT;
  playerPos.x = Math.max(-19.5, Math.min(19.5, playerPos.x));
  playerPos.z = Math.max(-19.5, Math.min(19.5, playerPos.z));
  isInvincible = cfg.invincible && (dashTimer >= cfg.iFrameStart && dashTimer <= cfg.iFrameEnd);
  if (cfg.afterimageCount > 0) {
    const interval = dashDuration / (cfg.afterimageCount + 1);
    const prevCount = Math.floor((dashTimer - dt * 1e3) / interval);
    const currCount = Math.floor(dashTimer / interval);
    if (currCount > prevCount) {
      spawnAfterimage(cfg);
    }
  }
  if (t >= 1) {
    isDashing = false;
    isInvincible = false;
    endLagTimer = cfg.endLag;
  }
}
function spawnAfterimage(cfg) {
  const scene2 = getScene();
  const ghost = new THREE.Group();
  if (!_playerGhostBodyGeo) {
    _playerGhostBodyGeo = new THREE.CylinderGeometry(PLAYER.size.radius, PLAYER.size.radius + 0.05, PLAYER.size.height * 0.6, 6);
    _playerGhostHeadGeo = new THREE.SphereGeometry(PLAYER.size.radius * 0.85, 6, 4);
  }
  const ghostBody = new THREE.Mesh(
    _playerGhostBodyGeo,
    new THREE.MeshBasicMaterial({
      color: cfg.ghostColor,
      transparent: true,
      opacity: 0.5
    })
  );
  ghostBody.position.y = 0.7;
  ghost.add(ghostBody);
  const ghostHead = new THREE.Mesh(
    _playerGhostHeadGeo,
    new THREE.MeshBasicMaterial({
      color: cfg.ghostColor,
      transparent: true,
      opacity: 0.5
    })
  );
  ghostHead.position.y = 1.45;
  ghost.add(ghostHead);
  ghost.position.copy(playerPos);
  ghost.rotation.y = playerGroup.rotation.y;
  scene2.add(ghost);
  afterimages.push({ mesh: ghost, life: 0, maxLife: cfg.afterimageFadeDuration });
}
function updateAfterimages(dt) {
  const scene2 = getScene();
  for (let i = afterimages.length - 1; i >= 0; i--) {
    const ai = afterimages[i];
    ai.life += dt * 1e3;
    const fade = Math.max(0, 1 - ai.life / ai.maxLife);
    ai.mesh.children.forEach((child) => {
      if (child.material) child.material.opacity = fade * 0.5;
    });
    if (ai.life >= ai.maxLife) {
      scene2.remove(ai.mesh);
      afterimages.splice(i, 1);
    }
  }
}
function startCharge(inputState2, gameState2) {
  const cfg = ABILITIES.ultimate;
  isCharging = true;
  chargeTimer = 0;
  gameState2.abilities.ultimate.charging = true;
  gameState2.abilities.ultimate.chargeT = 0;
  const dx = inputState2.aimWorldPos.x - playerPos.x;
  const dz = inputState2.aimWorldPos.z - playerPos.z;
  chargeAimAngle = Math.atan2(dx, dz);
  createChargeTelegraph(cfg);
  body.material.emissive.setHex(4521898);
  head.material.emissive.setHex(6750156);
  body.material.emissiveIntensity = 0.6;
  head.material.emissiveIntensity = 0.7;
}
function createChargeTelegraph(cfg) {
  const scene2 = getScene();
  chargeTelegraphGroup = new THREE.Group();
  chargeTelegraphGroup.position.set(playerPos.x, 0.05, playerPos.z);
  chargeTelegraphGroup.rotation.y = chargeAimAngle;
  const fillGeo2 = new THREE.PlaneGeometry(1, 1);
  fillGeo2.rotateX(-Math.PI / 2);
  const fillMat = new THREE.MeshBasicMaterial({
    color: cfg.color,
    transparent: true,
    opacity: cfg.telegraphOpacity,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  chargeFillMesh = new THREE.Mesh(fillGeo2, fillMat);
  const halfLen = cfg.minLength / 2;
  chargeFillMesh.scale.set(cfg.width, 1, cfg.minLength);
  chargeFillMesh.position.set(0, 0, halfLen);
  chargeTelegraphGroup.add(chargeFillMesh);
  const basePlane = new THREE.PlaneGeometry(1, 1);
  const borderGeo = new THREE.EdgesGeometry(basePlane);
  borderGeo.rotateX(-Math.PI / 2);
  const borderMat = new THREE.LineBasicMaterial({
    color: cfg.color,
    transparent: true,
    opacity: 0.8,
    depthWrite: false
  });
  chargeBorderMesh = new THREE.LineSegments(borderGeo, borderMat);
  chargeBorderGeo = borderGeo;
  chargeBorderMesh.scale.set(cfg.width, 1, cfg.minLength);
  chargeBorderMesh.position.set(0, 0, halfLen);
  chargeTelegraphGroup.add(chargeBorderMesh);
  scene2.add(chargeTelegraphGroup);
}
function updateCharge(inputState2, dt, gameState2) {
  const cfg = ABILITIES.ultimate;
  chargeTimer += dt * 1e3;
  const chargeT = Math.min(chargeTimer / cfg.chargeTimeMs, 1);
  gameState2.abilities.ultimate.chargeT = chargeT;
  const dx = inputState2.aimWorldPos.x - playerPos.x;
  const dz = inputState2.aimWorldPos.z - playerPos.z;
  if (dx * dx + dz * dz > 0.01) {
    chargeAimAngle = Math.atan2(dx, dz);
  }
  const currentLength = cfg.minLength + (cfg.maxLength - cfg.minLength) * chargeT;
  if (chargeTelegraphGroup) {
    chargeTelegraphGroup.position.set(playerPos.x, 0.05, playerPos.z);
    chargeTelegraphGroup.rotation.y = chargeAimAngle;
    const halfLen = currentLength / 2;
    chargeFillMesh.scale.set(cfg.width, 1, currentLength);
    chargeFillMesh.position.set(0, 0, halfLen);
    chargeBorderMesh.scale.set(cfg.width, 1, currentLength);
    chargeBorderMesh.position.set(0, 0, halfLen);
    const pulse = 0.6 + 0.3 * Math.sin(performance.now() * 8e-3);
    chargeBorderMesh.material.opacity = pulse;
    chargeFillMesh.material.opacity = cfg.telegraphOpacity + chargeT * 0.2;
  }
  body.material.emissiveIntensity = 0.6 + chargeT * 0.4;
  head.material.emissiveIntensity = 0.7 + chargeT * 0.3;
  if (chargeT >= 1 || chargeTimer > 100 && !inputState2.ultimateHeld) {
    fireChargePush(chargeT, gameState2);
  }
}
function fireChargePush(chargeT, gameState2) {
  const cfg = ABILITIES.ultimate;
  const currentLength = cfg.minLength + (cfg.maxLength - cfg.minLength) * chargeT;
  const force = cfg.minKnockback + (cfg.maxKnockback - cfg.minKnockback) * chargeT;
  const halfLen = currentLength / 2;
  const dirX = Math.sin(chargeAimAngle);
  const dirZ = Math.cos(chargeAimAngle);
  const centerX = playerPos.x + dirX * halfLen;
  const centerZ = playerPos.z + dirZ * halfLen;
  pushEvent = {
    x: centerX,
    z: centerZ,
    width: cfg.width,
    length: currentLength,
    rotation: chargeAimAngle,
    force,
    dirX,
    dirZ
  };
  removeChargeTelegraph();
  isCharging = false;
  gameState2.abilities.ultimate.charging = false;
  gameState2.abilities.ultimate.chargeT = 0;
  gameState2.abilities.ultimate.cooldownRemaining = cfg.cooldown;
  body.material.emissive.setHex(BODY_EMISSIVE);
  head.material.emissive.setHex(HEAD_EMISSIVE);
  body.material.emissiveIntensity = 0.4;
  head.material.emissiveIntensity = 0.5;
  screenShake(2 + chargeT * 3, 120);
}
function removeChargeTelegraph() {
  if (chargeTelegraphGroup) {
    const scene2 = getScene();
    if (chargeFillMesh) {
      chargeFillMesh.material.dispose();
      chargeFillMesh.geometry.dispose();
    }
    if (chargeBorderMesh) {
      chargeBorderMesh.material.dispose();
      if (chargeBorderGeo) chargeBorderGeo.dispose();
    }
    scene2.remove(chargeTelegraphGroup);
    chargeTelegraphGroup = null;
    chargeFillMesh = null;
    chargeBorderMesh = null;
    chargeBorderGeo = null;
  }
}
function getPlayerPos() {
  return playerPos;
}
function isPlayerInvincible() {
  return isInvincible;
}
function isPlayerDashing() {
  return isDashing;
}
function consumePushEvent() {
  const evt = pushEvent;
  pushEvent = null;
  return evt;
}
function resetPlayer() {
  playerPos.set(0, 0, 0);
  playerGroup.position.set(0, 0, 0);
  playerGroup.rotation.y = 0;
  isDashing = false;
  isInvincible = false;
  endLagTimer = 0;
  lastFireTime = 0;
  isCharging = false;
  chargeTimer = 0;
  pushEvent = null;
  removeChargeTelegraph();
  body.material.emissive.setHex(BODY_EMISSIVE);
  head.material.emissive.setHex(HEAD_EMISSIVE);
  body.material.emissiveIntensity = 0.4;
  head.material.emissiveIntensity = 0.5;
  const scene2 = getScene();
  for (const ai of afterimages) {
    scene2.remove(ai.mesh);
  }
  afterimages.length = 0;
}

// src/engine/input.ts
var keys = {};
var inputState = {
  moveX: 0,
  moveZ: 0,
  aimWorldPos: { x: 0, y: 0, z: 0 },
  mouseNDC: { x: 0, y: 0 },
  dash: false,
  ultimate: false,
  ultimateHeld: false,
  toggleEditor: false
};
var INV_SQRT2 = 1 / Math.SQRT2;
var ISO_RIGHT_X = INV_SQRT2;
var ISO_RIGHT_Z = -INV_SQRT2;
var ISO_UP_X = -INV_SQRT2;
var ISO_UP_Z = -INV_SQRT2;
var DEADZONE = 0.15;
var gamepadIndex = -1;
var gamepadAimActive = false;
var prevGamepadButtons = {};
var usingGamepad = false;
var touchMoveX = 0;
var touchMoveY = 0;
var touchAimX = 0;
var touchAimY = 0;
var touchAimActive = false;
var touchActive = false;
function initInput() {
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    keys[e.code] = true;
    usingGamepad = false;
    if (e.code === "Space") {
      inputState.dash = true;
      e.preventDefault();
    }
    if (e.code === "KeyE") inputState.ultimate = true;
    if (e.code === "Backquote") inputState.toggleEditor = true;
  });
  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });
  window.addEventListener("mousemove", (e) => {
    inputState.mouseNDC.x = e.clientX / window.innerWidth * 2 - 1;
    inputState.mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    usingGamepad = false;
  });
  window.addEventListener("gamepadconnected", (e) => {
    console.log(`[input] Gamepad connected: ${e.gamepad.id}`);
    gamepadIndex = e.gamepad.index;
  });
  window.addEventListener("gamepaddisconnected", (e) => {
    console.log(`[input] Gamepad disconnected: ${e.gamepad.id}`);
    if (e.gamepad.index === gamepadIndex) gamepadIndex = -1;
  });
  initTouchJoysticks();
}
function applyDeadzone(value) {
  if (Math.abs(value) < DEADZONE) return 0;
  const sign = value > 0 ? 1 : -1;
  return sign * (Math.abs(value) - DEADZONE) / (1 - DEADZONE);
}
function initTouchJoysticks() {
  if (typeof nipplejs === "undefined") return;
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (!hasTouch) return;
  const zoneLeft = document.getElementById("zone-left");
  const zoneRight = document.getElementById("zone-right");
  if (!zoneLeft || !zoneRight) return;
  zoneLeft.style.display = "block";
  zoneRight.style.display = "block";
  console.log("[input] Touch joysticks initialized");
  const leftJoystick = nipplejs.create({
    zone: zoneLeft,
    mode: "dynamic",
    position: { left: "50%", top: "50%" },
    color: "rgba(68, 204, 136, 0.35)",
    size: 120,
    restOpacity: 0.5
  });
  leftJoystick.on("move", (evt, data) => {
    const force = Math.min(data.force, 1.5) / 1.5;
    const angle = data.angle.radian;
    touchMoveX = Math.cos(angle) * force;
    touchMoveY = Math.sin(angle) * force;
    touchActive = true;
  });
  leftJoystick.on("end", () => {
    touchMoveX = 0;
    touchMoveY = 0;
  });
  const rightJoystick = nipplejs.create({
    zone: zoneRight,
    mode: "dynamic",
    position: { left: "50%", top: "50%" },
    color: "rgba(255, 102, 68, 0.35)",
    size: 120,
    restOpacity: 0.5
  });
  rightJoystick.on("move", (evt, data) => {
    const force = Math.min(data.force, 1.5) / 1.5;
    const angle = data.angle.radian;
    touchAimX = Math.cos(angle) * force;
    touchAimY = Math.sin(angle) * force;
    touchAimActive = true;
    touchActive = true;
  });
  rightJoystick.on("end", () => {
    touchAimX = 0;
    touchAimY = 0;
    touchAimActive = false;
  });
}
function pollTouchJoysticks() {
  if (!touchActive) return;
  if (Math.abs(touchMoveX) > 0.01 || Math.abs(touchMoveY) > 0.01) {
    const tMoveX = touchMoveX * ISO_RIGHT_X + touchMoveY * ISO_UP_X;
    const tMoveZ = touchMoveX * ISO_RIGHT_Z + touchMoveY * ISO_UP_Z;
    const kbActive = Math.abs(inputState.moveX) > 0.01 || Math.abs(inputState.moveZ) > 0.01;
    if (!kbActive) {
      inputState.moveX = tMoveX;
      inputState.moveZ = tMoveZ;
      const len = Math.sqrt(inputState.moveX * inputState.moveX + inputState.moveZ * inputState.moveZ);
      if (len > 1) {
        inputState.moveX /= len;
        inputState.moveZ /= len;
      }
    }
  }
  if (touchAimActive) {
    const aimDirX = touchAimX * ISO_RIGHT_X + touchAimY * ISO_UP_X;
    const aimDirZ = touchAimX * ISO_RIGHT_Z + touchAimY * ISO_UP_Z;
    const pp = getPlayerPos();
    const aimDist = 10;
    inputState.aimWorldPos.x = pp.x + aimDirX * aimDist;
    inputState.aimWorldPos.y = 0;
    inputState.aimWorldPos.z = pp.z + aimDirZ * aimDist;
  }
}
function pollGamepad() {
  if (gamepadIndex < 0) return;
  const gamepads = navigator.getGamepads();
  const gp = gamepads[gamepadIndex];
  if (!gp) return;
  usingGamepad = true;
  const lx = applyDeadzone(gp.axes[0] || 0);
  const ly = applyDeadzone(gp.axes[1] || 0);
  const gpMoveX = lx * ISO_RIGHT_X + -ly * ISO_UP_X;
  const gpMoveZ = lx * ISO_RIGHT_Z + -ly * ISO_UP_Z;
  const kbActive = Math.abs(inputState.moveX) > 0.01 || Math.abs(inputState.moveZ) > 0.01;
  if (!kbActive && (Math.abs(gpMoveX) > 0.01 || Math.abs(gpMoveZ) > 0.01)) {
    inputState.moveX = gpMoveX;
    inputState.moveZ = gpMoveZ;
    const len = Math.sqrt(inputState.moveX * inputState.moveX + inputState.moveZ * inputState.moveZ);
    if (len > 1) {
      inputState.moveX /= len;
      inputState.moveZ /= len;
    }
  }
  const rx = applyDeadzone(gp.axes[2] || 0);
  const ry = applyDeadzone(gp.axes[3] || 0);
  gamepadAimActive = Math.abs(rx) > 0.01 || Math.abs(ry) > 0.01;
  if (gamepadAimActive) {
    const aimDirX = rx * ISO_RIGHT_X + -ry * ISO_UP_X;
    const aimDirZ = rx * ISO_RIGHT_Z + -ry * ISO_UP_Z;
    const pp = getPlayerPos();
    const aimDist = 10;
    inputState.aimWorldPos.x = pp.x + aimDirX * aimDist;
    inputState.aimWorldPos.y = 0;
    inputState.aimWorldPos.z = pp.z + aimDirZ * aimDist;
  }
  const buttons = gp.buttons;
  const dashBtn = buttons[0] && buttons[0].pressed || buttons[4] && buttons[4].pressed;
  if (dashBtn && !prevGamepadButtons.dash) inputState.dash = true;
  prevGamepadButtons.dash = !!dashBtn;
  const ultBtn = buttons[5] && buttons[5].pressed || buttons[7] && buttons[7].pressed;
  if (ultBtn && !prevGamepadButtons.ult) inputState.ultimate = true;
  prevGamepadButtons.ult = !!ultBtn;
  if (ultBtn) inputState.ultimateHeld = true;
}
function updateInput() {
  let rawX = 0, rawY = 0;
  if (keys["KeyD"] || keys["ArrowRight"]) rawX += 1;
  if (keys["KeyA"] || keys["ArrowLeft"]) rawX -= 1;
  if (keys["KeyW"] || keys["ArrowUp"]) rawY += 1;
  if (keys["KeyS"] || keys["ArrowDown"]) rawY -= 1;
  inputState.moveX = rawX * ISO_RIGHT_X + rawY * ISO_UP_X;
  inputState.moveZ = rawX * ISO_RIGHT_Z + rawY * ISO_UP_Z;
  const len = Math.sqrt(inputState.moveX * inputState.moveX + inputState.moveZ * inputState.moveZ);
  if (len > 1) {
    inputState.moveX /= len;
    inputState.moveZ /= len;
  }
  inputState.ultimateHeld = !!keys["KeyE"] || _touchUltHeld;
  if ((!usingGamepad || !gamepadAimActive) && !touchAimActive && !_abilityAimActive) {
    const worldPos = screenToWorld(inputState.mouseNDC.x, inputState.mouseNDC.y);
    inputState.aimWorldPos.x = worldPos.x;
    inputState.aimWorldPos.y = worldPos.y;
    inputState.aimWorldPos.z = worldPos.z;
  }
  pollGamepad();
  pollTouchJoysticks();
}
function consumeInput() {
  inputState.dash = false;
  inputState.ultimate = false;
  inputState.toggleEditor = false;
}
function getInputState() {
  return inputState;
}
var _touchUltHeld = false;
function triggerDash() {
  inputState.dash = true;
}
function triggerUltimate() {
  inputState.ultimate = true;
}
function setUltimateHeld(held) {
  _touchUltHeld = held;
}
var _abilityAimActive = false;
function setAimFromScreenDrag(screenX, screenY) {
  _abilityAimActive = true;
  const aimDirX = screenX * ISO_RIGHT_X + screenY * ISO_UP_X;
  const aimDirZ = screenX * ISO_RIGHT_Z + screenY * ISO_UP_Z;
  const pp = getPlayerPos();
  const aimDist = 10;
  inputState.aimWorldPos.x = pp.x + aimDirX * aimDist;
  inputState.aimWorldPos.y = 0;
  inputState.aimWorldPos.z = pp.z + aimDirZ * aimDist;
}
var _abilityDirOverride = null;
function setAbilityDirOverride(x, z) {
  _abilityDirOverride = { x, z };
}
function clearAbilityDirOverride() {
  _abilityDirOverride = null;
  _abilityAimActive = false;
}
function getAbilityDirOverride() {
  return _abilityDirOverride;
}
function autoAimClosestEnemy(enemies) {
  if (!touchActive) return;
  if (touchAimActive || _abilityAimActive) return;
  if (!enemies || enemies.length === 0) return;
  const pp = getPlayerPos();
  let closest = null;
  let closestDist = Infinity;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.fellInPit || e.health <= 0) continue;
    const dx = e.pos.x - pp.x;
    const dz = e.pos.z - pp.z;
    const dist = dx * dx + dz * dz;
    if (dist < closestDist) {
      closestDist = dist;
      closest = e;
    }
  }
  if (closest) {
    inputState.aimWorldPos.x = closest.pos.x;
    inputState.aimWorldPos.y = 0;
    inputState.aimWorldPos.z = closest.pos.z;
  }
}

// src/config/waves.ts
var WAVES = [
  {
    wave: 1,
    message: "Wave 1 \u2014 The dungeon stirs...",
    groups: [
      {
        id: "w1g1",
        triggerDelay: 0,
        telegraphDuration: 1500,
        stagger: 200,
        spawns: [
          { type: "goblin", x: 5, z: 2 },
          { type: "goblin", x: 11, z: 0 },
          { type: "goblin", x: 0, z: 5 },
          { type: "iceMortarImp", x: 7, z: -11 },
          { type: "iceMortarImp", x: -10, z: 9 }
        ]
      },
      {
        id: "w1g2",
        triggerDelay: 0,
        telegraphDuration: 1500,
        stagger: 200,
        spawns: [
          { type: "goblin", x: -2, z: -9 },
          { type: "goblin", x: -10, z: -3 },
          { type: "goblin", x: -10, z: 0 }
        ]
      }
    ]
  },
  {
    wave: 2,
    message: "Wave 2 \u2014 Watch the big ones",
    groups: [
      {
        id: "w2g1",
        triggerDelay: 0,
        telegraphDuration: 1500,
        stagger: 150,
        spawns: [
          { type: "goblin", x: 14, z: 0 },
          { type: "stoneGolem", x: 12, z: 2 },
          { type: "goblin", x: 12, z: -2 },
          { type: "goblin", x: -14, z: 0 },
          { type: "goblin", x: -12, z: 2 },
          { type: "stoneGolem", x: -12, z: -1 },
          { type: "goblin", x: 6, z: -7 },
          { type: "goblin", x: -6, z: 6 }
        ]
      },
      {
        id: "w2g2",
        triggerDelay: 3e3,
        telegraphDuration: 2e3,
        stagger: 400,
        spawns: [
          { type: "skeletonArcher", x: 12, z: 12 },
          { type: "skeletonArcher", x: -12, z: -12 },
          { type: "skeletonArcher", x: -12, z: 12 }
        ]
      }
    ]
  },
  {
    wave: 3,
    message: "Wave 3 \u2014 Final wave?",
    groups: [
      {
        id: "w3g1",
        triggerDelay: 0,
        telegraphDuration: 1500,
        stagger: 100,
        spawns: [
          { type: "goblin", x: 15, z: 5 },
          { type: "goblin", x: 15, z: -5 },
          { type: "goblin", x: -15, z: 5 },
          { type: "goblin", x: -15, z: -5 },
          { type: "goblin", x: 5, z: 15 },
          { type: "goblin", x: -5, z: 15 }
        ]
      },
      {
        id: "w3g2",
        triggerDelay: 2e3,
        telegraphDuration: 2e3,
        stagger: 300,
        spawns: [
          { type: "skeletonArcher", x: 14, z: 10 },
          { type: "skeletonArcher", x: -14, z: 10 },
          { type: "skeletonArcher", x: 0, z: -16 },
          { type: "skeletonArcher", x: 14, z: -10 }
        ]
      },
      {
        id: "w3g3",
        triggerDelay: 6e3,
        telegraphDuration: 2500,
        stagger: 500,
        spawns: [
          { type: "stoneGolem", x: 0, z: 15 },
          { type: "stoneGolem", x: -15, z: -5 },
          { type: "stoneGolem", x: 15, z: -5 }
        ]
      },
      {
        id: "w3g4",
        triggerDelay: 7e3,
        telegraphDuration: 1500,
        stagger: 200,
        spawns: [
          { type: "iceMortarImp", x: -13, z: 0 },
          { type: "iceMortarImp", x: -3, z: -12 },
          { type: "iceMortarImp", x: 12, z: 1 },
          { type: "iceMortarImp", x: -5, z: 11 }
        ]
      }
    ]
  }
];

// src/engine/telegraph.ts
var sceneRef5;
var ringGeo2;
var fillGeo;
var typeGeos = {};
function initTelegraph(scene2) {
  sceneRef5 = scene2;
  ringGeo2 = new THREE.RingGeometry(0.6, 0.8, 24);
  ringGeo2.rotateX(-Math.PI / 2);
  fillGeo = new THREE.CircleGeometry(0.6, 24);
  fillGeo.rotateX(-Math.PI / 2);
  typeGeos.goblin = new THREE.ConeGeometry(0.2, 0.4, 3);
  typeGeos.skeletonArcher = new THREE.BoxGeometry(0.25, 0.25, 0.25);
  typeGeos.stoneGolem = new THREE.CylinderGeometry(0.25, 0.25, 0.1, 6);
}
function createTelegraph(x, z, typeName) {
  const color = ENEMY_TYPES[typeName] ? ENEMY_TYPES[typeName].color : 16777215;
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const ringMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const ring = new THREE.Mesh(ringGeo2, ringMat);
  ring.position.y = 0.03;
  group.add(ring);
  const fillMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const fill = new THREE.Mesh(fillGeo, fillMat);
  fill.position.y = 0.02;
  group.add(fill);
  const typeGeo = typeGeos[typeName] || typeGeos.goblin;
  const typeMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.8
  });
  const typeIndicator = new THREE.Mesh(typeGeo, typeMat);
  typeIndicator.position.y = 1.2;
  if (typeName === "skeletonArcher") {
    typeIndicator.rotation.y = Math.PI / 4;
  }
  group.add(typeIndicator);
  sceneRef5.add(group);
  return {
    group,
    ring,
    ringMat,
    fill,
    fillMat,
    typeIndicator,
    typeMat,
    baseColor: color,
    time: 0
  };
}
function updateTelegraph(telegraph, progress, dt) {
  telegraph.time += dt;
  telegraph.fillMat.opacity = progress * 0.4;
  const freq = 2 + progress * 8;
  const pulse = 0.5 + 0.5 * Math.sin(telegraph.time * freq * Math.PI * 2);
  telegraph.ringMat.opacity = 0.3 + pulse * 0.5;
  const scale = 1 + 0.1 * Math.sin(telegraph.time * freq * Math.PI * 2);
  telegraph.ring.scale.set(scale, 1, scale);
  if (progress > 0.8) {
    const flash = Math.sin(telegraph.time * 20) > 0.5;
    telegraph.ringMat.color.setHex(flash ? 16777215 : telegraph.baseColor);
    telegraph.fillMat.color.setHex(flash ? 16777215 : telegraph.baseColor);
  }
  telegraph.typeIndicator.position.y = 1.2 + 0.15 * Math.sin(telegraph.time * 2);
  telegraph.typeIndicator.rotation.y += dt * 1.5;
}
function removeTelegraph2(telegraph) {
  if (telegraph.group.parent) {
    sceneRef5.remove(telegraph.group);
  }
  telegraph.ringMat.dispose();
  telegraph.fillMat.dispose();
  telegraph.typeMat.dispose();
}

// src/engine/waveRunner.ts
var sceneRef6;
var waveState = {
  status: "idle",
  // 'idle' | 'announce' | 'running' | 'cleared' | 'victory'
  waveIndex: 0,
  elapsedMs: 0,
  // ms since wave entered 'running'
  announceTimer: 0,
  clearPauseTimer: 0,
  groups: []
  // runtime state per group
};
var announceEl;
function initWaveRunner(scene2) {
  sceneRef6 = scene2;
  initTelegraph(scene2);
  announceEl = document.getElementById("wave-announce");
}
function startWave(index, gameState2) {
  if (index >= WAVES.length) {
    waveState.status = "victory";
    showAnnounce("VICTORY");
    return;
  }
  waveState.waveIndex = index;
  waveState.status = "announce";
  waveState.announceTimer = 2e3;
  waveState.elapsedMs = 0;
  waveState.groups = [];
  gameState2.currentWave = WAVES[index].wave;
  showAnnounce(WAVES[index].message);
}
function updateWaveRunner(dt, gameState2) {
  const dtMs = dt * 1e3;
  switch (waveState.status) {
    case "idle":
    case "victory":
      return;
    case "announce":
      waveState.announceTimer -= dtMs;
      if (waveState.announceTimer <= 0) {
        hideAnnounce();
        waveState.status = "running";
        initGroupRuntimes();
      }
      break;
    case "running":
      waveState.elapsedMs += dtMs;
      let allGroupsDone = true;
      for (const g of waveState.groups) {
        updateGroup(g, dt, dtMs, gameState2);
        if (g.phase !== "done") allGroupsDone = false;
      }
      if (allGroupsDone && gameState2.enemies.length === 0) {
        waveState.status = "cleared";
        waveState.clearPauseTimer = 2e3;
        showAnnounce("Wave cleared!");
      }
      break;
    case "cleared":
      waveState.clearPauseTimer -= dtMs;
      if (waveState.clearPauseTimer <= 0) {
        hideAnnounce();
        startWave(waveState.waveIndex + 1, gameState2);
      }
      break;
  }
}
function initGroupRuntimes() {
  const waveCfg = WAVES[waveState.waveIndex];
  waveState.groups = waveCfg.groups.map((groupCfg) => ({
    config: groupCfg,
    phase: "waiting",
    // 'waiting' | 'telegraphing' | 'spawning' | 'done'
    timer: 0,
    spawnIndex: 0,
    staggerTimer: 0,
    telegraphs: []
  }));
}
function updateGroup(g, dt, dtMs, gameState2) {
  switch (g.phase) {
    case "waiting":
      if (waveState.elapsedMs >= g.config.triggerDelay) {
        g.phase = "telegraphing";
        g.timer = g.config.telegraphDuration;
        for (const s of g.config.spawns) {
          const t = createTelegraph(s.x, s.z, s.type);
          g.telegraphs.push(t);
        }
      }
      break;
    case "telegraphing":
      g.timer -= dtMs;
      const progress = 1 - Math.max(0, g.timer / g.config.telegraphDuration);
      for (const t of g.telegraphs) {
        updateTelegraph(t, progress, dt);
      }
      if (g.timer <= 0) {
        for (const t of g.telegraphs) {
          removeTelegraph2(t);
        }
        g.telegraphs = [];
        g.phase = "spawning";
        g.spawnIndex = 0;
        g.staggerTimer = 0;
      }
      break;
    case "spawning":
      g.staggerTimer -= dtMs;
      while (g.staggerTimer <= 0 && g.spawnIndex < g.config.spawns.length) {
        const s = g.config.spawns[g.spawnIndex];
        spawnEnemy(s.type, new THREE.Vector3(s.x, 0, s.z), gameState2);
        g.spawnIndex++;
        if (g.spawnIndex < g.config.spawns.length) {
          g.staggerTimer += g.config.stagger;
        }
      }
      if (g.spawnIndex >= g.config.spawns.length) {
        g.phase = "done";
      }
      break;
  }
}
function resetWaveRunner() {
  for (const g of waveState.groups) {
    for (const t of g.telegraphs) {
      removeTelegraph2(t);
    }
  }
  waveState.status = "idle";
  waveState.waveIndex = 0;
  waveState.elapsedMs = 0;
  waveState.groups = [];
  hideAnnounce();
}
function showAnnounce(text) {
  if (!announceEl) return;
  announceEl.textContent = text;
  announceEl.classList.add("visible");
}
function hideAnnounce() {
  if (!announceEl) return;
  announceEl.classList.remove("visible");
}

// src/engine/physics.ts
var collisionBounds = null;
var pitBounds = null;
var movementBounds = null;
function invalidateCollisionBounds() {
  collisionBounds = null;
  pitBounds = null;
  movementBounds = null;
}
var effectGhosts = [];
var _ghostBodyGeo = null;
var _ghostHeadGeo = null;
function createGhostMesh(x, z, radius, height, color) {
  if (!_ghostBodyGeo) {
    _ghostBodyGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
    _ghostHeadGeo = new THREE.SphereGeometry(1, 6, 4);
  }
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 });
  const body2 = new THREE.Mesh(_ghostBodyGeo, bodyMat);
  const bodyH = height * 0.6;
  body2.scale.set(radius, bodyH, radius);
  body2.position.y = height * 0.3;
  group.add(body2);
  const headMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 });
  const headR = radius * 0.7;
  const head2 = new THREE.Mesh(_ghostHeadGeo, headMat);
  head2.scale.set(headR, headR, headR);
  head2.position.y = height * 0.75;
  group.add(head2);
  group.position.set(x, 0, z);
  getScene().add(group);
  return group;
}
function spawnPushGhosts(enemy, oldX, oldZ, newX, newZ) {
  const cfg = enemy.config;
  const r = cfg.size.radius;
  const h = cfg.size.height;
  for (let t = 0.33; t < 1; t += 0.33) {
    const gx = oldX + (newX - oldX) * t;
    const gz = oldZ + (newZ - oldZ) * t;
    const mesh = createGhostMesh(gx, gz, r, h, 4521898);
    effectGhosts.push({ type: "fade", mesh, life: 0, maxLife: 300 });
  }
}
function spawnPitFallGhost(enemy) {
  const cfg = enemy.config;
  const r = cfg.size.radius;
  const h = cfg.size.height;
  const mesh = createGhostMesh(enemy.pos.x, enemy.pos.z, r, h, 8930559);
  mesh.children.forEach((child) => {
    child.material.opacity = 0.7;
  });
  effectGhosts.push({ type: "sink", mesh, life: 0, maxLife: 500 });
}
function updateEffectGhosts(dt) {
  const dtMs = dt * 1e3;
  const scene2 = getScene();
  for (let i = effectGhosts.length - 1; i >= 0; i--) {
    const g = effectGhosts[i];
    g.life += dtMs;
    const t = Math.min(g.life / g.maxLife, 1);
    if (g.type === "fade") {
      const alpha = 0.4 * (1 - t);
      g.mesh.children.forEach((child) => {
        child.material.opacity = alpha;
      });
    } else if (g.type === "sink") {
      const scale = 1 - t;
      g.mesh.scale.set(scale, scale, scale);
      g.mesh.position.y = -1.5 * t;
      const alpha = 0.7 * (1 - t * t);
      g.mesh.children.forEach((child) => {
        child.material.opacity = alpha;
      });
    }
    if (t >= 1) {
      g.mesh.children.forEach((child) => {
        child.material.dispose();
      });
      scene2.remove(g.mesh);
      effectGhosts.splice(i, 1);
    }
  }
}
function clearEffectGhosts() {
  const scene2 = getScene();
  for (const g of effectGhosts) {
    g.mesh.children.forEach((child) => {
      child.material.dispose();
    });
    scene2.remove(g.mesh);
  }
  effectGhosts.length = 0;
}
function getBounds() {
  if (!collisionBounds) collisionBounds = getCollisionBounds();
  return collisionBounds;
}
function getPits() {
  if (!pitBounds) pitBounds = getPitBounds();
  return pitBounds;
}
function getMoveBounds() {
  if (!movementBounds) movementBounds = [...getBounds(), ...getPits()];
  return movementBounds;
}
function circleVsAABB(cx, cz, radius, box) {
  const closestX = Math.max(box.minX, Math.min(cx, box.maxX));
  const closestZ = Math.max(box.minZ, Math.min(cz, box.maxZ));
  const dx = cx - closestX;
  const dz = cz - closestZ;
  const distSq = dx * dx + dz * dz;
  if (distSq < radius * radius) {
    const dist = Math.sqrt(distSq);
    if (dist === 0) {
      const overlapLeft = cx - box.minX;
      const overlapRight = box.maxX - cx;
      const overlapTop = cz - box.minZ;
      const overlapBottom = box.maxZ - cz;
      const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
      if (minOverlap === overlapLeft) return { x: -(overlapLeft + radius), z: 0 };
      if (minOverlap === overlapRight) return { x: overlapRight + radius, z: 0 };
      if (minOverlap === overlapTop) return { x: 0, z: -(overlapTop + radius) };
      return { x: 0, z: overlapBottom + radius };
    }
    const overlap = radius - dist;
    return { x: dx / dist * overlap, z: dz / dist * overlap };
  }
  return null;
}
function pointVsAABB(px, pz, box) {
  return px >= box.minX && px <= box.maxX && pz >= box.minZ && pz <= box.maxZ;
}
function resolveTerrainCollision(x, z, radius) {
  const bounds = getBounds();
  let rx = x, rz = z;
  for (const box of bounds) {
    const push = circleVsAABB(rx, rz, radius, box);
    if (push) {
      rx += push.x;
      rz += push.z;
    }
  }
  return { x: rx, z: rz };
}
function pointHitsTerrain(px, pz) {
  const bounds = getBounds();
  for (const box of bounds) {
    if (pointVsAABB(px, pz, box)) return true;
  }
  return false;
}
function resolveMovementCollision(x, z, radius) {
  const bounds = getMoveBounds();
  let rx = x, rz = z;
  let wasDeflected = false;
  for (const box of bounds) {
    const push = circleVsAABB(rx, rz, radius, box);
    if (push) {
      rx += push.x;
      rz += push.z;
      wasDeflected = true;
    }
  }
  return { x: rx, z: rz, wasDeflected };
}
function pointInPit(px, pz) {
  const pits = getPits();
  for (const pit of pits) {
    if (px >= pit.minX && px <= pit.maxX && pz >= pit.minZ && pz <= pit.maxZ) {
      return true;
    }
  }
  return false;
}
function checkPitFalls(gameState2) {
  const playerPos2 = getPlayerPos();
  if (!isPlayerDashing() && !isPlayerInvincible()) {
    if (pointInPit(playerPos2.x, playerPos2.z)) {
      gameState2.playerHealth = 0;
      gameState2.phase = "gameOver";
      screenShake(5, 200);
      spawnDamageNumber(playerPos2.x, playerPos2.z, "FELL!", "#ff4466");
    }
  }
  for (const enemy of gameState2.enemies) {
    if (enemy.health <= 0) continue;
    if (enemy.isLeaping) continue;
    if (pointInPit(enemy.pos.x, enemy.pos.z)) {
      spawnPitFallGhost(enemy);
      createAoeRing(enemy.pos.x, enemy.pos.z, 2.5, 500, 8930559);
      enemy.health = 0;
      enemy.fellInPit = true;
      enemy.stunTimer = 9999;
      spawnDamageNumber(enemy.pos.x, enemy.pos.z, "FELL!", "#8844ff");
      screenShake(4, 200);
    }
  }
}
function applyDamageToEnemy(enemy, damage, gameState2) {
  if (enemy.shieldActive && enemy.shieldHealth > 0) {
    enemy.shieldHealth -= damage;
    if (enemy.shieldHealth <= 0) {
      const overkill = -enemy.shieldHealth;
      enemy.shieldHealth = 0;
      enemy.shieldActive = false;
      onShieldBreak(enemy, gameState2);
      if (overkill > 0) {
        enemy.health -= overkill;
      }
    }
  } else {
    enemy.health -= damage;
  }
}
function onShieldBreak(enemy, gameState2) {
  const shieldCfg = enemy.config.shield;
  if (!shieldCfg) return;
  if (enemy.shieldMesh) {
    enemy.shieldMesh.visible = false;
    enemy.mesh.remove(enemy.shieldMesh);
    enemy.shieldMesh.material.dispose();
    enemy.shieldMesh = null;
  }
  stunEnemy(enemy, shieldCfg.stunDuration);
  spawnDamageNumber(enemy.pos.x, enemy.pos.z, "BREAK", "#88eeff");
  applyAoeEffect({
    x: enemy.pos.x,
    z: enemy.pos.z,
    radius: shieldCfg.stunRadius,
    durationMs: shieldCfg.breakRingDuration || 400,
    color: 8974079,
    label: "STUNNED",
    effectFn: (e) => stunEnemy(e, shieldCfg.stunDuration),
    gameState: gameState2,
    excludeEnemy: enemy
  });
  enemy.knockbackResist = 0;
  if (enemy.bodyMesh) {
    enemy.bodyMesh.material.transparent = true;
    enemy.bodyMesh.material.opacity = 0.5;
  }
  if (enemy.headMesh) {
    enemy.headMesh.material.transparent = true;
    enemy.headMesh.material.opacity = 0.5;
  }
  screenShake(4, 200);
}
function checkCollisions(gameState2) {
  const playerPos2 = getPlayerPos();
  const playerR = PLAYER.size.radius;
  if (!isPlayerDashing()) {
    const resolved = resolveMovementCollision(playerPos2.x, playerPos2.z, playerR);
    playerPos2.x = resolved.x;
    playerPos2.z = resolved.z;
  }
  for (const enemy of gameState2.enemies) {
    if (enemy.isLeaping) continue;
    const resolved = resolveMovementCollision(enemy.pos.x, enemy.pos.z, enemy.config.size.radius);
    enemy.pos.x = resolved.x;
    enemy.pos.z = resolved.z;
    enemy.wasDeflected = resolved.wasDeflected;
    enemy.mesh.position.copy(enemy.pos);
  }
  const playerProj = getPlayerProjectiles();
  for (let i = playerProj.length - 1; i >= 0; i--) {
    const p = playerProj[i];
    if (!p.mesh.visible) continue;
    if (pointHitsTerrain(p.mesh.position.x, p.mesh.position.z)) {
      releaseProjectile(p);
      continue;
    }
    for (const enemy of gameState2.enemies) {
      const dx = p.mesh.position.x - enemy.pos.x;
      const dz = p.mesh.position.z - enemy.pos.z;
      const distSq = dx * dx + dz * dz;
      const hitR = enemy.config.size.radius + PLAYER.projectile.size;
      if (distSq < hitR * hitR) {
        const wasShielded = enemy.shieldActive;
        applyDamageToEnemy(enemy, p.damage, gameState2);
        releaseProjectile(p);
        const dmgColor = wasShielded ? "#88eeff" : "#44ff88";
        spawnDamageNumber(enemy.pos.x, enemy.pos.z, p.damage, dmgColor);
        enemy.flashTimer = 80;
        enemy.bodyMesh.material.emissive.setHex(16777215);
        if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(16777215);
        break;
      }
    }
  }
  const enemyProj = getEnemyProjectiles();
  for (let i = enemyProj.length - 1; i >= 0; i--) {
    const p = enemyProj[i];
    if (!p.mesh.visible) continue;
    if (pointHitsTerrain(p.mesh.position.x, p.mesh.position.z)) {
      releaseProjectile(p);
      continue;
    }
    if (!isPlayerInvincible()) {
      const dx = p.mesh.position.x - playerPos2.x;
      const dz = p.mesh.position.z - playerPos2.z;
      const distSq = dx * dx + dz * dz;
      const hitR = playerR + 0.1;
      if (distSq < hitR * hitR) {
        gameState2.playerHealth -= p.damage;
        releaseProjectile(p);
        screenShake(3, 100);
        spawnDamageNumber(playerPos2.x, playerPos2.z, p.damage, "#ff4466");
        if (gameState2.playerHealth <= 0) {
          gameState2.playerHealth = 0;
          gameState2.phase = "gameOver";
        }
        break;
      }
    }
  }
  if (!isPlayerInvincible()) {
    const now = performance.now();
    for (const enemy of gameState2.enemies) {
      if (enemy.behavior === "kite") continue;
      if (enemy.stunTimer > 0) continue;
      const dx = enemy.pos.x - playerPos2.x;
      const dz = enemy.pos.z - playerPos2.z;
      const distSq = dx * dx + dz * dz;
      const hitR = playerR + enemy.config.size.radius;
      if (distSq < hitR * hitR) {
        const attackCooldown = enemy.config.attackRate || 1e3;
        if (now - enemy.lastAttackTime > attackCooldown) {
          const chargeMult = enemy.config.tank && enemy.config.tank.chargeDamageMult || 1.5;
          const dmg = enemy.isCharging ? enemy.config.damage * chargeMult : enemy.config.damage;
          gameState2.playerHealth -= dmg;
          enemy.lastAttackTime = now;
          screenShake(enemy.isCharging ? 5 : 2, enemy.isCharging ? 150 : 80);
          spawnDamageNumber(playerPos2.x, playerPos2.z, dmg, "#ff4466");
          if (gameState2.playerHealth <= 0) {
            gameState2.playerHealth = 0;
            gameState2.phase = "gameOver";
          }
        }
      }
    }
  }
  const pushEvt = consumePushEvent();
  if (pushEvt) {
    const dirX = pushEvt.dirX;
    const dirZ = pushEvt.dirZ;
    for (const enemy of gameState2.enemies) {
      if (enemy.health <= 0) continue;
      if (enemy.isLeaping) continue;
      const enemyRadius = enemy.config.size.radius;
      if (isInRotatedRect(
        enemy.pos.x,
        enemy.pos.z,
        pushEvt.x,
        pushEvt.z,
        pushEvt.width,
        pushEvt.length,
        pushEvt.rotation,
        enemyRadius
      )) {
        const oldX = enemy.pos.x;
        const oldZ = enemy.pos.z;
        const iceEffects = getIceEffects(enemy.pos.x, enemy.pos.z, false);
        const kbMult = 1 - (enemy.knockbackResist ?? enemy.config.knockbackResist ?? 0);
        const kbDist = pushEvt.force * kbMult * iceEffects.knockbackMult;
        enemy.pos.x += dirX * kbDist;
        enemy.pos.z += dirZ * kbDist;
        enemy.mesh.position.copy(enemy.pos);
        spawnPushGhosts(enemy, oldX, oldZ, enemy.pos.x, enemy.pos.z);
        enemy.flashTimer = 100;
        enemy.bodyMesh.material.emissive.setHex(4521898);
        if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(4521898);
        spawnDamageNumber(enemy.pos.x, enemy.pos.z, "PUSH", "#44ffaa");
      }
    }
  }
  if (pushEvt) {
    for (const enemy of gameState2.enemies) {
      if (enemy.isLeaping) continue;
      const resolved = resolveTerrainCollision(enemy.pos.x, enemy.pos.z, enemy.config.size.radius);
      enemy.pos.x = resolved.x;
      enemy.pos.z = resolved.z;
      enemy.mesh.position.copy(enemy.pos);
    }
  }
}

// src/ui/hud.ts
var healthBar;
var healthText;
var waveIndicator;
var currencyCount;
var abilityBar;
var mobileBtnDash;
var mobileBtnUlt;
function initHUD() {
  healthBar = document.getElementById("health-bar");
  healthText = document.getElementById("health-text");
  waveIndicator = document.getElementById("wave-indicator");
  currencyCount = document.getElementById("currency-count");
  abilityBar = document.getElementById("ability-bar");
  for (const [key, ability] of Object.entries(ABILITIES)) {
    const el = document.createElement("div");
    el.className = "ability-slot ready";
    el.id = `ability-${key}`;
    el.innerHTML = `<div class="ability-key">${ability.key}</div><div class="ability-name">${ability.name}</div><div class="ability-cooldown-text"></div><div class="ability-cooldown-overlay"></div>`;
    abilityBar.appendChild(el);
  }
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (hasTouch) {
    initMobileButtons();
  }
}
var DRAG_THRESHOLD = 15;
var DRAG_MAX_RADIUS = 80;
var INV_SQRT22 = 1 / Math.SQRT2;
var ISO_RIGHT_X2 = INV_SQRT22;
var ISO_RIGHT_Z2 = -INV_SQRT22;
var ISO_UP_X2 = -INV_SQRT22;
var ISO_UP_Z2 = -INV_SQRT22;
function initMobileButtons() {
  mobileBtnDash = document.getElementById("mobile-btn-dash");
  mobileBtnUlt = document.getElementById("mobile-btn-ultimate");
  if (!mobileBtnDash || !mobileBtnUlt) return;
  setupDragToAim(mobileBtnDash, {
    onDragStart: () => {
    },
    onDragMove: (normX, normY) => {
      const isoX = normX * ISO_RIGHT_X2 + normY * ISO_UP_X2;
      const isoZ = normX * ISO_RIGHT_Z2 + normY * ISO_UP_Z2;
      setAbilityDirOverride(isoX, isoZ);
      setAimFromScreenDrag(normX, normY);
    },
    onRelease: (wasDrag) => {
      triggerDash();
      if (!wasDrag) clearAbilityDirOverride();
    },
    onCancel: () => {
      clearAbilityDirOverride();
    }
  });
  setupDragToAim(mobileBtnUlt, {
    onDragStart: () => {
      triggerUltimate();
      setUltimateHeld(true);
    },
    onDragMove: (normX, normY) => {
      setAimFromScreenDrag(normX, normY);
    },
    onRelease: () => {
      setUltimateHeld(false);
      clearAbilityDirOverride();
    },
    onCancel: () => {
      setUltimateHeld(false);
      clearAbilityDirOverride();
    }
  });
}
function setupDragToAim(btnEl, { onDragStart, onDragMove, onRelease, onCancel }) {
  let touchId = null;
  let startX = 0, startY = 0;
  let isDragging2 = false;
  btnEl.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (touchId !== null) return;
    const touch = e.changedTouches[0];
    touchId = touch.identifier;
    startX = touch.clientX;
    startY = touch.clientY;
    isDragging2 = false;
    onDragStart();
  });
  window.addEventListener("touchmove", (e) => {
    if (touchId === null) return;
    const touch = findTouch(e.changedTouches, touchId);
    if (!touch) return;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > DRAG_THRESHOLD) {
      isDragging2 = true;
      const clampedDist = Math.min(dist, DRAG_MAX_RADIUS);
      const normX = dx / dist * (clampedDist / DRAG_MAX_RADIUS);
      const normY = -dy / dist * (clampedDist / DRAG_MAX_RADIUS);
      onDragMove(normX, normY);
    }
  }, { passive: true });
  window.addEventListener("touchend", (e) => {
    if (touchId === null) return;
    const touch = findTouch(e.changedTouches, touchId);
    if (!touch) return;
    touchId = null;
    onRelease(isDragging2);
  });
  window.addEventListener("touchcancel", (e) => {
    if (touchId === null) return;
    const touch = findTouch(e.changedTouches, touchId);
    if (!touch) return;
    touchId = null;
    onCancel();
  });
}
function findTouch(touchList, id) {
  for (let i = 0; i < touchList.length; i++) {
    if (touchList[i].identifier === id) return touchList[i];
  }
  return null;
}
function updateHUD(gameState2) {
  const pct = Math.max(0, gameState2.playerHealth / gameState2.playerMaxHealth);
  healthBar.style.width = pct * 100 + "%";
  if (pct > 0.5) {
    healthBar.style.backgroundColor = "#44ff88";
  } else if (pct > 0.25) {
    healthBar.style.backgroundColor = "#ffcc44";
  } else {
    healthBar.style.backgroundColor = "#ff4444";
  }
  healthText.textContent = Math.ceil(gameState2.playerHealth) + " / " + gameState2.playerMaxHealth;
  waveIndicator.textContent = "Wave " + gameState2.currentWave;
  currencyCount.textContent = gameState2.currency;
  for (const [key, state] of Object.entries(gameState2.abilities)) {
    if (!ABILITIES[key]) continue;
    const cfg = ABILITIES[key];
    const slot = document.getElementById(`ability-${key}`);
    if (slot) {
      const overlay = slot.querySelector(".ability-cooldown-overlay");
      const cdText = slot.querySelector(".ability-cooldown-text");
      if (state.cooldownRemaining > 0) {
        const pctRemaining = Math.max(0, state.cooldownRemaining / cfg.cooldown);
        overlay.style.height = pctRemaining * 100 + "%";
        slot.classList.remove("ready");
        const secs = Math.ceil(state.cooldownRemaining / 1e3);
        cdText.textContent = secs;
        cdText.style.display = "flex";
      } else {
        overlay.style.height = "0%";
        slot.classList.add("ready");
        cdText.style.display = "none";
      }
      if (key === "ultimate" && state.charging) {
        const chargePct = Math.round(state.chargeT * 100);
        slot.style.borderColor = "rgba(68, 255, 170, 0.8)";
        slot.style.boxShadow = "0 0 12px rgba(68, 255, 170, 0.4)";
        cdText.textContent = chargePct + "%";
        cdText.style.display = "flex";
        cdText.style.color = "#44ffaa";
        overlay.style.height = (1 - state.chargeT) * 100 + "%";
        overlay.style.backgroundColor = "rgba(68, 255, 170, 0.3)";
      } else {
        if (slot.style.borderColor) slot.style.borderColor = "";
        if (slot.style.boxShadow) slot.style.boxShadow = "";
        cdText.style.color = "";
        overlay.style.backgroundColor = "";
      }
    }
    const mBtn = key === "dash" ? mobileBtnDash : key === "ultimate" ? mobileBtnUlt : null;
    if (mBtn) {
      const mOverlay = mBtn.querySelector(".mobile-btn-cd-overlay");
      const mCdText = mBtn.querySelector(".mobile-btn-cd-text");
      if (state.cooldownRemaining > 0) {
        const pctRemaining = Math.max(0, state.cooldownRemaining / cfg.cooldown);
        mOverlay.style.height = pctRemaining * 100 + "%";
        mBtn.classList.remove("ready");
        const secs = Math.ceil(state.cooldownRemaining / 1e3);
        mCdText.textContent = secs;
        mCdText.style.display = "flex";
      } else {
        mOverlay.style.height = "0%";
        mBtn.classList.add("ready");
        mCdText.style.display = "none";
      }
      if (key === "ultimate" && state.charging) {
        const chargePct = Math.round(state.chargeT * 100);
        mBtn.style.borderColor = "rgba(68, 255, 170, 0.9)";
        mBtn.style.boxShadow = "0 0 16px rgba(68, 255, 170, 0.5)";
        mCdText.textContent = chargePct + "%";
        mCdText.style.display = "flex";
        mCdText.style.color = "#44ffaa";
        mOverlay.style.height = (1 - state.chargeT) * 100 + "%";
        mOverlay.style.backgroundColor = "rgba(68, 255, 170, 0.3)";
      } else if (key === "ultimate") {
        if (mBtn.style.borderColor) mBtn.style.borderColor = "";
        if (mBtn.style.boxShadow) mBtn.style.boxShadow = "";
        mCdText.style.color = "";
        mOverlay.style.backgroundColor = "";
      }
    }
  }
}

// src/ui/screens.ts
var startScreen;
var startBtn;
var gameOverScreen;
var restartBtn;
var gameOverStats;
function initScreens(onRestart, onStart) {
  startScreen = document.getElementById("start-screen");
  startBtn = document.getElementById("start-btn");
  const handleStart = () => {
    hideStartScreen();
    onStart();
  };
  startBtn.addEventListener("click", handleStart);
  startBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    handleStart();
  });
  gameOverScreen = document.getElementById("game-over-screen");
  restartBtn = document.getElementById("restart-btn");
  gameOverStats = document.getElementById("game-over-stats");
  restartBtn.addEventListener("click", () => {
    hideScreens();
    onRestart();
  });
}
function hideStartScreen() {
  startScreen.classList.add("hidden");
}
function showGameOver(gameState2) {
  gameOverStats.textContent = `Enemies defeated: ${gameState2.currency} gold earned`;
  gameOverScreen.classList.remove("hidden");
}
function hideScreens() {
  gameOverScreen.classList.add("hidden");
}

// src/config/boss.ts
var BOSS = {
  name: "The Warden",
  health: 300,
  speed: 2,
  damage: 30,
  size: { radius: 0.8, height: 2 },
  color: 16746496,
  emissive: 16729088,
  phases: [
    { healthThreshold: 1, behavior: "chase", attackRate: 1e3 },
    { healthThreshold: 0.5, behavior: "enrage", attackRate: 600, speed: 3, spawnMinions: { type: "goblin", count: 3 } }
  ]
};

// src/engine/urlParams.ts
var CONFIG_ROOTS = {
  player: PLAYER,
  goblin: ENEMY_TYPES.goblin,
  skeletonArcher: ENEMY_TYPES.skeletonArcher,
  iceMortarImp: ENEMY_TYPES.iceMortarImp,
  stoneGolem: ENEMY_TYPES.stoneGolem,
  dash: ABILITIES.dash,
  ultimate: ABILITIES.ultimate,
  boss: BOSS
};
function getNestedValue(obj, path) {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return void 0;
    cur = cur[p];
  }
  return cur;
}
function setNestedValue(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}
function parseValue(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw.startsWith("0x") || raw.startsWith("0X")) {
    const hex = parseInt(raw, 16);
    if (!isNaN(hex)) return hex;
  }
  const num = Number(raw);
  return isNaN(num) ? raw : num;
}
function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  let applied = 0;
  for (const [key, rawValue] of params) {
    const dotIdx = key.indexOf(".");
    if (dotIdx === -1) continue;
    const prefix = key.slice(0, dotIdx);
    const path = key.slice(dotIdx + 1);
    if (!path) continue;
    const root = CONFIG_ROOTS[prefix];
    if (!root) {
      console.warn(`[urlParams] Unknown prefix: "${prefix}" (from "${key}")`);
      continue;
    }
    const existing = getNestedValue(root, path);
    if (existing === void 0) {
      console.warn(`[urlParams] Unknown path: "${key}" \u2014 no such property`);
      continue;
    }
    const value = parseValue(rawValue);
    setNestedValue(root, path, value);
    applied++;
    console.log(`[urlParams] ${key} = ${value}`);
  }
  if (applied > 0) {
    console.log(`[urlParams] Applied ${applied} override(s) from URL`);
  }
  return applied;
}
function snapshotDefaults() {
  const snap = {};
  for (const [prefix, root] of Object.entries(CONFIG_ROOTS)) {
    snap[prefix] = JSON.parse(JSON.stringify(root));
  }
  return snap;
}
function buildShareUrl(defaults) {
  const params = new URLSearchParams();
  for (const [prefix, root] of Object.entries(CONFIG_ROOTS)) {
    const defRoot = defaults[prefix];
    if (!defRoot) continue;
    collectDiffs(params, prefix, defRoot, root, "");
  }
  const base = window.location.origin + window.location.pathname;
  const qs = params.toString();
  return qs ? base + "?" + qs : base;
}
function collectDiffs(params, prefix, defObj, curObj, pathPrefix) {
  for (const key of Object.keys(curObj)) {
    const fullPath = pathPrefix ? pathPrefix + "." + key : key;
    const curVal = curObj[key];
    const defVal = getNestedValue(defObj, fullPath);
    if (curVal != null && typeof curVal === "object" && !Array.isArray(curVal)) {
      collectDiffs(params, prefix, defObj, curVal, fullPath);
    } else if (curVal !== defVal) {
      params.set(prefix + "." + fullPath, String(curVal));
    }
  }
}

// src/ui/tuning.ts
var SLIDERS = [
  {
    group: "Projectiles (Self)",
    items: [
      {
        label: "Fire Rate",
        config: () => PLAYER,
        key: "fireRate",
        min: 50,
        max: 1e3,
        step: 10,
        suffix: "ms",
        invert: true,
        unit: "ms",
        tip: "Time between player auto-shots. Lower = faster firing."
      },
      {
        label: "Speed",
        config: () => PLAYER.projectile,
        key: "speed",
        min: 4,
        max: 40,
        step: 1,
        suffix: "",
        unit: "u/s",
        tip: "Player projectile travel speed in units per second."
      },
      {
        label: "Size",
        config: () => PLAYER.projectile,
        key: "size",
        min: 0.04,
        max: 0.5,
        step: 0.02,
        suffix: "",
        unit: "u",
        tip: "Player projectile collision radius in world units."
      }
    ]
  },
  {
    group: "Self",
    items: [
      {
        label: "Move Speed",
        config: () => PLAYER,
        key: "speed",
        min: 2,
        max: 16,
        step: 0.5,
        suffix: "",
        unit: "u/s",
        tip: "Player movement speed in units per second."
      }
    ]
  },
  {
    group: "Enemies",
    items: [
      {
        label: "Speed Mult",
        config: () => null,
        key: "enemySpeedMult",
        min: 0.2,
        max: 4,
        step: 0.1,
        suffix: "x",
        custom: "enemySpeed",
        unit: "x",
        tip: "Global speed multiplier applied to all enemy types. 1x = default."
      }
    ]
  }
];
var enemySpeedMultiplier = 1;
var originalSpeeds = {};
function captureOriginalSpeeds() {
  for (const [name, cfg] of Object.entries(ENEMY_TYPES)) {
    originalSpeeds[name] = cfg.speed;
  }
}
function applyEnemySpeedMultiplier(mult) {
  enemySpeedMultiplier = mult;
  for (const [name, cfg] of Object.entries(ENEMY_TYPES)) {
    cfg.speed = originalSpeeds[name] * mult;
  }
}
var panel;
var isCollapsed = true;
function initTuningPanel() {
  captureOriginalSpeeds();
  panel = document.createElement("div");
  panel.id = "tuning-panel";
  panel.innerHTML = "";
  const toggle = document.createElement("div");
  toggle.id = "tuning-toggle";
  toggle.textContent = "Tune";
  toggle.addEventListener("click", () => {
    isCollapsed = !isCollapsed;
    panel.classList.toggle("collapsed", isCollapsed);
    toggle.textContent = isCollapsed ? "Tune" : "\xD7";
  });
  panel.appendChild(toggle);
  const content = document.createElement("div");
  content.id = "tuning-content";
  panel.appendChild(content);
  for (const group of SLIDERS) {
    const groupEl = document.createElement("div");
    groupEl.className = "tuning-group";
    const groupLabel2 = document.createElement("div");
    groupLabel2.className = "tuning-group-label";
    groupLabel2.textContent = group.group;
    groupEl.appendChild(groupLabel2);
    for (const item of group.items) {
      const row = document.createElement("div");
      row.className = "tuning-row";
      const label = document.createElement("span");
      label.className = "tuning-label";
      label.textContent = item.label;
      if (item.tip) {
        label.setAttribute("data-tip", item.tip);
        label.classList.add("has-tooltip");
      }
      const slider = document.createElement("input");
      slider.type = "range";
      slider.className = "tuning-slider";
      slider.min = item.min;
      slider.max = item.max;
      slider.step = item.step;
      let currentVal;
      if (item.custom === "enemySpeed") {
        currentVal = enemySpeedMultiplier;
      } else {
        currentVal = item.config()[item.key];
      }
      slider.value = currentVal;
      const valueDisplay = document.createElement("span");
      valueDisplay.className = "tuning-value";
      valueDisplay.textContent = formatValue(currentVal, item);
      slider.addEventListener("input", () => {
        const val = parseFloat(slider.value);
        if (item.custom === "enemySpeed") {
          applyEnemySpeedMultiplier(val);
        } else {
          item.config()[item.key] = val;
        }
        valueDisplay.textContent = formatValue(val, item);
      });
      row.appendChild(label);
      row.appendChild(slider);
      row.appendChild(valueDisplay);
      groupEl.appendChild(row);
    }
    content.appendChild(groupEl);
  }
  const copyBtn = document.createElement("div");
  copyBtn.id = "tuning-copy";
  copyBtn.textContent = "Copy Values";
  copyBtn.addEventListener("click", () => {
    const text = buildCopyText();
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = "Copied!";
      copyBtn.classList.add("copied");
      setTimeout(() => {
        copyBtn.textContent = "Copy Values";
        copyBtn.classList.remove("copied");
      }, 1200);
    });
  });
  content.appendChild(copyBtn);
  const shareBtn = document.createElement("div");
  shareBtn.id = "tuning-share";
  shareBtn.textContent = "Share URL";
  shareBtn.addEventListener("click", () => {
    const url = buildShareUrl(window.__configDefaults || {});
    navigator.clipboard.writeText(url).then(() => {
      shareBtn.textContent = "Copied URL!";
      shareBtn.classList.add("copied");
      setTimeout(() => {
        shareBtn.textContent = "Share URL";
        shareBtn.classList.remove("copied");
      }, 1200);
    });
  });
  content.appendChild(shareBtn);
  const tooltipEl = document.createElement("div");
  tooltipEl.id = "tuning-tooltip";
  document.body.appendChild(tooltipEl);
  let tuningTipTarget = null;
  panel.addEventListener("mouseover", (e) => {
    const el = e.target.closest(".has-tooltip");
    if (el && el.getAttribute("data-tip")) {
      tuningTipTarget = el;
      tooltipEl.textContent = el.getAttribute("data-tip");
      tooltipEl.classList.add("visible");
      const rect = el.getBoundingClientRect();
      let left = rect.left - tooltipEl.offsetWidth - 8;
      let top = rect.top + rect.height / 2 - tooltipEl.offsetHeight / 2;
      if (left < 4) {
        left = rect.right + 8;
      }
      top = Math.max(4, Math.min(window.innerHeight - tooltipEl.offsetHeight - 4, top));
      tooltipEl.style.left = left + "px";
      tooltipEl.style.top = top + "px";
    }
  });
  panel.addEventListener("mouseout", (e) => {
    const el = e.target.closest(".has-tooltip");
    if (el === tuningTipTarget) {
      tuningTipTarget = null;
      tooltipEl.classList.remove("visible");
    }
  });
  panel.classList.add("collapsed");
  document.body.appendChild(panel);
  injectStyles();
}
function buildCopyText() {
  const lines = [];
  for (const group of SLIDERS) {
    lines.push(`${group.group}:`);
    for (const item of group.items) {
      let val;
      if (item.custom === "enemySpeed") {
        val = enemySpeedMultiplier;
      } else {
        val = item.config()[item.key];
      }
      const display = Number.isInteger(val) ? val : parseFloat(val.toFixed(4));
      const suffix = item.suffix ? " " + item.suffix : "";
      lines.push(`  ${item.label}: ${display}${suffix}`);
    }
  }
  return lines.join("\n");
}
function formatValue(val, item) {
  const display = Number.isInteger(val) ? val : val.toFixed(2);
  const unitStr = item.unit || item.suffix || "";
  return display + (unitStr ? " " + unitStr : "");
}
function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
    #tuning-panel {
      position: fixed;
      top: 60px;
      right: 20px;
      width: 300px;
      z-index: 200;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      pointer-events: all;
      transition: transform 0.25s ease;
    }

    #tuning-panel.collapsed #tuning-content {
      display: none;
    }

    #tuning-toggle {
      position: absolute;
      top: 0;
      right: 0;
      width: 48px;
      height: 28px;
      background: rgba(20, 20, 40, 0.85);
      border: 1px solid rgba(68, 255, 136, 0.3);
      border-radius: 4px;
      color: rgba(68, 255, 136, 0.8);
      font-family: inherit;
      font-size: 11px;
      letter-spacing: 1px;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      user-select: none;
      transition: all 0.15s ease;
    }

    #tuning-toggle:hover {
      background: rgba(68, 255, 136, 0.1);
      border-color: rgba(68, 255, 136, 0.6);
    }

    #tuning-content {
      margin-top: 36px;
      background: rgba(10, 10, 26, 0.94);
      border: 1px solid rgba(68, 255, 136, 0.2);
      border-radius: 6px;
      padding: 16px;
      backdrop-filter: blur(8px);
    }

    .tuning-group {
      margin-bottom: 14px;
    }

    .tuning-group:last-child {
      margin-bottom: 0;
    }

    .tuning-group-label {
      font-size: 9px;
      color: rgba(68, 255, 136, 0.6);
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid rgba(68, 255, 136, 0.1);
    }

    .tuning-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }

    .tuning-row:last-child {
      margin-bottom: 0;
    }

    .tuning-label {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.6);
      width: 80px;
      flex-shrink: 0;
    }

    .tuning-label.has-tooltip {
      cursor: help;
      text-decoration: underline dotted rgba(255, 255, 255, 0.25);
      text-underline-offset: 2px;
    }

    .tuning-slider {
      flex: 1;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: rgba(100, 100, 160, 0.3);
      border-radius: 2px;
      outline: none;
      cursor: pointer;
    }

    .tuning-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #44ff88;
      cursor: pointer;
      border: none;
      box-shadow: 0 0 6px rgba(68, 255, 136, 0.4);
    }

    .tuning-slider::-moz-range-thumb {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #44ff88;
      cursor: pointer;
      border: none;
      box-shadow: 0 0 6px rgba(68, 255, 136, 0.4);
    }

    .tuning-value {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.8);
      width: 54px;
      text-align: right;
      flex-shrink: 0;
    }

    #tuning-copy, #tuning-share {
      margin-top: 14px;
      padding: 6px 0;
      text-align: center;
      font-size: 10px;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: rgba(68, 255, 136, 0.7);
      background: rgba(68, 255, 136, 0.06);
      border: 1px solid rgba(68, 255, 136, 0.2);
      border-radius: 4px;
      cursor: pointer;
      user-select: none;
      transition: all 0.15s ease;
    }

    #tuning-share {
      margin-top: 6px;
    }

    #tuning-copy:hover, #tuning-share:hover {
      background: rgba(68, 255, 136, 0.12);
      border-color: rgba(68, 255, 136, 0.5);
      color: rgba(68, 255, 136, 1);
    }

    #tuning-copy.copied, #tuning-share.copied {
      color: #ffcc44;
      border-color: rgba(255, 204, 68, 0.4);
      background: rgba(255, 204, 68, 0.08);
    }

    #tuning-tooltip {
      position: fixed;
      z-index: 300;
      max-width: 220px;
      padding: 6px 10px;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 10px;
      line-height: 1.4;
      color: rgba(255, 255, 255, 0.9);
      background: rgba(10, 10, 30, 0.95);
      border: 1px solid rgba(68, 255, 136, 0.4);
      border-radius: 4px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.12s ease;
      backdrop-filter: blur(6px);
    }

    #tuning-tooltip.visible {
      opacity: 1;
    }
  `;
  document.head.appendChild(style);
}

// src/ui/spawnEditor.ts
console.log("[spawnEditor] v2 loaded \u2014 tabs enabled");
var sceneRef7;
var gameStateRef;
var panel2;
var active = false;
var previousPhase = "playing";
var currentTab = "spawn";
var editorState = {
  waveIndex: 0,
  groupIndex: 0,
  enemyType: "goblin",
  selectedSpawnIdx: -1
  // index into current group's spawns, -1 = none
};
var levelState = {
  selectedType: null,
  // 'obstacle' or 'pit'
  selectedIdx: -1
  // index into OBSTACLES or PITS
};
var currentPresetName = null;
var isDragging = false;
var dragStarted = false;
var dragStartWorld = null;
var undoStack = [];
var redoStack = [];
var MAX_UNDO = 50;
function snapshotGroup() {
  const wave = WAVES[editorState.waveIndex];
  if (!wave) return null;
  const group = wave.groups[editorState.groupIndex];
  if (!group) return null;
  return {
    tab: "spawn",
    waveIndex: editorState.waveIndex,
    groupIndex: editorState.groupIndex,
    spawns: JSON.parse(JSON.stringify(group.spawns)),
    triggerDelay: group.triggerDelay,
    telegraphDuration: group.telegraphDuration,
    stagger: group.stagger
  };
}
function snapshotLevel() {
  return {
    tab: "level",
    obstacles: JSON.parse(JSON.stringify(OBSTACLES)),
    pits: JSON.parse(JSON.stringify(PITS)),
    selectedType: levelState.selectedType,
    selectedIdx: levelState.selectedIdx
  };
}
function pushUndo() {
  const snap = currentTab === "level" ? snapshotLevel() : snapshotGroup();
  if (!snap) return;
  undoStack.push(snap);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
}
function applySnapshot(snap) {
  if (snap.tab === "level") {
    OBSTACLES.length = 0;
    for (const o of snap.obstacles) OBSTACLES.push(o);
    PITS.length = 0;
    for (const p of snap.pits) PITS.push(p);
    levelState.selectedType = snap.selectedType;
    levelState.selectedIdx = snap.selectedIdx;
    onArenaChanged();
    rebuildLevelMarkers();
    refreshUI();
  } else {
    editorState.waveIndex = snap.waveIndex;
    editorState.groupIndex = snap.groupIndex;
    const wave = WAVES[snap.waveIndex];
    if (!wave) return;
    const group = wave.groups[snap.groupIndex];
    if (!group) return;
    group.spawns = snap.spawns;
    group.triggerDelay = snap.triggerDelay;
    group.telegraphDuration = snap.telegraphDuration;
    group.stagger = snap.stagger;
    rebuildMarkers();
    refreshUI();
  }
}
function popUndo() {
  if (undoStack.length === 0) return;
  const current = currentTab === "level" ? snapshotLevel() : snapshotGroup();
  if (current) redoStack.push(current);
  applySnapshot(undoStack.pop());
}
function popRedo() {
  if (redoStack.length === 0) return;
  const current = currentTab === "level" ? snapshotLevel() : snapshotGroup();
  if (current) undoStack.push(current);
  applySnapshot(redoStack.pop());
}
var markers = [];
var levelMarkers = [];
var markerGeo;
var markerMats = {};
var waveLabel;
var groupLabel;
var spawnCountLabel;
var bannerEl;
var spawnTabContent;
var levelTabContent;
var TYPE_SHORT = {
  goblin: "G",
  skeletonArcher: "A",
  iceMortarImp: "M",
  stoneGolem: "T"
};
var ENEMY_TYPE_KEYS = Object.keys(ENEMY_TYPES);
var ENEMY_TUNING_SLIDERS = {
  goblin: [
    { label: "Health", key: "health", min: 5, max: 200, step: 5, suffix: "", unit: "HP", tip: "Hit points before death." },
    { label: "Speed", key: "speed", min: 0.5, max: 6, step: 0.1, suffix: "", unit: "u/s", tip: "Movement speed in units per second." },
    { label: "Damage", key: "damage", min: 1, max: 50, step: 1, suffix: "", unit: "HP", tip: "Melee damage per hit." },
    { label: "Attack Rate", key: "attackRate", min: 200, max: 3e3, step: 50, suffix: "ms", unit: "ms", tip: "Minimum time between melee attacks." },
    { label: "KB Resist", key: "knockbackResist", min: 0, max: 1, step: 0.05, suffix: "", unit: "", tip: "Resistance to knockback. 0 = full knockback, 1 = immune." },
    { label: "Stop Dist", key: "rush.stopDistance", min: 0.1, max: 3, step: 0.1, suffix: "", unit: "u", tip: "How close to the player before the goblin stops moving." },
    { label: "Leap Edge", key: "pitLeap.edgeTimeRequired", min: 200, max: 4e3, step: 100, suffix: "ms", unit: "ms", tip: "How long a goblin must hug a pit edge before leaping." },
    { label: "Leap Speed", key: "pitLeap.leapSpeed", min: 2, max: 20, step: 0.5, suffix: "", unit: "u/s", tip: "Travel speed along the arc. Lower = slower, more dramatic." },
    { label: "Leap Height", key: "pitLeap.arcHeight", min: 1, max: 12, step: 0.5, suffix: "", unit: "u", tip: "Peak height of the parabolic leap arc." },
    { label: "Leap CD", key: "pitLeap.cooldown", min: 500, max: 1e4, step: 250, suffix: "ms", unit: "ms", tip: "Cooldown before a goblin can leap again." }
  ],
  skeletonArcher: [
    { label: "Health", key: "health", min: 5, max: 200, step: 5, suffix: "", unit: "HP", tip: "Hit points before death." },
    { label: "Speed", key: "speed", min: 0.5, max: 6, step: 0.1, suffix: "", unit: "u/s", tip: "Movement speed in units per second." },
    { label: "Damage", key: "damage", min: 1, max: 50, step: 1, suffix: "", unit: "HP", tip: "Base damage value." },
    { label: "Attack Rate", key: "attackRate", min: 500, max: 5e3, step: 100, suffix: "ms", unit: "ms", tip: "Cooldown between sniper shots (includes telegraph time)." },
    { label: "Attack Range", key: "attackRange", min: 3, max: 20, step: 0.5, suffix: "", unit: "u", tip: "Maximum distance to initiate a sniper shot." },
    { label: "KB Resist", key: "knockbackResist", min: 0, max: 1, step: 0.05, suffix: "", unit: "", tip: "Resistance to knockback. 0 = full knockback, 1 = immune." },
    { label: "Sniper Telegraph", key: "sniper.telegraphDuration", min: 200, max: 2e3, step: 50, suffix: "ms", unit: "ms", tip: "How long the laser sight shows before firing. This is the player's dodge window." },
    { label: "Shot Width", key: "sniper.shotWidth", min: 0.5, max: 4, step: 0.1, suffix: "", unit: "u", tip: "Width of the damage corridor (perpendicular to aim)." },
    { label: "Shot Length", key: "sniper.shotLength", min: 4, max: 25, step: 1, suffix: "", unit: "u", tip: "Length of the damage corridor (along aim direction)." },
    { label: "Sniper Dmg", key: "sniper.damage", min: 1, max: 50, step: 1, suffix: "", unit: "HP", tip: "Damage dealt to everything in the corridor (player + enemies)." },
    { label: "Slow Dur", key: "sniper.slowDuration", min: 200, max: 3e3, step: 100, suffix: "ms", unit: "ms", tip: "How long enemies hit by sniper are slowed." },
    { label: "Slow Mult", key: "sniper.slowMult", min: 0.1, max: 1, step: 0.05, suffix: "", unit: "x", tip: "Speed multiplier while slowed. 0.5 = half speed." },
    { label: "Pref Range %", key: "kite.preferredRangeMult", min: 0.3, max: 1, step: 0.05, suffix: "", unit: "x", tip: "Multiplier on attackRange for ideal distance. Lower = fights closer." },
    { label: "Retreat Buf", key: "kite.retreatBuffer", min: 0, max: 5, step: 0.5, suffix: "", unit: "u", tip: "How far inside preferred range before retreating." },
    { label: "Advance Buf", key: "kite.advanceBuffer", min: 0, max: 8, step: 0.5, suffix: "", unit: "u", tip: "How far outside preferred range before advancing." }
  ],
  iceMortarImp: [
    { label: "Health", key: "health", min: 5, max: 200, step: 5, suffix: "", unit: "HP", tip: "Hit points before death." },
    { label: "Speed", key: "speed", min: 0.5, max: 6, step: 0.1, suffix: "", unit: "u/s", tip: "Movement speed in units per second." },
    { label: "Damage", key: "damage", min: 1, max: 50, step: 1, suffix: "", unit: "HP", tip: "Base damage value." },
    { label: "Attack Rate", key: "attackRate", min: 1e3, max: 8e3, step: 250, suffix: "ms", unit: "ms", tip: "Cooldown between mortar shots (includes aim time)." },
    { label: "Attack Range", key: "attackRange", min: 5, max: 25, step: 0.5, suffix: "", unit: "u", tip: "Maximum distance to initiate a mortar shot." },
    { label: "KB Resist", key: "knockbackResist", min: 0, max: 1, step: 0.05, suffix: "", unit: "", tip: "Resistance to knockback." },
    { label: "Aim Duration", key: "mortar.aimDuration", min: 400, max: 3e3, step: 100, suffix: "ms", unit: "ms", tip: "How long the aim arc + ground circle telegraph shows. This is the dodge window." },
    { label: "Proj Speed", key: "mortar.projectileSpeed", min: 3, max: 20, step: 0.5, suffix: "", unit: "u/s", tip: "Projectile travel speed along the arc." },
    { label: "Arc Height", key: "mortar.arcHeight", min: 2, max: 15, step: 0.5, suffix: "", unit: "u", tip: "Peak height of the parabolic arc." },
    { label: "Blast Radius", key: "mortar.blastRadius", min: 1, max: 8, step: 0.5, suffix: "", unit: "u", tip: "AoE damage radius on impact." },
    { label: "Mortar Dmg", key: "mortar.damage", min: 1, max: 50, step: 1, suffix: "", unit: "HP", tip: "Damage dealt to everything in the blast radius." },
    { label: "Inaccuracy", key: "mortar.inaccuracy", min: 0, max: 5, step: 0.25, suffix: "", unit: "u", tip: "Random offset from player position. Higher = less accurate." },
    { label: "Slow Dur", key: "mortar.slowDuration", min: 200, max: 3e3, step: 100, suffix: "ms", unit: "ms", tip: "How long targets hit by mortar are slowed." },
    { label: "Slow Mult", key: "mortar.slowMult", min: 0.1, max: 1, step: 0.05, suffix: "", unit: "x", tip: "Speed multiplier while slowed." },
    { label: "Circle Start", key: "mortar.circleStartScale", min: 0.05, max: 1, step: 0.05, suffix: "", unit: "x", tip: "Initial scale of ground circle on aim lock (0.25 = starts at 25% size)." },
    { label: "Circle Scale", key: "mortar.circleScaleTime", min: 50, max: 1e3, step: 50, suffix: "ms", unit: "ms", tip: "How long the ground circle takes to scale from start size to full size." },
    { label: "Pref Range %", key: "kite.preferredRangeMult", min: 0.3, max: 1, step: 0.05, suffix: "", unit: "x", tip: "Multiplier on attackRange for ideal distance." },
    { label: "Retreat Buf", key: "kite.retreatBuffer", min: 0, max: 5, step: 0.5, suffix: "", unit: "u", tip: "How far inside preferred range before retreating." },
    { label: "Advance Buf", key: "kite.advanceBuffer", min: 0, max: 8, step: 0.5, suffix: "", unit: "u", tip: "How far outside preferred range before advancing." }
  ],
  stoneGolem: [
    { label: "Health", key: "health", min: 20, max: 500, step: 10, suffix: "", unit: "HP", tip: "Hit points after shield is broken." },
    { label: "Speed", key: "speed", min: 0.3, max: 4, step: 0.05, suffix: "", unit: "u/s", tip: "Base movement speed in units per second." },
    { label: "Damage", key: "damage", min: 5, max: 80, step: 5, suffix: "", unit: "HP", tip: "Base melee damage per hit." },
    { label: "Attack Rate", key: "attackRate", min: 200, max: 5e3, step: 100, suffix: "ms", unit: "ms", tip: "Minimum time between melee hits." },
    { label: "KB Resist", key: "knockbackResist", min: 0, max: 1, step: 0.05, suffix: "", unit: "", tip: "Knockback resistance. Golem barely moves when hit." },
    { label: "Charge Speed", key: "tank.chargeSpeedMult", min: 1, max: 6, step: 0.5, suffix: "x", unit: "x", tip: "Speed multiplier during charge attack." },
    { label: "Charge Dur", key: "tank.chargeDuration", min: 100, max: 2e3, step: 50, suffix: "ms", unit: "ms", tip: "How long the charge lasts." },
    { label: "Charge CD Min", key: "tank.chargeCooldownMin", min: 1e3, max: 1e4, step: 500, suffix: "ms", unit: "ms", tip: "Minimum cooldown between charges." },
    { label: "Charge CD Max", key: "tank.chargeCooldownMax", min: 1e3, max: 15e3, step: 500, suffix: "ms", unit: "ms", tip: "Maximum cooldown between charges (random in range)." },
    { label: "Charge Dmg", key: "tank.chargeDamageMult", min: 1, max: 4, step: 0.25, suffix: "x", unit: "x", tip: "Damage multiplier when hitting player during charge." },
    { label: "Shield HP", key: "shield.maxHealth", min: 0, max: 200, step: 5, suffix: "", unit: "HP", tip: "Shield hit points. Set to 0 to disable shield." },
    { label: "Stun Radius", key: "shield.stunRadius", min: 1, max: 15, step: 0.5, suffix: "", unit: "u", tip: "AoE stun radius when shield breaks." },
    { label: "Stun Dur", key: "shield.stunDuration", min: 500, max: 5e3, step: 250, suffix: "ms", unit: "ms", tip: "How long the golem + nearby enemies are stunned after shield break." },
    { label: "Explode Rad", key: "deathExplosion.radius", min: 1, max: 10, step: 0.5, suffix: "", unit: "u", tip: "AoE radius of the death explosion. Damages nearby enemies and player." },
    { label: "Explode Dmg", key: "deathExplosion.damage", min: 5, max: 80, step: 5, suffix: "", unit: "HP", tip: "Damage dealt by the death explosion." },
    { label: "Explode Stun", key: "deathExplosion.stunDuration", min: 0, max: 3e3, step: 250, suffix: "ms", unit: "ms", tip: "Stun duration applied to enemies caught in death explosion. 0 = no stun." },
    { label: "Explode Delay", key: "deathExplosion.telegraphDuration", min: 0, max: 3e3, step: 100, suffix: "ms", unit: "ms", tip: "Telegraph delay before explosion. Golem can be pushed during this window. 0 = instant." }
  ]
};
function getNestedValue2(obj, path) {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return void 0;
    cur = cur[p];
  }
  return cur;
}
function setNestedValue2(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}
var lastBuiltTuningType = null;
function initSpawnEditor(scene2, gameState2) {
  sceneRef7 = scene2;
  gameStateRef = gameState2;
  markerGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.8, 8);
  for (const [name, cfg] of Object.entries(ENEMY_TYPES)) {
    markerMats[name] = new THREE.MeshStandardMaterial({
      color: cfg.color,
      emissive: cfg.color,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.8
    });
  }
  buildPanel();
  injectStyles2();
  window.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("keydown", onEditorKey);
}
function updateSpawnEditor(dt) {
  const input = getInputState();
  if (input.toggleEditor) {
    toggleEditor();
    consumeInput();
    return;
  }
}
function checkEditorToggle() {
  const input = getInputState();
  if (input.toggleEditor) {
    toggleEditor();
  }
}
function toggleEditor() {
  if (active) {
    exitEditor();
  } else {
    enterEditor();
  }
}
function onEditorWheel(e) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 1 : -1;
  setZoom(getCurrentFrustum() + delta);
}
function enterEditor() {
  active = true;
  previousPhase = gameStateRef.phase;
  gameStateRef.phase = "editorPaused";
  panel2.classList.remove("hidden");
  bannerEl.classList.add("visible");
  window.addEventListener("wheel", onEditorWheel, { passive: false });
  if (currentTab === "spawn") {
    rebuildMarkers();
  } else {
    rebuildLevelMarkers();
  }
  refreshUI();
}
function exitEditor() {
  active = false;
  gameStateRef.phase = previousPhase;
  panel2.classList.add("hidden");
  bannerEl.classList.remove("visible");
  window.removeEventListener("wheel", onEditorWheel);
  resetZoom();
  clearMarkers();
  clearLevelMarkers();
}
function switchTab(tab) {
  if (tab === currentTab) return;
  currentTab = tab;
  clearMarkers();
  clearLevelMarkers();
  editorState.selectedSpawnIdx = -1;
  levelState.selectedType = null;
  levelState.selectedIdx = -1;
  isDragging = false;
  dragStarted = false;
  if (spawnTabContent && levelTabContent) {
    spawnTabContent.style.display = tab === "spawn" ? "block" : "none";
    levelTabContent.style.display = tab === "level" ? "block" : "none";
  }
  const tabs = panel2.querySelectorAll(".se-tab");
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  if (tab === "spawn") {
    rebuildMarkers();
  } else {
    rebuildLevelMarkers();
  }
  refreshUI();
}
function mouseToWorld(e) {
  const ndcX = e.clientX / window.innerWidth * 2 - 1;
  const ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
  return screenToWorld(ndcX, ndcY);
}
function clampToArena(x, z) {
  const c = ARENA_HALF - 1.5;
  return {
    x: Math.round(Math.max(-c, Math.min(c, x))),
    z: Math.round(Math.max(-c, Math.min(c, z)))
  };
}
function findNearestSpawn(worldX, worldZ, radius) {
  const group = getCurrentGroup();
  if (!group) return -1;
  let bestIdx = -1, bestDist = radius * radius;
  for (let i = 0; i < group.spawns.length; i++) {
    const s = group.spawns[i];
    const dx = s.x - worldX;
    const dz = s.z - worldZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < bestDist) {
      bestDist = distSq;
      bestIdx = i;
    }
  }
  return bestIdx;
}
function findNearestSpawnAcrossGroups(worldX, worldZ, radius) {
  const wave = WAVES[editorState.waveIndex];
  if (!wave) return null;
  let bestGroupIdx = -1, bestSpawnIdx = -1, bestDist = radius * radius;
  for (let gi = 0; gi < wave.groups.length; gi++) {
    const group = wave.groups[gi];
    for (let si = 0; si < group.spawns.length; si++) {
      const s = group.spawns[si];
      const dx = s.x - worldX;
      const dz = s.z - worldZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestDist) {
        bestDist = distSq;
        bestGroupIdx = gi;
        bestSpawnIdx = si;
      }
    }
  }
  if (bestGroupIdx < 0) return null;
  return { groupIdx: bestGroupIdx, spawnIdx: bestSpawnIdx };
}
function findNearestLevelObject(worldX, worldZ, radius) {
  let bestType = null, bestIdx = -1, bestDist = radius * radius;
  for (let i = 0; i < OBSTACLES.length; i++) {
    const o = OBSTACLES[i];
    const dx = o.x - worldX;
    const dz = o.z - worldZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < bestDist) {
      bestDist = distSq;
      bestType = "obstacle";
      bestIdx = i;
    }
  }
  for (let i = 0; i < PITS.length; i++) {
    const p = PITS[i];
    const dx = p.x - worldX;
    const dz = p.z - worldZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < bestDist) {
      bestDist = distSq;
      bestType = "pit";
      bestIdx = i;
    }
  }
  if (bestType === null) return null;
  return { type: bestType, idx: bestIdx };
}
function onMouseDown(e) {
  if (!active) return;
  if (e.target.closest("#spawn-editor")) return;
  if (currentTab === "level") {
    onLevelMouseDown(e);
    return;
  }
  const worldPos = mouseToWorld(e);
  const group = getCurrentGroup();
  if (!group) return;
  if (e.button === 2 || e.shiftKey) {
    let idx = findNearestSpawn(worldPos.x, worldPos.z, 1.5);
    if (idx >= 0) {
      pushUndo();
      group.spawns.splice(idx, 1);
      if (editorState.selectedSpawnIdx === idx) editorState.selectedSpawnIdx = -1;
      else if (editorState.selectedSpawnIdx > idx) editorState.selectedSpawnIdx--;
      rebuildMarkers();
      refreshUI();
    } else {
      const hit = findNearestSpawnAcrossGroups(worldPos.x, worldPos.z, 1.5);
      if (hit) {
        editorState.groupIndex = hit.groupIdx;
        editorState.selectedSpawnIdx = -1;
        const targetGroup = WAVES[editorState.waveIndex].groups[hit.groupIdx];
        pushUndo();
        targetGroup.spawns.splice(hit.spawnIdx, 1);
        rebuildMarkers();
        refreshUI();
      }
    }
    return;
  }
  const hitIdx = findNearestSpawn(worldPos.x, worldPos.z, 1.5);
  if (hitIdx >= 0) {
    editorState.selectedSpawnIdx = hitIdx;
    isDragging = true;
    dragStarted = false;
    dragStartWorld = { x: worldPos.x, z: worldPos.z };
    rebuildMarkers();
    refreshUI();
  } else {
    const hit = findNearestSpawnAcrossGroups(worldPos.x, worldPos.z, 0.8);
    if (hit) {
      editorState.groupIndex = hit.groupIdx;
      editorState.selectedSpawnIdx = hit.spawnIdx;
      isDragging = true;
      dragStarted = false;
      dragStartWorld = { x: worldPos.x, z: worldPos.z };
      rebuildMarkers();
      refreshUI();
    } else {
      pushUndo();
      const clamped = clampToArena(worldPos.x, worldPos.z);
      group.spawns.push({ type: editorState.enemyType, x: clamped.x, z: clamped.z });
      editorState.selectedSpawnIdx = group.spawns.length - 1;
      rebuildMarkers();
      refreshUI();
    }
  }
}
function onLevelMouseDown(e) {
  const worldPos = mouseToWorld(e);
  if (e.button === 2 || e.shiftKey) {
    const hit2 = findNearestLevelObject(worldPos.x, worldPos.z, 3);
    if (hit2) {
      pushUndo();
      if (hit2.type === "obstacle") {
        OBSTACLES.splice(hit2.idx, 1);
      } else {
        PITS.splice(hit2.idx, 1);
      }
      if (levelState.selectedType === hit2.type && levelState.selectedIdx === hit2.idx) {
        levelState.selectedType = null;
        levelState.selectedIdx = -1;
      } else if (levelState.selectedType === hit2.type && levelState.selectedIdx > hit2.idx) {
        levelState.selectedIdx--;
      }
      onArenaChanged();
      rebuildLevelMarkers();
      refreshUI();
    }
    return;
  }
  const hit = findNearestLevelObject(worldPos.x, worldPos.z, 3);
  if (hit) {
    levelState.selectedType = hit.type;
    levelState.selectedIdx = hit.idx;
    isDragging = true;
    dragStarted = false;
    dragStartWorld = { x: worldPos.x, z: worldPos.z };
    rebuildLevelMarkers();
    refreshUI();
  } else {
    levelState.selectedType = null;
    levelState.selectedIdx = -1;
    rebuildLevelMarkers();
    refreshUI();
  }
}
function onMouseMove(e) {
  if (!active || !isDragging) return;
  if (currentTab === "level") {
    onLevelMouseMove(e);
    return;
  }
  const worldPos = mouseToWorld(e);
  const group = getCurrentGroup();
  if (!group || editorState.selectedSpawnIdx < 0) return;
  if (!dragStarted) {
    const dx = worldPos.x - dragStartWorld.x;
    const dz = worldPos.z - dragStartWorld.z;
    if (dx * dx + dz * dz < 0.25) return;
    dragStarted = true;
    pushUndo();
  }
  const clamped = clampToArena(worldPos.x, worldPos.z);
  const spawn = group.spawns[editorState.selectedSpawnIdx];
  spawn.x = clamped.x;
  spawn.z = clamped.z;
  const marker = markers.find(
    (m) => m.groupIdx === editorState.groupIndex && m.spawnIdx === editorState.selectedSpawnIdx
  );
  if (marker) {
    marker.mesh.position.set(clamped.x, 0, clamped.z);
  }
}
function onLevelMouseMove(e) {
  if (levelState.selectedType === null || levelState.selectedIdx < 0) return;
  const worldPos = mouseToWorld(e);
  if (!dragStarted) {
    const dx = worldPos.x - dragStartWorld.x;
    const dz = worldPos.z - dragStartWorld.z;
    if (dx * dx + dz * dz < 0.25) return;
    dragStarted = true;
    pushUndo();
  }
  const arr = levelState.selectedType === "obstacle" ? OBSTACLES : PITS;
  const obj = arr[levelState.selectedIdx];
  if (!obj) return;
  obj.x = Math.round(worldPos.x * 2) / 2;
  obj.z = Math.round(worldPos.z * 2) / 2;
  const marker = levelMarkers.find(
    (m) => m.type === levelState.selectedType && m.idx === levelState.selectedIdx
  );
  if (marker) {
    marker.mesh.position.set(obj.x, marker.mesh.position.y, obj.z);
  }
}
function onMouseUp(e) {
  if (!active) return;
  if (currentTab === "level") {
    if (isDragging && dragStarted) {
      onArenaChanged();
      rebuildLevelMarkers();
      refreshUI();
    }
    isDragging = false;
    dragStarted = false;
    dragStartWorld = null;
    return;
  }
  if (isDragging && dragStarted) {
    rebuildMarkers();
    refreshUI();
  }
  isDragging = false;
  dragStarted = false;
  dragStartWorld = null;
}
function onArenaChanged() {
  rebuildArenaVisuals();
  invalidateCollisionBounds();
}
var hasArenaBackend = () => window.ARENA_BACKEND === true;
async function fetchPresetList() {
  if (!hasArenaBackend()) return [];
  try {
    const res = await fetch("/arenas");
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.warn("[spawnEditor] Could not fetch preset list:", e);
    return [];
  }
}
async function refreshPresetDropdown() {
  const select = document.getElementById("se-preset-select");
  if (!select) return;
  const list = await fetchPresetList();
  let html = '<option value="">(unsaved)</option>';
  for (const name of list) {
    const sel = name === currentPresetName ? " selected" : "";
    html += `<option value="${name}"${sel}>${name}</option>`;
  }
  select.innerHTML = html;
}
async function loadPreset(name) {
  if (!name || !hasArenaBackend()) return;
  try {
    const res = await fetch(`/arenas/load?name=${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    pushUndo();
    OBSTACLES.length = 0;
    for (const o of data.obstacles) OBSTACLES.push(o);
    PITS.length = 0;
    for (const p of data.pits) PITS.push(p);
    currentPresetName = name;
    levelState.selectedType = null;
    levelState.selectedIdx = -1;
    onArenaChanged();
    rebuildLevelMarkers();
    refreshLevelUI();
    refreshPresetDropdown();
  } catch (e) {
    console.error("[spawnEditor] Load preset failed:", e);
  }
}
async function savePreset(name) {
  if (!name || !hasArenaBackend()) return;
  try {
    const res = await fetch("/arenas/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, obstacles: OBSTACLES, pits: PITS })
    });
    if (!res.ok) throw new Error(res.statusText);
    currentPresetName = name;
    refreshPresetDropdown();
  } catch (e) {
    console.error("[spawnEditor] Save preset failed:", e);
  }
}
async function deletePreset(name) {
  if (!name || !hasArenaBackend()) return;
  try {
    const res = await fetch("/arenas/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error(res.statusText);
    if (currentPresetName === name) currentPresetName = null;
    refreshPresetDropdown();
  } catch (e) {
    console.error("[spawnEditor] Delete preset failed:", e);
  }
}
function onEditorKey(e) {
  if (!active) return;
  if (e.code === "KeyZ" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
    e.preventDefault();
    popUndo();
    return;
  }
  if (e.code === "KeyY" && (e.metaKey || e.ctrlKey) || e.code === "KeyZ" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
    e.preventDefault();
    popRedo();
    return;
  }
  if (e.code === "Escape") {
    if (currentTab === "level") {
      levelState.selectedType = null;
      levelState.selectedIdx = -1;
      rebuildLevelMarkers();
    } else {
      editorState.selectedSpawnIdx = -1;
      rebuildMarkers();
    }
    refreshUI();
    return;
  }
  if (currentTab === "level") {
    onLevelKey(e);
    return;
  }
  const typeKeyMap = { "Digit1": 0, "Digit2": 1, "Digit3": 2, "Digit4": 3 };
  if (e.code in typeKeyMap) {
    const idx = typeKeyMap[e.code];
    if (idx < ENEMY_TYPE_KEYS.length) {
      editorState.enemyType = ENEMY_TYPE_KEYS[idx];
      if (editorState.selectedSpawnIdx >= 0) {
        const group = getCurrentGroup();
        if (group && group.spawns[editorState.selectedSpawnIdx]) {
          pushUndo();
          group.spawns[editorState.selectedSpawnIdx].type = ENEMY_TYPE_KEYS[idx];
          rebuildMarkers();
        }
      }
      refreshUI();
    }
  }
  if (e.code === "Delete" || e.code === "Backspace") {
    if (e.target.tagName === "INPUT") return;
    const group = getCurrentGroup();
    if (!group) return;
    if (editorState.selectedSpawnIdx >= 0 && editorState.selectedSpawnIdx < group.spawns.length) {
      pushUndo();
      group.spawns.splice(editorState.selectedSpawnIdx, 1);
      editorState.selectedSpawnIdx = -1;
      rebuildMarkers();
      refreshUI();
    } else {
      pushUndo();
      group.spawns = [];
      rebuildMarkers();
      refreshUI();
    }
  }
  if (e.code === "KeyP") {
    playCurrentWave();
  }
}
function onLevelKey(e) {
  if (e.code === "Delete" || e.code === "Backspace") {
    if (e.target.tagName === "INPUT") return;
    if (levelState.selectedType && levelState.selectedIdx >= 0) {
      pushUndo();
      if (levelState.selectedType === "obstacle") {
        OBSTACLES.splice(levelState.selectedIdx, 1);
      } else {
        PITS.splice(levelState.selectedIdx, 1);
      }
      levelState.selectedType = null;
      levelState.selectedIdx = -1;
      onArenaChanged();
      rebuildLevelMarkers();
      refreshUI();
    }
  }
}
function clearMarkers() {
  for (const m of markers) {
    sceneRef7.remove(m.mesh);
    m.mesh.children.forEach((c) => {
      if (c.material && c.material !== markerMats[m.type]) c.material.dispose();
    });
  }
  markers = [];
}
function rebuildMarkers() {
  clearMarkers();
  for (let wi = 0; wi < WAVES.length; wi++) {
    const wave = WAVES[wi];
    if (wi !== editorState.waveIndex) continue;
    for (let gi = 0; gi < wave.groups.length; gi++) {
      const group = wave.groups[gi];
      const isCurrent = gi === editorState.groupIndex;
      for (let si = 0; si < group.spawns.length; si++) {
        const spawn = group.spawns[si];
        const mat = markerMats[spawn.type] || markerMats.goblin;
        const isSelected = isCurrent && si === editorState.selectedSpawnIdx;
        const clonedMat = mat.clone();
        clonedMat.opacity = isCurrent ? 0.85 : 0.25;
        if (isSelected) {
          clonedMat.emissiveIntensity = 1;
        }
        const mesh = new THREE.Group();
        const body2 = new THREE.Mesh(markerGeo, clonedMat);
        body2.position.y = 0.4;
        mesh.add(body2);
        const ringColor = isSelected ? 16777215 : ENEMY_TYPES[spawn.type] ? ENEMY_TYPES[spawn.type].color : 16777215;
        const ringGeo3 = new THREE.RingGeometry(
          isSelected ? 0.55 : 0.5,
          isSelected ? 0.75 : 0.65,
          16
        );
        ringGeo3.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: ringColor,
          transparent: true,
          opacity: isSelected ? 0.9 : isCurrent ? 0.5 : 0.15,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        const ring = new THREE.Mesh(ringGeo3, ringMat);
        ring.position.y = 0.02;
        mesh.add(ring);
        mesh.position.set(spawn.x, 0, spawn.z);
        sceneRef7.add(mesh);
        markers.push({
          mesh,
          type: spawn.type,
          waveIdx: wi,
          groupIdx: gi,
          spawnIdx: si
        });
      }
    }
  }
}
function clearLevelMarkers() {
  for (const m of levelMarkers) {
    sceneRef7.remove(m.mesh);
    m.mesh.children.forEach((c) => {
      if (c.material) c.material.dispose();
      if (c.geometry) c.geometry.dispose();
    });
  }
  levelMarkers = [];
}
function rebuildLevelMarkers() {
  clearLevelMarkers();
  const isObsSelected = levelState.selectedType === "obstacle";
  const isPitSelected = levelState.selectedType === "pit";
  for (let i = 0; i < OBSTACLES.length; i++) {
    const o = OBSTACLES[i];
    const selected = isObsSelected && levelState.selectedIdx === i;
    const group = new THREE.Group();
    const boxGeo = new THREE.BoxGeometry(o.w, o.h, o.d);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    const lineMat = new THREE.LineBasicMaterial({
      color: selected ? 4521864 : 6728447,
      linewidth: 1
    });
    const wireframe = new THREE.LineSegments(edgesGeo, lineMat);
    wireframe.position.y = o.h / 2;
    group.add(wireframe);
    const ringGeo3 = new THREE.RingGeometry(
      selected ? 0.6 : 0.5,
      selected ? 0.85 : 0.7,
      16
    );
    ringGeo3.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: selected ? 4521864 : 6728447,
      transparent: true,
      opacity: selected ? 0.8 : 0.4,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo3, ringMat);
    ring.position.y = 0.03;
    group.add(ring);
    group.position.set(o.x, 0, o.z);
    sceneRef7.add(group);
    levelMarkers.push({ mesh: group, type: "obstacle", idx: i });
  }
  for (let i = 0; i < PITS.length; i++) {
    const p = PITS[i];
    const selected = isPitSelected && levelState.selectedIdx === i;
    const group = new THREE.Group();
    const planeGeo2 = new THREE.PlaneGeometry(p.w, p.d);
    const edgesGeo = new THREE.EdgesGeometry(planeGeo2);
    const lineMat = new THREE.LineBasicMaterial({
      color: selected ? 16729258 : 16729190,
      linewidth: 1
    });
    const wireframe = new THREE.LineSegments(edgesGeo, lineMat);
    wireframe.rotation.x = -Math.PI / 2;
    wireframe.position.y = 0.1;
    group.add(wireframe);
    const ringGeo3 = new THREE.RingGeometry(
      selected ? 0.6 : 0.5,
      selected ? 0.85 : 0.7,
      16
    );
    ringGeo3.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: selected ? 16729258 : 16729190,
      transparent: true,
      opacity: selected ? 0.8 : 0.4,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo3, ringMat);
    ring.position.y = 0.03;
    group.add(ring);
    group.position.set(p.x, 0, p.z);
    sceneRef7.add(group);
    levelMarkers.push({ mesh: group, type: "pit", idx: i });
  }
}
function buildPanel() {
  panel2 = document.createElement("div");
  panel2.id = "spawn-editor";
  panel2.className = "hidden";
  panel2.addEventListener("contextmenu", (e) => e.preventDefault());
  bannerEl = document.createElement("div");
  bannerEl.id = "editor-banner";
  document.body.appendChild(bannerEl);
  bannerEl.textContent = "EDITOR MODE \u2014 press ` to exit";
  let html = "";
  html += '<div class="se-tabs">';
  html += '<div class="se-tab active" data-tab="spawn">Spawn</div>';
  html += '<div class="se-tab" data-tab="level">Level</div>';
  html += "</div>";
  html += '<div id="se-spawn-content">';
  html += '<div class="se-section">';
  html += '<div class="se-group-label">Wave</div>';
  html += '<div class="se-selector">';
  html += '<div class="se-btn" id="se-wave-prev">&lt;</div>';
  html += '<span id="se-wave-label">1</span>';
  html += '<div class="se-btn" id="se-wave-next">&gt;</div>';
  html += '<div class="se-btn se-add" id="se-wave-add">+</div>';
  html += "</div>";
  html += '<input type="text" id="se-wave-msg" class="se-wave-msg" placeholder="Wave announcement message...">';
  html += "</div>";
  html += '<div class="se-section">';
  html += '<div class="se-group-label">Group</div>';
  html += '<div class="se-selector">';
  html += '<div class="se-btn" id="se-group-prev">&lt;</div>';
  html += '<span id="se-group-label">g1</span>';
  html += '<div class="se-btn" id="se-group-next">&gt;</div>';
  html += '<div class="se-btn se-add" id="se-group-add">+</div>';
  html += '<div class="se-btn se-del" id="se-group-del">\xD7</div>';
  html += "</div></div>";
  html += '<div class="se-section">';
  html += '<div class="se-group-label">Timing</div>';
  html += `<div class="se-slider-row"><span class="has-tooltip" data-tip="Time after wave starts before this group's telegraph begins. Use to stagger multiple groups.">Trigger Delay</span><input type="range" id="se-trigger" min="0" max="10000" step="250" value="0"><input type="text" class="se-timing-val" id="se-trigger-val" value="0 ms"></div>`;
  html += `<div class="se-slider-row"><span class="has-tooltip" data-tip="How long the pulsing warning circles appear on the ground before enemies materialize. This is the player's reaction window.">Telegraph Time</span><input type="range" id="se-telegraph" min="500" max="5000" step="250" value="1500"><input type="text" class="se-timing-val" id="se-telegraph-val" value="1500 ms"></div>`;
  html += '<div class="se-slider-row"><span class="has-tooltip" data-tip="Time between each individual enemy spawning within a group. 0 = all spawn simultaneously.">Spawn Stagger</span><input type="range" id="se-stagger" min="0" max="1000" step="50" value="200"><input type="text" class="se-timing-val" id="se-stagger-val" value="200 ms"></div>';
  html += "</div>";
  html += '<div class="se-section">';
  html += '<div class="se-group-label">Enemy Type (1/2/3/4)</div>';
  html += '<div class="se-type-picker" id="se-type-picker">';
  for (const [name, cfg] of Object.entries(ENEMY_TYPES)) {
    const short = TYPE_SHORT[name] || name[0].toUpperCase();
    html += `<div class="se-type-btn" data-type="${name}" style="border-color: #${cfg.color.toString(16).padStart(6, "0")}">${short} ${cfg.name}</div>`;
  }
  html += "</div></div>";
  html += '<div class="se-section" id="se-enemy-tuning">';
  html += '<div class="se-group-label se-collapsible" id="se-tuning-header">Enemy Properties &#x25BC;</div>';
  html += '<div id="se-tuning-body"></div>';
  html += "</div>";
  html += '<div class="se-section">';
  html += '<div class="se-spawn-count">Spawns: <span id="se-spawn-count">0</span></div>';
  html += '<div class="se-selected-info" id="se-selected-info"></div>';
  html += '<div class="se-btn se-action" id="se-clear">Clear Group</div>';
  html += "</div>";
  html += '<div class="se-section se-actions">';
  html += '<div class="se-btn se-action se-play" id="se-play">Play Wave</div>';
  html += '<div class="se-btn se-action se-save" id="se-save-spawns">Save All</div>';
  html += '<div class="se-btn se-action" id="se-copy-wave">Copy Wave</div>';
  html += '<div class="se-btn se-action" id="se-copy-all">Copy All</div>';
  html += '<div class="se-btn se-action" id="se-copy-enemies">Copy Enemy Config</div>';
  html += "</div>";
  html += "</div>";
  html += '<div id="se-level-content" style="display:none">';
  html += '<div class="se-section">';
  html += '<div class="se-group-label">Arena Preset</div>';
  html += '<div class="se-preset-row">';
  html += '<select id="se-preset-select" class="se-preset-select"><option value="">(unsaved)</option></select>';
  html += '<div class="se-btn se-action se-small" id="se-preset-load">Load</div>';
  html += "</div>";
  html += '<div class="se-preset-row" style="margin-top:4px">';
  html += '<div class="se-btn se-action se-save se-small" id="se-preset-save">Save Preset</div>';
  html += '<div class="se-btn se-action se-del se-small" id="se-preset-delete">Delete</div>';
  html += "</div>";
  html += "</div>";
  html += '<div class="se-section">';
  html += '<div class="se-group-label">Obstacles</div>';
  html += '<div id="se-obstacle-list" class="se-item-list"></div>';
  html += '<div class="se-btn se-action se-add" id="se-add-obstacle">+ Add Obstacle</div>';
  html += "</div>";
  html += '<div class="se-section">';
  html += '<div class="se-group-label">Pits</div>';
  html += '<div id="se-pit-list" class="se-item-list"></div>';
  html += '<div class="se-btn se-action se-add" id="se-add-pit">+ Add Pit</div>';
  html += "</div>";
  html += '<div class="se-section" id="se-level-props" style="display:none">';
  html += '<div class="se-group-label" id="se-level-props-label">Properties</div>';
  html += '<div id="se-level-props-body"></div>';
  html += "</div>";
  html += '<div class="se-section se-actions">';
  html += '<div class="se-btn se-action se-save" id="se-save-arena">Save Arena</div>';
  html += '<div class="se-btn se-action" id="se-copy-arena">Copy Arena Config</div>';
  html += "</div>";
  html += "</div>";
  panel2.innerHTML = html;
  document.body.appendChild(panel2);
  spawnTabContent = document.getElementById("se-spawn-content");
  levelTabContent = document.getElementById("se-level-content");
  const tooltipEl = document.createElement("div");
  tooltipEl.id = "se-tooltip";
  document.body.appendChild(tooltipEl);
  setTimeout(() => wireEvents(), 0);
}
function wireEvents() {
  panel2.querySelectorAll(".se-tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });
  document.getElementById("se-wave-prev").addEventListener("click", () => {
    editorState.waveIndex = Math.max(0, editorState.waveIndex - 1);
    editorState.groupIndex = 0;
    editorState.selectedSpawnIdx = -1;
    rebuildMarkers();
    refreshUI();
  });
  document.getElementById("se-wave-next").addEventListener("click", () => {
    editorState.waveIndex = Math.min(WAVES.length - 1, editorState.waveIndex + 1);
    editorState.groupIndex = 0;
    editorState.selectedSpawnIdx = -1;
    rebuildMarkers();
    refreshUI();
  });
  document.getElementById("se-wave-add").addEventListener("click", () => {
    const newWave = {
      wave: WAVES.length + 1,
      message: `Wave ${WAVES.length + 1}`,
      groups: [{
        id: `w${WAVES.length + 1}g1`,
        triggerDelay: 0,
        telegraphDuration: 1500,
        stagger: 200,
        spawns: []
      }]
    };
    WAVES.push(newWave);
    editorState.waveIndex = WAVES.length - 1;
    editorState.groupIndex = 0;
    editorState.selectedSpawnIdx = -1;
    rebuildMarkers();
    refreshUI();
  });
  const waveMsgInput = document.getElementById("se-wave-msg");
  waveMsgInput.addEventListener("input", () => {
    const wave = WAVES[editorState.waveIndex];
    if (wave) wave.message = waveMsgInput.value;
  });
  waveMsgInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") waveMsgInput.blur();
  });
  waveMsgInput.addEventListener("focus", () => waveMsgInput.select());
  document.getElementById("se-group-prev").addEventListener("click", () => {
    editorState.groupIndex = Math.max(0, editorState.groupIndex - 1);
    editorState.selectedSpawnIdx = -1;
    rebuildMarkers();
    refreshUI();
  });
  document.getElementById("se-group-next").addEventListener("click", () => {
    const wave = WAVES[editorState.waveIndex];
    if (wave) {
      editorState.groupIndex = Math.min(wave.groups.length - 1, editorState.groupIndex + 1);
      editorState.selectedSpawnIdx = -1;
      rebuildMarkers();
      refreshUI();
    }
  });
  document.getElementById("se-group-add").addEventListener("click", () => {
    const wave = WAVES[editorState.waveIndex];
    if (!wave) return;
    const newGroup = {
      id: `w${editorState.waveIndex + 1}g${wave.groups.length + 1}`,
      triggerDelay: 0,
      telegraphDuration: 1500,
      stagger: 200,
      spawns: []
    };
    wave.groups.push(newGroup);
    editorState.groupIndex = wave.groups.length - 1;
    rebuildMarkers();
    refreshUI();
  });
  document.getElementById("se-group-del").addEventListener("click", () => {
    const wave = WAVES[editorState.waveIndex];
    if (!wave || wave.groups.length <= 1) return;
    wave.groups.splice(editorState.groupIndex, 1);
    editorState.groupIndex = Math.min(editorState.groupIndex, wave.groups.length - 1);
    rebuildMarkers();
    refreshUI();
  });
  const triggerSlider = document.getElementById("se-trigger");
  const telegraphSlider = document.getElementById("se-telegraph");
  const staggerSlider = document.getElementById("se-stagger");
  const sliderUndoOnce = (slider) => {
    let pushed = false;
    slider.addEventListener("mousedown", () => {
      pushUndo();
      pushed = true;
    });
    slider.addEventListener("touchstart", () => {
      if (!pushed) pushUndo();
      pushed = true;
    });
    slider.addEventListener("mouseup", () => {
      pushed = false;
    });
    slider.addEventListener("touchend", () => {
      pushed = false;
    });
  };
  sliderUndoOnce(triggerSlider);
  sliderUndoOnce(telegraphSlider);
  sliderUndoOnce(staggerSlider);
  triggerSlider.addEventListener("input", () => {
    const group = getCurrentGroup();
    if (group) group.triggerDelay = parseInt(triggerSlider.value);
    document.getElementById("se-trigger-val").value = triggerSlider.value + " ms";
  });
  telegraphSlider.addEventListener("input", () => {
    const group = getCurrentGroup();
    if (group) group.telegraphDuration = parseInt(telegraphSlider.value);
    document.getElementById("se-telegraph-val").value = telegraphSlider.value + " ms";
  });
  staggerSlider.addEventListener("input", () => {
    const group = getCurrentGroup();
    if (group) group.stagger = parseInt(staggerSlider.value);
    document.getElementById("se-stagger-val").value = staggerSlider.value + " ms";
  });
  const timingInputs = [
    { inputId: "se-trigger-val", sliderId: "se-trigger", prop: "triggerDelay", min: 0, max: 1e4 },
    { inputId: "se-telegraph-val", sliderId: "se-telegraph", prop: "telegraphDuration", min: 500, max: 5e3 },
    { inputId: "se-stagger-val", sliderId: "se-stagger", prop: "stagger", min: 0, max: 1e3 }
  ];
  for (const t of timingInputs) {
    const inp = document.getElementById(t.inputId);
    const slider = document.getElementById(t.sliderId);
    const commitTimingValue = () => {
      const parsed = parseInt(inp.value);
      if (isNaN(parsed)) {
        const group2 = getCurrentGroup();
        inp.value = (group2 ? group2[t.prop] : slider.value) + " ms";
        return;
      }
      const clamped = Math.max(t.min, Math.min(t.max, parsed));
      const group = getCurrentGroup();
      if (group) group[t.prop] = clamped;
      slider.value = clamped;
      inp.value = clamped + " ms";
    };
    inp.addEventListener("change", commitTimingValue);
    inp.addEventListener("blur", commitTimingValue);
    inp.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") inp.blur();
    });
    inp.addEventListener("focus", () => inp.select());
  }
  document.getElementById("se-type-picker").addEventListener("click", (e) => {
    const btn = e.target.closest(".se-type-btn");
    if (btn) {
      editorState.enemyType = btn.dataset.type;
      refreshUI();
    }
  });
  document.getElementById("se-clear").addEventListener("click", () => {
    const group = getCurrentGroup();
    if (group) {
      pushUndo();
      group.spawns = [];
      rebuildMarkers();
      refreshUI();
    }
  });
  document.getElementById("se-play").addEventListener("click", playCurrentWave);
  document.getElementById("se-copy-wave").addEventListener("click", () => {
    const text = buildWaveText(editorState.waveIndex);
    copyToClipboard(text, document.getElementById("se-copy-wave"));
  });
  document.getElementById("se-copy-all").addEventListener("click", () => {
    const text = buildAllWavesText();
    copyToClipboard(text, document.getElementById("se-copy-all"));
  });
  document.getElementById("se-copy-enemies").addEventListener("click", () => {
    const text = buildEnemyConfigText();
    copyToClipboard(text, document.getElementById("se-copy-enemies"));
  });
  document.getElementById("se-tuning-header").addEventListener("click", () => {
    const body2 = document.getElementById("se-tuning-body");
    body2.classList.toggle("collapsed");
    const header = document.getElementById("se-tuning-header");
    header.innerHTML = body2.classList.contains("collapsed") ? "Enemy Properties &#x25B6;" : "Enemy Properties &#x25BC;";
  });
  document.getElementById("se-preset-load").addEventListener("click", () => {
    const select = document.getElementById("se-preset-select");
    if (select.value) loadPreset(select.value);
  });
  document.getElementById("se-preset-save").addEventListener("click", async () => {
    let name = currentPresetName;
    if (!name) {
      name = prompt("Preset name:");
      if (!name) return;
    }
    const btn = document.getElementById("se-preset-save");
    await savePreset(name);
    const orig = btn.textContent;
    btn.textContent = "Saved \u2713";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.textContent = orig;
      btn.classList.remove("copied");
    }, 1200);
  });
  document.getElementById("se-preset-delete").addEventListener("click", async () => {
    const select = document.getElementById("se-preset-select");
    const name = select.value;
    if (!name) return;
    if (!confirm(`Delete preset "${name}"?`)) return;
    await deletePreset(name);
  });
  refreshPresetDropdown();
  document.getElementById("se-add-obstacle").addEventListener("click", () => {
    pushUndo();
    OBSTACLES.push({ x: 0, z: 0, w: 2, h: 1.5, d: 2 });
    levelState.selectedType = "obstacle";
    levelState.selectedIdx = OBSTACLES.length - 1;
    onArenaChanged();
    rebuildLevelMarkers();
    refreshUI();
  });
  document.getElementById("se-add-pit").addEventListener("click", () => {
    pushUndo();
    PITS.push({ x: 0, z: 0, w: 3, d: 3 });
    levelState.selectedType = "pit";
    levelState.selectedIdx = PITS.length - 1;
    onArenaChanged();
    rebuildLevelMarkers();
    refreshUI();
  });
  document.getElementById("se-copy-arena").addEventListener("click", () => {
    const text = buildArenaConfigText();
    copyToClipboard(text, document.getElementById("se-copy-arena"));
  });
  document.getElementById("se-save-spawns").addEventListener("click", async () => {
    const btn = document.getElementById("se-save-spawns");
    const wavesText = buildAllWavesText();
    const enemiesText = buildEnemyConfigText();
    await saveToFile("config/waves.js", wavesText, btn);
    await saveToFile("config/enemies.js", enemiesText, btn);
  });
  document.getElementById("se-save-arena").addEventListener("click", () => {
    const text = buildArenaConfigText();
    saveToFile("config/arena.js", text, document.getElementById("se-save-arena"));
  });
  window.addEventListener("contextmenu", (e) => {
    if (active) e.preventDefault();
  });
  const tooltipEl = document.getElementById("se-tooltip");
  let tooltipTarget = null;
  panel2.addEventListener("mouseover", (e) => {
    const el = e.target.closest(".has-tooltip");
    if (el && el.getAttribute("data-tip")) {
      tooltipTarget = el;
      tooltipEl.textContent = el.getAttribute("data-tip");
      tooltipEl.classList.add("visible");
      positionTooltip(el);
    }
  });
  panel2.addEventListener("mouseout", (e) => {
    const el = e.target.closest(".has-tooltip");
    if (el === tooltipTarget) {
      tooltipTarget = null;
      tooltipEl.classList.remove("visible");
    }
  });
  function positionTooltip(targetEl) {
    const rect = targetEl.getBoundingClientRect();
    const tipRect = tooltipEl.getBoundingClientRect();
    let left = rect.right + 8;
    let top = rect.top + rect.height / 2 - tipRect.height / 2;
    if (left + 200 > window.innerWidth) {
      left = rect.left;
      top = rect.bottom + 6;
    }
    top = Math.max(4, Math.min(window.innerHeight - tipRect.height - 4, top));
    tooltipEl.style.left = left + "px";
    tooltipEl.style.top = top + "px";
  }
  waveLabel = document.getElementById("se-wave-label");
  groupLabel = document.getElementById("se-group-label");
  spawnCountLabel = document.getElementById("se-spawn-count");
}
function getCurrentGroup() {
  const wave = WAVES[editorState.waveIndex];
  if (!wave) return null;
  return wave.groups[editorState.groupIndex] || null;
}
function refreshUI() {
  if (currentTab === "spawn") {
    refreshSpawnUI();
  } else {
    refreshLevelUI();
  }
}
function refreshSpawnUI() {
  const wave = WAVES[editorState.waveIndex];
  if (waveLabel) waveLabel.textContent = wave ? wave.wave : "?";
  const waveMsgInput = document.getElementById("se-wave-msg");
  if (waveMsgInput) waveMsgInput.value = wave ? wave.message || "" : "";
  const group = getCurrentGroup();
  if (groupLabel) groupLabel.textContent = group ? group.id : "?";
  if (spawnCountLabel) spawnCountLabel.textContent = group ? group.spawns.length : 0;
  const triggerSlider = document.getElementById("se-trigger");
  const telegraphSlider = document.getElementById("se-telegraph");
  const staggerSlider = document.getElementById("se-stagger");
  if (group && triggerSlider) {
    triggerSlider.value = group.triggerDelay;
    document.getElementById("se-trigger-val").value = group.triggerDelay + " ms";
    telegraphSlider.value = group.telegraphDuration;
    document.getElementById("se-telegraph-val").value = group.telegraphDuration + " ms";
    staggerSlider.value = group.stagger;
    document.getElementById("se-stagger-val").value = group.stagger + " ms";
  }
  const btns = document.querySelectorAll(".se-type-btn");
  btns.forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.type === editorState.enemyType);
  });
  const infoEl = document.getElementById("se-selected-info");
  if (infoEl) {
    if (editorState.selectedSpawnIdx >= 0 && group && group.spawns[editorState.selectedSpawnIdx]) {
      const s = group.spawns[editorState.selectedSpawnIdx];
      const typeName = ENEMY_TYPES[s.type] ? ENEMY_TYPES[s.type].name : s.type;
      infoEl.textContent = `Selected: ${typeName} (${s.x}, ${s.z})`;
      infoEl.style.display = "block";
    } else {
      infoEl.style.display = "none";
    }
  }
  rebuildEnemyTuningSliders();
}
function refreshLevelUI() {
  const obsList = document.getElementById("se-obstacle-list");
  if (obsList) {
    let html = "";
    for (let i = 0; i < OBSTACLES.length; i++) {
      const o = OBSTACLES[i];
      const sel = levelState.selectedType === "obstacle" && levelState.selectedIdx === i;
      html += `<div class="se-item-row${sel ? " selected" : ""}" data-type="obstacle" data-idx="${i}">`;
      html += `<span class="se-item-label">Obs ${i + 1}</span>`;
      html += `<span class="se-item-coords">(${o.x}, ${o.z})</span>`;
      html += `<span class="se-item-dims">${o.w}\xD7${o.d}\xD7${o.h}</span>`;
      html += "</div>";
    }
    obsList.innerHTML = html;
    obsList.querySelectorAll(".se-item-row").forEach((row) => {
      row.addEventListener("click", () => {
        levelState.selectedType = row.dataset.type;
        levelState.selectedIdx = parseInt(row.dataset.idx);
        rebuildLevelMarkers();
        refreshLevelUI();
      });
    });
  }
  const pitList = document.getElementById("se-pit-list");
  if (pitList) {
    let html = "";
    for (let i = 0; i < PITS.length; i++) {
      const p = PITS[i];
      const sel = levelState.selectedType === "pit" && levelState.selectedIdx === i;
      html += `<div class="se-item-row${sel ? " selected" : ""}" data-type="pit" data-idx="${i}">`;
      html += `<span class="se-item-label">Pit ${i + 1}</span>`;
      html += `<span class="se-item-coords">(${p.x}, ${p.z})</span>`;
      html += `<span class="se-item-dims">${p.w}\xD7${p.d}</span>`;
      html += "</div>";
    }
    pitList.innerHTML = html;
    pitList.querySelectorAll(".se-item-row").forEach((row) => {
      row.addEventListener("click", () => {
        levelState.selectedType = row.dataset.type;
        levelState.selectedIdx = parseInt(row.dataset.idx);
        rebuildLevelMarkers();
        refreshLevelUI();
      });
    });
  }
  const propsPanel = document.getElementById("se-level-props");
  const propsLabel = document.getElementById("se-level-props-label");
  const propsBody = document.getElementById("se-level-props-body");
  if (propsPanel && levelState.selectedType && levelState.selectedIdx >= 0) {
    const arr = levelState.selectedType === "obstacle" ? OBSTACLES : PITS;
    const obj = arr[levelState.selectedIdx];
    if (!obj) {
      propsPanel.style.display = "none";
      return;
    }
    propsPanel.style.display = "block";
    const label = levelState.selectedType === "obstacle" ? `Obstacle ${levelState.selectedIdx + 1}` : `Pit ${levelState.selectedIdx + 1}`;
    propsLabel.textContent = label;
    const sliders = levelState.selectedType === "obstacle" ? [
      { label: "X", key: "x", min: -19, max: 19, step: 0.5, unit: "" },
      { label: "Z", key: "z", min: -19, max: 19, step: 0.5, unit: "" },
      { label: "Width", key: "w", min: 0.5, max: 10, step: 0.5, unit: "u" },
      { label: "Depth", key: "d", min: 0.5, max: 10, step: 0.5, unit: "u" },
      { label: "Height", key: "h", min: 0.5, max: 5, step: 0.5, unit: "u" }
    ] : [
      { label: "X", key: "x", min: -19, max: 19, step: 0.5, unit: "" },
      { label: "Z", key: "z", min: -19, max: 19, step: 0.5, unit: "" },
      { label: "Width", key: "w", min: 1, max: 10, step: 0.5, unit: "u" },
      { label: "Depth", key: "d", min: 1, max: 10, step: 0.5, unit: "u" }
    ];
    let html = "";
    for (const s of sliders) {
      const val = obj[s.key];
      const display = Number.isInteger(val) ? val : parseFloat(val).toFixed(1);
      const unitDisplay = s.unit ? " " + s.unit : "";
      html += `<div class="se-slider-row">`;
      html += `<span>${s.label}</span>`;
      html += `<input type="range" class="se-level-slider" data-key="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${val}">`;
      html += `<input type="text" class="se-level-val" data-key="${s.key}" value="${display}${unitDisplay}">`;
      html += `</div>`;
    }
    html += `<div class="se-btn se-action se-del" id="se-delete-level-obj">Delete ${levelState.selectedType === "obstacle" ? "Obstacle" : "Pit"}</div>`;
    propsBody.innerHTML = html;
    propsBody.querySelectorAll(".se-level-slider").forEach((el) => {
      const key = el.dataset.key;
      const sdef = sliders.find((s) => s.key === key);
      el.addEventListener("input", () => {
        const newVal = parseFloat(el.value);
        const arrRef = levelState.selectedType === "obstacle" ? OBSTACLES : PITS;
        const objRef = arrRef[levelState.selectedIdx];
        if (!objRef) return;
        objRef[key] = newVal;
        const unitDisplay = sdef.unit ? " " + sdef.unit : "";
        const display = Number.isInteger(newVal) ? newVal : parseFloat(newVal).toFixed(1);
        propsBody.querySelector(`.se-level-val[data-key="${key}"]`).value = display + unitDisplay;
        onArenaChanged();
        rebuildLevelMarkers();
      });
      let pushed = false;
      el.addEventListener("mousedown", () => {
        pushUndo();
        pushed = true;
      });
      el.addEventListener("mouseup", () => {
        pushed = false;
      });
    });
    propsBody.querySelectorAll(".se-level-val").forEach((inp) => {
      const key = inp.dataset.key;
      const sdef = sliders.find((s) => s.key === key);
      const commitValue = () => {
        const parsed = parseFloat(inp.value);
        if (isNaN(parsed)) {
          const arrRef2 = levelState.selectedType === "obstacle" ? OBSTACLES : PITS;
          const objRef2 = arrRef2[levelState.selectedIdx];
          if (objRef2) {
            const val = objRef2[key];
            const unitDisplay2 = sdef.unit ? " " + sdef.unit : "";
            inp.value = (Number.isInteger(val) ? val : parseFloat(val).toFixed(1)) + unitDisplay2;
          }
          return;
        }
        const clamped = Math.max(sdef.min, Math.min(sdef.max, parsed));
        const arrRef = levelState.selectedType === "obstacle" ? OBSTACLES : PITS;
        const objRef = arrRef[levelState.selectedIdx];
        if (!objRef) return;
        pushUndo();
        objRef[key] = clamped;
        const rangeEl = propsBody.querySelector(`.se-level-slider[data-key="${key}"]`);
        if (rangeEl) rangeEl.value = clamped;
        const unitDisplay = sdef.unit ? " " + sdef.unit : "";
        inp.value = (Number.isInteger(clamped) ? clamped : parseFloat(clamped).toFixed(1)) + unitDisplay;
        onArenaChanged();
        rebuildLevelMarkers();
      };
      inp.addEventListener("change", commitValue);
      inp.addEventListener("blur", commitValue);
      inp.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") inp.blur();
      });
      inp.addEventListener("focus", () => inp.select());
    });
    const deleteBtn = document.getElementById("se-delete-level-obj");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => {
        pushUndo();
        if (levelState.selectedType === "obstacle") {
          OBSTACLES.splice(levelState.selectedIdx, 1);
        } else {
          PITS.splice(levelState.selectedIdx, 1);
        }
        levelState.selectedType = null;
        levelState.selectedIdx = -1;
        onArenaChanged();
        rebuildLevelMarkers();
        refreshLevelUI();
      });
    }
  } else if (propsPanel) {
    propsPanel.style.display = "none";
  }
}
function rebuildEnemyTuningSliders() {
  const container = document.getElementById("se-tuning-body");
  if (!container) return;
  if (lastBuiltTuningType === editorState.enemyType) {
    updateTuningSliderValues();
    return;
  }
  lastBuiltTuningType = editorState.enemyType;
  const sliders = ENEMY_TUNING_SLIDERS[editorState.enemyType];
  if (!sliders) {
    container.innerHTML = '<div style="color:rgba(255,255,255,0.3);font-size:9px;padding:4px;">No tuning available</div>';
    return;
  }
  const cfg = ENEMY_TYPES[editorState.enemyType];
  let html = "";
  for (let i = 0; i < sliders.length; i++) {
    const s = sliders[i];
    const val = getNestedValue2(cfg, s.key);
    const displayVal = val != null ? Number.isInteger(s.step) ? val : parseFloat(val).toFixed(2) : "?";
    const unitStr = s.unit || s.suffix || "";
    const unitDisplay = unitStr ? " " + unitStr : "";
    const tipAttr = s.tip ? ` data-tip="${s.tip.replace(/"/g, "&quot;")}"` : "";
    const tipClass = s.tip ? " has-tooltip" : "";
    html += `<div class="se-slider-row">`;
    html += `<span class="${tipClass}"${tipAttr}>${s.label}</span>`;
    html += `<input type="range" class="se-tuning-slider" data-idx="${i}" min="${s.min}" max="${s.max}" step="${s.step}" value="${val != null ? val : s.min}">`;
    html += `<input type="text" class="se-tuning-val" data-idx="${i}" value="${displayVal}${unitDisplay}">`;
    html += `</div>`;
  }
  container.innerHTML = html;
  const sliderEls = container.querySelectorAll(".se-tuning-slider");
  sliderEls.forEach((el) => {
    const idx = parseInt(el.dataset.idx);
    const s = sliders[idx];
    el.addEventListener("input", () => {
      const newVal = parseFloat(el.value);
      setNestedValue2(ENEMY_TYPES[editorState.enemyType], s.key, newVal);
      const unitStr = s.unit || s.suffix || "";
      const unitDisplay = unitStr ? " " + unitStr : "";
      const display = Number.isInteger(s.step) ? newVal : parseFloat(newVal).toFixed(2);
      container.querySelector(`.se-tuning-val[data-idx="${idx}"]`).setAttribute("value", display + unitDisplay);
      container.querySelector(`.se-tuning-val[data-idx="${idx}"]`).value = display + unitDisplay;
    });
  });
  const valInputs = container.querySelectorAll(".se-tuning-val");
  valInputs.forEach((inp) => {
    const idx = parseInt(inp.dataset.idx);
    const s = sliders[idx];
    const commitValue = () => {
      const parsed = parseFloat(inp.value);
      if (isNaN(parsed)) {
        const cur = getNestedValue2(ENEMY_TYPES[editorState.enemyType], s.key);
        const unitStr2 = s.unit || s.suffix || "";
        const unitDisplay2 = unitStr2 ? " " + unitStr2 : "";
        const display2 = cur != null ? Number.isInteger(s.step) ? cur : parseFloat(cur).toFixed(2) : s.min;
        inp.value = display2 + unitDisplay2;
        return;
      }
      const clamped = Math.max(s.min, Math.min(s.max, parsed));
      setNestedValue2(ENEMY_TYPES[editorState.enemyType], s.key, clamped);
      const rangeEl = container.querySelector(`.se-tuning-slider[data-idx="${idx}"]`);
      if (rangeEl) rangeEl.value = clamped;
      const unitStr = s.unit || s.suffix || "";
      const unitDisplay = unitStr ? " " + unitStr : "";
      const display = Number.isInteger(s.step) ? clamped : parseFloat(clamped).toFixed(2);
      inp.value = display + unitDisplay;
    };
    inp.addEventListener("change", commitValue);
    inp.addEventListener("blur", commitValue);
    inp.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") inp.blur();
    });
    inp.addEventListener("focus", () => inp.select());
  });
}
function updateTuningSliderValues() {
  const container = document.getElementById("se-tuning-body");
  if (!container) return;
  const sliders = ENEMY_TUNING_SLIDERS[editorState.enemyType];
  if (!sliders) return;
  const cfg = ENEMY_TYPES[editorState.enemyType];
  const sliderEls = container.querySelectorAll(".se-tuning-slider");
  sliderEls.forEach((el) => {
    const idx = parseInt(el.dataset.idx);
    const s = sliders[idx];
    if (!s) return;
    const val = getNestedValue2(cfg, s.key);
    if (val != null) {
      el.value = val;
      const unitStr = s.unit || s.suffix || "";
      const unitDisplay = unitStr ? " " + unitStr : "";
      const display = Number.isInteger(s.step) ? val : parseFloat(val).toFixed(2);
      container.querySelector(`.se-tuning-val[data-idx="${idx}"]`).value = display + unitDisplay;
    }
  });
}
function buildEnemyConfigText() {
  let text = "export const ENEMY_TYPES = {\n";
  for (const [name, cfg] of Object.entries(ENEMY_TYPES)) {
    text += `  ${name}: ${JSON.stringify(cfg, null, 4).split("\n").map((l, i) => i === 0 ? l : "  " + l).join("\n")},
`;
  }
  text += "};\n";
  return text;
}
function buildArenaConfigText() {
  let text = "// Arena layout \u2014 shared between renderer (meshes) and physics (collision)\n";
  text += "// All obstacles and walls defined here so designer can rearrange the arena\n\n";
  text += `export const ARENA_HALF = ${ARENA_HALF};

`;
  text += "// Obstacles: x, z = center position; w, d = width/depth on xz plane; h = height (visual only)\n";
  text += "export const OBSTACLES = [\n";
  for (const o of OBSTACLES) {
    text += `  { x: ${o.x}, z: ${o.z}, w: ${o.w}, h: ${o.h}, d: ${o.d} },
`;
  }
  text += "];\n\n";
  text += "// Walls: auto-generated from ARENA_HALF\n";
  text += "export const WALL_THICKNESS = 0.5;\n";
  text += "export const WALL_HEIGHT = 2;\n\n";
  text += "// Pits: x, z = center position; w, d = width/depth on xz plane\n";
  text += "// Entities that enter a pit die instantly. Enemies edge-slide around them.\n";
  text += "export const PITS = [\n";
  for (const p of PITS) {
    text += `  { x: ${p.x}, z: ${p.z}, w: ${p.w}, d: ${p.d} },
`;
  }
  text += "];\n";
  text += ARENA_STATIC_SUFFIX;
  return text;
}
var ARENA_STATIC_SUFFIX = `
// Convert pits to AABB format for collision
export function getPitBounds() {
  return PITS.map(p => ({
    minX: p.x - p.w / 2,
    maxX: p.x + p.w / 2,
    minZ: p.z - p.d / 2,
    maxZ: p.z + p.d / 2,
  }));
}

// Pre-computed AABB list for collision (obstacles + walls)
// Each entry: { minX, maxX, minZ, maxZ }
export function getCollisionBounds() {
  const bounds = [];

  // Obstacles
  for (const o of OBSTACLES) {
    bounds.push({
      minX: o.x - o.w / 2,
      maxX: o.x + o.w / 2,
      minZ: o.z - o.d / 2,
      maxZ: o.z + o.d / 2,
    });
  }

  // Walls
  const h = ARENA_HALF;
  const t = WALL_THICKNESS;
  // North wall
  bounds.push({ minX: -h - t/2, maxX: h + t/2, minZ: h - t/2, maxZ: h + t/2 });
  // South wall
  bounds.push({ minX: -h - t/2, maxX: h + t/2, minZ: -h - t/2, maxZ: -h + t/2 });
  // East wall
  bounds.push({ minX: h - t/2, maxX: h + t/2, minZ: -h - t/2, maxZ: h + t/2 });
  // West wall
  bounds.push({ minX: -h - t/2, maxX: -h + t/2, minZ: -h - t/2, maxZ: h + t/2 });

  return bounds;
}
`;
function playCurrentWave() {
  exitEditor();
  clearEnemies(gameStateRef);
  releaseAllProjectiles();
  resetWaveRunner();
  gameStateRef.phase = "playing";
  startWave(editorState.waveIndex, gameStateRef);
}
async function saveToFile(filename, content, btnEl) {
  const orig = btnEl.textContent;
  btnEl.textContent = "Saving...";
  try {
    const res = await fetch("/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: filename, content })
    });
    if (!res.ok) throw new Error(res.statusText);
    btnEl.textContent = "Saved \u2713";
    btnEl.classList.add("copied");
  } catch (e) {
    btnEl.textContent = "Error!";
    console.error("[spawnEditor] Save failed:", filename, e);
  }
  setTimeout(() => {
    btnEl.textContent = orig;
    btnEl.classList.remove("copied");
  }, 1200);
}
function copyToClipboard(text, btnEl) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btnEl.textContent;
    btnEl.textContent = "Copied!";
    btnEl.classList.add("copied");
    setTimeout(() => {
      btnEl.textContent = orig;
      btnEl.classList.remove("copied");
    }, 1200);
  });
}
function buildWaveText(waveIdx) {
  const wave = WAVES[waveIdx];
  if (!wave) return "";
  return formatWaveObj(wave);
}
function buildAllWavesText() {
  const lines = [
    "// Wave definitions \u2014 each wave has groups of spawns with independent timing",
    "// Designer edits this file or uses the spawn editor (backtick key) to place visually",
    "",
    "export const WAVES = ["
  ];
  for (let i = 0; i < WAVES.length; i++) {
    lines.push("  " + formatWaveObj(WAVES[i]).split("\n").join("\n  ") + ",");
  }
  lines.push("];");
  lines.push("");
  return lines.join("\n");
}
function formatWaveObj(wave) {
  let s = "{\n";
  s += `  wave: ${wave.wave},
`;
  s += `  message: '${wave.message}',
`;
  s += `  groups: [
`;
  for (const g of wave.groups) {
    s += `    {
`;
    s += `      id: '${g.id}',
`;
    s += `      triggerDelay: ${g.triggerDelay},
`;
    s += `      telegraphDuration: ${g.telegraphDuration},
`;
    s += `      stagger: ${g.stagger},
`;
    s += `      spawns: [
`;
    for (const sp of g.spawns) {
      s += `        { type: '${sp.type}', x: ${sp.x}, z: ${sp.z} },
`;
    }
    s += `      ],
`;
    s += `    },
`;
  }
  s += `  ]
`;
  s += `}`;
  return s;
}
function injectStyles2() {
  const style = document.createElement("style");
  style.textContent = `
    #spawn-editor {
      position: fixed;
      top: 60px;
      left: 20px;
      width: 320px;
      max-height: calc(100vh - 80px);
      overflow-y: auto;
      z-index: 200;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      pointer-events: all;
      background: rgba(10, 10, 26, 0.94);
      border: 1px solid rgba(68, 255, 136, 0.2);
      border-radius: 6px;
      padding: 14px;
      backdrop-filter: blur(8px);
    }

    #spawn-editor.hidden {
      display: none;
    }

    #spawn-editor::-webkit-scrollbar {
      width: 4px;
    }
    #spawn-editor::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.2);
    }
    #spawn-editor::-webkit-scrollbar-thumb {
      background: rgba(68, 255, 136, 0.3);
      border-radius: 2px;
    }

    /* \u2500\u2500\u2500 Tabs \u2500\u2500\u2500 */
    .se-tabs {
      display: flex;
      gap: 2px;
      margin-bottom: 12px;
      border-bottom: 1px solid rgba(68, 255, 136, 0.15);
      padding-bottom: 0;
    }

    .se-tab {
      flex: 1;
      text-align: center;
      padding: 6px 0;
      font-size: 10px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.4);
      cursor: pointer;
      user-select: none;
      border-bottom: 2px solid transparent;
      transition: all 0.15s ease;
      margin-bottom: -1px;
    }

    .se-tab:hover {
      color: rgba(255, 255, 255, 0.7);
    }

    .se-tab.active {
      color: rgba(68, 255, 136, 0.9);
      border-bottom-color: rgba(68, 255, 136, 0.8);
    }

    .se-title {
      font-size: 10px;
      color: rgba(68, 255, 136, 0.8);
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 12px;
      padding-bottom: 4px;
      border-bottom: 1px solid rgba(68, 255, 136, 0.15);
    }

    .se-section {
      margin-bottom: 10px;
    }

    .se-group-label {
      font-size: 9px;
      color: rgba(68, 255, 136, 0.5);
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-bottom: 5px;
    }

    .se-wave-msg {
      width: 100%;
      margin-top: 6px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      color: rgba(255, 255, 255, 0.8);
      font-size: 10px;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      padding: 4px 6px;
      outline: none;
      box-sizing: border-box;
    }
    .se-wave-msg:hover {
      border-color: rgba(255, 255, 255, 0.2);
    }
    .se-wave-msg:focus {
      border-color: rgba(68, 255, 136, 0.5);
      background: rgba(0, 0, 0, 0.3);
    }

    .se-selector {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .se-selector span {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.8);
      min-width: 30px;
      text-align: center;
    }

    .se-btn {
      padding: 3px 8px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.6);
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 3px;
      cursor: pointer;
      user-select: none;
      transition: all 0.12s ease;
    }

    .se-btn:hover {
      background: rgba(68, 255, 136, 0.1);
      border-color: rgba(68, 255, 136, 0.4);
      color: rgba(255, 255, 255, 0.9);
    }

    .se-btn.se-add {
      color: rgba(68, 255, 136, 0.7);
    }

    .se-btn.se-del {
      color: rgba(255, 68, 102, 0.7);
    }
    .se-btn.se-del:hover {
      background: rgba(255, 68, 102, 0.1);
      border-color: rgba(255, 68, 102, 0.4);
    }

    .se-slider-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 5px;
    }

    .se-slider-row span:first-child {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.5);
      width: 75px;
      flex-shrink: 0;
    }

    .se-slider-row span.has-tooltip {
      cursor: help;
      text-decoration: underline dotted rgba(255, 255, 255, 0.2);
      text-underline-offset: 2px;
    }

    .se-slider-row input[type="range"] {
      flex: 1;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: rgba(100, 100, 160, 0.3);
      border-radius: 2px;
      outline: none;
      cursor: pointer;
    }

    .se-slider-row input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #44ff88;
      cursor: pointer;
      border: none;
    }

    .se-slider-row span:last-child {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.7);
      min-width: 55px;
      text-align: right;
      flex-shrink: 0;
    }

    .se-slider-row input[type="text"] {
      background: transparent;
      border: 1px solid transparent;
      border-radius: 3px;
      color: rgba(255, 255, 255, 0.7);
      font-size: 10px;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      min-width: 55px;
      max-width: 65px;
      text-align: right;
      padding: 1px 4px;
      flex-shrink: 0;
      outline: none;
    }
    .se-slider-row input[type="text"]:hover {
      border-color: rgba(255, 255, 255, 0.15);
    }
    .se-slider-row input[type="text"]:focus {
      border-color: rgba(68, 255, 136, 0.5);
      color: rgba(255, 255, 255, 0.9);
      background: rgba(0, 0, 0, 0.3);
    }

    .se-type-picker {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .se-type-btn {
      padding: 4px 8px;
      font-size: 10px;
      color: rgba(255, 255, 255, 0.5);
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 3px;
      cursor: pointer;
      user-select: none;
      transition: all 0.12s ease;
    }

    .se-type-btn:hover {
      opacity: 1;
      color: rgba(255, 255, 255, 0.9);
    }

    .se-type-btn.selected {
      color: #fff;
      background: rgba(255, 255, 255, 0.1);
      border-width: 2px;
      opacity: 1;
    }

    .se-collapsible {
      cursor: pointer;
      user-select: none;
    }
    .se-collapsible:hover {
      color: rgba(68, 255, 136, 0.8);
    }

    #se-tuning-body {
      max-height: 300px;
      overflow-y: auto;
      transition: max-height 0.2s ease;
    }
    #se-tuning-body.collapsed {
      max-height: 0;
      overflow: hidden;
    }
    #se-tuning-body::-webkit-scrollbar {
      width: 4px;
    }
    #se-tuning-body::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.2);
    }
    #se-tuning-body::-webkit-scrollbar-thumb {
      background: rgba(68, 255, 136, 0.3);
      border-radius: 2px;
    }

    /* .se-tuning-val styling handled by input[type="text"] rule above */

    .se-spawn-count {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.5);
      margin-bottom: 4px;
    }

    .se-selected-info {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.8);
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 3px;
      padding: 4px 6px;
      margin-bottom: 6px;
      display: none;
    }

    .se-action {
      margin-top: 4px;
      text-align: center;
      padding: 5px 0;
    }

    .se-actions {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .se-play {
      color: rgba(68, 255, 136, 0.8) !important;
      border-color: rgba(68, 255, 136, 0.3) !important;
    }
    .se-play:hover {
      background: rgba(68, 255, 136, 0.12) !important;
      border-color: rgba(68, 255, 136, 0.6) !important;
    }

    .se-save {
      color: rgba(68, 200, 255, 0.8) !important;
      border-color: rgba(68, 200, 255, 0.3) !important;
    }
    .se-save:hover {
      background: rgba(68, 200, 255, 0.12) !important;
      border-color: rgba(68, 200, 255, 0.6) !important;
    }

    .se-btn.copied {
      color: #ffcc44 !important;
      border-color: rgba(255, 204, 68, 0.4) !important;
    }

    /* \u2500\u2500\u2500 Preset Selector \u2500\u2500\u2500 */
    .se-preset-row {
      display: flex;
      gap: 4px;
      align-items: center;
    }

    .se-preset-select {
      flex: 1;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 3px;
      color: rgba(255, 255, 255, 0.8);
      font-size: 10px;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      padding: 4px 6px;
      outline: none;
    }

    .se-preset-select:focus {
      border-color: rgba(68, 200, 255, 0.5);
    }

    .se-btn.se-small {
      font-size: 9px;
      padding: 3px 8px;
    }

    /* \u2500\u2500\u2500 Level Tab Item List \u2500\u2500\u2500 */
    .se-item-list {
      max-height: 180px;
      overflow-y: auto;
      margin-bottom: 6px;
    }

    .se-item-list::-webkit-scrollbar {
      width: 4px;
    }
    .se-item-list::-webkit-scrollbar-thumb {
      background: rgba(68, 255, 136, 0.3);
      border-radius: 2px;
    }

    .se-item-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 6px;
      font-size: 10px;
      color: rgba(255, 255, 255, 0.6);
      border: 1px solid transparent;
      border-radius: 3px;
      cursor: pointer;
      transition: all 0.1s ease;
      margin-bottom: 2px;
    }

    .se-item-row:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.1);
    }

    .se-item-row.selected {
      background: rgba(68, 255, 136, 0.08);
      border-color: rgba(68, 255, 136, 0.3);
      color: rgba(255, 255, 255, 0.9);
    }

    .se-item-label {
      flex-shrink: 0;
      width: 50px;
    }

    .se-item-coords {
      color: rgba(255, 255, 255, 0.4);
      flex: 1;
    }

    .se-item-dims {
      color: rgba(100, 180, 255, 0.6);
      flex-shrink: 0;
    }

    #se-tooltip {
      position: fixed;
      z-index: 300;
      max-width: 220px;
      padding: 6px 10px;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 10px;
      line-height: 1.4;
      color: rgba(255, 255, 255, 0.9);
      background: rgba(10, 10, 30, 0.95);
      border: 1px solid rgba(68, 255, 136, 0.4);
      border-radius: 4px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.12s ease;
      backdrop-filter: blur(6px);
    }

    #se-tooltip.visible {
      opacity: 1;
    }

    #editor-banner {
      position: fixed;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 11px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: rgba(68, 255, 136, 0.8);
      background: rgba(10, 10, 26, 0.85);
      border: 1px solid rgba(68, 255, 136, 0.3);
      border-radius: 4px;
      padding: 5px 16px;
      z-index: 250;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    #editor-banner.visible {
      opacity: 1;
    }
  `;
  document.head.appendChild(style);
}

// src/engine/game.ts
var gameState = {
  phase: "waiting",
  playerHealth: PLAYER.maxHealth,
  playerMaxHealth: PLAYER.maxHealth,
  currency: 0,
  currentWave: 1,
  enemies: [],
  abilities: {
    dash: { cooldownRemaining: 0 },
    ultimate: { cooldownRemaining: 0, active: false, activeRemaining: 0, charging: false, chargeT: 0 }
  }
};
var lastTime = 0;
function gameLoop(timestamp) {
  requestAnimationFrame(gameLoop);
  if (gameState.phase === "waiting") {
    getRendererInstance().render(getScene(), getCamera());
    return;
  }
  if (gameState.phase === "gameOver") {
    getRendererInstance().render(getScene(), getCamera());
    return;
  }
  if (gameState.phase === "editorPaused") {
    updateInput();
    updateSpawnEditor(0);
    getRendererInstance().render(getScene(), getCamera());
    consumeInput();
    return;
  }
  let dt = (timestamp - lastTime) / 1e3;
  lastTime = timestamp;
  dt = Math.min(dt, 0.05);
  if (dt <= 0) return;
  updateInput();
  autoAimClosestEnemy(gameState.enemies);
  const input = getInputState();
  updatePlayer(input, dt, gameState);
  updateProjectiles(dt);
  updateWaveRunner(dt, gameState);
  updateEnemies(dt, getPlayerPos(), gameState);
  checkCollisions(gameState);
  checkPitFalls(gameState);
  updateEffectGhosts(dt);
  updateAoeTelegraphs(dt);
  updatePendingEffects(dt);
  updateMortarProjectiles(dt);
  updateIcePatches(dt);
  if (gameState.phase === "gameOver") {
    showGameOver(gameState);
  }
  updateCamera(getPlayerPos(), dt);
  updateHUD(gameState);
  checkEditorToggle();
  consumeInput();
  getRendererInstance().render(getScene(), getCamera());
  updateDamageNumbers(dt);
}
function restart() {
  gameState.phase = "playing";
  gameState.playerHealth = PLAYER.maxHealth;
  gameState.playerMaxHealth = PLAYER.maxHealth;
  gameState.currency = 0;
  gameState.currentWave = 1;
  gameState.abilities.dash.cooldownRemaining = 0;
  gameState.abilities.ultimate.cooldownRemaining = 0;
  gameState.abilities.ultimate.active = false;
  gameState.abilities.ultimate.activeRemaining = 0;
  gameState.abilities.ultimate.charging = false;
  gameState.abilities.ultimate.chargeT = 0;
  clearEnemies(gameState);
  releaseAllProjectiles();
  resetPlayer();
  clearDamageNumbers();
  clearAoeTelegraphs();
  clearMortarProjectiles();
  clearIcePatches();
  clearEffectGhosts();
  resetWaveRunner();
  startWave(0, gameState);
}
function init() {
  try {
    window.__configDefaults = snapshotDefaults();
    applyUrlParams();
    const { scene: scene2 } = initRenderer();
    initInput();
    createPlayer(scene2);
    initProjectilePool(scene2);
    initEnemySystem(scene2);
    initMortarSystem(scene2);
    initAoeTelegraph(scene2);
    initWaveRunner(scene2);
    initHUD();
    initDamageNumbers();
    initTuningPanel();
    initSpawnEditor(scene2, gameState);
    initScreens(restart, () => {
      gameState.phase = "playing";
      document.getElementById("hud").style.visibility = "visible";
      startWave(0, gameState);
      lastTime = performance.now();
    });
    document.getElementById("hud").style.visibility = "hidden";
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  } catch (err) {
    console.error("[init] Fatal error during initialization:", err);
  }
}
init();
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
  window.gameState = gameState;
  window.getPlayerPos = getPlayerPos;
}
//# sourceMappingURL=game.js.map
