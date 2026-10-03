import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { CodeBlock } from "../components/CodeBlock";
import { Badge, Card, Collapsible, ErrorBox, JobStatusBadge, KeyValue, Loading, ProgressBar, Stat } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { useJobEvents } from "../hooks/useJobEvents";
import { fileName, fmtDuration, fmtTime, stageLabel } from "../lib/format";
import { countLeaves } from "../lib/objects";

export default function JobPage() {
  const { id = "" } = useParams();
  const job = useApi(() => api.job(id), [id], 3000);
  const view = useJobEvents(id);
  const [cancelling, setCancelling] = useState(false);
  const [ghidraOpen, setGhidraOpen] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (ghidraOpen && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [view.ghidra.length, ghidraOpen]);

  if (job.error) return <div className="page"><h1>Job</h1><ErrorBox error={job.error} /></div>;
  if (!job.data) return <div className="page"><h1>Job</h1><Loading /></div>;
  const j = job.data;
  const live = j.status === "running" || j.status === "queued";
  const summary = view.finished?.summary ?? j.summary;
  const warnings = view.messages.filter((m) => m.level !== "info");

  async function cancel() {
    setCancelling(true);
    try {
      await api.cancelJob(id);
      job.reload();
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{fileName(j.binary)} <JobStatusBadge status={j.status} /></h1>
          <p className="muted small mono">{j.binary}</p>
        </div>
        <div className="row gap">
          {live && <button className="btn btn-danger" disabled={cancelling} onClick={cancel}>
            {cancelling ? "Cancelling…" : "Cancel"}</button>}
          {!live && <Link className="btn" to={`/run?binary=${encodeURIComponent(j.binary)}`}>Run again</Link>}
          <Link className="btn btn-primary" to={`/workspaces/${encodeURIComponent(j.workspace)}`}>Open workspace</Link>
        </div>
      </div>

      {j.status === "failed" && j.error && <div className="alert alert-bad"><strong>Failed:</strong> {j.error}</div>}
      {j.status === "interrupted" && <div className="alert alert-warn">{j.error}</div>}
      {j.status === "cancelled" && <div className="alert alert-warn">Cancelled. Progress is saved — run it again to resume.</div>}

      {j.status === "done" && summary.functions != null && (
        <div className="stats">
          <Stat label="reconstructed" value={`${summary.reconstructed}/${summary.functions}`} />
          <Stat label="compile ok" value={summary.compile_ok ?? 0} tone="good" />
          <Stat label="compile failing" value={summary.compile_errors ?? 0} tone={summary.compile_errors ? "bad" : undefined} />
          <Stat label="validator errors" value={summary.validator_errors ?? 0} tone={summary.validator_errors ? "warn" : undefined} />
          <Stat label="project build" value={summary.build ?? "—"} tone={summary.build === "ok" ? "good" : summary.build === "error" ? "bad" : undefined} />
        </div>
      )}

      <div className="grid-main-side">
        <Card title="Pipeline" actions={live && <span className="muted small">{view.connected ? "live" : "reconnecting…"}</span>}>
          {!view.stages.length && <p className="muted">{j.status === "queued" ? "Waiting for the job ahead of it…" : "No progress yet."}</p>}
          <ol className="timeline">
            {view.stages.map((s) => (
              <li key={s.key + s.title} className={`tl-item tl-${s.status}`}>
                <div className="tl-head">
                  <span className="tl-dot" />
                  <strong>{stageLabel(s.stage, s.round)}</strong>
                  <span className="muted small">{s.title}</span>
                  {s.failures.length > 0 && <Badge tone="bad">{s.failures.length} failed</Badge>}
                </div>
                {s.total > 0 && (
                  <div className="tl-progress">
                    <ProgressBar done={s.done} total={s.total} tone={s.status === "stopped" ? "warn" : s.failures.length ? "warn" : "info"} />
                    <span className="small muted">{s.done}/{s.total}</span>
                  </div>
                )}
                {s.summary && Object.keys(s.summary).length > 0 && (
                  <div className="tl-summary small">
                    {Object.entries(s.summary).filter(([, v]) => typeof v !== "object").map(([k, v]) => (
                      <span key={k}>{k.replace(/_/g, " ")}: <b>{String(v)}</b></span>
                    ))}
                  </div>
                )}
                {s.failures.length > 0 && (
                  <ul className="tl-failures small">
                    {s.failures.slice(0, 8).map((f, i) => <li key={i}><code>{f.item}</code> {f.error}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </Card>

        <div className="side">
          <Card title="Job">
            <KeyValue items={[
              ["Workspace", <Link to={`/workspaces/${encodeURIComponent(j.workspace)}`}>{j.workspace}</Link>],
              ["Mode", j.restart ? "start over" : "resume"],
              ["Queued", fmtTime(j.created_at)],
              ["Started", fmtTime(j.started_at)],
              ["Duration", j.started_at ? fmtDuration(j.started_at, j.finished_at || undefined) : "—"],
              ["LLM calls", `${view.llm.calls}${view.llm.failed ? ` (${view.llm.failed} failed)` : ""}`],
              ["LLM time", `${Math.round(view.llm.seconds)}s`],
            ]} />
            {Object.keys(view.llm.byAgent).length > 0 && (
              <div className="small muted">
                {Object.entries(view.llm.byAgent).map(([a, n]) => <div key={a}>{a.replace(/_/g, " ")}: {n}</div>)}
              </div>
            )}
          </Card>
          <Card title={`Warnings${warnings.length ? ` (${warnings.length})` : ""}`}>
            {warnings.length ? (
              <ul className="messages">
                {warnings.slice(-50).map((m) => <li key={m.seq} className={`msg-${m.level}`}>{m.text}</li>)}
              </ul>
            ) : <p className="muted">None.</p>}
          </Card>
        </div>
      </div>

      <Card>
        <div className="collapsible">
          <button className="collapsible-head" onClick={() => setGhidraOpen(!ghidraOpen)}>
            <span className="chev">{ghidraOpen ? "▾" : "▸"}</span> Ghidra output ({view.ghidra.length} lines)
          </button>
          {ghidraOpen && <pre ref={logRef} className="code log">{view.ghidra.join("\n") || "(no output yet)"}</pre>}
        </div>
        <Collapsible title={`Messages (${view.messages.length})`}>
          <ul className="messages">
            {view.messages.map((m) => <li key={m.seq} className={`msg-${m.level}`}>{m.text}</li>)}
          </ul>
        </Collapsible>
        <Collapsible title={`Settings overrides for this run (${countLeaves(j.overrides) || "none"})`}>
          {countLeaves(j.overrides)
            ? <CodeBlock code={JSON.stringify(j.overrides, null, 2)} language="json" />
            : <p className="muted">This run used the saved defaults.</p>}
        </Collapsible>
      </Card>
    </div>
  );
}
