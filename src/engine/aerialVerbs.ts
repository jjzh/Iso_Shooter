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
