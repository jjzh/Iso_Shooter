import { describe, it, expect, beforeEach } from 'vitest';
import {
  addTag, removeTag, hasExactTag, hasTag, hasAnyTag, hasAllTags,
  removeTagsMatching, getTags, clearTags, clearAllTags,
  addPlayerTag, removePlayerTag, playerHasTag, removePlayerTagsMatching,
  clearPlayerTags, getPlayerTags,
  TAG,
} from '../src/engine/tags';

describe('Gameplay Tag System', () => {
  const owner = { name: 'testEntity' };

  beforeEach(() => {
    clearAllTags();
  });

  // ─── Core API ───

  describe('addTag / removeTag', () => {
    it('adds and removes tags', () => {
      addTag(owner, 'State.Aerial');
      expect(hasExactTag(owner, 'State.Aerial')).toBe(true);
      removeTag(owner, 'State.Aerial');
      expect(hasExactTag(owner, 'State.Aerial')).toBe(false);
    });

    it('handles removing non-existent tag', () => {
      removeTag(owner, 'State.Nonexistent');
      expect(getTags(owner)).toEqual([]);
    });

    it('adding duplicate tag is idempotent', () => {
      addTag(owner, 'State.Aerial');
      addTag(owner, 'State.Aerial');
      expect(getTags(owner)).toEqual(['State.Aerial']);
    });
  });

  // ─── Exact vs Hierarchical Match ───

  describe('hasExactTag', () => {
    it('only matches exact string', () => {
      addTag(owner, 'State.Aerial.Float');
      expect(hasExactTag(owner, 'State.Aerial.Float')).toBe(true);
      expect(hasExactTag(owner, 'State.Aerial')).toBe(false);
      expect(hasExactTag(owner, 'State')).toBe(false);
    });
  });

  describe('hasTag (hierarchical)', () => {
    it('matches exact tag', () => {
      addTag(owner, 'State.Aerial');
      expect(hasTag(owner, 'State.Aerial')).toBe(true);
    });

    it('parent matches child', () => {
      addTag(owner, 'State.Aerial.Float');
      expect(hasTag(owner, 'State.Aerial')).toBe(true);
      expect(hasTag(owner, 'State')).toBe(true);
    });

    it('child does NOT match parent', () => {
      addTag(owner, 'State.Aerial');
      expect(hasTag(owner, 'State.Aerial.Float')).toBe(false);
    });

    it('does not false-match partial prefix', () => {
      addTag(owner, 'State.AerialExtra');
      // "State.Aerial" should NOT match "State.AerialExtra" — only "State.Aerial." prefix
      expect(hasTag(owner, 'State.Aerial')).toBe(false);
    });

    it('returns false for unknown owner', () => {
      expect(hasTag({ unknown: true }, 'State.Aerial')).toBe(false);
    });
  });

  // ─── Multi-Tag Queries ───

  describe('hasAnyTag', () => {
    it('returns true if any tag matches', () => {
      addTag(owner, 'State.Aerial.Dunk');
      expect(hasAnyTag(owner, ['State.Ground', 'State.Aerial'])).toBe(true);
    });

    it('returns false if none match', () => {
      addTag(owner, 'State.Charging');
      expect(hasAnyTag(owner, ['State.Aerial', 'State.Dashing'])).toBe(false);
    });
  });

  describe('hasAllTags', () => {
    it('returns true only if all tags match', () => {
      addTag(owner, 'State.Aerial.Float');
      addTag(owner, 'State.Airborne');
      expect(hasAllTags(owner, ['State.Aerial', 'State.Airborne'])).toBe(true);
    });

    it('returns false if any tag is missing', () => {
      addTag(owner, 'State.Aerial');
      expect(hasAllTags(owner, ['State.Aerial', 'State.Airborne'])).toBe(false);
    });
  });

  // ─── Batch Operations ───

  describe('removeTagsMatching', () => {
    it('removes exact tag and all children', () => {
      addTag(owner, 'State.Aerial');
      addTag(owner, 'State.Aerial.Float');
      addTag(owner, 'State.Aerial.Dunk');
      addTag(owner, 'State.Airborne');

      removeTagsMatching(owner, 'State.Aerial');

      expect(hasExactTag(owner, 'State.Aerial')).toBe(false);
      expect(hasExactTag(owner, 'State.Aerial.Float')).toBe(false);
      expect(hasExactTag(owner, 'State.Aerial.Dunk')).toBe(false);
      // Non-matching tag preserved
      expect(hasExactTag(owner, 'State.Airborne')).toBe(true);
    });

    it('does not remove partial prefix matches', () => {
      addTag(owner, 'State.AerialExtra');
      removeTagsMatching(owner, 'State.Aerial');
      expect(hasExactTag(owner, 'State.AerialExtra')).toBe(true);
    });
  });

  describe('clearTags / clearAllTags', () => {
    it('clearTags removes all tags from one owner', () => {
      addTag(owner, 'State.Aerial');
      addTag(owner, 'State.Airborne');
      clearTags(owner);
      expect(getTags(owner)).toEqual([]);
    });

    it('clearAllTags removes all tags from all owners', () => {
      const owner2 = { name: 'entity2' };
      addTag(owner, 'State.Aerial');
      addTag(owner2, 'State.Ground');
      clearAllTags();
      expect(getTags(owner)).toEqual([]);
      expect(getTags(owner2)).toEqual([]);
    });
  });

  // ─── Player Convenience API ───

  describe('Player convenience API', () => {
    it('addPlayerTag / playerHasTag works', () => {
      addPlayerTag('State.Aerial');
      expect(playerHasTag('State.Aerial')).toBe(true);
    });

    it('removePlayerTag works', () => {
      addPlayerTag('State.Aerial');
      removePlayerTag('State.Aerial');
      expect(playerHasTag('State.Aerial')).toBe(false);
    });

    it('playerHasTag supports hierarchical matching', () => {
      addPlayerTag('State.Aerial.Float');
      expect(playerHasTag('State.Aerial')).toBe(true);
    });

    it('removePlayerTagsMatching cleans children', () => {
      addPlayerTag('State.Aerial');
      addPlayerTag('State.Aerial.Dunk');
      addPlayerTag('State.Airborne');
      removePlayerTagsMatching('State.Aerial');
      expect(playerHasTag('State.Aerial')).toBe(false);
      expect(playerHasTag('State.Airborne')).toBe(true);
    });

    it('clearPlayerTags clears all player tags', () => {
      addPlayerTag('State.Aerial');
      addPlayerTag('State.Airborne');
      clearPlayerTags();
      expect(getPlayerTags()).toEqual([]);
    });

    it('player tags are isolated from other owners', () => {
      addPlayerTag('State.Aerial');
      addTag(owner, 'State.Ground');
      expect(playerHasTag('State.Ground')).toBe(false);
      expect(hasTag(owner, 'State.Aerial')).toBe(false);
    });
  });

  // ─── TAG Constants ───

  describe('TAG constants', () => {
    it('aerial tags form correct hierarchy', () => {
      addPlayerTag(TAG.AERIAL_FLOAT);
      expect(playerHasTag(TAG.AERIAL)).toBe(true);
      expect(playerHasTag(TAG.AERIAL_FLOAT)).toBe(true);
      expect(playerHasTag(TAG.AERIAL_DUNK)).toBe(false);
    });

    it('removeTagsMatching with TAG.AERIAL cleans all aerial subtags', () => {
      addPlayerTag(TAG.AERIAL);
      addPlayerTag(TAG.AERIAL_FLOAT);
      addPlayerTag(TAG.AIRBORNE);
      removePlayerTagsMatching(TAG.AERIAL);
      expect(playerHasTag(TAG.AERIAL)).toBe(false);
      expect(playerHasTag(TAG.AERIAL_FLOAT)).toBe(false);
      expect(playerHasTag(TAG.AIRBORNE)).toBe(true);
    });
  });
});
