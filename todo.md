# Acquisition OS — Iteration 5: ProFlow Contradiction Fix

## Repro
ProFlow Plumbing — Plumbing, Rev $3.2M, EBITDA $950K, SDE $1.05M, Asking $3.2M.
Observed:
- score label: "80/100 · Acquisition Priority"
- verdict card: "Diligence Priority"
- risk 15/20 with 4 major fields missing
- diligence 0/10
- 10 important missing

## Tasks
- [ ] 1. Single bucket: verdict bucket drives the score-card label.
- [ ] 2. Caps: diligence 0/10 → max Diligence Priority; importantMissing > 5 → max Diligence Priority; criticalMissing > 0 → Cannot Underwrite or Diligence Priority; LOI not ready → cannot be Acquisition Priority.
- [ ] 3. Risk: 3+/5 missing → risk earned heavily discounted, riskConfidence = low, scoreLabel = Preliminary.
- [ ] 4. With diligence 0/10 + risk incomplete → final score in 65–72 band, not 80.
- [ ] 5. Acquisition Priority gate: DSCR.afterStandby ≥ 1.40x AND no critical missing AND importantMissing ≤ 5 AND diligence ≥ 3 AND risk materially complete AND no unresolved blockers AND LOI ready/near-ready AND core math works.
- [ ] 6. Blockers (revenueTrend, customerConcentration, ownerRole missing) cap bucket regardless of score.
- [ ] 7. Pipeline / Dashboard / Analyzer / Copilot all read the same bucket.
- [ ] 8. Regression tests for ProFlow + each acceptance rule.
- [ ] 9. Redeploy to Manus public; push to GitHub workwithlos-ui/Aqos.
