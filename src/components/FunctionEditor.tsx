import { useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import type { FunctionDetail, FunctionEdit } from "../api/types";
import { notifyEdited } from "./ApplyEditsBar";

const KINDS = ["free", "method", "constructor", "destructor", "static", "virtual"];

interface Row { key: string; label: string; name: string; type: string; ghidraName: string; edited: boolean }

interface Values {
  name: string;
  class_name: string;
  method_kind: string;
  return_type: string;
  summary: string;
  params: Row[];
  locals: Row[];
}

function currentValues(d: FunctionDetail): Values {
  const a = d.record.analysis;
  const ov = d.record.overrides ?? {};
  const params = d.ghidra.parameters
    .filter((p) => {
      const g = a?.params.find((x) => x.index === p.index);
      return !p.is_this && !p.hidden_return && g?.role !== "this" && g?.role !== "return_slot";
    })
    .map((p) => {
      const g = a?.params.find((x) => x.index === p.index);
      return { key: String(p.index), label: `#${p.index}`, ghidraName: p.name, name: g?.name || p.name,
        type: g?.type || p.type, edited: !!ov.params?.[String(p.index)] };
    });
  const seen = new Set<string>();
  const locals: Row[] = [];
  for (const l of a?.locals ?? []) {
    seen.add(l.old_name).add(l.name);
    locals.push({ key: l.old_name, label: l.old_name, ghidraName: l.old_name, name: l.name, type: l.type,
      edited: !!ov.locals?.[l.old_name] });
  }
  for (const l of d.ghidra.locals) {
    if (!seen.has(l.name)) locals.push({ key: l.name, label: l.name, ghidraName: l.name, name: l.name, type: l.type, edited: false });
  }
  return {
    name: a?.name ?? d.record.full_name,
    class_name: a?.class_name ?? "",
    method_kind: a?.method_kind ?? d.signature?.kind ?? "free",
    return_type: a?.return_type || d.signature?.return_type || "",
    summary: a?.summary ?? "",
    params,
    locals,
  };
}

export function FunctionEditor({ workspace, detail, onSaved, onClose }:
  { workspace: string; detail: FunctionDetail; onSaved: (d: FunctionDetail) => void; onClose: () => void }) {
  const initial = useMemo(() => currentValues(detail), [detail]);
  const [v, setV] = useState<Values>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const ov = detail.record.overrides ?? {};
  const llm = detail.record.llm_analysis;
  const addr = detail.record.address;

  function buildEdit(): FunctionEdit {
    const e: FunctionEdit = {};
    for (const k of ["name", "class_name", "method_kind", "return_type", "summary"] as const) {
      if (v[k].trim() !== initial[k].trim()) e[k] = v[k].trim();
    }
    const params = v.params
      .map((r, i) => ({ r, o: initial.params[i] }))
      .filter(({ r, o }) => r.name.trim() !== o.name.trim() || r.type.trim() !== o.type.trim())
      .map(({ r, o }) => ({
        index: Number(r.key),
        ...(r.name.trim() !== o.name.trim() ? { name: r.name.trim() } : {}),
        ...(r.type.trim() !== o.type.trim() ? { type: r.type.trim() } : {}),
      }));
    if (params.length) e.params = params;
    const locals = v.locals
      .map((r, i) => ({ r, o: initial.locals[i] }))
      .filter(({ r, o }) => r.name.trim() !== o.name.trim() || r.type.trim() !== o.type.trim())
      .map(({ r, o }) => ({
        old_name: r.key,
        ...(r.name.trim() !== o.name.trim() ? { name: r.name.trim() } : {}),
        ...(r.type.trim() !== o.type.trim() ? { type: r.type.trim() } : {}),
      }));
    if (locals.length) e.locals = locals;
    return e;
  }

  async function send(edit: FunctionEdit) {
    setBusy(true);
    setError(undefined);
    try {
      const d = await api.editFunction(workspace, addr, edit);
      notifyEdited();
      onSaved(d);
      return true;
    } catch (err) {
      setError(err instanceof ApiError && err.validationErrors.length
        ? err.validationErrors.map((x) => `${x.loc.filter((p) => p !== "body").join(".")}: ${x.msg}`).join("; ")
        : err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const edit = buildEdit();
  const dirty = Object.keys(edit).length > 0;

  const revert = (key: keyof FunctionEdit) => send({ [key]: null } as FunctionEdit);
  const revertRow = (kind: "params" | "locals", key: string) =>
    send(kind === "params" ? { params: [{ index: Number(key), name: null, type: null }] }
      : { locals: [{ old_name: key, name: null, type: null }] });

  const field = (key: "name" | "class_name" | "return_type", label: string, llmValue?: string, placeholder?: string) => (
    <label className="edit-field">
      <span>{label} {key in ov && <EditedMark llm={llmValue} onRevert={() => revert(key)} busy={busy} />}</span>
      <input type="text" className="mono" value={v[key]} placeholder={placeholder} spellCheck={false}
        onChange={(e) => setV({ ...v, [key]: e.target.value })} />
    </label>
  );

  return (
    <div className="editor">
      <p className="muted small">
        Your values override the LLM's and are kept through later re-analysis. Saving stores them; use
        <b> Apply edits</b> afterwards to push them into Ghidra and regenerate the affected code.
      </p>
      <div className="edit-grid">
        {field("name", "Name (Class::Method)", llm?.name)}
        {field("class_name", "Class", llm?.class_name, "none (free function)")}
        <label className="edit-field">
          <span>Kind {"method_kind" in ov && <EditedMark llm={llm?.method_kind} onRevert={() => revert("method_kind")} busy={busy} />}</span>
          <select value={v.method_kind} onChange={(e) => setV({ ...v, method_kind: e.target.value })}>
            {KINDS.map((k) => <option key={k}>{k}</option>)}
          </select>
        </label>
        {field("return_type", "Return type", llm?.return_type)}
        <label className="edit-field span-2">
          <span>Summary {"summary" in ov && <EditedMark llm={llm?.summary} onRevert={() => revert("summary")} busy={busy} />}</span>
          <textarea rows={2} value={v.summary} onChange={(e) => setV({ ...v, summary: e.target.value })} />
        </label>
      </div>

      <RowTable title="Parameters" rows={v.params} busy={busy}
        onChange={(rows) => setV({ ...v, params: rows })} onRevert={(k) => revertRow("params", k)} />
      {v.locals.length > 0 && (
        <RowTable title="Local variables" rows={v.locals} busy={busy}
          onChange={(rows) => setV({ ...v, locals: rows })} onRevert={(k) => revertRow("locals", k)} />
      )}

      {error && <div className="alert alert-bad">{error}</div>}
      <div className="row gap end">
        <button className="btn" onClick={onClose} disabled={busy}>Close</button>
        <button className="btn" disabled={!dirty || busy} onClick={() => setV(initial)}>Discard changes</button>
        <button className="btn btn-primary" disabled={!dirty || busy}
          onClick={async () => { if (await send(edit)) onClose(); }}>
          {busy ? "Saving…" : "Save edits"}
        </button>
      </div>
    </div>
  );
}

function RowTable({ title, rows, onChange, onRevert, busy }:
  { title: string; rows: Row[]; onChange: (rows: Row[]) => void; onRevert: (key: string) => void; busy: boolean }) {
  if (!rows.length) return null;
  const set = (i: number, patch: Partial<Row>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <>
      <h3>{title}</h3>
      <table className="table compact edit-table">
        <thead><tr><th>Ghidra</th><th>Name</th><th>Type</th><th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key}>
              <td className="mono small">{r.label === r.ghidraName ? r.ghidraName : `${r.label} ${r.ghidraName}`}</td>
              <td><input type="text" className="mono" value={r.name} spellCheck={false} onChange={(e) => set(i, { name: e.target.value })} /></td>
              <td><input type="text" className="mono" value={r.type} spellCheck={false} onChange={(e) => set(i, { type: e.target.value })} /></td>
              <td>{r.edited && <EditedMark onRevert={() => onRevert(r.key)} busy={busy} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function EditedMark({ llm, onRevert, busy }: { llm?: string; onRevert?: () => void; busy?: boolean }) {
  return (
    <span className="edited-mark">
      <span className="badge badge-info" title={llm !== undefined ? `LLM's value: ${llm || "(empty)"}` : "edited by you"}>edited</span>
      {onRevert && <button type="button" className="btn-link small" disabled={busy} onClick={onRevert}
        title={llm !== undefined ? `back to the LLM's value: ${llm || "(empty)"}` : "back to the LLM's value"}>revert</button>}
    </span>
  );
}
