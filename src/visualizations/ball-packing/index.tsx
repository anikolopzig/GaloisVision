import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  bestK,
  contacts,
  gridLayout,
  hexLayout,
  minCentreDistance,
  normalizeCentre,
  overlappingBalls,
  overlappingPairCount,
  packingDensity,
  pigeonhole,
  randomLayout,
  relax,
  scatterLayout,
  totalOverlapArea,
  type Ball,
  type Domain,
  type LayoutMode,
  type Packing,
} from "../../math/packing";
import { Controls } from "./Controls";
import { PackingPlot } from "./PackingPlot";
import { PigeonholePanel } from "./PigeonholePanel";
import { num, pct, plural } from "./format";
import { ballEdge, ballFill } from "./palette";
import { DEFAULTS, PRESETS, domainOf, type Preset, type Settings } from "./settings";

function seed(p: Preset, d: Domain): Ball[] {
  if (p.centres) return p.centres.map(([x, y]) => normalizeCentre({ x: x * d.side, y: y * d.side }, d));
  const n = p.settings.n ?? DEFAULTS.n;
  if (p.layout === "hex") return hexLayout(n, d);
  if (p.layout === "scatter") return scatterLayout(n, d, Math.random).balls;
  return gridLayout(n, d);
}

/** Grow or shrink a set of centres without disturbing the ones already placed. */
function resize(prev: Ball[], n: number, d: Domain): Ball[] {
  if (n <= prev.length) return prev.slice(0, n);
  const out = prev.slice();
  while (out.length < n) out.push(normalizeCentre({ x: Math.random() * d.side, y: Math.random() * d.side }, d));
  return out;
}

export function BallPackingVisualization() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [balls, setBalls] = useState<Ball[]>(() => gridLayout(DEFAULTS.n, domainOf(DEFAULTS)));
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [scatterNote, setScatterNote] = useState<string | null>(null);

  const domain = domainOf(settings);
  const packing: Packing = { balls, ...domain };
  const n = balls.length;

  const analysis = useMemo(() => {
    const cs = contacts(packing);
    const perBall = new Array<number>(n).fill(0);
    const partners: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
    for (const c of cs) {
      perBall[c.i] += c.area;
      partners[c.i].add(c.j);
      if (c.i !== c.j) {
        perBall[c.j] += c.area;
        partners[c.j].add(c.i);
      }
    }
    return {
      contacts: cs,
      pairs: overlappingPairCount(cs),
      selfOverlap: cs.some((c) => c.i === c.j),
      guilty: overlappingBalls(cs),
      area: totalOverlapArea(cs),
      perBall,
      partners,
      closest: minCentreDistance(packing),
      density: packingDensity(packing),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balls, settings.radius, settings.side, settings.geometry, settings.confine]);

  const effectiveK = settings.autoK ? Math.max(1, bestK(n)) : Math.max(1, settings.k);
  const report = useMemo(() => pigeonhole(packing, effectiveK), [balls, effectiveK, settings.radius, settings.side]); // eslint-disable-line react-hooks/exhaustive-deps

  function update(patch: Partial<Settings>) {
    const next = { ...settings, ...patch };
    const d = domainOf(next);
    setSettings(next);
    setBalls((prev) => {
      let bs = prev;
      if (patch.side !== undefined && settings.side > 0 && patch.side !== settings.side) {
        const f = patch.side / settings.side;
        bs = bs.map((b) => ({ x: b.x * f, y: b.y * f }));
      }
      if (patch.n !== undefined && patch.n !== bs.length) bs = resize(bs, patch.n, d);
      return bs.map((b) => normalizeCentre(b, d));
    });
    if (patch.n !== undefined && selected !== null && selected >= patch.n) setSelected(null);
    setScatterNote(null);
  }

  function applyLayout(mode: LayoutMode) {
    const d = domainOf(settings);
    if (mode === "scatter") {
      const { balls: bs, placed } = scatterLayout(settings.n, d, Math.random);
      setBalls(bs);
      setScatterNote(
        placed < settings.n
          ? `Random search placed ${placed} of ${settings.n} balls without overlap before giving up. Strong evidence that this radius is too big — but only the pigeonhole bound below actually proves it.`
          : null,
      );
      return;
    }
    setScatterNote(null);
    setBalls(
      mode === "hex"
        ? hexLayout(settings.n, d)
        : mode === "random"
          ? randomLayout(settings.n, d, Math.random)
          : gridLayout(settings.n, d),
    );
  }

  function separate(sweeps: number) {
    setScatterNote(null);
    const d = domainOf(settings);
    setBalls((prev) => {
      let bs = prev;
      for (let i = 0; i < sweeps; i++) bs = relax({ balls: bs, ...d });
      return bs;
    });
  }

  function applyPreset(p: Preset) {
    const next: Settings = { ...DEFAULTS, ...p.settings };
    setSettings(next);
    setBalls(seed(p, domainOf(next)));
    setSelected(null);
    setHovered(null);
    setScatterNote(p.note);
  }

  function moveBall(i: number, x: number, y: number) {
    setBalls((prev) => prev.map((b, idx) => (idx === i ? normalizeCentre({ x, y }, domainOf(settings)) : b)));
  }

  const highlight = hovered ?? selected;
  const safeRadius = analysis.closest ? analysis.closest.dist / 2 : Infinity;
  // Tangent, not merely clear: an exactly tight packing has nothing to spare.
  const tangent =
    analysis.closest !== null && settings.radius > 0 && Math.abs(safeRadius - settings.radius) <= settings.radius * 1e-6;
  const ballArea = n * Math.PI * settings.radius * settings.radius;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
        <Link to="/" className="mono" style={{ color: "var(--text-muted)" }}>
          ← back
        </Link>
        <h1 style={{ margin: 0 }}>Balls in a square, and on a torus</h1>
      </div>
      <p>
        Put <strong>n</strong> balls of radius <strong>r</strong> over a square of side <strong>L</strong> and see what
        has to give. Every ball has its own colour, so the area painted in that colour is the area that ball alone
        covers; anything <strong style={{ color: "var(--error)" }}>red</strong> is shared by two or more balls. Drag a
        ball to move it. Switch the square for a torus and the edges are glued, so a ball leaving one side comes back in
        on the other.
      </p>

      <div className="examples" style={{ marginBottom: 4 }}>
        {PRESETS.map((p) => (
          <button key={p.label} className="chip" onClick={() => applyPreset(p)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="pack-layout">
        <div className="pack-plot">
          <PackingPlot
            packing={packing}
            highlight={highlight}
            showGhosts={settings.showGhosts}
            showLabels={settings.showLabels}
            pigeonhole={settings.showPigeonhole ? report : null}
            onSelect={setSelected}
            onMove={moveBall}
          />
          <div className="plot-legend">
            <span className="legend-line">
              <span className="swatch" style={{ background: "var(--error)" }} />
              shared by two or more balls
            </span>
            {settings.geometry === "torus" && (
              <span className="legend-line">
                <span className="swatch" style={{ background: "transparent", border: "1px dashed var(--accent)" }} />
                wrapped image of a ball
              </span>
            )}
            {settings.showPigeonhole && (
              <span className="legend-line">
                <span className="swatch" style={{ background: "rgba(240, 184, 76, 0.5)" }} />
                cell holding two or more centres
              </span>
            )}
          </div>
        </div>

        <div className="pack-side">
          {analysis.pairs === 0 ? (
            <div className="msg msg-good">
              <strong>No overlaps.</strong> {plural(n, "ball")} of radius {num(settings.radius)}{" "}
              {n === 1 ? "sits" : "sit"} over this {settings.geometry === "torus" ? "torus" : "square"}
              {tangent ? (
                <>
                  {" "}
                  with nothing to spare: the closest two centres are exactly 2r = {num(2 * settings.radius)} apart, so
                  the arrangement is tangent and any larger radius would overlap.
                </>
              ) : (
                <>
                  {" "}
                  with room to spare — the closest two centres are {num(analysis.closest?.dist ?? 0)} apart, and
                  anything up to r = {num(safeRadius)} would still fit.
                </>
              )}
            </div>
          ) : analysis.selfOverlap ? (
            <div className="msg msg-warn">
              <strong>A ball meets its own image.</strong> 2r = {num(2 * settings.radius)} is wider than the side L ={" "}
              {num(settings.side)}, so on the torus every ball wraps right round and runs into itself. Moving balls
              cannot help — only r below L/2 = {num(settings.side / 2)} can.
              {analysis.pairs > 1 && ` (${plural(analysis.pairs, "overlapping pair")} in total.)`}
            </div>
          ) : report.forcedOverlap ? (
            <div className="msg msg-warn">
              <strong>{plural(analysis.pairs, "overlapping pair")}</strong> — and no arrangement can do better.
              Pigeonhole forces an overlap for any r above {num(report.forcedRadius)}; see below.
            </div>
          ) : (
            <div className="msg msg-info">
              <strong>{plural(analysis.pairs, "overlapping pair")}.</strong> Nothing forces this — try{" "}
              <em>Separate</em> or <em>Scatter</em>, or drag the balls apart by hand.
            </div>
          )}
          {scatterNote && <div className="msg msg-info">{scatterNote}</div>}

          <div className="facts">
            <div className="fact">
              <div className="label">Overlapping pairs</div>
              <div className="value">{analysis.pairs}</div>
            </div>
            <div className="fact">
              <div className="label">Shared area</div>
              <div className="value">
                {num(analysis.area)}{" "}
                <span style={{ color: "var(--text-muted)" }}>
                  ({ballArea > 0 ? pct(analysis.area / ballArea) : "0%"} of ball area)
                </span>
              </div>
            </div>
            <div className="fact">
              <div className="label">Closest centres</div>
              <div className="value">{analysis.closest ? num(analysis.closest.dist) : "—"}</div>
            </div>
            <div className="fact">
              <div className="label">Largest safe radius</div>
              <div className="value">{Number.isFinite(safeRadius) ? num(safeRadius) : "—"}</div>
            </div>
            <div className="fact">
              <div className="label">Coverage n·πr²/L²</div>
              <div className="value">{pct(analysis.density)}</div>
            </div>
            <div className="fact">
              <div className="label">Pigeonhole threshold</div>
              <div className="value">{n >= 2 ? num(report.forcedRadius) : "—"}</div>
            </div>
          </div>
          <p className="section-note">
            Shared area counts each overlapping pair separately, so a patch under three balls is counted three times;
            it is quoted as a share of the n·πr² the balls cover between them. Largest safe radius is half the closest
            centre distance: the biggest r these particular centres could carry.
          </p>

          <Controls settings={settings} onChange={update} onLayout={applyLayout} onSeparate={separate} />

          <div className="card" style={{ marginTop: 18 }}>
            <h3 style={{ marginTop: 0 }}>Balls</h3>
            <div className="pack-legend" onMouseLeave={() => setHovered(null)}>
              {balls.map((b, i) => (
                <button
                  key={i}
                  className={`pack-legend-row${selected === i ? " selected" : ""}`}
                  onMouseEnter={() => setHovered(i)}
                  onFocus={() => setHovered(i)}
                  onClick={() => setSelected(selected === i ? null : i)}
                >
                  <span
                    className="vec-swatch"
                    style={{ background: ballFill(i), borderColor: ballEdge(i), borderRadius: "50%" }}
                  />
                  <span className="pack-legend-name mono">{i + 1}</span>
                  <span className="pack-legend-pos mono">
                    ({num(b.x, 3)}, {num(b.y, 3)})
                  </span>
                  {analysis.guilty.has(i) ? (
                    <span className="pack-legend-flag overlapping">
                      {analysis.partners[i].has(i) && analysis.partners[i].size === 1
                        ? "meets itself"
                        : `overlaps ${analysis.partners[i].size}`}
                    </span>
                  ) : (
                    <span className="pack-legend-flag">clear</span>
                  )}
                </button>
              ))}
            </div>
            <p className="section-note">Hover to isolate a ball in the picture; click to keep it isolated.</p>
          </div>
        </div>
      </div>

      <PigeonholePanel
        packing={packing}
        report={report}
        settings={settings}
        onChange={update}
        overlapping={analysis.pairs}
      />
    </div>
  );
}
