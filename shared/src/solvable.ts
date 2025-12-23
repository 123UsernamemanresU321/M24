import type { AstNode, BinaryOperator } from './ast.js';
import { astToString } from './ast.js';
import type { OpsConfig } from './ops.js';
import { randomInt, type Rng } from './random.js';
import { add, div, equalsInt, fromInt, mul, normalize, sub, type Rational } from './rational.js';
import type { ShapeConstraint } from './shape.js';
import { matchesShapeConstraint } from './shape.js';

export type SolvableOptions = {
  allowedOps?: Partial<OpsConfig>;
  maxFactorial?: number;
  maxExponent?: number;
  maxAbsValue?: number;
  maxConcatDigits?: number;
  shapeConstraint?: ShapeConstraint | null;
};

const defaultOptions: Required<SolvableOptions> = {
  allowedOps: {},
  maxFactorial: 12,
  maxExponent: 6,
  maxAbsValue: 1_000_000_000,
  maxConcatDigits: 4,
  shapeConstraint: null
};

function withinLimit(value: Rational, maxAbs: number): boolean {
  return Math.abs(value.num) <= maxAbs && Math.abs(value.den) <= maxAbs;
}

function powInt(base: number, exponent: number, maxAbs: number): number | null {
  let result = 1;
  let value = base;
  let exp = exponent;
  while (exp > 0) {
    if (exp % 2 === 1) {
      result *= value;
      if (Math.abs(result) > maxAbs) {
        return null;
      }
    }
    exp = Math.floor(exp / 2);
    if (exp > 0) {
      value *= value;
      if (Math.abs(value) > maxAbs) {
        return null;
      }
    }
  }
  return result;
}

function concatInts(a: number, b: number, maxDigits: number): number | null {
  if (a < 0 || b < 0) {
    return null;
  }
  const resultStr = `${a}${b}`;
  if (resultStr.length > maxDigits) {
    return null;
  }
  const result = Number(resultStr);
  if (!Number.isFinite(result)) {
    return null;
  }
  return result;
}

function applyUnary(op: '!' | 'sqrt', value: Rational, config: Required<SolvableOptions>): Rational | null {
  if (op === '!') {
    if (value.den !== 1 || value.num < 0 || value.num > config.maxFactorial) {
      return null;
    }
    let result = 1;
    for (let i = 2; i <= value.num; i += 1) {
      result *= i;
      if (Math.abs(result) > config.maxAbsValue) {
        return null;
      }
    }
    return fromInt(result);
  }
  if (value.den !== 1 || value.num < 0) {
    return null;
  }
  const root = Math.sqrt(value.num);
  if (!Number.isInteger(root)) {
    return null;
  }
  return fromInt(root);
}

function applyBinary(op: string, left: Rational, right: Rational, config: Required<SolvableOptions>): Rational | null {
  if (op === '+') {
    const value = add(left, right);
    return withinLimit(value, config.maxAbsValue) ? value : null;
  }
  if (op === '-') {
    const value = sub(left, right);
    return withinLimit(value, config.maxAbsValue) ? value : null;
  }
  if (op === '*') {
    const value = mul(left, right);
    return withinLimit(value, config.maxAbsValue) ? value : null;
  }
  if (op === '/') {
    const value = div(left, right);
    return value && withinLimit(value, config.maxAbsValue) ? value : null;
  }
  if (op === '^') {
    if (right.den !== 1) {
      return null;
    }
    const exp = right.num;
    if (Math.abs(exp) > config.maxExponent) {
      return null;
    }
    if (exp === 0) {
      return fromInt(1);
    }
    const absExp = Math.abs(exp);
    const powNum = powInt(left.num, absExp, config.maxAbsValue);
    const powDen = powInt(left.den, absExp, config.maxAbsValue);
    if (powNum === null || powDen === null) {
      return null;
    }
    const value = exp < 0 ? normalize({ num: powDen, den: powNum }) : normalize({ num: powNum, den: powDen });
    return withinLimit(value, config.maxAbsValue) ? value : null;
  }
  if (op === 'concat') {
    if (left.den !== 1 || right.den !== 1) {
      return null;
    }
    const result = concatInts(left.num, right.num, config.maxConcatDigits);
    if (result === null) {
      return null;
    }
    const value = fromInt(result);
    return withinLimit(value, config.maxAbsValue) ? value : null;
  }
  return null;
}

function valueKey(value: Rational): string {
  return `${value.num}/${value.den}`;
}

type ExprValue = {
  value: Rational;
  node: AstNode;
};

function buildBinaryNode(op: string, left: AstNode, right: AstNode): AstNode {
  return { type: 'binary', op: op as BinaryOperator, left, right };
}

function buildUnaryNode(op: '!' | 'sqrt', operand: AstNode): AstNode {
  return { type: 'unary', op, operand };
}

function matchesShape(node: AstNode, shape: ShapeConstraint | null | undefined): boolean {
  if (!shape) {
    return true;
  }
  return matchesShapeConstraint(node, shape);
}

export function findSolutionExpressionWithOps(
  numbers: number[],
  target = 24,
  options: SolvableOptions = {}
): string | null {
  const config: Required<SolvableOptions> = { ...defaultOptions, ...options, allowedOps: { ...options.allowedOps } };
  const allowed = {
    add: true,
    sub: true,
    mul: true,
    div: true,
    pow: false,
    fact: false,
    sqrt: false,
    concat: false,
    ...config.allowedOps
  };

  const binaryOps = ['+', '-', '*', '/'].filter((op) => {
    if (op === '+' && !allowed.add) return false;
    if (op === '-' && !allowed.sub) return false;
    if (op === '*' && !allowed.mul) return false;
    if (op === '/' && !allowed.div) return false;
    return true;
  });
  if (allowed.pow) {
    binaryOps.push('^');
  }
  if (allowed.concat) {
    binaryOps.push('concat');
  }

  const memo = new Set<string>();
  const start: ExprValue[] = numbers.map((n) => ({ value: fromInt(n), node: { type: 'number', value: n } }));

  const getVariants = (entry: ExprValue): ExprValue[] => {
    const results = new Map<string, ExprValue>();
    const queue: ExprValue[] = [entry];
    while (queue.length > 0) {
      const current = queue.pop();
      if (!current) {
        continue;
      }
      const key = valueKey(current.value);
      if (results.has(key)) {
        continue;
      }
      results.set(key, current);
      if (allowed.fact) {
        const next = applyUnary('!', current.value, config);
        if (next) {
          queue.push({ value: next, node: buildUnaryNode('!', current.node) });
        }
      }
      if (allowed.sqrt) {
        const next = applyUnary('sqrt', current.value, config);
        if (next) {
          queue.push({ value: next, node: buildUnaryNode('sqrt', current.node) });
        }
      }
    }
    return Array.from(results.values());
  };

  const recurse = (values: ExprValue[]): AstNode | null => {
    if (values.length === 1) {
      const variants = getVariants(values[0]);
      const match = variants.find(
        (variant) => equalsInt(variant.value, target) && matchesShape(variant.node, config.shapeConstraint)
      );
      if (match) {
        return match.node;
      }
      return null;
    }
    const key = values.map((entry) => valueKey(entry.value)).sort().join('|');
    if (memo.has(key)) {
      return null;
    }
    memo.add(key);

    for (let i = 0; i < values.length; i += 1) {
      for (let j = i + 1; j < values.length; j += 1) {
        const rest: ExprValue[] = [];
        for (let k = 0; k < values.length; k += 1) {
          if (k !== i && k !== j) {
            rest.push(values[k]);
          }
        }

        const variantsA = getVariants(values[i]);
        const variantsB = getVariants(values[j]);

        for (const a of variantsA) {
          for (const b of variantsB) {
            for (const op of binaryOps) {
              const value1 = applyBinary(op, a.value, b.value, config);
              if (value1) {
                const node = buildBinaryNode(op, a.node, b.node);
                const found = recurse([...rest, { value: value1, node }]);
                if (found) {
                  return found;
                }
              }
              if (op === '+' || op === '*') {
                continue;
              }
              const value2 = applyBinary(op, b.value, a.value, config);
              if (value2) {
                const node = buildBinaryNode(op, b.node, a.node);
                const found = recurse([...rest, { value: value2, node }]);
                if (found) {
                  return found;
                }
              }
            }
          }
        }
      }
    }
    return null;
  };

  const node = recurse(start);
  return node ? astToString(node) : null;
}

export function isSolvableWithOps(numbers: number[], target = 24, options: SolvableOptions = {}): boolean {
  if (options.shapeConstraint) {
    return Boolean(findSolutionExpressionWithOps(numbers, target, options));
  }
  const config: Required<SolvableOptions> = { ...defaultOptions, ...options, allowedOps: { ...options.allowedOps } };
  const allowed = {
    add: true,
    sub: true,
    mul: true,
    div: true,
    pow: false,
    fact: false,
    sqrt: false,
    concat: false,
    ...config.allowedOps
  };

  const binaryOps = ['+', '-', '*', '/'].filter((op) => {
    if (op === '+' && !allowed.add) return false;
    if (op === '-' && !allowed.sub) return false;
    if (op === '*' && !allowed.mul) return false;
    if (op === '/' && !allowed.div) return false;
    return true;
  });
  if (allowed.pow) {
    binaryOps.push('^');
  }
  if (allowed.concat) {
    binaryOps.push('concat');
  }

  const memo = new Set<string>();
  const start = numbers.map((n) => fromInt(n));

  const getVariants = (value: Rational): Rational[] => {
    const results = new Map<string, Rational>();
    const queue: Rational[] = [value];
    while (queue.length > 0) {
      const current = queue.pop();
      if (!current) {
        continue;
      }
      const key = valueKey(current);
      if (results.has(key)) {
        continue;
      }
      results.set(key, current);
      if (allowed.fact) {
        const next = applyUnary('!', current, config);
        if (next) {
          queue.push(next);
        }
      }
      if (allowed.sqrt) {
        const next = applyUnary('sqrt', current, config);
        if (next) {
          queue.push(next);
        }
      }
    }
    return Array.from(results.values());
  };

  const recurse = (values: Rational[]): boolean => {
    if (values.length === 1) {
      return getVariants(values[0]).some((variant) => equalsInt(variant, target));
    }
    const key = values.map(valueKey).sort().join('|');
    if (memo.has(key)) {
      return false;
    }
    memo.add(key);

    for (let i = 0; i < values.length; i += 1) {
      for (let j = i + 1; j < values.length; j += 1) {
        const rest: Rational[] = [];
        for (let k = 0; k < values.length; k += 1) {
          if (k !== i && k !== j) {
            rest.push(values[k]);
          }
        }

        const variantsA = getVariants(values[i]);
        const variantsB = getVariants(values[j]);

        for (const a of variantsA) {
          for (const b of variantsB) {
            for (const op of binaryOps) {
              const value1 = applyBinary(op, a, b, config);
              if (value1 && recurse([...rest, value1])) {
                return true;
              }
              if (op === '+' || op === '*') {
                continue;
              }
              const value2 = applyBinary(op, b, a, config);
              if (value2 && recurse([...rest, value2])) {
                return true;
              }
            }
          }
        }
      }
    }
    return false;
  };

  return recurse(start);
}

export function findUnsolvableNumbers(
  rng: Rng,
  options: SolvableOptions & { min?: number; max?: number; attempts?: number } = {}
): [number, number, number, number] | null {
  const attempts = options.attempts ?? 2000;
  const min = options.min ?? 1;
  const max = options.max ?? 9;
  for (let i = 0; i < attempts; i += 1) {
    const numbers: [number, number, number, number] = [
      randomInt(rng, min, max),
      randomInt(rng, min, max),
      randomInt(rng, min, max),
      randomInt(rng, min, max)
    ];
    if (!isSolvableWithOps(numbers, 24, options)) {
      return numbers;
    }
  }
  return null;
}
