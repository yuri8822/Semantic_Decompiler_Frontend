import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import { ProviderPicker, useProviders } from "./ProviderPicker";

const EDITED_EVENT = "semdec:edited";

/** Call after any successful edit so pending-edit indicators refresh immediately. */
export function notifyEdited() {
  window.dispatchEvent(new Event(EDITED_EVENT));
}

/** Shown while a workspace has edits the next run hasn't applied to Ghidra and the code yet. */
export function ApplyEditsBar({ workspace }: { workspace: string }) {
  const navigate = useNavigate();
  const summary = useApi(() => api.workspace(workspace), [workspace], 5000);
  const providers = useProviders();
  const [provider, setProvider] = useState<string>();   // undefined = the saved default
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const { reload } = summary;
  useEffect(() => {
    window.addEventListener(EDITED_EVENT, reload);
    return () => window.removeEventListener(EDITED_EVENT, reload);
  }, [reload]);

  if (!summary.data?.edits_pending) return null;
  const o = summary.data.overrides;
  const parts = [
    o.functions && `${o.functions} function${o.functions === 1 ? "" : "s"}`,
    o.classes && `${o.classes} class${o.classes === 1 ? "" : "es"}`,
    o.globals && `${o.globals} global${o.globals === 1 ? "" : "s"}`,
  ].filter(Boolean);

  const defaultProvider = providers.data?.default;
  const chosen = provider ?? defaultProvider ?? "";

  async function apply() {
    setBusy(true);
    setError(undefined);
    try {
      const job = await api.applyEdits(workspace, chosen && chosen !== defaultProvider ? { llm: { provider: chosen } } : {});
      navigate(`/jobs/${job.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="alert alert-info apply-bar">
      <div>
        <strong>You have edits that aren't applied yet</strong>
        {parts.length > 0 && <span> ({parts.join(", ")} edited)</span>}. Applying runs the workspace again: your
        changes go into Ghidra and the affected code is regenerated. Nothing else is re-analyzed.
        {error && <div className="tone-text-bad">{error}</div>}
      </div>
      <div className="apply-bar-actions">
        {providers.data && (
          <ProviderPicker info={providers.data} value={chosen} onChange={setProvider} disabled={busy} />
        )}
        <button className="btn btn-primary" disabled={busy} onClick={apply}>{busy ? "Starting…" : "Apply edits"}</button>
      </div>
    </div>
  );
}
