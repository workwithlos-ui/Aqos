import type {
  DealAnalysis,
  DealFreezeResult,
  FreezeTrigger,
  GovernanceGate,
  GovernanceResult,
  PlatformContext,
  PlatformFreezeResult,
  RedTeamObjection,
  RedTeamResult,
} from "./types";

export function computeGovernance(analysis: DealAnalysis): GovernanceResult {
  const gates: GovernanceGate[] = [];

  // 1. Thesis Fit Complete
  gates.push({
    key: "thesisFitComplete",
    label: "Thesis Fit Complete",
    status:
      analysis.thesis.enabled && analysis.thesis.bucket !== "Off-Thesis"
        ? "pass"
        : "pending",
    detail: analysis.thesis.rationale,
  });

  // 2. Initial Screen Complete
  gates.push({
    key: "initialScreenComplete",
    label: "Initial Screen Complete",
    status: analysis.missingData.canUnderwrite ? "pass" : "fail",
    detail: analysis.missingData.canUnderwrite
      ? "Core financials present."
      : `Missing: ${analysis.missingData.criticalMissing.slice(0, 2).join(", ")}`,
  });

  // 3. Underwriting Complete
  gates.push({
    key: "underwritingComplete",
    label: "Underwriting Complete",
    status: !analysis.verdict.isPreliminary ? "pass" : "pending",
    detail: analysis.verdict.isPreliminary
      ? "Diligence incomplete — score is preliminary."
      : "Full underwriting complete.",
  });

  // 4. DSCR Passes
  gates.push({
    key: "dscrPasses",
    label: "DSCR Passes (≥1.25x)",
    status:
      analysis.dscrPair.afterStandby.value !== null &&
      analysis.dscrPair.afterStandby.value >= 1.25
        ? "pass"
        : "fail",
    detail:
      analysis.dscrPair.afterStandby.value !== null
        ? `DSCR: ${analysis.dscrPair.afterStandby.display}`
        : "DSCR missing",
  });

  // 5. Capital Stack Reconciles
  gates.push({
    key: "capitalStackReconciles",
    label: "Capital Stack Reconciles",
    status: analysis.capitalStack.pctValid ? "pass" : "fail",
    detail: analysis.capitalStack.pctValid
      ? `${(analysis.capitalStack.pctTotal * 100).toFixed(1)}% = 100%`
      : analysis.capitalStack.warnings[0] ?? "Invalid capital stack",
  });

  // 6. Benchmark Basis Valid
  gates.push({
    key: "benchmarkBasisValid",
    label: "Benchmark Basis Valid",
    status: analysis.valuation.compatibility === "basis_match" ? "pass" : "pending",
    detail:
      analysis.valuation.compatibility === "basis_match"
        ? `${analysis.valuation.benchmark?.basis} basis matches earnings.`
        : analysis.valuation.compatibility === "reference_only"
          ? "Benchmark reference only — basis mismatch."
          : "No benchmark available.",
  });

  // 7. Critical Diligence Identified
  gates.push({
    key: "criticalDiligenceIdentified",
    label: "Critical Diligence Identified",
    status: analysis.missingData.criticalMissing.length === 0 ? "pass" : "pending",
    detail:
      analysis.missingData.criticalMissing.length === 0
        ? "No critical gaps."
        : `${analysis.missingData.criticalMissing.length} critical gaps identified.`,
  });

  // 8. QoE Plan Defined
  const qoeComplete = analysis.missingData.criticalMissing.length === 0;
  gates.push({
    key: "qoePlanDefined",
    label: "QoE Plan Defined",
    status: qoeComplete ? "pass" : "pending",
    detail: qoeComplete
      ? "QoE complete."
      : "QoE plan not yet defined.",
  });

  // 9. Working Capital Reviewed
  const wcStatus = analysis.workingCapital.status;
  gates.push({
    key: "workingCapitalReviewed",
    label: "Working Capital Reviewed",
    status:
      wcStatus === "complete" ||
      wcStatus === "partial"
        ? "pass"
        : "pending",
    detail:
      wcStatus === "complete"
        ? "Working capital complete."
        : wcStatus === "partial"
          ? "Working capital partial."
          : "Working capital missing.",
  });

  // 10. Integration Plan Drafted
  gates.push({
    key: "integrationPlanDrafted",
    label: "Integration Plan Drafted",
    status: analysis.integration.readinessScore >= 50 ? "pass" : "pending",
    detail: `Integration readiness: ${analysis.integration.readinessScore.toFixed(0)}%.`,
  });

  // 11. Red Team Objections Complete
  gates.push({
    key: "redTeamObjectionsComplete",
    label: "Red Team Objections Complete",
    status:
      analysis.redTeam.unresolvedCriticalCount === 0 ? "pass" : "pending",
    detail:
      analysis.redTeam.unresolvedCriticalCount === 0
        ? "All critical objections cleared."
        : `${analysis.redTeam.unresolvedCriticalCount} critical objections unresolved.`,
  });

  // 12. Freeze Triggers Clear
  gates.push({
    key: "freezeTriggersClear",
    label: "Freeze Triggers Clear",
    status: analysis.freeze.status === "green" ? "pass" : "pending",
    detail:
      analysis.freeze.status === "green"
        ? "No freeze triggers."
        : analysis.freeze.status === "yellow"
          ? "Yellow freeze — review required."
          : "Red freeze — deal frozen.",
  });

  // 13. Lender Package Ready
  gates.push({
    key: "lenderPackageReady",
    label: "Lender Package Ready",
    status:
      analysis.missingData.canGenerateLenderPackage &&
      analysis.dscrPair.afterStandby.value !== null
        ? "pass"
        : "pending",
    detail: analysis.missingData.canGenerateLenderPackage
      ? "Lender package can be generated."
      : "Missing data for lender package.",
  });

  // 14. LOI Terms Drafted
  gates.push({
    key: "loiTermsDrafted",
    label: "LOI Terms Drafted",
    status: analysis.missingData.canGenerateLOI ? "pass" : "pending",
    detail: analysis.missingData.canGenerateLOI
      ? "LOI can be generated."
      : "Cannot generate LOI yet.",
  });

  // 15. Legal Review Required
  gates.push({
    key: "legalReviewRequired",
    label: "Legal Review Required",
    status: "pending",
    detail: "Legal review required before close.",
  });

  const passedCount = gates.filter((g) => g.status === "pass").length;
  const totalCount = gates.length;

  const blockers: string[] = [];
  for (const gate of gates) {
    if (gate.status === "fail") {
      blockers.push(gate.label);
    }
  }

  const freezeStatus = analysis.freeze?.status ?? "green";
  const icReady = passedCount >= 13;
  const loiReady = passedCount >= 10;
  const lenderReady = passedCount >= 11;
  const closeReady = passedCount >= 14 && freezeStatus === "green";

  let nextAction = "Continue diligence";
  if (closeReady) nextAction = "Ready to close";
  else if (lenderReady) nextAction = "Submit to lender";
  else if (loiReady) nextAction = "Draft LOI";
  else if (icReady) nextAction = "Present to IC";
  else nextAction = `Complete ${totalCount - passedCount} remaining gates`;

  return {
    gates,
    passedCount,
    totalCount,
    icReady,
    loiReady,
    lenderReady,
    closeReady,
    blockers,
    nextGovernanceAction: nextAction,
  };
}

export function computeDealFreeze(analysis: DealAnalysis): DealFreezeResult {
  const triggers: FreezeTrigger[] = [];

  // Deal-level freeze triggers
  if (
    analysis.dscrPair.afterStandby.value !== null &&
    analysis.dscrPair.afterStandby.value < 1.25
  ) {
    triggers.push({
      key: "dscr_below_125",
      scope: "deal",
      severity: "yellow",
      label: "DSCR Below 1.25x",
      detail: `DSCR after standby: ${analysis.dscrPair.afterStandby.display}`,
      active: true,
    });
  }

  if (
    analysis.dscrPair.afterStandby.value !== null &&
    analysis.dscrPair.afterStandby.value < 1.0
  ) {
    triggers.push({
      key: "dscr_below_100",
      scope: "deal",
      severity: "red",
      label: "DSCR Below 1.00x",
      detail: `DSCR after standby: ${analysis.dscrPair.afterStandby.display}`,
      active: true,
    });
  }

  if (analysis.earningsBasis === "missing") {
    triggers.push({
      key: "earnings_missing",
      scope: "deal",
      severity: "red",
      label: "EBITDA/SDE Missing",
      detail: "Cannot underwrite without earnings.",
      active: true,
    });
  }

  if (analysis.earningsUsed === 0 || analysis.earningsUsed === null) {
    triggers.push({
      key: "zero_earnings",
      scope: "deal",
      severity: "red",
      label: "Zero or Negative Earnings",
      detail: "Deal cannot support debt.",
      active: true,
    });
  }

  if (
    analysis.risk.highestRisk?.score === 5 ||
    analysis.risk.criticalCount > 0
  ) {
    triggers.push({
      key: "critical_risk",
      scope: "deal",
      severity: "yellow",
      label: "Critical Risk Factor",
      detail: `${analysis.risk.highestRisk?.label}: ${analysis.risk.highestRisk?.level}`,
      active: true,
    });
  }

  if (analysis.valuation.compatibility === "reference_only") {
    triggers.push({
      key: "benchmark_mismatch",
      scope: "deal",
      severity: "yellow",
      label: "Benchmark Basis Mismatch",
      detail: "Benchmark not directly comparable.",
      active: true,
    });
  }

  if (analysis.workingCapital.status === "missing") {
    triggers.push({
      key: "wc_unknown",
      scope: "deal",
      severity: "yellow",
      label: "Working Capital Unknown",
      detail: "Cannot assess cash needs.",
      active: true,
    });
  }

  if (analysis.integration && !analysis.integration.canCloseSafely) {
    triggers.push({
      key: "integration_not_ready",
      scope: "deal",
      severity: "yellow",
      label: "Integration Owner Missing",
      detail: "Integration lead not assigned.",
      active: true,
    });
  }

  if (!analysis.capitalStack.pctValid) {
    triggers.push({
      key: "capital_stack_invalid",
      scope: "deal",
      severity: "red",
      label: "Invalid Capital Stack",
      detail: analysis.capitalStack.warnings[0] ?? "Capital stack does not reconcile.",
      active: true,
    });
  }

  // Determine overall freeze status
  const hasRed = triggers.some((t) => t.severity === "red" && t.active);
  const hasYellow = triggers.some((t) => t.severity === "yellow" && t.active);

  let status: DealFreezeResult["status"] = "green";
  if (hasRed) status = "red";
  else if (hasYellow) status = "yellow";

  // Manual override would be applied from input, not analysis

  return {
    status,
    triggers,
    blocksAcquisitionPriority: status === "red",
    blocksCloseReady: status === "red",
    blocksAggressiveLOI: status !== "green",
    rationale:
      status === "green"
        ? "No freeze triggers."
        : status === "yellow"
          ? "Yellow freeze — review required before proceeding."
          : "Red freeze — acquisition activity frozen.",
  };
}

export function computeRedTeam(analysis: DealAnalysis): RedTeamResult {
  const objections: RedTeamObjection[] = [];

  // 1. Why should we NOT buy this?
  objections.push({
    key: "valuation_concern",
    prompt: "Why should we not buy this?",
    finding:
      analysis.evToEBITDA.value !== null && analysis.evToEBITDA.value > 6
        ? `EV/EBITDA of ${analysis.evToEBITDA.display} is above typical range.`
        : "Valuation appears reasonable.",
    evidenceNeeded: ["Recent comparable transactions", "Broker valuation support"],
    severity:
      analysis.evToEBITDA.value !== null && analysis.evToEBITDA.value > 7
        ? "high"
        : "medium",
    owner: "CFO",
    status: "open",
    cleared: false,
  });

  // 2. What must be true for this to work?
  objections.push({
    key: "assumptions",
    prompt: "What must be true for this to work?",
    finding: `DSCR after standby must be ≥1.25x. Current: ${analysis.dscrPair.afterStandby.display}`,
    evidenceNeeded: ["SBA pre-qualification", "Lender comfort letter"],
    severity:
      analysis.dscrPair.afterStandby.value !== null &&
      analysis.dscrPair.afterStandby.value >= 1.25
        ? "low"
        : "high",
    owner: "Lender Relations",
    status: "open",
    cleared:
      analysis.dscrPair.afterStandby.value !== null &&
      analysis.dscrPair.afterStandby.value >= 1.25,
  });

  // 3. What could break post-close?
  objections.push({
    key: "post_close_risk",
    prompt: "What could break post-close?",
    finding:
      analysis.risk.highestRisk && analysis.risk.highestRisk.score === 5
        ? `Critical risk: ${analysis.risk.highestRisk.label}`
        : "No critical post-close risks identified.",
    evidenceNeeded: ["Retention agreements", "Customer contracts"],
    severity: analysis.risk.highestRisk && analysis.risk.highestRisk.score === 5 ? "critical" : "low",
    owner: "Operations",
    status: "open",
    cleared: !analysis.risk.highestRisk || analysis.risk.highestRisk.score !== 5,
  });

  // 4. What is seller likely hiding?
  objections.push({
    key: "seller_transparency",
    prompt: "What is seller likely hiding?",
    finding:
      analysis.missingData.criticalMissing.length > 0
        ? `${analysis.missingData.criticalMissing.length} critical items missing: ${analysis.missingData.criticalMissing.slice(0, 2).join(", ")}`
        : "Seller appears transparent.",
    evidenceNeeded: [
      "Full tax returns",
      "Customer contracts",
      "Detailed add-backs",
    ],
    severity: analysis.missingData.criticalMissing.length > 3 ? "high" : "medium",
    owner: "Diligence Lead",
    status: "open",
    cleared: analysis.missingData.criticalMissing.length === 0,
  });

  // 5. What number is most fragile?
  const marginVal = analysis.ebitdaMargin.value;
  objections.push({
    key: "fragile_assumption",
    prompt: "What number is most fragile?",
    finding:
      marginVal !== null && marginVal < 0.08
        ? `EBITDA margin of ${analysis.ebitdaMargin.display} is thin — vulnerable to revenue decline.`
        : "Key metrics appear stable.",
    evidenceNeeded: ["Revenue trend analysis", "Customer concentration review"],
    severity:
      marginVal !== null && marginVal < 0.05
        ? "critical"
        : "medium",
    owner: "Underwriting",
    status: "open",
    cleared: marginVal !== null && marginVal >= 0.08,
  });

  const unresolvedCritical = objections.filter(
    (o) => o.severity === "critical" && !o.cleared,
  ).length;

  return {
    objections,
    topObjections: objections.slice(0, 5),
    unresolvedCriticalCount: unresolvedCritical,
    rationale:
      unresolvedCritical === 0
        ? "Red team objections are addressable."
        : `${unresolvedCritical} critical objection(s) unresolved.`,
  };
}

export function computePlatformFreeze(
  _context?: PlatformContext,
): PlatformFreezeResult {
  const triggers: FreezeTrigger[] = [];

  // For now, return green — platform-level freeze logic would be implemented
  // when portfolio context is available.

  return {
    status: "green",
    triggers,
    rationale: "No platform-level freeze triggers active.",
  };
}
