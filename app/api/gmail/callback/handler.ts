import { NextResponse } from "next/server";
import { decodeOAuthState, signupGmailUrl } from "@/app/api/gmail/helpers";
import { oauthRedirectUri, oauthConfigError } from "@/app/api/gmail/helpers";
import { encryptSecret, isEncryptionConfigured } from "@/lib/encryption/credential-secret";
import { enqueueGmailBackfillJob } from "@/lib/gmail/backfill-jobs";
import { createServerClient } from "@/lib/supabase";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

type Stage =
  | "parse_params"
  | "decode_state"
  | "supabase_init"
  | "auth_get_user"
  | "auth_user_mismatch"
  | "workspace_lookup"
  | "workspace_forbidden"
  | "already_connected_lookup"
  | "oauth_config"
  | "token_exchange"
  | "token_invalid_grant"
  | "userinfo_fetch"
  | "userinfo_missing_email"
  | "encrypt"
  | "upsert_gmail_credentials"
  | "sync_business_profiles"
  | "enqueue_gmail_backfill";

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  email?: string;
};

function logStageError(stage: Stage, err: unknown) {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "unknown_error";
  // Never log tokens / authorization codes; keep it structured and secret-free.
  console.error("[gmail.callback] error", { stage, message });
}

function absoluteRedirect(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url));
}

function errorRedirect(request: Request, reason: string): NextResponse {
  return absoluteRedirect(request, signupGmailUrl({ gmail_error: reason }));
}

function successRedirect(request: Request): NextResponse {
  return absoluteRedirect(request, signupGmailUrl({ gmail_connected: "true" }));
}

function loginRedirect(request: Request): NextResponse {
  const next = "/signup?step=gmail";
  return absoluteRedirect(request, `/login?next=${encodeURIComponent(next)}`);
}

export type GmailCallbackDeps = {
  createSupabase: typeof createSupabaseRouteHandlerClient;
  createServiceSupabase: typeof createServerClient;
  fetchFn: typeof fetch;
  encrypt: typeof encryptSecret;
  isEncryptionReady: typeof isEncryptionConfigured;
  oauthConfigHasError: typeof oauthConfigError;
  redirectUri: typeof oauthRedirectUri;
  enqueueBackfill: typeof enqueueGmailBackfillJob;
};

export const defaultGmailCallbackDeps: GmailCallbackDeps = {
  createSupabase: createSupabaseRouteHandlerClient,
  createServiceSupabase: createServerClient,
  fetchFn: fetch,
  encrypt: encryptSecret,
  isEncryptionReady: isEncryptionConfigured,
  oauthConfigHasError: oauthConfigError,
  redirectUri: oauthRedirectUri,
  enqueueBackfill: enqueueGmailBackfillJob,
};

export async function handleGmailOAuthCallback(
  request: Request,
  deps: GmailCallbackDeps = defaultGmailCallbackDeps,
): Promise<NextResponse> {
  let oauthError: string | null;
  let code: string | null;
  let stateRaw: string | null;
  try {
    const { searchParams } = new URL(request.url);
    oauthError = searchParams.get("error");
    code = searchParams.get("code");
    stateRaw = searchParams.get("state");
  } catch (e) {
    logStageError("parse_params", e);
    return errorRedirect(request, "parse_params");
  }

  if (oauthError || !code || !stateRaw) {
    return errorRedirect(request, "missing_params");
  }

  const state = (() => {
    try {
      return decodeOAuthState(stateRaw);
    } catch (e) {
      logStageError("decode_state", e);
      return null;
    }
  })();

  if (!state) {
    return errorRedirect(request, "invalid_state");
  }

  const { workspace_id, team_id, user_id } = state;

  let supabase: ReturnType<typeof createSupabaseRouteHandlerClient>;
  try {
    supabase = deps.createSupabase();
  } catch (e) {
    logStageError("supabase_init", e);
    return errorRedirect(request, "supabase_init");
  }

  const authRes = await (async () => {
    try {
      return await supabase.auth.getUser();
    } catch (e) {
      logStageError("auth_get_user", e);
      return null;
    }
  })();

  if (!authRes) return loginRedirect(request);

  const user = authRes.data?.user ?? null;
  const userErr = authRes.error ?? null;
  if (userErr) logStageError("auth_get_user", userErr);

  if (!user?.id) {
    return loginRedirect(request);
  }

  if (user.id !== user_id) {
    logStageError("auth_user_mismatch", "user_id_mismatch");
    return errorRedirect(request, "auth_user_mismatch");
  }

  // Idempotent replay: if already connected, treat callback as success.
  const alreadyConnected = await (async () => {
    try {
      const { data: row, error } = await supabase
        .from("gmail_credentials")
        .select("id, status")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user.id)
        .eq("credential_type", "oauth")
        .eq("status", "connected")
        .maybeSingle();
      if (error) {
        logStageError("already_connected_lookup", error);
        return false;
      }
      return Boolean(row?.id);
    } catch (e) {
      logStageError("already_connected_lookup", e);
      return false;
    }
  })();

  if (alreadyConnected) return successRedirect(request);

  const workspaceRes = await (async () => {
    try {
      return await supabase
        .from("workspaces")
        .select("id, owner_user_id")
        .eq("id", workspace_id)
        .maybeSingle();
    } catch (e) {
      logStageError("workspace_lookup", e);
      return null;
    }
  })();

  if (!workspaceRes) return errorRedirect(request, "workspace_lookup");
  if (workspaceRes.error) {
    logStageError("workspace_lookup", workspaceRes.error);
    return errorRedirect(request, "workspace_lookup");
  }
  if (!workspaceRes.data || workspaceRes.data.owner_user_id !== user.id) {
    logStageError("workspace_forbidden", "workspace_not_owned");
    return errorRedirect(request, "workspace_forbidden");
  }

  if (deps.oauthConfigHasError() || !deps.isEncryptionReady()) {
    logStageError("oauth_config", "oauth_or_encryption_not_configured");
    return errorRedirect(request, "oauth_config");
  }

  const clientId = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
  const redirectUri = deps.redirectUri();

  let tokenJson: GoogleTokenResponse | null = null;
  try {
    const tokenRes = await deps.fetchFn("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        // Never log this code; only send it to Google.
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    tokenJson = (await tokenRes.json()) as GoogleTokenResponse;
  } catch (e) {
    logStageError("token_exchange", e);
    return errorRedirect(request, "token_exchange");
  }

  if (!tokenJson || tokenJson.error) {
    const err = (tokenJson?.error ?? "").toLowerCase();
    if (err === "invalid_grant") {
      // OAuth codes are single-use; multi-tab replay can hit invalid_grant after a successful save.
      // We already checked "connected" above; if not connected, treat as graceful error.
      logStageError("token_invalid_grant", "invalid_grant");
      return errorRedirect(request, "token_invalid_grant");
    }
    logStageError("token_exchange", "token_error");
    return errorRedirect(request, "token_exchange");
  }

  const accessToken = tokenJson.access_token;
  if (!accessToken) {
    logStageError("token_exchange", "missing_access_token");
    return errorRedirect(request, "token_exchange");
  }

  let email: string | undefined;
  try {
    const userInfoRes = await deps.fetchFn(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const userInfo = (await userInfoRes.json()) as GoogleUserInfo;
    email = userInfo.email?.trim();
  } catch (e) {
    logStageError("userinfo_fetch", e);
    return errorRedirect(request, "userinfo_fetch");
  }

  if (!email) {
    logStageError("userinfo_missing_email", "missing_email");
    return errorRedirect(request, "userinfo_missing_email");
  }

  const expiresIn =
    typeof tokenJson.expires_in === "number" && tokenJson.expires_in > 0
      ? tokenJson.expires_in
      : 3600;
  const tokenExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();
  const now = new Date().toISOString();

  let accessTokenEncrypted: string;
  let refreshTokenEncrypted: string;
  let imapPlaceholderEncrypted: string;
  try {
    accessTokenEncrypted = deps.encrypt(accessToken);
    refreshTokenEncrypted = tokenJson.refresh_token
      ? deps.encrypt(tokenJson.refresh_token)
      : deps.encrypt("");
    imapPlaceholderEncrypted = deps.encrypt("oauth");
  } catch (e) {
    logStageError("encrypt", e);
    return errorRedirect(request, "encrypt");
  }

  const row = {
    workspace_id,
    team_id,
    user_id: user.id,
    email_address: email,
    imap_username: email,
    imap_password_encrypted: imapPlaceholderEncrypted,
    credential_type: "oauth" as const,
    status: "connected" as const,
    access_token_encrypted: accessTokenEncrypted,
    refresh_token_encrypted: refreshTokenEncrypted,
    token_expiry: tokenExpiry,
    scope: tokenJson.scope ?? null,
    sync_enabled: true,
    last_verified_at: now,
  };

  const upsertOk = await (async () => {
    try {
      const { error: upsertErr } = await supabase
        .from("gmail_credentials")
        .upsert(row, { onConflict: "workspace_id,user_id" });
      if (!upsertErr) return true;

      // Fallback for older unique/index states — should never 500.
      await supabase
        .from("gmail_credentials")
        .delete()
        .eq("workspace_id", workspace_id)
        .eq("user_id", user.id);

      const { error: insErr } = await supabase.from("gmail_credentials").insert(row);
      return !insErr;
    } catch (e) {
      logStageError("upsert_gmail_credentials", e);
      return false;
    }
  })();

  if (!upsertOk) return errorRedirect(request, "upsert_gmail_credentials");

  // Best-effort routing sync; OAuth success is unaffected, but still must never throw.
  try {
    const destinationEmail = email.toLowerCase().trim();
    if (destinationEmail) {
      const { error } = await supabase.from("business_profiles").upsert(
        { team_id, workspace_id, gmail_destination_email: destinationEmail },
        { onConflict: "team_id" },
      );
      if (error) logStageError("sync_business_profiles", error);
    }
  } catch (e) {
    logStageError("sync_business_profiles", e);
  }

  // Best-effort backfill enqueue; OAuth success is unaffected.
  try {
    const serviceSupabase = deps.createServiceSupabase();
    const enqueue = await deps.enqueueBackfill(serviceSupabase, {
      workspaceId: workspace_id,
      teamId: team_id,
    });
    if (enqueue.error) logStageError("enqueue_gmail_backfill", enqueue.error);
  } catch (e) {
    logStageError("enqueue_gmail_backfill", e);
  }

  return successRedirect(request);
}

