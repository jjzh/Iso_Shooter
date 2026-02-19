import { describe, it, expect } from 'vitest';
import { PHYSICS } from '../src/config/physics';

// ─── Wave Occlusion Logic Tests ───
// These test the pure math of the push wave occlusion algorithm:
// Project enemies into push-local space (forward + lateral), sort by forward,
// then check if nearer enemies block farther ones based on lateral proximity.

// Helper: simulate the wave occlusion logic from physics.ts
// Returns which enemies (by index) would be pushed vs blocked
function simulateWaveOcclusion(
  enemies: { x: number; z: number }[],
  pushDirX: number,
  pushDirZ: number,
  playerX: number,
  playerZ: number,
  blockRadius: number
): { pushed: number[]; blocked: number[] } {
  const perpX = -pushDirZ;
  const perpZ = pushDirX;

  // Compute push-local coords
  const candidates = enemies.map((e, i) => {
    const dx = e.x - playerX;
    const dz = e.z - playerZ;
    const forward = dx * pushDirX + dz * pushDirZ;
    const lateral = dx * perpX + dz * perpZ;
    return { index: i, forward, lateral };
  });

  // Sort nearest first
  candidates.sort((a, b) => a.forward - b.forward);

  const pushed: number[] = [];
  const blocked: number[] = [];
  const pushedLaterals: number[] = [];

  for (const { index, lateral } of candidates) {
    let isBlocked = false;
    for (const pl of pushedLaterals) {
      if (Math.abs(lateral - pl) < blockRadius) {
        isBlocked = true;
        break;
      }
    }
    if (isBlocked) {
      blocked.push(index);
    } else {
      pushed.push(index);
      pushedLaterals.push(lateral);
    }
  }

  return { pushed, blocked };
}

describe('push wave occlusion config', () => {
  it('has non-negative pushWaveBlockRadius', () => {
    expect(PHYSICS.pushWaveBlockRadius).toBeGreaterThanOrEqual(0);
  });

  it('default block radius is reasonable (0.5–1.5)', () => {
    expect(PHYSICS.pushWaveBlockRadius).toBeGreaterThanOrEqual(0.5);
    expect(PHYSICS.pushWaveBlockRadius).toBeLessThanOrEqual(1.5);
  });
});

describe('push wave occlusion — two enemies in a line', () => {
  // Push direction: +Z (0, 1), player at origin
  const dirX = 0, dirZ = 1;
  const playerX = 0, playerZ = 0;

  it('front enemy gets pushed, back enemy is blocked', () => {
    const enemies = [
      { x: 0, z: 2 },  // A: front
      { x: 0, z: 5 },  // B: behind A
    ];
    const { pushed, blocked } = simulateWaveOcclusion(enemies, dirX, dirZ, playerX, playerZ, 0.8);
    expect(pushed).toEqual([0]);  // Only A pushed
    expect(blocked).toEqual([1]); // B blocked
  });

  it('order in input array does not matter (B first, A second)', () => {
    const enemies = [
      { x: 0, z: 5 },  // B: behind (listed first)
      { x: 0, z: 2 },  // A: front (listed second)
    ];
    const { pushed, blocked } = simulateWaveOcclusion(enemies, dirX, dirZ, playerX, playerZ, 0.8);
    expect(pushed).toEqual([1]);  // A (index 1) pushed
    expect(blocked).toEqual([0]); // B (index 0) blocked
  });

  it('slightly offset laterally still blocks within radius', () => {
    const enemies = [
      { x: 0.3, z: 2 },  // A: slightly offset
      { x: 0.1, z: 5 },  // B: behind, lateral diff = 0.2 < 0.8
    ];
    const { pushed, blocked } = simulateWaveOcclusion(enemies, dirX, dirZ, playerX, playerZ, 0.8);
    expect(pushed).toEqual([0]);
    expect(blocked).toEqual([1]);
  });
});

describe('push wave occlusion — side by side', () => {
  const dirX = 0, dirZ = 1;
  const playerX = 0, playerZ = 0;

  it('enemies spread laterally are both pushed', () => {
    const enemies = [
      { x: -1.0, z: 3 },  // A: left side
      { x: 1.0, z: 3.2 }, // B: right side, lateral diff = 2.0 > 0.8
    ];
    const { pushed, blocked } = simulateWaveOcclusion(enemies, dirX, dirZ, playerX, playerZ, 0.8);
    expect(pushed).toContain(0);
    expect(pushed).toContain(1);
    expect(blocked).toHaveLength(0);
  });

  it('enemies barely outside block radius are both pushed', () => {
    const enemies = [
      { x: -0.41, z: 3 },  // A: lateral = -0.41
      { x: 0.41, z: 3.5 }, // B: lateral = 0.41, diff = 0.82 > 0.8
    ];
    const { pushed, blocked } = simulateWaveOcclusion(enemies, dirX, dirZ, playerX, playerZ, 0.8);
    expect(pushed).toHaveLength(2);
    expect(blocked).toHaveLength(0);
  });

  it('enemies barely inside block radius — back one is blocked', () => {
    const enemies = [
      { x: -0.39, z: 3 },  // A: lateral = -0.39
      { x: 0.39, z: 5 },   // B: lateral = 0.39, diff = 0.78 < 0.8
    ];
    const { pushed, blocked } = simulateWaveOcclusion(enemies, dirX, dirZ, playerX, playerZ, 0.8);
    expect(pushed).toHaveLength(1);
    expect(blocked).toHaveLength(1);
    // The nearer one (A at z=3) should be pushed
    expect(pushed).toEqual([0]);
  });
});

describe('push wave occlusion — triangle formation', () => {
  const dirX = 0, dirZ = 1;
  const playerX = 0, playerZ = 0;

  it('front-center blocks one behind, but not the one far to the side', () => {
    const enemies = [
      { x: 0, z: 2 },     // A: front center
      { x: -0.5, z: 5 },  // B: behind, lateral diff = 0.5 < 0.8 → blocked
      { x: 1.2, z: 5 },   // C: behind, lateral diff = 1.2 > 0.8 → NOT blocked
    ];
    const { pushed, blocked } = simulateWaveOcclusion(enemies, dirX, dirZ, playerX, playerZ, 0.8);
    expect(pushed).toContain(0);  // A pushed
    expect(pushed).toContain(2);  // C pushed
    expect(blocked).toEqual([1]); // B blocked by A
  });
});

describe('push wave occlusion — single enemy', () => {
  it('always gets pushed', () => {
    const enemies = [{ x: 1, z: 4 }];
    const { pushed, blocked } = simulateWaveOcclusion(enemies, 0, 1, 0, 0, 0.8);
    expect(pushed).toEqual([0]);
    expect(blocked).toHaveLength(0);
  });
});

describe('push wave occlusion — block radius edge cases', () => {
  const dirX = 0, dirZ = 1;
  const playerX = 0, playerZ = 0;

  it('block radius 0 means nothing is blocked (old behavior)', () => {
    const enemies = [
      { x: 0, z: 2 },
      { x: 0, z: 5 },
      { x: 0, z: 8 },
    ];
    const { pushed, blocked } = simulateWaveOcclusion(enemies, dirX, dirZ, playerX, playerZ, 0);
    expect(pushed).toHaveLength(3);
    expect(blocked).toHaveLength(0);
  });

  it('very large block radius blocks everything behind the nearest', () => {
    const enemies = [
      { x: 0, z: 2 },
      { x: 2, z: 5 },   // far lateral but radius is huge
      { x: -3, z: 8 },  // very far lateral but radius is huge
    ];
    const { pushed, blocked } = simulateWaveOcclusion(enemies, dirX, dirZ, playerX, playerZ, 10);
    expect(pushed).toEqual([0]);
    expect(blocked).toHaveLength(2);
  });
});

describe('push wave occlusion — diagonal push direction', () => {
  // Push at 45 degrees: dir = (sin(45°), cos(45°)) = (0.707, 0.707)
  const angle = Math.PI / 4;
  const dirX = Math.sin(angle);
  const dirZ = Math.cos(angle);
  const playerX = 0, playerZ = 0;

  it('works correctly with diagonal push', () => {
    // Two enemies along the diagonal (both at forward distance, one behind the other)
    const dist1 = 3;
    const dist2 = 6;
    const enemies = [
      { x: dirX * dist1, z: dirZ * dist1 },           // A: near, on push axis
      { x: dirX * dist2 + 0.1, z: dirZ * dist2 },     // B: far, slightly offset laterally
    ];
    const { pushed, blocked } = simulateWaveOcclusion(enemies, dirX, dirZ, playerX, playerZ, 0.8);
    expect(pushed).toEqual([0]);  // A pushed
    expect(blocked).toEqual([1]); // B blocked (small lateral offset)
  });
});

describe('push wave occlusion — chain blocking', () => {
  const dirX = 0, dirZ = 1;
  const playerX = 0, playerZ = 0;

  it('two side-by-side in front block two behind them respectively', () => {
    const enemies = [
      { x: -0.8, z: 2 },  // A: front-left
      { x: 0.8, z: 2.1 }, // B: front-right
      { x: -0.7, z: 6 },  // C: behind A (lateral diff 0.1 < 0.8) → blocked by A
      { x: 0.9, z: 6 },   // D: behind B (lateral diff 0.1 < 0.8) → blocked by B
    ];
    const { pushed, blocked } = simulateWaveOcclusion(enemies, dirX, dirZ, playerX, playerZ, 0.8);
    expect(pushed).toContain(0);  // A pushed
    expect(pushed).toContain(1);  // B pushed
    expect(blocked).toContain(2); // C blocked by A
    expect(blocked).toContain(3); // D blocked by B
  });

  it('unblocked enemy in the back still gets pushed', () => {
    const enemies = [
      { x: 0, z: 2 },     // A: front center → pushed
      { x: 0, z: 5 },     // B: behind A → blocked
      { x: 1.5, z: 8 },   // C: far back, far right → NOT blocked (lateral diff = 1.5 > 0.8)
    ];
    const { pushed, blocked } = simulateWaveOcclusion(enemies, dirX, dirZ, playerX, playerZ, 0.8);
    expect(pushed).toContain(0);
    expect(pushed).toContain(2); // C is unblocked
    expect(blocked).toEqual([1]);
  });
});
