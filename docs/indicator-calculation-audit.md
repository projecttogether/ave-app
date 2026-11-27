All twelve findings from the indicator audit at commit `c4ecce9` are addressed in this working tree. The changes cover all seven indicators, their charts, comparisons, dataset tables, and score exports. Production has not been changed.

The original audit used synthetic inputs because neither a production database connection nor the advisor's spreadsheet was available. The regression tests now assert the corrected results.

| Audit finding | Corrected behavior | Main implementation |
| --- | --- | --- |
| 1. Quarterly averages of percentages | Divide summed eligible spending by summed denominators. Sum quarterly purchase amounts. Months without this indicator do not dilute the result. | [aggregation.ts](../src/lib/indicators/aggregation.ts) |
| 2. Monthly food waste compared with annual baseline | Scale each kitchen's annual baseline to its measured months. | [aggregation.ts](../src/lib/indicators/aggregation.ts), [data.ts](../src/lib/indicators/data.ts) |
| 3. Food-waste kilograms displayed as percentages | Summary and trend values are reductions in percent; the raw detail table explicitly shows kilograms. Negative reductions and the −30% target fit on the chart. | [indicators.ts](../src/app/actions/indicators.ts), [indicator-detail-client.tsx](../src/components/dashboard/indicator-detail-client.tsx), [chart-domain.ts](../src/lib/indicators/chart-domain.ts) |
| 4. Fairtrade data hidden without total food spending | Determine availability from the indicator's own values and denominator. | [aggregation.ts](../src/lib/indicators/aggregation.ts) |
| 5. Missing waste interpreted as a 100% reduction | Preserve missing values as `null` through SQL, conversion, progress calculation, and display. Explicit zero remains a measurement. | [engine.ts](../src/lib/indicators/engine.ts), [SQL migration](../drizzle/0032_consistent_indicator_calculations.sql) |
| 6. Stale stored questionnaire scores | Recalculate all seven scores from current answers. SQL summaries, detail pages, datasets, and CSV exports use these scores. Saving answers invalidates the displayed results. | [SQL migration](../drizzle/0032_consistent_indicator_calculations.sql), [scoring.ts](../src/lib/qualitative/scoring.ts), [data.ts](../src/lib/indicators/data.ts) |
| 7. Different food-waste populations and month counts | All views use the same baseline loader. Include only measured kitchen periods and require baseline coverage for the full measured population. | [data.ts](../src/lib/indicators/data.ts), [aggregation.ts](../src/lib/indicators/aggregation.ts) |
| 8. Annual and monthly previous-year records mixed | Apply the selected granularity independently to current and previous years before comparison. | [indicators.ts](../src/app/actions/indicators.ts) |
| 9. Different automatic period selection | Prefer monthly data per kitchen, year, and indicator; retain an annual fallback when monthly rows contain only other indicators. Never add annual and monthly observations for the same indicator and kitchen-year. | [aggregation.ts](../src/lib/indicators/aggregation.ts), [SQL migration](../drizzle/0032_consistent_indicator_calculations.sql) |
| 10. Different global populations | Operational data, questionnaire scores, trends, and baselines share the global test-organization/kitchen exclusions. Organization and membership restrictions remain in place. | [scope.ts](../src/lib/indicators/scope.ts), [SQL migration](../drizzle/0032_consistent_indicator_calculations.sql) |
| 11. Different targets and progress scales | All progress views use the configured targets. Seasonal methodology uses 60 points. Regional, seasonal, and guest questionnaire results use points. | [engine.ts](../src/lib/indicators/engine.ts), [indicators.ts](../src/lib/indicators/indicators.ts), [content defaults](../src/lib/content/defaults.ts) |
| 12. PostgreSQL percentile rounding error | Cast percentile ranks to numeric before rounding. Rankings use the corrected period selection and live questionnaire scores, excluding missing results. | [SQL migration](../drizzle/0032_consistent_indicator_calculations.sql) |

Verified examples:

| Input | Previous output | Corrected output |
| --- | --- | --- |
| Fairtrade: January €90/€100, February €0/€900 | 45% quarterly share | 9% |
| January €100 total purchases, February €900 | €500 quarterly purchases | €1,000 |
| 80 kg waste for one month, 1,200 kg annual baseline | −93.33% detail summary | −20% |
| 840 kg annual waste, 1,200 kg baseline | 840% annual chart | −30% |
| €80 Fairtrade coffee out of €100, overall food spending blank | No data | 80% |
| No current waste measurement, positive baseline | −100% reduction and full progress | No data |
| Two kitchens with 1,200 kg annual baselines; A reports two months, B one | 400 kg combined comparable baseline | 300 kg |
| Current annual Fairtrade 50%, previous annual 90%, extra previous monthly €0/€100 | −38.89% relative change | −44.44% |
| Monthly kitchen €90/€100 plus annual-only kitchen €0/€900, automatic selection | Detail 90%, SQL 9% | Both 9% |
| Regional questionnaire score 20, configured target 20 | Radar 100% progress, dataset 20% | Both 100% |

The underlying formulas and methodological choices remain:

| Indicator | Formula | Target |
| --- | --- | --- |
| Plant-based | `100 × Σ max(0, total − meat − fish − dairy − eggs − 0.5 × mixed products) / Σ total` | 75% |
| Organic | `100 × Σ organic spending / Σ total food spending` | 40% |
| Fairtrade | `100 × Σ(FT coffee + FT cocoa + FT bananas + 0.5 × FT cocoa mixed products) / Σ(coffee + cocoa + bananas + 0.5 × cocoa mixed products)` | 90% |
| Food waste | `100 × (measured kilograms − comparable baseline kilograms) / comparable baseline kilograms` | −30% |
| Seasonal | Questionnaire points divided by maximum possible points, multiplied by 100 and rounded | 60 points |
| Regional | Same questionnaire normalization | 20 points |
| Guest satisfaction | Same questionnaire normalization; measures activities, not the percentage of satisfied guests | 75 points |

Blank entries remain different from explicit zeros. An all-blank Fairtrade numerator excludes that row; entering any certified-spend value includes the row's category denominators, with other blank certified-spend fields contributing zero. Cocoa mixed products retain their 50% weight in both sums. Aggregation uses expenditure rather than purchase volume or an equal average of categories.

Questionnaire normalization also remains unchanged. `Ja` gives 2 points, `Geplant` gives 1, and `Nein` or `Unklar` gives 0. Percentage ranges contribute 1–5 points. Unanswered questions remain in the maximum possible score. Fairtrade has seven scored questions and 14 maximum points, so one `Ja` with six unanswered questions produces 14 points after rounding. An entirely unanswered questionnaire has no score. Maximum points are 32 for plant-based, 42 for organic, 38 for food waste, 31 for seasonal, 21 for regional, 14 for Fairtrade, and 22 for guest satisfaction.

Food-waste baselines use each kitchen's explicit annual baseline when available. Otherwise, they use that kitchen's earliest recorded waste year. Historical annual data can be prorated; historical monthly data must cover the corresponding months. Annual comparisons against historical monthly data require all twelve months. If any measured kitchen lacks the required baseline coverage, the percentage is unavailable rather than calculated against a partial denominator.

The configured target numbers are retained. Obsolete built-in methodology text is updated only when the stored value exactly matches the previous default; administrator-authored text is preserved. The SQL questionnaire policy has a parity test against the application's question definitions, so later question changes must update both together.

Validation commands:

```sh
npm run test:run
npm run test:indicators:sql
npm run typecheck
npm run lint
npm run build
```

The normal suite passes 113 tests and skips the 18 database cases when no isolated test container is configured. The SQL command runs 19 tests, including those 18 database cases and the questionnaire-policy parity check, in a temporary PostgreSQL 15 container without exposed ports or mounted volumes. It removes the container afterward. The tests cover SQL/TypeScript agreement, live score updates, global filters, repeat application of the startup migrations, server-action results, membership restrictions, dataset/export scores, and food-waste baselines.

Migration `0032_consistent_indicator_calculations.sql` is registered after the existing custom migrations and runs on the next application startup. It replaces calculation functions and obsolete default text; it does not rewrite purchase records or questionnaire answers. Production migration state, actual supplier classifications, and the advisor's inputs still need a production-data reconciliation after deployment.
