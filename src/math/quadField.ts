// Elements of a quadratic field Q(√d) (with d ∈ Q, not a square), stored as q + k√d.

import type { Rational } from "./rational";
import {
  ZERO,
  add,
  sub,
  mul,
  div,
  isZero,
  sign,
  rationalSqrt,
} from "./rational";

export type QuadElt = { q: Rational; k: Rational }; // represents q + k·√d

export const QZERO: QuadElt = { q: ZERO, k: ZERO };

export function qFromRat(r: Rational): QuadElt {
  return { q: r, k: ZERO };
}

export function qAdd(a: QuadElt, b: QuadElt): QuadElt {
  return { q: add(a.q, b.q), k: add(a.k, b.k) };
}

export function qSub(a: QuadElt, b: QuadElt): QuadElt {
  return { q: sub(a.q, b.q), k: sub(a.k, b.k) };
}

export function qMul(a: QuadElt, b: QuadElt, d: Rational): QuadElt {
  // (a.q + a.k √d)(b.q + b.k √d) = (a.q b.q + d a.k b.k) + (a.q b.k + a.k b.q) √d
  return {
    q: add(mul(a.q, b.q), mul(d, mul(a.k, b.k))),
    k: add(mul(a.q, b.k), mul(a.k, b.q)),
  };
}

export function qSquare(a: QuadElt, d: Rational): QuadElt {
  return qMul(a, a, d);
}

export function qScale(a: QuadElt, s: Rational): QuadElt {
  return { q: mul(a.q, s), k: mul(a.k, s) };
}

export function qIsZero(a: QuadElt): boolean {
  return isZero(a.q) && isZero(a.k);
}

// Is the element a + b√d a perfect square in Q(√d), where d is not a square in Q?
// (x + y√d)^2 = (x^2 + d y^2) + (2 x y) √d. Solve for rational x, y.
export function qIsSquare(elt: QuadElt, d: Rational): boolean {
  const { q: a, k: b } = elt;
  if (isZero(b)) {
    // a + 0·√d. Square iff a = u^2 for some u ∈ Q, or a = d v^2 for some v ∈ Q.
    if (sign(a) >= 0 && rationalSqrt(a) !== null) return true;
    if (sign(a) === sign(d) && rationalSqrt(div(a, d)) !== null) return true;
    return false;
  }
  // Need x^2 + d y^2 = a, 2 x y = b. From second: y = b/(2x) (assuming x ≠ 0).
  // x^2 + d · b^2 / (4 x^2) = a  →  4 x^4 - 4 a x^2 + d b^2 = 0
  // x^2 = (a ± √(a^2 - d b^2)) / 2.
  // Need a^2 - d b^2 to be a non-negative rational square in Q.
  const norm = sub(mul(a, a), mul(d, mul(b, b)));
  if (sign(norm) < 0) return false;
  const w = rationalSqrt(norm);
  if (w === null) return false;
  const candA = div(add(a, w), { n: 2n, d: 1n });
  const candB = div(sub(a, w), { n: 2n, d: 1n });
  for (const c of [candA, candB]) {
    if (sign(c) >= 0 && rationalSqrt(c) !== null) return true;
  }
  return false;
}

// √v as an element of Q(√d), if v ∈ Q is a square in Q(√d). Returns null otherwise.
export function qSqrtOfRational(v: Rational, d: Rational): QuadElt | null {
  if (sign(v) >= 0) {
    const r = rationalSqrt(v);
    if (r !== null) return { q: r, k: ZERO };
  }
  // v = d · y^2 for some rational y?  i.e. v/d should be a non-negative rational square.
  if (sign(v) === sign(d)) {
    const vOverD = div(v, d);
    if (sign(vOverD) >= 0) {
      const y = rationalSqrt(vOverD);
      if (y !== null) return { q: ZERO, k: y };
    }
  }
  return null;
}

// Pretty-print q + k√d.
export function qFormat(e: QuadElt, dName = "√d"): string {
  if (qIsZero(e)) return "0";
  const parts: string[] = [];
  if (!isZero(e.q)) parts.push(formatRat(e.q));
  if (!isZero(e.k)) {
    const sgn = sign(e.k) > 0 ? (parts.length ? " + " : "") : parts.length ? " − " : "−";
    const abs = { n: e.k.n < 0n ? -e.k.n : e.k.n, d: e.k.d };
    const num =
      abs.d === 1n && abs.n === 1n ? "" : abs.d === 1n ? abs.n.toString() : `(${abs.n}/${abs.d})`;
    parts.push(`${sgn}${num}${num ? "·" : ""}${dName}`);
  }
  return parts.join("");
}

function formatRat(r: Rational): string {
  return r.d === 1n ? r.n.toString() : `${r.n}/${r.d}`;
}
