// The conjunction itself, for whichever N, k and shape are selected — not a
// description of it, the actual clause list the solver is handed.

import { useState } from "react";
import { clauseText, formulaToDimacs, shapeName, type Formula } from "../../math/gridForcing";

const FIRST_SHOWN = 8;
const MORE = 40;

function download(name: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function FormulaView({ formula, forbiddenCount }: { formula: Formula; forbiddenCount: number }) {
  const [shown, setShown] = useState<Record<string, number>>({});

  let counterVars = 0;
  let splitVars = 0;
  for (let v = 1; v <= formula.numVars; v++) {
    const role = formula.roles[v];
    if (role.kind === "counter") counterVars++;
    else if (role.kind === "split") splitVars++;
  }

  const { n, k } = formula;
  const dimacsName = `grid-${n}x${n}-${formula.shape.id}${formula.shape.axisAligned ? "-axis" : ""}-k${k}.cnf`;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Your instance: F({n}, {k})</h3>
      <p className="section-note" style={{ marginTop: 0 }}>
        The {n}×{n} grid, forbidding the {shapeName(formula.shape)}, asking for {k} cells. This is exactly the formula
        the <em>Explore</em> tab hands to the solver — same builder, same clause order.
      </p>

      <div className="gf-math mono">
        F<sub>{n},{k}</sub> = ⋀<sub>S ∈ E</sub> ( ⋁<sub>p ∈ S</sub> ¬x<sub>p</sub> ) ∧ atLeast({k})
      </div>

      <div className="facts">
        <div className="fact">
          <div className="label">Cells M = N²</div>
          <div className="value">{formula.numCells}</div>
        </div>
        <div className="fact">
          <div className="label">Copies of the shape |E|</div>
          <div className="value">{forbiddenCount.toLocaleString()}</div>
        </div>
        <div className="fact">
          <div className="label">Variables</div>
          <div className="value">{formula.numVars.toLocaleString()}</div>
        </div>
        <div className="fact">
          <div className="label">Clauses</div>
          <div className="value">{formula.clauses.length.toLocaleString()}</div>
        </div>
        <div className="fact">
          <div className="label">Widest clause</div>
          <div className="value">{formula.maxWidth}</div>
        </div>
        <div className="fact">
          <div className="label">Literals</div>
          <div className="value">{formula.clauses.reduce((a, c) => a + c.length, 0).toLocaleString()}</div>
        </div>
      </div>

      <h3 style={{ marginTop: 18 }}>What the variables mean</h3>
      <ul className="gf-legend">
        <li>
          <span className="mono">x(i,j)</span> — true when cell (i, j) carries a dot. {formula.numCells} of them, one
          per cell, in the order (0,0), (0,1), …, ({n - 1},{n - 1}).
        </li>
        <li>
          <span className="mono">s(i,j)</span> — "at least j of the first i cells carry a dot". {counterVars.toLocaleString()}{" "}
          of them: the sequential counter's bookkeeping.
        </li>
        {splitVars > 0 && (
          <li>
            <span className="mono">z</span> — one fresh variable per {shapeName(formula.shape)}, splitting its width-4
            clause into two width-3 clauses. {splitVars.toLocaleString()} of them.
          </li>
        )}
      </ul>

      {formula.sections.map((sec) => {
        const total = sec.end - sec.start;
        const limit = shown[sec.id] ?? FIRST_SHOWN;
        const visible = formula.clauses.slice(sec.start, sec.start + Math.min(limit, total));
        return (
          <div key={sec.id} className="gf-section">
            <div className="gf-section-head">
              <h3 style={{ margin: 0 }}>{sec.title}</h3>
              <span className="gf-section-count mono">
                {total.toLocaleString()} {total === 1 ? "clause" : "clauses"}
              </span>
            </div>
            <p className="section-note" style={{ marginTop: 4 }}>
              {sec.note}
            </p>
            {total === 0 ? (
              <div className="gf-clauses mono">(none)</div>
            ) : (
              <>
                <div className="gf-clauses mono">
                  {visible.map((c, idx) => (
                    <div key={idx}>({clauseText(formula, c)})</div>
                  ))}
                </div>
                {limit < total && (
                  <div className="gf-buttons" style={{ marginTop: 8 }}>
                    <button
                      className="btn secondary"
                      onClick={() => setShown((s) => ({ ...s, [sec.id]: Math.min(total, limit + MORE) }))}
                    >
                      Show {Math.min(MORE, total - limit)} more
                    </button>
                    <span className="gf-section-count mono" style={{ alignSelf: "center" }}>
                      {(total - limit).toLocaleString()} not shown
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      <h3 style={{ marginTop: 18 }}>Take it elsewhere</h3>
      <div className="gf-buttons">
        <button className="btn secondary" onClick={() => download(dimacsName, formulaToDimacs(formula))}>
          Download DIMACS
        </button>
      </div>
      <p className="section-note">
        The same instance in the standard SAT interchange format, ready for any solver. If it comes back{" "}
        <span className="mono">UNSATISFIABLE</span>, {k} dots force the shape on this grid; if it comes back{" "}
        <span className="mono">SATISFIABLE</span>, the positive literals among the first {formula.numCells} variables
        are an arrangement that escapes.
      </p>
    </div>
  );
}
