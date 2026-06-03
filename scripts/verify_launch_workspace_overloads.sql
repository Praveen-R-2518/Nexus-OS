-- List all public.launch_workspace overloads (expect exactly one row after fix).
SELECT oid::regprocedure AS signature
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname = 'launch_workspace'
ORDER BY 1;
