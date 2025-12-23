import { describe, expect, it } from 'vitest';
import { computeClaimPenalty } from '../src/multiplayer.js';

describe('computeClaimPenalty', () => {
  it('scales penalty by rank', () => {
    const leader = computeClaimPenalty({ rank: 1, totalPlayers: 4, base: 0, max: 2 });
    const middle = computeClaimPenalty({ rank: 2, totalPlayers: 4, base: 0, max: 2 });
    const last = computeClaimPenalty({ rank: 4, totalPlayers: 4, base: 0, max: 2 });
    expect(leader).toBe(2);
    expect(middle).toBe(1);
    expect(last).toBe(0);
  });

  it('clamps max below base', () => {
    const penalty = computeClaimPenalty({ rank: 1, totalPlayers: 2, base: 3, max: 1 });
    expect(penalty).toBe(3);
  });
});
