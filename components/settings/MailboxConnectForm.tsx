"use client";

import { useState } from "react";
import { Check, Mail, Server } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Connect ANY email provider (Zoho, Outlook/Microsoft 365, cPanel/GoDaddy, custom) over IMAP+SMTP,
 * alongside the Gmail OAuth path. Posts to `/api/gmail/test-imap`, which verifies IMAP login (and,
 * when SMTP settings are supplied, SMTP auth) before saving the encrypted credential. The mailbox
 * poller (`/api/internal/n8n/mailbox-sync`) then ingests inbound mail as `source:"email"`.
 */

type Preset = {
  label: string;
  imapHost: string;
  imapPort: number;
  imapTls: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpTls: boolean;
};

// smtpTls=true → implicit TLS (465); smtpTls=false → STARTTLS (587). Matches nodemailer `secure`.
const PRESETS: Record<string, Preset> = {
  zoho: {
    label: "Zoho Mail",
    imapHost: "imap.zoho.com",
    imapPort: 993,
    imapTls: true,
    smtpHost: "smtp.zoho.com",
    smtpPort: 465,
    smtpTls: true,
  },
  outlook: {
    label: "Outlook / Microsoft 365",
    imapHost: "outlook.office365.com",
    imapPort: 993,
    imapTls: true,
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpTls: false,
  },
  cpanel: {
    label: "cPanel / GoDaddy (mail.yourdomain)",
    imapHost: "",
    imapPort: 993,
    imapTls: true,
    smtpHost: "",
    smtpPort: 465,
    smtpTls: true,
  },
  custom: {
    label: "Custom IMAP / SMTP",
    imapHost: "",
    imapPort: 993,
    imapTls: true,
    smtpHost: "",
    smtpPort: 587,
    smtpTls: false,
  },
};

const INPUT =
  "w-full rounded-lg border border-glass-border bg-transparent px-3 py-2 text-sm text-atmospheric-grey outline-none focus:border-nexus-intake";
const LABEL = "text-xs font-medium text-muted";

export function MailboxConnectForm({
  workspaceId,
  editable,
  onConnected,
}: {
  workspaceId: string | null;
  editable: boolean;
  onConnected?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [presetKey, setPresetKey] = useState<string>("zoho");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [imapHost, setImapHost] = useState(PRESETS.zoho.imapHost);
  const [imapPort, setImapPort] = useState(PRESETS.zoho.imapPort);
  const [imapTls, setImapTls] = useState(PRESETS.zoho.imapTls);
  const [smtpHost, setSmtpHost] = useState(PRESETS.zoho.smtpHost);
  const [smtpPort, setSmtpPort] = useState(PRESETS.zoho.smtpPort);
  const [smtpTls, setSmtpTls] = useState(PRESETS.zoho.smtpTls);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function applyPreset(key: string) {
    setPresetKey(key);
    const p = PRESETS[key];
    if (!p) return;
    setImapHost(p.imapHost);
    setImapPort(p.imapPort);
    setImapTls(p.imapTls);
    setSmtpHost(p.smtpHost);
    setSmtpPort(p.smtpPort);
    setSmtpTls(p.smtpTls);
  }

  async function submit() {
    if (!workspaceId) {
      setBanner({ type: "err", text: "No workspace found for this account." });
      return;
    }
    const user = username.trim() || email.trim();
    if (!email.trim() || !user || !password || !imapHost.trim() || !smtpHost.trim()) {
      setBanner({
        type: "err",
        text: "Email, password, and IMAP + SMTP hosts are all required.",
      });
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch("/api/gmail/test-imap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          email: email.trim(),
          username: user,
          password,
          imap_host: imapHost.trim(),
          imap_port: imapPort,
          imap_tls: imapTls,
          smtp_host: smtpHost.trim(),
          smtp_port: smtpPort,
          smtp_tls: smtpTls,
        }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!json.success) {
        setBanner({ type: "err", text: json.error || "Could not connect the mailbox." });
        return;
      }
      setBanner({ type: "ok", text: "Mailbox connected. Nexus OS will start ingesting mail." });
      setPassword("");
      onConnected?.();
    } catch {
      setBanner({ type: "err", text: "Network error while connecting the mailbox." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-glass-border px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Server className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
          <div>
            <p className="text-sm font-medium text-atmospheric-grey">Other mailbox (IMAP / SMTP)</p>
            <p className="mt-1 text-xs text-muted">
              Connect Zoho, Outlook / Microsoft 365, cPanel, or any custom mailbox.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={!editable}
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-glass-border px-3 py-1.5 text-xs font-medium text-atmospheric-grey disabled:opacity-50"
        >
          {open ? "Close" : "Connect a provider"}
        </button>
      </div>

      {open ? (
        <div className="mt-4 space-y-3">
          {banner ? (
            <div
              className={cn(
                "flex items-center gap-1 rounded-lg border border-dashed px-3 py-2 text-xs",
                banner.type === "ok"
                  ? "border-nexus-intake-border bg-nexus-intake-soft text-nexus-intake"
                  : "border-badge-critical-ring bg-badge-critical-bg text-badge-critical-text",
              )}
              role="status"
            >
              {banner.type === "ok" ? <Check className="h-4 w-4" aria-hidden /> : null}
              {banner.text}
            </div>
          ) : null}

          <div>
            <label className={LABEL}>Provider</label>
            <select
              value={presetKey}
              onChange={(e) => applyPreset(e.target.value)}
              className={cn(INPUT, "mt-1")}
            >
              {Object.entries(PRESETS).map(([key, p]) => (
                <option key={key} value={key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (!username) setUsername(e.target.value);
                }}
                placeholder="you@yourdomain.com"
                className={cn(INPUT, "mt-1")}
              />
            </div>
            <div>
              <label className={LABEL}>Username (usually the email)</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="you@yourdomain.com"
                className={cn(INPUT, "mt-1")}
              />
            </div>
          </div>

          <div>
            <label className={LABEL}>Password / app password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              className={cn(INPUT, "mt-1")}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className={LABEL}>IMAP host</label>
              <input
                type="text"
                value={imapHost}
                onChange={(e) => setImapHost(e.target.value)}
                placeholder="imap.yourdomain.com"
                className={cn(INPUT, "mt-1")}
              />
            </div>
            <div>
              <label className={LABEL}>IMAP port</label>
              <input
                type="number"
                value={imapPort}
                onChange={(e) => setImapPort(Number(e.target.value) || 0)}
                className={cn(INPUT, "mt-1")}
              />
            </div>
            <label className="mt-6 flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={imapTls}
                onChange={(e) => setImapTls(e.target.checked)}
              />
              TLS
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className={LABEL}>SMTP host</label>
              <input
                type="text"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.yourdomain.com"
                className={cn(INPUT, "mt-1")}
              />
            </div>
            <div>
              <label className={LABEL}>SMTP port</label>
              <input
                type="number"
                value={smtpPort}
                onChange={(e) => setSmtpPort(Number(e.target.value) || 0)}
                className={cn(INPUT, "mt-1")}
              />
            </div>
            <label className="mt-6 flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={smtpTls}
                onChange={(e) => setSmtpTls(e.target.checked)}
              />
              Implicit TLS (465)
            </label>
          </div>

          <button
            type="button"
            disabled={busy || !editable}
            onClick={() => void submit()}
            className="inline-flex items-center gap-2 rounded-lg bg-nexus-intake px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Mail className="h-4 w-4" aria-hidden />
            {busy ? "Testing & saving…" : "Test & connect mailbox"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
