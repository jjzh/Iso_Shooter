import { describe, it, expect } from 'vitest';
import { getActiveProfile, setProfile, resetProfile } from '../src/engine/profileManager';

describe('profileManager', () => {
  it('should default to base profile', () => {
    resetProfile();
    expect(getActiveProfile()).toBe('base');
  });

  it('setProfile should change the active profile', () => {
    setProfile('vertical');
    expect(getActiveProfile()).toBe('vertical');
    resetProfile();
  });

  it('setProfile should call cleanup for old profile', () => {
    const calls: string[] = [];
    setProfile('base', {
      cleanup: () => { calls.push('cleanup'); },
      setup: () => { calls.push('setup'); },
    });
    setProfile('vertical');
    expect(calls).toContain('cleanup');
    resetProfile();
  });

  it('setProfile should call setup for new profile', () => {
    const calls: string[] = [];
    setProfile('assassin', {
      cleanup: () => {},
      setup: () => { calls.push('setup'); },
    });
    expect(calls).toContain('setup');
    resetProfile();
  });

  it('setProfile to same profile should still run cleanup + setup', () => {
    const calls: string[] = [];
    // First set with hooks so there's something to cleanup
    setProfile('base', {
      cleanup: () => { calls.push('cleanup'); },
      setup: () => {},
    });
    calls.length = 0; // reset after initial setup
    // Now set to same profile again — should cleanup old + setup new
    setProfile('base', {
      cleanup: () => { calls.push('cleanup2'); },
      setup: () => { calls.push('setup2'); },
    });
    expect(calls).toEqual(['cleanup', 'setup2']);
    resetProfile();
  });

  it('resetProfile should cleanup and return to base', () => {
    const calls: string[] = [];
    setProfile('vertical', {
      cleanup: () => { calls.push('cleanup'); },
      setup: () => {},
    });
    resetProfile();
    expect(getActiveProfile()).toBe('base');
    expect(calls).toContain('cleanup');
  });
});
