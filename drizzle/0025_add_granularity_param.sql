-- Migration 0025: Add p_granularity parameter to get_dashboard_stats
-- Allows explicit selection of 'monthly' or 'yearly' data instead of auto-detection.
-- NULL = auto-detect (existing behavior), 'monthly' = only monthly, 'yearly' = only yearly.
-- Drop old 3-param overload to avoid PostgreSQL function resolution ambiguity.
-- Excludes orgs AND sub-orgs whose name contains "test" (case-insensitive) from global stats.

--> statement-breakpoint
drop function if exists get_dashboard_stats(uuid, uuid, int);

--> statement-breakpoint
create or replace function get_dashboard_stats(
  p_organization_id uuid default null,
  p_sub_organization_id uuid default null,
  p_year int default null,
  p_granularity text default null
)
returns dashboard_overview_stats
language plpgsql
security definer
as $$
declare
  v_stats dashboard_overview_stats;
  v_total_spend numeric;

  v_pb_denom numeric;
  v_pb_num numeric;

  v_org_denom numeric;
  v_org_num numeric;

  v_ft_denom numeric;
  v_ft_num numeric;

  v_count int;

  -- variables for qualitative scoring results
  v_pb_scoring_result numeric;
  v_org_scoring_result numeric;
  v_ft_scoring_result numeric;
  v_fw_scoring_result numeric;
  v_regional_scoring_result numeric;
  v_seasonal_scoring_result numeric;
  v_guest_sat_scoring_result numeric;

  v_food_waste_sum numeric;
begin
  -- STATEMENT 1: Aggregate quantitative spend data.
  -- p_granularity controls data source:
  --   'monthly' = only monthly rows (reporting_month > 0)
  --   'yearly'  = only yearly rows (reporting_month = 0)
  --   NULL      = auto-detect (monthly preferred, yearly fallback)
  with effective_data as (
    select d.*
    from indicator_data d
    where
      (p_organization_id is null or d.organization_id = p_organization_id)
      and (
        p_organization_id is not null or
        (
          d.organization_id not in (select id from organizations where name ilike '%test%')
          and d.sub_organization_id not in (select id from sub_organizations where name ilike '%test%')
        )
      )
      and (p_sub_organization_id is null or d.sub_organization_id = p_sub_organization_id)
      and (p_year is null or d.reporting_year = p_year)
      and (
        case
          when p_granularity = 'monthly' then d.reporting_month > 0
          when p_granularity = 'yearly' then d.reporting_month = 0
          else
            d.reporting_month > 0
            or (d.reporting_month = 0 and not exists (
              select 1 from indicator_data m
              where m.sub_organization_id = d.sub_organization_id
                and m.reporting_year = d.reporting_year
                and m.reporting_month > 0
                and (p_organization_id is null or m.organization_id = p_organization_id)
            ))
        end
      )
  )
  select
    coalesce(sum(total_food_spend), 0),

    coalesce(sum(total_food_spend) filter (where meat_spend is not null or fish_spend is not null or dairy_spend is not null or egg_spend is not null), 0),
    coalesce(sum(greatest(0, coalesce(total_food_spend, 0) - (coalesce(meat_spend, 0) + coalesce(fish_spend, 0) + coalesce(dairy_spend, 0) + coalesce(egg_spend, 0)))) filter (where meat_spend is not null or fish_spend is not null or dairy_spend is not null or egg_spend is not null), 0),

    coalesce(sum(total_food_spend) filter (where organic_spend is not null), 0),
    coalesce(sum(organic_spend) filter (where organic_spend is not null), 0),

    coalesce(sum(coalesce(coffee_spend, 0) + coalesce(cocoa_spend, 0) + coalesce(bananas_spend, 0) + (coalesce(cocoa_mixed_spend, 0) * 0.5)) filter (where fair_trade_coffee_spend is not null or fair_trade_cocoa_spend is not null or fair_trade_bananas_spend is not null or fair_trade_cocoa_mixed_spend is not null), 0),
    coalesce(sum(coalesce(fair_trade_coffee_spend, 0) + coalesce(fair_trade_cocoa_spend, 0) + coalesce(fair_trade_bananas_spend, 0) + (coalesce(fair_trade_cocoa_mixed_spend, 0) * 0.5)) filter (where fair_trade_coffee_spend is not null or fair_trade_cocoa_spend is not null or fair_trade_bananas_spend is not null or fair_trade_cocoa_mixed_spend is not null), 0),

    count(*)
  into
    v_total_spend,
    v_pb_denom,
    v_pb_num,
    v_org_denom,
    v_org_num,
    v_ft_denom,
    v_ft_num,
    v_count
  from effective_data;

  -- STATEMENT 2: Read qualitative scoring results from month=0 rows.
  with all_data as (
    select d.*
    from indicator_data d
    where
      (p_organization_id is null or d.organization_id = p_organization_id)
      and (
        p_organization_id is not null or
        (
          d.organization_id not in (select id from organizations where name ilike '%test%')
          and d.sub_organization_id not in (select id from sub_organizations where name ilike '%test%')
        )
      )
      and (p_sub_organization_id is null or d.sub_organization_id = p_sub_organization_id)
      and (p_year is null or d.reporting_year = p_year)
  )
  select
    coalesce(avg(plant_based_scoring_result) filter (where reporting_month = 0), 0),
    coalesce(avg(organic_scoring_result) filter (where reporting_month = 0), 0),
    coalesce(avg(fair_trade_scoring_result) filter (where reporting_month = 0), 0),
    coalesce(avg(food_waste_scoring_result) filter (where reporting_month = 0), 0),
    coalesce(avg(regional_scoring_result) filter (where reporting_month = 0), 0),
    coalesce(avg(seasonal_scoring_result) filter (where reporting_month = 0), 0),
    coalesce(avg(guest_satisfaction_scoring_result) filter (where reporting_month = 0), 0),
    coalesce(sum(food_waste_amount) filter (where reporting_month = 0), 0)
  into
    v_pb_scoring_result,
    v_org_scoring_result,
    v_ft_scoring_result,
    v_fw_scoring_result,
    v_regional_scoring_result,
    v_seasonal_scoring_result,
    v_guest_sat_scoring_result,
    v_food_waste_sum
  from all_data;

  v_stats.total_spend := v_total_spend;

  if v_pb_denom > 0 then
    v_stats.plant_based_percentage := (v_pb_num / v_pb_denom) * 100;
  else
    v_stats.plant_based_percentage := 0;
  end if;

  if v_org_denom > 0 then
    v_stats.organic_percentage := (v_org_num / v_org_denom) * 100;
  else
    v_stats.organic_percentage := 0;
  end if;

  if v_ft_denom > 0 then
    v_stats.fair_trade_percentage := (v_ft_num / v_ft_denom) * 100;
  else
    v_stats.fair_trade_percentage := 0;
  end if;

  v_stats.plant_based_scoring_result := v_pb_scoring_result;
  v_stats.organic_scoring_result := v_org_scoring_result;
  v_stats.fair_trade_scoring_result := v_ft_scoring_result;
  v_stats.food_waste_scoring_result := v_fw_scoring_result;
  v_stats.regional_scoring_result := v_regional_scoring_result;
  v_stats.seasonal_scoring_result := v_seasonal_scoring_result;
  v_stats.guest_satisfaction_scoring_result := v_guest_sat_scoring_result;

  v_stats.food_waste := v_food_waste_sum;

  return v_stats;
end;
$$;

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
      coalesce(sum(total_food_spend) filter (where meat_spend is not null or fish_spend is not null or dairy_spend is not null or egg_spend is not null), 0) as pb_denom,
      coalesce(sum(greatest(0, coalesce(total_food_spend, 0) - (coalesce(meat_spend, 0) + coalesce(fish_spend, 0) + coalesce(dairy_spend, 0) + coalesce(egg_spend, 0)))) filter (where meat_spend is not null or fish_spend is not null or dairy_spend is not null or egg_spend is not null), 0) as pb_num,
      coalesce(sum(total_food_spend) filter (where organic_spend is not null), 0) as org_denom,
      coalesce(sum(organic_spend) filter (where organic_spend is not null), 0) as org_num,
      coalesce(sum(coalesce(coffee_spend, 0) + coalesce(cocoa_spend, 0) + coalesce(bananas_spend, 0) + (coalesce(cocoa_mixed_spend, 0) * 0.5)) filter (where fair_trade_coffee_spend is not null or fair_trade_cocoa_spend is not null or fair_trade_bananas_spend is not null or fair_trade_cocoa_mixed_spend is not null), 0) as ft_denom,
      coalesce(sum(coalesce(fair_trade_coffee_spend, 0) + coalesce(fair_trade_cocoa_spend, 0) + coalesce(fair_trade_bananas_spend, 0) + (coalesce(fair_trade_cocoa_mixed_spend, 0) * 0.5)) filter (where fair_trade_coffee_spend is not null or fair_trade_cocoa_spend is not null or fair_trade_bananas_spend is not null or fair_trade_cocoa_mixed_spend is not null), 0) as ft_num,
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
      coalesce(sum(food_waste_amount) filter (where reporting_month = 0), 0) as food_waste,
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
      coalesce(q.food_waste, 0) as food_waste,
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
