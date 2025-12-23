import type { AstNode, BinaryOperator, UnaryOperator } from './ast.js';
import { astToString } from './ast.js';
import { add, div, equalsInt, fromInt, mul, sub, type Rational } from './rational.js';

export type Solution = {
  expression: string;
  ast: AstNode;
  fractionSteps: number;
  nestingDepth: number;
  anchorHit: boolean;
  opsUsed: Array<BinaryOperator | UnaryOperator>;
  intermediates: number[];
};

export type SolveResult = {
  solutions: Solution[];
  solutionCount: number;
  difficultyScore: number;
  dotTier: 1 | 2 | 3 | 4;
  tags: string[];
  hint: { op?: string; intermediate?: number } | null;
};

const anchors = new Set([1, 2, 3, 4, 6, 8, 12, 24]);

function applyOp(op: BinaryOperator, left: Rational, right: Rational): Rational | null {
  if (op === '+') {
    return add(left, right);
  }
  if (op === '-') {
    return sub(left, right);
  }
  if (op === '*') {
    return mul(left, right);
  }
  return div(left, right);
}

function analyzeAst(node: AstNode, isRoot: boolean): {
  value: Rational;
  fractionSteps: number;
  nestingDepth: number;
  anchorHit: boolean;
  opsUsed: Set<BinaryOperator | UnaryOperator>;
  intermediates: number[];
} {
  if (node.type === 'number') {
    return {
      value: fromInt(node.value),
      fractionSteps: 0,
      nestingDepth: 1,
      anchorHit: false,
      opsUsed: new Set(),
      intermediates: []
    };
  }

  if (node.type === 'unary') {
    const operand = analyzeAst(node.operand, false);
    const opsUsed = new Set(operand.opsUsed);
    opsUsed.add(node.op);
    return {
      value: operand.value,
      fractionSteps: operand.fractionSteps,
      nestingDepth: operand.nestingDepth + 1,
      anchorHit: operand.anchorHit,
      opsUsed,
      intermediates: operand.intermediates
    };
  }

  const left = analyzeAst(node.left, false);
  const right = analyzeAst(node.right, false);
  const value = applyOp(node.op, left.value, right.value);
  const opsUsed = new Set([...left.opsUsed, ...right.opsUsed]);
  opsUsed.add(node.op);
  if (!value) {
    return {
      value: { num: 0, den: 0 },
      fractionSteps: left.fractionSteps + right.fractionSteps,
      nestingDepth: Math.max(left.nestingDepth, right.nestingDepth) + 1,
      anchorHit: left.anchorHit || right.anchorHit,
      opsUsed,
      intermediates: [...left.intermediates, ...right.intermediates]
    };
  }

  const isAnchor = value.den === 1 && anchors.has(value.num);
  const intermediates = [...left.intermediates, ...right.intermediates];
  if (!isRoot && value.den === 1) {
    intermediates.push(value.num);
  }
  return {
    value,
    fractionSteps: left.fractionSteps + right.fractionSteps + (value.den !== 1 ? 1 : 0),
    nestingDepth: Math.max(left.nestingDepth, right.nestingDepth) + 1,
    anchorHit: left.anchorHit || right.anchorHit || (!isRoot && isAnchor),
    opsUsed,
    intermediates
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function computeDifficulty(solutions: Solution[]): { score: number; tier: 1 | 2 | 3 | 4; easiest: Solution } {
  const solutionCount = solutions.length;
  const capped = Math.min(solutionCount, 50);
  const scarcity = clamp(1 - Math.log(capped + 1) / Math.log(51), 0, 1);

  let easiest = solutions[0];
  for (const solution of solutions) {
    const a = solution;
    const b = easiest;
    if (a.fractionSteps !== b.fractionSteps) {
      if (a.fractionSteps < b.fractionSteps) {
        easiest = a;
      }
      continue;
    }
    if (a.nestingDepth !== b.nestingDepth) {
      if (a.nestingDepth < b.nestingDepth) {
        easiest = a;
      }
      continue;
    }
    if (a.anchorHit !== b.anchorHit) {
      if (a.anchorHit && !b.anchorHit) {
        easiest = a;
      }
      continue;
    }
    if (a.expression.length < b.expression.length) {
      easiest = a;
    }
  }

  const fraction = clamp(easiest.fractionSteps / 3, 0, 1);
  const nest = clamp((easiest.nestingDepth - 2) / 2, 0, 1);
  const anchorFriendliness = easiest.anchorHit ? 1 : 0;
  const antiHeuristic = 1 - anchorFriendliness;

  const score =
    0.45 * scarcity + 0.25 * fraction + 0.15 * nest + 0.15 * antiHeuristic;

  let tier: 1 | 2 | 3 | 4;
  if (score < 0.25) {
    tier = 1;
  } else if (score < 0.45) {
    tier = 2;
  } else if (score < 0.65) {
    tier = 3;
  } else {
    tier = 4;
  }

  return { score, tier, easiest };
}

export function solveCard(numbers: number[], target = 24): SolveResult {
  const solutionsMap = new Map<string, Solution>();
  type Item = { value: Rational; ast: AstNode };
  const startItems: Item[] = numbers.map((n) => ({ value: fromInt(n), ast: { type: 'number', value: n } }));

  const ops: BinaryOperator[] = ['+', '-', '*', '/'];

  const recurse = (items: Item[]) => {
    if (items.length === 1) {
      if (equalsInt(items[0].value, target)) {
        const expression = astToString(items[0].ast);
        if (!solutionsMap.has(expression)) {
          const metrics = analyzeAst(items[0].ast, true);
          solutionsMap.set(expression, {
            expression,
            ast: items[0].ast,
            fractionSteps: metrics.fractionSteps,
            nestingDepth: metrics.nestingDepth,
            anchorHit: metrics.anchorHit,
            opsUsed: Array.from(metrics.opsUsed),
            intermediates: metrics.intermediates
          });
        }
      }
      return;
    }

    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const rest: Item[] = [];
        for (let k = 0; k < items.length; k += 1) {
          if (k !== i && k !== j) {
            rest.push(items[k]);
          }
        }

        const a = items[i];
        const b = items[j];

        for (const op of ops) {
          if (op === '+' || op === '*') {
            const value = applyOp(op, a.value, b.value);
            if (!value) {
              continue;
            }
            recurse([
              ...rest,
              { value, ast: { type: 'binary', op, left: a.ast, right: b.ast } }
            ]);
          } else {
            const value1 = applyOp(op, a.value, b.value);
            if (value1) {
              recurse([
                ...rest,
                { value: value1, ast: { type: 'binary', op, left: a.ast, right: b.ast } }
              ]);
            }
            const value2 = applyOp(op, b.value, a.value);
            if (value2) {
              recurse([
                ...rest,
                { value: value2, ast: { type: 'binary', op, left: b.ast, right: a.ast } }
              ]);
            }
          }
        }
      }
    }
  };

  recurse(startItems);

  const solutions = Array.from(solutionsMap.values());
  const difficulty = solutions.length > 0 ? computeDifficulty(solutions) : null;

  const tags: string[] = [];
  const easiest = difficulty?.easiest;
  if (solutions.length <= 2) {
    tags.push('backtracking-heavy');
  }
  if (easiest && easiest.fractionSteps >= 2) {
    tags.push('fraction-heavy');
  }
  if (easiest && easiest.nestingDepth >= 4) {
    tags.push('nesting-heavy');
  }
  if (easiest && easiest.anchorHit) {
    tags.push('anchor-friendly');
  }

  const hintOp = easiest?.opsUsed.find((op) => op !== 'concat');
  const hintIntermediate = easiest?.intermediates.find((value) => anchors.has(value));

  return {
    solutions,
    solutionCount: solutions.length,
    difficultyScore: difficulty ? difficulty.score : 1,
    dotTier: difficulty ? difficulty.tier : 4,
    tags,
    hint: easiest ? { op: hintOp, intermediate: hintIntermediate } : null
  };
}
