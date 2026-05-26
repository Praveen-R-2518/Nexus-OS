import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type SignupEmailStatus = "available" | "pending_verification" | "confirmed";

function normalizeStatus(raw: unknown): SignupEmailStatus {
  const status = typeof raw === "string" ? raw.trim() : "";
  if (
    status === "pending_verification" ||
    status === "confirmed" ||
    status === "available"
  ) {
    return status;
  }
  return "available";
}

function isMissingStatusRpc(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST202" ||
    msg.includes("check_signup_email_status") ||
    msg.includes("schema cache")
  );
}

/**
 * Resolves signup email status via RPC, with fallback when migration is not yet applied.
 */
export async function resolveSignupEmailStatus(
  supabase: SupabaseClient,
  email: string,
): Promise<SignupEmailStatus> {
  const { data, error } = await supabase.rpc("check_signup_email_status", {
    email_input: email,
  });

  if (!error) {
    return normalizeStatus(data);
  }

  if (!isMissingStatusRpc(error)) {
    throw error;
  }

  const { data: registered, error: legacyError } = await supabase.rpc(
    "check_signup_email_registered",
    { email_input: email },
  );

  if (legacyError) {
    throw legacyError;
  }

  if (!registered) {
    return "available";
  }

  // Legacy RPC cannot distinguish pending vs confirmed; allow resend path.
  return "pending_verification";
}
