// src/config/mobileControls.ts
// Tunable config for mobile radial button layout.
// Mutated directly by the tuning panel at runtime.

export const MOBILE_CONTROLS = {
  // Layout
  primarySize: 95,       // px — Attack/Push button
  fanSize: 66,           // px — Dash, Jump, Launch
  cancelSize: 45,        // px — Cancel button
  arcRadius: 100,        // px — distance from primary center to fan buttons
  arcStartAngle: -5,     // degrees — 0=left, 90=up; -5 puts Dash near horizontal
  arcSpread: 95,         // degrees — total angle spread: Dash=-5°, Jump=42.5°, Launch=90°
  edgeMargin: 20,        // px — offset from screen edge

  // Behavior
  holdThreshold: 180,    // ms — tap vs hold on Attack/Push button
  dragThreshold: 15,     // px — min distance to register as drag
  dragMaxRadius: 80,     // px — full deflection range for drag-to-aim
};
