import { Link, Outlet, Route, Routes, useParams } from "react-router-dom";
import { HomePage } from "./pages/Home";
import { findVisualization } from "./visualizations/registry";

function Layout() {
  return (
    <div className="app">
      <header className="header">
        <Link to="/" className="brand">
          Galois<span className="accent">Vision</span>
        </Link>
        <nav className="nav">
          <Link to="/">Home</Link>
          <a href="https://en.wikipedia.org/wiki/Galois_group" target="_blank" rel="noreferrer">
            Galois theory ↗
          </a>
        </nav>
      </header>
      <main className="main">
        <Outlet />
      </main>
      <footer>
        Built as a study aid for abstract algebra. All computation runs locally in your browser.
      </footer>
    </div>
  );
}

function VisualizationRoute() {
  const { id } = useParams<{ id: string }>();
  const viz = id ? findVisualization(id) : undefined;
  if (!viz || !viz.Component) {
    return (
      <div>
        <h1>Not found</h1>
        <p>
          Visualization "{id}" isn't available. <Link to="/">Back to home</Link>.
        </p>
      </div>
    );
  }
  const Component = viz.Component;
  return <Component />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="v/:id" element={<VisualizationRoute />} />
        <Route
          path="*"
          element={
            <div>
              <h1>Not found</h1>
              <p>
                <Link to="/">Back to home</Link>
              </p>
            </div>
          }
        />
      </Route>
    </Routes>
  );
}
