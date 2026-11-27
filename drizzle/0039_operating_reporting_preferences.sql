CREATE TABLE operating_reporting_preferences (
  organization_id uuid NOT NULL, sub_organization_id uuid NOT NULL,
  reporting_year integer NOT NULL CHECK (reporting_year BETWEEN 2000 AND 2100),
  frequency text NOT NULL CHECK (frequency IN ('monthly','quarterly','yearly')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('user','legacy')),
  updated_by text, updated_at timestamptz NOT NULL DEFAULT now(),
  annual_record_id uuid, annual_record_revision integer, annual_confirmed_at timestamptz,
  annual_confirmed_by text, annual_confirmation_source text CHECK (annual_confirmation_source IN ('user','legacy')),
  PRIMARY KEY (sub_organization_id,reporting_year),
  FOREIGN KEY (organization_id,sub_organization_id) REFERENCES sub_organizations(organization_id,id) ON DELETE CASCADE,
  CHECK ((annual_record_id IS NULL AND annual_record_revision IS NULL AND annual_confirmed_at IS NULL
    AND annual_confirmed_by IS NULL AND annual_confirmation_source IS NULL)
    OR (annual_record_id IS NOT NULL AND annual_record_revision IS NOT NULL AND annual_record_revision > 0 AND annual_confirmed_at IS NOT NULL
      AND annual_confirmation_source IS NOT NULL AND (annual_confirmation_source='legacy' OR annual_confirmed_by IS NOT NULL)))
);

-- Metadata only. Neither amounts nor archived formula inputs are rewritten.
INSERT INTO operating_reporting_preferences(organization_id,sub_organization_id,reporting_year,frequency,source)
SELECT m.organization_id,m.sub_organization_id,m.reporting_year,
  CASE WHEN m.mode='quarterly' THEN 'quarterly'
    WHEN bool_and(d.period_kind='year') THEN 'yearly' ELSE 'monthly' END,'legacy'
FROM operating_reporting_modes m LEFT JOIN indicator_data d ON d.sub_organization_id=m.sub_organization_id
  AND d.reporting_year=m.reporting_year AND d.superseded_at IS NULL AND app_private.has_operating_values(to_jsonb(d))
GROUP BY m.organization_id,m.sub_organization_id,m.reporting_year,m.mode
HAVING m.mode='quarterly' OR (count(d.id)>0 AND count(DISTINCT d.period_kind)=1);

-- Preserve completion previously accepted for closed, unambiguous annual years.
UPDATE operating_reporting_preferences p SET annual_record_id=d.id,annual_record_revision=d.revision,
  annual_confirmed_at=now(),annual_confirmation_source='legacy'
FROM indicator_data d WHERE p.frequency='yearly' AND p.sub_organization_id=d.sub_organization_id
  AND p.reporting_year=d.reporting_year AND d.period_kind='year' AND d.superseded_at IS NULL
  AND app_private.has_operating_values(to_jsonb(d))
  AND p.reporting_year < extract(year FROM current_timestamp AT TIME ZONE 'Europe/Berlin');

ALTER TABLE operating_reporting_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE operating_reporting_preferences FORCE ROW LEVEL SECURITY;
REVOKE ALL ON operating_reporting_preferences FROM PUBLIC,ave_auth,ave_app;
GRANT SELECT,INSERT,UPDATE ON operating_reporting_preferences TO ave_app,ave_policy;
CREATE POLICY preference_read ON operating_reporting_preferences FOR SELECT TO ave_app
  USING (app_private.can_read(organization_id,sub_organization_id));
CREATE POLICY preference_insert ON operating_reporting_preferences FOR INSERT TO ave_app
  WITH CHECK (app_private.can_write(organization_id,sub_organization_id));
CREATE POLICY preference_update ON operating_reporting_preferences FOR UPDATE TO ave_app
  USING (app_private.can_write(organization_id,sub_organization_id))
  WITH CHECK (app_private.can_write(organization_id,sub_organization_id));
CREATE POLICY preference_policy ON operating_reporting_preferences TO ave_policy USING (true) WITH CHECK (true);

CREATE FUNCTION app_private.guard_reporting_preference() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE annual indicator_data%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(1936028722,NEW.reporting_year);
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.sub_organization_id::text,1936028723));
  IF EXISTS(SELECT 1 FROM data_freezes WHERE year=NEW.reporting_year) THEN RAISE EXCEPTION 'Das Berichtsjahr ist gesperrt.'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (NEW.organization_id,NEW.sub_organization_id,NEW.reporting_year) IS DISTINCT FROM (OLD.organization_id,OLD.sub_organization_id,OLD.reporting_year)
      THEN RAISE EXCEPTION 'Ungültige Berichtsidentität.'; END IF;
    NEW.revision:=OLD.revision+1;
  ELSE NEW.revision:=1; END IF;
  NEW.source:='user'; NEW.updated_at:=now(); NEW.updated_by:=app_private.actor_id();
  IF (TG_OP='INSERT' AND NEW.annual_record_id IS NOT NULL) OR (TG_OP='UPDATE' AND
    (NEW.annual_record_id,NEW.annual_record_revision,NEW.annual_confirmed_at,NEW.annual_confirmed_by,NEW.annual_confirmation_source)
    IS DISTINCT FROM (OLD.annual_record_id,OLD.annual_record_revision,OLD.annual_confirmed_at,OLD.annual_confirmed_by,OLD.annual_confirmation_source)) THEN
    IF NEW.annual_record_id IS NOT NULL THEN
      IF NEW.frequency!='yearly' OR NEW.reporting_year >= extract(year FROM current_timestamp AT TIME ZONE 'Europe/Berlin') THEN
        RAISE EXCEPTION 'Nur abgeschlossene Berichtsjahre können bestätigt werden.'; END IF;
      SELECT * INTO annual FROM indicator_data WHERE id=NEW.annual_record_id AND sub_organization_id=NEW.sub_organization_id
        AND reporting_year=NEW.reporting_year AND period_kind='year' AND superseded_at IS NULL;
      IF NOT FOUND OR annual.revision!=NEW.annual_record_revision OR NOT app_private.has_operating_values(to_jsonb(annual)) THEN
        RAISE EXCEPTION 'Die Jahresdaten wurden geändert oder sind leer. Bitte erneut prüfen.'; END IF;
      NEW.annual_confirmation_source:='user'; NEW.annual_confirmed_by:=app_private.actor_id(); NEW.annual_confirmed_at:=now();
    END IF;
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION app_private.guard_reporting_preference() OWNER TO ave_policy;
REVOKE ALL ON FUNCTION app_private.guard_reporting_preference() FROM PUBLIC;
CREATE TRIGGER reporting_preference_guard BEFORE INSERT OR UPDATE ON operating_reporting_preferences
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_reporting_preference();
CREATE TRIGGER operating_history AFTER INSERT OR UPDATE ON operating_reporting_preferences
  FOR EACH ROW EXECUTE FUNCTION app_private.operating_history();

ALTER TABLE operating_entry_drafts DROP CONSTRAINT operating_entry_drafts_workflow_check;
ALTER TABLE operating_entry_drafts ADD CONSTRAINT operating_entry_drafts_workflow_check CHECK (workflow IN ('quarter','batch','year'));
