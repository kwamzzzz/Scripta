-- The function hardening from 20260916123517, extended to what
-- 20260917100000_clients_matters_flows created afterwards.
--
-- That migration revoked EXECUTE on every SECURITY DEFINER function from anon
-- and public, and from authenticated as well for trigger functions. A function
-- created later starts with Postgres's default grant to PUBLIC, so the ones
-- added for clients and filing did not inherit the rule. Same loop, limited to
-- them by name, so nothing reviewed earlier is touched.
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig,
           pg_catalog.pg_get_function_result(p.oid) = 'trigger' AS is_trigger
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
       AND p.proname IN ('actor_label', 'guard_flow_filing', 'after_flow_filed',
                         'task_file_context', 'matter_client_name',
                         'audit_matter_client', 'client_renamed')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, public', f.sig);
    IF f.is_trigger THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
  END LOOP;
END $$;
