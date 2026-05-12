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
import { getBenchmarkMultiple } from "./benchmarkMultiples";
import { scoreRisk } from "./riskScoring";
import { detectMissingData } from "./missingData";
import { scoreDeal } from "./dealScoring";
import { computeVerdict, nextActionsFor } from "./dealVerdict";
import type {
  CapitalStackAssumptions,
  DealAnalysis,
  DealInput,
  DscrPair,
  MetricResult,
  ValuationResult,
} from "./types";

function valuationFor(
  input: DealInput,
  evMultiple: MetricResult,
  earningsBasis: DealAnalysis["earningsBasis"],
  earningsUsed: number | null,
): ValuationResult {
  const benchmark = input.industry ? getBenchmarkMultiple(input.industry) : null;
  const warnings: string[] = [];

  if (earningsUsed === null || earningsUsed <= 0 || earningsBasis === "missing") {
    return {
      status: "missing",
      earningsBasis,
      earningsUsed,
      benchmark,
      currentImpliedMultiple: evMultiple,
      benchmarkLowValue: null,
      benchmarkMedianValue: null,
      benchmarkHighValue: null,
      benchmarkBandLabel: benchmark
        ? `${benchmark.low}x – ${benchmark.high}x (${benchmark.basis})`
        : "—",
      bandPosition: "missing",
      valueGapVsAsking: null,
      warnings,
    };
  }
  if (!benchmark) {
    warnings.push("Industry not provided — benchmark band unavailable.");
  } else if (benchmark.basis !== earningsBasis) {
    warnings.push(
      `Benchmark uses ${benchmark.basis} multiples but earnings basis here is ${earningsBasis}. Compare with caution.`,
    );
  }

  const lowVal = benchmark ? benchmark.low * earningsUsed : null;
  const medianVal = benchmark ? benchmark.median * earningsUsed : null;
  const highVal = benchmark ? benchmark.high * earningsUsed : null;

  let bandPosition: ValuationResult["bandPosition"] = "missing";
  if (benchmark && evMultiple.value !== null) {
    const m = evMultiple.value;
    if (m < benchmark.low) bandPosition = "below_low";
    else if (m > benchmark.high) bandPosition = "above_high";
    else if (m > benchmark.median) bandPosition = "above_median";
    else if (m < benchmark.median) bandPosition = "below_median";
    else bandPosition = "in_band";
  }

  const askingOrPP =
    typeof input.purchasePrice === "number"
      ? input.purchasePrice
      : typeof input.askingPrice === "number"
        ? input.askingPrice
        : null;

  const valueGapVsAsking =
    medianVal !== null && askingOrPP !== null ? medianVal - askingOrPP : null;

  return {
    status: "actual",
    earningsBasis,
    earningsUsed,
    benchmark,
    currentImpliedMultiple: evMultiple,
    benchmarkLowValue: lowVal,
    benchmarkMedianValue: medianVal,
    benchmarkHighValue: highVal,
    benchmarkBandLabel: benchmark
      ? `${benchmark.low}x – ${benchmark.high}x (${benchmark.basis})`
      : "—",
    bandPosition,
    valueGapVsAsking,
    warnings,
  };
}

function dscrPairFor(
  earningsUsed: number | null,
  capitalStack: ReturnType<typeof buildCapitalStack>,
): DscrPair {
  // After standby: full debt service (SBA + Seller note).
  // During standby: SBA only (seller note debt service excluded).
  const afterDS = capitalStack.totalAnnualDebtService;
  const duringDS = capitalStack.totalAnnualDebtServiceDuringStandby;

  const after = dscrFromEarnings(earningsUsed, afterDS);
  const during = dscrFromEarnings(earningsUsed, duringDS);
  // Annotate which scenario each result represents.
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
): DealAnalysis {
  const earnings = selectEarnings(input);
  const price = selectPurchasePrice(input);

  const evEbitda = evToEBITDA(input);
  const evSde = evToSDE(input);
  const ebitdaMar = ebitdaMargin(input);
  const sdeMar = sdeMargin(input);

  const capitalStack = buildCapitalStack(input, assumptions);
  const dscrPair = dscrPairFor(earnings.value, capitalStack);

  // Primary DSCR for top-line displays: when seller note is in standby, show
  // "During Standby" as the cautious number; otherwise show the After Standby.
  // We always expose both via dscrPair.
  const sellerNoteInStandby = assumptions.sellerNoteStandbyMonths > 0;
  const dscrPrimary: MetricResult = sellerNoteInStandby
    ? dscrPair.afterStandby
    : dscrPair.afterStandby;

  const evMultiple = earnings.basis === "EBITDA" ? evEbitda : evSde;
  const valuation = valuationFor(input, evMultiple, earnings.basis, earnings.value);

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
    },
    nextActions: [],
    assumptions,
  };

  const scoreResult = scoreDeal({ input, analysis: partial });
  partial.score = scoreResult;

  const verdict = computeVerdict(partial);
  partial.verdict = verdict;

  partial.nextActions = nextActionsFor(partial);
  return partial;
}

export {
  fmtCurrencyExact,
  fmtMultiple,
};

export * from "./types";
export * from "./benchmarkMultiples";
export { DEFAULT_ASSUMPTIONS, buildCapitalStack } from "./dealMath";
export { scoreRisk } from "./riskScoring";
export { detectMissingData } from "./missingData";
