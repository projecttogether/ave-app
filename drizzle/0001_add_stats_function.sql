-- Create a type for the dashboard overview return value
DO $$ BEGIN
    CREATE TYPE dashboard_overview_stats AS (
        total_spend numeric,
        plant_based_percentage numeric,
        organic_percentage numeric,
        fair_trade_percentage numeric,
        regional_score numeric,
        seasonal_score numeric,
        guest_satisfaction numeric,
        food_waste numeric
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Update the RPC function to correctly calculate plant_based_percentage
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
  select
    coalesce(sum(total_food_spend), 0),
    
    -- New Calculation for Plant Based Spend: Total - (Meat + Fish + Dairy + Egg)
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
  from indicator_data
  where
    (p_organization_id is null or organization_id = p_organization_id)
    and (p_sub_organization_id is null or sub_organization_id = p_sub_organization_id)
    and (p_year is null or reporting_year = p_year);

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
