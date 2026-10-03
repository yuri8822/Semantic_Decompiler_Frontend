import { NavLink, Route, Routes } from "react-router-dom";
import { api } from "./api/client";
import { useApi } from "./hooks/useApi";
import Dashboard from "./pages/Dashboard";
import FunctionPage from "./pages/FunctionPage";
import JobPage from "./pages/JobPage";
import JobsPage from "./pages/JobsPage";
import LogPage from "./pages/LogPage";
import NewRunPage from "./pages/NewRunPage";
import NotFound from "./pages/NotFound";
import SettingsPage from "./pages/SettingsPage";
import WorkspacePage from "./pages/WorkspacePage";
import WorkspacesPage from "./pages/WorkspacesPage";

export default function App() {
  const health = useApi(() => api.health(), [], 5000);
  const online = !!health.data && !health.error;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">{"{}"}</span>
          <div>
            <div className="brand-name">Semantic Decompiler</div>
            <div className="brand-sub">binary → C++</div>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/run">New run</NavLink>
          <NavLink to="/jobs">
            Jobs {health.data?.running_job && <span className="pulse" title="a job is running" />}
          </NavLink>
          <NavLink to="/workspaces">Workspaces</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <div className={`conn ${online ? "on" : "off"}`} title={health.error?.message}>
          <span className="conn-dot" /> {online ? "backend connected" : health.loading && !health.error ? "connecting…" : "backend offline"}
        </div>
      </aside>
      <main className="main">
        {!online && !health.loading && (
          <div className="alert alert-bad">
            Can't reach the backend API. Start it with <code>start.bat</code> (or <code>python serve.py</code>)
            in the backend repo; this page reconnects automatically.
          </div>
        )}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/run" element={<NewRunPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:id" element={<JobPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/workspaces" element={<WorkspacesPage />} />
          <Route path="/workspaces/:name" element={<WorkspacePage />} />
          <Route path="/workspaces/:name/functions/:address" element={<FunctionPage />} />
          <Route path="/workspaces/:name/logs/:log" element={<LogPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}
