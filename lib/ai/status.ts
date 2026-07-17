import "server-only";

import { isMockMode, isOpenAiConfigured } from "./provider";

export type AiFeatureStatus = {
  classify: boolean;
  draft: boolean;
  reportSummary: boolean;
  chat: boolean;
  embeddings: boolean;
};

export type AiStatus = {
  configured: boolean;
  mock: boolean;
  features: AiFeatureStatus;
};

/**
 * Single source of truth for "is AI configured" read by `GET /api/ai/status` and consumed by
 * `hooks/useAiStatus.ts` on the client. `reportSummary` is always `true` — it degrades to a
 * labelled fallback rather than being unavailable.
 */
export function getAiStatus(): AiStatus {
  const configured = isOpenAiConfigured();
  return {
    configured,
    mock: isMockMode(),
    features: {
      classify: configured,
      draft: configured,
      reportSummary: true,
      chat: configured,
      embeddings: configured,
    },
  };
}
