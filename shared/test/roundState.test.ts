import { describe, expect, test } from 'vitest';
import { computeColdStartRemaining, computeTimerState, shouldRevealHint } from '../src/roundState.js';

describe('roundState', () => {
  test('computes countdown remaining seconds', () => {
    const start = new Date('2025-01-01T00:00:00.000Z');
    const now = new Date('2025-01-01T00:00:10.000Z');
    const timer = computeTimerState(start.toISOString(), 'countdown', 60, now);
    expect(timer.remainingSeconds).toBe(50);
  });

  test('reveals hint after threshold', () => {
    expect(shouldRevealHint(30, 20, false)).toBe(true);
    expect(shouldRevealHint(10, 20, false)).toBe(false);
    expect(shouldRevealHint(30, 20, true)).toBe(false);
  });

  test('computes cold start remaining', () => {
    const start = new Date('2025-01-01T00:00:00.000Z');
    const now = new Date('2025-01-01T00:00:03.000Z');
    const remaining = computeColdStartRemaining(start.toISOString(), 5, now);
    expect(remaining).toBe(2);
  });
});
