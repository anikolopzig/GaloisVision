// What the page will and will not offer to compute, and why.
//
// Drawing on a grid is free; refuting a formula is not. The numbers below come
// from running the reduction in this repo's own solver (`npx tsx
// scripts/smoke-grid-forcing.ts` exercises the same code path), and they are
// what the difficulty badges and the disabled buttons are based on. Plain .ts
// so the components stay component-only exports.

import { shapeArity, type ShapeSpec } from "../../math/gridForcing";

/** Smallest grid worth drawing on. Below 2 there is nothing to place. */
export const MIN_GRID = 2;

/** Largest grid the board will draw. Drawing and shape-detection stay cheap well past what the solver can refute. */
export const MAX_GRID = 10;

/** Largest grid the solver is offered on at all. Above this, every interesting k is out of reach. */
export const MAX_SOLVER_GRID = 8;

/**
 * Hard ceiling on k, on top of the trivial k ≤ N².
 *
 * The cardinality counter is the part of F that grows with k — about 2kN²
 * clauses — so an unbounded k is an unbounded formula. 48 is chosen to clear
 * every threshold this page can actually reach: the largest is k* = 42, for
 * axis-aligned squares on the 8×8 grid.
 */
export const MAX_K = 48;

/** The pad the shape is drawn on, in cells to a side. */
export const MIN_PATTERN_GRID = 2;
export const MAX_PATTERN_GRID = 6;

/**
 * Most points a drawn shape may have. Every extra point widens the geometry
 * clause, and a width-w clause is chained into w−2 clauses through w−3 fresh
 * variables, so the encoding grows with it — but the real reason for a cap is
 * that sparse shapes have few copies, which pushes k* toward N² and the counter
 * with it.
 */
export const MAX_PATTERN_POINTS = 8;

/**
 * There is deliberately no cap on the number of copies, because none is needed.
 * A copy is named by an ordered pair of anchor images and an orientation, so the
 * family holds at most 2M(M−1) members — 8 064 at the solver's N = 8 ceiling,
 * 19 800 at the largest grid the board will draw. Even the worst of those is a
 * smaller geometry block than the isosceles family already carries. What makes a
 * drawn shape expensive is never the size of the instance; it is how long the
 * refutation takes, which no count can predict. That is what the conflict budget
 * and the cancel button are for.
 */

/** Fewer cells than the shape has corners cannot contain a copy of it. */
export function minK(shape: ShapeSpec): number {
  return Math.max(1, shapeArity(shape));
}

export function maxK(n: number): number {
  return Math.min(n * n, MAX_K);
}

export function clampK(k: number, n: number, shape: ShapeSpec): number {
  return Math.min(maxK(n), Math.max(minK(shape), Math.round(k)));
}

/**
 * Conflicts allowed on a single k before the run gives up and says so. At the
 * measured rate of a few thousand conflicts a second this is minutes, not
 * hours, and the run is cancellable throughout.
 */
export const CONFLICT_BUDGET = 1_200_000;

/** Conflicts per `step` call, and how long a frame may spend stepping. */
export const SLICE_CONFLICTS = 120;
export const SLICE_MS = 24;

export type DifficultyLevel = "instant" | "quick" | "slow" | "unknown" | "outOfReach";

export type Difficulty = {
  level: DifficultyLevel;
  label: string;
  note: string;
};

/**
 * How hard the decisive refutation is on this grid, measured rather than
 * guessed. The cost is concentrated almost entirely at k = k*: below it the
 * solver only has to *find* an arrangement, which is easy, and well above it
 * the formula is so over-constrained that it collapses at once.
 */
export function solverDifficulty(n: number, shape: ShapeSpec, evidence?: PatternEvidence): Difficulty {
  if (shape.id === "pattern") return patternDifficulty(n, shape, evidence);
  if (n > MAX_SOLVER_GRID) {
    return {
      level: "outOfReach",
      label: "out of reach",
      note: `The solver is offered up to the ${MAX_SOLVER_GRID}×${MAX_SOLVER_GRID} grid. You can still draw here and check arrangements by hand.`,
    };
  }
  const axis = shape.id === "square" && shape.axisAligned;
  const tiltedSquare = shape.id === "square" && !shape.axisAligned;

  if (tiltedSquare) {
    if (n <= 6) return { level: "instant", label: "under a second", note: "Measured: about half a second at N = 6." };
    if (n === 7) {
      return {
        level: "slow",
        label: "minutes",
        note: "Measured: roughly four minutes at N = 7. It runs under a conflict budget and can be cancelled.",
      };
    }
    return {
      level: "outOfReach",
      label: "out of reach",
      note: "Tilted squares on the 8×8 grid are past what an in-browser solver finishes. Deciding one particular k away from the threshold is still fine.",
    };
  }

  if (axis) {
    if (n <= 7) return { level: "instant", label: "under a second", note: "Measured: under half a second at N = 7." };
    return { level: "quick", label: "a few seconds", note: "Measured: about eight seconds at N = 8, ending at k* = 42." };
  }

  // Isosceles triangles: far more forbidden triples than squares, so the
  // instances are larger at the same N.
  if (n <= 6) return { level: "instant", label: "under a second", note: "Measured: about a fifth of a second at N = 6." };
  if (n === 7) return { level: "quick", label: "a few seconds", note: "Measured: about three seconds at N = 7." };
  return {
    level: "slow",
    label: "a minute or two",
    note: "Measured: about a minute and a half at N = 8. It runs under a conflict budget and can be cancelled.",
  };
}

/**
 * What is known about a drawn shape before any solving happens: how many copies
 * fit, and the size of a shape-free set greedy search has already *verified*.
 * Both are cheap, and between them they decide the two questions that cannot be
 * answered by a measured table — whether there is anything to force, and whether
 * the answer is out past the k this page will build a counter for.
 */
export type PatternEvidence = { copies: number; greedy: number };

/**
 * A drawn shape has no measured timing to quote, and guessing one would be
 * dressing a hunch up as a fact. What can be said for certain is said, and the
 * rest is left to the conflict budget and the cancel button.
 */
function patternDifficulty(n: number, shape: ShapeSpec, evidence?: PatternEvidence): Difficulty {
  const points = shape.pattern?.points.length ?? 0;
  if (points < 2) {
    return {
      level: "outOfReach",
      label: "nothing drawn yet",
      note: "Click at least two cells on the pad to define a shape.",
    };
  }
  if (evidence && evidence.copies === 0) {
    return {
      level: "outOfReach",
      label: "no copies fit",
      note: `Not one copy of this shape fits in the ${n}×${n} grid under this reading of "the same shape", so no number of dots can force one. Enlarge the grid, or allow more motions.`,
    };
  }
  if (n > MAX_SOLVER_GRID) {
    return {
      level: "outOfReach",
      label: "out of reach",
      note: `The solver is offered up to the ${MAX_SOLVER_GRID}×${MAX_SOLVER_GRID} grid. You can still draw here and check arrangements by hand.`,
    };
  }
  if (evidence && evidence.greedy >= maxK(n)) {
    return {
      level: "outOfReach",
      label: "threshold is past the k cap",
      note: `Greedy search has already placed ${evidence.greedy} dots here without making a copy — verified directly, no solver involved — so k* is at least ${evidence.greedy + 1}, above the ${maxK(n)} this page will build a counter for. A larger grid will not help; a shape with more copies in it will.`,
    };
  }
  // Measured across a sample of drawn shapes (L-tromino, T-tetromino, three in a
  // row, right triangle, unit square, a 1–2 scalene triangle) at N = 5…7. The
  // pattern in the numbers is the motion class, not the shape: allowing scaling
  // multiplies the copies and the cost with them, while the other three classes
  // stayed in the tens of milliseconds throughout. A tendency, not a promise —
  // hence a warning rather than a locked door.
  if ((shape.pattern?.motions ?? "similar") === "similar" && n >= 7) {
    return {
      level: "slow",
      label: "expect a wait",
      note: `Under "any size, any angle" the ${n}×${n} grid measured anywhere from a few seconds to past the budget, because allowing scaling multiplies the number of copies. The other three motion classes stayed under a tenth of a second at this size. It is cancellable throughout, and an exhausted budget is reported rather than guessed at.`,
    };
  }
  return {
    level: "unknown",
    label: "not measured",
    note: 'Unlike the two built-in families, a shape you drew has no timing measured ahead of it — the cost is the shape\u2019s own. For what it is worth, across a sample of drawn shapes the quarter-turns, sliding and same-size classes all finished in well under a second up to N = 7; allowing any size is the expensive one. It runs under the same conflict budget as everything else and can be cancelled at any point, and if the budget runs out the page says so rather than guessing.',
  };
}

/** Whether an upward scan for k* is offered: it has to pass through the hardest k there is. */
export function canScan(n: number, shape: ShapeSpec, evidence?: PatternEvidence): boolean {
  return solverDifficulty(n, shape, evidence).level !== "outOfReach";
}

/**
 * Whether a single k may be decided. Away from the threshold the formula is
 * easy, so this is the looser gate — in particular a shape whose k* is past the
 * cap can still be asked about any k below it.
 */
export function canDecide(n: number, shape?: ShapeSpec, evidence?: PatternEvidence): boolean {
  if (n > MAX_SOLVER_GRID) return false;
  if (shape?.id !== "pattern") return true;
  if ((shape.pattern?.points.length ?? 0) < 2) return false;
  if (!evidence) return true;
  return evidence.copies > 0;
}

export type PadPreset = { label: string; size: number; cells: [number, number][] };

/**
 * Shapes worth starting the pad from. Two of them are deliberate overlaps with
 * the built-in families — the unit square under "any size" reproduces the whole
 * square family, and the right triangle is a slice of the isosceles one — so the
 * drawn route can be checked against an answer the page already knows.
 */
export const PAD_PRESETS: PadPreset[] = [
  { label: "Right triangle", size: 2, cells: [[0, 0], [1, 0], [0, 1]] },
  { label: "L-tromino", size: 2, cells: [[0, 0], [1, 0], [1, 1]] },
  { label: "Three in a row", size: 3, cells: [[0, 0], [1, 0], [2, 0]] },
  { label: "Unit square", size: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { label: "T-tetromino", size: 3, cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  { label: "3–4–5 triangle", size: 5, cells: [[0, 0], [3, 0], [0, 4]] },
];

export type Preset = {
  label: string;
  note: string;
  n: number;
  shape: ShapeSpec;
  k: number;
  /** Cells to place on the board, as (i, j) pairs. */
  cells?: [number, number][];
};

/**
 * The starting points worth having. The isosceles witnesses are the L-shaped
 * family from the reference write-up: a run down one edge and a run along an
 * adjacent one, with the shared corner left out.
 */
export const PRESETS: Preset[] = [
  {
    label: "The class question, N = 5",
    note: "Nine dots on the 5×5 grid always contain an isosceles triangle, and eight need not: the L-shaped arrangement below is the largest that escapes.",
    n: 5,
    shape: { id: "isosceles", allowCollinear: false, axisAligned: false },
    k: 9,
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ],
  },
  {
    label: "The L that breaks at N = 9",
    note: "Every isosceles witness up to N = 8 has this shape, which is why k* = 2N−1 looks like a theorem. It is not: at N = 9 the run of five and a 3–4–5 hop give two squared distances of 25, and the family dies.",
    n: 8,
    shape: { id: "isosceles", allowCollinear: false, axisAligned: false },
    k: 15,
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [0, 5],
      [0, 6],
      [1, 7],
      [2, 7],
      [3, 7],
      [4, 7],
      [5, 7],
      [6, 7],
      [7, 7],
    ],
  },
  {
    label: "…and the same L at N = 9",
    note: "The 9×9 L is the first of the family that fails: (0,0), (0,5) and (4,8) are 25 and 16+9 = 25 apart. So the construction behind every data point up to N = 8 stops working exactly one step beyond the largest grid a solver can reach.",
    n: 9,
    shape: { id: "isosceles", allowCollinear: false, axisAligned: false },
    k: 17,
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [0, 5],
      [0, 6],
      [0, 7],
      [1, 8],
      [2, 8],
      [3, 8],
      [4, 8],
      [5, 8],
      [6, 8],
      [7, 8],
      [8, 8],
    ],
  },
  {
    label: "Squares, N = 4",
    note: "Only twenty squares fit in a 4×4 grid once tilted ones are counted, so ten dots can still dodge them all — but eleven cannot.",
    n: 4,
    shape: { id: "square", allowCollinear: false, axisAligned: false },
    k: 11,
    cells: [
      [0, 0],
      [0, 1],
      [0, 3],
      [1, 0],
      [1, 2],
      [1, 3],
      [2, 0],
      [2, 2],
      [3, 0],
      [3, 1],
    ],
  },
  {
    label: "Axis-aligned only, N = 6",
    note: "Forbid fewer shapes and more dots fit: ignoring tilted squares lifts the threshold on the 6×6 grid from 22 to 25.",
    n: 6,
    shape: { id: "square", allowCollinear: false, axisAligned: true },
    k: 25,
  },
  {
    label: "Degenerate triples count",
    note: "Three equally spaced collinear points have distances d, d, 2d. Calling that isosceles enlarges the forbidden family, so the threshold can only fall — on the 5×5 grid from 9 to 8.",
    n: 5,
    shape: { id: "isosceles", allowCollinear: true, axisAligned: false },
    k: 8,
  },
];
