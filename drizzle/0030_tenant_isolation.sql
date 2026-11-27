-- Runtime and authentication logins inherit separate NOLOGIN roles. Never grant
-- ave_policy to a login: it owns only the narrowly exposed policy/benchmark functions.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ave_app') THEN CREATE ROLE ave_app NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ave_auth') THEN CREATE ROLE ave_auth NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ave_policy') THEN CREATE ROLE ave_policy NOLOGIN; END IF;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO ave_app, ave_auth, ave_policy;
GRANT USAGE ON SCHEMA app_private TO ave_app, ave_policy;

CREATE OR REPLACE FUNCTION app_private.actor_id() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;

CREATE OR REPLACE FUNCTION app_private.has_role(wanted text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public."user" u JOIN public.user_roles r ON r.user_id = u.id
    WHERE u.id = app_private.actor_id() AND u.status IS DISTINCT FROM 'deactivated' AND r.role_id = ANY(wanted))
$$;

CREATE OR REPLACE FUNCTION app_private.own_org() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT organization_id FROM public."user" WHERE id = app_private.actor_id() AND status IS DISTINCT FROM 'deactivated'
$$;

CREATE OR REPLACE FUNCTION app_private.member_of(sub_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.sub_organization_members m
    JOIN public.sub_organizations s ON s.id = m.sub_organization_id
    WHERE m.user_id = app_private.actor_id() AND m.sub_organization_id = sub_id
      AND s.organization_id = app_private.own_org())
$$;

CREATE OR REPLACE FUNCTION app_private.in_scope(org_id uuid, sub_id uuid DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT (nullif(current_setting('app.organization_id', true), '') IS NULL
      OR org_id = nullif(current_setting('app.organization_id', true), '')::uuid)
    AND (sub_id IS NULL OR nullif(current_setting('app.sub_organization_id', true), '') IS NULL
      OR sub_id = nullif(current_setting('app.sub_organization_id', true), '')::uuid)
$$;

CREATE OR REPLACE FUNCTION app_private.can_read(org_id uuid, sub_id uuid DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app_private.in_scope(org_id, sub_id) AND (
    app_private.has_role(ARRAY['admin','super_admin','global_view_only']) OR
    (org_id = app_private.own_org() AND (
      app_private.has_role(ARRAY['org_manager','org_view_only']) OR
      (app_private.has_role(ARRAY['basic_user']) AND (sub_id IS NULL OR app_private.member_of(sub_id))))))
$$;

CREATE OR REPLACE FUNCTION app_private.can_write(org_id uuid, sub_id uuid DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app_private.in_scope(org_id, sub_id) AND (
    app_private.has_role(ARRAY['admin','super_admin']) OR
    (org_id = app_private.own_org() AND (
      app_private.has_role(ARRAY['org_manager']) OR
      (app_private.has_role(ARRAY['basic_user']) AND NOT app_private.has_role(ARRAY['org_view_only','global_view_only'])
        AND sub_id IS NOT NULL AND app_private.member_of(sub_id)))))
$$;

GRANT SELECT ON public."user", public.user_roles, public.sub_organization_members, public.sub_organizations,
  public.organizations, public.indicator_data, public.qualitative_responses TO ave_policy;
ALTER FUNCTION app_private.has_role(text[]) OWNER TO ave_policy;
ALTER FUNCTION app_private.own_org() OWNER TO ave_policy;
ALTER FUNCTION app_private.member_of(uuid) OWNER TO ave_policy;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app_private TO ave_app, ave_policy;

-- A redundant tenant ID cannot point to a different parent organization.
ALTER TABLE public.sub_organizations ADD CONSTRAINT sub_organizations_org_id_key UNIQUE (organization_id, id);
ALTER TABLE public.indicator_data ADD CONSTRAINT indicator_data_org_sub_fk
  FOREIGN KEY (organization_id, sub_organization_id) REFERENCES public.sub_organizations(organization_id, id) ON DELETE CASCADE;
ALTER TABLE public.qualitative_responses ADD CONSTRAINT qualitative_responses_org_sub_fk
  FOREIGN KEY (organization_id, sub_organization_id) REFERENCES public.sub_organizations(organization_id, id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION app_private.check_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."user" u JOIN public.sub_organizations s ON u.organization_id = s.organization_id
    WHERE u.id = NEW.user_id AND s.id = NEW.sub_organization_id) THEN
    RAISE EXCEPTION 'Membership must belong to the user organization' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION app_private.check_membership() OWNER TO ave_policy;
REVOKE ALL ON FUNCTION app_private.check_membership() FROM PUBLIC;
CREATE TRIGGER membership_organization_check BEFORE INSERT OR UPDATE ON public.sub_organization_members
  FOR EACH ROW EXECUTE FUNCTION app_private.check_membership();

CREATE OR REPLACE FUNCTION app_private.protect_user() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT pg_has_role(current_user, 'ave_auth', 'member') AND NOT app_private.has_role(ARRAY['admin','super_admin'])
    AND (to_jsonb(NEW) - 'name' - 'onboarding_completed_at') IS DISTINCT FROM (to_jsonb(OLD) - 'name' - 'onboarding_completed_at') THEN
    RAISE EXCEPTION 'Only administrators can change account permissions' USING ERRCODE = '42501';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    DELETE FROM public.sub_organization_members WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.protect_user() FROM PUBLIC;
CREATE TRIGGER user_permission_check BEFORE UPDATE ON public."user" FOR EACH ROW EXECUTE FUNCTION app_private.protect_user();

ALTER TABLE public."organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."organizations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON public."organizations" FOR SELECT TO ave_app USING (app_private.can_read(id));
CREATE POLICY tenant_insert ON public."organizations" FOR INSERT TO ave_app WITH CHECK (app_private.has_role(ARRAY['admin','super_admin']));
CREATE POLICY tenant_update ON public."organizations" FOR UPDATE TO ave_app USING (app_private.has_role(ARRAY['admin','super_admin'])) WITH CHECK (app_private.has_role(ARRAY['admin','super_admin']));
CREATE POLICY tenant_delete ON public."organizations" FOR DELETE TO ave_app USING (app_private.has_role(ARRAY['admin','super_admin']));
GRANT SELECT, INSERT, UPDATE, DELETE ON public."organizations" TO ave_app;
CREATE POLICY policy_lookup ON public."organizations" FOR SELECT TO ave_policy USING (true);

ALTER TABLE public."sub_organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sub_organizations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON public."sub_organizations" FOR SELECT TO ave_app USING (app_private.can_read(organization_id, id));
CREATE POLICY tenant_insert ON public."sub_organizations" FOR INSERT TO ave_app WITH CHECK (app_private.has_role(ARRAY['admin','super_admin']) OR (organization_id = app_private.own_org() AND app_private.has_role(ARRAY['org_manager'])));
CREATE POLICY tenant_update ON public."sub_organizations" FOR UPDATE TO ave_app USING (app_private.has_role(ARRAY['admin','super_admin']) OR (organization_id = app_private.own_org() AND app_private.has_role(ARRAY['org_manager']))) WITH CHECK (app_private.has_role(ARRAY['admin','super_admin']) OR (organization_id = app_private.own_org() AND app_private.has_role(ARRAY['org_manager'])));
CREATE POLICY tenant_delete ON public."sub_organizations" FOR DELETE TO ave_app USING (app_private.has_role(ARRAY['admin','super_admin']) OR (organization_id = app_private.own_org() AND app_private.has_role(ARRAY['org_manager'])));
GRANT SELECT, INSERT, UPDATE, DELETE ON public."sub_organizations" TO ave_app;
CREATE POLICY policy_lookup ON public."sub_organizations" FOR SELECT TO ave_policy USING (true);

ALTER TABLE public."indicator_data" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."indicator_data" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON public."indicator_data" FOR SELECT TO ave_app USING (app_private.can_read(organization_id, sub_organization_id));
CREATE POLICY tenant_insert ON public."indicator_data" FOR INSERT TO ave_app WITH CHECK (app_private.can_write(organization_id, sub_organization_id));
CREATE POLICY tenant_update ON public."indicator_data" FOR UPDATE TO ave_app USING (app_private.can_write(organization_id, sub_organization_id)) WITH CHECK (app_private.can_write(organization_id, sub_organization_id));
CREATE POLICY tenant_delete ON public."indicator_data" FOR DELETE TO ave_app USING (app_private.can_write(organization_id, sub_organization_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public."indicator_data" TO ave_app;
CREATE POLICY policy_lookup ON public."indicator_data" FOR SELECT TO ave_policy USING (true);

ALTER TABLE public."qualitative_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."qualitative_responses" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON public."qualitative_responses" FOR SELECT TO ave_app USING (app_private.can_read(organization_id, sub_organization_id));
CREATE POLICY tenant_insert ON public."qualitative_responses" FOR INSERT TO ave_app WITH CHECK (app_private.can_write(organization_id, sub_organization_id));
CREATE POLICY tenant_update ON public."qualitative_responses" FOR UPDATE TO ave_app USING (app_private.can_write(organization_id, sub_organization_id)) WITH CHECK (app_private.can_write(organization_id, sub_organization_id));
CREATE POLICY tenant_delete ON public."qualitative_responses" FOR DELETE TO ave_app USING (app_private.can_write(organization_id, sub_organization_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public."qualitative_responses" TO ave_app;
CREATE POLICY policy_lookup ON public."qualitative_responses" FOR SELECT TO ave_policy USING (true);

ALTER TABLE public."intake_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."intake_responses" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON public."intake_responses" FOR SELECT TO ave_app USING (app_private.can_read(organization_id) AND app_private.has_role(ARRAY['admin','super_admin','global_view_only','org_manager','org_view_only']));
CREATE POLICY tenant_insert ON public."intake_responses" FOR INSERT TO ave_app WITH CHECK (app_private.can_write(organization_id));
CREATE POLICY tenant_update ON public."intake_responses" FOR UPDATE TO ave_app USING (app_private.can_write(organization_id)) WITH CHECK (app_private.can_write(organization_id));
CREATE POLICY tenant_delete ON public."intake_responses" FOR DELETE TO ave_app USING (app_private.can_write(organization_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public."intake_responses" TO ave_app;

ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON public."user" FOR SELECT TO ave_app USING (id = app_private.actor_id() OR app_private.has_role(ARRAY['admin','super_admin']) OR (organization_id = app_private.own_org() AND app_private.has_role(ARRAY['org_manager'])));
CREATE POLICY tenant_insert ON public."user" FOR INSERT TO ave_app WITH CHECK (app_private.has_role(ARRAY['admin','super_admin']));
CREATE POLICY tenant_update ON public."user" FOR UPDATE TO ave_app USING ((id = app_private.actor_id()) OR (app_private.has_role(ARRAY['admin','super_admin']))) WITH CHECK ((id = app_private.actor_id()) OR (app_private.has_role(ARRAY['admin','super_admin'])));
CREATE POLICY tenant_delete ON public."user" FOR DELETE TO ave_app USING (app_private.has_role(ARRAY['admin','super_admin']));
GRANT SELECT, INSERT, UPDATE, DELETE ON public."user" TO ave_app;
CREATE POLICY policy_lookup ON public."user" FOR SELECT TO ave_policy USING (true);

ALTER TABLE public."user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON public."user_roles" FOR SELECT TO ave_app USING (user_id = app_private.actor_id() OR app_private.has_role(ARRAY['admin','super_admin']));
CREATE POLICY tenant_insert ON public."user_roles" FOR INSERT TO ave_app WITH CHECK (app_private.has_role(ARRAY['admin','super_admin']) AND (role_id <> 'super_admin' OR app_private.has_role(ARRAY['super_admin'])));
CREATE POLICY tenant_update ON public."user_roles" FOR UPDATE TO ave_app USING (app_private.has_role(ARRAY['admin','super_admin']) AND (role_id <> 'super_admin' OR app_private.has_role(ARRAY['super_admin']))) WITH CHECK (app_private.has_role(ARRAY['admin','super_admin']) AND (role_id <> 'super_admin' OR app_private.has_role(ARRAY['super_admin'])));
CREATE POLICY tenant_delete ON public."user_roles" FOR DELETE TO ave_app USING (app_private.has_role(ARRAY['admin','super_admin']) AND (role_id <> 'super_admin' OR app_private.has_role(ARRAY['super_admin'])));
GRANT SELECT, INSERT, UPDATE, DELETE ON public."user_roles" TO ave_app;
CREATE POLICY policy_lookup ON public."user_roles" FOR SELECT TO ave_policy USING (true);

ALTER TABLE public."sub_organization_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sub_organization_members" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON public."sub_organization_members" FOR SELECT TO ave_app USING (user_id = app_private.actor_id() OR app_private.has_role(ARRAY['admin','super_admin']) OR (app_private.has_role(ARRAY['org_manager']) AND EXISTS (SELECT 1 FROM public.sub_organizations s WHERE s.id = sub_organization_id AND s.organization_id = app_private.own_org())));
CREATE POLICY tenant_insert ON public."sub_organization_members" FOR INSERT TO ave_app WITH CHECK (app_private.has_role(ARRAY['admin','super_admin']) OR (app_private.has_role(ARRAY['org_manager']) AND EXISTS (SELECT 1 FROM public.sub_organizations s WHERE s.id = sub_organization_id AND s.organization_id = app_private.own_org())));
CREATE POLICY tenant_update ON public."sub_organization_members" FOR UPDATE TO ave_app USING (app_private.has_role(ARRAY['admin','super_admin']) OR (app_private.has_role(ARRAY['org_manager']) AND EXISTS (SELECT 1 FROM public.sub_organizations s WHERE s.id = sub_organization_id AND s.organization_id = app_private.own_org()))) WITH CHECK (app_private.has_role(ARRAY['admin','super_admin']) OR (app_private.has_role(ARRAY['org_manager']) AND EXISTS (SELECT 1 FROM public.sub_organizations s WHERE s.id = sub_organization_id AND s.organization_id = app_private.own_org())));
CREATE POLICY tenant_delete ON public."sub_organization_members" FOR DELETE TO ave_app USING (app_private.has_role(ARRAY['admin','super_admin']) OR (app_private.has_role(ARRAY['org_manager']) AND EXISTS (SELECT 1 FROM public.sub_organizations s WHERE s.id = sub_organization_id AND s.organization_id = app_private.own_org())));
GRANT SELECT, INSERT, UPDATE, DELETE ON public."sub_organization_members" TO ave_app;
CREATE POLICY policy_lookup ON public."sub_organization_members" FOR SELECT TO ave_policy USING (true);

ALTER TABLE public."revoked_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."revoked_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON public."revoked_sessions" FOR SELECT TO ave_app USING (user_id = app_private.actor_id() OR app_private.has_role(ARRAY['admin','super_admin']));
CREATE POLICY tenant_insert ON public."revoked_sessions" FOR INSERT TO ave_app WITH CHECK (user_id = app_private.actor_id() OR app_private.has_role(ARRAY['admin','super_admin']));
-- Revocations are append-only for application requests.
CREATE POLICY tenant_delete ON public."revoked_sessions" FOR DELETE TO ave_app USING (app_private.has_role(ARRAY['super_admin']));
GRANT SELECT, INSERT, UPDATE, DELETE ON public."revoked_sessions" TO ave_app;

ALTER TABLE public."authenticator" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."authenticator" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON public."authenticator" FOR SELECT TO ave_app USING ("userId" = app_private.actor_id());
CREATE POLICY tenant_insert ON public."authenticator" FOR INSERT TO ave_app WITH CHECK ("userId" = app_private.actor_id());
CREATE POLICY tenant_update ON public."authenticator" FOR UPDATE TO ave_app USING ("userId" = app_private.actor_id()) WITH CHECK ("userId" = app_private.actor_id());
CREATE POLICY tenant_delete ON public."authenticator" FOR DELETE TO ave_app USING ("userId" = app_private.actor_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON public."authenticator" TO ave_app;

ALTER TABLE public."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON public."audit_logs" FOR SELECT TO ave_app USING (user_id = app_private.actor_id() OR app_private.has_role(ARRAY['admin','super_admin']));
CREATE POLICY tenant_insert ON public."audit_logs" FOR INSERT TO ave_app WITH CHECK (app_private.has_role(ARRAY['super_admin']));
CREATE POLICY tenant_update ON public."audit_logs" FOR UPDATE TO ave_app USING (app_private.has_role(ARRAY['super_admin'])) WITH CHECK (app_private.has_role(ARRAY['super_admin']));
CREATE POLICY tenant_delete ON public."audit_logs" FOR DELETE TO ave_app USING (app_private.has_role(ARRAY['super_admin']));
GRANT SELECT, INSERT, UPDATE, DELETE ON public."audit_logs" TO ave_app;

ALTER TABLE public."app_content" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."app_content" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON public."app_content" FOR SELECT TO ave_app USING (true);
CREATE POLICY tenant_insert ON public."app_content" FOR INSERT TO ave_app WITH CHECK (app_private.has_role(ARRAY['admin','super_admin']));
CREATE POLICY tenant_update ON public."app_content" FOR UPDATE TO ave_app USING (app_private.has_role(ARRAY['admin','super_admin'])) WITH CHECK (app_private.has_role(ARRAY['admin','super_admin']));
CREATE POLICY tenant_delete ON public."app_content" FOR DELETE TO ave_app USING (app_private.has_role(ARRAY['admin','super_admin']));
GRANT SELECT, INSERT, UPDATE, DELETE ON public."app_content" TO ave_app;

ALTER TABLE public."data_freezes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."data_freezes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON public."data_freezes" FOR SELECT TO ave_app USING (app_private.actor_id() IS NOT NULL);
CREATE POLICY tenant_insert ON public."data_freezes" FOR INSERT TO ave_app WITH CHECK (app_private.has_role(ARRAY['admin','super_admin']));
CREATE POLICY tenant_update ON public."data_freezes" FOR UPDATE TO ave_app USING (app_private.has_role(ARRAY['admin','super_admin'])) WITH CHECK (app_private.has_role(ARRAY['admin','super_admin']));
CREATE POLICY tenant_delete ON public."data_freezes" FOR DELETE TO ave_app USING (app_private.has_role(ARRAY['admin','super_admin']));
GRANT SELECT, INSERT, UPDATE, DELETE ON public."data_freezes" TO ave_app;

ALTER TABLE public."roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON public."roles" FOR SELECT TO ave_app USING (app_private.actor_id() IS NOT NULL);
CREATE POLICY tenant_insert ON public."roles" FOR INSERT TO ave_app WITH CHECK (app_private.has_role(ARRAY['admin','super_admin']));
CREATE POLICY tenant_update ON public."roles" FOR UPDATE TO ave_app USING (app_private.has_role(ARRAY['admin','super_admin'])) WITH CHECK (app_private.has_role(ARRAY['admin','super_admin']));
CREATE POLICY tenant_delete ON public."roles" FOR DELETE TO ave_app USING (app_private.has_role(ARRAY['admin','super_admin']));
GRANT SELECT, INSERT, UPDATE, DELETE ON public."roles" TO ave_app;

ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user" FORCE ROW LEVEL SECURITY;
CREATE POLICY authentication ON public."user" TO ave_auth USING (true) WITH CHECK (true);
GRANT SELECT ON public."user" TO ave_auth;

ALTER TABLE public."user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY authentication ON public."user_roles" TO ave_auth USING (true) WITH CHECK (true);
GRANT SELECT ON public."user_roles" TO ave_auth;

ALTER TABLE public."revoked_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."revoked_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY authentication ON public."revoked_sessions" TO ave_auth USING (true) WITH CHECK (true);
GRANT SELECT ON public."revoked_sessions" TO ave_auth;

ALTER TABLE public."authenticator" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."authenticator" FORCE ROW LEVEL SECURITY;
CREATE POLICY authentication ON public."authenticator" TO ave_auth USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public."authenticator" TO ave_auth;

ALTER TABLE public."account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."account" FORCE ROW LEVEL SECURITY;
CREATE POLICY authentication ON public."account" TO ave_auth USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public."account" TO ave_auth;

ALTER TABLE public."session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."session" FORCE ROW LEVEL SECURITY;
CREATE POLICY authentication ON public."session" TO ave_auth USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public."session" TO ave_auth;

ALTER TABLE public."verificationToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."verificationToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY authentication ON public."verificationToken" TO ave_auth USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public."verificationToken" TO ave_auth;

GRANT UPDATE (status, last_login, "emailVerified") ON public."user" TO ave_auth;
GRANT INSERT ON public.audit_logs TO ave_auth;
CREATE POLICY authentication_audit ON public.audit_logs FOR INSERT TO ave_auth WITH CHECK (true);
REVOKE INSERT, UPDATE ON public.audit_logs FROM ave_app;

-- Reject pre-existing inconsistent memberships instead of silently losing data.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.sub_organization_members m
    JOIN public."user" u ON u.id = m.user_id JOIN public.sub_organizations s ON s.id = m.sub_organization_id
    WHERE u.organization_id IS DISTINCT FROM s.organization_id) THEN
    RAISE EXCEPTION 'Repair cross-organization memberships before enabling isolation';
  END IF;
END $$;

-- Invalidate cookies issued before the authentication fixes.
INSERT INTO public.revoked_sessions (user_id, reason) SELECT id, 'admin_revoked' FROM public."user";

-- Reapply AFTER legacy statistics definitions on every migration run.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('get_dashboard_stats', 'get_org_percentiles') LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY INVOKER', f.signature);
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public, pg_temp', f.signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO ave_app, ave_policy', f.signature);
  END LOOP;
END $$;


CREATE OR REPLACE FUNCTION app_private.check_sub_org_move() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id AND EXISTS (
    SELECT 1 FROM public.sub_organization_members WHERE sub_organization_id = OLD.id
  ) THEN RAISE EXCEPTION 'Remove memberships before moving a sub-organization' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION app_private.check_sub_org_move() OWNER TO ave_policy;
REVOKE ALL ON FUNCTION app_private.check_sub_org_move() FROM PUBLIC;
CREATE TRIGGER sub_org_move_check BEFORE UPDATE ON public.sub_organizations FOR EACH ROW EXECUTE FUNCTION app_private.check_sub_org_move();
