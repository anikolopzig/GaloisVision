// Shared colors for the SVP/CVP plots. Kept in a plain .ts module so the plot
// components export only components (clean react-refresh).

export const PLOT_COLORS = {
  b1: "#ff9d6c", // orange
  b2: "#7ee2c8", // teal
  b3: "#9bd870", // green
  target: "#ff6ec7", // pink
  babai: "#a899ff", // violet
  best: "#74c0fc", // blue
  ghost: "#6b7080", // grey
  cell: "#ffd966", // yellow
} as const;

export const BASIS_COLORS = [PLOT_COLORS.b1, PLOT_COLORS.b2, PLOT_COLORS.b3];
