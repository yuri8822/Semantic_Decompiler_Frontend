import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { JsonSchema } from "../api/types";
import { errorMap, SchemaForm } from "../components/SchemaForm";
import { Card, ErrorBox, Loading } from "../components/ui";
import { countLeaves, diff, type Obj } from "../lib/objects";

export default function SettingsPage() {
  const [schema, setSchema] = useState<JsonSchema>();
  const [saved, setSaved] = useState<Obj>();
  const [defaults, setDefaults] = useState<Obj>();
  const [draft, setDraft] = useState<Obj>();
  const [loadError, setLoadError] = useState<unknown>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ tone: string; text: string }>();
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.settingsSchema(), api.settings(), api.settingsDefaults()])
      .then(([s, v, d]) => {
        setSchema(s);
        setSaved(v);
        setDraft(v);
        setDefaults(d);
      })
      .catch(setLoadError);
  }, []);

  if (loadError) return <div className="page"><h1>Settings</h1><ErrorBox error={loadError} /></div>;
  if (!schema || !saved || !draft || !defaults) return <div className="page"><h1>Settings</h1><Loading /></div>;

  const unsaved = countLeaves(diff(draft, saved));
  const customised = countLeaves(diff(saved, defaults));

  async function save(value: Obj) {
    setBusy(true);
    setStatus(undefined);
    try {
      const result = await api.saveSettings(value);
      setSaved(result);
      setDraft(result);
      setErrors({});
      setStatus({ tone: "good", text: "Saved. New runs use these defaults." });
    } catch (e) {
      if (e instanceof ApiError && e.validationErrors.length) {
        setErrors(errorMap(e.validationErrors));
        setStatus({ tone: "bad", text: "Some values are invalid — see the highlighted fields." });
      } else {
        setStatus({ tone: "bad", text: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">
            Defaults for every run (stored in the backend's <code>settings.json</code>; {customised} value
            {customised === 1 ? "" : "s"} differ from the built-ins). Each run can still override them.
          </p>
        </div>
      </div>

      <div className="toolbar sticky">
        <input className="search" type="search" placeholder="Find an option…" value={filter}
          onChange={(e) => setFilter(e.target.value)} />
        <span className="muted">{unsaved ? `${unsaved} unsaved change${unsaved === 1 ? "" : "s"}` : "no unsaved changes"}</span>
        <div className="spacer" />
        <button className="btn" disabled={!unsaved || busy} onClick={() => { setDraft(saved); setErrors({}); }}>
          Revert
        </button>
        <button className="btn" disabled={busy} title="Load the built-in defaults into the form (not saved yet)"
          onClick={() => setDraft(defaults)}>
          Reset to built-ins
        </button>
        <button className="btn btn-primary" disabled={!unsaved || busy} onClick={() => save(draft)}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {status && <div className={`alert alert-${status.tone}`}>{status.text}</div>}
      {errors._ && <div className="alert alert-bad">{errors._}</div>}

      <Card>
        <SchemaForm schema={schema} value={draft} baseline={saved} onChange={setDraft} errors={errors}
          filter={filter} baselineLabel="saved" />
      </Card>
    </div>
  );
}
