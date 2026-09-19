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
import {
  normalizePattern,
  type MotionClass,
  type PatternSpec,
} from "../../math/patternShape";
import { ArrangementPanel } from "./ArrangementPanel";
import { Controls } from "./Controls";
import { GridBoard } from "./GridBoard";
import { ReductionPanel } from "./ReductionPanel";
import { SolverPanel } from "./SolverPanel";
import { MAX_PATTERN_POINTS, PRESETS, clampK, type PadPreset, type Preset } from "./limits";

type Tab = "explore" | "reduction";

/** Identifies a grid-and-shape pair, for caching what the solver has established about it. */
function configKey(n: number, shape: ShapeSpec): string {
  const base = `${n}|${shape.id}|${shape.allowCollinear ? "c" : ""}${shape.axisAligned ? "a" : ""}`;
  if (shape.id !== "pattern" || !shape.pattern) return base;
  // A drawn shape is part of the identity: redraw it and the threshold is a
  // different question, so the cached answer must not carry over.
  const pts = shape.pattern.points.map((p) => `${p.i}.${p.j}`).join("_");
  return `${base}|${shape.pattern.motions}|${pts}`;
}

export function GridForcingVisualization() {
  const [tab, setTab] = useState<Tab>("explore");
  const [n, setN] = useState(5);
  const [shapeBase, setShapeBase] = useState<ShapeSpec>(DEFAULT_SHAPE);
  // The pad is held as raw cells rather than a normalised pattern, so that
  // toggling one does not shift the others out from under the cursor.
  const [padSize, setPadSize] = useState(2);
  const [padCells, setPadCells] = useState<ReadonlySet<number>>(() => new Set([0, 2, 3]));
  const [motions, setMotions] = useState<MotionClass>("similar");
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

  const patternSpec = useMemo<PatternSpec>(
    () => ({
      points: normalizePattern([...padCells].map((c) => ({ i: Math.floor(c / padSize), j: c % padSize }))),
      motions,
    }),
    [padCells, padSize, motions],
  );
  const shape = useMemo<ShapeSpec>(
    () => (shapeBase.id === "pattern" ? { ...shapeBase, pattern: patternSpec } : shapeBase),
    [shapeBase, patternSpec],
  );

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
    const nextBase = { ...shapeBase, ...patch };
    setShapeBase(nextBase);
    const next = nextBase.id === "pattern" ? { ...nextBase, pattern: patternSpec } : nextBase;
    setK((prev) => clampK(prev, n, next));
    setShown(0);
    setPresetNote(null);
  }

  function togglePad(idx: number) {
    setPadCells((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else if (next.size < MAX_PATTERN_POINTS) next.add(idx);
      else return prev;
      return next;
    });
    setShown(0);
    setPresetNote(null);
  }

  function changePadSize(next: number) {
    // Same rule as the board: keep whatever still fits.
    setPadCells((prev) => {
      const out = new Set<number>();
      for (const idx of prev) {
        const i = Math.floor(idx / padSize);
        const j = idx % padSize;
        if (i < next && j < next) out.add(i * next + j);
      }
      return out;
    });
    setPadSize(next);
    setShown(0);
  }

  function applyPadPreset(p: PadPreset) {
    setPadSize(p.size);
    setPadCells(new Set(p.cells.map(([i, j]) => i * p.size + j)));
    setShown(0);
    setPresetNote(null);
  }

  function applyPreset(p: Preset) {
    setN(p.n);
    setShapeBase(p.shape);
    setK(clampK(p.k, p.n, p.shape));
    setSelected(new Set((p.cells ?? []).map(([i, j]) => cellIndex(p.n, i, j))));
    setShown(0);
    setPresetNote(p.note);
  }

  /**
   * Deal the dots already on the board to fresh cells. The count is whatever
   * the user built, not a number of our choosing — the point is to see how
   * differently the *same* number of dots can land.
   */
  function shuffleDots() {
    const m = n * n;
    const count = selected.size;
    if (count === 0 || count === m) return;
    const order = Array.from({ length: m }, (_, i) => i);
    for (let i = m - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
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
                pad={{
                  size: padSize,
                  cells: padCells,
                  motions,
                  copies: forbidden.length,
                  boardN: n,
                  onSize: changePadSize,
                  onToggle: togglePad,
                  onClear: () => setPadCells(new Set()),
                  onMotions: setMotions,
                  onPreset: applyPadPreset,
                }}
                onClear={() => place([])}
                onFill={() => place(Array.from({ length: n * n }, (_, i) => i))}
                onShuffle={shuffleDots}
                canShuffle={selected.size > 0 && selected.size < n * n}
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
