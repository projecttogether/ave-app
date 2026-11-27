-- Migration 0029: get_org_percentiles ranked monthly-reporting orgs as 0 kg food waste
-- qual_aggs summed food_waste_amount only from reporting_month = 0 rows, so orgs that
-- record food waste monthly got food_waste = 0 and ranked best in the alliance comparison.
-- Sum food waste from the granularity-aware effective_data CTE instead, matching
-- get_dashboard_stats (0027).

--> statement-breakpoint
create or replace function get_org_percentiles(
  p_organization_id uuid,
  p_year int
)
returns setof org_percentile_entry
language plpgsql
security definer
as $$
begin
  return query
  with effective_data as (
    select d.*
    from indicator_data d
    where
      d.reporting_year = p_year
      and (
        d.organization_id = p_organization_id
        or (
          d.organization_id not in (select id from organizations where name ilike '%test%')
          and d.sub_organization_id not in (select id from sub_organizations where name ilike '%test%')
        )
      )
      and (
        d.reporting_month > 0
        or (d.reporting_month = 0 and not exists (
          select 1 from indicator_data m
          where m.sub_organization_id = d.sub_organization_id
            and m.reporting_year = d.reporting_year
            and m.reporting_month > 0
        ))
      )
  ),
  all_data as (
    select d.*
    from indicator_data d
    where
      d.reporting_year = p_year
      and (
        d.organization_id = p_organization_id
        or (
          d.organization_id not in (select id from organizations where name ilike '%test%')
          and d.sub_organization_id not in (select id from sub_organizations where name ilike '%test%')
        )
      )
  ),
  spend_aggs as (
    select
      e.organization_id,
      coalesce(sum(total_food_spend), 0) as total_spend,
      coalesce(sum(total_food_spend) filter (where meat_spend is not null or fish_spend is not null or dairy_spend is not null or egg_spend is not null or mixed_product_spend is not null), 0) as pb_denom,
      coalesce(sum(greatest(0, coalesce(total_food_spend, 0) - (coalesce(meat_spend, 0) + coalesce(fish_spend, 0) + coalesce(dairy_spend, 0) + coalesce(egg_spend, 0) + (coalesce(mixed_product_spend, 0) * 0.5)))) filter (where meat_spend is not null or fish_spend is not null or dairy_spend is not null or egg_spend is not null or mixed_product_spend is not null), 0) as pb_num,
      coalesce(sum(total_food_spend) filter (where organic_spend is not null), 0) as org_denom,
      coalesce(sum(organic_spend) filter (where organic_spend is not null), 0) as org_num,
      coalesce(sum(coalesce(coffee_spend, 0) + coalesce(cocoa_spend, 0) + coalesce(bananas_spend, 0) + (coalesce(cocoa_mixed_spend, 0) * 0.5)) filter (where fair_trade_coffee_spend is not null or fair_trade_cocoa_spend is not null or fair_trade_bananas_spend is not null or fair_trade_cocoa_mixed_spend is not null), 0) as ft_denom,
      coalesce(sum(coalesce(fair_trade_coffee_spend, 0) + coalesce(fair_trade_cocoa_spend, 0) + coalesce(fair_trade_bananas_spend, 0) + (coalesce(fair_trade_cocoa_mixed_spend, 0) * 0.5)) filter (where fair_trade_coffee_spend is not null or fair_trade_cocoa_spend is not null or fair_trade_bananas_spend is not null or fair_trade_cocoa_mixed_spend is not null), 0) as ft_num,
      coalesce(sum(food_waste_amount), 0) as food_waste,
      count(*) as cnt
    from effective_data e
    group by e.organization_id
  ),
  qual_aggs as (
    select
      a.organization_id,
      coalesce(avg(regional_scoring_result) filter (where reporting_month = 0), 0) as regional,
      coalesce(avg(seasonal_scoring_result) filter (where reporting_month = 0), 0) as seasonal,
      coalesce(avg(guest_satisfaction_scoring_result) filter (where reporting_month = 0), 0) as guest_sat,
      coalesce(avg(plant_based_scoring_result) filter (where reporting_month = 0), 0) as plant_based_scoring,
      coalesce(avg(organic_scoring_result) filter (where reporting_month = 0), 0) as organic_scoring,
      coalesce(avg(fair_trade_scoring_result) filter (where reporting_month = 0), 0) as fair_trade_scoring,
      coalesce(avg(food_waste_scoring_result) filter (where reporting_month = 0), 0) as food_waste_scoring
    from all_data a
    group by a.organization_id
  ),
  org_aggs as (
    select
      s.organization_id,
      case when s.pb_denom > 0 then (s.pb_num / s.pb_denom) * 100 else 0 end as plant_based_pct,
      case when s.org_denom > 0 then (s.org_num / s.org_denom) * 100 else 0 end as organic_pct,
      case when s.ft_denom > 0 then (s.ft_num / s.ft_denom) * 100 else 0 end as fair_trade_pct,
      coalesce(q.regional, 0) as regional,
      coalesce(q.seasonal, 0) as seasonal,
      coalesce(q.guest_sat, 0) as guest_sat,
      s.food_waste as food_waste,
      coalesce(q.plant_based_scoring, 0) as pb_scoring_result,
      coalesce(q.organic_scoring, 0) as org_scoring_result,
      coalesce(q.fair_trade_scoring, 0) as ft_scoring_result,
      coalesce(q.food_waste_scoring, 0) as fw_scoring_result
    from spend_aggs s
    left join qual_aggs q on s.organization_id = q.organization_id
  ),
  ranked as (
    select
      organization_id,
      plant_based_pct,   percent_rank() over (order by plant_based_pct)   as plant_based_pr,
      organic_pct,       percent_rank() over (order by organic_pct)       as organic_pr,
      fair_trade_pct,    percent_rank() over (order by fair_trade_pct)    as fair_trade_pr,
      regional,          percent_rank() over (order by regional)          as regional_pr,
      seasonal,          percent_rank() over (order by seasonal)          as seasonal_pr,
      guest_sat,         percent_rank() over (order by guest_sat)         as guest_sat_pr,
      food_waste,        percent_rank() over (order by food_waste desc)   as food_waste_pr,
      pb_scoring_result, percent_rank() over (order by pb_scoring_result) as pb_scoring_pr,
      org_scoring_result, percent_rank() over (order by org_scoring_result) as org_scoring_pr,
      ft_scoring_result, percent_rank() over (order by ft_scoring_result) as ft_scoring_pr,
      fw_scoring_result, percent_rank() over (order by fw_scoring_result) as fw_scoring_pr,
      count(*) over ()   as total_orgs
    from org_aggs
  )
  select 'plant_based_percentage'::text, round(plant_based_pct, 1), round(plant_based_pr * 100, 1), total_orgs::int from ranked where organization_id = p_organization_id
  union all
  select 'organic_percentage',           round(organic_pct, 1),     round(organic_pr * 100, 1),     total_orgs::int from ranked where organization_id = p_organization_id
  union all
  select 'fair_trade_percentage',        round(fair_trade_pct, 1),  round(fair_trade_pr * 100, 1),  total_orgs::int from ranked where organization_id = p_organization_id
  union all
  select 'regional_score',               round(regional, 1),        round(regional_pr * 100, 1),    total_orgs::int from ranked where organization_id = p_organization_id
  union all
  select 'seasonal_score',               round(seasonal, 1),        round(seasonal_pr * 100, 1),    total_orgs::int from ranked where organization_id = p_organization_id
  union all
  select 'guest_satisfaction',           round(guest_sat, 1),       round(guest_sat_pr * 100, 1),   total_orgs::int from ranked where organization_id = p_organization_id
  union all
  select 'food_waste',                   round(food_waste, 1),      round(food_waste_pr * 100, 1),  total_orgs::int from ranked where organization_id = p_organization_id
  union all
  select 'plant_based_scoring_result',   round(pb_scoring_result, 1), round(pb_scoring_pr * 100, 1), total_orgs::int from ranked where organization_id = p_organization_id
  union all
  select 'organic_scoring_result',       round(org_scoring_result, 1), round(org_scoring_pr * 100, 1), total_orgs::int from ranked where organization_id = p_organization_id
  union all
  select 'fair_trade_scoring_result',    round(ft_scoring_result, 1), round(ft_scoring_pr * 100, 1), total_orgs::int from ranked where organization_id = p_organization_id
  union all
  select 'food_waste_scoring_result',    round(fw_scoring_result, 1), round(fw_scoring_pr * 100, 1), total_orgs::int from ranked where organization_id = p_organization_id;
end;
$$;
