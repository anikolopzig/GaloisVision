// Smoke tests for the ball-packing math.
// Run with: npx tsx scripts/smoke-packing.ts

import {
  bestK,
  cellIndex,
  centreBounds,
  contacts,
  distance,
  gridLayout,
  hexLayout,
  lensArea,
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
  wrap,
  type Ball,
  type Domain,
  type Packing,
} from "../src/math/packing";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}  ${detail}`);
  }
}
function near(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps;
}
function dom(radius: number, over: Partial<Domain> = {}): Domain {
  return { side: 1, radius, geometry: "square", confine: false, ...over };
}
function pack(balls: Ball[], radius: number, over: Partial<Domain> = {}): Packing {
  return { balls, ...dom(radius, over) };
}
function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ---- wrapping ----
check("wrap inside", near(wrap(0.3, 1), 0.3));
check("wrap negative", near(wrap(-0.25, 1), 0.75));
check("wrap at side", near(wrap(1, 1), 0));

// ---- the domain a centre may occupy ----
{
  const free = centreBounds(dom(0.3));
  check("unconfined centres use the whole square", free.lo === 0 && free.hi === 1);
  const walled = centreBounds(dom(0.3, { confine: true }));
  check("confined centres are inset by r", near(walled.lo, 0.3) && near(walled.hi, 0.7));
  const hopeless = centreBounds(dom(0.6, { confine: true }));
  check("a ball bigger than the square collapses to the centre", hopeless.lo === 0.5 && hopeless.hi === 0.5);
}
{
  check(
    "unconfined centre clamps to the square, ball may overhang",
    near(normalizeCentre({ x: 1.4, y: -0.2 }, dom(0.5)).x, 1) && near(normalizeCentre({ x: 1.4, y: -0.2 }, dom(0.5)).y, 0),
  );
  const w = normalizeCentre({ x: 0.95, y: 0.5 }, dom(0.2, { confine: true }));
  check("confined centre is pushed off the wall", near(w.x, 0.8));
  const t = normalizeCentre({ x: 1.25, y: -0.25 }, dom(0.2, { geometry: "torus" }));
  check("torus centre wraps instead of clamping", near(t.x, 0.25) && near(t.y, 0.75));
}

// ---- distance ----
{
  const a = { x: 0.05, y: 0.5 };
  const b = { x: 0.95, y: 0.5 };
  check("square distance is euclidean", near(distance(a, b, 1, "square"), 0.9));
  check("torus distance wraps", near(distance(a, b, 1, "torus"), 0.1, 1e-12));
}
check(
  "torus distance wraps diagonally",
  near(distance({ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }, 1, "torus"), Math.hypot(0.2, 0.2), 1e-12),
);

// ---- lens area ----
check("disjoint disks share nothing", lensArea(2, 1) === 0);
check("far disks share nothing", lensArea(3, 1) === 0);
check("coincident disks share the whole disk", near(lensArea(0, 1), Math.PI));
check(
  "half-radius lens matches the closed form",
  near(lensArea(1, 1), 2 * Math.acos(0.5) - Math.sqrt(3) / 2, 1e-12),
  `${lensArea(1, 1)}`,
);
check("lens shrinks as centres separate", lensArea(0.5, 1) > lensArea(1.5, 1));

// ---- contacts in the square ----
check("disjoint pair has no contact", contacts(pack([{ x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }], 0.2)).length === 0);
check("tangent pair counts as disjoint", contacts(pack([{ x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }], 0.25)).length === 0);
{
  const cs = contacts(pack([{ x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }], 0.3));
  check("overlapping pair has one contact", cs.length === 1, `got ${cs.length}`);
  check("contact depth is 2r − d", cs.length === 1 && near(cs[0].depth, 0.1, 1e-12));
  check("contact area matches lensArea", cs.length === 1 && near(cs[0].area, lensArea(0.5, 0.3), 1e-12));
}
{
  const p = pack([{ x: 0.45, y: 0.45 }, { x: 0.55, y: 0.45 }, { x: 0.5, y: 0.55 }], 0.2);
  check("triangle has three contacts", contacts(p).length === 3);
  check("pair count counts unordered pairs", overlappingPairCount(contacts(p)) === 3);
  check("all three balls are flagged", overlappingBalls(contacts(p)).size === 3);
}
{
  const p = pack([{ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.2 }, { x: 0.9, y: 0.9 }], 0.1);
  check("a lone ball is not flagged as overlapping", !overlappingBalls(contacts(p)).has(2));
}

// ---- contacts on the torus ----
{
  const balls = [{ x: 0.05, y: 0.5 }, { x: 0.95, y: 0.5 }];
  check("seam pair is disjoint in the square", contacts(pack(balls, 0.2)).length === 0);
  const cs = contacts(pack(balls, 0.2, { geometry: "torus" }));
  check("seam pair overlaps on the torus", cs.length === 1, `got ${cs.length}`);
  check("seam contact uses a nonzero shift", cs.length === 1 && cs[0].shift[0] !== 0);
}
{
  const cs = contacts(pack([{ x: 0.5, y: 0.5 }], 0.6, { geometry: "torus" }));
  check("a lone big ball self-overlaps on the torus", cs.length > 0 && cs.every((c) => c.i === c.j));
  check("a lone ball never self-overlaps in the square", contacts(pack([{ x: 0.5, y: 0.5 }], 0.6)).length === 0);
  check("self-contacts are not double counted", cs.length === 2, `got ${cs.length}`);
}
check(
  "a ball with 2r ≤ L does not self-overlap",
  contacts(pack([{ x: 0.5, y: 0.5 }], 0.49, { geometry: "torus" })).length === 0,
);

// ---- aggregate measures ----
{
  const p = pack([{ x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }], 0.3);
  check("total overlap area sums the lenses", near(totalOverlapArea(contacts(p)), lensArea(0.5, 0.3), 1e-12));
  check("density is n·πr²/L²", near(packingDensity(p), 2 * Math.PI * 0.09, 1e-12));
  const m = minCentreDistance(p);
  check("min centre distance found", m !== null && near(m.dist, 0.5, 1e-12));
}
check(
  "torus min distance falls back to the side length",
  (() => {
    const m = minCentreDistance(pack([{ x: 0.5, y: 0.5 }], 1, { geometry: "torus" }));
    return m !== null && near(m.dist, 1);
  })(),
);

// ---- layouts ----
{
  const balls = gridLayout(9, dom(0.1));
  check("grid produces n balls", balls.length === 9);
  check("grid is overlap-free at r = L/(2·cols)", contacts(pack(balls, 1 / 6)).length === 0);
  check("grid centres stay in the square", balls.every((b) => b.x >= 0 && b.x <= 1 && b.y >= 0 && b.y <= 1));
}
{
  const balls = gridLayout(4, dom(0.4, { confine: true }));
  check("confinement insets the grid by r", balls.every((b) => b.x >= 0.4 - 1e-12 && b.x <= 0.6 + 1e-12));
}
{
  const balls = hexLayout(7, dom(0.1, { geometry: "torus" }));
  check("hex produces n balls", balls.length === 7);
  check("hex offsets alternate rows", balls.some((b, i) => i > 0 && !near(b.x % (1 / 3), balls[0].x % (1 / 3), 1e-9)));
  check("torus layout centres are wrapped", balls.every((b) => b.x >= 0 && b.x < 1 && b.y >= 0 && b.y < 1));
}
{
  const balls = randomLayout(20, dom(0.05), lcg(7));
  check("random produces n balls in the square", balls.length === 20 && balls.every((b) => b.x >= 0 && b.x <= 1));
}
{
  const rng = lcg(12345);
  const { balls, placed } = scatterLayout(6, dom(0.1), rng);
  check("scatter places every ball when there is room", placed === 6, `placed ${placed}`);
  check("scatter output is overlap-free", contacts(pack(balls, 0.1)).length === 0);
  check("scatter gives up when the radius is hopeless", scatterLayout(10, dom(0.45), rng, 200).placed < 10);
  check(
    "scatter refuses outright when a ball hits its own image",
    scatterLayout(3, dom(0.6, { geometry: "torus" }), rng, 200).placed === 0,
  );
}

// ---- relaxation ----
{
  let balls: Ball[] = [
    { x: 0.5, y: 0.5 },
    { x: 0.52, y: 0.5 },
    { x: 0.5, y: 0.52 },
    { x: 0.48, y: 0.49 },
  ];
  const r = 0.12;
  check("crowded start overlaps", contacts(pack(balls, r)).length > 0);
  for (let i = 0; i < 200; i++) balls = relax(pack(balls, r), 0.6, () => 0.5);
  check("relaxation separates them", contacts(pack(balls, r)).length === 0);
}
{
  // Coincident centres still get pushed apart (the random-direction branch).
  let balls: Ball[] = [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }];
  const rng = lcg(99);
  for (let i = 0; i < 200; i++) balls = relax(pack(balls, 0.1), 0.6, rng);
  check("coincident centres come apart", contacts(pack(balls, 0.1)).length === 0);
}
{
  // Four balls of r just under 1/4, confined: relaxation should reach the corners.
  let balls: Ball[] = gridLayout(4, dom(0.24, { confine: true })).map((b) => ({ x: b.x + 0.02, y: b.y - 0.02 }));
  for (let i = 0; i < 400; i++) balls = relax(pack(balls, 0.24, { confine: true }), 0.6, () => 0.5);
  check("confined relaxation reaches an overlap-free packing", contacts(pack(balls, 0.24, { confine: true })).length === 0);
  check("confined relaxation respects the walls", balls.every((b) => b.x >= 0.24 - 1e-9 && b.x <= 0.76 + 1e-9));
}
{
  // Overlap *area* is the quantity relaxation decreases. The pair count is not:
  // spreading a jammed crowd trades a few deep overlaps for more shallow ones,
  // so it can go up while the picture plainly improves.
  let worse = 0;
  let improved = 0;
  for (let trial = 0; trial < 25; trial++) {
    const rng = lcg(1000 + trial * 37);
    const d = dom(0.14, { confine: true }); // 12 balls this size cannot fit: it stays crowded
    let balls = randomLayout(12, d, rng);
    const before = totalOverlapArea(contacts({ balls, ...d }));
    for (let i = 0; i < 300; i++) balls = relax({ balls, ...d }, 0.6, rng);
    const after = totalOverlapArea(contacts({ balls, ...d }));
    if (after > before) worse++;
    if (after < before / 4) improved++;
  }
  check("relaxation never increases the overlapping area", worse === 0, `${worse}/25 got worse`);
  check("relaxation cuts a hopeless crowd's overlap sharply", improved >= 23, `${improved}/25 improved 4x`);
}
{
  // A crowded but feasible case should come apart completely.
  let cleared = 0;
  for (let trial = 0; trial < 10; trial++) {
    const rng = lcg(4242 + trial * 13);
    const d = dom(0.1, { confine: true });
    let balls = randomLayout(12, d, rng);
    for (let i = 0; i < 600; i++) balls = relax({ balls, ...d }, 0.6, rng);
    if (contacts({ balls, ...d }).length === 0) cleared++;
  }
  check("relaxation clears a feasible crowd", cleared >= 9, `${cleared}/10 cleared`);
}
{
  // On the torus, relaxation wraps rather than piling up against a wall.
  let balls: Ball[] = [
    { x: 0.02, y: 0.5 },
    { x: 0.06, y: 0.5 },
    { x: 0.98, y: 0.5 },
  ];
  const d: Partial<Domain> = { geometry: "torus" };
  for (let i = 0; i < 400; i++) balls = relax(pack(balls, 0.12, d), 0.6, () => 0.5);
  check("torus relaxation separates across the seam", contacts(pack(balls, 0.12, d)).length === 0);
  check("torus relaxation keeps centres wrapped", balls.every((b) => b.x >= 0 && b.x < 1));
}

// ---- pigeonhole ----
check("bestK(2) = 1", bestK(2) === 1);
check("bestK(4) = 1", bestK(4) === 1);
check("bestK(5) = 2", bestK(5) === 2);
check("bestK(9) = 2", bestK(9) === 2);
check("bestK(10) = 3", bestK(10) === 3);
check("bestK(17) = 4", bestK(17) === 4);
check("bestK(1) = 0 (nothing to prove)", bestK(1) === 0);
{
  let ok = true;
  for (let n = 2; n <= 200; n++) {
    const k = bestK(n);
    if (!(k * k < n && (k + 1) * (k + 1) >= n)) ok = false;
  }
  check("bestK is the largest k with k² < n, for n ≤ 200", ok);
}
{
  // The class example: two balls of radius 3/4 with centres in a unit square.
  const p = pack([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }], 0.75);
  const rep = pigeonhole(p, bestK(2));
  check("class example: k = 1", rep.k === 1);
  check("class example: 2 > 1² forces a shared cell", rep.forcesSharedCell);
  check("class example: cell diameter is √2", near(rep.cellDiameter, Math.SQRT2, 1e-12));
  check("class example: threshold radius is √2/2", near(rep.forcedRadius, Math.SQRT2 / 2, 1e-12));
  check("class example: r = 3/4 forces an overlap", rep.forcedOverlap);
  check("class example: the balls really do overlap", contacts(p).length === 1);
  check(
    "class example: the two centres furthest apart still overlap",
    contacts(pack([{ x: 0, y: 0 }, { x: 1, y: 1 }], 0.75)).length === 1,
  );
}
check(
  "just below the threshold nothing is forced",
  !pigeonhole(pack([{ x: 0, y: 0 }, { x: 1, y: 1 }], Math.SQRT2 / 2 - 0.01), 1).forcedOverlap,
);
check(
  "exactly at the threshold nothing is forced (tangency is allowed)",
  !pigeonhole(pack([{ x: 0, y: 0 }, { x: 1, y: 1 }], Math.SQRT2 / 2), 1).forcedOverlap,
);
{
  const rep = pigeonhole(pack(gridLayout(5, dom(0.1)), 0.1), bestK(5));
  check("five balls use a 2×2 grid", rep.k === 2 && rep.cells === 4);
  check("five balls: threshold is √2/4", near(rep.forcedRadius, Math.SQRT2 / 4, 1e-12));
  check("five in four cells share a cell in practice", rep.sharedCells.length >= 1);
  check("occupancy totals n", rep.occupancy.reduce((a, b) => a + b, 0) === 5);
}
{
  const rep = pigeonhole(pack(gridLayout(4, dom(0.1)), 0.1), 2);
  check("four balls in a 2×2 grid share no cell", rep.sharedCells.length === 0 && !rep.forcesSharedCell);
}
check("cellIndex bottom-left", cellIndex({ x: 0.1, y: 0.1 }, 2, 1) === 0);
check("cellIndex bottom-right", cellIndex({ x: 0.9, y: 0.1 }, 2, 1) === 1);
check("cellIndex top-left", cellIndex({ x: 0.1, y: 0.9 }, 2, 1) === 2);
check("cellIndex top-right", cellIndex({ x: 0.9, y: 0.9 }, 2, 1) === 3);
check("cellIndex clamps the far corner", cellIndex({ x: 1, y: 1 }, 2, 1) === 3);

// ---- the bound is honest: it never claims an overlap that isn't there ----
{
  const rng = lcg(987654321);
  let squareViolations = 0;
  let torusViolations = 0;
  for (let trial = 0; trial < 400; trial++) {
    const n = 2 + Math.floor(rng() * 10);
    const r = 0.02 + rng() * 0.3;
    const balls: Ball[] = [];
    for (let i = 0; i < n; i++) balls.push({ x: rng(), y: rng() });
    if (pigeonhole(pack(balls, r), bestK(n)).forcedOverlap && contacts(pack(balls, r)).length === 0) squareViolations++;
    const t: Partial<Domain> = { geometry: "torus" };
    if (pigeonhole(pack(balls, r, t), bestK(n)).forcedOverlap && contacts(pack(balls, r, t)).length === 0) torusViolations++;
  }
  check("forced overlap always shows up in the square", squareViolations === 0, `${squareViolations} violations`);
  check("forced overlap always shows up on the torus", torusViolations === 0, `${torusViolations} violations`);
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
