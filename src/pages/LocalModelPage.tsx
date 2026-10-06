import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { JsonSchema, LlamaState } from "../api/types";
import { notifySettingsChanged, useProviders } from "../components/ProviderPicker";
import { errorMap, SchemaForm } from "../components/SchemaForm";
import { Badge, Card, Collapsible, ErrorBox, KeyValue, Loading } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { fileName, fmtDuration, fmtSize } from "../lib/format";
import { countLeaves, diff, getPath, type Obj, setPath } from "../lib/objects";

/** The settings this page edits (the model file has its own picker). */
const ROOTS = [["llamacpp_server"], ["llm", "llamacpp"]];
const HIDE = ["llamacpp_server.model_path", "llm.llamacpp.model"];

const STATES: Record<LlamaState, { tone: string; label: string }> = {
  stopped: { tone: "neutral", label: "stopped" },
  loading: { tone: "info", label: "loading model" },
  ready: { tone: "good", label: "ready" },
  exited: { tone: "warn", label: "stopped" },
  external: { tone: "info", label: "running (started elsewhere)" },
};

function subset(value: Obj): Obj {
  return {
    llamacpp_server: getPath(value, ["llamacpp_server"]),
    llm: { llamacpp: getPath(value, ["llm", "llamacpp"]) },
  } as Obj;
}

function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export default function LocalModelPage() {
  const status = useApi(() => api.llamacpp(), [], 2000);
  const providers = useProviders();
  const [schema, setSchema] = useState<JsonSchema>();
  const [saved, setSaved] = useState<Obj>();
  const [draft, setDraft] = useState<Obj>();
  const [loadError, setLoadError] = useState<unknown>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: string; text: string }>();
  const [busy, setBusy] = useState("");

  useEffect(() => {
    Promise.all([api.settingsSchema(), api.settings()])
      .then(([s, v]) => {
        setSchema(s);
        setSaved(v);
        setDraft(v);
      })
      .catch(setLoadError);
  }, []);

  const st = status.data;
  if (loadError) return <div className="page"><h1>Local model</h1><ErrorBox error={loadError} /></div>;
  if (!schema || !saved || !draft || !st) {
    return <div className="page"><h1>Local model</h1>{status.error ? <ErrorBox error={status.error} /> : <Loading />}</div>;
  }

  async function act(label: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(label);
    setNotice(undefined);
    try {
      await fn();
      if (done) setNotice({ tone: "good", text: done });
    } catch (e) {
      if (e instanceof ApiError && e.validationErrors.length) {
        setErrors(errorMap(e.validationErrors));
        setNotice({ tone: "bad", text: "Some values are invalid — see the highlighted fields." });
      } else {
        setNotice({ tone: "bad", text: message(e) });
      }
    } finally {
      setBusy("");
      status.reload();
      providers.reload();
    }
  }

  /** Save a partial settings object, keeping unsaved edits elsewhere in the form. */
  async function patch(partial: Obj) {
    const result = await api.patchSettings(partial);
    notifySettingsChanged();
    setSaved(result);
    return result;
  }

  async function saveOptions() {
    await patch(subset(draft!));
    setErrors({});
  }

  async function chooseModel(path: string) {
    await patch({ llamacpp_server: { model_path: path } });
    setDraft((d) => setPath(d!, ["llamacpp_server", "model_path"], path));
  }

  async function stop() {
    const health = await api.health().catch(() => undefined);
    if (health?.running_job && !confirm("A job is running. If it uses llama.cpp, stopping the server makes it fail. Stop anyway?")) {
      return;
    }
    await api.stopLlamacpp();
  }

  async function restart() {
    await api.stopLlamacpp();
    await api.startLlamacpp();
  }

  const unsaved = countLeaves(diff(subset(draft), subset(saved)));
  const running = st.state === "loading" || st.state === "ready";
  const info = providers.data;
  const isDefault = info?.default === "llamacpp";
  const agentsOnLlama = info ? Object.entries(info.agents).filter(([, p]) => p === "llamacpp").map(([a]) => a) : [];
  const state = STATES[st.state];

  return (
    <div className="page local-model">
      <div className="page-head">
        <div>
          <h1>Local model</h1>
          <p className="muted">
            Run the agents on your own GPU with llama.cpp: the backend launches the server with these settings, and
            stops it when the backend stops.
          </p>
        </div>
      </div>

      {!st.installed && (
        <div className="alert alert-warn">
          llama.cpp wasn't found on this machine (looked for <code>{String(getPath(saved, ["llamacpp_server", "executable"]))}</code>).
          Install it (for example <code>winget install llama.cpp</code>) and restart the backend, or set
          {" "}<b>llama.cpp executable</b> below to the full path of <code>llama.exe</code> or <code>llama-server.exe</code>.
        </div>
      )}
      {notice && <div className={`alert alert-${notice.tone}`}>{notice.text}</div>}

      <div className="grid-main-side">
        <div className="side">
          <Card
            title={<>Server <Badge tone={state.tone}>{st.state === "loading" && <span className="pulse" />} {state.label}</Badge></>}
            actions={
              <>
                {st.stale && (
                  <button className="btn btn-sm" disabled={!!busy} onClick={() => act("restart", restart, "Restarted with the new settings.")}>
                    {busy === "restart" ? "Restarting…" : "Restart"}</button>
                )}
                {running ? (
                  <button className="btn btn-sm btn-danger-outline" disabled={!!busy} onClick={() => act("stop", stop)}>
                    {busy === "stop" ? "Stopping…" : "Stop"}</button>
                ) : (
                  <button className="btn btn-sm btn-primary" disabled={!!busy || !st.can_start}
                    title={st.problem || undefined} onClick={() => act("start", () => api.startLlamacpp())}>
                    {busy === "start" ? "Starting…" : "Start"}</button>
                )}
              </>
            }>
            {st.problem && st.state !== "external" && <div className="alert alert-warn">Can't start: {st.problem}.</div>}
            {st.stale && (
              <div className="alert alert-info">The settings changed since the server started; restart it to apply them.</div>
            )}
            {st.state === "external" && (
              <div className="alert alert-info">
                A llama.cpp server started outside the backend is answering at {st.base_url}. Runs use it as-is; stop it
                where you started it to let the backend manage the server.
              </div>
            )}
            {st.state === "exited" && st.exit_code !== null && st.exit_code !== 0 && (
              <div className="alert alert-bad">The server exited with code {st.exit_code}; see the log below.</div>
            )}
            <KeyValue items={[
              ["Model", st.model_path ? <span title={st.model_path}>{fileName(st.model_path)}</span> : <span className="muted">none chosen</span>],
              ["Address", <code>{st.base_url}</code>],
              ["Executable", st.executable ? <code>{st.executable}</code> : <span className="tone-text-bad">not found</span>],
              ...(running ? [["Process", `pid ${st.pid} · up ${fmtDuration(st.started_at)}`] as [string, string]] : []),
            ]} />
            {st.command.length > 0 && (
              <Collapsible title="Command line">
                <pre className="code log">{st.command.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ")}</pre>
              </Collapsible>
            )}
          </Card>

          {st.log_tail && (
            <Card title="Server log" actions={<span className="muted small">last 40 lines</span>}>
              <pre className="code log">{st.log_tail}</pre>
            </Card>
          )}
        </div>

        <div className="side">
          <ModelPicker current={String(getPath(saved, ["llamacpp_server", "model_path"]) ?? "")} disabled={!!busy}
            onChoose={(path) => act("model", () => chooseModel(path),
              running ? "Model saved. Restart the server to load it." : "Model saved.")} />

          <Card title="Use for runs">
            {isDefault ? (
              <p><b className="tone-text-good">llama.cpp is the default provider.</b> New runs use it unless they pick
                another provider.</p>
            ) : (
              <>
                <p className="muted">New runs use <b>{info?.providers.find((p) => p.name === info.default)?.label ?? info?.default}</b>.
                  {agentsOnLlama.length > 0 && <> The {agentsOnLlama.map((a) => a.replace(/_/g, " ")).join(", ")} already use llama.cpp.</>}
                </p>
                <button className="btn btn-primary" disabled={!!busy}
                  onClick={() => act("default", () => patch({ llm: { provider: "llamacpp" } }), "New runs now use llama.cpp.")}>
                  Use llama.cpp for new runs</button>
              </>
            )}
            <p className="muted small">
              {st.auto_start
                ? "When a run uses llama.cpp and the server isn't up, the backend starts it and waits for the model to load (it loads while Ghidra runs)."
                : "Automatic start is off: start the server here before running."}
              {" "}With one server slot, set <b>Parallel LLM calls</b> (Settings → LLM providers) to 1.
            </p>
          </Card>
        </div>
      </div>

      <div className="toolbar sticky">
        <span className="muted">{unsaved ? `${unsaved} unsaved change${unsaved === 1 ? "" : "s"}` : "no unsaved changes"}</span>
        <div className="spacer" />
        <button className="btn" disabled={!unsaved || !!busy} onClick={() => { setDraft(saved); setErrors({}); }}>Revert</button>
        <button className="btn btn-primary" disabled={!unsaved || !!busy}
          onClick={() => act("save", saveOptions, running ? "Saved. Restart the server to apply." : "Saved.")}>
          {busy === "save" ? "Saving…" : "Save"}
        </button>
      </div>
      <Card>
        <SchemaForm schema={schema} value={draft} baseline={saved} onChange={setDraft} errors={errors}
          roots={ROOTS} hide={HIDE} baselineLabel="saved" />
      </Card>
    </div>
  );
}

/** The .gguf files the backend found, plus a free-form path. */
function ModelPicker({ current, disabled, onChoose }:
  { current: string; disabled: boolean; onChoose: (path: string) => void }) {
  const found = useApi(() => api.llamacppModels(), []);
  const [custom, setCustom] = useState(false);
  const [path, setPathText] = useState(current);
  useEffect(() => setPathText(current), [current]);

  const models = found.data?.models ?? [];
  const known = models.some((m) => m.path === current);
  return (
    <Card title="Model" actions={<button className="btn btn-sm" onClick={found.reload}>Rescan</button>}>
      {found.error && <ErrorBox error={found.error} />}
      {!found.data && !found.error && <Loading label="Looking for models…" />}
      {found.data && (
        <>
          <select className="model-select" value={known ? current : current ? "__current" : ""} disabled={disabled}
            onChange={(e) => e.target.value && !e.target.value.startsWith("__") && onChoose(e.target.value)}>
            {!current && <option value="">— choose a model —</option>}
            {current && !known && <option value="__current">{fileName(current)} (custom path)</option>}
            {models.map((m) => (
              <option key={m.path} value={m.path} title={m.path}>{m.name} — {fmtSize(m.size)}</option>
            ))}
          </select>
          {known && <div className="muted small" title={current}>{models.find((m) => m.path === current)?.repo || fileName(current)}</div>}
          {models.length === 0 && (
            <p className="muted small">No .gguf files found. Download one (e.g. from Hugging Face), add its folder
              under <b>Extra model folders</b> below, or enter its path.</p>
          )}
          <Collapsible title="Searched folders">
            <ul className="plain small muted">{found.data.searched.map((d) => <li key={d}><code>{d}</code></li>)}</ul>
          </Collapsible>
          {custom ? (
            <div className="row gap model-path">
              <input type="text" className="grow" value={path} spellCheck={false} placeholder="C:\models\model.gguf"
                onChange={(e) => setPathText(e.target.value)} />
              <button className="btn btn-sm" disabled={disabled || !path.trim() || path === current}
                onClick={() => onChoose(path.trim())}>Use</button>
            </div>
          ) : (
            <button className="btn-link small" onClick={() => setCustom(true)}>Enter a path instead…</button>
          )}
        </>
      )}
    </Card>
  );
}
