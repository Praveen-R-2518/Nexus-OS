# Gmail integration test results

**Date:** 2026-05-16 (UTC)  
**n8n instance:** `https://knurdz3o.app.n8n.cloud`  
**Workflows:** `WF0a Gmail Intake` (`Jstc7pdjuHbqeGTN`), `WF2 - AI Classification` (`XHKDZBIzSwnx34My`)  
**Supabase project:** `xuvodbcdmfhlbldbvwvt`

This document records execution of the Gmail integration test plan (webhook + DB verification). The plan file itself was not modified.

---

## 1. Preflight

| Check | Result |
|--------|--------|
| `n8n_health_check` | OK |
| WF0a active | Yes |
| WF2 active | Yes |
| `n8n_validate_workflow` (runtime profile) WF0a | `valid: true`, 18 warnings (webhook response, error handling, unreachable manual fixture, etc.) — **superseded by §7 post-fix validation counts** |
| `n8n_validate_workflow` WF2 | `valid: true`, 10 warnings (AI rate limits, webhook error handling, etc.) — **superseded by §7** |
| `conversations_source_check` (live DB) | At original test time: `gmail` not allowed — **after §7 work:** constraint updated to allow `gmail` (see [gmail_validation_warnings_classification.md](gmail_validation_warnings_classification.md)) |
| WF0a live `POST Conversation` nodes | Originally: `source: 'demo'` + `ingest_source` — **after §7:** `source` from `normalized.source` (Gmail rows use `gmail`) while `raw_payload.ingest_source` remains optional metadata |
| `Gmail IMAP Trigger` in active WF0a graph | **`disabled: true`** — real inbox/IMAP path not exercised in this run |
| `n8n_executions` list for WF0a | Did not show new rows immediately after triggers; **Supabase and `workflow_logs` were used as the source of truth** for pass/fail |

### Dedup query vs live schema

Originally live n8n had `status=in.(new,in_progress,awaiting_reply)` in `Dedup Lookup Query`, which was invalid vs `leads_status_check`. **Repo + live WF0a** now use `status=in.(new,in_progress)` only (see §7).

---

## 2. TC1 — New lead (webhook / Gmail-shaped payload)

**Actions:** `POST https://knurdz3o.app.n8n.cloud/webhook/gmail-inbound` with fixture-shaped JSON (unique sender).

**Marker:** `gmail-e2e-1778948438431@example.com`, subject `Gmail E2E Quote 1778948438431`

**Result:** PASS

- `conversations`: rows created with `source = 'demo'`, `raw_payload` includes `ingest_source = 'gmail'` (IDs include `6c98c0d6-3d3c-4050-b83a-6286370c9aa0`, `0cdfc244-d9cb-46ad-8418-f76d9d2c3f0c` — **duplicate** because both `n8n_test_workflow` and `curl` were fired once each).
- `leads`: `c0c5d2f6-12e0-4245-b2de-138b8506b5ea`, `intent = pricing_request`, `urgency = high`, `status = new`.
- `workflow_logs`: `WF0a Gmail Intake` / `gmail_intake_ok` / `success` with `payload.source = gmail`.
- `workflow_logs`: `classification` / `message_classified` / `success` (`lead_operation`: `lead_created` then `lead_updated`).

---

## 3. TC2 — Real Gmail / IMAP

**Result:** BLOCKED (not a failure of logic)

- Active WF0a graph: `Gmail IMAP Trigger (configure credential)` is **disabled**; requires IMAP credential and enabling the node.
- **When unblocked:** send a real email to the monitored inbox; expect the same downstream behavior as TC1 (optionally mark messages as read per `postProcessAction: read`).

---

## 4. TC3 — Existing lead append

**Action:** Second POST from the same `gmail-e2e-1778948438431@example.com` with follow-up body and `In-Reply-To` header.

**Result:** PASS

- New `conversations` row: `ddccd5ba-2877-456c-8439-393d722c3609` with follow-up message text.
- `leads.updated_at` advanced; `conversation_id` on the lead points at the latest conversation (`ddccd5ba-...`), consistent with append + touch behavior.

---

## 5. TC4 — Noise drop (short pleasantry)

**Action:** POST `textPlain: "Thanks!"` from `noise-e2e-1778948483617@example.com`.

**Result:** PASS

- `conversations` count for that email: **0**.
- `workflow_logs`: `noise_filter_dropped` with `drop_reason: short_pleasantry`.

---

## 6. TC5 — Edge payload (HTML-only + bare `from` email)

**Action:** POST with `from: "edge-html-<ts>@example.com"` (string), `html` only (no `textPlain`), inline “quoted” block.

**Result:** PASS (with observation)

- `conversations`: `d8c09af3-2f46-46b1-b0d5-c3e169db9ba6`
- `customer_name` derived as `Edge Html 1778948494760` (title-case from local part).
- HTML stripped to plain text; **blockquote “quote” was not fully removed** (appears as trailing sentence after strip) — acceptable for this test; optional hardening in `stripSignatureAndQuotes` / HTML path if product requires stricter quote removal.

**Extra:** Newsletter-style POST (`news-1778948502207@example.com`) was dropped with `drop_reason: automated_sender_no_question` (local part `news-*` heuristic); **no** conversation row.

---

## 7. Post–Gmail Warning Fix verification (2026-05-16)

Automated / infra verification after implementing the Gmail Warning Fix Plan (session artifact; do not edit the plan file in `.cursor/plans/`).

| Item | Result |
|------|--------|
| Supabase live `conversations_source_check` | Allows `gmail` (DDL applied via MCP `execute_sql`; repo migration `0004` updated for `report_date` guard — see [gmail_validation_warnings_classification.md](gmail_validation_warnings_classification.md)) |
| `n8n_validate_workflow` WF0a (`Jstc7pdjuHbqeGTN`, runtime) | `valid: true`, **0** errors, **9** warnings (code-node noise, IF/Switch false-positive style notes, long chain, etc.) |
| `n8n_validate_workflow` WF2 (`XHKDZBIzSwnx34My`, runtime) | `valid: true`, **0** errors, **7** warnings |
| Live WF0a | Dedup uses `status=in.(new,in_progress)`; POST conversations use `source` from normalizer; `retryOnFail` on GET/POST; `gmail_intake_error` + **Stop** on failed POST (error branch `main[1]`); demo Manual/Fixture nodes **removed**; execution save settings `all` |
| Live WF2 | `retryOnFail` on **Fetch Business Profile**, **Create Lead**, **Patch Existing Lead**; **Parse AI Response** sets `classification_failed: true` on JSON parse fallback; **Log Classification** uses `step: classification_failed` vs `message_classified` |
| Repo export | `npm run n8n:export-workflows` regenerates [n8n_logic/exports/wf0a_gmail_intake.json](../n8n_logic/exports/wf0a_gmail_intake.json) aligned with the above (error routing on HTTP `main[1]`) |
| TC1–TC5 curl re-run | **Not re-executed in this session** — use §10 commands after deploy; expect `conversations.source = gmail` for Gmail-shaped payloads |
| TC2 IMAP | Still **BLOCKED** until IMAP credential is configured and the trigger is enabled |

---

## 8. Acceptance summary

| Criterion | Status |
|-----------|--------|
| Webhook receives Gmail-shaped payload | PASS |
| Normalizer + noise filter | PASS |
| Persist conversations + trigger WF2 | PASS |
| WF2 classification + `workflow_logs` | PASS |
| `source = 'gmail'` on `conversations` | **PASS path after §7** once POST nodes use `normalized.source` and DB allows `gmail` (re-run TC1-style curl to confirm on new rows) |
| Real Gmail IMAP | BLOCKED (trigger disabled) |
| No errors on happy-path TC1/TC3/TC5 | PASS (historical error execution `331` predates this run; root cause was `gmail` vs `conversations_source_check`, since mitigated by `demo` + `ingest_source`) |

---

## 9. Recommended follow-ups

1. ~~Apply migration 0004 + align `source`~~ — done for live DB + WF0a (see §7); keep repo migration for other environments.
2. Re-run **§10** curl checks (TC1/TC3/TC4/TC5) and confirm `conversations.source = gmail` plus `workflow_logs` `gmail_intake_ok` / `classification_failed` as applicable.
3. Enable **IMAP** + credential and re-run TC2; confirm read/unread behavior in Gmail.
4. Optionally add a **WF2 export** to the repo if you want JSON parity with cloud beyond WF0a.

---

## 10. How to re-run (manual)

```bash
# TC1-style (replace body with unique email / subject)
curl -sS -X POST "https://knurdz3o.app.n8n.cloud/webhook/gmail-inbound" \
  -H "Content-Type: application/json" \
  -d '{"__source":"gmail","from":{"text":"\"You\" <you+test@example.com>"},"subject":"Gmail E2E ...","textPlain":"...question...","threadId":"thread_id","date":"2026-05-16T00:00:00.000Z","headers":{"message-id":"<id@mail.gmail.com>","subject":"...","from":"..."}}'
```

Then verify in Supabase: `conversations`, `leads`, `workflow_logs` for your unique marker.
