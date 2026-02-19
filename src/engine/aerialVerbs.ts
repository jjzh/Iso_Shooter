import { addPlayerTag, removePlayerTagsMatching, addTag, removeTag, TAG } from './tags';

export interface LaunchedEnemy {
  enemy: any;
  launchTime: number;
  claimedBy: string | null;
  gravityMult: number;
}

const launched: LaunchedEnemy[] = [];

export function registerLaunch(enemy: any): void {
  if (launched.some(e => e.enemy === enemy)) return;
  launched.push({
    enemy,
    launchTime: performance.now(),
    claimedBy: null,
    gravityMult: 1,
  });
}

export function claimLaunched(enemy: any, verbName: string): boolean {
  const entry = launched.find(e => e.enemy === enemy);
  if (!entry || entry.claimedBy !== null) return false;
  entry.claimedBy = verbName;
  return true;
}

export function releaseLaunched(enemy: any): void {
  const idx = launched.findIndex(e => e.enemy === enemy);
  if (idx !== -1) launched.splice(idx, 1);
}

export function getLaunched(): readonly LaunchedEnemy[] {
  return launched;
}

export function getUnclaimed(): LaunchedEnemy[] {
  return launched.filter(e => e.claimedBy === null);
}

export function getLaunchedEntry(enemy: any): LaunchedEnemy | undefined {
  return launched.find(e => e.enemy === enemy);
}

export function setGravityOverride(enemy: any, mult: number): void {
  const entry = launched.find(e => e.enemy === enemy);
  if (entry) entry.gravityMult = mult;
}

export function clearLaunched(): void {
  launched.length = 0;
}

// --------------- Verb Interface + Registration ---------------

export interface AerialVerb {
  name: string;
  tag?: string;          // Gameplay tag added when this verb is active
  interruptible: boolean;
  canClaim(entry: LaunchedEnemy, playerPos: any, inputState: any): boolean;
  onClaim(entry: LaunchedEnemy): void;
  update(dt: number, entry: LaunchedEnemy, playerPos: any, inputState: any): 'active' | 'complete' | 'cancel';
  onCancel(entry: LaunchedEnemy): void;
  onComplete(entry: LaunchedEnemy): void;
}

const verbs: Map<string, AerialVerb> = new Map();
let activeVerb: AerialVerb | null = null;
let activeEnemy: any | null = null;

export function registerVerb(verb: AerialVerb): void {
  verbs.set(verb.name, verb);
}

export function clearVerbs(): void {
  verbs.clear();
  activeVerb = null;
  activeEnemy = null;
}

export function getActiveVerb(): AerialVerb | null {
  return activeVerb;
}

export function getActiveEnemy(): any | null {
  return activeEnemy;
}

/** Unified check: is ANY aerial verb currently active? */
export function isAnyAerialVerbActive(): boolean {
  return activeVerb !== null;
}

export function activateVerb(verbName: string, enemy: any): void {
  const verb = verbs.get(verbName);
  if (!verb) return;
  const entry = launched.find(e => e.enemy === enemy);
  if (!entry) return;
  activeVerb = verb;
  activeEnemy = enemy;

  // Add gameplay tags — player state + enemy stunned
  addPlayerTag(TAG.AERIAL);
  if (verb.tag) addPlayerTag(verb.tag);
  addTag(enemy, TAG.STUNNED);

  verb.onClaim(entry);
}

export function transferClaim(enemy: any, toVerbName: string): void {
  const verb = verbs.get(toVerbName);
  if (!verb) return;
  const entry = launched.find(e => e.enemy === enemy);
  if (!entry) return;

  // Remove old verb's specific tag (keep State.Aerial — still in aerial state)
  if (activeVerb && activeVerb.tag) {
    // Just remove old subtag; removePlayerTagsMatching would be too aggressive
    removePlayerTagsMatching(activeVerb.tag);
  }

  entry.claimedBy = toVerbName;
  activeVerb = verb;
  activeEnemy = enemy;

  // Add new verb's tag
  if (verb.tag) addPlayerTag(verb.tag);

  verb.onClaim(entry);
}

/** Remove all aerial gameplay tags and enemy stun (called on verb end) */
function cleanupVerbTags(enemy?: any): void {
  removePlayerTagsMatching(TAG.AERIAL);
  if (enemy) removeTag(enemy, TAG.STUNNED);
}

export function updateAerialVerbs(dt: number, playerPos?: any, inputState?: any): void {
  if (!activeVerb || !activeEnemy) return;

  const entry = launched.find(e => e.enemy === activeEnemy);

  // Auto-cancel on enemy death or pit fall
  if (!entry || activeEnemy.health <= 0 || activeEnemy.fellInPit) {
    const enemyRef = activeEnemy;
    activeVerb.onCancel(entry ?? { enemy: activeEnemy, launchTime: 0, claimedBy: null, gravityMult: 1 });
    if (entry) releaseLaunched(activeEnemy);
    activeVerb = null;
    activeEnemy = null;
    cleanupVerbTags(enemyRef);
    return;
  }

  // Capture verb reference before update — verb may call transferClaim during update,
  // which changes activeVerb. We need to know if a transfer happened.
  const verbBeforeUpdate = activeVerb;

  const result = verbBeforeUpdate.update(dt, entry, playerPos, inputState);

  // Did a transfer happen during the update?
  const transferred = activeVerb !== verbBeforeUpdate;

  if (result === 'complete') {
    if (transferred) {
      // Transfer happened — the old verb returned 'complete' to signal it's done.
      // Call the OLD verb's onComplete for cleanup. Don't touch framework state
      // (transferClaim already set activeVerb/activeEnemy to the new verb).
      verbBeforeUpdate.onComplete(entry);
    } else {
      // Normal completion — no transfer
      const enemyRef = activeEnemy;
      activeVerb.onComplete(entry);
      releaseLaunched(activeEnemy);
      activeVerb = null;
      activeEnemy = null;
      cleanupVerbTags(enemyRef);
    }
  } else if (result === 'cancel') {
    if (transferred) {
      // Transfer + cancel is unusual but handle it: cancel the old verb, keep new verb
      verbBeforeUpdate.onCancel(entry);
    } else {
      const enemyRef = activeEnemy;
      activeVerb.onCancel(entry);
      releaseLaunched(activeEnemy);
      activeVerb = null;
      activeEnemy = null;
      cleanupVerbTags(enemyRef);
    }
  }
}

export function initAerialVerbs(verbsToRegister?: AerialVerb[]): void {
  if (verbsToRegister) {
    for (const verb of verbsToRegister) {
      registerVerb(verb);
    }
  }
}

export function resetAerialVerbs(): void {
  cancelActiveVerb();
  clearLaunched();
}

export function cancelActiveVerb(): void {
  if (!activeVerb || !activeEnemy) return;
  const enemyRef = activeEnemy;
  const entry = launched.find(e => e.enemy === activeEnemy);
  activeVerb.onCancel(entry ?? { enemy: activeEnemy, launchTime: 0, claimedBy: null, gravityMult: 1 });
  if (entry) releaseLaunched(activeEnemy);
  activeVerb = null;
  activeEnemy = null;
  cleanupVerbTags(enemyRef);
}
