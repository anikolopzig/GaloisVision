// Shortest- and closest-vector algorithms, exact in rational arithmetic.
//
// gaussReduce: the Gauss / Lagrange algorithm that reduces a 2-D basis so that
// b1 is the shortest nonzero vector of the lattice. Returns the full step trace
// for visualization.
//
// babai: Babai's rounding for the closest-vector problem in any dimension
// (used at n = 2 and 3) — write the target in basis coordinates, round, map
// back — together with a window-bounded brute-force nearest point for comparison.

import {
  rat,
  add,
  sub,
  mul,
  div,
  sign,
  isZero,
  roundRat,
  ZERO,
  type Rational,
} from "./rational";
import { dot, ratDet, type RVec } from "./lattice";

// ---------------------------------------------------------------------------
// Rational vector helpers
// ---------------------------------------------------------------------------

export function vAdd(a: RVec, b: RVec): RVec {
  return a.map((ai, i) => add(ai, b[i]));
}
export function vSub(a: RVec, b: RVec): RVec {
  return a.map((ai, i) => sub(ai, b[i]));
}
export function vScaleInt(k: bigint, v: RVec): RVec {
  const kr = rat(k);
  return v.map((vi) => mul(kr, vi));
}
export function normSq(v: RVec): Rational {
  return dot(v, v);
}

// a < b for rationals
function lt(a: Rational, b: Rational): boolean {
  return sign(sub(a, b)) < 0;
}

// Σ zᵢ·basisᵢ as a rational vector.
function combine(basis: RVec[], z: bigint[]): RVec {
  const dim = basis[0].length;
  const out: RVec = new Array(dim).fill(ZERO);
  for (let i = 0; i < basis.length; i++) {
    const zi = rat(z[i]);
    for (let r = 0; r < dim; r++) out[r] = add(out[r], mul(zi, basis[i][r]));
  }
  return out;
}

// ---------------------------------------------------------------------------
// (A) Gauss / Lagrange reduction (2-D)
// ---------------------------------------------------------------------------

export type GaussStep =
  | { kind: "swap"; b1: RVec; b2: RVec; b1NormSq: Rational; b2NormSq: Rational; note: string }
  | {
      kind: "reduce";
      b1: RVec;
      b1NormSq: Rational;
      ip: Rational;
      mu: Rational;
      m: bigint;
      proj: RVec;
      oldB2: RVec;
      newB2: RVec;
      note: string;
    }
  | { kind: "done"; b1: RVec; b2: RVec; b1NormSq: Rational; mu: Rational; note: string };

export type GaussResult = {
  steps: GaussStep[];
  reducedB1: RVec;
  reducedB2: RVec;
  b1NormSq: Rational;
  degenerate: boolean;
};

export function gaussReduce(b1: RVec, b2: RVec, maxIters = 1000): GaussResult {
  let v1 = b1.slice();
  let v2 = b2.slice();
  const steps: GaussStep[] = [];
  const degenerate = isZero(ratDet([v1, v2]));

  for (let iter = 0; iter <= maxIters; iter++) {
    if (lt(normSq(v2), normSq(v1))) {
      [v1, v2] = [v2, v1];
      steps.push({
        kind: "swap",
        b1: v1,
        b2: v2,
        b1NormSq: normSq(v1),
        b2NormSq: normSq(v2),
        note: "‖b₂‖ < ‖b₁‖ — swap so b₁ is the shorter vector",
      });
    }
    const n1 = normSq(v1);
    if (isZero(n1)) {
      steps.push({ kind: "done", b1: v1, b2: v2, b1NormSq: n1, mu: ZERO, note: "b₁ is the zero vector (degenerate basis)." });
      break;
    }
    const ip = dot(v1, v2);
    const mu = div(ip, n1);
    const m = roundRat(mu);
    if (m === 0n) {
      steps.push({ kind: "done", b1: v1, b2: v2, b1NormSq: n1, mu, note: "μ rounds to 0 — the basis is reduced; b₁ is shortest." });
      break;
    }
    const proj = vScaleInt(m, v1);
    const newB2 = vSub(v2, proj);
    steps.push({
      kind: "reduce",
      b1: v1,
      b1NormSq: n1,
      ip,
      mu,
      m,
      proj,
      oldB2: v2,
      newB2,
      note: `μ = ⟨b₁,b₂⟩/⟨b₁,b₁⟩ rounds to ${m}; subtract ${m}·b₁ from b₂.`,
    });
    v2 = newB2;
  }

  return { steps, reducedB1: v1, reducedB2: v2, b1NormSq: normSq(v1), degenerate };
}

// ---------------------------------------------------------------------------
// (B) Babai rounding (n-D)
// ---------------------------------------------------------------------------

// Coordinates of t in the given basis: solves Σ xᵢ·basisᵢ = t. Returns null if
// the basis is degenerate (determinant zero).
export function coordsInBasis(basis: RVec[], t: RVec): RVec | null {
  const n = basis.length;
  // M has the basis vectors as COLUMNS: M[r][i] = basis[i][r].
  const M: RVec[] = [];
  for (let r = 0; r < n; r++) {
    M.push([]);
    for (let i = 0; i < n; i++) M[r].push(basis[i][r]);
  }
  const det = ratDet(M);
  if (isZero(det)) return null;
  const x: RVec = [];
  for (let i = 0; i < n; i++) {
    const Mi = M.map((row, r) => row.map((val, c) => (c === i ? t[r] : val)));
    x.push(div(ratDet(Mi), det));
  }
  return x;
}

export type BabaiResult = {
  x: RVec; // target coords in the basis
  z: bigint[]; // rounded coords
  v: RVec; // Babai lattice point
  distSq: Rational; // ‖t − v‖²
  best: { z: bigint[]; v: RVec; distSq: Rational }; // nearest within the search window
  babaiIsOptimal: boolean;
  detZero: boolean;
};

export function babai(basis: RVec[], t: RVec, window = 2): BabaiResult {
  const empty: BabaiResult = {
    x: [],
    z: [],
    v: [],
    distSq: ZERO,
    best: { z: [], v: [], distSq: ZERO },
    babaiIsOptimal: false,
    detZero: true,
  };
  const x = coordsInBasis(basis, t);
  if (x === null) return empty;
  const z = x.map(roundRat);
  const v = combine(basis, z);
  const distSq = normSq(vSub(t, v));
  const best = bruteForceNearest(basis, t, z, window);
  const babaiIsOptimal = sign(sub(best.distSq, distSq)) === 0;
  return { x, z, v, distSq, best, babaiIsOptimal, detZero: false };
}

// Nearest lattice point to t over integer offsets in [-window, window]^n around
// z0. Bounded ((2w+1)^n evaluations) so it stays cheap; this is the closest
// point within the search window, not a guaranteed global CVP solution.
function bruteForceNearest(
  basis: RVec[],
  t: RVec,
  z0: bigint[],
  window: number,
): { z: bigint[]; v: RVec; distSq: Rational } {
  const n = basis.length;
  const span = 2 * window + 1;
  const total = span ** n;
  let bestZ = z0.slice();
  let bestV = combine(basis, z0);
  let bestDistSq = normSq(vSub(t, bestV));
  let bestAbsSum = absSum(z0);

  for (let idx = 0; idx < total; idx++) {
    let rem = idx;
    const z = z0.slice();
    for (let i = 0; i < n; i++) {
      const off = (rem % span) - window;
      rem = Math.floor(rem / span);
      z[i] = z0[i] + BigInt(off);
    }
    const v = combine(basis, z);
    const d = normSq(vSub(t, v));
    const cmp = sign(sub(d, bestDistSq));
    if (cmp < 0) {
      bestZ = z;
      bestV = v;
      bestDistSq = d;
      bestAbsSum = absSum(z);
    } else if (cmp === 0) {
      const s = absSum(z);
      if (s < bestAbsSum) {
        bestZ = z;
        bestV = v;
        bestAbsSum = s;
      }
    }
  }
  return { z: bestZ, v: bestV, distSq: bestDistSq };
}

function absSum(z: bigint[]): bigint {
  return z.reduce((s, zi) => s + (zi < 0n ? -zi : zi), 0n);
}
