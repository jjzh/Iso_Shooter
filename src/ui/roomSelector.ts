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
    nameSpan.textContent = `${index + 1}. ${room.name}`;
    btn.appendChild(nameSpan);

    const descSpan = document.createElement('span');
    descSpan.className = 'room-desc';
    descSpan.textContent = room.commentary;
    btn.appendChild(descSpan);

    const handleClick = () => {
      if (onSelectCallback) onSelectCallback(index);
    };

    btn.addEventListener('click', handleClick);
    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      handleClick();
    });

    listEl.appendChild(btn);
  });
}
