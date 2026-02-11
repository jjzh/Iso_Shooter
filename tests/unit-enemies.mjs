/**
 * Unit Test: Enemy configuration
 *
 * Tests enemy stats and visual properties — no browser, no game running.
 * Run with: node tests/unit-enemies.js
 */

import { ENEMY_TYPES } from '../config/enemies.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${name}`);
    console.log(`   ${e.message}`);
    failed++;
  }
}

function assertEquals(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}. ${msg}`);
  }
}

function toHex(decimal) {
  return '0x' + decimal.toString(16).toUpperCase().padStart(6, '0');
}

// ─── Tests ───

console.log('📋 Enemy Configuration Tests\n');

// Color tests (swapped: ice is blue, stone is orange)
test('iceMortarImp is light blue (0x44DDFF)', () => {
  const color = ENEMY_TYPES.iceMortarImp.color;
  assertEquals(color, 4513279, `iceMortarImp color is ${toHex(color)}`);
});

test('stoneGolem is orange (0xFF8033)', () => {
  const color = ENEMY_TYPES.stoneGolem.color;
  assertEquals(color, 16746547, `stoneGolem color is ${toHex(color)}`);
});

// Name tests
test('iceMortarImp has correct display name', () => {
  assertEquals(ENEMY_TYPES.iceMortarImp.name, 'Ice Mortar Imp');
});

test('stoneGolem has correct display name', () => {
  assertEquals(ENEMY_TYPES.stoneGolem.name, 'Stone Golem');
});

// Basic stat tests (examples)
test('goblin has 30 health', () => {
  assertEquals(ENEMY_TYPES.goblin.health, 30);
});

test('stoneGolem has high knockback resist', () => {
  if (ENEMY_TYPES.stoneGolem.knockbackResist < 0.5) {
    throw new Error(`Expected >= 0.5, got ${ENEMY_TYPES.stoneGolem.knockbackResist}`);
  }
});

test('all enemy types have required fields', () => {
  const required = ['name', 'health', 'speed', 'damage', 'color', 'behavior'];
  for (const [type, config] of Object.entries(ENEMY_TYPES)) {
    for (const field of required) {
      if (config[field] === undefined) {
        throw new Error(`${type} missing required field: ${field}`);
      }
    }
  }
});

// ─── Ice Patch Tests ───

test('iceMortarImp mortar has ice patch enabled', () => {
  const icePatch = ENEMY_TYPES.iceMortarImp.mortar.icePatch;
  if (!icePatch || !icePatch.enabled) {
    throw new Error('Ice patch not enabled');
  }
});

test('ice patch duration is 2 seconds', () => {
  const duration = ENEMY_TYPES.iceMortarImp.mortar.icePatch.duration;
  assertEquals(duration, 2000, 'ice patch duration');
});

test('ice patch doubles movement speed (speedMult = 2.0)', () => {
  const speedMult = ENEMY_TYPES.iceMortarImp.mortar.icePatch.speedMult;
  assertEquals(speedMult, 2.0, 'ice patch speed multiplier');
});

test('ice patch doubles knockback (knockbackMult = 2.0)', () => {
  const knockbackMult = ENEMY_TYPES.iceMortarImp.mortar.icePatch.knockbackMult;
  assertEquals(knockbackMult, 2.0, 'ice patch knockback multiplier');
});

test('ice patch affects both player and enemies', () => {
  const icePatch = ENEMY_TYPES.iceMortarImp.mortar.icePatch;
  if (!icePatch.affectsPlayer) {
    throw new Error('Ice patch should affect player');
  }
  if (!icePatch.affectsEnemies) {
    throw new Error('Ice patch should affect enemies');
  }
});

// ─── Summary ───

console.log('\n═══════════════════════════════════════');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════\n');

if (failed > 0) process.exit(1);
