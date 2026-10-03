# Frontend handoff

You're taking over the web frontend of the **Semantic Decompiler**. This file is meant to be
all the context you need. Read it before changing anything.

## 1. What the product is

The backend reconstructs readable, compilable C++ from a binary executable. **Ghidra** is the
source of truth for what the machine code does. **LLM agents** (Analyzer, Type Reconstructor,
Code Reconstructor) add meaning on top: names, types, class layouts and idiomatic code. A
deterministic **Validator** checks their output against Ghidra's facts and the C++ compiler.

A run on one binary looks like this:

- Ghidra analyzes the binary and exports it ("round 0").
- Each analysis round:
  - **Analyzer** works through the functions, callees before callers.
  - **Type Reconstructor** builds the class layouts.
  - Confident findings are applied back into Ghidra, which re-decompiles ("round N").
  - Low-confidence functions are re-analyzed in the next round.
- **Code Reconstructor** writes each function, fixing it until the Validator and the compiler
  are satisfied (up to a limit).
- The results are written out as a C++ project (CMake) plus a report.

Every claim carries a **confidence**, which decides what happens to it:

| Tier | Default range | What happens |
|---|---|---|
| high | ≥ 0.85 | applied automatically |
| medium | ≥ 0.60 | applied, but marked TODO |
| low | < 0.60 | withheld, and re-analyzed next round |

The thresholds are user settings. The UI should make these tiers visible everywhere.

## 2. Repos and how to run

The project is split into two repos:
- **Backend repo:** Python. It contains `api/`, `pipeline.py`, `settings.py`, Ghidra scripts and
  agents.
- **Frontend repo (this one):** React 18 + TypeScript + Vite. Runtime dependencies are
  `react-router-dom` v6, `highlight.js` and `react-markdown` + `remark-gfm`. There's no CSS
  framework.

To run it:
1. Start the backend from the backend repo with `python serve.py` (or `start_api.bat`). It
   listens on `http://127.0.0.1:8765`, and interactive API docs are at `/docs`.
2. In this repo, run `npm install`, then `npm run dev`, and open http://localhost:5173. Vite
   proxies `/api` to the backend.

| Variable | Used by | Purpose |
|---|---|---|
| `API_PROXY_TARGET` | dev server | Where `/api` is proxied. Default `http://127.0.0.1:8765`. |
| `VITE_API_URL` | built app | Absolute API origin. Empty means same origin. |

The backend allows CORS from any `localhost` / `127.0.0.1` port. It is localhost-only by
design, with no auth.

Other commands: `npm run typecheck`, and `npm run build` (runs `tsc` and then `vite build`).
Both currently pass with zero errors. Keep it that way.

## 3. Current state: an MVP that works end to end

Every screen below was checked in a real browser against the live backend, with real data
from a run on `Chess.exe` (28 application functions, 11 classes).

| Route | File | What it does |
|---|---|---|
| `/` | `pages/Dashboard.tsx` | Environment checks (Ghidra, compiler, CMake, API keys), recent jobs, workspace cards |
| `/run` | `pages/NewRunPage.tsx` | Pick a binary (list, upload or path) and resume or start over. Quick options, plus the full settings form as per-run overrides. |
| `/jobs` | `pages/JobsPage.tsx` | Job list, polled every 2 s, with cancel |
| `/jobs/:id` | `pages/JobPage.tsx` | Live job view over SSE: stage timeline with progress, failures, warnings, LLM stats, Ghidra output, cancel |
| `/settings` | `pages/SettingsPage.tsx` | Saved defaults. Schema-generated form with search, change markers, revert, reset to built-ins. |
| `/workspaces` | `pages/WorkspacesPage.tsx` | All workspaces (one per binary) |
| `/workspaces/:name` | `pages/WorkspacePage.tsx` + `pages/workspace/*Tab.tsx` | Tabs, chosen with `?tab=`: overview, functions, classes, globals, files, logs, report |
| `/workspaces/:name/functions/:address` | `pages/FunctionPage.tsx` | See below |
| `/workspaces/:name/logs/:log` | `pages/LogPage.tsx` | One LLM call: response, prompt, system prompt |

The function page shows Ghidra's output (current round, round 0, or assembly) side by side
with the reconstructed C++. Below that it shows:
- the analysis: summary, evidence, parameters, fields, locals and globals, each with
  confidence;
- contradictions, and medium-confidence TODO choices;
- Validator issues and compiler errors;
- proven memory accesses;
- callers and callees;
- that function's LLM calls.

Project layout:

```
src/
  api/client.ts       every endpoint, as one `api` object; ApiError (has .validationErrors for 422)
  api/types.ts        TypeScript shapes of every response and event (keep in sync with the backend)
  hooks/useApi.ts     fetch with optional background polling: useApi(fn, deps, pollMs)
  hooks/useJobEvents.ts  SSE subscription folded into a view model (stages, messages, llm, ghidra)
  hooks/useTier.ts    confidence -> tier using the SAVED thresholds
  components/SchemaForm.tsx  renders any pydantic JSON Schema (see §5)
  components/CodeBlock.tsx   highlight.js: cpp, x86asm, cmake, json, text
  components/ui.tsx   Badge/TierBadge/JobStatusBadge/CompileBadge, Card, Stat, Tabs, Collapsible,
                      ProgressBar, TierBar, KeyValue, ErrorBox, Loading, Empty
  lib/format.ts       sizes, times, durations, hex, stage labels
  lib/objects.ts      getPath/setPath/diff/countLeaves (settings overrides are diffs)
  styles.css          design tokens on :root, dark theme via prefers-color-scheme
```

The frontend has no tests yet. If you add a test runner, Vitest fits the existing Vite setup.

## 4. API contract

`src/api/types.ts` mirrors every response shape and is your reference. The backend's
`api/app.py` lists every route in its docstring, and `/docs` on the running backend is
authoritative.

### Endpoints

| Method + path | Body / query | Returns |
|---|---|---|
| `GET /api/health` | | Ghidra/compiler/CMake found, API key present per provider, `running_job` |
| `GET /api/settings/schema` | | pydantic JSON Schema of `Settings` |
| `GET /api/settings` | | saved defaults (full object) |
| `GET /api/settings/defaults` | | built-in defaults |
| `PUT /api/settings` | full Settings object | saved settings |
| `PATCH /api/settings` | partial object (deep-merged) | saved settings |
| `POST /api/settings/resolve` | partial overrides | effective settings for a run (not saved) |
| `GET /api/binaries` | | executables in the backend's `binaries/` and `TestBinaries/`, each with `workspace` if one exists |
| `POST /api/binaries` | multipart `file` | `{path, name, size}`, saved into `binaries/` |
| `POST /api/jobs` | `{binary, restart, settings}` | Job. `settings` is a partial override; `restart` deletes the workspace first. |
| `GET /api/jobs` | | jobs, newest first, each with a `progress` snapshot |
| `GET /api/jobs/{id}` | `?events=true` | Job, plus its `settings`; with the flag, every event too |
| `POST /api/jobs/{id}/cancel` | | Job |
| `GET /api/jobs/{id}/events` | `?after=N` | **SSE** stream (see below) |
| `GET /api/jobs/{id}/events/list` | `?after=&limit=&types=a,b` | JSON page of events |
| `GET /api/workspaces` | | summaries (counts, `name_confidence` tiers, build status) |
| `GET /api/workspaces/{name}` | | summary + raw `meta` (`knowledge.json`) |
| `DELETE /api/workspaces/{name}` | | 204; **409** if a job for it is queued or running |
| `GET …/{name}/functions` | | every function, summary row |
| `GET …/{name}/functions/{address}` | | full detail (`FunctionDetail` in types.ts) |
| `GET …/{name}/types`, `…/types/{class}` | | class list / layout + methods |
| `GET …/{name}/globals`, `…/strings` | | |
| `GET …/{name}/relationships/{kind}` | kind: `calls`, `field_accesses`, `this_passing`, `class_members` | raw tables (not used by the UI yet) |
| `GET …/{name}/rounds`, `…/rounds/{n}/{plan\|report}` | | Ghidra feedback rounds; what was planned and applied |
| `GET …/{name}/files`, `…/files/{path}` | | generated C++ project tree / file text |
| `GET …/{name}/logs` | `?address=&agent=analyzer\|type_reconstructor\|code_reconstructor` | LLM call list |
| `GET …/{name}/logs/{file}` | | `{provider, system, user, response}` |
| `GET …/{name}/report` | | markdown |

### Errors

| Status | Meaning | Body |
|---|---|---|
| 400 | bad request | `{"detail": "<message>"}`, e.g. binary not found, missing API key, workspace already busy |
| 404 | not found | `{"detail": "<message>"}` |
| 409 | conflict | `{"detail": "<message>"}` (workspace busy) |
| 422 | validation | `{"detail": [{"loc": [...], "msg": "...", "type": "..."}]}` |

For 422, `loc` is relative to the Settings root, for example `["llm", "concurrency"]`, or
`["confidence"]` for cross-field rules. `errorMap()` in SchemaForm turns these into
`{"llm.concurrency": msg}`.

### Jobs and events

Jobs run **one at a time**, because Ghidra locks its project. A job's `workspace` is the
binary's file name without the extension. Only one queued or running job is allowed per
workspace. Statuses are `queued`, `running`, `done`, `failed`, `cancelled`, and
`interrupted` (the server restarted mid-run). Job history and event logs persist across
backend restarts.

**SSE:** each message's `data` is one JSON event with `seq` (0-based, contiguous) and `type`.
No `event:` field is sent, so a plain `onmessage` receives everything. The stream ends with
`{"type": "stream_end", "status": ...}`. The server honours `Last-Event-ID` (EventSource sends
it on reconnect) and `?after=N`, so streams resume without gaps or repeats.

Event types (defined at the top of the backend's `pipeline.py`):

```
run_started   {binary, workspace, settings}
stage         {stage, round, title}                 stage ∈ ghidra|scope|analysis|types|apply|code|project
progress      {stage, round, done, total, item, ok, error}
message       {level: info|warning|error, text}
llm_call      {agent, provider, tag, seconds, ok, error, log}   log = file name for /logs/{file}
ghidra_output {line}                                 can be thousands of lines; the UI keeps the last 400
stage_done    {stage, round, summary}                summary = small dict of counts
run_finished  {status: done|cancelled|failed, summary, error}
```

**Cancel** stops between work items. In-flight LLM calls finish and Ghidra is killed.
Progress is never lost: resubmitting the same binary without `restart` resumes.

### Things the backend guarantees

- **Reads never write to a workspace**, so browsing a workspace while a job updates it is safe.
  Expect data to change underneath you; light polling is used in a few places.
- **Function addresses** are lowercase hex with `0x` (`0x140002a10`). The API also accepts
  other casings and zero-padding.
- **Function lists include excluded functions.** Library and runtime code has `excluded` set
  to a reason. Duplicate constructor/destructor variants have `alias_of`.
- **`tier` fields in responses** are computed with the saved thresholds. Where a response has
  only raw confidence, use `useTier()`. Never hard-code 0.85 / 0.6.

## 5. Design decisions to keep

1. **Settings UI is schema-driven. Don't hand-build settings forms.** `SchemaForm` renders
   `GET /api/settings/schema`: `$ref` groups with titles and descriptions, enums, nullable
   enums (`anyOf [X, null]`, shown as "— use the default —"), integer and number ranges,
   booleans, string lists (one per line). A new backend option then appears with no frontend
   change. If a new field kind can't be rendered, extend `SchemaForm` generically rather than
   special-casing one option. The quick fields on New run are the only exception, and they
   read and write the same draft object.
2. **Per-run overrides are diffs** against the saved settings (`diff(draft, saved)`). Never
   send the full object as overrides, or later changes to saved defaults won't reach future
   runs.
3. **Show confidence, evidence and uncertainty.** The point of the product is that LLM claims
   are graded and checked. Keep tier badges, evidence lists, contradictions, TODO notes and
   Validator findings prominent, and keep low-confidence items visibly dimmed.
4. **Starting over is destructive and must be explicit.** It deletes the workspace. The UI
   defaults to resume and requires a confirmation checkbox for start over. The user cares
   about this.
5. **Styling:** design tokens live in `:root`, with a dark theme via `prefers-color-scheme`.
   Density is fairly high on purpose: this is a tool for reading code. There are no external
   UI or CSS frameworks; ask before adding one.

## 6. Suggested next work, in priority order

1. **Human-in-the-loop editing.** This is the biggest-value feature, but **it needs backend
   endpoints that don't exist yet.** Agree on the contract with the backend side first. The
   proposed model: a user override is stored as a knowledge record at confidence 1.0, then a
   targeted re-run applies it to Ghidra and regenerates what depends on it. Covered:
   function name and class, parameter names and types, return type, class fields, scope
   include/exclude, and "re-run this function / this stage". UI entry points: inline edit on
   the function page's analysis tables and on the class layout table.
2. **Re-run helpers using existing settings:** "re-analyze / regenerate just this function"
   is a job with `scope.only: [address]`. Add buttons for it on the function page.
3. **Diff view** between Ghidra round 0, the latest round and the reconstructed code.
   `decompiled_round0` vs `decompiled` already shows the feedback loop's effect.
4. **Call-graph and class-hierarchy views** from `relationships/calls` and the types'
   `base_class`.
5. **Frontend tests** (Vitest + Testing Library): SchemaForm against a captured
   schema snapshot, and the `useJobEvents` fold against a captured event list.
6. **Polish:** a job progress summary in the browser tab title, and virtualized tables for
   binaries with thousands of functions (the functions endpoint returns everything in one
   response).

## 7. Verifying changes

- Run `npm run typecheck` and `npm run build`; both must pass.
- Visual check without a desktop browser: headless Edge screenshots work on this machine:
  ```
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu
    --window-size=1440,1000 --virtual-time-budget=8000 --screenshot=out.png http://localhost:5173/settings
  ```
- **Don't start real runs casually.** A job calls paid LLM APIs (DeepSeek by default). To
  exercise the job and SSE flow for free, submit a job for a function that's already analyzed,
  with the expensive stages off:
  ```json
  {"binary": "<path from /api/binaries>", "restart": false,
   "settings": {"scope": {"only": ["main"]},
                "analysis": {"rounds": 1, "apply_to_ghidra": false, "reconstruct_types": false},
                "code": {"enabled": false}}}
  ```
  Delete the test job afterwards from the backend's `workspace/_jobs/` (`<id>.json` and
  `<id>.events.jsonl`).

## 8. Working with this user

- **Never run `git commit` yourself.** Give the user a commit message; they commit.
- **No commands that beep.** This is Windows. Don't use Windows `choice` or emit BEL
  characters.
- **Environment:** Windows, PowerShell, Node 22, npm 12. npm 12 blocks install scripts.
  esbuild's postinstall is blocked, but the build works anyway; don't "fix" it with
  `allowScripts` unless something actually breaks.
- **Communication:** the user prefers being told plainly what was verified and what wasn't.
