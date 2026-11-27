# Quarterly reporting

Quarterly entry is implemented at `/operating-periods`. It supports a complete quarter total and a batch of three independent monthly measurements. Both use persistent, private drafts and explicit publication. Quarterly entry is always available; it needs no configuration.

## Reporting frequency and tasks

Each kitchen chooses monthly, quarterly, or yearly entry for each reporting year. The choice is shared across users and forms. It is stored in `operating_reporting_preferences`, independently of chart filters and the `legacy|quarterly` storage mode. Reading a form never persists a suggested choice. An unconfigured year has a task to choose its frequency.

| Choice | Open operating-data tasks | Completion |
| --- | --- | --- |
| Monthly | One task per missing completed calendar month | A published, nonempty monthly record. Explicit zero counts. |
| Quarterly | One task per missing completed calendar quarter | A published native quarter with confirmed coverage. Private drafts do not count. |
| Yearly | One current-year task marked `Jahr läuft`, then `Fällig` after year-end | Review and explicitly confirm the saved annual record after year-end. |

Boundaries use Europe/Berlin. Interim annual saves are immediately available to reports but do not finish the annual task. Confirmation records the reviewed row ID and revision. Subsequent numerical edits or clearing the annual row reopen the task. Baseline changes do not change the annual record's confirmation. The annual qualitative questionnaire remains separate.

Task links carry the kitchen, year, entry mode, and exact month or quarter. Invalid or unavailable explicit destinations do not fall back to a different editable kitchen.

Frequency changes first flush pending edits. Monthly/yearly changes preview existing periods and resulting tasks, preserving amounts and the existing per-indicator monthly precedence in calculations. Moving into or out of native quarterly data uses the reviewed whole-year correction described below. Its publication changes the preference and source records in one transaction. The annual correction workflow is available at `/operating-periods?workflow=year&quarter=1`; ordinary annual entry and confirmation remain in `/form/operating?entryMode=yearly`.

Preference revisions protect against stale tabs, imports and draft publication. Permissions, frozen years and shared publication locks also apply to frequency changes and annual confirmation. Failed draft saves retain the previous selection. A stale quarterly draft can be replaced through the explicit published-values reload action after reviewing any unsaved values.

Migration `0039_operating_reporting_preferences` adds metadata without changing numerical inputs or archived reports. It infers homogeneous monthly/annual records and explicit quarterly storage mode. Mixed monthly/annual data and blank years remain unconfigured. Closed historical annual records receive a completion marker attributed to the legacy migration. Current-year annual records require confirmation after year-end. Repeated startup does not repeat the backfill. Keep this migration and its metadata; dropping it would lose user choices and confirmation history.

## Data contract

- `period_kind` is `month`, `quarter`, or `year`. `period_index` is 1–12, 1–4, or 1 respectively. `reporting_month` remains 1–12 or 0 for legacy records and is NULL for quarters. There is no synthetic monthly distribution.
- Quarters use calendar years and Europe/Berlin boundaries. Only a closed quarter with explicit complete-coverage confirmation may be published. Partial current quarters stay drafts. Quarterly batches can publish their completed months; later months remain drafts.
- A kitchen/year with quarterly quantitative data cannot also contain monthly or annual quantitative records. Legacy annual/monthly coexistence retains the established per-indicator preference for monthly records. Annual questionnaire answers are independent of this mode.
- A period without a value is unknown. An explicit zero is measured. Decimal strings keep up to six fractional places; the upper bound is compared using decimal arithmetic.
- Reporting pages default to the annual overview (`auto`), which sums selected source amounts and then calculates percentages. Explicit yearly/monthly filters still select the corresponding original record types. Quarterly trends accept both quarter records and monthly records grouped into quarters. They do not subdivide quarters.
- Food waste matches each kitchen’s reported amount to its annual baseline × covered months / 12. A full quarter uses 3/12. Missing baselines exclude both terms of that kitchen’s reduction calculation.
- Annual benchmarks require 12 covered months per kitchen and indicator and retain the five-organization disclosure threshold. Changes between years require matching kitchens and months. Trend changes require adjacent complete buckets and matching kitchens. Gaps remain null.
- Policy `2026-09-29.2` and report schema 2 record period identity, coverage, reporting modes, row revisions, baseline revisions and formula rules. Existing saved report payloads and older policy files are preserved.

## Writes, conflicts and corrections

`publishOperatingTransaction` owns the complete publication. All amounts, baseline updates, mode changes, revision history and retry receipts commit or roll back together. It authorizes the kitchen inside the transaction, checks expected revisions, validates merged partial edits, and rechecks year freezing. RLS and database triggers provide a second check of tenant scope, period identity, exclusivity, coverage and immutability.

Year and kitchen advisory locks serialize publication with freezing and baseline edits. Multi-kitchen imports acquire their locks in a consistent order. A request ID is bound to its normalized payload and actor; repeating it returns the original receipt. Reusing it with different values fails. Failed writes leave drafts available. UI errors cross server actions as structured results so production does not hide expected conflict messages.

Changing entry mode requires an explicit **whole-year correction**. The preview includes current and proposed calculations, covered periods, inputs and exclusions. Publication requires the preview’s source revision, a reason and confirmation. Quantitative source rows are superseded, never transformed into a different period or deleted. All active quantitative periods for that kitchen/year are replaced; unprovided periods become missing, as the confirmation states. Add the other known quarters/months explicitly. The page shows the last 50 revision records with their before/after values.

Drafts are scoped by author, kitchen, year, workflow and quarter. Draft saves have their own expected revisions and never enter indicator tables. Switching scope flushes the current draft first; a failure retains the old selection. Browser unload warns about unsaved changes, and link navigation flushes before leaving. A publication retry preserves its request ID until its payload changes. The published-values reload action explicitly confirms replacing the draft.

## CSV

Download the v2 template from `/api/indicator-template`; use **CSV für Wiederimport** in the dataset list for an editable export with stable kitchen IDs and revisions. The readable export remains separate. V1 monthly/yearly templates still parse; name-only resolution must identify exactly one accessible kitchen. V2 requires the kitchen ID.

V2 adds `format_version=2`, `period_kind`, `period_index`, `revision`, and `coverage_confirmed`. Native quarters require `coverage_confirmed=true`. Unknown/system columns, unsupported formats, malformed CSV, duplicate periods, future periods and invalid numbers are rejected. Values with a decimal comma are invalid in CSV; use a decimal point without grouping.

Blank or omitted numeric cells preserve existing values. `__CLEAR__` explicitly clears a field. 0 stays zero. Certified/total relationships are checked against the merged stored row, including partial updates. The server preview shows every changed cell’s old and new value. Its actor-bound signature expires after 30 minutes. The whole file commits atomically using the exact preview and its expected revisions; scope, freezing and versions are rechecked during publication. Limits are 750 KB and 1,000 nonempty records. CSV cannot perform an implicit reporting-mode conversion.

## Migration and release

1. Back up the target database using the existing recovery procedure. Startup applies journal migration 0037 and the reviewed formula/statistics updates; a failed startup must not serve traffic. The migration backfills period metadata only and does not reinterpret historical monthly amounts.
2. On a production-sized staging copy, verify migration timing, existing annual/monthly report parity and suspicious historical inputs. Quarters previously entered as a month require an explicit user-reviewed correction; amounts alone cannot identify them reliably.
3. Confirm that CI passed for the commit being deployed. It includes decimal reference cases, draft/form tests, SQL parity, fresh and upgrade migrations, runtime-role isolation, concurrency, atomic publication, CSV preview/retry, and production build/startup checks. SQL suites always use disposable PostgreSQL containers.
4. Exercise a staging account through both workflows, a stale second tab, a failed network response, a full-year conversion, CSV preview/import/reimport, export and year freezing. Check mobile layout and keyboard interaction. Verify one Q1 record displays as three covered months and never appears as three monthly measurements.
5. After deployment, monitor application failures, rejected conflicts and revision history; compare exported source amounts against the calculation report.
6. Keep this version’s readers and database migration. Never roll back to a binary that assumes `reporting_month` is non-null; it cannot safely read published quarters. Keep all quarter records, drafts, receipts, revisions and archived reports. Correct data through a new reviewed revision.

Freezing archives automatic, monthly, annual and quarterly reports inside the same transaction. It waits for current writes before taking the year lock and holds baseline locks while reading. Later baseline changes can affect live calculations; saved snapshots remain immutable and are labeled separately.

## Deliberate limits

Calendar quarters only; no fiscal calendars, estimated monthly splits, cumulative year-to-date inputs, quarterly scoring questionnaire, or silent historical cleanup. Existing policy for partially blank categories is unchanged and remains explained in calculation breakdowns. Software cannot prove that a user-entered amount covers the whole quarter; explicit confirmation and preview make that responsibility visible.
