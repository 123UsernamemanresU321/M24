import type { AstNode } from './ast.js';
import { add, div, fromInt, mul, sub, type Rational } from './rational.js';

export type EvalResult =
  | { ok: true; value: { num: number; den: number } }
  | { ok: false; error: 'DIVISION_BY_ZERO' | 'INVALID_FACTORIAL' | 'INVALID_SQRT' | 'INVALID_POWER' | 'VALUE_OVERFLOW' };

export type EvalOptions = {
  maxFactorial?: number;
  maxExponent?: number;
  maxAbsValue?: number;
  maxConcatDigits?: number;
};

const defaultOptions: Required<EvalOptions> = {
  maxFactorial: 12,
  maxExponent: 6,
  maxAbsValue: 1_000_000_000,
  maxConcatDigits: 4
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

export function evaluateAst(node: AstNode, options: EvalOptions = {}): EvalResult {
  const config = { ...defaultOptions, ...options };
  if (node.type === 'number') {
    return { ok: true, value: fromInt(node.value) };
  }
  if (node.type === 'unary') {
    const operand = evaluateAst(node.operand, config);
    if (!operand.ok) {
      return operand;
    }
    if (node.op === '!') {
      if (operand.value.den !== 1 || operand.value.num < 0) {
        return { ok: false, error: 'INVALID_FACTORIAL' };
      }
      if (operand.value.num > config.maxFactorial) {
        return { ok: false, error: 'VALUE_OVERFLOW' };
      }
      let result = 1;
      for (let i = 2; i <= operand.value.num; i += 1) {
        result *= i;
        if (Math.abs(result) > config.maxAbsValue) {
          return { ok: false, error: 'VALUE_OVERFLOW' };
        }
      }
      return { ok: true, value: fromInt(result) };
    }
    if (operand.value.den !== 1 || operand.value.num < 0) {
      return { ok: false, error: 'INVALID_SQRT' };
    }
    const root = Math.sqrt(operand.value.num);
    if (!Number.isInteger(root)) {
      return { ok: false, error: 'INVALID_SQRT' };
    }
    return { ok: true, value: fromInt(root) };
  }

  const left = evaluateAst(node.left, config);
  if (!left.ok) {
    return left;
  }
  const right = evaluateAst(node.right, config);
  if (!right.ok) {
    return right;
  }

  if (node.op === '+') {
    const value = add(left.value, right.value);
    return withinLimit(value, config.maxAbsValue) ? { ok: true, value } : { ok: false, error: 'VALUE_OVERFLOW' };
  }
  if (node.op === '-') {
    const value = sub(left.value, right.value);
    return withinLimit(value, config.maxAbsValue) ? { ok: true, value } : { ok: false, error: 'VALUE_OVERFLOW' };
  }
  if (node.op === '*') {
    const value = mul(left.value, right.value);
    return withinLimit(value, config.maxAbsValue) ? { ok: true, value } : { ok: false, error: 'VALUE_OVERFLOW' };
  }
  if (node.op === '/') {
    const divided = div(left.value, right.value);
    if (!divided) {
      return { ok: false, error: 'DIVISION_BY_ZERO' };
    }
    return withinLimit(divided, config.maxAbsValue) ? { ok: true, value: divided } : { ok: false, error: 'VALUE_OVERFLOW' };
  }
  if (node.op === '^') {
    if (right.value.den !== 1) {
      return { ok: false, error: 'INVALID_POWER' };
    }
    const exp = right.value.num;
    if (Math.abs(exp) > config.maxExponent) {
      return { ok: false, error: 'VALUE_OVERFLOW' };
    }
    if (exp === 0) {
      return { ok: true, value: fromInt(1) };
    }
    const baseNum = left.value.num;
    const baseDen = left.value.den;
    const absExp = Math.abs(exp);
    const powNum = powInt(baseNum, absExp, config.maxAbsValue);
    const powDen = powInt(baseDen, absExp, config.maxAbsValue);
    if (powNum === null || powDen === null) {
      return { ok: false, error: 'VALUE_OVERFLOW' };
    }
    if (exp < 0) {
      if (powNum === 0) {
        return { ok: false, error: 'DIVISION_BY_ZERO' };
      }
      return { ok: true, value: { num: powDen, den: powNum } };
    }
    return { ok: true, value: { num: powNum, den: powDen } };
  }
  if (node.op === 'concat') {
    if (left.value.den !== 1 || right.value.den !== 1) {
      return { ok: false, error: 'VALUE_OVERFLOW' };
    }
    const result = concatInts(left.value.num, right.value.num, config.maxConcatDigits);
    if (result === null || Math.abs(result) > config.maxAbsValue) {
      return { ok: false, error: 'VALUE_OVERFLOW' };
    }
    return { ok: true, value: fromInt(result) };
  }
  return { ok: false, error: 'VALUE_OVERFLOW' };
}
