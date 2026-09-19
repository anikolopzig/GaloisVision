// "How many dots force a shape?" on the N × N integer grid, by reduction to SAT.
//
// The question. Fix N and a shape. What is the smallest k such that *every*
// choice of k cells of G_N = {0,…,N−1}² contains a copy of that shape? Call it
// k*(N). Equivalently k*(N) = α(N) + 1, where α(N) is the largest number of
// cells you can place while still avoiding the shape.
//
// The reduction. A SAT solver answers ∃-questions, and "k dots force the shape"
// is a ∀-question. So encode its negation —
//
//     AVOID(N, k):  does some shape-free X ⊆ G_N with |X| ≥ k exist?
//
// — and read UNSAT as the affirmative answer:
//
//     F_{N,k}  =  ⋀_{S forbidden} (⋁_{p ∈ S} ¬x_p)   ∧   atLeast(k)
//
//     SAT   → some k-set avoids every copy of the shape → k is too small
//     UNSAT → every k-set contains one                  → k forces the shape
//
// k*(N) is then the least k with F_{N,k} unsatisfiable, and any model of
// F_{N,k*−1} is a maximum avoiding set.
//
// Do not try to push the negation inside the formula. B ∧ ¬⋀A asks for a k-set
// that *contains* a copy, which is trivially satisfiable for every k ≤ N²; and
// the positive form ⋁(x_a ∧ x_b ∧ x_c) is satisfied by the all-ones assignment
// for every N and k, so it answers nothing. The required negation is of the
// whole quantified statement, and applying it is exactly "read UNSAT".
//
// Conversely ⋀A alone, without the counter, is satisfied by the empty
// assignment: every negated clause is vacuously true. The cardinality counter is
// the only thing ruling that out.
//
// Everything here is exact integer arithmetic on squared distances — no square
// roots, no floating point, no tolerance parameter. Framework-free: this module
// imports only the SAT solver.

import {
  copyTransform,
  patternCopies,
  scale2Text,
  type PatternSpec,
} from "./patternShape";
import { SatSolver, type SatStats } from "./sat";

/** A grid cell. Both coordinates run over 0 … N−1; i is the column, j the row. */
export type Cell = { i: number; j: number };

export type ShapeId = "isosceles" | "square" | "pattern";

export type ShapeSpec = {
  id: ShapeId;
  /**
   * Isosceles only. Three equally spaced collinear points have distances d, d,
   * 2d, so they satisfy the algebra while being no triangle at all. Excluded by
   * convention; turning this on simply enlarges the forbidden family.
   */
  allowCollinear: boolean;
  /** Square only: restrict to squares with sides parallel to the axes. */
  axisAligned: boolean;
  /**
   * Pattern only: the cells drawn on the pad, together with what counts as a
   * copy of them. Absent for the two built-in families, which are whole
   * similarity classes rather than one drawing.
   */
  pattern?: PatternSpec;
};

export const DEFAULT_SHAPE: ShapeSpec = { id: "isosceles", allowCollinear: false, axisAligned: false };

/** A forbidden configuration: the cell indices of one copy of the shape, ascending. */
export type Occurrence = readonly number[];

// ------------------------------------------------------------------ grid --

/** Every cell, in the fixed linear order the cardinality counter assumes. */
export function cells(n: number): Cell[] {
  const out: Cell[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push({ i, j });
  return out;
}

export function cellIndex(n: number, i: number, j: number): number {
  return i * n + j;
}

export function cellAt(n: number, index: number): Cell {
  return { i: Math.floor(index / n), j: index % n };
}

export function cellLabel(c: Cell): string {
  return `(${c.i},${c.j})`;
}

function d2(a: Cell, b: Cell): number {
  const dx = a.i - b.i;
  const dy = a.j - b.j;
  return dx * dx + dy * dy;
}

/** Twice the signed area of the triangle abc; zero exactly when the three are collinear. */
function cross(a: Cell, b: Cell, c: Cell): number {
  return (b.i - a.i) * (c.j - a.j) - (b.j - a.j) * (c.i - a.i);
}

// -------------------------------------------------------------- shapes --

/**
 * Every 3-subset with at least two equal side lengths. Comparison is on squared
 * distances, so it stays in the integers.
 *
 * O(N⁶) in principle — all triples, an O(1) test each — but the constant is
 * tiny and N is small: 4024 triples at N = 8.
 */
export function isoscelesTriples(n: number, allowCollinear = false): Occurrence[] {
  const pts = cells(n);
  const m = pts.length;
  const out: Occurrence[] = [];
  for (let a = 0; a < m; a++) {
    for (let b = a + 1; b < m; b++) {
      const ab = d2(pts[a], pts[b]);
      for (let c = b + 1; c < m; c++) {
        if (!allowCollinear && cross(pts[a], pts[b], pts[c]) === 0) continue;
        const ac = d2(pts[a], pts[c]);
        const bc = d2(pts[b], pts[c]);
        if (ab === ac || ab === bc || ac === bc) out.push([a, b, c]);
      }
    }
  }
  return out;
}

/**
 * Every 4-subset forming a square, tilted ones included.
 *
 * A square is pinned down by its lowest-leftmost corner (x, y) and one side
 * vector (a, b) with a ≥ 1 and b ≥ 0; the other corners follow by rotating that
 * vector a quarter turn. Restricting the vector to that quadrant is what makes
 * the enumeration hit each square exactly once — the other three side vectors of
 * the same square are its rotations. The bounding box is (a+b) × (a+b), which is
 * what bounds the loops.
 *
 * Count: Σ_{s=1}^{N−1} s·(N−s)² with tilt, Σ_{s=1}^{N−1} (N−s)² without.
 */
export function squares(n: number, axisAligned = false): Occurrence[] {
  const out: Occurrence[] = [];
  for (let a = 1; a <= n - 1; a++) {
    const maxTilt = axisAligned ? 0 : n - 1 - a;
    for (let b = 0; b <= maxTilt; b++) {
      const s = a + b;
      for (let x = b; x + a <= n - 1; x++) {
        for (let y = 0; y + s <= n - 1; y++) {
          const corners = [
            cellIndex(n, x, y),
            cellIndex(n, x + a, y + b),
            cellIndex(n, x + a - b, y + b + a),
            cellIndex(n, x - b, y + a),
          ];
          corners.sort((p, q) => p - q);
          out.push(corners);
        }
      }
    }
  }
  return out;
}

/** The forbidden family the reduction forbids, for this grid and shape. */
export function forbiddenSets(n: number, shape: ShapeSpec): Occurrence[] {
  if (n < 2) return [];
  if (shape.id === "pattern") {
    // The cells stay in the pattern's own order rather than ascending, which is
    // what lets a copy be explained afterwards. Nothing downstream — the clause
    // builder, the greedy search, the occurrence scan — depends on the order.
    return shape.pattern ? patternCopies(n, shape.pattern).map((c) => c.cells) : [];
  }
  return shape.id === "isosceles"
    ? isoscelesTriples(n, shape.allowCollinear)
    : squares(n, shape.axisAligned);
}

/** How many cells one copy of the shape uses: 3 for a triangle, 4 for a square. */
export function shapeArity(shape: ShapeSpec): number {
  if (shape.id === "pattern") return shape.pattern?.points.length ?? 0;
  return shape.id === "isosceles" ? 3 : 4;
}

/** "a" or "an" for the shape's name, so the page's prose reads properly. */
export function shapeArticle(shape: ShapeSpec): string {
  return /^[aeiou]/i.test(shapeName(shape)) ? "an" : "a";
}

export function shapeName(shape: ShapeSpec): string {
  if (shape.id === "pattern") {
    return `${shape.pattern?.points.length ?? 0}-point pattern`;
  }
  if (shape.id === "isosceles") {
    return shape.allowCollinear ? "isosceles triple (collinear allowed)" : "isosceles triangle";
  }
  return shape.axisAligned ? "axis-aligned square" : "square";
}

// --------------------------------------------- describing one occurrence --

/**
 * The cells of a convex configuration in cyclic order, so a polygon drawn
 * through them does not self-intersect. Sorting by angle about the centroid is
 * enough here: triangles are always convex, and so is every square.
 */
export function convexOrder(pts: readonly Cell[]): Cell[] {
  if (pts.length < 3) return [...pts];
  const cx = pts.reduce((a, p) => a + p.i, 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p.j, 0) / pts.length;
  return [...pts].sort((p, q) => Math.atan2(p.j - cy, p.i - cx) - Math.atan2(q.j - cy, q.i - cx));
}

/**
 * The convex hull in counter-clockwise order, by Andrew's monotone chain. Exact:
 * the turn test is the same integer cross product used everywhere else here, so
 * a point on a hull edge is decided rather than estimated. Degenerate input — two
 * points, or a collinear run — has no hull, and comes back unchanged.
 */
export function convexHull(pts: readonly Cell[]): Cell[] {
  if (pts.length < 3) return [...pts];
  const sorted = [...pts].sort((a, b) => a.i - b.i || a.j - b.j);
  const half = (input: readonly Cell[]): Cell[] => {
    const out: Cell[] = [];
    for (const p of input) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  const hull = [...half(sorted), ...half([...sorted].reverse())];
  return hull.length >= 3 ? hull : [...sorted];
}

export type OccurrenceEdge = {
  from: Cell;
  to: Cell;
  /** Squared length — an exact integer, which is why no square roots are needed. */
  length2: number;
  /** True for the sides whose equality is what makes this a copy of the shape. */
  witnessing: boolean;
};

export type OccurrenceDetail = {
  vertices: Cell[];
  edges: OccurrenceEdge[];
  /**
   * The copy's convex hull in cyclic order — the region the board shades. It
   * equals `vertices` for the built-in shapes, which are convex by
   * construction. A hand-drawn pattern need not be, and a polygon through its
   * points in any order would cross itself.
   */
  hull: Cell[];
  /** One line of plain English saying why these cells are a copy of the shape. */
  reason: string;
};

/**
 * Why a particular set of cells counts as the shape — the pair of equal sides
 * for a triangle, the four equal sides for a square. This is the readout the
 * board shows when an arrangement stops being shape-free, so it names the sides
 * rather than merely flagging the failure.
 */
export function describeOccurrence(n: number, shape: ShapeSpec, occurrence: Occurrence): OccurrenceDetail {
  if (shape.id === "pattern") return describePatternCopy(n, shape, occurrence);
  const vertices = convexOrder(occurrence.map((p) => cellAt(n, p)));
  const edges: OccurrenceEdge[] = vertices.map((v, idx) => {
    const w = vertices[(idx + 1) % vertices.length];
    return { from: v, to: w, length2: d2(v, w), witnessing: false };
  });

  if (shape.id === "square") {
    for (const e of edges) e.witnessing = true;
    const side2 = edges[0]?.length2 ?? 0;
    return {
      vertices,
      edges,
      hull: vertices,
      reason: `four equal sides of squared length ${side2} meeting at right angles`,
    };
  }

  // A triangle: find the repeated squared side length and mark the sides carrying it.
  let repeated: number | null = null;
  for (let a = 0; a < edges.length && repeated === null; a++) {
    for (let b = a + 1; b < edges.length; b++) {
      if (edges[a].length2 === edges[b].length2) {
        repeated = edges[a].length2;
        break;
      }
    }
  }
  let count = 0;
  for (const e of edges) {
    e.witnessing = repeated !== null && e.length2 === repeated;
    if (e.witnessing) count++;
  }
  const collinear =
    vertices.length === 3 && cross(vertices[0], vertices[1], vertices[2]) === 0;
  const reason = collinear
    ? `two equal squared lengths ${repeated}, but the three cells are collinear — a degenerate "triangle" of zero area`
    : count === 3
      ? `all three sides of squared length ${repeated}: equilateral, so certainly isosceles`
      : `two sides of equal squared length ${repeated}`;
  return { vertices, edges, hull: vertices, reason };
}

/**
 * A copy of a hand-drawn pattern.
 *
 * There are no distinguished sides to name here — the pattern is whatever was
 * clicked, so no two of its lengths need be equal and nothing about it is what
 * "makes" a copy a copy. What is worth saying instead is which similarity
 * carried the drawing onto these cells: how much it grew or shrank, and whether
 * it was turned over. Both come back exactly, as a ratio of integers.
 */
function describePatternCopy(n: number, shape: ShapeSpec, occurrence: Occurrence): OccurrenceDetail {
  // Not reordered: the cells arrive in the pattern's own order, which is the
  // correspondence the transform is read from.
  const vertices = occurrence.map((p) => cellAt(n, p));
  const hull = convexHull(vertices);
  const edges: OccurrenceEdge[] = [];
  if (hull.length === 2) {
    edges.push({ from: hull[0], to: hull[1], length2: d2(hull[0], hull[1]), witnessing: false });
  } else if (hull.length >= 3) {
    for (let idx = 0; idx < hull.length; idx++) {
      const v = hull[idx];
      const w = hull[(idx + 1) % hull.length];
      edges.push({ from: v, to: w, length2: d2(v, w), witnessing: false });
    }
  }

  const t = shape.pattern ? copyTransform(n, shape.pattern, occurrence) : null;
  if (!t) return { vertices, edges, hull, reason: "a copy of the pattern you drew" };
  const size =
    t.scale2.num === t.scale2.den
      ? "at the size you drew it"
      : `with every squared distance multiplied by ${scale2Text(t.scale2)}`;
  return {
    vertices,
    edges,
    hull,
    reason: `a copy of your pattern ${size}${t.reflected ? ", mirrored" : ""}`,
  };
}

// ---------------------------------------------------- checking a drawing --

/** The first copy of the shape sitting inside `selected`, or null if it is shape-free. */
export function findOccurrence(selected: ReadonlySet<number>, forbidden: readonly Occurrence[]): Occurrence | null {
  // Not "< 3": a hand-drawn pattern may have as few as two points.
  if (selected.size === 0) return null;
  for (const s of forbidden) {
    let all = true;
    for (const p of s) {
      if (!selected.has(p)) {
        all = false;
        break;
      }
    }
    if (all) return s;
  }
  return null;
}

/** Every copy of the shape inside `selected`, capped so a full grid cannot stall the page. */
export function findOccurrences(
  selected: ReadonlySet<number>,
  forbidden: readonly Occurrence[],
  limit = 2000,
): Occurrence[] {
  const out: Occurrence[] = [];
  if (selected.size === 0) return out;
  for (const s of forbidden) {
    let all = true;
    for (const p of s) {
      if (!selected.has(p)) {
        all = false;
        break;
      }
    }
    if (all) {
      out.push(s);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/**
 * Cells that could still be added without creating a copy of the shape. Used to
 * tell a stuck arrangement (no legal move left) from a merely unfinished one.
 */
export function safeAdditions(
  n: number,
  selected: ReadonlySet<number>,
  forbidden: readonly Occurrence[],
): number[] {
  if (findOccurrence(selected, forbidden) !== null) return [];
  const out: number[] = [];
  for (let p = 0; p < n * n; p++) {
    if (selected.has(p)) continue;
    let safe = true;
    for (const s of forbidden) {
      if (!s.includes(p)) continue;
      let rest = true;
      for (const q of s) {
        if (q !== p && !selected.has(q)) {
          rest = false;
          break;
        }
      }
      if (rest) {
        safe = false;
        break;
      }
    }
    if (safe) out.push(p);
  }
  return out;
}

/**
 * A shape-free set grown greedily from a seeded random order. Not optimal, but
 * it is a *certificate*: every set it returns is verified shape-free, so it
 * lower-bounds α(N) without the solver being involved at all.
 */
export function greedyAvoidingSet(n: number, forbidden: readonly Occurrence[], seed = 1): number[] {
  const m = n * n;
  const order = Array.from({ length: m }, (_, i) => i);
  let state = (seed * 2654435761) >>> 0;
  for (let i = m - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }
  // Index the forbidden family by cell, so adding a cell only rechecks its own sets.
  const byCell: Occurrence[][] = Array.from({ length: m }, () => []);
  for (const s of forbidden) for (const p of s) byCell[p].push(s);

  const chosen = new Set<number>();
  for (const p of order) {
    let safe = true;
    for (const s of byCell[p]) {
      let rest = true;
      for (const q of s) {
        if (q !== p && !chosen.has(q)) {
          rest = false;
          break;
        }
      }
      if (rest) {
        safe = false;
        break;
      }
    }
    if (safe) chosen.add(p);
  }
  return [...chosen].sort((a, b) => a - b);
}

/** Best of several greedy restarts — a cheap certified lower bound for α(N). */
export function bestGreedyAvoidingSet(n: number, forbidden: readonly Occurrence[], restarts = 60): number[] {
  let best: number[] = [];
  for (let s = 1; s <= restarts; s++) {
    const cand = greedyAvoidingSet(n, forbidden, s);
    if (cand.length > best.length) best = cand;
  }
  return best;
}

// ------------------------------------------------------------- encoding --

export type VarRole =
  | { kind: "cell"; cell: Cell }
  | { kind: "counter"; i: number; j: number }
  | { kind: "split"; group: number };

export type FormulaSection = {
  id: string;
  title: string;
  note: string;
  /** This section's clauses are `formula.clauses.slice(start, end)`. */
  start: number;
  end: number;
};

export type Formula = {
  n: number;
  k: number;
  shape: ShapeSpec;
  width3: boolean;
  /** DIMACS clauses: non-zero signed variable numbers, variables 1-based. */
  clauses: number[][];
  numVars: number;
  /** Number of primary variables, one per cell: M = N². */
  numCells: number;
  /** `roles[v]` for v ≥ 1; index 0 is a placeholder. */
  roles: VarRole[];
  sections: FormulaSection[];
  maxWidth: number;
};

/**
 * Sinz's sequential counter for "at least k of the M cells are chosen".
 *
 * s_{i,j} is read as "at least j of the first i cells are chosen", with the
 * conventions s_{i,0} ≡ 1 and s_{i,j} ≡ 0 for j > i, which make some literals
 * constant and let them be dropped. Only the forward implication
 *
 *     s_{i,j} → s_{i−1,j} ∨ (y_i ∧ s_{i−1,j−1})
 *
 * is encoded. That is sound in one direction only — s_{i,j} may sit at 0 even
 * when the count is met — which costs nothing here, because the sole s ever
 * asserted is the top one, s_{M,k}. It halves the clause count.
 *
 * Note it enforces *at least* k, never exactly k. By monotonicity (a (k+1)-set
 * contains a k-subset, and any copy of the shape inside the smaller set survives
 * in the larger) the two have the same answer, and at-least is cheaper.
 */
function sequentialCounter(
  m: number,
  k: number,
  cellVar: (i: number) => number,
  alloc: (role: VarRole) => number,
): { take: number[][]; carry: number[][]; assertion: number[][] } {
  const s = new Map<number, number>();
  const key = (i: number, j: number) => i * (k + 1) + j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= Math.min(i, k); j++) {
      s.set(key(i, j), alloc({ kind: "counter", i, j }));
    }
  }
  const sv = (i: number, j: number) => s.get(key(i, j)) as number;

  const take: number[][] = [];
  const carry: number[][] = [];
  for (let i = 1; i <= m; i++) {
    const y = cellVar(i - 1);
    for (let j = 1; j <= Math.min(i, k); j++) {
      if (j < i) {
        take.push([-sv(i, j), sv(i - 1, j), y]);
        if (j >= 2) carry.push([-sv(i, j), sv(i - 1, j), sv(i - 1, j - 1)]);
      } else {
        // j === i: nothing of the first i−1 cells can carry j of them.
        take.push([-sv(i, i), y]);
        if (i >= 2) carry.push([-sv(i, i), sv(i - 1, i - 1)]);
      }
    }
  }
  return { take, carry, assertion: [[sv(m, k)]] };
}

/**
 * Chain reduction of a wide clause to 3-clauses:
 * (l₁ ∨ … ∨ lₙ) ⇝ (l₁ ∨ l₂ ∨ z₁)(¬z₁ ∨ l₃ ∨ z₂)…(¬z_{n−3} ∨ l_{n−1} ∨ lₙ).
 * Equisatisfiable, not equivalent — which is all that is ever asked of it.
 */
function splitWide(lits: readonly number[], alloc: (role: VarRole) => number, group: number): number[][] {
  if (lits.length <= 3) return [[...lits]];
  const out: number[][] = [];
  let prev = 0;
  for (let i = 0; i <= lits.length - 3; i++) {
    if (i === 0) {
      const z = alloc({ kind: "split", group });
      out.push([lits[0], lits[1], z]);
      prev = z;
    } else if (i === lits.length - 3) {
      out.push([-prev, lits[lits.length - 2], lits[lits.length - 1]]);
    } else {
      const z = alloc({ kind: "split", group });
      out.push([-prev, lits[i + 1], z]);
      prev = z;
    }
  }
  return out;
}

/**
 * F_{N,k} for the given forbidden family, with its clauses grouped so the
 * reduction page can show what each block is for.
 */
export function buildFormula(
  n: number,
  k: number,
  shape: ShapeSpec,
  forbidden: readonly Occurrence[],
  width3: boolean,
): Formula {
  const m = n * n;
  const roles: VarRole[] = [{ kind: "split", group: -1 }]; // index 0 is never a variable
  const alloc = (role: VarRole): number => {
    roles.push(role);
    return roles.length - 1;
  };
  const grid = cells(n);
  for (const c of grid) alloc({ kind: "cell", cell: c });
  const cellVar = (index: number) => index + 1;

  const clauses: number[][] = [];
  const sections: FormulaSection[] = [];
  const mark = (id: string, title: string, note: string, start: number) => {
    sections.push({ id, title, note, start, end: clauses.length });
  };

  const geoStart = clauses.length;
  let group = 0;
  for (const s of forbidden) {
    const lits = s.map((p) => -cellVar(p));
    if (width3 && lits.length > 3) {
      for (const c of splitWide(lits, alloc, group)) clauses.push(c);
    } else {
      clauses.push(lits);
    }
    group++;
  }
  const arity = forbidden.length > 0 ? forbidden[0].length : 0;
  const split = width3 && arity > 3;
  mark(
    "geometry",
    "Geometry",
    `One clause per copy of the ${shapeName(shape)} in the grid, saying its cells are not all chosen. ` +
      `De Morgan turns ¬(x_a ∧ x_b ∧ …) into a disjunction of negative literals for free — no Tseitin encoding is needed anywhere.` +
      (split
        ? ` Each of the ${forbidden.length} copies uses ${arity} cells, so its width-${arity} clause is chained into ` +
          `${arity - 2} width-3 clauses through ${arity - 3} fresh ${arity === 4 ? "variable" : "variables"}.`
        : ""),
    geoStart,
  );

  // The counter is built after the geometry so that split variables, which the
  // geometry may introduce, keep their clauses next to the shape they came from.
  const counter = sequentialCounter(m, k, cellVar, alloc);
  const takeStart = clauses.length;
  for (const c of counter.take) clauses.push(c);
  mark(
    "counter-take",
    "Counter — the new cell",
    "s(i,j) → s(i−1,j) ∨ x_i: reaching j among the first i means either the first i−1 already got there, or cell i itself was chosen.",
    takeStart,
  );

  const carryStart = clauses.length;
  for (const c of counter.carry) clauses.push(c);
  mark(
    "counter-carry",
    "Counter — the carry",
    "s(i,j) → s(i−1,j) ∨ s(i−1,j−1): and in that second case the first i−1 cells must already have supplied j−1.",
    carryStart,
  );

  const assertStart = clauses.length;
  for (const c of counter.assertion) clauses.push(c);
  mark(
    "counter-assert",
    "The assertion",
    `The single unit clause s(${m},${k}). Without it the whole formula is satisfied by choosing nothing at all, since every geometry clause is then vacuously true.`,
    assertStart,
  );

  let maxWidth = 0;
  for (const c of clauses) maxWidth = Math.max(maxWidth, c.length);

  return {
    n,
    k,
    shape,
    width3,
    clauses,
    numVars: roles.length - 1,
    numCells: m,
    roles,
    sections,
    maxWidth,
  };
}

/** How a variable prints in the formula display: x(i,j), s(i,j) or z_r. */
export function varLabel(formula: Formula, v: number): string {
  const role = formula.roles[v];
  if (!role) return `v${v}`;
  if (role.kind === "cell") return `x(${role.cell.i},${role.cell.j})`;
  if (role.kind === "counter") return `s(${role.i},${role.j})`;
  return `z${v - formula.numCells}`;
}

export function clauseText(formula: Formula, clause: readonly number[]): string {
  return clause.map((d) => (d < 0 ? `¬${varLabel(formula, -d)}` : varLabel(formula, d))).join(" ∨ ");
}

export function formulaToDimacs(formula: Formula): string {
  const lines = [
    `c ${formula.n}x${formula.n} grid, forbidding the ${shapeName(formula.shape)}, k = ${formula.k}`,
    `c SAT means some ${formula.k}-cell arrangement avoids the shape; UNSAT means ${formula.k} cells force it.`,
    `p cnf ${formula.numVars} ${formula.clauses.length}`,
  ];
  for (const c of formula.clauses) lines.push(`${c.join(" ")} 0`);
  return `${lines.join("\n")}\n`;
}

// -------------------------------------------------------------- deciding --

/** What the solver concluded about one value of k. */
export type Verdict = "forced" | "avoidable" | "undecided";

/** The solver's verdict on one k, with the instance it was read off. */
export type KOutcome = {
  k: number;
  verdict: Verdict;
  witness?: number[];
  stats: SatStats;
  numVars: number;
  numClauses: number;
};

export type RunMode = "threshold" | "single";

export type RunConfig = {
  n: number;
  shape: ShapeSpec;
  width3: boolean;
  mode: RunMode;
  /** The k to decide, or the k the upward scan starts from. */
  k: number;
  /** Hard ceiling on k for the scan. */
  kMax: number;
  /** Conflicts allowed on a single k before the run reports it undecided. */
  budgetPerK: number;
};

/**
 * A resumable run of the reduction: build F_{N,k}, hand it to the solver, and
 * advance it in slices small enough to keep the page responsive. Cheap SAT
 * calls below the threshold finish in a slice or two; the decisive UNSAT call
 * at the threshold is where essentially all the time goes, which is the whole
 * asymmetry of the problem — exhibiting one avoiding arrangement is easy,
 * proving that none exists is the entire cost.
 *
 * `step` is the only thing the UI drives, and it never blocks for longer than
 * the conflict budget handed to it.
 */
export class ForcingRun {
  readonly config: RunConfig;
  readonly forbidden: readonly Occurrence[];
  readonly outcomes: KOutcome[] = [];

  private currentK: number;
  private formula: Formula | null = null;
  private solver: SatSolver | null = null;
  private spentOnK = 0;
  private finished = false;
  /** Set once a k exhausts its budget: the run stopped short, it did not conclude. */
  private ranOut = false;
  private answerK: number | null = null;

  constructor(config: RunConfig, forbidden: readonly Occurrence[]) {
    this.config = config;
    this.forbidden = forbidden;
    this.currentK = config.k;
  }

  get done(): boolean {
    return this.finished;
  }

  /** The threshold k*, once a scan has found its first UNSAT. */
  get answer(): number | null {
    return this.answerK;
  }

  get gaveUp(): boolean {
    return this.ranOut;
  }

  /** The k currently being decided, and how much of its budget is gone. */
  get progress(): { k: number; conflicts: number; budget: number } {
    return { k: this.currentK, conflicts: this.spentOnK, budget: this.config.budgetPerK };
  }

  get currentFormula(): Formula | null {
    return this.formula;
  }

  private begin(): void {
    const f = buildFormula(this.config.n, this.currentK, this.config.shape, this.forbidden, this.config.width3);
    this.formula = f;
    const s = new SatSolver(f.numVars);
    for (const c of f.clauses) {
      if (!s.addClause(c)) break;
    }
    this.solver = s;
    this.spentOnK = 0;
  }

  private record(verdict: Verdict, witness?: number[]): void {
    const f = this.formula as Formula;
    this.outcomes.push({
      k: this.currentK,
      verdict,
      witness,
      stats: (this.solver as SatSolver).getStats(),
      numVars: f.numVars,
      numClauses: f.clauses.length,
    });
  }

  /** Advance the search by at most `conflicts` conflicts. */
  step(conflicts: number): void {
    if (this.finished) return;
    const m = this.config.n * this.config.n;
    if (this.currentK > m || this.currentK > this.config.kMax) {
      this.finished = true;
      return;
    }
    if (!this.solver) this.begin();
    const solver = this.solver as SatSolver;

    const slice = Math.max(1, Math.min(conflicts, this.config.budgetPerK - this.spentOnK));
    const before = solver.getStats().conflicts;
    const status = solver.solve({ maxConflicts: slice });
    this.spentOnK += solver.getStats().conflicts - before;

    if (status === "unknown") {
      if (this.spentOnK >= this.config.budgetPerK) {
        this.record("undecided");
        this.ranOut = true;
        this.finished = true;
      }
      return;
    }

    if (status === "sat") {
      const model = solver.model();
      const witness: number[] = [];
      for (let p = 0; p < m; p++) if (model[p + 1]) witness.push(p);
      this.record("avoidable", witness);
      this.solver = null;
      if (this.config.mode === "single") {
        this.finished = true;
        return;
      }
      this.currentK += 1;
      if (this.currentK > m || this.currentK > this.config.kMax) this.finished = true;
      return;
    }

    this.record("forced");
    this.answerK = this.currentK;
    this.finished = true;
  }
}

/** Blocking convenience wrapper — for the smoke scripts, not for the page. */
export function forcedThreshold(
  n: number,
  shape: ShapeSpec,
  options: { kMin?: number; width3?: boolean; budgetPerK?: number } = {},
): { answer: number | null; witness: number[] | null; outcomes: KOutcome[] } {
  const forbidden = forbiddenSets(n, shape);
  const run = new ForcingRun(
    {
      n,
      shape,
      width3: options.width3 ?? false,
      mode: "threshold",
      k: options.kMin ?? 3,
      kMax: n * n,
      budgetPerK: options.budgetPerK ?? Number.MAX_SAFE_INTEGER,
    },
    forbidden,
  );
  while (!run.done) run.step(20000);
  const last = [...run.outcomes].reverse().find((o) => o.verdict === "avoidable");
  return { answer: run.answer, witness: last?.witness ?? null, outcomes: run.outcomes };
}

/**
 * Exhaustive maximum shape-free set by branch and bound, with no SAT solver
 * anywhere. Slow, but wholly independent of the encoding, which is what makes
 * it worth having: it is what the smoke tests check the reduction against.
 */
export function bruteForceMaxAvoiding(n: number, forbidden: readonly Occurrence[]): number {
  const m = n * n;
  const byCell: Occurrence[][] = Array.from({ length: m }, () => []);
  for (const s of forbidden) for (const p of s) byCell[p].push(s);
  const chosen = new Uint8Array(m);
  let best = 0;

  const conflicts = (p: number): boolean => {
    for (const s of byCell[p]) {
      let rest = true;
      for (const q of s) {
        if (q !== p && !chosen[q]) {
          rest = false;
          break;
        }
      }
      if (rest) return true;
    }
    return false;
  };

  const search = (p: number, size: number): void => {
    if (size + (m - p) <= best) return; // no room left to beat the record
    if (p === m) {
      if (size > best) best = size;
      return;
    }
    if (!conflicts(p)) {
      chosen[p] = 1;
      search(p + 1, size + 1);
      chosen[p] = 0;
    }
    search(p + 1, size);
  };

  search(0, 0);
  return best;
}
