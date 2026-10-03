import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { BinaryFile, JsonSchema } from "../api/types";
import { errorMap, SchemaForm } from "../components/SchemaForm";
import { Card, Collapsible, ErrorBox, Loading } from "../components/ui";
import { fileName, fmtSize } from "../lib/format";
import { countLeaves, diff, getPath, type Obj, setPath } from "../lib/objects";

export default function NewRunPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [schema, setSchema] = useState<JsonSchema>();
  const [saved, setSaved] = useState<Obj>();
  const [draft, setDraft] = useState<Obj>();
  const [binaries, setBinaries] = useState<BinaryFile[]>([]);
  const [binary, setBinary] = useState(params.get("binary") ?? "");
  const [mode, setMode] = useState<"resume" | "restart">(params.get("restart") === "1" ? "restart" : "resume");
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [loadError, setLoadError] = useState<unknown>();
  const [submitError, setSubmitError] = useState<string>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    Promise.all([api.settingsSchema(), api.settings(), api.binaries()])
      .then(([s, v, b]) => {
        setSchema(s);
        setSaved(v);
        setDraft(v);
        setBinaries(b);
      })
      .catch(setLoadError);
  }, []);

  const selected = useMemo(() => binaries.find((b) => b.path === binary), [binaries, binary]);
  const existingWorkspace = selected?.workspace ?? null;

  if (loadError) return <div className="page"><h1>New run</h1><ErrorBox error={loadError} /></div>;
  if (!schema || !saved || !draft) return <div className="page"><h1>New run</h1><Loading /></div>;

  const overrides = diff(draft, saved);
  const nOverrides = countLeaves(overrides);
  const get = (path: string) => getPath(draft, path.split("."));
  const set = (path: string, v: unknown) => setDraft(setPath(draft, path.split("."), v));
  const providerEnum = ((schema.$defs?.LLMSettings?.properties?.provider?.enum) ?? []) as string[];

  async function upload(file: File) {
    setUploading(true);
    setSubmitError(undefined);
    try {
      const r = await api.uploadBinary(file);
      const list = await api.binaries();
      setBinaries(list);
      setBinary(r.path);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setBusy(true);
    setSubmitError(undefined);
    setErrors({});
    try {
      const job = await api.submitJob(binary.trim(), !!existingWorkspace && mode === "restart", overrides);
      navigate(`/jobs/${job.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.validationErrors.length) {
        setErrors(errorMap(e.validationErrors));
        setSubmitError("Some run settings are invalid — see the highlighted fields under All settings.");
      } else {
        setSubmitError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = !!binary.trim() && !busy && !(existingWorkspace && mode === "restart" && !confirmRestart);

  return (
    <div className="page">
      <div className="page-head"><h1>New run</h1></div>

      <Card title="1 · Binary">
        {binaries.length > 0 && (
          <div className="binary-list">
            {binaries.map((b) => (
              <label key={b.path} className={`binary-item ${binary === b.path ? "selected" : ""}`}>
                <input type="radio" name="binary" checked={binary === b.path} onChange={() => setBinary(b.path)} />
                <span className="binary-name">{b.name}</span>
                <span className="muted small">{b.folder} · {fmtSize(b.size)}</span>
                {b.workspace && <span className="badge badge-info">has workspace</span>}
              </label>
            ))}
          </div>
        )}
        <div className="row gap">
          <label className="btn">
            {uploading ? "Uploading…" : "Upload executable…"}
            <input type="file" hidden disabled={uploading}
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
          <span className="muted">or a path on the backend machine:</span>
          <input className="grow" type="text" placeholder="C:\path\to\program.exe" value={binary}
            onChange={(e) => setBinary(e.target.value)} spellCheck={false} />
        </div>

        {existingWorkspace && (
          <div className="resume-box">
            <p><strong>{fileName(binary)}</strong> has been run before (workspace <code>{existingWorkspace}</code>).</p>
            <label className="radio">
              <input type="radio" checked={mode === "resume"} onChange={() => setMode("resume")} />
              <span><strong>Resume</strong> — continue where the last run stopped; finished work is reused.</span>
            </label>
            <label className="radio">
              <input type="radio" checked={mode === "restart"} onChange={() => setMode("restart")} />
              <span><strong>Start over</strong> — delete the workspace (analyses, LLM logs, output) first.</span>
            </label>
            {mode === "restart" && (
              <label className="check danger">
                <input type="checkbox" checked={confirmRestart} onChange={(e) => setConfirmRestart(e.target.checked)} />
                I understand the existing workspace will be deleted.
              </label>
            )}
          </div>
        )}
      </Card>

      <Card title="2 · Options for this run" actions={
        nOverrides ? (
          <span className="muted">{nOverrides} override{nOverrides === 1 ? "" : "s"} ·{" "}
            <button className="btn-link" onClick={() => { setDraft(saved); setErrors({}); }}>clear</button>
          </span>
        ) : <span className="muted">using saved defaults</span>
      }>
        <div className="quick-grid">
          <label className="field">
            <span>Provider</span>
            <select value={String(get("llm.provider"))} onChange={(e) => set("llm.provider", e.target.value)}>
              {providerEnum.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Function limit <span className="muted">(0 = all)</span></span>
            <input type="number" min={0} value={Number(get("scope.limit") ?? 0)}
              onChange={(e) => set("scope.limit", Math.max(0, parseInt(e.target.value || "0", 10)))} />
          </label>
          <label className="field">
            <span>Analysis rounds</span>
            <input type="number" min={1} max={10} value={Number(get("analysis.rounds") ?? 1)}
              onChange={(e) => set("analysis.rounds", Math.max(1, parseInt(e.target.value || "1", 10)))} />
          </label>
          <label className="field">
            <span>Parallel LLM calls</span>
            <input type="number" min={1} max={64} value={Number(get("llm.concurrency") ?? 1)}
              onChange={(e) => set("llm.concurrency", Math.max(1, parseInt(e.target.value || "1", 10)))} />
          </label>
          <label className="field span-2">
            <span>Only these functions <span className="muted">(addresses or names, one per line)</span></span>
            <textarea rows={2} value={((get("scope.only") as string[]) ?? []).join("\n")}
              onChange={(e) => set("scope.only", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
          </label>
          <div className="field span-2 toggles">
            <Toggle label="Apply knowledge to Ghidra" checked={!!get("analysis.apply_to_ghidra")}
              onChange={(v) => set("analysis.apply_to_ghidra", v)} />
            <Toggle label="Reconstruct code" checked={!!get("code.enabled")} onChange={(v) => set("code.enabled", v)} />
            <Toggle label="Compile validation" checked={!!get("compiler.enabled")}
              onChange={(v) => set("compiler.enabled", v)} />
          </div>
        </div>

        <Collapsible title={`All settings for this run${nOverrides ? ` (${nOverrides} changed)` : ""}`}
          defaultOpen={Object.keys(errors).length > 0}>
          <SchemaForm schema={schema} value={draft} baseline={saved} onChange={setDraft} errors={errors}
            baselineLabel="saved default" />
        </Collapsible>
      </Card>

      {submitError && <div className="alert alert-bad">{submitError}</div>}
      <div className="row end">
        <button className="btn btn-primary btn-lg" disabled={!canSubmit} onClick={submit}>
          {busy ? "Starting…" : existingWorkspace && mode === "restart" ? "Start over" : existingWorkspace ? "Resume run" : "Start run"}
        </button>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" />
      <span className="switch-label">{label}</span>
    </label>
  );
}
