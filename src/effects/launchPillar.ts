// Launch Pillar — rock column that erupts from the ground at the launch point.
// Follows aoeTelegraph.ts pattern: create mesh, track in array, animate per-frame, dispose.

import { LAUNCH } from '../config/player';

let sceneRef: any;

// Active pillars being animated
const activePillars: any[] = [];

// Shared geometry (lazy-init, 6-sided cylinder for rocky look)
let pillarGeo: any;

// --- Init ---

export function initLaunchPillars(scene: any) {
  sceneRef = scene;
}

// --- Spawn ---

export function spawnLaunchPillar(x: number, z: number) {
  if (!sceneRef) return;

  if (!pillarGeo) {
    pillarGeo = new THREE.CylinderGeometry(
      LAUNCH.pillarRadius * 0.7, // top radius (tapered)
      LAUNCH.pillarRadius,       // bottom radius
      LAUNCH.pillarHeight,
      6                          // 6 sides — hexagonal for rocky look
    );
  }

  // Per-pillar material instance (independent opacity for fading)
  const mat = new THREE.MeshStandardMaterial({
    color: LAUNCH.pillarColor,
    flatShading: true,
    transparent: true,
    opacity: 1.0,
  });

  const mesh = new THREE.Mesh(pillarGeo, mat);
  // Start below ground — pivot is at cylinder center, so offset by half height
  mesh.position.set(x, -LAUNCH.pillarHeight, z);
  // Random Y rotation for visual variety
  mesh.rotation.y = Math.random() * Math.PI * 2;
  sceneRef.add(mesh);

  activePillars.push({
    mesh,
    material: mat,
    elapsed: 0,
  });
}

// --- Update ---

function easeOutQuad(t: number) {
  return t * (2 - t);
}

function easeInQuad(t: number) {
  return t * t;
}

export function updateLaunchPillars(dt: number) {
  const dtMs = dt * 1000;

  for (let i = activePillars.length - 1; i >= 0; i--) {
    const p = activePillars[i];
    p.elapsed += dtMs;

    const { pillarRiseTime, pillarHoldTime, pillarDuration, pillarHeight } = LAUNCH;
    const sinkStart = pillarRiseTime + pillarHoldTime;
    const sinkDuration = pillarDuration - sinkStart;

    if (p.elapsed < pillarRiseTime) {
      // Rise phase — ease-out emergence
      const t = easeOutQuad(p.elapsed / pillarRiseTime);
      // From fully buried (-pillarHeight) to ground-level position (half height above ground)
      p.mesh.position.y = -pillarHeight + t * (pillarHeight * 0.5 + pillarHeight);
    } else if (p.elapsed < sinkStart) {
      // Hold phase — at peak
      p.mesh.position.y = pillarHeight * 0.5;
    } else if (p.elapsed < pillarDuration) {
      // Sink phase — ease-in descent + opacity fade
      const sinkT = easeInQuad((p.elapsed - sinkStart) / sinkDuration);
      p.mesh.position.y = pillarHeight * 0.5 - sinkT * (pillarHeight * 0.5 + pillarHeight);
      p.material.opacity = 1 - sinkT;
    } else {
      // Done — remove
      p.material.dispose();
      sceneRef.remove(p.mesh);
      activePillars.splice(i, 1);
    }
  }
}

// --- Cleanup ---

export function clearLaunchPillars() {
  for (const p of activePillars) {
    p.material.dispose();
    sceneRef.remove(p.mesh);
  }
  activePillars.length = 0;
}
