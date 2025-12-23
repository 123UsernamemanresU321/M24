import type { LeaderboardRow, SessionRules } from '@arena/shared';

type Statement = {
  get?: (...args: unknown[]) => unknown;
  run?: (...args: unknown[]) => { changes: number };
  all?: (...args: unknown[]) => unknown[];
};

type SkipStatements = {
  countSkipped: Statement;
  sessionPlayerExists: Statement;
  leaderboard: Statement;
  getSessionPlayerScore: Statement;
  updateSessionPlayerScore: Statement;
  markRoundSkipped: Statement;
};

export function computeSkipsRemaining(limit: number | null, skippedCount: number): number | null {
  if (limit === null) {
    return null;
  }
  return Math.max(0, limit - skippedCount);
}

export function performSkip(args: {
  sessionId: string;
  rules: SessionRules;
  activeRoundId: string;
  selectedPlayerId?: string;
  reason?: string | null;
  statements: SkipStatements;
  nowIso: () => string;
  createNextRound: () => void;
}): {
  ok: boolean;
  error_code?: string;
  skipsRemaining?: number | null;
  skippedAt?: string;
  penalizedPlayerId?: string | null;
} {
  const { sessionId, rules, activeRoundId, selectedPlayerId, reason, statements, nowIso, createNextRound } = args;

  const skip = rules.skip;
  if (!skip?.enabled) {
    return { ok: false, error_code: 'SKIP_DISABLED' };
  }

  const skippedCount = (statements.countSkipped.get?.(sessionId) as { count: number } | undefined)?.count ?? 0;
  const limit = skip.limit ?? null;
  const remaining = computeSkipsRemaining(limit, skippedCount);
  if (remaining !== null && remaining <= 0) {
    return { ok: false, error_code: 'SKIP_LIMIT_REACHED', skipsRemaining: 0 };
  }

  const penaltyMode = skip.penaltyMode ?? 'none';
  const penaltyPoints = Math.max(0, Math.floor(skip.penaltyPoints ?? 0));
  let penalizedPlayerId: string | null = null;

  if (penaltyMode === 'selectedPlayer') {
    if (!selectedPlayerId) {
      return { ok: false, error_code: 'SKIP_PLAYER_REQUIRED' };
    }
    const membership = statements.sessionPlayerExists.get?.(sessionId, selectedPlayerId);
    if (!membership) {
      return { ok: false, error_code: 'SKIP_PLAYER_REQUIRED' };
    }
    penalizedPlayerId = selectedPlayerId;
  }

  if (penaltyMode === 'leader') {
    const leaderboard = statements.leaderboard.all?.(sessionId) as LeaderboardRow[] | undefined;
    penalizedPlayerId = leaderboard?.[0]?.player_id ?? null;
  }

  if (penalizedPlayerId && penaltyPoints > 0) {
    const row = statements.getSessionPlayerScore.get?.(sessionId, penalizedPlayerId) as { score_total: number } | undefined;
    if (row) {
      const allowNegative = Boolean(rules.mistakePenalty?.allowNegative);
      const nextScore = allowNegative ? row.score_total - penaltyPoints : Math.max(0, row.score_total - penaltyPoints);
      statements.updateSessionPlayerScore.run?.(nextScore, sessionId, penalizedPlayerId);
    }
  }

  const skippedAt = nowIso();
  statements.markRoundSkipped.run?.(skippedAt, null, reason ?? null, activeRoundId);
  createNextRound();

  const nextSkippedCount = skippedCount + 1;
  const nextRemaining = computeSkipsRemaining(limit, nextSkippedCount);
  return { ok: true, skippedAt, penalizedPlayerId, skipsRemaining: nextRemaining };
}
