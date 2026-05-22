// Smoke tests for the SVP (Gauss reduction) and CVP (Babai rounding) math.
// Run with: npx tsx scripts/smoke-svp-cvp.ts

import { parseComponent, type RVec } from "../src/math/lattice";
import { gaussReduce, babai } from "../src/math/svp-cvp";
import { format as fmtRat, roundRat, floorRat, sign, sub } from "../src/math/rational";

function v(...parts: string[]): RVec {
  return parts.map(parseComponent);
}
function fv(vec: RVec): string {
  return `(${vec.map(fmtRat).join(",")})`;
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

// ---- rounding helpers ----
check("roundRat(1/2)=0 (to even)", roundRat(parseComponent("1/2")) === 0n);
check("roundRat(-1/2)=0 (to even)", roundRat(parseComponent("-1/2")) === 0n);
check("roundRat(3/2)=2 (to even)", roundRat(parseComponent("3/2")) === 2n);
check("roundRat(5/2)=2 (to even)", roundRat(parseComponent("5/2")) === 2n);
check("roundRat(2/5)=0", roundRat(parseComponent("2/5")) === 0n);
check("roundRat(3/5)=1", roundRat(parseComponent("3/5")) === 1n);
check("roundRat(-7/3)=-2", roundRat(parseComponent("-7/3")) === -2n);
check("roundRat(7/2)=4 (to even)", roundRat(parseComponent("7/2")) === 4n);
check("floorRat(-7/3)=-3", floorRat(parseComponent("-7/3")) === -3n);
check("floorRat(7/3)=2", floorRat(parseComponent("7/3")) === 2n);

// ---- Gauss reduction ----
{
  const r = gaussReduce(v("2", "5"), v("3", "7"));
  const swaps = r.steps.filter((s) => s.kind === "swap").length;
  const reduces = r.steps.filter((s) => s.kind === "reduce").length;
  check("gauss(2,5),(3,7): reducedB1=(0,1)", fv(r.reducedB1) === "(0,1)", fv(r.reducedB1));
  check("gauss(2,5),(3,7): ‖b1‖²=1", fmtRat(r.b1NormSq) === "1");
  check("gauss(2,5),(3,7): 2 swaps", swaps === 2, `swaps=${swaps}`);
  check("gauss(2,5),(3,7): 3 reduces", reduces === 3, `reduces=${reduces}`);
  check("gauss(2,5),(3,7): ends done", r.steps[r.steps.length - 1].kind === "done");
  check("gauss(2,5),(3,7): not degenerate", !r.degenerate);
}
{
  const r = gaussReduce(v("1", "2"), v("3", "4"));
  const swaps = r.steps.filter((s) => s.kind === "swap").length;
  const reduces = r.steps.filter((s) => s.kind === "reduce").length;
  check("gauss(1,2),(3,4): reducedB1=(1,0)", fv(r.reducedB1) === "(1,0)", fv(r.reducedB1));
  check("gauss(1,2),(3,4): ‖b1‖²=1", fmtRat(r.b1NormSq) === "1");
  check("gauss(1,2),(3,4): 1 swap", swaps === 1, `swaps=${swaps}`);
  check("gauss(1,2),(3,4): 2 reduces", reduces === 2, `reduces=${reduces}`);
}
{
  const r = gaussReduce(v("1", "0"), v("0", "1"));
  check("gauss already reduced: 0 swaps", r.steps.filter((s) => s.kind === "swap").length === 0);
  check("gauss already reduced: 0 reduces", r.steps.filter((s) => s.kind === "reduce").length === 0);
  check("gauss already reduced: first step done", r.steps[0].kind === "done");
  check("gauss already reduced: reducedB1=(1,0)", fv(r.reducedB1) === "(1,0)");
}
{
  const r = gaussReduce(v("1", "2"), v("2", "4"));
  check("gauss dependent: degenerate flag", r.degenerate);
}

// ---- Babai rounding (2-D) ----
{
  const b = babai([v("2", "0"), v("0", "2")], v("3", "3"));
  check("babai 2D optimal: x=(3/2,3/2)", fv(b.x) === "(3/2,3/2)", fv(b.x));
  check("babai 2D optimal: z=[2,2]", b.z.join(",") === "2,2", b.z.join(","));
  check("babai 2D optimal: v=(4,4)", fv(b.v) === "(4,4)");
  check("babai 2D optimal: distSq=2", fmtRat(b.distSq) === "2");
  check("babai 2D optimal: isOptimal", b.babaiIsOptimal);
}
{
  const b = babai([v("1", "0"), v("3", "1")], v("3/2", "2/5"));
  check("babai 2D suboptimal: x=(3/10,2/5)", fv(b.x) === "(3/10,2/5)", fv(b.x));
  check("babai 2D suboptimal: z=[0,0]", b.z.join(",") === "0,0", b.z.join(","));
  check("babai 2D suboptimal: distSq=241/100", fmtRat(b.distSq) === "241/100", fmtRat(b.distSq));
  check("babai 2D suboptimal: NOT optimal", b.babaiIsOptimal === false);
  check("babai 2D suboptimal: best<babai", sign(sub(b.best.distSq, b.distSq)) < 0, fmtRat(b.best.distSq));
  check("babai 2D suboptimal: best.distSq=41/100", fmtRat(b.best.distSq) === "41/100", fmtRat(b.best.distSq));
}

// ---- Babai rounding (3-D) ----
{
  const b = babai([v("1", "0", "0"), v("0", "1", "0"), v("0", "0", "1")], v("3/10", "3/5", "6/5"));
  check("babai 3D ℤ³: z=[0,1,1]", b.z.join(",") === "0,1,1", b.z.join(","));
  check("babai 3D ℤ³: v=(0,1,1)", fv(b.v) === "(0,1,1)");
  check("babai 3D ℤ³: distSq=29/100", fmtRat(b.distSq) === "29/100", fmtRat(b.distSq));
  check("babai 3D ℤ³: optimal", b.babaiIsOptimal);
}
{
  const b = babai([v("1", "0", "0"), v("0", "1", "0"), v("1/2", "1/2", "1/2")], v("0", "0", "9/10"));
  check("babai 3D skew: x=(-9/10,-9/10,9/5)", fv(b.x) === "(-9/10,-9/10,9/5)", fv(b.x));
  check("babai 3D skew: z=[-1,-1,2]", b.z.join(",") === "-1,-1,2", b.z.join(","));
  check("babai 3D skew: v=(0,0,1)", fv(b.v) === "(0,0,1)", fv(b.v));
  check("babai 3D skew: distSq=1/100", fmtRat(b.distSq) === "1/100", fmtRat(b.distSq));
}

// ---- Babai degenerate ----
{
  const b = babai([v("1", "2"), v("2", "4")], v("1", "1"));
  check("babai degenerate: detZero", b.detZero);
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
