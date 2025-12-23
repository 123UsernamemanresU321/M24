import { describe, expect, test } from 'vitest';
import { solveCard } from '../src/solver.js';
import { createSeededRng, randomInt } from '../src/random.js';

describe('solver', () => {
  test('finds solution for known solvable set', () => {
    const result = solveCard([1, 3, 4, 6], 24);
    expect(result.solutionCount).toBeGreaterThan(0);
    expect(result.dotTier).toBeGreaterThanOrEqual(1);
    expect(result.dotTier).toBeLessThanOrEqual(4);
  });

  test('seeded RNG is deterministic', () => {
    const rngA = createSeededRng(123);
    const rngB = createSeededRng(123);
    const seriesA = [randomInt(rngA, 1, 9), randomInt(rngA, 1, 9), randomInt(rngA, 1, 9)];
    const seriesB = [randomInt(rngB, 1, 9), randomInt(rngB, 1, 9), randomInt(rngB, 1, 9)];
    expect(seriesA).toEqual(seriesB);
  });
});
