// Smoke tests for the Galois group computation.
// Run with: npx tsx scripts/smoke.ts

import { parsePolynomial } from "../src/math/parser";
import { computeGalois } from "../src/math/galoisGroup";
import { formatPoly, rationalRoots, discriminant } from "../src/math/polynomial";
import { format as fmtRat } from "../src/math/rational";

type Expected =
  | { kind: "ok"; group: string }
  | { kind: "unsupported" };

const cases: Array<{ poly: string; expected: Expected; note?: string }> = [
  // ---- Trivial / linear / fully splitting ----
  { poly: "x - 2",            expected: { kind: "ok", group: "Trivial" }, note: "Linear" },
  { poly: "x^2 - 1",          expected: { kind: "ok", group: "Trivial" }, note: "Splits over Q: (x-1)(x+1)" },
  { poly: "(x - 1)(x - 2)",   expected: { kind: "ok", group: "Trivial" }, note: "Pre-factored" },

  // ---- Quadratic ----
  { poly: "x^2 - 2",          expected: { kind: "ok", group: "C_2" }, note: "Q(√2)" },
  { poly: "x^2 + 1",          expected: { kind: "ok", group: "C_2" }, note: "Q(i)" },

  // ---- Cubic ----
  { poly: "x^3 - 2",          expected: { kind: "ok", group: "S_3" }, note: "Classic non-Galois cubic" },
  { poly: "x^3 - 3x + 1",     expected: { kind: "ok", group: "C_3" }, note: "disc = 81 = 9² (cyclic)" },
  { poly: "x^3 - x^2 - 2x + 1", expected: { kind: "ok", group: "C_3" }, note: "Min. poly of 2cos(2π/7)" },

  // ---- Quartic ----
  { poly: "x^4 - 2",          expected: { kind: "ok", group: "D_4" }, note: "Splitting field Q(2^(1/4), i)" },
  { poly: "x^4 - 4x^2 + 2",   expected: { kind: "ok", group: "C_4" }, note: "Min. poly of 2cos(π/8)" },
  { poly: "x^4 + 1",          expected: { kind: "ok", group: "V_4" }, note: "Cyclotomic Q(ζ_8)" },
  { poly: "x^4 - 10x^2 + 1",  expected: { kind: "ok", group: "V_4" }, note: "Q(√2, √3)" },
  { poly: "x^4 + 8x + 12",    expected: { kind: "ok", group: "A_4" }, note: "Classic A_4 quartic" },
  { poly: "x^4 - x - 1",      expected: { kind: "ok", group: "S_4" }, note: "Generic quartic" },
  { poly: "x^4 + x + 1",      expected: { kind: "ok", group: "S_4" }, note: "Another S_4" },

  // ---- Reducible quartics ----
  { poly: "x^4 - 5x^2 + 6",   expected: { kind: "ok", group: "V_4" }, note: "(x²-2)(x²-3), independent extensions" },
  { poly: "x^4 + 4",          expected: { kind: "ok", group: "C_2" }, note: "(x²-2x+2)(x²+2x+2), both give Q(i)" },
  { poly: "x^4 - 5x^2 + 4",   expected: { kind: "ok", group: "Trivial" }, note: "(x-1)(x+1)(x-2)(x+2)" },
  { poly: "x^4 - 3x^2 - 4",   expected: { kind: "ok", group: "C_2" }, note: "(x²-4)(x²+1) — one splits, one is Q(i)" },

  // ---- Degree 5+ ----
  { poly: "x^5 - x - 1",      expected: { kind: "unsupported" }, note: "Famous unsolvable quintic" },
];

let pass = 0;
let fail = 0;

for (const c of cases) {
  let line = `[ ${c.poly.padEnd(22)} ]  ${c.note ?? ""}`;
  try {
    const poly = parsePolynomial(c.poly);
    const result = computeGalois(poly);
    if (c.expected.kind === "unsupported") {
      if (result.kind === "unsupported") {
        pass++;
        line = "PASS " + line + "  → unsupported (as expected)";
      } else {
        fail++;
        line = "FAIL " + line + `  → expected unsupported, got ${result.kind}`;
      }
    } else if (result.kind === "ok") {
      const got = result.group.name;
      if (got === c.expected.group) {
        pass++;
        line = "PASS " + line + `  → ${got}  (|G|=${result.group.order})`;
      } else {
        fail++;
        line =
          "FAIL " +
          line +
          `  → expected ${c.expected.group}, got ${got}` +
          `  [disc=${fmtRat(result.discriminant)}${result.discriminantIsSquare ? " ☐" : ""}` +
          (result.resolventCubic ? `, resolvent=${formatPoly(result.resolventCubic, "y")}` : "") +
          (result.resolventRationalRoot ? `, θ=${fmtRat(result.resolventRationalRoot)}` : "") +
          "]";
      }
    } else {
      fail++;
      line = "FAIL " + line + `  → ${result.kind}: ${(result as any).reason}`;
    }
  } catch (e: any) {
    fail++;
    line = "FAIL " + line + `  → threw: ${e.message}`;
  }
  console.log(line);
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
