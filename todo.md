# Iteration 9 — P0 regressions + PE-grade returns + LOI .docx

## P0 (fix before any new work)
- [ ] P0.1 Test 10: invalid capital stack → CANNOT UNDERWRITE, score/DSCR null on UI
- [ ] P0.2 Exports memoization: bidirectional (switch A→B→A→B→A, header matches every time)
- [ ] P0.3 Verdict pipeline: buyerCashFlow.afterStandby < 0 → forced ≤ RENEGOTIATE
- [ ] P0.4 Industry display name capitalized (HVAC, Plumbing, Restaurant) on banner / Red Team / Copilot / IC memo

## PE-grade returns math
- [ ] Exit Assumptions panel (hold period, exit multiple, EBITDA growth bear/base/bull)
- [ ] 5-Year Projection Table (Y0–Y5: revenue, EBITDA, debt service, CapEx, WC, cash flow, cumulative)
- [ ] Exit Analysis card (Exit EV → equity proceeds → MOIC → IRR, three scenarios)
- [ ] Sensitivity Grid (SBA rate × exit multiple, IRR shaded)

## Lifecycle
- [ ] LOI .docx generator with merge fields

## Verification
- [ ] UI regression test: exports A→B→A→B→A name match
- [ ] Regression test: negative buyer cash flow → RENEGOTIATE
- [ ] Regression test: industry capitalization in IC memo
- [ ] Live smoke test on deployed URL
- [ ] Hash receipt (deployed = GitHub)
