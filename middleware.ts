import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/inbox",
  "/approval",
  "/report",
  "/logs",
  "/onboarding",
] as const;

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/auth/callback")) {
    return response;
  }

  if (pathname === "/login" || pathname.startsWith("/login/")) {
    if (user) {
      const nextParam = request.nextUrl.searchParams.get("next");
      const safeNext =
        nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
          ? nextParam
          : "/dashboard";
      return NextResponse.redirect(new URL(safeNext, request.url));
    }
    return response;
  }

  if (isProtectedPath(pathname) && !user) {
    const loginUrl = new URL("/login", request.url);
    const next =
      pathname +
      (request.nextUrl.searchParams.toString()
        ? `?${request.nextUrl.searchParams.toString()}`
        : "");
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/inbox",
    "/inbox/:path*",
    "/approval",
    "/approval/:path*",
    "/report",
    "/report/:path*",
    "/logs",
    "/logs/:path*",
    "/login",
    "/login/:path*",
    "/onboarding",
    "/onboarding/:path*",
    "/auth/callback",
  ],
};
