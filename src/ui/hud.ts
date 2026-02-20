import { ABILITIES } from '../config/abilities';
import { PLAYER } from '../config/player';
import {
  triggerDash, triggerUltimate, setUltimateHeld,
  triggerJump, triggerLaunch, triggerCancel,
  setAimFromScreenDrag, setAbilityDirOverride, clearAbilityDirOverride,
  getInputState
} from '../engine/input';
import { MOBILE_CONTROLS } from '../config/mobileControls';
import { isBulletTimeActive, getBulletTimeResource, getBulletTimeMax } from '../engine/bulletTime';
import { getCurrentRoomIndex, getCurrentRoomName } from '../engine/roomManager';
import { getActiveProfile } from '../engine/profileManager';
import { getBendsRemaining, getMaxBends } from '../engine/bendMode';
import { on } from '../engine/events';

// Which abilities are active per profile (unlocked = visible, rest grayed out)
const PROFILE_ABILITIES: Record<string, string[]> = {
  origin:         ['dash'],
  base:           ['dash', 'ultimate'],
  assassin:       ['dash', 'ultimate'],
  'rule-bending': ['dash', 'ultimate'],
  vertical:       ['dash', 'ultimate'],
};

// Per-profile label overrides for ability slots (key → display name)
const PROFILE_ABILITY_LABELS: Record<string, Record<string, string>> = {
  vertical: { ultimate: 'Launch / Dunk' },
};

let healthBar: any, healthText: any, waveIndicator: any, currencyCount: any, abilityBar: any;
let bulletTimeMeter: any, bulletTimeFill: any;
let btVignette: any, btCeremony: any;
let btCeremonyTimeout: any = null;

// Mobile action button refs
let mobileBtnDash: any, mobileBtnUlt: any, mobileBtnBend: any;
let mobileBtnJump: any, mobileBtnLaunch: any, mobileBtnCancel: any;
let lastMobileProfile: string = '';

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

  // Bend counter (visible only in rule-bending rooms)
  const bendCounter = document.createElement('div');
  bendCounter.id = 'bend-counter';
  bendCounter.style.cssText = `
    position: fixed;
    top: 60px;
    left: 16px;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    color: rgba(100, 180, 255, 0.9);
    letter-spacing: 2px;
    text-shadow: 0 0 8px rgba(100, 140, 255, 0.4);
    display: none;
    pointer-events: none;
  `;
  document.body.appendChild(bendCounter);

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
  mobileBtnJump = document.getElementById('mobile-btn-jump');
  mobileBtnLaunch = document.getElementById('mobile-btn-launch');
  mobileBtnCancel = document.getElementById('mobile-btn-cancel');

  if (!mobileBtnDash) return;

  // --- Dash: drag-to-aim, release to fire ---
  setupDragToAim(mobileBtnDash, {
    onDragStart: () => { /* don't trigger yet — wait for release */ },
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
    onCancel: () => {
      clearAbilityDirOverride();
    },
  });

  // --- Ultimate (Push): drag-to-aim, charge while held ---
  if (mobileBtnUlt) {
    setupDragToAim(mobileBtnUlt, {
      onDragStart: () => {
        triggerUltimate();
        setUltimateHeld(true);
      },
      onDragMove: (normX: number, normY: number) => {
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

  // --- Jump: simple tap ---
  if (mobileBtnJump) {
    mobileBtnJump.addEventListener('touchstart', (e: any) => {
      e.preventDefault();
      triggerJump();
    });
  }

  // --- Launch: simple tap ---
  if (mobileBtnLaunch) {
    mobileBtnLaunch.addEventListener('touchstart', (e: any) => {
      e.preventDefault();
      triggerLaunch();
    });
  }

  // --- Cancel: simple tap ---
  if (mobileBtnCancel) {
    mobileBtnCancel.addEventListener('touchstart', (e: any) => {
      e.preventDefault();
      triggerCancel();
    });
  }

  // --- Bend toggle: wire existing HTML button ---
  mobileBtnBend = document.getElementById('mobile-btn-bend') as HTMLDivElement | null;
  if (mobileBtnBend) {
    mobileBtnBend.addEventListener('touchstart', (e: any) => {
      e.preventDefault();
      getInputState().bendMode = true;
    });
  }

  // Initial profile-based layout
  updateMobileButtons();
}

/**
 * Show/hide mobile buttons and position them in a radial fan based on profile.
 * Called once on init and whenever the profile changes.
 */
export function updateMobileButtons() {
  const profile = getActiveProfile();
  if (profile === lastMobileProfile) return;
  lastMobileProfile = profile;

  const allBtns = [mobileBtnDash, mobileBtnUlt, mobileBtnJump, mobileBtnLaunch, mobileBtnCancel, mobileBtnBend];

  // Hide all first
  for (const btn of allBtns) {
    if (btn) btn.classList.remove('visible');
  }

  const container = document.getElementById('mobile-actions');
  if (container) {
    container.style.right = '0px';
    container.style.bottom = '0px';
    container.style.width = '100%';
    container.style.height = '100%';
  }

  // Helper: show + size + position a button (centered on the given right/bottom point)
  const mc = MOBILE_CONTROLS;
  function placeBtn(el: any, size: number, right: number, bottom: number) {
    if (!el) return;
    el.classList.add('visible');
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el.style.right = (right - size / 2) + 'px';
    el.style.bottom = (bottom - size / 2) + 'px';
    el.style.transform = 'none';
  }

  // Fixed primary anchor: Push button always lives here
  const primaryRight = mc.edgeMargin + mc.primarySize / 2 + 10;
  const primaryBottom = window.innerHeight * 0.20;

  // Fan buttons arc above-left of the primary
  function placeFan(btns: { el: any; size: number }[]) {
    const count = btns.length;
    for (let i = 0; i < count; i++) {
      const { el, size } = btns[i];
      const angleDeg = mc.arcStartAngle + (count > 1 ? (mc.arcSpread * i) / (count - 1) : 0);
      const angleRad = (angleDeg * Math.PI) / 180;
      const r = mc.arcRadius;
      const right = primaryRight + Math.cos(angleRad) * r;
      const bottom = primaryBottom + Math.sin(angleRad) * r;
      placeBtn(el, size, right, bottom);
    }
  }

  // Cancel sits directly above the primary
  function placeCancel() {
    placeBtn(mobileBtnCancel, mc.cancelSize, primaryRight, primaryBottom + mc.arcRadius + 10);
  }

  if (profile === 'origin') {
    // Origin: just dash
    placeBtn(mobileBtnDash, mc.fanSize, primaryRight, primaryBottom);
  } else if (profile === 'vertical') {
    // Vertical: Push (primary) + Dash, Jump, Launch (fan) + Cancel (above)
    placeBtn(mobileBtnUlt, mc.primarySize, primaryRight, primaryBottom);
    placeFan([
      { el: mobileBtnDash, size: mc.fanSize },
      { el: mobileBtnJump, size: mc.fanSize },
      { el: mobileBtnLaunch, size: mc.fanSize },
    ]);
    placeCancel();
  } else if (profile === 'rule-bending') {
    // Rule-bending: Push (primary) + Dash, Bend (fan)
    placeBtn(mobileBtnUlt, mc.primarySize, primaryRight, primaryBottom);
    placeFan([
      { el: mobileBtnDash, size: mc.fanSize },
      { el: mobileBtnBend, size: mc.fanSize },
    ]);
  } else {
    // base, assassin: Push (primary) + Dash (fan)
    placeBtn(mobileBtnUlt, mc.primarySize, primaryRight, primaryBottom);
    placeFan([
      { el: mobileBtnDash, size: mc.fanSize },
    ]);
  }

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

  btnEl.addEventListener('touchstart', (e: any) => {
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
  window.addEventListener('touchmove', (e: any) => {
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

  window.addEventListener('touchend', (e: any) => {
    if (touchId === null) return;
    const touch = findTouch(e.changedTouches, touchId);
    if (!touch) return;
    touchId = null;
    onRelease(isDragging);
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

export function updateHUD(gameState: any) {
  // Update mobile button visibility when profile changes (short-circuits if same)
  updateMobileButtons();

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

  // Room indicator
  waveIndicator.textContent = `${getCurrentRoomIndex() + 1}. ${getCurrentRoomName()}`;

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

  // Ability availability — gray out abilities not active for this profile
  const profile = getActiveProfile();
  const activeAbilities = PROFILE_ABILITIES[profile] ?? ['dash', 'ultimate'];
  const labelOverrides = PROFILE_ABILITY_LABELS[profile] ?? {};
  for (const key of Object.keys(ABILITIES)) {
    const slot = document.getElementById(`ability-${key}`);
    if (slot) {
      if (activeAbilities.includes(key)) {
        slot.classList.remove('disabled');
      } else {
        slot.classList.add('disabled');
      }
      // Apply per-profile label overrides
      const nameEl = slot.querySelector('.ability-name') as HTMLElement;
      if (nameEl) {
        nameEl.textContent = labelOverrides[key] ?? (ABILITIES as any)[key].name;
      }
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

    // --- Mobile action button ---
    const mBtn = key === 'dash' ? mobileBtnDash : key === 'ultimate' ? mobileBtnUlt : null;
    if (mBtn) {
      const mOverlay = mBtn.querySelector('.mobile-btn-cd-overlay');
      const mCdText = mBtn.querySelector('.mobile-btn-cd-text');

      if ((state as any).cooldownRemaining > 0) {
        const pctRemaining = Math.max(0, (state as any).cooldownRemaining / cfg.cooldown);
        mOverlay.style.height = (pctRemaining * 100) + '%';
        mBtn.classList.remove('ready');
        const secs = Math.ceil((state as any).cooldownRemaining / 1000);
        mCdText.textContent = secs;
        mCdText.style.display = 'flex';
      } else {
        mOverlay.style.height = '0%';
        mBtn.classList.add('ready');
        mCdText.style.display = 'none';
      }

      // Charging state for ultimate
      if (key === 'ultimate' && (state as any).charging) {
        const chargePct = Math.round((state as any).chargeT * 100);
        mBtn.style.borderColor = 'rgba(68, 255, 170, 0.9)';
        mBtn.style.boxShadow = '0 0 16px rgba(68, 255, 170, 0.5)';
        mCdText.textContent = chargePct + '%';
        mCdText.style.display = 'flex';
        mCdText.style.color = '#44ffaa';
        mOverlay.style.height = ((1 - (state as any).chargeT) * 100) + '%';
        mOverlay.style.backgroundColor = 'rgba(68, 255, 170, 0.3)';
      } else if (key === 'ultimate') {
        if (mBtn.style.borderColor) mBtn.style.borderColor = '';
        if (mBtn.style.boxShadow) mBtn.style.boxShadow = '';
        mCdText.style.color = '';
        mOverlay.style.backgroundColor = '';
      }
    }
  }

  // Bend counter
  const bendCounterEl = document.getElementById('bend-counter');
  if (bendCounterEl) {
    if (getActiveProfile() === 'rule-bending') {
      bendCounterEl.style.display = 'block';
      bendCounterEl.textContent = `BENDS: ${getBendsRemaining()}/${getMaxBends()}`;
    } else {
      bendCounterEl.style.display = 'none';
    }
  }
}
