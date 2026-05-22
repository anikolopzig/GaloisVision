import { useEffect, useMemo, useState } from "react";
import {
  parseComponent,
  toNumVec,
  embed3,
  latticePoints,
  type RVec,
  type Vec3,
} from "../../math/lattice";
import { gaussReduce, type GaussStep } from "../../math/svp-cvp";
import { format as fmtRat, toNumber, ZERO } from "../../math/rational";
import { normText } from "./format";
import { BasisInput, type BasisPreset } from "../shared/BasisInput";
import { LatticePlot2D } from "../shared/LatticePlot2D";
import type { Overlay } from "../shared/Overlays";
import { PLOT_COLORS, BASIS_COLORS } from "../shared/palette";

const PRESETS: BasisPreset[] = [
  { label: "Skewed (4-step)", dim: 2, vectors: [["2", "5"], ["3", "7"]], hint: "needs several swaps & reductions" },
  { label: "Mild skew", dim: 2, vectors: [["1", "2"], ["3", "4"]] },
  { label: "Long & thin", dim: 2, vectors: [["1", "0"], ["7", "1"]] },
  { label: "Already reduced", dim: 2, vectors: [["1", "0"], ["0", "1"]] },
  { label: "Oblique", dim: 2, vectors: [["2", "0"], ["1", "2"]] },
];

const DEFAULT: string[][] = [["2", "5"], ["3", "7"]];

export function GaussPanel() {
  const [vectors, setVectors] = useState<string[][]>(DEFAULT.map((v) => v.slice()));
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  function resetTrace() {
    setStepIndex(0);
    setPlaying(false);
  }
  function changeComponent(_kind: "vector" | "target", vi: number, ci: number, value: string) {
    setVectors((vs) => vs.map((v, i) => (i === vi ? v.map((c, j) => (j === ci ? value : c)) : v)));
    resetTrace();
  }
  function loadPreset(p: BasisPreset) {
    setVectors(p.vectors.map((v) => v.slice()));
    resetTrace();
  }

  const parsed = useMemo(() => {
    try {
      const b1 = vectors[0].map((s) => (s.trim() === "" ? ZERO : parseComponent(s)));
      const b2 = vectors[1].map((s) => (s.trim() === "" ? ZERO : parseComponent(s)));
      return { b1, b2 };
    } catch {
      return null;
    }
  }, [vectors]);

  const result = useMemo(() => (parsed ? gaussReduce(parsed.b1, parsed.b2) : null), [parsed]);

  // Autoplay: advance one step per tick while playing (idles at the last step).
  useEffect(() => {
    if (!playing || !result) return;
    const id = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, result.steps.length - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [playing, result]);

  const plot = useMemo(() => {
    if (!parsed || !result) return null;
    const b1n = toNumVec(result.reducedB1);
    const b2n = toNumVec(result.reducedB2);
    const nz = (v: number[]) => Math.hypot(v[0], v[1]) > 1e-9;
    const basis3: Vec3[] = [];
    if (nz(b1n)) basis3.push(embed3(b1n));
    if (nz(b2n)) basis3.push(embed3(b2n));
    const rank = basis3.length;
    const lens = [b1n, b2n, toNumVec(parsed.b1), toNumVec(parsed.b2)]
      .map((v) => Math.hypot(v[0], v[1]))
      .filter((l) => l > 1e-9);
    const maxLen = lens.length ? Math.max(...lens) : 1;
    const minLen = lens.length ? Math.min(...lens) : 1;
    const viewRadius = Math.max(maxLen * 1.7, 2);
    const n = Math.min(40, Math.ceil(viewRadius / Math.max(minLen, 1e-6)) + 1);
    const points = latticePoints(basis3, rank, n, viewRadius).map((p) => ({ x: p[0], y: p[1] }));
    return { points, viewRadius };
  }, [parsed, result]);

  if (!parsed || !result) {
    return (
      <div className="lattice-layout">
        <div className="lattice-left">
          <BasisInput
            dim={2}
            vectors={vectors}
            colors={BASIS_COLORS}
            onChange={changeComponent}
            presets={PRESETS}
            onLoadPreset={loadPreset}
          />
          <div className="error-banner">A basis component is unreadable. Use integers, fractions, or decimals.</div>
        </div>
      </div>
    );
  }

  const idx = Math.min(stepIndex, result.steps.length - 1);
  const step = result.steps[idx];
  const overlays = buildOverlays(step);

  return (
    <div className="lattice-layout">
      <div className="lattice-left">
        <BasisInput
          dim={2}
          vectors={vectors}
          colors={BASIS_COLORS}
          onChange={changeComponent}
          presets={PRESETS}
          onLoadPreset={loadPreset}
        />

        <div className="card">
          <h3>
            Step {idx + 1} / {result.steps.length} — {stepTitle(step)}
          </h3>
          <p className="step-note">{step.note}</p>
          <div className="facts">
            {step.kind === "swap" && (
              <>
                <Fact label="‖b₁‖²" value={fmtRat(step.b1NormSq)} />
                <Fact label="‖b₂‖²" value={fmtRat(step.b2NormSq)} />
              </>
            )}
            {step.kind === "reduce" && (
              <>
                <Fact label="⟨b₁,b₁⟩" value={fmtRat(step.b1NormSq)} />
                <Fact label="⟨b₁,b₂⟩" value={fmtRat(step.ip)} />
                <Fact label="μ = ⟨b₁,b₂⟩/⟨b₁,b₁⟩" value={`${fmtRat(step.mu)} ≈ ${toNumber(step.mu).toFixed(3)}`} />
                <Fact label="m = round(μ)" value={String(step.m)} />
              </>
            )}
            {step.kind === "done" && (
              <>
                <Fact label="μ" value={`${fmtRat(step.mu)} ≈ ${toNumber(step.mu).toFixed(3)}`} />
                <Fact label="‖b₁‖" value={normText(step.b1NormSq)} />
              </>
            )}
          </div>

          <div className="plot-controls" style={{ marginTop: 14 }}>
            <button className="btn secondary" onClick={() => { setStepIndex((i) => Math.max(0, i - 1)); setPlaying(false); }} disabled={idx === 0}>
              ‹ Prev
            </button>
            <button className="btn secondary" onClick={() => { setStepIndex((i) => Math.min(result.steps.length - 1, i + 1)); setPlaying(false); }} disabled={idx >= result.steps.length - 1}>
              Next ›
            </button>
            <button className={`btn secondary${playing ? " active" : ""}`} onClick={() => { if (!playing && idx >= result.steps.length - 1) setStepIndex(0); setPlaying((p) => !p); }}>
              {playing ? "❚❚ Pause" : "▶ Play"}
            </button>
            <button className="btn secondary" onClick={resetTrace}>Reset</button>
          </div>
        </div>

        <div className="card">
          <h3>Result</h3>
          <div className="msg msg-good">
            Shortest vector b₁ = ({result.reducedB1.map(fmtRat).join(", ")}), ‖b₁‖ = {normText(result.b1NormSq)}.
          </div>
          <div className="facts" style={{ marginTop: 10 }}>
            <Fact label="Reduced b₁" value={`(${result.reducedB1.map(fmtRat).join(", ")})`} />
            <Fact label="Reduced b₂" value={`(${result.reducedB2.map(fmtRat).join(", ")})`} />
            <Fact label="Angle ∠(b₁,b₂)" value={angleText(result.reducedB1, result.reducedB2)} />
          </div>
          {result.degenerate && (
            <div className="msg msg-warn">The two vectors are linearly dependent — they do not span a 2-D lattice.</div>
          )}
          <p className="section-note">
            A reduced basis has |μ| ≤ ½ and an angle in [60°, 120°]; then b₁ is provably the shortest nonzero lattice vector.
          </p>
        </div>
      </div>

      <div className="card lattice-right">
        <div className="plot2d-wrap">
          {plot && <LatticePlot2D points={plot.points} overlays={overlays} viewRadius={plot.viewRadius} />}
        </div>
        <div className="plot-legend">
          <span className="legend-line"><span className="swatch" style={{ background: PLOT_COLORS.b1 }} />b₁ (current shortest)</span>
          <span className="legend-line"><span className="swatch" style={{ background: PLOT_COLORS.b2 }} />b₂</span>
          <span className="legend-line"><span className="swatch" style={{ background: PLOT_COLORS.ghost }} />projection m·b₁ / new b₂</span>
        </div>
      </div>
    </div>
  );
}

function buildOverlays(step: GaussStep): Overlay[] {
  const ov: Overlay[] = [];
  const n2 = (v: RVec) => [toNumber(v[0]), toNumber(v[1])];
  if (step.kind === "swap") {
    ov.push({ kind: "vector", to: n2(step.b1), color: PLOT_COLORS.b1, label: "b₁" });
    ov.push({ kind: "vector", to: n2(step.b2), color: PLOT_COLORS.b2, label: "b₂" });
  } else if (step.kind === "reduce") {
    const b1 = n2(step.b1);
    const oldB2 = n2(step.oldB2);
    const newB2 = n2(step.newB2);
    const proj = n2(step.proj);
    ov.push({ kind: "vector", to: b1, color: PLOT_COLORS.b1, label: "b₁" });
    ov.push({ kind: "vector", to: oldB2, color: PLOT_COLORS.b2, label: "b₂" });
    ov.push({ kind: "segment", a: [0, 0], b: proj, color: PLOT_COLORS.ghost, dashed: true });
    ov.push({ kind: "point", at: proj, color: PLOT_COLORS.ghost, shape: "ring", label: `${step.m}·b₁` });
    ov.push({ kind: "segment", a: oldB2, b: newB2, color: PLOT_COLORS.ghost, dashed: true });
    ov.push({ kind: "vector", to: newB2, color: PLOT_COLORS.b2, dashed: true, label: "b₂′" });
  } else {
    const b1 = n2(step.b1);
    const b2 = n2(step.b2);
    ov.push({ kind: "polygon", pts: [[0, 0], b1, [b1[0] + b2[0], b1[1] + b2[1]], b2], stroke: PLOT_COLORS.cell, fill: "rgba(255,217,102,0.12)" });
    ov.push({ kind: "vector", to: b1, color: PLOT_COLORS.b1, label: "b₁", width: 2.8 });
    ov.push({ kind: "vector", to: b2, color: PLOT_COLORS.b2, label: "b₂" });
  }
  return ov;
}

function stepTitle(step: GaussStep): string {
  if (step.kind === "swap") return "swap";
  if (step.kind === "reduce") return "reduce b₂";
  return "done";
}

function angleText(b1: RVec, b2: RVec): string {
  const a = [toNumber(b1[0]), toNumber(b1[1])];
  const b = [toNumber(b2[0]), toNumber(b2[1])];
  const la = Math.hypot(a[0], a[1]);
  const lb = Math.hypot(b[0], b[1]);
  if (la < 1e-9 || lb < 1e-9) return "—";
  const cos = Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / (la * lb)));
  return `${((Math.acos(cos) * 180) / Math.PI).toFixed(1)}°`;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
