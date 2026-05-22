const EXAMPLES: { label: string; poly: string; hint?: string }[] = [
  { label: "x² − 2", poly: "x^2 - 2", hint: "ℚ(√2)" },
  { label: "x³ − 2", poly: "x^3 - 2", hint: "S₃" },
  { label: "x³ − 3x + 1", poly: "x^3 - 3x + 1", hint: "cyclic cubic" },
  { label: "x⁴ − 2", poly: "x^4 - 2", hint: "D₄" },
  { label: "x⁴ − 4x² + 2", poly: "x^4 - 4x^2 + 2", hint: "C₄" },
  { label: "x⁴ + 1", poly: "x^4 + 1", hint: "V₄" },
  { label: "x⁴ + 8x + 12", poly: "x^4 + 8x + 12", hint: "A₄" },
  { label: "x⁴ − x − 1", poly: "x^4 - x - 1", hint: "S₄" },
  { label: "x⁵ − x − 1", poly: "x^5 - x - 1", hint: "unsupported (degree 5)" },
];

type Props = {
  value: string;
  onChange: (s: string) => void;
  onSubmit: () => void;
  onLoadExample: (poly: string) => void;
};

export function PolynomialInput({ value, onChange, onSubmit, onLoadExample }: Props) {
  return (
    <div className="card">
      <h3>Polynomial</h3>
      <div className="input-row">
        <input
          className="poly-input"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
          }}
          placeholder="e.g. x^4 - 2,  x^3 + 3x - 1,  (1/2)x^2 - 3"
        />
        <button className="btn" onClick={onSubmit}>
          Compute
        </button>
      </div>
      <div className="examples">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.poly}
            className="chip"
            title={ex.hint}
            onClick={() => onLoadExample(ex.poly)}
          >
            {ex.label}
          </button>
        ))}
      </div>
      <p className="section-note" style={{ marginTop: 14 }}>
        Coefficients can be integers or rationals (<code>1/2</code>). Use{" "}
        <code>^</code> for exponents and <code>*</code> or implicit multiplication. Currently this
        tool exactly computes the Galois group for irreducible polynomials of degree 1–4; degree ≥ 5
        is shown with a note.
      </p>
    </div>
  );
}

// Reuse if needed elsewhere
export const POLY_EXAMPLES = EXAMPLES;
