// The pad you draw a shape on.
//
// Whatever is clicked here becomes the shape the board hunts for: every copy of
// it that fits in the N × N grid turns into one forbidden configuration, exactly
// as the isosceles triples and the squares do. The only extra decision is what
// "a copy" is allowed to mean, which is what the motion buttons set.

import {
  MOTION_CLASSES,
  motionBlurb,
  motionName,
  type MotionClass,
} from "../../math/patternShape";
import {
  MAX_PATTERN_GRID,
  MAX_PATTERN_POINTS,
  MIN_PATTERN_GRID,
  PAD_PRESETS,
  type PadPreset,
} from "./limits";

const VIEW = 196;
const INSET = 24;

export type PatternPadProps = {
  size: number;
  cells: ReadonlySet<number>;
  motions: MotionClass;
  /** How many copies of this shape fit in the board's grid. */
  copies: number;
  /** The grid those copies were counted in, for the readout. */
  boardN: number;
  onSize: (size: number) => void;
  onToggle: (index: number) => void;
  onClear: () => void;
  onMotions: (m: MotionClass) => void;
  onPreset: (preset: PadPreset) => void;
};

export function PatternPad({
  size,
  cells,
  motions,
  copies,
  boardN,
  onSize,
  onToggle,
  onClear,
  onMotions,
  onPreset,
}: PatternPadProps) {
  const step = size > 1 ? (VIEW - 2 * INSET) / (size - 1) : 0;
  const x = (i: number) => INSET + i * step;
  // j upwards, matching the board and the coordinates the formula uses.
  const y = (j: number) => VIEW - INSET - j * step;
  const atCap = cells.size >= MAX_PATTERN_POINTS;

  return (
    <div className="gf-pad">
      <div className="gf-pad-row">
        <svg
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          width="100%"
          style={{ maxWidth: VIEW, display: "block" }}
          role="img"
          aria-label={`Pattern pad, ${size} by ${size}, ${cells.size} points chosen`}
        >
          <rect x={0} y={0} width={VIEW} height={VIEW} rx={8} fill="var(--surface)" stroke="var(--border)" />
          {Array.from({ length: size }, (_, i) =>
            Array.from({ length: size }, (__, j) => {
              const idx = i * size + j;
              const on = cells.has(idx);
              const blocked = !on && atCap;
              return (
                <g key={idx}>
                  <circle
                    cx={x(i)}
                    cy={y(j)}
                    r={on ? 7 : 4}
                    fill={on ? "var(--accent)" : "var(--border-strong)"}
                    fillOpacity={on ? 1 : 0.7}
                  />
                  <circle
                    cx={x(i)}
                    cy={y(j)}
                    r={Math.max(10, step / 2)}
                    fill="transparent"
                    style={{ cursor: blocked ? "not-allowed" : "pointer" }}
                    onClick={() => {
                      if (!blocked) onToggle(idx);
                    }}
                  >
                    <title>{blocked ? `At most ${MAX_PATTERN_POINTS} points` : `(${i},${j})`}</title>
                  </circle>
                </g>
              );
            }),
          )}
        </svg>

        <div className="gf-pad-side">
          <div className="gf-field">
            <div className="gf-field-head">
              <span className="gf-field-label">Pad size</span>
              <span className="gf-field-hint">
                {size}×{size}
              </span>
            </div>
            <input
              className="gf-slider"
              type="range"
              min={MIN_PATTERN_GRID}
              max={MAX_PATTERN_GRID}
              step={1}
              value={size}
              onChange={(e) => onSize(Number(e.target.value))}
            />
          </div>
          <div className="gf-count mono">
            {cells.size} {cells.size === 1 ? "point" : "points"}
            {atCap ? ` (the cap)` : ""}
          </div>
          <button className="btn secondary" onClick={onClear} disabled={cells.size === 0}>
            Clear the pad
          </button>
        </div>
      </div>

      <div className="examples" style={{ marginTop: 4 }}>
        {PAD_PRESETS.map((p) => (
          <button key={p.label} className="chip" onClick={() => onPreset(p)}>
            {p.label}
          </button>
        ))}
      </div>

      <h3 style={{ marginTop: 18 }}>What counts as a copy</h3>
      <div className="gf-motion-grid">
        {MOTION_CLASSES.map((m) => (
          <button
            key={m}
            className={`btn secondary${motions === m ? " active" : ""}`}
            onClick={() => onMotions(m)}
          >
            {motionName(m)}
          </button>
        ))}
      </div>
      <p className="section-note" style={{ marginTop: 8 }}>
        {motionBlurb(motions)}
      </p>

      <div className={`gf-count mono${copies === 0 ? " gf-count-empty" : ""}`}>
        {cells.size < 2
          ? "draw at least two points"
          : `${copies.toLocaleString()} ${copies === 1 ? "copy" : "copies"} fit in the ${boardN}×${boardN} grid`}
      </div>
      {cells.size >= 2 && copies === 0 && (
        <p className="section-note">
          Nothing to force: with no copy of this shape fitting anywhere in the grid, every arrangement avoids it
          trivially. A bigger grid or a looser motion class will bring copies back.
        </p>
      )}
    </div>
  );
}
