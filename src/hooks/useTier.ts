import { useCallback } from "react";
import { api } from "../api/client";
import type { Tier } from "../api/types";
import { useApi } from "./useApi";

/** Maps a confidence to high/medium/low using the saved thresholds (falls back to the built-in ones). */
export function useTier(): (confidence: number | null | undefined) => Tier | null {
  const settings = useApi(() => api.settings(), []);
  const conf = (settings.data?.confidence ?? {}) as { high?: number; medium?: number };
  const high = conf.high ?? 0.85;
  const medium = conf.medium ?? 0.6;
  return useCallback(
    (c) => (c == null ? null : c >= high ? "high" : c >= medium ? "medium" : "low"),
    [high, medium],
  );
}
