import { bestK, type Packing, type PigeonholeReport } from "../../math/packing";
import { NumberField, Toggle } from "./Controls";
import { num, plural } from "./format";
import { MAX_K, type Settings } from "./settings";

type Props = {
  packing: Packing;
  report: PigeonholeReport;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  /** How many pairs actually overlap right now, for the "is it forced?" verdict. */
  overlapping: number;
};

export function PigeonholePanel({ packing, report, settings, onChange, overlapping }: Props) {
  const { balls, radius, side, geometry } = packing;
  const n = balls.length;
  const k = report.k;
  const auto = bestK(n);

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2 style={{ marginTop: 0 }}>The pigeonhole argument</h2>
      <p>
        Cutting the square into cells turns "two balls must overlap" into "two centres must land in the same cell". The
        grid below is the argument; the grid in the picture is the same one, with the cells that actually hold two or
        more centres picked out.
      </p>

      <div className="pack-k-row">
        <Toggle
          label="Use the finest grid the argument allows"
          checked={settings.autoK}
          hint={n >= 2 ? `k = ${auto}` : "needs n ≥ 2"}
          onChange={(v) => onChange({ autoK: v, k: Math.max(1, auto) })}
        />
        {!settings.autoK && (
          <NumberField
            label="Grid divisions k"
            value={settings.k}
            min={1}
            max={MAX_K}
            step={1}
            decimals={0}
            onChange={(v) => onChange({ k: Math.round(v) })}
          />
        )}
      </div>

      <ol className="pack-steps">
        <li>
          Cut the square into a <strong>{k} × {k}</strong> grid, so there are <strong>k² = {report.cells}</strong> cells,
          each of side L/k = {num(side / k)}.
        </li>
        <li>
          There are <strong>n = {n}</strong> centres to distribute among {report.cells}{" "}
          {report.cells === 1 ? "cell" : "cells"}.{" "}
          {report.forcesSharedCell ? (
            <>
              Since {n} &gt; {report.cells}, <strong>some cell holds at least two centres</strong> — no arrangement can
              avoid it.
            </>
          ) : (
            <>
              Since {n} ≤ {report.cells}, the centres can be spread one to a cell, so this grid forces nothing. Use a
              coarser grid (smaller k) or more balls.
            </>
          )}
        </li>
        <li>
          Two points in one cell are at most a diagonal apart:{" "}
          <span className="mono">√2·L/k = {num(report.cellDiameter)}</span>.
        </li>
        <li>
          Two balls of radius r overlap exactly when their centres are closer than <span className="mono">2r</span>. So
          if <span className="mono">2r &gt; √2·L/k</span> — that is,{" "}
          <span className="mono">r &gt; √2·L/(2k) = {num(report.forcedRadius)}</span> — the two balls sharing that cell
          have to overlap.
        </li>
      </ol>

      {report.forcedOverlap ? (
        <div className="msg msg-warn">
          <strong>Overlap is forced.</strong> r = {num(radius)} is above the threshold {num(report.forcedRadius)}, and{" "}
          {n} centres cannot fit in {report.cells} {report.cells === 1 ? "cell" : "cells"} one apiece. No arrangement of{" "}
          {plural(n, "ball")} of this radius avoids an overlap — moving them around cannot help.
        </div>
      ) : report.forcesSharedCell ? (
        <div className="msg msg-info">
          Some cell does hold two centres, but r = {num(radius)} is{" "}
          {radius === report.forcedRadius ? "exactly at" : "below"} the threshold {num(report.forcedRadius)}, so two
          centres in one cell can still be far enough apart. The argument is silent here —{" "}
          {overlapping === 0 ? "and indeed nothing overlaps." : `the ${plural(overlapping, "overlapping pair")} on screen ${overlapping === 1 ? "is" : "are"} an accident of this arrangement, not a necessity.`}
        </div>
      ) : (
        <div className="msg msg-info">
          With k = {k} the argument concludes nothing:{" "}
          {n < 2 ? "there is only one ball" : `${n} centres fit in ${report.cells} cells without doubling up`}.
        </div>
      )}

      <p className="section-note">
        Right now {report.sharedCells.length === 0 ? "no cell holds" : `${plural(report.sharedCells.length, "cell")} hold${report.sharedCells.length === 1 ? "s" : ""}`}{" "}
        two or more centres.
        {geometry === "torus" && (
          <>
            {" "}
            The bound carries over to the torus unchanged: gluing the edges only ever brings points closer, so two
            centres in one cell are still at most √2·L/k apart.
          </>
        )}
      </p>
    </div>
  );
}
