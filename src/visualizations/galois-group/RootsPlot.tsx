import type { Complex } from "../../math/polynomial";
import type { Perm } from "../../math/groups";

type Props = {
  roots: Complex[];
  rationalRootIdxs: Set<number>;
  perm: Perm | null;
  rootLabels: string[];
};

// Per-algebraic-root colors. Yellow is reserved for the rational-root marker
// (which is also drawn as a diamond) so palette + shape together disambiguate.
export const ROOT_COLORS = ["#7ee2c8", "#ff9d6c", "#a899ff", "#74c0fc", "#ff6ec7", "#9bd870"];
export const RATIONAL_FILL = "#ffd966";

const COLORS = ROOT_COLORS;

export function RootsPlot({ roots, perm, rootLabels, rationalRootIdxs }: Props) {
  const N = roots.length;
  if (N === 0) return null;

  // Choose plot bounds. Symmetric, padded.
  let r = 0.5;
  for (const z of roots) r = Math.max(r, Math.abs(z.re), Math.abs(z.im));
  const span = r * 1.4 + 0.4;
  const W = 360;
  const H = 360;
  const cx = W / 2;
  const cy = H / 2;
  const scale = (W / 2 - 22) / span;

  function toX(re: number): number {
    return cx + re * scale;
  }
  function toY(im: number): number {
    return cy - im * scale;
  }

  // Compose unit-vector arrowheads etc.
  const arrows: Array<{ i: number; j: number; color: string; selfLoop: boolean }> = [];
  if (perm) {
    for (let i = 0; i < N; i++) {
      const j = perm[i];
      arrows.push({ i, j, color: COLORS[i % COLORS.length], selfLoop: i === j });
    }
  }

  return (
    <svg width={W} height={H} role="img" aria-label="Roots in the complex plane">
      {/* Axes */}
      <g stroke="#2a2f3d" strokeWidth={1}>
        <line x1={0} y1={cy} x2={W} y2={cy} />
        <line x1={cx} y1={0} x2={cx} y2={H} />
      </g>
      {/* Unit circle reference */}
      <circle cx={cx} cy={cy} r={Math.min(scale, W / 2 - 22)} stroke="#1e2230" fill="none" strokeDasharray="2 4" />
      {/* Axis labels */}
      <g fill="#6b7080" fontFamily="var(--mono)" fontSize="10">
        <text x={W - 14} y={cy - 4} textAnchor="end">
          Re
        </text>
        <text x={cx + 4} y={12}>
          Im
        </text>
      </g>

      {/* Arrows for selected permutation */}
      {arrows.length > 0 && (
        <g>
          <defs>
            {COLORS.map((c, i) => (
              <marker
                key={i}
                id={`arrow-${i}`}
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill={c} />
              </marker>
            ))}
          </defs>
          {arrows.map(({ i, j, color, selfLoop }) => {
            const r1 = roots[i];
            const r2 = roots[j];
            if (selfLoop) {
              // Draw a small loop at the root.
              const x = toX(r1.re);
              const y = toY(r1.im);
              return (
                <circle
                  key={i}
                  cx={x + 12}
                  cy={y - 12}
                  r={9}
                  stroke={color}
                  strokeWidth={1.4}
                  fill="none"
                  opacity={0.85}
                />
              );
            }
            const x1 = toX(r1.re);
            const y1 = toY(r1.im);
            const x2 = toX(r2.re);
            const y2 = toY(r2.im);
            // Shrink the line endpoints so the arrowhead sits on the target circle.
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy);
            const trim = 9;
            const fromX = x1 + (dx * trim) / len;
            const fromY = y1 + (dy * trim) / len;
            const toX_ = x2 - (dx * trim) / len;
            const toY_ = y2 - (dy * trim) / len;
            return (
              <line
                key={`${i}-${j}`}
                x1={fromX}
                y1={fromY}
                x2={toX_}
                y2={toY_}
                stroke={color}
                strokeWidth={1.6}
                opacity={0.9}
                markerEnd={`url(#arrow-${COLORS.indexOf(color)})`}
              />
            );
          })}
        </g>
      )}

      {/* Roots themselves */}
      {roots.map((z, i) => {
        const isRational = rationalRootIdxs.has(i);
        const cx_ = toX(z.re);
        const cy_ = toY(z.im);
        const fill = isRational ? RATIONAL_FILL : COLORS[i % COLORS.length];
        return (
          <g key={i}>
            {isRational ? (
              // Diamond marker for rational roots: distinguishable in shape AND color.
              <polygon
                points={`${cx_},${cy_ - 7} ${cx_ + 7},${cy_} ${cx_},${cy_ + 7} ${cx_ - 7},${cy_}`}
                fill={fill}
                stroke="#0f1117"
                strokeWidth={1.5}
              />
            ) : (
              <circle cx={cx_} cy={cy_} r={6} fill={fill} stroke="#0f1117" strokeWidth={1.5} />
            )}
            <text
              x={cx_ + 10}
              y={cy_ - 8}
              fill="var(--text)"
              fontFamily="var(--mono)"
              fontSize="12"
            >
              {rootLabels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
