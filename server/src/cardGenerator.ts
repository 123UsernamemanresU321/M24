import { solveCard, verifyExpression } from '@arena/shared';
import { randomInt, type EvalOptions, type OpsConfig, type Rng } from '@arena/shared';

export type DifficultyMode = 'mixed' | 'fixed';

export type GeneratedCard = {
  numbers: [number, number, number, number];
  difficultyScore: number;
  dotTier: 1 | 2 | 3 | 4;
  solutionCount: number;
  tags: string[];
  hint: { op?: string; intermediate?: number } | null;
};

const mixedWeights = [0.35, 0.3, 0.22, 0.13];

function pickWeightedTier(rng: Rng): 1 | 2 | 3 | 4 {
  const roll = rng();
  let cumulative = 0;
  for (let i = 0; i < mixedWeights.length; i += 1) {
    cumulative += mixedWeights[i];
    if (roll <= cumulative) {
      return (i + 1) as 1 | 2 | 3 | 4;
    }
  }
  return 4;
}

export function cardSignature(numbers: number[]): string {
  return [...numbers].sort((a, b) => a - b).join('-');
}

export function generateCard(options: {
  rng: Rng;
  difficultyMode: DifficultyMode;
  fixedTier?: 1 | 2 | 3 | 4;
  recentSignatures: Set<string>;
  cache: Map<string, Omit<GeneratedCard, 'dotTier'>>;
  thresholds: { t1: number; t2: number; t3: number };
  allowedOps?: Partial<OpsConfig>;
  verifyOptions?: EvalOptions;
}): GeneratedCard {
  const targetTier =
    options.difficultyMode === 'mixed'
      ? pickWeightedTier(options.rng)
      : options.fixedTier ?? 1;
  const rejectedSignatures = new Set<string>();

  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const numbers: [number, number, number, number] = [
      randomInt(options.rng, 1, 9),
      randomInt(options.rng, 1, 9),
      randomInt(options.rng, 1, 9),
      randomInt(options.rng, 1, 9)
    ];
    const signature = cardSignature(numbers);
    if (options.recentSignatures.has(signature) || rejectedSignatures.has(signature)) {
      continue;
    }

    let solved = null as ReturnType<typeof solveCard> | null;
    let analysis = options.cache.get(signature);
    if (!analysis) {
      solved = solveCard(numbers, 24);
      analysis = {
        numbers,
        difficultyScore: solved.difficultyScore,
        solutionCount: solved.solutionCount,
        tags: solved.tags,
        hint: solved.hint
      };
      options.cache.set(signature, analysis);
    }

    if (analysis.solutionCount === 0) {
      continue;
    }
    const dotTier =
      analysis.difficultyScore < options.thresholds.t1
        ? 1
        : analysis.difficultyScore < options.thresholds.t2
          ? 2
          : analysis.difficultyScore < options.thresholds.t3
            ? 3
            : 4;

    if (dotTier !== targetTier) {
      continue;
    }

    if (options.allowedOps) {
      const solvedNow = solved ?? solveCard(numbers, 24);
      const hasValidSolution = solvedNow.solutions.some((solution) =>
        verifyExpression(solution.expression, numbers, {
          allowedOps: options.allowedOps,
          ...(options.verifyOptions ?? {})
        }).ok
      );
      if (!hasValidSolution) {
        console.warn(`Generated card ${signature} has no valid solutions for current ops; resampling.`);
        rejectedSignatures.add(signature);
        continue;
      }
    }

    return { ...analysis, dotTier };
  }

  throw new Error('Unable to generate a valid card after many attempts.');
}
