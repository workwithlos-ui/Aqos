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

  // Off-thesis blocks Acquisition Priority unless exception approved
  if (partial.thesis.bucket === "Off-Thesis" && !partial.thesis.exceptionApproved) {
    if (partial.score.bucket === "Acquisition Priority") {
      partial.score.bucket = "Diligence Priority";
    }
  }

  // Red freeze blocks Acquisition Priority and Close Ready
  if (partial.freeze.status === "red") {
    if (partial.score.bucket === "Acquisition Priority") {
      partial.score.bucket = "Diligence Priority";
    }
    partial.governance.closeReady = false;
  }

  // Working capital missing blocks Close Ready
  if (partial.workingCapital.status === "missing") {
    partial.governance.closeReady = false;
  }

  partial.nextActions = nextActionsFor(partial);
  return partial;
}

export { fmtCurrencyExact, fmtMultiple };

export * from "./types";
export * from "./benchmarkMultiples";
export { DEFAULT_ASSUMPTIONS, buildCapitalStack } from "./dealMath";
export { scoreRisk } from "./riskScoring";
export { detectMissingData } from "./missingData";
export { DEFAULT_BUY_BOX } from "./thesis";
