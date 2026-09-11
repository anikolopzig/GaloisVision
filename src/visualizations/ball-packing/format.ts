// Number formatting for the ball-packing readouts.

/** Fixed-decimal, with trailing zeros trimmed: 0.750 → "0.75", 1.0 → "1". */
export function num(v: number, decimals = 4): string {
  if (!Number.isFinite(v)) return "—";
  const s = v.toFixed(decimals);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

export function pct(fraction: number, decimals = 1): string {
  if (!Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(decimals)}%`;
}

/** "3 balls" / "1 ball" — used often enough to be worth a helper. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
