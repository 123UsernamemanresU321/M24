export type ClaimState = {
  playerId: string;
  startedAt: string;
  expiresAt: string;
};

export function getClaimRemainingSeconds(claim: ClaimState, nowMs = Date.now()): number {
  const expiresAt = new Date(claim.expiresAt).getTime();
  if (Number.isNaN(expiresAt)) {
    return 0;
  }
  return Math.max(0, Math.ceil((expiresAt - nowMs) / 1000));
}

export function canStartClaim(current: ClaimState | null | undefined, playerId: string, nowMs = Date.now()) {
  if (!current) {
    return { ok: true };
  }
  const remainingSeconds = getClaimRemainingSeconds(current, nowMs);
  if (remainingSeconds <= 0) {
    return { ok: true };
  }
  if (current.playerId === playerId) {
    return { ok: true, remainingSeconds };
  }
  return { ok: false, remainingSeconds, activePlayerId: current.playerId };
}
