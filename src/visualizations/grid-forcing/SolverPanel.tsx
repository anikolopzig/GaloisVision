// The two questions the solver answers: what is the smallest k that forces the
// shape, and is one particular k enough?
//
// Both are the same call underneath — build F(N,k), refute it or don't — which
// is the point worth seeing. The first just walks k upward until the answer
// flips, which monotonicity guarantees happens exactly once.

import { useEffect, useMemo } from "react";
import {
  bestGreedyAvoidingSet,
  shapeArticle,
  shapeName,
  type KOutcome,
  type Occurrence,
  type ShapeSpec,
} from "../../math/gridForcing";
import { IntField } from "./Controls";
import { CONFLICT_BUDGET, canDecide, canScan, maxK, minK, solverDifficulty } from "./limits";
import { lastWitness, useForcingRun } from "./useForcingRun";

type Props = {
  n: number;
  shape: ShapeSpec;
  forbidden: readonly Occurrence[];
  width3: boolean;
  k: number;
  onK: (k: number) => void;
  onPlace: (cells: readonly number[]) => void;
  onThreshold: (threshold: number) => void;
};

function seconds(ms: number): string {
  if (ms < 950) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`;
}

function OutcomeTable({ outcomes, onPlace }: { outcomes: readonly KOutcome[]; onPlace: (c: readonly number[]) => void }) {
  return (
    <div className="gf-table-wrap">
      <table className="gf-table">
        <thead>
          <tr>
            <th>k</th>
            <th>F(N,k)</th>
            <th>means</th>
            <th>vars</th>
            <th>clauses</th>
            <th>conflicts</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {outcomes.map((o) => (
            <tr key={o.k} className={o.verdict === "forced" ? "gf-row-forced" : undefined}>
              <td className="mono">{o.k}</td>
              <td className="mono">{o.verdict === "avoidable" ? "SAT" : o.verdict === "forced" ? "UNSAT" : "—"}</td>
              <td>
                {o.verdict === "avoidable"
                  ? "k dots can still dodge it"
                  : o.verdict === "forced"
                    ? "k dots force it"
                    : "budget exhausted"}
              </td>
              <td className="mono">{o.numVars.toLocaleString()}</td>
              <td className="mono">{o.numClauses.toLocaleString()}</td>
              <td className="mono">{o.stats.conflicts.toLocaleString()}</td>
              <td>
                {o.witness && (
                  <button className="gf-inline-btn" onClick={() => onPlace(o.witness as number[])}>
                    place
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SolverPanel({ n, shape, forbidden, width3, k, onK, onPlace, onThreshold }: Props) {
  const { state, running, start, cancel, reset } = useForcingRun();

  // A greedy arrangement is a certificate, not a guess: because it is verified
  // shape-free, every k up to its size is satisfiable by that same arrangement
  // (monotonicity again), so the scan can start there instead of at 3.
  const greedy = useMemo(() => bestGreedyAvoidingSet(n, forbidden, 80), [n, forbidden]);

  // A shape someone drew has no measured timing behind it, so what the page can
  // say about it has to be derived from the instance itself: how many copies
  // there are to forbid, and how far greedy search already got without the
  // solver. Both are certainties, which is what makes them worth gating on.
  const evidence =
    shape.id === "pattern" ? { copies: forbidden.length, greedy: greedy.length } : undefined;
  const difficulty = solverDifficulty(n, shape, evidence);
  const scannable = canScan(n, shape, evidence);
  const decidable = canDecide(n, shape, evidence);
  const lo = minK(shape);
  const hi = maxK(n);
  const scanFrom = Math.min(hi, Math.max(lo, greedy.length));

  const answer = state?.answer ?? null;
  useEffect(() => {
    if (answer !== null) onThreshold(answer);
  }, [answer, onThreshold]);

  const mode = state?.config.mode ?? null;
  const witness = state ? lastWitness(state.outcomes) : null;
  const single = mode === "single" ? (state?.outcomes[0] ?? null) : null;

  function runScan() {
    reset();
    start(
      { n, shape, width3, mode: "threshold", k: scanFrom, kMax: hi, budgetPerK: CONFLICT_BUDGET },
      forbidden,
    );
  }

  function runSingle() {
    reset();
    start({ n, shape, width3, mode: "single", k, kMax: hi, budgetPerK: CONFLICT_BUDGET }, forbidden);
  }

  return (
    <>
      <div className="card gf-solver">
        <h3 style={{ marginTop: 0 }}>The smallest k that forces it</h3>
        <p className="section-note" style={{ marginTop: 0 }}>
          Walk k upward, refuting F(N,k) at each step. The first k where the formula has no model is k* — every
          arrangement of that many dots contains {shapeArticle(shape)} {shapeName(shape)}, and one fewer does not.
        </p>

        <div className="gf-buttons">
          <button className="btn" disabled={running || !scannable} onClick={runScan}>
            {mode === "threshold" && running ? "Computing…" : `Compute k* for the ${n}×${n} grid`}
          </button>
          {running && (
            <button className="btn secondary" onClick={cancel}>
              Cancel
            </button>
          )}
        </div>
        <div className={`gf-badge gf-badge-${difficulty.level}`}>
          {scannable ? `Expect: ${difficulty.label}` : difficulty.label}
        </div>
        <p className="section-note">{difficulty.note}</p>

        {scannable && !running && !state && (
          <p className="section-note">
            The scan will start at k = {scanFrom}, because a greedy construction already exhibits a shape-free
            arrangement of {greedy.length} {greedy.length === 1 ? "cell" : "cells"} — verified directly, with no solver
            involved. Everything below that is satisfiable by that same arrangement.
          </p>
        )}

        {state && mode === "threshold" && (
          <>
            {running && (
              <div className="msg msg-info">
                Deciding <span className="mono">k = {state.progress.k}</span> — {state.progress.conflicts.toLocaleString()}{" "}
                conflicts so far, budget {state.progress.budget.toLocaleString()}. Elapsed {seconds(state.elapsedMs)}.
                <div className="gf-progress">
                  <div
                    className="gf-progress-bar"
                    style={{ width: `${Math.min(100, (state.progress.conflicts / state.progress.budget) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            {state.done && state.cancelled && <div className="msg msg-info">Cancelled. Nothing is claimed either way.</div>}
            {state.done && !state.cancelled && state.answer !== null && (
              <div className="msg msg-good">
                <strong className="gf-answer">
                  k*({n}) = {state.answer}
                </strong>
                <div>
                  Every arrangement of {state.answer} dots on the {n}×{n} grid contains {shapeArticle(shape)} {shapeName(shape)}, and{" "}
                  {state.answer - 1} is the largest number that need not — so α({n}) = {state.answer - 1}. Found in{" "}
                  {seconds(state.elapsedMs)}.
                </div>
              </div>
            )}
            {state.done && !state.cancelled && state.answer === null && (
              <div className="msg msg-warn">
                {state.gaveUp ? (
                  <>
                    <strong>Stopped at the conflict budget.</strong> The refutation at k = {state.progress.k} did not
                    finish within {CONFLICT_BUDGET.toLocaleString()} conflicts, so nothing is concluded about it. This
                    is the honest failure mode: the solver ran out of budget, it did not decide.
                  </>
                ) : (
                  <>
                    <strong>No forcing k up to {hi}.</strong> Within the range this page offers, every k left some
                    arrangement able to dodge the shape.
                  </>
                )}
              </div>
            )}
            {state.outcomes.length > 0 && <OutcomeTable outcomes={state.outcomes} onPlace={onPlace} />}
            {witness && state.done && (
              <p className="section-note">
                The last satisfiable call handed back an arrangement of {witness.witness?.length} dots with no copy of
                the shape. Press <em>place</em> on that row to draw it on the board and check it yourself — the board
                re-verifies it independently of the solver.
              </p>
            )}
          </>
        )}
      </div>

      <div className="card gf-solver" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>Is a particular k enough?</h3>
        <IntField
          label="Number of dots k"
          value={k}
          min={lo}
          max={hi}
          hint={`${lo} … ${hi}`}
          onChange={onK}
        />
        <p className="section-note">
          k is capped at {hi}
          {hi < n * n ? ` rather than the full ${n * n} cells` : ""} because the counter part of F carries about 2kN²
          clauses — the page only offers values it can actually decide.
        </p>
        <div className="gf-buttons">
          <button className="btn" disabled={running || !decidable} onClick={runSingle}>
            {mode === "single" && running ? "Deciding…" : `Decide k = ${k}`}
          </button>
          {running && mode === "single" && (
            <button className="btn secondary" onClick={cancel}>
              Cancel
            </button>
          )}
        </div>
        {!decidable && <p className="section-note">{difficulty.note}</p>}

        {state && mode === "single" && (
          <>
            {running && (
              <div className="msg msg-info">
                Refuting F({n},{k}) — {state.progress.conflicts.toLocaleString()} conflicts, {seconds(state.elapsedMs)}{" "}
                elapsed.
                <div className="gf-progress">
                  <div
                    className="gf-progress-bar"
                    style={{ width: `${Math.min(100, (state.progress.conflicts / state.progress.budget) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            {state.done && state.cancelled && <div className="msg msg-info">Cancelled. Nothing is claimed either way.</div>}
            {single?.verdict === "forced" && (
              <div className="msg msg-good">
                <strong>Yes — {single.k} dots force it.</strong> F({n},{single.k}) is unsatisfiable, so there is no
                arrangement of {single.k} dots on this grid without {shapeArticle(shape)} {shapeName(shape)}. The solver reached that in{" "}
                {single.stats.conflicts.toLocaleString()} conflicts over {single.numClauses.toLocaleString()} clauses.
              </div>
            )}
            {single?.verdict === "avoidable" && (
              <div className="msg msg-warn">
                <strong>No — {single.k} dots are not enough.</strong> F({n},{single.k}) is satisfiable, and its model is
                an arrangement of {single.witness?.length} dots with no copy of the shape.{" "}
                <button className="gf-inline-btn" onClick={() => onPlace(single.witness as number[])}>
                  place it on the board
                </button>
              </div>
            )}
            {single?.verdict === "undecided" && (
              <div className="msg msg-warn">
                <strong>Undecided within the budget.</strong> {CONFLICT_BUDGET.toLocaleString()} conflicts were not
                enough for k = {single.k}. Neither answer is implied by that.
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
