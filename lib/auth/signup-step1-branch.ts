export type SignupStep1Branch = "available" | "pending_verification" | "confirmed";

export function branchForSignupEmailStatus(status: unknown): SignupStep1Branch {
  const normalized = typeof status === "string" ? status.trim() : "";
  if (normalized === "pending_verification") return "pending_verification";
  if (normalized === "confirmed") return "confirmed";
  return "available";
}

