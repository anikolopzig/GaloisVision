# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

GaloisVision is a client-only React + TypeScript + Vite single-page app: a collection of interactive visualizations for first-course abstract-algebra concepts. All computation runs in the browser; there is no backend.

## Commands

```bash
npm run dev        # Vite dev server at http://localhost:5173
npm run build      # tsc -b && vite build  (type errors FAIL the build)
npm run preview    # serve the production build
npm run lint       # ESLint (flat config)

# Tests are hand-rolled smoke scripts run directly with tsx — there is no test runner:
npx tsx scripts/smoke.ts            # Galois group computation (assertions + exit code)
npx tsx scripts/smoke-lattice.ts    # lattice math (assertions + exit code)
npx tsx scripts/smoke-svp-cvp.ts    # Gauss reduction / Babai rounding (assertions + exit code)
npx tsx scripts/smoke-packing.ts    # ball packing + pigeonhole bound (assertions + exit code)
npx tsx scripts/smoke-sat.ts        # CDCL solver vs. exhaustive enumeration (assertions + exit code)
npx tsx scripts/smoke-grid-forcing.ts  # grid shape-forcing reduction (assertions + exit code; ~1 min)
npx tsx scripts/smoke-pattern.ts    # hand-drawn pattern enumerator (assertions + exit code)
```

To exercise the math layer without the UI, write a throwaway `tsx` script importing from `src/math/*` — that is the fastest way to validate computational changes. Each smoke script prints `PASS/FAIL` lines and exits non-zero on failure.

Note: Node 20.17 prints a "Vite requires 20.19+" warning that is harmless; builds succeed anyway.

## Architecture

**Registry-driven visualizations.** `src/visualizations/registry.tsx` is the single source of truth. Each entry is `{ id, title, description, status, Component? }`. The home page (`src/pages/Home.tsx`) renders cards from this list and the router (`src/App.tsx`) serves ready ones at `/v/:id`. **Adding a visualization = create a component folder under `src/visualizations/<name>/` and append one registry entry.** `status: "planned"` entries show as disabled cards with no route. Do not wire routes manually.

**Two-layer split — pure math vs. presentation:**
- `src/math/` is framework-free TypeScript. It exports exact, well-tested primitives and never imports React. The base layer is `rational.ts` (exact `Rational = {n, d}` backed by `BigInt`); everything is built on it so discriminants, determinants, covolumes, and square tests are exact with no floating-point drift. `parser.ts` → `polynomial.ts` → `galoisGroup.ts`/`groups.ts`/`quadField.ts` form the Galois pipeline; `lattice.ts` is the lattice-analysis layer; `notation.ts` holds shared sub/superscript label helpers. Floats are derived (`toNumber`) only at the last moment for plotting. The one deliberate exception is `packing.ts`, which works in floating point throughout: circle-circle lens areas and the pigeonhole bound √2·L/k are transcendental, so there is no exact rational model to preserve. It is still framework-free, and it exports `TOUCH_TOL` because tangency — two disks exactly 2r apart — is the case that matters there and a bare `d < 2r` test would call a settled packing overlapping forever.
- `patternShape.ts` enumerates the copies of a *hand-drawn* shape. The built-in families each have a closed-form loop; a shape the user clicks out has none, so "a copy" is defined as the image of a plane similarity that lands every point back on the grid, and the four motion classes (`similar`/`congruent`/`aligned`/`translation`) are nested restrictions on its multiplier. Points are Gaussian integers, the multiplier is carried as a ratio of them, and "lands on a lattice point" is a divisibility test — exact, like the squared-distance tests elsewhere. It imports nothing, and `gridForcing.ts` imports it (never the reverse). The cross-check worth knowing: the similar copies of the unit square are exactly `squares(n, false)`, and `scripts/smoke-pattern.ts` asserts it.
- `sat.ts` is the exception to "framework-free *and* small": a full CDCL SAT solver (two-watched literals, first-UIP learning, VSIDS, Luby restarts, LBD clause-database reduction). It exists because `gridForcing.ts` answers "do k dots force a shape?" by *refuting* a formula, and UNSAT is a claim about every assignment at once — it cannot be checked by inspection, so the search has to actually run, in the browser. `gridForcing.ts` builds the instances, and its `ForcingRun` is **resumable**: `step(conflicts)` advances the search by a bounded number of conflicts so the page can slice a long refutation across frames instead of freezing (see `grid-forcing/useForcingRun.ts` — there is no worker).
- `src/visualizations/<name>/` holds the React/SVG presentation. `index.tsx` exports the top-level component named in the registry, owns input/parse/analyze state (heavy computation wrapped in `useMemo`), and composes smaller input/plot components.

**Rendering is hand-rolled SVG — there are no charting or 3D libraries.** Plots compute their own geometry and project to SVG (e.g. `lattice/LatticePlot3D.tsx` does its own orthographic 3D projection with pointer-drag rotation). View resets are done by changing a React `key` to remount, not by effects.

## Conventions and gotchas

- **`verbatimModuleSyntax` is on**: import types with `import type { … }`. Mixing value and type imports otherwise breaks the build.
- **`noUnusedLocals` / `noUnusedParameters` are on**: unused symbols fail `tsc`/build. Be careful when arguments are eagerly evaluated (e.g. don't `JSON.stringify` a `BigInt`).
- **Lint is not a clean gate.** Several pre-existing files report errors, notably `react-refresh/only-export-components`: plot components (`RootsPlot.tsx`, `LatticePlot3D.tsx`) deliberately export their color-palette constants alongside the component. This is the established pattern — matching it is correct; don't assume a lint error there means you broke something. Check that totals didn't *increase*.
- Keep shared pure helpers in `src/math/` (e.g. `notation.ts`, BigInt `gcdBig`/`lcmBig`/`absBig` exported from `rational.ts`) rather than re-implementing per component.
- Styling is one global stylesheet, `src/styles/global.css`, driven by CSS custom properties (the dark `--bg`/`--accent`/etc. palette). Reuse existing classes (`.card`, `.facts`/`.fact`, `.btn`, `.chip`, `.section-note`, `.legend-line`) before adding new ones.
