# AVE domain vocabulary

- **Organization**: a catering business or operator. Tenant permissions come from stored roles and memberships, enforced by PostgreSQL isolation.
- **Kitchen / sub-organization**: an organization's reporting location. Operating data and scoring answers belong to a kitchen.
- **Reporting period**: a kitchen, organization, year, and explicit month, quarter or year period. The compatibility month field is zero for annual records and null for native quarters. Reflection answers belong to the organization and have no reporting period.
- **Reporting frequency**: a shared monthly, quarterly or yearly choice per kitchen/year. It controls entry and operating tasks, independently of chart aggregation and storage mode. Missing closed months/quarters produce individual tasks. A yearly task stays visible as `Jahr läuft` during the year and becomes due after year-end until its exact annual record revision is confirmed. Blank and mixed legacy years require an explicit choice.
- **Reporting-period autosave module**: owns a draft's period, edit revisions, delayed saves, load ordering and save acknowledgements. Each persistence adapter receives the original period. Failed drafts remain available while the editor is mounted; leaving the editor flushes pending saves.
- **Operating dataset module**: reads permitted operating rows with names, baseline metadata and current questionnaire scores. Annual scores come from answers; monthly rows carry no questionnaire scores. The caller supplies its existing access restriction and ordering.
- **Scoring questionnaire**: the kitchen's annual qualitative answers. Completion counts answered required questions that are currently visible. Optional answers and hidden follow-ups do not change this percentage. The scoring formula has its own versioned denominator and remains separate from completion.
- **Reflection questionnaire**: organization-wide answers. Completion counts all currently visible questions. Changing a parent answer hides its dependent questions without deleting their stored answers.
- **Questionnaire state module**: evaluates draft or stored answers consistently for visibility, answer presence, required answers, missing keys and completion. Blank strings and absent values are unanswered; numeric zero and boolean false are answers. A stored row alone does not imply an answer.

Released formulas, generated SQL and immutable calculation reports follow `docs/formula-reliability.md`. Access restrictions and database identity follow `docs/tenant-isolation.md`.

## Food-waste baseline and reduction

A **configured food-waste baseline** is an annual amount in kilograms stored
on a sub-organization, together with an initial measurement date. It belongs
to the sub-organization, independently of the period selected in an editor.

**Food-waste reduction** compares reported waste with a baseline. A negative
percentage change means a reduction; the indicator target is a 30% reduction.

The agreed calculation includes only sub-organizations with reported waste
and a usable configured baseline. In monthly mode, each sub-organization's
annual baseline is scaled to the number of months in which that
sub-organization reported waste. Sum those matched amounts and baselines
before calculating the percentage change.

Without a configured baseline, the reduction is unavailable. Exclude that
sub-organization from both sides of an aggregate reduction calculation; do
not derive a baseline from its earliest reported data. This exclusion concerns
the reduction calculation, not the recorded waste amount.

The dashboard, indicator detail, comparison and dataset views share the
food-waste module.
Coverage notices identify reporting sub-organizations omitted from reduction
calculations because they have no usable baseline.
