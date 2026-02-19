// Profile Manager — switches active profile between rooms
// Each profile represents a different prototype branch's mechanics.
// Cleanup/setup hooks let future phases register branch-specific teardown.

import type { PlayerProfile } from '../types/index';

export type ProfileCleanupFn = () => void;
export type ProfileSetupFn = () => void;

export interface ProfileHooks {
  cleanup: ProfileCleanupFn;
  setup: ProfileSetupFn;
}

let activeProfile: PlayerProfile = 'base';
let currentHooks: ProfileHooks | null = null;

export function getActiveProfile(): PlayerProfile {
  return activeProfile;
}

export function setProfile(profile: PlayerProfile, hooks?: ProfileHooks): void {
  // Cleanup old profile
  if (currentHooks) {
    currentHooks.cleanup();
  }

  activeProfile = profile;
  currentHooks = hooks ?? null;

  // Setup new profile
  if (currentHooks) {
    currentHooks.setup();
  }
}

export function resetProfile(): void {
  if (currentHooks) {
    currentHooks.cleanup();
  }
  activeProfile = 'base';
  currentHooks = null;
}
