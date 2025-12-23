import { describe, expect, test } from 'vitest';
import { createSeededRng } from '../src/random.js';
import { findUnsolvableNumbers, isSolvableWithOps } from '../src/solvable.js';

describe('solvable', () => {
  test('detects a solvable set', () => {
    expect(isSolvableWithOps([6, 1, 3, 4])).toBe(true);
  });

  test('detects an unsolvable set', () => {
    expect(isSolvableWithOps([1, 1, 1, 1])).toBe(false);
  });

  test('finds an unsolvable set with constrained range', () => {
    const rng = createSeededRng(42);
    const result = findUnsolvableNumbers(rng, { min: 1, max: 1, attempts: 1 });
    expect(result).toEqual([1, 1, 1, 1]);
    expect(isSolvableWithOps(result ?? [1, 1, 1, 1])).toBe(false);
  });
});
