// Grid size, shape, and the buttons that rearrange the board.

import { useState } from "react";
import type { ShapeSpec } from "../../math/gridForcing";
import { MAX_GRID, MIN_GRID } from "./limits";

type IntFieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  hint?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
};

/**
 * An integer you can type or drag. The typed text is held locally while the
 * field is being edited, so a half-finished "1" on the way to "12" is not
 * clamped out from under the cursor.
 */
export function IntField({ label, value, min, max, hint, disabled, onChange }: IntFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)));

  return (
    <div className="gf-field">
      <div className="gf-field-head">
        <span className="gf-field-label">{label}</span>
        {hint && <span className="gf-field-hint">{hint}</span>}
      </div>
      <div className="gf-field-row">
        <input
          className="vec-input gf-num"
          inputMode="numeric"
          disabled={disabled}
          value={draft ?? String(value)}
          onChange={(e) => {
            setDraft(e.target.value);
            const v = Number(e.target.value);
            if (e.target.value.trim() !== "" && Number.isFinite(v)) onChange(clamp(v));
          }}
          onBlur={() => setDraft(null)}
        />
        <input
          className="gf-slider"
          type="range"
          disabled={disabled}
          min={min}
          max={max}
          step={1}
          value={Math.min(max, Math.max(min, value))}
          onChange={(e) => {
            setDraft(null);
            onChange(clamp(Number(e.target.value)));
          }}
        />
      </div>
    </div>
  );
}

type ToggleProps = { label: string; checked: boolean; hint?: string; onChange: (v: boolean) => void };

export function Toggle({ label, checked, hint, onChange }: ToggleProps) {
  return (
    <label className="gf-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
      {hint && <span className="gf-field-hint">{hint}</span>}
    </label>
  );
}

type Props = {
  n: number;
  shape: ShapeSpec;
  configCount: number;
  showSafe: boolean;
  showLabels: boolean;
  onN: (n: number) => void;
  onShape: (patch: Partial<ShapeSpec>) => void;
  onShowSafe: (v: boolean) => void;
  onShowLabels: (v: boolean) => void;
  onClear: () => void;
  onFill: () => void;
  onShuffle: () => void;
  /** False when a shuffle could not move anything: an empty or a completely full board. */
  canShuffle: boolean;
  onGreedy: () => void;
};

export function Controls({
  n,
  shape,
  configCount,
  showSafe,
  showLabels,
  onN,
  onShape,
  onShowSafe,
  onShowLabels,
  onClear,
  onFill,
  onShuffle,
  canShuffle,
  onGreedy,
}: Props) {
  return (
    <div className="card gf-controls">
      <h3>Grid</h3>
      <IntField
        label="Size N"
        value={n}
        min={MIN_GRID}
        max={MAX_GRID}
        hint={`${n * n} cells`}
        onChange={onN}
      />

      <h3 style={{ marginTop: 18 }}>Shape to force</h3>
      <div className="dim-toggle">
        <button
          className={`btn secondary${shape.id === "isosceles" ? " active" : ""}`}
          onClick={() => onShape({ id: "isosceles" })}
        >
          Triangle
        </button>
        <button
          className={`btn secondary${shape.id === "square" ? " active" : ""}`}
          onClick={() => onShape({ id: "square" })}
        >
          Square
        </button>
      </div>
      {shape.id === "isosceles" ? (
        <>
          <p className="section-note" style={{ marginTop: 8 }}>
            Three cells with at least two equal side lengths — an <em>isosceles</em> triangle, in any position and at
            any tilt. Equality is tested on squared distances, so it is exact integer arithmetic.
          </p>
          <Toggle
            label="Count collinear triples too"
            checked={shape.allowCollinear}
            hint={shape.allowCollinear ? "degenerate triples included" : "zero-area triples excluded"}
            onChange={(v) => onShape({ allowCollinear: v })}
          />
        </>
      ) : (
        <>
          <p className="section-note" style={{ marginTop: 8 }}>
            Four cells forming a square. Tilted ones count by default — the corners of a square need not sit on grid
            lines, only its vertices need to be grid cells.
          </p>
          <Toggle
            label="Axis-aligned squares only"
            checked={shape.axisAligned}
            hint={shape.axisAligned ? "sides parallel to the axes" : "any tilt"}
            onChange={(v) => onShape({ axisAligned: v })}
          />
        </>
      )}
      <div className="gf-count mono">
        {configCount.toLocaleString()} {configCount === 1 ? "copy" : "copies"} fit in this grid
      </div>

      <h3 style={{ marginTop: 18 }}>Arrange</h3>
      <div className="gf-buttons">
        <button className="btn secondary" onClick={onClear}>
          Clear
        </button>
        <button
          className="btn secondary"
          onClick={onShuffle}
          disabled={!canShuffle}
          title={canShuffle ? undefined : "Place some dots — but not every cell — to shuffle them"}
        >
          Shuffle
        </button>
        <button className="btn secondary" onClick={onFill}>
          Fill
        </button>
        <button className="btn" onClick={onGreedy}>
          Greedy shape-free
        </button>
      </div>
      <p className="section-note">
        <em>Shuffle</em> keeps however many dots you have placed and deals them to new cells, so you can see how
        differently the same number of them can land. <em>Greedy shape-free</em> walks the cells in a random order
        and keeps every one that does not complete a copy. It is not optimal, but whatever it returns is checked, so
        its size is a genuine lower bound on how far you can get.
      </p>

      <h3 style={{ marginTop: 18 }}>Show</h3>
      <Toggle
        label="Cells that are still safe to add"
        checked={showSafe}
        hint="dashed rings"
        onChange={onShowSafe}
      />
      <Toggle label="Coordinates and squared lengths" checked={showLabels} onChange={onShowLabels} />
    </div>
  );
}
