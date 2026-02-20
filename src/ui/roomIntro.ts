// Room Intro Modal — shows room context before gameplay begins
// Semi-transparent overlay with room name, description, and Continue button

import type { RoomDefinition } from '../config/rooms';

let overlayEl: HTMLElement | null = null;
let nameEl: HTMLElement | null = null;
let textEl: HTMLElement | null = null;
let continueBtn: HTMLElement | null = null;
let currentCleanup: (() => void) | null = null;

export function initRoomIntro(): void {
  overlayEl = document.getElementById('room-intro');
  nameEl = document.getElementById('room-intro-name');
  textEl = document.getElementById('room-intro-text');
  continueBtn = document.getElementById('room-intro-continue');
}

export function showRoomIntro(room: RoomDefinition, onContinue: () => void): void {
  if (!overlayEl || !nameEl || !textEl || !continueBtn) return;

  // Clean up any previous listener
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }

  nameEl.textContent = room.name;
  textEl.textContent = room.intro ?? room.commentary;

  // Show overlay (hidden → visible with fade)
  overlayEl.classList.remove('hidden');
  // Force reflow so the opacity transition triggers
  void overlayEl.offsetWidth;
  overlayEl.classList.add('visible');

  const handleContinue = () => {
    cleanup();
    hideRoomIntro();
    onContinue();
  };

  const handleClick = () => handleContinue();
  const handleTouch = (e: Event) => {
    e.preventDefault();
    handleContinue();
  };

  continueBtn.addEventListener('click', handleClick);
  continueBtn.addEventListener('touchend', handleTouch);

  const cleanup = () => {
    continueBtn!.removeEventListener('click', handleClick);
    continueBtn!.removeEventListener('touchend', handleTouch);
    currentCleanup = null;
  };

  currentCleanup = cleanup;
}

export function hideRoomIntro(): void {
  if (!overlayEl) return;
  overlayEl.classList.remove('visible');
  // After fade-out transition, hide completely
  setTimeout(() => {
    if (overlayEl) overlayEl.classList.add('hidden');
  }, 300);
}
