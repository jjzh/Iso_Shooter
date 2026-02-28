import { AbilitiesConfig } from '../types/index';

export const ABILITIES: AbilitiesConfig = {
  dash: {
    name: 'Shadow Dash',
    key: 'Shift',
    cooldown: 3000,
    duration: 200,
    distance: 5,
    curve: 'easeOut',
    invincible: true,
    iFrameStart: 0,
    iFrameEnd: 200,
    directionSource: 'movement',
    afterimageCount: 3,
    afterimageFadeDuration: 300,
    ghostColor: 0x44ffaa,
    trailColor: 0x44ff88,
    screenShakeOnStart: 1.5,
    canShootDuring: false,
    canAbilityCancel: false,
    endLag: 50,
    description: 'Dash forward, briefly invincible'
  },
  ultimate: {
    name: 'Force Push',
    key: 'E',
    cooldown: 500,
    chargeTimeMs: 1500,
    minLength: 3,
    maxLength: 12,
    width: 3,
    minKnockback: 4,
    maxKnockback: 12,
    color: 0x44ffaa,
    telegraphOpacity: 0.3,
    chargeMoveSpeedMult: 0.4,
    description: 'Charge a directional push — hold to extend range'
  }
};
