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

/** Fewer cells than the shape has corners cannot contain a copy of it. */
export function minK(shape: ShapeSpec): number {
  return shapeArity(shape);
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

export type DifficultyLevel = "instant" | "quick" | "slow" | "outOfReach";

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
export function solverDifficulty(n: number, shape: ShapeSpec): Difficulty {
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

/** Whether an upward scan for k* is offered: it has to pass through the hardest k there is. */
export function canScan(n: number, shape: ShapeSpec): boolean {
  return solverDifficulty(n, shape).level !== "outOfReach";
}

/** Whether a single k may be decided. Off the threshold the formula is easy, so this is the looser gate. */
export function canDecide(n: number): boolean {
  return n <= MAX_SOLVER_GRID;
}

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
