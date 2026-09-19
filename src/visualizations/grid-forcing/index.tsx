// Forcing a shape on a grid: draw arrangements, ask the solver where the
// threshold is, and read the reduction that turns the question into SAT.

import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  DEFAULT_SHAPE,
  bestGreedyAvoidingSet,
  buildFormula,
  cellIndex,
  describeOccurrence,
  findOccurrences,
  forbiddenSets,
  safeAdditions,
  shapeName,
  type ShapeSpec,
} from "../../math/gridForcing";
import { ArrangementPanel } from "./ArrangementPanel";
import { Controls } from "./Controls";
import { GridBoard } from "./GridBoard";
import { ReductionPanel } from "./ReductionPanel";
import { SolverPanel } from "./SolverPanel";
import { PRESETS, clampK, type Preset } from "./limits";

type Tab = "explore" | "reduction";

/** Identifies a grid-and-shape pair, for caching what the solver has established about it. */
function configKey(n: number, shape: ShapeSpec): string {
  return `${n}|${shape.id}|${shape.allowCollinear ? "c" : ""}${shape.axisAligned ? "a" : ""}`;
}

export function GridForcingVisualization() {
  const [tab, setTab] = useState<Tab>("explore");
  const [n, setN] = useState(5);
  const [shape, setShape] = useState<ShapeSpec>(DEFAULT_SHAPE);
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set<number>());
  const [k, setK] = useState(9);
  const [width3, setWidth3] = useState(true);
  const [showSafe, setShowSafe] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [shown, setShown] = useState(0);
  const [presetNote, setPresetNote] = useState<string | null>(null);
  // Thresholds the solver has established, kept per grid-and-shape so switching
  // back and forth does not throw the answer away.
  const [thresholds, setThresholds] = useState<Record<string, number>>({});

  const key = configKey(n, shape);
  const forbidden = useMemo(() => forbiddenSets(n, shape), [n, shape]);
  const occurrences = useMemo(() => findOccurrences(selected, forbidden), [selected, forbidden]);
  const shownIndex = occurrences.length === 0 ? 0 : shown % occurrences.length;
  const detail = useMemo(
    () => (occurrences.length === 0 ? null : describeOccurrence(n, shape, occurrences[shownIndex])),
    [occurrences, shownIndex, n, shape],
  );
  const safe = useMemo(
    () => (occurrences.length > 0 ? null : new Set(safeAdditions(n, selected, forbidden))),
    [occurrences.length, n, selected, forbidden],
  );
  const formula = useMemo(
    () => buildFormula(n, clampK(k, n, shape), shape, forbidden, width3),
    [n, k, shape, forbidden, width3],
  );

  const recordThreshold = useCallback(
    (value: number) => {
      setThresholds((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
    },
    [key],
  );

  function place(cells: readonly number[]) {
    setSelected(new Set(cells.filter((c) => c >= 0 && c < n * n)));
    setShown(0);
    setPresetNote(null);
  }

  function changeN(next: number) {
    // Keep whatever still fits, so nudging N up or down explores a family
    // rather than starting over.
    setSelected((prev) => {
      const out = new Set<number>();
      for (const idx of prev) {
        const i = Math.floor(idx / n);
        const j = idx % n;
        if (i < next && j < next) out.add(cellIndex(next, i, j));
      }
      return out;
    });
    setK((prev) => clampK(prev, next, shape));
    setN(next);
    setShown(0);
    setPresetNote(null);
  }

  function changeShape(patch: Partial<ShapeSpec>) {
    const next = { ...shape, ...patch };
    setShape(next);
    setK((prev) => clampK(prev, n, next));
    setShown(0);
    setPresetNote(null);
  }

  function applyPreset(p: Preset) {
    setN(p.n);
    setShape(p.shape);
    setK(clampK(p.k, p.n, p.shape));
    setSelected(new Set((p.cells ?? []).map(([i, j]) => cellIndex(p.n, i, j))));
    setShown(0);
    setPresetNote(p.note);
  }

  function randomFill() {
    const m = n * n;
    const order = Array.from({ length: m }, (_, i) => i);
    for (let i = m - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const count = Math.max(3, Math.round(m * 0.35));
    place(order.slice(0, count));
  }

  const threshold = thresholds[key] ?? null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
        <Link to="/" className="mono" style={{ color: "var(--text-muted)" }}>
          ← back
        </Link>
        <h1 style={{ margin: 0 }}>Forcing a shape on a grid</h1>
      </div>
      <p>
        On an <strong>N × N</strong> grid of dots, how many must you place before some of them are <em>guaranteed</em>{" "}
        to form a given shape? Place dots yourself and see whether you have made one; then let a SAT solver settle the
        threshold, by refuting the claim that any arrangement escapes.
      </p>

      <div className="tabs" role="tablist">
        <button
          className={`tab${tab === "explore" ? " active" : ""}`}
          role="tab"
          aria-selected={tab === "explore"}
          onClick={() => setTab("explore")}
        >
          Explore — place dots, find k*
        </button>
        <button
          className={`tab${tab === "reduction" ? " active" : ""}`}
          role="tab"
          aria-selected={tab === "reduction"}
          onClick={() => setTab("reduction")}
        >
          The reduction — and your formula
        </button>
      </div>

      {tab === "explore" ? (
        <>
          <div className="examples" style={{ marginBottom: 4 }}>
            {PRESETS.map((p) => (
              <button key={p.label} className="chip" onClick={() => applyPreset(p)}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="gf-layout">
            <div className="gf-plot">
              <GridBoard
                n={n}
                selected={selected}
                detail={detail}
                safe={safe}
                showSafe={showSafe && selected.size > 0}
                showLabels={showLabels}
                onToggle={(idx) =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(idx)) next.delete(idx);
                    else next.add(idx);
                    return next;
                  })
                }
                onPaint={(idx, on) =>
                  setSelected((prev) => {
                    if (prev.has(idx) === on) return prev;
                    const next = new Set(prev);
                    if (on) next.add(idx);
                    else next.delete(idx);
                    return next;
                  })
                }
              />
              <div className="plot-legend">
                <span className="legend-line">
                  <span className="swatch" style={{ background: "var(--accent)", borderRadius: "50%" }} />
                  dot placed
                </span>
                <span className="legend-line">
                  <span className="swatch" style={{ background: "var(--error)", borderRadius: "50%" }} />
                  corner of a copy of the shape
                </span>
                {showSafe && safe !== null && safe.size > 0 && (
                  <span className="legend-line">
                    <span
                      className="swatch"
                      style={{ background: "transparent", border: "1px dashed var(--accent)", borderRadius: "50%" }}
                    />
                    still safe to add
                  </span>
                )}
              </div>
              <p className="section-note" style={{ textAlign: "center" }}>
                Click a cell to place or remove a dot; drag across the board to paint a run of them.
              </p>
            </div>

            <div className="gf-controls-cell">
              <Controls
                n={n}
                shape={shape}
                configCount={forbidden.length}
                showSafe={showSafe}
                showLabels={showLabels}
                onN={changeN}
                onShape={changeShape}
                onShowSafe={setShowSafe}
                onShowLabels={setShowLabels}
                onClear={() => place([])}
                onFill={() => place(Array.from({ length: n * n }, (_, i) => i))}
                onRandom={randomFill}
                onGreedy={() => place(bestGreedyAvoidingSet(n, forbidden, 80))}
              />
            </div>

            <div className="gf-side">
              {presetNote && <div className="msg msg-info">{presetNote}</div>}
              <ArrangementPanel
                shape={shape}
                placed={selected.size}
                occurrenceCount={occurrences.length}
                shown={shownIndex}
                detail={detail}
                safeCount={safe ? safe.size : 0}
                threshold={threshold}
                onCycle={() => setShown((s) => s + 1)}
              />

              <div style={{ marginTop: 18 }}>
                <SolverPanel
                  key={`${key}|${width3}`}
                  n={n}
                  shape={shape}
                  forbidden={forbidden}
                  width3={width3}
                  k={clampK(k, n, shape)}
                  onK={(next) => setK(clampK(next, n, shape))}
                  onPlace={place}
                  onThreshold={recordThreshold}
                />
              </div>

            </div>
          </div>

          <p className="section-note">
            The board checks your arrangement against every one of the {forbidden.length.toLocaleString()} copies of
            the {shapeName(shape)} that fit in this grid — directly, with no solver involved. The solver is only needed
            for the other direction: showing that <em>no</em> arrangement of a given size escapes.
          </p>
        </>
      ) : (
        <ReductionPanel
          n={n}
          k={clampK(k, n, shape)}
          shape={shape}
          formula={formula}
          forbiddenCount={forbidden.length}
          width3={width3}
          onWidth3={setWidth3}
        />
      )}
    </div>
  );
}
