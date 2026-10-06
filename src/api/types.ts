// Shapes returned by the Semantic Decompiler API (see the backend's api/app.py).

export type Tier = "high" | "medium" | "low";
export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled" | "interrupted";
export type CompileStatus = "unchecked" | "ok" | "error" | "skipped";

/* ---------- settings ---------- */

export type JsonSchema = {
  type?: string | string[];
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  const?: unknown;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
};

export type SettingsValue = Record<string, unknown>;

export interface ValidationErrorItem {
  loc: (string | number)[];
  msg: string;
  type: string;
}

/* ---------- system ---------- */

export interface Health {
  ok: boolean;
  ghidra: { headless: string; found: boolean };
  compiler: { cxx: string; found: boolean };
  cmake: { cmake: string; found: boolean };
  providers: { name: string; api_key_var: string; api_key_present: boolean | null }[];
  workspace_root: string;
  running_job: string | null;
}

export interface ProviderStatus {
  name: string;
  label: string;
  model: string;
  local: boolean;
  api_key_var: string;
  api_key_present: boolean | null;
  reachable: boolean | null;
  /** Not running, but the backend launches it when a run needs it (llama.cpp). */
  auto_start: boolean;
  /** Can be used right now (key set, local server answering, or startable on demand). */
  usable: boolean;
  problem: string;
}

/* ---------- local llama.cpp server ---------- */

/** stopped/exited: not running; loading: started, model loading; external: started outside the backend. */
export type LlamaState = "stopped" | "loading" | "ready" | "exited" | "external";

export interface LlamaStatus {
  state: LlamaState;
  ready: boolean;
  pid: number | null;
  exit_code: number | null;
  started_at: string;
  command: string[];
  /** Running, but the settings changed since it started: restart to apply them. */
  stale: boolean;
  executable: string;
  installed: boolean;
  model_path: string;
  model_exists: boolean;
  base_url: string;
  auto_start: boolean;
  can_start: boolean;
  problem: string;
  log_tail: string;
}

export interface LlamaModel {
  path: string;
  name: string;
  /** "Org/Repo" for the HuggingFace cache, else the folder it was found in. */
  repo: string;
  size: number;
  folder: string;
}

export interface ProvidersInfo {
  default: string;
  /** Per-agent overrides of the default (null = uses the default). */
  agents: Record<"analyzer" | "type_reconstructor" | "code_reconstructor", string | null>;
  providers: ProviderStatus[];
}

export interface BinaryFile {
  path: string;
  name: string;
  size: number;
  folder: string;
  workspace: string | null;
}

/* ---------- jobs & events ---------- */

export interface JobProgress {
  stage?: string;
  round?: number;
  title?: string;
  done?: number;
  total?: number;
}

export interface RunSummary {
  functions: number;
  reconstructed: number;
  name_confidence: Record<Tier, number>;
  compile_ok: number;
  compile_errors: number;
  validator_errors: number;
  build: string;
  failures: number;
  project: string;
  report: string;
  workspace: string;
}

export interface Job {
  id: string;
  binary: string;
  workspace: string;
  restart: boolean;
  overrides: SettingsValue;
  status: JobStatus;
  created_at: string;
  started_at: string;
  finished_at: string;
  summary: Partial<RunSummary>;
  error: string;
  event_count: number;
  progress: JobProgress;
  settings?: SettingsValue;
  events?: PipelineEvent[];
}

interface EventBase {
  seq: number;
  time: string;
}

export type PipelineEvent = EventBase &
  (
    | { type: "run_started"; binary: string; workspace: string; settings: SettingsValue }
    | { type: "stage"; stage: string; round: number; title: string }
    | { type: "progress"; stage: string; round: number; done: number; total: number; item: string; ok: boolean; error: string }
    | { type: "message"; level: "info" | "warning" | "error"; text: string }
    | { type: "llm_call"; agent: string; provider: string; tag: string; seconds: number; ok: boolean; error: string; log: string }
    | { type: "ghidra_output"; line: string }
    | { type: "stage_done"; stage: string; round: number; summary: Record<string, unknown> }
    | { type: "run_finished"; status: "done" | "cancelled" | "failed"; summary: Partial<RunSummary>; error: string }
  );

/* ---------- workspaces ---------- */

export interface WorkspaceSummary {
  name: string;
  /** Recorded binary path, or a same-named file in the backend's binary folders if it moved. */
  binary: string;
  binary_found: boolean;
  /** User edits exist that the next run has not applied to Ghidra/code yet. */
  edits_pending: boolean;
  /** Unreadable files (e.g. after a power cut); the next run sets them aside and redoes them. */
  corrupt_files: string[];
  overrides: { functions: number; classes: number; globals: number };
  program: { name?: string; language?: string; compiler?: string; image_base?: string; pointer_size?: number };
  updated_at: string;
  current_round: number;
  analysis_round_done: number;
  build: string;
  counts: {
    functions: number;
    in_scope: number;
    excluded: number;
    aliases: number;
    analyzed: number;
    reconstructed: number;
    compile_ok: number;
    compile_errors: number;
    validator_errors: number;
    needs_reanalysis: number;
    classes: number;
    globals: number;
  };
  name_confidence: Record<Tier, number>;
}

export interface WorkspaceDetail extends WorkspaceSummary {
  meta: Record<string, unknown> & { rounds?: RoundInfo[] };
}

export interface FunctionSummary {
  address: string;
  name: string;
  ghidra_name: string;
  excluded: string;
  alias_of: string;
  summary: string;
  name_confidence: number | null;
  tier: Tier | null;
  analysis_round: number;
  needs_reanalysis: boolean;
  contradictions: number;
  has_code: boolean;
  compile_status: CompileStatus;
  validator_errors: number;
  validator_warnings: number;
  instructions: number;
  class: string;
  edited: boolean;
}

export interface Issue {
  severity: "error" | "warning";
  check: string;
  message: string;
}

export interface ParamGuess {
  index: number;
  old_name: string;
  name: string;
  type: string;
  role: "normal" | "this" | "return_slot";
  meaning: string;
  confidence: number;
}

export interface FieldGuess {
  param: number;
  class_name: string;
  offset: number;
  name: string;
  type: string;
  confidence: number;
  evidence: string;
}

export interface FunctionAnalysis {
  name: string;
  name_confidence: number;
  class_name: string;
  method_kind: string;
  summary: string;
  evidence: string[];
  return_type: string;
  return_meaning: string;
  return_confidence: number;
  params: ParamGuess[];
  locals: { old_name: string; name: string; type: string; confidence: number }[];
  fields: FieldGuess[];
  globals: { address: string; old_name: string; name: string; type: string; confidence: number }[];
  notes: string[];
  contradictions: string[];
  observed_return_type: string;
  round: number;
  provider: string;
}

/** User overrides on a function (absent key = not overridden). */
export interface FunctionOverrides {
  name?: string;
  class_name?: string;
  method_kind?: string;
  return_type?: string;
  summary?: string;
  params?: Record<string, { name?: string; type?: string; role?: string }>;
  locals?: Record<string, { name?: string; type?: string }>;
}

export interface FunctionRecord {
  address: string;
  ghidra_name: string;
  full_name: string;
  excluded: string;
  alias_of: string;
  /** Effective analysis: the LLM's, with the user's overrides applied. */
  analysis: FunctionAnalysis | null;
  /** What the LLM itself concluded (null for records from before editing existed). */
  llm_analysis: FunctionAnalysis | null;
  overrides: FunctionOverrides;
  analysis_history: { round: number; name: string; name_confidence: number; summary: string }[];
  needs_reanalysis: boolean;
  cpp: string;
  cpp_provider: string;
  cpp_signature: string;
  static_issues: Issue[];
  static_fix_rounds: number;
  compile_status: CompileStatus;
  compile_errors: string;
  compile_fix_rounds: number;
}

export interface Signature {
  address: string;
  class: string;
  name: string;
  kind: string;
  return_type: string;
  params: { type: string; name: string }[];
  definition: string;
  todos: string[];
}

export interface Neighbour {
  address: string;
  name: string;
  excluded: boolean;
  summary: string;
}

export interface FunctionDetail {
  record: FunctionRecord;
  signature: Signature | null;
  ghidra: {
    round: number;
    signature: string;
    decompiled: string;
    decompiled_round0: string;
    assembly: string[];
    parameters: { index: number; name: string; type: string; is_this: boolean; hidden_return: boolean }[];
    locals: { name: string; type: string }[];
    /** param >= 0: relative to that parameter; param -1: through a pointer to structure `type`. */
    field_accesses: { param: number; param_name: string; type?: string; offset: number; size: number; access: string; at: string }[];
    arg_passes: { callee: string; arg: number; param: number; offset: number }[];
    strings: string[];
    globals: { address: string; name: string; type: string; external: boolean }[];
    calls: { address: string; name: string; external: boolean; library: string }[];
    stats: Record<string, number>;
    decision_points: number;
  };
  callers: Neighbour[];
  callees: Neighbour[];
}

export interface TypeSummary {
  name: string;
  kind: string;
  size: number;
  confidence: number;
  tier: Tier;
  base_class: string;
  fields: number;
  members: number;
  round: number;
  from_symbols: boolean;
  edited: boolean;
}

export interface TypeOverrides {
  base_class?: string;
  size?: number;
  fields?: Record<string, { name?: string; type?: string; size?: number; remove?: boolean }>;
}

export interface TypeDetail {
  name: string;
  kind: string;
  size: number;
  size_confidence: number;
  confidence: number;
  base_class: string;
  base_confidence: number;
  fields: { offset: number; size: number; name: string; type: string; confidence: number; tier: Tier; evidence: string[] }[];
  methods: { address: string; name: string; declaration: string }[];
  same_as: string[];
  notes: string;
  from_symbols: boolean;
  overrides: TypeOverrides;
}

export interface GlobalRecord {
  address: string;
  ghidra_name: string;
  name: string;
  type: string;
  confidence: number;
  tier: Tier;
  referenced_by: string[];
  overrides: { name?: string; type?: string };
  llm: { name?: string; type?: string; confidence?: number };
}

/* ---------- edits (request bodies) ---------- */
// For every field: omit = unchanged, a value = override, null = clear the override.

export interface FunctionEdit {
  name?: string | null;
  class_name?: string | null;
  method_kind?: string | null;
  return_type?: string | null;
  summary?: string | null;
  params?: { index: number; name?: string | null; type?: string | null }[];
  locals?: { old_name: string; name?: string | null; type?: string | null }[];
}

export interface TypeEdit {
  base_class?: string | null;
  size?: number | null;
  fields?: { offset: number; name?: string | null; type?: string | null; size?: number | null;
    remove?: boolean; clear?: boolean }[];
}

export interface GlobalEdit {
  name?: string | null;
  type?: string | null;
}

export interface RoundInfo {
  round: number;
  ir?: boolean | string;
  plan?: Record<string, number>;
  applied?: number;
  skipped?: number;
  failed?: number;
  has_plan?: boolean;
  has_report?: boolean;
}

export interface ProjectFile {
  path: string;
  size: number;
}

export interface LogEntry {
  name: string;
  n: number;
  tag: string;
  size: number;
  error: boolean;
}

export interface LogDetail {
  name: string;
  provider: string;
  system: string;
  user: string;
  response: string;
}
