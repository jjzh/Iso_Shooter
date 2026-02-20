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

// src/config/terrain.ts
var HEIGHT_ZONES = [];
function setHeightZones(zones) {
  HEIGHT_ZONES.length = 0;
  zones.forEach((z) => HEIGHT_ZONES.push(z));
}
function getGroundHeight(x, z) {
  let maxY = 0;
  for (const zone of HEIGHT_ZONES) {
    const halfW = zone.w / 2;
    const halfD = zone.d / 2;
    if (x >= zone.x - halfW && x <= zone.x + halfW && z >= zone.z - halfD && z <= zone.z + halfD) {
      if (zone.y > maxY) maxY = zone.y;
    }
  }
  return maxY;
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
var _platformMeshes = [];
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
  if (hasTouch) applyFrustum(6.2);
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
function clearPlatformMeshes() {
  for (const m of _platformMeshes) {
    scene.remove(m);
    if (m.geometry) m.geometry.dispose();
  }
  _platformMeshes = [];
}
function createPlatforms() {
  clearPlatformMeshes();
  const mat = new THREE.MeshStandardMaterial({ color: 3368618, roughness: 0.7 });
  for (const zone of HEIGHT_ZONES) {
    const geo = new THREE.BoxGeometry(zone.w, zone.y, zone.d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(zone.x, zone.y / 2, zone.z);
    scene.add(mesh);
    _platformMeshes.push(mesh);
  }
}
function rebuildArenaVisuals() {
  createObstacles();
  createPits();
  clearPlatformMeshes();
  createPlatforms();
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
function setFrustumSize(size) {
  applyFrustum(size);
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
var JUMP = {
  initialVelocity: 12,
  // upward velocity on jump
  gravity: 25,
  // player gravity (may differ from enemy gravity)
  airControlMult: 1,
  // XZ speed multiplier while airborne
  landingLag: 50,
  // ms of end-lag on landing
  coyoteTime: 80
  // ms of grace period after walking off ledge
};
var AERIAL_STRIKE = {
  damage: 20,
  // bonus damage (more than ground melee)
  range: 2.5,
  // XZ range to find target
  slamVelocity: -18,
  // downward velocity applied to enemy (negative = down)
  screenShake: 2.5,
  // bigger shake than ground melee
  hitPause: 60,
  // longer freeze-frame for impact
  cooldown: 300
  // ms between aerial strikes (shorter than ground melee)
};
var DUNK = {
  slamVelocity: -25,
  // downward velocity for both player + enemy
  damage: 35,
  // big damage on impact (the payoff)
  landingShake: 4,
  // massive screen shake
  landingLag: 200,
  // ms of end-lag
  aoeRadius: 1.5,
  // splash damage radius on impact
  aoeDamage: 10,
  // splash damage to other nearby enemies
  aoeKnockback: 10,
  // knockback to nearby enemies
  targetRadius: 6,
  // radius of landing target circle (world units)
  homing: 60,
  // XZ homing speed toward target (units/sec)
  grabPause: 60,
  // ms freeze-frame on grab
  grabShake: 1.5,
  // screen shake on grab
  carryOffsetY: -0.4,
  // enemy offset below player during slam fall
  carryOffsetZ: 0.35,
  // enemy offset forward during slam fall
  floatDuration: 600,
  // ms of zero-gravity float (aim window before dunk)
  floatConvergeDist: 3.5,
  // Y distance threshold to trigger float
  floatEnemyOffsetY: 0.6,
  // enemy hovers this far above player during float
  floatDriftSpeed: 3,
  // XZ drift speed toward each other during float
  arcRiseVelocity: 8,
  // upward velocity at grab start
  arcXzFraction: 0.3
  // fraction of XZ distance to landing covered during rise
};
var SELF_SLAM = {
  slamVelocity: -30,
  // fast downward velocity
  landingShake: 3,
  // screen shake on impact
  landingLag: 150,
  // ms of end-lag
  damageRadius: 2.5,
  // AoE damage radius on impact
  damage: 15,
  // AoE damage to nearby grounded enemies
  knockback: 8
  // knockback force on nearby enemies
};
var LAUNCH = {
  range: 3,
  // max range to find a target
  enemyVelMult: 1.3,
  // enemy launch velocity = JUMP.initialVelocity × this
  playerVelMult: 1.15,
  // player hop velocity = JUMP.initialVelocity × this
  cooldown: 600,
  // ms cooldown between launches
  damage: 5,
  // small chip damage on launch
  arcFraction: 0.7,
  // fraction of XZ distance covered by arc velocity
  pillarDuration: 500,
  // total animation time ms
  pillarRiseTime: 150,
  // ms to emerge from ground
  pillarHoldTime: 100,
  // ms at peak before sinking
  pillarHeight: 1.2,
  // rise height above ground
  pillarRadius: 0.3,
  // cylinder radius
  pillarColor: 8943462,
  // stone gray-brown
  windupDuration: 120,
  // ms delay between E press and launch execution
  indicatorColor: 16755200,
  // ring + emissive color
  indicatorRingRadius: 0.6,
  // outer radius of ground ring
  indicatorOpacity: 0.4
  // base ring opacity
};
var FLOAT_SELECTOR = {
  holdThreshold: 180,
  // ms to differentiate tap (spike) vs hold (dunk)
  chargeVisualDelay: 50,
  // ms before charge ring starts filling
  floatDriftRate: 6
  // exponential decay rate for XZ drift during float
};
var SPIKE = {
  damage: 15,
  // hit damage to spiked enemy on strike
  projectileSpeed: 25,
  // enemy flight speed (units/sec)
  projectileAngle: 35,
  // degrees below horizontal toward aim point
  throughDamage: 20,
  // damage to enemies hit along flight path
  throughKnockback: 8,
  // knockback to path-hit enemies
  impactDamage: 15,
  // AoE damage on ground impact
  impactRadius: 2,
  // AoE radius on ground impact
  impactKnockback: 10,
  // knockback on ground impact
  windupDuration: 80,
  // ms windup before strike
  hangDuration: 150,
  // ms hang after strike (follow-through)
  fastFallGravityMult: 2.5,
  // enhanced gravity during post-spike fall
  screenShake: 3,
  // shake on spike strike
  impactShake: 2.5
  // shake on enemy ground impact
};

// src/config/abilities.ts
var ABILITIES = {
  dash: {
    name: "Shadow Dash",
    key: "Shift",
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
    },
    aggroRadius: 8,
    patrol: {
      distance: 6,
      speed: 1.2,
      pauseMin: 500,
      pauseMax: 1500
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
    const active3 = pool3.getActive();
    for (let i = active3.length - 1; i >= 0; i--) {
      const p = active3[i];
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

// src/engine/tags.ts
var tagSets = /* @__PURE__ */ new Map();
function ensureSet(owner) {
  let set = tagSets.get(owner);
  if (!set) {
    set = /* @__PURE__ */ new Set();
    tagSets.set(owner, set);
  }
  return set;
}
function addTag(owner, tag) {
  ensureSet(owner).add(tag);
}
function removeTag(owner, tag) {
  const set = tagSets.get(owner);
  if (set) set.delete(tag);
}
function hasTag(owner, tag) {
  const set = tagSets.get(owner);
  if (!set) return false;
  if (set.has(tag)) return true;
  const prefix = tag + ".";
  for (const t of set) {
    if (t.startsWith(prefix)) return true;
  }
  return false;
}
function removeTagsMatching(owner, prefix) {
  const set = tagSets.get(owner);
  if (!set) return;
  const dotPrefix = prefix + ".";
  for (const tag of [...set]) {
    if (tag === prefix || tag.startsWith(dotPrefix)) {
      set.delete(tag);
    }
  }
}
function clearTags(owner) {
  tagSets.delete(owner);
}
function clearAllTags() {
  tagSets.clear();
}
var PLAYER_OWNER = /* @__PURE__ */ Symbol("player");
function addPlayerTag(tag) {
  addTag(PLAYER_OWNER, tag);
}
function playerHasTag(tag) {
  return hasTag(PLAYER_OWNER, tag);
}
function removePlayerTagsMatching(prefix) {
  removeTagsMatching(PLAYER_OWNER, prefix);
}
function clearPlayerTags() {
  clearTags(PLAYER_OWNER);
}
var TAG = {
  // Aerial verb states (added/removed by aerial verb framework)
  AERIAL: "State.Aerial",
  AERIAL_RISING: "State.Aerial.Rising",
  AERIAL_FLOAT: "State.Aerial.Float",
  AERIAL_DUNK: "State.Aerial.Dunk",
  AERIAL_SPIKE: "State.Aerial.Spike",
  // General player states (future — wire these as needed)
  AIRBORNE: "State.Airborne",
  // Shared states (applicable to any entity)
  STUNNED: "State.Stunned"
};

// src/engine/profileManager.ts
var activeProfile = "base";
var currentHooks = null;
function getActiveProfile() {
  return activeProfile;
}
function setProfile(profile, hooks) {
  if (currentHooks) {
    currentHooks.cleanup();
  }
  activeProfile = profile;
  currentHooks = hooks ?? null;
  if (currentHooks) {
    currentHooks.setup();
  }
}

// src/engine/visionCone.ts
var raycastFn = null;
var VISION_CONE_CONFIG = {
  angle: Math.PI / 3 * 0.8,
  // ~48° cone (20% narrower than 60°)
  segments: 16,
  // geometry resolution
  opacity: 0.08,
  // idle cone opacity
  idleColor: 4521864,
  // green
  detectColor1: 16772676,
  // yellow (detection start)
  detectColor2: 16746496,
  // orange (detection mid)
  aggroColor: 16729156,
  // red (detection full / aggroed)
  fadeAfterAggro: 1e3,
  // ms — fade duration after aggro flash
  aggroHoldDuration: 250,
  // ms — red flash holds at full before fading
  detectionThreshold: 350,
  // ms — player must be in cone this long to trigger aggro
  idleTurnRate: 0.4,
  // rad/s — how fast idle enemies scan back and forth
  idleScanArc: Math.PI / 3,
  // ±60° sweep from initial facing while idle
  turnSpeed: 3
  // rad/s — how fast enemies rotate toward their target facing (all states)
};
var sceneRef3 = null;
var coneMap = /* @__PURE__ */ new Map();
var cachedGeo = null;
var cachedGeoAngle = 0;
function initVisionCones(scene2, raycast) {
  sceneRef3 = scene2;
  if (raycast) raycastFn = raycast;
}
function getConeGeo() {
  const angle = VISION_CONE_CONFIG.angle;
  if (cachedGeo && Math.abs(cachedGeoAngle - angle) < 1e-3) {
    return cachedGeo;
  }
  if (cachedGeo) cachedGeo.dispose();
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
function cloneConeGeo() {
  const geo = getConeGeo().clone();
  const basePositions = new Float32Array(geo.attributes.position.array);
  return { geo, basePositions };
}
function isInsideVisionCone(enemyX, enemyZ, rotationY, targetX, targetZ, radius) {
  const dx = targetX - enemyX;
  const dz = targetZ - enemyZ;
  const distSq = dx * dx + dz * dz;
  if (distSq > radius * radius) return false;
  const angleToTarget = Math.atan2(-dx, -dz);
  let angleDiff = angleToTarget - rotationY;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  const halfAngle = VISION_CONE_CONFIG.angle / 2;
  return Math.abs(angleDiff) <= halfAngle;
}
function updateDetectionColor(data, detectionT) {
  if (detectionT <= 0) {
    data.mesh.material.color.setHex(VISION_CONE_CONFIG.idleColor);
    data.mesh.material.opacity = VISION_CONE_CONFIG.opacity;
  } else if (detectionT < 0.5) {
    const t = detectionT * 2;
    lerpColor(data.mesh.material.color, VISION_CONE_CONFIG.detectColor1, VISION_CONE_CONFIG.detectColor2, t);
    data.mesh.material.opacity = VISION_CONE_CONFIG.opacity + t * 0.12;
  } else {
    const t = (detectionT - 0.5) * 2;
    lerpColor(data.mesh.material.color, VISION_CONE_CONFIG.detectColor2, VISION_CONE_CONFIG.aggroColor, t);
    data.mesh.material.opacity = VISION_CONE_CONFIG.opacity + 0.12 + t * 0.05;
  }
}
var _c1 = { r: 0, g: 0, b: 0 };
var _c2 = { r: 0, g: 0, b: 0 };
function lerpColor(target4, hex1, hex2, t) {
  _c1.r = hex1 >> 16 & 255;
  _c1.g = hex1 >> 8 & 255;
  _c1.b = hex1 & 255;
  _c2.r = hex2 >> 16 & 255;
  _c2.g = hex2 >> 8 & 255;
  _c2.b = hex2 & 255;
  const r = Math.round(_c1.r + (_c2.r - _c1.r) * t);
  const g = Math.round(_c1.g + (_c2.g - _c1.g) * t);
  const b = Math.round(_c1.b + (_c2.b - _c1.b) * t);
  target4.setRGB(r / 255, g / 255, b / 255);
}
function addVisionCone(enemy) {
  if (!sceneRef3) return;
  if (coneMap.has(enemy)) return;
  const aggroRadius = enemy.config.aggroRadius;
  if (!aggroRadius || aggroRadius <= 0) return;
  if (!enemy._facingInitialized) {
    enemy.mesh.rotation.y = (Math.random() - 0.5) * Math.PI * 2;
    enemy.idleBaseRotY = enemy.mesh.rotation.y;
    enemy.idleScanPhase = Math.random() * Math.PI * 2;
    enemy._facingInitialized = true;
  }
  const { geo, basePositions } = cloneConeGeo();
  const mat = new THREE.MeshBasicMaterial({
    color: VISION_CONE_CONFIG.idleColor,
    transparent: true,
    opacity: VISION_CONE_CONFIG.opacity,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.set(aggroRadius, 1, aggroRadius);
  mesh.position.set(enemy.pos.x, 0.02, enemy.pos.z);
  mesh.renderOrder = -1;
  sceneRef3.add(mesh);
  coneMap.set(enemy, {
    mesh,
    basePositions,
    geoAngle: cachedGeoAngle,
    aggroTimer: 0,
    holdTimer: 0,
    wasAggroed: false
  });
}
function updateIdleFacing(enemies, dt) {
  for (const enemy of enemies) {
    if (!enemy.aggroed && enemy.idleBaseRotY != null && !enemy.config.patrol) {
      enemy.idleScanPhase = (enemy.idleScanPhase || 0) + dt * VISION_CONE_CONFIG.idleTurnRate;
      enemy.mesh.rotation.y = enemy.idleBaseRotY + Math.sin(enemy.idleScanPhase) * VISION_CONE_CONFIG.idleScanArc;
    }
  }
}
function updateConeOcclusion(data, enemy) {
  if (!raycastFn) return;
  const positions = data.mesh.geometry.attributes.position.array;
  const base = data.basePositions;
  const aggroRadius = enemy.config.aggroRadius;
  const rotY = enemy.mesh.rotation.y;
  const cosR = Math.cos(rotY);
  const sinR = Math.sin(rotY);
  const segments = VISION_CONE_CONFIG.segments;
  for (let i = 1; i <= segments + 1; i++) {
    const bx = base[i * 3 + 0];
    const bz = base[i * 3 + 2];
    const worldDirX = bx * cosR + bz * sinR;
    const worldDirZ = -bx * sinR + bz * cosR;
    const len = Math.sqrt(worldDirX * worldDirX + worldDirZ * worldDirZ);
    if (len < 1e-3) continue;
    const ndx = worldDirX / len;
    const ndz = worldDirZ / len;
    const hitDist = raycastFn(enemy.pos.x, enemy.pos.z, ndx, ndz, aggroRadius);
    const scale = Math.min(hitDist / aggroRadius, 1);
    positions[i * 3 + 0] = bx * scale;
    positions[i * 3 + 2] = bz * scale;
  }
  data.mesh.geometry.attributes.position.needsUpdate = true;
}
function updateVisionCones(enemies, dt) {
  getConeGeo();
  for (const enemy of enemies) {
    const data = coneMap.get(enemy);
    if (!data) continue;
    if (Math.abs(data.geoAngle - cachedGeoAngle) > 1e-3) {
      data.mesh.geometry.dispose();
      const { geo, basePositions } = cloneConeGeo();
      data.mesh.geometry = geo;
      data.basePositions = basePositions;
      data.geoAngle = cachedGeoAngle;
    }
    data.mesh.position.set(enemy.pos.x, 0.02, enemy.pos.z);
    const aggroRadius = enemy.config.aggroRadius;
    if (aggroRadius && aggroRadius > 0) {
      data.mesh.scale.set(aggroRadius, 1, aggroRadius);
    }
    data.mesh.rotation.y = enemy.mesh.rotation.y;
    if (!data.wasAggroed && aggroRadius > 0) {
      updateConeOcclusion(data, enemy);
    }
    if (!enemy.aggroed && !data.wasAggroed) {
      const threshold = VISION_CONE_CONFIG.detectionThreshold;
      const detectionT = threshold > 0 ? Math.min((enemy.detectionTimer || 0) / threshold, 1) : 0;
      updateDetectionColor(data, detectionT);
    }
    if (enemy.aggroed && !data.wasAggroed) {
      data.wasAggroed = true;
      data.holdTimer = VISION_CONE_CONFIG.aggroHoldDuration;
      data.aggroTimer = VISION_CONE_CONFIG.fadeAfterAggro;
      data.mesh.material.color.setHex(VISION_CONE_CONFIG.aggroColor);
      data.mesh.material.opacity = 0.25;
    }
    if (data.wasAggroed) {
      if (data.holdTimer > 0) {
        data.holdTimer -= dt * 1e3;
      } else if (data.aggroTimer > 0) {
        data.aggroTimer -= dt * 1e3;
        const fadeT = Math.max(0, data.aggroTimer / VISION_CONE_CONFIG.fadeAfterAggro);
        data.mesh.material.opacity = 0.25 * fadeT;
        if (data.aggroTimer <= 0) {
          data.mesh.visible = false;
        }
      }
    }
  }
}
function removeVisionCone(enemy) {
  const data = coneMap.get(enemy);
  if (!data) return;
  if (sceneRef3) {
    sceneRef3.remove(data.mesh);
  }
  data.mesh.geometry.dispose();
  data.mesh.material.dispose();
  coneMap.delete(enemy);
}
function clearVisionCones() {
  for (const [enemy, data] of coneMap) {
    if (sceneRef3) {
      sceneRef3.remove(data.mesh);
    }
    data.mesh.geometry.dispose();
    data.mesh.material.dispose();
  }
  coneMap.clear();
}

// src/entities/enemy.ts
var sceneRef4;
var shieldGeo;
var _mortarFillGeoShared = null;
var _deathFillGeoShared = null;
var AGGRO_IND = {
  heightAbove: 2.2,
  popDuration: 120,
  holdDuration: 600,
  fadeDuration: 400,
  bobSpeed: 6,
  bobAmp: 0.08
};
var aggroIndicators = [];
function showAggroIndicator(enemy) {
  if (!sceneRef4) return;
  const group = new THREE.Group();
  const coneGeo = new THREE.ConeGeometry(0.12, 0.5, 6);
  const mat = new THREE.MeshStandardMaterial({
    color: 16729156,
    emissive: 16720418,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 1
  });
  const cone = new THREE.Mesh(coneGeo, mat);
  cone.position.y = 0.15;
  group.add(cone);
  const dotGeo = new THREE.SphereGeometry(0.08, 6, 6);
  const dot = new THREE.Mesh(dotGeo, mat.clone());
  dot.position.y = -0.2;
  group.add(dot);
  group.position.set(enemy.pos.x, enemy.config.size.height + AGGRO_IND.heightAbove, enemy.pos.z);
  group.scale.set(0, 0, 0);
  sceneRef4.add(group);
  aggroIndicators.push({ mesh: group, phase: "pop", timer: AGGRO_IND.popDuration, enemy });
}
function updateAggroIndicators(dt) {
  for (let i = aggroIndicators.length - 1; i >= 0; i--) {
    const ind = aggroIndicators[i];
    ind.timer -= dt * 1e3;
    ind.mesh.position.x = ind.enemy.pos.x;
    ind.mesh.position.z = ind.enemy.pos.z;
    if (ind.phase === "pop") {
      const t = 1 - ind.timer / AGGRO_IND.popDuration;
      const s = t < 0.7 ? t / 0.7 * 1.4 : 1.4 - (t - 0.7) / 0.3 * 0.4;
      ind.mesh.scale.set(s, s, s);
      if (ind.timer <= 0) {
        ind.phase = "hold";
        ind.timer = AGGRO_IND.holdDuration;
        ind.mesh.scale.set(1, 1, 1);
      }
    } else if (ind.phase === "hold") {
      const bob = Math.sin(Date.now() * 1e-3 * AGGRO_IND.bobSpeed) * AGGRO_IND.bobAmp;
      ind.mesh.position.y = ind.enemy.config.size.height + AGGRO_IND.heightAbove + bob;
      if (ind.timer <= 0) {
        ind.phase = "fade";
        ind.timer = AGGRO_IND.fadeDuration;
      }
    } else {
      const fadeT = Math.max(0, ind.timer / AGGRO_IND.fadeDuration);
      ind.mesh.scale.set(fadeT, fadeT, fadeT);
      ind.mesh.children.forEach((c) => {
        if (c.material) c.material.opacity = fadeT;
      });
      if (ind.timer <= 0) {
        sceneRef4.remove(ind.mesh);
        aggroIndicators.splice(i, 1);
      }
    }
  }
}
function clearAggroIndicators() {
  for (const ind of aggroIndicators) {
    if (sceneRef4) sceneRef4.remove(ind.mesh);
  }
  aggroIndicators.length = 0;
}
var PUSH_AGGRO_DELAY = 250;
function initEnemySystem(scene2) {
  sceneRef4 = scene2;
  on("enemyPushed", (e) => {
    if (e.type !== "enemyPushed") return;
    const enemy = e.enemy;
    if (!enemy.aggroed && enemy.config.aggroRadius && getActiveProfile() === "assassin") {
      enemy.pushAggroTimer = PUSH_AGGRO_DELAY;
    }
  });
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
function spawnEnemy(typeName, position, gameState2, patrolWaypoints) {
  const cfg = ENEMY_TYPES[typeName];
  if (!cfg) return null;
  const group = new THREE.Group();
  const model = buildEnemyModel(typeName, cfg, group);
  const bodyMesh = model.bodyMesh;
  const headMesh = model.headMesh;
  group.position.copy(position);
  sceneRef4.add(group);
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
    vel: { x: 0, y: 0, z: 0 },
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
    allMaterials: model.allMaterials,
    // Assassin profile state
    aggroed: true,
    // default true — non-assassin rooms skip detection
    detecting: false,
    // true while player is in cone + LOS (detection building)
    detectionTimer: 0,
    pushAggroTimer: 0,
    // ms remaining until push-triggered aggro (0 = inactive)
    patrolOriginX: position.x,
    patrolOriginZ: position.z,
    patrolDir: 1,
    patrolPauseTimer: 0,
    patrolTargetAngle: null,
    // Waypoint patrol (assassin rooms with fixed patrol circuits)
    patrolWaypoints: patrolWaypoints || null,
    patrolWaypointIdx: 0
  };
  if (cfg.shield && cfg.shield.maxHealth > 0) {
    enemy.shieldHealth = cfg.shield.maxHealth;
    enemy.shieldActive = true;
    enemy.shieldMesh = createShieldMesh(cfg);
    enemy.shieldMesh.position.y = cfg.size.height * 0.5;
    group.add(enemy.shieldMesh);
  }
  gameState2.enemies.push(enemy);
  if (getActiveProfile() === "assassin" && cfg.aggroRadius) {
    enemy.aggroed = false;
    if (patrolWaypoints && patrolWaypoints.length > 1) {
      const wp = patrolWaypoints[1];
      const dx = wp.x - position.x;
      const dz = wp.z - position.z;
      enemy.mesh.rotation.y = rotationToFace(dx, dz);
    } else {
      enemy.mesh.rotation.y = (Math.random() - 0.5) * Math.PI * 2;
    }
    enemy.idleBaseRotY = enemy.mesh.rotation.y;
    enemy.idleScanPhase = Math.random() * Math.PI * 2;
    enemy._facingInitialized = true;
    addVisionCone(enemy);
  }
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
function getForward(rotY) {
  return { x: -Math.sin(rotY), z: -Math.cos(rotY) };
}
function rotationToFace(dx, dz) {
  return Math.atan2(-dx, -dz);
}
function turnToward(enemy, targetRotY, dt) {
  let diff = targetRotY - enemy.mesh.rotation.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxStep = VISION_CONE_CONFIG.turnSpeed * dt;
  if (Math.abs(diff) <= maxStep) {
    enemy.mesh.rotation.y = targetRotY;
  } else {
    enemy.mesh.rotation.y += Math.sign(diff) * maxStep;
  }
}
var WAYPOINT_TURN_SPEED = 1.2;
var WAYPOINT_ARRIVAL_DIST = 0.5;
function updateWaypointPatrol(enemy, dt) {
  const wps = enemy.patrolWaypoints;
  const target4 = wps[enemy.patrolWaypointIdx];
  const dx = target4.x - enemy.pos.x;
  const dz = target4.z - enemy.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < WAYPOINT_ARRIVAL_DIST) {
    enemy.patrolWaypointIdx = (enemy.patrolWaypointIdx + 1) % wps.length;
    return;
  }
  const targetRot = rotationToFace(dx, dz);
  let diff = targetRot - enemy.mesh.rotation.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxStep = WAYPOINT_TURN_SPEED * dt;
  if (Math.abs(diff) <= maxStep) {
    enemy.mesh.rotation.y = targetRot;
  } else {
    enemy.mesh.rotation.y += Math.sign(diff) * maxStep;
  }
  if (Math.abs(diff) < Math.PI / 4) {
    const speed = (enemy.config.patrol?.speed || 1.2) * (enemy.slowMult || 1);
    const fwd = getForward(enemy.mesh.rotation.y);
    enemy.pos.x += fwd.x * speed * dt;
    enemy.pos.z += fwd.z * speed * dt;
    enemy.pos.x = Math.max(-ARENA_HALF_X + 1, Math.min(ARENA_HALF_X - 1, enemy.pos.x));
    enemy.pos.z = Math.max(-ARENA_HALF_Z + 1, Math.min(ARENA_HALF_Z - 1, enemy.pos.z));
  }
}
function updatePatrol(enemy, dt) {
  if (enemy.patrolWaypoints && enemy.patrolWaypoints.length > 0) {
    return updateWaypointPatrol(enemy, dt);
  }
  const cfg = enemy.config.patrol;
  if (!cfg) return;
  if (enemy.patrolPauseTimer > 0) {
    enemy.patrolPauseTimer -= dt * 1e3;
    if (enemy.patrolTargetAngle != null) {
      turnToward(enemy, enemy.patrolTargetAngle, dt);
    }
    return;
  }
  const fwd = getForward(enemy.mesh.rotation.y);
  const speed = cfg.speed * (enemy.slowMult || 1);
  const hitDist = raycastTerrainDist(enemy.pos.x, enemy.pos.z, fwd.x, fwd.z, 1.5);
  const hitWall = hitDist < 1;
  const dFromOriginX = enemy.pos.x - enemy.patrolOriginX;
  const dFromOriginZ = enemy.pos.z - enemy.patrolOriginZ;
  const distFromOrigin = Math.sqrt(dFromOriginX * dFromOriginX + dFromOriginZ * dFromOriginZ);
  const reachedEnd = distFromOrigin >= cfg.distance;
  if (hitWall || reachedEnd) {
    enemy.patrolDir *= -1;
    enemy.patrolTargetAngle = enemy.mesh.rotation.y + Math.PI;
    while (enemy.patrolTargetAngle > Math.PI) enemy.patrolTargetAngle -= Math.PI * 2;
    while (enemy.patrolTargetAngle < -Math.PI) enemy.patrolTargetAngle += Math.PI * 2;
    enemy.patrolPauseTimer = cfg.pauseMin + Math.random() * (cfg.pauseMax - cfg.pauseMin);
    return;
  }
  enemy.pos.x += fwd.x * speed * dt;
  enemy.pos.z += fwd.z * speed * dt;
  enemy.pos.x = Math.max(-ARENA_HALF_X + 1, Math.min(ARENA_HALF_X - 1, enemy.pos.x));
  enemy.pos.z = Math.max(-ARENA_HALF_Z + 1, Math.min(ARENA_HALF_Z - 1, enemy.pos.z));
}
function updateEnemies(dt, playerPos2, gameState2) {
  const isAssassin = getActiveProfile() === "assassin";
  if (isAssassin) {
    updateIdleFacing(gameState2.enemies, dt);
  }
  for (let i = gameState2.enemies.length - 1; i >= 0; i--) {
    const enemy = gameState2.enemies[i];
    if (enemy.isCarrierPayload) continue;
    if (isAssassin && !enemy.aggroed && enemy.config.aggroRadius) {
      if (enemy.pushAggroTimer > 0) {
        enemy.pushAggroTimer -= dt * 1e3;
        if (enemy.pushAggroTimer <= 0) {
          enemy.pushAggroTimer = 0;
          enemy.aggroed = true;
          emit({ type: "enemyAggroed", enemy, position: { x: enemy.pos.x, z: enemy.pos.z } });
          showAggroIndicator(enemy);
          if (playerPos2) {
            const toDx = playerPos2.x - enemy.pos.x;
            const toDz = playerPos2.z - enemy.pos.z;
            enemy.mesh.rotation.y = rotationToFace(toDx, toDz);
          }
        }
      }
      if (!enemy.aggroed && enemy.health < enemy.config.health) {
        enemy.aggroed = true;
        emit({ type: "enemyAggroed", enemy, position: { x: enemy.pos.x, z: enemy.pos.z } });
        showAggroIndicator(enemy);
        if (playerPos2) {
          const toDx = playerPos2.x - enemy.pos.x;
          const toDz = playerPos2.z - enemy.pos.z;
          enemy.mesh.rotation.y = rotationToFace(toDx, toDz);
        }
      }
      if (!enemy.aggroed) {
        if (enemy.config.patrol && !enemy.isLeaping) {
          updatePatrol(enemy, dt);
        }
        if (playerPos2) {
          const inCone = isInsideVisionCone(
            enemy.pos.x,
            enemy.pos.z,
            enemy.mesh.rotation.y,
            playerPos2.x,
            playerPos2.z,
            enemy.config.aggroRadius
          );
          let inLOS = true;
          if (inCone) {
            const ddx = playerPos2.x - enemy.pos.x;
            const ddz = playerPos2.z - enemy.pos.z;
            const dist = Math.sqrt(ddx * ddx + ddz * ddz);
            if (dist > 0.1) {
              const hitDist = raycastTerrainDist(enemy.pos.x, enemy.pos.z, ddx / dist, ddz / dist, dist);
              inLOS = hitDist >= dist - 0.5;
            }
          }
          if (inCone && inLOS) {
            if (!enemy.detecting) {
              enemy.detecting = true;
              emit({ type: "detectionStarted", enemy, position: { x: enemy.pos.x, z: enemy.pos.z } });
            }
            enemy.detectionTimer += dt * 1e3;
            if (enemy.detectionTimer >= VISION_CONE_CONFIG.detectionThreshold) {
              enemy.detecting = false;
              enemy.aggroed = true;
              emit({ type: "enemyAggroed", enemy, position: { x: enemy.pos.x, z: enemy.pos.z } });
              showAggroIndicator(enemy);
              const toDx = playerPos2.x - enemy.pos.x;
              const toDz = playerPos2.z - enemy.pos.z;
              enemy.mesh.rotation.y = rotationToFace(toDx, toDz);
            }
          } else {
            enemy.detectionTimer = Math.max(0, enemy.detectionTimer - dt * 1500);
            if (enemy.detecting && enemy.detectionTimer === 0) {
              enemy.detecting = false;
              emit({ type: "detectionCleared", enemy, position: { x: enemy.pos.x, z: enemy.pos.z } });
            }
          }
        }
        if (enemy.health <= 0) {
          if (enemy.detecting) {
            enemy.detecting = false;
            emit({ type: "detectionCleared", enemy, position: { x: enemy.pos.x, z: enemy.pos.z } });
          }
          emit({ type: "enemyDied", enemy, position: { x: enemy.pos.x, z: enemy.pos.z } });
          removeVisionCone(enemy);
          sceneRef4.remove(enemy.mesh);
          gameState2.enemies.splice(i, 1);
          const drops = enemy.config.drops;
          gameState2.currency += Math.floor(
            drops.currency.min + Math.random() * (drops.currency.max - drops.currency.min + 1)
          );
          continue;
        }
        enemy.pos.x = Math.max(-ARENA_HALF_X, Math.min(ARENA_HALF_X, enemy.pos.x));
        enemy.pos.z = Math.max(-ARENA_HALF_Z, Math.min(ARENA_HALF_Z, enemy.pos.z));
        enemy.mesh.position.copy(enemy.pos);
        continue;
      }
    }
    if (enemy.isLeaping) {
      updateLeap(enemy, dt);
    } else if (enemy.stunTimer > 0 || hasTag(enemy, TAG.STUNNED)) {
      if (enemy.stunTimer > 0) enemy.stunTimer -= dt * 1e3;
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
    if (!enemy.isLeaping) {
      const groundBelow = getGroundHeight(enemy.pos.x, enemy.pos.z);
      if (enemy.pos.y > groundBelow + 0.05) {
        const vel = enemy.vel;
        if (vel && vel.y === 0) vel.y = 0;
      }
    }
    if (enemy.isLeaping) {
      enemy.mesh.position.x = enemy.pos.x;
      enemy.mesh.position.z = enemy.pos.z;
    } else {
      enemy.mesh.position.copy(enemy.pos);
    }
    const groundBelowEnemy = getGroundHeight(enemy.pos.x, enemy.pos.z);
    const enemyAirborne = enemy.pos.y > groundBelowEnemy + 0.15 && !enemy.isLeaping;
    if (enemyAirborne) {
      if (!enemy._tumbleAngle) enemy._tumbleAngle = 0;
      enemy._tumbleAngle += dt * 8;
      enemy.mesh.rotation.x = Math.sin(enemy._tumbleAngle) * 0.5;
      enemy.mesh.rotation.z = Math.cos(enemy._tumbleAngle * 0.7) * 0.3;
      const vy = enemy.vel.y || 0;
      const stretch = 1 + Math.abs(vy) * 0.02;
      const squash = 1 / Math.sqrt(stretch);
      enemy.mesh.scale.set(squash, stretch, squash);
    } else {
      enemy.mesh.rotation.x = 0;
      enemy.mesh.rotation.z = 0;
      enemy.mesh.scale.set(1, 1, 1);
      enemy._tumbleAngle = 0;
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
        removeVisionCone(enemy);
        sceneRef4.remove(enemy.mesh);
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
        removeVisionCone(enemy);
        sceneRef4.remove(enemy.mesh);
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
      removeVisionCone(enemy);
      sceneRef4.remove(enemy.mesh);
      gameState2.enemies.splice(i, 1);
      const drops = enemy.config.drops;
      gameState2.currency += Math.floor(
        drops.currency.min + Math.random() * (drops.currency.max - drops.currency.min + 1)
      );
    }
  }
  if (isAssassin) {
    updateVisionCones(gameState2.enemies, dt);
    updateAggroIndicators(dt);
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
  sceneRef4.add(line);
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
    sceneRef4.remove(enemy.mortarArcLine);
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
  const ringMat2 = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const ringMesh2 = new THREE.Mesh(_circleGeo, ringMat2);
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
  group.add(ringMesh2);
  group.add(fillMesh);
  group.position.set(enemy.mortarTarget.x, 0.05, enemy.mortarTarget.z);
  const circleStartScale = mortar.circleStartScale || 0.25;
  const startScale = radius * circleStartScale;
  group.scale.set(startScale, startScale, startScale);
  sceneRef4.add(group);
  enemy.mortarGroundCircle = {
    group,
    ringMat: ringMat2,
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
    sceneRef4.remove(gc.group);
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
  const ringMat2 = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const ringMesh2 = new THREE.Mesh(_deathCircleGeo, ringMat2);
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
  group.add(ringMesh2);
  group.add(fillMesh);
  group.position.set(enemy.pos.x, 0.05, enemy.pos.z);
  group.scale.set(0.1, 0.1, 0.1);
  sceneRef4.add(group);
  enemy.deathTelegraph = {
    group,
    ringMat: ringMat2,
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
  sceneRef4.remove(tg.group);
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
  clearVisionCones();
  clearAggroIndicators();
  for (const enemy of gameState2.enemies) {
    if (enemy.shieldMesh) {
      enemy.shieldMesh.geometry.dispose();
      enemy.shieldMesh.material.dispose();
    }
    removeMortarArcLine(enemy);
    removeMortarGroundCircle(enemy);
    removeDeathTelegraph(enemy);
    sceneRef4.remove(enemy.mesh);
  }
  gameState2.enemies.length = 0;
  _collisionBounds = null;
  _pitBoundsCache = null;
}

// src/entities/mortarProjectile.ts
var sceneRef5;
var activeMortars = [];
var activeIcePatches = [];
var shellGeo;
function initMortarSystem(scene2) {
  sceneRef5 = scene2;
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
  sceneRef5.add(mesh);
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
  sceneRef5.add(trail);
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
  sceneRef5.add(mesh);
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
      sceneRef5.remove(patch.mesh);
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
  sceneRef5.remove(m.mesh);
  m.trailGeo.dispose();
  m.trailMat.dispose();
  sceneRef5.remove(m.trail);
  if (m.groundCircle) {
    const gc = m.groundCircle;
    gc.ringMat.dispose();
    gc.fillMat.dispose();
    sceneRef5.remove(gc.group);
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
    sceneRef5.remove(patch.mesh);
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
  fist: { color: 5627306, emissive: 3390344, emissiveIntensity: 0.5 }
};
var _torsoGeo = null;
var _headGeo = null;
var _upperArmGeo = null;
var _lowerArmGeo = null;
var _thighGeo = null;
var _shinGeo = null;
var _fistGeo = null;
function ensureGeometry() {
  if (_torsoGeo) return;
  _torsoGeo = new THREE.BoxGeometry(P.torsoWidth, P.torsoHeight, P.torsoDepth);
  _headGeo = new THREE.SphereGeometry(P.headRadius, 8, 6);
  _upperArmGeo = new THREE.BoxGeometry(P.upperArmWidth, P.upperArmHeight, P.upperArmDepth);
  _lowerArmGeo = new THREE.BoxGeometry(P.lowerArmWidth, P.lowerArmHeight, P.lowerArmDepth);
  _thighGeo = new THREE.BoxGeometry(P.thighWidth, P.thighHeight, P.thighDepth);
  _shinGeo = new THREE.BoxGeometry(P.shinWidth, P.shinHeight, P.shinDepth);
  _fistGeo = new THREE.BoxGeometry(0.1, 0.08, 0.1);
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
  addMesh(_fistGeo, COLORS.fist, lowerArmL, 0, P.lowerArmY - P.lowerArmHeight / 2 - 0.02, 0);
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
  addMesh(_fistGeo, COLORS.fist, lowerArmR, 0, P.lowerArmY - P.lowerArmHeight / 2 - 0.02, 0);
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
  // Airborne
  jumpTuckAngle: 0.7,
  // radians — thigh tuck during jump rise
  jumpKneeBend: 0.9,
  // radians — knee bend during tuck
  jumpArmRaise: -0.4,
  // radians — arms rise slightly
  fallSpreadAngle: 0.35,
  // radians — legs spread slightly during fall
  fallArmRaise: -0.6,
  // radians — arms rise higher in freefall
  slamTuckAngle: 1,
  // radians — tight tuck during slam
  slamArmAngle: 0.8,
  // radians — arms up overhead during slam
  airSquashY: 1.1,
  // stretch on jump rise
  airSquashXZ: 0.92,
  // compress X/Z on jump rise
  slamStretchY: 0.8,
  // compress on slam descent
  slamStretchXZ: 1.15,
  // widen on slam descent
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
    time: 0,
    punchSide: 0,
    chargeT: 0,
    chargeReleaseTimer: 0
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
function updateAnimation(joints, anim, dt, inputState2, aimAngle, isDashing2, isInEndLag, dashProgress, isSwinging = false, swingProgress = 0, isAirborne = false, velY = 0, isSlamming2 = false, isCharging2 = false, chargeT = 0) {
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
  } else if (isCharging2) {
    if (anim.currentState !== "charge") {
      transitionTo(anim, "charge", 0);
    }
    anim.chargeT = chargeT;
  } else if (anim.currentState === "charge" && !isCharging2) {
    transitionTo(anim, "chargeRelease", 0);
    anim.chargeReleaseTimer = 0;
  } else if (anim.currentState === "chargeRelease") {
    anim.chargeReleaseTimer += dt;
    if (anim.chargeReleaseTimer >= 0.25) {
      if (isMoving) {
        transitionTo(anim, "run", C.endLagToNormalBlend / 1e3);
      } else {
        transitionTo(anim, "idle", C.endLagToNormalBlend / 1e3);
      }
    }
  } else if (isSwinging) {
    if (anim.currentState !== "swing") {
      transitionTo(anim, "swing", 0);
      anim.punchSide = 1 - anim.punchSide;
    }
    anim.dashT = swingProgress;
  } else if (isAirborne && isSlamming2) {
    if (anim.currentState !== "slam") {
      transitionTo(anim, "slam", 0);
    }
  } else if (isAirborne && velY > 0) {
    if (anim.currentState !== "jump") {
      transitionTo(anim, "jump", 0);
    }
  } else if (isAirborne) {
    if (anim.currentState !== "fall") {
      transitionTo(anim, "fall", 0);
    }
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
    case "charge":
      applyCharge(joints, anim);
      break;
    case "chargeRelease":
      applyChargeRelease(joints, anim);
      break;
    case "jump":
      applyJump(joints, anim);
      break;
    case "fall":
      applyFall(joints, anim);
      break;
    case "slam":
      applySlam(joints, anim);
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
  const phase4 = anim.runCyclePhase * Math.PI * 2;
  const thighSwing = Math.sin(phase4) * C.strideAngle;
  joints.thighL.rotation.x = thighSwing;
  joints.thighR.rotation.x = -thighSwing;
  const kneeL = Math.max(0, Math.sin(phase4 - 0.6)) * C.kneeBendMax;
  const kneeR = Math.max(0, Math.sin(phase4 - 0.6 + Math.PI)) * C.kneeBendMax;
  joints.shinL.rotation.x = -kneeL;
  joints.shinR.rotation.x = -kneeR;
  const armSwing = Math.sin(phase4) * C.strideAngle * C.armSwingRatio;
  joints.upperArmL.rotation.x = -armSwing;
  joints.upperArmR.rotation.x = armSwing;
  const forearmSwing = Math.sin(phase4 - C.forearmLag) * C.strideAngle * C.armSwingRatio * 0.5;
  joints.lowerArmL.rotation.x = -Math.abs(forearmSwing) - 0.15;
  joints.lowerArmR.rotation.x = -Math.abs(forearmSwing) - 0.15;
  const bounce = Math.abs(Math.sin(phase4 * 2)) * C.bodyBounceHeight;
  joints.hip.position.y = 0.5 + bounce;
  joints.torso.rotation.y = Math.sin(phase4) * 0.06;
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
  const isLeft = anim.punchSide === 1;
  const punchUpper = isLeft ? joints.upperArmL : joints.upperArmR;
  const punchLower = isLeft ? joints.lowerArmL : joints.lowerArmR;
  const guardUpper = isLeft ? joints.upperArmR : joints.upperArmL;
  const guardLower = isLeft ? joints.lowerArmR : joints.lowerArmL;
  const torsoTwistSign = isLeft ? 1 : -1;
  const leadThigh = isLeft ? joints.thighL : joints.thighR;
  const leadShin = isLeft ? joints.shinL : joints.shinR;
  const rearThigh = isLeft ? joints.thighR : joints.thighL;
  const rearShin = isLeft ? joints.shinR : joints.shinL;
  if (t < 0.25) {
    const subT = t / 0.25;
    const ease = easeOutQuad2(subT);
    punchUpper.rotation.x = 0.35 * ease;
    punchLower.rotation.x = -0.9 * ease;
    guardUpper.rotation.x = -0.35 * ease;
    guardLower.rotation.x = -0.75 * ease;
    joints.torso.rotation.y = -0.25 * torsoTwistSign * ease;
    joints.rigRoot.rotation.x = 0.04 * ease;
    joints.hip.position.y = 0.5 - 0.02 * ease;
    rearThigh.rotation.x = -0.12 * ease;
    rearShin.rotation.x = -0.2 * ease;
    leadThigh.rotation.x = 0.08 * ease;
    leadShin.rotation.x = -0.05 * ease;
    joints.hip.rotation.z = -0.03 * torsoTwistSign * ease;
  } else {
    const subT = (t - 0.25) / 0.75;
    const ease = easeOutQuad2(subT);
    punchUpper.rotation.x = 0.35 + (-1.3 - 0.35) * ease;
    punchLower.rotation.x = -0.9 + (0.9 - 0.12) * ease;
    guardUpper.rotation.x = -0.35;
    guardLower.rotation.x = -0.75;
    joints.torso.rotation.y = (-0.25 + (0.4 + 0.25) * ease) * torsoTwistSign;
    const leanCurve = subT < 0.35 ? easeOutQuad2(subT / 0.35) : 1 - 0.4 * easeOutQuad2((subT - 0.35) / 0.65);
    joints.rigRoot.rotation.x = 0.04 + 0.16 * leanCurve;
    const hipDrop = subT < 0.3 ? easeOutQuad2(subT / 0.3) : 1 - 0.5 * easeOutQuad2((subT - 0.3) / 0.7);
    joints.hip.position.y = 0.5 - 0.02 - 0.025 * hipDrop;
    joints.hip.rotation.z = (-0.03 + 0.08 * ease) * torsoTwistSign;
    const stepCurve = subT < 0.4 ? easeOutQuad2(subT / 0.4) : 1 - 0.3 * easeOutQuad2((subT - 0.4) / 0.6);
    leadThigh.rotation.x = 0.08 + 0.35 * stepCurve;
    leadShin.rotation.x = -0.05 - 0.25 * stepCurve;
    const pushCurve = subT < 0.5 ? easeOutQuad2(subT / 0.5) : 1 - 0.2 * easeOutQuad2((subT - 0.5) / 0.5);
    rearThigh.rotation.x = -0.12 - 0.2 * pushCurve;
    rearShin.rotation.x = -0.2 - 0.15 * pushCurve;
  }
}
function applyCharge(joints, anim) {
  const chargeT = clamp(anim.chargeT, 0, 1);
  const blendIn = clamp(anim.stateTimer / 0.15, 0, 1);
  const ease = easeOutQuad2(blendIn);
  const loopRate = 3.5;
  const sway = Math.sin(anim.time * loopRate * Math.PI * 2);
  const swaySmall = Math.sin(anim.time * loopRate * 0.7 * Math.PI * 2);
  const crouch = 0.04 + 0.04 * chargeT;
  joints.hip.position.y = 0.5 - crouch * ease;
  joints.thighL.rotation.x = 0.15 * ease;
  joints.thighR.rotation.x = -0.15 * ease;
  joints.thighL.rotation.z = 0.08 * ease;
  joints.thighR.rotation.z = -0.08 * ease;
  joints.shinL.rotation.x = -0.2 * ease;
  joints.shinR.rotation.x = -0.2 * ease;
  const armPull = 0.5 + 0.6 * chargeT;
  const elbowFlare = 0.2 + 0.3 * chargeT;
  joints.upperArmL.rotation.x = armPull * ease;
  joints.upperArmR.rotation.x = armPull * ease;
  joints.upperArmL.rotation.z = elbowFlare * ease;
  joints.upperArmR.rotation.z = -elbowFlare * ease;
  joints.lowerArmL.rotation.x = (-0.6 - 0.3 * chargeT) * ease;
  joints.lowerArmR.rotation.x = (-0.6 - 0.3 * chargeT) * ease;
  const leanBack = -0.06 - 0.08 * chargeT;
  joints.rigRoot.rotation.x = leanBack * ease;
  joints.torso.rotation.x = -0.04 * chargeT * ease;
  const swayAmp = 0.02 + 0.03 * chargeT;
  joints.torso.rotation.y = sway * swayAmp * ease;
  joints.hip.rotation.z = swaySmall * 0.015 * ease;
  const armPulse = sway * 0.06 * chargeT * ease;
  joints.upperArmL.rotation.x += armPulse;
  joints.upperArmR.rotation.x += armPulse;
  joints.head.rotation.x = 0.08 * chargeT * ease;
}
function applyChargeRelease(joints, anim) {
  const t = clamp(anim.chargeReleaseTimer / 0.25, 0, 1);
  if (t < 0.35) {
    const subT = t / 0.35;
    const ease = easeOutQuad2(subT);
    joints.upperArmL.rotation.x = 0.5 + (-1.4 - 0.5) * ease;
    joints.upperArmR.rotation.x = 0.5 + (-1.4 - 0.5) * ease;
    joints.lowerArmL.rotation.x = -0.6 + (0.6 - 0.1) * ease;
    joints.lowerArmR.rotation.x = -0.6 + (0.6 - 0.1) * ease;
    joints.upperArmL.rotation.z = 0.3 + (-0.3 - 0.3) * ease;
    joints.upperArmR.rotation.z = -0.3 + (0.3 + 0.3) * ease;
    joints.rigRoot.rotation.x = -0.1 + (0.22 + 0.1) * ease;
    joints.hip.position.y = 0.5 - 0.06 * ease;
    joints.thighL.rotation.x = 0.15 + 0.35 * ease;
    joints.shinL.rotation.x = -0.2 - 0.2 * ease;
    joints.thighR.rotation.x = -0.15 - 0.15 * ease;
    joints.shinR.rotation.x = -0.2 - 0.1 * ease;
    joints.torso.rotation.x = 0.06 * ease;
  } else {
    const subT = (t - 0.35) / 0.65;
    const ease = easeOutQuad2(subT);
    const armRetract = 1 - ease;
    joints.upperArmL.rotation.x = -1.4 * armRetract;
    joints.upperArmR.rotation.x = -1.4 * armRetract;
    joints.lowerArmL.rotation.x = -0.1 * armRetract;
    joints.lowerArmR.rotation.x = -0.1 * armRetract;
    joints.upperArmL.rotation.z = 0;
    joints.upperArmR.rotation.z = 0;
    joints.rigRoot.rotation.x = 0.22 * armRetract;
    joints.hip.position.y = 0.5 - 0.06 * armRetract;
    joints.thighL.rotation.x = 0.5 * armRetract;
    joints.shinL.rotation.x = -0.4 * armRetract;
    joints.thighR.rotation.x = -0.3 * armRetract;
    joints.shinR.rotation.x = -0.3 * armRetract;
    joints.torso.rotation.x = 0.06 * armRetract;
  }
}
function applyJump(joints, anim) {
  const t = clamp(anim.stateTimer / 0.15, 0, 1);
  const ease = easeOutQuad2(t);
  joints.rigRoot.scale.set(
    1 + (C.airSquashXZ - 1) * ease,
    1 + (C.airSquashY - 1) * ease,
    1 + (C.airSquashXZ - 1) * ease
  );
  joints.thighL.rotation.x = -C.jumpTuckAngle * ease;
  joints.thighR.rotation.x = -C.jumpTuckAngle * ease;
  joints.shinL.rotation.x = C.jumpKneeBend * ease;
  joints.shinR.rotation.x = C.jumpKneeBend * ease;
  joints.upperArmL.rotation.x = C.jumpArmRaise * ease;
  joints.upperArmR.rotation.x = C.jumpArmRaise * ease;
  joints.upperArmL.rotation.z = 0.2 * ease;
  joints.upperArmR.rotation.z = -0.2 * ease;
  joints.lowerArmL.rotation.x = -0.3 * ease;
  joints.lowerArmR.rotation.x = -0.3 * ease;
  joints.rigRoot.rotation.x = -0.08 * ease;
}
function applyFall(joints, anim) {
  const t = clamp(anim.stateTimer / 0.2, 0, 1);
  const ease = easeOutQuad2(t);
  joints.rigRoot.scale.set(1, 1, 1);
  joints.thighL.rotation.x = C.fallSpreadAngle * ease;
  joints.thighR.rotation.x = -C.fallSpreadAngle * 0.5 * ease;
  joints.shinL.rotation.x = -0.3 * ease;
  joints.shinR.rotation.x = -0.4 * ease;
  joints.upperArmL.rotation.x = C.fallArmRaise * ease;
  joints.upperArmR.rotation.x = C.fallArmRaise * ease;
  joints.upperArmL.rotation.z = 0.4 * ease;
  joints.upperArmR.rotation.z = -0.4 * ease;
  joints.lowerArmL.rotation.x = -0.2 * ease;
  joints.lowerArmR.rotation.x = -0.2 * ease;
  joints.rigRoot.rotation.x = 0.1 * ease;
}
function applySlam(joints, anim) {
  const t = clamp(anim.stateTimer / 0.1, 0, 1);
  const ease = easeOutQuad2(t);
  joints.rigRoot.scale.set(
    1 + (C.slamStretchXZ - 1) * ease,
    1 + (C.slamStretchY - 1) * ease,
    1 + (C.slamStretchXZ - 1) * ease
  );
  joints.thighL.rotation.x = -C.slamTuckAngle * ease;
  joints.thighR.rotation.x = -C.slamTuckAngle * ease;
  joints.shinL.rotation.x = C.jumpKneeBend * ease;
  joints.shinR.rotation.x = C.jumpKneeBend * ease;
  joints.upperArmL.rotation.x = -C.slamArmAngle * ease;
  joints.upperArmR.rotation.x = -C.slamArmAngle * ease;
  joints.upperArmL.rotation.z = 0.15 * ease;
  joints.upperArmR.rotation.z = -0.15 * ease;
  joints.lowerArmL.rotation.x = -0.5 * ease;
  joints.lowerArmR.rotation.x = -0.5 * ease;
  joints.rigRoot.rotation.x = 0.2 * ease;
}

// src/engine/aerialVerbs.ts
var launched = [];
function registerLaunch(enemy) {
  if (launched.some((e) => e.enemy === enemy)) return;
  launched.push({
    enemy,
    launchTime: performance.now(),
    claimedBy: null,
    gravityMult: 1
  });
}
function claimLaunched(enemy, verbName) {
  const entry = launched.find((e) => e.enemy === enemy);
  if (!entry || entry.claimedBy !== null) return false;
  entry.claimedBy = verbName;
  return true;
}
function releaseLaunched(enemy) {
  const idx = launched.findIndex((e) => e.enemy === enemy);
  if (idx !== -1) launched.splice(idx, 1);
}
function getLaunchedEntry(enemy) {
  return launched.find((e) => e.enemy === enemy);
}
function setGravityOverride(enemy, mult) {
  const entry = launched.find((e) => e.enemy === enemy);
  if (entry) entry.gravityMult = mult;
}
function clearLaunched() {
  launched.length = 0;
}
var verbs = /* @__PURE__ */ new Map();
var activeVerb = null;
var activeEnemy = null;
function registerVerb(verb) {
  verbs.set(verb.name, verb);
}
function getActiveEnemy() {
  return activeEnemy;
}
function activateVerb(verbName, enemy) {
  const verb = verbs.get(verbName);
  if (!verb) return;
  const entry = launched.find((e) => e.enemy === enemy);
  if (!entry) return;
  activeVerb = verb;
  activeEnemy = enemy;
  addPlayerTag(TAG.AERIAL);
  if (verb.tag) addPlayerTag(verb.tag);
  addTag(enemy, TAG.STUNNED);
  verb.onClaim(entry);
}
function transferClaim(enemy, toVerbName) {
  const verb = verbs.get(toVerbName);
  if (!verb) return;
  const entry = launched.find((e) => e.enemy === enemy);
  if (!entry) return;
  if (activeVerb && activeVerb.tag) {
    removePlayerTagsMatching(activeVerb.tag);
  }
  entry.claimedBy = toVerbName;
  activeVerb = verb;
  activeEnemy = enemy;
  if (verb.tag) addPlayerTag(verb.tag);
  verb.onClaim(entry);
}
function cleanupVerbTags(enemy) {
  removePlayerTagsMatching(TAG.AERIAL);
  if (enemy) removeTag(enemy, TAG.STUNNED);
}
function updateAerialVerbs(dt, playerPos2, inputState2) {
  if (!activeVerb || !activeEnemy) return;
  const entry = launched.find((e) => e.enemy === activeEnemy);
  if (!entry || activeEnemy.health <= 0 || activeEnemy.fellInPit) {
    const enemyRef = activeEnemy;
    activeVerb.onCancel(entry ?? { enemy: activeEnemy, launchTime: 0, claimedBy: null, gravityMult: 1 });
    if (entry) releaseLaunched(activeEnemy);
    activeVerb = null;
    activeEnemy = null;
    cleanupVerbTags(enemyRef);
    return;
  }
  const verbBeforeUpdate = activeVerb;
  const result = verbBeforeUpdate.update(dt, entry, playerPos2, inputState2);
  const transferred = activeVerb !== verbBeforeUpdate;
  if (result === "complete") {
    if (transferred) {
      verbBeforeUpdate.onComplete(entry);
    } else {
      const enemyRef = activeEnemy;
      activeVerb.onComplete(entry);
      releaseLaunched(activeEnemy);
      activeVerb = null;
      activeEnemy = null;
      cleanupVerbTags(enemyRef);
    }
  } else if (result === "cancel") {
    if (transferred) {
      verbBeforeUpdate.onCancel(entry);
    } else {
      const enemyRef = activeEnemy;
      activeVerb.onCancel(entry);
      releaseLaunched(activeEnemy);
      activeVerb = null;
      activeEnemy = null;
      cleanupVerbTags(enemyRef);
    }
  }
}
function initAerialVerbs(verbsToRegister) {
  if (verbsToRegister) {
    for (const verb of verbsToRegister) {
      registerVerb(verb);
    }
  }
}
function resetAerialVerbs() {
  cancelActiveVerb();
  clearLaunched();
}
function cancelActiveVerb() {
  if (!activeVerb || !activeEnemy) return;
  const enemyRef = activeEnemy;
  const entry = launched.find((e) => e.enemy === activeEnemy);
  activeVerb.onCancel(entry ?? { enemy: activeEnemy, launchTime: 0, claimedBy: null, gravityMult: 1 });
  if (entry) releaseLaunched(activeEnemy);
  activeVerb = null;
  activeEnemy = null;
  cleanupVerbTags(enemyRef);
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
  infinite: 1,
  // 1 = infinite resource (skip drain), 0 = normal drain
  exitRampDuration: 250
  // ms to ramp from BT scale → 1.0 on deactivation
};
var resource = BULLET_TIME.maxResource;
var active = false;
var initialized = false;
var _autoEngaged = false;
var _detectingCount = 0;
var _rampActive = false;
var _rampTimer = 0;
var _rampFromScale = 0.25;
function initBulletTime() {
  if (initialized) return;
  initialized = true;
  on("enemyDied", () => {
    refillBulletTime(BULLET_TIME.killRefill);
  });
  on("detectionStarted", () => {
    _detectingCount++;
    activateBulletTimeAuto();
  });
  on("detectionCleared", () => {
    _detectingCount = Math.max(0, _detectingCount - 1);
    if (_detectingCount === 0) {
      deactivateBulletTimeAuto();
    }
  });
}
function activateBulletTime() {
  if (active) return;
  if (resource >= BULLET_TIME.activationMinimum) {
    active = true;
    _rampActive = false;
    emit({ type: "bulletTimeActivated" });
  }
}
function toggleBulletTime() {
  if (active) {
    startExitRamp();
  } else {
    activateBulletTime();
  }
}
function startExitRamp() {
  _rampFromScale = active ? BULLET_TIME.timeScale : getBulletTimeScale();
  active = false;
  _autoEngaged = false;
  _rampActive = true;
  _rampTimer = 0;
  emit({ type: "bulletTimeDeactivated" });
}
function updateBulletTime(realDt) {
  if (_rampActive) {
    _rampTimer += realDt * 1e3;
    if (_rampTimer >= BULLET_TIME.exitRampDuration) {
      _rampActive = false;
    }
  }
  if (!active) return;
  if (BULLET_TIME.infinite >= 1) return;
  resource -= BULLET_TIME.drainRate * realDt;
  if (resource <= 0) {
    resource = 0;
    startExitRamp();
  }
}
function getBulletTimeScale() {
  if (active) return BULLET_TIME.timeScale;
  if (_rampActive) {
    const t = Math.min(_rampTimer / BULLET_TIME.exitRampDuration, 1);
    const eased = t * t;
    return _rampFromScale + (1 - _rampFromScale) * eased;
  }
  return 1;
}
function refillBulletTime(amount) {
  resource = Math.min(resource + amount, BULLET_TIME.maxResource);
}
function resetBulletTime() {
  resource = BULLET_TIME.maxResource;
  active = false;
  _rampActive = false;
  _autoEngaged = false;
  _detectingCount = 0;
}
function isBulletTimeActive() {
  return active || _rampActive;
}
function getBulletTimeResource() {
  return resource;
}
function getBulletTimeMax() {
  return BULLET_TIME.maxResource;
}
function activateBulletTimeAuto() {
  if (active) return;
  _autoEngaged = true;
  activateBulletTime();
}
function deactivateBulletTimeAuto() {
  if (!_autoEngaged) return;
  startExitRamp();
}

// src/verbs/floatSelector.ts
var phase = "none";
var target = null;
var floatTimer = 0;
var lmbPressed = false;
var lmbHoldTimer = 0;
var resolved = false;
var playerVelYOverride = null;
var prevPlayerX = 0;
var prevPlayerZ = 0;
var landingX = 0;
var landingZ = 0;
var decalGroup = null;
var decalFill = null;
var decalRing = null;
var decalAge = 0;
var DECAL_EXPAND_MS = 250;
var chargeRing = null;
var chargeRingMat = null;
function createDecal(cx, cz) {
  const scene2 = getScene();
  const radius = DUNK.targetRadius;
  decalGroup = new THREE.Group();
  decalGroup.position.set(cx, 0.06, cz);
  const fillGeo2 = new THREE.CircleGeometry(radius, 32);
  const fillMat = new THREE.MeshBasicMaterial({
    color: 16755268,
    transparent: true,
    opacity: 0.05,
    depthWrite: false
  });
  decalFill = new THREE.Mesh(fillGeo2, fillMat);
  decalFill.rotation.x = -Math.PI / 2;
  decalGroup.add(decalFill);
  const ringGeo4 = new THREE.RingGeometry(radius - 0.06, radius, 48);
  const ringMat2 = new THREE.MeshBasicMaterial({
    color: 16755268,
    transparent: true,
    opacity: 0.3,
    depthWrite: false
  });
  decalRing = new THREE.Mesh(ringGeo4, ringMat2);
  decalRing.rotation.x = -Math.PI / 2;
  decalGroup.add(decalRing);
  decalGroup.scale.set(0, 0, 0);
  decalAge = 0;
  scene2.add(decalGroup);
}
function updateDecal(playerX, playerZ, dt) {
  if (!decalGroup) return;
  if (decalAge < DECAL_EXPAND_MS) {
    decalAge += dt * 1e3;
    const t = Math.min(decalAge / DECAL_EXPAND_MS, 1);
    const eased = 1 - (1 - t) * (1 - t);
    decalGroup.scale.set(eased, eased, eased);
  } else if (decalGroup.scale.x < 1) {
    decalGroup.scale.set(1, 1, 1);
  }
  decalGroup.position.set(playerX, 0.06, playerZ);
  if (decalRing) {
    const pulse = 0.2 + 0.1 * Math.sin(Date.now() * 8e-3);
    decalRing.material.opacity = pulse;
  }
}
function removeDecal() {
  if (!decalGroup) return;
  const scene2 = getScene();
  decalGroup.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  });
  scene2.remove(decalGroup);
  decalGroup = null;
  decalFill = null;
  decalRing = null;
}
function createChargeRing(playerPos2) {
  removeChargeRing();
  const scene2 = getScene();
  const geo = new THREE.RingGeometry(0.5, 0.55, 32);
  chargeRingMat = new THREE.MeshBasicMaterial({
    color: 16746496,
    transparent: true,
    opacity: 0.6,
    depthWrite: false
  });
  chargeRing = new THREE.Mesh(geo, chargeRingMat);
  chargeRing.rotation.x = -Math.PI / 2;
  chargeRing.position.set(playerPos2.x, playerPos2.y + 0.1, playerPos2.z);
  scene2.add(chargeRing);
}
function updateChargeRing(playerPos2, fillT) {
  if (!chargeRing || !chargeRingMat) return;
  chargeRing.position.set(playerPos2.x, playerPos2.y + 0.1, playerPos2.z);
  const r = 255;
  const g = Math.round(136 * (1 - fillT));
  const b = 0;
  chargeRingMat.color.setHex(r << 16 | g << 8 | b);
  chargeRingMat.opacity = 0.4 + 0.4 * fillT;
}
function removeChargeRing() {
  if (!chargeRing) return;
  const scene2 = getScene();
  if (chargeRing.geometry) chargeRing.geometry.dispose();
  if (chargeRing.material) chargeRing.material.dispose();
  scene2.remove(chargeRing);
  chargeRing = null;
  chargeRingMat = null;
}
function updateTargeting(playerPos2, inputState2) {
  const aimDx = inputState2.aimWorldPos.x - playerPos2.x;
  const aimDz = inputState2.aimWorldPos.z - playerPos2.z;
  const aimDist = Math.sqrt(aimDx * aimDx + aimDz * aimDz) || 0.01;
  const clampedDist = Math.min(aimDist, DUNK.targetRadius);
  landingX = playerPos2.x + aimDx / aimDist * clampedDist;
  landingZ = playerPos2.z + aimDz / aimDist * clampedDist;
}
var floatSelectorVerb = {
  name: "floatSelector",
  tag: TAG.AERIAL_FLOAT,
  interruptible: true,
  canClaim(_entry, _playerPos, _inputState) {
    return true;
  },
  onClaim(entry) {
    phase = "rising";
    target = entry.enemy;
    floatTimer = 0;
    lmbPressed = false;
    lmbHoldTimer = 0;
    resolved = false;
    playerVelYOverride = null;
    prevPlayerX = NaN;
    if (!decalGroup) {
      createDecal(0, 0);
    }
  },
  update(dt, entry, playerPos2, inputState2) {
    const enemy = entry.enemy;
    if (phase === "rising") {
      return updateRising(dt, enemy, playerPos2, inputState2);
    } else if (phase === "float") {
      return updateFloat(dt, enemy, playerPos2, inputState2);
    }
    return "cancel";
  },
  onCancel(entry) {
    removeDecal();
    removeChargeRing();
    deactivateBulletTimeAuto();
    setGravityOverride(entry.enemy, 1);
    phase = "none";
    target = null;
    playerVelYOverride = null;
    lmbPressed = false;
    lmbHoldTimer = 0;
    resolved = false;
  },
  onComplete(entry) {
    removeDecal();
    removeChargeRing();
    phase = "none";
    target = null;
    playerVelYOverride = null;
    lmbPressed = false;
    lmbHoldTimer = 0;
    resolved = false;
  }
};
function updateRising(dt, enemy, playerPos2, inputState2) {
  const vel = enemy.vel;
  const isRising = vel && vel.y > 0;
  if (isNaN(prevPlayerX)) {
    prevPlayerX = playerPos2.x;
    prevPlayerZ = playerPos2.z;
  } else {
    const deltaX = playerPos2.x - prevPlayerX;
    const deltaZ = playerPos2.z - prevPlayerZ;
    enemy.pos.x += deltaX;
    enemy.pos.z += deltaZ;
    if (enemy.mesh) {
      enemy.mesh.position.x = enemy.pos.x;
      enemy.mesh.position.z = enemy.pos.z;
    }
    prevPlayerX = playerPos2.x;
    prevPlayerZ = playerPos2.z;
  }
  updateTargeting(playerPos2, inputState2);
  updateDecal(playerPos2.x, playerPos2.z, dt);
  if (enemy.health <= 0 || enemy.fellInPit || enemy.pos.y <= 0.3 && !isRising) {
    return "cancel";
  }
  if (vel && vel.y <= 0) {
    const dy = enemy.pos.y - playerPos2.y;
    if (dy >= 0 && dy <= DUNK.floatConvergeDist) {
      phase = "float";
      floatTimer = DUNK.floatDuration;
      playerVelYOverride = 0;
      setGravityOverride(enemy, 0);
      screenShake(DUNK.grabShake * 0.5);
      return "active";
    }
  }
  return "active";
}
function updateFloat(dt, enemy, playerPos2, inputState2) {
  floatTimer -= dt * 1e3;
  const vel = enemy.vel;
  playerVelYOverride = 0;
  if (vel) vel.y = 0;
  const targetEnemyY = playerPos2.y + DUNK.floatEnemyOffsetY;
  enemy.pos.y += (targetEnemyY - enemy.pos.y) * Math.min(1, dt * 10);
  const driftDx = playerPos2.x - enemy.pos.x;
  const driftDz = playerPos2.z - enemy.pos.z;
  const lerpFactor = 1 - Math.exp(-FLOAT_SELECTOR.floatDriftRate * dt);
  enemy.pos.x += driftDx * lerpFactor;
  enemy.pos.z += driftDz * lerpFactor;
  if (enemy.mesh) enemy.mesh.position.copy(enemy.pos);
  updateTargeting(playerPos2, inputState2);
  updateDecal(playerPos2.x, playerPos2.z, dt);
  if (!lmbPressed && (inputState2.attack || inputState2.attackHeld)) {
    lmbPressed = true;
    lmbHoldTimer = 0;
    createChargeRing(playerPos2);
  }
  if (lmbPressed) {
    if (inputState2.attackHeld) {
      lmbHoldTimer += dt * 1e3;
      const fillT = Math.min(lmbHoldTimer / FLOAT_SELECTOR.holdThreshold, 1);
      updateChargeRing(playerPos2, fillT);
      if (lmbHoldTimer >= FLOAT_SELECTOR.holdThreshold) {
        activateBulletTimeAuto();
        transferClaim(enemy, "dunk");
        resolved = true;
        return "complete";
      }
    } else {
      transferClaim(enemy, "spike");
      resolved = true;
      return "complete";
    }
  }
  if (floatTimer <= 0) {
    return "cancel";
  }
  return "active";
}
function getFloatSelectorPlayerVelY() {
  return playerVelYOverride;
}
function handoffDecal() {
  if (!decalGroup) return null;
  const result = { group: decalGroup, fill: decalFill, ring: decalRing };
  decalGroup = null;
  decalFill = null;
  decalRing = null;
  return result;
}
function resetFloatSelector() {
  phase = "none";
  target = null;
  floatTimer = 0;
  lmbPressed = false;
  lmbHoldTimer = 0;
  resolved = false;
  playerVelYOverride = null;
  landingX = 0;
  landingZ = 0;
  removeDecal();
  removeChargeRing();
}

// src/verbs/dunk.ts
var phase2 = "none";
var target2 = null;
var floatTimer2 = 0;
var landingX2 = 0;
var landingZ2 = 0;
var originX = 0;
var originZ = 0;
var slamStartY = 0;
var slamStartX = 0;
var slamStartZ = 0;
var playerVelYOverride2 = null;
var landingLagMs = 0;
var _gameState = null;
var decalGroup2 = null;
var decalFill2 = null;
var decalRing2 = null;
var decalAge2 = 0;
var DECAL_EXPAND_MS2 = 250;
var _handedDecal = null;
var TRAIL_MAX = 20;
var trailLine = null;
var trailPoints = [];
var trailLife = 0;
function createDecal2(cx, cz) {
  const scene2 = getScene();
  const radius = DUNK.targetRadius;
  decalGroup2 = new THREE.Group();
  decalGroup2.position.set(cx, 0.06, cz);
  const fillGeo2 = new THREE.CircleGeometry(radius, 32);
  const fillMat = new THREE.MeshBasicMaterial({
    color: 16729343,
    transparent: true,
    opacity: 0.08,
    depthWrite: false
  });
  decalFill2 = new THREE.Mesh(fillGeo2, fillMat);
  decalFill2.rotation.x = -Math.PI / 2;
  decalGroup2.add(decalFill2);
  const ringGeo4 = new THREE.RingGeometry(radius - 0.06, radius, 48);
  const ringMat2 = new THREE.MeshBasicMaterial({
    color: 16738047,
    transparent: true,
    opacity: 0.4,
    depthWrite: false
  });
  decalRing2 = new THREE.Mesh(ringGeo4, ringMat2);
  decalRing2.rotation.x = -Math.PI / 2;
  decalGroup2.add(decalRing2);
  const dotGeo = new THREE.CircleGeometry(DUNK.aoeRadius, 24);
  const dotMat = new THREE.MeshBasicMaterial({
    color: 16746751,
    transparent: true,
    opacity: 0.15,
    depthWrite: false
  });
  const dot = new THREE.Mesh(dotGeo, dotMat);
  dot.rotation.x = -Math.PI / 2;
  dot.name = "dunkCrosshair";
  decalGroup2.add(dot);
  decalGroup2.scale.set(0, 0, 0);
  decalAge2 = 0;
  scene2.add(decalGroup2);
}
function updateDecal2(aimX2, aimZ2, dt) {
  if (!decalGroup2) return;
  if (decalAge2 < DECAL_EXPAND_MS2) {
    decalAge2 += dt * 1e3;
    const t = Math.min(decalAge2 / DECAL_EXPAND_MS2, 1);
    const eased = 1 - (1 - t) * (1 - t);
    decalGroup2.scale.set(eased, eased, eased);
  } else if (decalGroup2.scale.x < 1) {
    decalGroup2.scale.set(1, 1, 1);
  }
  decalGroup2.position.set(originX, 0.06, originZ);
  const dot = decalGroup2.getObjectByName("dunkCrosshair");
  if (dot) {
    const dx = landingX2 - originX;
    const dz = landingZ2 - originZ;
    dot.position.set(dx, 0, dz);
  }
  if (decalRing2) {
    const pulse = 0.3 + 0.15 * Math.sin(Date.now() * 8e-3);
    decalRing2.material.opacity = pulse;
  }
}
function removeDecal2() {
  if (!decalGroup2) return;
  const scene2 = getScene();
  decalGroup2.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  });
  scene2.remove(decalGroup2);
  decalGroup2 = null;
  decalFill2 = null;
  decalRing2 = null;
}
function createTrail() {
  removeTrail();
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(TRAIL_MAX * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setDrawRange(0, 0);
  const mat = new THREE.LineBasicMaterial({
    color: 16738047,
    transparent: true,
    opacity: 0.7,
    linewidth: 1
  });
  trailLine = new THREE.Line(geo, mat);
  trailLine.frustumCulled = false;
  getScene().add(trailLine);
  trailLife = 0;
}
function updateTrailGeometry() {
  if (!trailLine) return;
  const posAttr = trailLine.geometry.getAttribute("position");
  const arr = posAttr.array;
  for (let i = 0; i < trailPoints.length; i++) {
    const p = trailPoints[i];
    arr[i * 3] = p.x;
    arr[i * 3 + 1] = p.y;
    arr[i * 3 + 2] = p.z;
  }
  posAttr.needsUpdate = true;
  trailLine.geometry.setDrawRange(0, trailPoints.length);
}
function startTrailFade() {
  trailLife = 300;
}
function removeTrail() {
  if (!trailLine) return;
  const scene2 = getScene();
  scene2.remove(trailLine);
  if (trailLine.geometry) trailLine.geometry.dispose();
  if (trailLine.material) trailLine.material.dispose();
  trailLine = null;
  trailPoints = [];
  trailLife = 0;
}
function updateTargeting2(playerPos2, inputState2) {
  originX = playerPos2.x;
  originZ = playerPos2.z;
  const aimDx = inputState2.aimWorldPos.x - originX;
  const aimDz = inputState2.aimWorldPos.z - originZ;
  const aimDist = Math.sqrt(aimDx * aimDx + aimDz * aimDz) || 0.01;
  const clampedDist = Math.min(aimDist, DUNK.targetRadius);
  landingX2 = originX + aimDx / aimDist * clampedDist;
  landingZ2 = originZ + aimDz / aimDist * clampedDist;
}
var dunkVerb = {
  name: "dunk",
  tag: TAG.AERIAL_DUNK,
  interruptible: false,
  canClaim(entry, playerPos2, _inputState) {
    return true;
  },
  onClaim(entry) {
    phase2 = "grab";
    target2 = entry.enemy;
    floatTimer2 = 0;
    playerVelYOverride2 = null;
    landingLagMs = 0;
    _handedDecal = handoffDecal();
  },
  update(dt, entry, playerPos2, inputState2) {
    const enemy = entry.enemy;
    _gameState = inputState2._gameState;
    if (phase2 === "grab") {
      originX = playerPos2.x;
      originZ = playerPos2.z;
      const aimDx = inputState2.aimWorldPos.x - originX;
      const aimDz = inputState2.aimWorldPos.z - originZ;
      const aimDist = Math.sqrt(aimDx * aimDx + aimDz * aimDz) || 0.01;
      const clampedDist = Math.min(aimDist, DUNK.targetRadius);
      landingX2 = originX + aimDx / aimDist * clampedDist;
      landingZ2 = originZ + aimDz / aimDist * clampedDist;
      transitionToGrab(enemy, playerPos2);
      return "active";
    }
    if (phase2 === "wind") {
      return updateWind(dt, enemy, playerPos2, inputState2);
    }
    if (phase2 === "slam") {
      return updateSlam(dt, enemy, playerPos2, inputState2);
    }
    return "cancel";
  },
  onCancel(entry) {
    removeDecal2();
    removeTrail();
    deactivateBulletTimeAuto();
    setGravityOverride(entry.enemy, 1);
    phase2 = "none";
    target2 = null;
    playerVelYOverride2 = null;
    landingLagMs = 0;
  },
  onComplete(entry) {
    const enemy = entry.enemy;
    const groundHeight = getGroundHeight(enemy.pos.x, enemy.pos.z);
    enemy.health -= DUNK.damage;
    enemy.flashTimer = 150;
    enemy.pos.y = groundHeight;
    const tVel = enemy.vel;
    if (tVel) {
      tVel.x = 0;
      tVel.y = 0;
      tVel.z = 0;
    }
    if (enemy.mesh) enemy.mesh.position.copy(enemy.pos);
    if (_gameState && _gameState.enemies) {
      const enemies = _gameState.enemies;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e === enemy) continue;
        if (e.health <= 0 || e.fellInPit) continue;
        const dx = e.pos.x - enemy.pos.x;
        const dz = e.pos.z - enemy.pos.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < DUNK.aoeRadius * DUNK.aoeRadius) {
          e.health -= DUNK.aoeDamage;
          e.flashTimer = 100;
          const dist = Math.sqrt(distSq) || 0.1;
          const vel = e.vel;
          if (vel) {
            vel.x += dx / dist * DUNK.aoeKnockback;
            vel.z += dz / dist * DUNK.aoeKnockback;
          }
        }
      }
    }
    screenShake(DUNK.landingShake);
    emit({
      type: "dunkImpact",
      enemy,
      damage: DUNK.damage,
      position: { x: enemy.pos.x, z: enemy.pos.z }
    });
    spawnDamageNumber(enemy.pos.x, enemy.pos.z, `DUNK! ${DUNK.damage}`, "#ff2244");
    removeDecal2();
    startTrailFade();
    deactivateBulletTimeAuto();
    landingLagMs = DUNK.landingLag;
    phase2 = "none";
    target2 = null;
    playerVelYOverride2 = null;
  }
};
function transitionToGrab(enemy, playerPos2) {
  phase2 = "wind";
  target2 = enemy;
  const ptVel = enemy.vel;
  enemy.pos.x = playerPos2.x;
  enemy.pos.z = playerPos2.z;
  enemy.pos.y = playerPos2.y + DUNK.carryOffsetY;
  playerVelYOverride2 = DUNK.arcRiseVelocity;
  if (ptVel) ptVel.y = DUNK.arcRiseVelocity;
  if (_handedDecal) {
    decalGroup2 = _handedDecal.group;
    decalFill2 = _handedDecal.fill;
    decalRing2 = _handedDecal.ring;
    _handedDecal = null;
    if (decalFill2) {
      decalFill2.material.color.setHex(16729343);
      decalFill2.material.opacity = 0.08;
    }
    if (decalRing2) decalRing2.material.color.setHex(16738047);
    const dotGeo = new THREE.CircleGeometry(DUNK.aoeRadius, 24);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 16746751,
      transparent: true,
      opacity: 0.15,
      depthWrite: false
    });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.rotation.x = -Math.PI / 2;
    dot.name = "dunkCrosshair";
    decalGroup2.add(dot);
    decalAge2 = DECAL_EXPAND_MS2;
  } else {
    createDecal2(originX, originZ);
  }
  slamStartY = playerPos2.y;
  slamStartX = playerPos2.x;
  slamStartZ = playerPos2.z;
  trailPoints = [{ x: playerPos2.x, y: playerPos2.y, z: playerPos2.z }];
  createTrail();
  screenShake(DUNK.grabShake);
  emit({
    type: "dunkGrab",
    enemy,
    position: { x: playerPos2.x, z: playerPos2.z }
  });
  spawnDamageNumber(playerPos2.x, playerPos2.z, "GRAB!", "#ff44ff");
}
function updateWind(dt, enemy, playerPos2, inputState2) {
  if (!inputState2.attackHeld) deactivateBulletTimeAuto();
  updateTargeting2(playerPos2, inputState2);
  updateDecal2(landingX2, landingZ2, dt);
  playerVelYOverride2 -= JUMP.gravity * dt;
  const ptVel = enemy.vel;
  if (ptVel) ptVel.y = playerVelYOverride2;
  const toDx = landingX2 - playerPos2.x;
  const toDz = landingZ2 - playerPos2.z;
  const toDist = Math.sqrt(toDx * toDx + toDz * toDz);
  if (toDist > 0.05) {
    const riseTime = DUNK.arcRiseVelocity / JUMP.gravity;
    const windSpeed = toDist * DUNK.arcXzFraction / riseTime;
    const moveStep = Math.min(windSpeed * dt, toDist);
    playerPos2.x += toDx / toDist * moveStep;
    playerPos2.z += toDz / toDist * moveStep;
  }
  enemy.pos.x = playerPos2.x;
  enemy.pos.z = playerPos2.z;
  enemy.pos.y = playerPos2.y + DUNK.carryOffsetY;
  if (enemy.mesh) {
    const faceDx = landingX2 - playerPos2.x;
    const faceDz = landingZ2 - playerPos2.z;
    const faceDist = Math.sqrt(faceDx * faceDx + faceDz * faceDz) || 0.01;
    const fwdX = faceDx / faceDist * DUNK.carryOffsetZ;
    const fwdZ = faceDz / faceDist * DUNK.carryOffsetZ;
    enemy.mesh.position.set(enemy.pos.x + fwdX, enemy.pos.y, enemy.pos.z + fwdZ);
  }
  trailPoints.push({ x: playerPos2.x, y: playerPos2.y, z: playerPos2.z });
  if (trailPoints.length > TRAIL_MAX) trailPoints.shift();
  updateTrailGeometry();
  if (playerVelYOverride2 <= 0) {
    playerVelYOverride2 = DUNK.slamVelocity;
    if (ptVel) ptVel.y = DUNK.slamVelocity;
    slamStartY = playerPos2.y;
    slamStartX = playerPos2.x;
    slamStartZ = playerPos2.z;
    phase2 = "slam";
  }
  return "active";
}
function updateSlam(dt, enemy, playerPos2, inputState2) {
  originX = playerPos2.x;
  originZ = playerPos2.z;
  updateDecal2(landingX2, landingZ2, dt);
  const groundY = getGroundHeight(playerPos2.x, playerPos2.z);
  const totalDrop = Math.max(slamStartY - groundY, 0.1);
  const dropped = Math.max(slamStartY - playerPos2.y, 0);
  const progress = Math.min(dropped / totalDrop, 1);
  const arcMult = 0.3 + 0.7 * progress;
  const toDx = landingX2 - playerPos2.x;
  const toDz = landingZ2 - playerPos2.z;
  const toDist = Math.sqrt(toDx * toDx + toDz * toDz);
  if (toDist > 0.05) {
    const moveStep = Math.min(DUNK.homing * arcMult * dt, toDist);
    playerPos2.x += toDx / toDist * moveStep;
    playerPos2.z += toDz / toDist * moveStep;
  }
  trailPoints.push({ x: playerPos2.x, y: playerPos2.y, z: playerPos2.z });
  if (trailPoints.length > TRAIL_MAX) trailPoints.shift();
  updateTrailGeometry();
  enemy.pos.x = playerPos2.x;
  enemy.pos.z = playerPos2.z;
  enemy.pos.y = playerPos2.y + DUNK.carryOffsetY;
  if (enemy.mesh) {
    const faceDx = landingX2 - playerPos2.x;
    const faceDz = landingZ2 - playerPos2.z;
    const faceDist = Math.sqrt(faceDx * faceDx + faceDz * faceDz) || 0.01;
    const fwdX = faceDx / faceDist * DUNK.carryOffsetZ;
    const fwdZ = faceDz / faceDist * DUNK.carryOffsetZ;
    enemy.mesh.position.set(
      enemy.pos.x + fwdX,
      enemy.pos.y,
      enemy.pos.z + fwdZ
    );
  }
  const groundHeight = getGroundHeight(playerPos2.x, playerPos2.z);
  if (playerPos2.y <= groundHeight) {
    playerPos2.y = groundHeight;
    return "complete";
  }
  return "active";
}
function getDunkPhase() {
  return phase2;
}
function getDunkPlayerVelY() {
  return playerVelYOverride2;
}
function getDunkLandingLag() {
  const lag = landingLagMs;
  landingLagMs = 0;
  return lag;
}
function updateDunkVisuals(dt) {
  if (trailLine && trailLife > 0) {
    trailLife -= dt * 1e3;
    const opacity = Math.max(0, trailLife / 300) * 0.7;
    trailLine.material.opacity = opacity;
    if (trailLife <= 0) {
      removeTrail();
    }
  }
}
function resetDunk() {
  phase2 = "none";
  target2 = null;
  floatTimer2 = 0;
  playerVelYOverride2 = null;
  landingLagMs = 0;
  landingX2 = 0;
  landingZ2 = 0;
  originX = 0;
  originZ = 0;
  slamStartY = 0;
  slamStartX = 0;
  slamStartZ = 0;
  _gameState = null;
  removeDecal2();
  removeTrail();
}

// src/engine/entityCarrier.ts
var GRAVITY = 25;
var THROUGH_HIT_RADIUS = 1.5;
var carriers = [];
function createCarrier(payload, direction, config) {
  const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z) || 1;
  const nx = direction.x / len;
  const ny = direction.y / len;
  const nz = direction.z / len;
  const hitSet = /* @__PURE__ */ new Set();
  hitSet.add(payload);
  payload.isCarrierPayload = true;
  carriers.push({
    payload,
    vel: {
      x: nx * config.speed,
      y: ny * config.speed,
      z: nz * config.speed
    },
    config,
    hitSet
  });
}
function updateCarriers(dt, gameState2) {
  for (let i = carriers.length - 1; i >= 0; i--) {
    const carrier = carriers[i];
    const { payload, vel, config, hitSet } = carrier;
    vel.y -= GRAVITY * config.gravityMult * dt;
    payload.pos.x += vel.x * dt;
    payload.pos.y += vel.y * dt;
    payload.pos.z += vel.z * dt;
    if (payload.mesh && payload.mesh.position) {
      payload.mesh.position.set(payload.pos.x, payload.pos.y, payload.pos.z);
    }
    if (gameState2.enemies) {
      for (let j = 0; j < gameState2.enemies.length; j++) {
        const enemy = gameState2.enemies[j];
        if (hitSet.has(enemy)) continue;
        if (enemy.health <= 0) continue;
        if (enemy.fellInPit) continue;
        const dx = enemy.pos.x - payload.pos.x;
        const dy = enemy.pos.y - payload.pos.y;
        const dz = enemy.pos.z - payload.pos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < THROUGH_HIT_RADIUS) {
          enemy.health -= config.throughDamage;
          enemy.flashTimer = 100;
          const xzDist = Math.sqrt(dx * dx + dz * dz) || 0.1;
          enemy.vel.x += dx / xzDist * config.throughKnockback;
          enemy.vel.z += dz / xzDist * config.throughKnockback;
          hitSet.add(enemy);
          emit({
            type: "spikeThrough",
            enemy,
            damage: config.throughDamage,
            position: { x: enemy.pos.x, z: enemy.pos.z }
          });
          spawnDamageNumber(enemy.pos.x, enemy.pos.z, config.throughDamage, "#ff8844");
        }
      }
    }
    const groundY = getGroundHeight(payload.pos.x, payload.pos.z);
    if (payload.pos.y <= groundY) {
      payload.pos.y = groundY;
      if (gameState2.enemies) {
        for (let j = 0; j < gameState2.enemies.length; j++) {
          const enemy = gameState2.enemies[j];
          if (enemy === payload) continue;
          if (enemy.health <= 0) continue;
          if (enemy.fellInPit) continue;
          const dx = enemy.pos.x - payload.pos.x;
          const dz = enemy.pos.z - payload.pos.z;
          const distSq = dx * dx + dz * dz;
          if (distSq < config.impactRadius * config.impactRadius) {
            enemy.health -= config.impactDamage;
            enemy.flashTimer = 100;
            const dist = Math.sqrt(distSq) || 0.1;
            enemy.vel.x += dx / dist * config.impactKnockback;
            enemy.vel.z += dz / dist * config.impactKnockback;
          }
        }
      }
      payload.vel.x = 0;
      payload.vel.y = 0;
      payload.vel.z = 0;
      payload.isCarrierPayload = false;
      if (payload.mesh && payload.mesh.position) {
        payload.mesh.position.set(payload.pos.x, payload.pos.y, payload.pos.z);
      }
      screenShake(config.impactShake);
      emit({
        type: "spikeImpact",
        position: { x: payload.pos.x, z: payload.pos.z },
        damage: config.impactDamage,
        radius: config.impactRadius
      });
      spawnDamageNumber(payload.pos.x, payload.pos.z, "IMPACT!", "#ff4444");
      carriers.splice(i, 1);
    }
  }
}
function clearCarriers() {
  for (const c of carriers) {
    c.payload.isCarrierPayload = false;
  }
  carriers.length = 0;
}

// src/verbs/spike.ts
var phase3 = "none";
var target3 = null;
var phaseTimer = 0;
var aimX = 0;
var aimZ = 0;
var playerVelYOverride3 = null;
var fastFallActive = false;
var spikeVerb = {
  name: "spike",
  tag: TAG.AERIAL_SPIKE,
  interruptible: false,
  canClaim(_entry, _playerPos, _inputState) {
    return true;
  },
  onClaim(entry) {
    phase3 = "windup";
    target3 = entry.enemy;
    phaseTimer = 0;
    playerVelYOverride3 = 0;
    fastFallActive = false;
    setGravityOverride(entry.enemy, 0);
    screenShake(0.5);
  },
  update(dt, entry, playerPos2, inputState2) {
    const enemy = entry.enemy;
    if (phase3 === "windup") {
      return updateWindup(dt, enemy, playerPos2, inputState2);
    } else if (phase3 === "recovery") {
      return updateRecovery(dt);
    }
    return "cancel";
  },
  onCancel(entry) {
    setGravityOverride(entry.enemy, 1);
    resetState();
  },
  onComplete(entry) {
    resetState();
  }
};
function updateWindup(dt, enemy, playerPos2, inputState2) {
  phaseTimer += dt * 1e3;
  enemy.vel.y = 0;
  if (phaseTimer <= dt * 1e3 + 0.1) {
    aimX = inputState2.aimWorldPos.x;
    aimZ = inputState2.aimWorldPos.z;
  }
  playerVelYOverride3 = 0;
  if (phaseTimer >= SPIKE.windupDuration) {
    executeStrike(enemy, playerPos2);
    return "active";
  }
  return "active";
}
function executeStrike(enemy, playerPos2) {
  enemy.health -= SPIKE.damage;
  enemy.flashTimer = 150;
  const dx = aimX - playerPos2.x;
  const dz = aimZ - playerPos2.z;
  const horizontalDist = Math.sqrt(dx * dx + dz * dz) || 0.01;
  const nx = dx / horizontalDist;
  const nz = dz / horizontalDist;
  const angleRad = SPIKE.projectileAngle * Math.PI / 180;
  const dirY = -Math.tan(angleRad);
  const dirX = nx;
  const dirZ = nz;
  createCarrier(enemy, { x: dirX, y: dirY, z: dirZ }, {
    speed: SPIKE.projectileSpeed,
    gravityMult: 0.5,
    // some gravity for arc feel
    throughDamage: SPIKE.throughDamage,
    throughKnockback: SPIKE.throughKnockback,
    impactDamage: SPIKE.impactDamage,
    impactRadius: SPIKE.impactRadius,
    impactKnockback: SPIKE.impactKnockback,
    impactShake: SPIKE.impactShake
  });
  screenShake(SPIKE.screenShake);
  emit({
    type: "spikeStrike",
    enemy,
    damage: SPIKE.damage,
    position: { x: enemy.pos.x, z: enemy.pos.z }
  });
  spawnDamageNumber(enemy.pos.x, enemy.pos.z, `SPIKE! ${SPIKE.damage}`, "#ff4488");
  phase3 = "recovery";
  phaseTimer = 0;
  playerVelYOverride3 = 0;
  fastFallActive = true;
}
function updateRecovery(dt) {
  phaseTimer += dt * 1e3;
  playerVelYOverride3 = 0;
  if (phaseTimer >= SPIKE.hangDuration) {
    playerVelYOverride3 = null;
    return "complete";
  }
  return "active";
}
function getSpikePlayerVelYOverride() {
  return playerVelYOverride3;
}
function getSpikeFastFallActive() {
  return fastFallActive;
}
function resetState() {
  phase3 = "none";
  target3 = null;
  phaseTimer = 0;
  aimX = 0;
  aimZ = 0;
  playerVelYOverride3 = null;
  fastFallActive = false;
}
function resetSpike() {
  resetState();
}

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
  // Y-axis / vertical physics
  gravity: 25,
  // units/s² downward acceleration
  terminalVelocity: 20,
  // max downward Y velocity
  airControlMult: 1,
  // XZ movement multiplier while airborne (1.0 = full control)
  landingLagBase: 50,
  // ms of landing lag (minimum)
  landingLagPerSpeed: 10,
  // ms of landing lag per unit of fall speed
  groundEpsilon: 0.05,
  // height threshold for "grounded" detection
  // Physics objects
  objectFriction: 25,
  objectWallSlamMinSpeed: 3,
  objectWallSlamDamage: 8,
  objectWallSlamBounce: 0.4,
  objectWallSlamShake: 2,
  objectImpactMinSpeed: 2,
  objectImpactDamage: 5
};

// src/effects/launchPillar.ts
var sceneRef6;
var activePillars = [];
var pillarGeo;
function initLaunchPillars(scene2) {
  sceneRef6 = scene2;
}
function spawnLaunchPillar(x, z) {
  if (!sceneRef6) return;
  if (!pillarGeo) {
    pillarGeo = new THREE.CylinderGeometry(
      LAUNCH.pillarRadius * 0.7,
      // top radius (tapered)
      LAUNCH.pillarRadius,
      // bottom radius
      LAUNCH.pillarHeight,
      6
      // 6 sides — hexagonal for rocky look
    );
  }
  const mat = new THREE.MeshStandardMaterial({
    color: LAUNCH.pillarColor,
    flatShading: true,
    transparent: true,
    opacity: 1
  });
  const mesh = new THREE.Mesh(pillarGeo, mat);
  mesh.position.set(x, -LAUNCH.pillarHeight, z);
  mesh.rotation.y = Math.random() * Math.PI * 2;
  sceneRef6.add(mesh);
  activePillars.push({
    mesh,
    material: mat,
    elapsed: 0
  });
}
function easeOutQuad3(t) {
  return t * (2 - t);
}
function easeInQuad(t) {
  return t * t;
}
function updateLaunchPillars(dt) {
  const dtMs = dt * 1e3;
  for (let i = activePillars.length - 1; i >= 0; i--) {
    const p = activePillars[i];
    p.elapsed += dtMs;
    const { pillarRiseTime, pillarHoldTime, pillarDuration, pillarHeight } = LAUNCH;
    const sinkStart = pillarRiseTime + pillarHoldTime;
    const sinkDuration = pillarDuration - sinkStart;
    if (p.elapsed < pillarRiseTime) {
      const t = easeOutQuad3(p.elapsed / pillarRiseTime);
      p.mesh.position.y = -pillarHeight + t * (pillarHeight * 0.5 + pillarHeight);
    } else if (p.elapsed < sinkStart) {
      p.mesh.position.y = pillarHeight * 0.5;
    } else if (p.elapsed < pillarDuration) {
      const sinkT = easeInQuad((p.elapsed - sinkStart) / sinkDuration);
      p.mesh.position.y = pillarHeight * 0.5 - sinkT * (pillarHeight * 0.5 + pillarHeight);
      p.material.opacity = 1 - sinkT;
    } else {
      p.material.dispose();
      sceneRef6.remove(p.mesh);
      activePillars.splice(i, 1);
    }
  }
}
function clearLaunchPillars() {
  for (const p of activePillars) {
    p.material.dispose();
    sceneRef6.remove(p.mesh);
  }
  activePillars.length = 0;
}

// src/effects/launchIndicator.ts
var sceneRef7;
var ringGeo2;
var ringMat;
var ringMesh;
var previousTarget = null;
function initLaunchIndicator(scene2) {
  sceneRef7 = scene2;
}
function findLaunchTarget(enemies, playerPos2) {
  let closestEnemy = null;
  let closestDistSq = LAUNCH.range * LAUNCH.range;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.health <= 0 || e.fellInPit) continue;
    const dx = e.pos.x - playerPos2.x;
    const dz = e.pos.z - playerPos2.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < closestDistSq) {
      closestDistSq = distSq;
      closestEnemy = e;
    }
  }
  return closestEnemy;
}
function ensureRing() {
  if (ringMesh) return;
  if (!sceneRef7) return;
  const innerRadius = LAUNCH.indicatorRingRadius * 0.65;
  ringGeo2 = new THREE.RingGeometry(innerRadius, LAUNCH.indicatorRingRadius, 24);
  ringGeo2.rotateX(-Math.PI / 2);
  ringMat = new THREE.MeshBasicMaterial({
    color: LAUNCH.indicatorColor,
    transparent: true,
    opacity: LAUNCH.indicatorOpacity,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  ringMesh = new THREE.Mesh(ringGeo2, ringMat);
  ringMesh.renderOrder = -1;
  ringMesh.visible = false;
  sceneRef7.add(ringMesh);
}
function setTargetHighlight(enemy, intensity) {
  if (!enemy || !enemy.bodyMesh) return;
  enemy.bodyMesh.material.emissive.setHex(LAUNCH.indicatorColor);
  enemy.bodyMesh.material.emissiveIntensity = intensity;
  if (enemy.headMesh) {
    enemy.headMesh.material.emissive.setHex(LAUNCH.indicatorColor);
    enemy.headMesh.material.emissiveIntensity = intensity;
  }
}
function restoreTargetEmissive(enemy) {
  if (!enemy || !enemy.bodyMesh || !enemy.config) return;
  enemy.bodyMesh.material.emissive.setHex(enemy.config.emissive);
  enemy.bodyMesh.material.emissiveIntensity = enemy.config.emissiveIntensity || 0.3;
  if (enemy.headMesh) {
    enemy.headMesh.material.emissive.setHex(enemy.config.emissive);
    enemy.headMesh.material.emissiveIntensity = enemy.config.emissiveIntensity || 0.3;
  }
}
function updateLaunchIndicator(target4, windupProgress) {
  ensureRing();
  if (previousTarget && previousTarget !== target4) {
    restoreTargetEmissive(previousTarget);
  }
  previousTarget = target4;
  if (!target4) {
    if (ringMesh) ringMesh.visible = false;
    return;
  }
  if (ringMesh) {
    ringMesh.position.set(target4.pos.x, 0.04, target4.pos.z);
    ringMesh.visible = true;
  }
  if (windupProgress < 0) {
    const pulse = 0.3 + 0.1 * Math.sin(performance.now() * 4e-3);
    if (ringMat) {
      ringMat.opacity = LAUNCH.indicatorOpacity * pulse / 0.3;
    }
    if (ringMesh) {
      ringMesh.scale.setScalar(1);
    }
    setTargetHighlight(target4, 0.5);
  } else {
    const t = Math.min(windupProgress, 1);
    const pulse = 0.8 + 0.2 * Math.sin(performance.now() * 0.015);
    if (ringMat) {
      ringMat.opacity = (LAUNCH.indicatorOpacity + (0.8 - LAUNCH.indicatorOpacity) * t) * pulse;
    }
    if (ringMesh) {
      const scalePulse = 1 + 0.15 * Math.sin(performance.now() * 0.02) * t;
      ringMesh.scale.setScalar(scalePulse);
    }
    setTargetHighlight(target4, 0.5 + 0.5 * t);
  }
}
function clearLaunchIndicator() {
  if (previousTarget) {
    restoreTargetEmissive(previousTarget);
    previousTarget = null;
  }
  if (ringMesh && sceneRef7) {
    sceneRef7.remove(ringMesh);
    ringMesh = null;
  }
  if (ringMat) {
    ringMat.dispose();
    ringMat = null;
  }
  if (ringGeo2) {
    ringGeo2.dispose();
    ringGeo2 = null;
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
var playerVelY = 0;
var isPlayerAirborne = false;
var landingLagTimer = 0;
var actionLockoutTimer = 0;
var ACTION_LOCKOUT_MS = 300;
var launchCooldownTimer = 0;
var launchWindupTimer = 0;
var launchWindupTarget = null;
var isSlamming = false;
var originGroup = null;
var lastFireTime = 0;
var DEFAULT_EMISSIVE = 2271846;
var DEFAULT_EMISSIVE_INTENSITY = 0.4;
function restoreDefaultEmissive() {
  if (!rig) return;
  for (const mat of rig.materials) {
    mat.emissive.setHex(DEFAULT_EMISSIVE);
    mat.emissiveIntensity = DEFAULT_EMISSIVE_INTENSITY;
  }
}
function setPlayerVisual(profile) {
  if (!originGroup || !rig) return;
  const isOrigin = profile === "origin";
  originGroup.visible = isOrigin;
  rig.joints.rigRoot.visible = !isOrigin;
}
function updateOriginBob(dt) {
  if (!originGroup || !originGroup.visible) return;
  const t = performance.now() * 3e-3;
  originGroup.position.y = Math.sin(t) * 0.04;
  originGroup.rotation.y = 0;
}
function createPlayer(scene2) {
  playerGroup = new THREE.Group();
  rig = createPlayerRig(playerGroup);
  animState = createAnimatorState();
  originGroup = new THREE.Group();
  const bodyGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.9, 8);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 4521864, emissive: 2271846, emissiveIntensity: 0.4 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.45;
  originGroup.add(body);
  const headGeo = new THREE.SphereGeometry(0.25, 8, 6);
  const headMat = new THREE.MeshStandardMaterial({ color: 6750122, emissive: 2271846, emissiveIntensity: 0.4 });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.1;
  originGroup.add(head);
  originGroup.visible = false;
  playerGroup.add(originGroup);
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
    if (getActiveProfile() === "origin") {
      updateOriginBob(dt);
    } else {
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
    }
    updateAfterimages(dt);
    return;
  }
  if (isDashing) {
    updateDash(dt, gameState2);
    playerGroup.position.copy(playerPos);
    aimAtCursor(inputState2);
    if (getActiveProfile() === "origin") {
      updateOriginBob(dt);
    } else {
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
    }
    updateAfterimages(dt);
    return;
  }
  if (inputState2.dash && gameState2.abilities.dash.cooldownRemaining <= 0) {
    startDash(inputState2, gameState2);
  }
  if (getActiveProfile() !== "origin" && (inputState2.chargeStarted || inputState2.ultimate && getActiveProfile() !== "vertical") && gameState2.abilities.ultimate.cooldownRemaining <= 0 && !isCharging && !isPlayerAirborne && !playerHasTag(TAG.AERIAL) && actionLockoutTimer <= 0) {
    startCharge(inputState2, gameState2);
  }
  if (getActiveProfile() === "vertical") {
    if (inputState2.jump && !isPlayerAirborne && !isDashing && landingLagTimer <= 0) {
      playerVelY = JUMP.initialVelocity;
      isPlayerAirborne = true;
      emit({ type: "playerJump", position: { x: playerPos.x, z: playerPos.z } });
    }
    if (launchCooldownTimer > 0) {
      launchCooldownTimer -= dt * 1e3;
    }
    if (launchWindupTimer > 0) {
      if (isDashing || !launchWindupTarget || launchWindupTarget.health <= 0 || launchWindupTarget.fellInPit) {
        updateLaunchIndicator(null, -1);
        launchWindupTimer = 0;
        launchWindupTarget = null;
      }
    }
    if (launchWindupTimer > 0) {
      launchWindupTimer -= dt * 1e3;
      const progress = 1 - Math.max(0, launchWindupTimer) / LAUNCH.windupDuration;
      updateLaunchIndicator(launchWindupTarget, progress);
      if (launchWindupTimer <= 0) {
        const closestEnemy = launchWindupTarget;
        launchWindupTarget = null;
        updateLaunchIndicator(null, -1);
        const vel = closestEnemy.vel;
        const launchVelY = JUMP.initialVelocity * LAUNCH.enemyVelMult;
        if (vel) {
          vel.y = launchVelY;
          const arcDx = playerPos.x - closestEnemy.pos.x;
          const arcDz = playerPos.z - closestEnemy.pos.z;
          const arcDist = Math.sqrt(arcDx * arcDx + arcDz * arcDz);
          if (arcDist > 0.1) {
            const convergenceTime = launchVelY / PHYSICS.gravity;
            const arcSpeed = arcDist * LAUNCH.arcFraction / convergenceTime;
            vel.x = arcDx / arcDist * arcSpeed;
            vel.z = arcDz / arcDist * arcSpeed;
          }
        }
        spawnLaunchPillar(closestEnemy.pos.x, closestEnemy.pos.z);
        closestEnemy.health -= LAUNCH.damage;
        playerVelY = JUMP.initialVelocity * LAUNCH.playerVelMult;
        isPlayerAirborne = true;
        launchCooldownTimer = LAUNCH.cooldown;
        registerLaunch(closestEnemy);
        claimLaunched(closestEnemy, "floatSelector");
        activateVerb("floatSelector", closestEnemy);
        emit({
          type: "enemyLaunched",
          enemy: closestEnemy,
          position: { x: closestEnemy.pos.x, z: closestEnemy.pos.z },
          velocity: JUMP.initialVelocity * LAUNCH.enemyVelMult
        });
        spawnDamageNumber(closestEnemy.pos.x, closestEnemy.pos.z, `LAUNCH! ${LAUNCH.damage}`, "#ffaa00");
        inputState2.launch = false;
      }
    } else if (inputState2.launch && !isPlayerAirborne && !isDashing && launchCooldownTimer <= 0) {
      const closestEnemy = findLaunchTarget(gameState2.enemies || [], playerPos);
      if (closestEnemy) {
        launchWindupTarget = closestEnemy;
        launchWindupTimer = LAUNCH.windupDuration;
        const dx = closestEnemy.pos.x - playerPos.x;
        const dz = closestEnemy.pos.z - playerPos.z;
        playerGroup.rotation.y = Math.atan2(-dx, -dz);
        inputState2.launch = false;
      }
    } else if (!isPlayerAirborne && !isDashing && launchCooldownTimer <= 0 && launchWindupTimer <= 0) {
      const candidate = findLaunchTarget(gameState2.enemies || [], playerPos);
      updateLaunchIndicator(candidate, -1);
    } else if (launchWindupTimer <= 0) {
      updateLaunchIndicator(null, -1);
    }
    if (inputState2.launch && isPlayerAirborne && !isSlamming && !playerHasTag(TAG.AERIAL)) {
      isSlamming = true;
      playerVelY = SELF_SLAM.slamVelocity;
    }
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
  if (getActiveProfile() === "vertical") {
    if (!isPlayerAirborne) {
      const groundBelow = getGroundHeight(playerPos.x, playerPos.z);
      if (playerPos.y > groundBelow + PHYSICS.groundEpsilon) {
        isPlayerAirborne = true;
        playerVelY = 0;
      }
    }
    if (isPlayerAirborne) {
      const dunkVelY = getDunkPlayerVelY();
      const selectorVelY = getFloatSelectorPlayerVelY();
      const spikeVelY = getSpikePlayerVelYOverride();
      const hasVerbOverride = dunkVelY !== null || selectorVelY !== null || spikeVelY !== null;
      if (hasVerbOverride) {
        if (dunkVelY !== null) playerVelY = dunkVelY;
        else if (selectorVelY !== null) playerVelY = selectorVelY;
        else if (spikeVelY !== null) playerVelY = spikeVelY;
      } else {
        playerVelY -= JUMP.gravity * dt;
        if (getSpikeFastFallActive()) {
          playerVelY -= JUMP.gravity * (SPIKE.fastFallGravityMult - 1) * dt;
        }
      }
      playerPos.y += playerVelY * dt;
      const groundHeight = getGroundHeight(playerPos.x, playerPos.z);
      if (playerPos.y <= groundHeight) {
        const fallSpeed = Math.abs(playerVelY);
        playerPos.y = groundHeight;
        playerVelY = 0;
        isPlayerAirborne = false;
        if (isSlamming) {
          isSlamming = false;
          landingLagTimer = SELF_SLAM.landingLag;
          screenShake(SELF_SLAM.landingShake);
          const enemies = gameState2.enemies;
          if (enemies) {
            for (let i = 0; i < enemies.length; i++) {
              const e = enemies[i];
              if (e.health <= 0 || e.fellInPit) continue;
              const dx = e.pos.x - playerPos.x;
              const dz = e.pos.z - playerPos.z;
              const distSq = dx * dx + dz * dz;
              if (distSq < SELF_SLAM.damageRadius * SELF_SLAM.damageRadius) {
                e.health -= SELF_SLAM.damage;
                e.flashTimer = 100;
                const dist = Math.sqrt(distSq) || 0.1;
                const vel = e.vel;
                if (vel) {
                  vel.x += dx / dist * SELF_SLAM.knockback;
                  vel.z += dz / dist * SELF_SLAM.knockback;
                }
              }
            }
          }
          emit({ type: "playerSlam", position: { x: playerPos.x, z: playerPos.z }, fallSpeed });
          spawnDamageNumber(playerPos.x, playerPos.z, "SLAM!", "#ff8800");
        } else if (getDunkPhase() === "slam") {
          const lag = getDunkLandingLag();
          if (lag > 0) landingLagTimer = lag;
          actionLockoutTimer = ACTION_LOCKOUT_MS;
        } else {
          landingLagTimer = JUMP.landingLag;
          emit({ type: "playerLand", position: { x: playerPos.x, z: playerPos.z }, fallSpeed });
        }
      }
    }
    if (landingLagTimer > 0) landingLagTimer -= dt * 1e3;
    if (actionLockoutTimer > 0) actionLockoutTimer -= dt * 1e3;
    updateDunkVisuals(dt);
  }
  playerGroup.position.copy(playerPos);
  aimAtCursor(inputState2);
  if (getActiveProfile() === "origin") {
    updateOriginBob(dt);
  } else {
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
      meleeSwinging ? meleeSwingTimer / MELEE_SWING_DURATION : 0,
      getActiveProfile() === "vertical" ? isPlayerAirborne : false,
      getActiveProfile() === "vertical" ? playerVelY : 0,
      getActiveProfile() === "vertical" ? isSlamming || getDunkPhase() === "slam" : false,
      isCharging,
      isCharging ? Math.min(chargeTimer / ABILITIES.ultimate.chargeTimeMs, 1) : 0
    );
  }
  if (getActiveProfile() === "origin" && !isDashing) {
    if (now - lastFireTime >= PLAYER.fireRate) {
      lastFireTime = now;
      const aimDx = inputState2.aimWorldPos.x - playerPos.x;
      const aimDz = inputState2.aimWorldPos.z - playerPos.z;
      const aimDir = new THREE.Vector3(aimDx, 0, aimDz).normalize();
      fireProjectile(playerPos, aimDir, PLAYER.projectile);
    }
  }
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
  if (getActiveProfile() !== "origin" && inputState2.attack && meleeCooldownTimer <= 0 && !isDashing && !isCharging && !playerHasTag(TAG.AERIAL) && actionLockoutTimer <= 0) {
    if (getActiveProfile() === "vertical" && isPlayerAirborne) {
      const enemies = gameState2.enemies;
      let closestEnemy = null;
      let closestDistSq = AERIAL_STRIKE.range * AERIAL_STRIKE.range;
      if (enemies) {
        for (let i = 0; i < enemies.length; i++) {
          const e = enemies[i];
          if (e.health <= 0 || e.fellInPit) continue;
          const dx = e.pos.x - playerPos.x;
          const dz = e.pos.z - playerPos.z;
          const distSq = dx * dx + dz * dz;
          if (distSq < closestDistSq) {
            closestDistSq = distSq;
            closestEnemy = e;
          }
        }
      }
      if (closestEnemy) {
        closestEnemy.health -= AERIAL_STRIKE.damage;
        closestEnemy.flashTimer = 120;
        const vel = closestEnemy.vel;
        if (vel) vel.y = AERIAL_STRIKE.slamVelocity;
        const dx = closestEnemy.pos.x - playerPos.x;
        const dz = closestEnemy.pos.z - playerPos.z;
        playerGroup.rotation.y = Math.atan2(-dx, -dz);
        screenShake(AERIAL_STRIKE.screenShake);
        meleeCooldownTimer = AERIAL_STRIKE.cooldown;
        emit({
          type: "aerialStrike",
          enemy: closestEnemy,
          damage: AERIAL_STRIKE.damage,
          position: { x: closestEnemy.pos.x, z: closestEnemy.pos.z }
        });
        spawnDamageNumber(closestEnemy.pos.x, closestEnemy.pos.z, "SPIKE!", "#44ddff");
      } else {
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
    } else {
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
  if (cfg.afterimageCount > 0 && getActiveProfile() !== "origin") {
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
  if (getActiveProfile() !== "origin") {
    for (const mat of rig.materials) {
      mat.emissive.setHex(4521898);
      mat.emissiveIntensity = 0.6;
    }
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
  if (getActiveProfile() !== "origin") {
    for (const mat of rig.materials) {
      mat.emissiveIntensity = 0.6 + chargeT * 0.4;
    }
  }
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
  playerVelY = 0;
  isPlayerAirborne = false;
  landingLagTimer = 0;
  actionLockoutTimer = 0;
  launchCooldownTimer = 0;
  launchWindupTimer = 0;
  launchWindupTarget = null;
  isSlamming = false;
  clearLaunchIndicator();
  resetDunk();
  resetFloatSelector();
  resetSpike();
  clearPlayerTags();
  lastFireTime = 0;
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
  attackHeld: false,
  // continuous: true while LMB is down
  ultimate: false,
  ultimateHeld: false,
  interact: false,
  bulletTime: false,
  bendMode: false,
  jump: false,
  launch: false,
  chargeStarted: false
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
var _checkMouseHold = () => {
};
function initInput() {
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    keys[e.code] = true;
    usingGamepad = false;
    if (e.code === "Space") {
      inputState.jump = true;
      e.preventDefault();
    }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") inputState.dash = true;
    if (e.code === "KeyE") {
      inputState.launch = true;
      inputState.ultimate = true;
    }
    if (e.code === "KeyF" || e.code === "Enter") inputState.interact = true;
    if (e.code === "KeyQ") {
      inputState.bulletTime = true;
      inputState.bendMode = true;
    }
  });
  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });
  window.addEventListener("mousemove", (e) => {
    inputState.mouseNDC.x = e.clientX / window.innerWidth * 2 - 1;
    inputState.mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    usingGamepad = false;
  });
  let mouseDownTime = 0;
  let mouseIsDown = false;
  const HOLD_THRESHOLD = 200;
  window.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      inputState.attack = true;
      inputState.attackHeld = true;
      mouseDownTime = performance.now();
      mouseIsDown = true;
      usingGamepad = false;
    }
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) {
      mouseIsDown = false;
      inputState.attackHeld = false;
    }
  });
  _checkMouseHold = () => {
    if (mouseIsDown && performance.now() - mouseDownTime > HOLD_THRESHOLD) {
      inputState.chargeStarted = true;
    }
  };
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
  _checkMouseHold();
  inputState.ultimateHeld = !!keys["KeyE"] || _touchUltHeld || inputState.chargeStarted;
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
  inputState.bulletTime = false;
  inputState.bendMode = false;
  inputState.jump = false;
  inputState.launch = false;
  inputState.chargeStarted = false;
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
function triggerJump() {
  inputState.jump = true;
}
function triggerLaunch() {
  inputState.launch = true;
}
var _cancelRequested = false;
function triggerCancel() {
  _cancelRequested = true;
}
function consumeCancel() {
  if (_cancelRequested) {
    _cancelRequested = false;
    return true;
  }
  return false;
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
  const grabbed = getActiveEnemy();
  let closest = null;
  let closestDist = Infinity;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.fellInPit || e.health <= 0) continue;
    if (e === grabbed) continue;
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
var ROOMS = [
  // ══════════════════════════════════════════════════════════════════════
  // Room 1: "The Origin" — Feb 7 prototype, auto-fire projectiles, cylinder+sphere model
  // ══════════════════════════════════════════════════════════════════════
  {
    name: "Origin \u2014 Feb 7th",
    profile: "origin",
    sandboxMode: true,
    commentary: "Where I started: auto-fire, simple shapes, simple movement.",
    intro: "This was the first hackathon build \u2014 Auto-fire projectiles, a cylinder-and-sphere player model, WASD movement. It's simplified to one enemy type here but there are more.",
    arenaHalfX: 9,
    arenaHalfZ: 16,
    obstacles: [
      { x: -3, z: 3, w: 1.5, h: 2, d: 1.5 },
      { x: 4, z: -4, w: 1.5, h: 2, d: 1.5 }
    ],
    pits: [],
    spawnBudget: {
      maxConcurrent: 3,
      telegraphDuration: 1500,
      packs: [
        pack(goblins(2), "ahead"),
        pack(goblins(2), "ahead"),
        pack(goblins(2), "sides")
      ]
    },
    playerStart: { x: 0, z: 12 }
  },
  // ══════════════════════════════════════════════════════════════════════
  // Room 2: "The Foundation" — goblins only, teach melee + dash + pit kills
  // ══════════════════════════════════════════════════════════════════════
  {
    name: "Foundations \u2014 Feb 18",
    profile: "base",
    sandboxMode: true,
    commentary: "How does adding displacement affect combat? What about hazards?",
    intro: "Activate force-push with E or press-and-hold LMB. Dash past goblins and push them into pits.",
    arenaHalfX: 10,
    arenaHalfZ: 20,
    enableWallSlamDamage: false,
    enableEnemyCollisionDamage: false,
    highlights: [{ target: "pits" }],
    obstacles: [
      { x: -4, z: 5, w: 1.5, h: 2, d: 1.5 },
      { x: 4, z: -5, w: 1.5, h: 2, d: 1.5 }
    ],
    pits: [
      { x: 6, z: -8, w: 3, d: 3 },
      { x: -6, z: -2, w: 3, d: 3 },
      { x: 3, z: 6, w: 3, d: 2.5 }
    ],
    spawnBudget: {
      maxConcurrent: 4,
      telegraphDuration: 1500,
      packs: [
        pack(goblins(2), "ahead"),
        pack(goblins(2), "ahead"),
        pack(goblins(3), "sides")
      ]
    },
    playerStart: { x: 0, z: 16 }
  },
  // ══════════════════════════════════════════════════════════════════════
  // Room 2: "Physics Playground" — walls + pits, force push as spatial tool
  // ══════════════════════════════════════════════════════════════════════
  {
    name: "Add More Physics \u2014 Feb 18",
    profile: "base",
    sandboxMode: true,
    commentary: "Can we extend physics-first combat further?",
    intro: "Can we extend physics more and lean into the isometric camera. Knocking enemies into each other and terrain is satisfying. Players have more options in second-to-second gameplay.",
    enableWallSlamDamage: true,
    enableEnemyCollisionDamage: true,
    arenaHalfX: 11,
    arenaHalfZ: 22,
    obstacles: [
      { x: -6, z: 0, w: 2, h: 2, d: 2 },
      { x: 6, z: 0, w: 2, h: 2, d: 2 },
      { x: 0, z: -10, w: 4, h: 1.5, d: 1 },
      { x: -3, z: 10, w: 1.5, h: 2, d: 1.5 }
    ],
    pits: [
      { x: -8, z: -8, w: 3, d: 4 },
      { x: 8, z: 5, w: 3, d: 3 },
      { x: 0, z: -16, w: 4, d: 3 }
    ],
    spawnBudget: {
      maxConcurrent: 5,
      telegraphDuration: 1500,
      packs: [
        pack(goblins(2), "ahead"),
        pack(goblins(2), "far"),
        pack(goblins(3), "ahead"),
        pack(goblins(3), "sides")
      ]
    },
    playerStart: { x: 0, z: 18 }
  },
  // ══════════════════════════════════════════════════════════════════════
  // Room 4: "The Shadows" — patrol maze, vision cones, detection puzzle
  // ══════════════════════════════════════════════════════════════════════
  {
    name: "Tension & Sneak \u2014 Feb 19",
    profile: "assassin",
    sandboxMode: true,
    commentary: "How do we add tension? How can we slow the game down?",
    intro: "What does an assassination or heist variation of the sandbox look like? How can we make the experience accessible? Bullet-time automatically activates when you get spotted or use Q to trigger it manually.",
    arenaHalfX: 14,
    arenaHalfZ: 14,
    obstacles: [
      // Maze walls — creating lanes
      { x: -5, z: 5, w: 8, h: 2, d: 1 },
      // upper-left horizontal wall
      { x: 5, z: -1, w: 8, h: 2, d: 1 },
      // center-right horizontal wall
      { x: -5, z: -7, w: 8, h: 2, d: 1 },
      // lower-left horizontal wall
      // Cover pillars at intersections
      { x: 0, z: 8, w: 1.5, h: 2, d: 1.5 },
      // top gap pillar
      { x: -1, z: -4, w: 1.5, h: 2, d: 1.5 }
      // center gap pillar
    ],
    pits: [
      // Opportunistic push spots at corridor intersections
      { x: 8, z: 5, w: 3, d: 3 },
      // right side, near upper wall end
      { x: -8, z: -1, w: 3, d: 3 },
      // left side, center height
      { x: 4, z: -5, w: 3, d: 2.5 }
      // lower-right, between center and lower walls
    ],
    spawnBudget: {
      maxConcurrent: 5,
      telegraphDuration: 1500,
      packs: [
        // Pit 1 (x:8, z:5) — right side, 2 goblins on opposite corners
        {
          enemies: [
            { type: "goblin", fixedPos: { x: 11, z: 3 }, patrolWaypoints: [{ x: 11, z: 3 }, { x: 11, z: 7 }, { x: 5, z: 7 }, { x: 5, z: 3 }] },
            { type: "goblin", fixedPos: { x: 5, z: 7 }, patrolWaypoints: [{ x: 5, z: 7 }, { x: 5, z: 3 }, { x: 11, z: 3 }, { x: 11, z: 7 }] }
          ],
          spawnZone: "ahead"
        },
        // Pit 2 (x:-8, z:-1) — left side, 2 goblins on opposite corners
        {
          enemies: [
            { type: "goblin", fixedPos: { x: -5, z: -3 }, patrolWaypoints: [{ x: -5, z: -3 }, { x: -5, z: 1 }, { x: -11, z: 1 }, { x: -11, z: -3 }] },
            { type: "goblin", fixedPos: { x: -11, z: 1 }, patrolWaypoints: [{ x: -11, z: 1 }, { x: -11, z: -3 }, { x: -5, z: -3 }, { x: -5, z: 1 }] }
          ],
          spawnZone: "ahead"
        },
        // Pit 3 (x:4, z:-5) — lower center-right, 1 goblin
        {
          enemies: [
            { type: "goblin", fixedPos: { x: 7, z: -3 }, patrolWaypoints: [{ x: 7, z: -3 }, { x: 7, z: -7 }, { x: 1, z: -7 }, { x: 1, z: -3 }] }
          ],
          spawnZone: "ahead"
        }
      ]
    },
    playerStart: { x: -10, z: 10 },
    enableWallSlamDamage: false,
    enableEnemyCollisionDamage: false,
    highlights: [{ target: "pits" }]
  },
  // ══════════════════════════════════════════════════════════════════════
  // Room 5: "The Workshop" — rule-bending (enlarge/shrink physics objects)
  // ══════════════════════════════════════════════════════════════════════
  {
    name: "Puzzles & Magic \u2014 Feb 19",
    profile: "rule-bending",
    sandboxMode: true,
    commentary: "What does magic look like? Enlarge a rock, shrink a crate...",
    intro: "What if you could bend the rules of the world? How can we incorporate magic in a way that supports the sandbox?\n\nBuilding off of Bullet-time, use Q to enlarge the floating rock. This room explores layering puzzle gameplay in the sandbox.",
    arenaHalfX: 14,
    arenaHalfZ: 14,
    obstacles: [
      // Left wall segment — creates wall slam opportunities
      { x: -8, z: 0, w: 1, h: 2, d: 10 },
      // Right wall segment
      { x: 8, z: -4, w: 1, h: 2, d: 7 }
    ],
    pits: [
      { x: 8, z: 7, w: 3, d: 3 },
      // right-back pit
      { x: -8, z: -7, w: 3, d: 3 }
      // left-front pit
    ],
    physicsObjects: [
      // Rock: enlarge to reach pressure plate mass threshold (2.0 → 4.0)
      { meshType: "rock", material: "stone", x: 0, z: 0, mass: 2, health: Infinity, radius: 0.6, suspended: true, suspendHeight: 3 },
      // Crate: blocks the door at -Z end, too heavy to push (mass 5.0), shrink to move aside
      { meshType: "crate", material: "wood", x: 0, z: -12, mass: 5, health: 80, radius: 1.5 }
    ],
    pressurePlates: [
      // Pressure plate: center of room, needs mass >= 3.5 (enlarged rock = 4.0)
      { x: 0, z: 0, radius: 1.2, massThreshold: 3.5 }
    ],
    spawnBudget: {
      maxConcurrent: 6,
      telegraphDuration: 1500,
      packs: [
        // Goblin loitering under the suspended boulder — enlarge the rock to crush it
        { enemies: [{ type: "goblin", fixedPos: { x: 0, z: 0 }, patrolWaypoints: [{ x: 0.5, z: 0.5 }, { x: -0.5, z: 0.5 }, { x: -0.5, z: -0.5 }, { x: 0.5, z: -0.5 }] }], spawnZone: "ahead" },
        { enemies: [{ type: "goblin" }, { type: "goblin" }, { type: "goblin" }], spawnZone: "ahead" }
      ]
    },
    playerStart: { x: 0, z: 11 },
    enableWallSlamDamage: true,
    enableEnemyCollisionDamage: true,
    highlights: [
      { target: "pits", color: 16729156 }
    ],
    lockedBends: ["shrink"]
  },
  // ══════════════════════════════════════════════════════════════════════
  // Room 6: "The Arena" — vertical combat: jump, launch, dunk, spike
  // ══════════════════════════════════════════════════════════════════════
  {
    name: "Physics Playground \u2014 Feb 19",
    profile: "vertical",
    sandboxMode: true,
    commentary: "What if combat had a real Z-axis? Jump, launch, spike, and dunk. What if terrain had more levels of height?",
    intro: "What if we also leaned into the Z-axis of the game? Use the launch button to send enemies into the air! Tap to spike them volleyball. Press and hold to bullet-time dunk. What if terrain had more levels of height?",
    arenaHalfX: 12,
    arenaHalfZ: 12,
    obstacles: [],
    pits: [],
    heightZones: [
      { x: -6, z: -6, w: 4, d: 4, y: 1.5 },
      { x: 6, z: 6, w: 4, d: 4, y: 1.5 }
    ],
    spawnBudget: {
      maxConcurrent: 10,
      telegraphDuration: 1500,
      packs: [
        pack(goblins(4), "ahead"),
        pack(goblins(3), "sides")
      ]
    },
    playerStart: { x: 0, z: 5 },
    enableWallSlamDamage: true,
    enableEnemyCollisionDamage: true,
    frustumSize: 9.6,
    highlights: [{ target: "platforms", color: 4491519 }]
  }
];

// src/engine/groundShadows.ts
var playerShadow = null;
var enemyShadows = /* @__PURE__ */ new Map();
var shadowGeo = null;
var shadowMat = null;
function getShadowGeo() {
  if (!shadowGeo) {
    shadowGeo = new THREE.CircleGeometry(1, 16);
  }
  return shadowGeo;
}
function getShadowMat() {
  if (!shadowMat) {
    shadowMat = new THREE.MeshBasicMaterial({
      color: 0,
      transparent: true,
      opacity: 0.3,
      depthWrite: false
    });
  }
  return shadowMat;
}
function createShadowMesh(radius) {
  const mesh = new THREE.Mesh(getShadowGeo(), getShadowMat().clone());
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(radius * 0.8, radius * 0.8, 1);
  mesh.renderOrder = -1;
  return mesh;
}
function updateShadowForEntity(shadow, posX, posZ, posY, baseRadius) {
  const groundHeight = getGroundHeight(posX, posZ);
  const altitude = posY - groundHeight;
  shadow.position.x = posX;
  shadow.position.z = posZ;
  shadow.position.y = groundHeight + 0.01;
  const scale = Math.max(0.3, 1 - altitude * 0.1) * baseRadius * 0.8;
  shadow.scale.set(scale, scale, 1);
  shadow.material.opacity = Math.max(0.1, 0.3 - altitude * 0.03);
  shadow.visible = altitude > PHYSICS.groundEpsilon || posY > 0;
}
function initGroundShadows() {
  const scene2 = getScene();
  playerShadow = createShadowMesh(0.35);
  scene2.add(playerShadow);
}
function updateGroundShadows(gameState2) {
  const scene2 = getScene();
  if (playerShadow) {
    const pp = getPlayerPos();
    updateShadowForEntity(playerShadow, pp.x, pp.z, pp.y, 0.35);
  }
  const activeEnemies = /* @__PURE__ */ new Set();
  for (const enemy of gameState2.enemies) {
    if (enemy.health <= 0 && !enemyShadows.has(enemy)) continue;
    activeEnemies.add(enemy);
    let shadow = enemyShadows.get(enemy);
    if (!shadow) {
      shadow = createShadowMesh(enemy.config.size.radius);
      scene2.add(shadow);
      enemyShadows.set(enemy, shadow);
    }
    if (enemy.health <= 0 || enemy.fellInPit) {
      shadow.visible = false;
      continue;
    }
    updateShadowForEntity(shadow, enemy.pos.x, enemy.pos.z, enemy.pos.y, enemy.config.size.radius);
  }
  for (const [enemy, shadow] of enemyShadows) {
    if (!activeEnemies.has(enemy)) {
      scene2.remove(shadow);
      shadow.material.dispose();
      enemyShadows.delete(enemy);
    }
  }
}
function cleanupGroundShadows() {
  const scene2 = getScene();
  if (playerShadow) {
    scene2.remove(playerShadow);
    playerShadow.material.dispose();
    playerShadow = null;
  }
  for (const [, shadow] of enemyShadows) {
    scene2.remove(shadow);
    shadow.material.dispose();
  }
  enemyShadows.clear();
}

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
function resolveMovementCollision(x, z, radius, entityY = 0) {
  const bounds = getMoveBounds();
  let rx = x, rz = z;
  let wasDeflected = false;
  for (const box of bounds) {
    if (box.maxY !== void 0 && entityY >= box.maxY) continue;
    const push = circleVsAABB(rx, rz, radius, box);
    if (push) {
      rx += push.x;
      rz += push.z;
      wasDeflected = true;
    }
  }
  return { x: rx, z: rz, wasDeflected };
}
function resolveTerrainCollisionEx(x, z, radius, entityY = 0) {
  const bounds = getBounds();
  let rx = x, rz = z;
  let hitWall = false;
  let totalNX = 0, totalNZ = 0;
  for (const box of bounds) {
    if (box.maxY !== void 0 && entityY >= box.maxY) continue;
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
    if (enemy.isCarrierPayload) continue;
    const vel = enemy.vel;
    if (!vel) continue;
    if (vel.y === void 0) vel.y = 0;
    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    const hasXZVelocity = speed >= PHYSICS.minVelocity;
    if (!hasXZVelocity && vel.y === 0 && enemy.pos.y <= PHYSICS.groundEpsilon) {
      vel.x = 0;
      vel.z = 0;
      continue;
    }
    if (hasXZVelocity) {
      const moveDist = speed * dt;
      const enemyRadius = enemy.config.size.radius;
      const moveSteps = Math.ceil(moveDist / enemyRadius);
      const subDt = dt / Math.max(moveSteps, 1);
      let fellInPit = false;
      let result = { x: enemy.pos.x, z: enemy.pos.z, hitWall: false, normalX: 0, normalZ: 0 };
      for (let s = 0; s < moveSteps; s++) {
        enemy.pos.x += vel.x * subDt;
        enemy.pos.z += vel.z * subDt;
        const isGrounded = enemy.pos.y <= PHYSICS.groundEpsilon;
        if (isGrounded && pointInPit(enemy.pos.x, enemy.pos.z)) {
          fellInPit = true;
          break;
        }
        result = resolveTerrainCollisionEx(enemy.pos.x, enemy.pos.z, enemyRadius, enemy.pos.y);
        enemy.pos.x = result.x;
        enemy.pos.z = result.z;
        if (result.hitWall) break;
      }
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
        vel.y = 0;
        vel.z = 0;
        continue;
      }
      if (result.hitWall && speed > PHYSICS.wallSlamMinSpeed) {
        const room = getCurrentRoom();
        const wallSlamEnabled = room?.enableWallSlamDamage ?? true;
        if (wallSlamEnabled) {
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
        }
        const dot = vel.x * result.normalX + vel.z * result.normalZ;
        vel.x = (vel.x - 2 * dot * result.normalX) * PHYSICS.wallSlamBounce;
        vel.z = (vel.z - 2 * dot * result.normalZ) * PHYSICS.wallSlamBounce;
      }
    } else {
      vel.x = 0;
      vel.z = 0;
    }
    const launchedEntry = getLaunchedEntry(enemy);
    const gravMult = launchedEntry?.gravityMult ?? 1;
    if (enemy.pos.y > PHYSICS.groundEpsilon || vel.y > 0) {
      enemy.pos.y += vel.y * dt;
      vel.y -= PHYSICS.gravity * gravMult * dt;
      vel.y = Math.max(vel.y, -PHYSICS.terminalVelocity);
    }
    const groundHeight = getGroundHeight(enemy.pos.x, enemy.pos.z);
    if (enemy.pos.y < groundHeight) {
      enemy.pos.y = groundHeight;
      vel.y = 0;
    }
    enemy.mesh.position.copy(enemy.pos);
    const isGroundedNow = enemy.pos.y <= groundHeight + PHYSICS.groundEpsilon;
    if (isGroundedNow && speed >= PHYSICS.minVelocity) {
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
}
function applyObjectVelocities(dt, gameState2) {
  for (const obj of gameState2.physicsObjects) {
    if (obj.destroyed) continue;
    if (obj.suspended) continue;
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
      if (isFinite(obj.health)) {
        obj.health -= slamDamage;
        if (obj.health <= 0) {
          obj.health = 0;
          obj.destroyed = true;
          if (obj.mesh) obj.mesh.visible = false;
          emit({ type: "objectDestroyed", object: obj, position: { x: obj.pos.x, z: obj.pos.z } });
        }
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
    if (a.isCarrierPayload) continue;
    if (a.pos.y > PHYSICS.groundEpsilon) continue;
    for (let j = i + 1; j < len; j++) {
      const b = enemies[j];
      if (b.health <= 0) continue;
      if (b.isLeaping) continue;
      if (b.pos.y > PHYSICS.groundEpsilon) continue;
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
      const room = getCurrentRoom();
      const collisionDmgEnabled = room?.enableEnemyCollisionDamage ?? true;
      if (collisionDmgEnabled && relSpeed > PHYSICS.impactMinSpeed) {
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
      if (a.suspended) continue;
      for (let j = i + 1; j < objects.length; j++) {
        const b = objects[j];
        if (b.destroyed) continue;
        if (b.suspended) continue;
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
    if (obj.suspended) continue;
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
    if (obj.suspended) continue;
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
    const resolved2 = resolveMovementCollision(playerPos2.x, playerPos2.z, playerR, playerPos2.y);
    playerPos2.x = resolved2.x;
    playerPos2.z = resolved2.z;
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
      if (box.maxY !== void 0 && enemy.pos.y >= box.maxY) continue;
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
      if (obj.suspended) continue;
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
            if (obj.mesh) obj.mesh.position.set(obj.pos.x, 0, obj.pos.z);
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
var JUMP_DUST = {
  count: 4,
  lifetime: 0.2,
  speed: 3,
  spread: Math.PI,
  size: 0.05,
  color: 12298888,
  fadeOut: true,
  gravity: 2,
  shape: "sphere"
};
var LAND_DUST = {
  count: 6,
  lifetime: 0.3,
  speed: 4,
  spread: Math.PI,
  size: 0.06,
  color: 12298888,
  fadeOut: true,
  gravity: 3,
  shape: "sphere"
};
var LAUNCH_BURST = {
  count: 6,
  lifetime: 0.3,
  speed: 7,
  spread: Math.PI * 0.4,
  size: 0.06,
  color: 16755200,
  fadeOut: true,
  gravity: -2,
  // float upward with the launch
  shape: "box"
};
var AERIAL_SPIKE = {
  count: 8,
  lifetime: 0.25,
  speed: 8,
  spread: Math.PI * 0.6,
  size: 0.07,
  color: 4513279,
  fadeOut: true,
  gravity: 6,
  shape: "box"
};
var SLAM_IMPACT = {
  count: 10,
  lifetime: 0.35,
  speed: 8,
  spread: Math.PI,
  size: 0.07,
  color: 16746496,
  fadeOut: true,
  gravity: 4,
  shape: "box"
};
var DUNK_GRAB_SPARK = {
  count: 5,
  lifetime: 0.2,
  speed: 5,
  spread: Math.PI * 0.5,
  size: 0.05,
  color: 16729343,
  fadeOut: true,
  gravity: 0,
  shape: "sphere"
};
var DUNK_IMPACT_BURST = {
  count: 14,
  lifetime: 0.4,
  speed: 10,
  spread: Math.PI,
  size: 0.08,
  color: 16720452,
  fadeOut: true,
  gravity: 5,
  shape: "box"
};
var POOL_SIZE2 = 80;
var pool2 = [];
var sceneRef8 = null;
var boxGeo = null;
var sphereGeo = null;
function initParticles(scene2) {
  sceneRef8 = scene2;
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
  if (!sceneRef8) return;
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
  on("playerJump", (e) => {
    if (e.type === "playerJump") {
      burst({ x: e.position.x, y: 0.1, z: e.position.z }, JUMP_DUST);
    }
  });
  on("playerLand", (e) => {
    if (e.type === "playerLand") {
      const intensity = Math.min(e.fallSpeed / 10, 2);
      burst(
        { x: e.position.x, y: 0.1, z: e.position.z },
        { ...LAND_DUST, count: Math.round(3 + intensity * 4) }
      );
    }
  });
  on("enemyLaunched", (e) => {
    if (e.type === "enemyLaunched") {
      burst(
        { x: e.position.x, y: 0.3, z: e.position.z },
        LAUNCH_BURST
      );
    }
  });
  on("aerialStrike", (e) => {
    if (e.type === "aerialStrike") {
      burst(
        { x: e.position.x, y: 0.5, z: e.position.z },
        AERIAL_SPIKE
      );
    }
  });
  on("playerSlam", (e) => {
    if (e.type === "playerSlam") {
      burst(
        { x: e.position.x, y: 0.1, z: e.position.z },
        { ...SLAM_IMPACT, count: Math.round(8 + e.fallSpeed / 15 * 4) }
      );
    }
  });
  on("dunkGrab", (e) => {
    if (e.type === "dunkGrab") {
      burst(
        { x: e.position.x, y: 0.8, z: e.position.z },
        DUNK_GRAB_SPARK
      );
    }
  });
  on("dunkImpact", (e) => {
    if (e.type === "dunkImpact") {
      burst(
        { x: e.position.x, y: 0.1, z: e.position.z },
        DUNK_IMPACT_BURST
      );
    }
  });
}

// src/engine/telegraph.ts
var sceneRef9;
var ringGeo3;
var fillGeo;
var typeGeos = {};
function initTelegraph(scene2) {
  sceneRef9 = scene2;
  ringGeo3 = new THREE.RingGeometry(0.6, 0.8, 24);
  ringGeo3.rotateX(-Math.PI / 2);
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
  const ringMat2 = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const ring = new THREE.Mesh(ringGeo3, ringMat2);
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
  sceneRef9.add(group);
  return {
    group,
    ring,
    ringMat: ringMat2,
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
    sceneRef9.remove(telegraph.group);
  }
  telegraph.ringMat.dispose();
  telegraph.fillMat.dispose();
  telegraph.typeMat.dispose();
}

// src/engine/roomHighlights.ts
var DEFAULT_DELAY = 800;
var DEFAULT_DURATION = 2e3;
var PILLAR_HEIGHT = 1.25;
var PILLAR_THICKNESS = 0.04;
var activeTimers = [];
var activeRafs = [];
var activeMeshes = [];
function clearHighlights() {
  for (const id of activeTimers) clearTimeout(id);
  activeTimers = [];
  for (const id of activeRafs) cancelAnimationFrame(id);
  activeRafs = [];
  const scene2 = getScene();
  for (const obj of activeMeshes) {
    scene2.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  }
  activeMeshes = [];
}
function triggerRoomHighlights(highlights) {
  clearHighlights();
  for (const hl of highlights) {
    const delay = hl.delay ?? DEFAULT_DELAY;
    const duration = hl.duration ?? DEFAULT_DURATION;
    const timerId = window.setTimeout(() => {
      const rects = getRectsForTarget(hl.target, hl.color);
      for (const rect of rects) {
        spawnHighlight(rect, duration);
      }
    }, delay);
    activeTimers.push(timerId);
  }
}
var TARGET_COLORS = {
  pits: 16729190,
  obstacles: 6719743,
  platforms: 4491519
};
function getRectsForTarget(target4, colorOverride) {
  const color = colorOverride ?? TARGET_COLORS[target4] ?? 16777215;
  switch (target4) {
    case "pits":
      return PITS.map((p) => ({ x: p.x, z: p.z, w: p.w, d: p.d, color }));
    case "obstacles":
      return OBSTACLES.map((o) => ({ x: o.x, z: o.z, w: o.w, d: o.d, color }));
    case "platforms":
      return HEIGHT_ZONES.map((hz) => ({ x: hz.x, z: hz.z, w: hz.w, d: hz.d, color }));
    default:
      return [];
  }
}
function spawnHighlight(rect, duration) {
  const scene2 = getScene();
  const allParts = [];
  const baseY = rect.y ?? 0;
  const margin = 0.3;
  const planeGeo = new THREE.PlaneGeometry(rect.w + margin, rect.d + margin);
  const edgesGeo = new THREE.EdgesGeometry(planeGeo);
  planeGeo.dispose();
  const baseMat = new THREE.LineBasicMaterial({
    color: rect.color,
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
  const baseRing = new THREE.LineSegments(edgesGeo, baseMat);
  baseRing.rotation.x = -Math.PI / 2;
  baseRing.position.set(rect.x, baseY + 0.06, rect.z);
  scene2.add(baseRing);
  allParts.push(baseRing);
  const hw = rect.w / 2;
  const hd = rect.d / 2;
  const corners = [
    { x: rect.x - hw, z: rect.z - hd },
    { x: rect.x + hw, z: rect.z - hd },
    { x: rect.x + hw, z: rect.z + hd },
    { x: rect.x - hw, z: rect.z + hd }
  ];
  const pillarGeo2 = new THREE.BoxGeometry(PILLAR_THICKNESS, PILLAR_HEIGHT, PILLAR_THICKNESS);
  const pillars = [];
  for (const corner of corners) {
    const pillarMat = new THREE.MeshBasicMaterial({
      color: rect.color,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    const pillar = new THREE.Mesh(pillarGeo2, pillarMat);
    pillar.position.set(corner.x, baseY + PILLAR_HEIGHT / 2, corner.z);
    scene2.add(pillar);
    allParts.push(pillar);
    pillars.push(pillar);
  }
  const wallPlanes = [];
  for (let i = 0; i < 4; i++) {
    const c0 = corners[i];
    const c1 = corners[(i + 1) % 4];
    const dx = c1.x - c0.x;
    const dz = c1.z - c0.z;
    const wallWidth = Math.sqrt(dx * dx + dz * dz);
    const wallGeo = new THREE.PlaneGeometry(wallWidth, PILLAR_HEIGHT, 1, 8);
    const posAttr = wallGeo.getAttribute("position");
    const colors = new Float32Array(posAttr.count * 4);
    const r = (rect.color >> 16 & 255) / 255;
    const g = (rect.color >> 8 & 255) / 255;
    const b = (rect.color & 255) / 255;
    for (let v = 0; v < posAttr.count; v++) {
      const y = posAttr.getY(v);
      const normalizedY = (y + PILLAR_HEIGHT / 2) / PILLAR_HEIGHT;
      const vertAlpha = 1 - normalizedY * normalizedY;
      colors[v * 4] = r;
      colors[v * 4 + 1] = g;
      colors[v * 4 + 2] = b;
      colors[v * 4 + 3] = vertAlpha;
    }
    wallGeo.setAttribute("color", new THREE.BufferAttribute(colors, 4));
    const wallMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const wallMesh = new THREE.Mesh(wallGeo, wallMat);
    wallMesh.position.set(
      (c0.x + c1.x) / 2,
      baseY + PILLAR_HEIGHT / 2,
      (c0.z + c1.z) / 2
    );
    wallMesh.rotation.y = Math.atan2(-dz, dx);
    scene2.add(wallMesh);
    allParts.push(wallMesh);
    wallPlanes.push(wallMesh);
  }
  activeMeshes.push(...allParts);
  const startTime = performance.now();
  function animate() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / duration, 1);
    let alpha;
    if (t < 0.1) {
      alpha = t / 0.1;
    } else if (t < 0.45) {
      alpha = 1;
    } else {
      alpha = 1 - (t - 0.45) / 0.55;
    }
    alpha = Math.max(0, alpha);
    baseMat.opacity = alpha * 0.9;
    let heightT;
    if (t < 0.15) {
      heightT = t / 0.15;
    } else if (t < 0.5) {
      heightT = 1;
    } else {
      heightT = 1 - (t - 0.5) / 0.5;
    }
    heightT = Math.max(0, heightT);
    const easedHeight = 1 - (1 - heightT) * (1 - heightT);
    for (const pillar of pillars) {
      pillar.material.opacity = alpha * 0.7;
      pillar.scale.y = Math.max(0.01, easedHeight);
      pillar.position.y = baseY + PILLAR_HEIGHT * easedHeight / 2;
    }
    for (const wall of wallPlanes) {
      wall.material.opacity = alpha * 0.35;
      wall.scale.y = Math.max(0.01, easedHeight);
      wall.position.y = baseY + PILLAR_HEIGHT * easedHeight / 2;
    }
    if (t < 1) {
      const rafId2 = requestAnimationFrame(animate);
      activeRafs.push(rafId2);
    } else {
      for (const part of allParts) {
        scene2.remove(part);
        if (part.geometry) part.geometry.dispose();
        if (part.material) part.material.dispose();
      }
      edgesGeo.dispose();
      pillarGeo2.dispose();
      for (const part of allParts) {
        const idx = activeMeshes.indexOf(part);
        if (idx >= 0) activeMeshes.splice(idx, 1);
      }
    }
  }
  const rafId = requestAnimationFrame(animate);
  activeRafs.push(rafId);
}

// src/config/door.ts
var DOOR_CONFIG = {
  unlockDuration: 1e3,
  // ms — door unlock animation duration
  interactRadius: 3.5,
  // units — proximity for showing prompt (deprecated: walkthrough replaces interact)
  walkthroughHalfX: 1.5,
  // units — half-width of walkthrough volume (inside door frame pillars at ±2)
  walkthroughHalfZ: 1,
  // units — half-depth of walkthrough volume (thin strip crossing threshold)
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
var sceneRef10 = null;
var doorX = 0;
var doorZ = 0;
var promptEl = null;
var promptVisible = false;
function initDoor(scene2) {
  sceneRef10 = scene2;
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
    promptEl.textContent = "Next Room \u2192";
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
  sceneRef10.add(doorGroup);
}
function unlockDoor() {
  if (doorState !== "locked") return;
  doorState = "unlocking";
  doorAnimTimer = 0;
}
function updateDoor(dt, playerPos2, interact) {
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
      const dx = Math.abs(playerPos2.x - doorX);
      const dz = Math.abs(playerPos2.z - doorZ);
      const insideDoor = dx < DOOR_CONFIG.walkthroughHalfX && dz < DOOR_CONFIG.walkthroughHalfZ;
      const nearDoor = dx < DOOR_CONFIG.walkthroughHalfX + 1.5 && dz < DOOR_CONFIG.walkthroughHalfZ + 2;
      if (insideDoor || nearDoor && interact) {
        hidePrompt();
        emit({ type: "doorEntered", roomIndex: doorRoomIndex });
        doorState = "none";
        return true;
      } else if (nearDoor) {
        showPrompt();
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
  if (doorGroup && sceneRef10) {
    sceneRef10.remove(doorGroup);
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
    fellInPit: false,
    suspended: placement.suspended ?? false,
    suspendHeight: placement.suspendHeight ?? 0,
    tetherMesh: null
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
  if (obj.suspended && obj.suspendHeight > 0) {
    group.position.y = obj.suspendHeight;
    const tetherGeo = new THREE.CylinderGeometry(0.03, 0.03, obj.suspendHeight, 4);
    const tetherMat = new THREE.MeshBasicMaterial({
      color: 8961023,
      transparent: true,
      opacity: 0.6
    });
    const tether = new THREE.Mesh(tetherGeo, tetherMat);
    tether.position.set(obj.pos.x, obj.suspendHeight / 2, obj.pos.z);
    scene2.add(tether);
    obj.tetherMesh = tether;
  }
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
    if (obj.tetherMesh) {
      scene2.remove(obj.tetherMesh);
      obj.tetherMesh.geometry.dispose();
      obj.tetherMesh.material.dispose();
    }
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
function updateTetherVisuals(gameState2) {
  const t = performance.now() / 1e3;
  for (const obj of gameState2.physicsObjects) {
    if (!obj.suspended || !obj.tetherMesh) continue;
    const pulse = 0.4 + 0.3 * Math.sin(t * 3);
    obj.tetherMesh.material.opacity = pulse;
  }
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
  function applyBend(bendId, targetType, target4) {
    const bend = getBendById(bendId);
    if (!bend) return { success: false, reason: "invalid_bend" };
    if (remaining <= 0) return { success: false, reason: "no_bends_remaining" };
    const targetId = target4.id ?? 0;
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
      originalValues[fx.param] = target4[fx.param];
    }
    for (const fx of bend.effects) {
      if (fx.operation === "multiply") {
        target4[fx.param] *= fx.value;
      } else if (fx.operation === "set") {
        target4[fx.param] = fx.value;
      }
    }
    activeBends.push({
      bendId,
      targetType,
      targetId,
      target: target4,
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

// src/ui/radialMenu.ts
var containerEl = null;
var optionEls = [];
var visible = false;
var selectedBendId = null;
var onBendSelectedCallback = null;
var lockedBendIds = /* @__PURE__ */ new Set();
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
  const nameEl2 = document.createElement("div");
  nameEl2.style.cssText = `
    font-family: 'Courier New', monospace;
    font-size: 9px;
    color: ${colorHex};
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-top: 4px;
    pointer-events: none;
  `;
  nameEl2.textContent = bend.name;
  el.appendChild(nameEl2);
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
    if (lockedBendIds.has(bend.id)) return;
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
    if (lockedBendIds.has(id)) {
      optEl.style.borderColor = "#44444466";
      optEl.style.boxShadow = "none";
      optEl.style.transform = "scale(0.85)";
      optEl.style.opacity = "0.3";
      optEl.style.pointerEvents = "none";
      optEl.style.filter = "grayscale(1)";
    } else {
      optEl.style.borderColor = colorHex + "44";
      optEl.style.boxShadow = "none";
      optEl.style.transform = "scale(1)";
      optEl.style.opacity = "1";
      optEl.style.pointerEvents = "auto";
      optEl.style.filter = "none";
    }
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
function updateLockedBends(ids) {
  lockedBendIds = new Set(ids);
}
function unlockBendUI(bendId) {
  lockedBendIds.delete(bendId);
  const optEl = optionEls.find((el) => el.dataset.bendId === bendId);
  if (!optEl) return;
  const bend = BENDS.find((b) => b.id === bendId);
  if (!bend) return;
  const colorHex = "#" + bend.tintColor.toString(16).padStart(6, "0");
  optEl.style.pointerEvents = "auto";
  optEl.style.filter = "none";
  optEl.style.opacity = "1";
  optEl.style.transform = "scale(1)";
  optEl.style.borderColor = colorHex;
  optEl.style.boxShadow = `0 0 24px ${colorHex}, 0 0 48px ${colorHex}88`;
  optEl.style.transform = "scale(1.3)";
  setTimeout(() => {
    optEl.style.boxShadow = "none";
    optEl.style.transform = "scale(1)";
    optEl.style.borderColor = colorHex + "44";
  }, 800);
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
var lockedBends = /* @__PURE__ */ new Set();
function initBendMode() {
  maxBends = 3;
  bendSystem = createBendSystem(maxBends);
  on("pressurePlateActivated", () => {
    if (lockedBends.size === 0) return;
    const unlocking = [...lockedBends];
    for (const bendId of unlocking) {
      unlockBend(bendId);
    }
  });
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
function tryApplyBendToTarget(target4, targetType) {
  const selectedBend = getSelectedBendId();
  if (!selectedBend) return;
  if (lockedBends.has(selectedBend)) {
    emit({ type: "bendFailed", bendId: selectedBend, reason: "locked" });
    return;
  }
  const result = bendSystem.applyBend(selectedBend, targetType, target4);
  if (result.success) {
    highlightedObjects.delete(target4);
    if (target4.mesh) {
      target4.mesh.traverse((child) => {
        if (child.isMesh) {
          delete child.userData._origEmissiveHex;
          delete child.userData._origEmissiveIntensity;
        }
      });
    }
    const bend = getBendById(selectedBend);
    if (bend) {
      applyBendVisuals(target4, bend.tintColor);
    }
    if (target4.suspended) {
      target4.suspended = false;
      if (target4.tetherMesh) {
        target4.tetherMesh.geometry.dispose();
        target4.tetherMesh.material.dispose();
        const tetherScene = target4.tetherMesh.parent;
        if (tetherScene) tetherScene.remove(target4.tetherMesh);
        target4.tetherMesh = null;
      }
      const mesh = target4.mesh;
      if (mesh) {
        const startY = target4.suspendHeight;
        const dropDuration = 400;
        const startTime = performance.now();
        const dropAnim = () => {
          const elapsed = performance.now() - startTime;
          const t = Math.min(elapsed / dropDuration, 1);
          const eased = t * t;
          mesh.position.y = startY * (1 - eased);
          if (t < 1) {
            requestAnimationFrame(dropAnim);
          } else {
            mesh.position.y = 0;
            screenShake(5, 300);
            emit({ type: "objectDropped", position: { x: target4.pos.x, z: target4.pos.z } });
          }
        };
        requestAnimationFrame(dropAnim);
      }
    }
    emit({
      type: "bendApplied",
      bendId: selectedBend,
      targetType,
      targetId: target4.id ?? 0,
      position: { x: target4.pos.x, z: target4.pos.z }
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
function setLockedBends(ids) {
  lockedBends = new Set(ids);
  updateLockedBends(ids);
}
function unlockBend(bendId) {
  lockedBends.delete(bendId);
  updateLockedBends([...lockedBends]);
  unlockBendUI(bendId);
  const announceEl2 = document.getElementById("wave-announce");
  if (announceEl2) {
    const label = bendId.toUpperCase();
    announceEl2.textContent = `${label} UNLOCKED`;
    announceEl2.classList.add("visible");
    setTimeout(() => announceEl2.classList.remove("visible"), 2e3);
  }
  screenShake(3, 200);
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
  lockedBends.clear();
  updateLockedBends([]);
}

// src/engine/pressurePlate.ts
function createPressurePlate(placement) {
  return {
    x: placement.x,
    z: placement.z,
    radius: placement.radius,
    massThreshold: placement.massThreshold,
    activated: false,
    mesh: null
  };
}
function createPressurePlateMesh(plate, scene2) {
  const group = new THREE.Group();
  const ringGeo4 = new THREE.RingGeometry(plate.radius * 0.6, plate.radius, 32);
  const ringMat2 = new THREE.MeshBasicMaterial({
    color: 4521864,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(ringGeo4, ringMat2);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  group.add(ring);
  const discGeo = new THREE.CircleGeometry(plate.radius * 0.6, 32);
  const discMat = new THREE.MeshBasicMaterial({
    color: 2254404,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide
  });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.01;
  group.add(disc);
  group.position.set(plate.x, 0, plate.z);
  scene2.add(group);
  plate.mesh = group;
}
function updatePressurePlates(gameState2) {
  for (const plate of gameState2.pressurePlates) {
    if (plate.activated) continue;
    for (const obj of gameState2.physicsObjects) {
      if (obj.destroyed || obj.fellInPit) continue;
      const dx = obj.pos.x - plate.x;
      const dz = obj.pos.z - plate.z;
      const distSq = dx * dx + dz * dz;
      const maxDist = plate.radius + obj.radius;
      if (distSq > maxDist * maxDist) continue;
      if (obj.mass < plate.massThreshold) continue;
      const speed = Math.sqrt(obj.vel.x * obj.vel.x + obj.vel.z * obj.vel.z);
      if (speed > 0.5) continue;
      plate.activated = true;
      activatePlateCeremony(plate);
      break;
    }
  }
  for (const plate of gameState2.pressurePlates) {
    if (plate.activated || !plate.mesh) continue;
    const t = performance.now() / 1e3;
    const pulse = 0.3 + 0.15 * Math.sin(t * 2.5);
    const ring = plate.mesh.children[0];
    if (ring && ring.material) {
      ring.material.opacity = pulse;
    }
  }
}
function activatePlateCeremony(plate) {
  if (!plate.mesh) return;
  plate.mesh.children.forEach((child) => {
    if (child.material) {
      child.material.color.setHex(8978380);
      child.material.opacity = 0.8;
    }
  });
  screenShake(4, 300);
  emit({
    type: "pressurePlateActivated",
    position: { x: plate.x, z: plate.z }
  });
}
function clearPressurePlates(gameState2, scene2) {
  for (const plate of gameState2.pressurePlates) {
    if (plate.mesh) {
      scene2.remove(plate.mesh);
      plate.mesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
  }
  gameState2.pressurePlates = [];
}

// src/ui/roomIntro.ts
var overlayEl = null;
var nameEl = null;
var textEl = null;
var continueBtn = null;
var currentCleanup = null;
function initRoomIntro() {
  overlayEl = document.getElementById("room-intro");
  nameEl = document.getElementById("room-intro-name");
  textEl = document.getElementById("room-intro-text");
  continueBtn = document.getElementById("room-intro-continue");
}
function showRoomIntro(room, onContinue) {
  if (!overlayEl || !nameEl || !textEl || !continueBtn) return;
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }
  nameEl.textContent = room.name;
  textEl.textContent = room.intro ?? room.commentary;
  overlayEl.classList.remove("hidden");
  void overlayEl.offsetWidth;
  overlayEl.classList.add("visible");
  const handleContinue = () => {
    cleanup();
    hideRoomIntro();
    onContinue();
  };
  const handleClick = () => handleContinue();
  const handleTouch = (e) => {
    e.preventDefault();
    handleContinue();
  };
  continueBtn.addEventListener("click", handleClick);
  continueBtn.addEventListener("touchend", handleTouch);
  const cleanup = () => {
    continueBtn.removeEventListener("click", handleClick);
    continueBtn.removeEventListener("touchend", handleTouch);
    currentCleanup = null;
  };
  currentCleanup = cleanup;
}
function hideRoomIntro() {
  if (!overlayEl) return;
  overlayEl.classList.remove("visible");
  setTimeout(() => {
    if (overlayEl) overlayEl.classList.add("hidden");
  }, 300);
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
var sceneRef11 = null;
var onContinueCallback = null;
function initRoomManager(scene2, onIntroComplete) {
  sceneRef11 = scene2;
  onContinueCallback = onIntroComplete ?? null;
  announceEl = document.getElementById("wave-announce");
  initTelegraph(scene2);
  initDoor(scene2);
  initRoomIntro();
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
  clearHighlights();
  clearEnemies(gameState2);
  releaseAllProjectiles();
  clearMortarProjectiles();
  clearIcePatches();
  clearAoeTelegraphs();
  clearDamageNumbers();
  clearEffectGhosts();
  clearParticles();
  removeDoor();
  resetAerialVerbs();
  clearAllTags();
  clearCarriers();
  clearLaunchPillars();
  clearLaunchIndicator();
  cleanupGroundShadows();
  clearVisionCones();
  clearPhysicsObjects(gameState2, sceneRef11);
  clearPressurePlates(gameState2, sceneRef11);
  resetBendMode();
  if (room.lockedBends && room.lockedBends.length > 0) {
    setLockedBends(room.lockedBends);
  }
  resetPhysicsObjectIds();
  setArenaConfig(room.obstacles, room.pits, room.arenaHalfX, room.arenaHalfZ);
  setHeightZones(room.heightZones ?? []);
  invalidateCollisionBounds();
  rebuildArenaVisuals();
  setFrustumSize(room.frustumSize ?? 12);
  initGroundShadows();
  if (room.physicsObjects) {
    for (const placement of room.physicsObjects) {
      const obj = createPhysicsObject(placement);
      createPhysicsObjectMesh(obj, sceneRef11);
      gameState2.physicsObjects.push(obj);
    }
  }
  if (room.pressurePlates) {
    for (const placement of room.pressurePlates) {
      const plate = createPressurePlate(placement);
      createPressurePlateMesh(plate, sceneRef11);
      gameState2.pressurePlates.push(plate);
    }
  }
  setPlayerPosition(room.playerStart.x, room.playerStart.z);
  gameState2.currentWave = index + 1;
  setProfile(room.profile);
  setPlayerVisual(room.profile);
  gameState2.phase = "intro";
  showRoomIntro(room, () => {
    gameState2.phase = "playing";
    if (onContinueCallback) onContinueCallback();
  });
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
  if (room.sandboxMode) {
    unlockDoor();
  }
  if (room.highlights && room.highlights.length > 0) {
    triggerRoomHighlights(room.highlights);
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
  const doorTriggered = updateDoor(dt, playerPos2, input.interact);
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
        spawnEnemy(enemy.type, spawnPos, gameState2, enemy.patrolWaypoints);
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
  return pack2.enemies.map((enemyDef) => {
    if (enemyDef.fixedPos) {
      return { x: enemyDef.fixedPos.x, z: enemyDef.fixedPos.z };
    }
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
function getCurrentRoom() {
  return ROOMS[currentRoomIndex] ?? null;
}
function getCurrentRoomIndex() {
  return currentRoomIndex;
}
function getCurrentRoomName() {
  const room = ROOMS[currentRoomIndex];
  return room ? room.name : "";
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

// src/config/mobileControls.ts
var MOBILE_CONTROLS = {
  // Layout
  primarySize: 95,
  // px — Attack/Push button
  fanSize: 66,
  // px — Dash, Jump, Launch
  cancelSize: 45,
  // px — Cancel button
  arcRadius: 100,
  // px — distance from primary center to fan buttons
  arcStartAngle: -5,
  // degrees — 0=left, 90=up; -5 puts Dash near horizontal
  arcSpread: 95,
  // degrees — total angle spread: Dash=-5°, Jump=42.5°, Launch=90°
  edgeMargin: 20,
  // px — offset from screen edge
  // Behavior
  holdThreshold: 180,
  // ms — tap vs hold on Attack/Push button
  dragThreshold: 15,
  // px — min distance to register as drag
  dragMaxRadius: 80
  // px — full deflection range for drag-to-aim
};

// src/ui/hud.ts
var PROFILE_ABILITIES = {
  origin: ["dash"],
  base: ["dash", "ultimate"],
  assassin: ["dash", "ultimate"],
  "rule-bending": ["dash", "ultimate"],
  vertical: ["dash", "ultimate"]
};
var PROFILE_ABILITY_LABELS = {
  vertical: { ultimate: "Launch / Dunk" }
};
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
var mobileBtnDash;
var mobileBtnUlt;
var mobileBtnBend;
var mobileBtnJump;
var mobileBtnLaunch;
var mobileBtnCancel;
var lastMobileProfile = "";
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
  const bendCounter = document.createElement("div");
  bendCounter.id = "bend-counter";
  bendCounter.style.cssText = `
    position: fixed;
    top: 60px;
    left: 16px;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    color: rgba(100, 180, 255, 0.9);
    letter-spacing: 2px;
    text-shadow: 0 0 8px rgba(100, 140, 255, 0.4);
    display: none;
    pointer-events: none;
  `;
  document.body.appendChild(bendCounter);
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
  mobileBtnJump = document.getElementById("mobile-btn-jump");
  mobileBtnLaunch = document.getElementById("mobile-btn-launch");
  mobileBtnCancel = document.getElementById("mobile-btn-cancel");
  if (!mobileBtnDash) return;
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
  if (mobileBtnUlt) {
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
  if (mobileBtnJump) {
    mobileBtnJump.addEventListener("touchstart", (e) => {
      e.preventDefault();
      triggerJump();
    });
  }
  if (mobileBtnLaunch) {
    mobileBtnLaunch.addEventListener("touchstart", (e) => {
      e.preventDefault();
      triggerLaunch();
    });
  }
  if (mobileBtnCancel) {
    mobileBtnCancel.addEventListener("touchstart", (e) => {
      e.preventDefault();
      triggerCancel();
    });
  }
  mobileBtnBend = document.getElementById("mobile-btn-bend");
  if (mobileBtnBend) {
    mobileBtnBend.addEventListener("touchstart", (e) => {
      e.preventDefault();
      getInputState().bendMode = true;
    });
  }
  updateMobileButtons();
}
function updateMobileButtons() {
  const profile = getActiveProfile();
  if (profile === lastMobileProfile) return;
  lastMobileProfile = profile;
  const allBtns = [mobileBtnDash, mobileBtnUlt, mobileBtnJump, mobileBtnLaunch, mobileBtnCancel, mobileBtnBend];
  for (const btn of allBtns) {
    if (btn) btn.classList.remove("visible");
  }
  let visibleBtns = [];
  if (profile === "vertical") {
    visibleBtns = [
      { el: mobileBtnDash, size: MOBILE_CONTROLS.fanSize },
      { el: mobileBtnJump, size: MOBILE_CONTROLS.fanSize },
      { el: mobileBtnLaunch, size: MOBILE_CONTROLS.fanSize },
      { el: mobileBtnCancel, size: MOBILE_CONTROLS.cancelSize }
    ];
  } else if (profile === "origin") {
    visibleBtns = [];
  } else if (profile === "rule-bending") {
    visibleBtns = [
      { el: mobileBtnDash, size: MOBILE_CONTROLS.fanSize },
      { el: mobileBtnUlt, size: MOBILE_CONTROLS.primarySize },
      { el: mobileBtnBend, size: MOBILE_CONTROLS.fanSize }
    ];
  } else {
    visibleBtns = [
      { el: mobileBtnDash, size: MOBILE_CONTROLS.fanSize },
      { el: mobileBtnUlt, size: MOBILE_CONTROLS.primarySize }
    ];
  }
  const mc = MOBILE_CONTROLS;
  const anchorRight = mc.edgeMargin;
  const anchorBottom = window.innerHeight * 0.2;
  const container = document.getElementById("mobile-actions");
  if (container) {
    container.style.right = "0px";
    container.style.bottom = "0px";
    container.style.width = "100%";
    container.style.height = "100%";
  }
  const count = visibleBtns.length;
  for (let i = 0; i < count; i++) {
    const { el, size } = visibleBtns[i];
    if (!el) continue;
    el.classList.add("visible");
    el.style.width = size + "px";
    el.style.height = size + "px";
    const angleDeg = mc.arcStartAngle + (count > 1 ? mc.arcSpread * i / (count - 1) : 0);
    const angleRad = angleDeg * Math.PI / 180;
    const dx = -Math.cos(angleRad) * mc.arcRadius;
    const dy = -Math.sin(angleRad) * mc.arcRadius;
    el.style.right = anchorRight - dx + "px";
    el.style.bottom = anchorBottom - dy + "px";
    el.style.transform = "translate(50%, 50%)";
  }
}
function setupDragToAim(btnEl, { onDragStart, onDragMove, onRelease, onCancel }) {
  let touchId = null;
  let startX = 0, startY = 0;
  let isDragging = false;
  btnEl.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (touchId !== null) return;
    const touch = e.changedTouches[0];
    touchId = touch.identifier;
    startX = touch.clientX;
    startY = touch.clientY;
    isDragging = false;
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
      isDragging = true;
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
    onRelease(isDragging);
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
  updateMobileButtons();
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
  waveIndicator.textContent = `${getCurrentRoomIndex() + 1}. ${getCurrentRoomName()}`;
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
  const profile = getActiveProfile();
  const activeAbilities = PROFILE_ABILITIES[profile] ?? ["dash", "ultimate"];
  const labelOverrides = PROFILE_ABILITY_LABELS[profile] ?? {};
  for (const key of Object.keys(ABILITIES)) {
    const slot = document.getElementById(`ability-${key}`);
    if (slot) {
      if (activeAbilities.includes(key)) {
        slot.classList.remove("disabled");
      } else {
        slot.classList.add("disabled");
      }
      const nameEl2 = slot.querySelector(".ability-name");
      if (nameEl2) {
        nameEl2.textContent = labelOverrides[key] ?? ABILITIES[key].name;
      }
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
  const bendCounterEl = document.getElementById("bend-counter");
  if (bendCounterEl) {
    if (getActiveProfile() === "rule-bending") {
      bendCounterEl.style.display = "block";
      bendCounterEl.textContent = `BENDS: ${getBendsRemaining()}/${getMaxBends()}`;
    } else {
      bendCounterEl.style.display = "none";
    }
  }
}

// src/ui/roomSelector.ts
var onSelectCallback = null;
function initRoomSelector(onSelect) {
  onSelectCallback = onSelect;
  const listEl = document.getElementById("room-selector-list");
  if (!listEl) return;
  while (listEl.firstChild) {
    listEl.removeChild(listEl.firstChild);
  }
  ROOMS.forEach((room, index) => {
    const btn = document.createElement("button");
    btn.className = "room-selector-btn";
    const nameSpan = document.createElement("span");
    nameSpan.className = "room-name";
    nameSpan.textContent = `${index + 1}. ${room.name}`;
    btn.appendChild(nameSpan);
    const descSpan = document.createElement("span");
    descSpan.className = "room-desc";
    descSpan.textContent = room.commentary;
    btn.appendChild(descSpan);
    const handleClick = () => {
      if (onSelectCallback) onSelectCallback(index);
    };
    btn.addEventListener("click", handleClick);
    btn.addEventListener("touchend", (e) => {
      e.preventDefault();
      handleClick();
    });
    listEl.appendChild(btn);
  });
}

// src/ui/screens.ts
var startScreen;
var startBtn;
var gameOverScreen;
var restartBtn;
var gameOverStats;
function initScreens(onRestart, onStart, onStartAtRoom) {
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
  if (onStartAtRoom) {
    initRoomSelector((roomIndex) => {
      hideStartScreen();
      onStartAtRoom(roomIndex);
    });
  }
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
  // Vertical combat
  jumpVolume: 0.25,
  landVolume: 0.3,
  launchVolume: 0.4,
  aerialStrikeVolume: 0.45,
  slamVolume: 0.5,
  dunkGrabVolume: 0.35,
  dunkImpactVolume: 0.55,
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
function playJump() {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const duration = 0.1;
  const noise = ctx2.createBufferSource();
  noise.buffer = createNoiseBuffer(duration);
  const filter = ctx2.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(600, now);
  filter.frequency.exponentialRampToValueAtTime(2500, now + duration);
  filter.Q.value = 2;
  const gain = ctx2.createGain();
  gain.gain.setValueAtTime(AUDIO_CONFIG.jumpVolume, now);
  gain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}
function playLand(fallSpeed) {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const intensity = Math.min(fallSpeed / 15, 1.5);
  const duration = 0.08 + intensity * 0.04;
  const osc = ctx2.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(60 + intensity * 30, now);
  osc.frequency.exponentialRampToValueAtTime(25, now + duration);
  const gain = ctx2.createGain();
  gain.gain.setValueAtTime(AUDIO_CONFIG.landVolume * intensity, now);
  gain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
}
function playLaunch() {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const duration = 0.15;
  const osc = ctx2.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + duration * 0.7);
  const gain = ctx2.createGain();
  gain.gain.setValueAtTime(AUDIO_CONFIG.launchVolume * 0.3, now);
  gain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
  const noise = ctx2.createBufferSource();
  noise.buffer = createNoiseBuffer(duration * 0.5);
  const filter = ctx2.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 2e3;
  const nGain = ctx2.createGain();
  nGain.gain.setValueAtTime(AUDIO_CONFIG.launchVolume * 0.4, now);
  nGain.gain.exponentialRampToValueAtTime(1e-3, now + duration * 0.5);
  noise.connect(filter);
  filter.connect(nGain);
  nGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}
function playAerialStrike() {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const duration = 0.1;
  const osc = ctx2.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(500, now);
  osc.frequency.exponentialRampToValueAtTime(100, now + duration);
  const gain = ctx2.createGain();
  gain.gain.setValueAtTime(AUDIO_CONFIG.aerialStrikeVolume * 0.4, now);
  gain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
  const noise = ctx2.createBufferSource();
  noise.buffer = createNoiseBuffer(duration * 0.6);
  const filter = ctx2.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 4e3;
  filter.Q.value = 4;
  const nGain = ctx2.createGain();
  nGain.gain.setValueAtTime(AUDIO_CONFIG.aerialStrikeVolume * 0.5, now);
  nGain.gain.exponentialRampToValueAtTime(1e-3, now + duration * 0.6);
  noise.connect(filter);
  filter.connect(nGain);
  nGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}
function playSlam(fallSpeed) {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const intensity = Math.min(fallSpeed / 20, 1.5);
  const duration = 0.2 + intensity * 0.05;
  const osc = ctx2.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(50 + intensity * 20, now);
  osc.frequency.exponentialRampToValueAtTime(20, now + duration);
  const gain = ctx2.createGain();
  gain.gain.setValueAtTime(AUDIO_CONFIG.slamVolume * (0.4 + intensity * 0.3), now);
  gain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
  const noise = ctx2.createBufferSource();
  noise.buffer = createNoiseBuffer(duration * 0.7);
  const filter = ctx2.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1500;
  filter.Q.value = 2;
  const nGain = ctx2.createGain();
  nGain.gain.setValueAtTime(AUDIO_CONFIG.slamVolume * 0.4, now);
  nGain.gain.exponentialRampToValueAtTime(1e-3, now + duration * 0.7);
  noise.connect(filter);
  filter.connect(nGain);
  nGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}
function playDunkGrab() {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const duration = 0.1;
  const osc = ctx2.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = 1200;
  const gain = ctx2.createGain();
  gain.gain.setValueAtTime(AUDIO_CONFIG.dunkGrabVolume * 0.4, now);
  gain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
}
function playDunkImpact() {
  if (!ctx2 || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx2.currentTime;
  const duration = 0.25;
  const osc = ctx2.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(40, now);
  osc.frequency.exponentialRampToValueAtTime(15, now + duration);
  const gain = ctx2.createGain();
  gain.gain.setValueAtTime(AUDIO_CONFIG.dunkImpactVolume * 0.6, now);
  gain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
  const noise = ctx2.createBufferSource();
  noise.buffer = createNoiseBuffer(duration * 0.6);
  const filter = ctx2.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2e3;
  filter.Q.value = 3;
  const nGain = ctx2.createGain();
  nGain.gain.setValueAtTime(AUDIO_CONFIG.dunkImpactVolume * 0.5, now);
  nGain.gain.exponentialRampToValueAtTime(1e-3, now + duration * 0.6);
  noise.connect(filter);
  filter.connect(nGain);
  nGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
  const sub = ctx2.createOscillator();
  sub.type = "sine";
  sub.frequency.value = 25;
  const subGain = ctx2.createGain();
  subGain.gain.setValueAtTime(AUDIO_CONFIG.dunkImpactVolume * 0.3, now);
  subGain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
  sub.connect(subGain);
  subGain.connect(masterGain);
  sub.start(now);
  sub.stop(now + duration);
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
  on("playerJump", () => playJump());
  on("playerLand", (e) => {
    if (e.type === "playerLand") playLand(e.fallSpeed);
  });
  on("enemyLaunched", () => playLaunch());
  on("aerialStrike", () => playAerialStrike());
  on("playerSlam", (e) => {
    if (e.type === "playerSlam") playSlam(e.fallSpeed);
  });
  on("dunkGrab", () => playDunkGrab());
  on("dunkImpact", () => playDunkImpact());
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
  pressurePlates: [],
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
  if (gameState.phase === "intro") {
    getRendererInstance().render(getScene(), getCamera());
    return;
  }
  if (gameState.phase === "gameOver") {
    getRendererInstance().render(getScene(), getCamera());
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
  if (consumeCancel()) {
    cancelActiveVerb();
    setUltimateHeld(false);
  }
  autoAimClosestEnemy(gameState.enemies);
  const input = getInputState();
  if (getActiveProfile() === "rule-bending") {
    if (input.bendMode) toggleBendMode();
  } else {
    if (input.bulletTime) toggleBulletTime();
  }
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
  input._gameState = gameState;
  updateAerialVerbs(gameDt, getPlayerPos(), input);
  updateCarriers(dt, gameState);
  updateLaunchPillars(dt);
  updateProjectiles(gameDt);
  updateRoomManager(gameDt, gameState);
  updateEnemies(gameDt, getPlayerPos(), gameState);
  checkCollisions(gameState);
  applyVelocities(gameDt, gameState);
  resolveEnemyCollisions(gameState);
  applyObjectVelocities(gameDt, gameState);
  resolveObjectCollisions(gameState);
  resolvePhysicsObjectBodyCollisions(gameState);
  updatePressurePlates(gameState);
  updateTetherVisuals(gameState);
  checkPitFalls(gameState);
  updateEffectGhosts(gameDt);
  updateParticles(gameDt);
  updateAoeTelegraphs(gameDt);
  updatePendingEffects(gameDt);
  updateMortarProjectiles(gameDt);
  updateIcePatches(gameDt);
  if (gameState.playerHealth < 1) {
    gameState.playerHealth = 1;
    gameState.phase = "playing";
  }
  updateCamera(getPlayerPos(), dt);
  updateGroundShadows(gameState);
  updateHUD(gameState);
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
  resetAerialVerbs();
  clearCarriers();
  clearLaunchPillars();
  clearLaunchIndicator();
  clearAllTags();
  resetRoomManager();
  resetBulletTime();
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
    setOnBendSelected((_bendId) => {
      enterTargeting();
    });
    initBendMode();
    initVisionCones(scene2, raycastTerrainDist);
    initAerialVerbs([floatSelectorVerb, dunkVerb, spikeVerb]);
    initLaunchPillars(scene2);
    initLaunchIndicator(scene2);
    initGroundShadows();
    on("meleeHit", () => {
      hitPauseTimer = MELEE.hitPause;
    });
    on("dunkGrab", () => {
      hitPauseTimer = DUNK.grabPause;
    });
    initHUD();
    initDamageNumbers();
    initScreens(restart, () => {
      resumeAudio();
      document.getElementById("hud").style.visibility = "visible";
      loadRoom(0, gameState);
      lastTime = performance.now();
    }, (roomIndex) => {
      resumeAudio();
      document.getElementById("hud").style.visibility = "visible";
      loadRoom(roomIndex, gameState);
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
