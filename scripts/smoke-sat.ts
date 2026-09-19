// Smoke tests for the CDCL SAT solver.
// Run with: npx tsx scripts/smoke-sat.ts
//
// The solver is the one part of this repo whose answers cannot be eyeballed: a
// model can be checked by substitution, but "unsatisfiable" is a claim about
// every assignment at once. So it is checked three ways — against exhaustive
// enumeration on small random instances, against a family whose answer is known
// a priori (pigeonhole), and by verifying every model it hands back.

import { SatSolver, luby, solveCnf, toDimacs, toDimacsText, toLit, verifyModel } from "../src/math/sat";

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

/** Deterministic generator, so a failure is reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Exhaustive satisfiability by enumerating all 2^n assignments. */
function bruteForce(nVars: number, clauses: number[][]): boolean {
  for (let mask = 0; mask < 1 << nVars; mask++) {
    const model = [false];
    for (let v = 1; v <= nVars; v++) model.push(((mask >> (v - 1)) & 1) === 1);
    if (verifyModel(clauses, model)) return true;
  }
  return false;
}

// ---- literal encoding round-trips ----
{
  let ok = true;
  for (let v = 1; v <= 50; v++) {
    if (toDimacs(toLit(v)) !== v) ok = false;
    if (toDimacs(toLit(-v)) !== -v) ok = false;
    if ((toLit(v) ^ 1) !== toLit(-v)) ok = false;
  }
  check("literal encoding round-trips and negation is xor 1", ok);
}

// ---- the Luby sequence ----
{
  const got = Array.from({ length: 15 }, (_, i) => luby(2, i));
  const want = [1, 1, 2, 1, 1, 2, 4, 1, 1, 2, 1, 1, 2, 4, 8];
  check("Luby restart sequence", got.join(",") === want.join(","), got.join(","));
}

// ---- degenerate inputs ----
{
  check("empty clause is unsatisfiable", solveCnf(3, [[]]).status === "unsat");
  check("no clauses at all is satisfiable", solveCnf(3, []).status === "sat");
  check("contradictory units are unsatisfiable", solveCnf(1, [[1], [-1]]).status === "unsat");
  check("a tautology is dropped, not treated as a constraint", solveCnf(1, [[1, -1]]).status === "sat");
  const dup = solveCnf(2, [[1, 1, 2], [-1, -1]]);
  check("repeated literals collapse", dup.status === "sat" && dup.model?.[1] === false);
}

// ---- random 3-CNF against exhaustive enumeration ----
{
  const rng = lcg(20240917);
  let mismatches = 0;
  let badModels = 0;
  let satCount = 0;
  let unsatCount = 0;
  for (let trial = 0; trial < 1500; trial++) {
    const n = 4 + Math.floor(rng() * 8);
    const m = Math.floor(n * (3 + rng() * 3));
    const clauses: number[][] = [];
    for (let c = 0; c < m; c++) {
      const lits = new Set<number>();
      while (lits.size < 3) {
        const v = 1 + Math.floor(rng() * n);
        lits.add(rng() < 0.5 ? v : -v);
      }
      clauses.push([...lits]);
    }
    const got = solveCnf(n, clauses);
    const want = bruteForce(n, clauses);
    if ((got.status === "sat") !== want) mismatches++;
    if (got.status === "sat") {
      satCount++;
      if (!verifyModel(clauses, got.model as boolean[])) badModels++;
    } else {
      unsatCount++;
    }
  }
  check("1500 random 3-CNFs agree with exhaustive enumeration", mismatches === 0, `${mismatches} mismatches`);
  check("every reported model really satisfies its formula", badModels === 0, `${badModels} bad models`);
  check("the random sample covers both answers", satCount > 100 && unsatCount > 50, `${satCount} sat / ${unsatCount} unsat`);
}

// ---- random CNF with mixed clause widths ----
{
  const rng = lcg(777);
  let mismatches = 0;
  for (let trial = 0; trial < 600; trial++) {
    const n = 3 + Math.floor(rng() * 7);
    const m = Math.floor(n * (2 + rng() * 4));
    const clauses: number[][] = [];
    for (let c = 0; c < m; c++) {
      const width = 1 + Math.floor(rng() * 4);
      const lits = new Set<number>();
      let guard = 0;
      while (lits.size < width && guard++ < 40) {
        const v = 1 + Math.floor(rng() * n);
        if (lits.has(-v) || lits.has(v)) continue;
        lits.add(rng() < 0.5 ? v : -v);
      }
      clauses.push([...lits]);
    }
    if ((solveCnf(n, clauses).status === "sat") !== bruteForce(n, clauses)) mismatches++;
  }
  check("600 random mixed-width CNFs agree with enumeration", mismatches === 0, `${mismatches} mismatches`);
}

// ---- pigeonhole: n+1 pigeons into n holes has no solution ----
{
  let ok = true;
  let detail = "";
  for (const holes of [3, 4, 5, 6, 7]) {
    const pigeons = holes + 1;
    const v = (p: number, h: number) => p * holes + h + 1;
    const clauses: number[][] = [];
    for (let p = 0; p < pigeons; p++) clauses.push(Array.from({ length: holes }, (_, h) => v(p, h)));
    for (let h = 0; h < holes; h++) {
      for (let p1 = 0; p1 < pigeons; p1++) {
        for (let p2 = p1 + 1; p2 < pigeons; p2++) clauses.push([-v(p1, h), -v(p2, h)]);
      }
    }
    if (solveCnf(pigeons * holes, clauses).status !== "unsat") {
      ok = false;
      detail = `PHP(${pigeons},${holes}) was not refuted`;
    }
    // One fewer pigeon and the same formula is satisfiable — a control that the
    // refutations above are not coming from a bug that refutes everything.
    const fewer: number[][] = clauses.filter((c) => c.every((l) => Math.abs(l) <= holes * holes));
    if (solveCnf(holes * holes, fewer).status !== "sat") {
      ok = false;
      detail = `PHP(${holes},${holes}) was not solved`;
    }
  }
  check("pigeonhole formulas are refuted, and their satisfiable siblings are not", ok, detail);
}

// ---- resuming an interrupted search gives the same answer ----
{
  const holes = 6;
  const pigeons = holes + 1;
  const v = (p: number, h: number) => p * holes + h + 1;
  const clauses: number[][] = [];
  for (let p = 0; p < pigeons; p++) clauses.push(Array.from({ length: holes }, (_, h) => v(p, h)));
  for (let h = 0; h < holes; h++) {
    for (let p1 = 0; p1 < pigeons; p1++) {
      for (let p2 = p1 + 1; p2 < pigeons; p2++) clauses.push([-v(p1, h), -v(p2, h)]);
    }
  }
  const s = new SatSolver(pigeons * holes);
  for (const c of clauses) s.addClause(c);
  let status = s.solve({ maxConflicts: 7 });
  let slices = 1;
  while (status === "unknown" && slices < 100000) {
    status = s.solve({ maxConflicts: 7 });
    slices++;
  }
  check("a search sliced into 7-conflict budgets still refutes", status === "unsat", `${status} after ${slices} slices`);
  check("slicing really did interrupt the search", slices > 5, `${slices} slices`);
}

// ---- a tight budget reports "unknown" rather than guessing ----
{
  const holes = 8;
  const pigeons = holes + 1;
  const v = (p: number, h: number) => p * holes + h + 1;
  const clauses: number[][] = [];
  for (let p = 0; p < pigeons; p++) clauses.push(Array.from({ length: holes }, (_, h) => v(p, h)));
  for (let h = 0; h < holes; h++) {
    for (let p1 = 0; p1 < pigeons; p1++) {
      for (let p2 = p1 + 1; p2 < pigeons; p2++) clauses.push([-v(p1, h), -v(p2, h)]);
    }
  }
  check("an exhausted budget is reported, not guessed", solveCnf(pigeons * holes, clauses, { maxConflicts: 20 }).status === "unknown");
}

// ---- DIMACS export ----
{
  const text = toDimacsText(3, [[1, -2, 3], [-1, 2]]);
  check("DIMACS header and terminators", text === "p cnf 3 2\n1 -2 3 0\n-1 2 0\n", JSON.stringify(text));
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
