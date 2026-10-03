import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { FunctionSummary } from "../../api/types";
import { Badge, Card, CompileBadge, Empty, ErrorBox, Loading, TierBadge } from "../../components/ui";
import { useApi } from "../../hooks/useApi";

type Filter = "scope" | "attention" | "low" | "uncoded" | "excluded" | "all";
type SortKey = "address" | "name" | "confidence" | "size";

const FILTERS: { id: Filter; label: string; test: (f: FunctionSummary) => boolean }[] = [
  { id: "scope", label: "In scope", test: (f) => !f.excluded && !f.alias_of },
  { id: "attention", label: "Needs attention",
    test: (f) => !f.excluded && !f.alias_of && (f.compile_status === "error" || f.validator_errors > 0 || f.contradictions > 0) },
  { id: "low", label: "Low confidence", test: (f) => !f.excluded && (f.tier === "low" || f.needs_reanalysis) },
  { id: "uncoded", label: "Not reconstructed", test: (f) => !f.excluded && !f.alias_of && !f.has_code },
  { id: "excluded", label: "Excluded", test: (f) => !!f.excluded || !!f.alias_of },
  { id: "all", label: "All", test: () => true },
];

export default function FunctionsTab({ name }: { name: string }) {
  const functions = useApi(() => api.functions(name), [name], 10000);
  const [filter, setFilter] = useState<Filter>("scope");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "address", desc: false });

  const rows = useMemo(() => {
    const all = functions.data ?? [];
    const test = FILTERS.find((f) => f.id === filter)!.test;
    const q = query.trim().toLowerCase();
    const out = all.filter((f) => test(f) && (!q || `${f.address} ${f.name} ${f.ghidra_name} ${f.summary}`.toLowerCase().includes(q)));
    const val = (f: FunctionSummary) =>
      sort.key === "name" ? f.name.toLowerCase() : sort.key === "confidence" ? f.name_confidence ?? -1
        : sort.key === "size" ? f.instructions : parseInt(f.address, 16);
    out.sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * (sort.desc ? -1 : 1));
    return out;
  }, [functions.data, filter, query, sort]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, (functions.data ?? []).filter(f.test).length])),
    [functions.data]);

  const th = (key: SortKey, label: string) => (
    <th className="sortable" onClick={() => setSort({ key, desc: sort.key === key ? !sort.desc : key === "confidence" || key === "size" })}>
      {label}{sort.key === key ? (sort.desc ? " ▾" : " ▴") : ""}
    </th>
  );

  return (
    <Card>
      <div className="toolbar">
        <input className="search" type="search" placeholder="Search address, name, summary…" value={query}
          onChange={(e) => setQuery(e.target.value)} />
        <div className="segmented">
          {FILTERS.map((f) => (
            <button key={f.id} className={filter === f.id ? "active" : ""} onClick={() => setFilter(f.id)}>
              {f.label} <span className="muted">{counts[f.id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
      {functions.error && <ErrorBox error={functions.error} />}
      {!functions.data ? <Loading /> : !rows.length ? <Empty>No functions match.</Empty> : (
        <table className="table">
          <thead>
            <tr>{th("address", "Address")}{th("name", "Name")}{th("confidence", "Name conf.")}
              <th>Validator</th><th>Compile</th>{th("size", "Instr.")}<th>Summary</th></tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.address} className={f.excluded || f.alias_of ? "dim" : ""}>
                <td className="mono small">
                  <Link to={`/workspaces/${encodeURIComponent(name)}/functions/${f.address}`}>{f.address}</Link>
                </td>
                <td>
                  <Link to={`/workspaces/${encodeURIComponent(name)}/functions/${f.address}`} className="mono">{f.name}</Link>
                  {f.name !== f.ghidra_name && <div className="muted small mono">ghidra: {f.ghidra_name}</div>}
                  {f.edited && <Badge tone="info">edited</Badge>}
                  {f.contradictions > 0 && <Badge tone="warn" title="contradicted by the binary">contradiction</Badge>}
                  {f.needs_reanalysis && <Badge tone="warn">re-analysis queued</Badge>}
                </td>
                <td>{f.excluded ? <span className="muted small" title={f.excluded}>excluded</span>
                  : f.alias_of ? <span className="muted small">alias of {f.alias_of}</span>
                    : <TierBadge tier={f.tier} confidence={f.name_confidence} />}</td>
                <td className="small">
                  {f.has_code ? (
                    <>
                      {f.validator_errors > 0 && <span className="tone-text-bad">{f.validator_errors} err </span>}
                      {f.validator_warnings > 0 && <span className="tone-text-warn">{f.validator_warnings} warn</span>}
                      {!f.validator_errors && !f.validator_warnings && <span className="tone-text-good">clean</span>}
                    </>
                  ) : <span className="muted">—</span>}
                </td>
                <td>{f.has_code || f.compile_status === "error" ? <CompileBadge status={f.compile_status} /> : <span className="muted">—</span>}</td>
                <td className="small">{f.instructions}</td>
                <td className="small summary-cell" title={f.excluded || f.summary}>{f.excluded || f.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
