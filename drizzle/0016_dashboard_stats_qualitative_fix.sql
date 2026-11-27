-- Migration to fix get_dashboard_stats and get_org_percentiles filtering for qualitative/yearly data

create or replace function get_dashboard_stats(
  p_organization_id uuid default null,
  p_sub_organization_id uuid default null,
  p_year int default null
)
returns dashboard_overview_stats
language plpgsql
security definer
as $$
declare
  v_stats dashboard_overview_stats;
  v_total_spend numeric;
  v_plant_based_spend numeric;
  v_organic_spend numeric;
  v_fair_trade_category_spend numeric;
  v_fair_trade_certified_spend numeric;
  v_regional_sum numeric;
  v_seasonal_sum numeric;
  v_guest_sat_sum numeric;
  v_food_waste_sum numeric;
  v_count int;
begin
  with monthly_spend_exists as (
    select distinct sub_organization_id
    from indicator_data
    where reporting_year = p_year
      and reporting_month > 0
      and (
        total_food_spend is not null 
        or meat_spend is not null 
        or fish_spend is not null 
        or dairy_spend is not null 
        or egg_spend is not null 
        or organic_spend is not null 
        or coffee_spend is not null 
        or cocoa_spend is not null 
        or bananas_spend is not null
      )
  ),
  effective_data as (
    select d.*
    from indicator_data d
    left join monthly_spend_exists mse on d.sub_organization_id = mse.sub_organization_id
    where
      (p_organization_id is null or d.organization_id = p_organization_id)
      and (
        p_organization_id is not null or 
        d.organization_id not in (select id from organizations where name = 'test-org')
      )
      and (p_sub_organization_id is null or d.sub_organization_id = p_sub_organization_id)
      and (p_year is null or d.reporting_year = p_year)
      and (
        d.reporting_month > 0
        or (d.reporting_month = 0 and mse.sub_organization_id is null)
      )
  ),
  all_data as (
    select d.*
    from indicator_data d
    where
      (p_organization_id is null or d.organization_id = p_organization_id)
      and (
        p_organization_id is not null or 
        d.organization_id not in (select id from organizations where name = 'test-org')
      )
      and (p_sub_organization_id is null or d.sub_organization_id = p_sub_organization_id)
      and (p_year is null or d.reporting_year = p_year)
  )
  select
    coalesce(sum(total_food_spend), 0),
    coalesce(sum(greatest(0, coalesce(total_food_spend, 0) - (coalesce(meat_spend, 0) + coalesce(fish_spend, 0) + coalesce(dairy_spend, 0) + coalesce(egg_spend, 0)))), 0),
    coalesce(sum(organic_spend), 0),
    coalesce(sum(coalesce(coffee_spend, 0) + coalesce(cocoa_spend, 0) + coalesce(bananas_spend, 0) + (coalesce(cocoa_mixed_spend, 0) * 0.5)), 0),
    coalesce(sum(coalesce(fair_trade_coffee_spend, 0) + coalesce(fair_trade_cocoa_spend, 0) + coalesce(fair_trade_bananas_spend, 0) + (coalesce(fair_trade_cocoa_mixed_spend, 0) * 0.5)), 0),
    count(*)
  into
    v_total_spend,
    v_plant_based_spend,
    v_organic_spend,
    v_fair_trade_category_spend,
    v_fair_trade_certified_spend,
    v_count
  from effective_data;

  select
    coalesce(avg(regional_score), 0),
    coalesce(avg(seasonal_score), 0),
    coalesce(avg(guest_satisfaction_score), 0),
    coalesce(sum(food_waste_amount), 0)
  into
    v_regional_sum, 
    v_seasonal_sum, 
    v_guest_sat_sum, 
    v_food_waste_sum
  from all_data;

  v_stats.total_spend := v_total_spend;
  
  if v_total_spend > 0 then
    v_stats.plant_based_percentage := (v_plant_based_spend / v_total_spend) * 100;
    v_stats.organic_percentage := (v_organic_spend / v_total_spend) * 100;
  else
    v_stats.plant_based_percentage := 0;
    v_stats.organic_percentage := 0;
  end if;

  if v_fair_trade_category_spend > 0 then
    v_stats.fair_trade_percentage := (v_fair_trade_certified_spend / v_fair_trade_category_spend) * 100;
  else
    v_stats.fair_trade_percentage := 0;
  end if;

  v_stats.regional_score := v_regional_sum;
  v_stats.seasonal_score := v_seasonal_sum;
  v_stats.guest_satisfaction := v_guest_sat_sum;
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
  with monthly_spend_exists as (
    select distinct sub_organization_id
    from indicator_data
    where reporting_year = p_year
      and reporting_month > 0
      and (
        total_food_spend is not null 
        or meat_spend is not null 
        or fish_spend is not null 
        or dairy_spend is not null 
        or egg_spend is not null 
        or organic_spend is not null 
        or coffee_spend is not null 
        or cocoa_spend is not null 
        or bananas_spend is not null
      )
  ),
  effective_data as (
    select d.*
    from indicator_data d
    left join monthly_spend_exists mse on d.sub_organization_id = mse.sub_organization_id
    where
      d.reporting_year = p_year
      and (
        d.organization_id = p_organization_id
        or d.organization_id not in (select id from organizations where name = 'test-org')
      )
      and (
        d.reporting_month > 0
        or (d.reporting_month = 0 and mse.sub_organization_id is null)
      )
  ),
  all_data as (
    select d.*
    from indicator_data d
    where
      d.reporting_year = p_year
      and (
        d.organization_id = p_organization_id
        or d.organization_id not in (select id from organizations where name = 'test-org')
      )
  ),
  spend_aggs as (
    select
      e.organization_id,
      coalesce(sum(total_food_spend), 0) as total_spend,
      case when coalesce(sum(total_food_spend), 0) > 0
        then (coalesce(sum(greatest(0, coalesce(total_food_spend, 0) - (
          coalesce(meat_spend, 0) + coalesce(fish_spend, 0) +
          coalesce(dairy_spend, 0) + coalesce(egg_spend, 0)
        ))), 0) / sum(total_food_spend)) * 100
        else 0 end as plant_based_pct,
      case when coalesce(sum(total_food_spend), 0) > 0
        then (coalesce(sum(organic_spend), 0) / sum(total_food_spend)) * 100
        else 0 end as organic_pct,
      case when coalesce(sum(coalesce(coffee_spend, 0) + coalesce(cocoa_spend, 0) + coalesce(bananas_spend, 0) + (coalesce(cocoa_mixed_spend, 0) * 0.5)), 0) > 0
        then (coalesce(sum(coalesce(fair_trade_coffee_spend, 0) + coalesce(fair_trade_cocoa_spend, 0) + coalesce(fair_trade_bananas_spend, 0) + (coalesce(fair_trade_cocoa_mixed_spend, 0) * 0.5)), 0)
              / sum(coalesce(coffee_spend, 0) + coalesce(cocoa_spend, 0) + coalesce(bananas_spend, 0) + (coalesce(cocoa_mixed_spend, 0) * 0.5))) * 100
        else 0 end as fair_trade_pct,
      count(*) as cnt
    from effective_data e
    group by e.organization_id
  ),
  qual_aggs as (
    select
      a.organization_id,
      coalesce(avg(regional_score), 0) as regional,
      coalesce(avg(seasonal_score), 0) as seasonal,
      coalesce(avg(guest_satisfaction_score), 0) as guest_sat,
      coalesce(sum(food_waste_amount), 0) as food_waste
    from all_data a
    group by a.organization_id
  ),
  org_aggs as (
    select
      s.organization_id,
      s.plant_based_pct,
      s.organic_pct,
      s.fair_trade_pct,
      coalesce(q.regional, 0) as regional,
      coalesce(q.seasonal, 0) as seasonal,
      coalesce(q.guest_sat, 0) as guest_sat,
      coalesce(q.food_waste, 0) as food_waste
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
  select 'food_waste',                   round(food_waste, 1),      round(food_waste_pr * 100, 1),  total_orgs::int from ranked where organization_id = p_organization_id;
end;
$$;
