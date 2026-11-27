-- Use the same indicator-specific periods and missing-value semantics in every aggregate.
-- Keep questionnaire policy aligned with SCORING_QUESTIONS; parity is checked in tests.
CREATE OR REPLACE FUNCTION get_indicator_measurements(
  p_organization_id uuid DEFAULT NULL, p_sub_organization_id uuid DEFAULT NULL,
  p_year int DEFAULT NULL, p_granularity text DEFAULT NULL
)
RETURNS TABLE (organization_id uuid, sub_organization_id uuid, reporting_year int,
  reporting_month int, indicator_key text, numerator numeric, denominator numeric)
LANGUAGE sql STABLE AS $$
  WITH measurements AS (
    SELECT d.organization_id, d.sub_organization_id, d.reporting_year, d.reporting_month, d.period_kind,
      v.indicator_key, v.numerator, v.denominator,
      bool_or(d.reporting_month > 0 OR coalesce(d.period_kind='quarter',false)) OVER (
        PARTITION BY d.organization_id, d.sub_organization_id, d.reporting_year, v.indicator_key
      ) AS has_monthly
    FROM indicator_data d
    CROSS JOIN LATERAL (VALUES
      ('total_spend', d.total_food_spend, NULL::numeric, d.total_food_spend IS NOT NULL),
      ('plant_based_percentage', greatest(0, coalesce(d.total_food_spend, 0) - coalesce(d.meat_spend, 0) - coalesce(d.fish_spend, 0) - coalesce(d.dairy_spend, 0) - coalesce(d.egg_spend, 0) - coalesce(d.mixed_product_spend, 0) * 0.5), d.total_food_spend,
        d.meat_spend IS NOT NULL OR d.fish_spend IS NOT NULL OR d.dairy_spend IS NOT NULL OR d.egg_spend IS NOT NULL OR d.mixed_product_spend IS NOT NULL),
      ('organic_percentage', d.organic_spend, d.total_food_spend, d.organic_spend IS NOT NULL),
      ('fair_trade_percentage', coalesce(d.fair_trade_coffee_spend, 0) + coalesce(d.fair_trade_cocoa_spend, 0) + coalesce(d.fair_trade_bananas_spend, 0) + coalesce(d.fair_trade_cocoa_mixed_spend, 0) * 0.5,
        coalesce(d.coffee_spend, 0) + coalesce(d.cocoa_spend, 0) + coalesce(d.bananas_spend, 0) + coalesce(d.cocoa_mixed_spend, 0) * 0.5,
        d.fair_trade_coffee_spend IS NOT NULL OR d.fair_trade_cocoa_spend IS NOT NULL OR d.fair_trade_bananas_spend IS NOT NULL OR d.fair_trade_cocoa_mixed_spend IS NOT NULL),
      ('food_waste', d.food_waste_amount, NULL::numeric, d.food_waste_amount IS NOT NULL)
    ) AS v(indicator_key, numerator, denominator, has_data)
    WHERE v.has_data AND d.superseded_at IS NULL
      AND (p_organization_id IS NULL OR d.organization_id = p_organization_id)
      AND (p_sub_organization_id IS NULL OR d.sub_organization_id = p_sub_organization_id)
      AND (p_year IS NULL OR d.reporting_year = p_year)
      AND (p_organization_id IS NOT NULL OR (
        d.organization_id NOT IN (SELECT id FROM organizations WHERE name ILIKE '%test%')
        AND d.sub_organization_id NOT IN (SELECT id FROM sub_organizations WHERE name ILIKE '%test%')
      ))
  )
  SELECT organization_id, sub_organization_id, reporting_year, reporting_month, indicator_key, numerator, denominator
  FROM measurements
  WHERE CASE p_granularity
    WHEN 'monthly' THEN reporting_month > 0
    WHEN 'yearly' THEN reporting_month = 0
    WHEN 'quarterly' THEN reporting_month > 0 OR period_kind='quarter'
    ELSE reporting_month > 0 OR period_kind='quarter' OR NOT has_monthly
  END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION get_live_qualitative_scores(
  p_organization_id uuid DEFAULT NULL, p_sub_organization_id uuid DEFAULT NULL, p_year int DEFAULT NULL
)
RETURNS TABLE (organization_id uuid, sub_organization_id uuid, reporting_year int, indicator_slug text, score numeric)
LANGUAGE sql STABLE AS $$
  WITH policy AS (
    SELECT * FROM jsonb_to_recordset($policy$
[
  {"question_key": "pb_score_dge_certified", "indicator_slug": "plant_based", "max_points": 2},
  {"question_key": "pb_score_daily_plant_main", "indicator_slug": "plant_based", "max_points": 2},
  {"question_key": "pb_score_plant_all_menu_lines", "indicator_slug": "plant_based", "max_points": 2},
  {"question_key": "pb_score_plant_first_choice", "indicator_slug": "plant_based", "max_points": 2},
  {"question_key": "pb_score_nudging_strategies", "indicator_slug": "plant_based", "max_points": 2},
  {"question_key": "pb_score_plant_price_attractive", "indicator_slug": "plant_based", "max_points": 2},
  {"question_key": "pb_score_training_kitchen", "indicator_slug": "plant_based", "max_points": 2},
  {"question_key": "pb_score_certified_partner_kitchen", "indicator_slug": "plant_based", "max_points": 2},
  {"question_key": "pb_score_training_serving", "indicator_slug": "plant_based", "max_points": 2},
  {"question_key": "pb_score_certified_partner_serving", "indicator_slug": "plant_based", "max_points": 2},
  {"question_key": "pb_score_animal_welfare_labels", "indicator_slug": "plant_based", "max_points": 2},
  {"question_key": "pb_score_animal_welfare_share", "indicator_slug": "plant_based", "max_points": 5},
  {"question_key": "pb_score_animal_organic_share", "indicator_slug": "plant_based", "max_points": 5},
  {"question_key": "org_score_bio_ahvv_certified", "indicator_slug": "organic", "max_points": 2},
  {"question_key": "org_score_regenerative_products", "indicator_slug": "organic", "max_points": 2},
  {"question_key": "org_score_uncertified_eco", "indicator_slug": "organic", "max_points": 2},
  {"question_key": "org_score_bio_transition", "indicator_slug": "organic", "max_points": 2},
  {"question_key": "org_score_transition_share", "indicator_slug": "organic", "max_points": 5},
  {"question_key": "org_score_association_bio_share", "indicator_slug": "organic", "max_points": 5},
  {"question_key": "org_score_training_kitchen", "indicator_slug": "organic", "max_points": 2},
  {"question_key": "org_score_certified_partner_kitchen", "indicator_slug": "organic", "max_points": 2},
  {"question_key": "org_score_training_serving", "indicator_slug": "organic", "max_points": 2},
  {"question_key": "org_score_certified_partner_serving", "indicator_slug": "organic", "max_points": 2},
  {"question_key": "org_score_support_bio_associations", "indicator_slug": "organic", "max_points": 2},
  {"question_key": "org_score_support_ribe", "indicator_slug": "organic", "max_points": 2},
  {"question_key": "org_score_support_peer_learning", "indicator_slug": "organic", "max_points": 2},
  {"question_key": "org_score_support_eco_regions", "indicator_slug": "organic", "max_points": 2},
  {"question_key": "org_score_support_biobitte", "indicator_slug": "organic", "max_points": 2},
  {"question_key": "org_score_support_control_bodies", "indicator_slug": "organic", "max_points": 2},
  {"question_key": "org_score_support_research", "indicator_slug": "organic", "max_points": 2},
  {"question_key": "org_score_support_training", "indicator_slug": "organic", "max_points": 2},
  {"question_key": "fw_score_measurement_done", "indicator_slug": "food_waste", "max_points": 2},
  {"question_key": "fw_score_measurement_system", "indicator_slug": "food_waste", "max_points": 2},
  {"question_key": "fw_score_external_certification", "indicator_slug": "food_waste", "max_points": 2},
  {"question_key": "fw_score_internal_feedback", "indicator_slug": "food_waste", "max_points": 2},
  {"question_key": "fw_score_waste_training", "indicator_slug": "food_waste", "max_points": 2},
  {"question_key": "fw_score_internal_evaluation", "indicator_slug": "food_waste", "max_points": 2},
  {"question_key": "fw_score_control_points", "indicator_slug": "food_waste", "max_points": 2},
  {"question_key": "fw_score_measure_portion_sizes", "indicator_slug": "food_waste", "max_points": 2},
  {"question_key": "fw_score_measure_free_refill", "indicator_slug": "food_waste", "max_points": 2},
  {"question_key": "fw_score_measure_variable_sides", "indicator_slug": "food_waste", "max_points": 2},
  {"question_key": "fw_score_measure_reduce_decoration", "indicator_slug": "food_waste", "max_points": 2},
  {"question_key": "fw_score_measure_front_cooking", "indicator_slug": "food_waste", "max_points": 2},
  {"question_key": "fw_score_measure_takeaway_boxes", "indicator_slug": "food_waste", "max_points": 2},
  {"question_key": "fw_score_measure_buffet_design", "indicator_slug": "food_waste", "max_points": 2},
  {"question_key": "fw_score_measure_flexible_planning", "indicator_slug": "food_waste", "max_points": 2},
  {"question_key": "fw_score_measure_rescued_food", "indicator_slug": "food_waste", "max_points": 2},
  {"question_key": "fw_score_measure_food_donation", "indicator_slug": "food_waste", "max_points": 2},
  {"question_key": "fw_score_measure_reduce_standards", "indicator_slug": "food_waste", "max_points": 2},
  {"question_key": "fw_score_nudging", "indicator_slug": "food_waste", "max_points": 2},
  {"question_key": "sea_score_1_wie_hoch_schaetzt_ihr_euren_ak", "indicator_slug": "seasonal", "max_points": 5},
  {"question_key": "sea_score_1_wird_ein_saisonkalender_genutz", "indicator_slug": "seasonal", "max_points": 2},
  {"question_key": "sea_score_1_ist_der_speiseplan_grundsaetzl", "indicator_slug": "seasonal", "max_points": 2},
  {"question_key": "sea_score_1_arbeitet_ihr_mit_einzelnen_wec", "indicator_slug": "seasonal", "max_points": 2},
  {"question_key": "sea_score_1_wird_der_speiseplan_regelmaess", "indicator_slug": "seasonal", "max_points": 2},
  {"question_key": "sea_score_1_werden_im_wochenverlauf_mindes", "indicator_slug": "seasonal", "max_points": 2},
  {"question_key": "sea_score_1_wird_auf_flugware_konsequent_v", "indicator_slug": "seasonal", "max_points": 2},
  {"question_key": "sea_score_1_wird_regelmaessig_auf_lagerwar", "indicator_slug": "seasonal", "max_points": 2},
  {"question_key": "sea_score_1_wird_tiefkuehlware_gezielt_ein", "indicator_slug": "seasonal", "max_points": 2},
  {"question_key": "sea_score_1_gibt_es_interne_richtlinien_zu", "indicator_slug": "seasonal", "max_points": 2},
  {"question_key": "sea_score_1_finden_lieferantendialoge_zur_", "indicator_slug": "seasonal", "max_points": 2},
  {"question_key": "sea_score_1_wenn_ausgeschrieben_wird_werde", "indicator_slug": "seasonal", "max_points": 2},
  {"question_key": "sea_score_1_wird_die_saisonale_ausrichtung", "indicator_slug": "seasonal", "max_points": 2},
  {"question_key": "sea_score_seasonal_cooperation", "indicator_slug": "seasonal", "max_points": 2},
  {"question_key": "reg_score_regional_share_total", "indicator_slug": "regional", "max_points": 5},
  {"question_key": "reg_score_1_gibt_es_regionalitaetskriterie", "indicator_slug": "regional", "max_points": 2},
  {"question_key": "reg_score_1_werden_regionale_produkte_auf_", "indicator_slug": "regional", "max_points": 2},
  {"question_key": "reg_score_1_bestehen_direkte_partnerschaft", "indicator_slug": "regional", "max_points": 2},
  {"question_key": "reg_score_1_existieren_interne_vorgaben_od", "indicator_slug": "regional", "max_points": 2},
  {"question_key": "reg_score_1_finden_regelmaessige_lieferant", "indicator_slug": "regional", "max_points": 2},
  {"question_key": "reg_score_strat_priority_product_groups", "indicator_slug": "regional", "max_points": 2},
  {"question_key": "reg_score_1_werden_regionale_produkte_akti", "indicator_slug": "regional", "max_points": 2},
  {"question_key": "reg_score_init_value_chain_cooperation", "indicator_slug": "regional", "max_points": 2},
  {"question_key": "ft_score_1_werden_nachweise_regelmaessig_", "indicator_slug": "fair_trade", "max_points": 2},
  {"question_key": "ft_score_1_werden_produkte_mit_sozialen_m", "indicator_slug": "fair_trade", "max_points": 2},
  {"question_key": "ft_score_cert_recognized_labels", "indicator_slug": "fair_trade", "max_points": 2},
  {"question_key": "ft_score_1_sind_faire_produkte_in_eurem_w", "indicator_slug": "fair_trade", "max_points": 2},
  {"question_key": "ft_score_1_werden_direkte_handelsbeziehun", "indicator_slug": "fair_trade", "max_points": 2},
  {"question_key": "ft_score_1_steht_ihr_im_austausch_mit_eur", "indicator_slug": "fair_trade", "max_points": 2},
  {"question_key": "ft_score_1_arbeitet_ihr_mit_einer_liefera", "indicator_slug": "fair_trade", "max_points": 2},
  {"question_key": "gs_score_1_werden_in_euren_betrieben_rege", "indicator_slug": "guest_satisfaction", "max_points": 2},
  {"question_key": "gs_scrore_standardized_tracking", "indicator_slug": "guest_satisfaction", "max_points": 2},
  {"question_key": "gs_scrore_informal_tracking", "indicator_slug": "guest_satisfaction", "max_points": 2},
  {"question_key": "gs_score_1_gibt_es_ein_festes_team_oder_d", "indicator_slug": "guest_satisfaction", "max_points": 2},
  {"question_key": "gs_scrore_info_guest_sustainability_info", "indicator_slug": "guest_satisfaction", "max_points": 2},
  {"question_key": "gs_scrore_info_dish_environmental_impact", "indicator_slug": "guest_satisfaction", "max_points": 2},
  {"question_key": "gs_scrore_info_dish_health_impact", "indicator_slug": "guest_satisfaction", "max_points": 2},
  {"question_key": "gs_scrore_guest_feedback_menu", "indicator_slug": "guest_satisfaction", "max_points": 2},
  {"question_key": "gs_scrore_guest_feedback_response", "indicator_slug": "guest_satisfaction", "max_points": 2},
  {"question_key": "gs_scrore_dining_atmosphere_design", "indicator_slug": "guest_satisfaction", "max_points": 2},
  {"question_key": "gs_scrore_dining_food_aesthetics", "indicator_slug": "guest_satisfaction", "max_points": 2}
]
$policy$::jsonb) AS q(question_key text, indicator_slug text, max_points int)
  ), maxima AS (
    SELECT indicator_slug, sum(max_points) AS maximum FROM policy GROUP BY indicator_slug
  ), scores AS (
    SELECT r.organization_id, r.sub_organization_id, r.reporting_year, q.indicator_slug,
      sum(CASE WHEN q.max_points = 2 THEN
        CASE r.response_option WHEN 'Ja' THEN 2 WHEN 'Geplant' THEN 1 ELSE 0 END
      ELSE CASE r.response_option WHEN '<10%' THEN 1 WHEN '11-25%' THEN 2 WHEN '26-50%' THEN 3 WHEN '51-75%' THEN 4 WHEN '76-100%' THEN 5 ELSE 0 END END) AS points
    FROM qualitative_responses r
    JOIN policy q ON q.question_key = r.question_key AND q.indicator_slug = r.indicator_slug
    WHERE nullif(r.response_option, '') IS NOT NULL
      AND (p_organization_id IS NULL OR r.organization_id = p_organization_id)
      AND (p_sub_organization_id IS NULL OR r.sub_organization_id = p_sub_organization_id)
      AND (p_year IS NULL OR r.reporting_year = p_year)
      AND (p_organization_id IS NOT NULL OR (
        r.organization_id NOT IN (SELECT id FROM organizations WHERE name ILIKE '%test%')
        AND r.sub_organization_id NOT IN (SELECT id FROM sub_organizations WHERE name ILIKE '%test%')
      ))
    GROUP BY r.organization_id, r.sub_organization_id, r.reporting_year, q.indicator_slug
  )
  SELECT s.organization_id, s.sub_organization_id, s.reporting_year, s.indicator_slug,
    round(s.points * 100.0 / m.maximum)
  FROM scores s JOIN maxima m USING (indicator_slug);
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_organization_id uuid DEFAULT NULL, p_sub_organization_id uuid DEFAULT NULL,
  p_year int DEFAULT NULL, p_granularity text DEFAULT NULL
)
RETURNS dashboard_overview_stats
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result dashboard_overview_stats;
  operational jsonb;
  qualitative jsonb;
BEGIN
  SELECT jsonb_object_agg(indicator_key, value) INTO operational FROM (
    SELECT indicator_key, CASE WHEN indicator_key IN ('total_spend', 'food_waste')
      THEN sum(numerator)
      WHEN sum(denominator) > 0 THEN sum(numerator) / sum(denominator) * 100
      ELSE NULL END AS value
    FROM get_indicator_measurements(p_organization_id, p_sub_organization_id, p_year, p_granularity)
    GROUP BY indicator_key
  ) totals;
  IF coalesce(p_granularity,'auto') NOT IN ('monthly','quarterly') THEN
    SELECT jsonb_object_agg(indicator_slug, value) INTO qualitative FROM (
      SELECT indicator_slug, round(avg(score)) AS value
      FROM get_live_qualitative_scores(p_organization_id, p_sub_organization_id, p_year)
      GROUP BY indicator_slug
    ) scores;
  END IF;
  result.total_spend := (operational->>'total_spend')::numeric;
  result.plant_based_percentage := (operational->>'plant_based_percentage')::numeric;
  result.organic_percentage := (operational->>'organic_percentage')::numeric;
  result.fair_trade_percentage := (operational->>'fair_trade_percentage')::numeric;
  result.food_waste := (operational->>'food_waste')::numeric;
  result.plant_based_scoring_result := (qualitative->>'plant_based')::numeric;
  result.organic_scoring_result := (qualitative->>'organic')::numeric;
  result.fair_trade_scoring_result := (qualitative->>'fair_trade')::numeric;
  result.food_waste_scoring_result := (qualitative->>'food_waste')::numeric;
  result.regional_scoring_result := (qualitative->>'regional')::numeric;
  result.seasonal_scoring_result := (qualitative->>'seasonal')::numeric;
  result.guest_satisfaction_scoring_result := (qualitative->>'guest_satisfaction')::numeric;
  RETURN result;
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION get_org_percentiles(p_organization_id uuid, p_year int)
RETURNS SETOF org_percentile_entry
LANGUAGE sql SECURITY DEFINER AS $$
  WITH measurements AS (
    SELECT * FROM get_indicator_measurements(NULL, NULL, p_year, NULL) WHERE organization_id <> p_organization_id
    UNION ALL
    SELECT * FROM get_indicator_measurements(p_organization_id, NULL, p_year, NULL)
  ), scores AS (
    SELECT * FROM get_live_qualitative_scores(NULL, NULL, p_year) WHERE organization_id <> p_organization_id
    UNION ALL
    SELECT * FROM get_live_qualitative_scores(p_organization_id, NULL, p_year)
  ), metrics AS (
    SELECT organization_id, indicator_key,
      CASE WHEN indicator_key = 'food_waste' THEN sum(numerator)
        WHEN sum(denominator) > 0 THEN sum(numerator) / sum(denominator) * 100 ELSE NULL END AS value
    FROM measurements WHERE indicator_key <> 'total_spend'
    GROUP BY organization_id, indicator_key
    UNION ALL
    SELECT organization_id, CASE indicator_slug
      WHEN 'regional' THEN 'regional_score' WHEN 'seasonal' THEN 'seasonal_score'
      WHEN 'guest_satisfaction' THEN 'guest_satisfaction' ELSE indicator_slug || '_scoring_result' END,
      round(avg(score))
    FROM scores GROUP BY organization_id, indicator_slug
  ), ranked AS (
    SELECT organization_id, indicator_key, value,
      percent_rank() OVER (PARTITION BY indicator_key ORDER BY CASE WHEN indicator_key = 'food_waste' THEN -value ELSE value END) AS percentile,
      count(*) OVER (PARTITION BY indicator_key) AS org_count
    FROM metrics WHERE value IS NOT NULL
  )
  SELECT indicator_key, round(value, 1), round((percentile * 100)::numeric, 1), org_count::int
  FROM ranked WHERE organization_id = p_organization_id;
$$;
