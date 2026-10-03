# Semantic Decompiler UI

Web frontend for the Semantic Decompiler backend. The backend uses Ghidra and LLM agents to
turn a binary into readable, compilable C++. This app talks to its local HTTP API.

React 18 + TypeScript + Vite. Runtime dependencies: react-router, highlight.js (C++ / x86 /
CMake / JSON highlighting) and react-markdown (the run report).

## Running it

**Shortcut (Windows):** with both repos checked out side by side (`…\Backend` and
`…\Frontend`), run `start.bat` in the backend repo. It starts the API and this app, then opens
the browser.

**Manually:**

1. Start the backend API in the backend repo
   ([Semantic_Decompiler](https://github.com/yuri8822/Semantic_Decompiler)), on `127.0.0.1:8765`
   by default:
   ```
   python serve.py
   ```
2. Start this app:
   ```
   npm install
   npm run dev          # http://localhost:5173
   ```

In development, Vite proxies `/api` to the backend, so the browser sees a single origin.

| Variable | Used by | Purpose |
|---|---|---|
| `API_PROXY_TARGET` | dev server | Where `/api` is proxied. Default `http://127.0.0.1:8765`. |
| `VITE_API_URL` | built app | Absolute API origin, such as `http://127.0.0.1:8765`. Leave empty when the app is served from the API's origin. |

Copy `.env.example` to `.env` to set them. The backend accepts cross-origin requests from any
localhost port, so a build served elsewhere on localhost works with `VITE_API_URL`.

Other commands: `npm run build` (type-check, then production build into `dist/`), `npm run typecheck`.

## Screens

| Route | What it does |
|---|---|
| `/` | Dashboard: environment checks (Ghidra, compiler, CMake, API keys), recent jobs, workspaces |
| `/run` | Start a run. Pick a binary (list, upload or path) and choose resume or start over. Common options are up front; every other setting can be overridden for this run. |
| `/jobs`, `/jobs/:id` | Job list, and a live job view: stage timeline with progress, warnings, LLM call stats, Ghidra output, cancel |
| `/settings` | Saved defaults for every run. The form is generated from the backend's JSON Schema. |
| `/workspaces/:name` | One binary's results, with tabs for overview, functions, classes, globals, project files, LLM logs and report |
| `/workspaces/:name/functions/:address` | Ghidra (current round, round 0, assembly) side by side with the reconstructed C++. Also: analysis with confidence and evidence, Validator and compiler findings, proven memory accesses, callers and callees, the function's LLM calls. |
| `/workspaces/:name/logs/:log` | One LLM call: response, prompt and system prompt |

## How it fits the backend

- **Settings forms are schema-driven.** `components/SchemaForm.tsx` renders whatever
  `GET /api/settings/schema` returns: pydantic JSON Schema with `$ref` groups, enums, nullable
  enums, numeric ranges and string lists. Adding an option in the backend's `settings.py`
  makes it appear here with its title, description and limits, with no frontend change.
  Validation errors (HTTP 422) are shown on the field they belong to.
- **Per-run overrides are diffs.** The New run page edits a copy of the saved settings and
  submits only the differences (`lib/objects.ts` `diff`) as `settings` in `POST /api/jobs`.
- **Live progress uses Server-Sent Events.** `hooks/useJobEvents.ts` subscribes to
  `GET /api/jobs/:id/events` and folds the events into a view model (stages, progress,
  messages, LLM statistics, Ghidra output). The event types are documented at the top of the
  backend's `pipeline.py`, and their TypeScript shapes are in `api/types.ts`. `EventSource`
  reconnects on its own and the server resumes from `Last-Event-ID`, so a dropped connection
  loses nothing.
- **Confidence tiers** use the saved thresholds (`hooks/useTier.ts`), so badges match what the
  backend applied.

```
src/
  api/          client.ts (every endpoint), types.ts (response shapes)
  hooks/        useApi (fetch + optional polling), useJobEvents (SSE), useTier
  components/   SchemaForm, CodeBlock, ui (badges, cards, tabs, progress…)
  pages/        one file per route; workspace/ holds the workspace tabs
  lib/          formatting and object diff/merge helpers
  styles.css    design tokens, light and dark themes
```

## Not in the MVP yet

- Human-in-the-loop editing (accept or override names, types and fields, then re-apply them
  to Ghidra). This needs backend endpoints that don't exist yet.
- Function search across workspaces, and a call-graph view.
- Authentication. The backend is localhost-only by design.
