// Geometry of n equal balls (disks) of radius r over a square of side L.
//
// Two ambient spaces:
//   "square" — the plain square. Centres live in [0, L]². By default balls may
//              overhang the walls: that is the setting the pigeonhole argument
//              is about, which only ever talks about where the centres are. Set
//              `confine` to additionally demand that whole balls sit inside,
//              which pins centres to [r, L-r]² and is the honest packing problem.
//   "torus"  — the square with opposite edges glued, i.e. the quotient ℝ²/(Lℤ)².
//              Centres roam freely in [0, L)², a ball leaving one edge re-enters
//              from the opposite one, and distance is the minimal image.
//
// Unlike the rest of src/math/, this layer works in floating point rather than
// exact Rationals: circle-circle lens areas and the pigeonhole bound √2·L/k are
// transcendental, so there is no exact rational model worth preserving. The code
// is still framework-free and imports nothing.

export type Geometry = "square" | "torus";

/** Centre of a ball, in the same units as the side length. */
export type Ball = { x: number; y: number };

/** Where the balls live and how big they are — everything except the centres. */
export type Domain = {
  side: number;
  radius: number;
  geometry: Geometry;
  /** Square only: require whole balls inside the walls rather than just centres inside. */
  confine: boolean;
};

export type Packing = Domain & { balls: Ball[] };

/**
 * One overlapping pair. On the torus a ball can meet a *translate* of another
 * ball (or of itself), so the translate is recorded in `shift`: the contact is
 * between ball i and ball j moved by (shift[0]·L, shift[1]·L). `i === j` means a
 * ball wrapping all the way round and running into its own image, which happens
 * exactly when 2r > L.
 */
export type Contact = {
  i: number;
  j: number;
  shift: [number, number];
  dist: number;
  /** How deep the two disks interpenetrate: 2r − dist, always > 0. */
  depth: number;
  /** Area of the lens the two disks share. */
  area: number;
};

/**
 * Two disks whose boundaries land within this multiple of the diameter of each
 * other count as tangent rather than overlapping. Tangency is the interesting
 * boundary case — a perfect packing touches everywhere — and iterative
 * separation only ever approaches it from below, so a bare `d < 2r` test would
 * report a settled packing as overlapping forever.
 */
export const TOUCH_TOL = 1e-9;

/** Fold a coordinate back into [0, side). */
export function wrap(v: number, side: number): number {
  if (!(side > 0)) return v;
  const m = v % side;
  return m < 0 ? m + side : m;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** The interval a centre coordinate is allowed to occupy, in square geometry. */
export function centreBounds(d: Domain): { lo: number; hi: number } {
  if (!d.confine) return { lo: 0, hi: d.side };
  if (2 * d.radius >= d.side) return { lo: d.side / 2, hi: d.side / 2 }; // nothing fits
  return { lo: d.radius, hi: d.side - d.radius };
}

/** Put a centre where it is allowed to live: wrapped on the torus, clamped in the square. */
export function normalizeCentre(b: Ball, d: Domain): Ball {
  if (d.geometry === "torus") return { x: wrap(b.x, d.side), y: wrap(b.y, d.side) };
  const { lo, hi } = centreBounds(d);
  return { x: clamp(b.x, lo, hi), y: clamp(b.y, lo, hi) };
}

/** Vector from a to b, taking the shortest representative on the torus. */
export function separation(a: Ball, b: Ball, side: number, geometry: Geometry): { dx: number; dy: number; dist: number } {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (geometry === "torus" && side > 0) {
    dx -= side * Math.round(dx / side);
    dy -= side * Math.round(dy / side);
  }
  return { dx, dy, dist: Math.hypot(dx, dy) };
}

export function distance(a: Ball, b: Ball, side: number, geometry: Geometry): number {
  return separation(a, b, side, geometry).dist;
}

/** Area shared by two disks of equal radius r whose centres are d apart. */
export function lensArea(d: number, r: number): number {
  if (r <= 0) return 0;
  if (d >= 2 * r) return 0;
  if (d <= 0) return Math.PI * r * r;
  const half = d / 2;
  return 2 * r * r * Math.acos(half / r) - half * Math.sqrt(Math.max(0, 4 * r * r - d * d));
}

/**
 * How far a translate has to reach before it can possibly touch: on the torus a
 * ball of radius r reaches ⌈2r/L⌉ tiles away, which is more than one tile once
 * r > L/2.
 */
export function shiftRange(d: Domain): number {
  if (d.geometry !== "torus" || !(d.side > 0)) return 0;
  return Math.max(1, Math.ceil((2 * d.radius) / d.side));
}

/**
 * Every overlapping pair, each counted once.
 *
 * On the torus a pair {i, j} is scanned over all translates, and a ball is
 * scanned against its own translates over the lexicographically positive half of
 * the shift lattice — the region ball i covers twice via the shift s is the same
 * region it covers twice via −s, so taking half the shifts counts each doubled
 * patch exactly once.
 */
export function contacts(p: Packing): Contact[] {
  const { balls, radius, side } = p;
  const out: Contact[] = [];
  if (!(radius > 0)) return out;
  const reach = 2 * radius * (1 - TOUCH_TOL);
  const R = shiftRange(p);
  const push = (i: number, j: number, sx: number, sy: number) => {
    const dx = balls[j].x + sx * side - balls[i].x;
    const dy = balls[j].y + sy * side - balls[i].y;
    const dist = Math.hypot(dx, dy);
    if (dist >= reach) return;
    out.push({ i, j, shift: [sx, sy], dist, depth: 2 * radius - dist, area: lensArea(dist, radius) });
  };

  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      for (let sx = -R; sx <= R; sx++) for (let sy = -R; sy <= R; sy++) push(i, j, sx, sy);
    }
    // A ball against its own wrapped images (torus only).
    for (let sx = 0; sx <= R; sx++) {
      for (let sy = -R; sy <= R; sy++) {
        if (sx === 0 && sy <= 0) continue; // keep only lexicographically positive shifts
        push(i, i, sx, sy);
      }
    }
  }
  return out;
}

/** Number of distinct unordered ball pairs that overlap somewhere (self-contacts included). */
export function overlappingPairCount(cs: Contact[]): number {
  const seen = new Set<string>();
  for (const c of cs) seen.add(`${c.i}:${c.j}`);
  return seen.size;
}

/** Which balls are involved in at least one overlap. */
export function overlappingBalls(cs: Contact[]): Set<number> {
  const seen = new Set<number>();
  for (const c of cs) {
    seen.add(c.i);
    seen.add(c.j);
  }
  return seen;
}

/**
 * Summed area of all the lenses. Where three or more balls pile up on the same
 * patch that patch is counted once per pair, so this is an upper bound on the
 * doubly-covered area rather than its exact measure.
 */
export function totalOverlapArea(cs: Contact[]): number {
  let s = 0;
  for (const c of cs) s += c.area;
  return s;
}

/**
 * Closest two centres — or a centre and one of its own images, on the torus.
 * Half of this is the largest radius these centres could carry without overlap.
 */
export function minCentreDistance(p: Packing): { dist: number; i: number; j: number } | null {
  const { balls, side, geometry } = p;
  let best: { dist: number; i: number; j: number } | null = null;
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const d = distance(balls[i], balls[j], side, geometry);
      if (!best || d < best.dist) best = { dist: d, i, j };
    }
  }
  if (geometry === "torus" && balls.length > 0 && (!best || side < best.dist)) {
    // Every ball sits exactly `side` away from its own nearest image.
    best = { dist: side, i: 0, j: 0 };
  }
  return best;
}

/** Fraction of the square covered, counting overlaps twice: n·πr²/L². */
export function packingDensity(p: Packing): number {
  if (!(p.side > 0)) return 0;
  return (p.balls.length * Math.PI * p.radius * p.radius) / (p.side * p.side);
}

// ---------------------------------------------------------------- layouts ----

export type LayoutMode = "grid" | "hex" | "random" | "scatter";

function place(balls: Ball[], d: Domain): Ball[] {
  return balls.map((b) => normalizeCentre(b, d));
}

/** A ⌈√n⌉-column grid of cell centres. */
export function gridLayout(n: number, d: Domain): Ball[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const out: Ball[] = [];
  for (let k = 0; k < n; k++) {
    const c = k % cols;
    const r = Math.floor(k / cols);
    out.push({ x: ((c + 0.5) / cols) * d.side, y: ((r + 0.5) / rows) * d.side });
  }
  return place(out, d);
}

/** Rows offset by half a step — the densest arrangement in the plane. */
export function hexLayout(n: number, d: Domain): Ball[] {
  const cols = Math.max(1, Math.round(Math.sqrt((n * 2) / Math.sqrt(3))));
  const rows = Math.max(1, Math.ceil(n / cols));
  const out: Ball[] = [];
  for (let k = 0; k < n; k++) {
    const c = k % cols;
    const r = Math.floor(k / cols);
    const offset = r % 2 === 0 ? 0 : 0.5;
    out.push({ x: ((c + 0.5 + offset) / cols) * d.side, y: ((r + 0.5) / rows) * d.side });
  }
  return place(out, d);
}

/** Uniformly random centres, overlaps allowed. */
export function randomLayout(n: number, d: Domain, rng: () => number): Ball[] {
  const out: Ball[] = [];
  for (let k = 0; k < n; k++) out.push({ x: rng() * d.side, y: rng() * d.side });
  return place(out, d);
}

/**
 * Rejection sampling for a genuinely non-overlapping arrangement. Reports how
 * many balls it managed to place; `placed < n` is evidence (not proof) that the
 * radius is too big for this many balls. Any balls it gave up on are dropped in
 * at random so the count still comes out right.
 */
export function scatterLayout(
  n: number,
  d: Domain,
  rng: () => number,
  triesPerBall = 800,
): { balls: Ball[]; placed: number } {
  const out: Ball[] = [];
  const { lo, hi } = d.geometry === "torus" ? { lo: 0, hi: d.side } : centreBounds(d);
  const span = Math.max(0, hi - lo);
  const selfClash = d.geometry === "torus" && 2 * d.radius > d.side; // a ball would hit its own image
  for (let k = 0; k < n; k++) {
    let put: Ball | null = null;
    for (let t = 0; !selfClash && t < triesPerBall; t++) {
      const cand = { x: lo + rng() * span, y: lo + rng() * span };
      let ok = true;
      for (let m = 0; ok && m < out.length; m++) {
        if (distance(out[m], cand, d.side, d.geometry) < 2 * d.radius * (1 - TOUCH_TOL)) ok = false;
      }
      if (ok) {
        put = cand;
        break;
      }
    }
    if (!put) break;
    out.push(put);
  }
  const placed = out.length;
  while (out.length < n) out.push({ x: lo + rng() * span, y: lo + rng() * span });
  return { balls: place(out, d), placed };
}

/**
 * One relaxation sweep: every overlapping pair pushes its two balls apart along
 * the line of centres by half the interpenetration each, scaled by `rate`.
 * Repeated sweeps settle into a non-overlapping arrangement when one exists.
 *
 * The pairs are resolved one after another against the positions as they stand,
 * rather than all at once against a snapshot of the sweep's start: each pair
 * then sees the moves its predecessors already made, which converges a little
 * faster and leaves a smaller residual. Each ball is also put back inside its
 * domain as soon as it moves, so it never drifts through a wall and gets yanked
 * back at the end of the sweep into something it had just been pushed out of.
 *
 * Note that the *number* of overlapping pairs can rise across a sweep even as
 * the overlapping area falls: relaxing a crowd trades a few deep overlaps for
 * more shallow contacts. Overlap area, not pair count, is what decreases.
 */
export function relax(p: Packing, rate = 0.6, rng: () => number = Math.random): Ball[] {
  const { balls, radius, side } = p;
  const moved = balls.map((b) => normalizeCentre(b, p));
  for (const c of contacts(p)) {
    if (c.i === c.j) continue; // a ball meeting its own image cannot be fixed by moving it
    // Re-measure: earlier pairs in this sweep have already moved these two.
    const dx = moved[c.j].x + c.shift[0] * side - moved[c.i].x;
    const dy = moved[c.j].y + c.shift[1] * side - moved[c.i].y;
    const dist = Math.hypot(dx, dy);
    const depth = 2 * radius - dist;
    if (depth <= 0) continue;
    let ux: number, uy: number;
    if (dist < 1e-9) {
      const a = rng() * Math.PI * 2; // coincident centres: pick a direction
      ux = Math.cos(a);
      uy = Math.sin(a);
    } else {
      ux = dx / dist;
      uy = dy / dist;
    }
    const step = (depth / 2) * rate;
    moved[c.i] = normalizeCentre({ x: moved[c.i].x - ux * step, y: moved[c.i].y - uy * step }, p);
    moved[c.j] = normalizeCentre({ x: moved[c.j].x + ux * step, y: moved[c.j].y + uy * step }, p);
  }
  return moved;
}

// -------------------------------------------------------------- walk-sat ----

export type WalkSatResult = {
  balls: Ball[];
  /** Overlapping pairs in the arrangement returned. Self-overlap is excluded — no move fixes it. */
  violations: number;
  /** Overlapping pairs in the arrangement it was handed, so a caller can say what the search bought. */
  initialViolations: number;
  /** Steps taken; fewer than asked for when an overlap-free arrangement turned up early. */
  steps: number;
  /** No pair of distinct balls overlaps. On the torus a ball may still meet its own image. */
  solved: boolean;
};

export type WalkSatOptions = {
  steps?: number;
  /** Probability of taking the random move instead of the greedy one. */
  noise?: number;
  /** Positions tried per ball when moving greedily. */
  candidates?: number;
};

/**
 * WalkSAT, adapted from boolean satisfiability to disc packing.
 *
 * The correspondence: the *variables* are the centres (continuous here, not
 * boolean), and the *clauses* are the C(n,2) separation constraints
 * `dist(i, j) ≥ 2r`, one per pair. A violated clause is an overlapping pair.
 *
 * Each step follows WalkSAT's shape exactly:
 *   1. pick a violated clause uniformly at random — so effort goes where the
 *      arrangement is actually broken, never to balls that are already happy;
 *   2. with probability `noise`, move one of that pair's two balls somewhere
 *      random (the random walk);
 *   3. otherwise move whichever of the two balls, to whichever candidate spot,
 *      leaves the fewest violated clauses — ties broken by total
 *      interpenetration, which keeps the greedy step from stalling on the many
 *      candidates that tie on a bare count (the greedy descent).
 *
 * The noise is the whole point, and it is what `relax` lacks: relaxation only
 * ever moves downhill, so it settles into the first local minimum it reaches
 * and stays wedged there. A random move can push a ball clear out of a jam and
 * let the arrangement re-form somewhere better.
 *
 * The best arrangement seen is kept and returned, so on an instance with no
 * solution at all — a radius past the pigeonhole threshold, say — you still get
 * the best arrangement the search passed through rather than wherever it
 * happened to stop. That is WalkSAT's usual MAX-SAT behaviour.
 */
export function walkSat(p: Packing, rng: () => number = Math.random, opts: WalkSatOptions = {}): WalkSatResult {
  const steps = Math.max(0, opts.steps ?? 3000);
  const noise = Math.min(1, Math.max(0, opts.noise ?? 0.15));
  const candidates = Math.max(2, opts.candidates ?? 16);
  const { side, radius, geometry } = p;
  const n = p.balls.length;

  const balls = p.balls.map((b) => normalizeCentre(b, p));
  const slack = 2 * radius * TOUCH_TOL;

  // Pair state, kept incrementally: only the i < j half is ever written, so a
  // move costs one row update rather than a rescan of every pair.
  const depth = new Float64Array(n * n); // interpenetration per pair, 0 when clear
  let violations = 0;
  let totalDepth = 0;

  /** How deep two centres interpenetrate; ≤ 0 when they are clear of each other. */
  const gap = (a: Ball, b: Ball) => 2 * radius - distance(a, b, side, geometry);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const g = gap(balls[i], balls[j]);
      if (g > slack) {
        depth[i * n + j] = g;
        totalDepth += g;
        violations++;
      }
    }
  }
  const initialViolations = violations;

  const bounds = geometry === "torus" ? { lo: 0, hi: side } : centreBounds(p);
  const span = Math.max(0, bounds.hi - bounds.lo);

  /** What moving ball `b` to `pos` would cost: clauses left violated, and by how much. */
  function costAt(b: number, pos: Ball): { count: number; depth: number } {
    let count = 0;
    let sum = 0;
    for (let j = 0; j < n; j++) {
      if (j === b) continue;
      const g = gap(pos, balls[j]);
      if (g > slack) {
        count++;
        sum += g;
      }
    }
    return { count, depth: sum };
  }

  function moveTo(b: number, pos: Ball) {
    balls[b] = pos;
    for (let j = 0; j < n; j++) {
      if (j === b) continue;
      const k = b < j ? b * n + j : j * n + b;
      const was = depth[k];
      const g = gap(pos, balls[j]);
      const now = g > slack ? g : 0;
      depth[k] = now;
      totalDepth += now - was;
      if (now > 0 && was === 0) violations++;
      else if (now === 0 && was > 0) violations--;
    }
  }

  /**
   * A spot for ball `b` that clears `partner`: on the circle of radius 2r about
   * the partner, at `angle`. Every move the search makes satisfies the clause it
   * picked — which is what WalkSAT's variable flips do — and the question is only
   * which direction to leave in.
   */
  function repairAt(partner: number, angle: number): Ball {
    const clear = 2 * radius * (1 + 1e-9);
    return normalizeCentre(
      { x: balls[partner].x + Math.cos(angle) * clear, y: balls[partner].y + Math.sin(angle) * clear },
      p,
    );
  }

  /** The cheapest direction to leave in: straight out along the current line of centres. */
  function escapeAngle(b: number, partner: number): number {
    const sep = separation(balls[partner], balls[b], side, geometry);
    return sep.dist < 1e-9 ? rng() * Math.PI * 2 : Math.atan2(sep.dy, sep.dx);
  }

  let best = balls.map((b) => ({ x: b.x, y: b.y }));
  let bestViolations = violations;
  let bestDepth = totalDepth;
  let taken = 0;

  for (let step = 0; step < steps && violations > 0; step++) {
    taken = step + 1;

    // Pick a violated clause uniformly at random. Reservoir sampling over the
    // pair table avoids rebuilding a list of every conflict each step.
    let picked = -1;
    let seen = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (depth[i * n + j] > 0) {
          seen++;
          if (rng() * seen < 1) picked = i * n + j;
        }
      }
    }
    if (picked < 0) break;
    const i = Math.floor(picked / n);
    const j = picked % n;

    if (rng() < noise) {
      // The random walk: clear the pair in a direction chosen blindly.
      const b = rng() < 0.5 ? i : j;
      moveTo(b, repairAt(b === i ? j : i, rng() * Math.PI * 2));
    } else {
      // The greedy descent: of the two balls and the directions on offer, take
      // whichever leaves the fewest clauses violated. Ties go to the shallower
      // total interpenetration, without which the many candidates that tie on a
      // bare count would make the step a coin flip.
      let choice: { b: number; pos: Ball; count: number; depth: number } | null = null;
      for (const b of [i, j]) {
        const partner = b === i ? j : i;
        for (let c = 0; c < candidates; c++) {
          const pos =
            c === 0
              ? repairAt(partner, escapeAngle(b, partner)) // the smallest move that works
              : c === 1
                ? normalizeCentre(
                    { x: bounds.lo + rng() * span, y: bounds.lo + rng() * span },
                    p,
                  ) // one wildcard, in case this ball belongs somewhere else entirely
                : repairAt(partner, rng() * Math.PI * 2);
          const cost = costAt(b, pos);
          if (!choice || cost.count < choice.count || (cost.count === choice.count && cost.depth < choice.depth)) {
            choice = { b, pos, count: cost.count, depth: cost.depth };
          }
        }
      }
      if (choice) moveTo(choice.b, choice.pos);
    }

    if (violations < bestViolations || (violations === bestViolations && totalDepth < bestDepth)) {
      bestViolations = violations;
      bestDepth = totalDepth;
      best = balls.map((b) => ({ x: b.x, y: b.y }));
    }
  }

  return {
    balls: best,
    violations: bestViolations,
    initialViolations,
    steps: taken,
    solved: bestViolations === 0,
  };
}

// ------------------------------------------------------------ pigeonhole ----

export type PigeonholeReport = {
  k: number;
  /** k² — the number of pigeonholes. */
  cells: number;
  /** n > k²: some cell is forced to hold two centres. */
  forcesSharedCell: boolean;
  /** √2·L/k — the diameter of one cell, hence the most two centres in it can be apart. */
  cellDiameter: number;
  /** Any radius strictly above √2·L/(2k) forces an overlap. */
  forcedRadius: number;
  /** Both conditions hold: no arrangement of these n balls avoids an overlap. */
  forcedOverlap: boolean;
  /** Centre count per cell, row-major from the bottom-left. */
  occupancy: number[];
  /** Indices into `occupancy` of the cells that actually hold two or more centres. */
  sharedCells: number[];
};

/**
 * The finest grid pigeonhole still applies to: the largest k with k² < n, which
 * gives the smallest radius threshold. 0 when n < 2 — nothing to prove.
 */
export function bestK(n: number): number {
  if (n < 2) return 0;
  let k = Math.floor(Math.sqrt(n - 1));
  while ((k + 1) * (k + 1) < n) k++;
  while (k > 1 && k * k >= n) k--;
  return Math.max(1, k);
}

export function cellIndex(b: Ball, k: number, side: number): number {
  const col = clamp(Math.floor((b.x / side) * k), 0, k - 1);
  const row = clamp(Math.floor((b.y / side) * k), 0, k - 1);
  return row * k + col;
}

/**
 * The pigeonhole argument run against the current configuration: cut the square
 * into k×k cells of side L/k. If n > k² two centres share a cell, so they are at
 * most one cell diagonal √2·L/k apart, so any radius above half of that forces
 * an overlap — whatever the arrangement. The bound holds on the torus too, since
 * torus distance never exceeds distance measured in the square.
 */
export function pigeonhole(p: Packing, k: number): PigeonholeReport {
  const { balls, radius, side } = p;
  const safeK = Math.max(1, Math.floor(k));
  const occupancy = new Array<number>(safeK * safeK).fill(0);
  for (const b of balls) occupancy[cellIndex(b, safeK, side)]++;
  const sharedCells: number[] = [];
  for (let i = 0; i < occupancy.length; i++) if (occupancy[i] >= 2) sharedCells.push(i);
  const cellDiameter = (Math.SQRT2 * side) / safeK;
  const forcesSharedCell = balls.length > safeK * safeK;
  return {
    k: safeK,
    cells: safeK * safeK,
    forcesSharedCell,
    cellDiameter,
    forcedRadius: cellDiameter / 2,
    forcedOverlap: forcesSharedCell && 2 * radius > cellDiameter,
    occupancy,
    sharedCells,
  };
}
