# Iteration 8 — Critical Brief (AnomalyBus + Imputation Discipline + 6 P0 + WC bug)

## Architectural
- [ ] AnomalyBus: single `analysis.anomalies` array consumed by:
  - [ ] Analyzer page yellow banner under headline verdict
  - [ ] Red Team objections (no generic placeholders when anomalies exist)
  - [ ] IC memo Executive Summary first paragraph
  - [ ] Exports header
  - [ ] Governance gates
  - [ ] Copilot (already works — keep)

## Imputation discipline (industry-time, not page-time)
- [ ] On industry selection, if capEx null → revenue × industryTable[industry].capexPct
- [ ] On industry selection, if WC reserve null → revenue × industryTable[industry].wcPct
- [ ] Tag both with assumption badge "assumed (industry default)"
- [ ] Inline override link with current default %
- [ ] HVAC defaults: capexPct 0.025, wcPct 0.07

## P0 ship-blockers
- [ ] 3.1 Asking-below-benchmark YELLOW BANNER on /analyze
- [ ] 3.2 EBITDA margin anomaly + badge "needs-verification"
- [ ] 3.3 Risk panel copy: "5 of 5 engine-inferred · 0 of 5 buyer-confirmed"
- [ ] 3.4 Invalid capital stack → CANNOT UNDERWRITE with null score/DSCR
- [ ] 3.5 Red Team objections consume anomalies array
- [ ] 3.6 SaveStatus: "Saving…" → "Saved" → "Saved · Xs ago" within 500ms

## Bug fix
- [ ] WC peg formatter: render $175,000, not $7

## Verification protocol
- [ ] UI regression tests for each fix (DealAnalyzer renders the anomaly)
- [ ] Live smoke test paste on deployed URL
- [ ] Hash receipt (deployed vs GitHub)
- [ ] Per-item file + line pointers
- [ ] Honest delta
- [ ] All 10 binary acceptance criteria
