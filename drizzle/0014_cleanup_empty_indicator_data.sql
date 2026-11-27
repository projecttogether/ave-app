-- Custom SQL migration to remove accidental empty monthly rows
DELETE FROM indicator_data
WHERE reporting_month > 0
  AND total_food_spend IS NULL
  AND meat_spend IS NULL
  AND fish_spend IS NULL
  AND dairy_spend IS NULL
  AND egg_spend IS NULL
  AND organic_spend IS NULL
  AND coffee_spend IS NULL
  AND fair_trade_coffee_spend IS NULL
  AND cocoa_spend IS NULL
  AND fair_trade_cocoa_spend IS NULL
  AND cocoa_mixed_spend IS NULL
  AND fair_trade_cocoa_mixed_spend IS NULL
  AND bananas_spend IS NULL
  AND fair_trade_bananas_spend IS NULL
  AND regional_score IS NULL
  AND seasonal_score IS NULL
  AND guest_satisfaction_score IS NULL
  AND food_waste_amount IS NULL;
