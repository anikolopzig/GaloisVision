// Colours for the ball-packing plot. Kept in a plain .ts module so the plot
// component exports only components (clean react-refresh).

// Ball hues walk the golden angle around a 300° arc starting at yellow, which
// deliberately skips the reds: red means overlap here and nothing else.
const HUE_START = 45;
const HUE_SPAN = 300;
const GOLDEN_ANGLE = 137.508;

function hueOf(i: number): number {
  return HUE_START + (((i * GOLDEN_ANGLE) % HUE_SPAN) + HUE_SPAN) % HUE_SPAN;
}

/** Body of ball i. */
export function ballFill(i: number): string {
  return `hsl(${hueOf(i).toFixed(1)}, 62%, 52%)`;
}

/** Rim and label of ball i — the same hue, lifted so it reads against the fill. */
export function ballEdge(i: number): string {
  return `hsl(${hueOf(i).toFixed(1)}, 85%, 76%)`;
}

export const OVERLAP_FILL = "#d92c2c";
export const OVERLAP_EDGE = "#ff9a9a";
export const OVERLAP_HATCH = "#ffd3d3";

export const SQUARE_BG = "#10131b";
export const SQUARE_EDGE = "#7a869e";
export const OUTSIDE_TINT = "#0b0d13";
export const CELL_LINE = "#333a4a";
export const SHARED_CELL_FILL = "rgba(240, 184, 76, 0.16)";
export const SHARED_CELL_EDGE = "rgba(240, 184, 76, 0.6)";
export const GLUE_ARROW = "#7ee2c8";
