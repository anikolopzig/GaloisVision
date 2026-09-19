// Copies of a hand-drawn pattern on the integer grid, enumerated exactly.
//
// The built-in shapes are families with a closed-form description — every
// isosceles triple, every square — so each gets its own loop. A pattern the user
// clicks out has no such description, so "copy" has to be *defined* before it can
// be counted, and then found with no formula to guide the search.
//
// What counts as a copy. A pattern P is a finite set of lattice points. A copy is
// the image of P under a plane similarity that happens to land every point of P
// back on the grid. Writing points as Gaussian integers, the similarities are
//
//     direct     z ↦ α z + β
//     reflected  z ↦ α z̄ + β
//
// with α ≠ 0, and the four motion classes on offer are nested restrictions on α:
//
//     translation   α = 1, direct only     P slid around, nothing else
//     aligned       α ∈ {1, i, −1, −i}     the eight symmetries of the square
//     congruent     |α| = 1                same size, any angle
//     similar       α unrestricted         any size, any angle
//
// "Any angle" is less free than it sounds. A rotation maps the whole pattern back
// onto the grid only at the angles the pattern itself permits, and a scaling only
// at the ratios it permits; both fall out of the enumeration below rather than
// having to be characterised in advance. It is why `similar` is the setting under
// which the built-in square family reappears: the tilted squares are exactly the
// similar copies of the unit one.
//
// How copies are found. Fix two distinct pattern points p₀, p₁. A similarity is
// pinned down by where those two go, so every copy is named by an ordered pair of
// distinct grid cells (q₀, q₁) together with a choice of orientation. Enumerate
// those N²(N²−1) pairs, solve for α, drop it if the motion class forbids it, then
// map the remaining pattern points and keep the copy only when every one lands on
// a lattice point inside the grid.
//
// Nothing is approximated. α is carried as a ratio of Gaussian integers and
// "lands on a lattice point" is a divisibility test, so a point is on the grid or
// it is not — there is no tolerance to tune, exactly as with the squared-distance
// tests the built-in shapes use. This module imports nothing.

/** A point of Z². Structurally the same as `Cell` in gridForcing, which imports this. */
export type LatticePoint = { i: number; j: number };

/** Which transformations are taken to produce "the same shape". Listed loosest first. */
export type MotionClass = "similar" | "congruent" | "aligned" | "translation";

export const MOTION_CLASSES: readonly MotionClass[] = ["similar", "congruent", "aligned", "translation"];

export type PatternSpec = {
  /** The pattern's cells, translated against the origin and in a canonical order. */
  points: readonly LatticePoint[];
  motions: MotionClass;
};

export function motionName(m: MotionClass): string {
  switch (m) {
    case "similar":
      return "any size, any angle";
    case "congruent":
      return "same size, any angle";
    case "aligned":
      return "quarter turns and flips";
    case "translation":
      return "sliding only";
  }
}

/** One line on what the class allows, for the control that picks it. */
export function motionBlurb(m: MotionClass): string {
  switch (m) {
    case "similar":
      return "Rotate, reflect, and scale up or down. Under this reading the tilted squares are all copies of the unit square, which is how the built-in square family is defined.";
    case "congruent":
      return "Rotate and reflect, but never resize. A copy has the same side lengths as the pattern you drew.";
    case "aligned":
      return "Only the eight symmetries of the square: quarter turns and mirror flips. This is the polyomino reading — a copy sits squarely on the grid lines.";
    case "translation":
      return "Slide the pattern without turning or resizing it. The most restrictive reading, and the fewest copies.";
  }
}

/** Translate a clicked set against the origin and order it canonically. */
export function normalizePattern(points: readonly LatticePoint[]): LatticePoint[] {
  if (points.length === 0) return [];
  let minI = Infinity;
  let minJ = Infinity;
  for (const p of points) {
    if (p.i < minI) minI = p.i;
    if (p.j < minJ) minJ = p.j;
  }
  const out = points.map((p) => ({ i: p.i - minI, j: p.j - minJ }));
  out.sort((a, b) => a.i - b.i || a.j - b.j);
  return out;
}

/** The pattern's bounding box, in cells. */
export function patternExtent(points: readonly LatticePoint[]): { w: number; h: number } {
  if (points.length === 0) return { w: 0, h: 0 };
  let maxI = 0;
  let maxJ = 0;
  for (const p of points) {
    if (p.i > maxI) maxI = p.i;
    if (p.j > maxJ) maxJ = p.j;
  }
  return { w: maxI + 1, h: maxJ + 1 };
}

/** Product of two Gaussian integers, written out so the reduction stays inspectable. */
function gMul(ax: number, ay: number, bx: number, by: number): [number, number] {
  return [ax * bx - ay * by, ax * by + ay * bx];
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/** |α|², the factor every squared distance in the pattern is multiplied by. */
export type Scale2 = { num: number; den: number };

export function scale2Text(s: Scale2): string {
  return s.den === 1 ? `${s.num}` : `${s.num}/${s.den}`;
}

export type PatternCopy = {
  /** Grid cell indices, one per pattern point, in the pattern's own order. */
  cells: number[];
  scale2: Scale2;
  reflected: boolean;
};

/**
 * Every copy of `pattern` that fits in the N × N grid, deduplicated by cell set.
 *
 * Cost is O(N⁴ · m) — an ordered pair of grid cells for the two anchors, times
 * the points that then have to be checked. At N = 10 that is under 20 000
 * candidate placements, so it stays well inside a frame; it is the *solving*
 * that gets expensive later, not the counting.
 *
 * `limit` is a guard rather than a policy: a pattern whose family is enormous is
 * cut off rather than allowed to exhaust memory, and the caller is expected to
 * notice it hit the cap and decline to solve.
 */
export function patternCopies(n: number, pattern: PatternSpec, limit = 200_000): PatternCopy[] {
  const pts = pattern.points;
  const m = pts.length;
  const out: PatternCopy[] = [];
  if (n < 1 || m === 0) return out;

  const cellCount = n * n;

  // A one-point pattern is every cell, and has no anchor pair to work with.
  if (m === 1) {
    for (let c = 0; c < cellCount && out.length < limit; c++) {
      out.push({ cells: [c], scale2: { num: 1, den: 1 }, reflected: false });
    }
    return out;
  }

  const p0 = pts[0];
  const p1 = pts[1];
  const dI = p1.i - p0.i;
  const dJ = p1.j - p0.j;
  // Non-zero because the pattern's points are distinct cells.
  const den = dI * dI + dJ * dJ;

  const restrictLength = pattern.motions !== "similar";
  const requireUnit = pattern.motions === "aligned" || pattern.motions === "translation";
  const seen = new Set<string>();

  for (let a = 0; a < cellCount; a++) {
    const q0i = Math.floor(a / n);
    const q0j = a % n;
    for (let b = 0; b < cellCount; b++) {
      if (b === a) continue;
      const eI = Math.floor(b / n) - q0i;
      const eJ = (b % n) - q0j;
      // |α|² = |E|²/|D|², so every class but `similar` fixes the anchor distance.
      if (restrictLength && eI * eI + eJ * eJ !== den) continue;

      for (let refl = 0; refl < 2; refl++) {
        if (refl === 1 && pattern.motions === "translation") continue;
        // α = E/D for a direct similarity and E/D̄ for a reflected one; both are
        // held as (numerator over `den`) by multiplying through by the conjugate.
        const [aNumI, aNumJ] = refl === 0 ? gMul(eI, eJ, dI, -dJ) : gMul(eI, eJ, dI, dJ);

        if (requireUnit) {
          if (aNumI % den !== 0 || aNumJ % den !== 0) continue;
          const uI = aNumI / den;
          const uJ = aNumJ / den;
          if (uI * uI + uJ * uJ !== 1) continue;
          if (pattern.motions === "translation" && !(uI === 1 && uJ === 0)) continue;
        }

        const cells = new Array<number>(m);
        cells[0] = a;
        cells[1] = b;
        let ok = true;
        for (let t = 2; t < m; t++) {
          const vI = pts[t].i - p0.i;
          // A reflected similarity acts on the conjugate of the offset.
          const vJ = refl === 0 ? pts[t].j - p0.j : -(pts[t].j - p0.j);
          const [wI, wJ] = gMul(aNumI, aNumJ, vI, vJ);
          if (wI % den !== 0 || wJ % den !== 0) {
            ok = false;
            break;
          }
          const qi = q0i + wI / den;
          const qj = q0j + wJ / den;
          if (qi < 0 || qi >= n || qj < 0 || qj >= n) {
            ok = false;
            break;
          }
          cells[t] = qi * n + qj;
        }
        if (!ok) continue;

        const key = [...cells].sort((x, y) => x - y).join(",");
        if (seen.has(key)) continue;
        seen.add(key);

        const g = gcd(eI * eI + eJ * eJ, den) || 1;
        out.push({
          cells,
          scale2: { num: (eI * eI + eJ * eJ) / g, den: den / g },
          reflected: refl === 1,
        });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

/**
 * The similarity carrying `pattern` onto one of its copies, recovered from the
 * two anchor images alone. Used to explain a copy the board is showing, so the
 * enumeration does not have to keep a transform alongside every occurrence.
 */
export function copyTransform(
  n: number,
  pattern: PatternSpec,
  cells: readonly number[],
): { scale2: Scale2; reflected: boolean } | null {
  const pts = pattern.points;
  if (pts.length < 2 || cells.length !== pts.length) return null;
  const dI = pts[1].i - pts[0].i;
  const dJ = pts[1].j - pts[0].j;
  const den = dI * dI + dJ * dJ;
  if (den === 0) return null;

  const q0i = Math.floor(cells[0] / n);
  const q0j = cells[0] % n;
  const eI = Math.floor(cells[1] / n) - q0i;
  const eJ = (cells[1] % n) - q0j;
  const num = eI * eI + eJ * eJ;
  const g = gcd(num, den) || 1;

  // Orientation is read off a third point: a direct similarity preserves the
  // sign of the cross product, a reflected one flips it. A pattern with only two
  // points has no third point and no handedness to speak of.
  let reflected = false;
  for (let t = 2; t < pts.length; t++) {
    const pc = (pts[1].i - pts[0].i) * (pts[t].j - pts[0].j) - (pts[1].j - pts[0].j) * (pts[t].i - pts[0].i);
    if (pc === 0) continue;
    const qti = Math.floor(cells[t] / n) - q0i;
    const qtj = (cells[t] % n) - q0j;
    const qc = eI * qtj - eJ * qti;
    if (qc === 0) continue;
    reflected = pc > 0 !== qc > 0;
    break;
  }

  return { scale2: { num: num / g, den: den / g }, reflected };
}
