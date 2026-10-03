import { api } from "../../api/client";
import type { WorkspaceDetail } from "../../api/types";
import { Card, CompileBadge, KeyValue, Stat, TierBar } from "../../components/ui";
import { useApi } from "../../hooks/useApi";
import { fmtTime } from "../../lib/format";

export default function OverviewTab({ workspace: w }: { workspace: WorkspaceDetail }) {
  const rounds = useApi(() => api.rounds(w.name), [w.name]);
  const c = w.counts;
  return (
    <>
      <div className="stats">
        <Stat label="reconstructed" value={`${c.reconstructed}/${c.in_scope}`} />
        <Stat label="compile ok" value={c.compile_ok} tone="good" />
        <Stat label="compile failing" value={c.compile_errors} tone={c.compile_errors ? "bad" : undefined} />
        <Stat label="validator errors" value={c.validator_errors} tone={c.validator_errors ? "warn" : undefined} />
        <Stat label="still low-confidence" value={c.needs_reanalysis} tone={c.needs_reanalysis ? "warn" : undefined} />
        <Stat label="classes" value={c.classes} />
      </div>

      <div className="grid-2">
        <Card title="Function names by confidence">
          <TierBar counts={w.name_confidence} />
          <p className="muted small">
            High: applied automatically. Medium: applied, marked TODO. Low: withheld and re-analyzed next round.
          </p>
          <KeyValue items={[
            ["Functions in the binary", c.functions],
            ["In scope", c.in_scope],
            ["Excluded (library/runtime)", c.excluded],
            ["Duplicate ctor/dtor variants", c.aliases],
            ["Analyzed", c.analyzed],
          ]} />
        </Card>
        <Card title="Run state">
          <KeyValue items={[
            ["Binary", <code className="small">{w.binary}</code>],
            ["Analysis rounds done", w.analysis_round_done],
            ["Current Ghidra round", w.current_round],
            ["Project build", w.build ? <CompileBadge status={w.build} /> : "—"],
            ["Updated", fmtTime(w.updated_at)],
          ]} />
        </Card>
      </div>

      <Card title="Ghidra feedback rounds">
        <p className="muted small">
          Each round applies the accepted knowledge (names, types, class layouts) to Ghidra and re-decompiles.
        </p>
        {rounds.data && rounds.data.length > 1 ? (
          <table className="table compact">
            <thead><tr><th>Round</th><th>Plan: functions</th><th>structs</th><th>globals</th>
              <th>Applied</th><th>Skipped</th><th>Failed</th></tr></thead>
            <tbody>
              {rounds.data.filter((r) => r.round > 0).map((r) => (
                <tr key={r.round}>
                  <td>{r.round}</td>
                  <td>{r.plan?.functions ?? "—"}</td>
                  <td>{r.plan?.structs ?? "—"}</td>
                  <td>{r.plan?.globals ?? "—"}</td>
                  <td className="tone-text-good">{r.applied ?? "—"}</td>
                  <td>{r.skipped ?? "—"}</td>
                  <td className={r.failed ? "tone-text-bad" : ""}>{r.failed ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">No knowledge applied to Ghidra yet.</p>}
      </Card>
    </>
  );
}
