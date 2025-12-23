import { describe, expect, test } from 'vitest';
import { computeTimerState } from '../src/roundState.js';

describe('projector sync', () => {
  test('timer advances with elapsed time', () => {
    const start = new Date('2025-01-01T00:00:00.000Z');
    const t1 = computeTimerState(start.toISOString(), 'stopwatch', 60, new Date('2025-01-01T00:00:05.000Z'));
    const t2 = computeTimerState(start.toISOString(), 'stopwatch', 60, new Date('2025-01-01T00:00:10.000Z'));
    expect(t2.elapsedSeconds).toBeGreaterThan(t1.elapsedSeconds);
  });
});
