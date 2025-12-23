import { describe, expect, test } from 'vitest';
import { astToString } from '../src/ast.js';
import { parseExpression } from '../src/parser.js';

describe('parser', () => {
  test('respects precedence', () => {
    const parsed = parseExpression('1+2*3');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(astToString(parsed.ast)).toBe('(1+(2*3))');
    }
  });

  test('respects parentheses', () => {
    const parsed = parseExpression('(1+2)*3');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(astToString(parsed.ast)).toBe('((1+2)*3)');
    }
  });

  test('rejects disallowed tokens', () => {
    const parsed = parseExpression('1+2a');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errorCode).toBe('DISALLOWED_TOKEN');
    }
  });

  test('rejects unary minus', () => {
    const parsed = parseExpression('-1+2');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errorCode).toBe('SYNTAX_ERROR_UNARY_MINUS');
    }
  });

  test('parses exponent and factorial', () => {
    const parsed = parseExpression('2^3!');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(astToString(parsed.ast)).toBe('(2^3!)');
    }
  });

  test('parses sqrt and concat', () => {
    const parsed = parseExpression('sqrt(9)+concat(1,2)');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(astToString(parsed.ast)).toBe('(sqrt(9)+concat(1,2))');
    }
  });
});
