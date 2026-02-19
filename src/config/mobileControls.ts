// src/config/mobileControls.ts
// Tunable config for mobile radial button layout.
// Mutated directly by the tuning panel at runtime.

export const MOBILE_CONTROLS = {
  // Layout
  primarySize: 85,       // px — Attack/Push button
  fanSize: 60,           // px — Dash, Jump, Launch
  cancelSize: 45,        // px — Cancel button
  arcRadius: 100,        // px — distance from primary center to fan buttons
  arcStartAngle: 10,     // degrees — 0=left, 90=up; 10 = slightly above left
  arcSpread: 80,         // degrees — total angle spread across fan buttons
  edgeMargin: 20,        // px — offset from screen edge

  // Behavior
  holdThreshold: 180,    // ms — tap vs hold on Attack/Push button
  dragThreshold: 15,     // px — min distance to register as drag
  dragMaxRadius: 80,     // px — full deflection range for drag-to-aim
};
