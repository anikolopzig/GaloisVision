import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  analyzeLattice,
  parseComponent,
  toNumVec,
  embed3,
  isZeroVec,
  latticePoints,
  type RVec,
  type Vec3,
} from "../../math/lattice";
import { format as fmtRat, ZERO } from "../../math/rational";
import { sub } from "../../math/notation";
import { VectorInput, type Preset } from "./VectorInput";
import { LatticePlot3D, VEC_COLORS, type Arrow } from "./LatticePlot3D";

const MAX_VECTORS = 4;
const CANON_COLOR = "#ffd966";

const PRESETS: Preset[] = [
  { label: "ℤ² square", dim: 2, vectors: [["1", "0"], ["0", "1"]], hint: "(1,0),(0,1) — standard square lattice" },
  { label: "Shear", dim: 2, vectors: [["1", "0"], ["1", "1"]], hint: "(1,0),(1,1) — different basis, same covolume 1" },
  { label: "Rectangle", dim: 2, vectors: [["2", "0"], ["0", "1"]], hint: "(2,0),(0,1) — covolume 2" },
  { label: "Redundant", dim: 2, vectors: [["1", "0"], ["0", "1"], ["1", "1"]], hint: "3 generators, rank 2 — not a basis" },
  { label: "Hexagonal≈", dim: 2, vectors: [["1", "0"], ["0.5", "0.866"]], hint: "(1,0),(½,√3⁄2) — approximate triangular lattice" },
  { label: "ℤ³ cubic", dim: 3, vectors: [["1", "0", "0"], ["0", "1", "0"], ["0", "0", "1"]], hint: "simple cubic" },
  { label: "BCC", dim: 3, vectors: [["1", "0", "0"], ["0", "1", "0"], ["1/2", "1/2", "1/2"]], hint: "body-centred cubic, covolume 1/2" },
  { label: "FCC", dim: 3, vectors: [["1/2", "1/2", "0"], ["1/2", "0", "1/2"], ["0", "1/2", "1/2"]], hint: "face-centred cubic, covolume 1/4" },
  { label: "Shear 3D", dim: 3, vectors: [["1", "0", "0"], ["1", "1", "0"], ["1", "1", "1"]], hint: "covolume 1" },
];

const DEFAULT_DIM = 2;
const DEFAULT_VECTORS: string[][] = [["1", "0"], ["0", "1"]];

function resize(vec: string[], dim: number): string[] {
  const out = vec.slice(0, dim);
  while (out.length < dim) out.push("");
  return out;
}

export function LatticeVisualization() {
  const [dim, setDim] = useState(DEFAULT_DIM);
  const [vectors, setVectors] = useState<string[][]>(DEFAULT_VECTORS.map((v) => v.slice()));
  const [showPoints, setShowPoints] = useState(true);
  const [showCell, setShowCell] = useState(true);
  const [resetSignal, setResetSignal] = useState(0);

  function changeDim(d: number) {
    setDim(d);
    setVectors((vs) => vs.map((v) => resize(v, d)));
    setResetSignal((s) => s + 1);
  }
  function changeComponent(vi: number, ci: number, value: string) {
    setVectors((vs) => vs.map((v, i) => (i === vi ? v.map((c, j) => (j === ci ? value : c)) : v)));
  }
  function addVector() {
    setVectors((vs) => (vs.length >= MAX_VECTORS ? vs : [...vs, Array(dim).fill("")]));
  }
  function removeVector(vi: number) {
    setVectors((vs) => (vs.length <= 1 ? vs : vs.filter((_, i) => i !== vi)));
  }
  function loadPreset(p: Preset) {
    setDim(p.dim);
    setVectors(p.vectors.map((v) => v.slice()));
    setResetSignal((s) => s + 1);
  }

  // Parse vectors (empty component → 0). Components that fail to parse mark the
  // whole vector as errored and exclude it from the analysis.
  const parsed = useMemo(() => {
    const valid: RVec[] = [];
    let errored = 0;
    for (const vec of vectors) {
      try {
        const rv = Array.from({ length: dim }, (_, ci) => {
          const s = (vec[ci] ?? "").trim();
          return s === "" ? ZERO : parseComponent(s);
        });
        valid.push(rv);
      } catch {
        errored++;
      }
    }
    return { valid, errored };
  }, [vectors, dim]);

  const analysis = useMemo(() => analyzeLattice(parsed.valid, dim), [parsed, dim]);

  const plot = useMemo(() => {
    const rank = analysis.rank;
    const canon3: Vec3[] = analysis.canonicalBasis.map((b) => embed3(toNumVec(b)));
    const cell3: Vec3[] = analysis.independent
      ? parsed.valid.filter((v) => !isZeroVec(v)).map((v) => embed3(toNumVec(v)))
      : canon3;

    const lens = canon3.map((v) => Math.hypot(v[0], v[1], v[2])).filter((l) => l > 1e-9);
    const minLen = lens.length ? Math.min(...lens) : 1;
    const maxLen = lens.length ? Math.max(...lens) : 1;
    const cells = rank >= 3 ? 3.5 : 5;
    const viewRadius = Math.max(minLen * cells, maxLen * 1.4, 0.5);
    const n = Math.min(40, Math.ceil(viewRadius / Math.max(minLen, 1e-6)) + 1);
    const points = latticePoints(canon3, rank, n, viewRadius);

    const arrows: Arrow[] = [];
    parsed.valid.forEach((v, i) => {
      if (isZeroVec(v)) return;
      arrows.push({ vec: embed3(toNumVec(v)), label: `v${sub(i + 1)}`, color: VEC_COLORS[i % VEC_COLORS.length] });
    });
    if (!analysis.independent && rank > 0) {
      analysis.canonicalBasis.forEach((b, i) => {
        arrows.push({ vec: embed3(toNumVec(b)), label: `b${sub(i + 1)}`, color: CANON_COLOR, dashed: true });
      });
    }
    return { rank, cell3, viewRadius, points, arrows };
  }, [analysis, parsed]);

  const flat = analysis.rank <= 2;
  const initialAz = flat ? -0.35 : -0.65;
  const initialEl = flat ? 1.0 : 0.42;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
        <Link to="/" className="mono" style={{ color: "var(--text-muted)" }}>
          ← back
        </Link>
        <h1 style={{ margin: 0 }}>Lattice generated by vectors</h1>
      </div>
      <p>
        Enter up to three vectors (in 1, 2, or 3 dimensions) and see the lattice they generate — all
        of their integer combinations — drawn in 3-D, together with checks on whether they form a
        basis.
      </p>

      <div className="lattice-layout">
        <div className="lattice-left">
          <VectorInput
            dim={dim}
            vectors={vectors}
            maxVectors={MAX_VECTORS}
            onDimChange={changeDim}
            onChangeComponent={changeComponent}
            onAddVector={addVector}
            onRemoveVector={removeVector}
            presets={PRESETS}
            onLoadPreset={loadPreset}
          />

          <div className="card">
            <h3>Basis check</h3>
            {parsed.errored > 0 && (
              <div className="error-banner" style={{ marginTop: 0, marginBottom: 12 }}>
                {parsed.errored} vector{parsed.errored > 1 ? "s have" : " has"} an unreadable
                component and {parsed.errored > 1 ? "were" : "was"} ignored.
              </div>
            )}
            <div className="facts">
              <Fact label="Generators" value={String(analysis.enteredCount)} />
              <Fact label="Ambient dim" value={String(analysis.dim)} />
              <Fact label="Rank" value={String(analysis.rank)} />
              <Fact
                label="Lin. independent"
                value={analysis.independent ? "yes" : "no"}
                tone={analysis.independent ? "good" : "warn"}
              />
              <Fact
                label="Forms a basis"
                value={analysis.independent ? "yes" : "no"}
                tone={analysis.independent ? "good" : "warn"}
              />
              <Fact label="Covolume (det L)" value={covolumeText(analysis)} />
            </div>

            {analysis.messages.map((m, i) => (
              <div key={i} className={`msg msg-${m.kind}`}>
                {m.text}
              </div>
            ))}

            {analysis.canonicalBasis.length > 0 && (
              <>
                <h3 style={{ marginTop: 16 }}>
                  {analysis.independent ? "Lattice basis" : "Reduced lattice basis"}
                </h3>
                <div className="basis-list">
                  {analysis.canonicalBasis.map((b, i) => (
                    <div key={i} className="basis-item mono">
                      <span style={{ color: CANON_COLOR }}>b{sub(i + 1)}</span>
                      <span className="vec-eq"> = (</span>
                      {b.map((c) => fmtRat(c)).join(", ")}
                      <span className="vec-eq">)</span>
                    </div>
                  ))}
                </div>
                {!analysis.independent && (
                  <p className="section-note">
                    Your generators are redundant; the lattice they generate actually has the smaller
                    basis above (shown dashed in the plot).
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <div className="card lattice-right">
          <div className="plot-controls">
            <button className="btn secondary" onClick={() => setResetSignal((s) => s + 1)}>
              Reset view
            </button>
            <button
              className={`btn secondary${showPoints ? " active" : ""}`}
              onClick={() => setShowPoints((v) => !v)}
            >
              Lattice points
            </button>
            <button
              className={`btn secondary${showCell ? " active" : ""}`}
              onClick={() => setShowCell((v) => !v)}
            >
              Fundamental cell
            </button>
          </div>

          <LatticePlot3D
            key={`${resetSignal}:${initialAz}:${initialEl}`}
            points={plot.points}
            arrows={plot.arrows}
            cellBasis={plot.cell3}
            rank={plot.rank}
            dim={dim}
            viewRadius={plot.viewRadius}
            showCell={showCell}
            showPoints={showPoints}
            initialAz={initialAz}
            initialEl={initialEl}
          />

          <div className="plot-legend">
            <span className="legend-line">
              <span className="swatch" style={{ background: CANON_COLOR }} />
              origin & fundamental cell
            </span>
            <span className="legend-line">
              <span className="swatch" style={{ background: VEC_COLORS[0] }} />
              generator vectors
            </span>
            <span className="legend-line">drag to rotate · scroll to zoom</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  const color = tone === "good" ? "var(--accent)" : tone === "warn" ? "var(--warning)" : undefined;
  return (
    <div className="fact">
      <div className="label">{label}</div>
      <div className="value" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

function covolumeText(a: ReturnType<typeof analyzeLattice>): string {
  if (a.rank === 0) return "—";
  if (a.covolumeExact) return fmtRat(a.covolumeExact);
  if (a.covolumeSquared) return `√${fmtRat(a.covolumeSquared)} ≈ ${a.covolumeApprox.toFixed(4)}`;
  return a.covolumeApprox.toFixed(4);
}
