-- Server-only signup helper: detect whether an email is already registered in Auth.
-- Callable only by the service_role JWT (used from Next.js API routes with SUPABASE_SERVICE_ROLE_KEY).
-- Prevents public email enumeration via anon/authenticated roles.

CREATE OR REPLACE FUNCTION public.check_signup_email_registered(email_input text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE lower(btrim(email::text)) = lower(btrim(email_input))
  );
$$;

COMMENT ON FUNCTION public.check_signup_email_registered(text) IS
  'True if auth.users already has this email. EXECUTE is restricted to service_role only.';

REVOKE ALL ON FUNCTION public.check_signup_email_registered(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_signup_email_registered(text) TO service_role;
