import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { FunctionAnalysis, FunctionDetail, Neighbour } from "../api/types";
import { CodeBlock } from "../components/CodeBlock";
import { Badge, Card, Collapsible, CompileBadge, Empty, ErrorBox, KeyValue, Loading, Tabs, TierBadge } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { useTier } from "../hooks/useTier";
import { hex, pct } from "../lib/format";
import LogsTab from "./workspace/LogsTab";

type GhidraView = "current" | "round0" | "assembly";

export default function FunctionPage() {
  const { name = "", address = "" } = useParams();
  const detail = useApi(() => api.function(name, address), [name, address]);
  const [ghidraView, setGhidraView] = useState<GhidraView>("current");
  const tierOf = useTier();

  if (detail.error) return <div className="page"><ErrorBox error={detail.error} /></div>;
  if (!detail.data) return <div className="page"><Loading /></div>;
  const d = detail.data;
  const r = d.record;
  const a = r.analysis;
  const errors = r.static_issues.filter((i) => i.severity === "error");
  const warnings = r.static_issues.filter((i) => i.severity === "warning");
  const ws = `/workspaces/${encodeURIComponent(name)}`;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="muted small"><Link to={`${ws}?tab=functions`}>← {name} functions</Link></p>
          <h1 className="mono fn-title">{d.signature?.definition ?? r.full_name}</h1>
          <div className="row gap wrap">
            <span className="mono muted">{r.address}</span>
            {d.signature && r.full_name !== (d.signature.class ? `${d.signature.class}::${d.signature.name}` : d.signature.name) &&
              <span className="muted small mono">ghidra: {r.full_name}</span>}
            {r.excluded && <Badge>excluded: {r.excluded}</Badge>}
            {r.alias_of && <Badge>alias of <Link to={`${ws}/functions/${r.alias_of}`}>{r.alias_of}</Link></Badge>}
            {a && <TierBadge tier={tierOf(a.name_confidence)} confidence={a.name_confidence} />}
            {r.cpp && <CompileBadge status={r.compile_status} />}
            {r.needs_reanalysis && <Badge tone="warn">low confidence — queued for re-analysis</Badge>}
          </div>
        </div>
      </div>

      {a?.contradictions.length ? (
        <div className="alert alert-warn">
          <strong>Contradicted by the binary:</strong>
          <ul>{a.contradictions.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      ) : null}
      {d.signature?.todos.length ? (
        <div className="alert alert-info">
          <strong>Medium-confidence choices in this signature (marked TODO in the code):</strong>
          <ul>{d.signature.todos.map((t, i) => <li key={i}>{t.replace(/^TODO:\s*/, "")}</li>)}</ul>
        </div>
      ) : null}

      <div className="compare">
        <Card title="Ghidra" actions={
          <Tabs<GhidraView> value={ghidraView} onChange={setGhidraView} tabs={[
            { id: "current", label: `Round ${d.ghidra.round}` },
            { id: "round0", label: "Round 0 (raw)" },
            { id: "assembly", label: "Assembly" },
          ]} />
        }>
          {ghidraView === "assembly"
            ? <CodeBlock code={d.ghidra.assembly.join("\n")} language="x86asm" maxHeight="70vh" />
            : <CodeBlock code={ghidraView === "current" ? d.ghidra.decompiled : d.ghidra.decompiled_round0} maxHeight="70vh" />}
          <p className="muted small">
            {d.ghidra.stats.instructions} instructions · {d.ghidra.stats.basic_blocks} blocks · {d.ghidra.decision_points} decision points
          </p>
        </Card>
        <Card title="Reconstructed C++" actions={r.cpp && <span className="muted small">
          {r.cpp_provider} · {r.static_fix_rounds} validator fix · {r.compile_fix_rounds} compile fix round(s)</span>}>
          {r.cpp ? <CodeBlock code={r.cpp} maxHeight="70vh" />
            : <Empty>{r.excluded ? "Excluded from reconstruction." : r.alias_of ? "Identical to the function it aliases." : "Not reconstructed yet."}</Empty>}
        </Card>
      </div>

      {(errors.length > 0 || warnings.length > 0 || r.compile_errors) && (
        <Card title="Validation">
          {errors.length > 0 && <ul className="issues">{errors.map((i, k) => <li key={k} className="issue-error"><Badge tone="bad">{i.check}</Badge> {i.message}</li>)}</ul>}
          {warnings.length > 0 && <ul className="issues">{warnings.map((i, k) => <li key={k} className="issue-warning"><Badge tone="warn">{i.check}</Badge> {i.message}</li>)}</ul>}
          {r.compile_errors && <><h3>Compiler</h3><CodeBlock code={r.compile_errors} language="text" maxHeight={300} /></>}
        </Card>
      )}

      {a ? <AnalysisCard a={a} d={d} /> : <Card title="Analysis"><Empty>Not analyzed yet.</Empty></Card>}

      <div className="grid-2">
        <Card title={`Callers (${d.callers.length})`}><NeighbourList items={d.callers} ws={ws} /></Card>
        <Card title={`Callees (${d.callees.length})`}><NeighbourList items={d.callees} ws={ws} />
          {d.ghidra.calls.filter((c) => c.external).length > 0 && (
            <p className="muted small">Imports: {d.ghidra.calls.filter((c) => c.external).map((c) => c.name).join(", ")}</p>
          )}
        </Card>
      </div>

      <Card title="Proven memory accesses (p-code)">
        <p className="muted small">Loads and stores through <code>parameter + constant offset</code> — the ground truth that field claims are checked against.</p>
        {d.ghidra.field_accesses.length ? (
          <table className="table compact">
            <thead><tr><th>Parameter</th><th>Offset</th><th>Size</th><th>Access</th><th>At</th></tr></thead>
            <tbody>
              {dedupeAccesses(d).map((x, i) => (
                <tr key={i}><td className="mono">[{x.param}] {x.param_name}</td><td className="mono">+{hex(x.offset)}</td>
                  <td>{x.size}</td><td>{x.access}</td><td className="mono small muted">{x.at}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">None.</p>}
        {d.ghidra.strings.length > 0 && (
          <Collapsible title={`Referenced strings (${d.ghidra.strings.length})`}>
            <ul className="plain mono small">{d.ghidra.strings.map((s, i) => <li key={i}>{JSON.stringify(s)}</li>)}</ul>
          </Collapsible>
        )}
      </Card>

      <h2 className="section-title">LLM calls for this function</h2>
      <LogsTab name={name} address={r.address} />
    </div>
  );
}

function AnalysisCard({ a, d }: { a: FunctionAnalysis; d: FunctionDetail }) {
  const tierOf = useTier();
  return (
    <Card title="Analysis" actions={<span className="muted small">round {a.round} · {a.provider}</span>}>
      <p className="lead">{a.summary}</p>
      <KeyValue items={[
        ["Name", <><span className="mono">{a.name}</span> <TierBadge tier={tierOf(a.name_confidence)} confidence={a.name_confidence} /></>],
        ["Kind", `${a.method_kind}${a.class_name ? ` of ${a.class_name}` : ""}`],
        ["Returns", <>
          <span className="mono">{a.return_type || "—"}</span>{" "}
          {a.return_type && <TierBadge tier={tierOf(a.return_confidence)} confidence={a.return_confidence} />}
          {a.return_meaning && <span className="muted"> — {a.return_meaning}</span>}
          {a.observed_return_type && <div className="small tone-text-warn">callers receive it as {a.observed_return_type}</div>}
        </>],
      ]} />

      {a.evidence.length > 0 && <><h3>Evidence</h3><ul className="evidence">{a.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul></>}

      {a.params.length > 0 && (
        <>
          <h3>Parameters</h3>
          <table className="table compact">
            <thead><tr><th>#</th><th>Ghidra</th><th>Name</th><th>Type</th><th>Role</th><th>Confidence</th><th>Meaning</th></tr></thead>
            <tbody>
              {a.params.map((p) => (
                <tr key={p.index} className={tierOf(p.confidence) === "low" ? "dim" : ""}>
                  <td>{p.index}</td>
                  <td className="mono small">{d.ghidra.parameters.find((x) => x.index === p.index)?.name ?? p.old_name}</td>
                  <td className="mono"><strong>{p.name}</strong></td>
                  <td className="mono small">{p.type}</td>
                  <td>{p.role !== "normal" ? <Badge tone="info">{p.role.replace("_", " ")}</Badge> : ""}</td>
                  <td><TierBadge tier={tierOf(p.confidence)} confidence={p.confidence} /></td>
                  <td className="small">{p.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {a.fields.length > 0 && (
        <>
          <h3>Fields touched</h3>
          <table className="table compact">
            <thead><tr><th>Param</th><th>Class</th><th>Offset</th><th>Name</th><th>Type</th><th>Confidence</th><th>Evidence</th></tr></thead>
            <tbody>
              {a.fields.map((f, i) => (
                <tr key={i} className={tierOf(f.confidence) === "low" ? "dim" : ""}>
                  <td>{f.param}</td><td className="mono small">{f.class_name}</td><td className="mono">+{hex(f.offset)}</td>
                  <td className="mono"><strong>{f.name}</strong></td><td className="mono small">{f.type}</td>
                  <td><TierBadge tier={tierOf(f.confidence)} confidence={f.confidence} /></td><td className="small">{f.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {(a.locals.length > 0 || a.globals.length > 0) && (
        <Collapsible title={`Locals (${a.locals.length}) and globals (${a.globals.length})`}>
          <table className="table compact">
            <thead><tr><th>Ghidra</th><th>Name</th><th>Type</th><th>Confidence</th></tr></thead>
            <tbody>
              {[...a.locals, ...a.globals].map((v, i) => (
                <tr key={i}><td className="mono small">{v.old_name}</td><td className="mono">{v.name}</td>
                  <td className="mono small">{v.type}</td><td>{pct(v.confidence)}</td></tr>
              ))}
            </tbody>
          </table>
        </Collapsible>
      )}
      {a.notes.length > 0 && <Collapsible title={`Notes (${a.notes.length})`}><ul className="plain small">{a.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></Collapsible>}
    </Card>
  );
}

function NeighbourList({ items, ws }: { items: Neighbour[]; ws: string }) {
  if (!items.length) return <p className="muted">None.</p>;
  return (
    <ul className="plain neighbours">
      {items.map((n) => (
        <li key={n.address} className={n.excluded ? "dim" : ""}>
          <Link className="mono" to={`${ws}/functions/${n.address}`}>{n.name}</Link>
          {n.excluded ? <span className="muted small"> (library)</span> : n.summary && <div className="muted small">{n.summary}</div>}
        </li>
      ))}
    </ul>
  );
}

function dedupeAccesses(d: FunctionDetail) {
  const seen = new Set<string>();
  return d.ghidra.field_accesses.filter((x) => {
    const k = `${x.param}:${x.offset}:${x.size}:${x.access}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
