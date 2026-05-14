// Top-level orchestrator. analyzeDeal() is the only public entry point that
// the UI, exports, and AI advisor should call. It composes every deterministic
// module in the engine layer in the same order, so two callers always see the
// same DealAnalysis for the same DealInput + assumptions.

import {
  DEFAULT_ASSUMPTIONS,
  buildCapitalStack,
  dscrFromEarnings,
  ebitdaMargin,
  evToEBITDA,
  evToSDE,
  fmtCurrencyExact,
  fmtMultiple,
  sdeMargin,
  selectEarnings,
  selectPurchasePrice,
} from "./dealMath";
import { getBenchmarkPair } from "./benchmarkMultiples";
import { scoreRisk } from "./riskScoring";
import { detectMissingData } from "./missingData";
import { scoreDeal } from "./dealScoring";
import { computeVerdict, nextActionsFor } from "./dealVerdict";
import { scoreThesisFit, DEFAULT_BUY_BOX } from "./thesis";
import { scoreWorkingCapital } from "./workingCapital";
import { scoreIntegration } from "./integration";
import { computeGovernance, computeDealFreeze, computeRedTeam } from "./governance";
import {
  computeBuyerCashFlow,
  computeMaxSupportablePP,
  computeStressTest,
  computeRefinedVerdict,
  computeRecommendedOffer,
  computeAutoDiligence,
  computeDataQuality,
  computeAssumptionBadges,
  computeAnomalies,
} from "./buyerAdvisory";
import type {
  BuyBox,
  CapitalStackAssumptions,
  DealAnalysis,
  DealInput,
  DscrPair,
  MetricResult,
  ValuationResult,
} from "./types";

function valuationFor(
  input: DealInput,
  evEbitda: MetricResult,
  evSde: MetricResult,
  earningsBasis: DealAnalysis["earningsBasis"],
  earningsUsed: number | null,
): ValuationResult {
  const pair = input.industry ? getBenchmarkPair(input.industry) : { ebitda: null, sde: null };
  const warnings: string[] = [];

  // Choose the benchmark that MATCHES the deal's earnings basis. This is the
  // direct fix for Issue 1: a 3.45x EBITDA multiple must never be silently
  // compared against a 2x–4x SDE band.
  const matchingBenchmark =
    earningsBasis === "EBITDA" ? pair.ebitda : earningsBasis === "SDE" ? pair.sde : null;
  const fallbackBenchmark =
    earningsBasis === "EBITDA" ? pair.sde : earningsBasis === "SDE" ? pair.ebitda : null;

  // The multiple used for band comparison must always match the benchmark's
  // basis (otherwise we are comparing apples to oranges).
  const benchmark = matchingBenchmark ?? fallbackBenchmark ?? null;
  const comparisonMultiple: MetricResult =
    benchmark === null
      ? { ...evEbitda, value: null, status: "missing", display: "missing" }
      : benchmark.basis === "EBITDA"
        ? evEbitda
        : evSde;

  const currentImpliedMultiple = earningsBasis === "EBITDA" ? evEbitda : evSde;

  if (earningsUsed === null || earningsUsed <= 0 || earningsBasis === "missing") {
    return {
      status: "missing",
      earningsBasis,
      earningsUsed,
      benchmark,
      comparisonMultiple,
      currentImpliedMultiple,
      benchmarkLowValue: null,
      benchmarkMedianValue: null,
      benchmarkHighValue: null,
      benchmarkBandLabel: benchmark
        ? `${benchmark.low}x – ${benchmark.high}x (${benchmark.basis})`
        : "—",
      compatibility: "unavailable",
      bandPosition: "missing",
      valueGapVsAsking: null,
      warnings,
    };
  }

  // Determine compatibility.
  let compatibility: ValuationResult["compatibility"];
  if (!benchmark) {
    compatibility = "unavailable";
    warnings.push("Industry not provided or unmatched — benchmark band unavailable.");
  } else if (matchingBenchmark) {
    compatibility = "basis_match";
  } else {
    // Only the opposite-basis benchmark exists. We refuse to treat it as a
    // direct comparison.
    compatibility = "reference_only";
    warnings.push(
      `Benchmark for ${input.industry} is only available in ${benchmark.basis}, but earnings here are reported as ${earningsBasis}. Showing the band for reference only — band position is not used to score this deal.`,
    );
  }

  // Comparison multiple status: if the comparison multiple itself is missing
  // (e.g. SDE benchmark but SDE not provided), surface that explicitly.
  const compMultiplePresent =
    comparisonMultiple.value !== null && Number.isFinite(comparisonMultiple.value);
  if (compatibility === "basis_match" && !compMultiplePresent) {
    const ind = input.industry ? `${input.industry} ` : "";
    warnings.push(
      `${ind}benchmark is ${benchmark!.basis}-based. Add ${benchmark!.basis} to calculate a valid EV/${benchmark!.basis} comparison. Benchmark value range suppressed until ${benchmark!.basis} is provided.`,
    );
    compatibility = "reference_only";
  }

  // Hard suppression: benchmark median/low/high values are only published when
  // the benchmark basis matches the earnings basis. For reference_only or
  // unavailable, return nulls so the UI/exports/advisor cannot render an
  // invalid "implied value" or "gap vs asking".
  const isPublishableBand = compatibility === "basis_match";
  const lowVal = isPublishableBand && benchmark ? benchmark.low * earningsUsed : null;
  const medianVal = isPublishableBand && benchmark ? benchmark.median * earningsUsed : null;
  const highVal = isPublishableBand && benchmark ? benchmark.high * earningsUsed : null;

  let bandPosition: ValuationResult["bandPosition"] = "missing";
  if (compatibility === "basis_match" && benchmark && comparisonMultiple.value !== null) {
    const m = comparisonMultiple.value;
    if (m < benchmark.low) bandPosition = "below_low";
    else if (m > benchmark.high) bandPosition = "above_high";
    else if (m > benchmark.median) bandPosition = "above_median";
    else if (m < benchmark.median) bandPosition = "below_median";
    else bandPosition = "in_band";
  }
  // For reference_only or unavailable, bandPosition stays "missing" so the
  // scoring engine awards no valuation points — exactly what acceptance
  // criterion #1 requires.

  const askingOrPP =
    typeof input.purchasePrice === "number"
      ? input.purchasePrice
      : typeof input.askingPrice === "number"
        ? input.askingPrice
        : null;

  // Value gap is only meaningful when the benchmark is directly comparable AND
  // the median value was actually published (otherwise we'd be subtracting from null).
  const valueGapVsAsking =
    isPublishableBand && medianVal !== null && askingOrPP !== null
      ? medianVal - askingOrPP
      : null;

  return {
    status: compatibility === "basis_match" ? "actual" : "missing",
    earningsBasis,
    earningsUsed,
    benchmark,
    comparisonMultiple,
    currentImpliedMultiple,
    benchmarkLowValue: lowVal,
    benchmarkMedianValue: medianVal,
    benchmarkHighValue: highVal,
    benchmarkBandLabel: benchmark
      ? `${benchmark.low}x – ${benchmark.high}x (${benchmark.basis})`
      : "—",
    compatibility,
    bandPosition,
    valueGapVsAsking,
    warnings,
  };
}

function dscrPairFor(
  earningsUsed: number | null,
  capitalStack: ReturnType<typeof buildCapitalStack>,
): DscrPair {
  const afterDS = capitalStack.totalAnnualDebtService;
  const duringDS = capitalStack.totalAnnualDebtServiceDuringStandby;
  const after = dscrFromEarnings(earningsUsed, afterDS);
  const during = dscrFromEarnings(earningsUsed, duringDS);
  const annotateAfter: MetricResult = {
    ...after,
    formula: "Earnings / (SBA Debt Service + Seller Note Debt Service)",
  };
  const annotateDuring: MetricResult = {
    ...during,
    formula: "Earnings / SBA Debt Service (Seller Note in Standby)",
  };
  return { afterStandby: annotateAfter, duringStandby: annotateDuring };
}

export function analyzeDeal(
  input: DealInput,
  assumptions: CapitalStackAssumptions = DEFAULT_ASSUMPTIONS,
  buyBox: BuyBox | null = null,
): DealAnalysis {
  const earnings = selectEarnings(input);
  const price = selectPurchasePrice(input);

  const evEbitda = evToEBITDA(input);
  const evSde = evToSDE(input);
  const ebitdaMar = ebitdaMargin(input);
  const sdeMar = sdeMargin(input);

  const capitalStack = buildCapitalStack(input, assumptions);
  const dscrPair = dscrPairFor(earnings.value, capitalStack);

  // Primary DSCR for top-line displays uses the cautious post-standby figure.
  const dscrPrimary: MetricResult = dscrPair.afterStandby;

  const valuation = valuationFor(input, evEbitda, evSde, earnings.basis, earnings.value);

  const risk = scoreRisk(input);
  const missingData = detectMissingData(input);

  const partial: DealAnalysis = {
    finalBucket: "Watch",
    finalBucketReason: "Engine has not yet finalized the analysis.",
    acquisitionPriorityGate: { passed: false, reasons: ["Engine has not yet finalized the analysis."], checks: [] },
    dealId: input.id,
    companyName: input.companyName,
    isDemo: !!input.isDemo,
    isTest: !!input.isTest,
    normalizedPurchasePrice: price.value,
    normalizedPurchasePriceSource: price.source,
    earningsBasis: earnings.basis,
    earningsUsed: earnings.value,
    ebitdaMargin: ebitdaMar,
    sdeMargin: sdeMar,
    evToEBITDA: evEbitda,
    evToSDE: evSde,
    capitalStack,
    dscr: dscrPrimary,
    dscrPair,
    valuation,
    risk,
    score: {
      status: "scored",
      score: 0,
      contributions: [],
      capsApplied: [],
      bucket: "Watch",
    },
    missingData,
    verdict: {
      verdict: "PURSUE WITH CAUTION",
      rationale: "",
      blockers: [],
      confidence: "low",
      isPreliminary: true,
      confidenceReason: "Engine has not yet finalized the analysis.",
    },
    scoreLabel: "Score",
    thesis: scoreThesisFit(input, buyBox ?? DEFAULT_BUY_BOX),
    workingCapital: scoreWorkingCapital(input),
    integration: scoreIntegration(input),
    governance: {
      gates: [],
      passedCount: 0,
      totalCount: 0,
      icReady: false,
      loiReady: false,
      lenderReady: false,
      closeReady: false,
      blockers: [],
      nextGovernanceAction: "",
    },
    freeze: {
      status: "green",
      triggers: [],
      blocksAcquisitionPriority: false,
      blocksCloseReady: false,
      blocksAggressiveLOI: false,
      rationale: "",
    },
    redTeam: { objections: [], topObjections: [], unresolvedCriticalCount: 0, rationale: "" },
    nextActions: [],
    assumptions,
    // Buyer-grade advisory fields — populated after full analysis.
    buyerCashFlow: {
      earningsUsed: null, totalAnnualDebtService: null, requiredCapEx: null, workingCapitalReserve: null,
      buyerCashFlow: { value: null, display: "pending", status: "missing", formula: "", inputs: {} },
      buyerCashFlowDuringStandby: { value: null, display: "pending", status: "missing", formula: "", inputs: {} },
      cashOnCashReturn: { value: null, display: "pending", status: "missing", formula: "", inputs: {} },
      warnings: [],
    },
    maxSupportablePP: { at1_25x: null, at1_50x: null, at2_00x: null, atBuyerTarget: null, buyerDscrTargetUsed: assumptions.buyerDscrTarget ?? 1.5, currentPrice: null, priceIsSupported: false, warnings: [] },
    stressTest: { scenarios: [], worstCaseDscr: null, allScenariosPass: false, anyScenariosPass: false, stressRating: "missing", warnings: [] },
    refinedVerdict: { verdict: "Pursue with Conditions", buyerReason: "", conditions: [], urgency: "medium" },
    recommendedOffer: { openingOffer: null, targetPrice: null, maximumPrice: null, preferredStructure: "", sellerNoteAmount: null, earnoutAmount: null, earnoutTrigger: null, requiredTransitionWeeks: 12, rationale: "", warnings: [] },
    autoDiligence: { items: [], criticalCount: 0, importantCount: 0, receivedCount: 0, completionPct: 0, readyForLOI: false, readyForLender: false, warnings: [] },
    dataQuality: { score: 0, label: "Very Low", fieldsProvided: 0, fieldsTotal: 0, criticalGaps: [], importantGaps: [], rationale: "" },
    assumptionBadges: [],
    anomalies: [],
  };

  const scoreResult = scoreDeal({ input, analysis: partial });
  partial.score = scoreResult;

  const verdict = computeVerdict(partial);
  partial.verdict = verdict;
  partial.scoreLabel = verdict.isPreliminary ? "Preliminary Score" : "Score";

  // Compute institutional M&A modules
  partial.freeze = computeDealFreeze(partial);
  partial.redTeam = computeRedTeam(partial);
  partial.governance = computeGovernance(partial);

  // Working capital missing blocks Close Ready
  if (partial.workingCapital.status === "missing") {
    partial.governance.closeReady = false;
  }
  if (partial.freeze.status === "red") {
    partial.governance.closeReady = false;
  }

  // ---------------------------------------------------------------------
  // FINAL BUCKET — single source of truth consumed by every UI/advisor/export.
  // Replaces the previous practice of letting `score.bucket` and
  // `verdict.verdict` drift apart. The gate is intentionally strict: a deal
  // is only "Acquisition Priority" if every dimension passes. Anything less
  // is downgraded with a human-readable reason.
  // ---------------------------------------------------------------------
  const gate = computeAcquisitionPriorityGate(partial);
  partial.acquisitionPriorityGate = gate;
  const { finalBucket, finalBucketReason } = resolveFinalBucket(partial, gate);
  partial.finalBucket = finalBucket;
  partial.finalBucketReason = finalBucketReason;
  partial.score.bucket = finalBucket; // keep legacy field in lockstep

  partial.nextActions = nextActionsFor(partial);

  // ── Buyer-grade advisory modules (Iteration 6) ──────────────────────────
  partial.buyerCashFlow = computeBuyerCashFlow(partial);
  partial.maxSupportablePP = computeMaxSupportablePP(input, partial);
  partial.stressTest = computeStressTest(input, partial);
  partial.refinedVerdict = computeRefinedVerdict(partial);
  partial.recommendedOffer = computeRecommendedOffer(partial);
  partial.autoDiligence = computeAutoDiligence(input, partial);
  partial.dataQuality = computeDataQuality(input, partial);
  partial.assumptionBadges = computeAssumptionBadges(input, partial);
  partial.anomalies = computeAnomalies(input, partial);

  return partial;
}

/**
 * The 8-check Acquisition Priority gate. ALL checks must pass — otherwise the
 * deal cannot be promoted to Acquisition Priority regardless of score.
 */
function computeAcquisitionPriorityGate(
  a: DealAnalysis,
): DealAnalysis["acquisitionPriorityGate"] {
  const checks: Array<{ name: string; passed: boolean; detail: string }> = [];

  const coreMathOk =
    a.missingData.canUnderwrite &&
    a.earningsUsed !== null &&
    a.earningsUsed > 0 &&
    a.capitalStack.purchasePriceUsed !== null;
  checks.push({
    name: "Core math works",
    passed: coreMathOk,
    detail: coreMathOk
      ? "Revenue, earnings, and price all present and positive."
      : "Cannot underwrite — earnings, revenue, or price missing.",
  });

  const dscrAfter = a.dscrPair.afterStandby.value;
  const dscrOk = dscrAfter !== null && dscrAfter >= 1.4;
  checks.push({
    name: "DSCR after standby \u2265 1.40x",
    passed: dscrOk,
    detail:
      dscrAfter === null
        ? "DSCR after standby is missing."
        : `DSCR after standby is ${dscrAfter.toFixed(2)}x (need \u2265 1.40x).`,
  });

  const noCritical = a.missingData.criticalMissing.length === 0;
  checks.push({
    name: "No critical missing data",
    passed: noCritical,
    detail: noCritical
      ? "All critical inputs present."
      : `Critical missing: ${a.missingData.criticalMissing.join(", ")}.`,
  });

  const importantOk = a.missingData.importantMissing.length <= 5;
  checks.push({
    name: "Important missing \u2264 5",
    passed: importantOk,
    detail: `${a.missingData.importantMissing.length} important diligence items missing (cap 5).`,
  });

  const diligenceContrib = a.score.contributions.find((c) => c.category === "Diligence");
  const diligenceEarned = diligenceContrib?.earned ?? 0;
  const diligenceOk = diligenceEarned >= 3;
  checks.push({
    name: "Diligence \u2265 3 / 10",
    passed: diligenceOk,
    detail: `Diligence score ${diligenceEarned}/10 (need \u2265 3).`,
  });

  const riskOk = a.risk.riskConfidence === "high" || a.risk.riskConfidence === "medium";
  checks.push({
    name: "Risk panel materially complete",
    passed: riskOk && !a.risk.hasCritical,
    detail: a.risk.hasCritical
      ? "Critical risk factor present."
      : `Risk confidence: ${a.risk.riskConfidence} (${a.risk.totalFactors - a.risk.missingCount}/${a.risk.totalFactors} factors scored).`,
  });

  const blockerKeys = [
    a.missingData.importantMissing.includes("Revenue trend (growing / flat / declining)")
      ? "Revenue trend unknown"
      : null,
    a.missingData.importantMissing.includes("Customer concentration percentage")
      ? "Customer concentration unknown"
      : null,
    a.missingData.importantMissing.includes("Owner role / operating responsibility")
      ? "Owner role unknown"
      : null,
  ].filter(Boolean) as string[];
  const noBlockers = blockerKeys.length === 0 && a.freeze.status !== "red";
  checks.push({
    name: "No unresolved blockers",
    passed: noBlockers,
    detail:
      blockerKeys.length > 0
        ? `Blockers: ${blockerKeys.join("; ")}.`
        : a.freeze.status === "red"
          ? "Deal freeze is RED."
          : "No blocking unknowns.",
  });

  // LOI ready or near-ready: full LOI ready, or only one of P&L / tax returns missing.
  const loiReady = a.missingData.canGenerateLOI;
  const loiNearReady =
    !loiReady &&
    (!!a.missingData.importantMissing.includes("P&L statements") !==
      !!a.missingData.importantMissing.includes("Tax returns"));
  const loiOk = loiReady || loiNearReady;
  checks.push({
    name: "LOI ready or near-ready",
    passed: loiOk,
    detail: loiReady
      ? "LOI ready (P&L + tax returns received)."
      : loiNearReady
        ? "LOI near-ready (one of P&L / tax returns outstanding)."
        : "LOI not ready — multiple core documents outstanding.",
  });

  // Thesis fit: off-thesis without an approved exception blocks promotion.
  const thesisOk = !(a.thesis.bucket === "Off-Thesis" && !a.thesis.exceptionApproved);
  checks.push({
    name: "Thesis fit (or exception approved)",
    passed: thesisOk,
    detail: thesisOk
      ? `Thesis bucket: ${a.thesis.bucket}.`
      : "Off-Thesis and no exception approved.",
  });

  const failed = checks.filter((c) => !c.passed);
  return {
    passed: failed.length === 0,
    reasons: failed.map((c) => `${c.name}: ${c.detail}`),
    checks,
  };
}

function resolveFinalBucket(
  a: DealAnalysis,
  gate: DealAnalysis["acquisitionPriorityGate"],
): { finalBucket: import("./types").FinalBucket; finalBucketReason: string } {
  // 1) Hard input gates win.
  if (!a.missingData.canUnderwrite) {
    return {
      finalBucket: "Cannot Underwrite",
      finalBucketReason: `Cannot underwrite: ${a.missingData.criticalMissing.join(", ") || "core inputs missing"}.`,
    };
  }
  // 1b) Invalid capital stack (e.g. 105% allocation) cannot produce a normal verdict.
  if (!a.capitalStack.pctValid) {
    return {
      finalBucket: "Cannot Underwrite",
      finalBucketReason: `Capital stack is invalid ( ${(a.capitalStack.pctTotal * 100).toFixed(0)}% allocated ). Fix the SBA / seller-note / equity split before scoring.`,
    };
  }
  if (a.score.status === "review_required") {
    return {
      finalBucket: "Scoring Review",
      finalBucketReason:
        a.score.blockerReason ?? "Score conflicts with fundamentals.",
    };
  }

  // 2) Verdict drives the bucket, with strict gating for Acquisition Priority.
  const v = a.verdict.verdict;
  if (v === "KILL") {
    return { finalBucket: "Kill/Pause", finalBucketReason: a.verdict.rationale };
  }
  if (v === "CANNOT UNDERWRITE") {
    return { finalBucket: "Cannot Underwrite", finalBucketReason: a.verdict.rationale };
  }
  if (v === "SCORING REVIEW REQUIRED") {
    return { finalBucket: "Scoring Review", finalBucketReason: a.verdict.rationale };
  }
  if (v === "DILIGENCE PRIORITY") {
    return {
      finalBucket: "Diligence Priority",
      finalBucketReason: a.verdict.rationale,
    };
  }
  if (v === "RENEGOTIATE") {
    return { finalBucket: "Watch", finalBucketReason: a.verdict.rationale };
  }
  if (v === "PURSUE WITH CAUTION") {
    // Cautious pursue requires diligence work first.
    return {
      finalBucket: "Diligence Priority",
      finalBucketReason:
        "Verdict is PURSUE WITH CAUTION — confirm diligence and risk completeness before promoting to Acquisition Priority.",
    };
  }
  // v === "PURSUE" → only Acquisition Priority if every gate check passes.
  if (gate.passed) {
    return {
      finalBucket: "Acquisition Priority",
      finalBucketReason:
        "Verdict is PURSUE and every Acquisition Priority gate check is satisfied.",
    };
  }
  return {
    finalBucket: "Diligence Priority",
    finalBucketReason: `Verdict is PURSUE, but Acquisition Priority gate failed: ${gate.reasons.join("; ")}`,
  };
}

export { fmtCurrencyExact, fmtMultiple };

export * from "./types";
export * from "./benchmarkMultiples";
export { DEFAULT_ASSUMPTIONS, buildCapitalStack } from "./dealMath";
export { scoreRisk } from "./riskScoring";
export { detectMissingData } from "./missingData";
export { DEFAULT_BUY_BOX } from "./thesis";
