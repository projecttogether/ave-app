-- Reserve each normalized email globally, including pending and disabled accounts.
-- Abort on legacy collisions. Never merge accounts or move their organizations.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public."user" GROUP BY lower(btrim(email)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate normalized user emails must be resolved explicitly before migration';
  END IF;
END $$;
UPDATE public."user" SET email = lower(btrim(email)) WHERE email IS DISTINCT FROM lower(btrim(email));
CREATE UNIQUE INDEX user_email_normalized_unique ON public."user" (lower(btrim(email)));
CREATE FUNCTION app_private.normalize_user_email() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN NEW.email := lower(btrim(NEW.email)); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION app_private.normalize_user_email() FROM PUBLIC;
CREATE TRIGGER normalize_user_email BEFORE INSERT OR UPDATE OF email ON public."user"
  FOR EACH ROW EXECUTE FUNCTION app_private.normalize_user_email();

ALTER TABLE public."user" ADD COLUMN invitation_expires_at timestamptz;
ALTER TABLE public."user" ADD COLUMN invitation_sent_at timestamptz;

-- A dedicated function owner has no login and must never be granted to a login.
-- The web role retains its existing prohibition on account/role writes by managers.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ave_team') THEN CREATE ROLE ave_team NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public, app_private TO ave_team;
GRANT EXECUTE ON FUNCTION app_private.actor_id(), app_private.own_org(), app_private.has_role(text[]) TO ave_team;
GRANT SELECT, INSERT ON public."user", public.user_roles TO ave_team;
GRANT UPDATE (status, invitation_expires_at, invitation_sent_at) ON public."user" TO ave_team;
GRANT SELECT ON public.organizations, public.sub_organizations TO ave_team;
GRANT SELECT, INSERT, DELETE ON public.sub_organization_members TO ave_team;
GRANT INSERT ON public.revoked_sessions, public.audit_logs TO ave_team;
CREATE POLICY team_read ON public."user" FOR SELECT TO ave_team USING (true);
CREATE POLICY team_insert ON public."user" FOR INSERT TO ave_team WITH CHECK (organization_id = app_private.own_org());
CREATE POLICY team_update ON public."user" FOR UPDATE TO ave_team USING (true) WITH CHECK (true);
CREATE POLICY team_read ON public.user_roles FOR SELECT TO ave_team USING (true);
CREATE POLICY team_insert ON public.user_roles FOR INSERT TO ave_team WITH CHECK (role_id IN ('basic_user', 'org_view_only'));
CREATE POLICY team_read ON public.organizations FOR SELECT TO ave_team USING (true);
CREATE POLICY team_read ON public.sub_organizations FOR SELECT TO ave_team USING (true);
CREATE POLICY team_members ON public.sub_organization_members TO ave_team USING (true) WITH CHECK (true);
CREATE POLICY team_revoke ON public.revoked_sessions FOR INSERT TO ave_team WITH CHECK (true);
CREATE POLICY team_audit ON public.audit_logs FOR INSERT TO ave_team WITH CHECK (true);

-- Pending invitations expire until the first verified sign-in activates the account.
CREATE OR REPLACE FUNCTION app_private.has_role(wanted text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public."user" u JOIN public.user_roles r ON r.user_id = u.id
    WHERE u.id = app_private.actor_id() AND u.status IS DISTINCT FROM 'deactivated'
      AND (u.status = 'active' OR u.invitation_expires_at IS NULL OR u.invitation_expires_at > now())
      AND r.role_id = ANY(wanted))
$$;
CREATE OR REPLACE FUNCTION app_private.own_org() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT organization_id FROM public."user" WHERE id = app_private.actor_id() AND status IS DISTINCT FROM 'deactivated'
    AND (status = 'active' OR invitation_expires_at IS NULL OR invitation_expires_at > now())
$$;

CREATE OR REPLACE FUNCTION app_private.protect_user() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  -- Keep the policy lookup in a separate statement. The auth role deliberately
  -- has no USAGE on app_private, even when the boolean expression would skip it.
  IF current_user <> 'ave_team' AND NOT pg_has_role(current_user, 'ave_auth', 'member') THEN
    IF NOT app_private.has_role(ARRAY['admin','super_admin'])
      AND (to_jsonb(NEW) - 'name' - 'onboarding_completed_at') IS DISTINCT FROM (to_jsonb(OLD) - 'name' - 'onboarding_completed_at') THEN
      RAISE EXCEPTION 'Only administrators can change account permissions' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    DELETE FROM public.sub_organization_members WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION app_private.can_manage_org_member(target_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT app_private.has_role(ARRAY['org_manager']) AND target_id <> app_private.actor_id()
    AND EXISTS (SELECT 1 FROM public."user" u WHERE u.id = target_id AND u.organization_id = app_private.own_org())
    AND (SELECT count(*) = 1 AND bool_and(role_id IN ('basic_user','org_view_only'))
      FROM public.user_roles WHERE user_id = target_id)
$$;
ALTER FUNCTION app_private.can_manage_org_member(text) OWNER TO ave_policy;
REVOKE ALL ON FUNCTION app_private.can_manage_org_member(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.can_manage_org_member(text) TO ave_app, ave_team;

CREATE POLICY org_team_roles_read ON public.user_roles FOR SELECT TO ave_app USING (
  app_private.has_role(ARRAY['org_manager']) AND EXISTS (
    SELECT 1 FROM public."user" u WHERE u.id = user_id AND u.organization_id = app_private.own_org()));

-- Existing membership endpoints must respect the same protected-account boundary.
DROP POLICY tenant_insert ON public.sub_organization_members;
DROP POLICY tenant_update ON public.sub_organization_members;
DROP POLICY tenant_delete ON public.sub_organization_members;
CREATE POLICY tenant_insert ON public.sub_organization_members FOR INSERT TO ave_app WITH CHECK (
  app_private.has_role(ARRAY['admin','super_admin']) OR (app_private.can_manage_org_member(user_id)
    AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = sub_organization_members.user_id AND r.role_id = 'basic_user')));
CREATE POLICY tenant_update ON public.sub_organization_members FOR UPDATE TO ave_app
  USING (app_private.has_role(ARRAY['admin','super_admin']) OR (app_private.can_manage_org_member(user_id)
    AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = sub_organization_members.user_id AND r.role_id = 'basic_user')))
  WITH CHECK (app_private.has_role(ARRAY['admin','super_admin']) OR (app_private.can_manage_org_member(user_id)
    AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = sub_organization_members.user_id AND r.role_id = 'basic_user')));
CREATE POLICY tenant_delete ON public.sub_organization_members FOR DELETE TO ave_app USING (
  app_private.has_role(ARRAY['admin','super_admin']) OR (app_private.can_manage_org_member(user_id)
    AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = sub_organization_members.user_id AND r.role_id = 'basic_user')));

-- Serialize role changes with team operations, so a concurrent promotion cannot
-- make a checked ordinary account privileged halfway through a team mutation.
CREATE FUNCTION app_private.lock_user_role_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM id FROM public."user" WHERE id IN (CASE WHEN TG_OP <> 'INSERT' THEN OLD.user_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.user_id END) ORDER BY id FOR UPDATE;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION app_private.lock_user_role_change() OWNER TO ave_team;
REVOKE ALL ON FUNCTION app_private.lock_user_role_change() FROM PUBLIC;
CREATE TRIGGER lock_user_role_change BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION app_private.lock_user_role_change();

CREATE FUNCTION app_private.require_team_manager() RETURNS uuid
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE org_id uuid;
BEGIN
  PERFORM id FROM public."user" WHERE id = app_private.actor_id() FOR UPDATE;
  org_id := app_private.own_org();
  IF org_id IS NULL OR NOT app_private.has_role(ARRAY['org_manager']) THEN
    RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN org_id;
END $$;
ALTER FUNCTION app_private.require_team_manager() OWNER TO ave_team;
REVOKE ALL ON FUNCTION app_private.require_team_manager() FROM PUBLIC;

CREATE FUNCTION app_private.check_team_kitchens(org_id uuid, kitchen_ids uuid[]) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF kitchen_ids IS NULL OR cardinality(kitchen_ids) NOT BETWEEN 1 AND 500
    OR EXISTS (SELECT 1 FROM unnest(kitchen_ids) k WHERE k IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.sub_organizations s WHERE s.id = k AND s.organization_id = org_id)) THEN
    RAISE EXCEPTION 'TEAM_INVALID_KITCHENS' USING ERRCODE = '22023';
  END IF;
END $$;
ALTER FUNCTION app_private.check_team_kitchens(uuid, uuid[]) OWNER TO ave_team;
REVOKE ALL ON FUNCTION app_private.check_team_kitchens(uuid, uuid[]) FROM PUBLIC;

CREATE FUNCTION app_private.create_org_invitation(invite_email text, invite_role text, kitchen_ids uuid[])
RETURNS TABLE (id text, email text, organization_name text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE org_id uuid; new_id text := gen_random_uuid()::text; deadline timestamptz := now() + interval '7 days';
BEGIN
  org_id := app_private.require_team_manager();
  IF invite_role IS NULL OR invite_role NOT IN ('basic_user','org_view_only')
    OR invite_email IS NULL OR length(btrim(invite_email)) NOT BETWEEN 3 AND 255
    OR position('@' IN invite_email) = 0 THEN
    RAISE EXCEPTION 'TEAM_INVALID_INVITATION' USING ERRCODE = '22023';
  END IF;
  IF invite_role = 'basic_user' THEN PERFORM app_private.check_team_kitchens(org_id, kitchen_ids);
  ELSIF kitchen_ids IS NULL OR cardinality(kitchen_ids) <> 0 THEN
    RAISE EXCEPTION 'TEAM_INVALID_KITCHENS' USING ERRCODE = '22023';
  END IF;
  -- Deliberately INSERT only. Global uniqueness also rejects foreign-org accounts
  -- hidden by RLS and concurrent invitations; nothing is attached or transferred.
  INSERT INTO public."user" (id,email,organization_id,status,invitation_expires_at)
    VALUES (new_id,lower(btrim(invite_email)),org_id,'pending',deadline);
  INSERT INTO public.user_roles (user_id,role_id) VALUES (new_id,invite_role);
  INSERT INTO public.sub_organization_members (user_id,sub_organization_id)
    SELECT new_id,k FROM (SELECT DISTINCT unnest(kitchen_ids) k) kitchens;
  INSERT INTO public.audit_logs (user_id,organization_id,action,resource,resource_type,details)
    VALUES (app_private.actor_id(),org_id,'org.invitation_created','user:' || new_id,'user',
      jsonb_build_object('role',invite_role,'subOrganizationIds',kitchen_ids));
  RETURN QUERY SELECT new_id,lower(btrim(invite_email)),o.name,deadline FROM public.organizations o WHERE o.id = org_id;
END $$;
ALTER FUNCTION app_private.create_org_invitation(text,text,uuid[]) OWNER TO ave_team;
REVOKE ALL ON FUNCTION app_private.create_org_invitation(text,text,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.create_org_invitation(text,text,uuid[]) TO ave_app;

CREATE FUNCTION app_private.manage_org_member(target_id text, operation text, kitchen_ids uuid[] DEFAULT '{}')
RETURNS TABLE (id text, email text, organization_name text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE org_id uuid; target public."user"; event_name text;
BEGIN
  org_id := app_private.require_team_manager();
  SELECT * INTO target FROM public."user" u WHERE u.id = target_id FOR UPDATE;
  IF target.id IS NULL OR NOT coalesce(app_private.can_manage_org_member(target_id),false) THEN
    RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF operation = 'sent' THEN
    -- Delivery can finish after cancellation, suspension or acceptance. Never undo them.
    UPDATE public."user" u SET invitation_sent_at = now(), status = 'invited'
      WHERE u.id = target_id AND u.status IN ('pending','invited');
    event_name := 'org.invitation_sent';
  ELSIF operation IN ('resend','cancel') THEN
    IF target.status IS NULL OR target.status NOT IN ('pending','invited') THEN
      RAISE EXCEPTION 'TEAM_NOT_PENDING' USING ERRCODE = '22023';
    END IF;
    IF operation = 'resend' THEN
      UPDATE public."user" u SET invitation_expires_at = now() + interval '7 days' WHERE u.id = target_id;
      event_name := 'org.invitation_renewed';
    ELSE
      UPDATE public."user" u SET status = 'deactivated' WHERE u.id = target_id;
      event_name := 'org.invitation_cancelled';
    END IF;
  ELSIF operation = 'suspend' THEN
    IF target.status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'TEAM_NOT_ACTIVE' USING ERRCODE = '22023';
    END IF;
    UPDATE public."user" u SET status = 'deactivated' WHERE u.id = target_id;
    event_name := 'org.member_suspended';
  ELSIF operation = 'kitchens' THEN
    IF target.status = 'deactivated' OR NOT EXISTS (
      SELECT 1 FROM public.user_roles r WHERE r.user_id = target_id AND r.role_id = 'basic_user') THEN
      RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    PERFORM app_private.check_team_kitchens(org_id, kitchen_ids);
    DELETE FROM public.sub_organization_members WHERE user_id = target_id;
    INSERT INTO public.sub_organization_members (user_id,sub_organization_id)
      SELECT target_id,k FROM (SELECT DISTINCT unnest(kitchen_ids) k) kitchens;
    event_name := 'org.member_kitchens_updated';
  ELSE
    RAISE EXCEPTION 'TEAM_INVALID_OPERATION' USING ERRCODE = '22023';
  END IF;
  IF operation IN ('cancel','suspend','kitchens') THEN
    INSERT INTO public.revoked_sessions (user_id,reason) VALUES (target_id,'admin_revoked');
  END IF;
  INSERT INTO public.audit_logs (user_id,organization_id,action,resource,resource_type,details)
    VALUES (app_private.actor_id(),org_id,event_name,'user:' || target_id,'user',
      CASE WHEN operation = 'kitchens' THEN jsonb_build_object('subOrganizationIds',kitchen_ids) ELSE '{}'::jsonb END);
  RETURN QUERY SELECT u.id,u.email,o.name,u.invitation_expires_at FROM public."user" u
    JOIN public.organizations o ON o.id = u.organization_id WHERE u.id = target_id;
END $$;
ALTER FUNCTION app_private.manage_org_member(text,text,uuid[]) OWNER TO ave_team;
REVOKE ALL ON FUNCTION app_private.manage_org_member(text,text,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.manage_org_member(text,text,uuid[]) TO ave_app;
