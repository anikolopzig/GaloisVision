import type { Lattice, SubgroupNode } from "../../math/groups";

type Props = {
  lattice: Lattice;
  groupOrder: number;
  onHover?: (node: SubgroupNode | null) => void;
};

// Layered Hasse diagram: y by group order (log-spaced), x evenly within each layer.
export function SubgroupLattice({ lattice, groupOrder }: Props) {
  if (lattice.nodes.length === 0) {
    return <div className="section-note">Subgroup lattice not available for this group.</div>;
  }
  // Group nodes by order.
  const byOrder = new Map<number, SubgroupNode[]>();
  for (const n of lattice.nodes) {
    const a = byOrder.get(n.order) ?? [];
    a.push(n);
    byOrder.set(n.order, a);
  }
  const orders = [...byOrder.keys()].sort((a, b) => a - b);

  const W = 420;
  const rowH = 92;
  const H = Math.max(160, orders.length * rowH + 20);

  // Map order → y. Lowest order at bottom, top group at top.
  const yOf = new Map<number, number>();
  orders.forEach((o, i) => {
    yOf.set(o, H - 30 - (i * (H - 60)) / Math.max(1, orders.length - 1));
  });

  // Assign x per node within its layer.
  const pos = new Map<string, { x: number; y: number }>();
  for (const ord of orders) {
    const layer = byOrder.get(ord)!;
    const k = layer.length;
    for (let i = 0; i < k; i++) {
      const x = (W * (i + 1)) / (k + 1);
      pos.set(layer[i].id, { x, y: yOf.get(ord)! });
    }
  }

  return (
    <div className="lattice" style={{ height: H + 20 }}>
      <svg width={W} height={H} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
        {lattice.edges.map(([from, to], i) => {
          const a = pos.get(from)!;
          const b = pos.get(to)!;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--border-strong)"
              strokeWidth={1.3}
            />
          );
        })}
      </svg>
      {lattice.nodes.map((n) => {
        const p = pos.get(n.id)!;
        const idx = groupOrder / n.order;
        return (
          <div
            key={n.id}
            className="lattice-node"
            style={{ left: p.x, top: p.y, maxWidth: 180 }}
            title={`${n.prettyName} — order ${n.order}, index ${idx} in G`}
          >
            <div className="nm">{n.prettyName}</div>
            <div className="ord">|H| = {n.order}, [G:H] = {idx}</div>
            {n.fixedField && <div className="ff">K^H = {n.fixedField}</div>}
          </div>
        );
      })}
    </div>
  );
}
