// Smoke tests for the grid-forcing reduction.
// Run with: npx tsx scripts/smoke-grid-forcing.ts
//
// Three independent things are checked, because a bug in any one of them would
// quietly produce plausible wrong numbers:
//
//   1. the shape enumerators, against closed forms and against exhaustive
//      enumeration of every subset of the right size;
//   2. the encoding, by confirming that a model really is a shape-free
//      arrangement and that the width-3 split does not change the answer;
//   3. the thresholds themselves, against brute-force maximum avoiding sets
//      computed with no SAT solver involved, and against the published values
//      for the isosceles and square families.

import {
  ForcingRun,
  bestGreedyAvoidingSet,
  bruteForceMaxAvoiding,
  buildFormula,
  cellAt,
  cellIndex,
  cells,
  convexHull,
  convexOrder,
  describeOccurrence,
  findOccurrence,
  findOccurrences,
  forbiddenSets,
  forcedThreshold,
  formulaToDimacs,
  isoscelesTriples,
  safeAdditions,
  squares,
  varLabel,
  type Cell,
  type Occurrence,
  type ShapeSpec,
} from "../src/math/gridForcing";
import { solveCnf, verifyModel } from "../src/math/sat";
import { normalizePattern, type LatticePoint, type MotionClass } from "../src/math/patternShape";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}  ${detail}`);
  }
}

const ISO: ShapeSpec = { id: "isosceles", allowCollinear: false, axisAligned: false };
const ISO_DEGENERATE: ShapeSpec = { id: "isosceles", allowCollinear: true, axisAligned: false };
const SQUARE: ShapeSpec = { id: "square", allowCollinear: false, axisAligned: false };
const SQUARE_AXIS: ShapeSpec = { id: "square", allowCollinear: false, axisAligned: true };

const d2 = (a: Cell, b: Cell) => (a.i - b.i) ** 2 + (a.j - b.j) ** 2;
const key = (s: Occurrence) => [...s].sort((a, b) => a - b).join(",");

// ---- the cell ordering the counter assumes ----
{
  let ok = true;
  for (const n of [2, 3, 5, 8]) {
    const list = cells(n);
    if (list.length !== n * n) ok = false;
    for (let idx = 0; idx < list.length; idx++) {
      const c = cellAt(n, idx);
      if (c.i !== list[idx].i || c.j !== list[idx].j) ok = false;
      if (cellIndex(n, c.i, c.j) !== idx) ok = false;
    }
  }
  check("cell index and coordinates round-trip in the counter's order", ok);
}

// ---- isosceles enumerator: counts ----
{
  // Independently computed; the same numbers appear in the reference write-up.
  const expected: Record<number, number> = { 3: 36, 4: 148, 5: 444, 6: 1064, 7: 2200, 8: 4024, 9: 6976 };
  let ok = true;
  const got: string[] = [];
  for (const [nStr, want] of Object.entries(expected)) {
    const n = Number(nStr);
    const c = isoscelesTriples(n).length;
    got.push(`${n}:${c}`);
    if (c !== want) ok = false;
  }
  check("isosceles triple counts, N = 3…9", ok, got.join(" "));
}

// ---- isosceles enumerator: sound and complete ----
{
  let unsound = 0;
  let missing = 0;
  let duplicated = 0;
  for (const n of [3, 4, 5]) {
    const pts = cells(n);
    const got = isoscelesTriples(n);
    const gotKeys = new Set(got.map(key));
    if (gotKeys.size !== got.length) duplicated++;
    for (const t of got) {
      const [a, b, c] = t.map((p) => pts[p]);
      const u = d2(a, b);
      const v = d2(a, c);
      const w = d2(b, c);
      const collinear = (b.i - a.i) * (c.j - a.j) - (b.j - a.j) * (c.i - a.i) === 0;
      if (collinear || !(u === v || u === w || v === w)) unsound++;
    }
    // Every triple of cells, checked directly.
    for (let a = 0; a < pts.length; a++) {
      for (let b = a + 1; b < pts.length; b++) {
        for (let c = b + 1; c < pts.length; c++) {
          const u = d2(pts[a], pts[b]);
          const v = d2(pts[a], pts[c]);
          const w = d2(pts[b], pts[c]);
          const collinear =
            (pts[b].i - pts[a].i) * (pts[c].j - pts[a].j) - (pts[b].j - pts[a].j) * (pts[c].i - pts[a].i) === 0;
          const want = !collinear && (u === v || u === w || v === w);
          if (want && !gotKeys.has(`${a},${b},${c}`)) missing++;
        }
      }
    }
  }
  check("every enumerated triple really is a non-degenerate isosceles triangle", unsound === 0, `${unsound} bad`);
  check("no isosceles triangle of the grid is missed", missing === 0, `${missing} missing`);
  check("no isosceles triangle is enumerated twice", duplicated === 0);
}

// ---- collinear triples are exactly what the convention excludes ----
{
  let ok = true;
  for (const n of [3, 4, 5]) {
    const strict = new Set(isoscelesTriples(n).map(key));
    const loose = isoscelesTriples(n, true);
    const looseKeys = new Set(loose.map(key));
    if (strict.size >= looseKeys.size) ok = false;
    for (const k of strict) if (!looseKeys.has(k)) ok = false;
    const pts = cells(n);
    // The extra ones are exactly the collinear, equally spaced triples.
    for (const t of loose) {
      if (strict.has(key(t))) continue;
      const [a, b, c] = t.map((p) => pts[p]);
      if ((b.i - a.i) * (c.j - a.j) - (b.j - a.j) * (c.i - a.i) !== 0) ok = false;
    }
  }
  check("allowing collinear triples strictly enlarges the family, by degenerate triples only", ok);
}

// ---- square enumerator: counts against the closed forms ----
{
  let ok = true;
  const got: string[] = [];
  for (let n = 2; n <= 9; n++) {
    let all = 0;
    let axis = 0;
    for (let s = 1; s <= n - 1; s++) {
      all += s * (n - s) ** 2;
      axis += (n - s) ** 2;
    }
    const gAll = squares(n).length;
    const gAxis = squares(n, true).length;
    got.push(`${n}:${gAll}/${gAxis}`);
    if (gAll !== all || gAxis !== axis) ok = false;
  }
  check("square counts match Σ s(N−s)² and Σ (N−s)²", ok, got.join(" "));
}

// ---- square enumerator: sound, complete, duplicate-free ----
{
  let unsound = 0;
  let missing = 0;
  let duplicated = 0;
  for (const n of [3, 4, 5]) {
    const pts = cells(n);
    const got = squares(n);
    const gotKeys = new Set(got.map(key));
    if (gotKeys.size !== got.length) duplicated++;
    for (const q of got) {
      const vs = convexOrder(q.map((p) => pts[p]));
      const sides = vs.map((v, idx) => d2(v, vs[(idx + 1) % 4]));
      const diags = [d2(vs[0], vs[2]), d2(vs[1], vs[3])];
      const equalSides = sides.every((s) => s === sides[0]) && sides[0] > 0;
      const equalDiags = diags[0] === diags[1] && diags[0] === 2 * sides[0];
      if (!equalSides || !equalDiags) unsound++;
    }
    // Brute force over every 4-subset, using the same "4 equal sides + equal
    // diagonals twice the side" test but with no clever enumeration behind it.
    for (let a = 0; a < pts.length; a++) {
      for (let b = a + 1; b < pts.length; b++) {
        for (let c = b + 1; c < pts.length; c++) {
          for (let e = c + 1; e < pts.length; e++) {
            const vs = convexOrder([pts[a], pts[b], pts[c], pts[e]]);
            const sides = vs.map((v, idx) => d2(v, vs[(idx + 1) % 4]));
            const diags = [d2(vs[0], vs[2]), d2(vs[1], vs[3])];
            const isSquare =
              sides[0] > 0 && sides.every((s) => s === sides[0]) && diags[0] === diags[1] && diags[0] === 2 * sides[0];
            if (isSquare && !gotKeys.has(`${a},${b},${c},${e}`)) missing++;
          }
        }
      }
    }
  }
  check("every enumerated quadruple really is a square", unsound === 0, `${unsound} bad`);
  check("no square of the grid is missed", missing === 0, `${missing} missing`);
  check("no square is enumerated twice", duplicated === 0);
  check(
    "axis-aligned squares are a subset of all squares",
    [3, 4, 5, 6].every((n) => {
      const all = new Set(squares(n).map(key));
      return squares(n, true).every((q) => all.has(key(q)));
    }),
  );
}

// ---- reading a drawing ----
{
  const n = 4;
  const fb = forbiddenSets(n, ISO);
  const empty = new Set<number>();
  check("the empty arrangement is shape-free", findOccurrence(empty, fb) === null);
  const whole = new Set(Array.from({ length: n * n }, (_, i) => i));
  check("the full grid contains a copy", findOccurrence(whole, fb) !== null);
  // A right isosceles triangle placed by hand.
  const hand = new Set([cellIndex(n, 0, 0), cellIndex(n, 0, 2), cellIndex(n, 2, 0)]);
  const occ = findOccurrence(hand, fb);
  check("a hand-placed isosceles triangle is detected", occ !== null && occ.length === 3);
  const detail = describeOccurrence(n, ISO, occ as Occurrence);
  check(
    "the readout names two equal sides",
    detail.edges.filter((e) => e.witnessing).length >= 2 && detail.reason.includes("4"),
    detail.reason,
  );
  // Two points can never make a triangle.
  check("fewer than three cells cannot contain a copy", findOccurrence(new Set([0, 5]), fb) === null);
  check(
    "findOccurrences agrees with findOccurrence on emptiness",
    [0, 1, 2, 3, 4, 5, 6].every((cut) => {
      const s = new Set(Array.from({ length: cut }, (_, i) => i * 3));
      return (findOccurrences(s, fb).length === 0) === (findOccurrence(s, fb) === null);
    }),
  );
}

// ---- safe additions: exactly the cells that keep an arrangement shape-free ----
{
  const n = 4;
  const fb = forbiddenSets(n, ISO);
  const arrangement = new Set([0, 1, 6]);
  const safe = new Set(safeAdditions(n, arrangement, fb));
  let ok = true;
  for (let p = 0; p < n * n; p++) {
    if (arrangement.has(p)) continue;
    const grown = new Set(arrangement);
    grown.add(p);
    if ((findOccurrence(grown, fb) === null) !== safe.has(p)) ok = false;
  }
  check("safeAdditions lists exactly the cells that stay shape-free", ok);
  check("an arrangement that already contains a copy admits no safe addition", safeAdditions(n, new Set([0, 2, 8]), fb).length === 0);
}

// ---- greedy sets are certificates, not guesses ----
{
  let ok = true;
  for (const shape of [ISO, SQUARE, SQUARE_AXIS]) {
    for (const n of [3, 4, 5, 6]) {
      const fb = forbiddenSets(n, shape);
      const g = bestGreedyAvoidingSet(n, fb, 30);
      if (findOccurrence(new Set(g), fb) !== null) ok = false;
      if (new Set(g).size !== g.length) ok = false;
    }
  }
  check("every greedy arrangement is verified shape-free", ok);
}

// ---- the encoding: models are arrangements, and the polarity is right ----
{
  const n = 4;
  const k = 6;
  const fb = forbiddenSets(n, ISO);
  const f = buildFormula(n, k, ISO, fb, false);
  const r = solveCnf(f.numVars, f.clauses);
  check("F(4,6) for isosceles triangles is satisfiable", r.status === "sat");
  const model = r.model as boolean[];
  const chosen = new Set<number>();
  for (let p = 0; p < n * n; p++) if (model[p + 1]) chosen.add(p);
  check("the model really satisfies every clause", verifyModel(f.clauses, model));
  check("the model chooses at least k cells", chosen.size >= k, `${chosen.size}`);
  check("the model's arrangement is shape-free", findOccurrence(chosen, fb) === null);

  // The mirror of the classic failure: the geometry clauses alone are satisfied
  // by choosing nothing. Only the counter rules that out.
  const geometryOnly = f.clauses.slice(f.sections[0].start, f.sections[0].end);
  const allFalse = new Array<boolean>(f.numVars + 1).fill(false);
  check("geometry clauses alone are satisfied by the empty arrangement", verifyModel(geometryOnly, allFalse));
  const allTrue = new Array<boolean>(f.numVars + 1).fill(true);
  check("the all-ones assignment violates the geometry clauses", !verifyModel(geometryOnly, allTrue));

  const forced = buildFormula(n, 7, ISO, fb, false);
  check("F(4,7) is unsatisfiable — 7 cells force the triangle", solveCnf(forced.numVars, forced.clauses).status === "unsat");
}

// ---- the counter counts ----
{
  // At M = 4 cells with no geometry at all, the formula should be satisfiable
  // exactly when k cells can be chosen, i.e. for every k ≤ 4.
  let ok = true;
  for (let k = 1; k <= 4; k++) {
    const f = buildFormula(2, k, ISO, [], false);
    const r = solveCnf(f.numVars, f.clauses);
    if (r.status !== "sat") ok = false;
    let chosen = 0;
    for (let p = 0; p < 4; p++) if ((r.model as boolean[])[p + 1]) chosen++;
    if (chosen < k) ok = false;
  }
  check("the sequential counter enforces at-least-k on a 2x2 grid", ok);

  // And every assignment it accepts really has k cells: enumerate all 2^4.
  let violations = 0;
  for (let k = 1; k <= 4; k++) {
    const f = buildFormula(2, k, ISO, [], false);
    for (let mask = 0; mask < 16; mask++) {
      const popcount = ((mask >> 0) & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);
      if (popcount >= k) continue;
      // Fix the cells to this sub-k assignment and ask whether the auxiliary
      // variables can still be made to work. They must not be able to.
      const forced = f.clauses.map((c) => [...c]);
      for (let p = 0; p < 4; p++) forced.push([((mask >> p) & 1) === 1 ? p + 1 : -(p + 1)]);
      if (solveCnf(f.numVars, forced).status !== "unsat") violations++;
    }
  }
  check("no assignment with fewer than k cells can satisfy the counter", violations === 0, `${violations} violations`);
}

// ---- the width-3 split ----
{
  const n = 5;
  const k = 12;
  const fb = forbiddenSets(n, SQUARE);
  const wide = buildFormula(n, k, SQUARE, fb, false);
  const narrow = buildFormula(n, k, SQUARE, fb, true);
  check("square clauses are natively width 4", wide.maxWidth === 4, `${wide.maxWidth}`);
  check("the split really produces a 3-CNF", narrow.maxWidth === 3, `${narrow.maxWidth}`);
  check("the split adds one fresh variable per square", narrow.numVars === wide.numVars + fb.length);
  const a = solveCnf(wide.numVars, wide.clauses).status;
  const b = solveCnf(narrow.numVars, narrow.clauses).status;
  check("splitting preserves satisfiability", a === b, `${a} vs ${b}`);
  check("isosceles clauses need no splitting", buildFormula(n, k, ISO, forbiddenSets(n, ISO), true).maxWidth === 3);
}

// ---- variable naming and DIMACS export ----
{
  const f = buildFormula(3, 4, ISO, forbiddenSets(3, ISO), false);
  check("primary variables are named for their cell", varLabel(f, 1) === "x(0,0)" && varLabel(f, 3) === "x(0,2)");
  check("counter variables are named s(i,j)", varLabel(f, f.numCells + 1).startsWith("s("));
  const text = formulaToDimacs(f);
  const lines = text.trim().split("\n");
  const header = lines.find((l) => l.startsWith("p cnf")) as string;
  check("DIMACS header matches the formula", header === `p cnf ${f.numVars} ${f.clauses.length}`, header);
  check(
    "every DIMACS clause is terminated and in range",
    lines
      .filter((l) => !l.startsWith("p") && !l.startsWith("c"))
      .every((l) => {
        const parts = l.split(" ").map(Number);
        return parts[parts.length - 1] === 0 && parts.slice(0, -1).every((v) => v !== 0 && Math.abs(v) <= f.numVars);
      }),
  );
  check("the sections partition the clause list", f.sections[0].start === 0 && f.sections[f.sections.length - 1].end === f.clauses.length);
  check(
    "sections are contiguous",
    f.sections.every((s, idx) => idx === 0 || s.start === f.sections[idx - 1].end),
  );
}

// ---- thresholds against brute force, with no solver in the loop ----
{
  let ok = true;
  const detail: string[] = [];
  for (const [label, shape, ns] of [
    ["isosceles", ISO, [3, 4, 5]],
    ["square", SQUARE, [3, 4, 5]],
    ["axis-aligned square", SQUARE_AXIS, [3, 4, 5]],
  ] as const) {
    for (const n of ns) {
      const fb = forbiddenSets(n, shape);
      const alpha = bruteForceMaxAvoiding(n, fb);
      const got = forcedThreshold(n, shape).answer;
      const want = alpha + 1 <= n * n ? alpha + 1 : null;
      if (got !== want) {
        ok = false;
        detail.push(`${label} N=${n}: solver ${got}, brute force ${want}`);
      }
    }
  }
  check("SAT thresholds equal brute-force α(N) + 1", ok, detail.join("; "));
}

// ---- thresholds against the published values ----
{
  const cases: Array<[string, ShapeSpec, number, number]> = [
    ["isosceles", ISO, 3, 5],
    ["isosceles", ISO, 4, 7],
    ["isosceles", ISO, 5, 9],
    ["isosceles", ISO, 6, 11],
    ["square", SQUARE, 4, 11],
    ["square", SQUARE, 5, 16],
    ["square", SQUARE, 6, 22],
    ["axis-aligned square", SQUARE_AXIS, 4, 13],
    ["axis-aligned square", SQUARE_AXIS, 5, 18],
    ["axis-aligned square", SQUARE_AXIS, 6, 25],
  ];
  let ok = true;
  const detail: string[] = [];
  for (const [label, shape, n, want] of cases) {
    const r = forcedThreshold(n, shape);
    if (r.answer !== want) {
      ok = false;
      detail.push(`${label} N=${n}: got ${r.answer}, expected ${want}`);
    }
    // The witness one step below the threshold must be a genuine avoiding set
    // of exactly the claimed size.
    const fb = forbiddenSets(n, shape);
    if (!r.witness || r.witness.length < want - 1 || findOccurrence(new Set(r.witness), fb) !== null) {
      ok = false;
      detail.push(`${label} N=${n}: bad witness`);
    }
  }
  check("published thresholds reproduce, with valid witnesses", ok, detail.join("; "));
}

// ---- monotonicity: the predicate flips exactly once ----
{
  let ok = true;
  const detail: string[] = [];
  for (const [shape, n, star] of [
    [ISO, 5, 9],
    [SQUARE, 5, 16],
    [SQUARE_AXIS, 4, 13],
  ] as const) {
    const fb = forbiddenSets(n, shape);
    for (let k = 3; k <= n * n; k++) {
      const f = buildFormula(n, k, shape, fb, false);
      const sat = solveCnf(f.numVars, f.clauses).status === "sat";
      if (sat !== k < star) {
        ok = false;
        detail.push(`N=${n} k=${k}`);
      }
    }
  }
  check("F(N,k) is satisfiable exactly below the threshold", ok, detail.join(" "));
}

// ---- allowing degenerate triples can only lower the threshold ----
{
  let ok = true;
  for (const n of [3, 4, 5]) {
    const strict = forcedThreshold(n, ISO).answer as number;
    const loose = forcedThreshold(n, ISO_DEGENERATE).answer as number;
    if (loose > strict) ok = false;
  }
  check("counting collinear triples never raises the threshold", ok);
  check(
    "forbidding fewer shapes never lowers it: axis-aligned squares ≥ all squares",
    [4, 5, 6].every((n) => (forcedThreshold(n, SQUARE_AXIS).answer as number) >= (forcedThreshold(n, SQUARE).answer as number)),
  );
}

// ---- the resumable run matches the blocking one, and honours its budget ----
{
  const n = 5;
  const fb = forbiddenSets(n, ISO);
  const run = new ForcingRun({ n, shape: ISO, width3: false, mode: "threshold", k: 3, kMax: n * n, budgetPerK: 1e9 }, fb);
  let slices = 0;
  while (!run.done && slices < 200000) {
    run.step(3);
    slices++;
  }
  check("a run sliced 3 conflicts at a time finds the same threshold", run.answer === 9, `${run.answer}`);
  check("slicing really did interrupt the run", slices > 20, `${slices} slices`);
  check("the run recorded one outcome per k tried", run.outcomes.length === 7, `${run.outcomes.length}`);
  check("every outcome below the threshold is avoidable", run.outcomes.slice(0, -1).every((o) => o.verdict === "avoidable"));

  const starved = new ForcingRun({ n: 6, shape: ISO, width3: false, mode: "single", k: 11, kMax: 36, budgetPerK: 5 }, forbiddenSets(6, ISO));
  while (!starved.done) starved.step(5);
  check("a starved run reports undecided rather than a wrong answer", starved.gaveUp && starved.outcomes[0].verdict === "undecided");

  const single = new ForcingRun({ n, shape: ISO, width3: false, mode: "single", k: 12, kMax: n * n, budgetPerK: 1e9 }, fb);
  while (!single.done) single.step(500);
  check("single mode decides exactly the k it was given", single.outcomes.length === 1 && single.outcomes[0].k === 12 && single.outcomes[0].verdict === "forced");
}

// ---- drawing order ----
{
  const n = 5;
  // A tilted square: one the axis-aligned enumeration does not produce. Its
  // vertices in index order are *not* in cyclic order, which is the point.
  const axis = new Set(squares(n, true).map(key));
  const q = squares(n).find((s) => !axis.has(key(s))) as Occurrence;
  const vs = convexOrder(q.map((p) => cellAt(n, p)));
  const sides = vs.map((v, idx) => d2(v, vs[(idx + 1) % 4]));
  check("convexOrder puts square vertices in cyclic order", sides.every((s) => s === sides[0]));
  const detail = describeOccurrence(n, SQUARE, q);
  check("a square's readout marks all four sides", detail.edges.length === 4 && detail.edges.every((e) => e.witnessing));
}

// ---- convex hull ----
//
// It is what the board shades over a drawn copy, and a wrong hull is the kind of
// bug that only ever shows as a picture looking odd. Checked against the
// definition rather than against a second implementation: every input point
// inside or on it, every vertex an input point, every turn to the left.
{
  // Local, so the check does not lean on the same helper the code under test uses.
  const cross = (a: Cell, b: Cell, c: Cell) => (b.i - a.i) * (c.j - a.j) - (b.j - a.j) * (c.i - a.i);
  let rng = 12345;
  const rnd = (m: number) => {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    return rng % m;
  };
  const kk = (p: Cell) => `${p.i},${p.j}`;
  let convexBad = 0;
  let degenerateBad = 0;
  let convexSeen = 0;
  let degenerateSeen = 0;

  for (let trial = 0; trial < 3000; trial++) {
    const seen = new Set<string>();
    const pts: Cell[] = [];
    for (let t = 0; t < 3 + rnd(6); t++) {
      const p = { i: rnd(7), j: rnd(7) };
      if (!seen.has(kk(p))) {
        seen.add(kk(p));
        pts.push(p);
      }
    }
    if (pts.length < 3) continue;
    const h = convexHull(pts);
    const inputs = new Set(pts.map(kk));
    if (!h.every((p) => inputs.has(kk(p))) || new Set(h.map(kk)).size !== h.length) {
      convexBad++;
      continue;
    }
    // Collinear input has no hull, and the contract is to hand it back as it is.
    const flat = pts.every((p) => cross(pts[0], pts[1], p) === 0);
    if (flat) {
      degenerateSeen++;
      if (h.length !== pts.length) degenerateBad++;
      continue;
    }
    convexSeen++;
    for (let a = 0; a < h.length; a++) {
      if (cross(h[a], h[(a + 1) % h.length], h[(a + 2) % h.length]) <= 0) convexBad++;
    }
    for (const p of pts) {
      for (let a = 0; a < h.length; a++) {
        if (cross(h[a], h[(a + 1) % h.length], p) < 0) convexBad++;
      }
    }
  }
  check(`convexHull is convex, counter-clockwise and contains its input (${convexSeen} sets)`, convexBad === 0);
  check(`convexHull returns collinear input unchanged (${degenerateSeen} sets)`, degenerateBad === 0);
  check("convexHull of two points is those two points", convexHull([{ i: 0, j: 0 }, { i: 2, j: 1 }]).length === 2);
  check(
    "convexHull drops a point strictly inside",
    convexHull([
      { i: 0, j: 0 },
      { i: 4, j: 0 },
      { i: 0, j: 4 },
      { i: 1, j: 1 },
    ]).length === 3,
  );
}

// ---- hand-drawn patterns, end to end ----
//
// patternShape has its own smoke script for the geometry. What is checked here
// is the part that script cannot see: that a drawn family goes through the same
// reduction as the built-in ones and comes out with the same answers.
{
  const P = (...ps: [number, number][]): LatticePoint[] => ps.map(([i, j]) => ({ i, j }));
  const drawn = (pts: LatticePoint[], motions: MotionClass): ShapeSpec => ({
    id: "pattern",
    allowCollinear: false,
    axisAligned: false,
    pattern: { points: normalizePattern(pts), motions },
  });

  // The headline cross-check: the built-in square family *is* the similar copies
  // of the unit square, so both routes must agree on the threshold — one through
  // squares(), one through the Gaussian-integer enumeration.
  const unitSquare = drawn(P([0, 0], [1, 0], [0, 1], [1, 1]), "similar");
  for (const n of [3, 4, 5]) {
    const viaPattern = forcedThreshold(n, unitSquare).answer;
    const viaBuiltIn = forcedThreshold(n, SQUARE).answer;
    check(
      `drawn unit square and the built-in square family agree at N=${n} (k*=${viaBuiltIn})`,
      viaPattern === viaBuiltIn,
      `pattern ${viaPattern}, built-in ${viaBuiltIn}`,
    );
  }

  // Against exhaustive search, with no solver in the loop on the other side.
  for (const [pts, motions, n] of [
    [P([0, 0], [1, 0], [1, 1]), "aligned", 4],
    [P([0, 0], [1, 0], [1, 1]), "similar", 4],
    [P([0, 0], [1, 0], [0, 1]), "congruent", 4],
    [P([0, 0], [1, 0], [2, 0]), "aligned", 5],
  ] as [LatticePoint[], MotionClass, number][]) {
    const shape = drawn(pts, motions);
    const fb = forbiddenSets(n, shape);
    const alpha = bruteForceMaxAvoiding(n, fb);
    const got = forcedThreshold(n, shape).answer;
    check(
      `drawn ${pts.length}-point/${motions} at N=${n}: k*=${got} matches brute force α=${alpha}`,
      got === alpha + 1,
      `solver ${got}, brute force ${alpha + 1}`,
    );
  }

  // A shape nothing can be forced into: no copy fits, so every arrangement dodges
  // it and the family is empty. The page has to recognise this rather than solve.
  {
    const tooBig = drawn(P([0, 0], [4, 0], [0, 4]), "congruent");
    check("a pattern too large for the grid yields an empty family", forbiddenSets(3, tooBig).length === 0);
  }

  // Width and splitting generalise: a 3-point shape is already 3-CNF, a wider one
  // is chained into arity−2 clauses through arity−3 fresh variables.
  {
    const n = 4;
    const tri = drawn(P([0, 0], [1, 0], [1, 1]), "aligned");
    const triF = buildFormula(n, 5, tri, forbiddenSets(n, tri), true);
    check("a drawn 3-point shape needs no splitting", triF.maxWidth === 3);

    const tet = drawn(P([0, 0], [1, 0], [2, 0], [1, 1]), "aligned");
    const fbTet = forbiddenSets(n, tet);
    const raw = buildFormula(n, 5, tet, fbTet, false);
    const split = buildFormula(n, 5, tet, fbTet, true);
    check("a drawn 4-point shape is width 4 unsplit", raw.maxWidth === 4);
    check("splitting it reaches width 3", split.maxWidth === 3);
    check(
      "splitting adds arity−3 variables per copy",
      split.numVars - raw.numVars === fbTet.length * (4 - 3),
      `${split.numVars - raw.numVars} vs ${fbTet.length}`,
    );
    check(
      "the split formula agrees with the unsplit one on satisfiability",
      solveCnf(raw.numVars, raw.clauses).status === solveCnf(split.numVars, split.clauses).status,
    );
  }

  // Occurrences come back in the pattern's own order, which is what lets a copy
  // be explained; the readout must survive a non-convex shape without throwing.
  {
    const n = 5;
    const bent = drawn(P([0, 0], [1, 0], [2, 0], [2, 1], [0, 1]), "aligned");
    const fb = forbiddenSets(n, bent);
    check("a 5-point drawn shape has copies at N=5", fb.length > 0);
    const detail = describeOccurrence(n, bent, fb[0]);
    check("its readout lists one vertex per pattern point", detail.vertices.length === 5);
    check("its hull is a genuine polygon", detail.hull.length >= 3 && detail.hull.length <= 5);
    check("its readout names the transform", detail.reason.includes("copy of your pattern"));
  }

  // Two points are a legitimate shape, and every pair of cells is a similar copy
  // of one — so the very first pair of dots placed is already a copy.
  {
    const n = 4;
    const pair = drawn(P([0, 0], [1, 0]), "similar");
    const fb = forbiddenSets(n, pair);
    check("a 2-point shape has every pair as a copy", fb.length === (16 * 15) / 2);
    check("findOccurrence does not assume three cells", findOccurrence(new Set([0, 1]), fb) !== null);
    check("k* for a 2-point similar shape is 2", forcedThreshold(n, pair, { kMin: 1 }).answer === 2);
  }
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
