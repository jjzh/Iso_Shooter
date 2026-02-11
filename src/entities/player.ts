import { PLAYER } from '../config/player';
import { ABILITIES } from '../config/abilities';
import { screenShake, getScene } from '../engine/renderer';
import { fireProjectile } from './projectile';
import { getAbilityDirOverride, clearAbilityDirOverride } from '../engine/input';
import { getIceEffects } from './mortarProjectile';

let playerGroup: any, body: any, head: any, aimIndicator: any;
const playerPos = new THREE.Vector3(0, 0, 0);
let bobPhase = 0;
let lastFireTime = 0;

// Dash state
let isDashing = false;
let dashTimer = 0;
let dashDuration = 0;
let dashDistance = 0;
const dashDir = new THREE.Vector3();
const dashStartPos = new THREE.Vector3();
let isInvincible = false;
let endLagTimer = 0;

// Afterimages
const afterimages: any[] = [];

// Push event (consumed by physics each frame)
let pushEvent: any = null;

// Charge state
let isCharging = false;
let chargeTimer = 0;
let chargeAimAngle = 0;
let chargeTelegraphGroup: any = null;
let chargeFillMesh: any = null;
let chargeBorderMesh: any = null;
let chargeBorderGeo: any = null;

// Reusable vector for auto-fire direction
const _fireDir = new THREE.Vector3();

// Shared geometry for player afterimages
let _playerGhostBodyGeo: any = null;
let _playerGhostHeadGeo: any = null;

// Original emissive colors
const BODY_EMISSIVE = 0x22aa66;
const HEAD_EMISSIVE = 0x33bb88;

export function createPlayer(scene: any) {
  playerGroup = new THREE.Group();

  body = new THREE.Mesh(
    new THREE.CylinderGeometry(PLAYER.size.radius, PLAYER.size.radius + 0.05, PLAYER.size.height * 0.6, 8),
    new THREE.MeshStandardMaterial({
      color: 0x44cc88,
      emissive: BODY_EMISSIVE,
      emissiveIntensity: 0.4
    })
  );
  body.position.y = 0.7;
  playerGroup.add(body);

  head = new THREE.Mesh(
    new THREE.SphereGeometry(PLAYER.size.radius * 0.85, 8, 6),
    new THREE.MeshStandardMaterial({
      color: 0x55ddaa,
      emissive: HEAD_EMISSIVE,
      emissiveIntensity: 0.5
    })
  );
  head.position.y = 1.45;
  playerGroup.add(head);

  aimIndicator = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.6, 4),
    new THREE.MeshStandardMaterial({
      color: 0x44ff88,
      emissive: 0x44ff88,
      emissiveIntensity: 0.8
    })
  );
  aimIndicator.rotation.x = -Math.PI / 2;
  aimIndicator.position.set(0, 0.8, -0.7);
  playerGroup.add(aimIndicator);

  scene.add(playerGroup);
  return playerGroup;
}

export function updatePlayer(inputState: any, dt: number, gameState: any) {
  const now = performance.now();

  // Tick ability cooldowns
  for (const key of Object.keys(gameState.abilities)) {
    if (gameState.abilities[key].cooldownRemaining > 0) {
      gameState.abilities[key].cooldownRemaining -= dt * 1000;
    }
  }

  // Tick charge system
  if (isCharging) {
    updateCharge(inputState, dt, gameState);
  }

  // End lag (post-dash lockout)
  if (endLagTimer > 0) {
    endLagTimer -= dt * 1000;
    // During end lag, don't process movement or abilities
    playerGroup.position.copy(playerPos);
    updateAfterimages(dt);
    return;
  }

  // === DASH ===
  if (isDashing) {
    updateDash(dt, gameState);
    playerGroup.position.copy(playerPos);

    // Aim still tracks cursor during dash
    aimAtCursor(inputState);

    updateAfterimages(dt);
    return;
  }

  // Trigger dash
  if (inputState.dash && gameState.abilities.dash.cooldownRemaining <= 0) {
    startDash(inputState, gameState);
  }

  // Trigger charge (start)
  if (inputState.ultimate && gameState.abilities.ultimate.cooldownRemaining <= 0 && !isCharging) {
    startCharge(inputState, gameState);
  }

  // === MOVEMENT ===
  if (Math.abs(inputState.moveX) > 0.01 || Math.abs(inputState.moveZ) > 0.01) {
    const chargeSlow = isCharging ? ABILITIES.ultimate.chargeMoveSpeedMult : 1;
    // Check for ice patch effects (doubled speed on ice)
    const iceEffects = getIceEffects(playerPos.x, playerPos.z, true);
    const speedMod = chargeSlow * iceEffects.speedMult;
    playerPos.x += inputState.moveX * PLAYER.speed * speedMod * dt;
    playerPos.z += inputState.moveZ * PLAYER.speed * speedMod * dt;

    // Bob animation
    bobPhase += dt * 12;
    body.position.y = 0.7 + Math.sin(bobPhase) * 0.05;
    head.position.y = 1.45 + Math.sin(bobPhase) * 0.07;
  }

  // Arena clamp
  playerPos.x = Math.max(-19.5, Math.min(19.5, playerPos.x));
  playerPos.z = Math.max(-19.5, Math.min(19.5, playerPos.z));

  playerGroup.position.copy(playerPos);

  // === AIM ===
  aimAtCursor(inputState);

  // === AUTO-FIRE ===
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

function aimAtCursor(inputState: any) {
  const dx = inputState.aimWorldPos.x - playerPos.x;
  const dz = inputState.aimWorldPos.z - playerPos.z;
  if (dx * dx + dz * dz > 0.01) {
    playerGroup.rotation.y = Math.atan2(-dx, -dz);
  }
}

// === DASH SYSTEM ===
function startDash(inputState: any, gameState: any) {
  const cfg = ABILITIES.dash;
  isDashing = true;
  dashTimer = 0;
  dashDuration = cfg.duration;
  dashDistance = cfg.distance;
  dashStartPos.copy(playerPos);

  // Direction source — drag-to-aim override takes priority (mobile buttons)
  const override = getAbilityDirOverride();
  const hasMovement = Math.abs(inputState.moveX) > 0.01 || Math.abs(inputState.moveZ) > 0.01;

  if (override) {
    dashDir.set(override.x, 0, override.z).normalize();
    clearAbilityDirOverride();
  } else if (cfg.directionSource === 'movement' && hasMovement) {
    dashDir.set(inputState.moveX, 0, inputState.moveZ).normalize();
  } else if (cfg.directionSource === 'aim') {
    dashDir.set(
      inputState.aimWorldPos.x - playerPos.x, 0,
      inputState.aimWorldPos.z - playerPos.z
    ).normalize();
  } else {
    // 'movementOrAim' or fallback
    if (hasMovement) {
      dashDir.set(inputState.moveX, 0, inputState.moveZ).normalize();
    } else {
      dashDir.set(
        inputState.aimWorldPos.x - playerPos.x, 0,
        inputState.aimWorldPos.z - playerPos.z
      ).normalize();
    }
  }

  gameState.abilities.dash.cooldownRemaining = cfg.cooldown;

  if (cfg.screenShakeOnStart > 0) {
    screenShake(cfg.screenShakeOnStart, 80);
  }
}

function updateDash(dt: number, gameState: any) {
  const cfg = ABILITIES.dash;
  dashTimer += dt * 1000;
  const t = Math.min(dashTimer / dashDuration, 1.0);

  // Easing
  let easedT: number;
  switch (cfg.curve) {
    case 'easeOut':   easedT = 1 - (1 - t) * (1 - t); break;
    case 'easeIn':    easedT = t * t; break;
    case 'easeInOut': easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; break;
    default:          easedT = t;
  }

  // Position along dash path
  playerPos.copy(dashStartPos);
  playerPos.x += dashDir.x * dashDistance * easedT;
  playerPos.z += dashDir.z * dashDistance * easedT;

  // Arena clamp during dash
  playerPos.x = Math.max(-19.5, Math.min(19.5, playerPos.x));
  playerPos.z = Math.max(-19.5, Math.min(19.5, playerPos.z));

  // I-frame window
  isInvincible = cfg.invincible && (dashTimer >= cfg.iFrameStart && dashTimer <= cfg.iFrameEnd);

  // Spawn afterimages at intervals
  if (cfg.afterimageCount > 0) {
    const interval = dashDuration / (cfg.afterimageCount + 1);
    const prevCount = Math.floor((dashTimer - dt * 1000) / interval);
    const currCount = Math.floor(dashTimer / interval);
    if (currCount > prevCount) {
      spawnAfterimage(cfg);
    }
  }

  // End dash
  if (t >= 1.0) {
    isDashing = false;
    isInvincible = false;
    endLagTimer = cfg.endLag;
  }
}

function spawnAfterimage(cfg: any) {
  const scene = getScene();
  const ghost = new THREE.Group();

  // Simplified ghost — body and head silhouettes (shared geometry)
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
  scene.add(ghost);

  afterimages.push({ mesh: ghost, life: 0, maxLife: cfg.afterimageFadeDuration });
}

function updateAfterimages(dt: number) {
  const scene = getScene();
  for (let i = afterimages.length - 1; i >= 0; i--) {
    const ai = afterimages[i];
    ai.life += dt * 1000;
    const fade = Math.max(0, 1 - ai.life / ai.maxLife);

    ai.mesh.children.forEach((child: any) => {
      if (child.material) child.material.opacity = fade * 0.5;
    });

    if (ai.life >= ai.maxLife) {
      scene.remove(ai.mesh);
      afterimages.splice(i, 1);
    }
  }
}

// === CHARGE PUSH SYSTEM ===
function startCharge(inputState: any, gameState: any) {
  const cfg = ABILITIES.ultimate;
  isCharging = true;
  chargeTimer = 0;
  gameState.abilities.ultimate.charging = true;
  gameState.abilities.ultimate.chargeT = 0;

  // Calculate initial aim angle toward cursor
  // atan2(dx, dz) so that sin(angle)=dx/len, cos(angle)=dz/len -> local +Z extends toward cursor
  const dx = inputState.aimWorldPos.x - playerPos.x;
  const dz = inputState.aimWorldPos.z - playerPos.z;
  chargeAimAngle = Math.atan2(dx, dz);

  // Create telegraph visual
  createChargeTelegraph(cfg);

  // Visual feedback — player glows while charging
  body.material.emissive.setHex(0x44ffaa);
  head.material.emissive.setHex(0x66ffcc);
  body.material.emissiveIntensity = 0.6;
  head.material.emissiveIntensity = 0.7;
}

function createChargeTelegraph(cfg: any) {
  const scene = getScene();

  chargeTelegraphGroup = new THREE.Group();
  chargeTelegraphGroup.position.set(playerPos.x, 0.05, playerPos.z);
  chargeTelegraphGroup.rotation.y = chargeAimAngle;

  // Fill plane (unit plane, scaled each frame)
  const fillGeo = new THREE.PlaneGeometry(1, 1);
  fillGeo.rotateX(-Math.PI / 2);
  const fillMat = new THREE.MeshBasicMaterial({
    color: cfg.color,
    transparent: true,
    opacity: cfg.telegraphOpacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  chargeFillMesh = new THREE.Mesh(fillGeo, fillMat);
  // Position fill to start from player (offset by half minLength)
  const halfLen = cfg.minLength / 2;
  chargeFillMesh.scale.set(cfg.width, 1, cfg.minLength);
  chargeFillMesh.position.set(0, 0, halfLen);
  chargeTelegraphGroup.add(chargeFillMesh);

  // Border — edges of a unit-sized plane, scaled each frame
  const basePlane = new THREE.PlaneGeometry(1, 1);
  const borderGeo = new THREE.EdgesGeometry(basePlane);
  borderGeo.rotateX(-Math.PI / 2);
  const borderMat = new THREE.LineBasicMaterial({
    color: cfg.color,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  chargeBorderMesh = new THREE.LineSegments(borderGeo, borderMat);
  chargeBorderGeo = borderGeo;
  chargeBorderMesh.scale.set(cfg.width, 1, cfg.minLength);
  chargeBorderMesh.position.set(0, 0, halfLen);
  chargeTelegraphGroup.add(chargeBorderMesh);

  scene.add(chargeTelegraphGroup);
}

function updateCharge(inputState: any, dt: number, gameState: any) {
  const cfg = ABILITIES.ultimate;
  chargeTimer += dt * 1000;
  const chargeT = Math.min(chargeTimer / cfg.chargeTimeMs, 1);
  gameState.abilities.ultimate.chargeT = chargeT;

  // Update aim angle from cursor
  const dx = inputState.aimWorldPos.x - playerPos.x;
  const dz = inputState.aimWorldPos.z - playerPos.z;
  if (dx * dx + dz * dz > 0.01) {
    chargeAimAngle = Math.atan2(dx, dz);
  }

  // Calculate current rect length
  const currentLength = cfg.minLength + (cfg.maxLength - cfg.minLength) * chargeT;

  // Update telegraph position and rotation
  if (chargeTelegraphGroup) {
    chargeTelegraphGroup.position.set(playerPos.x, 0.05, playerPos.z);
    chargeTelegraphGroup.rotation.y = chargeAimAngle;

    // Offset fill and border so the rect starts at the player and extends forward
    const halfLen = currentLength / 2;

    // Scale fill (unit plane scaled to desired size)
    chargeFillMesh.scale.set(cfg.width, 1, currentLength);
    chargeFillMesh.position.set(0, 0, halfLen);

    // Scale border (unit-sized EdgesGeometry, scale to desired size)
    chargeBorderMesh.scale.set(cfg.width, 1, currentLength);
    chargeBorderMesh.position.set(0, 0, halfLen);

    // Pulse border opacity
    const pulse = 0.6 + 0.3 * Math.sin(performance.now() * 0.008);
    chargeBorderMesh.material.opacity = pulse;

    // Fill gets brighter as charge increases
    chargeFillMesh.material.opacity = cfg.telegraphOpacity + chargeT * 0.2;
  }

  // Player glow intensifies with charge
  body.material.emissiveIntensity = 0.6 + chargeT * 0.4;
  head.material.emissiveIntensity = 0.7 + chargeT * 0.3;

  // Auto-fire at max charge OR release key (100ms grace period prevents instant-fire)
  if (chargeT >= 1 || (chargeTimer > 100 && !inputState.ultimateHeld)) {
    fireChargePush(chargeT, gameState);
  }
}

function fireChargePush(chargeT: number, gameState: any) {
  const cfg = ABILITIES.ultimate;
  const currentLength = cfg.minLength + (cfg.maxLength - cfg.minLength) * chargeT;
  const force = cfg.minKnockback + (cfg.maxKnockback - cfg.minKnockback) * chargeT;

  // Rectangle center = player position + half length toward cursor
  // chargeAimAngle = atan2(dx, dz), so sin(angle) = dx/len, cos(angle) = dz/len -> toward cursor
  const halfLen = currentLength / 2;
  const dirX = Math.sin(chargeAimAngle);
  const dirZ = Math.cos(chargeAimAngle);
  const centerX = playerPos.x + dirX * halfLen;
  const centerZ = playerPos.z + dirZ * halfLen;

  // Emit push event for physics
  pushEvent = {
    x: centerX,
    z: centerZ,
    width: cfg.width,
    length: currentLength,
    rotation: chargeAimAngle,
    force: force,
    dirX: dirX,
    dirZ: dirZ,
  };

  // Clean up telegraph
  removeChargeTelegraph();

  // Reset charge state
  isCharging = false;
  gameState.abilities.ultimate.charging = false;
  gameState.abilities.ultimate.chargeT = 0;
  gameState.abilities.ultimate.cooldownRemaining = cfg.cooldown;

  // Restore player visuals
  body.material.emissive.setHex(BODY_EMISSIVE);
  head.material.emissive.setHex(HEAD_EMISSIVE);
  body.material.emissiveIntensity = 0.4;
  head.material.emissiveIntensity = 0.5;

  // Screen shake scales with charge
  screenShake(2 + chargeT * 3, 120);
}

function removeChargeTelegraph() {
  if (chargeTelegraphGroup) {
    const scene = getScene();
    // Dispose materials and geometries
    if (chargeFillMesh) {
      chargeFillMesh.material.dispose();
      chargeFillMesh.geometry.dispose();
    }
    if (chargeBorderMesh) {
      chargeBorderMesh.material.dispose();
      if (chargeBorderGeo) chargeBorderGeo.dispose();
    }
    scene.remove(chargeTelegraphGroup);
    chargeTelegraphGroup = null;
    chargeFillMesh = null;
    chargeBorderMesh = null;
    chargeBorderGeo = null;
  }
}

// === PUBLIC API ===
export function getPlayerPos() { return playerPos; }
export function getPlayerGroup() { return playerGroup; }
export function isPlayerInvincible() { return isInvincible; }
export function isPlayerDashing() { return isDashing; }
export function consumePushEvent() {
  const evt = pushEvent;
  pushEvent = null;
  return evt;
}

export function resetPlayer() {
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

  // Clean up afterimages
  const scene = getScene();
  for (const ai of afterimages) {
    scene.remove(ai.mesh);
  }
  afterimages.length = 0;
}
