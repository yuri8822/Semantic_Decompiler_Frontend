import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import type { Tier, TypeDetail, TypeEdit } from "../../api/types";
import { notifyEdited } from "../../components/ApplyEditsBar";
import { EditedMark } from "../../components/FunctionEditor";
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
      {current && <ClassDetail workspace={name} type={current} tier={types.data.find((t) => t.name === current)?.tier}
        classNames={types.data.map((t) => t.name)} onChanged={types.reload} />}
    </div>
  );
}

function ClassDetail({ workspace, type, tier, classNames, onChanged }:
  { workspace: string; type: string; tier?: Tier; classNames: string[]; onChanged: () => void }) {
  const t = useApi(() => api.type(workspace, type), [workspace, type]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();
  if (t.error) return <ErrorBox error={t.error} />;
  if (!t.data) return <Loading />;
  const d = t.data;
  const fieldOv = d.overrides?.fields ?? {};
  const edited = Object.keys(d.overrides ?? {}).length > 0;

  async function send(fn: () => Promise<unknown>) {
    setError(undefined);
    try {
      await fn();
      notifyEdited();
      t.reload();
      onChanged();
      return true;
    } catch (e) {
      setError(e instanceof ApiError && e.validationErrors.length
        ? e.validationErrors.map((x) => `${x.loc.filter((p) => p !== "body").join(".")}: ${x.msg}`).join("; ")
        : e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  return (
    <Card className="split-detail" title={<span className="mono">{d.kind} {d.name}{d.base_class && ` : public ${d.base_class}`}</span>}
      actions={<>
        {edited && <Badge tone="info">edited by you</Badge>}
        <TierBadge tier={tier} confidence={d.confidence} />
        {!editing && <button className="btn btn-sm" onClick={() => setEditing(true)}>Edit layout</button>}
        {!editing && edited && <button className="btn btn-sm" onClick={() =>
          confirm(`Remove all your edits on ${d.name} and go back to the LLM's layout?`) &&
          send(() => api.clearTypeEdits(workspace, d.name))}>Revert my edits</button>}
      </>}>
      <p className="muted small">
        size {hex(d.size)} (confidence {d.size_confidence.toFixed(2)})
        {d.from_symbols && <> · <Badge tone="info">name from symbols</Badge></>}
      </p>
      {error && <div className="alert alert-bad">{error}</div>}
      <h3>Layout</h3>
      {editing ? (
        <LayoutEditor detail={d} classNames={classNames.filter((n) => n !== d.name)}
          onSave={(edit) => send(() => api.editType(workspace, d.name, edit))}
          onClose={() => setEditing(false)} />
      ) : d.fields.length ? (
        <table className="table compact">
          <thead><tr><th>Offset</th><th>Size</th><th>Type</th><th>Name</th><th>Confidence</th><th>Evidence</th><th /></tr></thead>
          <tbody>
            {d.fields.map((f) => (
              <tr key={f.offset} className={f.tier === "low" ? "dim" : ""}>
                <td className="mono">+{hex(f.offset)}</td>
                <td>{f.size}</td>
                <td className="mono">{f.type}</td>
                <td className="mono"><strong>{f.name}</strong></td>
                <td><TierBadge tier={f.tier} confidence={f.confidence} /></td>
                <td className="small">{f.evidence.join("; ")}</td>
                <td>{fieldOv[String(f.offset)] && <EditedMark onRevert={() =>
                  send(() => api.editType(workspace, d.name, { fields: [{ offset: f.offset, clear: true }] }))} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="muted">No fields recovered.</p>}
      {!editing && Object.entries(fieldOv).some(([, o]) => o.remove) && (
        <p className="muted small">
          You removed {Object.values(fieldOv).filter((o) => o.remove).length} field(s) the LLM proposed
          ({Object.entries(fieldOv).filter(([, o]) => o.remove).map(([off]) => `+${hex(Number(off))}`).join(", ")}).{" "}
          {Object.entries(fieldOv).filter(([, o]) => o.remove).map(([off]) => (
            <button key={off} className="btn-link small" onClick={() =>
              send(() => api.editType(workspace, d.name, { fields: [{ offset: Number(off), clear: true }] }))}>
              restore +{hex(Number(off))}</button>
          ))}
        </p>
      )}
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

interface FieldRow { offset: string; name: string; type: string; size: string; remove: boolean; isNew: boolean }

function LayoutEditor({ detail: d, classNames, onSave, onClose }:
  { detail: TypeDetail; classNames: string[]; onSave: (e: TypeEdit) => Promise<boolean>; onClose: () => void }) {
  const initialRows: FieldRow[] = d.fields.map((f) => ({ offset: hex(f.offset), name: f.name, type: f.type,
    size: String(f.size), remove: false, isNew: false }));
  const [rows, setRows] = useState<FieldRow[]>(initialRows);
  const [base, setBase] = useState(d.base_class);
  const [size, setSize] = useState(hex(d.size));
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string>();

  const set = (i: number, patch: Partial<FieldRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const parseNum = (s: string) => (s.trim().toLowerCase().startsWith("0x") ? parseInt(s, 16) : parseInt(s, 10));

  function build(): TypeEdit | string {
    const edit: TypeEdit = {};
    if (base !== d.base_class) edit.base_class = base;
    if (parseNum(size) !== d.size) {
      if (Number.isNaN(parseNum(size))) return "size must be a number";
      edit.size = parseNum(size);
    }
    const fields: NonNullable<TypeEdit["fields"]> = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const offset = parseNum(r.offset);
      if (Number.isNaN(offset) || offset < 0) return `invalid offset "${r.offset}"`;
      if (r.isNew) {
        if (r.remove) continue;
        if (!r.name.trim()) return `the new field at ${r.offset} needs a name`;
        fields.push({ offset, name: r.name.trim(), type: r.type.trim() || null, size: r.size ? parseNum(r.size) : null });
        continue;
      }
      const o = initialRows[i];
      if (r.remove) { fields.push({ offset, remove: true }); continue; }
      const f: NonNullable<TypeEdit["fields"]>[number] = { offset };
      if (r.name.trim() !== o.name) f.name = r.name.trim();
      if (r.type.trim() !== o.type) f.type = r.type.trim();
      if (r.size !== o.size) f.size = parseNum(r.size);
      if (Object.keys(f).length > 1) fields.push(f);
    }
    if (fields.length) edit.fields = fields;
    return edit;
  }

  const built = build();
  const dirty = typeof built !== "string" && Object.keys(built).length > 0;

  async function save() {
    if (typeof built === "string") return setLocalError(built);
    setBusy(true);
    setLocalError(undefined);
    if (await onSave(built)) onClose();
    setBusy(false);
  }

  return (
    <div className="editor">
      <div className="edit-grid">
        <label className="edit-field">
          <span>Base class</span>
          <select value={base} onChange={(e) => setBase(e.target.value)}>
            <option value="">— none —</option>
            {classNames.map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
        <label className="edit-field">
          <span>Size (bytes)</span>
          <input type="text" className="mono" value={size} onChange={(e) => setSize(e.target.value)} />
        </label>
      </div>
      <table className="table compact edit-table">
        <thead><tr><th>Offset</th><th>Size</th><th>Type</th><th>Name</th><th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.remove ? "dim" : ""}>
              <td>{r.isNew ? <input type="text" className="mono narrow" value={r.offset} onChange={(e) => set(i, { offset: e.target.value })} />
                : <span className="mono">+{r.offset}</span>}</td>
              <td><input type="text" className="mono narrow" value={r.size} disabled={r.remove} onChange={(e) => set(i, { size: e.target.value })} /></td>
              <td><input type="text" className="mono" value={r.type} disabled={r.remove} spellCheck={false} onChange={(e) => set(i, { type: e.target.value })} /></td>
              <td><input type="text" className="mono" value={r.name} disabled={r.remove} spellCheck={false} onChange={(e) => set(i, { name: e.target.value })} /></td>
              <td>
                <button className="btn-link small" onClick={() => (r.isNew ? setRows(rows.filter((_, j) => j !== i)) : set(i, { remove: !r.remove }))}>
                  {r.remove ? "keep" : "remove"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn btn-sm" onClick={() => setRows([...rows, { offset: "0x", name: "", type: "int", size: "4", remove: false, isNew: true }])}>
        + Add field
      </button>
      {localError && <div className="alert alert-bad">{localError}</div>}
      <div className="row gap end">
        <button className="btn" onClick={onClose} disabled={busy}>Close</button>
        <button className="btn btn-primary" disabled={!dirty || busy} onClick={save}>{busy ? "Saving…" : "Save layout"}</button>
      </div>
    </div>
  );
}
