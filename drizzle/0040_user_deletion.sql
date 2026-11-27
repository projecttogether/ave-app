-- Deleting an account keeps the records it authored, but not the account.
-- The foreign keys clear author columns in the same statement as the DELETE.
-- Referential actions run as the table owner, so the web role gains no UPDATE
-- access, e.g. to audit_logs, and needs no RLS access to other tenants' rows.
ALTER TABLE public.indicator_data
  DROP CONSTRAINT indicator_data_created_by_user_id_fk,
  ADD CONSTRAINT indicator_data_created_by_user_id_fk FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL,
  DROP CONSTRAINT indicator_data_updated_by_user_id_fk,
  ADD CONSTRAINT indicator_data_updated_by_user_id_fk FOREIGN KEY (updated_by) REFERENCES public."user"(id) ON DELETE SET NULL;
ALTER TABLE public.qualitative_responses
  DROP CONSTRAINT qualitative_responses_created_by_user_id_fk,
  ADD CONSTRAINT qualitative_responses_created_by_user_id_fk FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL,
  DROP CONSTRAINT qualitative_responses_updated_by_user_id_fk,
  ADD CONSTRAINT qualitative_responses_updated_by_user_id_fk FOREIGN KEY (updated_by) REFERENCES public."user"(id) ON DELETE SET NULL;
ALTER TABLE public.intake_responses
  DROP CONSTRAINT intake_responses_created_by_user_id_fk,
  ADD CONSTRAINT intake_responses_created_by_user_id_fk FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL,
  DROP CONSTRAINT intake_responses_updated_by_user_id_fk,
  ADD CONSTRAINT intake_responses_updated_by_user_id_fk FOREIGN KEY (updated_by) REFERENCES public."user"(id) ON DELETE SET NULL;
ALTER TABLE public.data_freezes
  DROP CONSTRAINT data_freezes_frozen_by_user_id_fk,
  ADD CONSTRAINT data_freezes_frozen_by_user_id_fk FOREIGN KEY (frozen_by) REFERENCES public."user"(id) ON DELETE SET NULL;
ALTER TABLE public.app_content
  DROP CONSTRAINT app_content_updated_by_user_id_fk,
  ADD CONSTRAINT app_content_updated_by_user_id_fk FOREIGN KEY (updated_by) REFERENCES public."user"(id) ON DELETE SET NULL;

-- Unpublished drafts are private to their author and unreadable by anyone else.
-- Remove them with the account. Orphans cannot be recovered by any user.
DELETE FROM public.operating_entry_drafts d WHERE NOT EXISTS (SELECT 1 FROM public."user" u WHERE u.id = d.author_id);
ALTER TABLE public.operating_entry_drafts ADD CONSTRAINT operating_entry_drafts_author_id_user_id_fk
  FOREIGN KEY (author_id) REFERENCES public."user"(id) ON DELETE CASCADE;

-- True only for the referential action of an account deletion: nothing but
-- author columns changed, each changed one became NULL, and the account it
-- named no longer exists. Ordinary requests cannot produce such an UPDATE,
-- because the foreign keys already clear any reference to a deleted account.
CREATE FUNCTION app_private.is_author_erasure(prior jsonb, next jsonb, author_columns text[]) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT (next - author_columns) = (prior - author_columns)
    AND EXISTS (SELECT 1 FROM unnest(author_columns) c WHERE prior->>c IS NOT NULL AND next->>c IS NULL)
    AND NOT EXISTS (SELECT 1 FROM unnest(author_columns) c WHERE next->c IS DISTINCT FROM prior->c
      AND (next->>c IS NOT NULL OR EXISTS (SELECT 1 FROM public."user" u WHERE u.id = prior->>c)))
$$;
ALTER FUNCTION app_private.is_author_erasure(jsonb, jsonb, text[]) OWNER TO ave_policy;
REVOKE ALL ON FUNCTION app_private.is_author_erasure(jsonb, jsonb, text[]) FROM PUBLIC;

-- Frozen years and superseded source rows stay immutable, except for author
-- erasure. It keeps the revision, so annual confirmations remain valid, and it
-- is not a data change, so it writes no revision history.
CREATE OR REPLACE FUNCTION app_private.guard_operating_period() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE item record; current_mode text;
BEGIN
  IF TG_OP='UPDATE' AND app_private.is_author_erasure(to_jsonb(OLD),to_jsonb(NEW),ARRAY['created_by','updated_by']) THEN RETURN NEW; END IF;
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

CREATE OR REPLACE FUNCTION app_private.guard_reporting_year() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE year_number integer;
BEGIN
  IF TG_OP='UPDATE' AND app_private.is_author_erasure(to_jsonb(OLD),to_jsonb(NEW),
    CASE WHEN TG_TABLE_NAME='data_freezes' THEN ARRAY['frozen_by'] ELSE ARRAY['created_by','updated_by'] END) THEN RETURN NEW; END IF;
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

CREATE OR REPLACE FUNCTION app_private.operating_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE prior jsonb; next jsonb; item jsonb;
BEGIN
  IF TG_OP!='INSERT' THEN prior:=to_jsonb(OLD); END IF;
  IF TG_OP!='DELETE' THEN next:=to_jsonb(NEW); END IF;
  item:=coalesce(next,prior);
  IF TG_TABLE_NAME='sub_organizations' AND prior->'food_waste_base_amount' IS NOT DISTINCT FROM next->'food_waste_base_amount'
    AND prior->'food_waste_base_date' IS NOT DISTINCT FROM next->'food_waste_base_date' THEN RETURN NULL; END IF;
  IF TG_OP='UPDATE' AND TG_TABLE_NAME='indicator_data'
    AND app_private.is_author_erasure(prior,next,ARRAY['created_by','updated_by']) THEN RETURN NULL; END IF;
  INSERT INTO operating_data_revisions(organization_id,sub_organization_id,reporting_year,actor_id,request_id,reason,source,before,after)
    VALUES((item->>'organization_id')::uuid,CASE WHEN TG_TABLE_NAME='sub_organizations' THEN (item->>'id')::uuid ELSE (item->>'sub_organization_id')::uuid END,
      (item->>'reporting_year')::integer,app_private.actor_id(),nullif(current_setting('app.operating_request',true),''),
      nullif(current_setting('app.operating_reason',true),''),TG_TABLE_NAME,prior,next);
  RETURN NULL;
END $$;

-- Mirror the application's protected-account rules for direct deletes: no
-- administrator deletes their own account, only super admins delete super admins.
DROP POLICY tenant_delete ON public."user";
CREATE POLICY tenant_delete ON public."user" FOR DELETE TO ave_app USING (
  app_private.has_role(ARRAY['admin','super_admin']) AND id IS DISTINCT FROM app_private.actor_id()
  AND (app_private.has_role(ARRAY['super_admin'])
    OR NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = "user".id AND r.role_id = 'super_admin')));
