import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  rateLimit,
  readJsonObjectWithLimit,
} from "@/lib/api-security";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExistingUser = {
  id: string;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isLocalRequest(request: Request): boolean {
  if (process.env.NODE_ENV === "production") return false;

  const url = new URL(request.url);
  if (!isLocalHostname(url.hostname)) return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return isLocalHostname(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password: string): string | null {
  if (password.length < 8) return "At least 8 characters";
  if (!/[A-Z]/.test(password)) return "Include one uppercase letter";
  if (!/[0-9]/.test(password)) return "Include one number";
  return null;
}

async function findUserByEmail(email: string): Promise<ExistingUser | null> {
  const supabase = createSupabaseAdmin();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;

    const found = data.users.find(
      (user) => normalizeEmail(user.email ?? "") === email,
    );
    if (found) {
      return {
        id: found.id,
        email_confirmed_at: found.email_confirmed_at,
        user_metadata: found.user_metadata,
      };
    }
    if (data.users.length < 1000) return null;
  }
  return null;
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const limited = rateLimit(request, "api:auth:local-dev-signup", 5, 60_000);
  if (limited) return limited;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body;
  const email = normalizeEmail(
    typeof body.email === "string" ? body.email : "",
  );
  const password = typeof body.password === "string" ? body.password : "";
  const fullName =
    typeof body.fullName === "string" ? body.fullName.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();
    const metadata = {
      ...(fullName ? { full_name: fullName } : {}),
      ...(phone ? { phone } : {}),
    };
    const existing = await findUserByEmail(email);
    if (existing?.email_confirmed_at) {
      return NextResponse.json(
        { error: "Account is already confirmed. Sign in to continue." },
        { status: 409 },
      );
    }

    const result = existing
      ? await supabase.auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
          user_metadata: {
            ...(existing.user_metadata ?? {}),
            ...metadata,
          },
        })
      : await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: metadata,
        });

    if (result.error || !result.data.user?.id) {
      return NextResponse.json(
        { error: result.error?.message || "Could not create local dev user" },
        { status: 500 },
      );
    }

    const userId = result.data.user.id;
    await supabase.from("profiles").upsert(
      {
        id: userId,
        full_name: fullName || null,
        phone: phone || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    return NextResponse.json({
      success: true,
      mode: existing ? "confirmed_existing" : "created_confirmed",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Local development signup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
