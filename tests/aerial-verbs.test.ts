import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerLaunch,
  claimLaunched,
  releaseLaunched,
  getLaunched,
  getUnclaimed,
  getLaunchedEntry,
  clearLaunched,
  setGravityOverride,
  registerVerb,
  getActiveVerb,
  getActiveEnemy,
  activateVerb,
  updateAerialVerbs,
  cancelActiveVerb,
  clearVerbs,
} from '../src/engine/aerialVerbs';

function makeEnemy(id: number) {
  return { pos: { x: 0, y: 2, z: 0 }, vel: { x: 0, y: 5, z: 0 }, health: 50, id } as any;
}

describe('Aerial Verb Registry', () => {
  beforeEach(() => clearLaunched());

  it('registerLaunch adds enemy to registry', () => {
    const e = makeEnemy(1);
    registerLaunch(e);
    expect(getLaunched()).toHaveLength(1);
    expect(getLaunched()[0].enemy).toBe(e);
  });

  it('registered enemy starts unclaimed with gravityMult 1', () => {
    const e = makeEnemy(1);
    registerLaunch(e);
    const entry = getLaunched()[0];
    expect(entry.claimedBy).toBeNull();
    expect(entry.gravityMult).toBe(1);
  });

  it('getUnclaimed returns only unclaimed entries', () => {
    const e1 = makeEnemy(1);
    const e2 = makeEnemy(2);
    registerLaunch(e1);
    registerLaunch(e2);
    claimLaunched(e1, 'dunk');
    expect(getUnclaimed()).toHaveLength(1);
    expect(getUnclaimed()[0].enemy).toBe(e2);
  });

  it('claimLaunched sets claimedBy', () => {
    const e = makeEnemy(1);
    registerLaunch(e);
    claimLaunched(e, 'dunk');
    expect(getLaunched()[0].claimedBy).toBe('dunk');
  });

  it('claimLaunched returns false for already-claimed enemy', () => {
    const e = makeEnemy(1);
    registerLaunch(e);
    expect(claimLaunched(e, 'dunk')).toBe(true);
    expect(claimLaunched(e, 'spike')).toBe(false);
  });

  it('claimLaunched returns false for unregistered enemy', () => {
    const e = makeEnemy(1);
    expect(claimLaunched(e, 'dunk')).toBe(false);
  });

  it('releaseLaunched removes enemy from registry', () => {
    const e = makeEnemy(1);
    registerLaunch(e);
    releaseLaunched(e);
    expect(getLaunched()).toHaveLength(0);
  });

  it('setGravityOverride changes gravityMult', () => {
    const e = makeEnemy(1);
    registerLaunch(e);
    setGravityOverride(e, 0);
    expect(getLaunched()[0].gravityMult).toBe(0);
  });

  it('setGravityOverride does nothing for unregistered enemy', () => {
    const e = makeEnemy(1);
    setGravityOverride(e, 0);
  });

  it('duplicate registerLaunch is ignored', () => {
    const e = makeEnemy(1);
    registerLaunch(e);
    registerLaunch(e);
    expect(getLaunched()).toHaveLength(1);
  });

  it('clearLaunched empties the registry', () => {
    registerLaunch(makeEnemy(1));
    registerLaunch(makeEnemy(2));
    clearLaunched();
    expect(getLaunched()).toHaveLength(0);
  });
});

// --------------- Verb Registration + Dispatch ---------------

function makeTestVerb(name: string, canClaimResult = true) {
  return {
    name,
    interruptible: true,
    canClaim: () => canClaimResult,
    onClaim: vi.fn(),
    update: vi.fn().mockReturnValue('active' as const),
    onCancel: vi.fn(),
    onComplete: vi.fn(),
  };
}

describe('Verb Registration + Dispatch', () => {
  beforeEach(() => {
    clearLaunched();
    clearVerbs();
  });

  it('registerVerb stores verb for later dispatch', () => {
    const verb = makeTestVerb('testVerb');
    registerVerb(verb);
    // No error — just verifying it doesn't throw
  });

  it('getActiveVerb returns null when no verb is active', () => {
    expect(getActiveVerb()).toBeNull();
  });

  it('getActiveEnemy returns null when no verb is active', () => {
    expect(getActiveEnemy()).toBeNull();
  });

  it('activateVerb sets active verb and calls onClaim', () => {
    const verb = makeTestVerb('dunk');
    registerVerb(verb);
    const e = makeEnemy(1);
    registerLaunch(e);
    claimLaunched(e, 'dunk');
    activateVerb('dunk', e);
    expect(getActiveVerb()).toBe(verb);
    expect(getActiveEnemy()).toBe(e);
    expect(verb.onClaim).toHaveBeenCalled();
  });

  it('updateAerialVerbs calls update on active verb', () => {
    const verb = makeTestVerb('dunk');
    registerVerb(verb);
    const e = makeEnemy(1);
    registerLaunch(e);
    claimLaunched(e, 'dunk');
    activateVerb('dunk', e);
    updateAerialVerbs(0.016);
    expect(verb.update).toHaveBeenCalled();
  });

  it('updateAerialVerbs handles complete return', () => {
    const verb = makeTestVerb('dunk');
    verb.update = vi.fn().mockReturnValue('complete');
    registerVerb(verb);
    const e = makeEnemy(1);
    registerLaunch(e);
    claimLaunched(e, 'dunk');
    activateVerb('dunk', e);
    updateAerialVerbs(0.016);
    expect(verb.onComplete).toHaveBeenCalled();
    expect(getActiveVerb()).toBeNull();
    expect(getLaunched()).toHaveLength(0); // released
  });

  it('updateAerialVerbs handles cancel return', () => {
    const verb = makeTestVerb('dunk');
    verb.update = vi.fn().mockReturnValue('cancel');
    registerVerb(verb);
    const e = makeEnemy(1);
    registerLaunch(e);
    claimLaunched(e, 'dunk');
    activateVerb('dunk', e);
    updateAerialVerbs(0.016);
    expect(verb.onCancel).toHaveBeenCalled();
    expect(getActiveVerb()).toBeNull();
  });

  it('updateAerialVerbs auto-cancels on enemy death', () => {
    const verb = makeTestVerb('dunk');
    registerVerb(verb);
    const e = makeEnemy(1);
    registerLaunch(e);
    claimLaunched(e, 'dunk');
    activateVerb('dunk', e);
    e.health = 0; // enemy died
    updateAerialVerbs(0.016);
    expect(verb.onCancel).toHaveBeenCalled();
    expect(getActiveVerb()).toBeNull();
  });

  it('updateAerialVerbs auto-cancels on pit fall', () => {
    const verb = makeTestVerb('dunk');
    registerVerb(verb);
    const e = makeEnemy(1);
    registerLaunch(e);
    claimLaunched(e, 'dunk');
    activateVerb('dunk', e);
    e.fellInPit = true;
    updateAerialVerbs(0.016);
    expect(verb.onCancel).toHaveBeenCalled();
    expect(getActiveVerb()).toBeNull();
  });

  it('cancelActiveVerb calls onCancel and clears state', () => {
    const verb = makeTestVerb('dunk');
    registerVerb(verb);
    const e = makeEnemy(1);
    registerLaunch(e);
    claimLaunched(e, 'dunk');
    activateVerb('dunk', e);
    cancelActiveVerb();
    expect(verb.onCancel).toHaveBeenCalled();
    expect(getActiveVerb()).toBeNull();
    expect(getActiveEnemy()).toBeNull();
  });

  it('updateAerialVerbs does nothing when no verb is active', () => {
    // Should not throw
    updateAerialVerbs(0.016);
  });
});
