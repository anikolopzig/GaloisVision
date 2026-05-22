import { useRef, useState } from "react";
import { Overlays, type Overlay, type Pt2 } from "./Overlays";
import { PLOT_COLORS } from "./palette";

type Props = {
  points: Pt2[]; // lattice points in data coords
  overlays: Overlay[];
  backgroundOverlays?: Overlay[]; // drawn beneath the lattice points (e.g. grids)
  viewRadius: number;
  showGrid?: boolean;
  onPointerData?: (p: Pt2) => void; // fires on click/drag with data coords; enables "click to place"
};

const W = 440;
const H = 440;
const MARGIN = 36;

export function LatticePlot2D({ points, overlays, backgroundOverlays, viewRadius, showGrid = true, onPointerData }: Props) {
  const [grabbing, setGrabbing] = useState(false);
  const down = useRef(false);

  const radius = viewRadius > 0 ? viewRadius : 1;
  const cx = W / 2;
  const cy = H / 2;
  const scale = (W / 2 - MARGIN) / radius;
  const toX = (x: number) => cx + x * scale;
  const toY = (y: number) => cy - y * scale;
  const project = (p: number[]): Pt2 => ({ x: toX(p[0]), y: toY(p[1]) });

  function emit(e: React.PointerEvent<SVGSVGElement>) {
    if (!onPointerData) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * W;
    const sy = ((e.clientY - rect.top) / rect.height) * H;
    onPointerData({ x: (sx - cx) / scale, y: (cy - sy) / scale });
  }
  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (!onPointerData) return;
    down.current = true;
    setGrabbing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    emit(e);
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (down.current) emit(e);
  }
  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    down.current = false;
    setGrabbing(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  const gridLines: React.ReactNode[] = [];
  if (showGrid) {
    const step = niceStep(radius);
    const count = Math.floor(radius / step);
    for (let i = -count; i <= count; i++) {
      const t = i * step;
      gridLines.push(
        <line key={`gx${i}`} x1={toX(t)} y1={toY(-radius)} x2={toX(t)} y2={toY(radius)} stroke="#191d28" strokeWidth={1} />,
        <line key={`gy${i}`} x1={toX(-radius)} y1={toY(t)} x2={toX(radius)} y2={toY(t)} stroke="#191d28" strokeWidth={1} />,
      );
    }
  }

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Lattice in the plane"
      style={{
        maxWidth: W,
        touchAction: "none",
        userSelect: "none",
        cursor: onPointerData ? (grabbing ? "grabbing" : "crosshair") : "default",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <g>{gridLines}</g>
      {/* axes */}
      <line x1={0} y1={cy} x2={W} y2={cy} stroke="#39414f" strokeWidth={1.2} />
      <line x1={cx} y1={0} x2={cx} y2={H} stroke="#39414f" strokeWidth={1.2} />
      <text x={W - 12} y={cy - 5} fill="#6b7080" fontFamily="var(--mono)" fontSize="11" textAnchor="end">
        x
      </text>
      <text x={cx + 5} y={12} fill="#6b7080" fontFamily="var(--mono)" fontSize="11">
        y
      </text>

      {backgroundOverlays && <Overlays items={backgroundOverlays} project={project} />}

      {/* lattice points (drawn above the grids so they stand out) */}
      {points.map((p, i) => {
        const isOrigin = p.x === 0 && p.y === 0;
        return (
          <circle
            key={i}
            cx={toX(p.x)}
            cy={toY(p.y)}
            r={isOrigin ? 5 : 3.2}
            fill={isOrigin ? PLOT_COLORS.cell : "#e8ecf3"}
            stroke="#0f1117"
            strokeWidth={1.2}
          />
        );
      })}

      <Overlays items={overlays} project={project} />
    </svg>
  );
}

function niceStep(radius: number): number {
  const raw = (radius * 2) / 10;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / pow;
  const nice = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
  return Math.max(nice * pow, 1e-6);
}
