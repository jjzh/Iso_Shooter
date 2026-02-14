// Spawn pacing config — tunable at runtime via tuning panel

export const SPAWN_CONFIG = {
  telegraphDuration: 1500,   // ms — how long spawn warnings show before enemies appear
  spawnCooldown: 500,        // ms — minimum delay between consecutive pack dispatches
  maxConcurrentMult: 1.0,    // multiplier on per-room maxConcurrent
  spawnAheadMin: 8,          // minimum distance ahead of player to spawn enemies (Z units)
  spawnAheadMax: 15,         // maximum distance ahead of player to spawn enemies (Z units)
};
