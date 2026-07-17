import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptSecret, isEncryptionConfigured } from "@/lib/encryption/credential-secret";
import { createServerClient } from "@/lib/supabase";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import {
  decodeOAuthState,
  metaConfigError,
  metaDashboardUrl,
  metaGraphUrl,
  metaOAuthRedirectUri,
  type MetaPlatform,
} from "@/app/api/meta/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MetaTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { message?: string };
};

type MetaPageAccount = {
  id?: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id?: string; username?: string };
  whatsapp_business_account?: { id?: string };
};

type MetaPagesResponse = {
  data?: MetaPageAccount[];
  error?: { message?: string };
};

type MetaPhoneNumbersResponse = {
  data?: Array<{ id?: string; display_phone_number?: string }>;
};

// `NextResponse.redirect` requires an ABSOLUTE URL — `metaDashboardUrl()` returns a relative
// `/profile?...` path, so every redirect must be resolved against the incoming request first
// (mirrors app/api/gmail/callback/handler.ts's `absoluteRedirect`).
function absoluteRedirect(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url));
}

function errorRedirect(request: Request, reason: string = "true"): NextResponse {
  return absoluteRedirect(request, metaDashboardUrl({ meta_error: reason }));
}

async function exchangeCodeForToken(code: string): Promise<MetaTokenResponse | null> {
  const clientId = process.env.META_APP_ID!.trim();
  const clientSecret = process.env.META_APP_SECRET!.trim();
  const redirectUri = metaOAuthRedirectUri();

  const url = metaGraphUrl("/oauth/access_token", {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch(url);
  if (!res.ok) return null;
  return (await res.json()) as MetaTokenResponse;
}

async function exchangeLongLivedToken(
  shortLivedToken: string,
): Promise<MetaTokenResponse | null> {
  const clientId = process.env.META_APP_ID!.trim();
  const clientSecret = process.env.META_APP_SECRET!.trim();

  const url = metaGraphUrl("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: clientId,
    client_secret: clientSecret,
    fb_exchange_token: shortLivedToken,
  });

  const res = await fetch(url);
  if (!res.ok) return null;
  return (await res.json()) as MetaTokenResponse;
}

async function fetchPageAccounts(
  userAccessToken: string,
): Promise<MetaPageAccount[]> {
  const url = metaGraphUrl("/me/accounts", {
    fields:
      "id,name,access_token,instagram_business_account{id,username},whatsapp_business_account{id}",
    access_token: userAccessToken,
  });
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = (await res.json()) as MetaPagesResponse;
  return Array.isArray(json.data) ? json.data : [];
}

async function fetchWaPhoneNumberId(
  wabaId: string,
  pageAccessToken: string,
): Promise<{ phoneNumberId: string; displayPhone: string } | null> {
  const url = metaGraphUrl(`/${wabaId}/phone_numbers`, {
    fields: "id,display_phone_number",
    access_token: pageAccessToken,
  });
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json()) as MetaPhoneNumbersResponse;
  const first = json.data?.[0];
  if (!first?.id) return null;
  return {
    phoneNumberId: String(first.id),
    displayPhone: String(first.display_phone_number ?? "").trim(),
  };
}

async function upsertMetaCredential(
  db: SupabaseClient,
  row: Record<string, unknown>,
): Promise<boolean> {
  const { error: upsertErr } = await db
    .from("meta_credentials")
    .upsert(row, { onConflict: "workspace_id,user_id,platform" });

  if (!upsertErr) return true;

  const workspaceId = row.workspace_id as string;
  const userId = row.user_id as string;
  const platform = row.platform as string;

  await db
    .from("meta_credentials")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("platform", platform);

  const { error: insErr } = await db.from("meta_credentials").insert(row);
  return !insErr;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const oauthError = searchParams.get("error");
  const code = searchParams.get("code");
  const stateRaw = searchParams.get("state");

  if (oauthError || !code || !stateRaw) {
    return errorRedirect(request, "missing_params");
  }

  const state = decodeOAuthState(stateRaw);
  if (!state) {
    return errorRedirect(request, "invalid_state");
  }

  const { workspace_id, team_id, user_id } = state;

  let supabase: ReturnType<typeof createSupabaseRouteHandlerClient>;
  try {
    supabase = createSupabaseRouteHandlerClient();
  } catch {
    return errorRedirect(request, "supabase_init");
  }

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    console.error("[meta.callback] auth_get_user error:", userErr.message);
  }
  if (user?.id && user.id !== user_id) {
    return errorRedirect(request, "auth_user_mismatch");
  }

  // Safari ITP can drop the session cookie on the Meta → app redirect (same failure mode as the
  // Gmail OAuth callback — app/api/gmail/callback/handler.ts). The state is HMAC-signed and
  // expiring, so it proves which user started the flow; when the session is absent, continue
  // with the service-role client (RLS would otherwise block every query here) instead of
  // dead-ending in an error redirect for a browser quirk (Task D.4).
  const effectiveUserId = user?.id ?? user_id;
  const db = user?.id
    ? supabase
    : (() => {
        try {
          return createServerClient();
        } catch {
          return null;
        }
      })();
  if (!db) return errorRedirect(request, "supabase_init");

  const { data: workspace, error: wsErr } = await db
    .from("workspaces")
    .select("id, owner_user_id")
    .eq("id", workspace_id)
    .maybeSingle();

  if (wsErr || !workspace || workspace.owner_user_id !== effectiveUserId) {
    return errorRedirect(request, "workspace_forbidden");
  }

  if (metaConfigError() || !isEncryptionConfigured()) {
    return errorRedirect(request, "oauth_config");
  }

  let shortTokenJson: MetaTokenResponse | null;
  try {
    shortTokenJson = await exchangeCodeForToken(code);
  } catch {
    return errorRedirect(request, "token_exchange");
  }

  const shortToken = shortTokenJson?.access_token;
  if (!shortToken || shortTokenJson?.error) {
    return errorRedirect(request, "token_exchange");
  }

  let longTokenJson: MetaTokenResponse | null;
  try {
    longTokenJson = await exchangeLongLivedToken(shortToken);
  } catch {
    return errorRedirect(request, "token_exchange");
  }

  const userAccessToken = longTokenJson?.access_token ?? shortToken;
  const expiresIn =
    typeof longTokenJson?.expires_in === "number" && longTokenJson.expires_in > 0
      ? longTokenJson.expires_in
      : typeof shortTokenJson?.expires_in === "number" && shortTokenJson.expires_in > 0
        ? shortTokenJson.expires_in
        : 60 * 24 * 60 * 60;
  const tokenExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();
  const now = new Date().toISOString();

  let pages: MetaPageAccount[];
  try {
    pages = await fetchPageAccounts(userAccessToken);
  } catch {
    return errorRedirect(request, "pages_fetch");
  }

  if (pages.length === 0) {
    return errorRedirect(request, "no_pages");
  }

  const page = pages[0];
  const pageId = page.id ? String(page.id) : "";
  const pageName = page.name ? String(page.name) : "";
  const pageAccessToken = page.access_token ?? userAccessToken;

  const igAccount = page.instagram_business_account;
  const igAccountId = igAccount?.id ? String(igAccount.id) : null;
  const igUsername = igAccount?.username ? String(igAccount.username) : null;

  const wabaId = page.whatsapp_business_account?.id
    ? String(page.whatsapp_business_account.id)
    : null;

  let waPhoneNumberId: string | null = null;
  let waDisplayPhone: string | null = null;
  if (wabaId) {
    try {
      const wa = await fetchWaPhoneNumberId(wabaId, pageAccessToken);
      if (wa) {
        waPhoneNumberId = wa.phoneNumberId;
        waDisplayPhone = wa.displayPhone || null;
      }
    } catch {
      // best-effort; WhatsApp credential may be incomplete
    }
  }

  let accessTokenEncrypted: string;
  try {
    accessTokenEncrypted = encryptSecret(pageAccessToken);
  } catch {
    return errorRedirect(request, "encrypt");
  }

  const platformsToConnect: MetaPlatform[] = state.platform
    ? [state.platform]
    : (["facebook", "instagram", "whatsapp"] as MetaPlatform[]);

  const connectedPlatforms: MetaPlatform[] = [];

  for (const platform of platformsToConnect) {
    if (platform === "instagram" && !igAccountId) continue;
    if (platform === "whatsapp" && !waPhoneNumberId) continue;

    const row = {
      workspace_id,
      team_id,
      user_id: effectiveUserId,
      platform,
      status: "connected" as const,
      page_id: pageId || null,
      page_name: pageName || null,
      ig_account_id: platform === "instagram" ? igAccountId : null,
      ig_username: platform === "instagram" ? igUsername : null,
      wa_phone_number_id: platform === "whatsapp" ? waPhoneNumberId : null,
      wa_display_phone: platform === "whatsapp" ? waDisplayPhone : null,
      access_token_encrypted: accessTokenEncrypted,
      token_expiry: tokenExpiry,
      scope: null,
      sync_enabled: true,
      last_verified_at: now,
    };

    const ok = await upsertMetaCredential(db, row);
    if (ok) connectedPlatforms.push(platform);
  }

  if (connectedPlatforms.length === 0) {
    return errorRedirect(request, "upsert_meta_credentials");
  }

  try {
    const profilePatch: Record<string, string> = {};
    if (pageId) profilePatch.fb_page_id = pageId;
    if (igAccountId) profilePatch.ig_account_id = igAccountId;
    if (waPhoneNumberId) profilePatch.wa_phone_number_id = waPhoneNumberId;
    if (waDisplayPhone) profilePatch.whatsapp_routing_number = waDisplayPhone;

    if (Object.keys(profilePatch).length > 0) {
      await db.from("business_profiles").upsert(
        { team_id, workspace_id, ...profilePatch },
        { onConflict: "team_id" },
      );
    }
  } catch {
    // best-effort routing sync
  }

  return absoluteRedirect(
    request,
    metaDashboardUrl({
      meta_connected: connectedPlatforms.join(","),
    }),
  );
}
