import { Link } from "react-router-dom";
import { visualizations } from "../visualizations/registry";

export function HomePage() {
  return (
    <div>
      <h1>GaloisVision</h1>
      <p>
        A small collection of interactive visualizations for concepts from a first abstract algebra
        course. Each page takes some input and shows the resulting structure — the goal is to give you
        a picture of objects that are easy to define but hard to hold in your head.
      </p>

      <h2>Visualizations</h2>
      <div className="viz-grid">
        {visualizations.map((v) => {
          const card = (
            <>
              <div className="viz-title">{v.title}</div>
              <div className="viz-desc">{v.description}</div>
              {v.status === "planned" && <div className="viz-status">Coming later</div>}
              {v.status === "ready" && <div className="viz-status" style={{ color: "var(--accent)" }}>Open →</div>}
            </>
          );
          if (v.status === "ready") {
            return (
              <Link key={v.id} to={`/v/${v.id}`} className="viz-card">
                {card}
              </Link>
            );
          }
          return (
            <div key={v.id} className="viz-card disabled">
              {card}
            </div>
          );
        })}
      </div>
    </div>
  );
}
