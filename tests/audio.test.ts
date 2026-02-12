// Unit tests for audio config and exported state
// Tests the config layer only — Web Audio API calls require a browser
import { describe, it, expect } from 'vitest';
import { AUDIO_CONFIG } from '../src/engine/audio';

describe('Audio Config', () => {
  it('has all expected volume keys', () => {
    const expectedKeys = [
      'masterVolume',
      'hitVolume',
      'deathVolume',
      'dashVolume',
      'shieldBreakVolume',
      'chargeVolume',
      'waveClearVolume',
      'playerHitVolume',
      'enabled',
    ];
    for (const key of expectedKeys) {
      expect(AUDIO_CONFIG).toHaveProperty(key);
    }
  });

  it('all volume values are between 0 and 1', () => {
    const volumeKeys = [
      'masterVolume',
      'hitVolume',
      'deathVolume',
      'dashVolume',
      'shieldBreakVolume',
      'chargeVolume',
      'waveClearVolume',
      'playerHitVolume',
    ] as const;

    for (const key of volumeKeys) {
      const val = AUDIO_CONFIG[key];
      expect(val, `${key} should be >= 0`).toBeGreaterThanOrEqual(0);
      expect(val, `${key} should be <= 1`).toBeLessThanOrEqual(1);
    }
  });

  it('enabled defaults to true', () => {
    expect(AUDIO_CONFIG.enabled).toBe(true);
  });

  it('config object is mutable (required for tuning panel)', () => {
    const original = AUDIO_CONFIG.masterVolume;
    AUDIO_CONFIG.masterVolume = 0.99;
    expect(AUDIO_CONFIG.masterVolume).toBe(0.99);
    // Restore
    AUDIO_CONFIG.masterVolume = original;
  });
});
