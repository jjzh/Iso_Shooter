export const ABILITIES = {
  dash: {
    name: 'Shadow Dash',
    key: 'Space',
    cooldown: 3000,

    // Core feel parameters
    duration: 200,
    distance: 5,
    curve: 'easeOut',

    // Invincibility
    invincible: true,
    iFrameStart: 0,
    iFrameEnd: 200,

    // Direction
    directionSource: 'movement',

    // Visual feedback
    afterimageCount: 3,
    afterimageFadeDuration: 300,
    ghostColor: 0x44ffaa,
    trailColor: 0x44ff88,
    screenShakeOnStart: 1.5,

    // Recovery
    canShootDuring: false,
    canAbilityCancel: false,
    endLag: 50,

    description: 'Dash forward, briefly invincible'
  },
  ultimate: {
    name: 'Force Push',
    key: 'E',
    cooldown: 0,
    // Charge
    chargeTimeMs: 1500,       // time to reach max charge
    // Rectangle
    minLength: 3,              // rect length at 0% charge
    maxLength: 12,             // rect length at 100% charge
    width: 3,                  // rect width (constant)
    // Knockback
    minKnockback: 1.5,         // push distance at 0% charge
    maxKnockback: 5,           // push distance at 100% charge
    // Visual
    color: 0x44ffaa,
    telegraphOpacity: 0.3,
    // Movement
    chargeMoveSpeedMult: 0.4,  // 40% movement speed while charging
    description: 'Charge a directional push — hold to extend range'
  }
};
