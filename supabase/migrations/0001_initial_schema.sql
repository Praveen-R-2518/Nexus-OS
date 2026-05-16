-- Nexus OS: full schema reset + seeds (PostgreSQL / Supabase)
-- Re-run-safe when applied manually: drops existing Nexus tables first.

--------------------------------------------------------------------------------
-- 1. Clean teardown (respect FK dependency order)
--------------------------------------------------------------------------------
drop trigger if exists reply_drafts_set_updated_at on public.reply_drafts;
drop function if exists public.nexus_set_updated_at ();

drop table if exists public.follow_ups cascade;
drop table if exists public.workflow_logs cascade;
drop table if exists public.reply_drafts cascade;
drop table if exists public.leads cascade;
drop table if exists public.daily_reports cascade;
drop table if exists public.conversations cascade;

--------------------------------------------------------------------------------
-- 2. Tables
--------------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid (),
  customer_name text,
  customer_phone text,
  customer_email text,
  channel text not null default 'whatsapp',
  message text not null,
  intent text,
  urgency text not null default 'low',
  sentiment text,
  status text not null default 'new',
  revenue_at_risk numeric(14, 2) not null default 0,
  created_at timestamptz not null default now (),
  constraint conversations_channel_check check (
    channel = any (
      array['whatsapp'::text, 'email'::text, 'instagram'::text, 'sms'::text, 'other'::text]
    )
  ),
  constraint conversations_urgency_check check (
    urgency = any (
      array['low'::text, 'medium'::text, 'high'::text, 'critical'::text]
    )
  ),
  constraint conversations_status_check check (
    status = any (
      array[
        'new'::text,
        'in_review'::text,
        'responded'::text,
        'escalated'::text,
        'closed'::text,
        'archived'::text
      ]
    )
  ),
  constraint conversations_sentiment_check check (
    sentiment is null
    or sentiment = any (
      array['positive'::text, 'neutral'::text, 'negative'::text, 'mixed'::text]
    )
  ),
  constraint conversations_revenue_at_risk_check check (revenue_at_risk >= 0::numeric)
);

create table public.leads (
  id uuid primary key default gen_random_uuid (),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  customer_name text,
  customer_phone text,
  customer_email text,
  service_interest text,
  lead_score int not null default 0,
  status text not null default 'new',
  estimated_value numeric(14, 2) not null default 0,
  created_at timestamptz not null default now (),
  constraint leads_score_check check (lead_score >= 0 and lead_score <= 100),
  constraint leads_estimated_value_check check (estimated_value >= 0::numeric),
  constraint leads_status_check check (
    status = any (
      array[
        'new'::text,
        'qualified'::text,
        'proposal_sent'::text,
        'won'::text,
        'lost'::text,
        'nurturing'::text
      ]
    )
  )
);

create table public.reply_drafts (
  id uuid primary key default gen_random_uuid (),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  draft_message text not null,
  approval_status text not null default 'pending',
  approved_by text,
  rejected_reason text,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  constraint reply_drafts_approval_status_check check (
    approval_status = any (array['pending'::text, 'approved'::text, 'rejected'::text])
  )
);

create table public.workflow_logs (
  id uuid primary key default gen_random_uuid (),
  workflow_name text not null,
  conversation_id uuid references public.conversations (id) on delete set null,
  status text not null,
  input_payload jsonb,
  output_payload jsonb,
  error_message text,
  created_at timestamptz not null default now (),
  constraint workflow_logs_status_check check (
    status = any (
      array[
        'success'::text,
        'error'::text,
        'running'::text,
        'skipped'::text,
        'retrying'::text
      ]
    )
  )
);

create table public.daily_reports (
  id uuid primary key default gen_random_uuid (),
  report_date date not null default (current_date),
  report_content text not null,
  revenue_at_risk numeric(14, 2) not null default 0,
  hot_leads_count int not null default 0,
  churn_risks_count int not null default 0,
  hours_saved numeric(10, 2) not null default 0,
  created_at timestamptz not null default now (),
  constraint daily_reports_non_negative_check check (
    revenue_at_risk >= 0::numeric
    and hot_leads_count >= 0
    and churn_risks_count >= 0
    and hours_saved >= 0::numeric
  )
);

create table public.follow_ups (
  id uuid primary key default gen_random_uuid (),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  follow_up_message text,
  scheduled_at timestamptz,
  status text not null default 'scheduled',
  created_at timestamptz not null default now (),
  constraint follow_ups_status_check check (
    status = any (
      array[
        'scheduled'::text,
        'sent'::text,
        'cancelled'::text,
        'completed'::text,
        'failed'::text
      ]
    )
  )
);

--------------------------------------------------------------------------------
-- 3. Indexes
--------------------------------------------------------------------------------
create index conversations_created_at_idx on public.conversations (created_at desc);

create index conversations_status_idx on public.conversations (status);

create index conversations_channel_idx on public.conversations (channel);

create index leads_conversation_id_idx on public.leads (conversation_id);

create index leads_status_idx on public.leads (status);

create index reply_drafts_conversation_id_idx on public.reply_drafts (conversation_id);

create index reply_drafts_approval_idx on public.reply_drafts (approval_status);

create index workflow_logs_created_at_idx on public.workflow_logs (created_at desc);

create index workflow_logs_conversation_id_idx on public.workflow_logs (conversation_id);

create index workflow_logs_workflow_name_idx on public.workflow_logs (workflow_name);

create index daily_reports_report_date_idx on public.daily_reports (report_date desc);

create index follow_ups_scheduled_at_idx on public.follow_ups (scheduled_at);

create index follow_ups_status_idx on public.follow_ups (status);

--------------------------------------------------------------------------------
-- 4. Keep reply_drafts.updated_at in sync on UPDATE
--------------------------------------------------------------------------------
create function public.nexus_set_updated_at () returns trigger language plpgsql as $$
begin
  new.updated_at = now ();
  return new;
end;
$$;

create trigger reply_drafts_set_updated_at before
update on public.reply_drafts for each row
execute function public.nexus_set_updated_at ();

--------------------------------------------------------------------------------
-- 5. Seed data — stable UUIDs for relational inserts
--------------------------------------------------------------------------------
insert into public.conversations (
    id,
    customer_name,
    customer_phone,
    customer_email,
    channel,
    message,
    intent,
    urgency,
    sentiment,
    status,
    revenue_at_risk
  )
values (
    'a1000000-0000-4000-8000-000000000001',
    'Nimal Perera',
    '+94771234567',
    'nimal.design@icloud.com',
    'whatsapp',
    'Hi — we need our company site rebuilt before Q4 launch. Roughly 25 pages plus a booking module. Do you handle design + development? What is timeline and estimate?',
    'project_inquiry',
    'high',
    'positive',
    'in_review',
    425000::numeric
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    'Rajitha Fernando',
    '+94709876543',
    'rajitha@fernandoscpa.lk',
    'whatsapp',
    'This delay is unacceptable. We paid the deposit weeks ago and now no one confirms the delivery date. If we do not hear back TODAY we are cancelling and disputing.',
    'escalation',
    'critical',
    'negative',
    'escalated',
    980000::numeric
  ),
  (
    'a1000000-0000-4000-8000-000000000003',
    'Taniya Silva',
    '+94774444888',
    'taniya@silvawellness.lk',
    'whatsapp',
    'Hello! Can we get a proposal for IG content + reels pack for 90 days plus monthly reporting? Rough budget LKR 175k/month.',
    'pricing',
    'medium',
    'positive',
    'new',
    210000::numeric
  ),
  (
    'a1000000-0000-4000-8000-000000000004',
    'Imran Cassim',
    '+94761112233',
    null,
    'instagram',
    'Do you integrate payments with PayHere for a small membership site? And can you host on our existing domain?',
    'technical_question',
    'low',
    'neutral',
    'new',
    0::numeric
  ),
  (
    'a1000000-0000-4000-8000-000000000005',
    'Sachini Wijesuriya',
    '+94772220001',
    'sachini@travelscape.lk',
    'whatsapp',
    'Following up — any update on invoice TRV-0842 credit note? Customers are asking refunds and Finance needs this closed before payroll Friday.',
    'billing',
    'high',
    'mixed',
    'in_review',
    340000::numeric
  );

insert into public.leads (
    id,
    conversation_id,
    customer_name,
    customer_phone,
    customer_email,
    service_interest,
    lead_score,
    status,
    estimated_value
  )
values (
    'b2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'Nimal Perera',
    '+94771234567',
    'nimal.design@icloud.com',
    'Website redesign + bookings',
    88,
    'qualified',
    450000::numeric
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000002',
    'Rajitha Fernando',
    '+94709876543',
    'rajitha@fernandoscpa.lk',
    'Engagement remediation',
    42,
    'proposal_sent',
    1200000::numeric
  ),
  (
    'b2000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000003',
    'Taniya Silva',
    '+94774444888',
    'taniya@silvawellness.lk',
    'Social retainers (90-day)',
    76,
    'new',
    525000::numeric
  ),
  (
    'b2000000-0000-4000-8000-000000000004',
    'a1000000-0000-4000-8000-000000000004',
    'Imran Cassim',
    '+94761112233',
    null,
    'Membership site + payments',
    61,
    'nurturing',
    95000::numeric
  ),
  (
    'b2000000-0000-4000-8000-000000000005',
    'a1000000-0000-4000-8000-000000000005',
    'Sachini Wijesuriya',
    '+94772220001',
    'sachini@travelscape.lk',
    'Finance / ticketing support',
    69,
    'qualified',
    280000::numeric
  );

insert into public.reply_drafts (
    id,
    conversation_id,
    draft_message,
    approval_status,
    approved_by,
    rejected_reason
  )
values (
    'c3000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'Hi Nimal — yes, we typically handle both UX/UI and engineering for marketing sites plus booking workflows. Rough ranges for a similar scope landed between LKR 380k–520k depending on CMS, calendar rules, and payment integration. Typical timeline is 6–8 weeks assuming content is ready Week 2. Want a quick 15‑min call tomorrow to freeze scope?',
    'pending',
    null,
    null
  ),
  (
    'c3000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000002',
    'Rajitha — I apologize for the lack of confirmations. Owning this now: here is delivery date XX/XX plus a compensated milestone by EOD today. Looping Ops + Account lead immediately. Reply “OK” if you want the written remediation plan emailed.',
    'pending',
    null,
    null
  ),
  (
    'c3000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000003',
    'Hi Taniya — we can propose a mixed IG content + reels pack with KPI reporting. To price accurately: 12 or 24 assets/month and do shoots happen on‑site quarterly? Sending a concise scope questionnaire + sample calendar next.',
    'pending',
    null,
    null
  );

insert into public.workflow_logs (
    workflow_name,
    conversation_id,
    status,
    input_payload,
    output_payload,
    error_message
  )
values (
    'intake_normalize',
    'a1000000-0000-4000-8000-000000000001',
    'success',
    '{"source":"n8n","raw_channel":"whatsapp","body_preview":"we need our company site rebuilt"}'::jsonb,
    '{"normalized":true,"language":"en"}'::jsonb,
    null
  ),
  (
    'openai_classification',
    'a1000000-0000-4000-8000-000000000001',
    'success',
    '{"model":"gpt-4o-mini","intent_hint":"commercial"}'::jsonb,
    '{"intent":"project_inquiry","risk":"medium","confidence":0.86}'::jsonb,
    null
  ),
  (
    'crm_upsert_lead',
    'a1000000-0000-4000-8000-000000000002',
    'success',
    '{"conversation_id":"a1000000-0000-4000-8000-000000000002"}'::jsonb,
    '{"lead_id":"b2000000-0000-4000-8000-000000000002","status_updated":true}'::jsonb,
    null
  ),
  (
    'reply_draft_agent',
    'a1000000-0000-4000-8000-000000000003',
    'running',
    '{"tone":"founder_led","cta":"scope_questions"}'::jsonb,
    null,
    null
  ),
  (
    'slack_notify_ops',
    null,
    'skipped',
    '{"reason":"offline_demo"}'::jsonb,
    null,
    null
  ),
  (
    'intent_router',
    'a1000000-0000-4000-8000-000000000004',
    'success',
    '{"routing_version":1}'::jsonb,
    '{"route":"knowledge_article"}'::jsonb,
    null
  ),
  (
    'openai_classification',
    'a1000000-0000-4000-8000-000000000005',
    'error',
    '{"model":"gpt-4o"}'::jsonb,
    '{"retry":true}'::jsonb,
    'JSON parse timeout after 5200ms'
  ),
  (
    'followup_enqueue',
    'a1000000-0000-4000-8000-000000000005',
    'success',
    '{"defer_hours":4}'::jsonb,
    '{"queue":"default"}'::jsonb,
    null
  );

insert into public.follow_ups (
    conversation_id,
    lead_id,
    follow_up_message,
    scheduled_at,
    status
  )
values (
    'a1000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001',
    'Share discovery agenda + request brand assets & sitemap draft.',
    now () + interval '1 day',
    'scheduled'
  ),
  (
    'a1000000-0000-4000-8000-000000000003',
    'b2000000-0000-4000-8000-000000000003',
    'Send reels sample pack references + KPI definitions.',
    now () + interval '2 hours',
    'scheduled'
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000002',
    'Executive check-in SMS if remediation email unanswered by 17:30.',
    now () + interval '6 hours',
    'scheduled'
  );

insert into public.daily_reports (
    report_content,
    revenue_at_risk,
    hot_leads_count,
    churn_risks_count,
    hours_saved,
    report_date
  )
values (
    E'Today rescued two high‑value enquiries (site rebuild + retainer packaging) before they went cold.\nRisk watch: CPA escalation thread needs human approval tonight — draft reply ready.\nRough hours saved routing intake + classification automation: ~3.8 founder hours versus manual inbox triage.',
    1845000::numeric,
    6,
    2,
    3.75::numeric,
    current_date
  );
