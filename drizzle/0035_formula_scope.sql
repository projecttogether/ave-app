-- Formula helpers execute with the same tenant scope as their caller.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('get_indicator_measurements', 'get_live_qualitative_scores') LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY INVOKER', f.signature);
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public, pg_temp', f.signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO ave_app, ave_policy', f.signature);
  END LOOP;
END $$;

ALTER TABLE public.indicator_report_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indicator_report_snapshots FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.indicator_report_snapshots FROM PUBLIC, ave_auth, ave_app;
GRANT SELECT, INSERT ON public.indicator_report_snapshots TO ave_app;
DROP POLICY IF EXISTS reports_read ON public.indicator_report_snapshots;
CREATE POLICY reports_read ON public.indicator_report_snapshots FOR SELECT TO ave_app
  USING (app_private.can_read(organization_id, sub_organization_id));
DROP POLICY IF EXISTS reports_insert ON public.indicator_report_snapshots;
CREATE POLICY reports_insert ON public.indicator_report_snapshots FOR INSERT TO ave_app
  WITH CHECK (app_private.can_write(organization_id, sub_organization_id)
    AND created_by = app_private.actor_id()
    AND EXISTS (SELECT 1 FROM public.sub_organizations s
      WHERE s.id = sub_organization_id AND s.organization_id = indicator_report_snapshots.organization_id));
