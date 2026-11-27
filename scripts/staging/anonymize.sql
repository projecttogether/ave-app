-- Anonymizes a copy of the production database for staging
-- (docs/deployment.md, "Staging data"). scripts/staging/copy-production.sh runs
-- it as the superuser right after restoring the copy, before the staging app
-- starts:
--   psql -U postgres -d postgres -v keep_email=<address> < anonymize.sql
-- keep_email names the one account that keeps its address, to sign in on
-- staging. Every other person becomes person-<n>@staging.invalid, which no mail
-- server accepts, so staging never emails a real person.
--
-- The script stops when the database has a table it does not list below. Decide
-- whether the new table holds personal data, handle it here, and add it to the
-- list.

\set ON_ERROR_STOP on

\if :{?keep_email}
\else
  \warn 'Pass -v keep_email=<address of the account that keeps its address>.'
  select 'keep_email is missing'::int;
\endif

begin;

-- Triggers stay off in this transaction: the history triggers would record the
-- old names, and the guards would refuse changes to immutable history.
set local session_replication_role = replica;

do $$
declare
  known constant text[] := array[
    'app_private.benchmark_questions',      -- scoring setup, no personal data
    'drizzle.__drizzle_migrations',         -- migration log
    'public.account',                       -- sign-in: deleted
    'public.app_content',                   -- texts of the app
    'public.audit_logs',                    -- addresses, names and IPs removed
    'public.authenticator',                 -- passkeys: deleted
    'public.data_freezes',
    'public.indicator_data',                -- figures only
    'public.indicator_report_snapshots',    -- carry site names: deleted
    'public.intake_responses',              -- free text: addresses and phone numbers removed
    'public.operating_data_revisions',      -- figures; reason: addresses removed
    'public.operating_entry_drafts',        -- unsaved drafts: deleted
    'public.operating_mutation_receipts',
    'public.operating_reporting_modes',
    'public.operating_reporting_preferences',
    'public.organizations',                 -- names replaced
    'public.qualitative_responses',         -- free text: addresses and phone numbers removed
    'public.revoked_sessions',              -- sign-in: deleted
    'public.roles',
    'public.session',                       -- sign-in: deleted
    'public.sub_organization_members',
    'public.sub_organizations',             -- names replaced
    'public.user',                          -- names and addresses replaced
    'public.user_roles',
    'public.verificationToken'              -- sign-in codes: deleted
  ];
  unknown text;
begin
  select string_agg(schemaname || '.' || tablename, ', ' order by schemaname, tablename) into unknown
  from pg_tables
  where schemaname not in ('pg_catalog', 'information_schema')
    and schemaname || '.' || tablename <> all (known);
  if unknown is not null then
    raise exception 'anonymize.sql does not cover: %', unknown;
  end if;
end $$;

select count(*) = 1 as keep_found from public."user" where email = lower(:'keep_email') \gset
\if :keep_found
\else
  \warn 'No account has the address in keep_email.'
  select 'keep_email not found'::int;
\endif

-- Sign-in material. Passkeys belong to the production domain and would not work
-- on staging anyway; sign in with an email code and add a new passkey there.
delete from public."session";
delete from public."verificationToken";
delete from public.revoked_sessions;
delete from public.authenticator;
delete from public.account;

-- Drafts and archived reports (the reports carry site names).
delete from public.operating_entry_drafts;
delete from public.indicator_report_snapshots;

-- People: numbered names and addresses that cannot receive mail.
with numbered as (
  select id, row_number() over (order by created_at, id) as n
  from public."user"
  where email is distinct from lower(:'keep_email')
)
update public."user" u
set name = 'Testperson ' || numbered.n,
    email = 'person-' || numbered.n || '@staging.invalid',
    image = null
from numbered
where numbered.id = u.id;

-- Organizations and their sites: businesses, but a name can be a person's.
with numbered as (
  select id, row_number() over (order by created_at, id) as n from public.organizations
)
update public.organizations o
set name = 'Organisation ' || numbered.n
from numbered
where numbered.id = o.id;

with numbered as (
  select id, row_number() over (order by organization_id, created_at, id) as n from public.sub_organizations
)
update public.sub_organizations s
set name = 'Standort ' || numbered.n
from numbered
where numbered.id = s.id;

-- Audit log: no IP addresses. The details lose every field whose name holds
-- "mail" or "name" (email, previousEmail, newEmail, name, ...), at any depth,
-- and any address left in a text.
create function pg_temp.scrub(j jsonb) returns jsonb language plpgsql as $f$
begin
  return case jsonb_typeof(j)
    when 'object' then coalesce((select jsonb_object_agg(k, pg_temp.scrub(v))
                                 from jsonb_each(j) as e(k, v) where k !~* 'mail|name'), '{}'::jsonb)
    when 'array' then coalesce((select jsonb_agg(pg_temp.scrub(v) order by n)
                                from jsonb_array_elements(j) with ordinality as a(v, n)), '[]'::jsonb)
    when 'string' then to_jsonb(regexp_replace(j #>> '{}', '[^\s@]+@[^\s@]+', '[E-Mail entfernt]', 'g'))
    else j end;
end $f$;

update public.audit_logs
set ip_address = null,
    details = pg_temp.scrub(details);

-- Free text: email addresses and phone numbers removed.
update public.intake_responses
set response_text = regexp_replace(regexp_replace(response_text,
      '[^\s@]+@[^\s@]+', '[E-Mail entfernt]', 'g'),
      '(\+|\m0)\d[\d /-]{6,}\d', '[Telefonnummer entfernt]', 'g')
where response_text ~ '@|(\+|\m0)\d[\d /-]{6,}\d';

update public.qualitative_responses
set response_text = regexp_replace(regexp_replace(response_text,
      '[^\s@]+@[^\s@]+', '[E-Mail entfernt]', 'g'),
      '(\+|\m0)\d[\d /-]{6,}\d', '[Telefonnummer entfernt]', 'g')
where response_text ~ '@|(\+|\m0)\d[\d /-]{6,}\d';

update public.operating_data_revisions
set reason = regexp_replace(reason, '[^\s@]+@[^\s@]+', '[E-Mail entfernt]', 'g')
where reason ~ '@';

-- Operating history keeps whole site rows (changed baselines), with the site's
-- old name: it gets the site's new name, or "Standort (gelöscht)" for a site
-- that no longer exists.
update public.operating_data_revisions r
set before = case when jsonb_typeof(r.before) = 'object' and r.before ? 'name'
                  then r.before || jsonb_build_object('name', coalesce(site.name, 'Standort (gelöscht)'))
                  else r.before end,
    after = case when jsonb_typeof(r.after) = 'object' and r.after ? 'name'
                 then r.after || jsonb_build_object('name', coalesce(site.name, 'Standort (gelöscht)'))
                 else r.after end
from public.operating_data_revisions r2
left join public.sub_organizations site
  on site.id::text = coalesce(r2.after ->> 'id', r2.before ->> 'id')
where r2.id = r.id
  and (r.before ? 'name' or r.after ? 'name');

-- Checks: nothing above may have missed an address.
select
  (select count(*) from public."user"
     where email <> lower(:'keep_email') and email !~ '^person-[0-9]+@staging\.invalid$') = 0
  and (select count(*) from public.audit_logs where ip_address is not null or details::text ~ '@'
         or details::text ~* '"[^"]*(mail|name)[^"]*":') = 0
  and (select count(*) from public.operating_data_revisions
         where coalesce(before ->> 'name', after ->> 'name', 'Standort ') !~ '^Standort '
            or coalesce(after ->> 'name', 'Standort ') !~ '^Standort '
            or reason ~ '@') = 0
  and (select count(*) from public.intake_responses where response_text ~ '@') = 0
  and (select count(*) from public.qualitative_responses where response_text ~ '@') = 0
  and (select count(*) from public.account) = 0
  as anonymized \gset
\if :anonymized
\else
  \warn 'Personal data is left; nothing was changed.'
  select 'anonymization incomplete'::int;
\endif

commit;

select (count(*) - 1) || ' people anonymized, 1 account kept' as result from public."user";
