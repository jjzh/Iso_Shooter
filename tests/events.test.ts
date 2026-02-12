// Unit tests for the event bus — pure logic, no DOM/THREE deps
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { emit, on, off, clearAllListeners } from '../src/engine/events';
import type { GameEvent } from '../src/engine/events';

// Reset listeners between tests to avoid cross-contamination
beforeEach(() => {
  clearAllListeners();
});

describe('Event Bus', () => {
  // ─── on + emit ───

  it('delivers an event to a subscribed listener', () => {
    const handler = vi.fn();
    on('enemyHit', handler);

    const event: GameEvent = {
      type: 'enemyHit',
      enemy: {},
      damage: 10,
      position: { x: 1, z: 2 },
      wasShielded: false,
    };
    emit(event);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('delivers events to multiple listeners on the same type', () => {
    const a = vi.fn();
    const b = vi.fn();
    on('enemyDied', a);
    on('enemyDied', b);

    const event: GameEvent = {
      type: 'enemyDied',
      enemy: {},
      position: { x: 0, z: 0 },
    };
    emit(event);

    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('does not deliver events to listeners of a different type', () => {
    const handler = vi.fn();
    on('playerDash', handler);

    emit({
      type: 'enemyHit',
      enemy: {},
      damage: 5,
      position: { x: 0, z: 0 },
      wasShielded: false,
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('handles emit with no listeners registered (no crash)', () => {
    // Should not throw
    expect(() => {
      emit({ type: 'waveBegan', waveIndex: 0 });
    }).not.toThrow();
  });

  // ─── off ───

  it('removes a specific listener with off()', () => {
    const handler = vi.fn();
    on('playerDashEnd', handler);

    emit({ type: 'playerDashEnd' });
    expect(handler).toHaveBeenCalledOnce();

    off('playerDashEnd', handler);
    emit({ type: 'playerDashEnd' });
    expect(handler).toHaveBeenCalledOnce(); // still 1, not 2
  });

  it('off() does not affect other listeners on the same type', () => {
    const stayHandler = vi.fn();
    const removeHandler = vi.fn();
    on('waveCleared', stayHandler);
    on('waveCleared', removeHandler);

    off('waveCleared', removeHandler);

    emit({ type: 'waveCleared', waveIndex: 1 });
    expect(stayHandler).toHaveBeenCalledOnce();
    expect(removeHandler).not.toHaveBeenCalled();
  });

  it('off() is safe when called for a type with no listeners', () => {
    const handler = vi.fn();
    // Never registered — should not throw
    expect(() => off('pitFall', handler)).not.toThrow();
  });

  // ─── clearAllListeners ───

  it('clearAllListeners() removes all subscriptions', () => {
    const a = vi.fn();
    const b = vi.fn();
    on('enemyHit', a);
    on('playerDash', b);

    clearAllListeners();

    emit({
      type: 'enemyHit',
      enemy: {},
      damage: 10,
      position: { x: 0, z: 0 },
      wasShielded: false,
    });
    emit({
      type: 'playerDash',
      direction: { x: 1, z: 0 },
      position: { x: 0, z: 0 },
    });

    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  // ─── Event data integrity ───

  it('passes the full event payload to the listener', () => {
    let received: GameEvent | null = null;
    on('chargeFired', (e) => { received = e; });

    const event: GameEvent = {
      type: 'chargeFired',
      chargeT: 0.75,
      direction: { x: 0.5, z: -0.5 },
      position: { x: 3, z: 4 },
    };
    emit(event);

    expect(received).not.toBeNull();
    if (received && received.type === 'chargeFired') {
      expect(received.chargeT).toBe(0.75);
      expect(received.direction.x).toBe(0.5);
      expect(received.position.z).toBe(4);
    }
  });

  // ─── Edge cases ───

  it('allows the same function to be registered only once per type (Set behavior)', () => {
    const handler = vi.fn();
    on('enemyPushed', handler);
    on('enemyPushed', handler); // duplicate

    emit({
      type: 'enemyPushed',
      enemy: {},
      position: { x: 0, z: 0 },
    });

    expect(handler).toHaveBeenCalledOnce(); // Set deduplicates
  });

  it('handles multiple event types independently', () => {
    const hitHandler = vi.fn();
    const dashHandler = vi.fn();
    on('enemyHit', hitHandler);
    on('playerDash', dashHandler);

    emit({
      type: 'enemyHit',
      enemy: {},
      damage: 5,
      position: { x: 0, z: 0 },
      wasShielded: false,
    });

    expect(hitHandler).toHaveBeenCalledOnce();
    expect(dashHandler).not.toHaveBeenCalled();
  });
});
