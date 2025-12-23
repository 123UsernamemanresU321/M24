export type Rational = {
  num: number;
  den: number;
};

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x === 0 ? 1 : x;
}

export function normalize(r: Rational): Rational {
  if (r.den === 0) {
    return { num: r.num, den: 0 };
  }
  if (r.num === 0) {
    return { num: 0, den: 1 };
  }
  const sign = r.den < 0 ? -1 : 1;
  const d = gcd(r.num, r.den);
  return { num: sign * (r.num / d), den: Math.abs(r.den / d) };
}

export function fromInt(n: number): Rational {
  return { num: n, den: 1 };
}

export function add(a: Rational, b: Rational): Rational {
  return normalize({ num: a.num * b.den + b.num * a.den, den: a.den * b.den });
}

export function sub(a: Rational, b: Rational): Rational {
  return normalize({ num: a.num * b.den - b.num * a.den, den: a.den * b.den });
}

export function mul(a: Rational, b: Rational): Rational {
  return normalize({ num: a.num * b.num, den: a.den * b.den });
}

export function div(a: Rational, b: Rational): Rational | null {
  if (b.num === 0) {
    return null;
  }
  return normalize({ num: a.num * b.den, den: a.den * b.num });
}

export function equals(a: Rational, b: Rational): boolean {
  return a.num === b.num && a.den === b.den;
}

export function equalsInt(a: Rational, n: number): boolean {
  return a.den === 1 && a.num === n;
}

export function isInteger(a: Rational): boolean {
  return a.den === 1;
}
