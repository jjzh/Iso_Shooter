// Event Bus — lightweight pub/sub for game events
// Systems emit events at key moments (damage, death, dash, etc.)
// Other systems subscribe to react (audio, particles, screen effects)
// Existing side effects (damage numbers, screen shake) are NOT migrated —
// the bus is additive. New systems subscribe; old ones stay as-is.

// ─── Event Types ───

export type GameEvent =
  | { type: 'enemyHit'; enemy: any; damage: number; position: { x: number; z: number }; wasShielded: boolean }
  | { type: 'enemyDied'; enemy: any; position: { x: number; z: number } }
  | { type: 'playerHit'; damage: number; position: { x: number; z: number } }
  | { type: 'playerDash'; direction: { x: number; z: number }; position: { x: number; z: number } }
  | { type: 'playerDashEnd' }
  | { type: 'waveCleared'; waveIndex: number }
  | { type: 'waveBegan'; waveIndex: number }
  | { type: 'shieldBreak'; enemy: any; position: { x: number; z: number } }
  | { type: 'chargeFired'; chargeT: number; direction: { x: number; z: number }; position: { x: number; z: number } }
  | { type: 'enemyPushed'; enemy: any; position: { x: number; z: number } }
  | { type: 'pitFall'; position: { x: number; z: number }; isPlayer: boolean }
  | { type: 'meleeSwing'; position: { x: number; z: number }; direction: { x: number; z: number } }
  | { type: 'meleeHit'; enemy: any; damage: number; position: { x: number; z: number } }
  | { type: 'roomCleared'; roomIndex: number }
  | { type: 'roomClearComplete'; roomIndex: number }
  | { type: 'doorUnlocked'; roomIndex: number }
  | { type: 'doorEntered'; roomIndex: number }
  | { type: 'spawnPackTelegraph'; packIndex: number; roomIndex: number }
  | { type: 'spawnPackSpawned'; packIndex: number; roomIndex: number }
  | { type: 'restRoomEntered'; roomIndex: number }
  | { type: 'playerHealed'; amount: number; position: { x: number; z: number } }
  | { type: 'enemyMeleeTelegraph'; position: { x: number; z: number }; facingAngle: number; hitArc: number; hitRange: number; duration: number }
  | { type: 'wallSlam'; enemy: any; speed: number; damage: number; position: { x: number; z: number } }
  | { type: 'enemyImpact'; enemyA: any; enemyB: any; speed: number; damage: number; position: { x: number; z: number } }
  | { type: 'bulletTimeActivated' }
  | { type: 'bulletTimeDeactivated' }
  | { type: 'playerJump'; position: { x: number; z: number } }
  | { type: 'playerLand'; position: { x: number; z: number }; fallSpeed: number }
  | { type: 'enemyLaunched'; enemy: any; position: { x: number; z: number }; velocity: number }
  | { type: 'aerialStrike'; enemy: any; damage: number; position: { x: number; z: number } }
  | { type: 'playerSlam'; position: { x: number; z: number }; fallSpeed: number }
  | { type: 'dunkGrab'; enemy: any; position: { x: number; z: number } }
  | { type: 'dunkImpact'; enemy: any; damage: number; position: { x: number; z: number } };

// ─── Bus Implementation ───

type EventType = GameEvent['type'];
type ListenerFn = (event: GameEvent) => void;

const listeners: Map<EventType, Set<ListenerFn>> = new Map();

export function emit(event: GameEvent): void {
  const set = listeners.get(event.type);
  if (!set) return;
  for (const fn of set) {
    fn(event);
  }
}

export function on(type: EventType, callback: ListenerFn): void {
  let set = listeners.get(type);
  if (!set) {
    set = new Set();
    listeners.set(type, set);
  }
  set.add(callback);
}

export function off(type: EventType, callback: ListenerFn): void {
  const set = listeners.get(type);
  if (set) {
    set.delete(callback);
  }
}

// Clear all listeners — call on game reset if needed
export function clearAllListeners(): void {
  listeners.clear();
}
