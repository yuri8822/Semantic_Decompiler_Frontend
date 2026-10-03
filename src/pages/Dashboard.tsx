import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Card, Empty, ErrorBox, JobStatusBadge, Loading, ProgressBar, TierBar } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { fmtAgo, fileName, stageLabel } from "../lib/format";

export default function Dashboard() {
  const health = useApi(() => api.health(), [], 10000);
  const jobs = useApi(() => api.jobs(), [], 3000);
  const workspaces = useApi(() => api.workspaces(), [], 10000);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Dashboard</h1>
        <Link className="btn btn-primary" to="/run">New run</Link>
      </div>

      <div className="grid-2">
        <Card title="Environment">
          {health.data ? (
            <ul className="checklist">
              <Check ok={health.data.ghidra.found} label="Ghidra headless" detail={health.data.ghidra.headless} />
              <Check ok={health.data.compiler.found} label="C++ compiler" detail={health.data.compiler.cxx}
                note="compile validation is skipped without it" />
              <Check ok={health.data.cmake.found} label="CMake" detail={health.data.cmake.cmake}
                note="the project build is skipped without it" />
              {health.data.providers.filter((p) => p.api_key_var).map((p) => (
                <Check key={p.name} ok={!!p.api_key_present} label={`${p.name} API key`} detail={p.api_key_var}
                  note="add it to the backend's .env" />
              ))}
            </ul>
          ) : health.error ? <ErrorBox error={health.error} /> : <Loading />}
          {health.data && !health.data.ghidra.found && (
            <p className="muted small">Set <Link to="/settings">Ghidra › analyzeHeadless path</Link> to your Ghidra install.</p>
          )}
        </Card>

        <Card title="Recent jobs" actions={<Link to="/jobs">All jobs</Link>}>
          {jobs.data ? (
            jobs.data.length ? (
              <ul className="list">
                {jobs.data.slice(0, 6).map((j) => (
                  <li key={j.id}>
                    <Link to={`/jobs/${j.id}`} className="list-row">
                      <span className="list-main">
                        <strong>{fileName(j.binary)}</strong>
                        <span className="muted small">
                          {j.status === "running" && j.progress.stage
                            ? stageLabel(j.progress.stage, j.progress.round)
                            : fmtAgo(j.finished_at || j.created_at)}
                        </span>
                      </span>
                      {j.status === "running" && j.progress.total ? (
                        <span className="list-progress"><ProgressBar done={j.progress.done ?? 0} total={j.progress.total} /></span>
                      ) : null}
                      <JobStatusBadge status={j.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <Empty>No runs yet. <Link to="/run">Start one</Link>.</Empty>
          ) : jobs.error ? <ErrorBox error={jobs.error} /> : <Loading />}
        </Card>
      </div>

      <Card title="Workspaces" actions={<Link to="/workspaces">All workspaces</Link>}>
        {workspaces.data ? (
          workspaces.data.length ? (
            <div className="ws-grid">
              {workspaces.data.map((w) => (
                <Link key={w.name} to={`/workspaces/${encodeURIComponent(w.name)}`} className="ws-card">
                  <div className="ws-card-head">
                    <strong>{w.name}</strong>
                    <span className="muted small">{w.program.language}</span>
                  </div>
                  <div className="ws-card-stats">
                    <span><b>{w.counts.reconstructed}</b>/{w.counts.in_scope} reconstructed</span>
                    <span><b>{w.counts.compile_ok}</b> compile</span>
                    <span><b>{w.counts.classes}</b> classes</span>
                  </div>
                  <TierBar counts={w.name_confidence} />
                  <div className="muted small">updated {fmtAgo(w.updated_at)}</div>
                </Link>
              ))}
            </div>
          ) : <Empty>No workspaces yet — each binary you run gets one.</Empty>
        ) : workspaces.error ? <ErrorBox error={workspaces.error} /> : <Loading />}
      </Card>
    </div>
  );
}

function Check({ ok, label, detail, note }: { ok: boolean; label: string; detail?: string; note?: string }) {
  return (
    <li className={ok ? "ok" : "missing"}>
      <span className="check-mark">{ok ? "✓" : "✗"}</span>
      <span>
        <strong>{label}</strong> {detail && <code className="small">{detail}</code>}
        {!ok && note && <div className="muted small">{note}</div>}
      </span>
    </li>
  );
}
