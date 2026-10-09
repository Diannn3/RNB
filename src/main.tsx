import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link } from "react-router";
import "@fontsource-variable/plus-jakarta-sans";
import "./styles.css";
const Landing = lazy(() => import("./Landing"));
const Workspace = lazy(() => import("./Workspace"));
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="fatal">
        <h1>Something interrupted the workspace.</h1>
        <p>
          Your documents have not been sent anywhere. Reload to start a new
          session.
        </p>
        <button
          className="button primary"
          onClick={() => window.location.reload()}
        >
          Reload PapelLess
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense
          fallback={
            <div className="route-loading" role="status">
              Opening PapelLess…
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/app" element={<Workspace />} />
            <Route path="/app/sample" element={<Workspace />} />
            <Route
              path="*"
              element={
                <main className="fatal">
                  <h1>This page isn’t here.</h1>
                  <Link to="/">Return to PapelLess</Link>
                </main>
              }
            />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
