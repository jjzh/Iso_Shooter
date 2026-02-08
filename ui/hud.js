import { ABILITIES } from '../config/abilities.js';
import { PLAYER } from '../config/player.js';
import { triggerDash, triggerUltimate, setUltimateHeld } from '../engine/input.js';

let healthBar, healthText, waveIndicator, currencyCount, abilityBar;

// Mobile action button refs
let mobileBtnDash, mobileBtnUlt;

export function initHUD() {
  healthBar = document.getElementById('health-bar');
  healthText = document.getElementById('health-text');
  waveIndicator = document.getElementById('wave-indicator');
  currencyCount = document.getElementById('currency-count');
  abilityBar = document.getElementById('ability-bar');

  // Build desktop ability slots (keyboard labels)
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

  // Mobile action buttons — wire up touch handlers
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (hasTouch) {
    initMobileButtons();
  }
}

function initMobileButtons() {
  mobileBtnDash = document.getElementById('mobile-btn-dash');
  mobileBtnUlt = document.getElementById('mobile-btn-ultimate');
  if (!mobileBtnDash || !mobileBtnUlt) return;

  // Dash — single tap
  mobileBtnDash.addEventListener('touchstart', (e) => {
    e.preventDefault();
    triggerDash();
  });

  // Ultimate — hold to charge, release to fire
  mobileBtnUlt.addEventListener('touchstart', (e) => {
    e.preventDefault();
    triggerUltimate();
    setUltimateHeld(true);
  });
  mobileBtnUlt.addEventListener('touchend', (e) => {
    e.preventDefault();
    setUltimateHeld(false);
  });
  mobileBtnUlt.addEventListener('touchcancel', () => {
    setUltimateHeld(false);
  });
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

  // Ability cooldowns — update both desktop slots and mobile buttons
  for (const [key, state] of Object.entries(gameState.abilities)) {
    if (!ABILITIES[key]) continue;
    const cfg = ABILITIES[key];

    // --- Desktop ability slot ---
    const slot = document.getElementById(`ability-${key}`);
    if (slot) {
      const overlay = slot.querySelector('.ability-cooldown-overlay');
      const cdText = slot.querySelector('.ability-cooldown-text');

      if (state.cooldownRemaining > 0) {
        const pctRemaining = Math.max(0, state.cooldownRemaining / cfg.cooldown);
        overlay.style.height = (pctRemaining * 100) + '%';
        slot.classList.remove('ready');
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
        overlay.style.height = ((1 - state.chargeT) * 100) + '%';
        overlay.style.backgroundColor = 'rgba(68, 255, 170, 0.3)';
      } else {
        if (slot.style.borderColor) slot.style.borderColor = '';
        if (slot.style.boxShadow) slot.style.boxShadow = '';
        cdText.style.color = '';
        overlay.style.backgroundColor = '';
      }
    }

    // --- Mobile action button ---
    const mBtn = key === 'dash' ? mobileBtnDash : key === 'ultimate' ? mobileBtnUlt : null;
    if (mBtn) {
      const mOverlay = mBtn.querySelector('.mobile-btn-cd-overlay');
      const mCdText = mBtn.querySelector('.mobile-btn-cd-text');

      if (state.cooldownRemaining > 0) {
        const pctRemaining = Math.max(0, state.cooldownRemaining / cfg.cooldown);
        mOverlay.style.height = (pctRemaining * 100) + '%';
        mBtn.classList.remove('ready');
        const secs = Math.ceil(state.cooldownRemaining / 1000);
        mCdText.textContent = secs;
        mCdText.style.display = 'flex';
      } else {
        mOverlay.style.height = '0%';
        mBtn.classList.add('ready');
        mCdText.style.display = 'none';
      }

      // Charging state for ultimate
      if (key === 'ultimate' && state.charging) {
        const chargePct = Math.round(state.chargeT * 100);
        mBtn.style.borderColor = 'rgba(68, 255, 170, 0.9)';
        mBtn.style.boxShadow = '0 0 16px rgba(68, 255, 170, 0.5)';
        mCdText.textContent = chargePct + '%';
        mCdText.style.display = 'flex';
        mCdText.style.color = '#44ffaa';
        mOverlay.style.height = ((1 - state.chargeT) * 100) + '%';
        mOverlay.style.backgroundColor = 'rgba(68, 255, 170, 0.3)';
      } else if (key === 'ultimate') {
        if (mBtn.style.borderColor) mBtn.style.borderColor = '';
        if (mBtn.style.boxShadow) mBtn.style.boxShadow = '';
        mCdText.style.color = '';
        mOverlay.style.backgroundColor = '';
      }
    }
  }
}
