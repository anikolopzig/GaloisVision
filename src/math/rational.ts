// Exact rational arithmetic backed by BigInt.
// Used throughout the Galois pipeline so discriminants, square tests,
// and polynomial divisions are exact (no floating drift).

export type Rational = { n: bigint; d: bigint }; // d > 0, gcd(|n|, d) = 1

export function absBig(x: bigint): bigint {
  return x < 0n ? -x : x;
}

export function gcdBig(a: bigint, b: bigint): bigint {
  a = absBig(a);
  b = absBig(b);
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}

export function lcmBig(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) return absBig(a === 0n ? b : a);
  return absBig((a / gcdBig(a, b)) * b);
}

export function rat(n: bigint | number, d: bigint | number = 1n): Rational {
  let nn = typeof n === "bigint" ? n : BigInt(n);
  let dd = typeof d === "bigint" ? d : BigInt(d);
  if (dd === 0n) throw new Error("Rational denominator is zero");
  if (dd < 0n) {
    nn = -nn;
    dd = -dd;
  }
  const g = gcdBig(nn, dd);
  return { n: g === 0n ? 0n : nn / g, d: g === 0n ? 1n : dd / g };
}

export const ZERO: Rational = { n: 0n, d: 1n };
export const ONE: Rational = { n: 1n, d: 1n };

export function eq(a: Rational, b: Rational): boolean {
  return a.n * b.d === b.n * a.d;
}

export function isZero(a: Rational): boolean {
  return a.n === 0n;
}

export function isInt(a: Rational): boolean {
  return a.d === 1n;
}

export function sign(a: Rational): -1 | 0 | 1 {
  if (a.n === 0n) return 0;
  return a.n > 0n ? 1 : -1;
}

export function neg(a: Rational): Rational {
  return { n: -a.n, d: a.d };
}

export function add(a: Rational, b: Rational): Rational {
  return rat(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function sub(a: Rational, b: Rational): Rational {
  return rat(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function mul(a: Rational, b: Rational): Rational {
  return rat(a.n * b.n, a.d * b.d);
}

export function div(a: Rational, b: Rational): Rational {
  if (b.n === 0n) throw new Error("Rational division by zero");
  return rat(a.n * b.d, a.d * b.n);
}

export function powInt(a: Rational, k: number): Rational {
  if (k < 0) return powInt(div(ONE, a), -k);
  let r: Rational = ONE;
  let base = a;
  let e = k;
  while (e > 0) {
    if (e & 1) r = mul(r, base);
    base = mul(base, base);
    e >>= 1;
  }
  return r;
}

// Integer square root for non-negative BigInt; null if not a perfect square.
export function isqrt(n: bigint): bigint | null {
  if (n < 0n) return null;
  if (n < 2n) return n;
  // Newton iteration
  let x = n;
  let y = (x + 1n) >> 1n;
  while (y < x) {
    x = y;
    y = (x + n / x) >> 1n;
  }
  return x * x === n ? x : null;
}

// Is the rational a perfect square in Q? Returns the square root if so.
export function rationalSqrt(a: Rational): Rational | null {
  if (a.n < 0n) return null;
  const sn = isqrt(a.n);
  const sd = isqrt(a.d);
  if (sn === null || sd === null) return null;
  return rat(sn, sd);
}

export function toNumber(a: Rational): number {
  // Safe for reasonably sized rationals; sufficient for plotting.
  return Number(a.n) / Number(a.d);
}

// Largest integer ≤ a, as a BigInt.
export function floorRat(a: Rational): bigint {
  const q = a.n / a.d; // d > 0 by invariant; BigInt division truncates toward zero
  const r = a.n % a.d;
  return r < 0n ? q - 1n : q;
}

// Nearest integer to a, with exact halves rounded to even (banker's rounding).
// Ties-to-even is required for Gauss/Lagrange reduction to terminate: at μ = ±1/2
// the basis is already reduced (|μ| ≤ 1/2), so the half must round to 0, not ±1.
export function roundRat(a: Rational): bigint {
  const f = floorRat(a);
  const twice = 2n * (a.n - f * a.d); // compare frac vs 1/2  ⇔  twice vs a.d
  if (twice < a.d) return f;
  if (twice > a.d) return f + 1n;
  return f % 2n === 0n ? f : f + 1n;
}

export function format(a: Rational): string {
  if (a.d === 1n) return a.n.toString();
  return `${a.n.toString()}/${a.d.toString()}`;
}

// Parse "3", "-5", "1/2", "-7/3"
export function parseRational(s: string): Rational {
  const m = s.trim().match(/^(-?\d+)(?:\/(\d+))?$/);
  if (!m) throw new Error(`Invalid rational: ${s}`);
  return rat(BigInt(m[1]), m[2] ? BigInt(m[2]) : 1n);
}
