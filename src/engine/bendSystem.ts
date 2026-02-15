import { getBendById } from '../config/bends';

export interface ActiveBend {
  bendId: string;
  targetType: 'physicsObject' | 'obstacle';
  targetId: number;
  target: any;
  originalValues: Record<string, number>;
}

export interface ApplyResult {
  success: boolean;
  reason?: 'no_bends_remaining' | 'opposite_pole' | 'already_applied' | 'invalid_bend' | 'invalid_target';
}

export function createBendSystem(maxBends: number) {
  let activeBends: ActiveBend[] = [];
  let remaining = maxBends;
  const max = maxBends;

  function applyBend(bendId: string, targetType: 'physicsObject' | 'obstacle', target: any): ApplyResult {
    const bend = getBendById(bendId);
    if (!bend) return { success: false, reason: 'invalid_bend' };

    if (remaining <= 0) return { success: false, reason: 'no_bends_remaining' };

    const targetId = target.id ?? 0;

    // Check if same bend already applied to this target
    const existing = activeBends.find(ab => ab.targetId === targetId && ab.targetType === targetType);
    if (existing) {
      if (existing.bendId === bendId) {
        return { success: false, reason: 'already_applied' };
      }
      // Check opposite pole
      const existingBend = getBendById(existing.bendId);
      if (existingBend && existingBend.property === bend.property) {
        return { success: false, reason: 'opposite_pole' };
      }
    }

    // Save original values before mutation
    const originalValues: Record<string, number> = {};
    for (const fx of bend.effects) {
      originalValues[fx.param] = target[fx.param];
    }

    // Apply effects
    for (const fx of bend.effects) {
      if (fx.operation === 'multiply') {
        target[fx.param] *= fx.value;
      } else if (fx.operation === 'set') {
        target[fx.param] = fx.value;
      }
    }

    activeBends.push({
      bendId,
      targetType,
      targetId,
      target,
      originalValues,
    });

    remaining--;
    return { success: true };
  }

  function resetAll(): void {
    for (const ab of activeBends) {
      for (const [param, value] of Object.entries(ab.originalValues)) {
        ab.target[param] = value;
      }
    }
    activeBends = [];
    remaining = max;
  }

  function getActiveBends(): ActiveBend[] {
    return [...activeBends];
  }

  function bendsRemaining(): number {
    return remaining;
  }

  function hasBendOnTarget(targetType: string, targetId: number): string | null {
    const found = activeBends.find(ab => ab.targetType === targetType && ab.targetId === targetId);
    return found ? found.bendId : null;
  }

  return { applyBend, resetAll, getActiveBends, bendsRemaining, hasBendOnTarget };
}
