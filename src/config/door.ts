// Door config — tunable at runtime via tuning panel

export const DOOR_CONFIG = {
  unlockDuration: 1000,    // ms — door unlock animation duration
  interactRadius: 3.5,     // units — how close player must be to interact with door
                           // (door is at wall edge, player clamps ~0.5u away, so needs generous radius)
  restPause: 2000,         // ms — how long before rest room door opens
};
