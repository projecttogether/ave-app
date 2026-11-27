-- Mirror the application's protected-account rules for updates, as 0040 did
-- for deletes. Without this, any administrator code path that writes "user"
-- could change a super admin's login email and then sign in as that account.
DROP POLICY tenant_update ON public."user";
CREATE POLICY tenant_update ON public."user" FOR UPDATE TO ave_app USING (
  id = app_private.actor_id() OR (app_private.has_role(ARRAY['admin','super_admin'])
    AND (app_private.has_role(ARRAY['super_admin'])
      OR NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = "user".id AND r.role_id = 'super_admin')))
) WITH CHECK (
  id = app_private.actor_id() OR (app_private.has_role(ARRAY['admin','super_admin'])
    AND (app_private.has_role(ARRAY['super_admin'])
      OR NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = "user".id AND r.role_id = 'super_admin')))
);

-- Only super admins revoke a super admin's sessions.
DROP POLICY tenant_insert ON public."revoked_sessions";
CREATE POLICY tenant_insert ON public."revoked_sessions" FOR INSERT TO ave_app WITH CHECK (
  user_id = app_private.actor_id() OR (app_private.has_role(ARRAY['admin','super_admin'])
    AND (app_private.has_role(ARRAY['super_admin'])
      OR NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = revoked_sessions.user_id AND r.role_id = 'super_admin')))
);

-- Changing a login email removes the account's passkeys (see
-- src/lib/admin/login-email.ts). Administrators may remove passkeys of
-- ordinary accounts; only super admins may remove those of administrators.
-- A DELETE with a WHERE clause also applies SELECT policies to the rows it
-- reads, so the same administrators need read access or nothing is removed.
CREATE POLICY admin_read ON public."authenticator" FOR SELECT TO ave_app USING (
  app_private.has_role(ARRAY['admin','super_admin']) AND (app_private.has_role(ARRAY['super_admin'])
    OR NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = "authenticator"."userId" AND r.role_id IN ('admin','super_admin')))
);
CREATE POLICY admin_delete ON public."authenticator" FOR DELETE TO ave_app USING (
  app_private.has_role(ARRAY['admin','super_admin']) AND (app_private.has_role(ARRAY['super_admin'])
    OR NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = "authenticator"."userId" AND r.role_id IN ('admin','super_admin')))
);

-- A login email decides who can sign in to an account. Only super admins
-- change the login email of another administrator.
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
    IF NEW.email IS DISTINCT FROM OLD.email AND NEW.id IS DISTINCT FROM app_private.actor_id()
      AND NOT app_private.has_role(ARRAY['super_admin'])
      AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = NEW.id AND r.role_id IN ('admin','super_admin')) THEN
      RAISE EXCEPTION 'Only super admins can change an administrator''s login email' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    DELETE FROM public.sub_organization_members WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
