"use client";

import { useMemo } from "react";

/** Minimal shapes used by `CommandCenter` until Supabase realtime is wired. */
export type RealtimeConversation = {
  id: string;
  sender: string;
  text: string;
};

export type RealtimeLead = {
  id: string;
  conversation_id: string;
  status: "pending" | "at_risk" | "active" | "closed" | string;
  estimated_value: number;
  urgency: "critical" | "high" | "medium" | "low" | string;
  risk_score: number;
  company_name: string;
};

/**
 * Placeholder: returns empty data so the Command Center builds and renders.
 * Replace with Supabase channel subscriptions when realtime is ready.
 */
export function useRealtimeConversations(): {
  conversations: RealtimeConversation[];
} {
  return useMemo(() => ({ conversations: [] }), []);
}

export function useRealtimeLeads(): { leads: RealtimeLead[] } {
  return useMemo(() => ({ leads: [] }), []);
}
