import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { parsePolynomial } from "../../math/parser";
import { computeGalois, type GaloisResult } from "../../math/galoisGroup";
import {
  rootsNumeric,
  formatPoly,
  type Complex,
  type Polynomial,
} from "../../math/polynomial";
import {
  isZero,
  format as fmtRat,
  toNumber,
  type Rational,
} from "../../math/rational";
import { buildLattice, permId, type Perm } from "../../math/groups";
import { PolynomialInput } from "./PolynomialInput";
import { RootsPlot, ROOT_COLORS, RATIONAL_FILL } from "./RootsPlot";
import { PermutationSelector } from "./PermutationSelector";
import { SubgroupLattice } from "./SubgroupLattice";

const DEFAULT_POLY = "x^4 - 2";

type OkResult = Extract<GaloisResult, { kind: "ok" }>;
type UnsupportedResult = Extract<GaloisResult, { kind: "unsupported" }>;

type Computed = {
  result: OkResult | UnsupportedResult;
  polynomial: Polynomial;
  rootDisplay: RootDisplay[];        // ALL roots of the polynomial, sorted for display
  permDegree: number;                 // number of non-rational roots the Galois group acts on
  nonRationalIdxs: number[];         // indices in rootDisplay that correspond to perm positions 0..permDegree-1
  rootLabels: string[];               // labels for ALL displayed roots
};

type RootDisplay = {
  z: Complex;
  rational: Rational | null;          // non-null iff this root is rational
  label: string;
};

export function GaloisGroupVisualization() {
  const [input, setInput] = useState(DEFAULT_POLY);
  const [committed, setCommitted] = useState(DEFAULT_POLY);

  const computation = useMemo<{ ok: Computed } | { error: string }>(() => {
    try {
      const poly = parsePolynomial(committed);
      const result = computeGalois(poly);
      if (result.kind === "error") return { error: result.reason };
      if (result.kind === "unsupported") {
        // Still compute roots and a stub display so we can show the polynomial.
        const numericRoots = rootsNumeric(poly);
        const rootDisplay: RootDisplay[] = numericRoots.map((z, i) => ({
          z,
          rational: null,
          label: `r${sub(i + 1)}`,
        }));
        return {
          ok: {
            result,
            polynomial: poly,
            rootDisplay,
            permDegree: 0,
            nonRationalIdxs: [],
            rootLabels: rootDisplay.map((r) => r.label),
          },
        };
      }
      // result.kind === "ok"
      const rationalRoots = result.factorization[0].rationalRoots;
      const allRoots = rootsNumeric(poly);

      // Match rationals to numerical roots (consume each numeric root at most once).
      const matched = new Array(allRoots.length).fill(false);
      const rationalForIdx: (Rational | null)[] = new Array(allRoots.length).fill(null);
      for (const r of rationalRoots) {
        const target = toNumber(r);
        let bestI = -1;
        let bestErr = Infinity;
        for (let i = 0; i < allRoots.length; i++) {
          if (matched[i]) continue;
          if (Math.abs(allRoots[i].im) > 1e-7) continue; // rationals must be real
          const err = Math.abs(allRoots[i].re - target);
          if (err < bestErr) {
            bestErr = err;
            bestI = i;
          }
        }
        if (bestI >= 0 && bestErr < 1e-6) {
          matched[bestI] = true;
          rationalForIdx[bestI] = r;
        }
      }

      // Sort: rational roots first (by value), then non-rationals (real first, then by angle)
      const indices = allRoots.map((_, i) => i);
      indices.sort((a, b) => {
        const ra = rationalForIdx[a];
        const rb = rationalForIdx[b];
        if (ra !== null && rb === null) return -1;
        if (ra === null && rb !== null) return 1;
        if (ra !== null && rb !== null) return toNumber(ra) - toNumber(rb);
        // both irrational
        const za = allRoots[a];
        const zb = allRoots[b];
        const realA = Math.abs(za.im) < 1e-9;
        const realB = Math.abs(zb.im) < 1e-9;
        if (realA && !realB) return -1;
        if (!realA && realB) return 1;
        if (realA && realB) return za.re - zb.re;
        // both complex: sort by angle (so conjugate pairs are adjacent)
        const ang = (z: Complex) => Math.atan2(z.im, z.re);
        return ang(za) - ang(zb);
      });

      const rootDisplay: RootDisplay[] = indices.map((i, displayIdx) => {
        const r = rationalForIdx[i];
        return {
          z: allRoots[i],
          rational: r,
          label: r !== null ? fmtRat(r) : `r${sub(displayIdx + 1)}`,
        };
      });

      const nonRationalIdxs: number[] = [];
      for (let i = 0; i < rootDisplay.length; i++) {
        if (rootDisplay[i].rational === null) nonRationalIdxs.push(i);
      }
      const permDegree = nonRationalIdxs.length;
      // Re-label non-rationals as r₁, r₂, ... starting fresh
      for (let i = 0; i < nonRationalIdxs.length; i++) {
        rootDisplay[nonRationalIdxs[i]].label = `r${sub(i + 1)}`;
      }
      return {
        ok: {
          result,
          polynomial: poly,
          rootDisplay,
          permDegree,
          nonRationalIdxs,
          rootLabels: rootDisplay.map((r) => r.label),
        },
      };
    } catch (e: any) {
      return { error: e?.message ?? String(e) };
    }
  }, [committed]);

  const [selectedPerm, setSelectedPerm] = useState<Perm | null>(null);

  // Reset selected perm whenever the polynomial changes.
  // (Use a ref-key strategy via useMemo: re-initialize when computation changes.)
  useMemo(() => {
    setSelectedPerm(null);
  }, [computation]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
        <Link to="/" className="mono" style={{ color: "var(--text-muted)" }}>
          ← back
        </Link>
        <h1 style={{ margin: 0 }}>Galois group of a polynomial</h1>
      </div>
      <PolynomialInput
        value={input}
        onChange={setInput}
        onSubmit={() => setCommitted(input)}
        onLoadExample={(p) => {
          setInput(p);
          setCommitted(p);
        }}
      />

      {"error" in computation && (
        <div className="error-banner">Parse error: {computation.error}</div>
      )}

      {"ok" in computation && (() => {
        const c = computation.ok;
        const result = c.result;
        if (result.kind === "unsupported") {
          return (
            <>
              <div className="warning-banner" style={{ marginTop: 18 }}>
                {result.reason}
              </div>
              <ResultSummary
                polyLabel={formatPoly(c.polynomial)}
                result={null}
              />
              <div className="card" style={{ marginTop: 18 }}>
                <h3>Roots in ℂ</h3>
                <RootsPlot
                  roots={c.rootDisplay.map((r) => r.z)}
                  rationalRootIdxs={new Set()}
                  perm={null}
                  rootLabels={c.rootLabels}
                />
              </div>
            </>
          );
        }
        // result.kind === "ok"
        const group = result.group;
        const permDeg = c.permDegree;

        // Build perm that we render arrows for, by mapping the group's perm (on {0..permDeg-1})
        // onto the actual display indices via nonRationalIdxs.
        let displayPerm: Perm | null = null;
        if (selectedPerm) {
          const all = permId(c.rootDisplay.length);
          for (let i = 0; i < permDeg; i++) {
            all[c.nonRationalIdxs[i]] = c.nonRationalIdxs[selectedPerm[i]];
          }
          displayPerm = all;
        }

        // Subgroup lattice. Only show meaningful lattices (group acts on ≥ 1 root).
        let lattice = null;
        let discDescription: string | null = null;
        if (result.discriminantIsSquare && result.discriminant) {
          // disc is a square — no √disc to display.
        } else if (!isZero(result.discriminant)) {
          discDescription = `√${fmtRat(result.discriminant)}`;
        }
        const labelsForLattice = c.nonRationalIdxs.map((i) => c.rootDisplay[i].label);
        if (permDeg >= 2 && group.order > 1 && group.order <= 24) {
          lattice = buildLattice(group.name, permDeg, labelsForLattice, discDescription);
        }

        return (
          <>
            <ResultSummary polyLabel={formatPoly(c.polynomial)} result={result} />

            <div className="split">
              <div className="card">
                <h3>Roots & Selected Permutation</h3>
                <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
                  <RootsPlot
                    roots={c.rootDisplay.map((r) => r.z)}
                    rationalRootIdxs={
                      new Set(
                        c.rootDisplay
                          .map((r, i) => (r.rational !== null ? i : -1))
                          .filter((i) => i >= 0),
                      )
                    }
                    perm={displayPerm}
                    rootLabels={c.rootLabels}
                  />
                </div>
                <div style={{ marginTop: 8 }}>
                  {c.rootDisplay.some((r) => r.rational !== null) && (
                    <span className="legend-line">
                      <span
                        className="swatch"
                        style={{
                          background: RATIONAL_FILL,
                          borderRadius: 0,
                          transform: "rotate(45deg)",
                        }}
                      />
                      rational root (fixed by every Galois automorphism)
                    </span>
                  )}
                  <span className="legend-line">
                    each algebraic root has its own color so you can follow it under a permutation
                  </span>
                </div>

                <RootsList rootDisplay={c.rootDisplay} />

                {permDeg >= 1 && (
                  <>
                    <h3 style={{ marginTop: 18 }}>
                      Group elements ({group.prettyName}, {group.order} of them)
                    </h3>
                    <PermutationSelector
                      elements={group.elements}
                      selected={selectedPerm}
                      onSelect={(p) => setSelectedPerm(p)}
                    />
                    <p className="section-note">
                      Click a permutation to see how it maps the algebraic roots in the plot above.
                      Permutations are shown in cycle notation; <code>e</code> is the identity.
                    </p>
                  </>
                )}
              </div>

              <div className="card">
                <h3>Subgroup lattice</h3>
                {lattice ? (
                  <>
                    <SubgroupLattice lattice={lattice} groupOrder={group.order} />
                    <p className="section-note" style={{ marginTop: 12 }}>
                      Each node is a subgroup H of the Galois group G. By the Galois correspondence
                      it pairs with the intermediate field K<sup>H</sup> = {`{x ∈ K | σ(x) = x ∀σ∈H}`}.
                      The bottom is trivial subgroup → splitting field K; the top is G → ℚ.
                    </p>
                  </>
                ) : (
                  <p className="section-note">
                    Lattice unavailable: the Galois group acts on fewer than two algebraic roots.
                  </p>
                )}
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}

function ResultSummary({
  polyLabel,
  result,
}: {
  polyLabel: string;
  result: OkResult | null;
}) {
  if (!result) {
    return (
      <div className="card" style={{ marginTop: 18 }}>
        <h3>Polynomial</h3>
        <div className="mono" style={{ fontSize: 17 }}>{polyLabel}</div>
      </div>
    );
  }
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h3>Result</h3>
      <div className="mono" style={{ fontSize: 18 }}>{polyLabel}</div>
      <div className="facts">
        <div className="fact">
          <div className="label">Galois group</div>
          <div className="value">{result.group.prettyName}</div>
        </div>
        <div className="fact">
          <div className="label">|G| · [K:ℚ]</div>
          <div className="value">{result.group.order}</div>
        </div>
        <div className="fact">
          <div className="label">Abelian?</div>
          <div className="value">{result.group.isAbelian ? "yes" : "no"}</div>
        </div>
        <div className="fact">
          <div className="label">Discriminant</div>
          <div className="value">
            {fmtRat(result.discriminant)}{" "}
            {result.discriminantIsSquare ? <span style={{ color: "var(--accent)" }}>(square)</span> : null}
          </div>
        </div>
        {result.resolventCubic && (
          <div className="fact" style={{ gridColumn: "span 2" }}>
            <div className="label">Resolvent cubic</div>
            <div className="value">{formatPoly(result.resolventCubic, "y")}</div>
          </div>
        )}
        {result.resolventRationalRoot !== null && (
          <div className="fact">
            <div className="label">Resolvent root θ ∈ ℚ</div>
            <div className="value">{fmtRat(result.resolventRationalRoot)}</div>
          </div>
        )}
      </div>
      <p className="section-note" style={{ marginTop: 14 }}>{result.note}</p>
      <p className="section-note" style={{ marginTop: 4 }}>{result.group.description}</p>
    </div>
  );
}

const SUB_DIGITS = "₀₁₂₃₄₅₆₇₈₉";
function sub(n: number): string {
  return String(n)
    .split("")
    .map((d) => SUB_DIGITS[parseInt(d, 10)])
    .join("");
}

function RootsList({ rootDisplay }: { rootDisplay: RootDisplay[] }) {
  if (rootDisplay.length === 0) return null;
  return (
    <div className="roots-list">
      <h3 style={{ marginTop: 18 }}>Roots</h3>
      <ul>
        {rootDisplay.map((r, i) => {
          const isRat = r.rational !== null;
          const color = isRat ? RATIONAL_FILL : ROOT_COLORS[i % ROOT_COLORS.length];
          return (
            <li key={i}>
              <span
                className="root-swatch"
                style={{
                  background: color,
                  transform: isRat ? "rotate(45deg)" : undefined,
                  borderRadius: isRat ? 0 : "50%",
                }}
              />
              <span className="root-label mono">{r.label}</span>
              <span className="root-sep">=</span>
              <span className="root-value mono">
                {isRat ? fmtRat(r.rational!) : formatComplex(r.z)}
              </span>
              {isRat && <span className="root-tag">rational, fixed</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatComplex(z: { re: number; im: number }): string {
  const fmt = (x: number) => {
    // Strip trailing zeros after a 4-decimal round.
    const s = x.toFixed(4);
    return s.replace(/\.?0+$/, "") || "0";
  };
  if (Math.abs(z.im) < 1e-9) return fmt(z.re);
  if (Math.abs(z.re) < 1e-9) {
    if (Math.abs(z.im - 1) < 1e-9) return "i";
    if (Math.abs(z.im + 1) < 1e-9) return "−i";
    return `${fmt(z.im)}i`;
  }
  const sign = z.im >= 0 ? " + " : " − ";
  const imAbs = Math.abs(z.im);
  const imPart = Math.abs(imAbs - 1) < 1e-9 ? "i" : `${fmt(imAbs)}i`;
  return `${fmt(z.re)}${sign}${imPart}`;
}
