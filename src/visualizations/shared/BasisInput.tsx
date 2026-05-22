import { parseComponent } from "../../math/lattice";
import { sub } from "../../math/notation";

export type BasisPreset = {
  label: string;
  dim: number;
  vectors: string[][];
  target?: string[];
  hint?: string;
};

type Props = {
  dim: number;
  vectors: string[][];
  target?: string[];
  colors: string[];
  targetColor?: string;
  showDimToggle?: boolean;
  dims?: number[];
  onChange: (kind: "vector" | "target", vi: number, ci: number, value: string) => void;
  onDimChange?: (d: number) => void;
  presets: BasisPreset[];
  onLoadPreset: (p: BasisPreset) => void;
};

function isInvalid(value: string): boolean {
  if (value.trim() === "") return false;
  try {
    parseComponent(value);
    return false;
  } catch {
    return true;
  }
}

function Row({
  name,
  color,
  comps,
  dim,
  onComp,
}: {
  name: string;
  color: string;
  comps: string[];
  dim: number;
  onComp: (ci: number, value: string) => void;
}) {
  return (
    <div className="vec-row">
      <span className="vec-swatch" style={{ background: color }} />
      <span className="vec-name mono">
        {name}
        <span className="vec-eq"> =</span>
      </span>
      <span className="vec-paren">(</span>
      <div className="vec-fields">
        {Array.from({ length: dim }, (_, ci) => (
          <input
            key={ci}
            className={`vec-input${isInvalid(comps[ci] ?? "") ? " invalid" : ""}`}
            spellCheck={false}
            inputMode="decimal"
            value={comps[ci] ?? ""}
            placeholder="0"
            aria-label={`${name} component ${ci + 1}`}
            onChange={(e) => onComp(ci, e.target.value)}
          />
        ))}
      </div>
      <span className="vec-paren">)</span>
    </div>
  );
}

export function BasisInput({
  dim,
  vectors,
  target,
  colors,
  targetColor,
  showDimToggle,
  dims = [2, 3],
  onChange,
  onDimChange,
  presets,
  onLoadPreset,
}: Props) {
  return (
    <div className="card">
      <h3>Basis{target ? " & target" : ""}</h3>

      {showDimToggle && onDimChange && (
        <div className="dim-toggle" role="group" aria-label="Dimension">
          {dims.map((d) => (
            <button key={d} className={`btn secondary${dim === d ? " active" : ""}`} onClick={() => onDimChange(d)}>
              {d}D
            </button>
          ))}
        </div>
      )}

      <div className="vec-list">
        {vectors.map((vec, vi) => (
          <Row
            key={vi}
            name={`b${sub(vi + 1)}`}
            color={colors[vi % colors.length]}
            comps={vec}
            dim={dim}
            onComp={(ci, value) => onChange("vector", vi, ci, value)}
          />
        ))}
        {target && (
          <Row
            name="t"
            color={targetColor ?? "#ff6ec7"}
            comps={target}
            dim={dim}
            onComp={(ci, value) => onChange("target", 0, ci, value)}
          />
        )}
      </div>

      <div className="examples" style={{ marginTop: 14 }}>
        {presets.map((p) => (
          <button key={p.label} className="chip" title={p.hint} onClick={() => onLoadPreset(p)}>
            {p.label}
          </button>
        ))}
      </div>

      <p className="section-note" style={{ marginTop: 12 }}>
        Components may be integers, fractions (<code>1/2</code>), or decimals (<code>0.5</code>).
      </p>
    </div>
  );
}
