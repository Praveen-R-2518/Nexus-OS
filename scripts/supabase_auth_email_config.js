#!/usr/bin/env node

require("dotenv").config({ path: ".env" });
require("dotenv").config({ path: ".env.local", override: true });

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "xuvodbcdmfhlbldbvwvt";
const API_BASE = "https://api.supabase.com/v1";
const ACTION = process.argv[2] || "check";

const REQUIRED_SMTP_ENV = [
  "SUPABASE_SMTP_ADMIN_EMAIL",
  "SUPABASE_SMTP_HOST",
  "SUPABASE_SMTP_PORT",
  "SUPABASE_SMTP_USER",
  "SUPABASE_SMTP_PASS",
  "SUPABASE_SMTP_SENDER_NAME",
];

function readEnv(name) {
  const value = process.env[name]?.trim();
  return value || "";
}

function parseBoolEnv(name, fallback) {
  const raw = readEnv(name).toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

function parseList(value) {
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeOrigin(raw) {
  const value = raw.trim().replace(/\/+$/, "");
  if (!value) return "";
  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    return `https://${value}`;
  }
  return value;
}

function redacted(value) {
  if (value === undefined || value === null || value === "") return false;
  return true;
}

function printJson(label, value) {
  console.log(`${label}:`);
  console.log(JSON.stringify(value, null, 2));
}

async function managementRequest(path, options = {}) {
  const token = readEnv("SUPABASE_ACCESS_TOKEN");
  if (!token) {
    throw new Error(
      "SUPABASE_ACCESS_TOKEN is required. Create one in Supabase Dashboard > Account > Access Tokens.",
    );
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const detail =
      body && typeof body === "object" && "message" in body
        ? body.message
        : typeof body === "string"
          ? body
          : res.statusText;
    throw new Error(`Management API ${res.status}: ${detail}`);
  }

  return body;
}

function summarizeConfig(config) {
  const uriAllowList = parseList(config.uri_allow_list);
  const templateKeys = Object.keys(config).filter((key) =>
    /template|mailer.*content|mailer.*html/i.test(key),
  );

  return {
    project_ref: PROJECT_REF,
    email_provider_enabled: config.external_email_enabled === true,
    email_confirmation_required: config.mailer_autoconfirm === false,
    secure_email_change: config.mailer_secure_email_change_enabled === true,
    site_url: config.site_url || null,
    redirect_urls: uriAllowList,
    rate_limit_email_sent: config.rate_limit_email_sent ?? null,
    smtp: {
      admin_email_present: redacted(config.smtp_admin_email),
      host_present: redacted(config.smtp_host),
      port: config.smtp_port ?? null,
      user_present: redacted(config.smtp_user),
      sender_name_present: redacted(config.smtp_sender_name),
      password_visible_from_api: redacted(config.smtp_pass),
    },
    send_email_hook: {
      enabled: config.hook_send_email_enabled === true,
      uri_present: redacted(config.hook_send_email_uri),
    },
    template_keys_seen: templateKeys,
  };
}

function expectedRedirects(siteUrl) {
  const urls = new Set(["http://localhost:3000/**"]);
  if (siteUrl) {
    urls.add(`${siteUrl}/auth/callback`);
    urls.add(`${siteUrl}/auth/callback/**`);
  }
  for (const url of parseList(readEnv("SUPABASE_AUTH_REDIRECT_URLS"))) {
    urls.add(url);
  }
  return [...urls];
}

function analyzeConfig(config) {
  const issues = [];
  const warnings = [];
  const siteUrl = normalizeOrigin(
    readEnv("SUPABASE_AUTH_SITE_URL") ||
      readEnv("NEXT_PUBLIC_SITE_URL") ||
      readEnv("NEXT_PUBLIC_APP_URL") ||
      config.site_url ||
      "",
  );
  const redirects = parseList(config.uri_allow_list);
  const redirectsSet = new Set(redirects);

  if (config.external_email_enabled !== true) {
    issues.push("Email/password provider is disabled (`external_email_enabled` is not true).");
  }
  if (config.mailer_autoconfirm !== false) {
    issues.push("Email confirmation is not enforced (`mailer_autoconfirm` should be false).");
  }
  if (!config.smtp_host || !config.smtp_admin_email || !config.smtp_user) {
    issues.push("Custom SMTP is incomplete. Host, sender email, and SMTP user must be configured.");
  }
  if (config.hook_send_email_enabled === true) {
    issues.push("Send Email Hook is enabled, so SMTP is bypassed. Disable it unless it is intentionally sending auth mail.");
  }
  if (!siteUrl) {
    issues.push("No production Site URL is known. Set SUPABASE_AUTH_SITE_URL or NEXT_PUBLIC_SITE_URL.");
  }

  for (const url of expectedRedirects(siteUrl)) {
    if (!redirectsSet.has(url)) {
      warnings.push(`Redirect allowlist should include ${url}`);
    }
  }

  if (Number(config.rate_limit_email_sent) !== 100) {
    warnings.push(`rate_limit_email_sent is ${config.rate_limit_email_sent ?? "unset"}; expected 100.`);
  }

  const suspiciousTemplates = Object.entries(config)
    .filter(([key, value]) => /template|mailer/i.test(key) && typeof value === "string")
    .filter(([, value]) => value.includes("{{ .SiteURL }}") && !value.includes("{{ .RedirectTo }}"))
    .map(([key]) => key);
  for (const key of suspiciousTemplates) {
    warnings.push(`${key} appears to use {{ .SiteURL }} without {{ .RedirectTo }}.`);
  }

  return { issues, warnings };
}

function buildPatchPayload(current) {
  const siteUrl = normalizeOrigin(
    readEnv("SUPABASE_AUTH_SITE_URL") ||
      readEnv("NEXT_PUBLIC_SITE_URL") ||
      readEnv("NEXT_PUBLIC_APP_URL") ||
      current.site_url ||
      "",
  );
  const rateLimit = Number(readEnv("SUPABASE_AUTH_EMAIL_RATE_LIMIT") || 100);
  if (!Number.isFinite(rateLimit) || rateLimit < 1) {
    throw new Error("SUPABASE_AUTH_EMAIL_RATE_LIMIT must be a positive number.");
  }

  const payload = {
    external_email_enabled: true,
    mailer_autoconfirm: false,
    mailer_secure_email_change_enabled: true,
    rate_limit_email_sent: rateLimit,
  };

  if (siteUrl) {
    payload.site_url = siteUrl;
    const mergedRedirects = new Set([
      ...parseList(current.uri_allow_list),
      ...expectedRedirects(siteUrl),
    ]);
    payload.uri_allow_list = [...mergedRedirects].join(",");
  }

  if (parseBoolEnv("SUPABASE_AUTH_DISABLE_SEND_EMAIL_HOOK", true)) {
    payload.hook_send_email_enabled = false;
  }

  const providedSmtp = REQUIRED_SMTP_ENV.filter((name) => readEnv(name));
  if (providedSmtp.length > 0) {
    const missing = REQUIRED_SMTP_ENV.filter((name) => !readEnv(name));
    if (missing.length) {
      throw new Error(
        `Partial SMTP config would be unsafe. Missing: ${missing.join(", ")}`,
      );
    }

    payload.smtp_admin_email = readEnv("SUPABASE_SMTP_ADMIN_EMAIL");
    payload.smtp_host = readEnv("SUPABASE_SMTP_HOST");
    payload.smtp_port = readEnv("SUPABASE_SMTP_PORT");
    payload.smtp_user = readEnv("SUPABASE_SMTP_USER");
    payload.smtp_pass = readEnv("SUPABASE_SMTP_PASS");
    payload.smtp_sender_name = readEnv("SUPABASE_SMTP_SENDER_NAME");

    const smtpPort = Number(payload.smtp_port);
    if (!Number.isFinite(smtpPort) || smtpPort < 1) {
      throw new Error("SUPABASE_SMTP_PORT must be a valid port number.");
    }
  }

  return payload;
}

function redactedPayload(payload) {
  const copy = { ...payload };
  if ("smtp_pass" in copy) copy.smtp_pass = "<redacted>";
  if ("smtp_user" in copy) copy.smtp_user = "<redacted>";
  return copy;
}

async function check() {
  const config = await managementRequest(`/projects/${PROJECT_REF}/config/auth`);
  const summary = summarizeConfig(config);
  const analysis = analyzeConfig(config);
  printJson("Auth email config health", summary);

  if (analysis.issues.length || analysis.warnings.length) {
    printJson("Findings", analysis);
    process.exitCode = analysis.issues.length ? 1 : 0;
    return;
  }

  console.log("OK: Supabase Auth email config looks ready.");
}

async function patch() {
  const current = await managementRequest(`/projects/${PROJECT_REF}/config/auth`);
  const payload = buildPatchPayload(current);
  printJson("Applying redacted Auth config patch", redactedPayload(payload));
  await managementRequest(`/projects/${PROJECT_REF}/config/auth`, {
    method: "PATCH",
    body: payload,
  });
  await check();
}

async function main() {
  if (!["check", "patch"].includes(ACTION)) {
    throw new Error("Usage: node scripts/supabase_auth_email_config.js [check|patch]");
  }
  if (ACTION === "check") await check();
  if (ACTION === "patch") await patch();
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
