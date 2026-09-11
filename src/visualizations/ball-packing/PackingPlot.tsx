import { useId, useMemo, useRef, useState } from "react";
import { TOUCH_TOL, type Ball, type Packing, type PigeonholeReport } from "../../math/packing";
import {
  CELL_LINE,
  GLUE_ARROW,
  OUTSIDE_TINT,
  OVERLAP_EDGE,
  OVERLAP_FILL,
  OVERLAP_HATCH,
  SHARED_CELL_EDGE,
  SHARED_CELL_FILL,
  SQUARE_BG,
  SQUARE_EDGE,
  ballEdge,
  ballFill,
} from "./palette";

const W = 560;
const H = 560;
const MARGIN = 48;
const INNER = W - 2 * MARGIN;

/** One drawn disk: ball `ball` translated by (sx·L, sy·L). Only the torus uses nonzero shifts. */
type Copy = { ball: number; x: number; y: number; sx: number; sy: number };

type Props = {
  packing: Packing;
  /** Ball to spotlight; everything else fades back. */
  highlight: number | null;
  showGhosts: boolean;
  showLabels: boolean;
  pigeonhole: PigeonholeReport | null;
  onSelect: (i: number | null) => void;
  onMove: (i: number, x: number, y: number) => void;
};

export function PackingPlot({ packing, highlight, showGhosts, showLabels, pigeonhole, onSelect, onMove }: Props) {
  const { balls, radius, side, geometry, confine } = packing;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [dragging, setDragging] = useState<number | null>(null);
  const grab = useRef<{ ball: number; ox: number; oy: number } | null>(null);

  // On the torus the square is the whole space, so the picture stops at its
  // edge. In the square with overhang allowed, balls spill over the walls and
  // the view has to open up by r to keep showing all of them.
  const pad = geometry === "torus" || confine ? 0 : radius;
  const span = Math.max(1e-9, side + 2 * pad);
  const scale = INNER / span;
  const rPx = radius * scale;
  const toX = (x: number) => MARGIN + (x + pad) * scale;
  const toY = (y: number) => H - MARGIN - (y + pad) * scale;
  const sq = { x: toX(0), y: toY(side), w: side * scale, h: side * scale };

  // Disks actually drawn inside the square. In square geometry that is just the
  // n balls; on the torus each ball also shows up as whatever wrapped images
  // reach back into the fundamental domain.
  const copies = useMemo<Copy[]>(() => {
    const out: Copy[] = [];
    const R = geometry === "torus" ? Math.max(1, Math.ceil(radius / side)) : 0;
    for (let i = 0; i < balls.length; i++) {
      for (let sx = -R; sx <= R; sx++) {
        for (let sy = -R; sy <= R; sy++) {
          const x = balls[i].x + sx * side;
          const y = balls[i].y + sy * side;
          if (geometry === "torus") {
            if (x + radius < 0 || x - radius > side) continue;
            if (y + radius < 0 || y - radius > side) continue;
          }
          out.push({ ball: i, x, y, sx, sy });
        }
      }
    }
    return out;
  }, [balls, radius, side, geometry]);

  // The ring of eight neighbouring tiles, drawn faintly in the margin so the
  // gluing is visible rather than just asserted.
  const ghosts = useMemo<Copy[]>(() => {
    if (geometry !== "torus" || !showGhosts) return [];
    const out: Copy[] = [];
    for (let i = 0; i < balls.length; i++) {
      for (let sx = -1; sx <= 1; sx++) {
        for (let sy = -1; sy <= 1; sy++) {
          if (sx === 0 && sy === 0) continue;
          out.push({ ball: i, x: balls[i].x + sx * side, y: balls[i].y + sy * side, sx, sy });
        }
      }
    }
    return out;
  }, [balls, side, geometry, showGhosts]);

  // Every pair of drawn disks that interpenetrate. Two copies of the *same* ball
  // can be in here: that is a ball wide enough to wrap round and meet itself.
  const lenses = useMemo(() => {
    const out: { a: number; b: number }[] = [];
    const reach = 2 * radius * (1 - TOUCH_TOL);
    for (let a = 0; a < copies.length; a++) {
      for (let b = a + 1; b < copies.length; b++) {
        if (Math.hypot(copies[a].x - copies[b].x, copies[a].y - copies[b].y) < reach) out.push({ a, b });
      }
    }
    return out;
  }, [copies, radius]);

  function dataAt(e: React.PointerEvent<SVGSVGElement>): Ball {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * W;
    const sy = ((e.clientY - rect.top) / rect.height) * H;
    return { x: (sx - MARGIN) / scale - pad, y: (H - MARGIN - sy) / scale - pad };
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const p = dataAt(e);
    // Grab the nearest disk under the pointer; tiny balls stay grabbable via a
    // small screen-space slack.
    const reach = Math.max(radius, 9 / scale);
    let best: { copy: Copy; d: number } | null = null;
    for (const c of copies) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d <= reach && (!best || d < best.d)) best = { copy: c, d };
    }
    if (!best) {
      onSelect(null);
      return;
    }
    grab.current = { ball: best.copy.ball, ox: p.x - best.copy.x, oy: p.y - best.copy.y };
    setDragging(best.copy.ball);
    onSelect(best.copy.ball);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const g = grab.current;
    if (!g) return;
    const p = dataAt(e);
    onMove(g.ball, p.x - g.ox, p.y - g.oy);
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    grab.current = null;
    setDragging(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  const faded = (ball: number) => highlight !== null && highlight !== ball;

  // Cell grid for the pigeonhole argument. The tint goes under the disks, but
  // the lines and the outline of a doubly-occupied cell go over them — under a
  // ball as large as the ones this page invites, anything drawn beneath is gone.
  const cellTints: React.ReactNode[] = [];
  const cellLines: React.ReactNode[] = [];
  const cellOutlines: React.ReactNode[] = [];
  if (pigeonhole) {
    const k = pigeonhole.k;
    const cell = (side * scale) / k;
    for (const idx of pigeonhole.sharedCells) {
      const col = idx % k;
      const row = Math.floor(idx / k);
      const x = toX((col * side) / k);
      const y = toY(((row + 1) * side) / k);
      cellTints.push(<rect key={`t${idx}`} x={x} y={y} width={cell} height={cell} fill={SHARED_CELL_FILL} />);
      cellOutlines.push(
        <rect
          key={`o${idx}`}
          x={x + 1}
          y={y + 1}
          width={cell - 2}
          height={cell - 2}
          fill="none"
          stroke={SHARED_CELL_EDGE}
          strokeWidth={2}
          strokeDasharray="6 4"
        />,
      );
    }
    for (let i = 1; i < k; i++) {
      const t = (i * side) / k;
      cellLines.push(
        <line key={`cv${i}`} x1={toX(t)} y1={toY(0)} x2={toX(t)} y2={toY(side)} stroke={CELL_LINE} strokeWidth={1.2} />,
        <line key={`ch${i}`} x1={toX(0)} y1={toY(t)} x2={toX(side)} y2={toY(t)} stroke={CELL_LINE} strokeWidth={1.2} />,
      );
    }
  }

  // Labels sit at the centre, or — for a wrapped copy whose centre is outside
  // the square — at the nearest visible point of that copy, so every arc of
  // colour on screen says which ball it belongs to.
  function labelPos(c: Copy): { x: number; y: number } {
    if (geometry !== "torus") return { x: c.x, y: c.y };
    const inset = Math.min(12 / scale, side / 2);
    return {
      x: Math.min(Math.max(c.x, inset), side - inset),
      y: Math.min(Math.max(c.y, inset), side - inset),
    };
  }

  const clip = geometry === "torus" ? `url(#${uid}-sq)` : undefined;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${balls.length} balls of radius ${radius} over a ${geometry === "torus" ? "torus" : "square"} of side ${side}`}
      style={{
        maxWidth: W,
        touchAction: "none",
        userSelect: "none",
        cursor: dragging !== null ? "grabbing" : "grab",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <defs>
        <clipPath id={`${uid}-sq`}>
          <rect x={sq.x} y={sq.y} width={sq.w} height={sq.h} />
        </clipPath>
        {copies.map((c, i) => (
          <clipPath key={i} id={`${uid}-c${i}`}>
            <circle cx={toX(c.x)} cy={toY(c.y)} r={rPx} />
          </clipPath>
        ))}
        <pattern id={`${uid}-hatch`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke={OVERLAP_HATCH} strokeWidth="2" strokeOpacity="0.45" />
        </pattern>
      </defs>

      <rect x={0} y={0} width={W} height={H} fill={OUTSIDE_TINT} />

      {/* Neighbouring tiles, faint, outside the square. Drawn first so the
          opaque square below covers the parts that fall inside it. */}
      {ghosts.map((c, i) => (
        <circle
          key={`g${i}`}
          cx={toX(c.x)}
          cy={toY(c.y)}
          r={rPx}
          fill={ballFill(c.ball)}
          fillOpacity={faded(c.ball) ? 0.05 : 0.16}
          stroke={ballEdge(c.ball)}
          strokeOpacity={faded(c.ball) ? 0.08 : 0.25}
          strokeWidth={1}
        />
      ))}

      <rect x={sq.x} y={sq.y} width={sq.w} height={sq.h} fill={SQUARE_BG} />

      <g clipPath={clip}>
        {cellTints}

        {/* Each ball's own colour. Whatever stays this colour is covered by that
            ball alone — the overlaps get painted over in red below. */}
        {copies.map((c, i) => (
          <circle
            key={`d${i}`}
            cx={toX(c.x)}
            cy={toY(c.y)}
            r={rPx}
            fill={ballFill(c.ball)}
            fillOpacity={faded(c.ball) ? 0.14 : 0.82}
            stroke={ballEdge(c.ball)}
            strokeOpacity={faded(c.ball) ? 0.2 : 1}
            strokeWidth={highlight === c.ball ? 2.6 : 1.4}
            strokeDasharray={c.sx === 0 && c.sy === 0 ? undefined : "5 4"}
          />
        ))}

        {/* Shared area. The lens is exactly disk b clipped to disk a; stroking
            both circles under the other's clip draws the full lens outline. */}
        {lenses.map(({ a, b }, i) => (
          <g key={`l${i}`}>
            <g clipPath={`url(#${uid}-c${a})`}>
              <circle cx={toX(copies[b].x)} cy={toY(copies[b].y)} r={rPx} fill={OVERLAP_FILL} fillOpacity={0.95} />
              <circle cx={toX(copies[b].x)} cy={toY(copies[b].y)} r={rPx} fill={`url(#${uid}-hatch)`} />
              <circle
                cx={toX(copies[b].x)}
                cy={toY(copies[b].y)}
                r={rPx}
                fill="none"
                stroke={OVERLAP_EDGE}
                strokeWidth={1.6}
              />
            </g>
            <g clipPath={`url(#${uid}-c${b})`}>
              <circle
                cx={toX(copies[a].x)}
                cy={toY(copies[a].y)}
                r={rPx}
                fill="none"
                stroke={OVERLAP_EDGE}
                strokeWidth={1.6}
              />
            </g>
          </g>
        ))}

        <g opacity={0.85}>{cellLines}</g>
        {cellOutlines}
      </g>

      {/* Boundary. On the torus the arrowheads are the usual edge-identification
          marks: one arrow glues left to right, two glue bottom to top. */}
      <rect
        x={sq.x}
        y={sq.y}
        width={sq.w}
        height={sq.h}
        fill="none"
        stroke={geometry === "torus" ? GLUE_ARROW : SQUARE_EDGE}
        strokeOpacity={geometry === "torus" ? 0.75 : 1}
        strokeWidth={geometry === "torus" ? 1.6 : 2.2}
        strokeDasharray={geometry === "torus" ? "7 5" : undefined}
      />
      {geometry === "torus" && (
        <g fill={GLUE_ARROW} fillOpacity={0.9}>
          <path d={arrowPath(sq.x, sq.y + sq.h / 2, "up")} />
          <path d={arrowPath(sq.x + sq.w, sq.y + sq.h / 2, "up")} />
          <path d={arrowPath(sq.x + sq.w / 2 - 7, sq.y, "right")} />
          <path d={arrowPath(sq.x + sq.w / 2 + 7, sq.y, "right")} />
          <path d={arrowPath(sq.x + sq.w / 2 - 7, sq.y + sq.h, "right")} />
          <path d={arrowPath(sq.x + sq.w / 2 + 7, sq.y + sq.h, "right")} />
        </g>
      )}

      <g clipPath={clip}>
        {/* Centres, radius spoke for the spotlit ball, and labels. */}
        {copies.map((c, i) => {
          const dim = faded(c.ball);
          const lp = labelPos(c);
          return (
            <g key={`m${i}`} opacity={dim ? 0.35 : 1}>
              {highlight === c.ball && (
                <line
                  x1={toX(c.x)}
                  y1={toY(c.y)}
                  x2={toX(c.x) + rPx}
                  y2={toY(c.y)}
                  stroke={ballEdge(c.ball)}
                  strokeWidth={1.4}
                  strokeDasharray="3 3"
                />
              )}
              <circle cx={toX(c.x)} cy={toY(c.y)} r={2.6} fill="#0f1117" stroke={ballEdge(c.ball)} strokeWidth={1.4} />
              {showLabels && (
                <text
                  x={toX(lp.x)}
                  y={toY(lp.y) - 7}
                  textAnchor="middle"
                  fontFamily="var(--mono)"
                  fontSize="12.5"
                  fontWeight="600"
                  fill={ballEdge(c.ball)}
                  stroke="#0f1117"
                  strokeWidth="3"
                  paintOrder="stroke"
                >
                  {c.ball + 1}
                </text>
              )}
            </g>
          );
        })}
      </g>

      {/* Corner ticks for the side length, held clear of a ball centred in a corner. */}
      <text x={sq.x - 9} y={sq.y + sq.h + 22} textAnchor="end" fontFamily="var(--mono)" fontSize="11" fill="#6b7080">
        0
      </text>
      <text x={sq.x + sq.w + 4} y={sq.y + sq.h + 22} textAnchor="middle" fontFamily="var(--mono)" fontSize="11" fill="#6b7080">
        {trim(side)}
      </text>
      <text x={sq.x - 9} y={sq.y - 6} textAnchor="end" fontFamily="var(--mono)" fontSize="11" fill="#6b7080">
        {trim(side)}
      </text>
    </svg>
  );
}

function arrowPath(x: number, y: number, dir: "up" | "right", s = 6.5): string {
  if (dir === "up") return `M ${x} ${y - s} L ${x - s * 0.78} ${y + s * 0.62} L ${x + s * 0.78} ${y + s * 0.62} Z`;
  return `M ${x + s} ${y} L ${x - s * 0.62} ${y - s * 0.78} L ${x - s * 0.62} ${y + s * 0.78} Z`;
}

function trim(v: number): string {
  const s = v.toFixed(3);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}
