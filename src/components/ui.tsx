import { type ReactNode, useState } from "react";
import type { CompileStatus, JobStatus, Tier } from "../api/types";
import { pct } from "../lib/format";

export function Badge({ tone = "neutral", children, title }: { tone?: string; children: ReactNode; title?: string }) {
  return <span className={`badge badge-${tone}`} title={title}>{children}</span>;
}

export function TierBadge({ tier, confidence }: { tier: Tier | null | undefined; confidence?: number | null }) {
  if (!tier) return <Badge>not analyzed</Badge>;
  const tone = tier === "high" ? "good" : tier === "medium" ? "warn" : "bad";
  return <Badge tone={tone} title={`${tier} confidence`}>{confidence != null ? pct(confidence) : tier}</Badge>;
}

const JOB_TONES: Record<JobStatus, string> = {
  queued: "neutral", running: "info", done: "good", failed: "bad", cancelled: "warn", interrupted: "warn",
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge tone={JOB_TONES[status]}>{status === "running" ? <><span className="pulse" /> running</> : status}</Badge>;
}

export function CompileBadge({ status }: { status: CompileStatus | string }) {
  const tone = status === "ok" ? "good" : status === "error" ? "bad" : "neutral";
  return <Badge tone={tone}>{status}</Badge>;
}

export function ProgressBar({ done, total, tone = "info" }: { done: number; total: number; tone?: string }) {
  const p = total ? Math.min(100, (done / total) * 100) : 0;
  return (
    <div className="progress" role="progressbar" aria-valuenow={done} aria-valuemax={total}>
      <div className={`progress-fill tone-${tone}`} style={{ width: `${p}%` }} />
    </div>
  );
}

/** Stacked high/medium/low distribution bar. */
export function TierBar({ counts }: { counts: Record<Tier, number> }) {
  const total = counts.high + counts.medium + counts.low;
  if (!total) return <span className="muted">no analyses yet</span>;
  return (
    <div className="tierbar" title={`${counts.high} high · ${counts.medium} medium · ${counts.low} low`}>
      {(["high", "medium", "low"] as Tier[]).map((t) =>
        counts[t] ? <div key={t} className={`tierbar-${t}`} style={{ flex: counts[t] }}>{counts[t]}</div> : null)}
    </div>
  );
}

export function Card({ title, actions, children, className = "" }:
  { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="stat">
      <div className={`stat-value ${tone ? `tone-text-${tone}` : ""}`}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return <div className="alert alert-bad" role="alert">{msg}</div>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="muted loading">{label}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Tabs<T extends string>({ tabs, value, onChange }:
  { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={t.id === value}
          className={`tab ${t.id === value ? "active" : ""}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Collapsible({ title, children, defaultOpen = false }:
  { title: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`collapsible ${open ? "open" : ""}`}>
      <button className="collapsible-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="chev">{open ? "▾" : "▸"}</span> {title}
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([k, v], i) => (
        <div key={i} className="kv-row"><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}
