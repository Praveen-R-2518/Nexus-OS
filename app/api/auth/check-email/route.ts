import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  rateLimit,
  readJsonObjectWithLimit,
} from "@/lib/api-security";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export type SignupEmailStatus = "available" | "pending_verification" | "confirmed";

/**
 * POST { email: string } -> { status, registered }
 * `registered` is true only when email is confirmed (backward compatible).
 * Uses service_role + RPC check_signup_email_status.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:auth:check-email", 10, 60_000);
  if (limited) return limited;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const raw =
    "email" in body &&
    typeof (body as { email: unknown }).email === "string"
      ? (body as { email: string }).email
      : "";

  const email = normalizeEmail(raw);
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc("check_signup_email_status", {
      email_input: email,
    });

    if (error) {
      console.error("[api/auth/check-email] rpc error:", error.message);
      return NextResponse.json(
        { error: "Unable to verify email availability" },
        { status: 500 },
      );
    }

    const status = (data as string | null)?.trim() as SignupEmailStatus | undefined;
    const normalized: SignupEmailStatus =
      status === "pending_verification" || status === "confirmed" || status === "available"
        ? status
        : "available";

    return NextResponse.json({
      status: normalized,
      registered: normalized === "confirmed",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api/auth/check-email]", message);
    return NextResponse.json(
      { error: "Unable to verify email availability" },
      { status: 500 },
    );
  }
}
