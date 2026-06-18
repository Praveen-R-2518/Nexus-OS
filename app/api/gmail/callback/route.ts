import { NextResponse } from "next/server";
import { encryptSecret, isEncryptionConfigured } from "@/lib/encryption/credential-secret";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import {
  decodeOAuthState,
  oauthConfigError,
  oauthRedirectUri,
  signupGmailUrl,
} from "@/app/api/gmail/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
};

type GoogleUserInfo = {
  email?: string;
};

function errorRedirect(): NextResponse {
  return NextResponse.redirect(signupGmailUrl({ gmail_error: "true" }));
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

  if (oauthConfigError() || !isEncryptionConfigured()) {
    return errorRedirect();
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!.trim();
  const redirectUri = oauthRedirectUri();

  let tokenJson: GoogleTokenResponse;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    tokenJson = (await tokenRes.json()) as GoogleTokenResponse;
  } catch {
    return errorRedirect();
  }

  const accessToken = tokenJson.access_token;
  if (!accessToken || tokenJson.error) {
    return errorRedirect();
  }

  let email: string | undefined;
  try {
    const userInfoRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const userInfo = (await userInfoRes.json()) as GoogleUserInfo;
    email = userInfo.email?.trim();
  } catch {
    return errorRedirect();
  }

  if (!email) {
    return errorRedirect();
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
    accessTokenEncrypted = encryptSecret(accessToken);
    refreshTokenEncrypted = tokenJson.refresh_token
      ? encryptSecret(tokenJson.refresh_token)
      : encryptSecret("");
    imapPlaceholderEncrypted = encryptSecret("oauth");
  } catch {
    return errorRedirect();
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

  const { error: upsertErr } = await supabase
    .from("gmail_credentials")
    .upsert(row, { onConflict: "workspace_id,user_id" });

  if (upsertErr) {
    await supabase
      .from("gmail_credentials")
      .delete()
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id);

    const { error: insErr } = await supabase.from("gmail_credentials").insert(row);
    if (insErr) {
      return errorRedirect();
    }
  }

  try {
    const destinationEmail = email.toLowerCase().trim();
    if (destinationEmail) {
      await supabase.from("business_profiles").upsert(
        { team_id, workspace_id, gmail_destination_email: destinationEmail },
        { onConflict: "team_id" },
      );
    }
  } catch {
    // best-effort routing sync; OAuth success is unaffected
  }

  return NextResponse.redirect(signupGmailUrl({ gmail_connected: "true" }));
}
