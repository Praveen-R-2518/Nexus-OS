# Nexus OS New Implementation Blueprint

This blueprint covers the complete planned upgrade set, not only the Meta inbox. It is designed to extend the current Gmail-first Revenue Command Center into a multi-channel operations platform with social inbox, social publishing, AI media generation, and a compliant hiring workflow.

## Product Goals

Nexus OS should become the business command center for customer messages, content distribution, and hiring signals while preserving the current safety model:

- Every inbound revenue-related message is routed to the right tenant.
- Noise is filtered before paid AI calls.
- AI classifies urgency, value, churn risk, and intent.
- AI drafts replies or content, but sensitive outbound actions remain approval-gated.
- All tenant data remains isolated by `team_id` / `workspace_id` and Supabase RLS.
- External platform limitations are respected instead of relying on scraping or unsafe automation.

## Current Foundation

The current system is built around:

- Next.js App Router API routes and UI pages.
- Supabase Postgres with tenant-scoped tables and RLS.
- n8n workflows for intake, classification, reply generation, reports, and operational glue.
- OpenAI for classification, reply generation, summaries, and future media/caption/image tasks.
- Gmail OAuth/IMAP intake as the reference implementation.

Important existing patterns:

- `business_profiles` stores routing keys and business context.
- `conversations` stores normalized inbound messages.
- `leads` stores classification results.
- `reply_drafts` stores approval-gated AI responses.
- `workflow_logs` stores workflow-level visibility.
- `n8n_logic/multi_channel_normalizer.js` is the canonical normalization layer.
- `n8n_logic/noise_filter.js` must run before any paid AI classification.
- `ai_prompts/` stores prompt assets that should remain source-controlled.

## Workstream 1: Unified Customer Inbox

### Scope

Support inbound messages from:

- Gmail
- WhatsApp Business
- Instagram DMs
- Facebook Page Messenger
- Optional later: X DMs, only as a paid premium integration

LinkedIn inbox should not be included in the production inbox because general LinkedIn message access is not available through public APIs. Unofficial browser/session automation is a ToS and account-ban risk.

### Meta Inbox Architecture

Meta channels should share one integration:

1. Meta sends webhook events to `app/api/meta/webhook`.
2. The route verifies `hub.challenge` for setup.
3. The route verifies `X-Hub-Signature-256` using `META_APP_SECRET`.
4. The payload is deduped by platform message id.
5. The payload is forwarded or enqueued into the n8n intake workflow.
6. n8n resolves tenant context from `business_profiles`.
7. `multi_channel_normalizer.js` emits canonical conversation fields.
8. `noise_filter.js` filters non-actionable content.
9. WF2 classification creates or updates `leads`.
10. WF3 reply generation creates `reply_drafts`.
11. `/approval` remains the outbound safety gate.

### Data Model

Use additive migrations only.

Required `conversations` changes:

- `source`: allow `whatsapp`, `instagram`, `facebook`, and later `x`.
- `external_thread_id`: native thread/message identifier.
- `external_permalink`: best-effort native inbox URL.
- Optional future: `platform_message_id` for durable idempotency.

Required `business_profiles` changes:

- `wa_phone_number_id`
- `whatsapp_routing_number`
- `ig_account_id`
- `fb_page_id`
- Optional later: `x_user_id`

Required credentials tables:

- `meta_credentials`
- Optional later: `x_credentials`

Credential tables must store encrypted tokens only and include:

- `workspace_id`
- `team_id`
- `user_id`
- `platform`
- `status`
- platform account ids
- encrypted access token
- token expiry
- `sync_enabled`
- `last_synced_at`
- `last_sync_error`

### UI Requirements

The inbox must show the platform for every message.

Inbox list:

- Show an icon and label for Gmail, WhatsApp, Instagram, Facebook, and future X.
- Preserve current urgency, intent, search, sorting, and revenue-at-risk behavior.

Conversation detail:

- Show platform label.
- Show AI classification and estimated value exactly as Gmail does.
- Show draft reply CTA when available.
- Show `Open in native inbox` for supported sources.
- Ask for confirmation before redirecting away from Nexus OS.
- Open external inbox links in a new tab.
- If no reliable deep link exists, show a graceful unavailable state.

### Important Hardening

Before production launch:

- Persist webhook payloads or queue them before returning `200` to Meta. Fire-and-forget forwarding can silently drop messages if n8n is down.
- Replace in-memory dedupe with durable idempotency using a table keyed by platform + message id.
- Correct platform deep links based on real webhook fields. WhatsApp should deep-link to the customer phone, not the business phone.
- Verify Instagram/Facebook deep links because message ids are not always thread ids.

## Workstream 2: Outbound Reply Sending

### Goal

Approved replies should be sent back through the source platform when possible.

### Channel Rules

Gmail:

- Existing Gmail send flow remains the model.

WhatsApp:

- Free-form replies only inside the 24-hour customer service window.
- Outside 24 hours, use approved WhatsApp templates.
- Store template state and failures in `workflow_logs`.

Instagram and Facebook:

- Reply only to user-initiated conversations.
- Respect the 24-hour messaging window.
- Require `pages_messaging`, `pages_manage_metadata`, and Instagram messaging permissions.

X:

- Optional premium integration.
- Requires paid API access and `dm.write`.

### Approval Flow

Keep all outbound replies approval-gated:

1. User reviews `reply_drafts`.
2. User approves, edits, or rejects.
3. Approval route records status.
4. n8n sends through the correct channel adapter.
5. Send result updates `conversations.status` and `reply_drafts.status`.
6. Errors become visible in `workflow_logs`.

## Workstream 3: Social Media Publishing Studio

### Scope

Add a separate media/content section where the user can:

- Upload media.
- Add an optional description.
- Ask AI to analyze the media.
- Generate platform-specific captions.
- Enhance a user-provided caption.
- Schedule or publish posts to business social accounts.

Supported platforms:

- Instagram
- Facebook Page
- LinkedIn personal profile
- LinkedIn company page, only after required approval
- X, optional paid integration

WhatsApp is not a normal feed-posting platform and should not be treated like Instagram/Facebook/LinkedIn/X.

### Data Model

Add tables such as:

- `media_assets`
- `social_posts`
- `social_post_variants`
- `social_publish_jobs`
- `social_platform_credentials`

Suggested `media_assets` fields:

- `id`
- `team_id`
- `workspace_id`
- `storage_path`
- `public_url`
- `mime_type`
- `size_bytes`
- `width`
- `height`
- `duration_seconds`
- `ai_analysis`
- `created_by`
- `created_at`

Suggested `social_posts` fields:

- `id`
- `team_id`
- `workspace_id`
- `media_asset_id`
- `user_prompt`
- `user_description`
- `status`
- `created_by`
- `created_at`

Suggested `social_post_variants` fields:

- `id`
- `post_id`
- `platform`
- `caption`
- `hashtags`
- `character_count`
- `warnings`
- `approval_status`

Suggested `social_publish_jobs` fields:

- `id`
- `post_variant_id`
- `platform`
- `scheduled_for`
- `published_at`
- `external_post_id`
- `status`
- `error`

### AI Caption Flow

1. User uploads media to Supabase Storage.
2. Backend derives dimensions, mime type, and public URL.
3. Vision-capable AI analyzes the media.
4. AI creates a concise structured media summary.
5. AI generates platform-specific captions.
6. AI validates each caption against platform rules.
7. User edits and approves.
8. n8n or backend publishes.

Platform-specific rules should be prompt-encoded:

- Instagram: visual-first, hashtags allowed, caption up to platform limit.
- Facebook: conversational, community-oriented.
- LinkedIn: professional, business outcome focused.
- X: concise, 280-character limit, link cost warning if applicable.

### Caption Enhancement

If the user provides a description:

- Preserve user intent.
- Improve clarity, tone, and platform fit.
- Generate variants per platform.
- Never invent factual claims about the business, product, pricing, certifications, or customer results.

### Posting APIs

Instagram:

- Use Graph API content publishing.
- Flow: create media container, poll until `FINISHED`, publish.
- Media must be available via public HTTPS URL.

Facebook Page:

- Use Graph API Page publishing endpoints.
- Reuse Meta credential storage where possible.

LinkedIn:

- Personal posting can use `w_member_social`.
- Organization posting requires `w_organization_social` and LinkedIn approval.
- Images/videos require upload first, then post referencing media URN.

X:

- Upload media first, then create post.
- Treat as optional because posting and URL posts are paid.

## Workstream 4: AI Image Generation

### Scope

Add an alternative create-post flow:

- User gives a prompt.
- User may provide an example post or reference image.
- Backend silently enhances the prompt.
- Image model generates media.
- Generated media enters the same Social Media Publishing Studio flow.

### Backend Prompt Enhancement

The user should not see the enhanced prompt by default.

Pipeline:

1. User submits raw prompt and optional example/reference.
2. Prompt-engineer agent rewrites it into a detailed image prompt.
3. Moderation/safety checks run.
4. Image model generates one or more images.
5. Generated images are stored in Supabase Storage.
6. AI caption flow generates platform variants.
7. User approves posting.

Prompt enhancer rules:

- Preserve user intent.
- Add visual style, composition, lighting, camera/framing, aspect ratio, brand context, and negative constraints.
- Avoid copyrighted character/style imitation unless the user owns the assets or the request is generic.
- Avoid hidden claims about real people, certifications, awards, or business outcomes.

### Model Strategy

Use OpenAI image generation models through the existing OpenAI dependency.

Recommended mode:

- Fast/cheap drafts for ideation.
- Higher-quality generation for final assets.
- Store generation cost metadata for later billing.

## Workstream 5: Hiring Section

### Compliance Decision

Do not build LinkedIn scraping or private LinkedIn inbox/profile harvesting.

Reasons:

- LinkedIn does not provide public candidate-search APIs for general SaaS use.
- Recruiter System Connect is partner/contract gated.
- Contact details are not exposed through public LinkedIn APIs.
- Browser automation and private endpoint scraping create account-ban and legal risk.

### Compliant Product Direction

Build a hiring section around owned, consented, or vendor-contracted data:

- Applicant intake forms.
- CV/resume uploads.
- Job board applicant imports.
- ATS integrations.
- Optional approved enrichment providers with clear terms.

### Hiring Features

Hiring dashboard:

- Open roles.
- Applicant pipeline.
- Candidate ranking.
- Fit score.
- Risk/uncertainty flags.

Candidate profile sections:

- Summary
- Experience
- Education
- Projects
- Certifications
- Skills
- Contact details supplied by candidate or approved source
- AI fit analysis
- Interview questions
- Recommended next step

### Data Model

Add tables such as:

- `job_roles`
- `candidates`
- `candidate_documents`
- `candidate_experience`
- `candidate_education`
- `candidate_projects`
- `candidate_certifications`
- `candidate_scores`

Suggested `candidates` fields:

- `id`
- `team_id`
- `workspace_id`
- `role_id`
- `full_name`
- `email`
- `phone`
- `linkedin_url`
- `source`
- `consent_status`
- `summary`
- `fit_score`
- `status`
- `created_at`

### AI Candidate Analysis

1. Parse uploaded CV/resume.
2. Extract structured sections.
3. Compare candidate against business profile and job role.
4. Score fit with explanation.
5. Sort candidates by experience, education, projects, certifications, and role-specific signals.
6. Surface uncertainty when documents are incomplete.

AI must not infer protected attributes or make discriminatory recommendations.

## Workstream 6: Settings and Onboarding

Add a connected accounts/settings area for:

- Gmail
- Meta
- LinkedIn posting
- X
- OpenAI/image generation
- Storage/public media setup

Each integration should show:

- Connected status
- Account/page identifier
- Last sync
- Last error
- Required manual setup
- Disconnect/reconnect controls

Meta setup should show:

- App id configured
- Webhook URL
- Redirect URL
- Required App Review permissions
- Test mode limitations

## Workstream 7: Observability and Reliability

### Workflow Logging

Every major step should write to `workflow_logs`:

- webhook received
- tenant resolved
- noise dropped
- classification completed
- draft generated
- approval decision
- send/publish attempt
- send/publish result
- external API failure

### Durable Queues

For production reliability, introduce durable job records for:

- inbound webhook processing
- outbound reply sending
- social post publishing
- image generation
- resume parsing

Avoid losing work when n8n or an external API is temporarily unavailable.

### Idempotency

Use durable keys:

- inbound messages: `platform + message_id`
- outbound replies: `reply_draft_id + platform`
- social posts: `publish_job_id`
- image jobs: `generation_job_id`

## Workstream 8: Security and Privacy

Requirements:

- Encrypt all third-party tokens.
- Never log plaintext tokens or OAuth codes.
- Verify webhook signatures.
- Scope every query by tenant.
- Use RLS for all new tables.
- Keep service-role operations limited to trusted internal routes.
- Add rate limits to public and authenticated routes.
- Store only necessary candidate/contact data.
- Add consent tracking for hiring data.
- Respect platform messaging windows and policy constraints.

## Suggested Implementation Order

### Phase 1: Finish and Harden Meta Inbox

- Fix WhatsApp deep links to use the customer number.
- Verify Instagram/Facebook native inbox URL formats.
- Replace in-memory dedupe with durable idempotency.
- Persist or enqueue webhook payloads before returning `200`.
- Add parser tests for WhatsApp, Instagram, and Facebook payloads.
- Confirm n8n export is regenerated and imported.

### Phase 2: Outbound Meta Replies

- Add channel send adapters.
- Enforce 24-hour messaging windows.
- Add WhatsApp template fallback path.
- Route approved drafts through source-specific sender.
- Update statuses and logs.

### Phase 3: Connected Accounts UI

- Add Meta status and connect controls.
- Add platform health cards.
- Add clear setup instructions for App Review and test mode.

### Phase 4: Social Media Publishing Studio

- Add media storage and post draft tables.
- Build upload UI.
- Add AI media analysis.
- Generate platform-specific captions.
- Add approval and scheduling UI.

### Phase 5: Social Publishing Adapters

- Instagram publishing.
- Facebook Page publishing.
- LinkedIn personal posting.
- LinkedIn company posting after approval.
- Optional X posting.

### Phase 6: AI Image Generation

- Add hidden prompt enhancer.
- Add image generation jobs.
- Store generated media.
- Send generated media into the publishing studio.

### Phase 7: Hiring Section

- Add roles and candidates schema.
- Build applicant/CV intake.
- Parse resumes into structured sections.
- Score candidates against roles and business context.
- Add ranking and candidate detail UI.

### Phase 8: Production Reliability

- Add durable queues.
- Add webhook replay tools.
- Add admin diagnostics.
- Add cost tracking for AI/image/social API usage.
- Add integration-specific failure dashboards.

## Verification Plan

Run at each phase:

```bash
npm run lint
npm run build
npm run test:tenant-intake
npm run n8n:export-workflows
```

Add focused tests for:

- Meta webhook signature verification.
- Tenant route resolution.
- Normalizer output for each source.
- Conversation insert with new source values.
- External inbox URL resolution.
- AI caption validation.
- Resume parsing and candidate scoring.

Manual platform tests:

- Meta webhook GET challenge.
- Meta signed POST payload.
- WhatsApp inbound message.
- Instagram inbound DM from test user.
- Facebook Page Messenger inbound message.
- Approved outbound reply.
- Instagram/Facebook post publishing.
- LinkedIn post publishing.
- Image generation to storage.

## Major Risks

- Meta App Review can delay production access.
- Instagram/Facebook deep links may not reliably open exact threads.
- LinkedIn organization posting requires approval.
- X API costs can rise quickly.
- Image generation can become expensive without quotas.
- Hiring data has privacy and compliance risk.
- Webhook fire-and-forget forwarding can lose messages unless hardened.

## Definition of Done

The full upgrade is complete when:

- Gmail, WhatsApp, Instagram, and Facebook messages enter one inbox with correct platform indicators.
- Every inbound message receives the same noise filtering, classification, reply drafting, approval, and logging treatment.
- Approved replies can be sent through supported source channels.
- Users can upload media, get AI platform-specific captions, approve, schedule, and publish posts.
- Users can generate images through a hidden backend prompt-enhancement flow.
- Hiring works through compliant candidate/applicant data, with structured AI summaries and ranking.
- All new data is tenant-scoped, RLS-protected, observable, and recoverable.
