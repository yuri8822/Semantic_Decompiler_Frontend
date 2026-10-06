import type {
  BinaryFile, FunctionDetail, FunctionEdit, FunctionSummary, GlobalEdit, GlobalRecord, Health, Job, JsonSchema,
  LlamaModel, LlamaStatus, LogDetail, LogEntry, ProjectFile, ProvidersInfo, RoundInfo, SettingsValue, TypeDetail, TypeEdit, TypeSummary,
  ValidationErrorItem, WorkspaceDetail, WorkspaceSummary,
} from "./types";

/** API origin: empty means same origin (dev proxy or the API serving the built app). */
export const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : `request failed (${status})`);
    this.status = status;
    this.detail = detail;
  }

  /** Pydantic validation errors (HTTP 422), if that's what this is. */
  get validationErrors(): ValidationErrorItem[] {
    return this.status === 422 && Array.isArray(this.detail) ? (this.detail as ValidationErrorItem[]) : [];
  }
}

async function request<T>(method: string, path: string, body?: unknown, raw = false): Promise<T> {
  const init: RequestInit = { method, headers: {} };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  let res: Response;
  try {
    res = await fetch(API_BASE + path, init);
  } catch {
    throw new ApiError(0, "Cannot reach the backend. Is it running? (python serve.py)");
  }
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (raw ? res.text() : res.json()) as Promise<T>;
}

const enc = encodeURIComponent;
const ws = (name: string) => `/api/workspaces/${enc(name)}`;

export const api = {
  health: () => request<Health>("GET", "/api/health"),

  settingsSchema: () => request<JsonSchema>("GET", "/api/settings/schema"),
  settings: () => request<SettingsValue>("GET", "/api/settings"),
  settingsDefaults: () => request<SettingsValue>("GET", "/api/settings/defaults"),
  saveSettings: (value: SettingsValue) => request<SettingsValue>("PUT", "/api/settings", value),
  /** Merge a partial object into the saved defaults. */
  patchSettings: (partial: SettingsValue) => request<SettingsValue>("PATCH", "/api/settings", partial),
  providers: () => request<ProvidersInfo>("GET", "/api/providers"),
  resolveSettings: (overrides: SettingsValue) => request<SettingsValue>("POST", "/api/settings/resolve", overrides),

  llamacpp: () => request<LlamaStatus>("GET", "/api/llamacpp"),
  startLlamacpp: () => request<LlamaStatus>("POST", "/api/llamacpp/start"),
  stopLlamacpp: () => request<LlamaStatus>("POST", "/api/llamacpp/stop"),
  llamacppModels: () => request<{ models: LlamaModel[]; searched: string[] }>("GET", "/api/llamacpp/models"),

  binaries: () => request<BinaryFile[]>("GET", "/api/binaries"),
  uploadBinary: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ path: string; name: string; size: number }>("POST", "/api/binaries", form);
  },

  jobs: () => request<Job[]>("GET", "/api/jobs"),
  job: (id: string) => request<Job>("GET", `/api/jobs/${enc(id)}`),
  submitJob: (binary: string, restart: boolean, settings: SettingsValue) =>
    request<Job>("POST", "/api/jobs", { binary, restart, settings }),
  cancelJob: (id: string) => request<Job>("POST", `/api/jobs/${enc(id)}/cancel`),
  jobEventsUrl: (id: string, after = 0) => `${API_BASE}/api/jobs/${enc(id)}/events?after=${after}`,

  workspaces: () => request<WorkspaceSummary[]>("GET", "/api/workspaces"),
  workspace: (name: string) => request<WorkspaceDetail>("GET", ws(name)),
  deleteWorkspace: (name: string) => request<void>("DELETE", ws(name)),
  functions: (name: string) => request<FunctionSummary[]>("GET", `${ws(name)}/functions`),
  function: (name: string, address: string) => request<FunctionDetail>("GET", `${ws(name)}/functions/${enc(address)}`),
  types: (name: string) => request<TypeSummary[]>("GET", `${ws(name)}/types`),
  type: (name: string, type: string) => request<TypeDetail>("GET", `${ws(name)}/types/${enc(type)}`),
  globals: (name: string) => request<GlobalRecord[]>("GET", `${ws(name)}/globals`),
  rounds: (name: string) => request<RoundInfo[]>("GET", `${ws(name)}/rounds`),
  roundFile: (name: string, round: number, kind: "plan" | "report") =>
    request<Record<string, unknown>>("GET", `${ws(name)}/rounds/${round}/${kind}`),
  files: (name: string) => request<ProjectFile[]>("GET", `${ws(name)}/files`),
  file: (name: string, path: string) =>
    request<string>("GET", `${ws(name)}/files/${path.split("/").map(enc).join("/")}`, undefined, true),
  logs: (name: string, params: { address?: string; agent?: string } = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    return request<LogEntry[]>("GET", `${ws(name)}/logs${q.size ? "?" + q : ""}`);
  },
  log: (name: string, log: string) => request<LogDetail>("GET", `${ws(name)}/logs/${enc(log)}`),
  report: (name: string) => request<string>("GET", `${ws(name)}/report`, undefined, true),

  // Edits: omit = unchanged, value = override, null = clear. 409 while a job runs on the workspace.
  editFunction: (name: string, address: string, edit: FunctionEdit) =>
    request<FunctionDetail>("PATCH", `${ws(name)}/functions/${enc(address)}`, edit),
  clearFunctionEdits: (name: string, address: string) =>
    request<FunctionDetail>("DELETE", `${ws(name)}/functions/${enc(address)}/overrides`),
  resetFunction: (name: string, address: string, what: { analysis?: boolean; code?: boolean }) =>
    request<FunctionDetail>("POST", `${ws(name)}/functions/${enc(address)}/reset`, what),
  editType: (name: string, type: string, edit: TypeEdit) =>
    request<TypeDetail>("PATCH", `${ws(name)}/types/${enc(type)}`, edit),
  clearTypeEdits: (name: string, type: string) =>
    request<TypeDetail>("DELETE", `${ws(name)}/types/${enc(type)}/overrides`),
  editGlobal: (name: string, address: string, edit: GlobalEdit) =>
    request<GlobalRecord>("PATCH", `${ws(name)}/globals/${enc(address)}`, edit),
  applyEdits: (name: string, settings: SettingsValue = {}) =>
    request<Job>("POST", `${ws(name)}/apply`, { settings }),
};
