import { describe, expect, it, vi } from 'vitest';
import { createRateLimiter } from '../src/rateLimit.js';

describe('rate limiter', () => {
  it('enforces limits within the window', () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    expect(limiter('join:1', 2, 1000)).toBe(true);
    expect(limiter('join:1', 2, 1000)).toBe(true);
    expect(limiter('join:1', 2, 1000)).toBe(false);
    vi.useRealTimers();
  });

  it('resets after the window elapses', () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    expect(limiter('submit:1', 1, 1000)).toBe(true);
    expect(limiter('submit:1', 1, 1000)).toBe(false);
    vi.setSystemTime(new Date('2025-01-01T00:00:02Z'));
    expect(limiter('submit:1', 1, 1000)).toBe(true);
    vi.useRealTimers();
  });
});
