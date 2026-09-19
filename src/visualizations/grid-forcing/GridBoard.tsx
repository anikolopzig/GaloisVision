// The N × N board: click or drag to place dots, and see the copy of the shape
// that your arrangement contains, if it contains one.
//
// Hand-rolled SVG, like every other plot here. Cell (i, j) sits at column i and
// row j with j increasing *upwards*, so the picture matches the coordinates the
// formula uses rather than screen convention.

import { useRef, useState } from "react";
import {
  cellAt,
  cellIndex,
  type Cell,
  type OccurrenceDetail,
} from "../../math/gridForcing";

const VIEW = 440;
const PAD = 34;

export type BoardProps = {
  n: number;
  selected: ReadonlySet<number>;
  /** The copy of the shape to draw over the board, already described.  */
  detail: OccurrenceDetail | null;
  /** Cells that could still be added without creating a copy; null hides the hint. */
  safe: ReadonlySet<number> | null;
  showSafe: boolean;
  showLabels: boolean;
  onToggle: (index: number) => void;
  onPaint: (index: number, on: boolean) => void;
};

export function GridBoard({ n, selected, detail, safe, showSafe, showLabels, onToggle, onPaint }: BoardProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  // While a drag is in progress: whether we are adding or removing, and the
  // cell we last acted on, so a single drag does not flicker a cell on and off.
  const paint = useRef<{ on: boolean; last: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const step = n > 1 ? (VIEW - 2 * PAD) / (n - 1) : 0;
  const x = (i: number) => PAD + i * step;
  const y = (j: number) => PAD + (n - 1 - j) * step;
  const dotR = Math.max(3.2, Math.min(11, step * 0.2));

  function cellFromPointer(e: { clientX: number; clientY: number }): number | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const px = ((e.clientX - rect.left) / rect.width) * VIEW;
    const py = ((e.clientY - rect.top) / rect.height) * VIEW;
    if (n === 1) return 0;
    const i = Math.round((px - PAD) / step);
    const row = Math.round((py - PAD) / step);
    const j = n - 1 - row;
    if (i < 0 || i >= n || j < 0 || j >= n) return null;
    // Only count a hit near the dot, so the gaps between them are dead space
    // and a sloppy drag does not sweep a whole row.
    if (Math.hypot(px - x(i), py - y(j)) > step * 0.48) return null;
    return cellIndex(n, i, j);
  }

  const highlighted = new Set<number>();
  if (detail) for (const v of detail.vertices) highlighted.add(cellIndex(n, v.i, v.j));

  // The hull, not the vertex order: a hand-drawn pattern need not be convex, and
  // a polygon through its points in the order they are listed would cross itself.
  const polygon = detail ? detail.hull.map((v) => `${x(v.i)},${y(v.j)}`).join(" ") : "";

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      className="gf-board"
      role="img"
      aria-label={`${n} by ${n} grid with ${selected.size} dots placed`}
      onPointerDown={(e) => {
        const idx = cellFromPointer(e);
        if (idx === null) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const on = !selected.has(idx);
        paint.current = { on, last: idx };
        onToggle(idx);
      }}
      onPointerMove={(e) => {
        const idx = cellFromPointer(e);
        setHover(idx);
        const p = paint.current;
        if (!p || idx === null || idx === p.last) return;
        p.last = idx;
        onPaint(idx, p.on);
      }}
      onPointerUp={(e) => {
        paint.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerLeave={() => {
        paint.current = null;
        setHover(null);
      }}
    >
      {/* Grid lines, faint: the board is about the dots, not the squares. */}
      <g stroke="var(--border)" strokeWidth={1}>
        {Array.from({ length: n }, (_, t) => (
          <line key={`v${t}`} x1={x(t)} y1={y(0)} x2={x(t)} y2={y(n - 1)} />
        ))}
        {Array.from({ length: n }, (_, t) => (
          <line key={`h${t}`} x1={x(0)} y1={y(t)} x2={x(n - 1)} y2={y(t)} />
        ))}
      </g>

      {showLabels && n <= 10 && (
        <g fill="var(--text-muted)" fontSize={11} fontFamily="var(--mono)">
          {Array.from({ length: n }, (_, t) => (
            <text key={`xl${t}`} x={x(t)} y={VIEW - PAD + 20} textAnchor="middle">
              {t}
            </text>
          ))}
          {Array.from({ length: n }, (_, t) => (
            <text key={`yl${t}`} x={PAD - 14} y={y(t) + 4} textAnchor="end">
              {t}
            </text>
          ))}
        </g>
      )}

      {detail && (
        <g>
          <polygon points={polygon} fill="var(--error)" fillOpacity={0.14} stroke="none" />
          {detail.edges.map((e, idx) => (
            <line
              key={idx}
              x1={x(e.from.i)}
              y1={y(e.from.j)}
              x2={x(e.to.i)}
              y2={y(e.to.j)}
              stroke={e.witnessing ? "var(--error)" : "var(--border-strong)"}
              strokeWidth={e.witnessing ? 2.4 : 1.4}
              strokeDasharray={e.witnessing ? undefined : "4 3"}
            />
          ))}
          {showLabels &&
            detail.edges
              .filter((e) => e.witnessing)
              .map((e, idx) => (
                <text
                  key={`el${idx}`}
                  x={(x(e.from.i) + x(e.to.i)) / 2}
                  y={(y(e.from.j) + y(e.to.j)) / 2 - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fontFamily="var(--mono)"
                  fill="var(--error)"
                >
                  d²={e.length2}
                </text>
              ))}
        </g>
      )}

      <g>
        {Array.from({ length: n * n }, (_, idx) => {
          const c: Cell = cellAt(n, idx);
          const on = selected.has(idx);
          const inShape = highlighted.has(idx);
          const canAdd = showSafe && !on && safe !== null && safe.has(idx);
          return (
            <g key={idx}>
              {canAdd && <circle cx={x(c.i)} cy={y(c.j)} r={dotR * 0.95} fill="none" stroke="var(--accent)" strokeWidth={1} strokeDasharray="2 2" opacity={0.55} />}
              <circle
                cx={x(c.i)}
                cy={y(c.j)}
                r={on ? (inShape ? dotR * 1.25 : dotR) : dotR * 0.42}
                fill={on ? (inShape ? "var(--error)" : "var(--accent)") : "var(--border-strong)"}
                stroke={inShape ? "var(--bg)" : "none"}
                strokeWidth={inShape ? 1.5 : 0}
              />
              {hover === idx && (
                <circle cx={x(c.i)} cy={y(c.j)} r={dotR * 1.7} fill="none" stroke="var(--accent)" strokeWidth={1} opacity={0.6} />
              )}
            </g>
          );
        })}
      </g>

      {hover !== null && showLabels && (
        <text x={PAD} y={16} fontSize={12} fontFamily="var(--mono)" fill="var(--text-dim)">
          ({cellAt(n, hover).i},{cellAt(n, hover).j})
        </text>
      )}
    </svg>
  );
}
