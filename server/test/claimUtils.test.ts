import { describe, expect, it } from 'vitest';
import { canStartClaim, getClaimRemainingSeconds, type ClaimState } from '../src/claimUtils.js';

describe('claim utils', () => {
  it('computes remaining seconds for active claims', () => {
    const now = new Date('2025-01-01T00:00:00Z').getTime();
    const claim: ClaimState = {
      playerId: 'player-1',
      startedAt: new Date(now - 1000).toISOString(),
      expiresAt: new Date(now + 9000).toISOString()
    };
    expect(getClaimRemainingSeconds(claim, now)).toBe(9);
  });

  it('blocks new claims when another player is active', () => {
    const now = new Date('2025-01-01T00:00:00Z').getTime();
    const claim: ClaimState = {
      playerId: 'player-1',
      startedAt: new Date(now - 1000).toISOString(),
      expiresAt: new Date(now + 9000).toISOString()
    };
    const result = canStartClaim(claim, 'player-2', now);
    expect(result.ok).toBe(false);
    expect(result.remainingSeconds).toBeGreaterThan(0);
    expect(result.activePlayerId).toBe('player-1');
  });
});
