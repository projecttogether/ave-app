-- Migration 0021: Safely fix dashboard_overview_stats type and recreate functions
-- This is needed because migration 0020 may have failed silently on live DBs
-- if attributes were already renamed or in unexpected states.
-- We use DO/EXCEPTION blocks to make each type change idempotent.

-- Step 1: Rename old attributes to new names (safe – skips if already done)
DO $$ BEGIN
  ALTER TYPE dashboard_overview_stats RENAME ATTRIBUTE regional_score TO regional_scoring_result;
EXCEPTION WHEN undefined_column THEN
  RAISE NOTICE 'regional_score attribute does not exist, skipping rename';
WHEN others THEN
  RAISE NOTICE 'Skipping regional_score rename: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TYPE dashboard_overview_stats RENAME ATTRIBUTE seasonal_score TO seasonal_scoring_result;
EXCEPTION WHEN undefined_column THEN
  RAISE NOTICE 'seasonal_score attribute does not exist, skipping rename';
WHEN others THEN
  RAISE NOTICE 'Skipping seasonal_score rename: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TYPE dashboard_overview_stats RENAME ATTRIBUTE guest_satisfaction TO guest_satisfaction_scoring_result;
EXCEPTION WHEN undefined_column THEN
  RAISE NOTICE 'guest_satisfaction attribute does not exist, skipping rename';
WHEN others THEN
  RAISE NOTICE 'Skipping guest_satisfaction rename: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TYPE dashboard_overview_stats RENAME ATTRIBUTE guest_satisfaction_score TO guest_satisfaction_scoring_result;
EXCEPTION WHEN undefined_column THEN
  RAISE NOTICE 'guest_satisfaction_score attribute does not exist, skipping rename';
WHEN others THEN
  RAISE NOTICE 'Skipping guest_satisfaction_score rename: %', SQLERRM;
END $$;

-- Step 2: Add new attributes if they don't already exist
DO $$ BEGIN
  ALTER TYPE dashboard_overview_stats ADD ATTRIBUTE plant_based_scoring_result numeric;
EXCEPTION WHEN duplicate_column THEN
  RAISE NOTICE 'plant_based_scoring_result already exists, skipping';
END $$;

DO $$ BEGIN
  ALTER TYPE dashboard_overview_stats ADD ATTRIBUTE organic_scoring_result numeric;
EXCEPTION WHEN duplicate_column THEN
  RAISE NOTICE 'organic_scoring_result already exists, skipping';
END $$;

DO $$ BEGIN
  ALTER TYPE dashboard_overview_stats ADD ATTRIBUTE fair_trade_scoring_result numeric;
EXCEPTION WHEN duplicate_column THEN
  RAISE NOTICE 'fair_trade_scoring_result already exists, skipping';
END $$;

DO $$ BEGIN
  ALTER TYPE dashboard_overview_stats ADD ATTRIBUTE food_waste_scoring_result numeric;
EXCEPTION WHEN duplicate_column THEN
  RAISE NOTICE 'food_waste_scoring_result already exists, skipping';
END $$;

-- Step 3: Recreate get_dashboard_stats with all scoring result fields
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
  -- Aggregate quantitative spend data (from effective_data: monthly preferred over yearly)
  with effective_data as (
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
      and (
        d.reporting_month > 0
        or (d.reporting_month = 0 and not exists (
          select 1 from indicator_data m
          where m.sub_organization_id = d.sub_organization_id
            and m.reporting_year = d.reporting_year
            and m.reporting_month > 0
            and (p_organization_id is null or m.organization_id = p_organization_id)
        ))
      )
  ),
  -- all_data: includes both monthly and yearly rows (for qualitative scores at month=0)
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

  -- Read qualitative scoring results from month=0 rows (always in all_data)
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
