import { useRef, useState } from "react";
import type { Vec3 } from "../../math/lattice";
import { Overlays, type Overlay } from "../shared/Overlays";

// Vivid palette for the generator arrows (kept distinct from the cell colour).
export const VEC_COLORS = ["#ff9d6c", "#7ee2c8", "#a899ff", "#74c0fc"];
const CELL_STROKE = "#ffd966";
const CELL_FILL = "rgba(255, 217, 102, 0.12)";
const POINT_FILL = "#cfd6e6";

export type Arrow = { vec: Vec3; label: string; color: string; dashed?: boolean };

type Props = {
  points: Vec3[];
  arrows: Arrow[];
  cellBasis: Vec3[]; // rank vectors spanning the fundamental domain (numeric, embedded 3D)
  rank: number;
  dim: number;
  viewRadius: number;
  showCell: boolean;
  showPoints: boolean;
  initialAz: number;
  initialEl: number;
  overlays?: Overlay[];
  target?: Vec3 | null; // draggable marker (rendered by the caller as an overlay; this is the drag hit-target)
  onTargetDrag?: (world: Vec3) => void;
  highlightCell?: { center: Vec3; edges: Vec3[]; color?: string }; // centered parallelepiped (e.g. Babai's rounding cell)
};

const W = 480;
const H = 440;
const MARGIN = 40;

export function LatticePlot3D({
  points,
  arrows,
  cellBasis,
  rank,
  dim,
  viewRadius,
  showCell,
  showPoints,
  initialAz,
  initialEl,
  overlays,
  target,
  onTargetDrag,
  highlightCell,
}: Props) {
  // Initial state seeds the view; a changing `key` (from the parent) remounts
  // this component to reset the view, so no reset effect is needed here.
  const [az, setAz] = useState(initialAz);
  const [el, setEl] = useState(initialEl);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const mode = useRef<"rotate" | "target" | null>(null);
  const lastSvg = useRef<{ sx: number; sy: number } | null>(null);
  const targetWork = useRef<Vec3 | null>(null);

  const radius = viewRadius > 0 ? viewRadius : 1;
  const cx = W / 2;
  const cy = H / 2;
  const scale = ((Math.min(W, H) / 2 - MARGIN) / radius) * zoom;

  const ca = Math.cos(az);
  const sa = Math.sin(az);
  const ce = Math.cos(el);
  const se = Math.sin(el);

  function project(p: Vec3): { x: number; y: number; depth: number } {
    const x1 = p[0] * ca - p[1] * sa;
    const y1 = p[0] * sa + p[1] * ca;
    const z1 = p[2];
    const y2 = y1 * ce - z1 * se;
    const z2 = y1 * se + z1 * ce;
    return { x: cx + x1 * scale, y: cy - z2 * scale, depth: y2 };
  }

  const origin = project([0, 0, 0]);

  // ---- pointer / wheel interaction ----
  function toSvg(e: React.PointerEvent<SVGSVGElement>): { sx: number; sy: number } {
    const rect = e.currentTarget.getBoundingClientRect();
    return { sx: ((e.clientX - rect.left) / rect.width) * W, sy: ((e.clientY - rect.top) / rect.height) * H };
  }
  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const { sx, sy } = toSvg(e);
    if (target && onTargetDrag) {
      const tp = project(target);
      if (Math.hypot(tp.x - sx, tp.y - sy) < 14) {
        mode.current = "target";
        targetWork.current = [target[0], target[1], target[2]];
        lastSvg.current = { sx, sy };
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }
    mode.current = "rotate";
    drag.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (mode.current === "rotate") {
      if (!drag.current) return;
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      drag.current = { x: e.clientX, y: e.clientY };
      setAz((a) => a + dx * 0.01);
      setEl((p) => Math.max(-1.5, Math.min(1.5, p + dy * 0.01)));
    } else if (mode.current === "target" && lastSvg.current && targetWork.current && onTargetDrag) {
      // Move the target in the view plane: invert the az/el rotation of the screen delta.
      const { sx, sy } = toSvg(e);
      const dX = (sx - lastSvg.current.sx) / scale;
      const dZ2 = -(sy - lastSvg.current.sy) / scale;
      lastSvg.current = { sx, sy };
      const tw = targetWork.current;
      targetWork.current = [
        tw[0] + ca * dX + sa * se * dZ2,
        tw[1] - sa * dX + ca * se * dZ2,
        tw[2] + ce * dZ2,
      ];
      onTargetDrag([targetWork.current[0], targetWork.current[1], targetWork.current[2]]);
    }
  }
  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    mode.current = null;
    drag.current = null;
    lastSvg.current = null;
    targetWork.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    setZoom((z) => Math.max(0.3, Math.min(6, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12))));
  }

  // ---- ground grid on the z = 0 plane (depth reference) ----
  const gridLines: React.ReactNode[] = [];
  {
    const step = niceStep(radius);
    const count = Math.floor(radius / step);
    for (let i = -count; i <= count; i++) {
      const t = i * step;
      const a = project([t, -radius, 0]);
      const b = project([t, radius, 0]);
      const c = project([-radius, t, 0]);
      const d = project([radius, t, 0]);
      gridLines.push(
        <line key={`gx${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#191d28" strokeWidth={1} />,
        <line key={`gy${i}`} x1={c.x} y1={c.y} x2={d.x} y2={d.y} stroke="#191d28" strokeWidth={1} />,
      );
    }
  }

  // ---- axes ----
  const axisDefs: { dir: Vec3; label: string }[] = [
    { dir: [1, 0, 0], label: "x" },
    { dir: [0, 1, 0], label: "y" },
  ];
  if (dim >= 3) axisDefs.push({ dir: [0, 0, 1], label: "z" });
  const axisEls = axisDefs.map(({ dir, label }) => {
    const neg = project([-dir[0] * radius, -dir[1] * radius, -dir[2] * radius]);
    const pos = project([dir[0] * radius, dir[1] * radius, dir[2] * radius]);
    return (
      <g key={label}>
        <line x1={neg.x} y1={neg.y} x2={pos.x} y2={pos.y} stroke="#39414f" strokeWidth={1.2} />
        <text x={pos.x} y={pos.y - 4} fill="#6b7080" fontFamily="var(--mono)" fontSize="11">
          {label}
        </text>
      </g>
    );
  });

  // ---- fundamental domain (cell) ----
  let cellEls: React.ReactNode = null;
  if (showCell && rank >= 1 && cellBasis.length >= rank) {
    if (rank === 1) {
      const e1 = project(cellBasis[0]);
      cellEls = (
        <line x1={origin.x} y1={origin.y} x2={e1.x} y2={e1.y} stroke={CELL_STROKE} strokeWidth={6} strokeLinecap="round" opacity={0.5} />
      );
    } else if (rank === 2) {
      const b1 = cellBasis[0];
      const b2 = cellBasis[1];
      const corners: Vec3[] = [
        [0, 0, 0],
        b1,
        [b1[0] + b2[0], b1[1] + b2[1], b1[2] + b2[2]],
        b2,
      ];
      const pts = corners.map(project);
      cellEls = (
        <polygon
          points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
          fill={CELL_FILL}
          stroke={CELL_STROKE}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      );
    } else {
      // Parallelepiped: 8 vertices, 6 faces drawn back-to-front.
      const [b1, b2, b3] = cellBasis;
      const vert: Vec3[] = [];
      for (let k = 0; k < 2; k++)
        for (let j = 0; j < 2; j++)
          for (let i = 0; i < 2; i++)
            vert.push([
              i * b1[0] + j * b2[0] + k * b3[0],
              i * b1[1] + j * b2[1] + k * b3[1],
              i * b1[2] + j * b2[2] + k * b3[2],
            ]);
      const idx = (i: number, j: number, k: number) => i + 2 * j + 4 * k;
      const faces = [
        [idx(0, 0, 0), idx(1, 0, 0), idx(1, 1, 0), idx(0, 1, 0)],
        [idx(0, 0, 1), idx(1, 0, 1), idx(1, 1, 1), idx(0, 1, 1)],
        [idx(0, 0, 0), idx(1, 0, 0), idx(1, 0, 1), idx(0, 0, 1)],
        [idx(0, 1, 0), idx(1, 1, 0), idx(1, 1, 1), idx(0, 1, 1)],
        [idx(0, 0, 0), idx(0, 1, 0), idx(0, 1, 1), idx(0, 0, 1)],
        [idx(1, 0, 0), idx(1, 1, 0), idx(1, 1, 1), idx(1, 0, 1)],
      ];
      const proj = vert.map(project);
      const sorted = faces
        .map((f) => ({ f, depth: f.reduce((s, vi) => s + proj[vi].depth, 0) / f.length }))
        .sort((p, q) => p.depth - q.depth);
      cellEls = (
        <g>
          {sorted.map(({ f }, i) => (
            <polygon
              key={i}
              points={f.map((vi) => `${proj[vi].x},${proj[vi].y}`).join(" ")}
              fill={CELL_FILL}
              stroke={CELL_STROKE}
              strokeWidth={1.3}
              strokeLinejoin="round"
              opacity={0.9}
            />
          ))}
        </g>
      );
    }
  }

  // ---- highlighted centered cell (e.g. Babai's rounding cell around a point) ----
  let highlightEls: React.ReactNode = null;
  if (highlightCell) {
    const { center, edges } = highlightCell;
    const e1 = edges[0] ?? [0, 0, 0];
    const e2 = edges[1] ?? [0, 0, 0];
    const e3 = edges[2] ?? [0, 0, 0];
    const stroke = highlightCell.color ?? "#a899ff";
    const vert: Vec3[] = [];
    for (let k = 0; k < 2; k++)
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++)
          vert.push([
            center[0] + (i - 0.5) * e1[0] + (j - 0.5) * e2[0] + (k - 0.5) * e3[0],
            center[1] + (i - 0.5) * e1[1] + (j - 0.5) * e2[1] + (k - 0.5) * e3[1],
            center[2] + (i - 0.5) * e1[2] + (j - 0.5) * e2[2] + (k - 0.5) * e3[2],
          ]);
    const idx = (i: number, j: number, k: number) => i + 2 * j + 4 * k;
    const faces = [
      [idx(0, 0, 0), idx(1, 0, 0), idx(1, 1, 0), idx(0, 1, 0)],
      [idx(0, 0, 1), idx(1, 0, 1), idx(1, 1, 1), idx(0, 1, 1)],
      [idx(0, 0, 0), idx(1, 0, 0), idx(1, 0, 1), idx(0, 0, 1)],
      [idx(0, 1, 0), idx(1, 1, 0), idx(1, 1, 1), idx(0, 1, 1)],
      [idx(0, 0, 0), idx(0, 1, 0), idx(0, 1, 1), idx(0, 0, 1)],
      [idx(1, 0, 0), idx(1, 1, 0), idx(1, 1, 1), idx(1, 0, 1)],
    ];
    const proj = vert.map(project);
    const sorted = faces
      .map((f) => ({ f, depth: f.reduce((s, vi) => s + proj[vi].depth, 0) / f.length }))
      .sort((p, q) => p.depth - q.depth);
    highlightEls = (
      <g>
        {sorted.map(({ f }, i) => (
          <polygon
            key={i}
            points={f.map((vi) => `${proj[vi].x},${proj[vi].y}`).join(" ")}
            fill="rgba(168, 153, 255, 0.16)"
            stroke={stroke}
            strokeWidth={1.3}
            strokeLinejoin="round"
            opacity={0.92}
          />
        ))}
      </g>
    );
  }

  // ---- lattice points, depth-sorted ----
  // One pass: project, track depth range, then sort back-to-front.
  const projPoints: { x: number; y: number; depth: number; isOrigin: boolean }[] = [];
  let dMin = Infinity;
  let dMax = -Infinity;
  if (showPoints) {
    for (const p of points) {
      const pr = project(p);
      if (pr.depth < dMin) dMin = pr.depth;
      if (pr.depth > dMax) dMax = pr.depth;
      projPoints.push({ ...pr, isOrigin: p[0] === 0 && p[1] === 0 && p[2] === 0 });
    }
    projPoints.sort((a, b) => a.depth - b.depth);
  }
  const dSpan = projPoints.length ? dMax - dMin || 1 : 1;

  // ---- generator arrows ----
  const arrowEls = arrows.map((arr, i) => {
    const tip = project(arr.vec);
    const dx = tip.x - origin.x;
    const dy = tip.y - origin.y;
    const len = Math.hypot(dx, dy) || 1;
    const trim = 8;
    const ex = tip.x - (dx * trim) / len;
    const ey = tip.y - (dy * trim) / len;
    return (
      <g key={`arr${i}`}>
        <line
          x1={origin.x}
          y1={origin.y}
          x2={ex}
          y2={ey}
          stroke={arr.color}
          strokeWidth={2.2}
          strokeDasharray={arr.dashed ? "5 4" : undefined}
          markerEnd={`url(#vhead-${i})`}
        />
        <text
          x={tip.x + 8}
          y={tip.y - 6}
          fill={arr.color}
          fontFamily="var(--mono)"
          fontSize="12.5"
          fontWeight={600}
        >
          {arr.label}
        </text>
      </g>
    );
  });

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Lattice in 3-D"
      style={{ touchAction: "none", cursor: dragging ? "grabbing" : "grab", userSelect: "none", maxWidth: W }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
    >
      <defs>
        {arrows.map((arr, i) => (
          <marker
            key={i}
            id={`vhead-${i}`}
            markerWidth="7"
            markerHeight="7"
            refX="5.5"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L6,3 L0,6 Z" fill={arr.color} />
          </marker>
        ))}
      </defs>

      <rect x={0} y={0} width={W} height={H} fill="transparent" />
      <g>{gridLines}</g>
      {cellEls}
      {highlightEls}
      <g>{axisEls}</g>

      {projPoints.map((p, i) => {
        const norm = (p.depth - dMin) / dSpan; // 0 = farthest, 1 = nearest
        const r = p.isOrigin ? 4.5 : 2 + norm * 2.4;
        const opacity = p.isOrigin ? 1 : 0.45 + norm * 0.5;
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={r}
            fill={p.isOrigin ? CELL_STROKE : POINT_FILL}
            opacity={opacity}
            stroke={p.isOrigin ? "#0f1117" : "none"}
            strokeWidth={p.isOrigin ? 1.5 : 0}
          />
        );
      })}

      {arrowEls}

      {overlays && overlays.length > 0 && (
        <Overlays
          items={overlays}
          project={(p) => {
            const r = project([p[0], p[1], p[2] ?? 0]);
            return { x: r.x, y: r.y };
          }}
        />
      )}
    </svg>
  );
}

// A "nice" grid step (1, 2, or 5 × power of ten) giving roughly 8-12 lines.
function niceStep(radius: number): number {
  const raw = (radius * 2) / 10;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / pow;
  const nice = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
  return Math.max(nice * pow, 1e-6);
}
