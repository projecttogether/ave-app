-- Migration: Add percentile benchmarking function
-- Computes per-indicator percentile rank for an organization among all orgs

-- Return type for percentile data
DO $$ BEGIN
    CREATE TYPE org_percentile_entry AS (
        indicator_key text,
        org_value numeric,
        percentile numeric,
        org_count int
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

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
    -- Filter out yearly rows when monthly data exists (same logic as get_dashboard_stats)
    select d.*
    from indicator_data d
    where
      d.reporting_year = p_year
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
  -- Aggregate per organization
  org_aggs as (
    select
      e.organization_id,
      coalesce(sum(total_food_spend), 0) as total_spend,
      -- Plant-based %
      case when coalesce(sum(total_food_spend), 0) > 0
        then (coalesce(sum(greatest(0, coalesce(total_food_spend, 0) - (
          coalesce(meat_spend, 0) + coalesce(fish_spend, 0) +
          coalesce(dairy_spend, 0) + coalesce(egg_spend, 0)
        ))), 0) / sum(total_food_spend)) * 100
        else 0 end as plant_based_pct,
      -- Organic %
      case when coalesce(sum(total_food_spend), 0) > 0
        then (coalesce(sum(organic_spend), 0) / sum(total_food_spend)) * 100
        else 0 end as organic_pct,
      -- Fair trade %
      case when coalesce(sum(coalesce(coffee_spend, 0) + coalesce(cocoa_spend, 0) + coalesce(bananas_spend, 0)), 0) > 0
        then (coalesce(sum(coalesce(fair_trade_coffee_spend, 0) + coalesce(fair_trade_cocoa_spend, 0) + coalesce(fair_trade_bananas_spend, 0)), 0)
              / sum(coalesce(coffee_spend, 0) + coalesce(cocoa_spend, 0) + coalesce(bananas_spend, 0))) * 100
        else 0 end as fair_trade_pct,
      -- Scores (average across sub-orgs)
      coalesce(avg(regional_score), 0) as regional,
      coalesce(avg(seasonal_score), 0) as seasonal,
      coalesce(avg(guest_satisfaction_score), 0) as guest_sat,
      -- Food waste (sum — lower is better)
      coalesce(sum(food_waste_amount), 0) as food_waste
    from effective_data e
    group by e.organization_id
  ),
  -- Compute percentile ranks
  ranked as (
    select
      organization_id,
      plant_based_pct,   percent_rank() over (order by plant_based_pct)   as plant_based_pr,
      organic_pct,       percent_rank() over (order by organic_pct)       as organic_pr,
      fair_trade_pct,    percent_rank() over (order by fair_trade_pct)    as fair_trade_pr,
      regional,          percent_rank() over (order by regional)          as regional_pr,
      seasonal,          percent_rank() over (order by seasonal)          as seasonal_pr,
      guest_sat,         percent_rank() over (order by guest_sat)         as guest_sat_pr,
      food_waste,        percent_rank() over (order by food_waste desc)   as food_waste_pr,  -- desc: lower waste = better rank
      count(*) over ()   as total_orgs
    from org_aggs
  )
  -- Unpivot into rows
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
  select 'food_waste',                   round(food_waste, 1),      round(food_waste_pr * 100, 1),  total_orgs::int from ranked where organization_id = p_organization_id;
end;
$$;
