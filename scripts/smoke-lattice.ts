// Smoke tests for the lattice math.
// Run with: npx tsx scripts/smoke-lattice.ts

import {
  parseComponent,
  analyzeLattice,
  integerRowBasis,
  rankOf,
  type RVec,
} from "../src/math/lattice";
import { format as fmtRat } from "../src/math/rational";

function vec(...parts: string[]): RVec {
  return parts.map(parseComponent);
}

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

// ---- parsing ----
check("parse integer", fmtRat(parseComponent("3")) === "3");
check("parse negative", fmtRat(parseComponent("-5")) === "-5");
check("parse fraction", fmtRat(parseComponent("1/2")) === "1/2");
check("parse decimal", fmtRat(parseComponent("0.5")) === "1/2");
check("parse decimal 1.25", fmtRat(parseComponent("1.25")) === "5/4");
check("parse neg decimal", fmtRat(parseComponent("-1.5")) === "-3/2");

// ---- rank ----
check("rank of standard basis", rankOf([vec("1", "0"), vec("0", "1")]) === 2);
check("rank of collinear", rankOf([vec("1", "0"), vec("2", "0")]) === 1);
check("rank of 3 in 2D", rankOf([vec("1", "0"), vec("0", "1"), vec("1", "1")]) === 2);

// ---- integer HNF basis ----
{
  const b = integerRowBasis([
    [1n, 0n],
    [1n, 1n],
  ]);
  check("HNF of shear basis → 2 rows", b.length === 2, `got ${b.length}`);
}
{
  const b = integerRowBasis([
    [2n, 0n],
    [3n, 0n],
  ]);
  check("HNF of (2,0),(3,0) → rank 1, gcd (1,0)", b.length === 1 && b[0][0] === 1n && b[0][1] === 0n, b.map((r) => r.map(String).join(",")).join(" | "));
}

// ---- analysis: standard ℤ² basis ----
{
  const a = analyzeLattice([vec("1", "0"), vec("0", "1")], 2);
  check("ℤ²: independent", a.independent);
  check("ℤ²: is a basis", a.independent);
  check("ℤ²: full rank", a.fullRank);
  check("ℤ²: covolume 1", a.covolumeExact !== null && fmtRat(a.covolumeExact) === "1");
}

// ---- analysis: sheared basis still ℤ², covolume 1 ----
{
  const a = analyzeLattice([vec("1", "0"), vec("1", "1")], 2);
  check("shear: independent", a.independent);
  check("shear: covolume 1", a.covolumeExact !== null && fmtRat(a.covolumeExact) === "1");
}

// ---- analysis: redundant generators ----
{
  const a = analyzeLattice([vec("1", "0"), vec("0", "1"), vec("1", "1")], 2);
  check("redundant: not independent", !a.independent);
  check("redundant: flagged redundant", a.redundant);
  check("redundant: rank 2", a.rank === 2);
  check("redundant: canonical basis has 2 vectors", a.canonicalBasis.length === 2);
}

// ---- analysis: rectangular, covolume 6 ----
{
  const a = analyzeLattice([vec("2", "0"), vec("0", "3")], 2);
  check("rect: covolume 6", a.covolumeExact !== null && fmtRat(a.covolumeExact) === "6", a.covolumeExact ? fmtRat(a.covolumeExact) : "null");
}

// ---- analysis: BCC primitive cell in 3D, covolume 1/2 ----
{
  const a = analyzeLattice([vec("1", "0", "0"), vec("0", "1", "0"), vec("1/2", "1/2", "1/2")], 3);
  check("BCC: independent", a.independent);
  check("BCC: covolume 1/2", a.covolumeExact !== null && fmtRat(a.covolumeExact) === "1/2", a.covolumeExact ? fmtRat(a.covolumeExact) : "null");
}

// ---- analysis: rank-1 sublattice in 2D, covolume = length ----
{
  const a = analyzeLattice([vec("1", "1")], 2);
  check("(1,1): rank 1", a.rank === 1);
  check("(1,1): not full rank", !a.fullRank);
  check("(1,1): covolume² = 2", a.covolumeSquared !== null && fmtRat(a.covolumeSquared) === "2");
  check("(1,1): covolume irrational (no exact)", a.covolumeExact === null);
}

// ---- analysis: zero vector ----
{
  const a = analyzeLattice([vec("0", "0"), vec("1", "0")], 2);
  check("zero vec: detected", a.hasZeroVector);
  check("zero vec: rank 1", a.rank === 1);
  check("zero vec: not independent", !a.independent);
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
