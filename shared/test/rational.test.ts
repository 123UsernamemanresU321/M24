import { describe, expect, test } from 'vitest';
import { add, div, fromInt, mul, sub } from '../src/rational.js';

describe('rational', () => {
  test('basic arithmetic', () => {
    const a = { num: 1, den: 2 };
    const b = { num: 1, den: 3 };
    expect(add(a, b)).toEqual({ num: 5, den: 6 });
    expect(sub(a, b)).toEqual({ num: 1, den: 6 });
    expect(mul(a, b)).toEqual({ num: 1, den: 6 });
    const divided = div(a, b);
    expect(divided).toEqual({ num: 3, den: 2 });
  });

  test('fromInt keeps denominator 1', () => {
    expect(fromInt(7)).toEqual({ num: 7, den: 1 });
  });
});
