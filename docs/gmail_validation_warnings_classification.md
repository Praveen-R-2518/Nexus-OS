# n8n validation warnings — impact classification

This document satisfies the “classify warnings” step for WF0a / WF2 Gmail pipeline work. It maps `n8n_validate_workflow` (runtime profile) warnings to **pipeline impact** and recommended handling.

## Legend

- **Blocker**: prevents a required path (example: real Gmail IMAP disabled).
- **Prod risk**: happy path can succeed but failures are silent, flaky, or corrupt downstream state.
- **Hygiene**: maintainability or validator noise; fix when convenient.
- **False positive / accept**: no behavior change expected.

## WF0a Gmail Intake

| Warning theme | Typical message | Impact | Notes |
|---------------|-----------------|--------|-------|
| Gmail IMAP trigger disabled | (graph state) | **Blocker** for TC2 real inbox | Webhook fallback still works. |
| Webhook `onReceived` | “Webhooks should always send a response, even on error” | **Prod risk** (observability) | Caller gets early 200; rely on execution logs + `workflow_logs` for failures. |
| Webhook missing `onError` | “add onError continueRegularOutput” | **Prod risk** | Prevents webhook thread from hanging on unexpected errors. |
| Code nodes may throw | normalizer / noise / dedup | **Prod risk** (edge payloads) | Malformed payloads can hard-fail; add logging or guardrails if needed. |
| Noise filter “Invalid `$` usage`” | static validator | **False positive / accept** | Regex and JS can confuse the validator; runtime tests passed. |
| IF/Switch `main[1]` + `continueErrorOutput` | “missing onError continueErrorOutput” | **False positive / accept** | `main[1]` is the normal false/second branch for IF/Switch, not an error output. |
| IF/Switch outdated `typeVersion` | upgrade available | **Hygiene** | Safe to upgrade after smoke validation. |
| Manual fixture unreachable | “not reachable from trigger” | **Hygiene** | Remove from production export or keep only in a demo workflow copy. |
| HTTP Request without retries / error handling | Supabase GET/POST | **Prod risk** | Transient network/429 failures can drop intake; add `retryOnFail` and bounded waits. |
| Long linear chain | workflow-level | **Hygiene** | Consider sub-workflows later. |

## WF2 AI Classification

| Warning theme | Typical message | Impact | Notes |
|---------------|-----------------|--------|-------|
| Webhook response on error | Receive from WF1 | **Prod risk** | Add `onError` / error workflow if clients need deterministic responses. |
| OpenAI rate limits | Classify Message | **Prod risk** | Mitigate with retries/backoff; log `classification_failed` on persistent failure. |
| Code nodes may throw | Parse / Normalize | **Prod risk** | Parser already falls back; still log when fallback triggers if desired. |
| HTTP Request without retries | Supabase profile/leads | **Prod risk** | Same as WF0a: retries for transient failures. |
| IF `main[1]` + `continueErrorOutput` | Route / Has Existing Lead | **False positive / accept** | Normal branching. |
| Long linear chain | workflow-level | **Hygiene** | Optional refactor. |

## Cross-cutting (schema)

| Issue | Impact |
|-------|--------|
| `conversations.source` disallowing `gmail` | **Blocker** for clean channel semantics — fixed by DDL in [supabase/migrations/0004_gmail_product_alignment.sql](../supabase/migrations/0004_gmail_product_alignment.sql) (allow `gmail`, `email`, `imap`, etc.). |

## Live Supabase note

Live Supabase project `xuvodbcdmfhlbldbvwvt`: migration `0004_gmail_product_alignment.sql` was applied in two steps via the Supabase MCP **`execute_sql`** tool (constraint block, then remainder) after `apply_migration` failed once because `daily_reports.report_date` is absent on that project. The repo migration file was updated to guard the `report_date` reference with `information_schema` so a future `supabase db push` / `apply_migration` succeeds everywhere.
