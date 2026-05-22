// Polynomials over Q, stored as coefficient arrays [c0, c1, c2, ...].
// Trailing zeros are trimmed so the last entry is the leading coefficient.

import type { Rational } from "./rational";
import {
  ZERO,
  ONE,
  add,
  sub,
  mul,
  div,
  neg,
  eq,
  isZero,
  isInt,
  rat,
  rationalSqrt,
  toNumber,
  format as fmtRat,
} from "./rational";

export type Polynomial = Rational[]; // length 0 means the zero polynomial

export function deg(p: Polynomial): number {
  return p.length - 1;
}

export function trim(p: Polynomial): Polynomial {
  let i = p.length - 1;
  while (i >= 0 && isZero(p[i])) i--;
  return p.slice(0, i + 1);
}

export function constant(c: Rational): Polynomial {
  return isZero(c) ? [] : [c];
}

export function leading(p: Polynomial): Rational {
  if (p.length === 0) return ZERO;
  return p[p.length - 1];
}

export function isZeroPoly(p: Polynomial): boolean {
  return p.length === 0;
}

export function isMonic(p: Polynomial): boolean {
  return p.length > 0 && eq(p[p.length - 1], ONE);
}

export function addP(a: Polynomial, b: Polynomial): Polynomial {
  const out: Polynomial = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    out.push(add(a[i] ?? ZERO, b[i] ?? ZERO));
  }
  return trim(out);
}

export function subP(a: Polynomial, b: Polynomial): Polynomial {
  const out: Polynomial = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    out.push(sub(a[i] ?? ZERO, b[i] ?? ZERO));
  }
  return trim(out);
}

export function scaleP(a: Polynomial, s: Rational): Polynomial {
  if (isZero(s)) return [];
  return a.map((c) => mul(c, s));
}

export function negP(a: Polynomial): Polynomial {
  return a.map(neg);
}

export function mulP(a: Polynomial, b: Polynomial): Polynomial {
  if (a.length === 0 || b.length === 0) return [];
  const out: Polynomial = Array(a.length + b.length - 1).fill(ZERO);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      out[i + j] = add(out[i + j], mul(a[i], b[j]));
    }
  }
  return trim(out);
}

// Polynomial long division: returns [quotient, remainder].
export function divmodP(a: Polynomial, b: Polynomial): [Polynomial, Polynomial] {
  if (b.length === 0) throw new Error("Division by zero polynomial");
  let r: Polynomial = a.slice();
  const q: Polynomial = Array(Math.max(0, a.length - b.length + 1)).fill(ZERO);
  const dDeg = deg(b);
  const dLead = leading(b);
  while (deg(r) >= dDeg && !isZeroPoly(r)) {
    const shift = deg(r) - dDeg;
    const factor = div(leading(r), dLead);
    q[shift] = factor;
    for (let i = 0; i <= dDeg; i++) {
      r[i + shift] = sub(r[i + shift], mul(factor, b[i]));
    }
    r = trim(r);
  }
  return [trim(q), r];
}

export function modP(a: Polynomial, b: Polynomial): Polynomial {
  return divmodP(a, b)[1];
}

export function gcdP(a: Polynomial, b: Polynomial): Polynomial {
  let x = a;
  let y = b;
  while (!isZeroPoly(y)) {
    const r = modP(x, y);
    x = y;
    y = r;
  }
  // Make monic
  if (x.length === 0) return x;
  return scaleP(x, div(ONE, leading(x)));
}

export function derivP(p: Polynomial): Polynomial {
  if (p.length <= 1) return [];
  const out: Polynomial = [];
  for (let i = 1; i < p.length; i++) {
    out.push(mul(p[i], rat(i)));
  }
  return trim(out);
}

export function evalP(p: Polynomial, x: Rational): Rational {
  let acc: Rational = ZERO;
  for (let i = p.length - 1; i >= 0; i--) {
    acc = add(mul(acc, x), p[i]);
  }
  return acc;
}

// Square-free part: f / gcd(f, f').
export function squareFreePart(p: Polynomial): Polynomial {
  if (deg(p) <= 0) return p;
  const g = gcdP(p, derivP(p));
  if (deg(g) === 0) return p;
  return divmodP(p, g)[0];
}

// Make polynomial monic (divide through by leading coefficient).
export function makeMonic(p: Polynomial): Polynomial {
  if (p.length === 0) return p;
  const lc = leading(p);
  if (eq(lc, ONE)) return p;
  return scaleP(p, div(ONE, lc));
}

// Clear denominators -> integer-coefficient polynomial with same roots.
// Returns the polynomial as Rationals (all integer) plus the common factor used.
export function clearDenominators(p: Polynomial): Polynomial {
  let lcm = 1n;
  for (const c of p) {
    // lcm with c.d
    lcm = (lcm * c.d) / gcdBigInt(lcm, c.d);
  }
  return p.map((c) => rat(c.n * (lcm / c.d), 1n));
}

function gcdBigInt(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

// Translation x -> x + t (for depressing a polynomial).
export function shiftP(p: Polynomial, t: Rational): Polynomial {
  // Horner-style expansion of p(x + t).
  let acc: Polynomial = [];
  for (let i = p.length - 1; i >= 0; i--) {
    // acc = acc * (x + t) + p[i]
    acc = addP(mulP(acc, [t, ONE]), [p[i]]);
  }
  return trim(acc);
}

// Discriminant of monic polynomial of degree n:
//   disc(f) = (-1)^{n(n-1)/2} * Res(f, f') / lc(f)
// Computed via the resultant via the Sylvester matrix (or recursively).
// We use the polynomial-remainder recursion since it is exact in Q.
export function resultant(a: Polynomial, b: Polynomial): Rational {
  // a, b nonzero; returns Res(a, b).
  if (isZeroPoly(a) || isZeroPoly(b)) return ZERO;
  let f = a.slice();
  let g = b.slice();
  let result: Rational = ONE;
  let sign = 1n;
  while (true) {
    const m = deg(f);
    const n = deg(g);
    if (n === 0) {
      // Res(f, g) where g is constant c: c^deg(f)
      const c = g[0];
      // multiply accumulated result by c^m
      let pow: Rational = ONE;
      for (let i = 0; i < m; i++) pow = mul(pow, c);
      result = mul(result, pow);
      break;
    }
    if (m < n) {
      // swap and pick up (-1)^{deg(f) deg(g)}
      if ((m & 1) === 1 && (n & 1) === 1) sign = -sign;
      [f, g] = [g, f];
      continue;
    }
    // f = q*g + r, then Res(f, g) = lc(g)^{deg(f) - deg(r)} * (-1)^{deg(f)*deg(g)} * Res(g, r)
    const [, r] = divmodP(f, g);
    const newM = isZeroPoly(r) ? -1 : deg(r);
    const lcG = leading(g);
    let pow: Rational = ONE;
    const e = m - newM;
    for (let i = 0; i < e; i++) pow = mul(pow, lcG);
    result = mul(result, pow);
    if ((m & 1) === 1 && (n & 1) === 1) sign = -sign;
    if (isZeroPoly(r)) {
      result = ZERO;
      break;
    }
    f = g;
    g = r;
  }
  return sign === -1n ? neg(result) : result;
}

export function discriminant(p: Polynomial): Rational {
  const n = deg(p);
  if (n < 1) return ZERO;
  const lc = leading(p);
  // (-1)^{n(n-1)/2} * Res(p, p') / lc(p)
  const res = resultant(p, derivP(p));
  const quot = div(res, lc);
  const k = (n * (n - 1)) / 2;
  return k % 2 === 0 ? quot : neg(quot);
}

// Pretty-print a polynomial in x, e.g. "x^4 - 2x + 3/2".
export function formatPoly(p: Polynomial, varName = "x"): string {
  if (p.length === 0) return "0";
  const terms: string[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const c = p[i];
    if (isZero(c)) continue;
    const isFirst = terms.length === 0;
    const negative = c.n < 0n;
    const abs = rat(negative ? -c.n : c.n, c.d);
    let coeffPart: string;
    if (i === 0) {
      coeffPart = fmtRat(abs);
    } else if (eq(abs, ONE)) {
      coeffPart = "";
    } else if (isInt(abs)) {
      coeffPart = abs.n.toString();
    } else {
      coeffPart = `(${fmtRat(abs)})`;
    }
    const varPart = i === 0 ? "" : i === 1 ? varName : `${varName}^${i}`;
    const term = coeffPart + (coeffPart && varPart && !coeffPart.endsWith(")") ? "" : "") + varPart;
    const sep = isFirst ? (negative ? "-" : "") : negative ? " - " : " + ";
    terms.push(sep + (term || "1"));
  }
  if (terms.length === 0) return "0";
  return terms.join("");
}

// Find rational roots via the rational root theorem.
// Works on a polynomial with rational coefficients; returns deduplicated roots.
export function rationalRoots(p: Polynomial): Rational[] {
  if (p.length <= 1) return [];
  // Clear denominators so all coefficients are integers.
  const ip = clearDenominators(p);
  const a0 = ip[0].n; // constant term (integer because cleared)
  const an = ip[ip.length - 1].n; // leading (integer)
  if (a0 === 0n) {
    // 0 is a root; factor out x and recurse.
    const tail = ip.slice(1);
    const rest = rationalRoots(tail);
    const seen = new Set<string>();
    const out: Rational[] = [];
    const push = (r: Rational) => {
      const key = `${r.n}/${r.d}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(r);
      }
    };
    push(ZERO);
    for (const r of rest) push(r);
    return out;
  }
  const pDivs = divisorsAbs(a0);
  const qDivs = divisorsAbs(an);
  const candidates: Rational[] = [];
  const seen = new Set<string>();
  for (const num of pDivs) {
    for (const den of qDivs) {
      for (const s of [1n, -1n]) {
        const r = rat(s * num, den);
        const key = `${r.n}/${r.d}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(r);
      }
    }
  }
  const roots: Rational[] = [];
  for (const c of candidates) {
    if (isZero(evalP(p, c))) roots.push(c);
  }
  return roots;
}

function divisorsAbs(n: bigint): bigint[] {
  n = n < 0n ? -n : n;
  if (n === 0n) return [];
  const out: bigint[] = [];
  let i = 1n;
  while (i * i <= n) {
    if (n % i === 0n) {
      out.push(i);
      if (i * i !== n) out.push(n / i);
    }
    i++;
  }
  return out;
}

// Factor out all known rational roots; return [rationalRoots, remaining polynomial].
export function factorOutRationalRoots(p: Polynomial): { roots: Rational[]; remainder: Polynomial } {
  let cur = p.slice();
  const roots: Rational[] = [];
  // Repeat: rationalRoots returns distinct roots, but multiplicities exist; loop until no rational root remains.
  while (true) {
    const rs = rationalRoots(cur);
    if (rs.length === 0) break;
    let progressed = false;
    for (const r of rs) {
      // Divide out (x - r) as many times as it divides.
      while (true) {
        const [q, rem] = divmodP(cur, [neg(r), ONE]);
        if (!isZeroPoly(rem) && !eq(rem[0] ?? ZERO, ZERO)) break;
        cur = q;
        roots.push(r);
        progressed = true;
        if (deg(cur) === 0) return { roots, remainder: cur };
      }
    }
    if (!progressed) break;
  }
  return { roots, remainder: cur };
}

// Find roots of polynomial over Q numerically (complex), using Durand-Kerner.
// Returns deg(p) roots (counted with multiplicity).
export type Complex = { re: number; im: number };

export function rootsNumeric(p: Polynomial): Complex[] {
  const n = deg(p);
  if (n <= 0) return [];
  // Convert to numeric monic form.
  const lc = toNumber(leading(p));
  const coeffs: Complex[] = p.map((c) => ({ re: toNumber(c) / lc, im: 0 }));
  // Initial guesses spaced around a circle (Aberth-style).
  // Radius heuristic: 1 + max(|a_i|).
  let radius = 1;
  for (let i = 0; i < n; i++) radius = Math.max(radius, Math.abs(coeffs[i].re));
  const roots: Complex[] = [];
  for (let i = 0; i < n; i++) {
    const theta = (2 * Math.PI * i) / n + 0.4;
    roots.push({ re: radius * Math.cos(theta), im: radius * Math.sin(theta) });
  }
  const maxIter = 400;
  for (let iter = 0; iter < maxIter; iter++) {
    let maxDelta = 0;
    for (let i = 0; i < n; i++) {
      const r = roots[i];
      const num = evalComplex(coeffs, r);
      let den: Complex = { re: 1, im: 0 };
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        den = cmul(den, csub(r, roots[j]));
      }
      const delta = cdiv(num, den);
      roots[i] = csub(r, delta);
      const mag = Math.hypot(delta.re, delta.im);
      if (mag > maxDelta) maxDelta = mag;
    }
    if (maxDelta < 1e-14) break;
  }
  // Snap tiny imaginary parts to zero
  for (const r of roots) {
    if (Math.abs(r.im) < 1e-9) r.im = 0;
    if (Math.abs(r.re) < 1e-12) r.re = 0;
  }
  return roots;
}

function evalComplex(coeffs: Complex[], x: Complex): Complex {
  let acc: Complex = { re: 0, im: 0 };
  for (let i = coeffs.length - 1; i >= 0; i--) {
    acc = cadd(cmul(acc, x), coeffs[i]);
  }
  return acc;
}

function cadd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}
function csub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}
function cmul(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}
function cdiv(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}

export function isPerfectSquare(a: Rational): boolean {
  return rationalSqrt(a) !== null;
}
