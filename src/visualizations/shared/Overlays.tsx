// Declarative overlay primitives shared by the 2-D and 3-D lattice plots.
// Each overlay carries world coordinates (number arrays of length 2 or 3); the
// host plot supplies a `project` mapping world → screen.

export type Pt2 = { x: number; y: number };

export type Overlay =
  | { kind: "vector"; to: number[]; from?: number[]; color: string; label?: string; dashed?: boolean; width?: number }
  | { kind: "segment"; a: number[]; b: number[]; color: string; dashed?: boolean; label?: string; width?: number }
  | { kind: "point"; at: number[]; color: string; label?: string; r?: number; shape?: "circle" | "diamond" | "ring" }
  | { kind: "polygon"; pts: number[][]; stroke: string; fill?: string; dashed?: boolean };

type Props = { items: Overlay[]; project: (p: number[]) => Pt2 };

const ORIGIN = [0, 0, 0];

function markerId(color: string): string {
  return "ovh-" + color.replace(/[^a-zA-Z0-9]/g, "");
}

export function Overlays({ items, project }: Props) {
  const vectorColors = Array.from(
    new Set(items.filter((o) => o.kind === "vector").map((o) => o.color)),
  );

  return (
    <g>
      <defs>
        {vectorColors.map((c) => (
          <marker
            key={c}
            id={markerId(c)}
            markerWidth="7"
            markerHeight="7"
            refX="5.5"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L6,3 L0,6 Z" fill={c} />
          </marker>
        ))}
      </defs>
      {items.map((o, i) => (
        <OverlayItem key={i} o={o} project={project} />
      ))}
    </g>
  );
}

function OverlayItem({ o, project }: { o: Overlay; project: (p: number[]) => Pt2 }) {
  if (o.kind === "vector") {
    const p0 = project(o.from ?? ORIGIN);
    const p1 = project(o.to);
    return (
      <g>
        <line
          x1={p0.x}
          y1={p0.y}
          x2={p1.x}
          y2={p1.y}
          stroke={o.color}
          strokeWidth={o.width ?? 2.2}
          strokeDasharray={o.dashed ? "5 4" : undefined}
          markerEnd={`url(#${markerId(o.color)})`}
        />
        {o.label && (
          <text x={p1.x + 7} y={p1.y - 6} fill={o.color} fontFamily="var(--mono)" fontSize="12.5" fontWeight={600}>
            {o.label}
          </text>
        )}
      </g>
    );
  }
  if (o.kind === "segment") {
    const a = project(o.a);
    const b = project(o.b);
    return (
      <g>
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={o.color}
          strokeWidth={o.width ?? 1.5}
          strokeDasharray={o.dashed ? "4 4" : undefined}
        />
        {o.label && (
          <text
            x={(a.x + b.x) / 2 + 6}
            y={(a.y + b.y) / 2 - 4}
            fill={o.color}
            fontFamily="var(--mono)"
            fontSize="11.5"
          >
            {o.label}
          </text>
        )}
      </g>
    );
  }
  if (o.kind === "point") {
    const p = project(o.at);
    const r = o.r ?? 5;
    const shape = o.shape ?? "circle";
    return (
      <g>
        {shape === "diamond" ? (
          <polygon
            points={`${p.x},${p.y - r} ${p.x + r},${p.y} ${p.x},${p.y + r} ${p.x - r},${p.y}`}
            fill={o.color}
            stroke="#0f1117"
            strokeWidth={1.5}
          />
        ) : shape === "ring" ? (
          <circle cx={p.x} cy={p.y} r={r} fill="none" stroke={o.color} strokeWidth={2.2} />
        ) : (
          <circle cx={p.x} cy={p.y} r={r} fill={o.color} stroke="#0f1117" strokeWidth={1.5} />
        )}
        {o.label && (
          <text x={p.x + r + 3} y={p.y - r} fill={o.color} fontFamily="var(--mono)" fontSize="12">
            {o.label}
          </text>
        )}
      </g>
    );
  }
  // polygon
  const pts = o.pts.map(project);
  return (
    <polygon
      points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
      fill={o.fill ?? "none"}
      stroke={o.stroke}
      strokeWidth={1.5}
      strokeDasharray={o.dashed ? "4 4" : undefined}
      strokeLinejoin="round"
    />
  );
}
