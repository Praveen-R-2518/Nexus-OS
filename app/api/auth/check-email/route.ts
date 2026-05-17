import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * POST { email: string } -> { registered: boolean }
 * Uses service_role + RPC check_signup_email_registered (see migration 0009).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw =
    typeof body === "object" &&
    body !== null &&
    "email" in body &&
    typeof (body as { email: unknown }).email === "string"
      ? (body as { email: string }).email
      : "";

  const email = normalizeEmail(raw);
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc("check_signup_email_registered", {
      email_input: email,
    });

    if (error) {
      console.error("[api/auth/check-email] rpc error:", error.message);
      return NextResponse.json(
        { error: "Unable to verify email availability" },
        { status: 500 },
      );
    }

    return NextResponse.json({ registered: Boolean(data) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api/auth/check-email]", message);
    return NextResponse.json(
      { error: "Unable to verify email availability" },
      { status: 500 },
    );
  }
}
