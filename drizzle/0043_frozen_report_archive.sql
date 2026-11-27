-- Freezing a year archives every kitchen's calculation report in the same
-- transaction that records the freeze. That archive is authoritative: live
-- figures for a frozen year can still change, e.g. after a food-waste baseline
-- correction, but no later archive may be presented next to it.
CREATE OR REPLACE FUNCTION app_private.guard_report_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  -- freezeYear holds this lock exclusively while it archives, then records the freeze.
  PERFORM pg_advisory_xact_lock_shared(1936028722,NEW.reporting_year);
  IF EXISTS(SELECT 1 FROM data_freezes WHERE year=NEW.reporting_year) THEN
    RAISE EXCEPTION 'Das Berichtsjahr ist gesperrt. Maßgeblich ist der beim Sperren archivierte Bericht.';
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION app_private.guard_report_snapshot() OWNER TO ave_policy;
REVOKE ALL ON FUNCTION app_private.guard_report_snapshot() FROM PUBLIC;
DROP TRIGGER IF EXISTS report_snapshot_guard ON indicator_report_snapshots;
CREATE TRIGGER report_snapshot_guard BEFORE INSERT ON indicator_report_snapshots FOR EACH ROW EXECUTE FUNCTION app_private.guard_report_snapshot();
