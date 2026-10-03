import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { PipelineEvent, RunSummary } from "../api/types";

export interface StageView {
  key: string;
  stage: string;
  round: number;
  title: string;
  status: "running" | "done" | "stopped";
  done: number;
  total: number;
  failures: { item: string; error: string }[];
  summary?: Record<string, unknown>;
}

export interface JobView {
  events: PipelineEvent[];
  stages: StageView[];
  messages: Extract<PipelineEvent, { type: "message" }>[];
  llm: { calls: number; failed: number; seconds: number; byAgent: Record<string, number> };
  ghidra: string[];
  finished?: { status: "done" | "cancelled" | "failed"; summary: Partial<RunSummary>; error: string };
  connected: boolean;
}

const MAX_GHIDRA_LINES = 400;

/** Live event stream of a job (Server-Sent Events), folded into a view model. */
export function useJobEvents(jobId: string | undefined): JobView {
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setEvents([]);
    if (!jobId) return;
    const source = new EventSource(api.jobEventsUrl(jobId));
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false); // EventSource reconnects by itself (resuming via Last-Event-ID)
    source.onmessage = (msg) => {
      const event = JSON.parse(msg.data);
      if (event.type === "stream_end") {
        source.close();
        setConnected(false);
        return;
      }
      setEvents((prev) => (prev.length && prev[prev.length - 1].seq >= event.seq ? prev : [...prev, event]));
    };
    return () => source.close();
  }, [jobId]);

  return useMemo(() => fold(events, connected), [events, connected]);
}

function fold(events: PipelineEvent[], connected: boolean): JobView {
  const stages: StageView[] = [];
  const byKey = new Map<string, StageView>();
  const messages: JobView["messages"] = [];
  const llm = { calls: 0, failed: 0, seconds: 0, byAgent: {} as Record<string, number> };
  const ghidra: string[] = [];
  let finished: JobView["finished"];

  for (const e of events) {
    switch (e.type) {
      case "stage": {
        const prev = stages[stages.length - 1];
        if (prev && prev.status === "running") prev.status = "done";
        const view: StageView = { key: `${e.stage}:${e.round}`, stage: e.stage, round: e.round, title: e.title,
          status: "running", done: 0, total: 0, failures: [] };
        stages.push(view);
        byKey.set(view.key, view);
        break;
      }
      case "progress": {
        const view = byKey.get(`${e.stage}:${e.round}`);
        if (view) {
          view.done = e.done;
          view.total = e.total;
          if (!e.ok) view.failures.push({ item: e.item, error: e.error });
        }
        break;
      }
      case "stage_done": {
        const view = byKey.get(`${e.stage}:${e.round}`);
        if (view) {
          view.status = "done";
          view.summary = e.summary;
        }
        break;
      }
      case "message":
        messages.push(e);
        break;
      case "llm_call":
        llm.calls += 1;
        llm.seconds += e.seconds;
        if (!e.ok) llm.failed += 1;
        llm.byAgent[e.agent] = (llm.byAgent[e.agent] ?? 0) + 1;
        break;
      case "ghidra_output":
        ghidra.push(e.line);
        if (ghidra.length > MAX_GHIDRA_LINES) ghidra.shift();
        break;
      case "run_finished":
        finished = { status: e.status, summary: e.summary, error: e.error };
        for (const s of stages) if (s.status === "running") s.status = e.status === "done" ? "done" : "stopped";
        break;
    }
  }
  return { events, stages, messages, llm, ghidra, finished, connected };
}
