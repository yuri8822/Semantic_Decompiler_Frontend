import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { Badge, Card, Empty, ErrorBox, Loading } from "../../components/ui";
import { useApi } from "../../hooks/useApi";
import { fmtSize } from "../../lib/format";

const AGENTS = [
  { id: "", label: "All" },
  { id: "analyzer", label: "Analyzer" },
  { id: "type_reconstructor", label: "Type Reconstructor" },
  { id: "code_reconstructor", label: "Code Reconstructor" },
];

/** LLM traffic for a workspace, optionally for one function (address). */
export default function LogsTab({ name, address }: { name: string; address?: string }) {
  const [agent, setAgent] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const logs = useApi(() => api.logs(name, { agent, address }), [name, agent, address], 15000);
  const rows = (logs.data ?? []).filter((l) => !errorsOnly || l.error).slice().reverse();

  return (
    <Card>
      <div className="toolbar">
        <div className="segmented">
          {AGENTS.map((a) => (
            <button key={a.id} className={agent === a.id ? "active" : ""} onClick={() => setAgent(a.id)}>{a.label}</button>
          ))}
        </div>
        <label className="check"><input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} /> failed calls only</label>
        <span className="muted small">newest first</span>
      </div>
      {logs.error && <ErrorBox error={logs.error} />}
      {!logs.data ? <Loading /> : !rows.length ? <Empty>No LLM calls logged{address ? " for this function" : ""}.</Empty> : (
        <table className="table compact">
          <thead><tr><th>#</th><th>Call</th><th>Size</th><th /></tr></thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.name}>
                <td className="mono small">{l.n}</td>
                <td>
                  <Link className="mono small" to={`/workspaces/${encodeURIComponent(name)}/logs/${encodeURIComponent(l.name)}`}>{l.tag}</Link>
                </td>
                <td className="small">{fmtSize(l.size)}</td>
                <td>{l.error && <Badge tone="bad">error</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
