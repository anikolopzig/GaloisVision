import { format as fmtRat, toNumber, rationalSqrt, type Rational } from "../../math/rational";

// A length ‖·‖ from its exact square: exact if a perfect square, else √k ≈ decimal.
export function normText(normSq: Rational): string {
  const exact = rationalSqrt(normSq);
  if (exact) return fmtRat(exact);
  return `√${fmtRat(normSq)} ≈ ${Math.sqrt(toNumber(normSq)).toFixed(4)}`;
}
