# Food-waste comparisons and operating drafts

This change completes the food-waste and operating-editor behavior agreed for
PR #49. Questionnaire completion and grouping use main's existing modules.

## Food-waste calculations

Only reporting kitchens with a positive, finite configured annual baseline
contribute to reduction. Each baseline is scaled to that kitchen's measured
months. Zero waste is a measurement; a missing measurement is not zero.
Kitchens without a baseline remain in absolute totals and coverage counts,
but are excluded from both totals used to calculate reduction. Historical
measurements never supply a missing baseline.

`food-waste.ts` returns matched totals, reduction, progress and coverage.
`food-waste-reader.ts` reads complete records through the existing tenant scope.
Dashboard, detail, datasets, reports and comparisons consume these results.
Automatic selection prefers measured monthly data for each kitchen, falling
back to its annual record when its monthly records contain no waste measurement.
Quarterly reductions use combined amounts and baselines. Charts show missing
reductions as gaps and display partial coverage explicitly.

Formula policy `2026-09-29.1` records the configured-baseline rule. The released
`2026-09-24.1` policy and archived calculation reports remain unchanged.
Deployment reapplies the benchmark function and generated formula revision.
No operating records are rewritten.

Global comparisons require five organizations with valid configured baselines.
The database returns reduction, progress and coverage, but no matched amounts
or baseline totals. Publishing those totals beside the overall waste total
would allow subtraction to expose a small excluded cohort. Authorized
organization views retain their detailed totals.

## Operating drafts

`operating-data/editor.ts` owns period drafts and the kitchen-wide baseline.
The operating forms use this module because a baseline edit must be shared
across periods without a later period's stale copy overwriting it. Baselines
are saved only when explicitly edited, including clearing a value. Baseline-
only edits do not create empty operating records.

Period switches continue while earlier saves finish. Failed drafts stay in
memory and remain visible with a retry action, even when another period is
selected. Saves acknowledge only the revision actually persisted. The
existing pending-write queue prevents a remounted form from reading before
an earlier form's write finishes. Revisiting a period refreshes its values and
lock status without replacing unsaved edits. Failed refreshes disable editing.
Numeric inputs ignore prop-driven callbacks so loading never creates edits.

The qualitative form retains main's generic reporting-period autosave. The
unused former operating adapter and historical-baseline readers are removed.
Both editors use the same reporting-period identity and pending-write queue
implementation. Validation, authorization, frozen-year restrictions and local
date handling remain in place.

Failed drafts survive within the mounted editor. A full reload loses them;
pending drafts trigger the browser's unload warning. This change does not add
browser storage or cross-tab coordination.

## Review against recent merged PRs

Reviewed all 13 PRs merged into main from 2026-09-08 through 2026-09-29.
The comparison used merge diffs, current implementations, overlapping files
and the existing regression suites, with `ec6c2b1` as the main revision.

| PR | Merged work | Outcome for this change |
| --- | --- | --- |
| #52 | Audit-log administrator access | Current authorization and database isolation preserved. |
| #53 | CSV identifier changes | Current export implementations preserved, including later corrections. |
| #54 | Reflection datasets and access scopes | Dataset listing, details and completion behavior unchanged. |
| #55 | Reflection exports and CSV serialization | Export authorization, formatting and escaping unchanged. |
| #56 | Entry guidance and save wording | Hints, accessible descriptions, zero-versus-empty guidance and save labels retained. |
| #57 | Tenant isolation and administrator filters | Existing scopes, RLS and benchmark threshold retained; benchmark output excludes reconstructible matched totals. |
| #58 | Formula reliability and immutable reports | Decimal arithmetic, validation, period selection, archives, SQL generation and migration checks retained. A new policy records the intended baseline change. |
| #59 | Automatic Docker database setup | Startup and migration runner unchanged; updated SQL verified through the deployment path. |
| #60 | Administrator access editor | Role editing, transactions and access summaries unchanged. |
| #61 | Datasets, questionnaire state and autosave | Questionnaire rename and duplicate tests removed. Operating drafts add shared baseline state and visible retries; qualitative autosave remains unchanged. |
| #62 | Authorization, retention, CSV, local dates and decline handling | Current fixes retained. Revisited operating periods refresh their lock status and preserve unsaved drafts. |
| #63 | Authentication, CSP and dependency hardening | Authentication, session controls, CSP, dependency versions and audit checks unchanged. |
| #64 | Reviewed dependency updates | Every existing main lockfile entry retained. Only jsdom and server-only are added for this change. |

## Verification

CI runs the dependency audit, formula generation, type checking, lint, unit and
UI tests, SQL parity, integration checks, and Docker startup, migration and
restricted-runtime checks on every pull request. Database checks use disposable
PostgreSQL instances.

Focused coverage includes unmatched baselines, differing kitchen month
coverage, explicit zero, trend gaps, report exclusions, tenant restrictions,
benchmark suppression and response fields, both real operating forms,
period-switch races, failed saves, retries, baseline clearing, remounts and
refreshing frozen periods. Recharts and NumericFormat run in jsdom tests.
