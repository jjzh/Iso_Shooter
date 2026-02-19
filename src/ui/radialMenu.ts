import { BENDS, RuleBend } from '../config/bends';

// ─── State ───

let containerEl: HTMLDivElement | null = null;
let optionEls: HTMLDivElement[] = [];
let visible = false;
let selectedBendId: string | null = null;
let onBendSelectedCallback: ((bendId: string) => void) | null = null;
let lockedBendIds: Set<string> = new Set();

// ─── Constants ───

const MENU_SIZE = 200;       // overall container size
const OPTION_SIZE = 72;      // each option circle
const OPTION_DISTANCE = 60;  // distance from center

// ─── Init ───

export function initRadialMenu(): void {
  // Container — centered overlay, hidden by default
  containerEl = document.createElement('div');
  containerEl.id = 'radial-menu';
  containerEl.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    width: ${MENU_SIZE}px;
    height: ${MENU_SIZE}px;
    margin-left: ${-MENU_SIZE / 2}px;
    margin-top: ${-MENU_SIZE / 2}px;
    pointer-events: none;
    z-index: 200;
    display: none;
  `;

  // Center label
  const centerLabel = document.createElement('div');
  centerLabel.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    color: rgba(200, 200, 220, 0.7);
    letter-spacing: 2px;
    text-transform: uppercase;
    pointer-events: none;
    white-space: nowrap;
  `;
  centerLabel.textContent = 'BEND';
  containerEl.appendChild(centerLabel);

  // Build option circles arranged in a line (2 options = left and right)
  const angleStep = (2 * Math.PI) / BENDS.length;
  const startAngle = Math.PI; // left — so 2 options go left/right

  for (let i = 0; i < BENDS.length; i++) {
    const bend = BENDS[i];
    const angle = startAngle + i * angleStep;
    const x = Math.cos(angle) * OPTION_DISTANCE;
    const y = Math.sin(angle) * OPTION_DISTANCE;

    const optEl = createOptionElement(bend, x, y);
    containerEl.appendChild(optEl);
    optionEls.push(optEl);
  }

  document.body.appendChild(containerEl);
}

function createOptionElement(bend: RuleBend, offsetX: number, offsetY: number): HTMLDivElement {
  const el = document.createElement('div');
  el.dataset.bendId = bend.id;
  const colorHex = '#' + bend.tintColor.toString(16).padStart(6, '0');

  el.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    width: ${OPTION_SIZE}px;
    height: ${OPTION_SIZE}px;
    margin-left: ${-OPTION_SIZE / 2 + offsetX}px;
    margin-top: ${-OPTION_SIZE / 2 + offsetY}px;
    border-radius: 50%;
    background: rgba(20, 20, 40, 0.9);
    border: 2px solid ${colorHex}44;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    pointer-events: auto;
    transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    user-select: none;
  `;

  // Icon
  const iconEl = document.createElement('div');
  iconEl.style.cssText = `
    font-size: 20px;
    line-height: 1;
    pointer-events: none;
  `;
  iconEl.textContent = bend.icon;
  el.appendChild(iconEl);

  // Name
  const nameEl = document.createElement('div');
  nameEl.style.cssText = `
    font-family: 'Courier New', monospace;
    font-size: 9px;
    color: ${colorHex};
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-top: 4px;
    pointer-events: none;
  `;
  nameEl.textContent = bend.name;
  el.appendChild(nameEl);

  // Hover
  el.addEventListener('mouseenter', () => {
    if (selectedBendId === bend.id) return;
    el.style.borderColor = colorHex + 'aa';
    el.style.transform = 'scale(1.1)';
  });
  el.addEventListener('mouseleave', () => {
    if (selectedBendId === bend.id) return;
    el.style.borderColor = colorHex + '44';
    el.style.transform = 'scale(1)';
  });

  // Click = select (mousedown to prevent attack input from firing)
  el.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (lockedBendIds.has(bend.id)) return; // locked — ignore click
    selectBend(bend.id);
  });

  return el;
}

function selectBend(bendId: string): void {
  selectedBendId = bendId;

  // Update visual state
  for (const optEl of optionEls) {
    const id = optEl.dataset.bendId || '';
    const bend = BENDS.find(b => b.id === id);
    if (!bend) continue;
    const colorHex = '#' + bend.tintColor.toString(16).padStart(6, '0');

    if (id === bendId) {
      optEl.style.borderColor = colorHex;
      optEl.style.boxShadow = `0 0 16px ${colorHex}88, inset 0 0 8px ${colorHex}44`;
      optEl.style.transform = 'scale(1.15)';
    } else {
      optEl.style.borderColor = colorHex + '22';
      optEl.style.boxShadow = 'none';
      optEl.style.transform = 'scale(0.9)';
      optEl.style.opacity = '0.5';
    }
  }

  if (onBendSelectedCallback) {
    onBendSelectedCallback(bendId);
  }
}

// ─── Public API ───

export function showRadialMenu(): void {
  if (!containerEl) return;
  visible = true;
  selectedBendId = null;
  containerEl.style.display = 'block';

  // Reset option visuals (locked bends grayed out)
  for (const optEl of optionEls) {
    const id = optEl.dataset.bendId || '';
    const bend = BENDS.find(b => b.id === id);
    if (!bend) continue;
    const colorHex = '#' + bend.tintColor.toString(16).padStart(6, '0');

    if (lockedBendIds.has(id)) {
      optEl.style.borderColor = '#44444466';
      optEl.style.boxShadow = 'none';
      optEl.style.transform = 'scale(0.85)';
      optEl.style.opacity = '0.3';
      optEl.style.pointerEvents = 'none';
      optEl.style.filter = 'grayscale(1)';
    } else {
      optEl.style.borderColor = colorHex + '44';
      optEl.style.boxShadow = 'none';
      optEl.style.transform = 'scale(1)';
      optEl.style.opacity = '1';
      optEl.style.pointerEvents = 'auto';
      optEl.style.filter = 'none';
    }
  }
}

export function hideRadialMenu(): void {
  if (!containerEl) return;
  visible = false;
  // NOTE: do NOT clear selectedBendId here — targeting mode needs it after menu hides
  containerEl.style.display = 'none';
}

export function isRadialMenuVisible(): boolean {
  return visible;
}

export function getSelectedBendId(): string | null {
  return selectedBendId;
}

export function setOnBendSelected(callback: (bendId: string) => void): void {
  onBendSelectedCallback = callback;
}

export function updateLockedBends(ids: string[]): void {
  lockedBendIds = new Set(ids);
}

export function unlockBendUI(bendId: string): void {
  lockedBendIds.delete(bendId);

  // Flash the unlocked option
  const optEl = optionEls.find(el => el.dataset.bendId === bendId);
  if (!optEl) return;
  const bend = BENDS.find(b => b.id === bendId);
  if (!bend) return;
  const colorHex = '#' + bend.tintColor.toString(16).padStart(6, '0');

  // Restore interactive styling
  optEl.style.pointerEvents = 'auto';
  optEl.style.filter = 'none';
  optEl.style.opacity = '1';
  optEl.style.transform = 'scale(1)';
  optEl.style.borderColor = colorHex;

  // Unlock flash animation — bright glow then settle
  optEl.style.boxShadow = `0 0 24px ${colorHex}, 0 0 48px ${colorHex}88`;
  optEl.style.transform = 'scale(1.3)';
  setTimeout(() => {
    optEl.style.boxShadow = 'none';
    optEl.style.transform = 'scale(1)';
    optEl.style.borderColor = colorHex + '44';
  }, 800);
}

export function clearSelectedBend(): void {
  selectedBendId = null;

  // Reset option visuals
  for (const optEl of optionEls) {
    const id = optEl.dataset.bendId || '';
    const bend = BENDS.find(b => b.id === id);
    if (!bend) continue;
    const colorHex = '#' + bend.tintColor.toString(16).padStart(6, '0');
    optEl.style.borderColor = colorHex + '44';
    optEl.style.boxShadow = 'none';
    optEl.style.transform = 'scale(1)';
    optEl.style.opacity = '1';
  }
}