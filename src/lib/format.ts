export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function fmtAgo(iso: string): string {
  if (!iso) return "—";
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (Number.isNaN(seconds)) return iso;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

export function fmtDuration(fromIso: string, toIso?: string): string {
  if (!fromIso) return "—";
  const ms = (toIso ? new Date(toIso).getTime() : Date.now()) - new Date(fromIso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export function hex(n: number): string {
  return `0x${n.toString(16)}`;
}

export function pct(conf: number | null | undefined): string {
  return conf == null ? "—" : conf.toFixed(2);
}

const STAGE_LABELS: Record<string, string> = {
  ghidra: "Ghidra analysis",
  scope: "Scope",
  analysis: "Analyzer",
  types: "Type Reconstructor",
  apply: "Ghidra apply",
  code: "Code Reconstructor",
  project: "Project build",
};

export function stageLabel(stage: string, round = 0): string {
  const label = STAGE_LABELS[stage] ?? stage;
  return round ? `${label} · round ${round}` : label;
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
