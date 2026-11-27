-- New writes must satisfy the numerical contract. Existing records remain
-- readable and appear as validation warnings in calculation breakdowns.
DO $$
DECLARE field text;
BEGIN
  FOREACH field IN ARRAY ARRAY[
    'total_food_spend','meat_spend','fish_spend','dairy_spend','egg_spend','mixed_product_spend',
    'organic_spend','coffee_spend','cocoa_spend','bananas_spend','cocoa_mixed_spend',
    'fair_trade_coffee_spend','fair_trade_cocoa_spend','fair_trade_bananas_spend','fair_trade_cocoa_mixed_spend','food_waste_amount'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'indicator_data'::regclass AND conname = 'valid_' || field) THEN
      EXECUTE format('ALTER TABLE indicator_data ADD CONSTRAINT %I CHECK (%I IS NULL OR (%I >= 0 AND %I <= 1000000000000 AND %I = round(%I, 6))) NOT VALID', 'valid_' || field, field, field, field, field, field);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'indicator_data'::regclass AND conname = 'indicator_input_relationships') THEN
    ALTER TABLE indicator_data ADD CONSTRAINT indicator_input_relationships CHECK (
      reporting_year BETWEEN 2000 AND 2100 AND reporting_month BETWEEN 0 AND 12
      AND (fair_trade_coffee_spend IS NULL OR (coffee_spend IS NOT NULL AND fair_trade_coffee_spend <= coffee_spend))
      AND (fair_trade_cocoa_spend IS NULL OR (cocoa_spend IS NOT NULL AND fair_trade_cocoa_spend <= cocoa_spend))
      AND (fair_trade_bananas_spend IS NULL OR (bananas_spend IS NOT NULL AND fair_trade_bananas_spend <= bananas_spend))
      AND (fair_trade_cocoa_mixed_spend IS NULL OR (cocoa_mixed_spend IS NOT NULL AND fair_trade_cocoa_mixed_spend <= cocoa_mixed_spend))
      AND (organic_spend IS NULL OR (total_food_spend IS NOT NULL AND organic_spend <= total_food_spend))
      AND ((meat_spend IS NULL AND fish_spend IS NULL AND dairy_spend IS NULL AND egg_spend IS NULL AND mixed_product_spend IS NULL)
        OR (total_food_spend IS NOT NULL AND coalesce(meat_spend,0)+coalesce(fish_spend,0)+coalesce(dairy_spend,0)+coalesce(egg_spend,0)+coalesce(mixed_product_spend,0) <= total_food_spend))
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'sub_organizations'::regclass AND conname = 'valid_food_waste_baseline') THEN
    ALTER TABLE sub_organizations ADD CONSTRAINT valid_food_waste_baseline CHECK (
      food_waste_base_amount IS NULL OR (food_waste_base_amount > 0 AND food_waste_base_amount <= 1000000000000 AND food_waste_base_amount = round(food_waste_base_amount,6))
    ) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS indicator_report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  sub_organization_id uuid NOT NULL,
  reporting_year integer NOT NULL,
  granularity text NOT NULL CHECK (granularity IN ('auto','monthly','yearly')),
  formula_version text NOT NULL,
  input_revision text NOT NULL,
  payload jsonb NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sub_organization_id, reporting_year, granularity, formula_version, input_revision)
);
CREATE INDEX IF NOT EXISTS indicator_report_snapshots_lookup
  ON indicator_report_snapshots (sub_organization_id, reporting_year, created_at DESC);

CREATE OR REPLACE FUNCTION protect_indicator_report_snapshot() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Archived indicator reports are immutable. Create a new revision.';
END $$;
DROP TRIGGER IF EXISTS indicator_report_snapshot_immutable ON indicator_report_snapshots;
CREATE TRIGGER indicator_report_snapshot_immutable BEFORE UPDATE OR DELETE ON indicator_report_snapshots
  FOR EACH ROW EXECUTE FUNCTION protect_indicator_report_snapshot();
