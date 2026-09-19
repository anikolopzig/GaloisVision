// Checks the hand-drawn-pattern enumerator in src/math/patternShape.ts.
//
// Three independent angles, because the enumeration is the part most likely to
// be quietly wrong — a missed copy or a double-counted one changes the forbidden
// family, and every threshold computed from it, without ever throwing:
//
//   1. Against brute force. Walk every m-subset of the grid and every bijection
//      onto the pattern, and ask whether some allowed similarity realises it.
//      Different search strategy entirely (subsets × permutations, rather than
//      anchor pairs), so a bug in the enumeration order shows up as a mismatch.
//   2. Against `squares()` in gridForcing, which predates this module and was
//      checked separately: the similar copies of the unit square are exactly the
//      squares with lattice vertices, tilts included. That test shares no code
//      with patternShape at all.
//   3. Against closed forms and invariances that must hold on any grid — the
//      translation count, the nesting of the four motion classes, and the fact
//      that a pattern and its own rotation have the same copies.

import {
  MOTION_CLASSES,
  copyTransform,
  normalizePattern,
  patternCopies,
  patternExtent,
  type LatticePoint,
  type MotionClass,
  type PatternSpec,
} from "../src/math/patternShape";
import { squares } from "../src/math/gridForcing";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function eq(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  check(name, g === w, `got ${g}, want ${w}`);
}

const P = (...pairs: [number, number][]): LatticePoint[] => pairs.map(([i, j]) => ({ i, j }));
const spec = (points: LatticePoint[], motions: MotionClass): PatternSpec => ({
  points: normalizePattern(points),
  motions,
});

/** The copies as a canonical set of sorted cell lists, for comparison. */
function copySet(n: number, p: PatternSpec): Set<string> {
  return new Set(patternCopies(n, p).map((c) => [...c.cells].sort((a, b) => a - b).join(",")));
}

// ------------------------------------------------------------ brute force --

function gmul(ax: number, ay: number, bx: number, by: number): [number, number] {
  return [ax * bx - ay * by, ax * by + ay * bx];
}

/** Does some allowed similarity send pattern point t to cell q[t], for every t? */
function realizes(n: number, p: PatternSpec, q: readonly number[]): boolean {
  const pts = p.points;
  const m = pts.length;
  if (m === 1) return true;
  const dI = pts[1].i - pts[0].i;
  const dJ = pts[1].j - pts[0].j;
  const den = dI * dI + dJ * dJ;
  const q0i = Math.floor(q[0] / n);
  const q0j = q[0] % n;
  const eI = Math.floor(q[1] / n) - q0i;
  const eJ = (q[1] % n) - q0j;
  if (eI === 0 && eJ === 0) return false;
  if (p.motions !== "similar" && eI * eI + eJ * eJ !== den) return false;

  for (const refl of [false, true]) {
    if (refl && p.motions === "translation") continue;
    const [aI, aJ] = refl ? gmul(eI, eJ, dI, dJ) : gmul(eI, eJ, dI, -dJ);
    if (p.motions === "aligned" || p.motions === "translation") {
      if (aI % den !== 0 || aJ % den !== 0) continue;
      const uI = aI / den;
      const uJ = aJ / den;
      if (uI * uI + uJ * uJ !== 1) continue;
      if (p.motions === "translation" && !(uI === 1 && uJ === 0)) continue;
    }
    let ok = true;
    for (let t = 0; t < m && ok; t++) {
      const vI = pts[t].i - pts[0].i;
      const vJ = refl ? -(pts[t].j - pts[0].j) : pts[t].j - pts[0].j;
      const [wI, wJ] = gmul(aI, aJ, vI, vJ);
      const ti = Math.floor(q[t] / n) - q0i;
      const tj = (q[t] % n) - q0j;
      if (wI !== ti * den || wJ !== tj * den) ok = false;
    }
    if (ok) return true;
  }
  return false;
}

function permute(xs: readonly number[]): number[][] {
  if (xs.length <= 1) return [[...xs]];
  const out: number[][] = [];
  for (let i = 0; i < xs.length; i++) {
    const rest = [...xs.slice(0, i), ...xs.slice(i + 1)];
    for (const tail of permute(rest)) out.push([xs[i], ...tail]);
  }
  return out;
}

function subsets(total: number, size: number): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  (function walk(start: number): void {
    if (cur.length === size) {
      out.push([...cur]);
      return;
    }
    for (let c = start; c < total; c++) {
      cur.push(c);
      walk(c + 1);
      cur.pop();
    }
  })(0);
  return out;
}

/** Every copy, found the slow honest way. */
function bruteCopies(n: number, p: PatternSpec): Set<string> {
  const out = new Set<string>();
  for (const s of subsets(n * n, p.points.length)) {
    if (permute(s).some((q) => realizes(n, p, q))) out.add(s.join(","));
  }
  return out;
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

// ------------------------------------------------------------ 1. vs brute --

const PATTERNS: { name: string; pts: LatticePoint[] }[] = [
  { name: "domino", pts: P([0, 0], [1, 0]) },
  { name: "right isosceles triangle", pts: P([0, 0], [1, 0], [0, 1]) },
  { name: "scalene 1-2 triangle", pts: P([0, 0], [2, 0], [0, 1]) },
  { name: "bent tromino (L)", pts: P([0, 0], [1, 0], [1, 1]) },
  { name: "straight tromino", pts: P([0, 0], [1, 0], [2, 0]) },
  { name: "unit square", pts: P([0, 0], [1, 0], [0, 1], [1, 1]) },
  { name: "S-tetromino", pts: P([0, 0], [1, 0], [1, 1], [2, 1]) },
];

for (const { name, pts } of PATTERNS) {
  for (const motions of MOTION_CLASSES) {
    const n = pts.length >= 4 ? 4 : 5;
    const p = spec(pts, motions);
    const fast = copySet(n, p);
    const slow = bruteCopies(n, p);
    check(
      `brute force: ${name}, ${motions}, N=${n} (${fast.size} copies)`,
      sameSet(fast, slow),
      `enumerator ${fast.size}, brute force ${slow.size}`,
    );
  }
}

// ---------------------------------------------------- 2. vs squares() --

for (const n of [3, 4, 5, 6, 7]) {
  const unitSquare = spec(P([0, 0], [1, 0], [0, 1], [1, 1]), "similar");
  const fromPattern = copySet(n, unitSquare);
  const fromSquares = new Set(squares(n, false).map((s) => [...s].sort((a, b) => a - b).join(",")));
  check(
    `similar copies of the unit square are exactly squares(${n}) (${fromSquares.size})`,
    sameSet(fromPattern, fromSquares),
    `pattern ${fromPattern.size}, squares ${fromSquares.size}`,
  );
}

// A square cannot be resized by a congruence, so only the unit ones survive.
for (const n of [4, 6]) {
  const p = spec(P([0, 0], [1, 0], [0, 1], [1, 1]), "congruent");
  eq(`congruent unit squares at N=${n} number (N−1)²`, patternCopies(n, p).length, (n - 1) * (n - 1));
}

// ------------------------------------------- 3. closed forms and invariance --

// Translation copies are just the placements of the bounding box.
for (const { name, pts } of PATTERNS) {
  for (const n of [4, 6, 8]) {
    const p = spec(pts, "translation");
    const { w, h } = patternExtent(p.points);
    const want = Math.max(0, n - w + 1) * Math.max(0, n - h + 1);
    eq(`translations of the ${name} at N=${n}`, patternCopies(n, p).length, want);
  }
}

// Every pair of cells is a similar copy of a two-point pattern: all are similar.
for (const n of [3, 5, 7]) {
  const p = spec(P([0, 0], [1, 0]), "similar");
  eq(`similar copies of a domino at N=${n} are all pairs`, patternCopies(n, p).length, ((n * n) * (n * n - 1)) / 2);
}

// The classes are nested: translation ⊆ aligned ⊆ congruent ⊆ similar.
for (const { name, pts } of PATTERNS) {
  const n = 6;
  const sets = MOTION_CLASSES.map((mc) => copySet(n, spec(pts, mc)));
  const [similar, congruent, aligned, translation] = sets;
  const within = (small: Set<string>, big: Set<string>) => [...small].every((x) => big.has(x));
  check(
    `motion classes nest for the ${name} (${translation.size} ⊆ ${aligned.size} ⊆ ${congruent.size} ⊆ ${similar.size})`,
    within(translation, aligned) && within(aligned, congruent) && within(congruent, similar),
  );
}

// A pattern and its quarter turn have the same copies under every class but none:
// rotating the pattern is itself an allowed motion in all four cases except
// translation, where it genuinely changes the answer.
const rot90 = (pts: readonly LatticePoint[]): LatticePoint[] => pts.map((p) => ({ i: -p.j, j: p.i }));
const mirror = (pts: readonly LatticePoint[]): LatticePoint[] => pts.map((p) => ({ i: -p.i, j: p.j }));

for (const { name, pts } of PATTERNS) {
  const n = 6;
  for (const motions of ["similar", "congruent", "aligned"] as MotionClass[]) {
    check(
      `${name}: quarter-turning the pattern leaves its ${motions} copies alone`,
      sameSet(copySet(n, spec(pts, motions)), copySet(n, spec(rot90(pts), motions))),
    );
    check(
      `${name}: mirroring the pattern leaves its ${motions} copies alone`,
      sameSet(copySet(n, spec(pts, motions)), copySet(n, spec(mirror(pts), motions))),
    );
  }
}

// Scaling the pattern changes nothing under similarity, and everything otherwise.
{
  const n = 6;
  const base = P([0, 0], [1, 0], [0, 1]);
  const doubled = P([0, 0], [2, 0], [0, 2]);
  check(
    "doubling the pattern leaves its similar copies alone",
    sameSet(copySet(n, spec(base, "similar")), copySet(n, spec(doubled, "similar"))),
  );
  check(
    "doubling the pattern does change its congruent copies",
    !sameSet(copySet(n, spec(base, "congruent")), copySet(n, spec(doubled, "congruent"))),
  );
}

// No copy may repeat a cell, and every copy must have one cell per pattern point.
for (const { name, pts } of PATTERNS) {
  for (const motions of MOTION_CLASSES) {
    const p = spec(pts, motions);
    const copies = patternCopies(7, p);
    const wellFormed = copies.every(
      (c) => c.cells.length === p.points.length && new Set(c.cells).size === c.cells.length,
    );
    check(`${name}/${motions}: every copy is ${p.points.length} distinct cells`, wellFormed);
  }
}

// Nothing is emitted twice.
for (const { name, pts } of PATTERNS) {
  const copies = patternCopies(7, spec(pts, "similar"));
  const keys = new Set(copies.map((c) => [...c.cells].sort((a, b) => a - b).join(",")));
  eq(`${name}: no duplicate similar copies at N=7`, keys.size, copies.length);
}

// ------------------------------------------------------- copyTransform --

for (const { name, pts } of PATTERNS) {
  if (pts.length < 3) continue;
  const p = spec(pts, "similar");
  const copies = patternCopies(6, p);
  let agree = true;
  for (const c of copies) {
    const t = copyTransform(6, p, c.cells);
    if (!t || t.scale2.num !== c.scale2.num || t.scale2.den !== c.scale2.den || t.reflected !== c.reflected) {
      agree = false;
      break;
    }
  }
  check(`${name}: copyTransform reproduces the enumerator's scale and handedness`, agree);
}

// A pattern of its own size maps to itself with scale 1 and no reflection.
{
  const p = spec(P([0, 0], [1, 0], [0, 1]), "similar");
  // Normalised, the pattern is (0,0), (0,1), (1,0) — cells 0, 1 and 5 at N = 5.
  const identity = patternCopies(5, p).find((c) => [...c.cells].sort((a, b) => a - b).join(",") === "0,1,5");
  check(
    "the identity placement is present, with scale 1 and no reflection",
    !!identity && identity.scale2.num === 1 && identity.scale2.den === 1 && !identity.reflected,
  );
}

// ------------------------------------------------------------- edges --

eq("an empty pattern has no copies", patternCopies(5, spec([], "similar")).length, 0);
eq("a one-point pattern is every cell", patternCopies(5, spec(P([0, 0]), "similar")).length, 25);
eq("a pattern too big for the grid has no copies", patternCopies(2, spec(P([0, 0], [3, 0], [0, 3]), "congruent")).length, 0);
eq("N below 1 has no copies", patternCopies(0, spec(P([0, 0], [1, 0]), "similar")).length, 0);
check(
  "the limit is honoured",
  patternCopies(6, spec(P([0, 0], [1, 0]), "similar"), 10).length === 10,
);

// normalizePattern is idempotent and origin-anchored.
{
  const raw = P([3, 5], [4, 5], [3, 7]);
  const once = normalizePattern(raw);
  const twice = normalizePattern(once);
  eq("normalizePattern anchors at the origin", once, [{ i: 0, j: 0 }, { i: 0, j: 2 }, { i: 1, j: 0 }]);
  eq("normalizePattern is idempotent", twice, once);
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
