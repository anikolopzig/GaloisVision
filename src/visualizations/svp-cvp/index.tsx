import { useState } from "react";
import { Link } from "react-router-dom";
import { GaussPanel } from "./GaussPanel";
import { BabaiPanel } from "./BabaiPanel";

type Tab = "svp" | "cvp";

export function SvpCvpVisualization() {
  const [tab, setTab] = useState<Tab>("svp");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
        <Link to="/" className="mono" style={{ color: "var(--text-muted)" }}>
          ← back
        </Link>
        <h1 style={{ margin: 0 }}>Shortest &amp; closest vectors</h1>
      </div>
      <p>
        Two core lattice problems. <strong>SVP</strong>: the Gauss–Lagrange algorithm reduces a 2-D basis until its
        first vector is the shortest nonzero lattice vector. <strong>CVP</strong>: Babai's rounding finds an
        approximate closest lattice point to a target by rounding in basis coordinates.
      </p>

      <div className="tabs" role="tablist">
        <button className={`tab${tab === "svp" ? " active" : ""}`} role="tab" aria-selected={tab === "svp"} onClick={() => setTab("svp")}>
          Shortest vector — Gauss reduction (2D)
        </button>
        <button className={`tab${tab === "cvp" ? " active" : ""}`} role="tab" aria-selected={tab === "cvp"} onClick={() => setTab("cvp")}>
          Closest vector — Babai rounding (2D / 3D)
        </button>
      </div>

      {tab === "svp" ? <GaussPanel /> : <BabaiPanel />}
    </div>
  );
}
