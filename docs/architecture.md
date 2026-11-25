# Rotiqa architecture

This document records decisions that are not obvious from the code: how tenants are isolated,
what the known limits are, and how scheduling and timesheet data will stay separate.

## Modules

One Nuxt application (modular monolith). HTTP handlers in `server/api/` are thin: authenticate,
parse input, call a module function, map errors. Business rules live in `server/modules/`:

| Module | Responsibility |
| --- | --- |
| `tenancy/` | Tenant context, organization access, organizations, locations, invitations |
| `staff/` | Departments and employees |
| `audit/` | Append-only audit records |
| `schedule-image/` | Server-side PNG rendering of a weekly schedule |

Validation schemas in `shared/schemas/` are shared by forms and API handlers.

## Authentication

[Better Auth](https://www.better-auth.com) with email and password, stored through its Prisma
adapter (`users`, `sessions`, `accounts`, `verifications`). Password hashing, session cookies and
rate limiting are Better Auth's; Rotiqa adds none of its own. Every API route checks the session
server-side (`requireUser`); the client-side route guard only improves navigation.

Mutating API requests are also rejected when their `Origin` header does not match the host
(CSRF defense in depth next to `SameSite=Lax` cookies).

## Tenant isolation

Isolation is enforced twice: in the application layer and by PostgreSQL Row Level Security.

### Database roles

| Role | Used by | Privileges |
| --- | --- | --- |
| `rotiqa` (owner) | `prisma migrate` only (`MIGRATION_DATABASE_URL`) | Owns all tables and functions |
| `rotiqa_app` | The running app (`DATABASE_URL`) | `NOSUPERUSER NOBYPASSRLS`, not an owner, table-level DML only |

`rotiqa_app` has no DDL, no `TRUNCATE`, no access to `_prisma_migrations`, and no `DELETE` on
organizations, locations, departments or employees (those are archived, never deleted).
Migrations create the role `NOLOGIN` if it is missing; its password is set outside migrations.

RLS is enabled but not `FORCE`d: the owner is deliberately exempt so the `SECURITY DEFINER`
helpers below can read memberships without recursing into their own policies. The app can never
act as the owner because it connects with a different role (verified by `tests/integration/db-roles.test.ts`).

Every migration that adds a table must grant `rotiqa_app` explicitly and enable RLS on it.

### Request-scoped tenant context

`withTenant()` (`server/modules/tenancy/context.ts`) runs each request in one transaction and sets:

```sql
SELECT set_config('app.user_id', $user, true), set_config('app.org_id', $org, true);
```

`is_local = true` scopes both values to the transaction; PostgreSQL discards them on commit or
rollback, so a pooled connection never carries one request's tenant into the next. Queries
outside `withTenant()` have no context and see no tenant rows (fail closed).

`runInOrganization()` resolves the organization from the URL slug *through RLS* and requires a
membership before setting `app.org_id`. Client-supplied organization or location ids are never
used for authorization; an unknown and a foreign organization both return 404.

### Policies

Helper functions in schema `app` (`is_member`, `is_owner`, `can_access_location`) are
`SECURITY DEFINER`, `STABLE`, have a fixed `search_path`, are not executable by `PUBLIC`, and only
answer questions about the *current* user. Summary:

| Table | Read | Write |
| --- | --- | --- |
| organizations | member, or creator | insert: self as creator; update: OWNER |
| memberships | own rows, or members of the current org | first OWNER (bootstrap); update/delete: OWNER |
| locations, location_access | OWNER: all; MANAGER: assigned | OWNER |
| departments | members | OWNER |
| employees | users with access to the employee's location | same (no delete) |
| invitations, invitation_locations | OWNER | OWNER |
| audit_logs | OWNER | members, as themselves |

Tenant tables reference each other with composite foreign keys (`id`, `organization_id`), so a
row cannot point into another organization even if a policy were wrong.

### Invitations (the only cross-tenant entry points)

An invitee is not a member yet, so RLS hides the invitation. Two narrow `SECURITY DEFINER`
functions handle it:

- `app.invitation_preview(token_hash)` returns organization name, invited email and status.
- `app.accept_invitation(token_hash)` locks the invitation (`FOR UPDATE`), checks revocation,
  expiry, single use and that the signed-in user's email matches, then creates the MANAGER
  membership and location access in the same transaction.

Tokens are 256-bit random values shown once; only their SHA-256 hash is stored. Invitations
expire after 7 days.

**Email delivery is not implemented.** The owner copies the link and shares it; the UI says so
explicitly and never claims an email was sent.

### Tests

`tests/integration/` runs against `rotiqa_test` as `rotiqa_app`:

- `db-roles` — role attributes, ownership, privileges, function hardening
- `rls` — raw SQL attempts across organizations and locations, bootstrap rules, pooled-connection leakage
- `invitations` — definer functions: expiry, revocation, reuse, wrong account, concurrency
- `staff`, `organizations`, `auth` — service-level permissions and Better Auth flows

## Known limitations

- Better Auth tables have no RLS; they are protected by the application layer only.
- The creator of an organization can still *see* (not modify) its row after losing membership.
- Better Auth's rate limiter is in-memory: per instance, reset on restart. Behind a proxy, its
  client IP header must be configured so clients cannot spoof it.
- Owners cannot yet change a manager's locations or remove members from the UI.
- A single OWNER per organization is assumed in the UI; ownership transfer is not implemented.
- Employees belong to one location. Multi-location staffing will need a separate relation.

## Production database setup (outline)

1. Create the owner role and database; run `prisma migrate deploy` with `MIGRATION_DATABASE_URL`.
2. Give the runtime role a login: `ALTER ROLE rotiqa_app LOGIN PASSWORD '<secret>';`
   and `GRANT CONNECT ON DATABASE <db> TO rotiqa_app;`.
3. Point `DATABASE_URL` at `rotiqa_app`. Never run the app as the owner.
4. Set `BETTER_AUTH_SECRET` (≥ 32 random bytes) and `BETTER_AUTH_URL`.

The demo (`rotiqa_demo`) will use a separate database with the same roles and fake data only.

## Schedules vs. timesheets

Planned work and actual attendance are different facts and will live in different tables:

| | Planned (F2) | Actual (timesheet phase) |
| --- | --- | --- |
| Table | `ShiftAssignment` | `AttendanceRecord` (clock-in/out, breaks, manual entries, corrections) |
| Key | employee + location + work date | employee + location + work date |
| Hours | Snapshot of the shift code's start/end at assignment time | Recorded timestamps with source (manual, PDF import) and approval |

Both reference `Employee` and `Location`; neither is derived from the other. Planned-vs-actual,
overtime and monthly reports are computed by joining them per employee and local work day, using
the location's IANA `timezone` (already stored) so night shifts crossing midnight belong to the
day they started. Because employees and locations are archived instead of deleted (`RESTRICT`
foreign keys), historical schedules and timesheets stay valid.
