-- Migration 0024: Update percentage range options for seasonal and regional scoring questions.
-- Old options: '0-9%', '10-24%', '25-49%', '50-74%', '75-90%', '>90%'
-- New options: '<10%', '11-25%', '26-50%', '51-75%', '76-100%'
-- Note: both '75-90%' and '>90%' map to '76-100%' (the new top bucket).

--> statement-breakpoint
UPDATE qualitative_responses
SET response_option = CASE response_option
  WHEN '0-9%'   THEN '<10%'
  WHEN '10-24%' THEN '11-25%'
  WHEN '25-49%' THEN '26-50%'
  WHEN '50-74%' THEN '51-75%'
  WHEN '75-90%' THEN '76-100%'
  WHEN '>90%'   THEN '76-100%'
END
WHERE indicator_slug IN ('seasonal', 'regional')
  AND response_option IN ('0-9%', '10-24%', '25-49%', '50-74%', '75-90%', '>90%');
