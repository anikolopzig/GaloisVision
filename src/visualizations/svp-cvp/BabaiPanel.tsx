import { useMemo, useState } from "react";
import {
  parseComponent,
  toNumVec,
  embed3,
  latticePoints,
  type RVec,
  type Vec3,
} from "../../math/lattice";
import { gaussReduce, babai } from "../../math/svp-cvp";
import { rat, format as fmtRat, ZERO } from "../../math/rational";
import { sub } from "../../math/notation";
import { normText } from "./format";
import { BasisInput, type BasisPreset } from "../shared/BasisInput";
import { LatticePlot2D } from "../shared/LatticePlot2D";
import { LatticePlot3D } from "../lattice/LatticePlot3D";
import type { Overlay } from "../shared/Overlays";
import { PLOT_COLORS, BASIS_COLORS } from "../shared/palette";

const PRESETS: BasisPreset[] = [
  { label: "Good basis (2D)", dim: 2, vectors: [["3", "1"], ["1", "3"]], target: ["4", "3"], hint: "near-orthogonal → Babai optimal" },
  { label: "Skewed → suboptimal", dim: 2, vectors: [["1", "0"], ["3", "1"]], target: ["3/2", "2/5"], hint: "Babai misses; reduce first" },
  { label: "ℤ² square", dim: 2, vectors: [["1", "0"], ["0", "1"]], target: ["2.4", "1.6"] },
  { label: "Long & thin (2D)", dim: 2, vectors: [["1", "0"], ["9", "1"]], target: ["3.5", "2.3"], hint: "dramatic skew → Babai badly suboptimal" },
  { label: "ℤ³ cubic", dim: 3, vectors: [["1", "0", "0"], ["0", "1", "0"], ["0", "0", "1"]], target: ["0.3", "0.6", "1.2"] },
  { label: "BCC (3D)", dim: 3, vectors: [["1", "0", "0"], ["0", "1", "0"], ["1/2", "1/2", "1/2"]], target: ["0", "0", "0.9"] },
  { label: "Skewed (3D)", dim: 3, vectors: [["1", "0", "0"], ["2", "1", "0"], ["0", "0", "1"]], target: ["1.4", "0.6", "0.5"] },
];

// Cap on rendered lattice points. The Babai geometry is recomputed on every
// render (including each drag frame), so this keeps both the computation and the
// SVG node count bounded enough to stay smooth.
const MAX_PLOT_POINTS = 2000;

export function BabaiPanel() {
  const [dim, setDim] = useState(2);
  const [vectors, setVectors] = useState<string[][]>([["3", "1"], ["1", "3"]]);
  const [target, setTarget] = useState<string[]>(["4", "3"]);
  const [useReduced, setUseReduced] = useState(false);
  const [showRoundingCell, setShowRoundingCell] = useState(true);
  const [viewSeed, setViewSeed] = useState(0);

  function changeComponent(kind: "vector" | "target", vi: number, ci: number, value: string) {
    if (kind === "target") setTarget((t) => t.map((c, j) => (j === ci ? value : c)));
    else setVectors((vs) => vs.map((v, i) => (i === vi ? v.map((c, j) => (j === ci ? value : c)) : v)));
  }
  function changeDim(d: number) {
    setDim(d);
    setVectors((vs) =>
      Array.from({ length: d }, (_, i) =>
        Array.from({ length: d }, (_, j) => vs[i]?.[j] ?? (i === j ? "1" : "0")),
      ),
    );
    setTarget((t) => Array.from({ length: d }, (_, j) => t[j] ?? "0"));
    setUseReduced(false);
    setViewSeed((s) => s + 1);
  }
  function loadPreset(p: BasisPreset) {
    setDim(p.dim);
    setVectors(p.vectors.map((v) => v.slice()));
    setTarget((p.target ?? Array(p.dim).fill("0")).slice());
    setUseReduced(false);
    setViewSeed((s) => s + 1);
  }
  function setTargetFromWorld(coords: number[]) {
    setTarget(coords.slice(0, dim).map((x) => fmtRat(rat(BigInt(Math.round(x * 10)), 10n))));
  }

  const parsed = useMemo(() => {
    try {
      const vs = vectors.map((v) => v.map((s) => (s.trim() === "" ? ZERO : parseComponent(s))));
      const t = target.map((s) => (s.trim() === "" ? ZERO : parseComponent(s)));
      return { vs, t };
    } catch {
      return null;
    }
  }, [vectors, target]);

  const computed = useMemo(() => {
    if (!parsed) return null;
    let basis = parsed.vs;
    if (dim === 2 && useReduced) {
      const g = gaussReduce(parsed.vs[0], parsed.vs[1]);
      basis = [g.reducedB1, g.reducedB2];
    }
    return { basis, result: babai(basis, parsed.t) };
  }, [parsed, dim, useReduced]);

  if (!parsed || !computed) {
    return (
      <div className="lattice-layout">
        <div className="lattice-left">
          <BabaiInput
            dim={dim}
            vectors={vectors}
            target={target}
            onChange={changeComponent}
            onDimChange={changeDim}
            onLoadPreset={loadPreset}
          />
          <div className="error-banner">A component is unreadable. Use integers, fractions, or decimals.</div>
        </div>
      </div>
    );
  }

  const { basis, result } = computed;
  const geom = buildGeometry(dim, basis, parsed.t, result, showRoundingCell);

  return (
    <div className="lattice-layout">
      <div className="lattice-left">
        <BabaiInput
          dim={dim}
          vectors={vectors}
          target={target}
          onChange={changeComponent}
          onDimChange={changeDim}
          onLoadPreset={loadPreset}
        />

        <div className="card">
          <h3>Babai rounding</h3>
          {result.detZero ? (
            <div className="msg msg-warn">The basis is degenerate (vectors are linearly dependent).</div>
          ) : (
            <>
              <div className="facts">
                <Fact label="Coords x = B⁻¹t" value={`(${result.x.map(fmtRat).join(", ")})`} />
                <Fact label="Rounded z = round(x)" value={`(${result.z.join(", ")})`} />
                <Fact label="Babai point v = Bz" value={`(${result.v.map(fmtRat).join(", ")})`} />
                <Fact label="‖t − v‖" value={normText(result.distSq)} />
                <Fact label="Closest v* (window)" value={`(${result.best.v.map(fmtRat).join(", ")})`} />
                <Fact label="‖t − v*‖" value={normText(result.best.distSq)} />
              </div>
              {result.babaiIsOptimal ? (
                <div className="msg msg-good">Babai found the closest lattice point.</div>
              ) : (
                <div className="msg msg-warn">
                  Babai is suboptimal here — the basis is skewed, so rounding in basis coordinates misses the
                  true closest point.
                </div>
              )}
            </>
          )}

          {dim === 2 ? (
            <button
              className={`btn secondary${useReduced ? " active" : ""}`}
              style={{ marginTop: 12 }}
              onClick={() => setUseReduced((v) => !v)}
            >
              {useReduced ? "✓ Using Gauss-reduced basis" : "Reduce basis with Gauss first"}
            </button>
          ) : (
            <p className="section-note">Gauss reduction is a 2-D algorithm; switch to 2D to try the “reduce first” comparison.</p>
          )}
          <p className="section-note">
            The solid grid is the lattice itself; the <strong>dashed violet lines</strong> are Babai's rounding-cell
            boundaries. The shaded cell is v's <strong>fundamental domain</strong> — every target inside it rounds to v,
            which is exactly why Babai returns v. These cells tile space, one centred on each lattice point. When the
            basis is skewed the cells are long and slanted, so t can sit inside v's cell yet be Euclidean-closer to a
            neighbour v* — that mismatch is Babai's error. Reducing the basis makes the cells rounder and the choice
            correct.
          </p>
          <p className="section-note">
            Drag the target point t on the plot to move it. v* is the nearest point within a bounded search window.
          </p>
        </div>
      </div>

      <div className="card lattice-right">
        <div className="plot-controls">
          <button
            className={`btn secondary${showRoundingCell ? " active" : ""}`}
            onClick={() => setShowRoundingCell((v) => !v)}
          >
            Rounding cell
          </button>
          {dim === 3 && (
            <button className="btn secondary" onClick={() => setViewSeed((s) => s + 1)}>
              Reset view
            </button>
          )}
        </div>
        <div className="plot2d-wrap">
          {dim === 2 ? (
            <LatticePlot2D
              points={geom.points2d}
              overlays={geom.overlays}
              backgroundOverlays={geom.bgOverlays}
              viewRadius={geom.viewRadius}
              showGrid={false}
              onPointerData={(p) => setTargetFromWorld([p.x, p.y])}
            />
          ) : (
            <LatticePlot3D
              key={`babai3d-${viewSeed}`}
              points={geom.points3d}
              arrows={[]}
              cellBasis={geom.basis3}
              rank={dim}
              dim={dim}
              viewRadius={geom.viewRadius}
              showCell={false}
              showPoints
              initialAz={-0.65}
              initialEl={0.42}
              overlays={geom.overlays}
              target={geom.targetVec3}
              onTargetDrag={(w) => setTargetFromWorld(w)}
              highlightCell={showRoundingCell && !result.detZero ? geom.cell3 : undefined}
            />
          )}
        </div>
        <div className="plot-legend">
          <span className="legend-line"><span className="swatch" style={{ background: PLOT_COLORS.target }} />target t</span>
          <span className="legend-line"><span className="swatch" style={{ background: PLOT_COLORS.babai }} />Babai v</span>
          <span className="legend-line"><span className="swatch" style={{ background: PLOT_COLORS.best }} />closest v*</span>
          <span className="legend-line">{dim === 2 ? "click / drag to move t" : "drag t · drag background to rotate"}</span>
        </div>
      </div>
    </div>
  );
}

function buildGeometry(dim: number, basis: RVec[], t: RVec, result: ReturnType<typeof babai>, showCell: boolean) {
  const basisNum = basis.map(toNumVec);
  const basis3 = basisNum.map(embed3);
  const tNum = toNumVec(t);
  const vNum = result.detZero ? tNum : toNumVec(result.v);
  const bestNum = result.detZero ? tNum : toNumVec(result.best.v);

  // View sizing: anchor the view to the basis (lattice), not the target. While the
  // target stays within the base view the zoom is fixed — so dragging near the origin
  // is steady and easy — and beyond it the view expands only gently and is hard-capped,
  // which prevents the drag→zoom-out→drag-further feedback loop from running away.
  const basisLens = basisNum.map((b) => Math.hypot(b[0], b[1] ?? 0, b[2] ?? 0));
  const basisMax = Math.max(...basisLens, 1);
  const baseRadius = Math.max(basisMax * 1.8, 2.5);
  // Hard-cap the zoom-out at ~5× the longest basis vector so the rendered point
  // count stays bounded (this runs every drag frame).
  const maxRadius = Math.max(basisMax * 5, baseRadius);
  const tDist = Math.hypot(tNum[0], tNum[1] ?? 0, tNum[2] ?? 0);
  // Hold the zoom fixed until the target is almost at the window edge (~95%), then
  // expand only gently (slope ~1.05) up to the cap, so dragging stays smooth.
  const edge = baseRadius * 0.95;
  const viewRadius = tDist <= edge ? baseRadius : Math.min(maxRadius, baseRadius + (tDist - edge) * 1.05);
  const minLen = Math.max(Math.min(...basisLens.filter((l) => l > 1e-9)), 0.5);
  const n = Math.min(25, Math.ceil(viewRadius / minLen) + 1);

  const pts = latticePoints(basis3, dim, n, viewRadius, MAX_PLOT_POINTS);
  const points3d = pts;
  const points2d = pts.map((p) => ({ x: p[0], y: p[1] }));

  const overlays: Overlay[] = [];
  const bgOverlays: Overlay[] = []; // grids, drawn beneath the lattice points

  if (dim === 2 && !result.detZero) {
    const b1 = basisNum[0];
    const b2 = basisNum[1];
    const G = 5;
    // Actual lattice grid: solid, bold lines that pass through the lattice points.
    for (let k = -G; k <= G; k++) {
      bgOverlays.push({ kind: "segment", a: [k * b1[0] - G * b2[0], k * b1[1] - G * b2[1]], b: [k * b1[0] + G * b2[0], k * b1[1] + G * b2[1]], color: "#5a6478", width: 2.4 });
      bgOverlays.push({ kind: "segment", a: [k * b2[0] - G * b1[0], k * b2[1] - G * b1[1]], b: [k * b2[0] + G * b1[0], k * b2[1] + G * b1[1]], color: "#5a6478", width: 2.4 });
    }
    if (showCell) {
      // Babai's rounding boundaries: dashed, translucent half-integer lines — the
      // decision boundaries, deliberately distinct from the solid lattice grid.
      // Lattice points sit at the centres of these cells.
      for (let k = -G; k <= G; k++) {
        const h = k + 0.5;
        bgOverlays.push({ kind: "segment", a: [h * b1[0] - G * b2[0], h * b1[1] - G * b2[1]], b: [h * b1[0] + G * b2[0], h * b1[1] + G * b2[1]], color: "rgba(168,153,255,0.4)", dashed: true });
        bgOverlays.push({ kind: "segment", a: [h * b2[0] - G * b1[0], h * b2[1] - G * b1[1]], b: [h * b2[0] + G * b1[0], h * b2[1] + G * b1[1]], color: "rgba(168,153,255,0.4)", dashed: true });
      }
      // v's rounding cell, centred on v: every target inside it rounds to v.
      overlays.push({
        kind: "polygon",
        pts: [
          [vNum[0] - 0.5 * b1[0] - 0.5 * b2[0], vNum[1] - 0.5 * b1[1] - 0.5 * b2[1]],
          [vNum[0] + 0.5 * b1[0] - 0.5 * b2[0], vNum[1] + 0.5 * b1[1] - 0.5 * b2[1]],
          [vNum[0] + 0.5 * b1[0] + 0.5 * b2[0], vNum[1] + 0.5 * b1[1] + 0.5 * b2[1]],
          [vNum[0] - 0.5 * b1[0] + 0.5 * b2[0], vNum[1] - 0.5 * b1[1] + 0.5 * b2[1]],
        ],
        stroke: PLOT_COLORS.babai,
        fill: "rgba(168,153,255,0.16)",
      });
    }
  }

  // basis vectors
  basisNum.forEach((b, i) => overlays.push({ kind: "vector", to: b, color: BASIS_COLORS[i % BASIS_COLORS.length], label: `b${sub(i + 1)}` }));

  if (!result.detZero) {
    overlays.push({ kind: "segment", a: tNum, b: vNum, color: PLOT_COLORS.babai, label: normText(result.distSq) });
    if (!result.babaiIsOptimal) {
      overlays.push({ kind: "segment", a: tNum, b: bestNum, color: PLOT_COLORS.best, dashed: true });
      overlays.push({ kind: "point", at: bestNum, color: PLOT_COLORS.best, shape: "ring", label: "v*" });
    }
    overlays.push({ kind: "point", at: vNum, color: PLOT_COLORS.babai, label: "v" });
  }
  overlays.push({ kind: "point", at: tNum, color: PLOT_COLORS.target, shape: "diamond", label: "t" });

  const targetVec3: Vec3 = embed3(tNum);
  const cell3 = { center: embed3(vNum), edges: basis3 };
  return { points2d, points3d, overlays, bgOverlays, viewRadius, basis3, targetVec3, cell3 };
}

function BabaiInput({
  dim,
  vectors,
  target,
  onChange,
  onDimChange,
  onLoadPreset,
}: {
  dim: number;
  vectors: string[][];
  target: string[];
  onChange: (kind: "vector" | "target", vi: number, ci: number, value: string) => void;
  onDimChange: (d: number) => void;
  onLoadPreset: (p: BasisPreset) => void;
}) {
  return (
    <BasisInput
      dim={dim}
      vectors={vectors}
      target={target}
      colors={BASIS_COLORS}
      targetColor={PLOT_COLORS.target}
      showDimToggle
      dims={[2, 3]}
      onChange={onChange}
      onDimChange={onDimChange}
      presets={PRESETS}
      onLoadPreset={onLoadPreset}
    />
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
