import { NextResponse } from "next/server";
import { encryptSecret, isEncryptionConfigured } from "@/lib/encryption/credential-secret";
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

function errorRedirect(): NextResponse {
  return NextResponse.redirect(metaDashboardUrl({ meta_error: "true" }));
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
  supabase: ReturnType<typeof createSupabaseRouteHandlerClient>,
  row: Record<string, unknown>,
): Promise<boolean> {
  const { error: upsertErr } = await supabase
    .from("meta_credentials")
    .upsert(row, { onConflict: "workspace_id,user_id,platform" });

  if (!upsertErr) return true;

  const workspaceId = row.workspace_id as string;
  const userId = row.user_id as string;
  const platform = row.platform as string;

  await supabase
    .from("meta_credentials")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("platform", platform);

  const { error: insErr } = await supabase.from("meta_credentials").insert(row);
  return !insErr;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const oauthError = searchParams.get("error");
  const code = searchParams.get("code");
  const stateRaw = searchParams.get("state");

  if (oauthError || !code || !stateRaw) {
    return errorRedirect();
  }

  const state = decodeOAuthState(stateRaw);
  if (!state) {
    return errorRedirect();
  }

  const { workspace_id, team_id, user_id } = state;

  let supabase;
  try {
    supabase = createSupabaseRouteHandlerClient();
  } catch {
    return errorRedirect();
  }

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user || user.id !== user_id) {
    return errorRedirect();
  }

  const { data: workspace, error: wsErr } = await supabase
    .from("workspaces")
    .select("id, owner_user_id")
    .eq("id", workspace_id)
    .maybeSingle();

  if (wsErr || !workspace || workspace.owner_user_id !== user.id) {
    return errorRedirect();
  }

  if (metaConfigError() || !isEncryptionConfigured()) {
    return errorRedirect();
  }

  let shortTokenJson: MetaTokenResponse | null;
  try {
    shortTokenJson = await exchangeCodeForToken(code);
  } catch {
    return errorRedirect();
  }

  const shortToken = shortTokenJson?.access_token;
  if (!shortToken || shortTokenJson?.error) {
    return errorRedirect();
  }

  let longTokenJson: MetaTokenResponse | null;
  try {
    longTokenJson = await exchangeLongLivedToken(shortToken);
  } catch {
    return errorRedirect();
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
    return errorRedirect();
  }

  if (pages.length === 0) {
    return errorRedirect();
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
    return errorRedirect();
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
      user_id: user.id,
      platform,
      status: "connected" as const,
      page_id: pageId || null,
      page_name: pageName || null,
      ig_account_id: platform === "instagram" ? igAccountId : igAccountId,
      ig_username: igUsername,
      wa_phone_number_id: platform === "whatsapp" ? waPhoneNumberId : waPhoneNumberId,
      wa_display_phone: platform === "whatsapp" ? waDisplayPhone : waDisplayPhone,
      access_token_encrypted: accessTokenEncrypted,
      token_expiry: tokenExpiry,
      scope: null,
      sync_enabled: true,
      last_verified_at: now,
    };

    const ok = await upsertMetaCredential(supabase, row);
    if (ok) connectedPlatforms.push(platform);
  }

  if (connectedPlatforms.length === 0) {
    return errorRedirect();
  }

  try {
    const profilePatch: Record<string, string> = {};
    if (pageId) profilePatch.fb_page_id = pageId;
    if (igAccountId) profilePatch.ig_account_id = igAccountId;
    if (waPhoneNumberId) profilePatch.wa_phone_number_id = waPhoneNumberId;
    if (waDisplayPhone) profilePatch.whatsapp_routing_number = waDisplayPhone;

    if (Object.keys(profilePatch).length > 0) {
      await supabase.from("business_profiles").upsert(
        { team_id, workspace_id, ...profilePatch },
        { onConflict: "team_id" },
      );
    }
  } catch {
    // best-effort routing sync
  }

  return NextResponse.redirect(
    metaDashboardUrl({
      meta_connected: connectedPlatforms.join(","),
    }),
  );
}
