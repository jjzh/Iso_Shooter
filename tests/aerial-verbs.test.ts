import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerLaunch,
  claimLaunched,
  releaseLaunched,
  getLaunched,
  getUnclaimed,
  getLaunchedEntry,
  clearLaunched,
  setGravityOverride,
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
