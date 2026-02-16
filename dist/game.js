// Built with esbuild
const THREE = window.THREE;
const nipplejs = window.nipplejs;

// src/config/arena.ts
var ARENA_HALF_X = 20;
var ARENA_HALF_Z = 20;
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
function setArenaConfig(obstacles, pits, arenaHalfX, arenaHalfZ) {
  OBSTACLES.length = 0;
  obstacles.forEach((o) => OBSTACLES.push(o));
  PITS.length = 0;
  pits.forEach((p) => PITS.push(p));
  ARENA_HALF_X = arenaHalfX;
  ARENA_HALF_Z = arenaHalfZ ?? arenaHalfX;
  ARENA_HALF = ARENA_HALF_X;
}
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
  const hx = ARENA_HALF_X;
  const hz = ARENA_HALF_Z;
  const t = WALL_THICKNESS;
  bounds.push({ minX: -hx - t / 2, maxX: hx + t / 2, minZ: hz - t / 2, maxZ: hz + t / 2 });
  bounds.push({ minX: -hx - t / 2, maxX: hx + t / 2, minZ: -hz - t / 2, maxZ: -hz + t / 2 });
  bounds.push({ minX: hx - t / 2, maxX: hx + t / 2, minZ: -hz - t / 2, maxZ: hz + t / 2 });
  bounds.push({ minX: -hx - t / 2, maxX: -hx + t / 2, minZ: -hz - t / 2, maxZ: hz + t / 2 });
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
  const groundSize = 120;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize),
    new THREE.MeshStandardMaterial({ color: 1710638, roughness: 0.9, metalness: 0.1 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const grid = new THREE.GridHelper(groundSize, 60, 2771530, 1714746);
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
  const normalMat = new THREE.MeshStandardMaterial({
    color: 2763338,
    emissive: 2241365,
    emissiveIntensity: 0.3,
    roughness: 0.7,
    metalness: 0.2
  });
  const destructibleMat = new THREE.MeshStandardMaterial({
    color: 4864554,
    emissive: 5583650,
    emissiveIntensity: 0.3,
    roughness: 0.8,
    metalness: 0.1
  });
  for (const o of OBSTACLES) {
    const mat = o.destructible ? destructibleMat.clone() : normalMat;
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
      new THREE.BoxGeometry(ARENA_HALF_X * 2 + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS),
      wallMat
    );
    wall.position.set(0, WALL_HEIGHT / 2, zSign * ARENA_HALF_Z);
    scene.add(wall);
    wallMeshes.push(wall);
  }
  for (const xSign of [-1, 1]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, ARENA_HALF_Z * 2 + WALL_THICKNESS),
      wallMat
    );
    wall.position.set(xSign * ARENA_HALF_X, WALL_HEIGHT / 2, 0);
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
var MELEE = {
  damage: 10,
  range: 2.2,
  // how far the swing reaches from player center
  arc: 2.4,
  // radians (~137°) — generous cone
  cooldown: 380,
  // ms between swings
  knockback: 1.5,
  // units pushed on hit
  autoTargetRange: 3,
  // radius to search for snap-targeting
  autoTargetArc: 2.8,
  // radians (~160°) — wide search for auto-target
  screenShake: 1.5,
  // shake intensity on hit
  hitPause: 40
  // ms of freeze-frame on hit (juice)
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
    cooldown: 500,
    chargeTimeMs: 1500,
    minLength: 3,
    maxLength: 12,
    width: 3,
    minKnockback: 4,
    maxKnockback: 12,
    color: 4521898,
    telegraphOpacity: 0.3,
    chargeMoveSpeedMult: 0.4,
    description: "Charge a directional push \u2014 hold to extend range"
  }
};

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
var sceneRef;
var activeTelegraphs = [];
var pendingEffects = [];
var ringGeo;
function easeOutQuad(t) {
  return t * (2 - t);
}
function initAoeTelegraph(scene2) {
  sceneRef = scene2;
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
  sceneRef.add(mesh);
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
    sceneRef.remove(t.mesh);
  } else if (t.type === "rect") {
    t.fillMaterial.dispose();
    t.borderMaterial.dispose();
    t.borderEdgeGeo.dispose();
    sceneRef.remove(t.mesh);
  }
}
function schedulePendingEffect(enemy, delayMs, callback) {
  pendingEffects.push({ enemy, delay: delayMs, callback });
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
function clearAoeTelegraphs() {
  for (const t of activeTelegraphs) {
    removeTelegraph(t);
  }
  activeTelegraphs.length = 0;
  pendingEffects.length = 0;
}

// src/config/enemies.ts
var MOB_GLOBAL = {
  speedMult: 1,
  damageMult: 1,
  healthMult: 1,
  telegraphMult: 1,
  recoveryMult: 1
};
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
    mass: 1,
    color: 16729190,
    emissive: 16720452,
    size: { radius: 0.3, height: 0.8 },
    drops: { currency: { min: 1, max: 3 }, healthChance: 0.1 },
    rush: { stopDistance: 0.5 },
    melee: {
      telegraphDuration: 300,
      attackDuration: 100,
      recoveryDuration: 400,
      lungeDistance: 0.8,
      damage: 10,
      hitArc: 1.5,
      hitRange: 1.2
    },
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
    mass: 0.8,
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
    mass: 0.9,
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
    mass: 3,
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
    melee: {
      telegraphDuration: 700,
      attackDuration: 150,
      recoveryDuration: 800,
      damage: 30,
      hitArc: 2,
      hitRange: 2.5
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
var sceneRef2;
var basePlayerProjSize;
function initProjectilePool(scene2) {
  sceneRef2 = scene2;
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
  const pool3 = isEnemy ? enemyPool : playerPool;
  const p = pool3.acquire();
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
  for (const pool3 of [playerPool, enemyPool]) {
    const active5 = pool3.getActive();
    for (let i = active5.length - 1; i >= 0; i--) {
      const p = active5[i];
      p.mesh.position.x += p.dir.x * p.speed * dt;
      p.mesh.position.z += p.dir.z * p.speed * dt;
      p.life += dt;
      if (p.life > maxLife) {
        pool3.release(p);
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

// src/entities/enemyRig.ts
var SILHOUETTES = {
  goblin: {
    headScale: 1.2,
    // big exaggerated head — dominant feature
    torsoW: 0.55,
    torsoH: 0.3,
    torsoD: 0.5,
    armW: 0.28,
    armLen: 0.42,
    // long-ish dangling arms
    legW: 0.3,
    legLen: 0.28,
    // short stubby legs
    legSpread: 0.3,
    hipY: 0.35,
    limbDarken: 0.15,
    headBrighten: 0.1,
    extras: ["snout", "ears"]
  },
  skeletonArcher: {
    headScale: 0.7,
    // small skull
    torsoW: 0.38,
    torsoH: 0.42,
    torsoD: 0.3,
    // narrow tall
    armW: 0.18,
    armLen: 0.38,
    legW: 0.2,
    legLen: 0.45,
    legSpread: 0.22,
    hipY: 0.45,
    limbDarken: 0.1,
    headBrighten: 0.05,
    extras: ["bow", "ribs"]
  },
  iceMortarImp: {
    headScale: 0.9,
    torsoW: 0.55,
    torsoH: 0.28,
    torsoD: 0.5,
    // wide round body, scaled down
    armW: 0.18,
    armLen: 0.2,
    // stubby arms
    legW: 0.22,
    legLen: 0.2,
    // tiny legs
    legSpread: 0.25,
    hipY: 0.28,
    limbDarken: 0.1,
    headBrighten: 0.15,
    extras: ["hat"]
  },
  stoneGolem: {
    headScale: 0.5,
    // tiny head sunk in shoulders
    torsoW: 0.7,
    torsoH: 0.4,
    torsoD: 0.6,
    // massive (golem already has large cfg.size)
    armW: 0.38,
    armLen: 0.45,
    // thick heavy arms
    legW: 0.38,
    legLen: 0.38,
    // thick legs
    legSpread: 0.32,
    hipY: 0.4,
    limbDarken: 0.1,
    headBrighten: 0.05,
    extras: ["shoulders"]
  }
};
var DEFAULT_SILHOUETTE = {
  headScale: 0.9,
  torsoW: 0.5,
  torsoH: 0.35,
  torsoD: 0.45,
  armW: 0.25,
  armLen: 0.35,
  legW: 0.28,
  legLen: 0.35,
  legSpread: 0.25,
  hipY: 0.4,
  limbDarken: 0.1,
  headBrighten: 0.1,
  extras: []
};
function darkenColor(color, amount) {
  const r = Math.max(0, (color >> 16 & 255) * (1 - amount)) | 0;
  const g = Math.max(0, (color >> 8 & 255) * (1 - amount)) | 0;
  const b = Math.max(0, (color & 255) * (1 - amount)) | 0;
  return r << 16 | g << 8 | b;
}
function brightenColor(color, amount) {
  const r = Math.min(255, (color >> 16 & 255) * (1 + amount)) | 0;
  const g = Math.min(255, (color >> 8 & 255) * (1 + amount)) | 0;
  const b = Math.min(255, (color & 255) * (1 + amount)) | 0;
  return r << 16 | g << 8 | b;
}
function buildEnemyModel(typeName, cfg, group) {
  const sil = SILHOUETTES[typeName] || DEFAULT_SILHOUETTE;
  const r = cfg.size.radius;
  const h = cfg.size.height;
  const allMeshes = [];
  const allMaterials = [];
  function addMesh(geo, color, emissive, emissiveI, parent, x = 0, y = 0, z = 0) {
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: emissiveI
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
  const hipY = h * sil.hipY;
  const torsoW = r * 2 * sil.torsoW;
  const torsoH = h * sil.torsoH;
  const torsoD = r * 2 * sil.torsoD;
  const torsoY = hipY + torsoH / 2 + r * 0.05;
  const torsoGeo = new THREE.BoxGeometry(torsoW, torsoH, torsoD);
  const bodyMesh = addMesh(torsoGeo, bodyColor, bodyEmissive, 0.5, group, 0, torsoY, 0);
  const headRadius = r * sil.headScale * 0.7;
  const headY = torsoY + torsoH / 2 + headRadius * 0.8;
  const headGeo = new THREE.SphereGeometry(headRadius, 8, 6);
  const headMesh = addMesh(headGeo, headColor, headEmissive, 0.6, group, 0, headY, 0);
  const shoulderY = torsoY + torsoH * 0.3;
  const armW = r * sil.armW;
  const armLen = h * sil.armLen;
  const armGeo = new THREE.BoxGeometry(armW, armLen, armW);
  addMesh(
    armGeo,
    limbColor,
    limbEmissive,
    0.4,
    group,
    -(torsoW / 2 + armW / 2),
    shoulderY - armLen / 2,
    0
  );
  addMesh(
    armGeo,
    limbColor,
    limbEmissive,
    0.4,
    group,
    torsoW / 2 + armW / 2,
    shoulderY - armLen / 2,
    0
  );
  const legW = r * sil.legW;
  const legLen = h * sil.legLen;
  const legSpread = r * sil.legSpread;
  const legGeo = new THREE.BoxGeometry(legW, legLen, legW);
  addMesh(
    legGeo,
    limbColor,
    limbEmissive,
    0.4,
    group,
    -legSpread,
    hipY - legLen / 2,
    0
  );
  addMesh(
    legGeo,
    limbColor,
    limbEmissive,
    0.4,
    group,
    legSpread,
    hipY - legLen / 2,
    0
  );
  if (sil.extras.includes("snout")) {
    const snoutGeo = new THREE.ConeGeometry(headRadius * 0.35, headRadius * 0.7, 5);
    const snout = addMesh(
      snoutGeo,
      headColor,
      headEmissive,
      0.5,
      group,
      0,
      headY - headRadius * 0.15,
      -(headRadius + headRadius * 0.15)
    );
    snout.rotation.x = -Math.PI / 2;
  }
  if (sil.extras.includes("ears")) {
    const earGeo = new THREE.ConeGeometry(headRadius * 0.25, headRadius * 0.7, 4);
    const earL = addMesh(
      earGeo,
      headColor,
      headEmissive,
      0.5,
      group,
      -(headRadius + headRadius * 0.1),
      headY + headRadius * 0.3,
      0
    );
    earL.rotation.z = Math.PI / 2 + 0.4;
    const earR = addMesh(
      earGeo,
      headColor,
      headEmissive,
      0.5,
      group,
      headRadius + headRadius * 0.1,
      headY + headRadius * 0.3,
      0
    );
    earR.rotation.z = -(Math.PI / 2 + 0.4);
  }
  if (sil.extras.includes("bow")) {
    const bowGeo = new THREE.BoxGeometry(armW * 0.4, h * 0.35, armW * 0.8);
    addMesh(
      bowGeo,
      darkenColor(bodyColor, 0.4),
      darkenColor(bodyEmissive, 0.4),
      0.3,
      group,
      -(torsoW / 2 + armW * 1.5),
      shoulderY - armLen * 0.4,
      -r * 0.4
    );
  }
  if (sil.extras.includes("ribs")) {
    const ribColor = brightenColor(bodyColor, 0.15);
    const ribEmissive = brightenColor(bodyEmissive, 0.1);
    for (let i = 0; i < 3; i++) {
      const ribGeo = new THREE.BoxGeometry(torsoW * 1.15, h * 0.012, torsoD * 0.6);
      const ribY = torsoY + torsoH * (0.25 - i * 0.25);
      addMesh(ribGeo, ribColor, ribEmissive, 0.3, group, 0, ribY, 0);
    }
  }
  if (sil.extras.includes("hat")) {
    const hatGeo = new THREE.ConeGeometry(headRadius * 0.9, h * 0.28, 6);
    const hat = addMesh(
      hatGeo,
      darkenColor(bodyColor, 0.25),
      darkenColor(bodyEmissive, 0.25),
      0.4,
      group,
      0,
      headY + headRadius * 0.6 + h * 0.1,
      0
    );
    hat.rotation.z = 0.15;
  }
  if (sil.extras.includes("shoulders")) {
    const shW = torsoW * 0.4;
    const shH = torsoH * 0.25;
    const shGeo = new THREE.BoxGeometry(shW, shH, shW);
    addMesh(
      shGeo,
      darkenColor(bodyColor, 0.1),
      darkenColor(bodyEmissive, 0.1),
      0.35,
      group,
      -(torsoW / 2 + shW * 0.1),
      shoulderY + shH * 0.5,
      0
    );
    addMesh(
      shGeo,
      darkenColor(bodyColor, 0.1),
      darkenColor(bodyEmissive, 0.1),
      0.35,
      group,
      torsoW / 2 + shW * 0.1,
      shoulderY + shH * 0.5,
      0
    );
  }
  return { bodyMesh, headMesh, allMeshes, allMaterials };
}
function createHitReaction() {
  return { active: false, timer: 0, duration: 0.12 };
}
function triggerHitReaction(state) {
  state.active = true;
  state.timer = 0;
}
function updateHitReaction(state, meshGroup, dt) {
  if (!state.active) return;
  state.timer += dt;
  const t = Math.min(state.timer / state.duration, 1);
  if (t < 0.3) {
    const squashT = t / 0.3;
    meshGroup.scale.set(1 + 0.12 * squashT, 1 - 0.15 * squashT, 1 + 0.12 * squashT);
  } else {
    const bounceT = (t - 0.3) / 0.7;
    const ease = 1 - Math.pow(1 - bounceT, 3);
    const overshoot = bounceT < 0.5 ? 1.06 : 1 + 0.06 * (1 - (bounceT - 0.5) * 2);
    const scaleY = 1 - 0.15 + (overshoot - (1 - 0.15)) * ease;
    const scaleXZ = 1 + 0.12 + (1 - (1 + 0.12)) * ease;
    meshGroup.scale.set(scaleXZ, scaleY, scaleXZ);
  }
  if (t >= 1) {
    state.active = false;
    meshGroup.scale.set(1, 1, 1);
  }
}

// src/engine/events.ts
var listeners = /* @__PURE__ */ new Map();
function emit(event) {
  const set = listeners.get(event.type);
  if (!set) return;
  for (const fn of set) {
    fn(event);
  }
}
function on(type, callback) {
  let set = listeners.get(type);
  if (!set) {
    set = /* @__PURE__ */ new Set();
    listeners.set(type, set);
  }
  set.add(callback);
}

// src/entities/enemy.ts
var sceneRef3;
var shieldGeo;
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
  const model = buildEnemyModel(typeName, cfg, group);
  const bodyMesh = model.bodyMesh;
  const headMesh = model.headMesh;
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
    // Physics velocity (knockback system)
    vel: { x: 0, z: 0 },
    // knockback velocity — integrated by applyVelocities()
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
    leapCooldown: 0,
    // ms until next leap allowed
    // Melee attack state machine (for enemies with config.melee)
    meleePhase: "idle",
    meleeTimer: 0,
    meleeHasHit: false,
    // prevent double-hit per attack cycle
    // Hit reaction (squash/bounce)
    hitReaction: createHitReaction(),
    allMaterials: model.allMaterials
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
          behaviorRush(enemy, playerPos2, dt, gameState2);
          break;
        case "kite":
          behaviorKite(enemy, playerPos2, dt, gameState2);
          break;
        case "tank":
          behaviorTank(enemy, playerPos2, dt, gameState2);
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
    if (enemy.hitReaction && enemy.hitReaction.active) {
      updateHitReaction(enemy.hitReaction, enemy.mesh, dt);
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
      emit({ type: "enemyDied", enemy, position: { x: enemy.pos.x, z: enemy.pos.z } });
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
function startEnemyMelee(enemy) {
  const meleeCfg = enemy.config.melee;
  if (!meleeCfg) return;
  const telegraphDur = meleeCfg.telegraphDuration * MOB_GLOBAL.telegraphMult;
  enemy.meleePhase = "telegraph";
  enemy.meleeTimer = telegraphDur;
  enemy.meleeHasHit = false;
  enemy.flashTimer = telegraphDur;
  enemy.bodyMesh.material.emissive.setHex(16755200);
  if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(16755200);
  emit({
    type: "enemyMeleeTelegraph",
    position: { x: enemy.pos.x, z: enemy.pos.z },
    facingAngle: enemy.mesh.rotation.y,
    hitArc: meleeCfg.hitArc,
    hitRange: meleeCfg.hitRange,
    duration: telegraphDur + meleeCfg.attackDuration
    // visible through telegraph + attack
  });
}
function updateEnemyMelee(enemy, dt, playerPos2, gameState2) {
  const meleeCfg = enemy.config.melee;
  if (!meleeCfg || enemy.meleePhase === "idle") return;
  enemy.meleeTimer -= dt * 1e3;
  if (enemy.meleePhase === "telegraph") {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.015);
    const r = Math.floor(255 * pulse);
    const g = Math.floor(170 * pulse);
    enemy.bodyMesh.material.emissive.setRGB(r / 255, g / 255, 0);
    if (enemy.headMesh) enemy.headMesh.material.emissive.setRGB(r / 255, g / 255, 0);
    if (enemy.meleeTimer <= 0) {
      enemy.meleePhase = "attacking";
      enemy.meleeTimer = meleeCfg.attackDuration;
      if (meleeCfg.lungeDistance) {
        _toPlayer.subVectors(playerPos2, enemy.pos);
        _toPlayer.y = 0;
        const dist = _toPlayer.length();
        if (dist > 0.1) {
          _toPlayer.normalize();
          enemy.pos.x += _toPlayer.x * meleeCfg.lungeDistance;
          enemy.pos.z += _toPlayer.z * meleeCfg.lungeDistance;
        }
      }
      enemy.bodyMesh.material.emissive.setHex(16729088);
      if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(16729088);
    }
  } else if (enemy.meleePhase === "attacking") {
    if (!enemy.meleeHasHit) {
      const dx = playerPos2.x - enemy.pos.x;
      const dz = playerPos2.z - enemy.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < meleeCfg.hitRange && !isPlayerInvincible()) {
        const angleToPlayer = Math.atan2(-dx, -dz);
        const facingAngle = enemy.mesh.rotation.y;
        let angleDiff = angleToPlayer - facingAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        if (Math.abs(angleDiff) <= meleeCfg.hitArc / 2) {
          const dmg = meleeCfg.damage * MOB_GLOBAL.damageMult;
          gameState2.playerHealth -= dmg;
          enemy.meleeHasHit = true;
          screenShake(3, 120);
          emit({ type: "playerHit", damage: dmg, position: { x: playerPos2.x, z: playerPos2.z } });
          spawnDamageNumber(playerPos2.x, playerPos2.z, Math.round(dmg), "#ff4466");
          if (gameState2.playerHealth <= 0) {
            gameState2.playerHealth = 0;
            gameState2.phase = "gameOver";
          }
        }
      }
    }
    if (enemy.meleeTimer <= 0) {
      enemy.meleePhase = "recovery";
      enemy.meleeTimer = meleeCfg.recoveryDuration * MOB_GLOBAL.recoveryMult;
      enemy.bodyMesh.material.emissive.setHex(2236962);
      if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(2236962);
    }
  } else if (enemy.meleePhase === "recovery") {
    if (enemy.meleeTimer <= 0) {
      enemy.meleePhase = "idle";
      enemy.lastAttackTime = performance.now();
      enemy.bodyMesh.material.emissive.setHex(enemy.config.emissive);
      if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(enemy.config.emissive);
    }
  }
}
function behaviorRush(enemy, playerPos2, dt, gameState2) {
  if (enemy.isLeaping) return;
  if (enemy.meleePhase !== "idle") {
    updateEnemyMelee(enemy, dt, playerPos2, gameState2);
    return;
  }
  _toPlayer.subVectors(playerPos2, enemy.pos);
  _toPlayer.y = 0;
  const dist = _toPlayer.length();
  const stopDist = enemy.config.rush && enemy.config.rush.stopDistance || 0.5;
  const meleeCfg = enemy.config.melee;
  if (meleeCfg && dist <= meleeCfg.hitRange) {
    const now = performance.now();
    if (now - enemy.lastAttackTime > enemy.config.attackRate) {
      startEnemyMelee(enemy);
      return;
    }
  }
  if (dist > stopDist) {
    _toPlayer.normalize();
    const slideBoost = enemy.wasDeflected ? 1.175 : 1;
    const iceEffects = getIceEffects(enemy.pos.x, enemy.pos.z, false);
    const speed = enemy.config.speed * MOB_GLOBAL.speedMult * (enemy.slowTimer > 0 ? enemy.slowMult : 1) * slideBoost * iceEffects.speedMult;
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
    const speed = enemy.config.speed * MOB_GLOBAL.speedMult * (enemy.slowTimer > 0 ? enemy.slowMult : 1) * slideBoost * iceEffects.speedMult;
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
      enemy.sniperTimer = (sniper.telegraphDuration || 800) * MOB_GLOBAL.telegraphMult;
      const aimAngle = Math.atan2(playerPos2.x - enemy.pos.x, playerPos2.z - enemy.pos.z);
      enemy.sniperAimAngle = aimAngle;
      enemy.flashTimer = enemy.sniperTimer;
      enemy.bodyMesh.material.emissive.setHex(sniper.color || 11158783);
      if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(sniper.color || 11158783);
    }
  } else if (enemy.sniperPhase === "telegraphing") {
    enemy.sniperTimer -= dt * 1e3;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.012);
    const c = sniper.color || 11158783;
    const r = (c >> 16 & 255) / 255;
    const g = (c >> 8 & 255) / 255;
    const b = (c & 255) / 255;
    enemy.bodyMesh.material.emissive.setRGB(r * pulse, g * pulse, b * pulse);
    if (enemy.headMesh) enemy.headMesh.material.emissive.setRGB(r * pulse, g * pulse, b * pulse);
    if (enemy.sniperTimer <= 0) {
      enemy.sniperPhase = "idle";
      enemy.lastAttackTime = now;
      const dirX = Math.sin(enemy.sniperAimAngle);
      const dirZ = Math.cos(enemy.sniperAimAngle);
      const origin = { x: enemy.pos.x, y: 0.5, z: enemy.pos.z };
      const direction = { x: dirX, y: 0, z: dirZ };
      const projConfig = {
        speed: 12,
        damage: (sniper.damage || 15) * MOB_GLOBAL.damageMult,
        color: sniper.color || 11158783
      };
      fireProjectile(origin, direction, projConfig, true);
      enemy.bodyMesh.material.emissive.setHex(enemy.config.emissive);
      if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(enemy.config.emissive);
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
    const speed = enemy.config.speed * MOB_GLOBAL.speedMult * (enemy.slowTimer > 0 ? enemy.slowMult : 1) * slideBoost * iceEffects.speedMult;
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
function behaviorTank(enemy, playerPos2, dt, gameState2) {
  const tank = enemy.config.tank || {};
  _toPlayer.subVectors(playerPos2, enemy.pos);
  _toPlayer.y = 0;
  const dist = _toPlayer.length();
  if (enemy.meleePhase !== "idle") {
    updateEnemyMelee(enemy, dt, playerPos2, gameState2);
    return;
  }
  const slowFactor = enemy.slowTimer > 0 ? enemy.slowMult : 1;
  const slideBoost = enemy.wasDeflected ? 1.175 : 1;
  const iceEffects = getIceEffects(enemy.pos.x, enemy.pos.z, false);
  const baseSpeed = enemy.config.speed * MOB_GLOBAL.speedMult;
  if (enemy.isCharging) {
    const speedMult = tank.chargeSpeedMult || 3;
    enemy.pos.x += enemy.chargeDir.x * baseSpeed * speedMult * slowFactor * slideBoost * iceEffects.speedMult * dt;
    enemy.pos.z += enemy.chargeDir.z * baseSpeed * speedMult * slowFactor * slideBoost * iceEffects.speedMult * dt;
    enemy.chargeTimer -= dt * 1e3;
    if (enemy.chargeTimer <= 0) {
      enemy.isCharging = false;
      const cdMin = tank.chargeCooldownMin || 3e3;
      const cdMax = tank.chargeCooldownMax || 5e3;
      enemy.chargeCooldown = cdMin + Math.random() * (cdMax - cdMin);
    }
  } else {
    const meleeCfg = enemy.config.melee;
    if (meleeCfg && dist <= meleeCfg.hitRange) {
      const now = performance.now();
      if (now - enemy.lastAttackTime > enemy.config.attackRate) {
        startEnemyMelee(enemy);
        return;
      }
    }
    if (dist > 1) {
      _toPlayer.normalize();
      enemy.pos.x += _toPlayer.x * baseSpeed * slowFactor * slideBoost * iceEffects.speedMult * dt;
      enemy.pos.z += _toPlayer.z * baseSpeed * slowFactor * slideBoost * iceEffects.speedMult * dt;
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
  if (enemy.meleePhase !== "idle") {
    enemy.meleePhase = "idle";
    enemy.bodyMesh.material.emissive.setHex(enemy.config.emissive);
    if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(enemy.config.emissive);
  }
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

// src/entities/playerRig.ts
var P = {
  // Overall scale reference
  scale: 0.9,
  // global multiplier if everything feels too big/small
  // Hip (root of legs + torso)
  hipY: 0.5,
  // Torso
  torsoWidth: 0.28,
  torsoHeight: 0.32,
  torsoDepth: 0.18,
  torsoY: 0.22,
  // above hip
  // Head
  headRadius: 0.16,
  headY: 0.3,
  // above torso
  // Arms
  shoulderOffsetX: 0.19,
  shoulderY: 0.22,
  // relative to torso (near top of torso)
  upperArmWidth: 0.08,
  upperArmHeight: 0.2,
  upperArmDepth: 0.08,
  upperArmY: -0.12,
  // hangs down from shoulder
  elbowY: -0.2,
  // relative to upper arm
  lowerArmWidth: 0.07,
  lowerArmHeight: 0.18,
  lowerArmDepth: 0.07,
  lowerArmY: -0.1,
  // hangs down from elbow
  // Legs
  legOffsetX: 0.09,
  thighWidth: 0.1,
  thighHeight: 0.24,
  thighDepth: 0.1,
  thighY: -0.14,
  // hangs down from hip
  kneeY: -0.24,
  // relative to thigh
  shinWidth: 0.08,
  shinHeight: 0.22,
  shinDepth: 0.08,
  shinY: -0.12
  // hangs down from knee
};
var COLORS = {
  torso: { color: 4508808, emissive: 2271846, emissiveIntensity: 0.4 },
  head: { color: 5627306, emissive: 3390344, emissiveIntensity: 0.5 },
  arm: { color: 3848314, emissive: 2005344, emissiveIntensity: 0.35 },
  leg: { color: 3716469, emissive: 1873496, emissiveIntensity: 0.35 },
  sword: { color: 13421789, emissive: 8947882, emissiveIntensity: 0.3 }
};
var _torsoGeo = null;
var _headGeo = null;
var _upperArmGeo = null;
var _lowerArmGeo = null;
var _thighGeo = null;
var _shinGeo = null;
var _swordBladeGeo = null;
var _swordGuardGeo = null;
function ensureGeometry() {
  if (_torsoGeo) return;
  _torsoGeo = new THREE.BoxGeometry(P.torsoWidth, P.torsoHeight, P.torsoDepth);
  _headGeo = new THREE.SphereGeometry(P.headRadius, 8, 6);
  _upperArmGeo = new THREE.BoxGeometry(P.upperArmWidth, P.upperArmHeight, P.upperArmDepth);
  _lowerArmGeo = new THREE.BoxGeometry(P.lowerArmWidth, P.lowerArmHeight, P.lowerArmDepth);
  _thighGeo = new THREE.BoxGeometry(P.thighWidth, P.thighHeight, P.thighDepth);
  _shinGeo = new THREE.BoxGeometry(P.shinWidth, P.shinHeight, P.shinDepth);
  _swordBladeGeo = new THREE.BoxGeometry(0.06, 0.5, 0.03);
  _swordGuardGeo = new THREE.BoxGeometry(0.18, 0.04, 0.05);
}
function makeMat(palette) {
  return new THREE.MeshStandardMaterial({
    color: palette.color,
    emissive: palette.emissive,
    emissiveIntensity: palette.emissiveIntensity
  });
}
function createPlayerRig(parentGroup) {
  ensureGeometry();
  const meshes = [];
  const materials = [];
  function addMesh(geo, palette, parent, x = 0, y = 0, z = 0) {
    const mat = makeMat(palette);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    meshes.push(mesh);
    materials.push(mat);
    return mesh;
  }
  const rigRoot = new THREE.Group();
  rigRoot.scale.setScalar(P.scale);
  parentGroup.add(rigRoot);
  const hip = new THREE.Group();
  hip.position.y = P.hipY;
  rigRoot.add(hip);
  const torso = new THREE.Group();
  torso.position.y = P.torsoY;
  hip.add(torso);
  addMesh(_torsoGeo, COLORS.torso, torso, 0, P.torsoHeight / 2, 0);
  const head = new THREE.Group();
  head.position.y = P.torsoHeight + P.headY * 0.5;
  torso.add(head);
  addMesh(_headGeo, COLORS.head, head, 0, 0, 0);
  const shoulderL = new THREE.Group();
  shoulderL.position.set(-P.shoulderOffsetX, P.shoulderY, 0);
  torso.add(shoulderL);
  const upperArmL = new THREE.Group();
  shoulderL.add(upperArmL);
  addMesh(_upperArmGeo, COLORS.arm, upperArmL, 0, P.upperArmY, 0);
  const lowerArmL = new THREE.Group();
  lowerArmL.position.y = P.elbowY;
  upperArmL.add(lowerArmL);
  addMesh(_lowerArmGeo, COLORS.arm, lowerArmL, 0, P.lowerArmY, 0);
  const shoulderR = new THREE.Group();
  shoulderR.position.set(P.shoulderOffsetX, P.shoulderY, 0);
  torso.add(shoulderR);
  const upperArmR = new THREE.Group();
  shoulderR.add(upperArmR);
  addMesh(_upperArmGeo, COLORS.arm, upperArmR, 0, P.upperArmY, 0);
  const lowerArmR = new THREE.Group();
  lowerArmR.position.y = P.elbowY;
  upperArmR.add(lowerArmR);
  addMesh(_lowerArmGeo, COLORS.arm, lowerArmR, 0, P.lowerArmY, 0);
  const sword = new THREE.Group();
  sword.position.set(0, -0.24, 0);
  lowerArmR.add(sword);
  addMesh(_swordBladeGeo, COLORS.sword, sword, 0, -0.22, 0);
  addMesh(_swordGuardGeo, COLORS.sword, sword, 0, 0.03, 0);
  const thighL = new THREE.Group();
  thighL.position.set(-P.legOffsetX, 0, 0);
  hip.add(thighL);
  addMesh(_thighGeo, COLORS.leg, thighL, 0, P.thighY, 0);
  const shinL = new THREE.Group();
  shinL.position.y = P.kneeY;
  thighL.add(shinL);
  addMesh(_shinGeo, COLORS.leg, shinL, 0, P.shinY, 0);
  const thighR = new THREE.Group();
  thighR.position.set(P.legOffsetX, 0, 0);
  hip.add(thighR);
  addMesh(_thighGeo, COLORS.leg, thighR, 0, P.thighY, 0);
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
      sword,
      thighL,
      shinL,
      thighR,
      shinR
    },
    meshes,
    materials
  };
}
var _ghostTorsoGeo = null;
var _ghostHeadGeo = null;
function getGhostGeometries() {
  if (!_ghostTorsoGeo) {
    _ghostTorsoGeo = new THREE.BoxGeometry(P.torsoWidth * P.scale, P.torsoHeight * P.scale, P.torsoDepth * P.scale);
    _ghostHeadGeo = new THREE.SphereGeometry(P.headRadius * P.scale, 6, 4);
  }
  return { torso: _ghostTorsoGeo, head: _ghostHeadGeo };
}

// src/entities/playerAnimator.ts
var C = {
  // Run cycle
  runCycleRate: 0.4,
  // full leg cycles per world unit traveled
  strideAngle: 0.6,
  // radians (~35°) thigh swing amplitude
  kneeBendMax: 0.8,
  // radians (~45°) maximum forward knee bend
  armSwingRatio: 0.6,
  // arm swing as fraction of leg amplitude
  forearmLag: 0.3,
  // phase offset for forearm (secondary motion)
  bodyBounceHeight: 0.03,
  // world units of vertical bounce per step
  forwardLean: 0.09,
  // radians (~5°) lean into movement
  forwardLeanSpeed: 8,
  // how fast lean blends in/out (per second)
  // Idle
  breathRate: 2,
  // Hz
  breathAmplitude: 0.02,
  // world units
  weightShiftRate: 0.8,
  // Hz
  weightShiftAngle: 0.04,
  // radians (~2.3°)
  headDriftRate: 0.5,
  // Hz
  headDriftAngle: 0.02,
  // radians (~1°)
  idleArmDroop: 0.15,
  // radians — slight outward droop
  // Dash squash/stretch
  squashScaleY: 0.75,
  squashScaleXZ: 1.15,
  stretchScaleY: 1.12,
  stretchScaleXZ: 0.92,
  dashLeanAngle: 0.26,
  // radians (~15°) aggressive forward lean
  dashArmSweep: -0.8,
  // radians — arms swept back
  dashLegLunge: 0.7,
  // radians — front leg forward
  dashLegTrail: -0.5,
  // radians — back leg behind
  // Transitions (ms)
  idleToRunBlend: 80,
  runToIdleBlend: 120,
  endLagToNormalBlend: 60,
  // Upper/lower body
  hipTurnSpeed: 15
  // radians/sec — how fast legs reorient to movement direction
};
function createAnimatorState() {
  return {
    currentState: "idle",
    prevState: "idle",
    stateTimer: 0,
    blendTimer: 0,
    blendDuration: 0,
    runCyclePhase: 0,
    moveDir: 0,
    moveDirSmoothed: 0,
    currentLean: 0,
    dashDir: 0,
    dashT: 0,
    time: 0
  };
}
function resetAnimatorState(anim) {
  anim.currentState = "idle";
  anim.prevState = "idle";
  anim.stateTimer = 0;
  anim.blendTimer = 0;
  anim.blendDuration = 0;
  anim.runCyclePhase = 0;
  anim.currentLean = 0;
  anim.dashT = 0;
  anim.time = 0;
}
function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function easeOutQuad2(t) {
  return 1 - (1 - t) * (1 - t);
}
function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
function lerpAngle(from, to, t) {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}
function updateAnimation(joints, anim, dt, inputState2, aimAngle, isDashing2, isInEndLag, dashProgress, isSwinging = false, swingProgress = 0) {
  anim.time += dt;
  const isMoving = Math.abs(inputState2.moveX) > 0.01 || Math.abs(inputState2.moveZ) > 0.01;
  const prevState = anim.currentState;
  if (isDashing2) {
    if (anim.currentState !== "dash") {
      transitionTo(anim, "dash", 0);
    }
    anim.dashT = dashProgress;
  } else if (isInEndLag) {
    if (anim.currentState !== "endLag") {
      transitionTo(anim, "endLag", 0);
    }
  } else if (isSwinging) {
    if (anim.currentState !== "swing") {
      transitionTo(anim, "swing", 0);
    }
    anim.dashT = swingProgress;
  } else if (isMoving) {
    if (anim.currentState !== "run") {
      const blend = anim.currentState === "endLag" || anim.currentState === "swing" ? C.endLagToNormalBlend : C.idleToRunBlend;
      transitionTo(anim, "run", blend / 1e3);
    }
  } else {
    if (anim.currentState !== "idle") {
      const blend = anim.currentState === "endLag" || anim.currentState === "swing" ? C.endLagToNormalBlend : C.runToIdleBlend;
      transitionTo(anim, "idle", blend / 1e3);
    }
  }
  anim.stateTimer += dt;
  if (anim.blendTimer > 0) {
    anim.blendTimer = Math.max(0, anim.blendTimer - dt);
  }
  if (isMoving) {
    anim.moveDir = Math.atan2(-inputState2.moveX, -inputState2.moveZ);
  }
  anim.moveDirSmoothed = lerpAngle(
    anim.moveDirSmoothed,
    anim.moveDir,
    Math.min(1, C.hipTurnSpeed * dt)
  );
  resetJointsToNeutral(joints);
  switch (anim.currentState) {
    case "idle":
      applyIdle(joints, anim);
      break;
    case "run":
      applyRun(joints, anim, dt, inputState2);
      break;
    case "dash":
      applyDash(joints, anim);
      break;
    case "endLag":
      applyEndLag(joints, anim);
      break;
    case "swing":
      applySwing(joints, anim);
      break;
  }
  const hipOffset = anim.moveDirSmoothed - aimAngle;
  joints.hip.rotation.y = hipOffset;
  const targetLean = anim.currentState === "run" ? C.forwardLean : 0;
  anim.currentLean += (targetLean - anim.currentLean) * Math.min(1, C.forwardLeanSpeed * dt);
  joints.rigRoot.rotation.x = anim.currentLean;
  if (anim.currentState === "dash") {
    joints.rigRoot.rotation.x = getDashLean(anim.dashT);
  }
}
function transitionTo(anim, newState, blendDuration) {
  anim.prevState = anim.currentState;
  anim.currentState = newState;
  anim.stateTimer = 0;
  anim.blendDuration = blendDuration;
  anim.blendTimer = blendDuration;
  if (newState === "dash") {
    anim.dashDir = anim.moveDir;
    anim.dashT = 0;
  }
}
function resetJointsToNeutral(joints) {
  joints.rigRoot.rotation.set(0, 0, 0);
  joints.rigRoot.scale.set(1, 1, 1);
  joints.torso.rotation.set(0, 0, 0);
  joints.head.rotation.set(0, 0, 0);
  joints.upperArmL.rotation.set(0, 0, 0);
  joints.lowerArmL.rotation.set(0, 0, 0);
  joints.upperArmR.rotation.set(0, 0, 0);
  joints.lowerArmR.rotation.set(0, 0, 0);
  joints.thighL.rotation.set(0, 0, 0);
  joints.shinL.rotation.set(0, 0, 0);
  joints.thighR.rotation.set(0, 0, 0);
  joints.shinR.rotation.set(0, 0, 0);
  joints.hip.rotation.x = 0;
  joints.hip.rotation.z = 0;
  joints.hip.position.y = 0.5;
  joints.torso.position.y = 0.22;
}
function applyIdle(joints, anim) {
  const t = anim.time;
  joints.torso.position.y += Math.sin(t * C.breathRate * Math.PI * 2) * C.breathAmplitude;
  joints.hip.rotation.z = Math.sin(t * C.weightShiftRate * Math.PI * 2) * C.weightShiftAngle;
  joints.head.rotation.y = Math.sin(t * C.headDriftRate * Math.PI * 2) * C.headDriftAngle;
  joints.upperArmL.rotation.z = C.idleArmDroop;
  joints.upperArmR.rotation.z = -C.idleArmDroop;
  joints.lowerArmL.rotation.x = -0.1;
  joints.lowerArmR.rotation.x = -0.1;
}
function applyRun(joints, anim, dt, input) {
  const speed = Math.sqrt(input.moveX * input.moveX + input.moveZ * input.moveZ);
  const distThisFrame = speed * 5 * dt;
  anim.runCyclePhase = (anim.runCyclePhase + distThisFrame * C.runCycleRate) % 1;
  const phase = anim.runCyclePhase * Math.PI * 2;
  const thighSwing = Math.sin(phase) * C.strideAngle;
  joints.thighL.rotation.x = thighSwing;
  joints.thighR.rotation.x = -thighSwing;
  const kneeL = Math.max(0, Math.sin(phase - 0.6)) * C.kneeBendMax;
  const kneeR = Math.max(0, Math.sin(phase - 0.6 + Math.PI)) * C.kneeBendMax;
  joints.shinL.rotation.x = -kneeL;
  joints.shinR.rotation.x = -kneeR;
  const armSwing = Math.sin(phase) * C.strideAngle * C.armSwingRatio;
  joints.upperArmL.rotation.x = -armSwing;
  joints.upperArmR.rotation.x = armSwing;
  const forearmSwing = Math.sin(phase - C.forearmLag) * C.strideAngle * C.armSwingRatio * 0.5;
  joints.lowerArmL.rotation.x = -Math.abs(forearmSwing) - 0.15;
  joints.lowerArmR.rotation.x = -Math.abs(forearmSwing) - 0.15;
  const bounce = Math.abs(Math.sin(phase * 2)) * C.bodyBounceHeight;
  joints.hip.position.y = 0.5 + bounce;
  joints.torso.rotation.y = Math.sin(phase) * 0.06;
}
function applyDash(joints, anim) {
  const t = anim.dashT;
  if (t < 0.15) {
    const subT = t / 0.15;
    const ease = easeOutQuad2(subT);
    joints.rigRoot.scale.set(
      1 + (C.squashScaleXZ - 1) * ease,
      1 + (C.squashScaleY - 1) * ease,
      1 + (C.squashScaleXZ - 1) * ease
    );
    joints.thighL.rotation.x = C.dashLegLunge * ease;
    joints.thighR.rotation.x = C.dashLegTrail * ease;
    joints.shinL.rotation.x = -0.3 * ease;
    joints.shinR.rotation.x = -0.4 * ease;
    joints.upperArmL.rotation.x = C.dashArmSweep * ease * 0.5;
    joints.upperArmR.rotation.x = C.dashArmSweep * ease * 0.5;
  } else if (t < 0.85) {
    const subT = (t - 0.15) / 0.7;
    const ease = easeOutQuad2(subT);
    joints.rigRoot.scale.set(
      C.stretchScaleXZ,
      C.stretchScaleY,
      C.stretchScaleXZ
    );
    joints.thighL.rotation.x = 0.4;
    joints.thighR.rotation.x = -0.3;
    joints.shinL.rotation.x = -0.5;
    joints.shinR.rotation.x = -0.2;
    joints.upperArmL.rotation.x = C.dashArmSweep;
    joints.upperArmR.rotation.x = C.dashArmSweep;
    joints.lowerArmL.rotation.x = C.dashArmSweep * 0.4;
    joints.lowerArmR.rotation.x = C.dashArmSweep * 0.4;
  } else {
    const subT = (t - 0.85) / 0.15;
    const ease = easeOutBack(Math.min(subT, 1));
    const yScale = C.stretchScaleY + (1 - C.stretchScaleY) * ease;
    const xzScale = C.stretchScaleXZ + (1 - C.stretchScaleXZ) * ease;
    joints.rigRoot.scale.set(xzScale, yScale, xzScale);
    const legSettle = 1 - ease;
    joints.thighL.rotation.x = 0.3 * legSettle;
    joints.thighR.rotation.x = -0.2 * legSettle;
    joints.shinL.rotation.x = -0.3 * legSettle;
    joints.shinR.rotation.x = -0.1 * legSettle;
    joints.upperArmL.rotation.x = C.dashArmSweep * (1 - ease);
    joints.upperArmR.rotation.x = C.dashArmSweep * (1 - ease);
  }
}
function getDashLean(t) {
  if (t < 0.15) {
    return C.dashLeanAngle * easeOutQuad2(t / 0.15);
  } else if (t < 0.85) {
    return C.dashLeanAngle;
  } else {
    const subT = (t - 0.85) / 0.15;
    return C.dashLeanAngle * (1 - easeOutQuad2(subT));
  }
}
function applyEndLag(joints, anim) {
  const t = Math.min(anim.stateTimer / 0.05, 1);
  const ease = easeOutQuad2(t);
  const scaleY = 1 + (1.05 - 1) * (1 - ease);
  joints.rigRoot.scale.set(1, scaleY, 1);
  joints.rigRoot.rotation.x = -0.06 * (1 - ease);
  const legSpread = 0.25 * (1 - ease);
  joints.thighL.rotation.x = legSpread;
  joints.thighR.rotation.x = -legSpread;
  joints.shinL.rotation.x = -legSpread * 0.5;
  joints.shinR.rotation.x = -legSpread * 0.5;
  joints.upperArmL.rotation.x = -0.2 * (1 - ease);
  joints.upperArmR.rotation.x = -0.2 * (1 - ease);
}
function applySwing(joints, anim) {
  const t = clamp(anim.dashT, 0, 1);
  if (t < 0.3) {
    const subT = t / 0.3;
    const ease = easeOutQuad2(subT);
    joints.upperArmR.rotation.x = 0.4 * ease;
    joints.upperArmR.rotation.z = -0.3 * ease;
    joints.lowerArmR.rotation.x = -0.6 * ease;
    joints.upperArmL.rotation.x = -0.2 * ease;
    joints.lowerArmL.rotation.x = -0.3 * ease;
    joints.torso.rotation.y = -0.25 * ease;
    joints.rigRoot.rotation.x = 0.06 * ease;
  } else {
    const subT = (t - 0.3) / 0.7;
    const ease = easeOutQuad2(subT);
    joints.upperArmR.rotation.x = 0.4 + (-1 - 0.4) * ease;
    joints.upperArmR.rotation.z = -0.3 + (0.5 + 0.3) * ease;
    joints.lowerArmR.rotation.x = -0.6 + (0.6 - 0.2) * ease;
    joints.upperArmL.rotation.x = -0.2 + (0.3 + 0.2) * ease;
    joints.lowerArmL.rotation.x = -0.3 + (-0.2 + 0.3) * ease;
    joints.torso.rotation.y = -0.25 + (0.45 + 0.25) * ease;
    const leanCurve = subT < 0.5 ? easeOutQuad2(subT * 2) : 1 - easeOutQuad2((subT - 0.5) * 2);
    joints.rigRoot.rotation.x = 0.06 + 0.08 * leanCurve;
    joints.thighL.rotation.x = 0.2 * ease;
    joints.thighR.rotation.x = -0.15 * ease;
  }
}

// src/entities/player.ts
var playerGroup;
var aimIndicator;
var rig;
var animState;
var playerPos = new THREE.Vector3(0, 0, 0);
var meleeSwinging = false;
var meleeCooldownTimer = 0;
var meleeSwingTimer = 0;
var MELEE_SWING_DURATION = 200;
var meleeHitEnemies = /* @__PURE__ */ new Set();
var meleeSwingDir = 0;
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
var DEFAULT_EMISSIVE = 2271846;
var DEFAULT_EMISSIVE_INTENSITY = 0.4;
function restoreDefaultEmissive() {
  if (!rig) return;
  for (const mat of rig.materials) {
    mat.emissive.setHex(DEFAULT_EMISSIVE);
    mat.emissiveIntensity = DEFAULT_EMISSIVE_INTENSITY;
  }
}
function createPlayer(scene2) {
  playerGroup = new THREE.Group();
  rig = createPlayerRig(playerGroup);
  animState = createAnimatorState();
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
    aimAtCursor(inputState2);
    updateAnimation(
      rig.joints,
      animState,
      dt,
      { moveX: 0, moveZ: 0 },
      playerGroup.rotation.y,
      false,
      true,
      0
    );
    updateAfterimages(dt);
    return;
  }
  if (isDashing) {
    updateDash(dt, gameState2);
    playerGroup.position.copy(playerPos);
    aimAtCursor(inputState2);
    updateAnimation(
      rig.joints,
      animState,
      dt,
      { moveX: inputState2.moveX, moveZ: inputState2.moveZ },
      playerGroup.rotation.y,
      true,
      false,
      Math.min(dashTimer / dashDuration, 1)
    );
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
  }
  const clampX = ARENA_HALF_X - 0.5;
  const clampZ = ARENA_HALF_Z - 0.5;
  playerPos.x = Math.max(-clampX, Math.min(clampX, playerPos.x));
  playerPos.z = Math.max(-clampZ, Math.min(clampZ, playerPos.z));
  playerGroup.position.copy(playerPos);
  aimAtCursor(inputState2);
  updateAnimation(
    rig.joints,
    animState,
    dt,
    { moveX: inputState2.moveX, moveZ: inputState2.moveZ },
    playerGroup.rotation.y,
    isDashing,
    endLagTimer > 0,
    isDashing ? Math.min(dashTimer / dashDuration, 1) : 0,
    meleeSwinging,
    meleeSwinging ? meleeSwingTimer / MELEE_SWING_DURATION : 0
  );
  if (meleeCooldownTimer > 0) {
    meleeCooldownTimer -= dt * 1e3;
  }
  if (meleeSwinging) {
    meleeSwingTimer += dt * 1e3;
    if (meleeSwingTimer >= MELEE_SWING_DURATION) {
      meleeSwinging = false;
      meleeSwingTimer = 0;
    }
  }
  if (inputState2.attack && meleeCooldownTimer <= 0 && !isDashing && !isCharging) {
    const enemies = gameState2.enemies;
    if (enemies) {
      let bestDist = MELEE.autoTargetRange * MELEE.autoTargetRange;
      let bestEnemy = null;
      const aimAngle = playerGroup.rotation.y;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.health <= 0 || e.fellInPit) continue;
        const dx = e.pos.x - playerPos.x;
        const dz = e.pos.z - playerPos.z;
        const distSq = dx * dx + dz * dz;
        if (distSq > bestDist) continue;
        const angleToEnemy = Math.atan2(-dx, -dz);
        let angleDiff = angleToEnemy - aimAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        if (Math.abs(angleDiff) <= MELEE.autoTargetArc / 2) {
          bestDist = distSq;
          bestEnemy = e;
        }
      }
      if (bestEnemy) {
        const dx = bestEnemy.pos.x - playerPos.x;
        const dz = bestEnemy.pos.z - playerPos.z;
        playerGroup.rotation.y = Math.atan2(-dx, -dz);
      }
    }
    meleeSwinging = true;
    meleeSwingTimer = 0;
    meleeCooldownTimer = MELEE.cooldown;
    meleeHitEnemies.clear();
    meleeSwingDir = playerGroup.rotation.y;
    emit({
      type: "meleeSwing",
      position: { x: playerPos.x, z: playerPos.z },
      direction: { x: -Math.sin(meleeSwingDir), z: -Math.cos(meleeSwingDir) }
    });
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
  emit({ type: "playerDash", direction: { x: dashDir.x, z: dashDir.z }, position: { x: playerPos.x, z: playerPos.z } });
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
  const dashClampX = ARENA_HALF_X - 0.5;
  const dashClampZ = ARENA_HALF_Z - 0.5;
  playerPos.x = Math.max(-dashClampX, Math.min(dashClampX, playerPos.x));
  playerPos.z = Math.max(-dashClampZ, Math.min(dashClampZ, playerPos.z));
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
    emit({ type: "playerDashEnd" });
  }
}
function spawnAfterimage(cfg) {
  const scene2 = getScene();
  const ghost = new THREE.Group();
  playerGroup.updateMatrixWorld(true);
  const geos = getGhostGeometries();
  const ghostMat = new THREE.MeshBasicMaterial({
    color: cfg.ghostColor,
    transparent: true,
    opacity: 0.5
  });
  const torsoWorld = new THREE.Vector3();
  rig.joints.torso.getWorldPosition(torsoWorld);
  const ghostTorso = new THREE.Mesh(geos.torso, ghostMat.clone());
  ghostTorso.position.copy(torsoWorld).sub(playerPos);
  ghost.add(ghostTorso);
  const headWorld = new THREE.Vector3();
  rig.joints.head.getWorldPosition(headWorld);
  const ghostHead = new THREE.Mesh(geos.head, ghostMat.clone());
  ghostHead.position.copy(headWorld).sub(playerPos);
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
  for (const mat of rig.materials) {
    mat.emissive.setHex(4521898);
    mat.emissiveIntensity = 0.6;
  }
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
  for (const mat of rig.materials) {
    mat.emissiveIntensity = 0.6 + chargeT * 0.4;
  }
  if (chargeTimer > 100 && !inputState2.ultimateHeld) {
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
  restoreDefaultEmissive();
  screenShake(2 + chargeT * 3, 120);
  emit({ type: "chargeFired", chargeT, direction: { x: dirX, z: dirZ }, position: { x: playerPos.x, z: playerPos.z } });
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
function isMeleeSwinging() {
  return meleeSwinging;
}
function getMeleeSwingDir() {
  return meleeSwingDir;
}
function getMeleeHitEnemies() {
  return meleeHitEnemies;
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
  meleeSwinging = false;
  meleeCooldownTimer = 0;
  meleeSwingTimer = 0;
  meleeHitEnemies.clear();
  isCharging = false;
  chargeTimer = 0;
  pushEvent = null;
  removeChargeTelegraph();
  restoreDefaultEmissive();
  resetAnimatorState(animState);
  const scene2 = getScene();
  for (const ai of afterimages) {
    scene2.remove(ai.mesh);
  }
  afterimages.length = 0;
}
function setPlayerPosition(x, z) {
  playerPos.set(x, 0, z);
  playerGroup.position.set(x, 0, z);
}

// src/engine/input.ts
var keys = {};
var inputState = {
  moveX: 0,
  moveZ: 0,
  aimWorldPos: { x: 0, y: 0, z: 0 },
  mouseNDC: { x: 0, y: 0 },
  dash: false,
  attack: false,
  ultimate: false,
  ultimateHeld: false,
  interact: false,
  toggleEditor: false,
  bulletTime: false,
  bendMode: false
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
    if (e.code === "KeyF" || e.code === "Enter") inputState.interact = true;
    if (e.code === "Backquote") inputState.toggleEditor = true;
    if (e.code === "KeyQ") inputState.bendMode = true;
  });
  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });
  window.addEventListener("mousemove", (e) => {
    inputState.mouseNDC.x = e.clientX / window.innerWidth * 2 - 1;
    inputState.mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    usingGamepad = false;
  });
  window.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      inputState.attack = true;
      usingGamepad = false;
    }
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
  const interactBtn = buttons[3] && buttons[3].pressed;
  if (interactBtn && !prevGamepadButtons.interact) inputState.interact = true;
  prevGamepadButtons.interact = !!interactBtn;
  const btBtn = buttons[6] && buttons[6].pressed;
  if (btBtn && !prevGamepadButtons.bulletTime) inputState.bulletTime = true;
  prevGamepadButtons.bulletTime = !!btBtn;
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
  inputState.attack = false;
  inputState.ultimate = false;
  inputState.interact = false;
  inputState.toggleEditor = false;
  inputState.bulletTime = false;
  inputState.bendMode = false;
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

// src/config/rooms.ts
function pack(enemies, zone = "ahead") {
  return { enemies, spawnZone: zone };
}
function goblins(n) {
  return Array.from({ length: n }, () => ({ type: "goblin" }));
}
function archers(n) {
  return Array.from({ length: n }, () => ({ type: "skeletonArcher" }));
}
function imps(n) {
  return Array.from({ length: n }, () => ({ type: "iceMortarImp" }));
}
var ROOMS = [
  // ══════════════════════════════════════════════════════════════════════
  // Room 1: "The Approach" — goblins only, teach melee + dash
  // Player enters at +Z (bottom-left in iso), progresses toward -Z (top-right)
  // ══════════════════════════════════════════════════════════════════════
  {
    name: "The Approach",
    arenaHalfX: 10,
    arenaHalfZ: 22,
    obstacles: [
      { x: -4, z: 5, w: 1.5, h: 2, d: 1.5 },
      // pillar left near entrance
      { x: 4, z: -5, w: 1.5, h: 2, d: 1.5, destructible: true, health: 50, maxHealth: 50, material: "stone" },
      // destructible pillar right mid
      { x: 0, z: -12, w: 3, h: 1, d: 1 }
      // low wall far
    ],
    pits: [
      { x: 5, z: -8, w: 3, d: 3 }
      // small pit mid-right (teaches force push)
    ],
    physicsObjects: [
      { meshType: "rock", material: "stone", x: -2, z: -2, mass: 2, health: 9999, radius: 0.8 },
      { meshType: "barrel", material: "wood", x: 3, z: -6, mass: 0.5, health: 150, radius: 0.5, scale: 0.8 },
      { meshType: "crate", material: "wood", x: -5, z: -8, mass: 0.8, health: 150, radius: 0.6 },
      { meshType: "barrel", material: "metal", x: 6, z: 2, mass: 1, health: 200, radius: 0.5 }
    ],
    spawnBudget: {
      maxConcurrent: 4,
      telegraphDuration: 1500,
      packs: [
        // Start light: 2 goblins ahead
        pack(goblins(2), "ahead"),
        pack(goblins(2), "ahead"),
        // Ramp up: 3 goblins, mix positions
        pack(goblins(3), "ahead"),
        pack(goblins(3), "sides"),
        // One final push from far end
        pack(goblins(2), "far")
      ]
    },
    playerStart: { x: 0, z: 18 }
  },
  // ══════════════════════════════════════════════════════════════════════
  // Room 2: "The Crossfire" — goblins + archers, introduce ranged pressure
  // ══════════════════════════════════════════════════════════════════════
  {
    name: "The Crossfire",
    arenaHalfX: 12,
    arenaHalfZ: 24,
    obstacles: [
      { x: -6, z: 0, w: 2, h: 2, d: 2 },
      // cover pillar left
      { x: 6, z: 0, w: 2, h: 2, d: 2 },
      // cover pillar right
      { x: 0, z: -10, w: 4, h: 1.5, d: 1 },
      // mid wall (toward far/exit end)
      { x: -3, z: 10, w: 1.5, h: 2, d: 1.5 }
      // pillar near entrance
    ],
    pits: [
      { x: -8, z: -8, w: 3, d: 4 },
      // pit left mid (toward exit)
      { x: 8, z: 5, w: 3, d: 3 }
      // pit right near entrance
    ],
    spawnBudget: {
      maxConcurrent: 5,
      telegraphDuration: 1500,
      packs: [
        // Intro: goblins rush
        pack(goblins(2), "ahead"),
        // Archer appears far back
        pack([...archers(1), ...goblins(1)], "far"),
        // More melee pressure
        pack(goblins(3), "ahead"),
        // Flanking archers
        pack(archers(2), "sides"),
        // Mixed push
        pack([...goblins(2), ...archers(1)], "ahead"),
        // Final rush
        pack(goblins(3), "sides")
      ]
    },
    physicsObjects: [
      { meshType: "barrel", material: "wood", x: -3, z: 5, mass: 0.5, health: 150, radius: 0.5 },
      { meshType: "rock", material: "stone", x: 7, z: -3, mass: 1.5, health: 9999, radius: 0.7 },
      { meshType: "crate", material: "metal", x: -7, z: -5, mass: 1.2, health: 200, radius: 0.6 }
    ],
    playerStart: { x: 0, z: 20 }
  },
  // ══════════════════════════════════════════════════════════════════════
  // Room 3: "The Crucible" — full mix with imps, area denial
  // ══════════════════════════════════════════════════════════════════════
  {
    name: "The Crucible",
    arenaHalfX: 13,
    arenaHalfZ: 25,
    obstacles: [
      { x: -5, z: 8, w: 2, h: 2, d: 2 },
      // pillar near entrance left
      { x: 5, z: 8, w: 2, h: 2, d: 2 },
      // pillar near entrance right
      { x: 0, z: -5, w: 1.5, h: 2.5, d: 1.5 },
      // tall center pillar
      { x: -8, z: -10, w: 3, h: 1, d: 1 },
      // low wall far left
      { x: 8, z: -10, w: 3, h: 1, d: 1 }
      // low wall far right
    ],
    pits: [
      { x: 0, z: 3, w: 5, d: 3 },
      // central pit (forces flanking)
      { x: -9, z: -15, w: 3, d: 4 },
      // far left pit
      { x: 9, z: -15, w: 3, d: 4 }
      // far right pit
    ],
    spawnBudget: {
      maxConcurrent: 6,
      telegraphDuration: 1500,
      packs: [
        // Start with melee rush
        pack(goblins(3), "ahead"),
        // Introduce ranged
        pack([...archers(1), ...goblins(1)], "far"),
        // First imp — area denial begins
        pack([...imps(1), ...goblins(1)], "sides"),
        // Melee wave to push player into imp zones
        pack(goblins(3), "ahead"),
        // More imps + archer
        pack([...imps(1), ...archers(1)], "far"),
        // Heavy mixed final push
        pack([...goblins(2), ...imps(1)], "ahead"),
        pack([...archers(1), ...goblins(1)], "sides")
      ]
    },
    physicsObjects: [
      { meshType: "pillar", material: "stone", x: -3, z: 0, mass: 3, health: 9999, radius: 0.5 },
      { meshType: "barrel", material: "wood", x: 6, z: -8, mass: 0.5, health: 150, radius: 0.5, scale: 0.9 },
      { meshType: "crate", material: "wood", x: -6, z: -12, mass: 0.8, health: 150, radius: 0.6 },
      { meshType: "rock", material: "ice", x: 3, z: 12, mass: 1, health: 100, radius: 0.6 }
    ],
    playerStart: { x: 0, z: 21 }
  },
  // ══════════════════════════════════════════════════════════════════════
  // Room 4: "The Respite" — rest room, heal to full
  // ══════════════════════════════════════════════════════════════════════
  {
    name: "The Respite",
    arenaHalfX: 8,
    arenaHalfZ: 12,
    obstacles: [],
    pits: [],
    spawnBudget: {
      maxConcurrent: 0,
      telegraphDuration: 0,
      packs: []
    },
    playerStart: { x: 0, z: 8 },
    isRestRoom: true
  },
  // ══════════════════════════════════════════════════════════════════════
  // Room 5: "The Throne" — victory room (boss designed separately)
  // ══════════════════════════════════════════════════════════════════════
  {
    name: "The Throne",
    arenaHalfX: 10,
    arenaHalfZ: 10,
    obstacles: [],
    pits: [],
    spawnBudget: {
      maxConcurrent: 0,
      telegraphDuration: 0,
      packs: []
    },
    playerStart: { x: 0, z: 6 },
    isVictoryRoom: true
  }
];

// src/config/spawn.ts
var SPAWN_CONFIG = {
  telegraphDuration: 1500,
  // ms — how long spawn warnings show before enemies appear
  spawnCooldown: 500,
  // ms — minimum delay between consecutive pack dispatches
  maxConcurrentMult: 1,
  // multiplier on per-room maxConcurrent
  spawnAheadMin: 8,
  // minimum distance ahead of player to spawn enemies (Z units)
  spawnAheadMax: 15
  // maximum distance ahead of player to spawn enemies (Z units)
};

// src/config/physics.ts
var PHYSICS = {
  // Knockback velocity
  friction: 25,
  // deceleration rate (units/s²) — higher = snappier stop
  minVelocity: 0.1,
  // below this speed, zero out velocity
  pushInstantRatio: 0,
  // fraction of knockback as instant position offset (0 = pure velocity)
  // Wall slam
  wallSlamMinSpeed: 3,
  // minimum impact speed for wall damage
  wallSlamDamage: 8,
  // damage per unit of impact speed above threshold
  wallSlamStun: 400,
  // ms stun on wall slam
  wallSlamBounce: 0.4,
  // velocity reflection coefficient (0 = dead stop, 1 = perfect bounce)
  wallSlamShake: 3,
  // screen shake intensity on wall slam
  // Force push wave occlusion
  pushWaveBlockRadius: 0.8,
  // lateral distance for one enemy to block another from push wave
  // Enemy-enemy collision
  enemyBounce: 0.4,
  // enemy-enemy restitution coefficient
  impactMinSpeed: 2,
  // minimum relative speed for collision damage
  impactDamage: 5,
  // damage per unit of relative speed above threshold
  impactStun: 300,
  // ms stun when hit by another enemy
  // Physics objects
  objectFriction: 25,
  // deceleration for physics objects
  objectWallSlamMinSpeed: 3,
  // min impact speed for wall slam damage
  objectWallSlamDamage: 8,
  // damage per unit of speed above threshold
  objectWallSlamStun: 0,
  // objects don't stun (no AI)
  objectWallSlamBounce: 0.4,
  // velocity reflection coefficient
  objectWallSlamShake: 2,
  // screen shake intensity
  objectImpactMinSpeed: 2,
  // min relative speed for impact damage
  objectImpactDamage: 5
  // damage per unit of relative speed above threshold
};

// src/engine/meleemath.ts
function isInMeleeArc(playerX, playerZ, swingAngle, targetX, targetZ, range, arc) {
  const dx = targetX - playerX;
  const dz = targetZ - playerZ;
  const distSq = dx * dx + dz * dz;
  if (distSq > range * range) return false;
  if (distSq < 1e-3) return true;
  const angleToTarget = Math.atan2(-dx, -dz);
  let angleDiff = angleToTarget - swingAngle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  return Math.abs(angleDiff) <= arc / 2;
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
var _ghostHeadGeo2 = null;
function createGhostMesh(x, z, radius, height, color) {
  if (!_ghostBodyGeo) {
    _ghostBodyGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
    _ghostHeadGeo2 = new THREE.SphereGeometry(1, 6, 4);
  }
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 });
  const body = new THREE.Mesh(_ghostBodyGeo, bodyMat);
  const bodyH = height * 0.6;
  body.scale.set(radius, bodyH, radius);
  body.position.y = height * 0.3;
  group.add(body);
  const headMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 });
  const headR = radius * 0.7;
  const head = new THREE.Mesh(_ghostHeadGeo2, headMat);
  head.scale.set(headR, headR, headR);
  head.position.y = height * 0.75;
  group.add(head);
  group.position.set(x, 0, z);
  getScene().add(group);
  return group;
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
function resolveTerrainCollisionEx(x, z, radius) {
  const bounds = getBounds();
  let rx = x, rz = z;
  let hitWall = false;
  let totalNX = 0, totalNZ = 0;
  for (const box of bounds) {
    const push = circleVsAABB(rx, rz, radius, box);
    if (push) {
      rx += push.x;
      rz += push.z;
      hitWall = true;
      const len = Math.sqrt(push.x * push.x + push.z * push.z);
      if (len > 1e-3) {
        totalNX += push.x / len;
        totalNZ += push.z / len;
      }
    }
  }
  const nLen = Math.sqrt(totalNX * totalNX + totalNZ * totalNZ);
  if (nLen > 1e-3) {
    totalNX /= nLen;
    totalNZ /= nLen;
  }
  return { x: rx, z: rz, hitWall, normalX: totalNX, normalZ: totalNZ };
}
function applyVelocities(dt, gameState2) {
  for (const enemy of gameState2.enemies) {
    if (enemy.health <= 0) continue;
    if (enemy.isLeaping) continue;
    const vel = enemy.vel;
    if (!vel) continue;
    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    if (speed < PHYSICS.minVelocity) {
      vel.x = 0;
      vel.z = 0;
      continue;
    }
    const moveDist = speed * dt;
    const enemyRadius = enemy.config.size.radius;
    const moveSteps = Math.ceil(moveDist / enemyRadius);
    const subDt = dt / Math.max(moveSteps, 1);
    let result = { x: enemy.pos.x, z: enemy.pos.z, hitWall: false, normalX: 0, normalZ: 0 };
    let fellInPit = false;
    for (let s = 0; s < moveSteps; s++) {
      enemy.pos.x += vel.x * subDt;
      enemy.pos.z += vel.z * subDt;
      if (pointInPit(enemy.pos.x, enemy.pos.z)) {
        fellInPit = true;
        break;
      }
      result = resolveTerrainCollisionEx(enemy.pos.x, enemy.pos.z, enemyRadius);
      enemy.pos.x = result.x;
      enemy.pos.z = result.z;
      if (result.hitWall) break;
    }
    enemy.mesh.position.copy(enemy.pos);
    if (fellInPit) {
      spawnPitFallGhost(enemy);
      emit({ type: "pitFall", position: { x: enemy.pos.x, z: enemy.pos.z }, isPlayer: false });
      createAoeRing(enemy.pos.x, enemy.pos.z, 2.5, 500, 8930559);
      enemy.health = 0;
      enemy.fellInPit = true;
      enemy.stunTimer = 9999;
      spawnDamageNumber(enemy.pos.x, enemy.pos.z, "FELL!", "#8844ff");
      screenShake(4, 200);
      vel.x = 0;
      vel.z = 0;
      continue;
    }
    if (result.hitWall && speed > PHYSICS.wallSlamMinSpeed) {
      const slamDamage = Math.round((speed - PHYSICS.wallSlamMinSpeed) * PHYSICS.wallSlamDamage);
      applyDamageToEnemy(enemy, slamDamage, gameState2);
      stunEnemy(enemy, PHYSICS.wallSlamStun);
      emit({ type: "wallSlam", enemy, speed, damage: slamDamage, position: { x: enemy.pos.x, z: enemy.pos.z } });
      spawnDamageNumber(enemy.pos.x, enemy.pos.z, slamDamage, "#ff8844");
      screenShake(PHYSICS.wallSlamShake, 120);
      enemy.flashTimer = 120;
      if (enemy.bodyMesh) enemy.bodyMesh.material.emissive.setHex(16746564);
      if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(16746564);
      createAoeRing(enemy.pos.x, enemy.pos.z, 1.5, 300, 16746564);
      const dot = vel.x * result.normalX + vel.z * result.normalZ;
      vel.x = (vel.x - 2 * dot * result.normalX) * PHYSICS.wallSlamBounce;
      vel.z = (vel.z - 2 * dot * result.normalZ) * PHYSICS.wallSlamBounce;
    }
    const newSpeed = speed - PHYSICS.friction * dt;
    if (newSpeed <= PHYSICS.minVelocity) {
      vel.x = 0;
      vel.z = 0;
    } else {
      const scale = newSpeed / speed;
      vel.x *= scale;
      vel.z *= scale;
    }
  }
}
function applyObjectVelocities(dt, gameState2) {
  for (const obj of gameState2.physicsObjects) {
    if (obj.destroyed) continue;
    const vel = obj.vel;
    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    if (speed < PHYSICS.minVelocity) {
      vel.x = 0;
      vel.z = 0;
      continue;
    }
    const moveDist = speed * dt;
    const moveSteps = Math.ceil(moveDist / obj.radius);
    const subDt = dt / Math.max(moveSteps, 1);
    let result = { x: obj.pos.x, z: obj.pos.z, hitWall: false, normalX: 0, normalZ: 0 };
    let fellInPit = false;
    for (let s = 0; s < moveSteps; s++) {
      obj.pos.x += vel.x * subDt;
      obj.pos.z += vel.z * subDt;
      if (pointInPit(obj.pos.x, obj.pos.z)) {
        fellInPit = true;
        break;
      }
      result = resolveTerrainCollisionEx(obj.pos.x, obj.pos.z, obj.radius);
      obj.pos.x = result.x;
      obj.pos.z = result.z;
      if (result.hitWall) {
        const dot = vel.x * result.normalX + vel.z * result.normalZ;
        if (dot < 0) {
          vel.x -= dot * result.normalX;
          vel.z -= dot * result.normalZ;
        }
        const slideSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
        if (slideSpeed < PHYSICS.minVelocity) break;
      }
      let hitObject = false;
      for (const other of gameState2.physicsObjects) {
        if (other === obj || other.destroyed) continue;
        const odx = obj.pos.x - other.pos.x;
        const odz = obj.pos.z - other.pos.z;
        const oDistSq = odx * odx + odz * odz;
        const oMinDist = obj.radius + other.radius;
        if (oDistSq < oMinDist * oMinDist && oDistSq > 1e-4) {
          const oDist = Math.sqrt(oDistSq);
          const oOverlap = oMinDist - oDist;
          const onx = odx / oDist;
          const onz = odz / oDist;
          obj.pos.x += onx * oOverlap;
          obj.pos.z += onz * oOverlap;
          const vDot = vel.x * -onx + vel.z * -onz;
          if (vDot > 0) {
            vel.x += vDot * onx;
            vel.z += vDot * onz;
          }
          hitObject = true;
          break;
        }
      }
      if (hitObject) break;
    }
    if (obj.mesh) {
      obj.mesh.position.set(obj.pos.x, 0, obj.pos.z);
    }
    if (fellInPit) {
      obj.destroyed = true;
      obj.fellInPit = true;
      emit({ type: "objectPitFall", object: obj, position: { x: obj.pos.x, z: obj.pos.z } });
      if (obj.mesh) obj.mesh.visible = false;
      vel.x = 0;
      vel.z = 0;
      continue;
    }
    if (result.hitWall && speed > PHYSICS.objectWallSlamMinSpeed) {
      const slamDamage = Math.round((speed - PHYSICS.objectWallSlamMinSpeed) * PHYSICS.objectWallSlamDamage);
      obj.health -= slamDamage;
      if (obj.health <= 0) {
        obj.health = 0;
        obj.destroyed = true;
        if (obj.mesh) obj.mesh.visible = false;
        emit({ type: "objectDestroyed", object: obj, position: { x: obj.pos.x, z: obj.pos.z } });
      }
      emit({ type: "objectWallSlam", object: obj, speed, damage: slamDamage, position: { x: obj.pos.x, z: obj.pos.z } });
      screenShake(PHYSICS.objectWallSlamShake, 120);
      const bounce = obj.restitution ?? PHYSICS.objectWallSlamBounce;
      vel.x *= bounce;
      vel.z *= bounce;
    }
    const currentSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    if (currentSpeed > PHYSICS.minVelocity) {
      const newSpeed = currentSpeed - PHYSICS.objectFriction * dt;
      if (newSpeed <= PHYSICS.minVelocity) {
        vel.x = 0;
        vel.z = 0;
      } else {
        const scale = newSpeed / currentSpeed;
        vel.x *= scale;
        vel.z *= scale;
      }
    } else {
      vel.x = 0;
      vel.z = 0;
    }
  }
}
function resolveEnemyCollisions(gameState2) {
  const enemies = gameState2.enemies;
  const len = enemies.length;
  for (let i = 0; i < len; i++) {
    const a = enemies[i];
    if (a.health <= 0) continue;
    if (a.isLeaping) continue;
    for (let j = i + 1; j < len; j++) {
      const b = enemies[j];
      if (b.health <= 0) continue;
      if (b.isLeaping) continue;
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const distSq = dx * dx + dz * dz;
      const radA = a.config.size.radius;
      const radB = b.config.size.radius;
      const minDist = radA + radB;
      if (distSq >= minDist * minDist) continue;
      const dist = Math.sqrt(distSq);
      if (dist < 0.01) continue;
      const overlap = minDist - dist;
      const nx = dx / dist;
      const nz = dz / dist;
      const massA = a.config.mass ?? 1;
      const massB = b.config.mass ?? 1;
      const totalMass = massA + massB;
      const ratioA = massB / totalMass;
      const ratioB = massA / totalMass;
      a.pos.x -= nx * overlap * ratioA;
      a.pos.z -= nz * overlap * ratioA;
      b.pos.x += nx * overlap * ratioB;
      b.pos.z += nz * overlap * ratioB;
      const velA = a.vel;
      const velB = b.vel;
      if (!velA || !velB) continue;
      const relVelX = velA.x - velB.x;
      const relVelZ = velA.z - velB.z;
      const relVelDotN = relVelX * nx + relVelZ * nz;
      if (relVelDotN <= 0) continue;
      const e = PHYSICS.enemyBounce;
      const impulse = (1 + e) * relVelDotN / totalMass;
      velA.x -= impulse * massB * nx;
      velA.z -= impulse * massB * nz;
      velB.x += impulse * massA * nx;
      velB.z += impulse * massA * nz;
      const relSpeed = Math.sqrt(relVelX * relVelX + relVelZ * relVelZ);
      if (relSpeed > PHYSICS.impactMinSpeed) {
        const dmg = Math.round((relSpeed - PHYSICS.impactMinSpeed) * PHYSICS.impactDamage);
        const midX = (a.pos.x + b.pos.x) / 2;
        const midZ = (a.pos.z + b.pos.z) / 2;
        const dmgA = Math.round(dmg * ratioA);
        const dmgB = Math.round(dmg * ratioB);
        if (dmgA > 0) {
          applyDamageToEnemy(a, dmgA, gameState2);
          a.flashTimer = 100;
          if (a.bodyMesh) a.bodyMesh.material.emissive.setHex(16755268);
          if (a.headMesh) a.headMesh.material.emissive.setHex(16755268);
        }
        if (dmgB > 0) {
          applyDamageToEnemy(b, dmgB, gameState2);
          b.flashTimer = 100;
          if (b.bodyMesh) b.bodyMesh.material.emissive.setHex(16755268);
          if (b.headMesh) b.headMesh.material.emissive.setHex(16755268);
        }
        stunEnemy(a, PHYSICS.impactStun);
        stunEnemy(b, PHYSICS.impactStun);
        spawnDamageNumber(midX, midZ, dmg, "#ffaa44");
        screenShake(2, 80);
        emit({
          type: "enemyImpact",
          enemyA: a,
          enemyB: b,
          speed: relSpeed,
          damage: dmg,
          position: { x: midX, z: midZ }
        });
      }
      a.mesh.position.copy(a.pos);
      b.mesh.position.copy(b.pos);
    }
  }
}
function resolveObjectCollisions(gameState2) {
  const objects = gameState2.physicsObjects;
  const enemies = gameState2.enemies;
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < objects.length; i++) {
      const a = objects[i];
      if (a.destroyed) continue;
      for (let j = i + 1; j < objects.length; j++) {
        const b = objects[j];
        if (b.destroyed) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const distSq = dx * dx + dz * dz;
        const minDist = a.radius + b.radius;
        if (distSq >= minDist * minDist) continue;
        const dist = Math.sqrt(distSq);
        if (dist < 0.01) continue;
        const overlap = minDist - dist;
        const nx = dx / dist;
        const nz = dz / dist;
        const aTerrainCheck = resolveTerrainCollisionEx(
          a.pos.x - nx * 0.05,
          a.pos.z - nz * 0.05,
          a.radius
        );
        const bTerrainCheck = resolveTerrainCollisionEx(
          b.pos.x + nx * 0.05,
          b.pos.z + nz * 0.05,
          b.radius
        );
        const aBlocked = aTerrainCheck.hitWall;
        const bBlocked = bTerrainCheck.hitWall;
        let ratioA, ratioB;
        if (aBlocked && !bBlocked) {
          ratioA = 0;
          ratioB = 1;
        } else if (!aBlocked && bBlocked) {
          ratioA = 1;
          ratioB = 0;
        } else {
          const totalMass = a.mass + b.mass;
          ratioA = b.mass / totalMass;
          ratioB = a.mass / totalMass;
        }
        a.pos.x -= nx * overlap * ratioA;
        a.pos.z -= nz * overlap * ratioA;
        b.pos.x += nx * overlap * ratioB;
        b.pos.z += nz * overlap * ratioB;
        if (iter === 0) {
          const totalMass = a.mass + b.mass;
          const relVelX = a.vel.x - b.vel.x;
          const relVelZ = a.vel.z - b.vel.z;
          const relVelDotN = relVelX * nx + relVelZ * nz;
          if (relVelDotN > 0) {
            const e = PHYSICS.objectWallSlamBounce;
            const impulse = (1 + e) * relVelDotN / totalMass;
            a.vel.x -= impulse * b.mass * nx;
            a.vel.z -= impulse * b.mass * nz;
            b.vel.x += impulse * a.mass * nx;
            b.vel.z += impulse * a.mass * nz;
          }
        }
        if (a.mesh) a.mesh.position.set(a.pos.x, 0, a.pos.z);
        if (b.mesh) b.mesh.position.set(b.pos.x, 0, b.pos.z);
      }
    }
  }
  for (const obj of objects) {
    if (obj.destroyed) continue;
    for (const enemy of enemies) {
      if (enemy.health <= 0) continue;
      if (enemy.isLeaping) continue;
      const dx = enemy.pos.x - obj.pos.x;
      const dz = enemy.pos.z - obj.pos.z;
      const distSq = dx * dx + dz * dz;
      const radObj = obj.radius;
      const radEnemy = enemy.config.size.radius;
      const minDist = radObj + radEnemy;
      if (distSq >= minDist * minDist) continue;
      const dist = Math.sqrt(distSq);
      if (dist < 0.01) continue;
      const overlap = minDist - dist;
      const nx = dx / dist;
      const nz = dz / dist;
      const massObj = obj.mass;
      const massEnemy = enemy.config.mass ?? 1;
      const totalMass = massObj + massEnemy;
      const ratioObj = massEnemy / totalMass;
      const ratioEnemy = massObj / totalMass;
      obj.pos.x -= nx * overlap * ratioObj;
      obj.pos.z -= nz * overlap * ratioObj;
      enemy.pos.x += nx * overlap * ratioEnemy;
      enemy.pos.z += nz * overlap * ratioEnemy;
      const velEnemy = enemy.vel;
      if (!velEnemy) continue;
      const relVelX = obj.vel.x - velEnemy.x;
      const relVelZ = obj.vel.z - velEnemy.z;
      const relVelDotN = relVelX * nx + relVelZ * nz;
      if (relVelDotN <= 0) continue;
      const e = obj.restitution ?? PHYSICS.enemyBounce;
      const impulse = (1 + e) * relVelDotN / totalMass;
      obj.vel.x -= impulse * massEnemy * nx;
      obj.vel.z -= impulse * massEnemy * nz;
      velEnemy.x += impulse * massObj * nx;
      velEnemy.z += impulse * massObj * nz;
      const relSpeed = Math.sqrt(relVelX * relVelX + relVelZ * relVelZ);
      if (relSpeed > PHYSICS.objectImpactMinSpeed) {
        const dmg = Math.round((relSpeed - PHYSICS.objectImpactMinSpeed) * PHYSICS.objectImpactDamage);
        if (dmg > 0) {
          applyDamageToEnemy(enemy, dmg, gameState2);
          enemy.flashTimer = 100;
          if (enemy.bodyMesh) enemy.bodyMesh.material.emissive.setHex(16755268);
          if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(16755268);
          spawnDamageNumber(enemy.pos.x, enemy.pos.z, dmg, "#ffaa44");
          screenShake(2, 80);
          emit({
            type: "objectImpact",
            objectA: obj,
            objectB: enemy,
            speed: relSpeed,
            damage: dmg,
            position: { x: (obj.pos.x + enemy.pos.x) / 2, z: (obj.pos.z + enemy.pos.z) / 2 }
          });
        }
      }
      if (obj.mesh) obj.mesh.position.set(obj.pos.x, 0, obj.pos.z);
      enemy.mesh.position.copy(enemy.pos);
    }
  }
}
function resolvePhysicsObjectBodyCollisions(gameState2) {
  const objects = gameState2.physicsObjects;
  const playerPos2 = getPlayerPos();
  const playerR = PLAYER.size.radius;
  for (const obj of objects) {
    if (obj.destroyed) continue;
    const pdx = playerPos2.x - obj.pos.x;
    const pdz = playerPos2.z - obj.pos.z;
    const pDistSq = pdx * pdx + pdz * pdz;
    const pMinDist = playerR + obj.radius;
    if (pDistSq < pMinDist * pMinDist && pDistSq > 1e-4) {
      const pDist = Math.sqrt(pDistSq);
      const pOverlap = pMinDist - pDist;
      playerPos2.x += pdx / pDist * pOverlap;
      playerPos2.z += pdz / pDist * pOverlap;
    }
    for (const enemy of gameState2.enemies) {
      if (enemy.health <= 0) continue;
      if (enemy.isLeaping) continue;
      const edx = enemy.pos.x - obj.pos.x;
      const edz = enemy.pos.z - obj.pos.z;
      const eDistSq = edx * edx + edz * edz;
      const eRadEnemy = enemy.config.size.radius;
      const eMinDist = eRadEnemy + obj.radius;
      if (eDistSq < eMinDist * eMinDist && eDistSq > 1e-4) {
        const eDist = Math.sqrt(eDistSq);
        const eOverlap = eMinDist - eDist;
        enemy.pos.x += edx / eDist * eOverlap;
        enemy.pos.z += edz / eDist * eOverlap;
      }
    }
  }
}
var pendingObstacleDestructions = [];
function resolveObjectObstacleCollisions(gameState2) {
  const objects = gameState2.physicsObjects;
  for (const obj of objects) {
    if (obj.destroyed) continue;
    const speed = Math.sqrt(obj.vel.x * obj.vel.x + obj.vel.z * obj.vel.z);
    if (speed < PHYSICS.objectImpactMinSpeed) continue;
    for (let i = 0; i < OBSTACLES.length; i++) {
      const obs = OBSTACLES[i];
      if (!obs.destructible || !obs.health || obs.health <= 0) continue;
      const aabb = {
        minX: obs.x - obs.w / 2,
        maxX: obs.x + obs.w / 2,
        minZ: obs.z - obs.d / 2,
        maxZ: obs.z + obs.d / 2
      };
      const push = circleVsAABB(obj.pos.x, obj.pos.z, obj.radius, aabb);
      if (!push) continue;
      const dmg = Math.round((speed - PHYSICS.objectImpactMinSpeed) * PHYSICS.objectImpactDamage);
      if (dmg <= 0) continue;
      obs.health -= dmg;
      spawnDamageNumber(obs.x, obs.z, dmg, "#ff8844");
      screenShake(2, 80);
      if (obs.health <= 0) {
        obs.health = 0;
        pendingObstacleDestructions.push(i);
        emit({ type: "obstacleDestroyed", obstacleIndex: i, position: { x: obs.x, z: obs.z } });
      }
    }
  }
}
function processDestroyedObstacles() {
  if (pendingObstacleDestructions.length === 0) return;
  pendingObstacleDestructions.sort((a, b) => b - a);
  for (const idx of pendingObstacleDestructions) {
    if (idx < OBSTACLES.length) {
      OBSTACLES.splice(idx, 1);
    }
  }
  pendingObstacleDestructions.length = 0;
  invalidateCollisionBounds();
  rebuildArenaVisuals();
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
      emit({ type: "pitFall", position: { x: playerPos2.x, z: playerPos2.z }, isPlayer: true });
      spawnDamageNumber(playerPos2.x, playerPos2.z, "FELL!", "#ff4466");
    }
  }
  for (const enemy of gameState2.enemies) {
    if (enemy.health <= 0) continue;
    if (enemy.isLeaping) continue;
    if (pointInPit(enemy.pos.x, enemy.pos.z)) {
      spawnPitFallGhost(enemy);
      emit({ type: "pitFall", position: { x: enemy.pos.x, z: enemy.pos.z }, isPlayer: false });
      createAoeRing(enemy.pos.x, enemy.pos.z, 2.5, 500, 8930559);
      enemy.health = 0;
      enemy.fellInPit = true;
      enemy.stunTimer = 9999;
      spawnDamageNumber(enemy.pos.x, enemy.pos.z, "FELL!", "#8844ff");
      screenShake(4, 200);
    }
  }
  for (const obj of gameState2.physicsObjects) {
    if (obj.destroyed) continue;
    if (pointInPit(obj.pos.x, obj.pos.z)) {
      obj.destroyed = true;
      obj.fellInPit = true;
      emit({ type: "objectPitFall", object: obj, position: { x: obj.pos.x, z: obj.pos.z } });
      if (obj.mesh) obj.mesh.visible = false;
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
  if (enemy.hitReaction) {
    triggerHitReaction(enemy.hitReaction);
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
  emit({ type: "shieldBreak", enemy, position: { x: enemy.pos.x, z: enemy.pos.z } });
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
function checkMeleeHits(gameState2) {
  if (!isMeleeSwinging()) return;
  const playerPos2 = getPlayerPos();
  const swingDir = getMeleeSwingDir();
  const hitEnemies = getMeleeHitEnemies();
  for (const enemy of gameState2.enemies) {
    if (enemy.health <= 0) continue;
    if (enemy.fellInPit) continue;
    if (hitEnemies.has(enemy)) continue;
    if (!isInMeleeArc(playerPos2.x, playerPos2.z, swingDir, enemy.pos.x, enemy.pos.z, MELEE.range, MELEE.arc)) {
      continue;
    }
    hitEnemies.add(enemy);
    const wasShielded = enemy.shieldActive;
    applyDamageToEnemy(enemy, MELEE.damage, gameState2);
    emit({ type: "enemyHit", enemy, damage: MELEE.damage, position: { x: enemy.pos.x, z: enemy.pos.z }, wasShielded });
    emit({ type: "meleeHit", enemy, damage: MELEE.damage, position: { x: enemy.pos.x, z: enemy.pos.z } });
    const dmgColor = wasShielded ? "#88eeff" : "#ff8844";
    spawnDamageNumber(enemy.pos.x, enemy.pos.z, MELEE.damage, dmgColor);
    enemy.flashTimer = 100;
    enemy.bodyMesh.material.emissive.setHex(16777215);
    if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(16777215);
    screenShake(MELEE.screenShake, 80);
  }
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
    if (enemy.fellInPit) continue;
    const vel = enemy.vel;
    const hasVelocity = vel && vel.x * vel.x + vel.z * vel.z > PHYSICS.minVelocity * PHYSICS.minVelocity;
    const bounds = hasVelocity ? getBounds() : getMoveBounds();
    let rx = enemy.pos.x, rz = enemy.pos.z;
    let wasDeflected = false;
    for (const box of bounds) {
      const push = circleVsAABB(rx, rz, enemy.config.size.radius, box);
      if (push) {
        rx += push.x;
        rz += push.z;
        wasDeflected = true;
      }
    }
    enemy.pos.x = rx;
    enemy.pos.z = rz;
    enemy.wasDeflected = wasDeflected;
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
        emit({ type: "enemyHit", enemy, damage: p.damage, position: { x: enemy.pos.x, z: enemy.pos.z }, wasShielded });
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
        emit({ type: "playerHit", damage: p.damage, position: { x: playerPos2.x, z: playerPos2.z } });
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
      if (enemy.config.melee) continue;
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
          emit({ type: "playerHit", damage: dmg, position: { x: playerPos2.x, z: playerPos2.z } });
          spawnDamageNumber(playerPos2.x, playerPos2.z, dmg, "#ff4466");
          if (gameState2.playerHealth <= 0) {
            gameState2.playerHealth = 0;
            gameState2.phase = "gameOver";
          }
        }
      }
    }
  }
  checkMeleeHits(gameState2);
  const pushEvt = consumePushEvent();
  if (pushEvt) {
    const dirX = pushEvt.dirX;
    const dirZ = pushEvt.dirZ;
    const perpX = -dirZ;
    const perpZ = dirX;
    const halfLen = pushEvt.length / 2;
    const playerX = pushEvt.x - dirX * halfLen;
    const playerZ = pushEvt.z - dirZ * halfLen;
    const candidates = [];
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
        const dx = enemy.pos.x - playerX;
        const dz = enemy.pos.z - playerZ;
        const forward = dx * dirX + dz * dirZ;
        const lateral = dx * perpX + dz * perpZ;
        candidates.push({ enemy, obj: null, forward, lateral });
      }
    }
    for (const obj of gameState2.physicsObjects) {
      if (obj.destroyed) continue;
      if (isInRotatedRect(
        obj.pos.x,
        obj.pos.z,
        pushEvt.x,
        pushEvt.z,
        pushEvt.width,
        pushEvt.length,
        pushEvt.rotation,
        obj.radius
      )) {
        const dx = obj.pos.x - playerX;
        const dz = obj.pos.z - playerZ;
        const forward = dx * dirX + dz * dirZ;
        const lateral = dx * perpX + dz * perpZ;
        candidates.push({ enemy: null, obj, forward, lateral });
      }
    }
    candidates.sort((a, b) => a.forward - b.forward);
    const pushedLaterals = [];
    const blockRadius = PHYSICS.pushWaveBlockRadius;
    for (const { enemy, obj, lateral } of candidates) {
      let blocked = false;
      for (const pushedLat of pushedLaterals) {
        if (Math.abs(lateral - pushedLat) < blockRadius) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      if (enemy) {
        const iceEffects = getIceEffects(enemy.pos.x, enemy.pos.z, false);
        const kbMult = 1 - (enemy.knockbackResist ?? enemy.config.knockbackResist ?? 0);
        const kbDist = pushEvt.force * kbMult * iceEffects.knockbackMult;
        if (kbDist > 0) {
          const v0 = Math.sqrt(2 * PHYSICS.friction * kbDist);
          enemy.vel.x = dirX * v0;
          enemy.vel.z = dirZ * v0;
        }
        emit({ type: "enemyPushed", enemy, position: { x: enemy.pos.x, z: enemy.pos.z } });
        enemy.flashTimer = 100;
        enemy.bodyMesh.material.emissive.setHex(4521898);
        if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(4521898);
        spawnDamageNumber(enemy.pos.x, enemy.pos.z, "PUSH", "#44ffaa");
      } else if (obj) {
        const kbDist = pushEvt.force / obj.mass;
        if (kbDist > 0) {
          const v0 = Math.sqrt(2 * PHYSICS.objectFriction * kbDist);
          obj.vel.x = dirX * v0;
          obj.vel.z = dirZ * v0;
          const nudgeResult = resolveTerrainCollisionEx(obj.pos.x, obj.pos.z, obj.radius);
          if (nudgeResult.hitWall) {
            obj.pos.x = nudgeResult.x + nudgeResult.normalX * 0.1;
            obj.pos.z = nudgeResult.z + nudgeResult.normalZ * 0.1;
            if (obj.mesh) {
              obj.mesh.position.set(obj.pos.x, 0, obj.pos.z);
            }
          }
        }
        emit({ type: "objectPushed", object: obj, position: { x: obj.pos.x, z: obj.pos.z } });
        spawnDamageNumber(obj.pos.x, obj.pos.z, "PUSH", "#44ffaa");
      }
      pushedLaterals.push(lateral);
    }
  }
}

// src/engine/particles.ts
var HIT_SPARK = {
  count: 5,
  lifetime: 0.25,
  speed: 6,
  spread: Math.PI * 0.8,
  size: 0.06,
  color: 16777130,
  fadeOut: true,
  gravity: 4,
  shape: "box"
};
var DEATH_PUFF = {
  count: 8,
  lifetime: 0.4,
  speed: 3,
  spread: Math.PI,
  size: 0.08,
  color: 16777215,
  // will be overridden with enemy color
  fadeOut: true,
  gravity: 1,
  shape: "sphere"
};
var DASH_TRAIL = {
  count: 3,
  lifetime: 0.3,
  speed: 1.5,
  spread: Math.PI * 0.3,
  size: 0.05,
  color: 4521864,
  fadeOut: true,
  gravity: 0,
  shape: "box"
};
var SHIELD_BREAK_BURST = {
  count: 10,
  lifetime: 0.35,
  speed: 8,
  spread: Math.PI,
  size: 0.07,
  color: 8974079,
  fadeOut: true,
  gravity: 3,
  shape: "box"
};
var PUSH_BURST = {
  count: 4,
  lifetime: 0.2,
  speed: 5,
  spread: Math.PI * 0.5,
  size: 0.05,
  color: 4521898,
  fadeOut: true,
  gravity: 2,
  shape: "box"
};
var CHARGE_BLAST = {
  count: 12,
  lifetime: 0.3,
  speed: 10,
  spread: Math.PI * 0.4,
  size: 0.08,
  color: 4521898,
  fadeOut: true,
  gravity: 2,
  shape: "sphere"
};
var ENEMY_IMPACT_SPARK = {
  count: 6,
  lifetime: 0.25,
  speed: 5,
  spread: Math.PI,
  size: 0.06,
  color: 16755268,
  fadeOut: true,
  gravity: 4,
  shape: "sphere"
};
var WALL_SLAM_SPARK = {
  count: 8,
  lifetime: 0.3,
  speed: 7,
  spread: Math.PI * 0.6,
  size: 0.07,
  color: 16746564,
  fadeOut: true,
  gravity: 5,
  shape: "box"
};
var OBSTACLE_BREAK_BURST = {
  count: 12,
  lifetime: 0.6,
  speed: 4,
  spread: Math.PI * 2,
  size: 0.15,
  color: 8943462,
  fadeOut: true,
  gravity: 8,
  shape: "box"
};
var BEND_APPLY_BURST = {
  count: 10,
  lifetime: 0.4,
  speed: 3,
  spread: Math.PI,
  size: 0.1,
  color: 4491519,
  // will be overridden per-bend
  fadeOut: true,
  gravity: -2,
  // float upward
  shape: "sphere"
};
var DOOR_UNLOCK_BURST = {
  count: 12,
  lifetime: 0.5,
  speed: 6,
  spread: Math.PI * 0.5,
  size: 0.08,
  color: 8961023,
  fadeOut: true,
  gravity: -2,
  // float upward
  shape: "sphere"
};
var POOL_SIZE2 = 80;
var pool2 = [];
var sceneRef5 = null;
var boxGeo = null;
var sphereGeo = null;
function initParticles(scene2) {
  sceneRef5 = scene2;
  boxGeo = new THREE.BoxGeometry(1, 1, 1);
  sphereGeo = new THREE.SphereGeometry(0.5, 4, 3);
  for (let i = 0; i < POOL_SIZE2; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 16777215,
      transparent: true,
      opacity: 1,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.visible = false;
    scene2.add(mesh);
    pool2.push({
      mesh,
      active: false,
      life: 0,
      maxLife: 1,
      vx: 0,
      vy: 0,
      vz: 0,
      gravity: 0,
      fadeOut: true,
      material: mat,
      baseScale: 1
    });
  }
  initArcDecals(scene2);
  initEnemyArcDecals(scene2);
  wireEventBus();
}
var ARC_DECAL_POOL_SIZE = 3;
var ARC_DECAL_LIFETIME = 0.25;
var arcDecalPool = [];
var arcDecalGeo = null;
function initArcDecals(scene2) {
  arcDecalGeo = new THREE.CircleGeometry(1, 24, Math.PI / 2 - MELEE.arc / 2, MELEE.arc);
  arcDecalGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < ARC_DECAL_POOL_SIZE; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 16777215,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(arcDecalGeo, mat);
    mesh.visible = false;
    scene2.add(mesh);
    arcDecalPool.push({ mesh, active: false, life: 0 });
  }
}
function spawnArcDecal(x, z, dirX, dirZ) {
  let decal = null;
  for (const d of arcDecalPool) {
    if (!d.active) {
      decal = d;
      break;
    }
  }
  if (!decal) return;
  decal.active = true;
  decal.life = 0;
  decal.mesh.visible = true;
  decal.mesh.position.set(x, 0.05, z);
  const r = MELEE.range;
  decal.mesh.scale.set(r * 0.3, 1, r * 0.3);
  decal.mesh.rotation.y = Math.atan2(-dirX, -dirZ);
  decal.mesh.material.opacity = 0.4;
}
function updateArcDecals(dt) {
  for (const d of arcDecalPool) {
    if (!d.active) continue;
    d.life += dt;
    if (d.life >= ARC_DECAL_LIFETIME) {
      d.active = false;
      d.mesh.visible = false;
      continue;
    }
    const t = d.life / ARC_DECAL_LIFETIME;
    const ease = 1 - (1 - t) * (1 - t);
    const r = MELEE.range;
    const s = r * (0.3 + 0.7 * ease);
    d.mesh.scale.set(s, 1, s);
    d.mesh.material.opacity = 0.4 * (1 - ease);
  }
}
function clearArcDecals() {
  for (const d of arcDecalPool) {
    d.active = false;
    d.mesh.visible = false;
  }
}
var ENEMY_ARC_POOL_SIZE = 6;
var enemyArcPool = [];
function initEnemyArcDecals(scene2) {
  for (let i = 0; i < ENEMY_ARC_POOL_SIZE; i++) {
    const geo = new THREE.CircleGeometry(1, 24, 0, Math.PI);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 16729088,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene2.add(mesh);
    enemyArcPool.push({ mesh, active: false, life: 0, maxLife: 1 });
  }
}
function spawnEnemyArcDecal(x, z, facingAngle, hitArc, hitRange, durationMs) {
  let decal = null;
  for (const d of enemyArcPool) {
    if (!d.active) {
      decal = d;
      break;
    }
  }
  if (!decal) return;
  const newGeo = new THREE.CircleGeometry(hitRange, 24, Math.PI / 2 - hitArc / 2, hitArc);
  newGeo.rotateX(-Math.PI / 2);
  decal.mesh.geometry.dispose();
  decal.mesh.geometry = newGeo;
  decal.active = true;
  decal.life = 0;
  decal.maxLife = durationMs / 1e3;
  decal.mesh.visible = true;
  decal.mesh.position.set(x, 0.05, z);
  decal.mesh.scale.set(1, 1, 1);
  decal.mesh.rotation.set(0, facingAngle, 0);
  decal.mesh.material.opacity = 0.35;
}
function updateEnemyArcDecals(dt) {
  for (const d of enemyArcPool) {
    if (!d.active) continue;
    d.life += dt;
    if (d.life >= d.maxLife) {
      d.active = false;
      d.mesh.visible = false;
      continue;
    }
    const t = d.life / d.maxLife;
    if (t < 0.8) {
      const pulse = 0.275 + 0.075 * Math.sin(d.life * 12);
      d.mesh.material.opacity = pulse;
    } else {
      const fadeT = (t - 0.8) / 0.2;
      d.mesh.material.opacity = 0.35 * (1 - fadeT);
    }
  }
}
function clearEnemyArcDecals() {
  for (const d of enemyArcPool) {
    d.active = false;
    d.mesh.visible = false;
  }
}
function burst(position, config, direction) {
  if (!sceneRef5) return;
  const y = position.y ?? 0.5;
  for (let i = 0; i < config.count; i++) {
    const p = acquireParticle();
    if (!p) break;
    p.mesh.geometry = config.shape === "sphere" ? sphereGeo : boxGeo;
    const s = config.size * (0.7 + Math.random() * 0.6);
    p.mesh.scale.set(s, s, s);
    p.baseScale = s;
    p.material.color.setHex(config.color);
    p.material.opacity = 1;
    p.mesh.position.set(
      position.x + (Math.random() - 0.5) * 0.1,
      y + (Math.random() - 0.5) * 0.1,
      position.z + (Math.random() - 0.5) * 0.1
    );
    let vx, vy, vz;
    if (direction) {
      const angle = Math.atan2(direction.x, direction.z) + (Math.random() - 0.5) * config.spread;
      const elevAngle = (Math.random() - 0.3) * config.spread * 0.5;
      vx = Math.sin(angle) * Math.cos(elevAngle);
      vy = Math.sin(elevAngle) + Math.random() * 0.3;
      vz = Math.cos(angle) * Math.cos(elevAngle);
    } else {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * config.spread;
      vx = Math.sin(phi) * Math.cos(theta);
      vy = Math.cos(phi) * 0.5 + Math.random() * 0.5;
      vz = Math.sin(phi) * Math.sin(theta);
    }
    const speed = config.speed * (0.6 + Math.random() * 0.8);
    p.vx = vx * speed;
    p.vy = vy * speed;
    p.vz = vz * speed;
    p.gravity = config.gravity;
    p.fadeOut = config.fadeOut;
    p.life = 0;
    p.maxLife = config.lifetime * (0.7 + Math.random() * 0.6);
    p.active = true;
    p.mesh.visible = true;
  }
}
function updateParticles(dt) {
  updateArcDecals(dt);
  updateEnemyArcDecals(dt);
  for (const p of pool2) {
    if (!p.active) continue;
    p.life += dt;
    if (p.life >= p.maxLife) {
      p.active = false;
      p.mesh.visible = false;
      continue;
    }
    p.vy -= p.gravity * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    if (p.mesh.position.y < 0.02) {
      p.mesh.position.y = 0.02;
      p.vy = 0;
      p.vx *= 0.8;
      p.vz *= 0.8;
    }
    if (p.fadeOut) {
      const t = p.life / p.maxLife;
      p.material.opacity = 1 - t * t;
    }
    const lifeRatio = p.life / p.maxLife;
    if (lifeRatio > 0.7) {
      const shrink = 1 - (lifeRatio - 0.7) / 0.3;
      p.mesh.scale.setScalar(p.baseScale * shrink);
    }
  }
}
function acquireParticle() {
  for (const p of pool2) {
    if (!p.active) return p;
  }
  return null;
}
function clearParticles() {
  for (const p of pool2) {
    p.active = false;
    p.mesh.visible = false;
  }
  clearArcDecals();
  clearEnemyArcDecals();
}
function wireEventBus() {
  on("enemyHit", (e) => {
    if (e.type === "enemyHit") {
      burst(
        { x: e.position.x, y: 0.5, z: e.position.z },
        HIT_SPARK
      );
    }
  });
  on("enemyDied", (e) => {
    if (e.type === "enemyDied") {
      const color = e.enemy.config?.color ?? DEATH_PUFF.color;
      burst(
        { x: e.position.x, y: 0.4, z: e.position.z },
        { ...DEATH_PUFF, color }
      );
    }
  });
  on("playerDash", (e) => {
    if (e.type === "playerDash") {
      burst(
        { x: e.position.x, y: 0.4, z: e.position.z },
        DASH_TRAIL,
        { x: -e.direction.x, z: -e.direction.z }
      );
    }
  });
  on("shieldBreak", (e) => {
    if (e.type === "shieldBreak") {
      burst(
        { x: e.position.x, y: 0.6, z: e.position.z },
        SHIELD_BREAK_BURST
      );
    }
  });
  on("chargeFired", (e) => {
    if (e.type === "chargeFired") {
      burst(
        { x: e.position.x, y: 0.5, z: e.position.z },
        { ...CHARGE_BLAST, count: Math.round(6 + e.chargeT * 6) },
        { x: e.direction.x, z: e.direction.z }
      );
    }
  });
  on("enemyPushed", (e) => {
    if (e.type === "enemyPushed") {
      burst(
        { x: e.position.x, y: 0.3, z: e.position.z },
        PUSH_BURST
      );
    }
  });
  on("meleeSwing", (e) => {
    if (e.type === "meleeSwing") {
      burst(
        { x: e.position.x, y: 0.6, z: e.position.z },
        { ...DASH_TRAIL, count: 2, speed: 3, lifetime: 0.15, color: 16777215 },
        { x: e.direction.x, z: e.direction.z }
      );
      spawnArcDecal(e.position.x, e.position.z, e.direction.x, e.direction.z);
    }
  });
  on("wallSlam", (e) => {
    if (e.type === "wallSlam") {
      burst(
        { x: e.position.x, y: 0.3, z: e.position.z },
        { ...WALL_SLAM_SPARK, count: Math.round(4 + e.speed / 5 * 4) }
      );
    }
  });
  on("enemyImpact", (e) => {
    if (e.type === "enemyImpact") {
      burst(
        { x: e.position.x, y: 0.4, z: e.position.z },
        { ...ENEMY_IMPACT_SPARK, count: Math.round(3 + e.speed / 5 * 3) }
      );
    }
  });
  on("enemyMeleeTelegraph", (e) => {
    if (e.type === "enemyMeleeTelegraph") {
      spawnEnemyArcDecal(
        e.position.x,
        e.position.z,
        e.facingAngle,
        e.hitArc,
        e.hitRange,
        e.duration
      );
    }
  });
  on("doorUnlocked", (e) => {
    if (e.type === "doorUnlocked") {
      burst({ x: 0, y: 2, z: 0 }, DOOR_UNLOCK_BURST);
    }
  });
  on("obstacleDestroyed", (e) => {
    if (e.type === "obstacleDestroyed") {
      burst(
        { x: e.position.x, y: 0.5, z: e.position.z },
        OBSTACLE_BREAK_BURST
      );
    }
  });
  on("objectWallSlam", (e) => {
    if (e.type === "objectWallSlam") {
      burst(
        { x: e.position.x, y: 0.3, z: e.position.z },
        { ...WALL_SLAM_SPARK, count: Math.round(3 + e.speed / 6 * 3), color: 8947848 }
      );
    }
  });
  on("objectImpact", (e) => {
    if (e.type === "objectImpact") {
      burst(
        { x: e.position.x, y: 0.4, z: e.position.z },
        { ...ENEMY_IMPACT_SPARK, count: Math.round(3 + e.speed / 5 * 3) }
      );
    }
  });
  on("bendApplied", (e) => {
    if (e.type === "bendApplied") {
      const color = e.bendId === "enlarge" ? 4491519 : 16763972;
      burst(
        { x: e.position.x, y: 0.5, z: e.position.z },
        { ...BEND_APPLY_BURST, color }
      );
    }
  });
}

// src/engine/telegraph.ts
var sceneRef6;
var ringGeo2;
var fillGeo;
var typeGeos = {};
function initTelegraph(scene2) {
  sceneRef6 = scene2;
  ringGeo2 = new THREE.RingGeometry(0.6, 0.8, 24);
  ringGeo2.rotateX(-Math.PI / 2);
  fillGeo = new THREE.CircleGeometry(0.6, 24);
  fillGeo.rotateX(-Math.PI / 2);
  typeGeos.goblin = new THREE.ConeGeometry(0.2, 0.4, 3);
  typeGeos.skeletonArcher = new THREE.BoxGeometry(0.25, 0.25, 0.25);
  typeGeos.stoneGolem = new THREE.CylinderGeometry(0.25, 0.25, 0.1, 6);
  typeGeos.iceMortarImp = new THREE.SphereGeometry(0.2, 8, 8);
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
  sceneRef6.add(group);
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
    sceneRef6.remove(telegraph.group);
  }
  telegraph.ringMat.dispose();
  telegraph.fillMat.dispose();
  telegraph.typeMat.dispose();
}

// src/config/door.ts
var DOOR_CONFIG = {
  unlockDuration: 1e3,
  // ms — door unlock animation duration
  interactRadius: 3.5,
  // units — how close player must be to interact with door
  // (door is at wall edge, player clamps ~0.5u away, so needs generous radius)
  restPause: 2e3
  // ms — how long before rest room door opens
};

// src/engine/door.ts
var doorState = "none";
var doorGroup = null;
var doorFrameMesh = null;
var doorPanelMesh = null;
var doorGlowMesh = null;
var doorAnimTimer = 0;
var doorRoomIndex = 0;
var sceneRef7 = null;
var doorX = 0;
var doorZ = 0;
var promptEl = null;
var promptVisible = false;
function initDoor(scene2) {
  sceneRef7 = scene2;
  promptEl = document.getElementById("door-prompt");
  if (!promptEl) {
    promptEl = document.createElement("div");
    promptEl.id = "door-prompt";
    promptEl.style.cssText = `
      position: fixed;
      bottom: 25%;
      left: 50%;
      transform: translateX(-50%);
      color: #88bbff;
      font-family: 'Courier New', monospace;
      font-size: 16px;
      font-weight: bold;
      text-align: center;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s ease;
      text-shadow: 0 0 10px rgba(136, 187, 255, 0.6);
      z-index: 50;
    `;
    promptEl.textContent = "Press F to enter";
    document.body.appendChild(promptEl);
  }
}
function createDoor(arenaHalfX, arenaHalfZ, roomIndex) {
  removeDoor();
  doorState = "locked";
  doorRoomIndex = roomIndex;
  doorAnimTimer = 0;
  doorX = 0;
  doorZ = -arenaHalfZ + 1;
  doorGroup = new THREE.Group();
  doorGroup.position.set(doorX, 0, doorZ);
  const frameMat = new THREE.MeshStandardMaterial({
    color: 4868714,
    emissive: 4482730,
    emissiveIntensity: 0.5,
    roughness: 0.5
  });
  const leftPillar = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 4, 0.6),
    frameMat
  );
  leftPillar.position.set(-2, 2, 0);
  doorGroup.add(leftPillar);
  const rightPillar = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 4, 0.6),
    frameMat
  );
  rightPillar.position.set(2, 2, 0);
  doorGroup.add(rightPillar);
  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(4.6, 0.5, 0.6),
    frameMat
  );
  lintel.position.set(0, 4.25, 0);
  doorGroup.add(lintel);
  doorFrameMesh = doorGroup;
  const panelMat = new THREE.MeshStandardMaterial({
    color: 1710638,
    emissive: 3359846,
    emissiveIntensity: 0.2,
    transparent: true,
    opacity: 0.9,
    roughness: 0.5
  });
  doorPanelMesh = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 3.6, 0.25),
    panelMat
  );
  doorPanelMesh.position.set(0, 1.8, 0);
  doorGroup.add(doorPanelMesh);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 8961023,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide
  });
  doorGlowMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 3.6),
    glowMat
  );
  doorGlowMesh.position.set(0, 1.8, 0.2);
  doorGroup.add(doorGlowMesh);
  sceneRef7.add(doorGroup);
}
function unlockDoor() {
  if (doorState !== "locked") return;
  doorState = "unlocking";
  doorAnimTimer = 0;
}
function updateDoor(dt, playerPos2, interact, playerDashing) {
  if (doorState === "none" || !doorGroup) return false;
  if (doorState === "unlocking") {
    doorAnimTimer += dt * 1e3;
    const progress = Math.min(doorAnimTimer / DOOR_CONFIG.unlockDuration, 1);
    doorPanelMesh.position.y = 1.8 + progress * 4;
    doorPanelMesh.material.opacity = 0.9 * (1 - progress);
    doorGlowMesh.material.opacity = progress * 0.6;
    doorGroup.children.forEach((child) => {
      if (child.material && child !== doorPanelMesh && child !== doorGlowMesh) {
        child.material.emissiveIntensity = 0.5 + progress * 0.8;
      }
    });
    if (progress >= 1) {
      doorState = "open";
      emit({ type: "doorUnlocked", roomIndex: doorRoomIndex });
    }
  }
  if (doorState === "open") {
    doorAnimTimer += dt * 1e3;
    const pulse = 0.4 + 0.2 * Math.sin(doorAnimTimer * 3e-3 * Math.PI * 2);
    doorGlowMesh.material.opacity = pulse;
    if (playerPos2) {
      const dx = playerPos2.x - doorX;
      const dz = playerPos2.z - doorZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const nearDoor = dist < DOOR_CONFIG.interactRadius;
      if (nearDoor) {
        showPrompt();
        if (interact || playerDashing) {
          hidePrompt();
          emit({ type: "doorEntered", roomIndex: doorRoomIndex });
          doorState = "none";
          return true;
        }
      } else {
        hidePrompt();
      }
    }
  } else {
    hidePrompt();
  }
  return false;
}
function showPrompt() {
  if (promptEl && !promptVisible) {
    promptVisible = true;
    promptEl.style.opacity = "1";
  }
}
function hidePrompt() {
  if (promptEl && promptVisible) {
    promptVisible = false;
    promptEl.style.opacity = "0";
  }
}
function removeDoor() {
  hidePrompt();
  if (doorGroup && sceneRef7) {
    sceneRef7.remove(doorGroup);
    doorGroup.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }
  doorGroup = null;
  doorPanelMesh = null;
  doorGlowMesh = null;
  doorFrameMesh = null;
  doorState = "none";
}

// src/entities/physicsObject.ts
var nextId = 1;
function resetPhysicsObjectIds() {
  nextId = 1;
}
function createPhysicsObject(placement) {
  return {
    id: nextId++,
    pos: { x: placement.x, z: placement.z },
    vel: { x: 0, z: 0 },
    radius: placement.radius,
    mass: placement.mass,
    health: placement.health,
    maxHealth: placement.health,
    material: placement.material,
    meshType: placement.meshType,
    scale: placement.scale ?? 1,
    restitution: void 0,
    mesh: null,
    destroyed: false,
    fellInPit: false
  };
}
var MATERIAL_COLORS = {
  stone: { color: 8947865, emissive: 3359829 },
  wood: { color: 9136404, emissive: 4469538 },
  metal: { color: 11184844, emissive: 5596791 },
  ice: { color: 8965375, emissive: 4491434 }
};
function createPhysicsObjectMesh(obj, scene2) {
  const group = new THREE.Group();
  const colors = MATERIAL_COLORS[obj.material] || MATERIAL_COLORS.stone;
  const mat = new THREE.MeshStandardMaterial({
    color: colors.color,
    emissive: colors.emissive,
    emissiveIntensity: 0.3,
    roughness: 0.7
  });
  let geo;
  switch (obj.meshType) {
    case "rock":
      geo = new THREE.SphereGeometry(obj.radius * obj.scale, 8, 6);
      break;
    case "crate": {
      const r = obj.radius * obj.scale;
      geo = new THREE.CylinderGeometry(r, r, r * 1.4, 6);
      break;
    }
    case "barrel":
      geo = new THREE.CylinderGeometry(
        obj.radius * obj.scale * 0.8,
        obj.radius * obj.scale,
        obj.radius * obj.scale * 1.5,
        8
      );
      break;
    case "pillar":
      geo = new THREE.CylinderGeometry(
        obj.radius * obj.scale * 0.6,
        obj.radius * obj.scale,
        obj.radius * obj.scale * 2.5,
        6
      );
      break;
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = obj.radius * obj.scale * 0.5;
  group.add(mesh);
  group.position.set(obj.pos.x, 0, obj.pos.z);
  group.userData._baseGeoSize = obj.radius * obj.scale;
  scene2.add(group);
  obj.mesh = group;
}
function applyBendVisuals(obj, tintColor) {
  if (!obj.mesh) return;
  const base = obj.mesh.userData._baseGeoSize || 1;
  const s = obj.radius / base;
  obj.mesh.scale.set(s, s, s);
  obj.mesh.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material.emissive.setHex(tintColor);
      child.material.emissiveIntensity = 0.6;
    }
  });
}
function clearBendVisuals(obj) {
  if (!obj.mesh) return;
  obj.mesh.scale.set(1, 1, 1);
  const colors = MATERIAL_COLORS[obj.material] || MATERIAL_COLORS.stone;
  obj.mesh.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material.emissive.setHex(colors.emissive);
      child.material.emissiveIntensity = 0.3;
    }
  });
}
function clearPhysicsObjects(gameState2, scene2) {
  for (const obj of gameState2.physicsObjects) {
    if (obj.mesh) {
      scene2.remove(obj.mesh);
      obj.mesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
  }
  gameState2.physicsObjects = [];
}

// src/config/bends.ts
var BENDS = [
  {
    id: "enlarge",
    name: "Enlarge",
    description: "Scale up \u2014 bigger, heavier, more impact",
    icon: "\u2B06",
    property: "size",
    pole: "positive",
    effects: [
      { param: "scale", operation: "multiply", value: 2.5 },
      { param: "mass", operation: "multiply", value: 2 },
      { param: "radius", operation: "multiply", value: 2 }
    ],
    tintColor: 4491519
  },
  {
    id: "shrink",
    name: "Shrink",
    description: "Scale down \u2014 tiny, light, flies on any push",
    icon: "\u2B07",
    property: "size",
    pole: "negative",
    effects: [
      { param: "scale", operation: "multiply", value: 0.3 },
      { param: "mass", operation: "multiply", value: 0.3 },
      { param: "radius", operation: "multiply", value: 0.3 }
    ],
    tintColor: 16763972
  }
];
function getBendById(id) {
  return BENDS.find((b) => b.id === id);
}

// src/engine/bendSystem.ts
function createBendSystem(maxBends2) {
  let activeBends = [];
  let remaining = maxBends2;
  const max = maxBends2;
  function applyBend(bendId, targetType, target) {
    const bend = getBendById(bendId);
    if (!bend) return { success: false, reason: "invalid_bend" };
    if (remaining <= 0) return { success: false, reason: "no_bends_remaining" };
    const targetId = target.id ?? 0;
    const existing = activeBends.find((ab) => ab.targetId === targetId && ab.targetType === targetType);
    if (existing) {
      if (existing.bendId === bendId) {
        return { success: false, reason: "already_applied" };
      }
      const existingBend = getBendById(existing.bendId);
      if (existingBend && existingBend.property === bend.property) {
        return { success: false, reason: "opposite_pole" };
      }
    }
    const originalValues = {};
    for (const fx of bend.effects) {
      originalValues[fx.param] = target[fx.param];
    }
    for (const fx of bend.effects) {
      if (fx.operation === "multiply") {
        target[fx.param] *= fx.value;
      } else if (fx.operation === "set") {
        target[fx.param] = fx.value;
      }
    }
    activeBends.push({
      bendId,
      targetType,
      targetId,
      target,
      originalValues
    });
    remaining--;
    return { success: true };
  }
  function resetAll() {
    for (const ab of activeBends) {
      for (const [param, value] of Object.entries(ab.originalValues)) {
        ab.target[param] = value;
      }
    }
    activeBends = [];
    remaining = max;
  }
  function getActiveBends() {
    return [...activeBends];
  }
  function bendsRemaining() {
    return remaining;
  }
  function hasBendOnTarget(targetType, targetId) {
    const found = activeBends.find((ab) => ab.targetType === targetType && ab.targetId === targetId);
    return found ? found.bendId : null;
  }
  return { applyBend, resetAll, getActiveBends, bendsRemaining, hasBendOnTarget };
}

// src/engine/bulletTime.ts
var BULLET_TIME = {
  timeScale: 0.25,
  // how slow the world runs (0.25 = 25% speed)
  maxResource: 3e3,
  // ms of bullet time available at full bar
  drainRate: 1e3,
  // resource drained per real second while active
  killRefill: 600,
  // resource refilled per enemy kill
  activationMinimum: 300,
  // minimum resource required to activate
  infinite: 1
  // 1 = infinite resource (skip drain), 0 = normal drain
};
var resource = BULLET_TIME.maxResource;
var active = false;
var initialized = false;
function initBulletTime() {
  if (initialized) return;
  initialized = true;
  on("enemyDied", () => {
    refillBulletTime(BULLET_TIME.killRefill);
  });
}
function activateBulletTime() {
  if (active) return;
  if (resource >= BULLET_TIME.activationMinimum) {
    active = true;
    emit({ type: "bulletTimeActivated" });
  }
}
function toggleBulletTime() {
  if (active) {
    active = false;
    emit({ type: "bulletTimeDeactivated" });
  } else {
    activateBulletTime();
  }
}
function updateBulletTime(realDt) {
  if (!active) return;
  if (BULLET_TIME.infinite >= 1) return;
  resource -= BULLET_TIME.drainRate * realDt;
  if (resource <= 0) {
    resource = 0;
    active = false;
    emit({ type: "bulletTimeDeactivated" });
  }
}
function getBulletTimeScale() {
  return active ? BULLET_TIME.timeScale : 1;
}
function refillBulletTime(amount) {
  resource = Math.min(resource + amount, BULLET_TIME.maxResource);
}
function resetBulletTime() {
  resource = BULLET_TIME.maxResource;
  active = false;
}
function isBulletTimeActive() {
  return active;
}
function getBulletTimeResource() {
  return resource;
}
function getBulletTimeMax() {
  return BULLET_TIME.maxResource;
}

// src/ui/radialMenu.ts
var containerEl = null;
var optionEls = [];
var visible = false;
var selectedBendId = null;
var onBendSelectedCallback = null;
var MENU_SIZE = 200;
var OPTION_SIZE = 72;
var OPTION_DISTANCE = 60;
function initRadialMenu() {
  containerEl = document.createElement("div");
  containerEl.id = "radial-menu";
  containerEl.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    width: ${MENU_SIZE}px;
    height: ${MENU_SIZE}px;
    margin-left: ${-MENU_SIZE / 2}px;
    margin-top: ${-MENU_SIZE / 2}px;
    pointer-events: none;
    z-index: 200;
    display: none;
  `;
  const centerLabel = document.createElement("div");
  centerLabel.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    color: rgba(200, 200, 220, 0.7);
    letter-spacing: 2px;
    text-transform: uppercase;
    pointer-events: none;
    white-space: nowrap;
  `;
  centerLabel.textContent = "BEND";
  containerEl.appendChild(centerLabel);
  const angleStep = 2 * Math.PI / BENDS.length;
  const startAngle = Math.PI;
  for (let i = 0; i < BENDS.length; i++) {
    const bend = BENDS[i];
    const angle = startAngle + i * angleStep;
    const x = Math.cos(angle) * OPTION_DISTANCE;
    const y = Math.sin(angle) * OPTION_DISTANCE;
    const optEl = createOptionElement(bend, x, y);
    containerEl.appendChild(optEl);
    optionEls.push(optEl);
  }
  document.body.appendChild(containerEl);
}
function createOptionElement(bend, offsetX, offsetY) {
  const el = document.createElement("div");
  el.dataset.bendId = bend.id;
  const colorHex = "#" + bend.tintColor.toString(16).padStart(6, "0");
  el.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    width: ${OPTION_SIZE}px;
    height: ${OPTION_SIZE}px;
    margin-left: ${-OPTION_SIZE / 2 + offsetX}px;
    margin-top: ${-OPTION_SIZE / 2 + offsetY}px;
    border-radius: 50%;
    background: rgba(20, 20, 40, 0.9);
    border: 2px solid ${colorHex}44;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    pointer-events: auto;
    transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    user-select: none;
  `;
  const iconEl = document.createElement("div");
  iconEl.style.cssText = `
    font-size: 20px;
    line-height: 1;
    pointer-events: none;
  `;
  iconEl.textContent = bend.icon;
  el.appendChild(iconEl);
  const nameEl = document.createElement("div");
  nameEl.style.cssText = `
    font-family: 'Courier New', monospace;
    font-size: 9px;
    color: ${colorHex};
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-top: 4px;
    pointer-events: none;
  `;
  nameEl.textContent = bend.name;
  el.appendChild(nameEl);
  el.addEventListener("mouseenter", () => {
    if (selectedBendId === bend.id) return;
    el.style.borderColor = colorHex + "aa";
    el.style.transform = "scale(1.1)";
  });
  el.addEventListener("mouseleave", () => {
    if (selectedBendId === bend.id) return;
    el.style.borderColor = colorHex + "44";
    el.style.transform = "scale(1)";
  });
  el.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    selectBend(bend.id);
  });
  return el;
}
function selectBend(bendId) {
  selectedBendId = bendId;
  for (const optEl of optionEls) {
    const id = optEl.dataset.bendId || "";
    const bend = BENDS.find((b) => b.id === id);
    if (!bend) continue;
    const colorHex = "#" + bend.tintColor.toString(16).padStart(6, "0");
    if (id === bendId) {
      optEl.style.borderColor = colorHex;
      optEl.style.boxShadow = `0 0 16px ${colorHex}88, inset 0 0 8px ${colorHex}44`;
      optEl.style.transform = "scale(1.15)";
    } else {
      optEl.style.borderColor = colorHex + "22";
      optEl.style.boxShadow = "none";
      optEl.style.transform = "scale(0.9)";
      optEl.style.opacity = "0.5";
    }
  }
  if (onBendSelectedCallback) {
    onBendSelectedCallback(bendId);
  }
}
function showRadialMenu() {
  if (!containerEl) return;
  visible = true;
  selectedBendId = null;
  containerEl.style.display = "block";
  for (const optEl of optionEls) {
    const id = optEl.dataset.bendId || "";
    const bend = BENDS.find((b) => b.id === id);
    if (!bend) continue;
    const colorHex = "#" + bend.tintColor.toString(16).padStart(6, "0");
    optEl.style.borderColor = colorHex + "44";
    optEl.style.boxShadow = "none";
    optEl.style.transform = "scale(1)";
    optEl.style.opacity = "1";
  }
}
function hideRadialMenu() {
  if (!containerEl) return;
  visible = false;
  containerEl.style.display = "none";
}
function getSelectedBendId() {
  return selectedBendId;
}
function setOnBendSelected(callback) {
  onBendSelectedCallback = callback;
}
function clearSelectedBend() {
  selectedBendId = null;
  for (const optEl of optionEls) {
    const id = optEl.dataset.bendId || "";
    const bend = BENDS.find((b) => b.id === id);
    if (!bend) continue;
    const colorHex = "#" + bend.tintColor.toString(16).padStart(6, "0");
    optEl.style.borderColor = colorHex + "44";
    optEl.style.boxShadow = "none";
    optEl.style.transform = "scale(1)";
    optEl.style.opacity = "1";
  }
}

// src/engine/bendMode.ts
var bendSystem = createBendSystem(3);
var active2 = false;
var targeting = false;
var maxBends = 3;
var highlightedObjects = /* @__PURE__ */ new Set();
var hoveredObject = null;
var highlightPulseTime = 0;
function initBendMode() {
  maxBends = 3;
  bendSystem = createBendSystem(maxBends);
}
function toggleBendMode() {
  if (active2) {
    deactivateBendMode();
  } else {
    activateBendMode();
  }
}
function activateBendMode() {
  if (bendSystem.bendsRemaining() <= 0) return;
  active2 = true;
  targeting = false;
  if (!isBulletTimeActive()) {
    activateBulletTime();
  }
  showRadialMenu();
  updateTargetingCursor();
  emit({ type: "bendModeActivated" });
}
function deactivateBendMode() {
  active2 = false;
  targeting = false;
  hideRadialMenu();
  clearSelectedBend();
  unhighlightAllObjects();
  updateTargetingCursor();
  if (isBulletTimeActive()) {
    toggleBulletTime();
  }
  emit({ type: "bendModeDeactivated" });
}
function enterTargeting() {
  if (!active2) return;
  targeting = true;
  hideRadialMenu();
  updateTargetingCursor();
}
var targetingIndicator = null;
function ensureTargetingIndicator() {
  if (targetingIndicator) return;
  targetingIndicator = document.createElement("div");
  targetingIndicator.id = "bend-targeting";
  targetingIndicator.style.cssText = `
    position: fixed;
    top: 55%;
    left: 50%;
    transform: translateX(-50%);
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: rgba(100, 180, 255, 0.9);
    letter-spacing: 3px;
    text-transform: uppercase;
    text-shadow: 0 0 10px rgba(100, 140, 255, 0.6);
    pointer-events: none;
    z-index: 200;
    display: none;
  `;
  document.body.appendChild(targetingIndicator);
}
function updateTargetingCursor() {
  ensureTargetingIndicator();
  if (!targetingIndicator) return;
  if (active2 && targeting) {
    const bendId = getSelectedBendId();
    const label = bendId === "enlarge" ? "ENLARGE" : bendId === "shrink" ? "SHRINK" : "BEND";
    targetingIndicator.textContent = `[ ${label} ] click target`;
    targetingIndicator.style.display = "block";
    document.body.style.cursor = "crosshair";
  } else if (active2 && !targeting) {
    targetingIndicator.style.display = "none";
    document.body.style.cursor = "default";
  } else {
    targetingIndicator.style.display = "none";
    document.body.style.cursor = "default";
  }
}
function isBendModeActive() {
  return active2;
}
function isBendTargeting() {
  return targeting;
}
function highlightTargetableObjects(gameState2) {
  for (const obj of gameState2.physicsObjects) {
    if (obj.destroyed || obj.fellInPit || !obj.mesh) continue;
    if (highlightedObjects.has(obj)) continue;
    obj.mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        if (!child.userData._origEmissiveHex) {
          child.userData._origEmissiveHex = child.material.emissive.getHex();
          child.userData._origEmissiveIntensity = child.material.emissiveIntensity;
        }
      }
    });
    highlightedObjects.add(obj);
  }
}
function unhighlightAllObjects() {
  for (const obj of highlightedObjects) {
    if (!obj.mesh) continue;
    obj.mesh.traverse((child) => {
      if (child.isMesh && child.material && child.userData._origEmissiveHex !== void 0) {
        child.material.emissive.setHex(child.userData._origEmissiveHex);
        child.material.emissiveIntensity = child.userData._origEmissiveIntensity;
        delete child.userData._origEmissiveHex;
        delete child.userData._origEmissiveIntensity;
      }
    });
  }
  highlightedObjects.clear();
  hoveredObject = null;
}
function updateHighlightPulse(dt) {
  highlightPulseTime += dt;
  const pulse = 0.5 + 0.5 * Math.sin(highlightPulseTime * 4);
  const baseIntensity = 0.3 + pulse * 0.5;
  const hoverIntensity = 0.6 + pulse * 0.6;
  const highlightColor = 6724095;
  for (const obj of highlightedObjects) {
    if (!obj.mesh) continue;
    const isHovered = obj === hoveredObject;
    obj.mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.emissive.setHex(isHovered ? 8965375 : highlightColor);
        child.material.emissiveIntensity = isHovered ? hoverIntensity : baseIntensity;
      }
    });
  }
}
function updateBendHover(mouseNDC, gameState2) {
  if (!active2 || !targeting) {
    if (hoveredObject) hoveredObject = null;
    return;
  }
  const camera2 = getCamera();
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(mouseNDC.x, mouseNDC.y), camera2);
  const meshes = [];
  const meshToObj = /* @__PURE__ */ new Map();
  for (const obj of gameState2.physicsObjects) {
    if (obj.destroyed || obj.fellInPit || !obj.mesh) continue;
    meshes.push(obj.mesh);
    meshToObj.set(obj.mesh, obj);
  }
  const intersects = raycaster.intersectObjects(meshes, true);
  let newHovered = null;
  if (intersects.length > 0) {
    for (const hit of intersects) {
      let current = hit.object;
      while (current) {
        if (meshToObj.has(current)) {
          newHovered = meshToObj.get(current);
          break;
        }
        current = current.parent;
      }
      if (newHovered) break;
    }
  }
  hoveredObject = newHovered;
}
function updateBendMode(dt, gameState2) {
  if (active2) {
    highlightTargetableObjects(gameState2);
    updateHighlightPulse(dt);
  }
}
function handleBendClick(mouseNDC, gameState2) {
  if (!active2 || !targeting) return;
  const selectedBend = getSelectedBendId();
  if (!selectedBend) return;
  const camera2 = getCamera();
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(mouseNDC.x, mouseNDC.y), camera2);
  const meshes = [];
  const meshToObj = /* @__PURE__ */ new Map();
  for (const obj of gameState2.physicsObjects) {
    if (obj.destroyed || obj.fellInPit || !obj.mesh) continue;
    meshes.push(obj.mesh);
    meshToObj.set(obj.mesh, obj);
  }
  const intersects = raycaster.intersectObjects(meshes, true);
  if (intersects.length > 0) {
    let hitObj = null;
    for (const hit of intersects) {
      let current = hit.object;
      while (current) {
        if (meshToObj.has(current)) {
          hitObj = meshToObj.get(current);
          break;
        }
        current = current.parent;
      }
      if (hitObj) break;
    }
    if (hitObj) {
      tryApplyBendToTarget(hitObj, "physicsObject");
    }
  }
}
function tryApplyBendToTarget(target, targetType) {
  const selectedBend = getSelectedBendId();
  if (!selectedBend) return;
  const result = bendSystem.applyBend(selectedBend, targetType, target);
  if (result.success) {
    highlightedObjects.delete(target);
    if (target.mesh) {
      target.mesh.traverse((child) => {
        if (child.isMesh) {
          delete child.userData._origEmissiveHex;
          delete child.userData._origEmissiveIntensity;
        }
      });
    }
    const bend = getBendById(selectedBend);
    if (bend) {
      applyBendVisuals(target, bend.tintColor);
    }
    emit({
      type: "bendApplied",
      bendId: selectedBend,
      targetType,
      targetId: target.id ?? 0,
      position: { x: target.pos.x, z: target.pos.z }
    });
    targeting = false;
    clearSelectedBend();
    if (bendSystem.bendsRemaining() > 0) {
      showRadialMenu();
    } else {
      deactivateBendMode();
    }
  } else {
    emit({
      type: "bendFailed",
      bendId: selectedBend,
      reason: result.reason || "unknown"
    });
  }
}
function getBendsRemaining() {
  return bendSystem.bendsRemaining();
}
function getMaxBends() {
  return maxBends;
}
function resetBendMode() {
  const activeBends = bendSystem.getActiveBends();
  for (const ab of activeBends) {
    if (ab.target && ab.target.mesh) {
      clearBendVisuals(ab.target);
    }
  }
  bendSystem.resetAll();
  active2 = false;
  targeting = false;
  unhighlightAllObjects();
  highlightPulseTime = 0;
  hideRadialMenu();
  clearSelectedBend();
}

// src/engine/roomManager.ts
var currentRoomIndex = 0;
var packIndex = 0;
var totalKills = 0;
var roomBudgetTotal = 0;
var roomCleared = false;
var spawnCooldownTimer = 0;
var finalWaveAnnounced = false;
var restRoomTimer = 0;
var activeTelegraphs2 = [];
var announceEl = null;
var sceneRef8 = null;
function initRoomManager(scene2) {
  sceneRef8 = scene2;
  announceEl = document.getElementById("wave-announce");
  initTelegraph(scene2);
  initDoor(scene2);
  on("enemyDied", () => {
    totalKills++;
  });
}
function loadRoom(index, gameState2) {
  if (index >= ROOMS.length) {
    showAnnounce("VICTORY!");
    return;
  }
  const room = ROOMS[index];
  currentRoomIndex = index;
  packIndex = 0;
  totalKills = 0;
  roomCleared = false;
  spawnCooldownTimer = 0;
  finalWaveAnnounced = false;
  activeTelegraphs2 = [];
  roomBudgetTotal = room.spawnBudget.packs.reduce(
    (sum, p) => sum + p.enemies.length,
    0
  );
  restRoomTimer = 0;
  clearEnemies(gameState2);
  clearPhysicsObjects(gameState2, sceneRef8);
  resetBendMode();
  releaseAllProjectiles();
  clearMortarProjectiles();
  clearIcePatches();
  clearAoeTelegraphs();
  clearDamageNumbers();
  clearEffectGhosts();
  clearParticles();
  removeDoor();
  setArenaConfig(room.obstacles, room.pits, room.arenaHalfX, room.arenaHalfZ);
  invalidateCollisionBounds();
  rebuildArenaVisuals();
  resetPhysicsObjectIds();
  if (room.physicsObjects) {
    for (const placement of room.physicsObjects) {
      const obj = createPhysicsObject(placement);
      createPhysicsObjectMesh(obj, sceneRef8);
      gameState2.physicsObjects.push(obj);
    }
  }
  setPlayerPosition(room.playerStart.x, room.playerStart.z);
  gameState2.currentWave = index + 1;
  showAnnounce(room.name);
  setTimeout(hideAnnounce, 2e3);
  if (room.isRestRoom) {
    gameState2.playerHealth = gameState2.playerMaxHealth;
    emit({ type: "playerHealed", amount: gameState2.playerMaxHealth, position: { x: room.playerStart.x, z: room.playerStart.z } });
    emit({ type: "restRoomEntered", roomIndex: index });
    roomCleared = true;
    if (index + 1 < ROOMS.length) {
      createDoor(room.arenaHalfX, room.arenaHalfZ, index);
      restRoomTimer = DOOR_CONFIG.restPause;
    }
    return;
  }
  if (room.isVictoryRoom) {
    showAnnounce("VICTORY!");
    emit({ type: "roomCleared", roomIndex: index });
    roomCleared = true;
    return;
  }
  if (index + 1 < ROOMS.length) {
    createDoor(room.arenaHalfX, room.arenaHalfZ, index);
  }
}
function updateRoomManager(dt, gameState2) {
  if (gameState2.phase !== "playing") return;
  const room = ROOMS[currentRoomIndex];
  if (!room) return;
  if (room.isRestRoom && restRoomTimer > 0) {
    restRoomTimer -= dt * 1e3;
    if (restRoomTimer <= 0) {
      unlockDoor();
    }
  }
  const playerPos2 = getPlayerPos();
  const input = getInputState();
  const doorTriggered = updateDoor(dt, playerPos2, input.interact, isPlayerDashing());
  if (doorTriggered) {
    loadRoom(currentRoomIndex + 1, gameState2);
    return;
  }
  for (let i = activeTelegraphs2.length - 1; i >= 0; i--) {
    const tg = activeTelegraphs2[i];
    tg.timer -= dt * 1e3;
    const progress = 1 - tg.timer / tg.duration;
    for (const tel of tg.telegraphs) {
      updateTelegraph(tel, Math.min(progress, 1), dt);
    }
    if (tg.timer <= 0) {
      for (const tel of tg.telegraphs) {
        removeTelegraph2(tel);
      }
      for (let j = 0; j < tg.pack.enemies.length; j++) {
        const enemy = tg.pack.enemies[j];
        const pos = tg.positions[j];
        const spawnPos = new THREE.Vector3(pos.x, 0, pos.z);
        spawnEnemy(enemy.type, spawnPos, gameState2);
      }
      emit({ type: "spawnPackSpawned", packIndex: tg.packIdx, roomIndex: currentRoomIndex });
      activeTelegraphs2.splice(i, 1);
    }
  }
  if (room.isRestRoom || room.isVictoryRoom) return;
  const aliveCount = gameState2.enemies.length;
  const budget = room.spawnBudget;
  const effectiveMaxConcurrent = Math.round(budget.maxConcurrent * SPAWN_CONFIG.maxConcurrentMult);
  if (!finalWaveAnnounced && packIndex >= budget.packs.length && activeTelegraphs2.length === 0 && aliveCount > 0) {
    finalWaveAnnounced = true;
    showAnnounce("FINAL WAVE");
    setTimeout(hideAnnounce, 1500);
  }
  spawnCooldownTimer -= dt * 1e3;
  if (packIndex < budget.packs.length && spawnCooldownTimer <= 0) {
    const nextPack = budget.packs[packIndex];
    const telegraphingCount = activeTelegraphs2.reduce(
      (sum, tg) => sum + tg.pack.enemies.length,
      0
    );
    const totalActive = aliveCount + telegraphingCount;
    if (totalActive + nextPack.enemies.length <= effectiveMaxConcurrent + 1) {
      const positions = resolveSpawnPositions(nextPack, room);
      const telegraphs = positions.map(
        (pos, idx) => createTelegraph(pos.x, pos.z, nextPack.enemies[idx].type)
      );
      const duration = budget.telegraphDuration || SPAWN_CONFIG.telegraphDuration;
      activeTelegraphs2.push({
        telegraphs,
        pack: nextPack,
        positions,
        timer: duration,
        duration,
        packIdx: packIndex
      });
      emit({ type: "spawnPackTelegraph", packIndex, roomIndex: currentRoomIndex });
      packIndex++;
      spawnCooldownTimer = SPAWN_CONFIG.spawnCooldown;
    }
  }
  if (!roomCleared && packIndex >= budget.packs.length && activeTelegraphs2.length === 0 && aliveCount === 0) {
    roomCleared = true;
    emit({ type: "roomCleared", roomIndex: currentRoomIndex });
    emit({ type: "roomClearComplete", roomIndex: currentRoomIndex });
    if (currentRoomIndex + 1 >= ROOMS.length) {
      showAnnounce("VICTORY!");
    } else {
      showAnnounce("Room Cleared!");
      setTimeout(hideAnnounce, 1500);
      unlockDoor();
    }
  }
}
function resolveSpawnPositions(pack2, room) {
  const playerPos2 = getPlayerPos();
  const playerZ = playerPos2 ? playerPos2.z : room.playerStart.z;
  const playerX = playerPos2 ? playerPos2.x : room.playerStart.x;
  const hx = room.arenaHalfX - 1.5;
  const hz = room.arenaHalfZ - 1.5;
  return pack2.enemies.map(() => {
    let x, z;
    for (let attempt = 0; attempt < 10; attempt++) {
      switch (pack2.spawnZone) {
        case "ahead": {
          const aheadMin = SPAWN_CONFIG.spawnAheadMin;
          const aheadMax = SPAWN_CONFIG.spawnAheadMax;
          x = (Math.random() * 2 - 1) * hx;
          z = playerZ - aheadMin - Math.random() * (aheadMax - aheadMin);
          break;
        }
        case "sides": {
          const side = Math.random() < 0.5 ? -1 : 1;
          x = side * (hx * 0.6 + Math.random() * hx * 0.3);
          z = playerZ - 3 - Math.random() * 10;
          break;
        }
        case "far": {
          x = (Math.random() * 2 - 1) * hx;
          z = -hz + 2 + Math.random() * 5;
          break;
        }
        case "behind": {
          x = (Math.random() * 2 - 1) * hx;
          z = playerZ + 5 + Math.random() * 5;
          break;
        }
        default: {
          x = (Math.random() * 2 - 1) * hx;
          z = playerZ - 5 - Math.random() * 10;
        }
      }
      x = Math.max(-hx, Math.min(hx, x));
      z = Math.max(-hz, Math.min(hz, z));
      if (!isInsideObstacle(x, z) && !isInsidePit(x, z)) {
        return { x, z };
      }
    }
    return { x: (Math.random() * 2 - 1) * 3, z: 0 };
  });
}
function isInsideObstacle(x, z) {
  const bounds = getBounds();
  const obstacleCount = bounds.length - 4;
  for (let i = 0; i < obstacleCount; i++) {
    const b = bounds[i];
    if (x >= b.minX - 1 && x <= b.maxX + 1 && z >= b.minZ - 1 && z <= b.maxZ + 1) {
      return true;
    }
  }
  return false;
}
function isInsidePit(x, z) {
  const pits = getPits();
  for (const p of pits) {
    if (x >= p.minX - 0.5 && x <= p.maxX + 0.5 && z >= p.minZ - 0.5 && z <= p.maxZ + 0.5) {
      return true;
    }
  }
  return false;
}
function resetRoomManager() {
  currentRoomIndex = 0;
  packIndex = 0;
  totalKills = 0;
  roomBudgetTotal = 0;
  roomCleared = false;
  spawnCooldownTimer = 0;
  finalWaveAnnounced = false;
  restRoomTimer = 0;
  activeTelegraphs2 = [];
  removeDoor();
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

// src/ui/hud.ts
var healthBar;
var healthText;
var waveIndicator;
var currencyCount;
var abilityBar;
var bulletTimeMeter;
var bulletTimeFill;
var btVignette;
var btCeremony;
var btCeremonyTimeout = null;
var bendCounter = null;
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
  bulletTimeMeter = document.createElement("div");
  bulletTimeMeter.id = "bullet-time-meter";
  bulletTimeMeter.style.cssText = `
    position: fixed;
    top: 44px;
    left: 20px;
    width: 220px;
    height: 6px;
    background: rgba(20, 20, 40, 0.7);
    border: 1px solid rgba(100, 140, 255, 0.3);
    border-radius: 3px;
    z-index: 50;
    overflow: hidden;
  `;
  bulletTimeFill = document.createElement("div");
  bulletTimeFill.style.cssText = `
    width: 100%;
    height: 100%;
    background: #6688ff;
    border-radius: 2px;
    transition: background-color 0.15s ease;
  `;
  bulletTimeMeter.appendChild(bulletTimeFill);
  const btLabel = document.createElement("div");
  btLabel.style.cssText = `
    position: absolute;
    top: -1px;
    right: -50px;
    font-size: 8px;
    color: rgba(100, 140, 255, 0.6);
    letter-spacing: 1px;
    font-family: 'Courier New', monospace;
    pointer-events: none;
  `;
  btLabel.textContent = "Q \u2014 SLOW";
  bulletTimeMeter.appendChild(btLabel);
  document.body.appendChild(bulletTimeMeter);
  btVignette = document.createElement("div");
  btVignette.id = "bt-vignette";
  btVignette.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    pointer-events: none;
    z-index: 40;
    opacity: 0;
    transition: opacity 0.3s ease;
    background: radial-gradient(ellipse at center, transparent 50%, rgba(100, 140, 255, 0.15) 100%);
    box-shadow: inset 0 0 80px rgba(100, 140, 255, 0.2);
  `;
  document.body.appendChild(btVignette);
  btCeremony = document.createElement("div");
  btCeremony.id = "bt-ceremony";
  btCeremony.style.cssText = `
    position: fixed;
    top: 18%;
    left: 50%;
    transform: translateX(-50%);
    font-size: 14px;
    font-family: 'Courier New', monospace;
    color: rgba(100, 160, 255, 0.9);
    letter-spacing: 6px;
    text-transform: uppercase;
    text-shadow: 0 0 12px rgba(100, 140, 255, 0.6), 0 0 30px rgba(100, 140, 255, 0.3);
    pointer-events: none;
    z-index: 55;
    opacity: 0;
    transition: opacity 0.2s ease;
  `;
  document.body.appendChild(btCeremony);
  bendCounter = document.createElement("div");
  bendCounter.id = "bend-counter";
  bendCounter.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: rgba(100, 160, 255, 0.9);
    letter-spacing: 1px;
    text-shadow: 0 0 6px rgba(100, 140, 255, 0.4);
    z-index: 50;
    pointer-events: none;
  `;
  bendCounter.textContent = "Bends: 3/3";
  document.body.appendChild(bendCounter);
  on("bulletTimeActivated", () => {
    if (btVignette) btVignette.style.opacity = "1";
    showBTCeremony("BULLET TIME ENGAGED", 1200);
  });
  on("bulletTimeDeactivated", () => {
    if (btVignette) btVignette.style.opacity = "0";
    showBTCeremony("BULLET TIME ENDED", 800);
  });
}
function showBTCeremony(text, durationMs) {
  if (!btCeremony) return;
  if (btCeremonyTimeout) clearTimeout(btCeremonyTimeout);
  btCeremony.textContent = text;
  btCeremony.style.opacity = "1";
  btCeremonyTimeout = setTimeout(() => {
    btCeremony.style.opacity = "0";
    btCeremonyTimeout = null;
  }, durationMs);
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
  let isDragging3 = false;
  btnEl.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (touchId !== null) return;
    const touch = e.changedTouches[0];
    touchId = touch.identifier;
    startX = touch.clientX;
    startY = touch.clientY;
    isDragging3 = false;
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
      isDragging3 = true;
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
    onRelease(isDragging3);
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
  if (bendCounter) {
    const remaining = getBendsRemaining();
    const max = getMaxBends();
    bendCounter.textContent = `Bends: ${remaining}/${max}`;
    bendCounter.style.display = gameState2.phase === "playing" ? "block" : "none";
  }
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
  if (bulletTimeFill) {
    const btPct = getBulletTimeResource() / getBulletTimeMax();
    bulletTimeFill.style.width = btPct * 100 + "%";
    const btActive = isBulletTimeActive();
    bulletTimeFill.style.backgroundColor = btActive ? "#ffcc44" : "#6688ff";
    if (bulletTimeMeter) {
      bulletTimeMeter.style.borderColor = btActive ? "rgba(255, 204, 68, 0.6)" : "rgba(100, 140, 255, 0.3)";
    }
  }
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

// src/engine/audio.ts
var AUDIO_CONFIG = {
  masterVolume: 0.3,
  hitVolume: 0.4,
  deathVolume: 0.5,
  dashVolume: 0.25,
  shieldBreakVolume: 0.6,
  chargeVolume: 0.35,
  waveClearVolume: 0.4,
  playerHitVolume: 0.5,
  meleeSwingVolume: 0.3,
  meleeHitVolume: 0.45,
  wallSlamVolume: 0.5,
  enemyImpactVolume: 0.4,
  objectImpactVolume: 0.4,
  obstacleBreakVolume: 0.5,
  bendApplyVolume: 0.3,
  enabled: true
};
var ctx2 = null;
var masterGain = null;
var initialized2 = false;
function initAudio() {
  if (initialized2) return;
  try {
    ctx2 = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx2.createGain();
    masterGain.gain.value = AUDIO_CONFIG.masterVolume;
    masterGain.connect(ctx2.destination);
    initialized2 = true;
    wireEventBus2();
    const muteBtn = document.getElementById("mute-btn");
    if (muteBtn) {
      muteBtn.addEventListener("click", () => {
        AUDIO_CONFIG.enabled = !AUDIO_CONFIG.enabled;
        if (masterGain) {
          masterGain.gain.value = AUDIO_CONFIG.enabled ? AUDIO_CONFIG.masterVolume : 0;
        }
        muteBtn.textContent = AUDIO_CONFIG.enabled ? "\u{1F50A}" : "\u{1F507}";
        muteBtn.classList.toggle("muted", !AUDIO_CONFIG.enabled);
      });
    }
  } catch (e) {
    console.warn("[audio] Web Audio API not available:", e);
  }
}
function resumeAudio() {
  if (ctx2 && ctx2.state === "suspended") {
    ctx2.resume();
  }
}
function setMasterVolume(v) {
  AUDIO_CONFIG.masterVolume = v;
  if (masterGain) {
    masterGain.gain.value = v;
  }
}
function createNoiseBuffer(duration) {
  if (!ctx2) return new AudioBuffer({ length: 1, sampleRate: 44100 });
  const length = Math.floor(ctx2.sampleRate * duration);
  const buffer = ctx2.createBuffer(1, length, ctx2.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}
function playHit(intensity = 1) {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const vol = AUDIO_CONFIG.hitVolume * Math.min(intensity, 2);
  const duration = 0.06 + intensity * 0.02;
  const noise = ctx2.createBufferSource();
  noise.buffer = createNoiseBuffer(duration);
  const noiseGain = ctx2.createGain();
  noiseGain.gain.setValueAtTime(vol * 0.6, now);
  noiseGain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  const noiseFilter = ctx2.createBiquadFilter();
  noiseFilter.type = "highpass";
  noiseFilter.frequency.value = 2e3 + intensity * 500;
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
  const osc = ctx2.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(200 + intensity * 80, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + duration);
  const oscGain = ctx2.createGain();
  oscGain.gain.setValueAtTime(vol * 0.3, now);
  oscGain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  osc.connect(oscGain);
  oscGain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
}
function playDeath() {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const duration = 0.2;
  const osc = ctx2.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(400, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + duration);
  const gain = ctx2.createGain();
  gain.gain.setValueAtTime(AUDIO_CONFIG.deathVolume * 0.4, now);
  gain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
  const noise = ctx2.createBufferSource();
  noise.buffer = createNoiseBuffer(duration * 0.7);
  const nGain = ctx2.createGain();
  nGain.gain.setValueAtTime(AUDIO_CONFIG.deathVolume * 0.2, now);
  nGain.gain.exponentialRampToValueAtTime(1e-3, now + duration * 0.7);
  noise.connect(nGain);
  nGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}
function playDash() {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const duration = 0.15;
  const noise = ctx2.createBufferSource();
  noise.buffer = createNoiseBuffer(duration);
  const filter = ctx2.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(800, now);
  filter.frequency.exponentialRampToValueAtTime(3e3, now + duration * 0.3);
  filter.frequency.exponentialRampToValueAtTime(400, now + duration);
  filter.Q.value = 2;
  const gain = ctx2.createGain();
  gain.gain.setValueAtTime(AUDIO_CONFIG.dashVolume, now);
  gain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}
function playShieldBreak() {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const duration = 0.3;
  const noise = ctx2.createBufferSource();
  noise.buffer = createNoiseBuffer(duration);
  const filter = ctx2.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1200;
  filter.Q.value = 8;
  const nGain = ctx2.createGain();
  nGain.gain.setValueAtTime(AUDIO_CONFIG.shieldBreakVolume * 0.5, now);
  nGain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  noise.connect(filter);
  filter.connect(nGain);
  nGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
  const osc = ctx2.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = 880;
  const oscGain = ctx2.createGain();
  oscGain.gain.setValueAtTime(AUDIO_CONFIG.shieldBreakVolume * 0.3, now);
  oscGain.gain.exponentialRampToValueAtTime(1e-3, now + duration * 0.8);
  osc.connect(oscGain);
  oscGain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
}
function playChargeFire(chargeT) {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const duration = 0.15 + chargeT * 0.1;
  const osc = ctx2.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(80 + chargeT * 40, now);
  osc.frequency.exponentialRampToValueAtTime(30, now + duration);
  const gain = ctx2.createGain();
  gain.gain.setValueAtTime(AUDIO_CONFIG.chargeVolume * (0.5 + chargeT * 0.5), now);
  gain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
  const noise = ctx2.createBufferSource();
  noise.buffer = createNoiseBuffer(duration * 0.6);
  const nGain = ctx2.createGain();
  nGain.gain.setValueAtTime(AUDIO_CONFIG.chargeVolume * 0.3 * chargeT, now);
  nGain.gain.exponentialRampToValueAtTime(1e-3, now + duration * 0.6);
  noise.connect(nGain);
  nGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}
function playWaveClear() {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const notes = [523, 659, 784];
  const noteLen = 0.12;
  notes.forEach((freq, i) => {
    const osc = ctx2.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = ctx2.createGain();
    const start = now + i * 0.08;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(AUDIO_CONFIG.waveClearVolume * 0.3, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(1e-3, start + noteLen);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(start);
    osc.stop(start + noteLen);
  });
}
function playPlayerHit() {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const duration = 0.08;
  const osc = ctx2.createOscillator();
  osc.type = "square";
  osc.frequency.value = 150;
  const gain = ctx2.createGain();
  gain.gain.setValueAtTime(AUDIO_CONFIG.playerHitVolume * 0.3, now);
  gain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
  const noise = ctx2.createBufferSource();
  noise.buffer = createNoiseBuffer(duration);
  const nGain = ctx2.createGain();
  nGain.gain.setValueAtTime(AUDIO_CONFIG.playerHitVolume * 0.4, now);
  nGain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  noise.connect(nGain);
  nGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}
function playMeleeSwing() {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const duration = 0.12;
  const noise = ctx2.createBufferSource();
  noise.buffer = createNoiseBuffer(duration);
  const filter = ctx2.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(1500, now);
  filter.frequency.exponentialRampToValueAtTime(5e3, now + duration);
  const gain = ctx2.createGain();
  gain.gain.setValueAtTime(AUDIO_CONFIG.meleeSwingVolume, now);
  gain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}
function playMeleeHit() {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const duration = 0.08;
  const osc = ctx2.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(50, now + duration);
  const oscGain = ctx2.createGain();
  oscGain.gain.setValueAtTime(AUDIO_CONFIG.meleeHitVolume * 0.5, now);
  oscGain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  osc.connect(oscGain);
  oscGain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
  const noise = ctx2.createBufferSource();
  noise.buffer = createNoiseBuffer(duration * 0.6);
  const filter = ctx2.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 3e3;
  filter.Q.value = 3;
  const nGain = ctx2.createGain();
  nGain.gain.setValueAtTime(AUDIO_CONFIG.meleeHitVolume * 0.4, now);
  nGain.gain.exponentialRampToValueAtTime(1e-3, now + duration * 0.6);
  noise.connect(filter);
  filter.connect(nGain);
  nGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}
function playWallSlam(intensity = 1) {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const duration = 0.15;
  const vol = AUDIO_CONFIG.wallSlamVolume * Math.min(intensity, 2);
  const osc = ctx2.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(80, now);
  osc.frequency.exponentialRampToValueAtTime(30, now + duration);
  const oscGain = ctx2.createGain();
  oscGain.gain.setValueAtTime(vol * 0.6, now);
  oscGain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  osc.connect(oscGain);
  oscGain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
  const noise = ctx2.createBufferSource();
  noise.buffer = createNoiseBuffer(duration * 0.5);
  const filter = ctx2.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2e3;
  filter.Q.value = 2;
  const nGain = ctx2.createGain();
  nGain.gain.setValueAtTime(vol * 0.4, now);
  nGain.gain.exponentialRampToValueAtTime(1e-3, now + duration * 0.5);
  noise.connect(filter);
  filter.connect(nGain);
  nGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}
function playEnemyImpact(intensity = 1) {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const duration = 0.1;
  const vol = AUDIO_CONFIG.enemyImpactVolume * Math.min(intensity, 2);
  const osc = ctx2.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + duration);
  const oscGain = ctx2.createGain();
  oscGain.gain.setValueAtTime(vol * 0.5, now);
  oscGain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  osc.connect(oscGain);
  oscGain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
  const noise = ctx2.createBufferSource();
  noise.buffer = createNoiseBuffer(duration * 0.4);
  const filter = ctx2.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1500;
  filter.Q.value = 3;
  const nGain = ctx2.createGain();
  nGain.gain.setValueAtTime(vol * 0.3, now);
  nGain.gain.exponentialRampToValueAtTime(1e-3, now + duration * 0.4);
  noise.connect(filter);
  filter.connect(nGain);
  nGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}
function playDoorUnlock() {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const notes = [392, 523, 659, 784];
  const noteLen = 0.18;
  notes.forEach((freq, i) => {
    const osc = ctx2.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = ctx2.createGain();
    const start = now + i * 0.1;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(AUDIO_CONFIG.waveClearVolume * 0.35, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(1e-3, start + noteLen);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(start);
    osc.stop(start + noteLen);
  });
}
function playHeal() {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const osc = ctx2.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(330, now);
  osc.frequency.linearRampToValueAtTime(660, now + 0.4);
  const gain = ctx2.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(1e-3, now + 0.5);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.5);
}
function playObjectImpact(intensity = 1) {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const duration = 0.12;
  const vol = AUDIO_CONFIG.objectImpactVolume * Math.min(intensity, 2);
  const osc = ctx2.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(100, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + duration);
  const oscGain = ctx2.createGain();
  oscGain.gain.setValueAtTime(vol * 0.5, now);
  oscGain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  osc.connect(oscGain);
  oscGain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
  const noise = ctx2.createBufferSource();
  noise.buffer = createNoiseBuffer(duration * 0.4);
  const filter = ctx2.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1500;
  filter.Q.value = 2;
  const nGain = ctx2.createGain();
  nGain.gain.setValueAtTime(vol * 0.3, now);
  nGain.gain.exponentialRampToValueAtTime(1e-3, now + duration * 0.4);
  noise.connect(filter);
  filter.connect(nGain);
  nGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}
function playObstacleBreak() {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const duration = 0.25;
  const vol = AUDIO_CONFIG.obstacleBreakVolume;
  const osc = ctx2.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.exponentialRampToValueAtTime(50, now + duration);
  const oscGain = ctx2.createGain();
  oscGain.gain.setValueAtTime(vol * 0.4, now);
  oscGain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  osc.connect(oscGain);
  oscGain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
  const noise = ctx2.createBufferSource();
  noise.buffer = createNoiseBuffer(duration * 0.6);
  const filter = ctx2.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1800;
  filter.Q.value = 4;
  const nGain = ctx2.createGain();
  nGain.gain.setValueAtTime(vol * 0.5, now);
  nGain.gain.exponentialRampToValueAtTime(1e-3, now + duration * 0.6);
  noise.connect(filter);
  filter.connect(nGain);
  nGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}
function playBendApply() {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const duration = 0.3;
  const vol = AUDIO_CONFIG.bendApplyVolume;
  const osc1 = ctx2.createOscillator();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(400, now);
  osc1.frequency.exponentialRampToValueAtTime(800, now + duration * 0.6);
  const gain1 = ctx2.createGain();
  gain1.gain.setValueAtTime(vol * 0.4, now);
  gain1.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  osc1.connect(gain1);
  gain1.connect(masterGain);
  osc1.start(now);
  osc1.stop(now + duration);
  const osc2 = ctx2.createOscillator();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(406, now);
  osc2.frequency.exponentialRampToValueAtTime(812, now + duration * 0.6);
  const gain2 = ctx2.createGain();
  gain2.gain.setValueAtTime(vol * 0.3, now);
  gain2.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  osc2.connect(gain2);
  gain2.connect(masterGain);
  osc2.start(now);
  osc2.stop(now + duration);
}
function wireEventBus2() {
  on("enemyHit", (e) => {
    if (e.type === "enemyHit") playHit(e.damage / 15);
  });
  on("enemyDied", () => playDeath());
  on("playerHit", () => playPlayerHit());
  on("playerDash", () => playDash());
  on("shieldBreak", () => playShieldBreak());
  on("chargeFired", (e) => {
    if (e.type === "chargeFired") playChargeFire(e.chargeT);
  });
  on("waveCleared", () => playWaveClear());
  on("roomCleared", () => playWaveClear());
  on("roomClearComplete", () => playDoorUnlock());
  on("playerHealed", () => playHeal());
  on("meleeSwing", () => playMeleeSwing());
  on("meleeHit", () => playMeleeHit());
  on("wallSlam", (e) => {
    if (e.type === "wallSlam") playWallSlam(e.speed / 5);
  });
  on("enemyImpact", (e) => {
    if (e.type === "enemyImpact") playEnemyImpact(e.speed / 5);
  });
  on("objectWallSlam", (e) => {
    if (e.type === "objectWallSlam") playWallSlam(Math.min(e.speed / 8, 1));
  });
  on("objectImpact", (e) => {
    if (e.type === "objectImpact") playObjectImpact(Math.min(e.speed / 8, 1));
  });
  on("obstacleDestroyed", () => playObstacleBreak());
  on("objectPitFall", () => playDeath());
  on("bendApplied", () => playBendApply());
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
  const snap2 = {};
  for (const [prefix, root] of Object.entries(CONFIG_ROOTS)) {
    snap2[prefix] = JSON.parse(JSON.stringify(root));
  }
  return snap2;
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
var SECTIONS = [
  // ── Combat ──
  {
    section: "Projectiles",
    items: [
      {
        label: "Fire Rate",
        config: () => PLAYER,
        key: "fireRate",
        min: 50,
        max: 1e3,
        step: 10,
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
        unit: "u",
        tip: "Player projectile collision radius in world units."
      }
    ]
  },
  {
    section: "Player",
    items: [
      {
        label: "Move Speed",
        config: () => PLAYER,
        key: "speed",
        min: 2,
        max: 16,
        step: 0.5,
        unit: "u/s",
        tip: "Player movement speed in units per second."
      }
    ]
  },
  {
    section: "Melee",
    collapsed: true,
    items: [
      {
        label: "Damage",
        config: () => MELEE,
        key: "damage",
        min: 5,
        max: 60,
        step: 1,
        unit: "",
        tip: "Melee swing damage per hit."
      },
      {
        label: "Range",
        config: () => MELEE,
        key: "range",
        min: 1,
        max: 4,
        step: 0.2,
        unit: "u",
        tip: "How far the swing reaches from player center."
      },
      {
        label: "Arc",
        config: () => MELEE,
        key: "arc",
        min: 1,
        max: 3.5,
        step: 0.1,
        unit: "rad",
        tip: "Hit cone width in radians (~2.4 = 137\xB0)."
      },
      {
        label: "Cooldown",
        config: () => MELEE,
        key: "cooldown",
        min: 100,
        max: 800,
        step: 10,
        unit: "ms",
        tip: "Time between swings."
      },
      {
        label: "Knockback",
        config: () => MELEE,
        key: "knockback",
        min: 0,
        max: 4,
        step: 0.25,
        unit: "u",
        tip: "Distance enemies are pushed on hit."
      },
      {
        label: "Auto Range",
        config: () => MELEE,
        key: "autoTargetRange",
        min: 1,
        max: 6,
        step: 0.5,
        unit: "u",
        tip: "Radius to search for auto-targeting snap."
      },
      {
        label: "Auto Arc",
        config: () => MELEE,
        key: "autoTargetArc",
        min: 1,
        max: 3.5,
        step: 0.1,
        unit: "rad",
        tip: "Cone width for auto-targeting snap."
      },
      {
        label: "Shake",
        config: () => MELEE,
        key: "screenShake",
        min: 0,
        max: 4,
        step: 0.25,
        unit: "",
        tip: "Screen shake intensity on melee hit."
      },
      {
        label: "Hit Pause",
        config: () => MELEE,
        key: "hitPause",
        min: 0,
        max: 100,
        step: 5,
        unit: "ms",
        tip: "Freeze-frame duration on melee hit (juice)."
      }
    ]
  },
  {
    section: "Mob Global",
    items: [
      {
        label: "Speed Mult",
        config: () => MOB_GLOBAL,
        key: "speedMult",
        min: 0.2,
        max: 3,
        step: 0.1,
        unit: "x",
        tip: "Global speed multiplier for all enemies."
      },
      {
        label: "Damage Mult",
        config: () => MOB_GLOBAL,
        key: "damageMult",
        min: 0.2,
        max: 3,
        step: 0.1,
        unit: "x",
        tip: "Global damage multiplier for all enemies."
      },
      {
        label: "Health Mult",
        config: () => MOB_GLOBAL,
        key: "healthMult",
        min: 0.2,
        max: 3,
        step: 0.1,
        unit: "x",
        tip: "Global health multiplier for all enemies."
      },
      {
        label: "Telegraph Mult",
        config: () => MOB_GLOBAL,
        key: "telegraphMult",
        min: 0.2,
        max: 3,
        step: 0.1,
        unit: "x",
        tip: "Global telegraph duration multiplier. Higher = more reaction time."
      },
      {
        label: "Recovery Mult",
        config: () => MOB_GLOBAL,
        key: "recoveryMult",
        min: 0.2,
        max: 3,
        step: 0.1,
        unit: "x",
        tip: "Global recovery duration multiplier. Higher = bigger punish windows."
      }
    ]
  },
  // ── Dash / Abilities ──
  {
    section: "Dash",
    collapsed: true,
    items: [
      {
        label: "Cooldown",
        config: () => ABILITIES.dash,
        key: "cooldown",
        min: 500,
        max: 1e4,
        step: 100,
        unit: "ms",
        tip: "Dash cooldown in milliseconds."
      },
      {
        label: "Duration",
        config: () => ABILITIES.dash,
        key: "duration",
        min: 50,
        max: 500,
        step: 10,
        unit: "ms",
        tip: "How long the dash lasts."
      },
      {
        label: "Distance",
        config: () => ABILITIES.dash,
        key: "distance",
        min: 1,
        max: 15,
        step: 0.5,
        unit: "u",
        tip: "Total distance covered by dash."
      },
      {
        label: "End Lag",
        config: () => ABILITIES.dash,
        key: "endLag",
        min: 0,
        max: 300,
        step: 10,
        unit: "ms",
        tip: "Recovery time after dash where movement is locked."
      },
      {
        label: "Afterimages",
        config: () => ABILITIES.dash,
        key: "afterimageCount",
        min: 0,
        max: 8,
        step: 1,
        unit: "",
        tip: "Number of ghost afterimages spawned during dash."
      },
      {
        label: "Ghost Fade",
        config: () => ABILITIES.dash,
        key: "afterimageFadeDuration",
        min: 50,
        max: 1e3,
        step: 25,
        unit: "ms",
        tip: "How long afterimage ghosts take to fade out."
      },
      {
        label: "Shake",
        config: () => ABILITIES.dash,
        key: "screenShakeOnStart",
        min: 0,
        max: 8,
        step: 0.5,
        unit: "",
        tip: "Screen shake intensity on dash start."
      }
    ]
  },
  // ── Force Push ──
  {
    section: "Force Push",
    collapsed: true,
    items: [
      {
        label: "Cooldown",
        config: () => ABILITIES.ultimate,
        key: "cooldown",
        min: 100,
        max: 15e3,
        step: 100,
        unit: "ms",
        tip: "Force push cooldown."
      },
      {
        label: "Charge Time",
        config: () => ABILITIES.ultimate,
        key: "chargeTimeMs",
        min: 200,
        max: 5e3,
        step: 100,
        unit: "ms",
        tip: "Time to fully charge."
      },
      {
        label: "Min Length",
        config: () => ABILITIES.ultimate,
        key: "minLength",
        min: 1,
        max: 8,
        step: 0.5,
        unit: "u",
        tip: "Uncharged push range."
      },
      {
        label: "Max Length",
        config: () => ABILITIES.ultimate,
        key: "maxLength",
        min: 4,
        max: 25,
        step: 1,
        unit: "u",
        tip: "Fully charged push range."
      },
      {
        label: "Width",
        config: () => ABILITIES.ultimate,
        key: "width",
        min: 1,
        max: 10,
        step: 0.5,
        unit: "u",
        tip: "Push zone width."
      },
      {
        label: "Min Knockback",
        config: () => ABILITIES.ultimate,
        key: "minKnockback",
        min: 0.5,
        max: 5,
        step: 0.25,
        unit: "u",
        tip: "Knockback force at minimum charge."
      },
      {
        label: "Max Knockback",
        config: () => ABILITIES.ultimate,
        key: "maxKnockback",
        min: 2,
        max: 15,
        step: 0.5,
        unit: "u",
        tip: "Knockback force at full charge."
      },
      {
        label: "Move Mult",
        config: () => ABILITIES.ultimate,
        key: "chargeMoveSpeedMult",
        min: 0,
        max: 1,
        step: 0.05,
        unit: "x",
        tip: "Movement speed multiplier while charging."
      }
    ]
  },
  // ── Bullet Time ──
  {
    section: "Bullet Time",
    collapsed: true,
    items: [
      {
        label: "Time Scale",
        config: () => BULLET_TIME,
        key: "timeScale",
        min: 0.05,
        max: 0.8,
        step: 0.05,
        unit: "x",
        tip: "How slow the world runs during bullet time (0.25 = 25% speed)."
      },
      {
        label: "Max Resource",
        config: () => BULLET_TIME,
        key: "maxResource",
        min: 500,
        max: 1e4,
        step: 500,
        unit: "ms",
        tip: "Total bullet time available at full bar."
      },
      {
        label: "Drain Rate",
        config: () => BULLET_TIME,
        key: "drainRate",
        min: 200,
        max: 3e3,
        step: 100,
        unit: "ms/s",
        tip: "How fast the bar drains per real second."
      },
      {
        label: "Kill Refill",
        config: () => BULLET_TIME,
        key: "killRefill",
        min: 100,
        max: 2e3,
        step: 100,
        unit: "ms",
        tip: "Resource refilled per enemy kill."
      },
      {
        label: "Min Activate",
        config: () => BULLET_TIME,
        key: "activationMinimum",
        min: 0,
        max: 1e3,
        step: 50,
        unit: "ms",
        tip: "Minimum resource required to activate bullet time."
      },
      {
        label: "Infinite",
        config: () => BULLET_TIME,
        key: "infinite",
        min: 0,
        max: 1,
        step: 1,
        unit: "",
        tip: "1 = infinite bullet time (no drain). 0 = normal drain."
      }
    ]
  },
  // ── Physics ──
  {
    section: "Physics",
    collapsed: true,
    items: [
      {
        label: "Friction",
        config: () => PHYSICS,
        key: "friction",
        min: 2,
        max: 30,
        step: 1,
        unit: "u/s\xB2",
        tip: "Knockback deceleration. Higher = snappier stop."
      },
      {
        label: "Push Instant %",
        config: () => PHYSICS,
        key: "pushInstantRatio",
        min: 0,
        max: 1,
        step: 0.05,
        unit: "",
        tip: "Fraction of knockback applied as instant offset. 1.0 = old instant feel."
      },
      {
        label: "Wave Block Rad",
        config: () => PHYSICS,
        key: "pushWaveBlockRadius",
        min: 0,
        max: 2,
        step: 0.1,
        unit: "u",
        tip: "Lateral distance for enemy occlusion. Nearer enemies block push to those behind. 0 = no blocking."
      },
      {
        label: "Slam Min Speed",
        config: () => PHYSICS,
        key: "wallSlamMinSpeed",
        min: 0,
        max: 10,
        step: 0.5,
        unit: "u/s",
        tip: "Minimum impact speed for wall slam damage."
      },
      {
        label: "Slam Damage",
        config: () => PHYSICS,
        key: "wallSlamDamage",
        min: 1,
        max: 20,
        step: 1,
        unit: "/unit",
        tip: "Damage per unit of speed above slam threshold."
      },
      {
        label: "Slam Stun",
        config: () => PHYSICS,
        key: "wallSlamStun",
        min: 0,
        max: 1e3,
        step: 50,
        unit: "ms",
        tip: "Stun duration on wall slam."
      },
      {
        label: "Slam Bounce",
        config: () => PHYSICS,
        key: "wallSlamBounce",
        min: 0,
        max: 1,
        step: 0.05,
        unit: "",
        tip: "Velocity reflection on wall hit. 0 = dead stop, 1 = perfect bounce."
      },
      {
        label: "Slam Shake",
        config: () => PHYSICS,
        key: "wallSlamShake",
        min: 0,
        max: 8,
        step: 0.5,
        unit: "",
        tip: "Screen shake intensity on wall slam."
      },
      {
        label: "Enemy Bounce",
        config: () => PHYSICS,
        key: "enemyBounce",
        min: 0,
        max: 1,
        step: 0.05,
        unit: "",
        tip: "Enemy-enemy collision restitution. 0 = stick, 1 = full bounce."
      },
      {
        label: "Impact Min Spd",
        config: () => PHYSICS,
        key: "impactMinSpeed",
        min: 0,
        max: 10,
        step: 0.5,
        unit: "u/s",
        tip: "Minimum relative speed for enemy-enemy impact damage."
      },
      {
        label: "Impact Damage",
        config: () => PHYSICS,
        key: "impactDamage",
        min: 1,
        max: 20,
        step: 1,
        unit: "/unit",
        tip: "Damage per unit of speed above impact threshold."
      },
      {
        label: "Impact Stun",
        config: () => PHYSICS,
        key: "impactStun",
        min: 0,
        max: 1e3,
        step: 50,
        unit: "ms",
        tip: "Stun duration when enemies collide at speed."
      }
    ]
  },
  // ── Animation ──
  {
    section: "Animation \u2014 Run",
    collapsed: true,
    items: [
      {
        label: "Cycle Rate",
        config: () => C,
        key: "runCycleRate",
        min: 0.1,
        max: 1,
        step: 0.05,
        unit: "",
        tip: "Full leg cycles per world unit traveled."
      },
      {
        label: "Stride Angle",
        config: () => C,
        key: "strideAngle",
        min: 0.1,
        max: 1.5,
        step: 0.05,
        unit: "rad",
        tip: "Thigh swing amplitude in radians."
      },
      {
        label: "Knee Bend",
        config: () => C,
        key: "kneeBendMax",
        min: 0.1,
        max: 1.5,
        step: 0.05,
        unit: "rad",
        tip: "Maximum forward knee bend."
      },
      {
        label: "Arm Swing",
        config: () => C,
        key: "armSwingRatio",
        min: 0,
        max: 1.5,
        step: 0.05,
        unit: "x",
        tip: "Arm swing as fraction of leg amplitude."
      },
      {
        label: "Body Bounce",
        config: () => C,
        key: "bodyBounceHeight",
        min: 0,
        max: 0.1,
        step: 5e-3,
        unit: "u",
        tip: "Vertical bounce per step in world units."
      },
      {
        label: "Lean",
        config: () => C,
        key: "forwardLean",
        min: 0,
        max: 0.3,
        step: 0.01,
        unit: "rad",
        tip: "Forward lean into movement direction."
      },
      {
        label: "Lean Speed",
        config: () => C,
        key: "forwardLeanSpeed",
        min: 1,
        max: 20,
        step: 1,
        unit: "/s",
        tip: "How fast lean blends in/out per second."
      },
      {
        label: "Hip Turn",
        config: () => C,
        key: "hipTurnSpeed",
        min: 2,
        max: 30,
        step: 1,
        unit: "rad/s",
        tip: "How fast legs reorient to movement direction."
      }
    ]
  },
  {
    section: "Animation \u2014 Idle",
    collapsed: true,
    items: [
      {
        label: "Breath Rate",
        config: () => C,
        key: "breathRate",
        min: 0.5,
        max: 5,
        step: 0.1,
        unit: "Hz",
        tip: "Breathing oscillation speed."
      },
      {
        label: "Breath Amp",
        config: () => C,
        key: "breathAmplitude",
        min: 0,
        max: 0.06,
        step: 5e-3,
        unit: "u",
        tip: "Vertical breathing displacement."
      },
      {
        label: "Weight Shift",
        config: () => C,
        key: "weightShiftRate",
        min: 0.1,
        max: 2,
        step: 0.1,
        unit: "Hz",
        tip: "Side-to-side weight shift speed."
      },
      {
        label: "Shift Angle",
        config: () => C,
        key: "weightShiftAngle",
        min: 0,
        max: 0.15,
        step: 5e-3,
        unit: "rad",
        tip: "Weight shift lean angle."
      },
      {
        label: "Head Drift",
        config: () => C,
        key: "headDriftRate",
        min: 0.1,
        max: 2,
        step: 0.1,
        unit: "Hz",
        tip: "Head drift oscillation speed."
      },
      {
        label: "Head Angle",
        config: () => C,
        key: "headDriftAngle",
        min: 0,
        max: 0.1,
        step: 5e-3,
        unit: "rad",
        tip: "Head drift max rotation."
      },
      {
        label: "Arm Droop",
        config: () => C,
        key: "idleArmDroop",
        min: 0,
        max: 0.5,
        step: 0.01,
        unit: "rad",
        tip: "Slight outward arm droop at idle."
      }
    ]
  },
  {
    section: "Animation \u2014 Dash",
    collapsed: true,
    items: [
      {
        label: "Squash Y",
        config: () => C,
        key: "squashScaleY",
        min: 0.5,
        max: 1,
        step: 0.05,
        unit: "",
        tip: "Y scale during dash wind-up (< 1 = squash)."
      },
      {
        label: "Squash XZ",
        config: () => C,
        key: "squashScaleXZ",
        min: 1,
        max: 1.5,
        step: 0.05,
        unit: "",
        tip: "XZ scale during dash wind-up (> 1 = widen)."
      },
      {
        label: "Stretch Y",
        config: () => C,
        key: "stretchScaleY",
        min: 1,
        max: 1.5,
        step: 0.05,
        unit: "",
        tip: "Y scale mid-dash (> 1 = elongate)."
      },
      {
        label: "Stretch XZ",
        config: () => C,
        key: "stretchScaleXZ",
        min: 0.5,
        max: 1,
        step: 0.05,
        unit: "",
        tip: "XZ scale mid-dash (< 1 = narrow)."
      },
      {
        label: "Lean Angle",
        config: () => C,
        key: "dashLeanAngle",
        min: 0,
        max: 0.8,
        step: 0.02,
        unit: "rad",
        tip: "Aggressive forward lean during dash."
      },
      {
        label: "Arm Sweep",
        config: () => C,
        key: "dashArmSweep",
        min: -1.5,
        max: 0,
        step: 0.05,
        unit: "rad",
        tip: "Arms swept back during dash."
      },
      {
        label: "Leg Lunge",
        config: () => C,
        key: "dashLegLunge",
        min: 0,
        max: 1.5,
        step: 0.05,
        unit: "rad",
        tip: "Front leg forward extension during dash."
      },
      {
        label: "Leg Trail",
        config: () => C,
        key: "dashLegTrail",
        min: -1.5,
        max: 0,
        step: 0.05,
        unit: "rad",
        tip: "Back leg trailing behind during dash."
      }
    ]
  },
  {
    section: "Animation \u2014 Blends",
    collapsed: true,
    items: [
      {
        label: "Idle to Run",
        config: () => C,
        key: "idleToRunBlend",
        min: 20,
        max: 300,
        step: 10,
        unit: "ms",
        tip: "Blend duration from idle to run state."
      },
      {
        label: "Run to Idle",
        config: () => C,
        key: "runToIdleBlend",
        min: 20,
        max: 300,
        step: 10,
        unit: "ms",
        tip: "Blend duration from run to idle state."
      },
      {
        label: "End Lag Blend",
        config: () => C,
        key: "endLagToNormalBlend",
        min: 20,
        max: 300,
        step: 10,
        unit: "ms",
        tip: "Blend out of dash end-lag state."
      }
    ]
  },
  // ── Audio ──
  {
    section: "Audio",
    collapsed: true,
    items: [
      {
        label: "Master Vol",
        config: () => AUDIO_CONFIG,
        key: "masterVolume",
        min: 0,
        max: 1,
        step: 0.05,
        custom: "masterVolume",
        unit: "",
        tip: "Overall volume. Applied to AudioContext gain node."
      },
      {
        label: "Hit Vol",
        config: () => AUDIO_CONFIG,
        key: "hitVolume",
        min: 0,
        max: 1,
        step: 0.05,
        unit: "",
        tip: "Enemy hit sound volume."
      },
      {
        label: "Death Vol",
        config: () => AUDIO_CONFIG,
        key: "deathVolume",
        min: 0,
        max: 1,
        step: 0.05,
        unit: "",
        tip: "Enemy death sound volume."
      },
      {
        label: "Dash Vol",
        config: () => AUDIO_CONFIG,
        key: "dashVolume",
        min: 0,
        max: 1,
        step: 0.05,
        unit: "",
        tip: "Dash whoosh volume."
      },
      {
        label: "Shield Vol",
        config: () => AUDIO_CONFIG,
        key: "shieldBreakVolume",
        min: 0,
        max: 1,
        step: 0.05,
        unit: "",
        tip: "Shield break crash volume."
      },
      {
        label: "Charge Vol",
        config: () => AUDIO_CONFIG,
        key: "chargeVolume",
        min: 0,
        max: 1,
        step: 0.05,
        unit: "",
        tip: "Charge fire burst volume."
      },
      {
        label: "Wave Clear",
        config: () => AUDIO_CONFIG,
        key: "waveClearVolume",
        min: 0,
        max: 1,
        step: 0.05,
        unit: "",
        tip: "Wave clear chime volume."
      },
      {
        label: "Player Hit",
        config: () => AUDIO_CONFIG,
        key: "playerHitVolume",
        min: 0,
        max: 1,
        step: 0.05,
        unit: "",
        tip: "Player damage taken sound volume."
      },
      {
        label: "Melee Swing",
        config: () => AUDIO_CONFIG,
        key: "meleeSwingVolume",
        min: 0,
        max: 1,
        step: 0.05,
        unit: "",
        tip: "Melee swing whoosh volume."
      },
      {
        label: "Melee Hit",
        config: () => AUDIO_CONFIG,
        key: "meleeHitVolume",
        min: 0,
        max: 1,
        step: 0.05,
        unit: "",
        tip: "Melee hit thump volume."
      }
    ]
  },
  {
    section: "Spawn Pacing",
    collapsed: true,
    items: [
      {
        label: "Telegraph Dur",
        config: () => SPAWN_CONFIG,
        key: "telegraphDuration",
        min: 500,
        max: 3e3,
        step: 100,
        unit: "ms",
        tip: "How long spawn warnings show before enemies appear."
      },
      {
        label: "Spawn Cooldown",
        config: () => SPAWN_CONFIG,
        key: "spawnCooldown",
        min: 200,
        max: 2e3,
        step: 100,
        unit: "ms",
        tip: "Minimum delay between consecutive pack dispatches."
      },
      {
        label: "Max Conc. Mult",
        config: () => SPAWN_CONFIG,
        key: "maxConcurrentMult",
        min: 0.5,
        max: 2,
        step: 0.1,
        unit: "",
        tip: "Multiplier on max concurrent enemies (affects all rooms)."
      },
      {
        label: "Ahead Dist Min",
        config: () => SPAWN_CONFIG,
        key: "spawnAheadMin",
        min: 3,
        max: 15,
        step: 1,
        unit: "u",
        tip: "Min distance ahead of player to spawn enemies."
      },
      {
        label: "Ahead Dist Max",
        config: () => SPAWN_CONFIG,
        key: "spawnAheadMax",
        min: 8,
        max: 25,
        step: 1,
        unit: "u",
        tip: "Max distance ahead of player to spawn enemies."
      }
    ]
  },
  {
    section: "Door",
    collapsed: true,
    items: [
      {
        label: "Unlock Duration",
        config: () => DOOR_CONFIG,
        key: "unlockDuration",
        min: 300,
        max: 2e3,
        step: 100,
        unit: "ms",
        tip: "Door unlock animation duration."
      },
      {
        label: "Interact Radius",
        config: () => DOOR_CONFIG,
        key: "interactRadius",
        min: 1,
        max: 4,
        step: 0.5,
        unit: "u",
        tip: "How close player must be to enter door."
      },
      {
        label: "Rest Pause",
        config: () => DOOR_CONFIG,
        key: "restPause",
        min: 500,
        max: 5e3,
        step: 500,
        unit: "ms",
        tip: "How long before rest room door opens."
      }
    ]
  },
  {
    section: "Physics Objects",
    collapsed: true,
    items: [
      {
        label: "Object Friction",
        config: () => PHYSICS,
        key: "objectFriction",
        min: 1,
        max: 50,
        step: 1,
        tip: "Deceleration rate for physics objects."
      },
      {
        label: "Wall Slam Min Speed",
        config: () => PHYSICS,
        key: "objectWallSlamMinSpeed",
        min: 0,
        max: 10,
        step: 0.5,
        tip: "Min speed for wall slam damage."
      },
      {
        label: "Wall Slam Damage",
        config: () => PHYSICS,
        key: "objectWallSlamDamage",
        min: 1,
        max: 20,
        step: 1,
        tip: "Damage per unit speed above threshold."
      },
      {
        label: "Wall Slam Bounce",
        config: () => PHYSICS,
        key: "objectWallSlamBounce",
        min: 0,
        max: 1,
        step: 0.05,
        tip: "Velocity reflection coefficient (0 = dead stop, 1 = perfect bounce)."
      },
      {
        label: "Impact Min Speed",
        config: () => PHYSICS,
        key: "objectImpactMinSpeed",
        min: 0,
        max: 10,
        step: 0.5,
        tip: "Min relative speed for impact damage."
      },
      {
        label: "Impact Damage",
        config: () => PHYSICS,
        key: "objectImpactDamage",
        min: 1,
        max: 20,
        step: 1,
        tip: "Damage per unit speed above impact threshold."
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
function applyMasterVolume(val) {
  setMasterVolume(val);
}
var panel;
var isCollapsed = true;
var sectionCollapsedState = /* @__PURE__ */ new Map();
function initTuningPanel() {
  captureOriginalSpeeds();
  for (const sec of SECTIONS) {
    sectionCollapsedState.set(sec.section, sec.collapsed ?? false);
  }
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
  for (const section of SECTIONS) {
    const sectionEl = document.createElement("div");
    sectionEl.className = "tuning-section";
    const header = document.createElement("div");
    header.className = "tuning-section-header";
    const isSecCollapsed = sectionCollapsedState.get(section.section) ?? false;
    header.innerHTML = `<span class="tuning-section-arrow">${isSecCollapsed ? "\u25B6" : "\u25BC"}</span> ${section.section}`;
    const itemsContainer = document.createElement("div");
    itemsContainer.className = "tuning-section-items";
    if (isSecCollapsed) {
      itemsContainer.style.display = "none";
    }
    header.addEventListener("click", () => {
      const collapsed = sectionCollapsedState.get(section.section) ?? false;
      const newState = !collapsed;
      sectionCollapsedState.set(section.section, newState);
      itemsContainer.style.display = newState ? "none" : "";
      const arrow = header.querySelector(".tuning-section-arrow");
      arrow.textContent = newState ? "\u25B6" : "\u25BC";
    });
    sectionEl.appendChild(header);
    for (const item of section.items) {
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
      slider.min = String(item.min);
      slider.max = String(item.max);
      slider.step = String(item.step);
      let currentVal;
      if (item.custom === "enemySpeed") {
        currentVal = enemySpeedMultiplier;
      } else {
        currentVal = item.config()[item.key];
      }
      slider.value = String(currentVal);
      const valueDisplay = document.createElement("span");
      valueDisplay.className = "tuning-value";
      valueDisplay.textContent = formatValue(currentVal, item);
      slider.addEventListener("input", () => {
        const val = parseFloat(slider.value);
        if (item.custom === "enemySpeed") {
          applyEnemySpeedMultiplier(val);
        } else if (item.custom === "masterVolume") {
          applyMasterVolume(val);
        } else {
          item.config()[item.key] = val;
        }
        valueDisplay.textContent = formatValue(val, item);
      });
      row.appendChild(label);
      row.appendChild(slider);
      row.appendChild(valueDisplay);
      itemsContainer.appendChild(row);
    }
    sectionEl.appendChild(itemsContainer);
    content.appendChild(sectionEl);
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
  for (const section of SECTIONS) {
    lines.push(`${section.section}:`);
    for (const item of section.items) {
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
      padding: 12px;
      backdrop-filter: blur(8px);
      max-height: calc(100vh - 120px);
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(68, 255, 136, 0.3) transparent;
    }

    #tuning-content::-webkit-scrollbar {
      width: 6px;
    }

    #tuning-content::-webkit-scrollbar-track {
      background: transparent;
    }

    #tuning-content::-webkit-scrollbar-thumb {
      background: rgba(68, 255, 136, 0.3);
      border-radius: 3px;
    }

    .tuning-section {
      margin-bottom: 4px;
    }

    .tuning-section:last-of-type {
      margin-bottom: 0;
    }

    .tuning-section-header {
      font-size: 9px;
      color: rgba(68, 255, 136, 0.7);
      letter-spacing: 2px;
      text-transform: uppercase;
      padding: 6px 4px;
      cursor: pointer;
      user-select: none;
      border-bottom: 1px solid rgba(68, 255, 136, 0.1);
      transition: color 0.15s ease;
    }

    .tuning-section-header:hover {
      color: rgba(68, 255, 136, 1);
    }

    .tuning-section-arrow {
      font-size: 7px;
      margin-right: 4px;
      display: inline-block;
      width: 10px;
    }

    .tuning-section-items {
      padding: 6px 0 4px 0;
    }

    .tuning-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }

    .tuning-row:last-child {
      margin-bottom: 0;
    }

    .tuning-label {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.55);
      width: 80px;
      flex-shrink: 0;
    }

    .tuning-label.has-tooltip {
      cursor: help;
      text-decoration: underline dotted rgba(255, 255, 255, 0.2);
      text-underline-offset: 2px;
    }

    .tuning-slider {
      flex: 1;
      height: 3px;
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
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #44ff88;
      cursor: pointer;
      border: none;
      box-shadow: 0 0 4px rgba(68, 255, 136, 0.4);
    }

    .tuning-slider::-moz-range-thumb {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #44ff88;
      cursor: pointer;
      border: none;
      box-shadow: 0 0 4px rgba(68, 255, 136, 0.4);
    }

    .tuning-value {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.7);
      width: 54px;
      text-align: right;
      flex-shrink: 0;
    }

    #tuning-copy, #tuning-share {
      margin-top: 10px;
      padding: 5px 0;
      text-align: center;
      font-size: 9px;
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
      margin-top: 4px;
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

// src/engine/waveRunner.ts
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
var announceEl2;
function startWave(index, gameState2) {
  if (index >= WAVES.length) {
    waveState.status = "victory";
    showAnnounce2("VICTORY");
    return;
  }
  waveState.waveIndex = index;
  waveState.status = "announce";
  waveState.announceTimer = 2e3;
  waveState.elapsedMs = 0;
  waveState.groups = [];
  gameState2.currentWave = WAVES[index].wave;
  showAnnounce2(WAVES[index].message);
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
  hideAnnounce2();
}
function showAnnounce2(text) {
  if (!announceEl2) return;
  announceEl2.textContent = text;
  announceEl2.classList.add("visible");
}
function hideAnnounce2() {
  if (!announceEl2) return;
  announceEl2.classList.remove("visible");
}

// src/ui/editorHandles.ts
var sceneRef9 = null;
var handleMeshes = [];
var grabbedHandle = null;
var handleSize = 0.3;
var HANDLE_SIZE_NORMAL = 0.3;
var HANDLE_SIZE_RESIZE = 0.6;
var HANDLE_COLORS = {
  x: 16729156,
  // red
  z: 4474111,
  // blue
  y: 4521796
  // green
};
function initHandles(scene2) {
  sceneRef9 = scene2;
}
function setResizeMode(on2) {
  handleSize = on2 ? HANDLE_SIZE_RESIZE : HANDLE_SIZE_NORMAL;
}
function showHandles(entity, type) {
  clearHandles();
  if (!sceneRef9) return;
  addHandlesForEntity(entity, type);
}
function showAllHandles(obstacles, pits) {
  clearHandles();
  if (!sceneRef9) return;
  for (const o of obstacles) addHandlesForEntity(o, "obstacle", 0.35);
  for (const p of pits) addHandlesForEntity(p, "pit", 0.35);
}
function addHandlesForEntity(entity, type, opacity = 0.8) {
  const x = entity.x;
  const z = entity.z;
  const w = entity.w;
  const d = entity.d;
  const h = type === "obstacle" ? entity.h : 0;
  const baseY = type === "obstacle" ? h / 2 : 0.15;
  addHandle(x + w / 2, baseY, z, "x", 1, opacity);
  addHandle(x - w / 2, baseY, z, "x", -1, opacity);
  addHandle(x, baseY, z + d / 2, "z", 1, opacity);
  addHandle(x, baseY, z - d / 2, "z", -1, opacity);
  if (type === "obstacle") {
    addHandle(x, h, z, "y", 1, opacity);
  }
}
function clearHandles() {
  for (const mesh of handleMeshes) {
    if (sceneRef9) sceneRef9.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
  }
  handleMeshes = [];
}
function raycastHandles(ndc) {
  if (handleMeshes.length === 0) return false;
  const camera2 = getCamera();
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera2);
  const intersects = raycaster.intersectObjects(handleMeshes, false);
  if (intersects.length > 0) {
    const hitMesh = intersects[0].object;
    grabbedHandle = hitMesh.userData.handleData;
    return true;
  }
  return false;
}
function getGrabbedHandle() {
  return grabbedHandle;
}
function releaseHandle() {
  grabbedHandle = null;
}
function grabNearestHandle(worldX, worldZ) {
  if (handleMeshes.length === 0) return false;
  let bestDist = Infinity;
  let bestHandle = null;
  for (const mesh of handleMeshes) {
    const dx = mesh.position.x - worldX;
    const dz = mesh.position.z - worldZ;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      bestHandle = mesh.userData.handleData;
    }
  }
  if (bestHandle) {
    grabbedHandle = bestHandle;
    return true;
  }
  return false;
}
function updateHandlePositions(entity, type) {
  const savedGrab = grabbedHandle;
  showHandles(entity, type);
  grabbedHandle = savedGrab;
}
function addHandle(px, py, pz, axis, sign, opacity = 0.8) {
  const geo = new THREE.BoxGeometry(handleSize, handleSize, handleSize);
  const mat = new THREE.MeshBasicMaterial({
    color: HANDLE_COLORS[axis],
    transparent: true,
    opacity
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(px, py, pz);
  mesh.userData.handleData = { axis, sign };
  sceneRef9.add(mesh);
  handleMeshes.push(mesh);
}

// src/ui/levelEditor.ts
var sceneRef10;
var gameStateRef;
var active3 = false;
var previousPhase = "playing";
var mode = "obstacle";
var selectedType = null;
var selectedIdx = -1;
var isDragging = false;
var dragStarted = false;
var dragStartWorld = null;
var dragUndoPushed = false;
var handleUndoPushed = false;
var resizeMode = false;
var lastMouseNDC = { x: 0, y: 0 };
var bendPreviewActive = false;
var bendPreviewSystem = null;
var selectedBendId2 = BENDS[0]?.id ?? "enlarge";
var bendPreviewBtn;
var bendSelectorEl;
var barEl;
var panelEl;
var panelContent;
var modeBtns = [];
var selectionVisual = null;
var undoStack = [];
var redoStack = [];
var MAX_UNDO = 50;
function snapshotState() {
  return {
    obstacles: JSON.parse(JSON.stringify(OBSTACLES)),
    pits: JSON.parse(JSON.stringify(PITS)),
    physicsObjects: gameStateRef.physicsObjects.map((o) => ({
      meshType: o.meshType,
      material: o.material,
      x: o.pos.x,
      z: o.pos.z,
      mass: o.mass,
      health: o.health,
      radius: o.radius,
      scale: o.scale
    })),
    selectedType,
    selectedIdx
  };
}
function pushUndo() {
  undoStack.push(snapshotState());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
}
function applySnapshot(snap2) {
  OBSTACLES.length = 0;
  for (const o of snap2.obstacles) OBSTACLES.push(o);
  PITS.length = 0;
  for (const p of snap2.pits) PITS.push(p);
  clearPhysicsObjects(gameStateRef, sceneRef10);
  for (const p of snap2.physicsObjects) {
    const obj = createPhysicsObject(p);
    createPhysicsObjectMesh(obj, sceneRef10);
    gameStateRef.physicsObjects.push(obj);
  }
  selectedType = snap2.selectedType;
  selectedIdx = snap2.selectedIdx;
  onArenaChanged();
  updateSelectionVisuals();
  updatePropertyPanel();
}
function undo() {
  if (undoStack.length === 0) return;
  redoStack.push(snapshotState());
  applySnapshot(undoStack.pop());
}
function redo() {
  if (redoStack.length === 0) return;
  undoStack.push(snapshotState());
  applySnapshot(redoStack.pop());
}
function exportRoomJSON() {
  const room = {
    name: "Exported Room",
    arenaHalfX: ARENA_HALF_X,
    arenaHalfZ: ARENA_HALF_Z,
    obstacles: OBSTACLES.map((o) => ({ ...o })),
    pits: PITS.map((p) => ({ ...p })),
    physicsObjects: gameStateRef.physicsObjects.map((obj) => ({
      meshType: obj.meshType,
      material: obj.material,
      x: obj.pos.x,
      z: obj.pos.z,
      mass: obj.mass,
      health: obj.maxHealth,
      radius: obj.radius,
      scale: obj.scale
    })),
    spawnBudget: { packs: [] },
    playerStart: { x: 0, z: 0 }
  };
  const json = JSON.stringify(room, null, 2);
  navigator.clipboard.writeText(json).then(() => {
    const titleSpan = barEl.querySelector("span");
    if (titleSpan) {
      const original = titleSpan.textContent;
      titleSpan.textContent = "COPIED! \u2014 ";
      setTimeout(() => {
        titleSpan.textContent = original;
      }, 1200);
    }
  });
}
function importRoomJSON() {
  const json = window.prompt("Paste room JSON:");
  if (!json) return;
  let room;
  try {
    room = JSON.parse(json);
  } catch {
    window.alert("Invalid JSON");
    return;
  }
  pushUndo();
  OBSTACLES.length = 0;
  if (Array.isArray(room.obstacles)) {
    for (const o of room.obstacles) OBSTACLES.push(o);
  }
  PITS.length = 0;
  if (Array.isArray(room.pits)) {
    for (const p of room.pits) PITS.push(p);
  }
  clearPhysicsObjects(gameStateRef, sceneRef10);
  if (Array.isArray(room.physicsObjects)) {
    for (const p of room.physicsObjects) {
      const obj = createPhysicsObject(p);
      createPhysicsObjectMesh(obj, sceneRef10);
      gameStateRef.physicsObjects.push(obj);
    }
  }
  selectedType = null;
  selectedIdx = -1;
  onArenaChanged();
  updateSelectionVisuals();
  updatePropertyPanel();
}
function updateBendSelectorHighlight() {
  const btns = bendSelectorEl.querySelectorAll("button");
  btns.forEach((btn) => {
    btn.style.background = btn.dataset.bendId === selectedBendId2 ? "#336699" : "";
  });
}
function toggleBendPreview() {
  bendPreviewActive = !bendPreviewActive;
  if (bendPreviewActive) {
    bendPreviewSystem = createBendSystem(99);
    bendPreviewBtn.textContent = "Preview ON";
    bendPreviewBtn.style.background = "#228844";
    bendSelectorEl.style.display = "flex";
    updateBendSelectorHighlight();
  } else {
    if (bendPreviewSystem) {
      bendPreviewSystem.resetAll();
      for (const obj of gameStateRef.physicsObjects) {
        clearBendVisuals(obj);
      }
      bendPreviewSystem = null;
    }
    bendPreviewBtn.textContent = "Preview Bends";
    bendPreviewBtn.style.background = "";
    bendSelectorEl.style.display = "none";
  }
}
function applyBendPreviewToTarget(ndc) {
  if (!bendPreviewActive || !bendPreviewSystem) return false;
  const camera2 = getCamera();
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera2);
  for (const obj of gameStateRef.physicsObjects) {
    if (!obj.mesh || obj.destroyed) continue;
    const intersects = raycaster.intersectObject(obj.mesh, true);
    if (intersects.length > 0) {
      const bend = getBendById(selectedBendId2);
      if (!bend) return false;
      const result = bendPreviewSystem.applyBend(selectedBendId2, "physicsObject", obj);
      if (result.success) {
        applyBendVisuals(obj, bend.tintColor);
      }
      return true;
    }
  }
  return false;
}
function onArenaChanged() {
  rebuildArenaVisuals();
  invalidateCollisionBounds();
}
function snap(v) {
  return Math.round(v * 2) / 2;
}
function mouseToWorld(mouseNDC) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2(mouseNDC.x, mouseNDC.y);
  raycaster.setFromCamera(ndc, getCamera());
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const target = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, target);
  return { x: target.x, z: target.z };
}
function clientToNDC(e) {
  return {
    x: e.clientX / window.innerWidth * 2 - 1,
    y: -(e.clientY / window.innerHeight) * 2 + 1
  };
}
function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}
function clearSelectionVisual() {
  if (selectionVisual) {
    sceneRef10.remove(selectionVisual);
    selectionVisual.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    selectionVisual = null;
  }
}
function updateSelectionVisuals() {
  clearSelectionVisual();
  clearHandles();
  const outlineColor = resizeMode ? 16746564 : 4521796;
  if (selectedType === "obstacle" && selectedIdx >= 0 && selectedIdx < OBSTACLES.length) {
    const o = OBSTACLES[selectedIdx];
    const geo = new THREE.BoxGeometry(o.w, o.h, o.d);
    const edges = new THREE.EdgesGeometry(geo);
    const mat = new THREE.LineBasicMaterial({ color: outlineColor });
    const lines = new THREE.LineSegments(edges, mat);
    lines.position.set(o.x, o.h / 2, o.z);
    sceneRef10.add(lines);
    selectionVisual = lines;
    geo.dispose();
    showHandles(o, "obstacle");
  } else if (selectedType === "physics" && selectedIdx >= 0 && selectedIdx < gameStateRef.physicsObjects.length) {
    const obj = gameStateRef.physicsObjects[selectedIdx];
    const r = obj.radius;
    const ringGeo3 = new THREE.RingGeometry(r - 0.05, r + 0.05, 32);
    const mat = new THREE.LineBasicMaterial({ color: outlineColor });
    const ring = new THREE.Mesh(ringGeo3, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(obj.pos.x, 0.05, obj.pos.z);
    sceneRef10.add(ring);
    selectionVisual = ring;
  } else if (selectedType === "pit" && selectedIdx >= 0 && selectedIdx < PITS.length) {
    const p = PITS[selectedIdx];
    const geo = new THREE.BoxGeometry(p.w, 0.2, p.d);
    const edges = new THREE.EdgesGeometry(geo);
    const mat = new THREE.LineBasicMaterial({ color: outlineColor });
    const lines = new THREE.LineSegments(edges, mat);
    lines.position.set(p.x, 0.1, p.z);
    sceneRef10.add(lines);
    selectionVisual = lines;
    geo.dispose();
    showHandles(p, "pit");
  } else {
    showAllHandles(OBSTACLES, PITS);
  }
}
function addNumberField(container, label, value, onChange, min, max, step) {
  const row = document.createElement("div");
  row.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin:4px 0";
  const lbl = document.createElement("label");
  lbl.textContent = label;
  lbl.style.cssText = "color:#ccc;font-size:12px";
  const inp = document.createElement("input");
  inp.type = "number";
  inp.value = String(value);
  inp.style.cssText = "width:70px;background:#333;color:#fff;border:1px solid #555;padding:2px 4px;font-size:12px";
  if (min !== void 0) inp.min = String(min);
  if (max !== void 0) inp.max = String(max);
  if (step !== void 0) inp.step = String(step);
  inp.addEventListener("change", () => {
    pushUndo();
    onChange(parseFloat(inp.value));
    updateSelectionVisuals();
  });
  row.appendChild(lbl);
  row.appendChild(inp);
  container.appendChild(row);
}
function addDropdown(container, label, value, options, onChange) {
  const row = document.createElement("div");
  row.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin:4px 0";
  const lbl = document.createElement("label");
  lbl.textContent = label;
  lbl.style.cssText = "color:#ccc;font-size:12px";
  const sel = document.createElement("select");
  sel.style.cssText = "width:80px;background:#333;color:#fff;border:1px solid #555;padding:2px 4px;font-size:12px";
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    if (opt === value) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener("change", () => {
    pushUndo();
    onChange(sel.value);
    updateSelectionVisuals();
  });
  row.appendChild(lbl);
  row.appendChild(sel);
  container.appendChild(row);
}
function addCheckbox(container, label, checked, onChange) {
  const row = document.createElement("div");
  row.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin:4px 0";
  const lbl = document.createElement("label");
  lbl.textContent = label;
  lbl.style.cssText = "color:#ccc;font-size:12px";
  const inp = document.createElement("input");
  inp.type = "checkbox";
  inp.checked = checked;
  inp.style.cssText = "accent-color:#4f4";
  inp.addEventListener("change", () => {
    pushUndo();
    onChange(inp.checked);
    updatePropertyPanel();
    updateSelectionVisuals();
  });
  row.appendChild(lbl);
  row.appendChild(inp);
  container.appendChild(row);
}
function addSectionHeader(container, text) {
  const h = document.createElement("div");
  h.textContent = text;
  h.style.cssText = "color:#4f4;font-size:13px;font-weight:bold;margin:8px 0 4px;border-bottom:1px solid #444;padding-bottom:2px";
  container.appendChild(h);
}
function rebuildPhysicsObjectMesh(obj) {
  if (obj.mesh) {
    sceneRef10.remove(obj.mesh);
    obj.mesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    obj.mesh = null;
  }
  createPhysicsObjectMesh(obj, sceneRef10);
}
function updatePropertyPanel() {
  clearChildren(panelContent);
  if (selectedType === "obstacle" && selectedIdx >= 0 && selectedIdx < OBSTACLES.length) {
    const o = OBSTACLES[selectedIdx];
    addSectionHeader(panelContent, "Obstacle");
    addNumberField(panelContent, "X", o.x, (v) => {
      o.x = v;
      onArenaChanged();
    }, void 0, void 0, 0.5);
    addNumberField(panelContent, "Z", o.z, (v) => {
      o.z = v;
      onArenaChanged();
    }, void 0, void 0, 0.5);
    addNumberField(panelContent, "Width", o.w, (v) => {
      o.w = v;
      onArenaChanged();
    }, 0.5, void 0, 0.5);
    addNumberField(panelContent, "Height", o.h, (v) => {
      o.h = v;
      onArenaChanged();
    }, 0.5, void 0, 0.5);
    addNumberField(panelContent, "Depth", o.d, (v) => {
      o.d = v;
      onArenaChanged();
    }, 0.5, void 0, 0.5);
    addCheckbox(panelContent, "Destructible", !!o.destructible, (v) => {
      o.destructible = v;
      if (v && !o.health) {
        o.health = 50;
        o.maxHealth = 50;
      }
      onArenaChanged();
    });
    if (o.destructible) {
      addNumberField(panelContent, "Health", o.health ?? 50, (v) => {
        o.health = v;
        o.maxHealth = v;
        onArenaChanged();
      }, 1, void 0, 1);
    }
    addDropdown(panelContent, "Material", o.material || "stone", ["stone", "wood", "metal", "ice"], (v) => {
      o.material = v;
      onArenaChanged();
    });
  } else if (selectedType === "physics" && selectedIdx >= 0 && selectedIdx < gameStateRef.physicsObjects.length) {
    const obj = gameStateRef.physicsObjects[selectedIdx];
    addSectionHeader(panelContent, "Physics Object");
    addNumberField(panelContent, "X", obj.pos.x, (v) => {
      obj.pos.x = v;
      if (obj.mesh) obj.mesh.position.x = v;
    }, void 0, void 0, 0.5);
    addNumberField(panelContent, "Z", obj.pos.z, (v) => {
      obj.pos.z = v;
      if (obj.mesh) obj.mesh.position.z = v;
    }, void 0, void 0, 0.5);
    addDropdown(panelContent, "Mesh Type", obj.meshType, ["rock", "crate", "barrel", "pillar"], (v) => {
      obj.meshType = v;
      rebuildPhysicsObjectMesh(obj);
    });
    addDropdown(panelContent, "Material", obj.material, ["stone", "wood", "metal", "ice"], (v) => {
      obj.material = v;
      rebuildPhysicsObjectMesh(obj);
    });
    addNumberField(panelContent, "Mass", obj.mass, (v) => {
      obj.mass = v;
    }, 0.1, 50, 0.1);
    addNumberField(panelContent, "Health", obj.health, (v) => {
      obj.health = v;
      obj.maxHealth = v;
    }, 1, 9999, 1);
    addNumberField(panelContent, "Radius", obj.radius, (v) => {
      obj.radius = v;
      rebuildPhysicsObjectMesh(obj);
    }, 0.1, 5, 0.1);
  } else if (selectedType === "pit" && selectedIdx >= 0 && selectedIdx < PITS.length) {
    const p = PITS[selectedIdx];
    addSectionHeader(panelContent, "Pit");
    addNumberField(panelContent, "X", p.x, (v) => {
      p.x = v;
      onArenaChanged();
    }, void 0, void 0, 0.5);
    addNumberField(panelContent, "Z", p.z, (v) => {
      p.z = v;
      onArenaChanged();
    }, void 0, void 0, 0.5);
    addNumberField(panelContent, "Width", p.w, (v) => {
      p.w = v;
      onArenaChanged();
    }, 0.5, void 0, 0.5);
    addNumberField(panelContent, "Depth", p.d, (v) => {
      p.d = v;
      onArenaChanged();
    }, 0.5, void 0, 0.5);
  } else {
    const hint = document.createElement("div");
    hint.textContent = "Click to place or select";
    hint.style.cssText = "color:#666;font-size:11px;text-align:center;margin-top:20px";
    panelContent.appendChild(hint);
  }
}
function hitTestPhysics(wx, wz) {
  for (let i = 0; i < gameStateRef.physicsObjects.length; i++) {
    const obj = gameStateRef.physicsObjects[i];
    if (obj.destroyed) continue;
    const dx = wx - obj.pos.x;
    const dz = wz - obj.pos.z;
    if (dx * dx + dz * dz < obj.radius * obj.radius) return i;
  }
  return -1;
}
function hitTestObstacle3D(ndc) {
  const camera2 = getCamera();
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera2);
  const ray = raycaster.ray;
  let bestDist = Infinity;
  let bestIdx = -1;
  for (let i = 0; i < OBSTACLES.length; i++) {
    const o = OBSTACLES[i];
    const box = new THREE.Box3(
      new THREE.Vector3(o.x - o.w / 2, 0, o.z - o.d / 2),
      new THREE.Vector3(o.x + o.w / 2, o.h, o.z + o.d / 2)
    );
    const hit = ray.intersectBox(box, new THREE.Vector3());
    if (hit) {
      const dist = hit.distanceTo(ray.origin);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
  }
  return bestIdx;
}
function hitTestPit(wx, wz) {
  for (let i = 0; i < PITS.length; i++) {
    const p = PITS[i];
    if (Math.abs(wx - p.x) < p.w / 2 && Math.abs(wz - p.z) < p.d / 2) return i;
  }
  return -1;
}
function hitTestAll3D(ndc, wx, wz) {
  const order = mode === "obstacle" ? ["obstacle", "physics", "pit"] : mode === "physics" ? ["physics", "obstacle", "pit"] : ["pit", "obstacle", "physics"];
  for (const t of order) {
    let idx = -1;
    if (t === "obstacle") idx = hitTestObstacle3D(ndc);
    else if (t === "physics") idx = hitTestPhysics(wx, wz);
    else idx = hitTestPit(wx, wz);
    if (idx >= 0) return { type: t, idx };
  }
  return null;
}
function deleteSelected() {
  if (selectedType === null || selectedIdx < 0) return;
  pushUndo();
  if (selectedType === "obstacle" && selectedIdx < OBSTACLES.length) {
    OBSTACLES.splice(selectedIdx, 1);
    onArenaChanged();
  } else if (selectedType === "physics" && selectedIdx < gameStateRef.physicsObjects.length) {
    const obj = gameStateRef.physicsObjects[selectedIdx];
    if (obj.mesh) {
      sceneRef10.remove(obj.mesh);
      obj.mesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
    gameStateRef.physicsObjects.splice(selectedIdx, 1);
  } else if (selectedType === "pit" && selectedIdx < PITS.length) {
    PITS.splice(selectedIdx, 1);
    onArenaChanged();
  }
  selectedType = null;
  selectedIdx = -1;
  updateSelectionVisuals();
  updatePropertyPanel();
}
function deleteNearest(wx, wz) {
  let bestDist = 3;
  let bestType = null;
  let bestIdx = -1;
  for (let i = 0; i < OBSTACLES.length; i++) {
    const o = OBSTACLES[i];
    const d = Math.sqrt((wx - o.x) ** 2 + (wz - o.z) ** 2);
    if (d < bestDist) {
      bestDist = d;
      bestType = "obstacle";
      bestIdx = i;
    }
  }
  for (let i = 0; i < gameStateRef.physicsObjects.length; i++) {
    const o = gameStateRef.physicsObjects[i];
    if (o.destroyed) continue;
    const d = Math.sqrt((wx - o.pos.x) ** 2 + (wz - o.pos.z) ** 2);
    if (d < bestDist) {
      bestDist = d;
      bestType = "physics";
      bestIdx = i;
    }
  }
  for (let i = 0; i < PITS.length; i++) {
    const p = PITS[i];
    const d = Math.sqrt((wx - p.x) ** 2 + (wz - p.z) ** 2);
    if (d < bestDist) {
      bestDist = d;
      bestType = "pit";
      bestIdx = i;
    }
  }
  if (bestType === null) return;
  selectedType = bestType;
  selectedIdx = bestIdx;
  deleteSelected();
}
function duplicateSelected() {
  if (selectedType === null || selectedIdx < 0) return;
  pushUndo();
  if (selectedType === "obstacle" && selectedIdx < OBSTACLES.length) {
    const src = OBSTACLES[selectedIdx];
    const copy = { ...src, x: src.x + 1 };
    if (copy.health !== void 0) copy.maxHealth = copy.health;
    OBSTACLES.push(copy);
    selectedIdx = OBSTACLES.length - 1;
    onArenaChanged();
  } else if (selectedType === "physics" && selectedIdx < gameStateRef.physicsObjects.length) {
    const src = gameStateRef.physicsObjects[selectedIdx];
    const placement = {
      meshType: src.meshType,
      material: src.material,
      x: src.pos.x + 1,
      z: src.pos.z,
      mass: src.mass,
      health: src.health,
      radius: src.radius,
      scale: src.scale
    };
    const obj = createPhysicsObject(placement);
    createPhysicsObjectMesh(obj, sceneRef10);
    gameStateRef.physicsObjects.push(obj);
    selectedIdx = gameStateRef.physicsObjects.length - 1;
  } else if (selectedType === "pit" && selectedIdx < PITS.length) {
    const src = PITS[selectedIdx];
    PITS.push({ ...src, x: src.x + 1 });
    selectedIdx = PITS.length - 1;
    onArenaChanged();
  }
  updateSelectionVisuals();
  updatePropertyPanel();
}
var MIN_DIM = 0.5;
function resizeWithHandle(handle, ndc) {
  if (handle.axis === "x" || handle.axis === "z") {
    const w = mouseToWorld(ndc);
    if (handle.axis === "x") {
      if (selectedType === "obstacle" && selectedIdx >= 0 && selectedIdx < OBSTACLES.length) {
        const o = OBSTACLES[selectedIdx];
        const fixedEdge = o.x - handle.sign * o.w / 2;
        const rawEdge = snap(w.x);
        const newEdge = handle.sign > 0 ? Math.max(fixedEdge + MIN_DIM, rawEdge) : Math.min(fixedEdge - MIN_DIM, rawEdge);
        const newW = Math.abs(newEdge - fixedEdge);
        o.x = fixedEdge + handle.sign * newW / 2;
        o.w = newW;
        onArenaChanged();
        updateHandlePositions(o, "obstacle");
      } else if (selectedType === "pit" && selectedIdx >= 0 && selectedIdx < PITS.length) {
        const p = PITS[selectedIdx];
        const fixedEdge = p.x - handle.sign * p.w / 2;
        const rawEdge = snap(w.x);
        const newEdge = handle.sign > 0 ? Math.max(fixedEdge + MIN_DIM, rawEdge) : Math.min(fixedEdge - MIN_DIM, rawEdge);
        const newW = Math.abs(newEdge - fixedEdge);
        p.x = fixedEdge + handle.sign * newW / 2;
        p.w = newW;
        onArenaChanged();
        updateHandlePositions(p, "pit");
      }
    } else {
      if (selectedType === "obstacle" && selectedIdx >= 0 && selectedIdx < OBSTACLES.length) {
        const o = OBSTACLES[selectedIdx];
        const fixedEdge = o.z - handle.sign * o.d / 2;
        const rawEdge = snap(w.z);
        const newEdge = handle.sign > 0 ? Math.max(fixedEdge + MIN_DIM, rawEdge) : Math.min(fixedEdge - MIN_DIM, rawEdge);
        const newD = Math.abs(newEdge - fixedEdge);
        o.z = fixedEdge + handle.sign * newD / 2;
        o.d = newD;
        onArenaChanged();
        updateHandlePositions(o, "obstacle");
      } else if (selectedType === "pit" && selectedIdx >= 0 && selectedIdx < PITS.length) {
        const p = PITS[selectedIdx];
        const fixedEdge = p.z - handle.sign * p.d / 2;
        const rawEdge = snap(w.z);
        const newEdge = handle.sign > 0 ? Math.max(fixedEdge + MIN_DIM, rawEdge) : Math.min(fixedEdge - MIN_DIM, rawEdge);
        const newD = Math.abs(newEdge - fixedEdge);
        p.z = fixedEdge + handle.sign * newD / 2;
        p.d = newD;
        onArenaChanged();
        updateHandlePositions(p, "pit");
      }
    }
  } else if (handle.axis === "y" && selectedType === "obstacle") {
    const o = OBSTACLES[selectedIdx];
    const camera2 = getCamera();
    const cameraDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera2.quaternion).normalize();
    const handlePos = new THREE.Vector3(o.x, o.h, o.z);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(cameraDir, handlePos);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera2);
    const intersection = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, intersection)) {
      const newH = Math.max(MIN_DIM, snap(intersection.y));
      o.h = newH;
      onArenaChanged();
      updateHandlePositions(o, "obstacle");
    }
  }
  clearSelectionVisual();
  if (selectedType === "obstacle" && selectedIdx >= 0 && selectedIdx < OBSTACLES.length) {
    const o = OBSTACLES[selectedIdx];
    const geo = new THREE.BoxGeometry(o.w, o.h, o.d);
    const edges = new THREE.EdgesGeometry(geo);
    const mat = new THREE.LineBasicMaterial({ color: 4521796 });
    const lines = new THREE.LineSegments(edges, mat);
    lines.position.set(o.x, o.h / 2, o.z);
    sceneRef10.add(lines);
    selectionVisual = lines;
    geo.dispose();
  } else if (selectedType === "pit" && selectedIdx >= 0 && selectedIdx < PITS.length) {
    const p = PITS[selectedIdx];
    const geo = new THREE.BoxGeometry(p.w, 0.2, p.d);
    const edges = new THREE.EdgesGeometry(geo);
    const mat = new THREE.LineBasicMaterial({ color: 4521796 });
    const lines = new THREE.LineSegments(edges, mat);
    lines.position.set(p.x, 0.1, p.z);
    sceneRef10.add(lines);
    selectionVisual = lines;
    geo.dispose();
  }
  updatePropertyPanel();
}
function onMouseDown(e) {
  if (!active3) return;
  const ndc = clientToNDC(e);
  const w = mouseToWorld(ndc);
  if (e.button === 2 || e.button === 0 && e.shiftKey) {
    e.preventDefault();
    deleteNearest(w.x, w.z);
    return;
  }
  if (e.button !== 0) return;
  if (raycastHandles(ndc)) {
    handleUndoPushed = false;
    return;
  }
  if (applyBendPreviewToTarget(ndc)) {
    return;
  }
  const hit = hitTestAll3D(ndc, w.x, w.z);
  if (hit) {
    if (resizeMode && hit.type === selectedType && hit.idx === selectedIdx && (hit.type === "obstacle" || hit.type === "pit")) {
      if (grabNearestHandle(w.x, w.z)) {
        handleUndoPushed = false;
        return;
      }
    }
    selectedType = hit.type;
    selectedIdx = hit.idx;
    isDragging = true;
    dragStarted = false;
    dragUndoPushed = false;
    dragStartWorld = { x: w.x, z: w.z };
    updateSelectionVisuals();
    updatePropertyPanel();
  } else {
    selectedType = null;
    selectedIdx = -1;
    updateSelectionVisuals();
    updatePropertyPanel();
  }
}
function onMouseMove(e) {
  if (!active3) return;
  const ndc = clientToNDC(e);
  lastMouseNDC.x = ndc.x;
  lastMouseNDC.y = ndc.y;
  const handle = getGrabbedHandle();
  if (handle) {
    if (!handleUndoPushed) {
      pushUndo();
      handleUndoPushed = true;
    }
    resizeWithHandle(handle, ndc);
    return;
  }
  if (!isDragging) return;
  const w = mouseToWorld(ndc);
  if (!dragStarted && dragStartWorld) {
    const dx = w.x - dragStartWorld.x;
    const dz = w.z - dragStartWorld.z;
    if (Math.sqrt(dx * dx + dz * dz) < 0.5) return;
    dragStarted = true;
  }
  if (!dragStarted) return;
  if (!dragUndoPushed) {
    pushUndo();
    dragUndoPushed = true;
  }
  const sx = snap(w.x);
  const sz = snap(w.z);
  if (selectedType === "obstacle" && selectedIdx >= 0 && selectedIdx < OBSTACLES.length) {
    OBSTACLES[selectedIdx].x = sx;
    OBSTACLES[selectedIdx].z = sz;
    onArenaChanged();
  } else if (selectedType === "physics" && selectedIdx >= 0 && selectedIdx < gameStateRef.physicsObjects.length) {
    const obj = gameStateRef.physicsObjects[selectedIdx];
    obj.pos.x = sx;
    obj.pos.z = sz;
    if (obj.mesh) {
      obj.mesh.position.x = sx;
      obj.mesh.position.z = sz;
    }
  } else if (selectedType === "pit" && selectedIdx >= 0 && selectedIdx < PITS.length) {
    PITS[selectedIdx].x = sx;
    PITS[selectedIdx].z = sz;
    onArenaChanged();
  }
  updateSelectionVisuals();
  updatePropertyPanel();
}
function onMouseUp(_e) {
  if (!active3) return;
  if (getGrabbedHandle()) {
    releaseHandle();
    onArenaChanged();
    updateSelectionVisuals();
    updatePropertyPanel();
  }
  isDragging = false;
  dragStarted = false;
  dragStartWorld = null;
  dragUndoPushed = false;
}
function onContextMenu(e) {
  if (active3) e.preventDefault();
}
function onKeyDown(e) {
  if (!active3) return;
  if (e.code === "Backquote" && e.shiftKey) {
    e.preventDefault();
    toggleLevelEditor();
    return;
  }
  if (e.code === "Digit1") {
    setMode("obstacle");
    return;
  }
  if (e.code === "Digit2") {
    setMode("physics");
    return;
  }
  if (e.code === "Digit3") {
    setMode("pit");
    return;
  }
  if (e.code === "Delete" || e.code === "Backspace") {
    e.preventDefault();
    deleteSelected();
    return;
  }
  if (e.code === "KeyD" && !e.ctrlKey && !e.metaKey) {
    duplicateSelected();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ" && !e.shiftKey) {
    e.preventDefault();
    undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.code === "KeyY" || e.code === "KeyZ" && e.shiftKey)) {
    e.preventDefault();
    redo();
    return;
  }
  if (e.code === "KeyR") {
    resizeMode = !resizeMode;
    setResizeMode(resizeMode);
    updateSelectionVisuals();
    return;
  }
  if (e.code === "KeyB") {
    pushUndo();
    const w = mouseToWorld(lastMouseNDC);
    OBSTACLES.push({ x: snap(w.x), z: snap(w.z), w: 1, h: 1, d: 1 });
    selectedType = "obstacle";
    selectedIdx = OBSTACLES.length - 1;
    onArenaChanged();
    updateSelectionVisuals();
    updatePropertyPanel();
    return;
  }
  if (e.code === "Escape") {
    selectedType = null;
    selectedIdx = -1;
    updateSelectionVisuals();
    updatePropertyPanel();
    return;
  }
}
function onGlobalKeyDown(e) {
  if (e.code === "Backquote" && e.shiftKey) {
    e.preventDefault();
    toggleLevelEditor();
  }
}
function setMode(m) {
  mode = m;
  updateModeBar();
}
function updateModeBar() {
  const labels = ["obstacle", "physics", "pit"];
  for (let i = 0; i < modeBtns.length; i++) {
    if (labels[i] === mode) {
      modeBtns[i].classList.add("active");
    } else {
      modeBtns[i].classList.remove("active");
    }
  }
}
function enterEditor() {
  active3 = true;
  previousPhase = gameStateRef.phase;
  gameStateRef.phase = "editorPaused";
  selectedType = null;
  selectedIdx = -1;
  barEl.style.display = "block";
  panelEl.style.display = "block";
  updateModeBar();
  updateSelectionVisuals();
  updatePropertyPanel();
  window.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("keydown", onKeyDown);
}
function exitEditor() {
  active3 = false;
  gameStateRef.phase = previousPhase;
  barEl.style.display = "none";
  panelEl.style.display = "none";
  clearSelectionVisual();
  clearHandles();
  if (resizeMode) {
    resizeMode = false;
    setResizeMode(false);
  }
  if (bendPreviewActive) {
    toggleBendPreview();
  }
  selectedType = null;
  selectedIdx = -1;
  window.removeEventListener("mousedown", onMouseDown);
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mouseup", onMouseUp);
  window.removeEventListener("contextmenu", onContextMenu);
  window.removeEventListener("keydown", onKeyDown);
}
function injectCSS() {
  const style = document.createElement("style");
  style.textContent = [
    ".level-editor-panel {",
    "  position: fixed; right: 10px; top: 60px; width: 220px;",
    "  background: rgba(0,0,0,0.85); color: #fff; font-family: monospace; font-size: 12px;",
    "  padding: 10px; border-radius: 4px; z-index: 9999;",
    "  max-height: calc(100vh - 80px); overflow-y: auto;",
    "}",
    ".level-editor-bar {",
    "  position: fixed; top: 10px; left: 50%; transform: translateX(-50%);",
    "  background: rgba(0,0,0,0.85); color: #fff; font-family: monospace; font-size: 14px;",
    "  padding: 6px 16px; border-radius: 4px; z-index: 9999; white-space: nowrap;",
    "}",
    ".level-editor-bar .mode-btn {",
    "  background: none; border: 1px solid #555; color: #888;",
    "  padding: 2px 8px; margin: 0 2px; cursor: pointer;",
    "  font-family: monospace; font-size: 13px; border-radius: 3px;",
    "}",
    ".level-editor-bar .mode-btn.active {",
    "  border-color: #4f4; color: #4f4;",
    "}"
  ].join("\n");
  document.head.appendChild(style);
}
function createDOM() {
  barEl = document.createElement("div");
  barEl.className = "level-editor-bar";
  barEl.style.display = "none";
  const titleSpan = document.createElement("span");
  titleSpan.textContent = "LEVEL EDITOR \u2014 ";
  barEl.appendChild(titleSpan);
  const modeLabels = [
    { key: "1", label: "Obstacle", mode: "obstacle" },
    { key: "2", label: "Physics", mode: "physics" },
    { key: "3", label: "Pit", mode: "pit" }
  ];
  modeBtns = [];
  for (const m of modeLabels) {
    const btn = document.createElement("button");
    btn.className = "mode-btn";
    btn.textContent = m.key + ": " + m.label;
    btn.addEventListener("click", () => setMode(m.mode));
    barEl.appendChild(btn);
    modeBtns.push(btn);
  }
  const sep = document.createElement("span");
  sep.textContent = "  |  ";
  sep.style.opacity = "0.5";
  barEl.appendChild(sep);
  const exportBtn = document.createElement("button");
  exportBtn.className = "mode-btn";
  exportBtn.textContent = "Copy JSON";
  exportBtn.addEventListener("click", exportRoomJSON);
  barEl.appendChild(exportBtn);
  const importBtn = document.createElement("button");
  importBtn.className = "mode-btn";
  importBtn.textContent = "Load JSON";
  importBtn.addEventListener("click", importRoomJSON);
  barEl.appendChild(importBtn);
  const sep2 = document.createElement("span");
  sep2.textContent = "  |  ";
  sep2.style.opacity = "0.5";
  barEl.appendChild(sep2);
  bendPreviewBtn = document.createElement("button");
  bendPreviewBtn.className = "mode-btn";
  bendPreviewBtn.textContent = "Preview Bends";
  bendPreviewBtn.addEventListener("click", toggleBendPreview);
  barEl.appendChild(bendPreviewBtn);
  bendSelectorEl = document.createElement("div");
  bendSelectorEl.style.display = "none";
  bendSelectorEl.style.gap = "4px";
  for (const bend of BENDS) {
    const btn = document.createElement("button");
    btn.className = "mode-btn";
    btn.textContent = bend.icon + " " + bend.name;
    btn.dataset.bendId = bend.id;
    btn.addEventListener("click", () => {
      selectedBendId2 = bend.id;
      updateBendSelectorHighlight();
    });
    bendSelectorEl.appendChild(btn);
  }
  barEl.appendChild(bendSelectorEl);
  document.body.appendChild(barEl);
  panelEl = document.createElement("div");
  panelEl.className = "level-editor-panel";
  panelEl.style.display = "none";
  panelContent = document.createElement("div");
  panelEl.appendChild(panelContent);
  document.body.appendChild(panelEl);
}
function initLevelEditor(scene2, gameState2) {
  console.log("[levelEditor] initLevelEditor called");
  sceneRef10 = scene2;
  gameStateRef = gameState2;
  injectCSS();
  createDOM();
  initHandles(scene2);
  window.addEventListener("keydown", onGlobalKeyDown);
  console.log("[levelEditor] init complete \u2014 Shift+` to toggle");
}
function toggleLevelEditor() {
  if (active3) {
    exitEditor();
  } else {
    if (isEditorActive()) return;
    enterEditor();
  }
}
function isLevelEditorActive() {
  return active3;
}
function updateLevelEditor() {
}

// src/ui/spawnEditor.ts
console.log("[spawnEditor] v2 loaded \u2014 tabs enabled");
var sceneRef11;
var gameStateRef2;
var panel2;
var active4 = false;
var previousPhase2 = "playing";
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
var isDragging2 = false;
var dragStarted2 = false;
var dragStartWorld2 = null;
var undoStack2 = [];
var redoStack2 = [];
var MAX_UNDO2 = 50;
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
function pushUndo2() {
  const snap2 = currentTab === "level" ? snapshotLevel() : snapshotGroup();
  if (!snap2) return;
  undoStack2.push(snap2);
  if (undoStack2.length > MAX_UNDO2) undoStack2.shift();
  redoStack2.length = 0;
}
function applySnapshot2(snap2) {
  if (snap2.tab === "level") {
    OBSTACLES.length = 0;
    for (const o of snap2.obstacles) OBSTACLES.push(o);
    PITS.length = 0;
    for (const p of snap2.pits) PITS.push(p);
    levelState.selectedType = snap2.selectedType;
    levelState.selectedIdx = snap2.selectedIdx;
    onArenaChanged2();
    rebuildLevelMarkers();
    refreshUI();
  } else {
    editorState.waveIndex = snap2.waveIndex;
    editorState.groupIndex = snap2.groupIndex;
    const wave = WAVES[snap2.waveIndex];
    if (!wave) return;
    const group = wave.groups[snap2.groupIndex];
    if (!group) return;
    group.spawns = snap2.spawns;
    group.triggerDelay = snap2.triggerDelay;
    group.telegraphDuration = snap2.telegraphDuration;
    group.stagger = snap2.stagger;
    rebuildMarkers();
    refreshUI();
  }
}
function popUndo() {
  if (undoStack2.length === 0) return;
  const current = currentTab === "level" ? snapshotLevel() : snapshotGroup();
  if (current) redoStack2.push(current);
  applySnapshot2(undoStack2.pop());
}
function popRedo() {
  if (redoStack2.length === 0) return;
  const current = currentTab === "level" ? snapshotLevel() : snapshotGroup();
  if (current) undoStack2.push(current);
  applySnapshot2(redoStack2.pop());
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
  sceneRef11 = scene2;
  gameStateRef2 = gameState2;
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
  window.addEventListener("mousedown", onMouseDown2);
  window.addEventListener("mousemove", onMouseMove2);
  window.addEventListener("mouseup", onMouseUp2);
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
  if (active4) {
    exitEditor2();
  } else {
    enterEditor2();
  }
}
function onEditorWheel(e) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 1 : -1;
  setZoom(getCurrentFrustum() + delta);
}
function enterEditor2() {
  active4 = true;
  previousPhase2 = gameStateRef2.phase;
  gameStateRef2.phase = "editorPaused";
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
function exitEditor2() {
  active4 = false;
  gameStateRef2.phase = previousPhase2;
  panel2.classList.add("hidden");
  bannerEl.classList.remove("visible");
  window.removeEventListener("wheel", onEditorWheel);
  resetZoom();
  clearMarkers();
  clearLevelMarkers();
}
function isEditorActive() {
  return active4;
}
function switchTab(tab) {
  if (tab === currentTab) return;
  currentTab = tab;
  clearMarkers();
  clearLevelMarkers();
  editorState.selectedSpawnIdx = -1;
  levelState.selectedType = null;
  levelState.selectedIdx = -1;
  isDragging2 = false;
  dragStarted2 = false;
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
function mouseToWorld2(e) {
  const ndcX = e.clientX / window.innerWidth * 2 - 1;
  const ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
  return screenToWorld(ndcX, ndcY);
}
function clampToArena(x, z) {
  const cx = ARENA_HALF_X - 1.5;
  const cz = ARENA_HALF_Z - 1.5;
  return {
    x: Math.round(Math.max(-cx, Math.min(cx, x))),
    z: Math.round(Math.max(-cz, Math.min(cz, z)))
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
function onMouseDown2(e) {
  if (!active4) return;
  if (e.target.closest("#spawn-editor")) return;
  if (currentTab === "level") {
    onLevelMouseDown(e);
    return;
  }
  const worldPos = mouseToWorld2(e);
  const group = getCurrentGroup();
  if (!group) return;
  if (e.button === 2 || e.shiftKey) {
    let idx = findNearestSpawn(worldPos.x, worldPos.z, 1.5);
    if (idx >= 0) {
      pushUndo2();
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
        pushUndo2();
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
    isDragging2 = true;
    dragStarted2 = false;
    dragStartWorld2 = { x: worldPos.x, z: worldPos.z };
    rebuildMarkers();
    refreshUI();
  } else {
    const hit = findNearestSpawnAcrossGroups(worldPos.x, worldPos.z, 0.8);
    if (hit) {
      editorState.groupIndex = hit.groupIdx;
      editorState.selectedSpawnIdx = hit.spawnIdx;
      isDragging2 = true;
      dragStarted2 = false;
      dragStartWorld2 = { x: worldPos.x, z: worldPos.z };
      rebuildMarkers();
      refreshUI();
    } else {
      pushUndo2();
      const clamped = clampToArena(worldPos.x, worldPos.z);
      group.spawns.push({ type: editorState.enemyType, x: clamped.x, z: clamped.z });
      editorState.selectedSpawnIdx = group.spawns.length - 1;
      rebuildMarkers();
      refreshUI();
    }
  }
}
function onLevelMouseDown(e) {
  const worldPos = mouseToWorld2(e);
  if (e.button === 2 || e.shiftKey) {
    const hit2 = findNearestLevelObject(worldPos.x, worldPos.z, 3);
    if (hit2) {
      pushUndo2();
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
      onArenaChanged2();
      rebuildLevelMarkers();
      refreshUI();
    }
    return;
  }
  const hit = findNearestLevelObject(worldPos.x, worldPos.z, 3);
  if (hit) {
    levelState.selectedType = hit.type;
    levelState.selectedIdx = hit.idx;
    isDragging2 = true;
    dragStarted2 = false;
    dragStartWorld2 = { x: worldPos.x, z: worldPos.z };
    rebuildLevelMarkers();
    refreshUI();
  } else {
    levelState.selectedType = null;
    levelState.selectedIdx = -1;
    rebuildLevelMarkers();
    refreshUI();
  }
}
function onMouseMove2(e) {
  if (!active4 || !isDragging2) return;
  if (currentTab === "level") {
    onLevelMouseMove(e);
    return;
  }
  const worldPos = mouseToWorld2(e);
  const group = getCurrentGroup();
  if (!group || editorState.selectedSpawnIdx < 0) return;
  if (!dragStarted2) {
    const dx = worldPos.x - dragStartWorld2.x;
    const dz = worldPos.z - dragStartWorld2.z;
    if (dx * dx + dz * dz < 0.25) return;
    dragStarted2 = true;
    pushUndo2();
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
  const worldPos = mouseToWorld2(e);
  if (!dragStarted2) {
    const dx = worldPos.x - dragStartWorld2.x;
    const dz = worldPos.z - dragStartWorld2.z;
    if (dx * dx + dz * dz < 0.25) return;
    dragStarted2 = true;
    pushUndo2();
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
function onMouseUp2(e) {
  if (!active4) return;
  if (currentTab === "level") {
    if (isDragging2 && dragStarted2) {
      onArenaChanged2();
      rebuildLevelMarkers();
      refreshUI();
    }
    isDragging2 = false;
    dragStarted2 = false;
    dragStartWorld2 = null;
    return;
  }
  if (isDragging2 && dragStarted2) {
    rebuildMarkers();
    refreshUI();
  }
  isDragging2 = false;
  dragStarted2 = false;
  dragStartWorld2 = null;
}
function onArenaChanged2() {
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
    pushUndo2();
    OBSTACLES.length = 0;
    for (const o of data.obstacles) OBSTACLES.push(o);
    PITS.length = 0;
    for (const p of data.pits) PITS.push(p);
    currentPresetName = name;
    levelState.selectedType = null;
    levelState.selectedIdx = -1;
    onArenaChanged2();
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
  if (!active4) return;
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
          pushUndo2();
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
      pushUndo2();
      group.spawns.splice(editorState.selectedSpawnIdx, 1);
      editorState.selectedSpawnIdx = -1;
      rebuildMarkers();
      refreshUI();
    } else {
      pushUndo2();
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
      pushUndo2();
      if (levelState.selectedType === "obstacle") {
        OBSTACLES.splice(levelState.selectedIdx, 1);
      } else {
        PITS.splice(levelState.selectedIdx, 1);
      }
      levelState.selectedType = null;
      levelState.selectedIdx = -1;
      onArenaChanged2();
      rebuildLevelMarkers();
      refreshUI();
    }
  }
}
function clearMarkers() {
  for (const m of markers) {
    sceneRef11.remove(m.mesh);
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
        const body = new THREE.Mesh(markerGeo, clonedMat);
        body.position.y = 0.4;
        mesh.add(body);
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
        sceneRef11.add(mesh);
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
    sceneRef11.remove(m.mesh);
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
    const boxGeo2 = new THREE.BoxGeometry(o.w, o.h, o.d);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo2);
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
    sceneRef11.add(group);
    levelMarkers.push({ mesh: group, type: "obstacle", idx: i });
  }
  for (let i = 0; i < PITS.length; i++) {
    const p = PITS[i];
    const selected = isPitSelected && levelState.selectedIdx === i;
    const group = new THREE.Group();
    const planeGeo = new THREE.PlaneGeometry(p.w, p.d);
    const edgesGeo = new THREE.EdgesGeometry(planeGeo);
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
    sceneRef11.add(group);
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
    tab.addEventListener("click", () => {
      if (tab.dataset.tab === "level") {
        exitEditor2();
        toggleLevelEditor();
      } else {
        switchTab(tab.dataset.tab);
      }
    });
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
      pushUndo2();
      pushed = true;
    });
    slider.addEventListener("touchstart", () => {
      if (!pushed) pushUndo2();
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
      pushUndo2();
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
    const body = document.getElementById("se-tuning-body");
    body.classList.toggle("collapsed");
    const header = document.getElementById("se-tuning-header");
    header.innerHTML = body.classList.contains("collapsed") ? "Enemy Properties &#x25B6;" : "Enemy Properties &#x25BC;";
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
    pushUndo2();
    OBSTACLES.push({ x: 0, z: 0, w: 2, h: 1.5, d: 2 });
    levelState.selectedType = "obstacle";
    levelState.selectedIdx = OBSTACLES.length - 1;
    onArenaChanged2();
    rebuildLevelMarkers();
    refreshUI();
  });
  document.getElementById("se-add-pit").addEventListener("click", () => {
    pushUndo2();
    PITS.push({ x: 0, z: 0, w: 3, d: 3 });
    levelState.selectedType = "pit";
    levelState.selectedIdx = PITS.length - 1;
    onArenaChanged2();
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
    if (active4) e.preventDefault();
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
        onArenaChanged2();
        rebuildLevelMarkers();
      });
      let pushed = false;
      el.addEventListener("mousedown", () => {
        pushUndo2();
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
        pushUndo2();
        objRef[key] = clamped;
        const rangeEl = propsBody.querySelector(`.se-level-slider[data-key="${key}"]`);
        if (rangeEl) rangeEl.value = clamped;
        const unitDisplay = sdef.unit ? " " + sdef.unit : "";
        inp.value = (Number.isInteger(clamped) ? clamped : parseFloat(clamped).toFixed(1)) + unitDisplay;
        onArenaChanged2();
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
        pushUndo2();
        if (levelState.selectedType === "obstacle") {
          OBSTACLES.splice(levelState.selectedIdx, 1);
        } else {
          PITS.splice(levelState.selectedIdx, 1);
        }
        levelState.selectedType = null;
        levelState.selectedIdx = -1;
        onArenaChanged2();
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
  text += `export let ARENA_HALF_X = ${ARENA_HALF_X};
`;
  text += `export let ARENA_HALF_Z = ${ARENA_HALF_Z};
`;
  text += `export let ARENA_HALF = ${ARENA_HALF_X}; // legacy alias

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
  const hx = ARENA_HALF_X;
  const hz = ARENA_HALF_Z;
  const t = WALL_THICKNESS;
  // North wall (far end, +Z)
  bounds.push({ minX: -hx - t/2, maxX: hx + t/2, minZ: hz - t/2, maxZ: hz + t/2 });
  // South wall (near end, -Z)
  bounds.push({ minX: -hx - t/2, maxX: hx + t/2, minZ: -hz - t/2, maxZ: -hz + t/2 });
  // East wall (+X)
  bounds.push({ minX: hx - t/2, maxX: hx + t/2, minZ: -hz - t/2, maxZ: hz + t/2 });
  // West wall (-X)
  bounds.push({ minX: -hx - t/2, maxX: -hx + t/2, minZ: -hz - t/2, maxZ: hz + t/2 });

  return bounds;
}
`;
function playCurrentWave() {
  exitEditor2();
  clearEnemies(gameStateRef2);
  releaseAllProjectiles();
  resetWaveRunner();
  gameStateRef2.phase = "playing";
  startWave(editorState.waveIndex, gameStateRef2);
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
  physicsObjects: [],
  bendMode: false,
  bendsPerRoom: 3,
  abilities: {
    dash: { cooldownRemaining: 0 },
    ultimate: { cooldownRemaining: 0, active: false, activeRemaining: 0, charging: false, chargeT: 0 }
  }
};
var lastTime = 0;
var hitPauseTimer = 0;
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
    if (isLevelEditorActive()) updateLevelEditor();
    getRendererInstance().render(getScene(), getCamera());
    consumeInput();
    return;
  }
  let dt = (timestamp - lastTime) / 1e3;
  lastTime = timestamp;
  dt = Math.min(dt, 0.05);
  if (dt <= 0) return;
  if (hitPauseTimer > 0) {
    hitPauseTimer -= dt * 1e3;
    getRendererInstance().render(getScene(), getCamera());
    return;
  }
  updateInput();
  autoAimClosestEnemy(gameState.enemies);
  const input = getInputState();
  if (input.bendMode) toggleBendMode();
  if (!isBendModeActive() && input.bulletTime) toggleBulletTime();
  updateBulletTime(dt);
  const gameDt = dt * getBulletTimeScale();
  if (isBendModeActive() && isBendTargeting() && input.attack) {
    handleBendClick(input.mouseNDC, gameState);
  }
  updateBendMode(dt, gameState);
  if (isBendModeActive() && isBendTargeting()) {
    updateBendHover(input.mouseNDC, gameState);
  }
  if (isBendModeActive()) {
    const gatedInput = { ...input, attack: false, dash: false, ultimate: false, ultimateHeld: false };
    updatePlayer(gatedInput, dt, gameState);
  } else {
    updatePlayer(input, dt, gameState);
  }
  updateProjectiles(gameDt);
  updateRoomManager(gameDt, gameState);
  updateEnemies(gameDt, getPlayerPos(), gameState);
  checkCollisions(gameState);
  applyVelocities(gameDt, gameState);
  applyObjectVelocities(gameDt, gameState);
  resolveEnemyCollisions(gameState);
  resolveObjectCollisions(gameState);
  resolvePhysicsObjectBodyCollisions(gameState);
  resolveObjectObstacleCollisions(gameState);
  checkPitFalls(gameState);
  processDestroyedObstacles();
  updateEffectGhosts(gameDt);
  updateParticles(gameDt);
  updateAoeTelegraphs(gameDt);
  updatePendingEffects(gameDt);
  updateMortarProjectiles(gameDt);
  updateIcePatches(gameDt);
  if (gameState.phase === "gameOver") {
    showGameOver(gameState);
  }
  updateCamera(getPlayerPos(), dt);
  updateHUD(gameState);
  checkEditorToggle();
  consumeInput();
  getRendererInstance().render(getScene(), getCamera());
  updateDamageNumbers(gameDt);
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
  resetPlayer();
  resetRoomManager();
  resetBulletTime();
  resetBendMode();
  loadRoom(0, gameState);
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
    initRoomManager(scene2);
    initAudio();
    initParticles(scene2);
    initBulletTime();
    initRadialMenu();
    initBendMode();
    setOnBendSelected(() => enterTargeting());
    on("meleeHit", () => {
      hitPauseTimer = MELEE.hitPause;
    });
    initHUD();
    initDamageNumbers();
    initTuningPanel();
    initSpawnEditor(scene2, gameState);
    initLevelEditor(scene2, gameState);
    initScreens(restart, () => {
      resumeAudio();
      gameState.phase = "playing";
      document.getElementById("hud").style.visibility = "visible";
      loadRoom(0, gameState);
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
