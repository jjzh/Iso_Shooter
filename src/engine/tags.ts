// Gameplay Tag System — lightweight hierarchical labels for state management.
// Inspired by Unreal GAS Gameplay Tags. Any system can add/remove tags on any
// owner (player, enemy, zone). Other systems query tags for activation conditions,
// blocking rules, and state differentiation.
//
// Tags are dot-separated strings: "State.Aerial.Float"
// Hierarchical matching: hasTag(owner, "State.Aerial") returns true if owner has
// "State.Aerial" OR any child like "State.Aerial.Float".

// ─── Per-Owner Storage ───

const tagSets = new Map<any, Set<string>>();

function ensureSet(owner: any): Set<string> {
  let set = tagSets.get(owner);
  if (!set) {
    set = new Set();
    tagSets.set(owner, set);
  }
  return set;
}

// ─── Core API ───

export function addTag(owner: any, tag: string): void {
  ensureSet(owner).add(tag);
}

export function removeTag(owner: any, tag: string): void {
  const set = tagSets.get(owner);
  if (set) set.delete(tag);
}

/** Exact match only — "State.Aerial" does NOT match "State.Aerial.Float" */
export function hasExactTag(owner: any, tag: string): boolean {
  const set = tagSets.get(owner);
  return set ? set.has(tag) : false;
}

/** Hierarchical match — hasTag(o, "State.Aerial") matches "State.Aerial"
 *  or any child like "State.Aerial.Float", "State.Aerial.Dunk", etc. */
export function hasTag(owner: any, tag: string): boolean {
  const set = tagSets.get(owner);
  if (!set) return false;
  if (set.has(tag)) return true;
  const prefix = tag + '.';
  for (const t of set) {
    if (t.startsWith(prefix)) return true;
  }
  return false;
}

/** True if owner has ANY of the given tags (hierarchical match) */
export function hasAnyTag(owner: any, tags: string[]): boolean {
  return tags.some(t => hasTag(owner, t));
}

/** True if owner has ALL of the given tags (hierarchical match) */
export function hasAllTags(owner: any, tags: string[]): boolean {
  return tags.every(t => hasTag(owner, t));
}

/** Remove exact tag + all children matching prefix */
export function removeTagsMatching(owner: any, prefix: string): void {
  const set = tagSets.get(owner);
  if (!set) return;
  const dotPrefix = prefix + '.';
  for (const tag of [...set]) {
    if (tag === prefix || tag.startsWith(dotPrefix)) {
      set.delete(tag);
    }
  }
}

/** Get all tags on an owner (debugging / tuning panel) */
export function getTags(owner: any): string[] {
  const set = tagSets.get(owner);
  return set ? [...set] : [];
}

/** Remove all tags from an owner */
export function clearTags(owner: any): void {
  tagSets.delete(owner);
}

/** Remove all tags from all owners (game reset) */
export function clearAllTags(): void {
  tagSets.clear();
}

// ─── Player Convenience API ───
// Single-player game — avoid passing owner for every player tag query.

const PLAYER_OWNER = Symbol('player');

export function addPlayerTag(tag: string): void {
  addTag(PLAYER_OWNER, tag);
}

export function removePlayerTag(tag: string): void {
  removeTag(PLAYER_OWNER, tag);
}

export function playerHasTag(tag: string): boolean {
  return hasTag(PLAYER_OWNER, tag);
}

export function removePlayerTagsMatching(prefix: string): void {
  removeTagsMatching(PLAYER_OWNER, prefix);
}

export function clearPlayerTags(): void {
  clearTags(PLAYER_OWNER);
}

export function getPlayerTags(): string[] {
  return getTags(PLAYER_OWNER);
}

// ─── Well-Known Tag Constants ───
// Centralized to prevent typos. Add new tags here as systems grow.

export const TAG = {
  // Aerial verb states (added/removed by aerial verb framework)
  AERIAL:         'State.Aerial',
  AERIAL_RISING:  'State.Aerial.Rising',
  AERIAL_FLOAT:   'State.Aerial.Float',
  AERIAL_DUNK:    'State.Aerial.Dunk',
  AERIAL_SPIKE:   'State.Aerial.Spike',

  // General player states (future — wire these as needed)
  AIRBORNE:       'State.Airborne',

  // Shared states (applicable to any entity)
  STUNNED:        'State.Stunned',
} as const;
