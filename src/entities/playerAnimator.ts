// PlayerAnimator — Procedural animation state machine for the bipedal rig.
// Drives joint rotations for idle, run, dash, and end lag.
// Designed for snappy, commitment-based combat feel (Hades/HLD/Ys).
//
// Key concept: upper/lower body separation.
// - playerGroup.rotation.y = aim direction (set by player.ts, torso inherits this)
// - hip.rotation.y = offset from aim to movement direction (legs face where you're going)

import type { PlayerJoints } from './playerRig';

// ─── Tuning Config ───
// All timing/amplitude constants in one place for easy iteration.

export const C = {
  // Run cycle
  runCycleRate: 0.4,           // full leg cycles per world unit traveled
  strideAngle: 0.6,           // radians (~35°) thigh swing amplitude
  kneeBendMax: 0.8,           // radians (~45°) maximum forward knee bend
  armSwingRatio: 0.6,         // arm swing as fraction of leg amplitude
  forearmLag: 0.3,            // phase offset for forearm (secondary motion)
  bodyBounceHeight: 0.03,     // world units of vertical bounce per step
  forwardLean: 0.09,          // radians (~5°) lean into movement
  forwardLeanSpeed: 8,        // how fast lean blends in/out (per second)

  // Idle
  breathRate: 2,              // Hz
  breathAmplitude: 0.02,      // world units
  weightShiftRate: 0.8,       // Hz
  weightShiftAngle: 0.04,     // radians (~2.3°)
  headDriftRate: 0.5,         // Hz
  headDriftAngle: 0.02,       // radians (~1°)
  idleArmDroop: 0.15,         // radians — slight outward droop

  // Dash squash/stretch
  squashScaleY: 0.75,
  squashScaleXZ: 1.15,
  stretchScaleY: 1.12,
  stretchScaleXZ: 0.92,
  dashLeanAngle: 0.26,        // radians (~15°) aggressive forward lean
  dashArmSweep: -0.8,         // radians — arms swept back
  dashLegLunge: 0.7,          // radians — front leg forward
  dashLegTrail: -0.5,         // radians — back leg behind

  // Transitions (ms)
  idleToRunBlend: 80,
  runToIdleBlend: 120,
  endLagToNormalBlend: 60,

  // Upper/lower body
  hipTurnSpeed: 15,           // radians/sec — how fast legs reorient to movement direction
};

// ─── Animation State ───

export type AnimState = 'idle' | 'run' | 'dash' | 'endLag' | 'swing';

export interface AnimatorState {
  currentState: AnimState;
  prevState: AnimState;
  stateTimer: number;          // seconds in current state
  blendTimer: number;          // seconds remaining in transition blend
  blendDuration: number;       // total blend duration in seconds
  runCyclePhase: number;       // 0–1 oscillator for run cycle
  moveDir: number;             // world-space angle of movement direction (radians)
  moveDirSmoothed: number;     // lerped version for smooth leg turning
  currentLean: number;         // current forward lean (smoothed)
  dashDir: number;             // direction of dash (for squash orientation)
  dashT: number;               // 0–1 progress through dash
  time: number;                // accumulated time for idle oscillations
}

export function createAnimatorState(): AnimatorState {
  return {
    currentState: 'idle',
    prevState: 'idle',
    stateTimer: 0,
    blendTimer: 0,
    blendDuration: 0,
    runCyclePhase: 0,
    moveDir: 0,
    moveDirSmoothed: 0,
    currentLean: 0,
    dashDir: 0,
    dashT: 0,
    time: 0,
  };
}

export function resetAnimatorState(anim: AnimatorState) {
  anim.currentState = 'idle';
  anim.prevState = 'idle';
  anim.stateTimer = 0;
  anim.blendTimer = 0;
  anim.blendDuration = 0;
  anim.runCyclePhase = 0;
  anim.currentLean = 0;
  anim.dashT = 0;
  anim.time = 0;
}

// ─── Easing Functions ───

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function lerpAngle(from: number, to: number, t: number): number {
  // Shortest-path angle lerp
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

// ─── Main Update ───

export function updateAnimation(
  joints: PlayerJoints,
  anim: AnimatorState,
  dt: number,
  inputState: { moveX: number; moveZ: number },
  aimAngle: number,
  isDashing: boolean,
  isInEndLag: boolean,
  dashProgress: number,
  isSwinging: boolean = false,
  swingProgress: number = 0
): void {
  anim.time += dt;

  // ─── State Transitions ───
  const isMoving = Math.abs(inputState.moveX) > 0.01 || Math.abs(inputState.moveZ) > 0.01;
  const prevState = anim.currentState;

  if (isDashing) {
    if (anim.currentState !== 'dash') {
      transitionTo(anim, 'dash', 0); // instant
    }
    anim.dashT = dashProgress;
  } else if (isInEndLag) {
    if (anim.currentState !== 'endLag') {
      transitionTo(anim, 'endLag', 0); // instant
    }
  } else if (isSwinging) {
    if (anim.currentState !== 'swing') {
      transitionTo(anim, 'swing', 0); // instant
    }
    anim.dashT = swingProgress; // reuse dashT for swing progress
  } else if (isMoving) {
    if (anim.currentState !== 'run') {
      const blend = anim.currentState === 'endLag' || anim.currentState === 'swing'
        ? C.endLagToNormalBlend : C.idleToRunBlend;
      transitionTo(anim, 'run', blend / 1000);
    }
  } else {
    if (anim.currentState !== 'idle') {
      const blend = anim.currentState === 'endLag' || anim.currentState === 'swing'
        ? C.endLagToNormalBlend : C.runToIdleBlend;
      transitionTo(anim, 'idle', blend / 1000);
    }
  }

  anim.stateTimer += dt;
  if (anim.blendTimer > 0) {
    anim.blendTimer = Math.max(0, anim.blendTimer - dt);
  }

  // ─── Movement Direction (for hip rotation) ───
  if (isMoving) {
    anim.moveDir = Math.atan2(-inputState.moveX, -inputState.moveZ);
  }
  // Smooth hip rotation toward movement direction
  anim.moveDirSmoothed = lerpAngle(
    anim.moveDirSmoothed,
    anim.moveDir,
    Math.min(1, C.hipTurnSpeed * dt)
  );

  // ─── Apply Pose ───
  // Reset all joints to neutral first
  resetJointsToNeutral(joints);

  // Apply current state's pose
  switch (anim.currentState) {
    case 'idle':  applyIdle(joints, anim); break;
    case 'run':   applyRun(joints, anim, dt, inputState); break;
    case 'dash':  applyDash(joints, anim); break;
    case 'endLag': applyEndLag(joints, anim); break;
    case 'swing': applySwing(joints, anim); break;
  }

  // ─── Upper/Lower Body Separation ───
  // Hip rotates to face movement direction, offset from aim
  // playerGroup.rotation.y = aimAngle (set externally)
  // hip.rotation.y = moveDirSmoothed - aimAngle → legs face movement in world space
  const hipOffset = anim.moveDirSmoothed - aimAngle;
  joints.hip.rotation.y = hipOffset;

  // ─── Forward Lean (smoothed) ───
  const targetLean = (anim.currentState === 'run') ? C.forwardLean : 0;
  anim.currentLean += (targetLean - anim.currentLean) * Math.min(1, C.forwardLeanSpeed * dt);
  joints.rigRoot.rotation.x = anim.currentLean;

  // During dash, override lean
  if (anim.currentState === 'dash') {
    joints.rigRoot.rotation.x = getDashLean(anim.dashT);
  }
}

// ─── State Transition ───

function transitionTo(anim: AnimatorState, newState: AnimState, blendDuration: number) {
  anim.prevState = anim.currentState;
  anim.currentState = newState;
  anim.stateTimer = 0;
  anim.blendDuration = blendDuration;
  anim.blendTimer = blendDuration;

  // Capture dash direction from movement direction when entering dash
  if (newState === 'dash') {
    anim.dashDir = anim.moveDir;
    anim.dashT = 0;
  }
}

// ─── Reset Joints ───

function resetJointsToNeutral(joints: PlayerJoints) {
  // Reset rotations
  joints.rigRoot.rotation.set(0, 0, 0);
  joints.rigRoot.scale.set(1, 1, 1);
  joints.torso.rotation.set(0, 0, 0);
  joints.head.rotation.set(0, 0, 0);
  joints.upperArmL.rotation.set(0, 0, 0);
  joints.lowerArmL.rotation.set(0, 0, 0);
  joints.upperArmR.rotation.set(0, 0, 0);
  joints.lowerArmR.rotation.set(0, 0, 0);
  joints.thighL.rotation.set(0, 0, 0);
  joints.shinL.rotation.set(0, 0, 0);
  joints.thighR.rotation.set(0, 0, 0);
  joints.shinR.rotation.set(0, 0, 0);
  // Don't reset hip.rotation.y — set separately for upper/lower body split
  joints.hip.rotation.x = 0;
  joints.hip.rotation.z = 0;

  // Reset positions to rig defaults (prevents cumulative drift from += animations)
  joints.hip.position.y = 0.5;       // P.hipY from playerRig.ts
  joints.torso.position.y = 0.22;    // P.torsoY from playerRig.ts
}

// ─── Idle Pose ───

function applyIdle(joints: PlayerJoints, anim: AnimatorState) {
  const t = anim.time;

  // Breathing bob — torso rises and falls gently
  joints.torso.position.y += Math.sin(t * C.breathRate * Math.PI * 2) * C.breathAmplitude;

  // Weight shift — hip tilts side to side
  joints.hip.rotation.z = Math.sin(t * C.weightShiftRate * Math.PI * 2) * C.weightShiftAngle;

  // Head micro-drift — alive feel
  joints.head.rotation.y = Math.sin(t * C.headDriftRate * Math.PI * 2) * C.headDriftAngle;

  // Arms relaxed at sides — slight outward droop
  joints.upperArmL.rotation.z = C.idleArmDroop;
  joints.upperArmR.rotation.z = -C.idleArmDroop;

  // Slight forearm bend (not ramrod straight)
  joints.lowerArmL.rotation.x = -0.1;
  joints.lowerArmR.rotation.x = -0.1;
}

// ─── Run Pose ───

function applyRun(joints: PlayerJoints, anim: AnimatorState, dt: number, input: { moveX: number; moveZ: number }) {
  // Advance run cycle based on distance traveled (not time)
  const speed = Math.sqrt(input.moveX * input.moveX + input.moveZ * input.moveZ);
  const distThisFrame = speed * 5 * dt; // speed normalized to ~0-1, times PLAYER.speed
  anim.runCyclePhase = (anim.runCyclePhase + distThisFrame * C.runCycleRate) % 1;

  const phase = anim.runCyclePhase * Math.PI * 2;

  // ─── Legs ───
  // Thigh swings forward/back
  const thighSwing = Math.sin(phase) * C.strideAngle;
  joints.thighL.rotation.x = thighSwing;
  joints.thighR.rotation.x = -thighSwing;

  // Knee bends forward only (anatomically correct)
  // Offset phase so knee bends as leg swings back (follow-through)
  const kneeL = Math.max(0, Math.sin(phase - 0.6)) * C.kneeBendMax;
  const kneeR = Math.max(0, Math.sin(phase - 0.6 + Math.PI)) * C.kneeBendMax;
  joints.shinL.rotation.x = -kneeL;  // negative = bend forward (flex)
  joints.shinR.rotation.x = -kneeR;

  // ─── Arms (counter-swing) ───
  const armSwing = Math.sin(phase) * C.strideAngle * C.armSwingRatio;
  joints.upperArmL.rotation.x = -armSwing;  // opposite to same-side leg
  joints.upperArmR.rotation.x = armSwing;

  // Forearm secondary motion (delayed, more swing)
  const forearmSwing = Math.sin(phase - C.forearmLag) * C.strideAngle * C.armSwingRatio * 0.5;
  joints.lowerArmL.rotation.x = -Math.abs(forearmSwing) - 0.15; // always slightly bent
  joints.lowerArmR.rotation.x = -Math.abs(forearmSwing) - 0.15;

  // ─── Body Bounce ───
  // Hip bobs at 2× leg frequency (bounces with each step)
  const bounce = Math.abs(Math.sin(phase * 2)) * C.bodyBounceHeight;
  joints.hip.position.y = 0.5 + bounce; // base hip Y from rig + bounce

  // ─── Torso Twist ───
  // Slight counter-rotation to arm swing (natural gait)
  joints.torso.rotation.y = Math.sin(phase) * 0.06;
}

// ─── Dash Pose ───

function applyDash(joints: PlayerJoints, anim: AnimatorState) {
  const t = anim.dashT; // 0–1 through dash

  // Three sub-phases: squash (0-0.15), stretch (0.15-0.85), settle (0.85-1.0)
  if (t < 0.15) {
    // SQUASH — compress on dash start
    const subT = t / 0.15;
    const ease = easeOutQuad(subT);

    joints.rigRoot.scale.set(
      1 + (C.squashScaleXZ - 1) * ease,
      1 + (C.squashScaleY - 1) * ease,
      1 + (C.squashScaleXZ - 1) * ease
    );

    // Legs snap to wide lunge
    joints.thighL.rotation.x = C.dashLegLunge * ease;
    joints.thighR.rotation.x = C.dashLegTrail * ease;
    joints.shinL.rotation.x = -0.3 * ease;
    joints.shinR.rotation.x = -0.4 * ease;

    // Arms start sweeping back
    joints.upperArmL.rotation.x = C.dashArmSweep * ease * 0.5;
    joints.upperArmR.rotation.x = C.dashArmSweep * ease * 0.5;

  } else if (t < 0.85) {
    // STRETCH — elongate during travel
    const subT = (t - 0.15) / 0.7;
    const ease = easeOutQuad(subT);

    joints.rigRoot.scale.set(
      C.stretchScaleXZ,
      C.stretchScaleY,
      C.stretchScaleXZ
    );

    // Legs in mid-stride
    joints.thighL.rotation.x = 0.4;
    joints.thighR.rotation.x = -0.3;
    joints.shinL.rotation.x = -0.5;
    joints.shinR.rotation.x = -0.2;

    // Arms swept fully back
    joints.upperArmL.rotation.x = C.dashArmSweep;
    joints.upperArmR.rotation.x = C.dashArmSweep;
    joints.lowerArmL.rotation.x = C.dashArmSweep * 0.4;
    joints.lowerArmR.rotation.x = C.dashArmSweep * 0.4;

  } else {
    // SETTLE — snap back with slight overshoot
    const subT = (t - 0.85) / 0.15;
    const ease = easeOutBack(Math.min(subT, 1));

    // Scale returns to 1.0 with Y overshoot
    const yScale = C.stretchScaleY + (1.0 - C.stretchScaleY) * ease;
    const xzScale = C.stretchScaleXZ + (1.0 - C.stretchScaleXZ) * ease;
    joints.rigRoot.scale.set(xzScale, yScale, xzScale);

    // Legs plant into wide stance
    const legSettle = 1 - ease;
    joints.thighL.rotation.x = 0.3 * legSettle;
    joints.thighR.rotation.x = -0.2 * legSettle;
    joints.shinL.rotation.x = -0.3 * legSettle;
    joints.shinR.rotation.x = -0.1 * legSettle;

    // Arms relax
    joints.upperArmL.rotation.x = C.dashArmSweep * (1 - ease);
    joints.upperArmR.rotation.x = C.dashArmSweep * (1 - ease);
  }
}

function getDashLean(t: number): number {
  // Aggressive lean that eases in and settles out
  if (t < 0.15) {
    return C.dashLeanAngle * easeOutQuad(t / 0.15);
  } else if (t < 0.85) {
    return C.dashLeanAngle;
  } else {
    const subT = (t - 0.85) / 0.15;
    return C.dashLeanAngle * (1 - easeOutQuad(subT));
  }
}

// ─── End Lag Pose ───

function applyEndLag(joints: PlayerJoints, anim: AnimatorState) {
  // Short recovery — body settling from dash
  const t = Math.min(anim.stateTimer / 0.05, 1); // 50ms end lag
  const ease = easeOutQuad(t);

  // Scale settles to neutral
  const scaleY = 1 + (1.05 - 1) * (1 - ease); // slight overshoot settling down
  joints.rigRoot.scale.set(1, scaleY, 1);

  // Slight backward lean (deceleration)
  joints.rigRoot.rotation.x = -0.06 * (1 - ease);

  // Wide braking stance that settles
  const legSpread = 0.25 * (1 - ease);
  joints.thighL.rotation.x = legSpread;
  joints.thighR.rotation.x = -legSpread;
  joints.shinL.rotation.x = -legSpread * 0.5;
  joints.shinR.rotation.x = -legSpread * 0.5;

  // Arms settle forward
  joints.upperArmL.rotation.x = -0.2 * (1 - ease);
  joints.upperArmR.rotation.x = -0.2 * (1 - ease);
}

// ─── Melee Swing Pose ───

function applySwing(joints: PlayerJoints, anim: AnimatorState) {
  const t = clamp(anim.dashT, 0, 1); // dashT reused for swing progress

  // Two sub-phases: wind-up (0-0.3), follow-through (0.3-1.0)
  if (t < 0.3) {
    // WIND-UP — coil back, brief preparation
    const subT = t / 0.3;
    const ease = easeOutQuad(subT);

    // Right arm winds back
    joints.upperArmR.rotation.x = 0.4 * ease;    // pull back
    joints.upperArmR.rotation.z = -0.3 * ease;    // out to side
    joints.lowerArmR.rotation.x = -0.6 * ease;    // elbow bent

    // Left arm guards
    joints.upperArmL.rotation.x = -0.2 * ease;
    joints.lowerArmL.rotation.x = -0.3 * ease;

    // Torso coils opposite to swing
    joints.torso.rotation.y = -0.25 * ease;

    // Slight crouch
    joints.rigRoot.rotation.x = 0.06 * ease;
  } else {
    // FOLLOW-THROUGH — explosive sweep across body
    const subT = (t - 0.3) / 0.7;
    const ease = easeOutQuad(subT);

    // Right arm sweeps forward and across
    joints.upperArmR.rotation.x = 0.4 + (-1.0 - 0.4) * ease;   // -1.0: fully forward
    joints.upperArmR.rotation.z = -0.3 + (0.5 + 0.3) * ease;    // 0.5: across body
    joints.lowerArmR.rotation.x = -0.6 + (0.6 - 0.2) * ease;    // extend arm

    // Left arm sweeps back for counterbalance
    joints.upperArmL.rotation.x = -0.2 + (0.3 + 0.2) * ease;
    joints.lowerArmL.rotation.x = -0.3 + (-0.2 + 0.3) * ease;

    // Torso twists through — big rotation sells the swing
    joints.torso.rotation.y = -0.25 + (0.45 + 0.25) * ease;

    // Forward lean intensifies then settles
    const leanCurve = subT < 0.5 ? easeOutQuad(subT * 2) : 1 - easeOutQuad((subT - 0.5) * 2);
    joints.rigRoot.rotation.x = 0.06 + 0.08 * leanCurve;

    // Front leg plants, back leg braces
    joints.thighL.rotation.x = 0.2 * ease;
    joints.thighR.rotation.x = -0.15 * ease;
  }
}
