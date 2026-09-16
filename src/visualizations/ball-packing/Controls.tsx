import { useState } from "react";
import type { LayoutMode } from "../../math/packing";
import { num } from "./format";
import { MAX_BALLS, MAX_SIDE, MIN_SIDE, SLIDER_SIDE, type Settings } from "./settings";

type FieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  slider?: boolean;
  /** Upper end of the slider alone, when the typed box should reach further than dragging usefully can. */
  sliderMax?: number;
  hint?: string;
  onChange: (v: number) => void;
};

/**
 * A number you can either type or drag. The typed text is held locally while the
 * field is being edited so half-finished input like "0." survives a keystroke.
 */
export function NumberField({
  label,
  value,
  min,
  max,
  step,
  decimals = 4,
  slider = true,
  sliderMax,
  hint,
  onChange,
}: FieldProps) {
  const top = sliderMax ?? max;
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
            max={top}
            step={step}
            value={Math.min(top, Math.max(min, value))}
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
  onSearch: () => void;
  onFindRadius: () => void;
  /** Set while the radius bisection is running, so its button can say so. */
  busy: boolean;
};

export function Controls({ settings, onChange, onLayout, onSeparate, onSearch, onFindRadius, busy }: Props) {
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
        sliderMax={SLIDER_SIDE}
        step={0.05}
        decimals={2}
        hint={`r/L = ${num(s.side > 0 ? s.radius / s.side : 0, 3)}`}
        onChange={(v) => onChange({ side: v })}
      />

      <h3 style={{ marginTop: 18 }}>Arrange</h3>
      <div className="pack-buttons">
        <button className="btn secondary" onClick={() => onLayout("grid")}>
          Grid
        </button>
        <button className="btn secondary" onClick={() => onLayout("random")}>
          Random
        </button>
      </div>
      <div className="pack-buttons" style={{ marginTop: 8 }}>
        <button className="btn secondary" onClick={() => onSeparate(1)}>
          Separate ×1
        </button>
        <button className="btn" onClick={() => onSeparate(200)}>
          Settle
        </button>
        <button className="btn" onClick={onSearch}>
          WalkSAT
        </button>
      </div>
      <div className="pack-buttons" style={{ marginTop: 8 }}>
        <button className="btn secondary" onClick={onFindRadius} disabled={busy}>
          {busy ? "Searching…" : `Largest r for ${s.n} balls`}
        </button>
      </div>
      <NumberField
        label="WalkSAT noise p"
        value={settings.noise}
        min={0}
        max={1}
        step={0.01}
        decimals={2}
        hint={settings.noise === 0 ? "pure greedy" : undefined}
        onChange={(v) => onChange({ noise: v })}
      />
      <p className="section-note">
        <em>Separate</em> nudges overlapping pairs apart; <em>Settle</em> repeats it two hundred times, then jams.
      </p>
      <p className="section-note">
        <em>WalkSAT</em> escapes that jam: move a ball clear, randomly with probability p, else greedily.
      </p>
      <p className="section-note">
        <em>Largest r</em> bisects between a radius that provably packs and one pigeonhole forbids, asking WalkSAT at
        each step.
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
