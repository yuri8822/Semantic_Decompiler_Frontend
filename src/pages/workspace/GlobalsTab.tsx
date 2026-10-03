import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { GlobalRecord } from "../../api/types";
import { notifyEdited } from "../../components/ApplyEditsBar";
import { EditedMark } from "../../components/FunctionEditor";
import { Card, Empty, ErrorBox, Loading, TierBadge } from "../../components/ui";
import { useApi } from "../../hooks/useApi";

export default function GlobalsTab({ name }: { name: string }) {
  const globals = useApi(() => api.globals(name), [name]);
  const [editing, setEditing] = useState<string>();
  const [error, setError] = useState<string>();

  async function save(address: string, edit: { name?: string | null; type?: string | null }) {
    setError(undefined);
    try {
      await api.editGlobal(name, address, edit);
      notifyEdited();
      setEditing(undefined);
      globals.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (globals.error) return <ErrorBox error={globals.error} />;
  if (!globals.data) return <Loading />;
  if (!globals.data.length) return <Card><Empty>No globals referenced by in-scope functions.</Empty></Card>;
  return (
    <Card>
      {error && <div className="alert alert-bad">{error}</div>}
      <table className="table">
        <thead><tr><th>Address</th><th>Ghidra name</th><th>Recovered name</th><th>Type</th><th>Confidence</th><th>Referenced by</th><th /></tr></thead>
        <tbody>
          {globals.data.map((g) => editing === g.address
            ? <GlobalEditRow key={g.address} g={g} onSave={(e) => save(g.address, e)} onCancel={() => setEditing(undefined)} />
            : (
              <tr key={g.address}>
                <td className="mono small">{g.address}</td>
                <td className="mono small">{g.ghidra_name}</td>
                <td className="mono"><strong>{g.name || "—"}</strong>
                  {g.overrides?.name !== undefined && <EditedMark llm={g.llm?.name} onRevert={() => save(g.address, { name: null })} />}</td>
                <td className="mono small">{g.type || "—"}
                  {g.overrides?.type !== undefined && <EditedMark llm={g.llm?.type} onRevert={() => save(g.address, { type: null })} />}</td>
                <td>{g.name ? <TierBadge tier={g.tier} confidence={g.confidence} /> : <span className="muted">—</span>}</td>
                <td className="small">
                  {g.referenced_by.slice(0, 4).map((a) => (
                    <Link key={a} className="mono" to={`/workspaces/${encodeURIComponent(name)}/functions/${a}`}>{a} </Link>
                  ))}
                  {g.referenced_by.length > 4 && <span className="muted">+{g.referenced_by.length - 4}</span>}
                </td>
                <td><button className="btn btn-sm" onClick={() => setEditing(g.address)}>Edit</button></td>
              </tr>
            ))}
        </tbody>
      </table>
    </Card>
  );
}

function GlobalEditRow({ g, onSave, onCancel }:
  { g: GlobalRecord; onSave: (e: { name?: string; type?: string }) => void; onCancel: () => void }) {
  const [n, setN] = useState(g.name);
  const [t, setT] = useState(g.type);
  const edit: { name?: string; type?: string } = {};
  if (n.trim() && n.trim() !== g.name) edit.name = n.trim();
  if (t.trim() && t.trim() !== g.type) edit.type = t.trim();
  return (
    <tr>
      <td className="mono small">{g.address}</td>
      <td className="mono small">{g.ghidra_name}</td>
      <td><input type="text" className="mono" value={n} placeholder="name" spellCheck={false} onChange={(e) => setN(e.target.value)} /></td>
      <td><input type="text" className="mono" value={t} placeholder="type" spellCheck={false} onChange={(e) => setT(e.target.value)} /></td>
      <td colSpan={2} />
      <td className="row gap">
        <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-sm btn-primary" disabled={!Object.keys(edit).length} onClick={() => onSave(edit)}>Save</button>
      </td>
    </tr>
  );
}
