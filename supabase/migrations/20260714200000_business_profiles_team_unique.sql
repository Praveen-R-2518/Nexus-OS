-- Release hardening 2026-07-14: the Gmail OAuth callback upserts business_profiles
-- with onConflict=team_id (app/api/gmail/callback/handler.ts), but no unique
-- constraint existed on team_id, so every upsert failed silently ("there is no
-- unique or exclusion constraint matching the ON CONFLICT specification") and
-- new tenants never got a routing row — their Gmail could never reach the
-- dashboard. Verified 0 duplicate team_id rows before adding.

create unique index if not exists business_profiles_team_id_key
  on public.business_profiles (team_id);
