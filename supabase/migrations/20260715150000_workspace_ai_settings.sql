-- Workspace AI settings: per-tenant monthly token budget (soft alert threshold read
-- against the ai_usage table) and the Revenue Analyst chat-visuals toggle.

alter table public.business_profiles
  add column if not exists ai_monthly_token_budget bigint,
  add column if not exists chat_visuals_enabled boolean not null default true;

comment on column public.business_profiles.ai_monthly_token_budget is
  'Soft monthly AI budget in total tokens (input+output) summed from ai_usage. NULL = no budget set. Alert-only — never blocks sends.';

comment on column public.business_profiles.chat_visuals_enabled is
  'When true the Revenue Analyst may render charts/visuals in chat answers (uses more tokens).';
