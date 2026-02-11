import { ObjectPool } from '../engine/pools';
import { PLAYER } from '../config/player';

let playerPool: any, enemyPool: any;
let sceneRef: any;
let basePlayerProjSize: number; // original geometry radius for scale calculation

export function initProjectilePool(scene: any) {
  sceneRef = scene;

  basePlayerProjSize = PLAYER.projectile.size;
  const playerProjGeo = new THREE.SphereGeometry(basePlayerProjSize, 6, 4);
  const playerProjMat = new THREE.MeshStandardMaterial({
    color: PLAYER.projectile.color,
    emissive: PLAYER.projectile.color,
    emissiveIntensity: 0.8
  });

  playerPool = new ObjectPool(() => {
    const mesh = new THREE.Mesh(playerProjGeo, playerProjMat.clone());
    scene.add(mesh);
    return { mesh, dir: new THREE.Vector3(), speed: 0, damage: 0, life: 0, isEnemy: false };
  }, 80);

  const enemyProjGeo = new THREE.SphereGeometry(0.1, 6, 4);

  enemyPool = new ObjectPool(() => {
    const mesh = new THREE.Mesh(
      enemyProjGeo,
      new THREE.MeshStandardMaterial({
        color: 0xff4466,
        emissive: 0xff2244,
        emissiveIntensity: 0.8
      })
    );
    scene.add(mesh);
    return { mesh, dir: new THREE.Vector3(), speed: 0, damage: 0, life: 0, isEnemy: true };
  }, 40);
}

export function fireProjectile(origin: any, direction: any, config: any, isEnemy?: boolean) {
  if (isEnemy === undefined) isEnemy = false;
  const pool = isEnemy ? enemyPool : playerPool;
  const p = pool.acquire();
  p.mesh.position.set(origin.x, 0.8, origin.z);
  p.dir.copy(direction).normalize();
  p.speed = config.speed;
  p.damage = config.damage;
  p.life = 0;

  // Scale player projectile mesh based on current config size vs base geometry
  if (!isEnemy && basePlayerProjSize) {
    const s = PLAYER.projectile.size / basePlayerProjSize;
    p.mesh.scale.set(s, s, s);
  }

  // Update enemy projectile color per-type
  if (isEnemy && config.color) {
    p.mesh.material.color.setHex(config.color);
    p.mesh.material.emissive.setHex(config.color);
  }

  return p;
}

export function updateProjectiles(dt: number) {
  const maxLife = 2.0;
  for (const pool of [playerPool, enemyPool]) {
    const active = pool.getActive();
    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      p.mesh.position.x += p.dir.x * p.speed * dt;
      p.mesh.position.z += p.dir.z * p.speed * dt;
      p.life += dt;
      if (p.life > maxLife) {
        pool.release(p);
      }
    }
  }
}

export function getPlayerProjectiles() { return playerPool ? playerPool.getActive() : []; }
export function getEnemyProjectiles() { return enemyPool ? enemyPool.getActive() : []; }

export function releaseProjectile(p: any) {
  if (p.isEnemy) {
    enemyPool.release(p);
  } else {
    playerPool.release(p);
  }
}

export function releaseAllProjectiles() {
  if (playerPool) playerPool.releaseAll();
  if (enemyPool) enemyPool.releaseAll();
}
