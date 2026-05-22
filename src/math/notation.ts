// Unicode sub/superscript rendering of small integers, for math labels.

const SUB = "₀₁₂₃₄₅₆₇₈₉";
const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";

export function sub(n: number): string {
  return String(n)
    .split("")
    .map((d) => SUB[+d] ?? d)
    .join("");
}

export function sup(n: number): string {
  return String(n)
    .split("")
    .map((d) => SUP[+d] ?? d)
    .join("");
}
