import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Card, Empty, ErrorBox, JobStatusBadge, Loading, ProgressBar } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { fileName, fmtDuration, fmtTime, stageLabel } from "../lib/format";

export default function JobsPage() {
  const jobs = useApi(() => api.jobs(), [], 2000);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Jobs</h1>
        <Link className="btn btn-primary" to="/run">New run</Link>
      </div>
      <Card>
        {jobs.error && <ErrorBox error={jobs.error} />}
        {!jobs.data ? <Loading /> : !jobs.data.length ? <Empty>No jobs yet.</Empty> : (
          <table className="table">
            <thead>
              <tr><th>Binary</th><th>Status</th><th>Stage</th><th>Started</th><th>Duration</th><th>Result</th><th /></tr>
            </thead>
            <tbody>
              {jobs.data.map((j) => (
                <tr key={j.id}>
                  <td>
                    <Link to={`/jobs/${j.id}`}><strong>{fileName(j.binary)}</strong></Link>
                    {j.restart && <span className="badge badge-warn">start over</span>}
                    <div className="muted small mono">{j.id}</div>
                  </td>
                  <td><JobStatusBadge status={j.status} /></td>
                  <td className="stage-cell">
                    {j.status === "running" && j.progress.stage ? (
                      <>
                        <div className="small">{stageLabel(j.progress.stage, j.progress.round)}</div>
                        {j.progress.total ? <ProgressBar done={j.progress.done ?? 0} total={j.progress.total} /> : null}
                      </>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td className="small">{fmtTime(j.started_at || j.created_at)}</td>
                  <td className="small">{j.started_at ? fmtDuration(j.started_at, j.finished_at || undefined) : "—"}</td>
                  <td className="small">
                    {j.status === "done" && j.summary.functions != null
                      ? `${j.summary.reconstructed}/${j.summary.functions} reconstructed, build ${j.summary.build}`
                      : j.error ? <span className="tone-text-bad" title={j.error}>{j.error.slice(0, 60)}</span> : "—"}
                  </td>
                  <td className="actions">
                    {(j.status === "running" || j.status === "queued") && (
                      <button className="btn btn-sm" onClick={() => api.cancelJob(j.id).then(jobs.reload)}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
