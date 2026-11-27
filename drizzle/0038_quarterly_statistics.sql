-- Quarter-aware benchmark wrapper, reapplied after legacy wrappers.
-- Reapply AFTER legacy statistics definitions on every migration run.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('get_dashboard_stats', 'get_org_percentiles') LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY INVOKER', f.signature);
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public, pg_temp', f.signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO ave_app, ave_policy', f.signature);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS app_private.benchmark_questions (
  question_key text PRIMARY KEY, indicator_slug text NOT NULL, max_points int NOT NULL
);
GRANT SELECT ON app_private.benchmark_questions TO ave_policy;
DELETE FROM app_private.benchmark_questions;
INSERT INTO app_private.benchmark_questions VALUES
('sea_score_1_wie_hoch_schaetzt_ihr_euren_ak', 'seasonal', 5),
('sea_score_1_wird_ein_saisonkalender_genutz', 'seasonal', 2),
('sea_score_1_ist_der_speiseplan_grundsaetzl', 'seasonal', 2),
('sea_score_1_arbeitet_ihr_mit_einzelnen_wec', 'seasonal', 2),
('sea_score_1_wird_der_speiseplan_regelmaess', 'seasonal', 2),
('sea_score_1_werden_im_wochenverlauf_mindes', 'seasonal', 2),
('sea_score_1_wird_auf_flugware_konsequent_v', 'seasonal', 2),
('sea_score_1_wird_regelmaessig_auf_lagerwar', 'seasonal', 2),
('sea_score_1_wird_tiefkuehlware_gezielt_ein', 'seasonal', 2),
('sea_score_1_gibt_es_interne_richtlinien_zu', 'seasonal', 2),
('sea_score_1_finden_lieferantendialoge_zur_', 'seasonal', 2),
('sea_score_1_wenn_ausgeschrieben_wird_werde', 'seasonal', 2),
('sea_score_1_wird_die_saisonale_ausrichtung', 'seasonal', 2),
('sea_score_seasonal_cooperation', 'seasonal', 2),
('reg_score_regional_share_total', 'regional', 5),
('reg_score_1_gibt_es_regionalitaetskriterie', 'regional', 2),
('reg_score_1_werden_regionale_produkte_auf_', 'regional', 2),
('reg_score_1_bestehen_direkte_partnerschaft', 'regional', 2),
('reg_score_1_existieren_interne_vorgaben_od', 'regional', 2),
('reg_score_1_finden_regelmaessige_lieferant', 'regional', 2),
('reg_score_strat_priority_product_groups', 'regional', 2),
('reg_score_1_werden_regionale_produkte_akti', 'regional', 2),
('reg_score_init_value_chain_cooperation', 'regional', 2),
('gs_score_1_werden_in_euren_betrieben_rege', 'guest_satisfaction', 2),
('gs_scrore_standardized_tracking', 'guest_satisfaction', 2),
('gs_scrore_informal_tracking', 'guest_satisfaction', 2),
('gs_score_1_falls_bei_euch_die_gaestezufri', 'guest_satisfaction', 6),
('gs_score_1_gibt_es_ein_festes_team_oder_d', 'guest_satisfaction', 2),
('gs_scrore_info_guest_sustainability_info', 'guest_satisfaction', 2),
('gs_scrore_info_dish_environmental_impact', 'guest_satisfaction', 2),
('gs_scrore_info_dish_health_impact', 'guest_satisfaction', 2),
('gs_scrore_guest_feedback_menu', 'guest_satisfaction', 2),
('gs_scrore_guest_feedback_response', 'guest_satisfaction', 2),
('gs_scrore_dining_atmosphere_design', 'guest_satisfaction', 2),
('gs_scrore_dining_food_aesthetics', 'guest_satisfaction', 2)
ON CONFLICT (question_key) DO UPDATE SET indicator_slug = EXCLUDED.indicator_slug, max_points = EXCLUDED.max_points;

-- No tenant selector is accepted here. Each released metric needs five contributing
-- organizations. Raw rows, names, and organization identifiers are never returned.
CREATE OR REPLACE FUNCTION public.get_benchmark_stats(p_year int, p_granularity text DEFAULT 'yearly')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE result jsonb; stats jsonb; qual jsonb; cohorts record; fw record;
BEGIN
  IF NOT (app_private.has_role(ARRAY['admin','super_admin','global_view_only']) OR
    (app_private.own_org() IS NOT NULL AND (app_private.has_role(ARRAY['org_manager','org_view_only']) OR
      (app_private.has_role(ARRAY['basic_user']) AND EXISTS (SELECT 1 FROM public.sub_organization_members m
        JOIN public.sub_organizations s ON s.id = m.sub_organization_id
        WHERE m.user_id = app_private.actor_id() AND s.organization_id = app_private.own_org()))))) THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_year IS NULL OR p_year < 2000 OR p_year > 2100 OR p_granularity IS NULL OR p_granularity NOT IN ('yearly','monthly','quarterly','auto') THEN
    RAISE EXCEPTION 'Invalid benchmark period';
  END IF;
  -- Only complete years enter an annual benchmark. Partial quarters/months
  -- remain visible in the kitchen's own reporting with their coverage.
  WITH complete AS (
    SELECT organization_id, sub_organization_id, indicator_key,
      sum(numerator) AS numerator, sum(denominator) AS denominator
    FROM public.get_indicator_measurements(NULL, NULL, p_year, p_granularity)
    GROUP BY organization_id, sub_organization_id, indicator_key
    HAVING sum(CASE WHEN reporting_month IS NULL THEN 3 WHEN reporting_month=0 THEN 12 ELSE 1 END)=12
  ), aggregates AS (
    SELECT indicator_key, CASE WHEN count(DISTINCT organization_id) FILTER (WHERE denominator > 0) >= 5
      THEN sum(numerator) * 100 / nullif(sum(denominator),0) END AS value
    FROM complete WHERE indicator_key IN ('plant_based_percentage','organic_percentage','fair_trade_percentage')
    GROUP BY indicator_key
  ) SELECT jsonb_build_object('plant_based_percentage',NULL,'organic_percentage',NULL,'fair_trade_percentage',NULL)
    || coalesce(jsonb_object_agg(indicator_key,value),'{}'::jsonb) INTO stats FROM aggregates;

  WITH waste AS (
    SELECT organization_id, sub_organization_id, sum(numerator) AS amount,
      sum(CASE WHEN reporting_month IS NULL THEN 3 WHEN reporting_month=0 THEN 12 ELSE 1 END) AS covered_months
    FROM public.get_indicator_measurements(NULL, NULL, p_year, p_granularity)
    WHERE indicator_key = 'food_waste'
    GROUP BY organization_id, sub_organization_id
    HAVING sum(CASE WHEN reporting_month IS NULL THEN 3 WHEN reporting_month=0 THEN 12 ELSE 1 END)=12
  ), baselines AS (
    SELECT w.*, CASE WHEN s.food_waste_base_amount > 0
      AND s.food_waste_base_amount::text NOT IN ('NaN', 'Infinity', '-Infinity')
      THEN s.food_waste_base_amount
        * w.covered_months::numeric / 12
      END AS baseline
    FROM waste w JOIN public.sub_organizations s ON s.id = w.sub_organization_id
  ) SELECT count(DISTINCT organization_id) AS contributors, sum(amount) AS amount,
    count(DISTINCT organization_id) FILTER (WHERE baseline > 0) AS matched_contributors,
    sum(amount) FILTER (WHERE baseline > 0) AS matched_amount,
    sum(baseline) FILTER (WHERE baseline > 0) AS baseline,
    count(*) AS reporters, count(*) FILTER (WHERE baseline > 0) AS matched
    INTO fw FROM baselines;
  stats := stats || jsonb_build_object('food_waste', CASE WHEN fw.contributors >= 5 THEN fw.amount END);

  WITH scores AS (
    SELECT * FROM public.get_live_qualitative_scores(NULL, NULL, p_year)
    WHERE p_granularity IN ('yearly','auto') AND indicator_slug IN ('regional', 'seasonal', 'guest_satisfaction')
  ), averages AS (
    SELECT indicator_slug, CASE WHEN count(DISTINCT organization_id) >= 5 THEN round(avg(score)) END AS score
    FROM scores GROUP BY indicator_slug
  ) SELECT coalesce(jsonb_object_agg(indicator_slug, score), '{}'::jsonb) INTO qual FROM averages;
  -- Do not release matched amounts or baselines: combining them with the all-
  -- reporter total and reduction could expose a small excluded cohort by subtraction.
  result := jsonb_build_object('stats', stats, 'qualitative', qual,
    'foodWaste', CASE WHEN fw.matched_contributors >= 5 THEN jsonb_build_object(
      'reduction', (fw.matched_amount - fw.baseline) * 100 / fw.baseline,
      'progress', round(least(100, greatest(0, (fw.matched_amount - fw.baseline) * 10000 / fw.baseline / -30))),
      'status', CASE WHEN fw.matched < fw.reporters THEN 'partial' ELSE 'available' END,
      'reportingSubOrganizations', fw.reporters, 'matchedSubOrganizations', fw.matched,
      'missingBaselineSubOrganizations', fw.reporters - fw.matched) END);
  RETURN result;
END $$;
ALTER FUNCTION public.get_benchmark_stats(int, text) OWNER TO ave_policy;
REVOKE ALL ON FUNCTION public.get_benchmark_stats(int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_benchmark_stats(int, text) TO ave_app;

-- The archive table is created by 0033 after journal migrations on a fresh install.
ALTER TABLE indicator_report_snapshots DROP CONSTRAINT IF EXISTS indicator_report_snapshots_granularity_check;
ALTER TABLE indicator_report_snapshots ADD CONSTRAINT indicator_report_snapshots_granularity_check CHECK (granularity IN ('auto','monthly','yearly','quarterly'));
