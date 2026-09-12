// The knobs of the ball-packing page, plus the worked examples the page ships
// with. Plain .ts so the components stay component-only exports.

import type { Domain, Geometry } from "../../math/packing";

export type Settings = {
  n: number;
  radius: number;
  side: number;
  geometry: Geometry;
  /** Square only: whole balls inside the walls, rather than just centres inside. */
  confine: boolean;
  /** Torus only: show the neighbouring tiles faintly outside the square. */
  showGhosts: boolean;
  showLabels: boolean;
  showPigeonhole: boolean;
  /** WalkSAT's noise p: chance of clearing a conflicting pair in a random direction rather than the best one. */
  noise: number;
  /** Track the finest grid the argument applies to (k² < n) instead of a fixed k. */
  autoK: boolean;
  k: number;
};

export const MAX_BALLS = 48;
export const MIN_SIDE = 0.1;
export const MAX_SIDE = 100;
/**
 * How far the side-length slider drags. Only the ratio r/L decides whether a
 * packing fits, so a larger square buys nothing the radius cannot; the typed box
 * still reaches MAX_SIDE for anyone who wants the room.
 */
export const SLIDER_SIDE = 10;
export const MAX_K = 10;

export function domainOf(s: Settings): Domain {
  return { side: s.side, radius: s.radius, geometry: s.geometry, confine: s.confine };
}

export const DEFAULTS: Settings = {
  n: 2,
  radius: 0.75,
  side: 1,
  geometry: "square",
  confine: false,
  showGhosts: true,
  showLabels: true,
  showPigeonhole: true,
  noise: 0.15,
  autoK: true,
  k: 1,
};

export type Preset = {
  label: string;
  note: string;
  /** How to seed the centres when no explicit ones are given. */
  layout: "grid" | "hex";
  /** Explicit centres as fractions of the side, used in place of `layout` when given. */
  centres?: [number, number][];
  settings: Partial<Settings>;
};

export const PRESETS: Preset[] = [
  {
    label: "2 balls, r = ¾",
    note: "The example from class: two balls of radius 3/4 with centres in a unit square must overlap.",
    layout: "grid",
    settings: { n: 2, radius: 0.75, side: 1, geometry: "square", confine: false, showPigeonhole: true },
  },
  {
    label: "5 balls, r = √2⁄4",
    note: "The pigeonhole bound is sharp here. Four corners and the centre put every pair exactly √2/2 apart, so at r = √2/4 the balls are all tangent and nothing overlaps — and any larger radius is forced to. Nudge r up a hair and watch every contact turn red.",
    layout: "grid",
    centres: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [0.5, 0.5],
    ],
    settings: { n: 5, radius: Math.SQRT2 / 4, side: 1, geometry: "square", confine: false, showPigeonhole: true },
  },
  {
    label: "4 balls packed in the walls",
    note: "The honest packing problem: four balls of radius 1/4 fit inside a unit square exactly, one per corner.",
    layout: "grid",
    settings: { n: 4, radius: 0.25, side: 1, geometry: "square", confine: true, showPigeonhole: false },
  },
  {
    label: "7 balls on the torus",
    note: "Glue the edges and the corners stop being special — a hexagonal arrangement can wrap around.",
    layout: "hex",
    settings: { n: 7, radius: 0.16, side: 1, geometry: "torus", showPigeonhole: false, showGhosts: true },
  },
  {
    label: "One ball, r > L⁄2",
    note: "On the torus a single ball wide enough to wrap all the way round runs into its own image.",
    layout: "grid",
    settings: { n: 1, radius: 0.62, side: 1, geometry: "torus", showPigeonhole: false, showGhosts: true },
  },
];
