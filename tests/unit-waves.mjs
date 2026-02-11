/**
 * Unit Test: Wave configuration
 *
 * Tests the static config data — no browser, no game running.
 * Run with: node tests/unit-waves.js
 */

import { WAVES } from '../config/waves.js';

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

// ─── Tests ───

console.log('📋 Wave Configuration Tests\n');

test('Wave 1 exists', () => {
  const wave1 = WAVES.find(w => w.wave === 1);
  if (!wave1) throw new Error('Wave 1 not found');
});

test('Wave 1 has 6 goblins', () => {
  const wave1 = WAVES.find(w => w.wave === 1);
  const allSpawns = wave1.groups.flatMap(g => g.spawns);
  const goblins = allSpawns.filter(s => s.type === 'goblin');
  assertEquals(goblins.length, 6, 'goblin count');
});

test('Wave 1 has 2 mortarImps', () => {
  const wave1 = WAVES.find(w => w.wave === 1);
  const allSpawns = wave1.groups.flatMap(g => g.spawns);
  const mortarImps = allSpawns.filter(s => s.type === 'mortarImp');
  assertEquals(mortarImps.length, 2, 'mortarImp count');
});

test('Wave 1 has 8 total enemies', () => {
  const wave1 = WAVES.find(w => w.wave === 1);
  const allSpawns = wave1.groups.flatMap(g => g.spawns);
  assertEquals(allSpawns.length, 8, 'total enemy count');
});

// ─── Summary ───

console.log('\n═══════════════════════════════════════');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════\n');

if (failed > 0) process.exit(1);
