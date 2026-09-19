// The reduction written out formally, followed by the conjunction the current
// choice of N, k and shape actually produces.

import { shapeArity, shapeName, type Formula, type ShapeSpec } from "../../math/gridForcing";
import { motionName } from "../../math/patternShape";
import { Toggle } from "./Controls";
import { FormulaView } from "./FormulaView";

type Props = {
  n: number;
  k: number;
  shape: ShapeSpec;
  formula: Formula;
  forbiddenCount: number;
  width3: boolean;
  onWidth3: (v: boolean) => void;
};

/** The values the repo's smoke tests pin down, plus what this solver has reached beyond them. */
const KNOWN: Array<{ label: string; row: Array<number | null>; note: string }> = [
  {
    label: "isosceles triangle",
    row: [5, 7, 9, 11, 13, 15],
    note: "N ≤ 5 against exhaustive enumeration of every subset; N = 6 against branch and bound; N = 7, 8 agree with an independent run on an off-the-shelf CDCL solver.",
  },
  {
    label: "square, any tilt",
    row: [null, 11, 16, 22, 28, null],
    note: "N ≤ 5 against exhaustive enumeration; N = 6 published; N = 7 is this solver's own, with its 27-cell witness verified independently. N = 8 is past what a browser finishes.",
  },
  {
    label: "square, axis-aligned",
    row: [null, 13, 18, 25, 33, 42],
    note: "N ≤ 5 against exhaustive enumeration; N = 6 published; N = 7, 8 are this solver's own, with their witnesses verified independently.",
  },
];

/**
 * What "a copy" means for a shape someone drew.
 *
 * For the built-in families this is a fact about the plane — a triangle either
 * has two equal sides or it does not. For a drawn pattern it is a *choice*, and
 * the threshold depends on which choice was made, so the reduction is only
 * stated honestly if the choice is stated with it.
 */
function PatternMembership({ shape }: { shape: ShapeSpec }) {
  const pts = shape.pattern?.points ?? [];
  const motions = shape.pattern?.motions ?? "similar";

  return (
    <>
      <p className="section-note">
        Here P = {"{"}
        {pts.map((p) => `(${p.i},${p.j})`).join(", ")}
        {"}"}, the pattern you drew, anchored at the origin. Identify Z² with the Gaussian integers by z = p₁ + p₂i. A{" "}
        <em>copy</em> of P is the image σ(P) of a plane similarity
      </p>
      <div className="gf-math mono">σ(z) = αz + β (direct) or σ(z) = αz̄ + β (reflected), α ≠ 0, β ∈ Z[i]</div>
      <p className="section-note">
        that lands every point of P back on the grid, with α restricted by the motions you allowed —{" "}
        <strong>{motionName(motions)}</strong>:
      </p>
      <div className="gf-math mono">
        translation: α = 1, direct only · quarter turns and flips: α ∈ {"{"}1, i, −1, −i{"}"} · same size: |α| = 1 ·
        any size: α unrestricted
      </div>
      <p className="section-note">
        E is then every σ(P) contained in G<sub>N</sub>, and the rest of the reduction is unchanged: the family is
        whatever it is, and nothing below this line knows where it came from. Membership stays exact. A similarity is
        pinned down by the images of two pattern points, so α is carried as a ratio of Gaussian integers and "lands on
        a lattice point" is the divisibility test α(p − p₀) ∈ Z[i] — a question about integers, true or false with no
        tolerance to set. Note that the built-in square family is the <em>any size</em> class applied to the unit
        square: the tilted squares are exactly its similar copies.
      </p>
    </>
  );
}

export function ReductionPanel({ n, k, shape, formula, forbiddenCount, width3, onWidth3 }: Props) {
  const arity = shapeArity(shape);
  const name = shapeName(shape);

  return (
    <div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>1. The question</h2>
        <p>
          Fix an integer N ≥ 2 and let G<sub>N</sub> = {"{"}0, 1, …, N−1{"}"}² be the N × N integer grid, M = |G
          <sub>N</sub>| = N² cells. Fix a family E of <em>forbidden configurations</em> — here, every copy of the{" "}
          {name} whose corners are grid cells.
        </p>
        <p>
          Call X ⊆ G<sub>N</sub> <strong>shape-free</strong> if no member of E is a subset of X. The quantity we want is
        </p>
        <div className="gf-math mono">
          k*(N) = min {"{"} k : every X ⊆ G<sub>N</sub> with |X| = k contains a copy {"}"}
        </div>
        <p>
          equivalently k*(N) = α(N) + 1, where α(N) is the size of the largest shape-free subset. For the {n}×{n} grid
          and the {name} there are {forbiddenCount.toLocaleString()} configurations in E, each using {arity} cells.
        </p>
        {shape.id === "pattern" ? <PatternMembership shape={shape} /> : (
          <p className="section-note">
            Membership in E is decided by exact integer arithmetic on <em>squared</em> distances: d²(p,q) = (p₁−q₁)² +
            (p₂−q₂)². A triple is isosceles when two of its three squared distances agree and the three cells are not
            collinear — collinearity being the 2 × 2 determinant (b₁−a₁)(c₂−a₂) − (b₂−a₂)(c₁−a₁) ≠ 0. No square roots,
            no floating point, no tolerance.
          </p>
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>2. The decision problem, and why it is the complement</h2>
        <div className="gf-math mono">
          AVOID(N, k) : does there exist a shape-free X ⊆ G<sub>N</sub> with |X| ≥ k ?
        </div>
        <p>
          <strong>Lemma 1 (monotonicity).</strong> If AVOID(N, k) is false then AVOID(N, k′) is false for every k′ ≥ k.
        </p>
        <p className="gf-proof">
          <em>Proof.</em> Contrapositive. If X is shape-free with |X| ≥ k′ ≥ k, then X itself witnesses AVOID(N, k),
          since |X| ≥ k. ∎
        </p>
        <p>
          So the predicate flips exactly once as k increases, and k*(N) is the least k at which AVOID(N, k) is false.
          An upward scan finds it; so would binary search in ⌈log₂ N²⌉ queries — though it saves less than it looks,
          because the single call at the boundary costs far more than all the others together.
        </p>
        <p>
          Now the point the whole construction turns on. A SAT solver decides ∃-questions. The question we care about —
          "<em>for every</em> arrangement of k dots, some {arity} of them make the shape" — is a ∀-question, and it is
          precisely the <em>negation</em> of AVOID. So we encode AVOID and read <strong>unsatisfiable</strong> as the
          affirmative answer:
        </p>
        <div className="gf-math mono">
          SAT&nbsp;&nbsp;&nbsp;→ some k-set avoids every copy → k is too small
          <br />
          UNSAT → every k-set contains one&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;→ k forces the shape
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>3. Three ways to get the polarity wrong</h2>
        <p>
          <strong>(a) Positive conjunctions joined by OR.</strong> Setting F = ( ⋁<sub>S ∈ E</sub> ⋀<sub>p ∈ S</sub> x
          <sub>p</sub> ) ∧ counter(k) makes F satisfiable for every N and every k: take every x<sub>p</sub> true and
          every counter variable true. Every disjunct holds, every counter clause holds, and the oracle returns 1
          unconditionally. Relabelling the <em>interpretation</em> to "0 means forced" does not rescue it — it turns a
          true statement about a useless formula into a false one.
        </p>
        <p>
          <strong>(b) Negating inside instead of outside.</strong> Given the correct ⋀A it is tempting to write
          counter(k) ∧ ¬⋀A, reasoning that ⋀A fails exactly when a copy is present. But that formula asks for a k-set
          which <em>contains</em> a copy, and that is trivially satisfiable for every k ≤ N² — place one copy, pad
          arbitrarily. The negation required is of the whole quantified statement, ¬∃X(…), and applying it is exactly
          "read UNSAT instead of SAT". It is never encoded. Encoding it would also cost a Tseitin transformation, since
          ¬⋀A is a DNF.
        </p>
        <p>
          <strong>(c) The mirror image.</strong> ⋀A alone, without the counter, is satisfied by placing nothing at all:
          every negated clause is then vacuously true. The cardinality counter is the only thing ruling that out. You
          can watch both halves fail on the board: clear it, and the arrangement is shape-free for free; fill it, and
          every clause of A that fits is violated at once.
        </p>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>4. The formula</h2>
        <p>
          Fix the linear order v₁, …, v<sub>M</sub> on G<sub>N</sub> given by v<sub>iN+j+1</sub> = (i, j) — the order
          the board numbers its cells in.
        </p>
        <p>
          <strong>Primary variables.</strong> x₁, …, x<sub>M</sub>, read as x<sub>t</sub> = 1 ⟺ v<sub>t</sub> ∈ X.
        </p>
        <p>
          <strong>Auxiliary variables.</strong> s<sub>i,j</sub> for 1 ≤ i ≤ M and 1 ≤ j ≤ min(i, k), read as "at least
          j of v₁, …, v<sub>i</sub> are in X".
        </p>
        <p>
          <strong>Clause set A (geometry).</strong> One clause per configuration S ∈ E:
        </p>
        <div className="gf-math mono">( ⋁<sub>p ∈ S</sub> ¬x<sub>p</sub> )</div>
        <p className="section-note">
          This is already a conjunction of clauses, with no Tseitin encoding anywhere: the constraint is the negation of
          a disjunction of conjunctions, and De Morgan turns DNF into CNF for free.
        </p>
        <p>
          <strong>Clause set B (the counter).</strong> A Sinz sequential counter. With the conventions s<sub>i,0</sub> ≡
          1 and s<sub>i,j</sub> ≡ 0 for j &gt; i, dropping the literals those make constant:
        </p>
        <div className="gf-math mono">
          (¬s<sub>i,j</sub> ∨ s<sub>i−1,j</sub> ∨ x<sub>i</sub>)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;1 ≤ j &lt; i ≤ M, j ≤ k
          <br />
          (¬s<sub>i,i</sub> ∨ x<sub>i</sub>)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;1 ≤ i ≤ k
          <br />
          (¬s<sub>i,j</sub> ∨ s<sub>i−1,j</sub> ∨ s<sub>i−1,j−1</sub>)&nbsp;&nbsp;2 ≤ j &lt; i ≤ M, j ≤ k
          <br />
          (¬s<sub>i,i</sub> ∨ s<sub>i−1,i−1</sub>)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2 ≤ i ≤ k
          <br />
          (s<sub>M,k</sub>)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;the assertion
        </div>
        <div className="gf-math mono">F(N, k) = ⋀A ∧ ⋀B</div>
        <p>
          For the choices below that is F({n}, {k}): i runs over the {n * n} cells, j over 1 … {k}, and the assertion is
          the single unit clause (s<sub>{n * n},{k}</sub>).
        </p>
        <p className="section-note">
          Only the forward implication s<sub>i,j</sub> → s<sub>i−1,j</sub> ∨ (x<sub>i</sub> ∧ s<sub>i−1,j−1</sub>) is
          encoded. One-sidedness means s<sub>i,j</sub> may sit at 0 even when the count is met — harmless, because the
          only s ever asserted is the top one, and it halves the clause count. Note also that B enforces <em>at least</em>{" "}
          k, never exactly k; by Lemma 1 the two have the same answer, and at-least is cheaper.
        </p>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>5. Correctness</h2>
        <p>
          <strong>Lemma 2 (counter soundness).</strong> In any assignment satisfying B, if s<sub>i,j</sub> = 1 then at
          least j of x₁, …, x<sub>i</sub> are 1.
        </p>
        <p className="gf-proof">
          <em>Proof.</em> Induction on i. If j = i, the second family forces x<sub>i</sub> = 1 and the fourth forces s
          <sub>i−1,i−1</sub> = 1, so by induction the first i−1 cells supply i−1 and x<sub>i</sub> makes i. If j &lt; i
          and s<sub>i−1,j</sub> = 1, induction gives j among the first i−1, a fortiori among the first i. If j &lt; i
          and s<sub>i−1,j</sub> = 0, the first family forces x<sub>i</sub> = 1 and the third forces s<sub>i−1,j−1</sub>{" "}
          = 1, giving j−1 among the first i−1 and j with x<sub>i</sub>. ∎
        </p>
        <p>
          With i = M, j = k and the unit clause (s<sub>M,k</sub>): every satisfying assignment has at least k of the x's
          true.
        </p>
        <p>
          <strong>Lemma 3 (counter completeness).</strong> Any assignment to x₁, …, x<sub>M</sub> with at least k
          variables true extends to satisfy B — set s<sub>i,j</sub> := 1 exactly when at least j of the first i are
          true, which satisfies every clause because each family is one direction of an identity true of the counting
          function.
        </p>
        <p>
          <strong>Theorem 4.</strong> F(N, k) is satisfiable ⟺ AVOID(N, k) is true.
        </p>
        <p className="gf-proof">
          <em>Proof.</em> (⇐) Let X be shape-free with |X| ≥ k and set x<sub>t</sub> = 1 iff v<sub>t</sub> ∈ X. No
          clause of A can fail, for a failing clause would exhibit a configuration wholly inside X. Lemma 3 extends the
          assignment to B. (⇒) Let σ ⊨ F and X = {"{"} v<sub>t</sub> : σ(x<sub>t</sub>) = 1 {"}"}. Lemma 2 and the unit
          clause give |X| ≥ k; if X contained a configuration, its clause in A would have all literals false. ∎
        </p>
        <p>
          <strong>Corollary 5.</strong> k*(N) is the least k for which F(N, k) is <strong>unsatisfiable</strong>, α(N) =
          k*(N) − 1, and any model of F(N, k*−1) is a maximum shape-free set. That last part is why the{" "}
          <em>Explore</em> tab can put the solver's witness back on the board: the model <em>is</em> the arrangement.
        </p>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>6. Size, width, and what the complexity claim is worth</h2>
        <p>
          <strong>Lemma 6 (size).</strong> M = N² primary variables plus at most kM = O(N⁴) counter variables; |A| = |E|
          and |B| ≤ 2kM + 1 = O(N⁴). For isosceles triangles |E| ≤ C(N², 3) = O(N⁶), enumerable by iterating over all
          triples with an O(1) integer test each. For squares |E| = Σ<sub>s=1..N−1</sub> s(N−s)² = Θ(N⁴), and
          Σ<sub>s</sub> (N−s)² axis-aligned. For a drawn pattern |E| ≤ 2M(M−1) = O(N⁴), one candidate per ordered pair
          of anchor images per orientation, so the family stays polynomial however the pattern is drawn — it is the
          <em>refutation</em> that gets expensive, never the enumeration.
        </p>
        <p>
          <strong>Lemma 7 (width).</strong> Clauses of A have exactly as many literals as the shape has cells — 3 for a
          triangle, 4 for a square, {arity} here. Families 1 and 3 of B have 3, families 2 and 4 have 2, and the
          assertion is a unit. So a width-3 shape lands in 3-CNF natively; anything wider takes the standard chain
          reduction
        </p>
        <div className="gf-math mono">
          (l₁ ∨ … ∨ l_w) ⇝ (l₁ ∨ l₂ ∨ z₁) ∧ (¬z₁ ∨ l₃ ∨ z₂) ∧ … ∧ (¬z_(w−3) ∨ l_(w−1) ∨ l_w)
        </div>
        <p>
          turning one width-w clause into w−2 width-3 clauses through w−3 fresh variables{" "}
          {arity > 3 ? `— ${arity - 2} and ${arity - 3} respectively, at ${arity} cells a copy` : ""}. Equisatisfiable
          rather than equivalent — which is all that is ever asked of it, since only satisfiability is queried. To reach{" "}
          <em>strict</em> 3-CNF the short clauses pad the same way: (l₁ ∨ l₂) ⇝ (l₁ ∨ l₂ ∨ w)(l₁ ∨ l₂ ∨ ¬w).
        </p>
        <Toggle
          label={`Split the width-${Math.max(arity, 4)} clauses, so the formula really is 3-CNF`}
          checked={width3}
          hint={
            arity > 3
              ? `adds ${(forbiddenCount * (arity - 3)).toLocaleString()} variables`
              : "this shape is already width 3"
          }
          onChange={onWidth3}
        />
        <p style={{ marginTop: 18 }}>
          <strong>Theorem 8.</strong> AVOID(N, k) is in NP, and k*(N) is computable in time polynomial in N given an
          oracle for 3-SAT, using O(log N) oracle calls.
        </p>
        <p className="gf-proof">
          <em>Proof.</em> A witness is X ⊆ G<sub>N</sub>, of size O(N²), verified by checking its subsets of the right
          size. By Lemma 6 the formula is constructible in polynomial time; by Lemma 7 (with padding) it is a 3-CNF; by
          Theorem 4 the oracle decides AVOID; by Lemma 1, binary search over k ∈ {"{"}3, …, N²{"}"} locates k*. ∎
        </p>
        <p className="section-note">
          What Theorem 8 does <em>not</em> say. It is conditional: no polynomial-time 3-SAT algorithm is known, and CDCL
          solvers are worst-case exponential. Nor is it deep — AVOID ∈ NP plus Cook–Levin gives it immediately. The
          content is that the encoding is <em>explicit and small</em>, with no Tseitin overhead, which is what makes the
          instances solvable at all. No NP-hardness of AVOID is claimed or proved.
        </p>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>7. What the numbers are, and what they are not</h2>
        <div className="gf-table-wrap">
          <table className="gf-table">
            <thead>
              <tr>
                <th>forbidden shape</th>
                <th>N=3</th>
                <th>4</th>
                <th>5</th>
                <th>6</th>
                <th>7</th>
                <th>8</th>
              </tr>
            </thead>
            <tbody>
              {KNOWN.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  {r.row.map((v, idx) => (
                    <td key={idx} className="mono">
                      {v ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="gf-legend">
          {KNOWN.map((r) => (
            <li key={r.label}>
              <strong>{r.label}:</strong> {r.note}
            </li>
          ))}
        </ul>
        <p>
          The isosceles row is exactly 2N−1 for all six values, and every witness behind it is the same L-shaped family
          — a run of N−1 cells down one edge and a run of N−1 along an adjacent one, with the shared corner left out.
          That is a conjecture on six data points, not a result, and there is a concrete reason to distrust it:{" "}
          <strong>the family dies at N = 9</strong>. In the 9×9 grid the L contains (0,0), (0,5) and (4,8), whose
          squared distances are 25 and 16 + 9 = 25 — an isosceles triangle. The single construction generating all six
          data points stops working one step past the largest grid a solver can currently reach.
        </p>
        <p className="section-note">
          Nothing here proves a closed form, an asymptotic, or a general-N formula for k*(N). The literature on
          no-isosceles sets suggests superlinear growth, which would make the linear pattern a small-grid artefact. You
          can see the failure for yourself on the <em>Explore</em> tab: the preset "…and the same L at N = 9" draws that
          arrangement, and the board marks the offending triangle at once.
        </p>
      </div>

      <div style={{ marginTop: 18 }}>
        <FormulaView formula={formula} forbiddenCount={forbiddenCount} />
      </div>
    </div>
  );
}
