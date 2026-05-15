# Iteration 10 — P0 fixes + UI assertion tests

## P0.1 Exports H1 binding (third time — must hold)
- [ ] Drop `useMemo` for `analysis` on Exports page; compute fresh per render
- [ ] Wrap export content section with React `key={dealId}` to force unmount/remount
- [ ] Add UI test: 5-switch dropdown A→B→A→B→A asserts H1 matches dropdown text every step

## P0.2 Industry capitalization full sweep
- [ ] Diligence checklist "Specific to hvac acquisitions" → "Specific to HVAC acquisitions"
- [ ] Sweep every `${input.industry}` template literal across the engine
- [ ] Add UI test asserting no lowercase industry on rendered surfaces

## P0.3 IRR calibration (target 30–55% base IRR, 5–9x base MOIC)
- [ ] Initial equity denominator = full equity-at-risk (~$370K for HVAC)
- [ ] taxRate (default 27%) on Y1–Y5 buyer FCF
- [ ] capitalGainsTaxRate (default 24%) on exit gain
- [ ] Scale CapEx with revenue (capex_y_n = revenue_y_n × industryCapexPct)
- [ ] Scale ΔWC with revenue change ((rev_y_n - rev_y_n-1) × industryWcPct)
- [ ] Re-center exit multiples on entry × {0.85, 1.00, 1.15}

## Verification
- [ ] All 4 acceptance criteria pass live
- [ ] Live commit = GitHub HEAD
- [ ] Paste actual rendered IRR/MOIC for bear/base/bull
- [ ] UI assertion tests (not just engine tests)
