import type { Perm } from "../../math/groups";
import { permKey, permToCycles, permOrder } from "../../math/groups";

type Props = {
  elements: Perm[];
  selected: Perm | null;
  onSelect: (p: Perm) => void;
};

export function PermutationSelector({ elements, selected, onSelect }: Props) {
  // Sort: identity first, then by element order then by cycle string for determinism.
  const sorted = [...elements].sort((a, b) => {
    const oa = permOrder(a);
    const ob = permOrder(b);
    if (oa !== ob) return oa - ob;
    return permToCycles(a).localeCompare(permToCycles(b));
  });

  const selKey = selected ? permKey(selected) : null;

  return (
    <div className="perm-list" role="listbox" aria-label="Group elements">
      {sorted.map((p) => {
        const k = permKey(p);
        const isSel = k === selKey;
        const cyc = permToCycles(p);
        const ord = permOrder(p);
        return (
          <button
            key={k}
            className={`perm-item${isSel ? " selected" : ""}`}
            onClick={() => onSelect(p)}
            role="option"
            aria-selected={isSel}
          >
            <span>{cyc}</span>
            <span className="order-badge">ord {ord}</span>
          </button>
        );
      })}
    </div>
  );
}
