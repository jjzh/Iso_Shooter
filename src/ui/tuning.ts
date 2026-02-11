// Live tuning panel — designer can adjust values without touching code
// Mutates config objects directly; game reads them each frame so changes are instant

import { PLAYER } from '../config/player';
import { ENEMY_TYPES } from '../config/enemies';
import { buildShareUrl } from '../engine/urlParams';

const SLIDERS: any[] = [
  {
    group: 'Projectiles (Self)',
    items: [
      { label: 'Fire Rate',  config: () => PLAYER,            key: 'fireRate',          min: 50,  max: 1000, step: 10, suffix: 'ms', invert: true,
        unit: 'ms', tip: 'Time between player auto-shots. Lower = faster firing.' },
      { label: 'Speed',      config: () => PLAYER.projectile,  key: 'speed',            min: 4,   max: 40,   step: 1,  suffix: '',
        unit: 'u/s', tip: 'Player projectile travel speed in units per second.' },
      { label: 'Size',       config: () => PLAYER.projectile,  key: 'size',             min: 0.04, max: 0.5, step: 0.02, suffix: '',
        unit: 'u', tip: 'Player projectile collision radius in world units.' },
    ]
  },
  {
    group: 'Self',
    items: [
      { label: 'Move Speed', config: () => PLAYER,            key: 'speed',            min: 2,   max: 16,   step: 0.5, suffix: '',
        unit: 'u/s', tip: 'Player movement speed in units per second.' },
    ]
  },
  {
    group: 'Enemies',
    items: [
      { label: 'Speed Mult', config: () => null,              key: 'enemySpeedMult',   min: 0.2, max: 4,    step: 0.1, suffix: 'x', custom: 'enemySpeed',
        unit: 'x', tip: 'Global speed multiplier applied to all enemy types. 1x = default.' },
    ]
  }
];

// Enemy speed multiplier — applied to all enemy types
let enemySpeedMultiplier = 1.0;
const originalSpeeds: any = {};

// Store original speeds so multiplier works correctly
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

let panel: any, isCollapsed = true; // collapsed by default

export function initTuningPanel() {
  captureOriginalSpeeds();

  // Container
  panel = document.createElement('div');
  panel.id = 'tuning-panel';
  panel.innerHTML = '';

  // Toggle button
  const toggle = document.createElement('div');
  toggle.id = 'tuning-toggle';
  toggle.textContent = 'Tune'; // starts collapsed
  toggle.addEventListener('click', () => {
    isCollapsed = !isCollapsed;
    panel.classList.toggle('collapsed', isCollapsed);
    toggle.textContent = isCollapsed ? 'Tune' : '\u00d7';
  });
  panel.appendChild(toggle);

  // Content wrapper
  const content = document.createElement('div');
  content.id = 'tuning-content';
  panel.appendChild(content);

  // Build slider groups
  for (const group of SLIDERS) {
    const groupEl = document.createElement('div');
    groupEl.className = 'tuning-group';

    const groupLabel = document.createElement('div');
    groupLabel.className = 'tuning-group-label';
    groupLabel.textContent = group.group;
    groupEl.appendChild(groupLabel);

    for (const item of group.items) {
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
      slider.min = item.min;
      slider.max = item.max;
      slider.step = item.step;

      // Get current value
      let currentVal;
      if (item.custom === 'enemySpeed') {
        currentVal = enemySpeedMultiplier;
      } else {
        currentVal = item.config()[item.key];
      }
      slider.value = currentVal;

      const valueDisplay = document.createElement('span');
      valueDisplay.className = 'tuning-value';
      valueDisplay.textContent = formatValue(currentVal, item);

      slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        if (item.custom === 'enemySpeed') {
          applyEnemySpeedMultiplier(val);
        } else {
          item.config()[item.key] = val;
        }
        valueDisplay.textContent = formatValue(val, item);
      });

      row.appendChild(label);
      row.appendChild(slider);
      row.appendChild(valueDisplay);
      groupEl.appendChild(row);
    }

    content.appendChild(groupEl);
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

  // Custom tooltip for tuning panel
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
      // Position to the left of the label (panel is on right side)
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

  // Start collapsed by default
  panel.classList.add('collapsed');
  document.body.appendChild(panel);
  injectStyles();
}

function buildCopyText() {
  const lines: string[] = [];
  for (const group of SLIDERS) {
    lines.push(`${group.group}:`);
    for (const item of group.items) {
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
      padding: 16px;
      backdrop-filter: blur(8px);
    }

    .tuning-group {
      margin-bottom: 14px;
    }

    .tuning-group:last-child {
      margin-bottom: 0;
    }

    .tuning-group-label {
      font-size: 9px;
      color: rgba(68, 255, 136, 0.6);
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid rgba(68, 255, 136, 0.1);
    }

    .tuning-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }

    .tuning-row:last-child {
      margin-bottom: 0;
    }

    .tuning-label {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.6);
      width: 80px;
      flex-shrink: 0;
    }

    .tuning-label.has-tooltip {
      cursor: help;
      text-decoration: underline dotted rgba(255, 255, 255, 0.25);
      text-underline-offset: 2px;
    }

    .tuning-slider {
      flex: 1;
      height: 4px;
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
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #44ff88;
      cursor: pointer;
      border: none;
      box-shadow: 0 0 6px rgba(68, 255, 136, 0.4);
    }

    .tuning-slider::-moz-range-thumb {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #44ff88;
      cursor: pointer;
      border: none;
      box-shadow: 0 0 6px rgba(68, 255, 136, 0.4);
    }

    .tuning-value {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.8);
      width: 54px;
      text-align: right;
      flex-shrink: 0;
    }

    #tuning-copy, #tuning-share {
      margin-top: 14px;
      padding: 6px 0;
      text-align: center;
      font-size: 10px;
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
      margin-top: 6px;
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
