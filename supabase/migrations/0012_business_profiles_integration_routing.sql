-- Integration routing on business_profiles for n8n multi-tenant intake.
-- Lookup by gmail_destination_email (lowercase), whatsapp_routing_number, or webhook_route_token.

alter table public.business_profiles
  add column if not exists gmail_destination_email text,
  add column if not exists whatsapp_routing_number text,
  add column if not exists webhook_route_token text;

comment on column public.business_profiles.gmail_destination_email is
  'Destination inbox for Gmail/IMAP routing (lowercase). Unique when set.';

comment on column public.business_profiles.whatsapp_routing_number is
  'WhatsApp destination number or provider routing id (trimmed). Unique when set.';

comment on column public.business_profiles.webhook_route_token is
  'Opaque shared secret for webhook header/query routing. Unique when set.';

-- Case-insensitive uniqueness for mailbox (expression index).
create unique index if not exists business_profiles_gmail_dest_lower_uidx on public.business_profiles (lower(trim(gmail_destination_email)))
where
  gmail_destination_email is not null
  and trim(gmail_destination_email) <> '';

create unique index if not exists business_profiles_whatsapp_route_uidx on public.business_profiles (trim(whatsapp_routing_number))
where
  whatsapp_routing_number is not null
  and trim(whatsapp_routing_number) <> '';

create unique index if not exists business_profiles_webhook_token_uidx on public.business_profiles (webhook_route_token)
where
  webhook_route_token is not null;
