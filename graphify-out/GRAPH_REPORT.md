# Graph Report - Nexus-OS  (2026-07-15)

## Corpus Check
- 328 files · ~350,381 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2340 nodes · 4196 edges · 205 communities (146 shown, 59 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 98 edges (avg confidence: 0.66)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b85e9f2d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Landing Hero & 3D Scroll
- Social Posts UI & Data
- Package Dependencies
- Tenant Route Resolution
- Multi-Channel Normalizer
- Architecture Docs & Workflows
- Gmail OAuth Callback
- Marketing Pages
- Signup Wizard
- TypeScript Config
- Auth & Login Flow
- n8n Internal Ingest APIs
- Meta Webhook & Tenant Ledger
- Pricing & Plans
- n8n Workflow Export Builder
- API Security Limits
- Signup Backend Migrations
- Meta OAuth APIs
- Layout & Sidebar Components
- Tenant Onboarding Migrations
- Tenant API Context & Types
- Chat Analyst Agent
- Dashboard Texture Canvas
- Core Schema Migrations
- Team Invites
- Approval Queue Page
- Inbox & Deep Links
- API Security Core
- Posts Workspace Components
- shadcn Components Config
- Page
- Supabase Auth Email Config
- page.tsx
- Route
- Dashboarddata
- Route
- Appshell
- Webhooks
- Chat Analyst.Test
- 20260526044701 Workspace Scope Ops
- Tenantscope
- Layout
- Package
- Api
- Workflow 2 Classification
- Workflow 3 Agent
- Fetchers
- Workflow 4 Buy Back Report
- Logo
- Noise Filter
- Inbound Events Idempotency.Test
- 2
- 0001 Initial Schema
- Badge
- 1
- 6
- Launch Workspace Rpc.Test
- 0002 Demo Api Policies
- 20260619120000 Meta Unified Inbox Founda
- 20260705120000 Chat History
- Userealtimedata
- handler.ts
- 3
- 5
- Member4 Classification Tests
- Test Buy Back Report
- 4
- Check Signup Backend
- 0004 Gmail Product Alignment
- 20260620120000 Inbound Events Idempotenc
- Middleware
- Seed Demo Inbox
- Smoke Classification Openai
- Readme
- .Eslintrc
- 20260618120000 Gmail Oauth Credentials
- Page
- Page
- Conversations Query
- 0003 Wf3 Revenue Rescue Fields
- Buy Back Report Prompt
- Package
- Package
- Package
- Package
- Package
- Package
- Next.Config
- Package
- Package
- Package
- Package
- Package
- Package
- Package
- Package
- Package
- Postcss.Config
- Readme
- 0002 Conversations Ai Classification Col
- 0005 Conversations Updated At
- 0005 Remove Whatsapp From Conversations 
- 0011 Remove Demo Mode
- 0012 Business Profiles Integration Routi
- Tailwind.Config
- Claude
- Attribution
- Seed Demo Data
- Verify Launch Workspace Overloads
- Test Results — Classification Prompt v1
- Getting Started
- Usage
- Development Guide
- package.json
- Features
- Deployment
- Architecture
- autoprefixer
- send_e2e.integration.ts
- supabase
- wf2_tenant_contract.test.ts
- approval-policy.ts
- StepWorkspace.tsx
- meta_send.test.ts
- Additive Numbered Migrations
- Approval-Gated Outbound Policy
- Read-Only Chat Agent
- No Fine-Tuning Principle
- Single pgvector Store in Supabase
- Tenant Isolation Everywhere
- Classification Prompt v1 Test Results (5/5 PASS)
- Workstream 4: AI Image Generation (Hidden Prompt Enhancer)
- Durable Idempotency & Queues Requirement
- Workstream 5: Compliant Hiring Section
- Gmail Add-on / Metadata-First Flow
- Google Restricted Scope Problem (gmail.readonly)
- n8n Validation Warning Impact Classification
- Meta Webhook (/api/meta/webhook)
- Tenant Route Resolution Order
- Chat Agent v1 (Structured-Data, Read-Only)
- Core Pipeline (Deterministic Functions + Approval Gate)
- Edge Tenant Resolution
- 60-90 Day Historical Backfill on Connect
- Durable inbound_events Ledger + Idempotency
- Knowledge Layer (pgvector embeddings) — Deferred
- Five-Stage Pipeline (Intake to Sync)
- Founder Approval Queue
- Gmail IMAP Integration
- Multi-Tenant Architecture (teams/workspaces)
- Zero-Cost Noise Filter
- Nexus OS Revenue Command Center
- WF0a Gmail Intake Workflow
- WF3 Reply Agent Workflow
- visuals.ts
- n8n workflow exports
- StepDone.tsx
- 20260713160000_restore_workflow_logs.sql
- supabase
- typescript
- framer-motion
- lenis
- next
- next-themes
- openai
- react-dom
- @react-three/drei
- @react-three/fiber
- Nexus OS — Launch-Readiness Report (2026-07-15)
- route.ts
- 20260714210000_business_profiles_settings_fields.sql
- rate_limit_durable.test.ts
- Manual actions — what the founder/operator must do by hand
- match_embeddings_route.test.ts
- chat_prompt_injection.test.ts
- 20260715140000_durable_rate_limit.sql
- autoprefixer
- 20260715150000_workspace_ai_settings.sql
- 20260715160000_reply_drafts_provider_message_id.sql

## God Nodes (most connected - your core abstractions)
1. `cn()` - 92 edges
2. `rateLimit()` - 55 edges
3. `readJsonObjectWithLimit()` - 44 edges
4. `scripts` - 42 edges
5. `requireApiTenantContext()` - 40 edges
6. `createServerClient()` - 39 edges
7. `createSupabaseBrowserClient()` - 39 edges
8. `requireN8nToken()` - 29 edges
9. `jsonError()` - 27 edges
10. `authenticatedFetch()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `GET()` --calls--> `requireApiTenantContext()`  [EXTRACTED]
  app/api/conversations/[id]/route.ts → lib/api-security.ts
- `POST()` --indirect_call--> `err()`  [INFERRED]
  app/api/conversations/route.ts → lib/channel-sender.ts
- `testImap()` --indirect_call--> `err()`  [INFERRED]
  app/api/gmail/test-imap/route.ts → lib/channel-sender.ts
- `GET()` --calls--> `requireApiTenantContext()`  [EXTRACTED]
  app/api/meta/status/route.ts → lib/api-security.ts
- `GET()` --calls--> `requireApiTenantContext()`  [EXTRACTED]
  app/api/metrics/route.ts → lib/api-security.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Nexus OS Core Message Pipeline (Intake → Approval)** — readme_wf0a_gmail_intake, readme_noise_filter, readme_wf2_ai_classification, readme_wf3_reply_agent, readme_founder_approval_queue [EXTRACTED 1.00]
- **Tenant Safety Model (RLS + Approval Gate + Isolation)** — claude_tenant_isolation, claude_approval_gate_policy, readme_supabase_rls, readme_multi_tenant_architecture [INFERRED 0.85]
- **Gmail Integration Lifecycle (OAuth/IMAP → Testing → Add-on Pivot)** — readme_gmail_imap_integration, docs_gmail_integration_test_results_gmail_integration_test_results, docs_gmail_validation_warnings_classification_warning_impact_classification, docs_gmail_new_implementation_gmail_addon_flow [INFERRED 0.85]

## Communities (205 total, 59 thin omitted)

### Community 0 - "Landing Hero & 3D Scroll"
Cohesion: 0.29
Nodes (18): HINGE_POINT, MacbookModel(), MacbookModelProps, SCREEN_OFF, SCREEN_ON, toSpaceBlack(), computeDashboardReveal(), computeLidOpen() (+10 more)

### Community 1 - "Social Posts UI & Data"
Cohesion: 0.10
Nodes (35): BrandAssetPicker(), BrandAssetPickerProps, BrandAssetThumb(), CaptionSection(), CaptionSectionProps, CreateWithAiPathProps, CurrentGen, PostStatusBoardProps (+27 more)

### Community 2 - "Package Dependencies"
Cohesion: 0.05
Nodes (42): scripts, build, check:auth-email, check:signup-backend, dev, fix:auth-email, lint, n8n:export-workflows (+34 more)

### Community 3 - "Tenant Route Resolution"
Cohesion: 0.06
Nodes (39): buildLookupPath(), buildLookupUrl(), isUuid(), requireTeamId(), detectMetaMessagingPlatformFromBody(), extractBearerFromHeaders(), extractFacebookPageId(), extractGmailDestinationMailbox() (+31 more)

### Community 4 - "Multi-Channel Normalizer"
Cohesion: 0.08
Nodes (39): attachTenant(), detectMetaMessagingPlatform(), detectSource(), isUuid(), looksLikeMetaMessaging(), looksLikeMetaWhatsapp(), metaMessagingObject(), normalizeItem() (+31 more)

### Community 5 - "Architecture Docs & Workflows"
Cohesion: 0.67
Nodes (3): Classification Prompt (GPT-4o), Reply Generation Prompt (GPT-4o), WF2 AI Classification Workflow

### Community 6 - "Gmail OAuth Callback"
Cohesion: 0.10
Nodes (33): absoluteRedirect(), defaultGmailCallbackDeps, errorRedirect(), GmailCallbackDeps, GoogleTokenResponse, GoogleUserInfo, handleGmailOAuthCallback(), logStageError() (+25 more)

### Community 7 - "Marketing Pages"
Cohesion: 0.09
Nodes (17): caseStudies, CaseStudy, logos, stats, styleScript, testimonials, changelog, faqs (+9 more)

### Community 8 - "Signup Wizard"
Cohesion: 0.11
Nodes (26): POST(), defaultGmailSyncDeps, GmailSyncDeps, runGmailSync(), SyncCredentialRow, WorkspaceSyncOutcome, POST(), decodeBase64Url() (+18 more)

### Community 9 - "TypeScript Config"
Cohesion: 0.06
Nodes (32): ./*, **/* 2.ts, **/* 2.tsx, dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts (+24 more)

### Community 10 - "Auth & Login Flow"
Cohesion: 0.13
Nodes (7): credResult, fakeClient, GmailSendError, moduleWithLoad, Row, SeedOpts, store

### Community 11 - "n8n Internal Ingest APIs"
Cohesion: 0.32
Nodes (6): assert(), ids, insert(), main(), supabase, WEBHOOK_BASE

### Community 12 - "Meta Webhook & Tenant Ledger"
Cohesion: 0.09
Nodes (37): clampInt(), POST(), ExtractedMessage, extractMessages(), verifyMetaSignature(), WebhookPlatform, GET(), POST() (+29 more)

### Community 13 - "Pricing & Plans"
Cohesion: 0.12
Nodes (19): BillingToggle(), BillingToggleProps, PricingFAQ(), PricingTierCard(), PricingTierCardProps, PricingCard(), PricingCardProps, planTitle() (+11 more)

### Community 14 - "n8n Workflow Export Builder"
Cohesion: 0.07
Nodes (22): connGmail, dedupDecision, dedupLookupQuery, emailTrigger, fs, gmailWebhook, ifKeepNode(), n8nLogic (+14 more)

### Community 15 - "API Security Limits"
Cohesion: 0.14
Nodes (19): churnDraftTag(), DashboardPage(), hotLeadDraftTag(), isDraftPipelineReady(), TIMESERIES_RANGES, urgencyBadgeLabel(), ZERO_METRICS, formatAxisValue() (+11 more)

### Community 16 - "Signup Backend Migrations"
Cohesion: 0.09
Nodes (25): on_auth_user_created, private.current_team_id(), public.business_profiles, public.conversations, public.daily_reports, public.followups, public.gmail_credentials, public.invitations (+17 more)

### Community 17 - "Meta OAuth APIs"
Cohesion: 0.07
Nodes (48): errorRedirect(), exchangeCodeForToken(), exchangeLongLivedToken(), fetchPageAccounts(), fetchWaPhoneNumberId(), GET(), MetaPageAccount, MetaPagesResponse (+40 more)

### Community 18 - "Layout & Sidebar Components"
Cohesion: 0.10
Nodes (24): appNav, isNavActive(), SidebarBrand(), SidebarChrome(), SidebarFooter(), SidebarHeader(), SidebarNav(), SettingsSection() (+16 more)

### Community 19 - "Tenant Onboarding Migrations"
Cohesion: 0.10
Nodes (22): public.business_profiles, public.conversations, public.daily_reports, public.followups, public.gmail_credentials, public.invitations, public.is_workspace_member(), public.is_workspace_owner() (+14 more)

### Community 20 - "Tenant API Context & Types"
Cohesion: 0.10
Nodes (25): GET(), RouteContext, GET(), APPROVAL_STATUSES, GET(), isRelationshipEmbedError(), mapRowsToReplyDraftWithConversation(), ReplyDraftRow (+17 more)

### Community 21 - "Chat Analyst Agent"
Cohesion: 0.06
Nodes (51): POST(), safeFileName(), MessageRow, sessionTitle(), summarizeSession(), aggregateSnapshot(), AnalystContext, AnalystSnapshot (+43 more)

### Community 22 - "Dashboard Texture Canvas"
Cohesion: 0.28
Nodes (7): readSessionContext(), TenantScopeContext, TenantScopeGate(), TenantScopeValue, TenantSessionContext, useTenantQueryTeamId(), useTenantScope()

### Community 23 - "Core Schema Migrations"
Cohesion: 0.17
Nodes (22): on_auth_user_created, public.gmail_credentials, public.handle_new_user(), public.is_workspace_member(), public.is_workspace_owner(), public.profiles, public.subscriptions, public.teams (+14 more)

### Community 24 - "Team Invites"
Cohesion: 0.14
Nodes (17): StepGmail(), StepWorkspace(), CopyLinkButton(), InviteManager(), STATUS_STYLES, StatusPill(), useOrganization(), buildInviteLink() (+9 more)

### Community 25 - "Approval Queue Page"
Cohesion: 0.15
Nodes (17): ApprovalFilter, ApprovalPage(), DraftItem, fallbackConversation(), FILTERS, intentLabel(), mergeDraftsWithConversations(), MiniCard() (+9 more)

### Community 26 - "Inbox & Deep Links"
Cohesion: 0.19
Nodes (16): InboxPageContent(), INTENT_OPTIONS, intentBadgeLabel(), IntentFilter, sourceIcon(), sourceLabel(), timelineCompletion(), URGENCY_OPTIONS (+8 more)

### Community 27 - "API Security Core"
Cohesion: 0.11
Nodes (34): GET(), UsageRow, ApprovalBody, approvalWebhookUrl(), PATCH(), GET(), DELETE(), GET() (+26 more)

### Community 28 - "Posts Workspace Components"
Cohesion: 0.23
Nodes (22): CHART_POINTS, Ctx, DASHBOARD_TEXTURE_SIZE, drawChart(), drawChrome(), drawDashboardTexture(), drawFinish(), drawHeader() (+14 more)

### Community 29 - "shadcn Components Config"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 30 - "Page"
Cohesion: 0.11
Nodes (31): ChatUsageToolbar(), formatTokens(), VisualToggle(), META_LABELS, planPricingCopy(), planTitle(), SettingsView(), StatusPill() (+23 more)

### Community 31 - "Supabase Auth Email Config"
Cohesion: 0.31
Nodes (16): analyzeConfig(), buildPatchPayload(), check(), expectedRedirects(), main(), managementRequest(), normalizeOrigin(), parseBoolEnv() (+8 more)

### Community 32 - "page.tsx"
Cohesion: 0.09
Nodes (23): isValidEmail(), normalizeEmail(), POST(), GET(), isRateLimitError(), AuthLikeError, isRateLimitError(), LoginForm() (+15 more)

### Community 33 - "Route"
Cohesion: 0.15
Nodes (16): actionTaken(), AiUsageCard(), csvEscape(), formatReportDate(), formatTokens(), isSameReportDay(), labelize(), ReportPage() (+8 more)

### Community 34 - "Dashboarddata"
Cohesion: 0.14
Nodes (10): ConversationRow, DailyReportRow, DashboardSnapshot, emptyDashboardSnapshot, errorMessages(), fetchDashboardSnapshot(), FollowupRow, LeadRow (+2 more)

### Community 35 - "Route"
Cohesion: 0.17
Nodes (19): isValidEmail(), normalizeEmail(), POST(), ExistingUser, findUserByEmail(), isLocalHostname(), isLocalRequest(), isValidEmail() (+11 more)

### Community 36 - "Appshell"
Cohesion: 0.22
Nodes (15): AmbientBackground(), HeroSequence(), HeroSequenceAnimated(), MacbookScene, useCanUse3D(), usePinnedScrollProgress(), clamp01(), computeCommsReveal() (+7 more)

### Community 37 - "Webhooks"
Cohesion: 0.09
Nodes (30): Composer(), ComposerProps, Step, CreateWithAiPath(), captionExcerpt(), PostCard(), Filter, PostStatusBoard() (+22 more)

### Community 38 - "Chat Analyst.Test"
Cohesion: 0.14
Nodes (5): fakeTokens, Filter, moduleWithLoad, Row, Store

### Community 39 - "20260526044701 Workspace Scope Ops"
Cohesion: 0.15
Nodes (12): public.business_profiles, public.conversations, public.daily_reports, public.followups, public.gmail_credentials, public.leads, public.reply_drafts, public.subscriptions (+4 more)

### Community 40 - "Tenantscope"
Cohesion: 0.22
Nodes (8): approveReply(), errorFromResponse(), normalizeWebhookPath(), parseJsonSafe(), rejectReply(), requestJson(), resolveFetchUrl(), sendWebhook()

### Community 41 - "Layout"
Cohesion: 0.04
Nodes (47): AI Candidate Analysis, AI Caption Flow, Approval Flow, Backend Prompt Enhancement, Caption Enhancement, Channel Rules, Compliance Decision, Compliant Product Direction (+39 more)

### Community 42 - "Package"
Cohesion: 0.05
Nodes (43): clsx, date-fns, dotenv, framer-motion, imap, lucide-react, next, next-themes (+35 more)

### Community 43 - "Api"
Cohesion: 0.17
Nodes (5): CARD_LAYOUT, CardShell(), CommsCards(), CommsCardsProps, CommsCardsStatic()

### Community 44 - "Workflow 2 Classification"
Cohesion: 0.19
Nodes (10): fs, getApiKey(), getClassificationPromptBasename(), getModel(), items, loadClassificationSystemPrompt(), openaiJsonChat(), out (+2 more)

### Community 45 - "Workflow 3 Agent"
Cohesion: 0.20
Nodes (12): buildUserPayload(), enrichClassificationForReply(), fs, getApiKey(), getModel(), items, loadReplySystemPrompt(), normalizeClassification() (+4 more)

### Community 46 - "Fetchers"
Cohesion: 0.05
Nodes (44): geistMono, geistSans, inter, metadata, sourceSans3, AuthGuard(), AuthGuardContext, AuthGuardContextValue (+36 more)

### Community 47 - "Workflow 4 Buy Back Report"
Cohesion: 0.24
Nodes (9): fs, getApiKey(), getModel(), items, loadReportSystemPrompt(), openaiMarkdownReport(), out, path (+1 more)

### Community 48 - "Logo"
Cohesion: 0.27
Nodes (11): Brand Color Palette (Navy #1e3768 / Green #a1cc3a), Green Spark Burst Accent, N-Shaped Growth Arrow Mark, Navy Blue + Green Accent Palette, Nexus OS Brand Identity, Nexus OS Brand Identity, Nexus OS Logo, NEXUS OS Wordmark Text (+3 more)

### Community 49 - "Noise Filter"
Cohesion: 0.36
Nodes (9): AUTOMATED_LOCAL, drop(), evaluateNoiseFilter(), hasQuestion(), keep(), normBody(), PLEASANTRY, SPAM_LEX (+1 more)

### Community 50 - "Inbound Events Idempotency.Test"
Cohesion: 0.22
Nodes (6): fakeClient, moduleWithLoad, post(), Row, sign(), store

### Community 51 - "2"
Cohesion: 0.36
Nodes (9): Analytics / Metrics Output, Approved / Checkmark Output, Chat Message Input Channel, Contact / Person Input, Email Input Channel, Flagged / Escalation Output, Funnel / Filtering Stage, Multi-Channel Message Funnel Diagram (+1 more)

### Community 52 - "0001 Initial Schema"
Cohesion: 0.56
Nodes (8): public.business_profiles, public.conversations, public.daily_reports, public.followups, public.leads, public.reply_drafts, public.teams, public.workflow_logs

### Community 53 - "Badge"
Cohesion: 0.29
Nodes (7): Badge(), BadgeProps, fallback, intentColors, statusColors, stylesForVariant(), urgencyColors

### Community 54 - "1"
Cohesion: 0.36
Nodes (8): AI-Powered Message Analysis, AI Revenue Insight Icon, Chat Message Bubble, Dollar Coin, Flat Indigo Icon Style, Magnifying Glass with AI Sparkle, Nexus OS Brand Mark, Revenue from Conversations

### Community 55 - "6"
Cohesion: 0.43
Nodes (8): Circular Flywheel Connecting Icons, Customer (Person Icon), Growth Cycle Line-Art Illustration, Loyalty / Engagement (Heart Icon), Marketing / Landing Page Asset (Coral Line-Art Style), Revenue (Dollar Sign Icon), Customers, Revenue and Loyalty Drive Compounding Growth, Rising Bar Chart with Upward Arrow

### Community 56 - "Launch Workspace Rpc.Test"
Cohesion: 0.25
Nodes (6): canonicalMigration, __dirname, guardMigration, onboarding, root, stepWorkspace

### Community 57 - "0002 Demo Api Policies"
Cohesion: 0.25
Nodes (7): public.business_profiles, public.conversations, public.daily_reports, public.followups, public.leads, public.reply_drafts, public.workflow_logs

### Community 58 - "20260619120000 Meta Unified Inbox Founda"
Cohesion: 0.32
Nodes (7): public.business_profiles, public.conversations, public.handle_meta_credentials_updated_at(), public.meta_credentials, public.trg_meta_credentials_set_team_from_workspace(), trg_meta_credentials_set_team_from_workspace, trg_meta_credentials_updated_at

### Community 59 - "20260705120000 Chat History"
Cohesion: 0.39
Nodes (7): public.chat_messages, public.chat_sessions, public.handle_chat_sessions_updated_at(), public.trg_chat_set_team_from_workspace(), trg_chat_messages_set_team_from_workspace, trg_chat_sessions_set_team_from_workspace, trg_chat_sessions_updated_at

### Community 60 - "Userealtimedata"
Cohesion: 0.48
Nodes (5): CommandCenter(), RealtimeConversation, RealtimeLead, useRealtimeConversations(), useRealtimeLeads()

### Community 61 - "handler.ts"
Cohesion: 0.22
Nodes (8): CAMERA_PRESENTATION, CAMERA_PRODUCT, CAMERA_START, CameraRig(), LOOK_AT_PRESENTATION, LOOK_AT_PRODUCT, LOOK_AT_START, MacbookSceneProps

### Community 62 - "3"
Cohesion: 0.43
Nodes (7): Customer Message Bubble with Heart Reaction, Lifebuoy / Safety Net Motif, Lifebuoy Warning Icon Illustration, Marketing / Feature Section Icon Purpose, Purple Monoline Icon Style, Risk-Gated Customer Support / Churn-Risk Safeguard, Warning / Alert Triangle

### Community 63 - "5"
Cohesion: 0.52
Nodes (7): Automated Process Cycle Icon, Bar Chart / Results Analytics, Continuous Feedback Loop, Gear with Checkmark (Automated Processing / Approval), Task Checklist Document, User / Person, Icon Depicts User-Driven Workflow Automation Producing Measurable Results

### Community 64 - "Member4 Classification Tests"
Cohesion: 0.38
Nodes (6): classify(), fs, loadEnvLocal(), main(), path, TESTS

### Community 65 - "Test Buy Back Report"
Cohesion: 0.29
Nodes (5): client, demoMetrics, __dirname, reportPrompt, root

### Community 66 - "4"
Cohesion: 0.47
Nodes (6): Founder Approval Queue Feature, Browser Window with Chat Message, Checkmark Confirmation, Hand Cursor Click Action, Blue Line-Art Marketing Illustration Style, Message Approval Icon

### Community 67 - "Check Signup Backend"
Cohesion: 0.40
Nodes (5): { createClient }, fail(), main(), REQUIRED_COLUMNS, REQUIRED_RPC_PATHS

### Community 68 - "0004 Gmail Product Alignment"
Cohesion: 0.33
Nodes (5): public.conversations, public.daily_reports, public.followups, public.reply_drafts, public.workflow_logs

### Community 69 - "20260620120000 Inbound Events Idempotenc"
Cohesion: 0.47
Nodes (5): public.handle_inbound_events_updated_at(), public.inbound_events, public.trg_inbound_events_set_team_from_workspace(), trg_inbound_events_set_team_from_workspace, trg_inbound_events_updated_at

### Community 70 - "Middleware"
Cohesion: 0.60
Nodes (4): config, isProtectedPath(), middleware(), PROTECTED_PREFIXES

### Community 71 - "Seed Demo Inbox"
Cohesion: 0.10
Nodes (30): CredentialRow, GET(), MetaDebugTokenResponse, refreshPageAccessToken(), tokenNeedsRefresh(), decryptSecret(), deriveKey(), encryptSecret() (+22 more)

### Community 72 - "Smoke Classification Openai"
Cohesion: 0.50
Nodes (4): fs, loadEnvLocal(), main(), path

### Community 74 - ".Eslintrc"
Cohesion: 0.50
Nodes (3): extends, next/core-web-vitals, next/typescript

### Community 75 - "20260618120000 Gmail Oauth Credentials"
Cohesion: 0.67
Nodes (3): public.gmail_credentials, public.handle_gmail_credentials_updated_at(), trg_gmail_credentials_updated_at

### Community 87 - "Package"
Cohesion: 0.10
Nodes (19): 10. How to re-run (manual), 1. Preflight, 2. TC1 — New lead (webhook / Gmail-shaped payload), 3. TC2 — Real Gmail / IMAP, 4. TC3 — Existing lead append, 5. TC4 — Noise drop (short pleasantry), 6. TC5 — Edge payload (HTML-only + bare `from` email), 7. Post–Gmail Warning Fix verification (2026-05-16) (+11 more)

### Community 88 - "Package"
Cohesion: 0.06
Nodes (41): RFC-822, ApprovalMode, AutoSendDecision, AutoSendInput, decideAutoSend(), num(), AutopilotInput, BusinessProfileRow (+33 more)

### Community 89 - "Package"
Cohesion: 0.20
Nodes (4): forwards, moduleWithLoad, Row, store

### Community 90 - "Package"
Cohesion: 0.13
Nodes (14): API Shape, Data Model, Flow, Gmail Implementation Note, Goals, n8n Compatibility, New Gmail Implementation, Problem With The Last Implementation (+6 more)

### Community 91 - "Package"
Cohesion: 0.08
Nodes (25): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, postcss, supabase, tailwindcss (+17 more)

### Community 92 - "Package"
Cohesion: 0.14
Nodes (8): CredResult, fakeClient, GmailSendError, moduleWithLoad, resetStore(), Row, seed(), store

### Community 94 - "Package"
Cohesion: 0.05
Nodes (34): Autopilot entry point (task 1.5), Channel Sender — Approval-to-Send Contract, Components, Credential selection, Executor request contract, Flow, Follow-ups (not in 1.2), Idempotency (hard requirement — approving twice must not send twice) (+26 more)

### Community 95 - "Package"
Cohesion: 0.09
Nodes (20): 1. Target architecture (corrected), 2. Current build state (grounded in code), 3. Key tables (grep migrations to confirm columns; do not assume), 4. Build order (functions track — owned by Senuka), 5. Decisions & known deferrals (do not re-litigate without reason), Core pipeline (deterministic functions + one approval gate), Cross-cutting (applies to everything), Deferred (do not start yet) (+12 more)

### Community 96 - "Package"
Cohesion: 0.12
Nodes (24): hasSignupProgress(), SignupPage(), STEP_FROM_PARAM, STEP_LABELS, stepFromParam(), planLabel(), StepDone(), StepDoneProps (+16 more)

### Community 97 - "Package"
Cohesion: 0.16
Nodes (32): boundedString(), optionalTokenCount(), POST(), POST(), boundedString(), CONVERSATION_SOURCES, pickAllowed(), POST() (+24 more)

### Community 98 - "Package"
Cohesion: 0.13
Nodes (15): Acknowledgments, Architecture, Contact & Support, Contributing, How It Works, Multi-tenant data model, Nexus OS — Revenue Command Center, Performance & Metrics (+7 more)

### Community 99 - "Package"
Cohesion: 0.20
Nodes (9): CLAUDE.md — Nexus OS Engineering Guide, Conventions, How to report back (every task), Non-negotiable architecture principles, ⚠️ Repo hazard — duplicate files from iCloud sync, Repo map (canonical locations), Verify before you call it done, What Nexus OS is (+1 more)

### Community 100 - "Package"
Cohesion: 0.28
Nodes (7): assert(), forwards, moduleWithLoad, post(), Row, run(), store

### Community 101 - "Package"
Cohesion: 0.32
Nodes (7): CredRow, fakeSupabase(), GOOD_CRED, MESSAGE, moduleWithLoad, ok(), run()

### Community 102 - "Package"
Cohesion: 0.20
Nodes (6): Channel Sender — Approval Trigger + WF3 Autopilot (calls into the Next.js app), n8n environment variables, Next.js internal ingest (`/api/internal/n8n/*`), Supabase credential, Tenant routing (WF0a export), WF8b Social Post Publishing (calls into the Next.js app)

### Community 104 - "Readme"
Cohesion: 0.25
Nodes (8): Configuration, Email confirmation auto-login, `.env.local` reference, n8n environment (tenant routing), OpenAI, Supabase Auth email delivery, Supabase Auth rate limits, Supabase RLS

### Community 119 - "Seed Demo Data"
Cohesion: 0.20
Nodes (7): chartPoints, DashboardPreview(), feed, metrics, nav, NavItem, urgencyStyles

### Community 120 - "Verify Launch Workspace Overloads"
Cohesion: 0.13
Nodes (25): GET(), buildDailyTimeseries(), contributesRevenueAtRisk(), ConversationTimeseriesRow, downsampleWeekly(), emptyBucket(), isChurnRisk(), isHotLead() (+17 more)

### Community 129 - "Test Results — Classification Prompt v1"
Cohesion: 0.25
Nodes (8): Handoff (Member 2), Summary, Test 1 — pricing / quote request, Test 2 — booking / schedule call, Test 3 — proposal follow-up, Test 4 — complaint / churn tone, Test 5 — support / CMS how-to, Test Results — Classification Prompt v1

### Community 130 - "Getting Started"
Cohesion: 0.25
Nodes (8): 1. Clone and install, 2. Environment variables, 3. Supabase database, 4. n8n workflows, 5. Run locally, Getting Started, Prerequisites, Troubleshooting

### Community 131 - "Usage"
Cohesion: 0.33
Nodes (6): Admin: approval queue, API & webhooks, Dashboard, Meta unified inbox, Quick start: first classified message, Usage

### Community 132 - "Development Guide"
Cohesion: 0.40
Nodes (5): Conventions, Development Guide, Extend the pipeline, Scripts, Testing approach

### Community 133 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 134 - "Features"
Cohesion: 0.33
Nodes (6): 🛡️ Customer Retention, Features, 🧠 Knowledge Layer & Revenue Analyst *(new)*, ⚙️ Operational Efficiency, 💰 Revenue Protection, 📣 Social & Channels

### Community 135 - "Deployment"
Cohesion: 0.50
Nodes (4): Deployment, Production checklist, Recommended hosting, Scaling notes

### Community 136 - "Architecture"
Cohesion: 0.26
Nodes (14): boundedConfidence(), boundedNonNegativeNumber(), boundedRiskScore(), boundedString(), CONVERSATION_INTENTS, CONVERSATION_SOURCES, CONVERSATION_STATUSES, CONVERSATION_URGENCIES (+6 more)

### Community 137 - "autoprefixer"
Cohesion: 0.33
Nodes (4): DocLink, DocSection, quickStart, sections

### Community 138 - "send_e2e.integration.ts"
Cohesion: 0.25
Nodes (12): autopilotSend(), err(), executeSendReply(), assert(), fetchConversation(), fetchDraft(), ids, insert() (+4 more)

### Community 140 - "supabase"
Cohesion: 0.29
Nodes (4): fakeClient, moduleWithLoad, Row, store

### Community 141 - "wf2_tenant_contract.test.ts"
Cohesion: 0.07
Nodes (28): assert(), authHeader, buildReq, classify, Conn, conns, createBody, createFollowup (+20 more)

### Community 142 - "approval-policy.ts"
Cohesion: 0.29
Nodes (4): fakeClient, moduleWithLoad, Row, store

### Community 143 - "StepWorkspace.tsx"
Cohesion: 0.29
Nodes (6): 1. Remote-only migrations pulled into the repo (verbatim), 2. Local-only files — SUPERSEDED, do NOT apply, 3. Minor observation (for the human, not acted on), 4. Task 4.3 — social credential encryption (2026-07-13), Migration notes — drift sync (Task 3.1, Member 3), Purpose

### Community 144 - "meta_send.test.ts"
Cohesion: 0.13
Nodes (9): fakeClient, FetchCall, fetchCalls, fetchResponse, GmailSendError, metaCredResult, moduleWithLoad, Row (+1 more)

### Community 174 - "visuals.ts"
Cohesion: 0.12
Nodes (20): AssistantBody(), BarChart(), ChartBlock(), DONUT_COLORS, DonutChart(), formatValue(), LineChart(), niceMax() (+12 more)

### Community 176 - "StepDone.tsx"
Cohesion: 0.29
Nodes (7): public.business_documents, public.business_profiles, public.embeddings, public.match_embeddings(), trg_business_documents_set_team_from_workspace, trg_business_documents_updated_at, trg_embeddings_set_team_from_workspace

### Community 179 - "supabase"
Cohesion: 0.80
Nodes (4): assert(), liveGmailSmoke(), run(), runScript()

### Community 182 - "lenis"
Cohesion: 0.83
Nodes (3): public.brand_assets, public.post_generations, public.social_posts

### Community 183 - "next"
Cohesion: 0.67
Nodes (3): public.gmail_backfill_jobs, public.handle_gmail_backfill_jobs_updated_at(), trg_gmail_backfill_jobs_updated_at

### Community 193 - "Nexus OS — Launch-Readiness Report (2026-07-15)"
Cohesion: 0.20
Nodes (9): A. Security audit, B. Vector DB & RAG pipeline, C. Project review, D. Repo cleanup (done in this pass), Fixed in this pass (app code — verified by lint, build, and OAuth-state tests), Nexus OS — Launch-Readiness Report (2026-07-15), Reported — recommended, NOT changed (database / architecture), Verdict: CONDITIONAL GO (+1 more)

### Community 194 - "route.ts"
Cohesion: 0.29
Nodes (7): ChatMessage, ChatPage(), ChatRole, decodeSourcesHeader(), KnowledgeSource, SOURCE_KIND_LABEL, SUGGESTIONS

### Community 195 - "20260714210000_business_profiles_settings_fields.sql"
Cohesion: 0.50
Nodes (3): public.business_profiles, public.gmail_credentials, public.meta_credentials

### Community 197 - "rate_limit_durable.test.ts"
Cohesion: 0.22
Nodes (5): fakeClient, moduleWithLoad, RpcCall, rpcCalls, rpcResponse

### Community 199 - "Manual actions — what the founder/operator must do by hand"
Cohesion: 0.29
Nodes (7): 1. Environment variables (Vercel / hosting), 2. Supabase — already applied via MCP (verify only), 3. n8n (instance `knurdz3o.app.n8n.cloud`), 4. Meta — the only real blocker for outbound send, 5. Product/architecture decisions waiting on you, 6. New features shipped in this pass (nothing to do — just awareness), Manual actions — what the founder/operator must do by hand

### Community 200 - "match_embeddings_route.test.ts"
Cohesion: 0.29
Nodes (3): fakeClient, moduleWithLoad, rpcRows

## Ambiguous Edges - Review These
- `AI Revenue Insight Icon` → `Nexus OS Brand Mark`  [AMBIGUOUS]
  images/1.png · relation: semantically_similar_to
- `Lifebuoy Warning Icon Illustration` → `Risk-Gated Customer Support / Churn-Risk Safeguard`  [AMBIGUOUS]
  images/3.png · relation: conceptually_related_to

## Knowledge Gaps
- **866 isolated node(s):** `next/core-web-vitals`, `next/typescript`, `UsageRow`, `ApprovalBody`, `ExistingUser` (+861 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **59 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `AI Revenue Insight Icon` and `Nexus OS Brand Mark`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **What is the exact relationship between `Lifebuoy Warning Icon Illustration` and `Risk-Gated Customer Support / Churn-Risk Safeguard`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `cn()` connect `Layout & Sidebar Components` to `Package`, `Route`, `route.ts`, `Social Posts UI & Data`, `Webhooks`, `Api`, `Pricing & Plans`, `visuals.ts`, `API Security Limits`, `Fetchers`, `Badge`, `Team Invites`, `Approval Queue Page`, `Inbox & Deep Links`, `Page`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Package` to `package.json`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `testImap()` connect `API Security Core` to `send_e2e.integration.ts`, `Package`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **What connects `next/core-web-vitals`, `next/typescript`, `UsageRow` to the rest of the system?**
  _878 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Social Posts UI & Data` be split into smaller, more focused modules?**
  _Cohesion score 0.09830866807610994 - nodes in this community are weakly interconnected._