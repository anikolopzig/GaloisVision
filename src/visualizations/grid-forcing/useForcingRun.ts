// Driving the solver from React without freezing the page.
//
// There is no worker here: `ForcingRun.step` is resumable, so the search is cut
// into slices of a couple of hundred conflicts and a `setTimeout(0)` between
// them hands the browser back its event loop. That keeps the UI live, keeps
// cancellation immediate, and keeps everything in one module graph.

import { useCallback, useEffect, useRef, useState } from "react";
import { ForcingRun, type KOutcome, type Occurrence, type RunConfig } from "../../math/gridForcing";
import { SLICE_CONFLICTS, SLICE_MS } from "./limits";

export type RunState = {
  config: RunConfig;
  outcomes: KOutcome[];
  done: boolean;
  cancelled: boolean;
  /** The threshold, once an upward scan has found its first refutation. */
  answer: number | null;
  /** True when a k exhausted its conflict budget: the run stopped, it did not conclude. */
  gaveUp: boolean;
  progress: { k: number; conflicts: number; budget: number };
  elapsedMs: number;
};

function snapshot(run: ForcingRun, startedAt: number, cancelled: boolean): RunState {
  return {
    config: run.config,
    outcomes: [...run.outcomes],
    done: run.done || cancelled,
    cancelled,
    answer: run.answer,
    gaveUp: run.gaveUp,
    progress: run.progress,
    elapsedMs: performance.now() - startedAt,
  };
}

export function useForcingRun() {
  const runRef = useRef<ForcingRun | null>(null);
  const startedAt = useRef(0);
  const [state, setState] = useState<RunState | null>(null);
  // Bumped after every slice; the effect below watches it, so each render
  // schedules the next slice until the run finishes.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const run = runRef.current;
    if (!run || run.done) return;
    let abandoned = false;
    const id = window.setTimeout(() => {
      if (abandoned) return;
      const t0 = performance.now();
      while (!run.done && performance.now() - t0 < SLICE_MS) run.step(SLICE_CONFLICTS);
      setState(snapshot(run, startedAt.current, false));
      setTick((t) => t + 1);
    }, 0);
    return () => {
      abandoned = true;
      window.clearTimeout(id);
    };
  }, [tick]);

  const start = useCallback((config: RunConfig, forbidden: readonly Occurrence[]) => {
    const run = new ForcingRun(config, forbidden);
    runRef.current = run;
    startedAt.current = performance.now();
    setState(snapshot(run, startedAt.current, false));
    setTick((t) => t + 1);
  }, []);

  const cancel = useCallback(() => {
    const run = runRef.current;
    runRef.current = null;
    if (run) setState(snapshot(run, startedAt.current, true));
  }, []);

  const reset = useCallback(() => {
    runRef.current = null;
    setState(null);
  }, []);

  const running = state !== null && !state.done;
  return { state, running, start, cancel, reset };
}

/** The last arrangement the run exhibited, if any — the thing worth putting back on the board. */
export function lastWitness(outcomes: readonly KOutcome[]): KOutcome | null {
  for (let i = outcomes.length - 1; i >= 0; i--) {
    if (outcomes[i].verdict === "avoidable" && outcomes[i].witness) return outcomes[i];
  }
  return null;
}
