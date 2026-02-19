import { ABILITIES } from '../config/abilities';
import { MOBILE_CONTROLS } from '../config/mobileControls';
import { PLAYER } from '../config/player';
import {
  triggerDash, triggerAttack, triggerJump, triggerLaunch, triggerCancel,
  triggerUltimate, setUltimateHeld, setAttackHeld,
  setAimFromScreenDrag, setAbilityDirOverride, clearAbilityDirOverride
} from '../engine/input';
import { playerHasTag, TAG } from '../engine/tags';
import { getLaunchCooldownTimer } from '../entities/player';
import { LAUNCH } from '../config/player';
import { isBulletTimeActive, getBulletTimeResource, getBulletTimeMax } from '../engine/bulletTime';
import { on } from '../engine/events';

let healthBar: any, healthText: any, waveIndicator: any, currencyCount: any, abilityBar: any;
let bulletTimeMeter: any, bulletTimeFill: any;
let btVignette: any, btCeremony: any;
let btCeremonyTimeout: any = null;

// Mobile action button refs
let mobileBtnAttack: HTMLElement | null = null;
let mobileBtnDash: HTMLElement | null = null;
let mobileBtnJump: HTMLElement | null = null;
let mobileBtnLaunch: HTMLElement | null = null;
let mobileBtnCancel: HTMLElement | null = null;

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
      `<div class="ability-key">${(ability as any).key}</div>` +
      `<div class="ability-name">${(ability as any).name}</div>` +
      `<div class="ability-cooldown-text"></div>` +
      `<div class="ability-cooldown-overlay"></div>`;
    abilityBar.appendChild(el);
  }

  // Mobile action buttons — wire up touch handlers
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (hasTouch) {
    initMobileButtons();
  }

  // Bullet time meter bar — positioned top-left below health bar
  bulletTimeMeter = document.createElement('div');
  bulletTimeMeter.id = 'bullet-time-meter';
  bulletTimeMeter.style.cssText = `
    position: fixed;
    top: 44px;
    left: 20px;
    width: 220px;
    height: 6px;
    background: rgba(20, 20, 40, 0.7);
    border: 1px solid rgba(100, 140, 255, 0.3);
    border-radius: 3px;
    z-index: 50;
    overflow: hidden;
  `;
  bulletTimeFill = document.createElement('div');
  bulletTimeFill.style.cssText = `
    width: 100%;
    height: 100%;
    background: #6688ff;
    border-radius: 2px;
    transition: background-color 0.15s ease;
  `;
  bulletTimeMeter.appendChild(bulletTimeFill);

  // Label — right side
  const btLabel = document.createElement('div');
  btLabel.style.cssText = `
    position: absolute;
    top: -1px;
    right: -50px;
    font-size: 8px;
    color: rgba(100, 140, 255, 0.6);
    letter-spacing: 1px;
    font-family: 'Courier New', monospace;
    pointer-events: none;
  `;
  btLabel.textContent = 'Q \u2014 SLOW';
  bulletTimeMeter.appendChild(btLabel);

  document.body.appendChild(bulletTimeMeter);

  // Bullet time vignette overlay
  btVignette = document.createElement('div');
  btVignette.id = 'bt-vignette';
  btVignette.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    pointer-events: none;
    z-index: 40;
    opacity: 0;
    transition: opacity 0.3s ease;
    background: radial-gradient(ellipse at center, transparent 50%, rgba(100, 140, 255, 0.15) 100%);
    box-shadow: inset 0 0 80px rgba(100, 140, 255, 0.2);
  `;
  document.body.appendChild(btVignette);

  // Bullet time ceremony text
  btCeremony = document.createElement('div');
  btCeremony.id = 'bt-ceremony';
  btCeremony.style.cssText = `
    position: fixed;
    top: 18%;
    left: 50%;
    transform: translateX(-50%);
    font-size: 14px;
    font-family: 'Courier New', monospace;
    color: rgba(100, 160, 255, 0.9);
    letter-spacing: 6px;
    text-transform: uppercase;
    text-shadow: 0 0 12px rgba(100, 140, 255, 0.6), 0 0 30px rgba(100, 140, 255, 0.3);
    pointer-events: none;
    z-index: 55;
    opacity: 0;
    transition: opacity 0.2s ease;
  `;
  document.body.appendChild(btCeremony);

  // Subscribe to bullet time events for vignette + ceremony
  on('bulletTimeActivated', () => {
    if (btVignette) btVignette.style.opacity = '1';
    showBTCeremony('BULLET TIME ENGAGED', 1200);
  });
  on('bulletTimeDeactivated', () => {
    if (btVignette) btVignette.style.opacity = '0';
    showBTCeremony('BULLET TIME ENDED', 800);
  });
}

function showBTCeremony(text: string, durationMs: number) {
  if (!btCeremony) return;
  if (btCeremonyTimeout) clearTimeout(btCeremonyTimeout);
  btCeremony.textContent = text;
  btCeremony.style.opacity = '1';
  btCeremonyTimeout = setTimeout(() => {
    btCeremony.style.opacity = '0';
    btCeremonyTimeout = null;
  }, durationMs);
}

// Isometric basis vectors (duplicated from input.js for screen→world mapping)
const INV_SQRT2 = 1 / Math.SQRT2;
const ISO_RIGHT_X = INV_SQRT2;
const ISO_RIGHT_Z = -INV_SQRT2;
const ISO_UP_X = -INV_SQRT2;
const ISO_UP_Z = -INV_SQRT2;

let _mobileButtonsWired = false;
function initMobileButtons() {
  if (_mobileButtonsWired) return;
  mobileBtnAttack = document.getElementById('mobile-btn-attack');
  mobileBtnDash = document.getElementById('mobile-btn-dash');
  mobileBtnJump = document.getElementById('mobile-btn-jump');
  mobileBtnLaunch = document.getElementById('mobile-btn-launch');
  mobileBtnCancel = document.getElementById('mobile-btn-cancel');
  if (!mobileBtnAttack) {
    console.warn('[mobile] mobile-btn-attack not found in DOM');
    return;
  }

  _mobileButtonsWired = true;
  positionMobileButtons();
  wireButtonHandlers();
}

function wireButtonHandlers(): void {
  // --- Attack/Push: tap = attack, hold = force push ---
  // Delay charge start until hold threshold to avoid flicker on taps
  let attackHoldTimeout: number | null = null;
  setupDragToAim(mobileBtnAttack!, {
    onDragStart: () => {
      attackHoldTimeout = window.setTimeout(() => {
        triggerUltimate();
        setUltimateHeld(true);
        attackHoldTimeout = null;
      }, MOBILE_CONTROLS.holdThreshold);
    },
    onDragMove: (normX: number, normY: number) => {
      setAimFromScreenDrag(normX, normY);
    },
    onRelease: (wasDrag: boolean, heldMs: number) => {
      if (attackHoldTimeout !== null) {
        clearTimeout(attackHoldTimeout);
        attackHoldTimeout = null;
      }
      if (heldMs < MOBILE_CONTROLS.holdThreshold && !wasDrag) {
        // Short tap — fire attack
        triggerAttack();
      } else {
        // Long hold or drag — release force push
        setUltimateHeld(false);
        clearAbilityDirOverride();
      }
    },
    onCancel: () => {
      if (attackHoldTimeout !== null) {
        clearTimeout(attackHoldTimeout);
        attackHoldTimeout = null;
      }
      setUltimateHeld(false);
      clearAbilityDirOverride();
    },
  });

  // --- Dash: drag-to-aim, release to fire ---
  setupDragToAim(mobileBtnDash!, {
    onDragStart: () => {},
    onDragMove: (normX: number, normY: number) => {
      const isoX = normX * ISO_RIGHT_X + normY * ISO_UP_X;
      const isoZ = normX * ISO_RIGHT_Z + normY * ISO_UP_Z;
      setAbilityDirOverride(isoX, isoZ);
      setAimFromScreenDrag(normX, normY);
    },
    onRelease: (wasDrag: boolean) => {
      triggerDash();
      if (!wasDrag) clearAbilityDirOverride();
    },
    onCancel: () => { clearAbilityDirOverride(); },
  });

  // --- Jump: simple tap ---
  mobileBtnJump!.addEventListener('touchstart', (e: TouchEvent) => {
    e.preventDefault();
    triggerJump();
  }, { passive: false });

  // --- Launch: context-sensitive (grounded vs float) ---
  setupDragToAim(mobileBtnLaunch!, {
    onDragStart: () => {
      if (playerHasTag(TAG.AERIAL)) {
        // In float → hold starts dunk (set attackHeld for float selector)
        setAttackHeld(true);
      }
    },
    onDragMove: (normX: number, normY: number) => {
      if (playerHasTag(TAG.AERIAL)) {
        // Drag to aim dunk landing spot
        setAimFromScreenDrag(normX, normY);
      }
    },
    onRelease: (wasDrag: boolean, heldMs: number) => {
      if (playerHasTag(TAG.AERIAL)) {
        if (heldMs < MOBILE_CONTROLS.holdThreshold && !wasDrag) {
          // Tap during float → spike
          triggerAttack();
        }
        // Release dunk aim
        setAttackHeld(false);
        clearAbilityDirOverride();
      } else {
        // Grounded → launch
        triggerLaunch();
      }
    },
    onCancel: () => {
      setAttackHeld(false);
      clearAbilityDirOverride();
    },
  });

  // --- Cancel: simple tap ---
  mobileBtnCancel!.addEventListener('touchstart', (e: TouchEvent) => {
    e.preventDefault();
    triggerCancel();
  }, { passive: false });
}

/**
 * Position all mobile buttons using the radial fan layout from MOBILE_CONTROLS config.
 * Exported so the tuning panel can call it when sliders change.
 *
 * Internal coordinate system: X increases leftward, Y increases upward.
 * Origin is the bottom-right corner of the 280x280 container.
 * These map directly to CSS `right` and `bottom` properties.
 *
 * Angle convention (for the fan arc):
 *   0° = leftward (increasing X/right), 90° = upward (increasing Y/bottom).
 *   Default arcStartAngle=0° with arcSpread=90° fans from left to above.
 */
export function positionMobileButtons(): void {
  const C = MOBILE_CONTROLS;
  if (!mobileBtnAttack) return;

  // Primary button center: near bottom-right corner
  const pCX = C.edgeMargin + C.primarySize / 2;
  const pCY = C.edgeMargin + C.primarySize / 2;
  placeButtonAtCenter(mobileBtnAttack, pCX, pCY, C.primarySize);

  // Fan buttons arc outward from primary center
  // Angles: 0° = left, 90° = up (in our coordinate system where X=right=left, Y=bottom=up)
  const fanButtons = [mobileBtnDash, mobileBtnJump, mobileBtnLaunch];
  for (let i = 0; i < fanButtons.length; i++) {
    const btn = fanButtons[i];
    if (!btn) continue;
    const t = fanButtons.length > 1 ? i / (fanButtons.length - 1) : 0.5;
    const angleDeg = C.arcStartAngle + t * C.arcSpread;
    const angleRad = angleDeg * (Math.PI / 180);
    const cx = pCX + Math.cos(angleRad) * C.arcRadius;
    const cy = pCY + Math.sin(angleRad) * C.arcRadius;
    placeButtonAtCenter(btn, cx, cy, C.fanSize);
  }

  // Cancel button: above Launch with proper clearance
  placeButtonAtCenter(mobileBtnCancel, pCX, pCY + C.arcRadius + C.fanSize / 2 + C.cancelSize / 2 + 15, C.cancelSize);
}

function placeButtonAtCenter(btn: HTMLElement | null, cx: number, cy: number, size: number): void {
  if (!btn) return;
  btn.style.width = size + 'px';
  btn.style.height = size + 'px';
  // Convert center coords to CSS right/bottom (distance from element edge to container edge)
  btn.style.right = (cx - size / 2) + 'px';
  btn.style.bottom = (cy - size / 2) + 'px';
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
function setupDragToAim(btnEl: any, { onDragStart, onDragMove, onRelease, onCancel }: any) {
  let touchId: number | null = null;
  let startX = 0, startY = 0;
  let isDragging = false;
  let touchStartTime = 0;

  btnEl.addEventListener('touchstart', (e: any) => {
    e.preventDefault();
    if (touchId !== null) return; // already tracking a touch
    const touch = e.changedTouches[0];
    touchId = touch.identifier;
    startX = touch.clientX;
    startY = touch.clientY;
    isDragging = false;
    touchStartTime = performance.now();
    onDragStart();
  });

  // Listen on window so drag can extend beyond button bounds
  window.addEventListener('touchmove', (e: any) => {
    if (touchId === null) return;
    const touch = findTouch(e.changedTouches, touchId);
    if (!touch) return;

    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > MOBILE_CONTROLS.dragThreshold) {
      isDragging = true;
      // Normalize to -1..1 range, clamped by max radius
      const clampedDist = Math.min(dist, MOBILE_CONTROLS.dragMaxRadius);
      const normX = (dx / dist) * (clampedDist / MOBILE_CONTROLS.dragMaxRadius);
      const normY = (-dy / dist) * (clampedDist / MOBILE_CONTROLS.dragMaxRadius); // invert Y (screen down = negative)
      onDragMove(normX, normY);
    }
  }, { passive: true });

  window.addEventListener('touchend', (e: any) => {
    if (touchId === null) return;
    const touch = findTouch(e.changedTouches, touchId);
    if (!touch) return;
    touchId = null;
    const heldMs = performance.now() - touchStartTime;
    onRelease(isDragging, heldMs);
  });

  window.addEventListener('touchcancel', (e: any) => {
    if (touchId === null) return;
    const touch = findTouch(e.changedTouches, touchId);
    if (!touch) return;
    touchId = null;
    onCancel();
  });
}

function findTouch(touchList: any, id: number) {
  for (let i = 0; i < touchList.length; i++) {
    if (touchList[i].identifier === id) return touchList[i];
  }
  return null;
}

/**
 * Update a mobile button's cooldown overlay and text.
 * Shows a fill-down overlay proportional to remaining cooldown, plus seconds text.
 */
function updateMobileBtnCooldown(btn: HTMLElement, cooldownRemaining: number, cooldownTotal: number): void {
  const cdOverlay = btn.querySelector('.mobile-btn-cd-overlay') as HTMLElement;
  const cdText = btn.querySelector('.mobile-btn-cd-text') as HTMLElement;
  if (!cdOverlay || !cdText) return;

  if (cooldownRemaining > 0) {
    btn.classList.remove('ready');
    const ratio = cooldownRemaining / cooldownTotal;
    cdOverlay.style.height = (ratio * 100) + '%';
    cdText.style.display = 'block';
    cdText.textContent = Math.ceil(cooldownRemaining / 1000).toString();
  } else {
    btn.classList.add('ready');
    cdOverlay.style.height = '0%';
    cdText.style.display = 'none';
  }
}

export function updateHUD(gameState: any) {
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

  // Bullet time meter
  if (bulletTimeFill) {
    const btPct = getBulletTimeResource() / getBulletTimeMax();
    bulletTimeFill.style.width = (btPct * 100) + '%';
    const btActive = isBulletTimeActive();
    bulletTimeFill.style.backgroundColor = btActive ? '#ffcc44' : '#6688ff';
    if (bulletTimeMeter) {
      bulletTimeMeter.style.borderColor = btActive
        ? 'rgba(255, 204, 68, 0.6)'
        : 'rgba(100, 140, 255, 0.3)';
    }
  }

  // Ability cooldowns — update both desktop slots and mobile buttons
  for (const [key, state] of Object.entries(gameState.abilities)) {
    if (!(ABILITIES as any)[key]) continue;
    const cfg = (ABILITIES as any)[key];

    // --- Desktop ability slot ---
    const slot = document.getElementById(`ability-${key}`);
    if (slot) {
      const overlay = slot.querySelector('.ability-cooldown-overlay') as any;
      const cdText = slot.querySelector('.ability-cooldown-text') as any;

      if ((state as any).cooldownRemaining > 0) {
        const pctRemaining = Math.max(0, (state as any).cooldownRemaining / cfg.cooldown);
        overlay.style.height = (pctRemaining * 100) + '%';
        slot.classList.remove('ready');
        const secs = Math.ceil((state as any).cooldownRemaining / 1000);
        cdText.textContent = secs;
        cdText.style.display = 'flex';
      } else {
        overlay.style.height = '0%';
        slot.classList.add('ready');
        cdText.style.display = 'none';
      }

      // Show charging state for ultimate (Force Push)
      if (key === 'ultimate' && (state as any).charging) {
        const chargePct = Math.round((state as any).chargeT * 100);
        slot.style.borderColor = 'rgba(68, 255, 170, 0.8)';
        slot.style.boxShadow = '0 0 12px rgba(68, 255, 170, 0.4)';
        cdText.textContent = chargePct + '%';
        cdText.style.display = 'flex';
        cdText.style.color = '#44ffaa';
        overlay.style.height = ((1 - (state as any).chargeT) * 100) + '%';
        overlay.style.backgroundColor = 'rgba(68, 255, 170, 0.3)';
      } else {
        if (slot.style.borderColor) slot.style.borderColor = '';
        if (slot.style.boxShadow) slot.style.boxShadow = '';
        cdText.style.color = '';
        overlay.style.backgroundColor = '';
      }
    }

  }

  // --- Mobile action button cooldowns ---
  if (mobileBtnAttack) {
    // Attack/Push button shows force push cooldown
    const ult = gameState.abilities.ultimate;
    updateMobileBtnCooldown(mobileBtnAttack, ult.cooldownRemaining, (ABILITIES as any).ultimate.cooldown);

    // If charging, show charge progress with a distinct color
    const cdOverlay = mobileBtnAttack.querySelector('.mobile-btn-cd-overlay') as HTMLElement;
    if (cdOverlay) {
      if (ult.charging) {
        cdOverlay.style.height = ((1 - ult.chargeT) * 100) + '%';
        cdOverlay.style.background = 'rgba(255, 200, 0, 0.4)';
      } else {
        cdOverlay.style.background = 'rgba(0,0,0,0.6)';
      }
    }
  }

  if (mobileBtnDash) {
    const dash = gameState.abilities.dash;
    updateMobileBtnCooldown(mobileBtnDash, dash.cooldownRemaining, (ABILITIES as any).dash.cooldown);
  }

  if (mobileBtnLaunch) {
    // Launch cooldown is tracked in player.ts, not gameState.abilities
    const launchCdRemaining = getLaunchCooldownTimer();
    updateMobileBtnCooldown(mobileBtnLaunch, launchCdRemaining, LAUNCH.cooldown);
  }

  // Cancel button: show active state when there's something to cancel
  if (mobileBtnCancel) {
    const hasActiveVerb = playerHasTag(TAG.AERIAL);
    const isCharging = gameState.abilities.ultimate.charging;
    mobileBtnCancel.classList.toggle('active', hasActiveVerb || isCharging);
  }
}
