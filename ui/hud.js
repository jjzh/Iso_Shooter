import { ABILITIES } from '../config/abilities.js';
import { PLAYER } from '../config/player.js';

let healthBar, healthText, waveIndicator, currencyCount, abilityBar;

export function initHUD() {
  healthBar = document.getElementById('health-bar');
  healthText = document.getElementById('health-text');
  waveIndicator = document.getElementById('wave-indicator');
  currencyCount = document.getElementById('currency-count');
  abilityBar = document.getElementById('ability-bar');

  // Build ability slots from config
  for (const [key, ability] of Object.entries(ABILITIES)) {
    const el = document.createElement('div');
    el.className = 'ability-slot ready';
    el.id = `ability-${key}`;
    el.innerHTML =
      `<div class="ability-key">${ability.key}</div>` +
      `<div class="ability-name">${ability.name}</div>` +
      `<div class="ability-cooldown-text"></div>` +
      `<div class="ability-cooldown-overlay"></div>`;
    abilityBar.appendChild(el);
  }
}

export function updateHUD(gameState) {
  // Health bar
  const pct = Math.max(0, gameState.playerHealth / gameState.playerMaxHealth);
  healthBar.style.width = (pct * 100) + '%';

  if (pct > 0.5) {
    healthBar.style.backgroundColor = '#44ff88';
  } else if (pct > 0.25) {
    healthBar.style.backgroundColor = '#ffcc44';
  } else {
    healthBar.style.backgroundColor = '#ff4444';
  }

  healthText.textContent = Math.ceil(gameState.playerHealth) + ' / ' + gameState.playerMaxHealth;

  // Wave indicator
  waveIndicator.textContent = 'Wave ' + gameState.currentWave;

  // Currency
  currencyCount.textContent = gameState.currency;

  // Ability cooldowns
  for (const [key, state] of Object.entries(gameState.abilities)) {
    if (!ABILITIES[key]) continue;
    const slot = document.getElementById(`ability-${key}`);
    if (!slot) continue;
    const overlay = slot.querySelector('.ability-cooldown-overlay');
    const cdText = slot.querySelector('.ability-cooldown-text');
    const cfg = ABILITIES[key];

    if (state.cooldownRemaining > 0) {
      const pctRemaining = Math.max(0, state.cooldownRemaining / cfg.cooldown);
      overlay.style.height = (pctRemaining * 100) + '%';
      slot.classList.remove('ready');
      // MOBA-style numeric countdown
      const secs = Math.ceil(state.cooldownRemaining / 1000);
      cdText.textContent = secs;
      cdText.style.display = 'flex';
    } else {
      overlay.style.height = '0%';
      slot.classList.add('ready');
      cdText.style.display = 'none';
    }

    // Show charging state for ultimate (Force Push)
    if (key === 'ultimate' && state.charging) {
      const chargePct = Math.round(state.chargeT * 100);
      slot.style.borderColor = 'rgba(68, 255, 170, 0.8)';
      slot.style.boxShadow = '0 0 12px rgba(68, 255, 170, 0.4)';
      cdText.textContent = chargePct + '%';
      cdText.style.display = 'flex';
      cdText.style.color = '#44ffaa';
      // Show charge fill on overlay
      overlay.style.height = ((1 - state.chargeT) * 100) + '%';
      overlay.style.backgroundColor = 'rgba(68, 255, 170, 0.3)';
    } else {
      if (slot.style.borderColor) slot.style.borderColor = '';
      if (slot.style.boxShadow) slot.style.boxShadow = '';
      cdText.style.color = '';
      overlay.style.backgroundColor = '';
    }
  }
}
