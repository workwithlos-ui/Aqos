# Acquisition OS — Iteration 2 todo

- [ ] Issue 1 — Benchmark basis must match earnings basis. Add EBITDA-basis multiples; if only the opposite-basis benchmark is available, mark valuation as `reference_only` and surface a clear warning in UI + exports + advisor.
- [ ] Issue 2 — Risk scoring is too generous when 4+ risk factors are missing. Switch the 20-pt risk bucket to confidence-weighted: subtract a penalty per missing factor, cap risk earned to a fraction of available when more than 2 factors are missing, and label the risk panel "Risk score incomplete".
- [ ] Issue 3 — Score must be labelled "Preliminary Score" and carry a confidence (High / Medium / Low) when major diligence is missing. Show reason text under the headline number.
- [ ] Issue 4 — Important missing data (revenue trend, concentration %, owner role, years in business, tax returns, P&L, balance sheet, add-backs, customer list, debt schedule) must drive confidence down and prevent Acquisition Priority bucket / PURSUE verdict regardless of headline math.
- [ ] Update Pipeline / Dashboard / Analyzer / Exports / Advisor copy to render new confidence + preliminary status everywhere the score appears.
- [ ] Add Vitest cases for: SDE-only benchmark with EBITDA basis ⇒ reference_only + warning; 4 missing risk factors ⇒ risk earned ≤ half; 10 important missing items ⇒ confidence ≤ medium and bucket ≠ Acquisition Priority; Big Revenue Bad Earnings (T7) verdict in {KILL, PAUSE, RENEGOTIATE} and bucket ≠ Acquisition Priority.
- [ ] Re-run full suite, rebuild, save checkpoint, redeploy public.
