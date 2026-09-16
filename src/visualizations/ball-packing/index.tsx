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
  radiusSearch,
  randomLayout,
  relax,
  totalOverlapArea,
  walkSat,
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
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

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
    setActionNote(null);
  }

  function applyLayout(mode: LayoutMode) {
    const d = domainOf(settings);
    setActionNote(null);
    setBalls(mode === "random" ? randomLayout(settings.n, d, Math.random) : gridLayout(settings.n, d));
  }

  function search() {
    const d = domainOf(settings);
    const r = walkSat({ balls, ...d }, Math.random, { noise: settings.noise });
    setBalls(r.balls);
    if (r.solved) {
      setActionNote(
        r.initialViolations === 0
          ? `WalkSAT had nothing to fix — no pair was overlapping to begin with.`
          : `WalkSAT cleared all ${plural(r.initialViolations, "overlapping pair")} in ${plural(r.steps, "step")}.`,
      );
    } else {
      setActionNote(
        `WalkSAT ran ${plural(r.steps, "step")} and got from ${r.initialViolations} to ${plural(r.violations, "overlapping pair")} — the best arrangement it passed through. ` +
          (report.forcedOverlap
            ? `Zero is out of reach here: pigeonhole forces an overlap at this radius.`
            : `Run it again, or try a different noise p — the search is randomised, so a second run explores elsewhere.`),
      );
    }
  }

  /**
   * Bisect for the largest radius n balls can be packed at, yielding to the
   * browser between attempts. A whole search is seconds of arithmetic at n = 48,
   * which is a frozen page if it runs in one go, and the bracket narrowing is
   * worth watching anyway.
   */
  async function findRadius() {
    if (searching) return;
    const { side, geometry, confine } = settings;
    // What "fits" means here is the domain's business, and the three answers
    // differ enough that the note has to say which one it found.
    const where = confine
      ? "packed wholly inside the square"
      : geometry === "torus"
        ? "on the torus"
        : "with centres in the square, balls free to overhang";

    if (n < 2) {
      setActionNote(
        confine || geometry === "torus"
          ? `One ball has nothing to overlap but itself, so there is nothing to bisect: ${geometry === "torus" ? "it meets its own image" : "it leaves the square"} once r passes L/2 = ${num(side / 2)}.`
          : `One ball has nothing to overlap and may overhang the square, so there is no largest r to find. Add a second ball, or keep whole balls inside the walls.`,
      );
      return;
    }

    setSearching(true);
    const d = { side, geometry, confine };
    try {
      const it = radiusSearch(n, d, Math.random, { noise: settings.noise });
      for (let s = it.next(); ; s = it.next()) {
        if (s.done) {
          const r = s.value;
          update({ radius: r.radius });
          setBalls(r.balls);
          setActionNote(
            `Largest r for ${plural(n, "ball")} ${where}: ${num(r.radius)}, a diameter of ${num(2 * r.radius)}. ` +
              `WalkSAT packed that and failed at ${num(r.failedAt)}, so the true answer is at least ${num(r.radius)} — a failed probe is the search giving up, not a proof. ` +
              `${plural(r.probes.length, "probe")} bisected ${num(r.bracket.lo)} to ${num(r.bracket.hi)}, and only those two ends are proved: a ${r.bracket.m}×${r.bracket.m} grid packs the lower one, pigeonhole on ${r.bracket.k}² cells forbids the upper.`,
          );
          break;
        }
        setActionNote(
          `Searching… the answer is between ${num(s.value.lo)} and ${num(s.value.hi)} after ${plural(s.value.probes.length, "probe")}.`,
        );
        await new Promise((res) => setTimeout(res, 0));
      }
    } finally {
      setSearching(false);
    }
  }

  function separate(sweeps: number) {
    setActionNote(null);
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
    setActionNote(p.note);
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
        Put <strong>n</strong> balls of radius <strong>r</strong> over a square or torus of side <strong>L</strong> and
        see overlapping area in <strong style={{ color: "var(--error)" }}>red</strong>.
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
              <strong>Some pair must overlap.</strong> Pigeonhole forces it for any r above {num(report.forcedRadius)},
              whatever the arrangement; see below. ({plural(analysis.pairs, "overlapping pair")} here — whether that is
              the fewest possible is a different question, and not one pigeonhole answers.)
            </div>
          ) : null}
          {actionNote && <div className="msg msg-info">{actionNote}</div>}

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

          <Controls
            settings={settings}
            onChange={update}
            onLayout={applyLayout}
            onSeparate={separate}
            onSearch={search}
            onFindRadius={findRadius}
            busy={searching}
          />

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
