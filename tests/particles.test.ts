// Unit tests for particle system presets and config validation
// Tests the pure data/config layer — no THREE.js or scene required
import { describe, it, expect } from 'vitest';
import {
  HIT_SPARK,
  DEATH_PUFF,
  DASH_TRAIL,
  SHIELD_BREAK_BURST,
  PUSH_BURST,
  CHARGE_BLAST,
} from '../src/engine/particles';
import type { ParticleConfig } from '../src/engine/particles';

const ALL_PRESETS: [string, ParticleConfig][] = [
  ['HIT_SPARK', HIT_SPARK],
  ['DEATH_PUFF', DEATH_PUFF],
  ['DASH_TRAIL', DASH_TRAIL],
  ['SHIELD_BREAK_BURST', SHIELD_BREAK_BURST],
  ['PUSH_BURST', PUSH_BURST],
  ['CHARGE_BLAST', CHARGE_BLAST],
];

describe('Particle Presets', () => {
  it.each(ALL_PRESETS)('%s has a positive particle count', (name, preset) => {
    expect(preset.count).toBeGreaterThan(0);
    expect(Number.isInteger(preset.count)).toBe(true);
  });

  it.each(ALL_PRESETS)('%s has a positive lifetime', (name, preset) => {
    expect(preset.lifetime).toBeGreaterThan(0);
  });

  it.each(ALL_PRESETS)('%s has a positive speed', (name, preset) => {
    expect(preset.speed).toBeGreaterThan(0);
  });

  it.each(ALL_PRESETS)('%s has a valid spread (0 to PI)', (name, preset) => {
    expect(preset.spread).toBeGreaterThanOrEqual(0);
    expect(preset.spread).toBeLessThanOrEqual(Math.PI * 1.1); // slight tolerance
  });

  it.each(ALL_PRESETS)('%s has a positive size', (name, preset) => {
    expect(preset.size).toBeGreaterThan(0);
  });

  it.each(ALL_PRESETS)('%s has a valid hex color', (name, preset) => {
    expect(preset.color).toBeGreaterThanOrEqual(0);
    expect(preset.color).toBeLessThanOrEqual(0xffffff);
  });

  it.each(ALL_PRESETS)('%s has a non-negative gravity', (name, preset) => {
    expect(preset.gravity).toBeGreaterThanOrEqual(0);
  });

  it.each(ALL_PRESETS)('%s has a valid shape', (name, preset) => {
    expect(['box', 'sphere']).toContain(preset.shape);
  });

  it.each(ALL_PRESETS)('%s has fadeOut as a boolean', (name, preset) => {
    expect(typeof preset.fadeOut).toBe('boolean');
  });
});

describe('Particle Preset Relationships', () => {
  it('HIT_SPARK is fast and short-lived (combat responsiveness)', () => {
    expect(HIT_SPARK.lifetime).toBeLessThanOrEqual(0.5);
    expect(HIT_SPARK.speed).toBeGreaterThanOrEqual(4);
  });

  it('DEATH_PUFF has more particles than HIT_SPARK (bigger visual event)', () => {
    expect(DEATH_PUFF.count).toBeGreaterThan(HIT_SPARK.count);
  });

  it('DASH_TRAIL has no/low gravity (floaty trail effect)', () => {
    expect(DASH_TRAIL.gravity).toBeLessThanOrEqual(1);
  });

  it('CHARGE_BLAST has the most particles (biggest burst)', () => {
    for (const [name, preset] of ALL_PRESETS) {
      if (name !== 'CHARGE_BLAST') {
        expect(CHARGE_BLAST.count).toBeGreaterThanOrEqual(preset.count);
      }
    }
  });
});
