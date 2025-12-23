import type { OpsConfig, SessionRules } from '@arena/shared';
import { defaultOps } from '@arena/shared';

export const defaultScoring = {
  '1': 1,
  '2': 2,
  '3': 4,
  '4': 7
} as const;

const normalizeScoreValue = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.floor(numeric));
};

const normalizeScoring = (input?: SessionRules['scoring'] | SessionRules['pointsByTier']) => {
  const source = input ?? defaultScoring;
  return {
    '1': normalizeScoreValue(source?.['1'], defaultScoring['1']),
    '2': normalizeScoreValue(source?.['2'], defaultScoring['2']),
    '3': normalizeScoreValue(source?.['3'], defaultScoring['3']),
    '4': normalizeScoreValue(source?.['4'], defaultScoring['4'])
  };
};

export type NormalizedRules = {
  scoring: Record<'1' | '2' | '3' | '4', number>;
  difficulty_mode: 'mixed' | 'fixed';
  fixed_tier?: 1 | 2 | 3 | 4;
  ops: OpsConfig;
  timer_mode: 'off' | 'countdown' | 'stopwatch';
  countdown_seconds: number;
  hints_enabled: boolean;
  hint1_after_seconds: number;
  hint2_after_seconds: number;
  lan_enabled: boolean;
  lan_auto_accept: boolean;
  no_undo_input: boolean;
  scarcityEnabled: boolean;
  scarcityMode: 'banOneOp';
  scarcityBanSet: { add: boolean; sub: boolean; mul: boolean; div: boolean };
  shapeConstraint: 'shapeA' | 'shapeB' | null;
  mistakePenalty: {
    mode: 'none' | 'lockout' | 'minusPoints';
    lockoutSeconds: number;
    minusPoints: number;
    allowNegative: boolean;
  };
  coldStartSeconds: number;
  blindReveal: {
    enabled: boolean;
    intervalSeconds: number;
    scheduleSeconds?: number[];
  };
  uniquenessBonusPoints: number;
  skip: {
    enabled: boolean;
    limit: number | null;
    penaltyMode: 'none' | 'selectedPlayer' | 'leader';
    penaltyPoints: number;
  };
  multiplayer: {
    enabled: boolean;
    cardDistribution: 'shared' | 'perPlayer';
    claimEnabled: boolean;
    claimWindowSeconds: number;
    wrongLockoutSeconds: number;
    claimPenalty: { mode: 'leaderboardScaled'; base: number; max: number };
  };
};

export function normalizeRules(input?: SessionRules | null): NormalizedRules {
  const rules = input ?? {};
  const banSet = { add: true, sub: true, mul: true, div: true, ...(rules.scarcityBanSet ?? {}) };
  const mistakePenalty = rules.mistakePenalty ?? { mode: 'none' };
  const blindReveal = rules.blindReveal ?? { enabled: false };
  const skip = rules.skip ?? { enabled: false };
  const multiplayer = rules.multiplayer ?? {};
  return {
    scoring: normalizeScoring(rules.scoring ?? rules.pointsByTier),
    difficulty_mode: rules.difficulty_mode ?? 'mixed',
    fixed_tier: rules.fixed_tier,
    ops: { ...defaultOps, ...(rules.ops ?? {}) },
    timer_mode: rules.timer_mode ?? 'off',
    countdown_seconds: rules.countdown_seconds ?? 60,
    hints_enabled: rules.hints_enabled ?? false,
    hint1_after_seconds: rules.hint1_after_seconds ?? 30,
    hint2_after_seconds: rules.hint2_after_seconds ?? 50,
    lan_enabled: rules.lan_enabled ?? false,
    lan_auto_accept: rules.lan_auto_accept ?? true,
    no_undo_input: rules.no_undo_input ?? false,
    scarcityEnabled: rules.scarcityEnabled ?? false,
    scarcityMode: rules.scarcityMode ?? 'banOneOp',
    scarcityBanSet: {
      add: banSet.add ?? true,
      sub: banSet.sub ?? true,
      mul: banSet.mul ?? true,
      div: banSet.div ?? true
    },
    shapeConstraint: rules.shapeConstraint ?? null,
    mistakePenalty: {
      mode: mistakePenalty.mode,
      lockoutSeconds: mistakePenalty.lockoutSeconds ?? 5,
      minusPoints: mistakePenalty.minusPoints ?? 1,
      allowNegative: mistakePenalty.allowNegative ?? false
    },
    coldStartSeconds: rules.coldStartSeconds ?? 0,
    blindReveal: {
      enabled: blindReveal.enabled ?? false,
      intervalSeconds: blindReveal.intervalSeconds ?? 2,
      scheduleSeconds: blindReveal.scheduleSeconds
    },
    uniquenessBonusPoints: rules.uniquenessBonusPoints ?? 0,
    skip: {
      enabled: skip.enabled ?? false,
      limit: skip.limit === null
        ? null
        : Math.max(1, Math.floor(skip.limit ?? 3)),
      penaltyMode: skip.penaltyMode ?? 'none',
      penaltyPoints: Math.max(0, Math.floor(skip.penaltyPoints ?? 0))
    },
    multiplayer: {
      enabled: multiplayer.enabled ?? false,
      cardDistribution: multiplayer.cardDistribution ?? 'shared',
      claimEnabled: multiplayer.claimEnabled ?? true,
      claimWindowSeconds: Math.max(5, Math.floor(multiplayer.claimWindowSeconds ?? 10)),
      wrongLockoutSeconds: Math.max(5, Math.floor(multiplayer.wrongLockoutSeconds ?? 10)),
      claimPenalty: {
        mode: 'leaderboardScaled',
        base: Math.max(0, Math.floor(multiplayer.claimPenalty?.base ?? 0)),
        max: Math.max(0, Math.floor(multiplayer.claimPenalty?.max ?? 2))
      }
    }
  };
}

export function parseRulesJson(rulesJson?: string | null): NormalizedRules {
  if (!rulesJson) {
    return normalizeRules(null);
  }
  try {
    return normalizeRules(JSON.parse(rulesJson) as SessionRules);
  } catch {
    return normalizeRules(null);
  }
}
