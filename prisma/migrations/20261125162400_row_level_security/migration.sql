-- Row Level Security, runtime role privileges and tenant helper functions.
--
-- Model
-- - Migrations run as the table owner. The owner is NOT subject to RLS (no FORCE),
--   which is what lets the SECURITY DEFINER helpers below read memberships without
--   recursing into their own policies.
-- - The app connects as `rotiqa_app`: not an owner, NOSUPERUSER, NOBYPASSRLS, DML only.
--   RLS therefore always applies to every query the app makes.
-- - The app sets `app.user_id` / `app.org_id` with set_config(..., true) at the start of
--   each request transaction (server/modules/tenancy/context.ts). Transaction-local
--   settings are discarded on commit/rollback, so they never leak to the next user of a
--   pooled connection. Without a context, current_* return NULL and policies match nothing.
-- - Better Auth tables (users, sessions, accounts, verifications) are not tenant-owned and
--   have no RLS; they are protected in the application layer.
--
-- Every future migration that adds a table must grant `rotiqa_app` explicitly and add RLS.

-- ─── Runtime role ─────────────────────────────────────────────────────────────
-- Created NOLOGIN if missing; login and password are configured outside migrations
-- (docker/postgres/init for local development, CI step, or infrastructure in production).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rotiqa_app') THEN
    CREATE ROLE rotiqa_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO rotiqa_app;

-- ─── Data integrity constraints ───────────────────────────────────────────────
ALTER TABLE organizations ADD CONSTRAINT organizations_name_not_blank CHECK (length(btrim(name)) > 0);
ALTER TABLE organizations ADD CONSTRAINT organizations_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE locations ADD CONSTRAINT locations_name_not_blank CHECK (length(btrim(name)) > 0);
ALTER TABLE departments ADD CONSTRAINT departments_name_not_blank CHECK (length(btrim(name)) > 0);
ALTER TABLE departments ADD CONSTRAINT departments_color_hex CHECK (color ~ '^#[0-9A-Fa-f]{6}$');
ALTER TABLE employees ADD CONSTRAINT employees_names_not_blank CHECK (length(btrim(first_name)) > 0 AND length(btrim(last_name)) > 0);
ALTER TABLE employees ADD CONSTRAINT employees_archive_consistent CHECK (is_active = (archived_at IS NULL));
ALTER TABLE invitations ADD CONSTRAINT invitations_email_lowercase CHECK (email = lower(email));

-- ─── Table privileges (least privilege; no DDL, no TRUNCATE, no REFERENCES) ──
-- Better Auth
GRANT SELECT, INSERT, UPDATE ON users TO rotiqa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO rotiqa_app;
GRANT SELECT, INSERT, UPDATE ON accounts TO rotiqa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON verifications TO rotiqa_app;
-- Tenancy & staff. No DELETE on organizations, locations, departments, employees:
-- they are archived, never removed, to preserve schedule/timesheet history.
GRANT SELECT, INSERT, UPDATE ON organizations TO rotiqa_app;
GRANT SELECT, INSERT, UPDATE ON locations TO rotiqa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON memberships TO rotiqa_app;
GRANT SELECT, INSERT, DELETE ON location_access TO rotiqa_app;
GRANT SELECT, INSERT, UPDATE ON departments TO rotiqa_app;
GRANT SELECT, INSERT, UPDATE ON employees TO rotiqa_app;
GRANT SELECT, INSERT, UPDATE ON invitations TO rotiqa_app;
GRANT SELECT, INSERT ON invitation_locations TO rotiqa_app;
GRANT SELECT, INSERT ON audit_logs TO rotiqa_app;

-- ─── Helper functions ─────────────────────────────────────────────────────────
CREATE SCHEMA app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO rotiqa_app;

CREATE FUNCTION app.current_user_id() RETURNS text
  LANGUAGE sql STABLE
  SET search_path = pg_catalog
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '') $$;

CREATE FUNCTION app.current_org_id() RETURNS uuid
  LANGUAGE sql STABLE
  SET search_path = pg_catalog
  AS $$ SELECT NULLIF(current_setting('app.org_id', true), '')::uuid $$;

-- SECURITY DEFINER: runs as the owner (not subject to RLS) so policies on memberships
-- can call it without recursion. Each only answers a yes/no question about the
-- *current* user; none accepts a user id from the caller.
CREATE FUNCTION app.is_member(org uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.organization_id = org AND m.user_id = app.current_user_id()
    )
  $$;

CREATE FUNCTION app.is_owner(org uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.organization_id = org AND m.user_id = app.current_user_id() AND m.role = 'OWNER'
    )
  $$;

CREATE FUNCTION app.can_access_location(org uuid, loc uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
  AS $$
    SELECT app.is_owner(org) OR EXISTS (
      SELECT 1
      FROM public.location_access la
      JOIN public.memberships m ON m.id = la.membership_id AND m.organization_id = la.organization_id
      WHERE la.organization_id = org AND la.location_id = loc AND m.user_id = app.current_user_id()
    )
  $$;

-- True when the organization has any membership. Used only by the bootstrap policy that
-- lets an organization's creator insert the first OWNER membership.
CREATE FUNCTION app.org_has_members(org uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
  AS $$ SELECT EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id = org) $$;

-- ─── Invitation functions (the only cross-tenant entry points) ────────────────
-- An invitee is not a member yet, so RLS hides the invitation. These two functions
-- expose exactly what acceptance needs, keyed by the SHA-256 hash of the secret token.

CREATE FUNCTION app.invitation_preview(p_token_hash text)
  RETURNS TABLE (organization_name text, email text, status text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
  AS $$
    SELECT o.name,
           i.email,
           CASE
             WHEN i.revoked_at IS NOT NULL THEN 'REVOKED'
             WHEN i.accepted_at IS NOT NULL THEN 'ACCEPTED'
             WHEN i.expires_at <= now() THEN 'EXPIRED'
             ELSE 'PENDING'
           END
    FROM public.invitations i
    JOIN public.organizations o ON o.id = i.organization_id
    WHERE i.token_hash = p_token_hash
  $$;

-- Accepts a pending invitation for the current user. Atomic and single-use: the row is
-- locked, every condition re-checked, and the invitation marked accepted in one statement
-- sequence. Errors use SQLSTATE P0001 with a stable message the app maps to Turkish text.
CREATE FUNCTION app.accept_invitation(p_token_hash text) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
  AS $$
  DECLARE
    v_user_id text := app.current_user_id();
    v_email text;
    v_inv public.invitations%ROWTYPE;
    v_membership_id uuid;
  BEGIN
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'INVITATION_UNAUTHENTICATED';
    END IF;

    SELECT * INTO v_inv FROM public.invitations WHERE token_hash = p_token_hash FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVITATION_NOT_FOUND';
    END IF;
    IF v_inv.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'INVITATION_REVOKED';
    END IF;
    IF v_inv.accepted_at IS NOT NULL THEN
      RAISE EXCEPTION 'INVITATION_ALREADY_USED';
    END IF;
    IF v_inv.expires_at <= now() THEN
      RAISE EXCEPTION 'INVITATION_EXPIRED';
    END IF;

    SELECT lower(u.email) INTO v_email FROM public.users u WHERE u.id = v_user_id;
    IF v_email IS NULL OR v_email <> v_inv.email THEN
      RAISE EXCEPTION 'INVITATION_EMAIL_MISMATCH';
    END IF;

    IF EXISTS (SELECT 1 FROM public.memberships WHERE organization_id = v_inv.organization_id AND user_id = v_user_id) THEN
      RAISE EXCEPTION 'INVITATION_ALREADY_MEMBER';
    END IF;

    INSERT INTO public.memberships (id, user_id, organization_id, role, created_at, updated_at)
    VALUES (gen_random_uuid(), v_user_id, v_inv.organization_id, v_inv.role, now(), now())
    RETURNING id INTO v_membership_id;

    INSERT INTO public.location_access (membership_id, location_id, organization_id, created_at)
    SELECT v_membership_id, il.location_id, il.organization_id, now()
    FROM public.invitation_locations il
    JOIN public.locations l ON l.id = il.location_id AND l.organization_id = il.organization_id AND l.is_active
    WHERE il.invitation_id = v_inv.id;

    UPDATE public.invitations SET accepted_at = now(), accepted_by_id = v_user_id WHERE id = v_inv.id;

    INSERT INTO public.audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, created_at)
    VALUES (gen_random_uuid(), v_inv.organization_id, v_user_id, 'invitation.accepted', 'invitation', v_inv.id::text, now());

    RETURN v_inv.organization_id;
  END
  $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO rotiqa_app;

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- organizations: not scoped to app.org_id, so the organization switcher can list every
-- organization the user belongs to. The creator can see the row before the OWNER
-- membership exists (required for INSERT ... RETURNING during onboarding).
CREATE POLICY organizations_select ON organizations FOR SELECT TO rotiqa_app
  USING (app.is_member(id) OR created_by_id = app.current_user_id());
CREATE POLICY organizations_insert ON organizations FOR INSERT TO rotiqa_app
  WITH CHECK (created_by_id = app.current_user_id());
CREATE POLICY organizations_update ON organizations FOR UPDATE TO rotiqa_app
  USING (app.is_owner(id)) WITH CHECK (app.is_owner(id));

-- memberships
CREATE POLICY memberships_select ON memberships FOR SELECT TO rotiqa_app
  USING (
    user_id = app.current_user_id()
    OR (organization_id = app.current_org_id() AND app.is_member(organization_id))
  );
-- Bootstrap: the creator of an organization with no members becomes its first OWNER.
-- All other memberships are created by app.accept_invitation().
CREATE POLICY memberships_insert_bootstrap ON memberships FOR INSERT TO rotiqa_app
  WITH CHECK (
    role = 'OWNER'
    AND user_id = app.current_user_id()
    AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = organization_id AND o.created_by_id = app.current_user_id())
    AND NOT app.org_has_members(organization_id)
  );
CREATE POLICY memberships_update ON memberships FOR UPDATE TO rotiqa_app
  USING (organization_id = app.current_org_id() AND app.is_owner(organization_id))
  WITH CHECK (organization_id = app.current_org_id() AND app.is_owner(organization_id));
CREATE POLICY memberships_delete ON memberships FOR DELETE TO rotiqa_app
  USING (organization_id = app.current_org_id() AND app.is_owner(organization_id));

-- locations: OWNER sees all, MANAGER only assigned ones; only OWNER writes.
CREATE POLICY locations_select ON locations FOR SELECT TO rotiqa_app
  USING (organization_id = app.current_org_id() AND app.can_access_location(organization_id, id));
CREATE POLICY locations_insert ON locations FOR INSERT TO rotiqa_app
  WITH CHECK (organization_id = app.current_org_id() AND app.is_owner(organization_id));
CREATE POLICY locations_update ON locations FOR UPDATE TO rotiqa_app
  USING (organization_id = app.current_org_id() AND app.is_owner(organization_id))
  WITH CHECK (organization_id = app.current_org_id() AND app.is_owner(organization_id));

-- location_access
CREATE POLICY location_access_select ON location_access FOR SELECT TO rotiqa_app
  USING (
    organization_id = app.current_org_id()
    AND (
      app.is_owner(organization_id)
      OR membership_id IN (SELECT m.id FROM memberships m WHERE m.user_id = app.current_user_id())
    )
  );
CREATE POLICY location_access_insert ON location_access FOR INSERT TO rotiqa_app
  WITH CHECK (organization_id = app.current_org_id() AND app.is_owner(organization_id));
CREATE POLICY location_access_delete ON location_access FOR DELETE TO rotiqa_app
  USING (organization_id = app.current_org_id() AND app.is_owner(organization_id));

-- departments: every member reads (to assign employees); only OWNER writes.
CREATE POLICY departments_select ON departments FOR SELECT TO rotiqa_app
  USING (organization_id = app.current_org_id() AND app.is_member(organization_id));
CREATE POLICY departments_insert ON departments FOR INSERT TO rotiqa_app
  WITH CHECK (organization_id = app.current_org_id() AND app.is_owner(organization_id));
CREATE POLICY departments_update ON departments FOR UPDATE TO rotiqa_app
  USING (organization_id = app.current_org_id() AND app.is_owner(organization_id))
  WITH CHECK (organization_id = app.current_org_id() AND app.is_owner(organization_id));

-- employees: anyone with access to the employee's location. WITH CHECK also stops moving
-- an employee into a location the user cannot access. No DELETE policy (and no grant).
CREATE POLICY employees_select ON employees FOR SELECT TO rotiqa_app
  USING (organization_id = app.current_org_id() AND app.can_access_location(organization_id, location_id));
CREATE POLICY employees_insert ON employees FOR INSERT TO rotiqa_app
  WITH CHECK (organization_id = app.current_org_id() AND app.can_access_location(organization_id, location_id));
CREATE POLICY employees_update ON employees FOR UPDATE TO rotiqa_app
  USING (organization_id = app.current_org_id() AND app.can_access_location(organization_id, location_id))
  WITH CHECK (organization_id = app.current_org_id() AND app.can_access_location(organization_id, location_id));

-- invitations: OWNER only (acceptance goes through app.accept_invitation).
CREATE POLICY invitations_select ON invitations FOR SELECT TO rotiqa_app
  USING (organization_id = app.current_org_id() AND app.is_owner(organization_id));
CREATE POLICY invitations_insert ON invitations FOR INSERT TO rotiqa_app
  WITH CHECK (organization_id = app.current_org_id() AND app.is_owner(organization_id) AND invited_by_id = app.current_user_id());
CREATE POLICY invitations_update ON invitations FOR UPDATE TO rotiqa_app
  USING (organization_id = app.current_org_id() AND app.is_owner(organization_id))
  WITH CHECK (organization_id = app.current_org_id() AND app.is_owner(organization_id));

CREATE POLICY invitation_locations_select ON invitation_locations FOR SELECT TO rotiqa_app
  USING (organization_id = app.current_org_id() AND app.is_owner(organization_id));
CREATE POLICY invitation_locations_insert ON invitation_locations FOR INSERT TO rotiqa_app
  WITH CHECK (organization_id = app.current_org_id() AND app.is_owner(organization_id));

-- audit_logs: members append their own actions; OWNER reads.
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT TO rotiqa_app
  USING (organization_id = app.current_org_id() AND app.is_owner(organization_id));
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO rotiqa_app
  WITH CHECK (organization_id = app.current_org_id() AND app.is_member(organization_id) AND actor_user_id = app.current_user_id());
