import { describe, expect, test } from 'vitest';
import { verifyExpression } from '../src/verifier.js';

describe('verifier', () => {
  test('accepts correct solution', () => {
    const result = verifyExpression('6/(1-3/4)', [6, 1, 3, 4]);
    expect(result.ok).toBe(true);
    expect(result.errorCode).toBe('OK');
  });

  test('rejects wrong numbers used', () => {
    const result = verifyExpression('6/(1-3/4)', [6, 1, 3, 5]);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('WRONG_NUMBERS_USED');
  });

  test('rejects division by zero', () => {
    const result = verifyExpression('6/(1-3/3)', [6, 1, 3, 3]);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('DIVISION_BY_ZERO');
  });

  test('rejects non-24 result', () => {
    const result = verifyExpression('1+2+3+4', [1, 2, 3, 4]);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('NOT_EQUAL_24');
  });

  test('rejects disallowed operation', () => {
    const result = verifyExpression('2^3+4-5', [2, 3, 4, 5], { allowedOps: { pow: false } });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('DISALLOWED_OPERATION');
  });

  test('enforces shape constraint', () => {
    const shapeA = verifyExpression('(1+2)*(3+4)', [1, 2, 3, 4], { shapeConstraint: 'shapeA' });
    expect(shapeA.ok).toBe(true);
    const shapeB = verifyExpression('1+(2*(3+4))', [1, 2, 3, 4], { shapeConstraint: 'shapeA' });
    expect(shapeB.ok).toBe(false);
    expect(shapeB.errorCode).toBe('SHAPE_CONSTRAINT_VIOLATION');
  });

  test('rejects banned base operation', () => {
    const result = verifyExpression('1+2+3+4', [1, 2, 3, 4], { allowedOps: { add: false } });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('DISALLOWED_OPERATION');
  });

  test('rejects invalid factorial', () => {
    const result = verifyExpression('5!+1+1+1', [5, 1, 1, 1], {
      maxFactorial: 4,
      allowedOps: { fact: true }
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('VALUE_OVERFLOW');
  });

  test('rejects invalid sqrt', () => {
    const result = verifyExpression('sqrt(2)+1+1+1', [2, 1, 1, 1], { allowedOps: { sqrt: true } });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('INVALID_SQRT');
  });
});
