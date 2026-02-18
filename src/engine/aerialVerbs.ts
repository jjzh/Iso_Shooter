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

export function activateVerb(verbName: string, enemy: any): void {
  const verb = verbs.get(verbName);
  if (!verb) return;
  const entry = launched.find(e => e.enemy === enemy);
  if (!entry) return;
  activeVerb = verb;
  activeEnemy = enemy;
  verb.onClaim(entry);
}

export function updateAerialVerbs(dt: number, playerPos?: any, inputState?: any): void {
  if (!activeVerb || !activeEnemy) return;

  const entry = launched.find(e => e.enemy === activeEnemy);

  // Auto-cancel on enemy death or pit fall
  if (!entry || activeEnemy.health <= 0 || activeEnemy.fellInPit) {
    activeVerb.onCancel(entry ?? { enemy: activeEnemy, launchTime: 0, claimedBy: null, gravityMult: 1 });
    if (entry) releaseLaunched(activeEnemy);
    activeVerb = null;
    activeEnemy = null;
    return;
  }

  const result = activeVerb.update(dt, entry, playerPos, inputState);
  if (result === 'complete') {
    activeVerb.onComplete(entry);
    releaseLaunched(activeEnemy);
    activeVerb = null;
    activeEnemy = null;
  } else if (result === 'cancel') {
    activeVerb.onCancel(entry);
    releaseLaunched(activeEnemy);
    activeVerb = null;
    activeEnemy = null;
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
  const entry = launched.find(e => e.enemy === activeEnemy);
  activeVerb.onCancel(entry ?? { enemy: activeEnemy, launchTime: 0, claimedBy: null, gravityMult: 1 });
  if (entry) releaseLaunched(activeEnemy);
  activeVerb = null;
  activeEnemy = null;
}
