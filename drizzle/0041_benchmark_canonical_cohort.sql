-- Canonical benchmark cohort, reapplied after 0038 on every migration run.
-- p_granularity is still validated for API compatibility, but it no longer
-- selects the contributing kitchens. Nested monthly/quarterly/auto cohorts let
-- callers subtract two released results to isolate a single organization.

-- No tenant selector is accepted here. Each released metric needs five contributing
-- organizations, and the cohort is identical for every requested granularity.
-- Raw rows, names, organization identifiers, and raw food-waste totals are never returned.
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
  -- Every granularity uses the same canonical cohort (each kitchen's native
  -- complete year). Granularity-specific cohorts could be subtracted from each
  -- other to isolate fewer than five organizations.
  WITH complete AS (
    SELECT organization_id, sub_organization_id, indicator_key,
      sum(numerator) AS numerator, sum(denominator) AS denominator
    FROM public.get_indicator_measurements(NULL, NULL, p_year, 'auto')
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
    FROM public.get_indicator_measurements(NULL, NULL, p_year, 'auto')
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
  -- Raw global food-waste totals are never released; comparisons use the reduction.
  stats := stats || jsonb_build_object('food_waste', NULL);

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
