import { parseComponent } from "../../math/lattice";
import { sub } from "../../math/notation";
import { VEC_COLORS } from "./LatticePlot3D";

export type Preset = { label: string; dim: number; vectors: string[][]; hint?: string };

type Props = {
  dim: number;
  vectors: string[][];
  maxVectors: number;
  onDimChange: (d: number) => void;
  onChangeComponent: (vi: number, ci: number, value: string) => void;
  onAddVector: () => void;
  onRemoveVector: (vi: number) => void;
  presets: Preset[];
  onLoadPreset: (p: Preset) => void;
};

// A nonempty field that does not parse is invalid; empty is treated as 0.
function isInvalid(value: string): boolean {
  if (value.trim() === "") return false;
  try {
    parseComponent(value);
    return false;
  } catch {
    return true;
  }
}

export function VectorInput({
  dim,
  vectors,
  maxVectors,
  onDimChange,
  onChangeComponent,
  onAddVector,
  onRemoveVector,
  presets,
  onLoadPreset,
}: Props) {
  return (
    <div className="card">
      <h3>Generators</h3>

      <div className="dim-toggle" role="group" aria-label="Ambient dimension">
        {[1, 2, 3].map((d) => (
          <button
            key={d}
            className={`btn secondary${dim === d ? " active" : ""}`}
            onClick={() => onDimChange(d)}
          >
            {d}D
          </button>
        ))}
      </div>

      <div className="vec-list">
        {vectors.map((vec, vi) => (
          <div className="vec-row" key={vi}>
            <span className="vec-swatch" style={{ background: VEC_COLORS[vi % VEC_COLORS.length] }} />
            <span className="vec-name mono">
              v{sub(vi + 1)}
              <span className="vec-eq"> =</span>
            </span>
            <span className="vec-paren">(</span>
            <div className="vec-fields">
              {Array.from({ length: dim }, (_, ci) => (
                <input
                  key={ci}
                  className={`vec-input${isInvalid(vec[ci] ?? "") ? " invalid" : ""}`}
                  spellCheck={false}
                  inputMode="decimal"
                  value={vec[ci] ?? ""}
                  placeholder="0"
                  aria-label={`v${vi + 1} component ${ci + 1}`}
                  onChange={(e) => onChangeComponent(vi, ci, e.target.value)}
                />
              ))}
            </div>
            <span className="vec-paren">)</span>
            <button
              className="vec-remove"
              title="Remove vector"
              aria-label={`Remove vector ${vi + 1}`}
              disabled={vectors.length <= 1}
              onClick={() => onRemoveVector(vi)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button
        className="btn secondary add-vec"
        onClick={onAddVector}
        disabled={vectors.length >= maxVectors}
      >
        + Add vector
      </button>

      <div className="examples" style={{ marginTop: 14 }}>
        {presets.map((p) => (
          <button key={p.label} className="chip" title={p.hint} onClick={() => onLoadPreset(p)}>
            {p.label}
          </button>
        ))}
      </div>

      <p className="section-note" style={{ marginTop: 12 }}>
        Components may be integers, fractions (<code>1/2</code>), or decimals (<code>0.5</code>). The
        lattice is every integer combination a₁v₁ + a₂v₂ + … of the generators.
      </p>
    </div>
  );
}
