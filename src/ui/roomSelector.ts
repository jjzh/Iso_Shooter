// Room Selector — populates start screen with room buttons
// Clicking a room button starts the game at that room index

import { ROOMS } from '../config/rooms';

let onSelectCallback: ((roomIndex: number) => void) | null = null;

export function initRoomSelector(onSelect: (roomIndex: number) => void): void {
  onSelectCallback = onSelect;

  const listEl = document.getElementById('room-selector-list');
  if (!listEl) return;

  // Clear any existing buttons
  while (listEl.firstChild) {
    listEl.removeChild(listEl.firstChild);
  }

  ROOMS.forEach((room, index) => {
    const btn = document.createElement('button');
    btn.className = 'room-selector-btn';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'room-name';
    const dateSuffix = room.date ? ` — ${room.date}` : '';
    nameSpan.textContent = `${index + 1}. ${room.name}${dateSuffix}`;
    btn.appendChild(nameSpan);

    const descSpan = document.createElement('span');
    descSpan.className = 'room-desc';
    descSpan.textContent = room.commentary;
    btn.appendChild(descSpan);

    const handleSelect = () => {
      if (onSelectCallback) onSelectCallback(index);
    };

    // Desktop: standard click
    btn.addEventListener('click', handleSelect);

    // Mobile: only select on tap (not scroll release)
    let touchStartY = 0;
    const TAP_THRESHOLD = 10; // px — movement beyond this means scroll, not tap
    btn.addEventListener('touchstart', (e) => {
      touchStartY = e.changedTouches[0].clientY;
    }, { passive: true });
    btn.addEventListener('touchend', (e) => {
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
      if (dy < TAP_THRESHOLD) {
        e.preventDefault(); // prevent duplicate click only on true tap
        handleSelect();
      }
    });

    listEl.appendChild(btn);
  });
}
