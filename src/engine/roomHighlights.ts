// Room Highlights — brief pulse on key arena features when entering a room
// Spawns glowing outlines + vertical corner pillars + gradient wall planes
// Reusable: pits (Foundation), obstacles/rocks (rule-bending), platforms (vertical)

import { getScene } from './renderer';
import { PITS, OBSTACLES } from '../config/arena';
import { HEIGHT_ZONES } from '../config/terrain';
import type { RoomHighlight } from '../config/rooms';

const DEFAULT_DELAY = 800;
const DEFAULT_DURATION = 2000;
const PILLAR_HEIGHT = 1.25;
const PILLAR_THICKNESS = 0.04;

// Active state (cleared on new room load)
let activeTimers: number[] = [];
let activeRafs: number[] = [];
let activeMeshes: any[] = [];

export function clearHighlights() {
  for (const id of activeTimers) clearTimeout(id);
  activeTimers = [];
  for (const id of activeRafs) cancelAnimationFrame(id);
  activeRafs = [];
  const scene = getScene();
  for (const obj of activeMeshes) {
    scene.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  }
  activeMeshes = [];
}

export function triggerRoomHighlights(highlights: RoomHighlight[]) {
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

interface HighlightRect {
  x: number;
  z: number;
  w: number;
  d: number;
  color: number;
  y?: number;  // base elevation (default 0)
}

// Default colors per target type
const TARGET_COLORS: Record<string, number> = {
  pits: 0xff4466,
  obstacles: 0x6688ff,
  platforms: 0x4488ff,
};

function getRectsForTarget(target: string, colorOverride?: number): HighlightRect[] {
  const color = colorOverride ?? TARGET_COLORS[target] ?? 0xffffff;
  switch (target) {
    case 'pits':
      return PITS.map(p => ({ x: p.x, z: p.z, w: p.w, d: p.d, color }));
    case 'obstacles':
      return OBSTACLES.map(o => ({ x: o.x, z: o.z, w: o.w, d: o.d, color }));
    case 'platforms':
      return HEIGHT_ZONES.map(hz => ({ x: hz.x, z: hz.z, w: hz.w, d: hz.d, color, y: hz.y }));
    default:
      return [];
  }
}

function spawnHighlight(rect: HighlightRect, duration: number) {
  const scene = getScene();
  const allParts: any[] = [];
  const baseY = rect.y ?? 0;

  // --- Base outline (flat on ground / platform surface) ---
  const margin = 0.3;
  const planeGeo = new THREE.PlaneGeometry(rect.w + margin, rect.d + margin);
  const edgesGeo = new THREE.EdgesGeometry(planeGeo);
  planeGeo.dispose();

  const baseMat = new THREE.LineBasicMaterial({
    color: rect.color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const baseRing = new THREE.LineSegments(edgesGeo, baseMat);
  baseRing.rotation.x = -Math.PI / 2;
  baseRing.position.set(rect.x, baseY + 0.06, rect.z);
  scene.add(baseRing);
  allParts.push(baseRing);

  // --- Vertical corner pillars ---
  const hw = rect.w / 2;
  const hd = rect.d / 2;
  const corners = [
    { x: rect.x - hw, z: rect.z - hd },
    { x: rect.x + hw, z: rect.z - hd },
    { x: rect.x + hw, z: rect.z + hd },
    { x: rect.x - hw, z: rect.z + hd },
  ];

  const pillarGeo = new THREE.BoxGeometry(PILLAR_THICKNESS, PILLAR_HEIGHT, PILLAR_THICKNESS);
  const pillars: any[] = [];

  for (const corner of corners) {
    const pillarMat = new THREE.MeshBasicMaterial({
      color: rect.color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(corner.x, baseY + PILLAR_HEIGHT / 2, corner.z);
    scene.add(pillar);
    allParts.push(pillar);
    pillars.push(pillar);
  }

  // --- Gradient glow wall planes between pillars ---
  // 4 walls: connect adjacent corners (0→1, 1→2, 2→3, 3→0)
  const wallPlanes: any[] = [];

  for (let i = 0; i < 4; i++) {
    const c0 = corners[i];
    const c1 = corners[(i + 1) % 4];

    // Wall width = distance between corners
    const dx = c1.x - c0.x;
    const dz = c1.z - c0.z;
    const wallWidth = Math.sqrt(dx * dx + dz * dz);

    // PlaneGeometry: width × height, with 1×8 segments for vertical gradient
    const wallGeo = new THREE.PlaneGeometry(wallWidth, PILLAR_HEIGHT, 1, 8);

    // Apply vertical alpha gradient: full opacity at bottom, fading to 0 at top
    const posAttr = wallGeo.getAttribute('position');
    const colors = new Float32Array(posAttr.count * 4);
    const r = ((rect.color >> 16) & 0xff) / 255;
    const g = ((rect.color >> 8) & 0xff) / 255;
    const b = (rect.color & 0xff) / 255;

    for (let v = 0; v < posAttr.count; v++) {
      const y = posAttr.getY(v);
      // y ranges from -PILLAR_HEIGHT/2 (bottom) to +PILLAR_HEIGHT/2 (top)
      const normalizedY = (y + PILLAR_HEIGHT / 2) / PILLAR_HEIGHT; // 0 at bottom, 1 at top
      const vertAlpha = 1 - normalizedY * normalizedY; // quadratic falloff toward top
      colors[v * 4] = r;
      colors[v * 4 + 1] = g;
      colors[v * 4 + 2] = b;
      colors[v * 4 + 3] = vertAlpha;
    }
    wallGeo.setAttribute('color', new THREE.BufferAttribute(colors, 4));

    const wallMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const wallMesh = new THREE.Mesh(wallGeo, wallMat);

    // Position at midpoint between corners, at half pillar height
    wallMesh.position.set(
      (c0.x + c1.x) / 2,
      baseY + PILLAR_HEIGHT / 2,
      (c0.z + c1.z) / 2,
    );

    // Rotate so plane width (X-axis) aligns with wall direction (dx, dz)
    // PlaneGeometry width is along X; rotation.y maps X → (cosθ, 0, -sinθ)
    // We need cosθ = dx/len, -sinθ = dz/len → θ = atan2(-dz, dx)
    wallMesh.rotation.y = Math.atan2(-dz, dx);

    scene.add(wallMesh);
    allParts.push(wallMesh);
    wallPlanes.push(wallMesh);
  }

  // Track for cleanup
  activeMeshes.push(...allParts);

  // --- Animate ---
  const startTime = performance.now();

  function animate() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / duration, 1);

    // Alpha envelope: ramp up 0-10%, hold 10-45%, fade out 45-100%
    let alpha: number;
    if (t < 0.1) {
      alpha = t / 0.1;
    } else if (t < 0.45) {
      alpha = 1;
    } else {
      alpha = 1 - ((t - 0.45) / 0.55);
    }
    alpha = Math.max(0, alpha);

    // Base outline
    baseMat.opacity = alpha * 0.9;

    // Pillars + walls: rise up from ground, then sink back down
    // Height envelope: grow 0-15%, full 15-50%, shrink 50-100%
    let heightT: number;
    if (t < 0.15) {
      heightT = t / 0.15;
    } else if (t < 0.5) {
      heightT = 1;
    } else {
      heightT = 1 - ((t - 0.5) / 0.5);
    }
    heightT = Math.max(0, heightT);
    // Ease out for smooth feel
    const easedHeight = 1 - (1 - heightT) * (1 - heightT);

    for (const pillar of pillars) {
      pillar.material.opacity = alpha * 0.7;
      pillar.scale.y = Math.max(0.01, easedHeight);
      pillar.position.y = baseY + (PILLAR_HEIGHT * easedHeight) / 2;
    }

    // Wall planes scale + fade with pillars
    for (const wall of wallPlanes) {
      wall.material.opacity = alpha * 0.35;
      wall.scale.y = Math.max(0.01, easedHeight);
      wall.position.y = baseY + (PILLAR_HEIGHT * easedHeight) / 2;
    }

    if (t < 1) {
      const rafId = requestAnimationFrame(animate);
      activeRafs.push(rafId);
    } else {
      // Cleanup
      for (const part of allParts) {
        scene.remove(part);
        if (part.geometry) part.geometry.dispose();
        if (part.material) part.material.dispose();
      }
      edgesGeo.dispose();
      pillarGeo.dispose();
      for (const part of allParts) {
        const idx = activeMeshes.indexOf(part);
        if (idx >= 0) activeMeshes.splice(idx, 1);
      }
    }
  }

  const rafId = requestAnimationFrame(animate);
  activeRafs.push(rafId);
}
