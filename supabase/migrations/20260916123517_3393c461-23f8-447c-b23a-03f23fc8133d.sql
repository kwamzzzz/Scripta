-- 1. Scope child-row reads through the parent's visibility rules
DROP POLICY IF EXISTS "knowledge visible rules" ON public.playbook_rules;
CREATE POLICY "knowledge visible rules" ON public.playbook_rules
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.playbooks p
  WHERE p.id = playbook_rules.playbook_id
    AND public.knowledge_visible(p.workspace_id, p.visibility, COALESCE(p.owner_id, p.created_by), 'playbook', p.id)
));

DROP POLICY IF EXISTS "knowledge visible template sections" ON public.template_sections;
CREATE POLICY "knowledge visible template sections" ON public.template_sections
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.templates t
  WHERE t.id = template_sections.template_id
    AND public.knowledge_visible(t.workspace_id, t.visibility, COALESCE(t.owner_id, t.created_by), 'template', t.id)
));

-- 2. Pin search_path on the remaining functions that lack it
ALTER FUNCTION public.doc_change_marks(jsonb) SET search_path = public;
ALTER FUNCTION public.knowledge_approved(timestamptz, timestamptz) SET search_path = public;
ALTER FUNCTION public.moving_matter() SET search_path = public;
ALTER FUNCTION public.new_invite_token() SET search_path = public, extensions;
ALTER FUNCTION public.protect_clause_revision() SET search_path = public;
ALTER FUNCTION public.recently_deleted_days() SET search_path = public;
ALTER FUNCTION public.review_transition_allowed(approval_status, approval_status) SET search_path = public;

-- 3. SECURITY DEFINER functions must not be callable by signed-out visitors,
--    and trigger functions must not be callable directly at all.
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig,
           pg_catalog.pg_get_function_result(p.oid) = 'trigger' AS is_trigger
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, public', f.sig);
    IF f.is_trigger THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
  END LOOP;
END $$;
