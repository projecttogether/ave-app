import { Pool } from 'pg'
import { FORMULA_REVISION } from '@/lib/indicators/revision'

const migrationHelp = 'Start the container with its default command so automatic database setup runs first. See docs/coolify.md.'

/** Fail startup rather than serve tenant data with an owner/superuser connection. */
export async function verifyDatabaseIsolation(environment: Readonly<Record<string, string | undefined>> = process.env) {
  const connections = [
    ['DATABASE_URL', environment.DATABASE_URL, 'ave_app'],
    ['AUTH_DATABASE_URL', environment.AUTH_DATABASE_URL, 'ave_auth'],
  ] as const
  for (const [name, url] of connections) {
    if (!url) throw new Error(`${name} is required. ${migrationHelp}`)
  }
  for (const [name, url, expected] of connections) {
    const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 10000 })
    try {
      // pg_has_role throws for missing roles, hiding the skipped migration.
      const { rows: installedRoles } = await pool.query<{ rolname: string }>(
        'SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])',
        [['ave_app', 'ave_auth', 'ave_policy', 'ave_team']],
      )
      const missing = ['ave_app', 'ave_auth', 'ave_policy', 'ave_team'].filter(role => !installedRoles.some(row => row.rolname === role))
      if (missing.length) throw new Error(`Tenant isolation migration is missing for ${name}: missing roles ${missing.join(', ')}. ${migrationHelp}`)

      const { rows: [role] } = await pool.query(`SELECT r.rolsuper, r.rolbypassrls, r.rolcreaterole,
        has_schema_privilege(current_user, 'public', 'CREATE') AS can_create,
        pg_has_role(current_user, $1, 'member') AS allowed,
        pg_has_role(current_user, 'ave_policy', 'member') AS policy_owner,
        pg_has_role(current_user, 'ave_team', 'member') AS team_owner,
        pg_has_role(current_user, $2, 'member') AS other_role,
        EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND pg_has_role(current_user, c.relowner, 'member')) AS owns_tables
        FROM pg_roles r WHERE r.rolname = current_user`, [expected, expected === 'ave_app' ? 'ave_auth' : 'ave_app'])
      if (!role?.allowed || role.rolsuper || role.rolbypassrls || role.rolcreaterole || role.can_create || role.policy_owner || role.team_owner || role.other_role || role.owns_tables) {
        throw new Error(`Unsafe database privileges for ${name}; use a separate restricted login with only ${expected} membership. See docs/tenant-isolation.md.`)
      }
      const { rows: [checks] } = await pool.query(`SELECT
        (SELECT count(*) = 23 AND bool_and(c.relrowsecurity AND c.relforcerowsecurity)
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname IN ('organizations','sub_organizations',
          'indicator_data','qualitative_responses','intake_responses','user','user_roles','sub_organization_members',
          'account','session','verificationToken','authenticator','roles','revoked_sessions','audit_logs','app_content','data_freezes','indicator_report_snapshots','operating_reporting_modes','operating_entry_drafts','operating_mutation_receipts','operating_data_revisions','operating_reporting_preferences')) AS protected,
        (SELECT count(DISTINCT p.proname) = 4 AND bool_and(NOT p.prosecdef) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname IN ('get_dashboard_stats','get_org_percentiles','get_indicator_measurements','get_live_qualitative_scores')) AS safe_functions,
        to_regprocedure('public.get_benchmark_stats(integer,text)') IS NOT NULL AS benchmark,
        (SELECT count(*) = 2 AND bool_and(p.prosecdef AND p.proowner = 'ave_team'::regrole)
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'app_private' AND p.proname IN ('create_org_invitation','manage_org_member')) AS team_functions,
        EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
          WHERE i.indrelid = 'public."user"'::regclass AND c.relname = 'user_email_normalized_unique'
          AND i.indisunique AND i.indisvalid) AS unique_email`)
      if (!checks.protected || !checks.safe_functions || !checks.benchmark) throw new Error(`Tenant isolation migration is missing or incomplete for ${name}. ${migrationHelp}`)
      if (!checks.team_functions || !checks.unique_email) throw new Error(`Organization team migration is missing or incomplete for ${name}. ${migrationHelp}`)
      const { rows: [formulaFunction] } = await pool.query("SELECT to_regprocedure('public.indicator_formula_revision()') IS NOT NULL AS installed")
      if (!formulaFunction.installed) throw new Error(`Formula migrations are missing for ${name}. ${migrationHelp}`)
      const { rows: [formula] } = await pool.query('SELECT public.indicator_formula_revision() AS revision')
      if (formula.revision !== FORMULA_REVISION) throw new Error(`Installed formula revision does not match the application for ${name}. ${migrationHelp}`)
    } finally { await pool.end() }
  }
}
