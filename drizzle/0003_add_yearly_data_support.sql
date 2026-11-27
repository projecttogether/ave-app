-- Migration: Add support for yearly (cumulated) indicator data
-- reportingMonth = 0 means yearly cumulated data, 1-12 means monthly data

-- Set default for reportingMonth to 0 (yearly) for new rows
ALTER TABLE indicator_data ALTER COLUMN reporting_month SET DEFAULT 0;

-- Update get_dashboard_stats to prefer monthly data over yearly data
-- When monthly data exists for a (sub_org, year), exclude the yearly row (month=0)
-- When only yearly data exists, use it
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
  -- Use a CTE that filters out yearly rows when monthly data exists
  -- for the same (sub_organization_id, reporting_year)
  with effective_data as (
    select d.*
    from indicator_data d
    where
      (p_organization_id is null or d.organization_id = p_organization_id)
      and (p_sub_organization_id is null or d.sub_organization_id = p_sub_organization_id)
      and (p_year is null or d.reporting_year = p_year)
      and (
        -- Include monthly rows (month > 0) always
        d.reporting_month > 0
        -- Include yearly rows (month = 0) only if no monthly data exists for that sub-org+year
        or (d.reporting_month = 0 and not exists (
          select 1 from indicator_data m
          where m.sub_organization_id = d.sub_organization_id
            and m.reporting_year = d.reporting_year
            and m.reporting_month > 0
            and (p_organization_id is null or m.organization_id = p_organization_id)
        ))
      )
  )
  select
    coalesce(sum(total_food_spend), 0),
    
    -- Plant Based Spend: Total - (Meat + Fish + Dairy + Egg)
    coalesce(sum(
        greatest(0, coalesce(total_food_spend, 0) - (
            coalesce(meat_spend, 0) + 
            coalesce(fish_spend, 0) + 
            coalesce(dairy_spend, 0) + 
            coalesce(egg_spend, 0)
        ))
    ), 0),

    coalesce(sum(organic_spend), 0),
    
    -- Fair Trade logic
    coalesce(sum(coalesce(coffee_spend, 0) + coalesce(cocoa_spend, 0) + coalesce(bananas_spend, 0)), 0),
    coalesce(sum(coalesce(fair_trade_coffee_spend, 0) + coalesce(fair_trade_cocoa_spend, 0) + coalesce(fair_trade_bananas_spend, 0)), 0),
    
    -- Averages
    coalesce(avg(regional_score), 0),
    coalesce(avg(seasonal_score), 0),
    coalesce(avg(guest_satisfaction_score), 0),
    
    -- Food Waste
    coalesce(sum(food_waste_amount), 0),
    
    count(*)
  into
    v_total_spend,
    v_plant_based_spend,
    v_organic_spend,
    v_fair_trade_category_spend,
    v_fair_trade_certified_spend,
    v_regional_sum, 
    v_seasonal_sum, 
    v_guest_sat_sum, 
    v_food_waste_sum,
    v_count
  from effective_data;

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
