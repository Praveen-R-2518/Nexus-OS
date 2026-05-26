-- Explicitly restrict signup email availability RPC to server-side service role.
-- Supabase projects may default-grant function execution to anon/authenticated roles.

REVOKE ALL ON FUNCTION public.check_signup_email_registered(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_signup_email_registered(text) FROM anon;
REVOKE ALL ON FUNCTION public.check_signup_email_registered(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_signup_email_registered(text) TO service_role;
