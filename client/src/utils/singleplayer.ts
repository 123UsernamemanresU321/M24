import { solveCard } from '@arena/shared';

export type SingleplayerSettings = {
  difficultyMode: 'mixed' | 'fixed';
  fixedTier: 1 | 2 | 3 | 4;
  scoring: Record<'1' | '2' | '3' | '4', number>;
};

export type SingleplayerCard = {
  id: string;
  numbers: [number, number, number, number];
  dotTier: 1 | 2 | 3 | 4;
  difficultyScore: number;
  solutionCount: number;
  solutionExpression: string;
  hint: { op?: string; intermediate?: number } | null;
  tags: string[];
  attempts: number;
  startedAt: string;
  revealed: boolean;
};

export type SingleplayerHistoryEntry = {
  id: string;
  numbers: [number, number, number, number];
  tier: 1 | 2 | 3 | 4;
  points: number;
  expression?: string;
  solutionExpression: string;
  attempts: number;
  outcome: 'solved' | 'skipped';
  createdAt: string;
  completedAt: string;
};

export type SingleplayerStats = {
  score: number;
  solvedCount: number;
  wrongCount: number;
  skippedCount: number;
  currentStreak: number;
  bestStreak: number;
};

export type SingleplayerState = {
  version: 1;
  settings: SingleplayerSettings;
  stats: SingleplayerStats;
  currentCard: SingleplayerCard | null;
  history: SingleplayerHistoryEntry[];
};

export const SINGLEPLAYER_STORAGE_KEY = 'arena_singleplayer_v1';

export const defaultSingleplayerSettings: SingleplayerSettings = {
  difficultyMode: 'mixed',
  fixedTier: 2,
  scoring: { '1': 1, '2': 2, '3': 4, '4': 7 }
};

export const defaultSingleplayerStats: SingleplayerStats = {
  score: 0,
  solvedCount: 0,
  wrongCount: 0,
  skippedCount: 0,
  currentStreak: 0,
  bestStreak: 0
};

const mixedWeights = [0.35, 0.3, 0.22, 0.13];
const solveCache = new Map<
  string,
  ReturnType<typeof solveCard> & { numbers: [number, number, number, number]; solutionExpression: string }
>();

function randomInt(minInclusive: number, maxInclusive: number): number {
  return Math.floor(Math.random() * (maxInclusive - minInclusive + 1)) + minInclusive;
}

function pickWeightedTier(): 1 | 2 | 3 | 4 {
  const roll = Math.random();
  let cumulative = 0;
  for (let index = 0; index < mixedWeights.length; index += 1) {
    cumulative += mixedWeights[index];
    if (roll <= cumulative) {
      return (index + 1) as 1 | 2 | 3 | 4;
    }
  }
  return 4;
}

export function cardSignature(numbers: number[]): string {
  return [...numbers].sort((a, b) => a - b).join('-');
}

function normalizeScoring(scoring?: Record<'1' | '2' | '3' | '4', number>) {
  return {
    '1': Math.max(0, Math.floor(scoring?.['1'] ?? defaultSingleplayerSettings.scoring['1'])),
    '2': Math.max(0, Math.floor(scoring?.['2'] ?? defaultSingleplayerSettings.scoring['2'])),
    '3': Math.max(0, Math.floor(scoring?.['3'] ?? defaultSingleplayerSettings.scoring['3'])),
    '4': Math.max(0, Math.floor(scoring?.['4'] ?? defaultSingleplayerSettings.scoring['4']))
  };
}

export function normalizeSingleplayerState(input?: Partial<SingleplayerState> | null): SingleplayerState {
  const settings = input?.settings ?? defaultSingleplayerSettings;
  const stats = input?.stats ?? defaultSingleplayerStats;
  const currentCard = input?.currentCard
    ? {
        ...input.currentCard,
        attempts: Math.max(0, Math.floor(input.currentCard.attempts ?? 0)),
        revealed: !!input.currentCard.revealed,
        numbers: [
          Number(input.currentCard.numbers?.[0] ?? 1),
          Number(input.currentCard.numbers?.[1] ?? 1),
          Number(input.currentCard.numbers?.[2] ?? 1),
          Number(input.currentCard.numbers?.[3] ?? 1)
        ] as [number, number, number, number]
      }
    : null;
  const history = Array.isArray(input?.history)
    ? input!.history!
        .map((entry) => ({
          ...entry,
          numbers: [
            Number(entry.numbers?.[0] ?? 1),
            Number(entry.numbers?.[1] ?? 1),
            Number(entry.numbers?.[2] ?? 1),
            Number(entry.numbers?.[3] ?? 1)
          ] as [number, number, number, number],
          tier: entry.tier === 1 || entry.tier === 2 || entry.tier === 3 || entry.tier === 4 ? entry.tier : 4,
          points: Math.max(0, Math.floor(entry.points ?? 0)),
          attempts: Math.max(0, Math.floor(entry.attempts ?? 0)),
          outcome: entry.outcome === 'solved' ? 'solved' : 'skipped'
        }))
        .slice(0, 30)
    : [];

  return {
    version: 1,
    settings: {
      difficultyMode: settings.difficultyMode === 'fixed' ? 'fixed' : 'mixed',
      fixedTier: settings.fixedTier === 1 || settings.fixedTier === 2 || settings.fixedTier === 3 || settings.fixedTier === 4
        ? settings.fixedTier
        : 2,
      scoring: normalizeScoring(settings.scoring)
    },
    stats: {
      score: Math.max(0, Math.floor(stats.score ?? 0)),
      solvedCount: Math.max(0, Math.floor(stats.solvedCount ?? 0)),
      wrongCount: Math.max(0, Math.floor(stats.wrongCount ?? 0)),
      skippedCount: Math.max(0, Math.floor(stats.skippedCount ?? 0)),
      currentStreak: Math.max(0, Math.floor(stats.currentStreak ?? 0)),
      bestStreak: Math.max(0, Math.floor(stats.bestStreak ?? 0))
    },
    currentCard,
    history
  };
}

export function loadSingleplayerState(): SingleplayerState {
  try {
    const raw = localStorage.getItem(SINGLEPLAYER_STORAGE_KEY);
    if (!raw) {
      return normalizeSingleplayerState();
    }
    return normalizeSingleplayerState(JSON.parse(raw) as Partial<SingleplayerState>);
  } catch {
    return normalizeSingleplayerState();
  }
}

export function saveSingleplayerState(state: SingleplayerState) {
  localStorage.setItem(SINGLEPLAYER_STORAGE_KEY, JSON.stringify(normalizeSingleplayerState(state)));
}

export function resetSingleplayerState(): SingleplayerState {
  const next = normalizeSingleplayerState();
  saveSingleplayerState(next);
  return next;
}

export function generateSingleplayerCard(
  settings: SingleplayerSettings,
  recentSignatures: Set<string>
): SingleplayerCard {
  const targetTier = settings.difficultyMode === 'fixed' ? settings.fixedTier : pickWeightedTier();

  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const numbers: [number, number, number, number] = [
      randomInt(1, 9),
      randomInt(1, 9),
      randomInt(1, 9),
      randomInt(1, 9)
    ];
    const signature = cardSignature(numbers);
    if (recentSignatures.has(signature)) {
      continue;
    }

    let solved = solveCache.get(signature);
    if (!solved) {
      const result = solveCard(numbers, 24);
      if (result.solutionCount === 0 || result.solutions.length === 0) {
        solveCache.set(signature, { ...result, numbers, solutionExpression: '' });
        continue;
      }
      solved = {
        ...result,
        numbers,
        solutionExpression: result.solutions[0].expression
      };
      solveCache.set(signature, solved);
    }

    if (solved.solutionCount === 0 || !solved.solutionExpression) {
      continue;
    }
    if (solved.dotTier !== targetTier) {
      continue;
    }

    return {
      id: `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      numbers,
      dotTier: solved.dotTier,
      difficultyScore: solved.difficultyScore,
      solutionCount: solved.solutionCount,
      solutionExpression: solved.solutionExpression,
      hint: solved.hint,
      tags: solved.tags,
      attempts: 0,
      startedAt: new Date().toISOString(),
      revealed: false
    };
  }

  throw new Error('Unable to generate a solvable singleplayer card.');
}
