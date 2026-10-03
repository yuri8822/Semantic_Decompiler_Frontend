import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Card, CompileBadge, Empty, ErrorBox, Loading, TierBar } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { fmtAgo } from "../lib/format";

export default function WorkspacesPage() {
  const workspaces = useApi(() => api.workspaces(), [], 10000);
  return (
    <div className="page">
      <div className="page-head"><h1>Workspaces</h1></div>
      <Card>
        {workspaces.error && <ErrorBox error={workspaces.error} />}
        {!workspaces.data ? <Loading /> : !workspaces.data.length ? (
          <Empty>No workspaces yet. <Link to="/run">Run a binary</Link> to create one.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Workspace</th><th>Target</th><th>Reconstructed</th><th>Compile</th><th>Name confidence</th>
                <th>Classes</th><th>Build</th><th>Updated</th></tr>
            </thead>
            <tbody>
              {workspaces.data.map((w) => (
                <tr key={w.name}>
                  <td><Link to={`/workspaces/${encodeURIComponent(w.name)}`}><strong>{w.name}</strong></Link></td>
                  <td className="small">{w.program.language}</td>
                  <td>{w.counts.reconstructed}/{w.counts.in_scope}</td>
                  <td className="small">
                    <span className="tone-text-good">{w.counts.compile_ok} ok</span>
                    {w.counts.compile_errors > 0 && <span className="tone-text-bad"> · {w.counts.compile_errors} failing</span>}
                  </td>
                  <td className="tierbar-cell"><TierBar counts={w.name_confidence} /></td>
                  <td>{w.counts.classes}</td>
                  <td>{w.build ? <CompileBadge status={w.build} /> : <span className="muted">—</span>}</td>
                  <td className="small">{fmtAgo(w.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
