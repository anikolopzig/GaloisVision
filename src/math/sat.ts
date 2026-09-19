// A CDCL SAT solver, in the MiniSat/Glucose lineage: two-watched-literal
// propagation, first-UIP clause learning with basic self-subsumption
// minimisation, EVSIDS decision heuristic with phase saving, Luby restarts and
// LBD-driven clause-database reduction.
//
// Why a solver lives in this repo at all: the grid-forcing page (src/math/
// gridForcing.ts) answers "do k dots force a shape?" by *refuting* a formula,
// and the whole point of that reduction is that UNSAT is the affirmative
// answer. A satisfying assignment can be checked by hand; "no assignment
// exists" cannot, so the search has to actually run — and, like everything else
// here, it runs in the browser with no backend.
//
// Framework-free: imports nothing, and is driven from React only through
// `solveCnf`/`SatSolver`. Everything is integer arithmetic on typed arrays.
//
// Literal encoding. Variables are 1-based, as in DIMACS. Internally a literal
// is `2*v` when positive and `2*v + 1` when negative, so negation is `lit ^ 1`
// and `lit >> 1` recovers the variable. Watch lists are indexed by literal,
// following MiniSat's convention that `watches[p]` holds the clauses in which
// `¬p` is watched — i.e. exactly the clauses that need attention when `p`
// becomes true.

/** `"unknown"` means the search hit its conflict budget, not that the formula is undecidable. */
export type SatStatus = "sat" | "unsat" | "unknown";

export type SatStats = {
  conflicts: number;
  decisions: number;
  propagations: number;
  restarts: number;
  /** Learnt clauses currently retained (reduction discards the rest). */
  learnts: number;
  /** Learnt clauses discarded by database reduction so far. */
  discarded: number;
};

export type SatResult = {
  status: SatStatus;
  /** Present only when `status === "sat"`: `model[v]` is true iff variable v is assigned true. */
  model?: boolean[];
  stats: SatStats;
};

const UNDEF = -1;

/** DIMACS ±v to the internal literal encoding. */
export function toLit(dimacs: number): number {
  return dimacs > 0 ? dimacs * 2 : -dimacs * 2 + 1;
}

/** Internal literal back to DIMACS ±v. */
export function toDimacs(lit: number): number {
  return lit & 1 ? -(lit >> 1) : lit >> 1;
}

/**
 * Luby's restart sequence 1,1,2,1,1,2,4,… — the optimal universal strategy for
 * runs of unknown length, which is exactly the situation here.
 */
export function luby(y: number, x: number): number {
  let size = 1;
  let seq = 0;
  while (size < x + 1) {
    seq++;
    size = 2 * size + 1;
  }
  let i = x;
  let s = size;
  while (s - 1 !== i) {
    s = (s - 1) >> 1;
    seq--;
    i = i % s;
  }
  return Math.pow(y, seq);
}

/**
 * A max-heap of variables ordered by activity. Decisions always take the most
 * active unassigned variable, so the heap must support decreasing a key
 * (`insert` re-heapifies an element already present) and removal of the max.
 */
class VarOrder {
  private heap: number[] = [];
  private pos: Int32Array;
  private activity: Float64Array;

  constructor(activity: Float64Array, nVars: number) {
    this.activity = activity;
    this.pos = new Int32Array(nVars + 1).fill(-1);
  }

  private less(a: number, b: number): boolean {
    return this.activity[a] > this.activity[b];
  }

  private up(i: number): void {
    const x = this.heap[i];
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(x, this.heap[p])) break;
      this.heap[i] = this.heap[p];
      this.pos[this.heap[i]] = i;
      i = p;
    }
    this.heap[i] = x;
    this.pos[x] = i;
  }

  private down(i: number): void {
    const x = this.heap[i];
    const n = this.heap.length;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && this.less(this.heap[c + 1], this.heap[c])) c++;
      if (!this.less(this.heap[c], x)) break;
      this.heap[i] = this.heap[c];
      this.pos[this.heap[i]] = i;
      i = c;
    }
    this.heap[i] = x;
    this.pos[x] = i;
  }

  contains(v: number): boolean {
    return this.pos[v] >= 0;
  }

  /** Insert v, or restore the heap order around it if it is already in. */
  insert(v: number): void {
    if (this.contains(v)) {
      this.up(this.pos[v]);
      return;
    }
    this.pos[v] = this.heap.length;
    this.heap.push(v);
    this.up(this.pos[v]);
  }

  /** Called after an activity bump: the variable can only have moved up. */
  increased(v: number): void {
    if (this.contains(v)) this.up(this.pos[v]);
  }

  removeMax(): number {
    const top = this.heap[0];
    const last = this.heap.pop() as number;
    this.pos[top] = -1;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.pos[last] = 0;
      this.down(0);
    }
    return top;
  }

  get size(): number {
    return this.heap.length;
  }
}

export type SolveOptions = {
  /**
   * Stop and return `"unknown"` after this many conflicts *in this call*. The
   * solver keeps its state, so calling `solve` again continues the same search;
   * that is what lets the page stay responsive without a worker.
   */
  maxConflicts?: number;
};

export class SatSolver {
  readonly nVars: number;

  /** 0 unassigned, 1 true, -1 false, indexed by variable. */
  private assign: Int8Array;
  private level: Int32Array;
  /** Clause index that forced this variable, or UNDEF for decisions. */
  private reason: Int32Array;
  /** Last value the variable took, reused on the next decision (phase saving). */
  private saved: Int8Array;
  private seen: Uint8Array;

  private activity: Float64Array;
  private varInc = 1;
  private readonly varDecay = 0.95;
  private order: VarOrder;

  private clauses: number[][] = [];
  private claActivity: number[] = [];
  private claLbd: number[] = [];
  private claLearnt: boolean[] = [];
  private claDead: boolean[] = [];
  private claInc = 1;
  private readonly claDecay = 0.999;
  private learntRefs: number[] = [];
  private maxLearnts = 0;

  private watches: number[][];
  private trail: number[] = [];
  private trailLim: number[] = [];
  private qhead = 0;

  /** Cleared once a conflict at level 0 is derived; the formula is UNSAT for good. */
  private ok = true;
  private restartCount = 0;
  private stats: SatStats = {
    conflicts: 0,
    decisions: 0,
    propagations: 0,
    restarts: 0,
    learnts: 0,
    discarded: 0,
  };

  constructor(nVars: number) {
    this.nVars = nVars;
    this.assign = new Int8Array(nVars + 1);
    this.level = new Int32Array(nVars + 1);
    this.reason = new Int32Array(nVars + 1).fill(UNDEF);
    this.saved = new Int8Array(nVars + 1).fill(-1);
    this.seen = new Uint8Array(nVars + 1);
    this.activity = new Float64Array(nVars + 1);
    this.order = new VarOrder(this.activity, nVars);
    this.watches = Array.from({ length: 2 * (nVars + 1) }, () => [] as number[]);
    for (let v = nVars; v >= 1; v--) this.order.insert(v);
  }

  private litValue(lit: number): number {
    const a = this.assign[lit >> 1];
    return lit & 1 ? -a : a;
  }

  private get decisionLevel(): number {
    return this.trailLim.length;
  }

  /**
   * Add a clause given in DIMACS form. Returns false once the formula is known
   * unsatisfiable (an empty clause, or a unit contradicting an earlier one).
   * Tautologies and repeated literals are dropped, so the caller may be sloppy.
   */
  addClause(dimacsLits: readonly number[]): boolean {
    if (!this.ok) return false;
    const lits: number[] = [];
    const seenLit = new Set<number>();
    for (const d of dimacsLits) {
      if (d === 0 || Math.abs(d) > this.nVars) {
        throw new RangeError(`literal ${d} is outside 1…${this.nVars}`);
      }
      const lit = toLit(d);
      if (seenLit.has(lit ^ 1)) return true; // tautology: always satisfied
      if (seenLit.has(lit)) continue;
      seenLit.add(lit);
      if (this.litValue(lit) === 1 && this.level[lit >> 1] === 0) return true;
      if (this.litValue(lit) === -1 && this.level[lit >> 1] === 0) continue;
      lits.push(lit);
    }
    if (lits.length === 0) {
      this.ok = false;
      return false;
    }
    if (lits.length === 1) {
      this.uncheckedEnqueue(lits[0], UNDEF);
      if (this.propagate() !== UNDEF) this.ok = false;
      return this.ok;
    }
    this.attach(this.newClause(lits, false, 0));
    return true;
  }

  private newClause(lits: number[], learnt: boolean, lbd: number): number {
    const ref = this.clauses.length;
    this.clauses.push(lits);
    this.claActivity.push(0);
    this.claLbd.push(lbd);
    this.claLearnt.push(learnt);
    this.claDead.push(false);
    if (learnt) this.learntRefs.push(ref);
    return ref;
  }

  private attach(ref: number): void {
    const c = this.clauses[ref];
    this.watches[c[0] ^ 1].push(ref);
    this.watches[c[1] ^ 1].push(ref);
  }

  private uncheckedEnqueue(lit: number, from: number): void {
    const v = lit >> 1;
    this.assign[v] = lit & 1 ? -1 : 1;
    this.level[v] = this.decisionLevel;
    this.reason[v] = from;
    this.trail.push(lit);
  }

  /**
   * Unit propagation over the watch lists. Returns the index of a conflicting
   * clause, or UNDEF if the assignment closed under implication.
   */
  private propagate(): number {
    let confl = UNDEF;
    while (this.qhead < this.trail.length) {
      const p = this.trail[this.qhead++];
      this.stats.propagations++;
      const falseLit = p ^ 1;
      const ws = this.watches[p];
      let i = 0;
      let j = 0;
      while (i < ws.length) {
        const ref = ws[i++];
        if (this.claDead[ref]) continue;
        const c = this.clauses[ref];
        // Keep the newly false literal in slot 1, so slot 0 is the candidate unit.
        if (c[0] === falseLit) {
          c[0] = c[1];
          c[1] = falseLit;
        }
        const first = c[0];
        if (this.litValue(first) === 1) {
          ws[j++] = ref;
          continue;
        }
        let moved = false;
        for (let t = 2; t < c.length; t++) {
          if (this.litValue(c[t]) !== -1) {
            c[1] = c[t];
            c[t] = falseLit;
            this.watches[c[1] ^ 1].push(ref);
            moved = true;
            break;
          }
        }
        if (moved) continue;
        ws[j++] = ref;
        if (this.litValue(first) === -1) {
          confl = ref;
          this.qhead = this.trail.length;
          while (i < ws.length) ws[j++] = ws[i++];
        } else {
          this.uncheckedEnqueue(first, ref);
        }
      }
      ws.length = j;
      if (confl !== UNDEF) break;
    }
    return confl;
  }

  private bumpVar(v: number): void {
    this.activity[v] += this.varInc;
    if (this.activity[v] > 1e100) {
      for (let i = 1; i <= this.nVars; i++) this.activity[i] *= 1e-100;
      this.varInc *= 1e-100;
    }
    this.order.increased(v);
  }

  private bumpClause(ref: number): void {
    this.claActivity[ref] += this.claInc;
    if (this.claActivity[ref] > 1e20) {
      for (const r of this.learntRefs) this.claActivity[r] *= 1e-20;
      this.claInc *= 1e-20;
    }
  }

  /**
   * First-UIP conflict analysis. Walks the trail backwards from the conflict
   * until exactly one literal of the current decision level remains; that
   * literal, negated, becomes the asserting literal of the learnt clause.
   */
  private analyze(confl: number): { learnt: number[]; btLevel: number; lbd: number } {
    const learnt: number[] = [0];
    const touched: number[] = [];
    let pathC = 0;
    let p = UNDEF;
    let index = this.trail.length - 1;

    do {
      const c = this.clauses[confl];
      if (this.claLearnt[confl]) this.bumpClause(confl);
      // Slot 0 of a reason clause holds the literal it propagated; skip it.
      for (let k = p === UNDEF ? 0 : 1; k < c.length; k++) {
        const q = c[k];
        const v = q >> 1;
        if (!this.seen[v] && this.level[v] > 0) {
          this.seen[v] = 1;
          touched.push(v);
          this.bumpVar(v);
          if (this.level[v] >= this.decisionLevel) pathC++;
          else learnt.push(q);
        }
      }
      while (!this.seen[this.trail[index--] >> 1]);
      p = this.trail[index + 1];
      confl = this.reason[p >> 1];
      this.seen[p >> 1] = 0;
      pathC--;
    } while (pathC > 0);
    learnt[0] = p ^ 1;

    // Basic self-subsumption: drop any literal whose own reason is already
    // covered by literals of the clause, since resolving it away is a no-op.
    let keep = 1;
    for (let i = 1; i < learnt.length; i++) {
      const v = learnt[i] >> 1;
      const r = this.reason[v];
      let redundant = r !== UNDEF;
      if (redundant) {
        const rc = this.clauses[r];
        for (let k = 1; k < rc.length; k++) {
          const u = rc[k] >> 1;
          if (!this.seen[u] && this.level[u] > 0) {
            redundant = false;
            break;
          }
        }
      }
      if (!redundant) learnt[keep++] = learnt[i];
    }
    learnt.length = keep;
    for (const v of touched) this.seen[v] = 0;

    let btLevel = 0;
    if (learnt.length > 1) {
      let maxI = 1;
      for (let i = 2; i < learnt.length; i++) {
        if (this.level[learnt[i] >> 1] > this.level[learnt[maxI] >> 1]) maxI = i;
      }
      const tmp = learnt[1];
      learnt[1] = learnt[maxI];
      learnt[maxI] = tmp;
      btLevel = this.level[learnt[1] >> 1];
    }

    // LBD: how many decision levels the clause spans. Glucose's observation is
    // that clauses spanning few levels are the ones worth keeping.
    const levels = new Set<number>();
    for (const q of learnt) levels.add(this.level[q >> 1]);
    return { learnt, btLevel, lbd: levels.size };
  }

  private cancelUntil(target: number): void {
    if (this.decisionLevel <= target) return;
    const from = this.trailLim[target];
    for (let i = this.trail.length - 1; i >= from; i--) {
      const v = this.trail[i] >> 1;
      this.saved[v] = this.assign[v];
      this.assign[v] = 0;
      this.reason[v] = UNDEF;
      if (!this.order.contains(v)) this.order.insert(v);
    }
    this.trail.length = from;
    this.trailLim.length = target;
    this.qhead = from;
  }

  private pickBranchLit(): number {
    while (this.order.size > 0) {
      const v = this.order.removeMax();
      if (this.assign[v] === 0) {
        this.stats.decisions++;
        // Phase saving: revisit the value the variable last held.
        return this.saved[v] === 1 ? v * 2 : v * 2 + 1;
      }
    }
    return UNDEF;
  }

  private locked(ref: number): boolean {
    const c = this.clauses[ref];
    const v = c[0] >> 1;
    return this.reason[v] === ref && this.assign[v] !== 0 && this.litValue(c[0]) === 1;
  }

  /**
   * Discard the least useful half of the learnt clauses. Clauses of LBD ≤ 2 are
   * glue clauses and always kept; so are clauses currently serving as a reason,
   * since the trail points at them.
   */
  private reduceDb(): void {
    const survivors = this.learntRefs.filter((r) => !this.claDead[r]);
    survivors.sort((a, b) => this.claLbd[b] - this.claLbd[a] || this.claActivity[a] - this.claActivity[b]);
    const target = Math.floor(survivors.length / 2);
    let removed = 0;
    const kept: number[] = [];
    for (const ref of survivors) {
      if (removed < target && this.claLbd[ref] > 2 && this.clauses[ref].length > 2 && !this.locked(ref)) {
        this.claDead[ref] = true;
        removed++;
      } else {
        kept.push(ref);
      }
    }
    this.learntRefs = kept;
    this.stats.discarded += removed;
    if (removed === 0) return;
    for (const ws of this.watches) ws.length = 0;
    for (let ref = 0; ref < this.clauses.length; ref++) {
      if (!this.claDead[ref]) this.attach(ref);
    }
  }

  /**
   * Run the search. Returns `"unknown"` if the conflict budget for this call
   * runs out; call again to pick up where it stopped.
   */
  solve(options: SolveOptions = {}): SatStatus {
    const budget = options.maxConflicts ?? Infinity;
    if (!this.ok) return "unsat";
    if (this.maxLearnts === 0) {
      this.maxLearnts = Math.max(200, Math.floor(this.clauses.length / 3));
    }
    let spent = 0;
    let sinceRestart = 0;
    let restartLimit = 128 * luby(2, this.restartCount);

    for (;;) {
      const confl = this.propagate();
      if (confl !== UNDEF) {
        this.stats.conflicts++;
        spent++;
        sinceRestart++;
        if (this.decisionLevel === 0) {
          this.ok = false;
          return "unsat";
        }
        const { learnt, btLevel, lbd } = this.analyze(confl);
        this.cancelUntil(btLevel);
        if (learnt.length === 1) {
          this.uncheckedEnqueue(learnt[0], UNDEF);
        } else {
          const ref = this.newClause(learnt, true, lbd);
          this.attach(ref);
          this.bumpClause(ref);
          this.uncheckedEnqueue(learnt[0], ref);
        }
        this.varInc /= this.varDecay;
        this.claInc /= this.claDecay;
        this.stats.learnts = this.learntRefs.length;

        if (this.learntRefs.length >= this.maxLearnts + this.trail.length) {
          this.reduceDb();
          this.maxLearnts = Math.floor(this.maxLearnts * 1.1);
        }
        if (spent >= budget) {
          this.cancelUntil(0);
          return "unknown";
        }
        if (sinceRestart >= restartLimit) {
          this.restartCount++;
          this.stats.restarts++;
          sinceRestart = 0;
          restartLimit = 128 * luby(2, this.restartCount);
          this.cancelUntil(0);
        }
      } else {
        const next = this.pickBranchLit();
        if (next === UNDEF) return "sat";
        this.trailLim.push(this.trail.length);
        this.uncheckedEnqueue(next, UNDEF);
      }
    }
  }

  /** Only meaningful right after `solve` returned `"sat"`. */
  model(): boolean[] {
    const m = new Array<boolean>(this.nVars + 1).fill(false);
    for (let v = 1; v <= this.nVars; v++) m[v] = this.assign[v] === 1;
    return m;
  }

  getStats(): SatStats {
    return { ...this.stats };
  }
}

/** One-shot convenience wrapper: build, solve, hand back the model. */
export function solveCnf(nVars: number, clauses: readonly (readonly number[])[], options: SolveOptions = {}): SatResult {
  const s = new SatSolver(nVars);
  for (const c of clauses) {
    if (!s.addClause(c)) break;
  }
  const status = s.solve(options);
  return { status, model: status === "sat" ? s.model() : undefined, stats: s.getStats() };
}

/**
 * Independent check that an assignment really satisfies a CNF — used by the
 * smoke tests and by the page, so a reported witness is never taken on trust
 * from the solver that produced it.
 */
export function verifyModel(clauses: readonly (readonly number[])[], model: readonly boolean[]): boolean {
  for (const c of clauses) {
    let ok = false;
    for (const d of c) {
      const v = Math.abs(d);
      if (model[v] === d > 0) {
        ok = true;
        break;
      }
    }
    if (!ok) return false;
  }
  return true;
}

/** DIMACS text for a CNF, the standard interchange format for SAT instances. */
export function toDimacsText(nVars: number, clauses: readonly (readonly number[])[]): string {
  const lines = [`p cnf ${nVars} ${clauses.length}`];
  for (const c of clauses) lines.push(`${c.join(" ")} 0`);
  return `${lines.join("\n")}\n`;
}
