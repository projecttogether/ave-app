# Formula reliability

The calculation detail page includes a “Berechnung und Datenabdeckung” panel. It shows the selected records, exclusions, weighted numerator and denominator, missing months, questionnaire points, and food-waste baseline sources. CSV exports support reconciliation; JSON exports contain the full calculation inputs, rules and results.

## Input rules

Forms, server actions and CSV imports use `src/lib/indicators/validation.ts`. PostgreSQL also checks numerical bounds and category relationships, including writes that bypass the application.

- Enter net amounts from 0 through 1,000,000,000,000, with at most six decimal places. Apply credits to the same category and reporting period. A negative net amount requires correction before reporting.
- CSV numbers use a decimal point and no thousands separators, for example `1234.56`. The German form inputs still format amounts for display.
- Certified spending requires the matching category total and cannot exceed it. Bio spending requires total food spending.
- Meat, fish, dairy, eggs and mixed products are separate purchase categories. Their unweighted sum cannot exceed total food spending. Do not enter the same purchase twice in these categories.
- Missing values and measured zero remain distinct. Partial categories retain the established calculation rule, with a warning in the breakdown. All numerator categories blank excludes the row.
- Questionnaire scores are derived from valid answers. They cannot be supplied through the indicator CSV template.
- Existing records are not rewritten by the validation migration. Constraints use `NOT VALID` so historical inconsistencies do not prevent deployment, but subsequent inserts and updates must satisfy the rules. Finite contradictory historical amounts are flagged in the breakdown; malformed numerical data must be corrected before calculation.

## Versioned rules and precision

`src/lib/indicators/policies/2026-10-28.1.json` defines operational fields and weights, targets, questionnaire options and points, missing-value rules, period selection, baseline methodology and rounding. It is the current released policy; earlier policy files remain unchanged. Preserve released files when adding a new version.

Food-waste reduction uses only configured positive annual baselines, prorated to each kitchen’s own measured months. Kitchens without a usable baseline remain in absolute waste totals and reporting coverage, but are excluded from both matched reduction totals. Historical records never supply an inferred baseline. Global reduction benchmarks require at least five organizations with matched baselines.

TypeScript consumes this policy directly. `npm run formulas:generate` creates `drizzle/0034_generated_indicator_formulas.sql` from the policy and the reviewed selection/aggregation SQL template. `npm run formulas:check` fails if generated SQL is stale. Tests compare the questionnaire form with the policy.

Amounts are summed with decimal arithmetic at 32 significant digits before division. Presentation uses commercial rounding, including negative ties, to two decimal places. Questionnaire scores retain their explicit methodology: round each kitchen to whole points, average the kitchens with answered questions, then round that average to whole points. Trend changes use the unrounded period values.

When changing methodology, add a new policy version, update its calculator and SQL generation together, review the reference cases, and regenerate SQL. Preserve the policy and results in existing archives. Current dashboards recalculate using the current policy; saved reports retain the version used when they were archived.

## Reports and year freezing

Each report reads inputs, answers and baseline history in one repeatable-read database transaction. Its SHA-256 data revision identifies the exact input contents. A manual archive verifies both the data revision and formula version that the user reviewed; it rejects a stale preview.

Select one kitchen to archive a report. Its JSON contains the raw amounts, selected year and period mode, questionnaire answers and scoring rules, targets, explicit baselines, historical baseline inputs, names and calculation results. PostgreSQL rejects updates and deletes of archived reports. Repeated saves of the same kitchen, period mode, formula version and data revision reuse the existing archive. Reading an archive checks the user's current organization and kitchen access.

Freezing a year archives each kitchen in automatic, monthly, annual and quarterly modes, then freezes the year in the same transaction. Year and baseline advisory locks serialize concurrent writes while the snapshots are created. Unfreezing does not delete archives; a later freeze can add new revisions. The detail page labels archived results separately from the live charts.

Archives start when this feature is deployed or when a user explicitly saves a report. The system cannot reconstruct a previously published report whose inputs have already changed. Existing frozen years are not silently represented as historical snapshots from the time of their original freeze.

## Verification and deployment

CI runs the complete pipeline, including the dependency audit and deployment tests, on pull requests and pushes to `main`. With host dependencies installed, `npm run check` runs generated SQL checks, type checking, lint, unit/action/reference tests, isolated PostgreSQL tests, and organization isolation tests. `npm run test:run` alone skips the database tests. `npm run test:indicators:sql` starts a temporary PostgreSQL 15 container with a random loopback port and removes it afterward. It does not use the application database.

The Docker build also runs the checks, using PostgreSQL on a temporary Unix socket inside the build stage, followed by the production build. Failed checks stop image creation. No test database or PostgreSQL server is copied into the runtime image.

Docker startup runs migrations automatically before starting the web server. Both startup and the optional manual command (`MIGRATION_DATABASE_URL=… npm run db:migrate`) serialize migrations with a PostgreSQL advisory lock. Custom formula replacements and their revision check run in one transaction. Migration errors fail the deployment step; runtime startup verifies database isolation and the installed formula revision must match the application. `/api/health` returns 503 for a missing or mismatched revision. The migration tests cover the entire migration history on a fresh database, repeated migration runs, failed SQL rollback, wrong revision rollback, and lock release.

If GitHub branch protection is used, require the `Formula, database and build checks` status. Repository code cannot change a hosting provider's branch-protection settings. Docker builds enforce the checks independently.

## Reference cases and advisor review

`src/__tests__/fixtures/indicator-reference.json` contains explicit inputs, hand-calculated expected values and arithmetic for all seven indicators, including weighted Fairtrade cocoa products, mixed monthly/annual kitchens, partial questionnaires and prorated food-waste baselines. These are arithmetic references, not advisor-approved results. The advisor's figures have not been provided.

Tests additionally cover missing versus zero values, invalid imports and direct saves, decimal boundaries, input ordering, proportional scaling, splitting amounts into rows, certified-share monotonicity, SQL/TypeScript agreement, archive access, stale previews, and preservation after source changes. To reconcile an advisor disagreement, use the exported report and add their agreed dataset and expected answers as another fixed reference case.

See [Quarterly reporting](quarterly-reporting.md) for explicit periods, coverage restrictions, corrections, and CSV v2.
