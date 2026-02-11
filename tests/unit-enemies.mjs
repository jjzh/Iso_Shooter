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

// Color tests
test('mortarImp is orange (0xFF8033)', () => {
  const color = ENEMY_TYPES.mortarImp.color;
  assertEquals(color, 16746547, `mortarImp color is ${toHex(color)}`);
});

test('crystalGolem is light blue (0x44DDFF)', () => {
  const color = ENEMY_TYPES.crystalGolem.color;
  assertEquals(color, 4513279, `crystalGolem color is ${toHex(color)}`);
});

// Basic stat tests (examples)
test('goblin has 30 health', () => {
  assertEquals(ENEMY_TYPES.goblin.health, 30);
});

test('crystalGolem has high knockback resist', () => {
  if (ENEMY_TYPES.crystalGolem.knockbackResist < 0.5) {
    throw new Error(`Expected >= 0.5, got ${ENEMY_TYPES.crystalGolem.knockbackResist}`);
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

// ─── Summary ───

console.log('\n═══════════════════════════════════════');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════\n');

if (failed > 0) process.exit(1);
