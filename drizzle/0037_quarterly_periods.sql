-- Add period identity without reinterpreting or changing historical amounts.
ALTER TABLE indicator_data ADD COLUMN IF NOT EXISTS mixed_product_spend numeric;
ALTER TABLE indicator_data ADD COLUMN IF NOT EXISTS period_kind text;
ALTER TABLE indicator_data ADD COLUMN IF NOT EXISTS period_index integer;
ALTER TABLE indicator_data ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
ALTER TABLE indicator_data ADD COLUMN IF NOT EXISTS coverage_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE indicator_data ADD COLUMN IF NOT EXISTS superseded_at timestamptz;
ALTER TABLE indicator_data ALTER COLUMN reporting_month DROP NOT NULL;
ALTER TABLE sub_organizations ADD COLUMN IF NOT EXISTS baseline_revision integer NOT NULL DEFAULT 0;
-- Earlier releases retained historical values with NOT VALID checks. An UPDATE
-- rechecks those values even when only period metadata changes. Save and restore
-- the unvalidated checks around this backfill, under the ALTER TABLE lock and
-- inside the migration transaction. New writes never see relaxed constraints.
DO $$
DECLARE c record; restore_checks text[] := '{}'; statement text;
BEGIN
  FOR c IN SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conrelid='indicator_data'::regclass AND contype='c' AND NOT convalidated
  LOOP
    restore_checks := array_append(restore_checks, format('ALTER TABLE indicator_data ADD CONSTRAINT %I %s',c.conname,c.definition));
    EXECUTE format('ALTER TABLE indicator_data DROP CONSTRAINT %I',c.conname);
  END LOOP;
  UPDATE indicator_data SET period_kind = CASE WHEN reporting_month=0 THEN 'year' ELSE 'month' END,
    period_index = CASE WHEN reporting_month=0 THEN 1 ELSE reporting_month END WHERE period_kind IS NULL;
  FOREACH statement IN ARRAY restore_checks LOOP
    EXECUTE statement;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS operating_reporting_modes (
  organization_id uuid NOT NULL, sub_organization_id uuid NOT NULL, reporting_year integer NOT NULL CHECK (reporting_year BETWEEN 2000 AND 2100),
  mode text NOT NULL DEFAULT 'legacy' CHECK (mode IN ('legacy','quarterly')), revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY(sub_organization_id,reporting_year),
  FOREIGN KEY(organization_id,sub_organization_id) REFERENCES sub_organizations(organization_id,id) ON DELETE CASCADE
);
INSERT INTO operating_reporting_modes(organization_id,sub_organization_id,reporting_year)
  SELECT DISTINCT organization_id,sub_organization_id,reporting_year FROM indicator_data ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS operating_entry_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, sub_organization_id uuid NOT NULL,
  reporting_year integer NOT NULL CHECK (reporting_year BETWEEN 2000 AND 2100), author_id text NOT NULL,
  workflow text NOT NULL CHECK (workflow IN ('quarter','batch')), quarter integer NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'), revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(author_id,sub_organization_id,reporting_year,workflow,quarter),
  FOREIGN KEY(organization_id,sub_organization_id) REFERENCES sub_organizations(organization_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS operating_mutation_receipts (
  request_id uuid NOT NULL, actor_id text NOT NULL, organization_id uuid NOT NULL, sub_organization_id uuid NOT NULL,
  payload_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,request_id)
);
CREATE TABLE IF NOT EXISTS operating_data_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, sub_organization_id uuid NOT NULL,
  reporting_year integer, actor_id text, request_id text, reason text, source text NOT NULL,
  before jsonb, after jsonb, created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='indicator_data'::regclass AND contype='u'
    AND pg_get_constraintdef(oid) LIKE '%reporting_month%' LOOP
    EXECUTE format('ALTER TABLE indicator_data DROP CONSTRAINT %I',c.conname);
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='indicator_period_shape' AND conrelid='indicator_data'::regclass) THEN
    ALTER TABLE indicator_data ADD CONSTRAINT indicator_period_shape CHECK (
      period_kind IS NOT NULL AND period_index IS NOT NULL AND revision > 0 AND
      CASE period_kind WHEN 'month' THEN reporting_month IS NOT NULL AND period_index BETWEEN 1 AND 12 AND reporting_month=period_index
        WHEN 'year' THEN reporting_month IS NOT NULL AND period_index=1 AND reporting_month=0
        WHEN 'quarter' THEN reporting_month IS NULL AND period_index BETWEEN 1 AND 4 AND coverage_confirmed
        ELSE false END) NOT VALID;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS indicator_active_period ON indicator_data
  (organization_id,sub_organization_id,reporting_year,period_kind,period_index) WHERE superseded_at IS NULL;

-- RLS applies to draft recovery, mode checks and immutable revision history too.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['operating_reporting_modes','operating_entry_drafts','operating_mutation_receipts','operating_data_revisions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC, ave_auth, ave_app',t);
    EXECUTE format('DROP POLICY IF EXISTS operating_read ON %I',t);
    EXECUTE format('CREATE POLICY operating_read ON %I FOR SELECT TO ave_app USING (app_private.can_read(organization_id,sub_organization_id)%s)',t,
      CASE WHEN t='operating_entry_drafts' THEN ' AND author_id=app_private.actor_id()' WHEN t='operating_mutation_receipts' THEN ' AND actor_id=app_private.actor_id()' ELSE '' END);
    EXECUTE format('DROP POLICY IF EXISTS operating_policy ON %I',t);
    EXECUTE format('CREATE POLICY operating_policy ON %I TO ave_policy USING (true) WITH CHECK (true)',t);
    EXECUTE format('GRANT SELECT ON %I TO ave_app',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO ave_policy',t);
    IF t != 'operating_data_revisions' THEN
      EXECUTE format('DROP POLICY IF EXISTS operating_insert ON %I',t);
      EXECUTE format('CREATE POLICY operating_insert ON %I FOR INSERT TO ave_app WITH CHECK (app_private.can_write(organization_id,sub_organization_id)%s)',t,
        CASE WHEN t='operating_entry_drafts' THEN ' AND author_id=app_private.actor_id()' WHEN t='operating_mutation_receipts' THEN ' AND actor_id=app_private.actor_id()' ELSE '' END);
      EXECUTE format('GRANT INSERT ON %I TO ave_app',t);
    END IF;
    IF t IN ('operating_reporting_modes','operating_entry_drafts') THEN
      EXECUTE format('DROP POLICY IF EXISTS operating_update ON %I',t);
      EXECUTE format('CREATE POLICY operating_update ON %I FOR UPDATE TO ave_app USING (app_private.can_write(organization_id,sub_organization_id)%s) WITH CHECK (app_private.can_write(organization_id,sub_organization_id)%s)',t,
        CASE WHEN t='operating_entry_drafts' THEN ' AND author_id=app_private.actor_id()' ELSE '' END,
        CASE WHEN t='operating_entry_drafts' THEN ' AND author_id=app_private.actor_id()' ELSE '' END);
      EXECUTE format('GRANT UPDATE ON %I TO ave_app',t);
    END IF;
  END LOOP;
END $$;
GRANT SELECT ON data_freezes TO ave_policy;
DROP POLICY IF EXISTS freeze_policy_read ON data_freezes;
CREATE POLICY freeze_policy_read ON data_freezes FOR SELECT TO ave_policy USING (true);

CREATE OR REPLACE FUNCTION app_private.has_operating_values(value jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT EXISTS (SELECT 1 FROM jsonb_each(value) e WHERE e.key IN (
    'total_food_spend','meat_spend','fish_spend','dairy_spend','egg_spend','mixed_product_spend','organic_spend',
    'coffee_spend','cocoa_spend','bananas_spend','cocoa_mixed_spend','fair_trade_coffee_spend','fair_trade_cocoa_spend',
    'fair_trade_bananas_spend','fair_trade_cocoa_mixed_spend','food_waste_amount') AND e.value != 'null'::jsonb);
$$;

CREATE OR REPLACE FUNCTION app_private.guard_operating_period() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE item record; current_mode text;
BEGIN
  IF TG_OP='DELETE' THEN item:=OLD; ELSE item:=NEW; END IF;
  PERFORM pg_advisory_xact_lock_shared(1936028722,item.reporting_year);
  IF EXISTS(SELECT 1 FROM data_freezes WHERE year=item.reporting_year) THEN RAISE EXCEPTION 'Das Berichtsjahr ist gesperrt.'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND (NEW.organization_id,NEW.sub_organization_id,NEW.reporting_year,NEW.reporting_month,NEW.period_kind,NEW.period_index)
    IS DISTINCT FROM (OLD.organization_id,OLD.sub_organization_id,OLD.reporting_year,OLD.reporting_month,OLD.period_kind,OLD.period_index) THEN
    RAISE EXCEPTION 'Eine Periode kann nur durch eine dokumentierte Korrektur ersetzt werden.';
  END IF;
  IF NEW.period_kind IS NULL THEN
    NEW.period_kind:=CASE WHEN NEW.reporting_month=0 THEN 'year' ELSE 'month' END;
    NEW.period_index:=CASE WHEN NEW.reporting_month=0 THEN 1 ELSE NEW.reporting_month END;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.superseded_at IS NOT NULL THEN RAISE EXCEPTION 'Ersetzte Quelldaten sind unveränderlich.'; END IF;
    NEW.revision:=OLD.revision+1;
  END IF;
  IF NEW.superseded_at IS NOT NULL OR NOT app_private.has_operating_values(to_jsonb(NEW)) THEN RETURN NEW; END IF;
  IF NOT EXISTS(SELECT 1 FROM operating_reporting_modes WHERE sub_organization_id=NEW.sub_organization_id AND reporting_year=NEW.reporting_year) THEN
    INSERT INTO operating_reporting_modes(organization_id,sub_organization_id,reporting_year)
      VALUES(NEW.organization_id,NEW.sub_organization_id,NEW.reporting_year) ON CONFLICT DO NOTHING;
  END IF;
  SELECT mode INTO current_mode FROM operating_reporting_modes WHERE sub_organization_id=NEW.sub_organization_id AND reporting_year=NEW.reporting_year FOR UPDATE;
  IF (NEW.period_kind='quarter') != (current_mode='quarterly') THEN RAISE EXCEPTION 'Datenkonflikt: Quartalswerte und Monats-/Jahreswerte dürfen nicht vermischt werden.'; END IF;
  IF NEW.period_kind='quarter' THEN
    IF NOT NEW.coverage_confirmed THEN RAISE EXCEPTION 'Die vollständige Quartalsabdeckung muss bestätigt werden.'; END IF;
    IF (make_date(NEW.reporting_year,1,1) + make_interval(months=>NEW.period_index*3))::date > (current_timestamp AT TIME ZONE 'Europe/Berlin')::date THEN
      RAISE EXCEPTION 'Ein offenes oder zukünftiges Quartal darf nicht veröffentlicht werden.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION app_private.guard_operating_period() OWNER TO ave_policy;
REVOKE ALL ON FUNCTION app_private.guard_operating_period() FROM PUBLIC;
DROP TRIGGER IF EXISTS operating_period_guard ON indicator_data;
CREATE TRIGGER operating_period_guard BEFORE INSERT OR UPDATE OR DELETE ON indicator_data FOR EACH ROW EXECUTE FUNCTION app_private.guard_operating_period();

CREATE OR REPLACE FUNCTION app_private.guard_operating_mode() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock_shared(1936028722,NEW.reporting_year);
  IF EXISTS(SELECT 1 FROM data_freezes WHERE year=NEW.reporting_year) THEN RAISE EXCEPTION 'Das Berichtsjahr ist gesperrt.'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (NEW.organization_id,NEW.sub_organization_id,NEW.reporting_year) IS DISTINCT FROM (OLD.organization_id,OLD.sub_organization_id,OLD.reporting_year) THEN RAISE EXCEPTION 'Ungültige Periodenidentität.'; END IF;
    NEW.revision:=OLD.revision;
    IF NEW.mode=OLD.mode THEN RETURN NEW; END IF;
    NEW.revision:=OLD.revision+1;
  END IF;
  IF EXISTS(SELECT 1 FROM indicator_data d WHERE d.sub_organization_id=NEW.sub_organization_id AND d.reporting_year=NEW.reporting_year
    AND d.superseded_at IS NULL AND app_private.has_operating_values(to_jsonb(d)) AND (d.period_kind='quarter') != (NEW.mode='quarterly')) THEN
    RAISE EXCEPTION 'Vorhandene Betriebsdaten benötigen eine ausdrückliche Periodenkorrektur.';
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION app_private.guard_operating_mode() OWNER TO ave_policy;
REVOKE ALL ON FUNCTION app_private.guard_operating_mode() FROM PUBLIC;
DROP TRIGGER IF EXISTS operating_mode_guard ON operating_reporting_modes;
CREATE TRIGGER operating_mode_guard BEFORE INSERT OR UPDATE ON operating_reporting_modes FOR EACH ROW EXECUTE FUNCTION app_private.guard_operating_mode();

CREATE OR REPLACE FUNCTION app_private.operating_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE prior jsonb; next jsonb; item jsonb;
BEGIN
  IF TG_OP!='INSERT' THEN prior:=to_jsonb(OLD); END IF;
  IF TG_OP!='DELETE' THEN next:=to_jsonb(NEW); END IF;
  item:=coalesce(next,prior);
  IF TG_TABLE_NAME='sub_organizations' AND prior->'food_waste_base_amount' IS NOT DISTINCT FROM next->'food_waste_base_amount'
    AND prior->'food_waste_base_date' IS NOT DISTINCT FROM next->'food_waste_base_date' THEN RETURN NULL; END IF;
  INSERT INTO operating_data_revisions(organization_id,sub_organization_id,reporting_year,actor_id,request_id,reason,source,before,after)
    VALUES((item->>'organization_id')::uuid,CASE WHEN TG_TABLE_NAME='sub_organizations' THEN (item->>'id')::uuid ELSE (item->>'sub_organization_id')::uuid END,
      (item->>'reporting_year')::integer,app_private.actor_id(),nullif(current_setting('app.operating_request',true),''),
      nullif(current_setting('app.operating_reason',true),''),TG_TABLE_NAME,prior,next);
  RETURN NULL;
END $$;
ALTER FUNCTION app_private.operating_history() OWNER TO ave_policy;
REVOKE ALL ON FUNCTION app_private.operating_history() FROM PUBLIC;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['indicator_data','operating_reporting_modes','sub_organizations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS operating_history ON %I',t);
    EXECUTE format('CREATE TRIGGER operating_history AFTER %s ON %I FOR EACH ROW EXECUTE FUNCTION app_private.operating_history()',
      CASE WHEN t='sub_organizations' THEN 'UPDATE' ELSE 'INSERT OR UPDATE OR DELETE' END,t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION app_private.guard_baseline_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.baseline_revision:=OLD.baseline_revision;
  IF (NEW.food_waste_base_amount,NEW.food_waste_base_date) IS DISTINCT FROM (OLD.food_waste_base_amount,OLD.food_waste_base_date) THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.id::text,1936028723));
    NEW.baseline_revision:=OLD.baseline_revision+1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS baseline_revision_guard ON sub_organizations;
CREATE TRIGGER baseline_revision_guard BEFORE UPDATE ON sub_organizations FOR EACH ROW EXECUTE FUNCTION app_private.guard_baseline_revision();

CREATE OR REPLACE FUNCTION app_private.guard_reporting_year() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE year_number integer;
BEGIN
  IF TG_TABLE_NAME='data_freezes' THEN
    year_number:=CASE WHEN TG_OP='DELETE' THEN OLD.year ELSE NEW.year END;
    PERFORM pg_advisory_xact_lock(1936028722,year_number);
  ELSE
    year_number:=CASE WHEN TG_OP='DELETE' THEN OLD.reporting_year ELSE NEW.reporting_year END;
    PERFORM pg_advisory_xact_lock_shared(1936028722,year_number);
    IF EXISTS(SELECT 1 FROM data_freezes WHERE year=year_number) THEN RAISE EXCEPTION 'Das Berichtsjahr ist gesperrt.'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION app_private.guard_reporting_year() OWNER TO ave_policy;
REVOKE ALL ON FUNCTION app_private.guard_reporting_year() FROM PUBLIC;
DROP TRIGGER IF EXISTS reporting_year_guard ON qualitative_responses;
CREATE TRIGGER reporting_year_guard BEFORE INSERT OR UPDATE OR DELETE ON qualitative_responses FOR EACH ROW EXECUTE FUNCTION app_private.guard_reporting_year();
DROP TRIGGER IF EXISTS reporting_year_guard ON data_freezes;
CREATE TRIGGER reporting_year_guard BEFORE INSERT OR UPDATE OR DELETE ON data_freezes FOR EACH ROW EXECUTE FUNCTION app_private.guard_reporting_year();

CREATE OR REPLACE FUNCTION app_private.immutable_operating_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Gespeicherte Betriebsdatenrevisionen sind unveränderlich.'; END $$;
DROP TRIGGER IF EXISTS immutable_history ON operating_data_revisions;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON operating_data_revisions FOR EACH ROW EXECUTE FUNCTION app_private.immutable_operating_history();
DROP TRIGGER IF EXISTS immutable_receipt ON operating_mutation_receipts;
CREATE TRIGGER immutable_receipt BEFORE UPDATE OR DELETE ON operating_mutation_receipts FOR EACH ROW EXECUTE FUNCTION app_private.immutable_operating_history();

-- Field-limited baseline writes also work for kitchen members. Do not grant them
-- general UPDATE access to sub_organizations or its membership metadata.
GRANT UPDATE(food_waste_base_amount,food_waste_base_date,baseline_revision) ON sub_organizations TO ave_policy;
CREATE POLICY operating_baseline_policy ON sub_organizations FOR UPDATE TO ave_policy USING (true) WITH CHECK (true);
CREATE OR REPLACE FUNCTION app_private.set_operating_baseline(kitchen_id uuid, expected_revision int, amount numeric, measured_on date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE kitchen sub_organizations%ROWTYPE; result integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(kitchen_id::text,1936028723));
  SELECT * INTO kitchen FROM sub_organizations WHERE id=kitchen_id FOR UPDATE;
  IF NOT FOUND OR NOT app_private.can_write(kitchen.organization_id,kitchen_id) THEN RAISE EXCEPTION 'Keine Schreibberechtigung.' USING ERRCODE='42501'; END IF;
  IF expected_revision IS NULL OR kitchen.baseline_revision != expected_revision THEN RAISE EXCEPTION 'Der jährliche Basiswert wurde inzwischen geändert.'; END IF;
  IF measured_on > (current_timestamp AT TIME ZONE 'Europe/Berlin')::date THEN RAISE EXCEPTION 'Ungültiges Basisdatum.'; END IF;
  UPDATE sub_organizations SET food_waste_base_amount=amount,food_waste_base_date=measured_on WHERE id=kitchen_id RETURNING baseline_revision INTO result;
  RETURN result;
END $$;
ALTER FUNCTION app_private.set_operating_baseline(uuid,int,numeric,date) OWNER TO ave_policy;
REVOKE ALL ON FUNCTION app_private.set_operating_baseline(uuid,int,numeric,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.set_operating_baseline(uuid,int,numeric,date) TO ave_app;
