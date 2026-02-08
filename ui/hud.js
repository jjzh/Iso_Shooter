import { ABILITIES } from '../config/abilities.js';
import { PLAYER } from '../config/player.js';
import {
  triggerDash, triggerUltimate, setUltimateHeld,
  setAimFromScreenDrag, setAbilityDirOverride, clearAbilityDirOverride
} from '../engine/input.js';

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

// Drag-to-aim constants
const DRAG_THRESHOLD = 15;  // px — distinguish tap from drag
const DRAG_MAX_RADIUS = 80; // px — full deflection range

// Isometric basis vectors (duplicated from input.js for screen→world mapping)
const INV_SQRT2 = 1 / Math.SQRT2;
const ISO_RIGHT_X = INV_SQRT2;
const ISO_RIGHT_Z = -INV_SQRT2;
const ISO_UP_X = -INV_SQRT2;
const ISO_UP_Z = -INV_SQRT2;

function initMobileButtons() {
  mobileBtnDash = document.getElementById('mobile-btn-dash');
  mobileBtnUlt = document.getElementById('mobile-btn-ultimate');
  if (!mobileBtnDash || !mobileBtnUlt) return;

  // --- Dash: drag-to-aim, release to fire ---
  setupDragToAim(mobileBtnDash, {
    onDragStart: () => { /* don't trigger yet — wait for release */ },
    onDragMove: (normX, normY) => {
      // Compute isometric world direction from screen drag
      const isoX = normX * ISO_RIGHT_X + normY * ISO_UP_X;
      const isoZ = normX * ISO_RIGHT_Z + normY * ISO_UP_Z;
      setAbilityDirOverride(isoX, isoZ);
      setAimFromScreenDrag(normX, normY);
    },
    onRelease: (wasDrag) => {
      triggerDash();
      if (!wasDrag) clearAbilityDirOverride();
      // If wasDrag, override is already set and startDash will consume it
    },
    onCancel: () => {
      clearAbilityDirOverride();
    },
  });

  // --- Ultimate: drag-to-aim, charge while held ---
  setupDragToAim(mobileBtnUlt, {
    onDragStart: () => {
      triggerUltimate();
      setUltimateHeld(true);
    },
    onDragMove: (normX, normY) => {
      setAimFromScreenDrag(normX, normY);
    },
    onRelease: () => {
      setUltimateHeld(false);
      clearAbilityDirOverride();
    },
    onCancel: () => {
      setUltimateHeld(false);
      clearAbilityDirOverride();
    },
  });
}

/**
 * Generic drag-to-aim handler for a mobile ability button.
 * Touch down → drag to aim → release to fire.
 * Callbacks:
 *   onDragStart() — called once when touch begins
 *   onDragMove(normX, normY) — called each touchmove when past threshold
 *     normX: -1..1 screen-right, normY: -1..1 screen-up
 *   onRelease(wasDrag) — called on touchend (wasDrag = true if threshold exceeded)
 *   onCancel() — called on touchcancel
 */
function setupDragToAim(btnEl, { onDragStart, onDragMove, onRelease, onCancel }) {
  let touchId = null;
  let startX = 0, startY = 0;
  let isDragging = false;

  btnEl.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (touchId !== null) return; // already tracking a touch
    const touch = e.changedTouches[0];
    touchId = touch.identifier;
    startX = touch.clientX;
    startY = touch.clientY;
    isDragging = false;
    onDragStart();
  });

  // Listen on window so drag can extend beyond button bounds
  window.addEventListener('touchmove', (e) => {
    if (touchId === null) return;
    const touch = findTouch(e.changedTouches, touchId);
    if (!touch) return;

    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > DRAG_THRESHOLD) {
      isDragging = true;
      // Normalize to -1..1 range, clamped by max radius
      const clampedDist = Math.min(dist, DRAG_MAX_RADIUS);
      const normX = (dx / dist) * (clampedDist / DRAG_MAX_RADIUS);
      const normY = (-dy / dist) * (clampedDist / DRAG_MAX_RADIUS); // invert Y (screen down = negative)
      onDragMove(normX, normY);
    }
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    if (touchId === null) return;
    const touch = findTouch(e.changedTouches, touchId);
    if (!touch) return;
    touchId = null;
    onRelease(isDragging);
  });

  window.addEventListener('touchcancel', (e) => {
    if (touchId === null) return;
    const touch = findTouch(e.changedTouches, touchId);
    if (!touch) return;
    touchId = null;
    onCancel();
  });
}

function findTouch(touchList, id) {
  for (let i = 0; i < touchList.length; i++) {
    if (touchList[i].identifier === id) return touchList[i];
  }
  return null;
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
