import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { Card, Empty, ErrorBox, Loading, TierBadge } from "../../components/ui";
import { useApi } from "../../hooks/useApi";

export default function GlobalsTab({ name }: { name: string }) {
  const globals = useApi(() => api.globals(name), [name]);
  if (globals.error) return <ErrorBox error={globals.error} />;
  if (!globals.data) return <Loading />;
  if (!globals.data.length) return <Card><Empty>No globals referenced by in-scope functions.</Empty></Card>;
  return (
    <Card>
      <table className="table">
        <thead><tr><th>Address</th><th>Ghidra name</th><th>Recovered name</th><th>Type</th><th>Confidence</th><th>Referenced by</th></tr></thead>
        <tbody>
          {globals.data.map((g) => (
            <tr key={g.address}>
              <td className="mono small">{g.address}</td>
              <td className="mono small">{g.ghidra_name}</td>
              <td className="mono"><strong>{g.name || "—"}</strong></td>
              <td className="mono small">{g.type || "—"}</td>
              <td>{g.name ? <TierBadge tier={g.tier} confidence={g.confidence} /> : <span className="muted">—</span>}</td>
              <td className="small">
                {g.referenced_by.slice(0, 4).map((a) => (
                  <Link key={a} className="mono" to={`/workspaces/${encodeURIComponent(name)}/functions/${a}`}>{a} </Link>
                ))}
                {g.referenced_by.length > 4 && <span className="muted">+{g.referenced_by.length - 4}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
