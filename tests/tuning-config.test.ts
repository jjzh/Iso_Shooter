// Validates that every slider in the tuning panel points to a real config key
// This catches typos, stale keys, or missing exports that would silently break at runtime.
// Imports the actual config objects — no mocking needed.

import { describe, it, expect } from 'vitest';
import { PLAYER } from '../src/config/player';
import { ABILITIES } from '../src/config/abilities';
import { C as ANIM } from '../src/entities/playerAnimator';
import { AUDIO_CONFIG } from '../src/engine/audio';
import { PHYSICS } from '../src/config/physics';

// ─── Mirrored slider definitions from tuning.ts ───
// We duplicate the key/config pairs here so the test validates the contract
// between the tuning panel and the config objects. If a key is renamed in config
// but not in tuning.ts (or vice versa), this test catches it.

interface SliderCheck {
  section: string;
  label: string;
  config: Record<string, any>;
  key: string;
  min: number;
  max: number;
}

const SLIDER_CHECKS: SliderCheck[] = [
  // Projectiles
  { section: 'Projectiles', label: 'Fire Rate',  config: PLAYER,             key: 'fireRate',   min: 50,  max: 1000 },
  { section: 'Projectiles', label: 'Speed',      config: PLAYER.projectile,  key: 'speed',      min: 4,   max: 40 },
  { section: 'Projectiles', label: 'Size',       config: PLAYER.projectile,  key: 'size',       min: 0.04, max: 0.5 },

  // Player
  { section: 'Player', label: 'Move Speed', config: PLAYER, key: 'speed', min: 2, max: 16 },

  // Dash
  { section: 'Dash', label: 'Cooldown',     config: ABILITIES.dash, key: 'cooldown',             min: 500,  max: 10000 },
  { section: 'Dash', label: 'Duration',     config: ABILITIES.dash, key: 'duration',             min: 50,   max: 500 },
  { section: 'Dash', label: 'Distance',     config: ABILITIES.dash, key: 'distance',             min: 1,    max: 15 },
  { section: 'Dash', label: 'End Lag',      config: ABILITIES.dash, key: 'endLag',               min: 0,    max: 300 },
  { section: 'Dash', label: 'Afterimages',  config: ABILITIES.dash, key: 'afterimageCount',      min: 0,    max: 8 },
  { section: 'Dash', label: 'Ghost Fade',   config: ABILITIES.dash, key: 'afterimageFadeDuration', min: 50, max: 1000 },
  { section: 'Dash', label: 'Shake',        config: ABILITIES.dash, key: 'screenShakeOnStart',   min: 0,    max: 8 },

  // Force Push
  { section: 'Force Push', label: 'Cooldown',      config: ABILITIES.ultimate, key: 'cooldown',          min: 100, max: 15000 },
  { section: 'Force Push', label: 'Charge Time',   config: ABILITIES.ultimate, key: 'chargeTimeMs',      min: 200,  max: 5000 },
  { section: 'Force Push', label: 'Min Length',     config: ABILITIES.ultimate, key: 'minLength',         min: 1,    max: 8 },
  { section: 'Force Push', label: 'Max Length',     config: ABILITIES.ultimate, key: 'maxLength',         min: 4,    max: 25 },
  { section: 'Force Push', label: 'Width',          config: ABILITIES.ultimate, key: 'width',             min: 1,    max: 10 },
  { section: 'Force Push', label: 'Min Knockback',  config: ABILITIES.ultimate, key: 'minKnockback',     min: 0.5,  max: 5 },
  { section: 'Force Push', label: 'Max Knockback',  config: ABILITIES.ultimate, key: 'maxKnockback',     min: 2,    max: 15 },
  { section: 'Force Push', label: 'Move Mult',      config: ABILITIES.ultimate, key: 'chargeMoveSpeedMult', min: 0, max: 1 },

  // Animation — Run
  { section: 'Animation — Run', label: 'Cycle Rate',  config: ANIM, key: 'runCycleRate',      min: 0.1, max: 1.0 },
  { section: 'Animation — Run', label: 'Stride Angle',config: ANIM, key: 'strideAngle',      min: 0.1, max: 1.5 },
  { section: 'Animation — Run', label: 'Knee Bend',   config: ANIM, key: 'kneeBendMax',      min: 0.1, max: 1.5 },
  { section: 'Animation — Run', label: 'Arm Swing',   config: ANIM, key: 'armSwingRatio',    min: 0.0, max: 1.5 },
  { section: 'Animation — Run', label: 'Body Bounce', config: ANIM, key: 'bodyBounceHeight', min: 0.0, max: 0.1 },
  { section: 'Animation — Run', label: 'Lean',        config: ANIM, key: 'forwardLean',      min: 0.0, max: 0.3 },
  { section: 'Animation — Run', label: 'Lean Speed',  config: ANIM, key: 'forwardLeanSpeed', min: 1,   max: 20 },
  { section: 'Animation — Run', label: 'Hip Turn',    config: ANIM, key: 'hipTurnSpeed',     min: 2,   max: 30 },

  // Animation — Idle
  { section: 'Animation — Idle', label: 'Breath Rate',  config: ANIM, key: 'breathRate',       min: 0.5, max: 5 },
  { section: 'Animation — Idle', label: 'Breath Amp',   config: ANIM, key: 'breathAmplitude',  min: 0.0, max: 0.06 },
  { section: 'Animation — Idle', label: 'Weight Shift', config: ANIM, key: 'weightShiftRate',  min: 0.1, max: 2 },
  { section: 'Animation — Idle', label: 'Shift Angle',  config: ANIM, key: 'weightShiftAngle', min: 0.0, max: 0.15 },
  { section: 'Animation — Idle', label: 'Head Drift',   config: ANIM, key: 'headDriftRate',    min: 0.1, max: 2 },
  { section: 'Animation — Idle', label: 'Head Angle',   config: ANIM, key: 'headDriftAngle',   min: 0.0, max: 0.1 },
  { section: 'Animation — Idle', label: 'Arm Droop',    config: ANIM, key: 'idleArmDroop',     min: 0.0, max: 0.5 },

  // Animation — Dash
  { section: 'Animation — Dash', label: 'Squash Y',   config: ANIM, key: 'squashScaleY',    min: 0.5, max: 1.0 },
  { section: 'Animation — Dash', label: 'Squash XZ',  config: ANIM, key: 'squashScaleXZ',   min: 1.0, max: 1.5 },
  { section: 'Animation — Dash', label: 'Stretch Y',  config: ANIM, key: 'stretchScaleY',   min: 1.0, max: 1.5 },
  { section: 'Animation — Dash', label: 'Stretch XZ', config: ANIM, key: 'stretchScaleXZ',  min: 0.5, max: 1.0 },
  { section: 'Animation — Dash', label: 'Lean Angle', config: ANIM, key: 'dashLeanAngle',   min: 0.0, max: 0.8 },
  { section: 'Animation — Dash', label: 'Arm Sweep',  config: ANIM, key: 'dashArmSweep',    min: -1.5, max: 0 },
  { section: 'Animation — Dash', label: 'Leg Lunge',  config: ANIM, key: 'dashLegLunge',    min: 0.0, max: 1.5 },
  { section: 'Animation — Dash', label: 'Leg Trail',  config: ANIM, key: 'dashLegTrail',    min: -1.5, max: 0 },

  // Animation — Blends
  { section: 'Animation — Blends', label: 'Idle to Run',   config: ANIM, key: 'idleToRunBlend',      min: 20, max: 300 },
  { section: 'Animation — Blends', label: 'Run to Idle',   config: ANIM, key: 'runToIdleBlend',      min: 20, max: 300 },
  { section: 'Animation — Blends', label: 'End Lag Blend', config: ANIM, key: 'endLagToNormalBlend', min: 20, max: 300 },

  // Physics
  { section: 'Physics', label: 'Friction',       config: PHYSICS, key: 'friction',         min: 2,  max: 30 },
  { section: 'Physics', label: 'Push Instant %', config: PHYSICS, key: 'pushInstantRatio', min: 0,  max: 1 },
  { section: 'Physics', label: 'Wave Block Rad', config: PHYSICS, key: 'pushWaveBlockRadius', min: 0,  max: 2 },
  { section: 'Physics', label: 'Slam Min Speed', config: PHYSICS, key: 'wallSlamMinSpeed', min: 0,  max: 10 },
  { section: 'Physics', label: 'Slam Damage',    config: PHYSICS, key: 'wallSlamDamage',   min: 1,  max: 20 },
  { section: 'Physics', label: 'Slam Stun',      config: PHYSICS, key: 'wallSlamStun',     min: 0,  max: 1000 },
  { section: 'Physics', label: 'Slam Bounce',    config: PHYSICS, key: 'wallSlamBounce',   min: 0,  max: 1 },
  { section: 'Physics', label: 'Slam Shake',     config: PHYSICS, key: 'wallSlamShake',    min: 0,  max: 8 },
  { section: 'Physics', label: 'Enemy Bounce',   config: PHYSICS, key: 'enemyBounce',      min: 0,  max: 1 },
  { section: 'Physics', label: 'Impact Min Spd', config: PHYSICS, key: 'impactMinSpeed',   min: 0,  max: 10 },
  { section: 'Physics', label: 'Impact Damage',  config: PHYSICS, key: 'impactDamage',     min: 1,  max: 20 },
  { section: 'Physics', label: 'Impact Stun',    config: PHYSICS, key: 'impactStun',       min: 0,  max: 1000 },

  // Audio
  { section: 'Audio', label: 'Master Vol',  config: AUDIO_CONFIG, key: 'masterVolume',      min: 0, max: 1 },
  { section: 'Audio', label: 'Hit Vol',     config: AUDIO_CONFIG, key: 'hitVolume',          min: 0, max: 1 },
  { section: 'Audio', label: 'Death Vol',   config: AUDIO_CONFIG, key: 'deathVolume',        min: 0, max: 1 },
  { section: 'Audio', label: 'Dash Vol',    config: AUDIO_CONFIG, key: 'dashVolume',         min: 0, max: 1 },
  { section: 'Audio', label: 'Shield Vol',  config: AUDIO_CONFIG, key: 'shieldBreakVolume',  min: 0, max: 1 },
  { section: 'Audio', label: 'Charge Vol',  config: AUDIO_CONFIG, key: 'chargeVolume',       min: 0, max: 1 },
  { section: 'Audio', label: 'Wave Clear',  config: AUDIO_CONFIG, key: 'waveClearVolume',    min: 0, max: 1 },
  { section: 'Audio', label: 'Player Hit',  config: AUDIO_CONFIG, key: 'playerHitVolume',    min: 0, max: 1 },
];

describe('Tuning Panel — Config Key Validation', () => {
  it.each(SLIDER_CHECKS)(
    '$section / $label: key "$key" exists on config object',
    ({ config, key }) => {
      expect(config).toHaveProperty(key);
    }
  );

  it.each(SLIDER_CHECKS)(
    '$section / $label: current value is a number',
    ({ config, key }) => {
      expect(typeof config[key]).toBe('number');
    }
  );

  it.each(SLIDER_CHECKS)(
    '$section / $label: default value is within slider [min, max] range',
    ({ config, key, min, max }) => {
      const val = config[key];
      expect(val, `${key}=${val} should be >= ${min}`).toBeGreaterThanOrEqual(min);
      expect(val, `${key}=${val} should be <= ${max}`).toBeLessThanOrEqual(max);
    }
  );

  it.each(SLIDER_CHECKS)(
    '$section / $label: min < max',
    ({ min, max }) => {
      expect(min).toBeLessThan(max);
    }
  );
});

describe('Tuning Panel — Config Mutability', () => {
  it('ANIM config is mutable (tuning panel writes to it)', () => {
    const original = ANIM.runCycleRate;
    ANIM.runCycleRate = 0.999;
    expect(ANIM.runCycleRate).toBe(0.999);
    ANIM.runCycleRate = original;
  });

  it('ABILITIES.dash is mutable', () => {
    const original = ABILITIES.dash.cooldown;
    ABILITIES.dash.cooldown = 9999;
    expect(ABILITIES.dash.cooldown).toBe(9999);
    ABILITIES.dash.cooldown = original;
  });

  it('ABILITIES.ultimate is mutable', () => {
    const original = ABILITIES.ultimate.cooldown;
    ABILITIES.ultimate.cooldown = 8888;
    expect(ABILITIES.ultimate.cooldown).toBe(8888);
    ABILITIES.ultimate.cooldown = original;
  });
});
