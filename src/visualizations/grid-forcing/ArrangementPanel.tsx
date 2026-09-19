// The indicator: does the arrangement on the board contain a copy of the shape?

import { cellLabel, shapeArticle, shapeName, type Cell, type OccurrenceDetail, type ShapeSpec } from "../../math/gridForcing";

type Props = {
  shape: ShapeSpec;
  placed: number;
  occurrenceCount: number;
  /** Which copy is being shown, when several are present. */
  shown: number;
  detail: OccurrenceDetail | null;
  safeCount: number;
  /** The threshold for this grid and shape, once the solver has established it. */
  threshold: number | null;
  onCycle: () => void;
};

function vertexList(vertices: readonly Cell[]): string {
  return vertices.map(cellLabel).join(", ");
}

export function ArrangementPanel({
  shape,
  placed,
  occurrenceCount,
  shown,
  detail,
  safeCount,
  threshold,
  onCycle,
}: Props) {
  const name = shapeName(shape);
  const article = shapeArticle(shape);
  const maxAvoiding = threshold === null ? null : threshold - 1;

  return (
    <div>
      {detail ? (
        <div className="msg msg-warn">
          <strong>
            Your {placed} dots contain {occurrenceCount === 1 ? article : `${occurrenceCount} copies of ${article}`} {name}.
          </strong>{" "}
          {occurrenceCount === 1 ? "It is" : `Copy ${shown + 1} of ${occurrenceCount} is`} {vertexList(detail.vertices)} —{" "}
          {detail.reason}.{" "}
          {occurrenceCount > 1 && (
            <button className="gf-inline-btn" onClick={onCycle}>
              show the next one
            </button>
          )}
        </div>
      ) : placed === 0 ? (
        <div className="msg msg-info">
          <strong>Nothing placed yet.</strong> Click cells on the board, or drag across them, to build an arrangement.
          The moment three of them make {shape.id === "isosceles" ? "an isosceles triangle" : "a square"}, this panel
          says so and the copy is drawn in red.
        </div>
      ) : (
        <div className="msg msg-good">
          <strong>
            Shape-free: no {name} anywhere among your {placed} {placed === 1 ? "dot" : "dots"}.
          </strong>{" "}
          {safeCount === 0 ? (
            <>
              And nothing can be added — every remaining cell completes a copy. This arrangement is <em>maximal</em>.
              {maxAvoiding !== null &&
                (placed === maxAvoiding
                  ? " It is also maximum: no arrangement of this size is beaten on this grid."
                  : ` It is not maximum, though: ${maxAvoiding} dots fit here, so a different arrangement does better.`)}
            </>
          ) : (
            <>
              {safeCount} further {safeCount === 1 ? "cell" : "cells"} could still be added without creating one.
              {maxAvoiding !== null && placed < maxAvoiding && ` The best possible on this grid is ${maxAvoiding}.`}
            </>
          )}
        </div>
      )}

      <div className="facts">
        <div className="fact">
          <div className="label">Dots placed</div>
          <div className="value">{placed}</div>
        </div>
        <div className="fact">
          <div className="label">Copies present</div>
          <div className="value" style={{ color: occurrenceCount > 0 ? "var(--error)" : undefined }}>
            {occurrenceCount}
          </div>
        </div>
        <div className="fact">
          <div className="label">Safe additions</div>
          <div className="value">{detail ? "—" : safeCount}</div>
        </div>
        <div className="fact">
          <div className="label">Largest shape-free set</div>
          <div className="value">{maxAvoiding === null ? "not computed" : maxAvoiding}</div>
        </div>
      </div>
      {detail && (
        <p className="section-note">
          Solid red sides are the ones whose equality makes this a copy; squared lengths are exact integers, which is
          why no square roots appear anywhere in the check.
        </p>
      )}
    </div>
  );
}
