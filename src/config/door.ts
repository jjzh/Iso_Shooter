// Door config — tunable at runtime via tuning panel

export const DOOR_CONFIG = {
  unlockDuration: 1000,    // ms — door unlock animation duration
  interactRadius: 3.5,     // units — proximity for showing prompt (deprecated: walkthrough replaces interact)
  walkthroughHalfX: 1.5,   // units — half-width of walkthrough volume (inside door frame pillars at ±2)
  walkthroughHalfZ: 1.0,   // units — half-depth of walkthrough volume (thin strip crossing threshold)
  restPause: 2000,         // ms — how long before rest room door opens
};
