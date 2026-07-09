import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  rateLimit,
  readJsonObjectWithLimit,
} from "@/lib/api-security";
import { buildAuthCallbackUrl } from "@/lib/auth/redirect-url";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const SIGNUP_RESUME_PATH = "/signup?step=workspace";

/**
 * POST { email: string } -> { ok: true }
 * Server-side rate limit so the resend action can't be spammed.
 * Uses anon key (not service role) to trigger Supabase's built-in resend flow.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:auth:resend-confirmation", 3, 60_000);
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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    return NextResponse.json(
      { error: "Missing Supabase URL or anon key" },
      { status: 500 },
    );
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: buildAuthCallbackUrl(SIGNUP_RESUME_PATH),
    },
  });

  if (error) {
    const status = typeof error.status === "number" ? error.status : 500;
    const msg = error.message || "Unable to resend confirmation email";
    return NextResponse.json({ error: msg }, { status });
  }

  return NextResponse.json({ ok: true });
}

