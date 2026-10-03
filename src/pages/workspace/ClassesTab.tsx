import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { Tier } from "../../api/types";
import { Badge, Card, Empty, ErrorBox, Loading, TierBadge } from "../../components/ui";
import { useApi } from "../../hooks/useApi";
import { hex } from "../../lib/format";

export default function ClassesTab({ name }: { name: string }) {
  const types = useApi(() => api.types(name), [name]);
  const [selected, setSelected] = useState<string>();
  const current = selected ?? types.data?.[0]?.name;

  if (types.error) return <ErrorBox error={types.error} />;
  if (!types.data) return <Loading />;
  if (!types.data.length) return <Card><Empty>No class layouts reconstructed yet.</Empty></Card>;

  return (
    <div className="split">
      <Card className="split-list">
        <ul className="list selectable">
          {types.data.map((t) => (
            <li key={t.name}>
              <button className={`list-row ${t.name === current ? "selected" : ""}`} onClick={() => setSelected(t.name)}>
                <span className="list-main">
                  <strong className="mono">{t.name}</strong>
                  <span className="muted small">{hex(t.size)} bytes · {t.fields} fields · {t.members} methods</span>
                </span>
                <TierBadge tier={t.tier} confidence={t.confidence} />
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {current && <ClassDetail workspace={name} type={current} tier={types.data.find((t) => t.name === current)?.tier} />}
    </div>
  );
}

function ClassDetail({ workspace, type, tier }: { workspace: string; type: string; tier?: Tier }) {
  const t = useApi(() => api.type(workspace, type), [workspace, type]);
  if (t.error) return <ErrorBox error={t.error} />;
  if (!t.data) return <Loading />;
  const d = t.data;
  return (
    <Card className="split-detail" title={<span className="mono">{d.kind} {d.name}{d.base_class && ` : public ${d.base_class}`}</span>}
      actions={<TierBadge tier={tier} confidence={d.confidence} />}>
      <p className="muted small">
        size {hex(d.size)} (confidence {d.size_confidence.toFixed(2)})
        {d.from_symbols && <> · <Badge tone="info">name from symbols</Badge></>}
      </p>
      <h3>Layout</h3>
      {d.fields.length ? (
        <table className="table compact">
          <thead><tr><th>Offset</th><th>Size</th><th>Type</th><th>Name</th><th>Confidence</th><th>Evidence</th></tr></thead>
          <tbody>
            {d.fields.map((f) => (
              <tr key={f.offset} className={f.tier === "low" ? "dim" : ""}>
                <td className="mono">+{hex(f.offset)}</td>
                <td>{f.size}</td>
                <td className="mono">{f.type}</td>
                <td className="mono"><strong>{f.name}</strong></td>
                <td><TierBadge tier={f.tier} confidence={f.confidence} /></td>
                <td className="small">{f.evidence.join("; ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="muted">No fields recovered.</p>}
      <p className="muted small">Low-confidence fields (dimmed) are withheld from Ghidra and the generated header.</p>
      <h3>Methods</h3>
      <ul className="plain">
        {d.methods.map((m) => (
          <li key={m.address}>
            <Link className="mono" to={`/workspaces/${encodeURIComponent(workspace)}/functions/${m.address}`}>
              {m.declaration || m.name}
            </Link> <span className="muted small mono">{m.address}</span>
          </li>
        ))}
      </ul>
      {d.same_as.length > 0 && (
        <div className="alert alert-warn">The Type Reconstructor thinks this is the same type as: {d.same_as.join(", ")} (not merged).</div>
      )}
      {d.notes && <><h3>Notes</h3><p className="small">{d.notes}</p></>}
    </Card>
  );
}
