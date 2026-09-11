import { useState } from "react";
import type { LayoutMode } from "../../math/packing";
import { num } from "./format";
import { MAX_BALLS, MAX_SIDE, MIN_SIDE, type Settings } from "./settings";

type FieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  slider?: boolean;
  hint?: string;
  onChange: (v: number) => void;
};

/**
 * A number you can either type or drag. The typed text is held locally while the
 * field is being edited so half-finished input like "0." survives a keystroke.
 */
export function NumberField({ label, value, min, max, step, decimals = 4, slider = true, hint, onChange }: FieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  return (
    <div className="pack-field">
      <div className="pack-field-head">
        <span className="pack-field-label">{label}</span>
        {hint && <span className="pack-field-hint">{hint}</span>}
      </div>
      <div className="pack-field-row">
        <input
          className="vec-input pack-num"
          inputMode="decimal"
          value={draft ?? num(value, decimals)}
          onChange={(e) => {
            setDraft(e.target.value);
            const v = Number(e.target.value);
            if (e.target.value.trim() !== "" && Number.isFinite(v)) onChange(clamp(v));
          }}
          onBlur={() => setDraft(null)}
        />
        {slider && (
          <input
            className="pack-slider"
            type="range"
            min={min}
            max={max}
            step={step}
            value={Math.min(max, Math.max(min, value))}
            onChange={(e) => {
              setDraft(null);
              onChange(clamp(Number(e.target.value)));
            }}
          />
        )}
      </div>
    </div>
  );
}

type ToggleProps = { label: string; checked: boolean; disabled?: boolean; hint?: string; onChange: (v: boolean) => void };

export function Toggle({ label, checked, disabled, hint, onChange }: ToggleProps) {
  return (
    <label className={`pack-toggle${disabled ? " disabled" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
      {hint && <span className="pack-field-hint">{hint}</span>}
    </label>
  );
}

type Props = {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onLayout: (mode: LayoutMode) => void;
  onSeparate: (sweeps: number) => void;
};

export function Controls({ settings, onChange, onLayout, onSeparate }: Props) {
  const s = settings;
  return (
    <div className="card pack-controls">
      <h3>Space</h3>
      <div className="dim-toggle">
        <button
          className={`btn secondary${s.geometry === "square" ? " active" : ""}`}
          onClick={() => onChange({ geometry: "square" })}
        >
          Square
        </button>
        <button
          className={`btn secondary${s.geometry === "torus" ? " active" : ""}`}
          onClick={() => onChange({ geometry: "torus" })}
        >
          Torus
        </button>
      </div>
      {s.geometry === "square" ? (
        <Toggle
          label="Keep whole balls inside the walls"
          checked={s.confine}
          hint={s.confine ? "centres in [r, L−r]" : "centres in the square, balls may overhang"}
          onChange={(v) => onChange({ confine: v })}
        />
      ) : (
        <p className="section-note" style={{ marginTop: 6 }}>
          Opposite edges are glued: a ball leaving the right edge comes back in on the left. The square you see is one
          fundamental domain of ℝ²/(Lℤ)².
        </p>
      )}

      <h3 style={{ marginTop: 18 }}>Balls</h3>
      <NumberField label="Number of balls n" value={s.n} min={1} max={MAX_BALLS} step={1} decimals={0} onChange={(v) => onChange({ n: Math.round(v) })} />
      <NumberField
        label="Radius r"
        value={s.radius}
        min={0}
        max={s.side}
        step={s.side / 400}
        hint={`2r = ${num(2 * s.radius)}`}
        onChange={(v) => onChange({ radius: v })}
      />
      <NumberField
        label="Side length L"
        value={s.side}
        min={MIN_SIDE}
        max={MAX_SIDE}
        step={0.1}
        slider={false}
        onChange={(v) => onChange({ side: v })}
      />
      <div className="examples">
        {[1, 2, 5, 10].map((v) => (
          <button key={v} className="chip" onClick={() => onChange({ side: v })}>
            L = {v}
          </button>
        ))}
      </div>

      <h3 style={{ marginTop: 18 }}>Arrange</h3>
      <div className="pack-buttons">
        <button className="btn secondary" onClick={() => onLayout("grid")}>
          Grid
        </button>
        <button className="btn secondary" onClick={() => onLayout("hex")}>
          Hexagonal
        </button>
        <button className="btn secondary" onClick={() => onLayout("random")}>
          Random
        </button>
        <button className="btn secondary" onClick={() => onLayout("scatter")}>
          Scatter (no overlap)
        </button>
      </div>
      <div className="pack-buttons" style={{ marginTop: 8 }}>
        <button className="btn secondary" onClick={() => onSeparate(1)}>
          Separate ×1
        </button>
        <button className="btn" onClick={() => onSeparate(200)}>
          Settle
        </button>
      </div>
      <p className="section-note">
        Separating nudges every overlapping pair apart along the line of centres; <em>Settle</em> runs two hundred of
        those sweeps, enough to reach an exactly tangent packing. In a crowd with no room the number of
        pairs can go <em>up</em> while the shared area falls — a few deep overlaps become many shallow ones. Drag any
        ball in the picture to move it by hand.
      </p>

      <h3 style={{ marginTop: 18 }}>Show</h3>
      <Toggle label="Ball numbers" checked={s.showLabels} onChange={(v) => onChange({ showLabels: v })} />
      <Toggle
        label="Neighbouring tiles"
        checked={s.showGhosts}
        disabled={s.geometry !== "torus"}
        hint="torus only"
        onChange={(v) => onChange({ showGhosts: v })}
      />
      <Toggle label="Pigeonhole grid" checked={s.showPigeonhole} onChange={(v) => onChange({ showPigeonhole: v })} />
    </div>
  );
}
