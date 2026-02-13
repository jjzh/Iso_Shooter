// Live tuning panel — designer can adjust values without touching code
// Mutates config objects directly; game reads them each frame so changes are instant
// Sections are collapsible so you can focus on what you're tuning

import { PLAYER, MELEE } from '../config/player';
import { ENEMY_TYPES, MOB_GLOBAL } from '../config/enemies';
import { ABILITIES } from '../config/abilities';
import { PHYSICS } from '../config/physics';
import { C as ANIM } from '../entities/playerAnimator';
import { AUDIO_CONFIG, setMasterVolume } from '../engine/audio';
import { buildShareUrl } from '../engine/urlParams';

// ─── Slider Section Definitions ───
// Each section has a title and items. Sections are collapsible.
// config() returns the object to mutate; key is the property name.

interface SliderItem {
  label: string;
  config: () => any;
  key: string;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  unit?: string;
  tip?: string;
  custom?: string;
  invert?: boolean;
}

interface SliderSection {
  section: string;         // collapsible header title
  collapsed?: boolean;     // start collapsed? (default false)
  items: SliderItem[];
}

const SECTIONS: SliderSection[] = [
  // ── Combat ──
  {
    section: 'Projectiles',
    items: [
      { label: 'Fire Rate',  config: () => PLAYER,            key: 'fireRate',   min: 50,   max: 1000, step: 10,  invert: true,
        unit: 'ms', tip: 'Time between player auto-shots. Lower = faster firing.' },
      { label: 'Speed',      config: () => PLAYER.projectile,  key: 'speed',     min: 4,    max: 40,   step: 1,
        unit: 'u/s', tip: 'Player projectile travel speed in units per second.' },
      { label: 'Size',       config: () => PLAYER.projectile,  key: 'size',      min: 0.04, max: 0.5,  step: 0.02,
        unit: 'u', tip: 'Player projectile collision radius in world units.' },
    ]
  },
  {
    section: 'Player',
    items: [
      { label: 'Move Speed', config: () => PLAYER,  key: 'speed',  min: 2,  max: 16,  step: 0.5,
        unit: 'u/s', tip: 'Player movement speed in units per second.' },
    ]
  },
  {
    section: 'Melee',
    collapsed: true,
    items: [
      { label: 'Damage',       config: () => MELEE,  key: 'damage',          min: 5,    max: 60,   step: 1,
        unit: '', tip: 'Melee swing damage per hit.' },
      { label: 'Range',        config: () => MELEE,  key: 'range',           min: 1,    max: 4,    step: 0.2,
        unit: 'u', tip: 'How far the swing reaches from player center.' },
      { label: 'Arc',          config: () => MELEE,  key: 'arc',             min: 1,    max: 3.5,  step: 0.1,
        unit: 'rad', tip: 'Hit cone width in radians (~2.4 = 137\u00b0).' },
      { label: 'Cooldown',     config: () => MELEE,  key: 'cooldown',        min: 100,  max: 800,  step: 10,
        unit: 'ms', tip: 'Time between swings.' },
      { label: 'Knockback',    config: () => MELEE,  key: 'knockback',       min: 0,    max: 4,    step: 0.25,
        unit: 'u', tip: 'Distance enemies are pushed on hit.' },
      { label: 'Auto Range',   config: () => MELEE,  key: 'autoTargetRange', min: 1,    max: 6,    step: 0.5,
        unit: 'u', tip: 'Radius to search for auto-targeting snap.' },
      { label: 'Auto Arc',     config: () => MELEE,  key: 'autoTargetArc',   min: 1,    max: 3.5,  step: 0.1,
        unit: 'rad', tip: 'Cone width for auto-targeting snap.' },
      { label: 'Shake',        config: () => MELEE,  key: 'screenShake',     min: 0,    max: 4,    step: 0.25,
        unit: '', tip: 'Screen shake intensity on melee hit.' },
      { label: 'Hit Pause',    config: () => MELEE,  key: 'hitPause',        min: 0,    max: 100,  step: 5,
        unit: 'ms', tip: 'Freeze-frame duration on melee hit (juice).' },
    ]
  },
  {
    section: 'Mob Global',
    items: [
      { label: 'Speed Mult',     config: () => MOB_GLOBAL,  key: 'speedMult',     min: 0.2,  max: 3,  step: 0.1,
        unit: 'x', tip: 'Global speed multiplier for all enemies.' },
      { label: 'Damage Mult',    config: () => MOB_GLOBAL,  key: 'damageMult',    min: 0.2,  max: 3,  step: 0.1,
        unit: 'x', tip: 'Global damage multiplier for all enemies.' },
      { label: 'Health Mult',    config: () => MOB_GLOBAL,  key: 'healthMult',    min: 0.2,  max: 3,  step: 0.1,
        unit: 'x', tip: 'Global health multiplier for all enemies.' },
      { label: 'Telegraph Mult', config: () => MOB_GLOBAL,  key: 'telegraphMult', min: 0.2,  max: 3,  step: 0.1,
        unit: 'x', tip: 'Global telegraph duration multiplier. Higher = more reaction time.' },
      { label: 'Recovery Mult',  config: () => MOB_GLOBAL,  key: 'recoveryMult',  min: 0.2,  max: 3,  step: 0.1,
        unit: 'x', tip: 'Global recovery duration multiplier. Higher = bigger punish windows.' },
    ]
  },

  // ── Dash / Abilities ──
  {
    section: 'Dash',
    collapsed: true,
    items: [
      { label: 'Cooldown',     config: () => ABILITIES.dash,  key: 'cooldown',             min: 500,  max: 10000, step: 100,
        unit: 'ms', tip: 'Dash cooldown in milliseconds.' },
      { label: 'Duration',     config: () => ABILITIES.dash,  key: 'duration',             min: 50,   max: 500,   step: 10,
        unit: 'ms', tip: 'How long the dash lasts.' },
      { label: 'Distance',     config: () => ABILITIES.dash,  key: 'distance',             min: 1,    max: 15,    step: 0.5,
        unit: 'u', tip: 'Total distance covered by dash.' },
      { label: 'End Lag',      config: () => ABILITIES.dash,  key: 'endLag',               min: 0,    max: 300,   step: 10,
        unit: 'ms', tip: 'Recovery time after dash where movement is locked.' },
      { label: 'Afterimages',  config: () => ABILITIES.dash,  key: 'afterimageCount',      min: 0,    max: 8,     step: 1,
        unit: '', tip: 'Number of ghost afterimages spawned during dash.' },
      { label: 'Ghost Fade',   config: () => ABILITIES.dash,  key: 'afterimageFadeDuration', min: 50, max: 1000, step: 25,
        unit: 'ms', tip: 'How long afterimage ghosts take to fade out.' },
      { label: 'Shake',        config: () => ABILITIES.dash,  key: 'screenShakeOnStart',   min: 0,    max: 8,     step: 0.5,
        unit: '', tip: 'Screen shake intensity on dash start.' },
    ]
  },

  // ── Force Push ──
  {
    section: 'Force Push',
    collapsed: true,
    items: [
      { label: 'Cooldown',     config: () => ABILITIES.ultimate,  key: 'cooldown',          min: 100,  max: 15000, step: 100,
        unit: 'ms', tip: 'Force push cooldown.' },
      { label: 'Charge Time',  config: () => ABILITIES.ultimate,  key: 'chargeTimeMs',      min: 200,   max: 5000,  step: 100,
        unit: 'ms', tip: 'Time to fully charge.' },
      { label: 'Min Length',   config: () => ABILITIES.ultimate,  key: 'minLength',         min: 1,     max: 8,     step: 0.5,
        unit: 'u', tip: 'Uncharged push range.' },
      { label: 'Max Length',   config: () => ABILITIES.ultimate,  key: 'maxLength',         min: 4,     max: 25,    step: 1,
        unit: 'u', tip: 'Fully charged push range.' },
      { label: 'Width',        config: () => ABILITIES.ultimate,  key: 'width',             min: 1,     max: 10,    step: 0.5,
        unit: 'u', tip: 'Push zone width.' },
      { label: 'Min Knockback',config: () => ABILITIES.ultimate,  key: 'minKnockback',      min: 0.5,   max: 5,     step: 0.25,
        unit: 'u', tip: 'Knockback force at minimum charge.' },
      { label: 'Max Knockback',config: () => ABILITIES.ultimate,  key: 'maxKnockback',      min: 2,     max: 15,    step: 0.5,
        unit: 'u', tip: 'Knockback force at full charge.' },
      { label: 'Move Mult',    config: () => ABILITIES.ultimate,  key: 'chargeMoveSpeedMult', min: 0,   max: 1,     step: 0.05,
        unit: 'x', tip: 'Movement speed multiplier while charging.' },
    ]
  },

  // ── Physics ──
  {
    section: 'Physics',
    collapsed: true,
    items: [
      { label: 'Friction',       config: () => PHYSICS,  key: 'friction',         min: 2,    max: 30,   step: 1,
        unit: 'u/s²', tip: 'Knockback deceleration. Higher = snappier stop.' },
      { label: 'Push Instant %', config: () => PHYSICS,  key: 'pushInstantRatio', min: 0,    max: 1,    step: 0.05,
        unit: '', tip: 'Fraction of knockback applied as instant offset. 1.0 = old instant feel.' },
      { label: 'Wave Block Rad', config: () => PHYSICS,  key: 'pushWaveBlockRadius', min: 0,  max: 2,    step: 0.1,
        unit: 'u', tip: 'Lateral distance for enemy occlusion. Nearer enemies block push to those behind. 0 = no blocking.' },
      { label: 'Slam Min Speed', config: () => PHYSICS,  key: 'wallSlamMinSpeed', min: 0,    max: 10,   step: 0.5,
        unit: 'u/s', tip: 'Minimum impact speed for wall slam damage.' },
      { label: 'Slam Damage',    config: () => PHYSICS,  key: 'wallSlamDamage',   min: 1,    max: 20,   step: 1,
        unit: '/unit', tip: 'Damage per unit of speed above slam threshold.' },
      { label: 'Slam Stun',      config: () => PHYSICS,  key: 'wallSlamStun',     min: 0,    max: 1000, step: 50,
        unit: 'ms', tip: 'Stun duration on wall slam.' },
      { label: 'Slam Bounce',    config: () => PHYSICS,  key: 'wallSlamBounce',   min: 0,    max: 1,    step: 0.05,
        unit: '', tip: 'Velocity reflection on wall hit. 0 = dead stop, 1 = perfect bounce.' },
      { label: 'Slam Shake',     config: () => PHYSICS,  key: 'wallSlamShake',    min: 0,    max: 8,    step: 0.5,
        unit: '', tip: 'Screen shake intensity on wall slam.' },
      { label: 'Enemy Bounce',   config: () => PHYSICS,  key: 'enemyBounce',     min: 0,    max: 1,    step: 0.05,
        unit: '', tip: 'Enemy-enemy collision restitution. 0 = stick, 1 = full bounce.' },
      { label: 'Impact Min Spd', config: () => PHYSICS,  key: 'impactMinSpeed',  min: 0,    max: 10,   step: 0.5,
        unit: 'u/s', tip: 'Minimum relative speed for enemy-enemy impact damage.' },
      { label: 'Impact Damage',  config: () => PHYSICS,  key: 'impactDamage',    min: 1,    max: 20,   step: 1,
        unit: '/unit', tip: 'Damage per unit of speed above impact threshold.' },
      { label: 'Impact Stun',    config: () => PHYSICS,  key: 'impactStun',      min: 0,    max: 1000, step: 50,
        unit: 'ms', tip: 'Stun duration when enemies collide at speed.' },
    ]
  },

  // ── Animation ──
  {
    section: 'Animation — Run',
    collapsed: true,
    items: [
      { label: 'Cycle Rate',   config: () => ANIM,  key: 'runCycleRate',      min: 0.1,  max: 1.0,  step: 0.05,
        unit: '', tip: 'Full leg cycles per world unit traveled.' },
      { label: 'Stride Angle', config: () => ANIM,  key: 'strideAngle',      min: 0.1,  max: 1.5,  step: 0.05,
        unit: 'rad', tip: 'Thigh swing amplitude in radians.' },
      { label: 'Knee Bend',    config: () => ANIM,  key: 'kneeBendMax',      min: 0.1,  max: 1.5,  step: 0.05,
        unit: 'rad', tip: 'Maximum forward knee bend.' },
      { label: 'Arm Swing',    config: () => ANIM,  key: 'armSwingRatio',    min: 0.0,  max: 1.5,  step: 0.05,
        unit: 'x', tip: 'Arm swing as fraction of leg amplitude.' },
      { label: 'Body Bounce',  config: () => ANIM,  key: 'bodyBounceHeight', min: 0.0,  max: 0.1,  step: 0.005,
        unit: 'u', tip: 'Vertical bounce per step in world units.' },
      { label: 'Lean',         config: () => ANIM,  key: 'forwardLean',      min: 0.0,  max: 0.3,  step: 0.01,
        unit: 'rad', tip: 'Forward lean into movement direction.' },
      { label: 'Lean Speed',   config: () => ANIM,  key: 'forwardLeanSpeed', min: 1,    max: 20,   step: 1,
        unit: '/s', tip: 'How fast lean blends in/out per second.' },
      { label: 'Hip Turn',     config: () => ANIM,  key: 'hipTurnSpeed',     min: 2,    max: 30,   step: 1,
        unit: 'rad/s', tip: 'How fast legs reorient to movement direction.' },
    ]
  },
  {
    section: 'Animation — Idle',
    collapsed: true,
    items: [
      { label: 'Breath Rate',   config: () => ANIM,  key: 'breathRate',        min: 0.5,  max: 5,    step: 0.1,
        unit: 'Hz', tip: 'Breathing oscillation speed.' },
      { label: 'Breath Amp',    config: () => ANIM,  key: 'breathAmplitude',   min: 0.0,  max: 0.06, step: 0.005,
        unit: 'u', tip: 'Vertical breathing displacement.' },
      { label: 'Weight Shift',  config: () => ANIM,  key: 'weightShiftRate',   min: 0.1,  max: 2,    step: 0.1,
        unit: 'Hz', tip: 'Side-to-side weight shift speed.' },
      { label: 'Shift Angle',   config: () => ANIM,  key: 'weightShiftAngle',  min: 0.0,  max: 0.15, step: 0.005,
        unit: 'rad', tip: 'Weight shift lean angle.' },
      { label: 'Head Drift',    config: () => ANIM,  key: 'headDriftRate',     min: 0.1,  max: 2,    step: 0.1,
        unit: 'Hz', tip: 'Head drift oscillation speed.' },
      { label: 'Head Angle',    config: () => ANIM,  key: 'headDriftAngle',    min: 0.0,  max: 0.1,  step: 0.005,
        unit: 'rad', tip: 'Head drift max rotation.' },
      { label: 'Arm Droop',     config: () => ANIM,  key: 'idleArmDroop',      min: 0.0,  max: 0.5,  step: 0.01,
        unit: 'rad', tip: 'Slight outward arm droop at idle.' },
    ]
  },
  {
    section: 'Animation — Dash',
    collapsed: true,
    items: [
      { label: 'Squash Y',      config: () => ANIM,  key: 'squashScaleY',     min: 0.5,  max: 1.0,  step: 0.05,
        unit: '', tip: 'Y scale during dash wind-up (< 1 = squash).' },
      { label: 'Squash XZ',     config: () => ANIM,  key: 'squashScaleXZ',    min: 1.0,  max: 1.5,  step: 0.05,
        unit: '', tip: 'XZ scale during dash wind-up (> 1 = widen).' },
      { label: 'Stretch Y',     config: () => ANIM,  key: 'stretchScaleY',    min: 1.0,  max: 1.5,  step: 0.05,
        unit: '', tip: 'Y scale mid-dash (> 1 = elongate).' },
      { label: 'Stretch XZ',    config: () => ANIM,  key: 'stretchScaleXZ',   min: 0.5,  max: 1.0,  step: 0.05,
        unit: '', tip: 'XZ scale mid-dash (< 1 = narrow).' },
      { label: 'Lean Angle',    config: () => ANIM,  key: 'dashLeanAngle',    min: 0.0,  max: 0.8,  step: 0.02,
        unit: 'rad', tip: 'Aggressive forward lean during dash.' },
      { label: 'Arm Sweep',     config: () => ANIM,  key: 'dashArmSweep',     min: -1.5, max: 0,    step: 0.05,
        unit: 'rad', tip: 'Arms swept back during dash.' },
      { label: 'Leg Lunge',     config: () => ANIM,  key: 'dashLegLunge',     min: 0.0,  max: 1.5,  step: 0.05,
        unit: 'rad', tip: 'Front leg forward extension during dash.' },
      { label: 'Leg Trail',     config: () => ANIM,  key: 'dashLegTrail',     min: -1.5, max: 0,    step: 0.05,
        unit: 'rad', tip: 'Back leg trailing behind during dash.' },
    ]
  },
  {
    section: 'Animation — Blends',
    collapsed: true,
    items: [
      { label: 'Idle to Run',   config: () => ANIM,  key: 'idleToRunBlend',       min: 20,  max: 300, step: 10,
        unit: 'ms', tip: 'Blend duration from idle to run state.' },
      { label: 'Run to Idle',   config: () => ANIM,  key: 'runToIdleBlend',       min: 20,  max: 300, step: 10,
        unit: 'ms', tip: 'Blend duration from run to idle state.' },
      { label: 'End Lag Blend', config: () => ANIM,  key: 'endLagToNormalBlend',  min: 20,  max: 300, step: 10,
        unit: 'ms', tip: 'Blend out of dash end-lag state.' },
    ]
  },

  // ── Audio ──
  {
    section: 'Audio',
    collapsed: true,
    items: [
      { label: 'Master Vol',    config: () => AUDIO_CONFIG,  key: 'masterVolume',       min: 0,    max: 1,   step: 0.05,  custom: 'masterVolume',
        unit: '', tip: 'Overall volume. Applied to AudioContext gain node.' },
      { label: 'Hit Vol',       config: () => AUDIO_CONFIG,  key: 'hitVolume',          min: 0,    max: 1,   step: 0.05,
        unit: '', tip: 'Enemy hit sound volume.' },
      { label: 'Death Vol',     config: () => AUDIO_CONFIG,  key: 'deathVolume',        min: 0,    max: 1,   step: 0.05,
        unit: '', tip: 'Enemy death sound volume.' },
      { label: 'Dash Vol',      config: () => AUDIO_CONFIG,  key: 'dashVolume',         min: 0,    max: 1,   step: 0.05,
        unit: '', tip: 'Dash whoosh volume.' },
      { label: 'Shield Vol',    config: () => AUDIO_CONFIG,  key: 'shieldBreakVolume',  min: 0,    max: 1,   step: 0.05,
        unit: '', tip: 'Shield break crash volume.' },
      { label: 'Charge Vol',    config: () => AUDIO_CONFIG,  key: 'chargeVolume',       min: 0,    max: 1,   step: 0.05,
        unit: '', tip: 'Charge fire burst volume.' },
      { label: 'Wave Clear',    config: () => AUDIO_CONFIG,  key: 'waveClearVolume',    min: 0,    max: 1,   step: 0.05,
        unit: '', tip: 'Wave clear chime volume.' },
      { label: 'Player Hit',    config: () => AUDIO_CONFIG,  key: 'playerHitVolume',    min: 0,    max: 1,   step: 0.05,
        unit: '', tip: 'Player damage taken sound volume.' },
      { label: 'Melee Swing',   config: () => AUDIO_CONFIG,  key: 'meleeSwingVolume',   min: 0,    max: 1,   step: 0.05,
        unit: '', tip: 'Melee swing whoosh volume.' },
      { label: 'Melee Hit',     config: () => AUDIO_CONFIG,  key: 'meleeHitVolume',     min: 0,    max: 1,   step: 0.05,
        unit: '', tip: 'Melee hit thump volume.' },
    ]
  },
];

// ─── Enemy Speed Multiplier ───

let enemySpeedMultiplier = 1.0;
const originalSpeeds: any = {};

function captureOriginalSpeeds() {
  for (const [name, cfg] of Object.entries(ENEMY_TYPES)) {
    originalSpeeds[name] = (cfg as any).speed;
  }
}

function applyEnemySpeedMultiplier(mult: number) {
  enemySpeedMultiplier = mult;
  for (const [name, cfg] of Object.entries(ENEMY_TYPES)) {
    (cfg as any).speed = originalSpeeds[name] * mult;
  }
}

// ─── Master Volume Update ───
// Audio master volume needs to also update the GainNode, not just the config value

function applyMasterVolume(val: number) {
  setMasterVolume(val);
}

// ─── Panel State ───

let panel: any, isCollapsed = true;

// Track which sections are collapsed
const sectionCollapsedState: Map<string, boolean> = new Map();

export function initTuningPanel() {
  captureOriginalSpeeds();

  // Initialize section collapsed states from config
  for (const sec of SECTIONS) {
    sectionCollapsedState.set(sec.section, sec.collapsed ?? false);
  }

  // Container
  panel = document.createElement('div');
  panel.id = 'tuning-panel';
  panel.innerHTML = '';

  // Toggle button
  const toggle = document.createElement('div');
  toggle.id = 'tuning-toggle';
  toggle.textContent = 'Tune';
  toggle.addEventListener('click', () => {
    isCollapsed = !isCollapsed;
    panel.classList.toggle('collapsed', isCollapsed);
    toggle.textContent = isCollapsed ? 'Tune' : '\u00d7';
  });
  panel.appendChild(toggle);

  // Content wrapper (scrollable)
  const content = document.createElement('div');
  content.id = 'tuning-content';
  panel.appendChild(content);

  // Build collapsible sections
  for (const section of SECTIONS) {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'tuning-section';

    // Collapsible header
    const header = document.createElement('div');
    header.className = 'tuning-section-header';
    const isSecCollapsed = sectionCollapsedState.get(section.section) ?? false;
    header.innerHTML = `<span class="tuning-section-arrow">${isSecCollapsed ? '\u25b6' : '\u25bc'}</span> ${section.section}`;

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'tuning-section-items';
    if (isSecCollapsed) {
      itemsContainer.style.display = 'none';
    }

    header.addEventListener('click', () => {
      const collapsed = sectionCollapsedState.get(section.section) ?? false;
      const newState = !collapsed;
      sectionCollapsedState.set(section.section, newState);
      itemsContainer.style.display = newState ? 'none' : '';
      const arrow = header.querySelector('.tuning-section-arrow')!;
      arrow.textContent = newState ? '\u25b6' : '\u25bc';
    });

    sectionEl.appendChild(header);

    // Build slider rows
    for (const item of section.items) {
      const row = document.createElement('div');
      row.className = 'tuning-row';

      const label = document.createElement('span');
      label.className = 'tuning-label';
      label.textContent = item.label;
      if (item.tip) {
        label.setAttribute('data-tip', item.tip);
        label.classList.add('has-tooltip');
      }

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'tuning-slider';
      slider.min = String(item.min);
      slider.max = String(item.max);
      slider.step = String(item.step);

      // Get current value
      let currentVal;
      if (item.custom === 'enemySpeed') {
        currentVal = enemySpeedMultiplier;
      } else {
        currentVal = item.config()[item.key];
      }
      slider.value = String(currentVal);

      const valueDisplay = document.createElement('span');
      valueDisplay.className = 'tuning-value';
      valueDisplay.textContent = formatValue(currentVal, item);

      slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        if (item.custom === 'enemySpeed') {
          applyEnemySpeedMultiplier(val);
        } else if (item.custom === 'masterVolume') {
          applyMasterVolume(val);
        } else {
          item.config()[item.key] = val;
        }
        valueDisplay.textContent = formatValue(val, item);
      });

      row.appendChild(label);
      row.appendChild(slider);
      row.appendChild(valueDisplay);
      itemsContainer.appendChild(row);
    }

    sectionEl.appendChild(itemsContainer);
    content.appendChild(sectionEl);
  }

  // Copy button
  const copyBtn = document.createElement('div');
  copyBtn.id = 'tuning-copy';
  copyBtn.textContent = 'Copy Values';
  copyBtn.addEventListener('click', () => {
    const text = buildCopyText();
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('copied');
      setTimeout(() => {
        copyBtn.textContent = 'Copy Values';
        copyBtn.classList.remove('copied');
      }, 1200);
    });
  });
  content.appendChild(copyBtn);

  // Share URL button
  const shareBtn = document.createElement('div');
  shareBtn.id = 'tuning-share';
  shareBtn.textContent = 'Share URL';
  shareBtn.addEventListener('click', () => {
    const url = buildShareUrl((window as any).__configDefaults || {});
    navigator.clipboard.writeText(url).then(() => {
      shareBtn.textContent = 'Copied URL!';
      shareBtn.classList.add('copied');
      setTimeout(() => {
        shareBtn.textContent = 'Share URL';
        shareBtn.classList.remove('copied');
      }, 1200);
    });
  });
  content.appendChild(shareBtn);

  // Custom tooltip
  const tooltipEl = document.createElement('div');
  tooltipEl.id = 'tuning-tooltip';
  document.body.appendChild(tooltipEl);

  let tuningTipTarget: any = null;
  panel.addEventListener('mouseover', (e: any) => {
    const el = e.target.closest('.has-tooltip');
    if (el && el.getAttribute('data-tip')) {
      tuningTipTarget = el;
      tooltipEl.textContent = el.getAttribute('data-tip');
      tooltipEl.classList.add('visible');
      const rect = el.getBoundingClientRect();
      let left = rect.left - tooltipEl.offsetWidth - 8;
      let top = rect.top + rect.height / 2 - tooltipEl.offsetHeight / 2;
      if (left < 4) { left = rect.right + 8; }
      top = Math.max(4, Math.min(window.innerHeight - tooltipEl.offsetHeight - 4, top));
      tooltipEl.style.left = left + 'px';
      tooltipEl.style.top = top + 'px';
    }
  });
  panel.addEventListener('mouseout', (e: any) => {
    const el = e.target.closest('.has-tooltip');
    if (el === tuningTipTarget) {
      tuningTipTarget = null;
      tooltipEl.classList.remove('visible');
    }
  });

  // Start collapsed
  panel.classList.add('collapsed');
  document.body.appendChild(panel);
  injectStyles();
}

function buildCopyText() {
  const lines: string[] = [];
  for (const section of SECTIONS) {
    lines.push(`${section.section}:`);
    for (const item of section.items) {
      let val;
      if (item.custom === 'enemySpeed') {
        val = enemySpeedMultiplier;
      } else {
        val = item.config()[item.key];
      }
      const display = Number.isInteger(val) ? val : parseFloat(val.toFixed(4));
      const suffix = item.suffix ? ' ' + item.suffix : '';
      lines.push(`  ${item.label}: ${display}${suffix}`);
    }
  }
  return lines.join('\n');
}

function formatValue(val: number, item: any) {
  const display = Number.isInteger(val) ? val : val.toFixed(2);
  const unitStr = item.unit || item.suffix || '';
  return display + (unitStr ? ' ' + unitStr : '');
}

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #tuning-panel {
      position: fixed;
      top: 60px;
      right: 20px;
      width: 300px;
      z-index: 200;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      pointer-events: all;
      transition: transform 0.25s ease;
    }

    #tuning-panel.collapsed #tuning-content {
      display: none;
    }

    #tuning-toggle {
      position: absolute;
      top: 0;
      right: 0;
      width: 48px;
      height: 28px;
      background: rgba(20, 20, 40, 0.85);
      border: 1px solid rgba(68, 255, 136, 0.3);
      border-radius: 4px;
      color: rgba(68, 255, 136, 0.8);
      font-family: inherit;
      font-size: 11px;
      letter-spacing: 1px;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      user-select: none;
      transition: all 0.15s ease;
    }

    #tuning-toggle:hover {
      background: rgba(68, 255, 136, 0.1);
      border-color: rgba(68, 255, 136, 0.6);
    }

    #tuning-content {
      margin-top: 36px;
      background: rgba(10, 10, 26, 0.94);
      border: 1px solid rgba(68, 255, 136, 0.2);
      border-radius: 6px;
      padding: 12px;
      backdrop-filter: blur(8px);
      max-height: calc(100vh - 120px);
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(68, 255, 136, 0.3) transparent;
    }

    #tuning-content::-webkit-scrollbar {
      width: 6px;
    }

    #tuning-content::-webkit-scrollbar-track {
      background: transparent;
    }

    #tuning-content::-webkit-scrollbar-thumb {
      background: rgba(68, 255, 136, 0.3);
      border-radius: 3px;
    }

    .tuning-section {
      margin-bottom: 4px;
    }

    .tuning-section:last-of-type {
      margin-bottom: 0;
    }

    .tuning-section-header {
      font-size: 9px;
      color: rgba(68, 255, 136, 0.7);
      letter-spacing: 2px;
      text-transform: uppercase;
      padding: 6px 4px;
      cursor: pointer;
      user-select: none;
      border-bottom: 1px solid rgba(68, 255, 136, 0.1);
      transition: color 0.15s ease;
    }

    .tuning-section-header:hover {
      color: rgba(68, 255, 136, 1);
    }

    .tuning-section-arrow {
      font-size: 7px;
      margin-right: 4px;
      display: inline-block;
      width: 10px;
    }

    .tuning-section-items {
      padding: 6px 0 4px 0;
    }

    .tuning-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }

    .tuning-row:last-child {
      margin-bottom: 0;
    }

    .tuning-label {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.55);
      width: 80px;
      flex-shrink: 0;
    }

    .tuning-label.has-tooltip {
      cursor: help;
      text-decoration: underline dotted rgba(255, 255, 255, 0.2);
      text-underline-offset: 2px;
    }

    .tuning-slider {
      flex: 1;
      height: 3px;
      -webkit-appearance: none;
      appearance: none;
      background: rgba(100, 100, 160, 0.3);
      border-radius: 2px;
      outline: none;
      cursor: pointer;
    }

    .tuning-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #44ff88;
      cursor: pointer;
      border: none;
      box-shadow: 0 0 4px rgba(68, 255, 136, 0.4);
    }

    .tuning-slider::-moz-range-thumb {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #44ff88;
      cursor: pointer;
      border: none;
      box-shadow: 0 0 4px rgba(68, 255, 136, 0.4);
    }

    .tuning-value {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.7);
      width: 54px;
      text-align: right;
      flex-shrink: 0;
    }

    #tuning-copy, #tuning-share {
      margin-top: 10px;
      padding: 5px 0;
      text-align: center;
      font-size: 9px;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: rgba(68, 255, 136, 0.7);
      background: rgba(68, 255, 136, 0.06);
      border: 1px solid rgba(68, 255, 136, 0.2);
      border-radius: 4px;
      cursor: pointer;
      user-select: none;
      transition: all 0.15s ease;
    }

    #tuning-share {
      margin-top: 4px;
    }

    #tuning-copy:hover, #tuning-share:hover {
      background: rgba(68, 255, 136, 0.12);
      border-color: rgba(68, 255, 136, 0.5);
      color: rgba(68, 255, 136, 1);
    }

    #tuning-copy.copied, #tuning-share.copied {
      color: #ffcc44;
      border-color: rgba(255, 204, 68, 0.4);
      background: rgba(255, 204, 68, 0.08);
    }

    #tuning-tooltip {
      position: fixed;
      z-index: 300;
      max-width: 220px;
      padding: 6px 10px;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 10px;
      line-height: 1.4;
      color: rgba(255, 255, 255, 0.9);
      background: rgba(10, 10, 30, 0.95);
      border: 1px solid rgba(68, 255, 136, 0.4);
      border-radius: 4px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.12s ease;
      backdrop-filter: blur(6px);
    }

    #tuning-tooltip.visible {
      opacity: 1;
    }
  `;
  document.head.appendChild(style);
}
