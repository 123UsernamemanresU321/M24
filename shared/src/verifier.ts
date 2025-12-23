import { astToString, type AstNode, type BinaryOperator, type UnaryOperator } from './ast.js';
import { evaluateAst, type EvalOptions } from './evaluator.js';
import { equalsInt } from './rational.js';
import { parseExpression } from './parser.js';
import type { OpsConfig } from './ops.js';
import { matchesShapeConstraint, type ShapeConstraint } from './shape.js';

export type VerifyErrorCode =
  | 'OK'
  | 'SYNTAX_ERROR'
  | 'SYNTAX_ERROR_UNARY_MINUS'
  | 'DISALLOWED_TOKEN'
  | 'WRONG_NUMBERS_USED'
  | 'DIVISION_BY_ZERO'
  | 'NOT_EQUAL_24'
  | 'INVALID_FACTORIAL'
  | 'INVALID_SQRT'
  | 'INVALID_POWER'
  | 'DISALLOWED_OPERATION'
  | 'SHAPE_CONSTRAINT_VIOLATION'
  | 'VALUE_OVERFLOW';

export type VerifyResult = {
  ok: boolean;
  errorCode: VerifyErrorCode;
  normalizedExpression?: string;
  evaluated?: { num: number; den: number };
  ast?: AstNode;
};

export type VerifyOptions = {
  allowedOps?: Partial<OpsConfig>;
  shapeConstraint?: ShapeConstraint | null;
} & EvalOptions;

function multisetMatches(numbers: number[], target: number[]): boolean {
  if (numbers.length !== target.length) {
    return false;
  }
  const counts = new Map<number, number>();
  for (const n of target) {
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  for (const n of numbers) {
    const current = counts.get(n);
    if (!current) {
      return false;
    }
    if (current === 1) {
      counts.delete(n);
    } else {
      counts.set(n, current - 1);
    }
  }
  return counts.size === 0;
}

function collectOps(node: AstNode, ops: Set<BinaryOperator | UnaryOperator>): void {
  if (node.type === 'number') {
    return;
  }
  if (node.type === 'unary') {
    ops.add(node.op);
    collectOps(node.operand, ops);
    return;
  }
  ops.add(node.op);
  collectOps(node.left, ops);
  collectOps(node.right, ops);
}

export function verifyExpression(expressionRaw: string, cardNumbers: number[], options: VerifyOptions = {}): VerifyResult {
  const parsed = parseExpression(expressionRaw);
  if (!parsed.ok) {
    const errorCode = parsed.errorCode === 'SYNTAX_ERROR_UNARY_MINUS'
      ? 'SYNTAX_ERROR_UNARY_MINUS'
      : parsed.errorCode === 'DISALLOWED_TOKEN'
        ? 'DISALLOWED_TOKEN'
        : 'SYNTAX_ERROR';
    return { ok: false, errorCode };
  }

  const numbersUsed = parsed.numbers;
  if (!multisetMatches(numbersUsed, cardNumbers)) {
    return { ok: false, errorCode: 'WRONG_NUMBERS_USED' };
  }

  const normalizedExpression = astToString(parsed.ast);
  if (options.shapeConstraint && !matchesShapeConstraint(parsed.ast, options.shapeConstraint)) {
    return { ok: false, errorCode: 'SHAPE_CONSTRAINT_VIOLATION', normalizedExpression };
  }
  const opsUsed = new Set<BinaryOperator | UnaryOperator>();
  collectOps(parsed.ast, opsUsed);

  const allowed = {
    add: true,
    sub: true,
    mul: true,
    div: true,
    pow: false,
    fact: false,
    sqrt: false,
    concat: false,
    ...options.allowedOps
  };

  for (const op of opsUsed) {
    if ((op === '+' && !allowed.add)
      || (op === '-' && !allowed.sub)
      || (op === '*' && !allowed.mul)
      || (op === '/' && !allowed.div)
      || (op === '^' && !allowed.pow)
      || (op === '!' && !allowed.fact)
      || (op === 'sqrt' && !allowed.sqrt)
      || (op === 'concat' && !allowed.concat)
    ) {
      return { ok: false, errorCode: 'DISALLOWED_OPERATION', normalizedExpression };
    }
  }

  const evaluated = evaluateAst(parsed.ast, options);
  if (!evaluated.ok) {
    return { ok: false, errorCode: evaluated.error as VerifyErrorCode, normalizedExpression };
  }

  if (!equalsInt(evaluated.value, 24)) {
    return {
      ok: false,
      errorCode: 'NOT_EQUAL_24',
      normalizedExpression,
      evaluated: evaluated.value
    };
  }

  return { ok: true, errorCode: 'OK', normalizedExpression, evaluated: evaluated.value, ast: parsed.ast };
}
