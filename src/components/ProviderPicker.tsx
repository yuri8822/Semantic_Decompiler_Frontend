import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { ProvidersInfo } from "../api/types";
import { useApi } from "../hooks/useApi";

const SETTINGS_EVENT = "semdec:settings";

/** Call after the saved settings change so every provider picker refreshes. */
export function notifySettingsChanged() {
  window.dispatchEvent(new Event(SETTINGS_EVENT));
}

/** Provider list + availability, refreshed periodically and whenever settings change. */
export function useProviders() {
  const res = useApi(() => api.providers(), [], 15000);
  const { reload } = res;
  useEffect(() => {
    window.addEventListener(SETTINGS_EVENT, reload);
    return () => window.removeEventListener(SETTINGS_EVENT, reload);
  }, [reload]);
  return res;
}

/**
 * A provider dropdown that shows each provider's model and whether it can be used
 * right now. `compact` (narrow places like the sidebar) lists names only and shows
 * the model on the status line instead.
 */
export function ProviderPicker({ info, value, onChange, disabled, id, compact }:
  { info: ProvidersInfo; value: string; onChange: (provider: string) => void; disabled?: boolean; id?: string;
    compact?: boolean }) {
  const current = info.providers.find((p) => p.name === value);
  const ready = current?.auto_start ? "starts automatically when a run needs it"
    : current?.local ? "local server is running" : "API key found";
  return (
    <div className="provider-picker">
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        title={current ? `${current.label} — ${current.model}` : undefined}>
        {info.providers.map((p) => (
          <option key={p.name} value={p.name}>
            {p.usable ? "✓" : "✗"} {p.label}{compact ? "" : ` — ${p.model}`}{p.local ? " (local)" : ""}
          </option>
        ))}
      </select>
      {current && (
        <div className={`provider-status ${current.usable ? "ok" : "bad"}`} title={current.problem || undefined}>
          <span className="conn-dot" />
          <span className="provider-status-text">
            {compact && <span className="mono">{current.model}</span>}
            {compact && " · "}
            {current.usable ? ready : current.problem}
            {current.name === "llamacpp" && <> · <Link to="/local">{current.usable ? "manage" : "set up"}</Link></>}
          </span>
        </div>
      )}
    </div>
  );
}

/** Sidebar control: the default provider every new run uses (saved in the backend's settings). */
export function SidebarProvider() {
  const providers = useProviders();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const info = providers.data;
  if (!info) return null;

  async function change(provider: string) {
    setSaving(true);
    setError(undefined);
    try {
      await api.patchSettings({ llm: { provider } });
      notifySettingsChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const overridden = Object.entries(info.agents).filter(([, p]) => p && p !== info.default);
  return (
    <div className="sidebar-provider">
      <label htmlFor="sidebar-provider">LLM provider</label>
      <ProviderPicker id="sidebar-provider" info={info} value={info.default} onChange={change} disabled={saving} compact />
      {overridden.length > 0 && (
        <div className="muted small">
          {overridden.map(([agent, p]) => <div key={agent}>{agent.replace(/_/g, " ")}: {p}</div>)}
        </div>
      )}
      {error && <div className="tone-text-bad small">{error}</div>}
    </div>
  );
}
