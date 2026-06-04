import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth/redirect-url";

export const dynamic = "force-dynamic";

function isRateLimitError(error: {
  status?: number;
  message?: string;
}): boolean {
  if (error.status === 429) return true;
  return /rate limit|too many/i.test(error.message ?? "");
}
export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    return NextResponse.json(
      { error: "Missing Supabase URL or anon key" },
      { status: 500 },
    );
  }

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNextPath(
    requestUrl.searchParams.get("next"),
    "/signup?step=workspace",
  );

  const cookieStore = cookies();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          /* read-only cookie context */
        }
      },
    },
  });

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const login = new URL("/login", requestUrl.origin);
      if (isRateLimitError(error)) {
        login.searchParams.set(
          "error",
          "Too many requests right now. Please wait a moment, then click the confirmation link again.",
        );
      } else {
        login.searchParams.set("error", error.message);
      }
      return NextResponse.redirect(login);
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
