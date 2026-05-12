// AdvisorContext: the only object an AI advisor (or future LLM) is allowed to
// see. It mirrors the verified DealAnalysis but flattens it into terse strings
// so the advisor cannot accidentally re-derive math from raw inputs.
//
// The guardrail system prompt below tells the advisor that:
//   • everything in this object is the ONLY source of truth
//   • absent values must be reported as "missing", never invented
//   • the verdict belongs to the engine; the advisor only interprets

import type { DealAnalysis } from "./types";
import { fmtCurrencyExact, fmtMultiple } from "./dealMath";

export interface AdvisorDealContext {
  dealId?: string;
  companyName: string;
  industry: string;
  stage: string;
  isDemoOrTest: boolean;

  revenue: string;
  earningsBasis: DealAnalysis["earningsBasis"];
  earnings: string;
  askingPrice: string;
  purchasePriceUsed: string;
  purchasePriceSource: string;
  multipleEvEbitda: string;
  multipleEvSde: string;
  ebitdaMargin: string;
  sdeMargin: string;

  benchmark: string;
  benchmarkBand: string;
  benchmarkMedianImpliedValue: string;
  benchmarkValueGapVsAsking: string;
  bandPosition: string;

  capitalStack: {
    purchasePrice: string;
    sba: string;
    sellerNote: string;
    buyerEquity: string;
    totalSources: string;
    differenceVsPP: string;
    sbaAnnualDebtService: string;
    sellerNoteAnnualDebtService: string;
    totalAnnualDebtService: string;
    sellerNoteStandby: string;
    warnings: string[];
  };

  dscr: {
    primary: string;
    duringStandby: string;
    afterStandby: string;
    verdict: string;
  };

  riskFactors: Array<{ label: string; score: string; level: string; rationale: string }>;
  riskHasCritical: boolean;

  scoreOutOf100: number;
  scoreBucket: DealAnalysis["score"]["bucket"];
  capsApplied: string[];
  scoreNotes: string[];

  missingCritical: string[];
  missingImportant: string[];
  missingNiceToHave: string[];

  verdict: DealAnalysis["verdict"]["verdict"];
  verdictRationale: string;
  verdictBlockers: string[];
  verdictConfidence: DealAnalysis["verdict"]["confidence"];

  nextActions: string[];
}

export interface AdvisorPortfolioContext {
  totalDeals: number;
  acquisitionPriority: AdvisorDealContext[];
  diligencePriority: AdvisorDealContext[];
  killOrPause: AdvisorDealContext[];
  scoringReview: AdvisorDealContext[];
  cannotUnderwrite: AdvisorDealContext[];
  excludedDemoOrTest: number;
}

function s(value: number | null | undefined, kind: "money" | "mult" | "pct" | "raw" = "raw"): string {
  if (value === null || value === undefined || Number.isNaN(value as number))
    return "missing";
  if (kind === "money") return fmtCurrencyExact(value as number);
  if (kind === "mult") return fmtMultiple(value as number);
  if (kind === "pct") return `${((value as number) * 100).toFixed(1)}%`;
  return String(value);
}

export function buildAdvisorDealContext(a: DealAnalysis): AdvisorDealContext {
  const benchmark = a.valuation.benchmark;
  const askingPrice =
    typeof a.capitalStack.purchasePriceUsed === "number"
      ? a.capitalStack.purchasePriceUsed
      : null;

  return {
    dealId: a.dealId,
    companyName: a.companyName,
    industry: benchmark?.industryLabel ?? "missing",
    stage: "—",
    isDemoOrTest: a.isDemo || a.isTest,
    revenue: s(
      typeof a.ebitdaMargin.inputs.Revenue === "number"
        ? (a.ebitdaMargin.inputs.Revenue as number)
        : typeof a.sdeMargin.inputs.Revenue === "number"
          ? (a.sdeMargin.inputs.Revenue as number)
          : null,
      "money",
    ),
    earningsBasis: a.earningsBasis,
    earnings: s(a.earningsUsed, "money"),
    askingPrice: s(askingPrice, "money"),
    purchasePriceUsed: s(a.capitalStack.purchasePriceUsed, "money"),
    purchasePriceSource: a.capitalStack.purchasePriceSource,
    multipleEvEbitda: a.evToEBITDA.value === null ? "missing" : fmtMultiple(a.evToEBITDA.value),
    multipleEvSde: a.evToSDE.value === null ? "missing" : fmtMultiple(a.evToSDE.value),
    ebitdaMargin: a.ebitdaMargin.display,
    sdeMargin: a.sdeMargin.display,
    benchmark: benchmark ? `${benchmark.industryLabel} (${benchmark.basis}, confidence ${benchmark.confidence})` : "missing",
    benchmarkBand: a.valuation.benchmarkBandLabel,
    benchmarkMedianImpliedValue: s(a.valuation.benchmarkMedianValue, "money"),
    benchmarkValueGapVsAsking: s(a.valuation.valueGapVsAsking, "money"),
    bandPosition: a.valuation.bandPosition.replace("_", " "),
    capitalStack: {
      purchasePrice: s(a.capitalStack.purchasePriceUsed, "money"),
      sba: `${(a.assumptions.sbaLoanPct * 100).toFixed(0)}% / ${s(a.capitalStack.sba.amount, "money")}`,
      sellerNote: `${(a.assumptions.sellerNotePct * 100).toFixed(0)}% / ${s(a.capitalStack.sellerNote.amount, "money")}`,
      buyerEquity: `${(a.assumptions.buyerEquityPct * 100).toFixed(0)}% / ${s(a.capitalStack.buyerEquity.amount, "money")}`,
      totalSources: s(a.capitalStack.totalSources, "money"),
      differenceVsPP: s(a.capitalStack.differenceVsPurchasePrice, "money"),
      sbaAnnualDebtService: s(a.capitalStack.sba.annualDebtService, "money"),
      sellerNoteAnnualDebtService: s(a.capitalStack.sellerNote.annualDebtService, "money"),
      totalAnnualDebtService: s(a.capitalStack.totalAnnualDebtService, "money"),
      sellerNoteStandby:
        a.capitalStack.sellerNote.standbyMonths > 0
          ? `${a.capitalStack.sellerNote.standbyMonths} months`
          : "none",
      warnings: a.capitalStack.warnings,
    },
    dscr: {
      primary: a.dscr.display,
      duringStandby: a.dscrPair.duringStandby.display,
      afterStandby: a.dscrPair.afterStandby.display,
      verdict:
        a.dscr.value === null
          ? "Missing"
          : a.dscr.value >= 1.5
            ? "Strong"
            : a.dscr.value >= 1.25
              ? "Acceptable"
              : a.dscr.value >= 1.0
                ? "Risky"
                : "Fail",
    },
    riskFactors: a.risk.factors.map((f) => ({
      label: f.label,
      score: f.score === null ? "missing" : String(f.score),
      level: f.level,
      rationale: f.rationale,
    })),
    riskHasCritical: a.risk.hasCritical,
    scoreOutOf100: Math.round(a.score.score),
    scoreBucket: a.score.bucket,
    capsApplied: a.score.capsApplied,
    scoreNotes: a.score.contributions.map((c) => `${c.category}: ${c.earned}/${c.available} — ${c.notes}`),
    missingCritical: a.missingData.criticalMissing,
    missingImportant: a.missingData.importantMissing,
    missingNiceToHave: a.missingData.niceToHaveMissing,
    verdict: a.verdict.verdict,
    verdictRationale: a.verdict.rationale,
    verdictBlockers: a.verdict.blockers,
    verdictConfidence: a.verdict.confidence,
    nextActions: a.nextActions,
  };
}

export function buildAdvisorPortfolioContext(
  analyses: DealAnalysis[],
): AdvisorPortfolioContext {
  const live = analyses.filter((a) => !a.isDemo && !a.isTest);
  const contexts = live.map(buildAdvisorDealContext);
  return {
    totalDeals: live.length,
    acquisitionPriority: contexts.filter((c) => c.scoreBucket === "Acquisition Priority"),
    diligencePriority: contexts.filter((c) => c.scoreBucket === "Diligence Priority"),
    killOrPause: contexts.filter((c) => c.scoreBucket === "Kill/Pause"),
    scoringReview: contexts.filter((c) => c.scoreBucket === "Scoring Review"),
    cannotUnderwrite: contexts.filter((c) => c.scoreBucket === "Cannot Underwrite"),
    excludedDemoOrTest: analyses.length - live.length,
  };
}

export const ADVISOR_SYSTEM_PROMPT = `You are Deal Copilot for Acquisition OS — a disciplined acquisition analyst, not a chatbot.

CORE RULE — DO NOT INVENT DATA.
The deterministic engine has already calculated revenue, EBITDA, SDE, asking price, purchase price, DSCR, capital stack, multiples, risk scores, deal score, missing-data lists, and the verdict. Quote only what appears in the AdvisorContext you receive. If a field is "missing", say "missing" — never substitute a placeholder, comparable, or industry-average number.

You may:
  • interpret structured verified data
  • write IC memos, lender summaries, broker emails, diligence request lists, LOI strategy notes, and kill memos using only the structured fields
  • challenge the buyer's assumptions where the data explicitly supports it
  • escalate when score/verdict status is "Scoring Review" or "Cannot Underwrite"

You must not:
  • invent revenue, EBITDA, SDE, asking price, purchase price, DSCR, multiples, seller note terms, SBA amounts, buyer equity, industry, benchmark multiples, risk scores, deal scores, deal stages, customer concentration, value capture, or lender approval probability
  • override the verdict produced by the engine
  • output NaN, Infinity, undefined, null, or fake confidence

Response structure for every answer:
  1. Verdict (use the engine verdict verbatim)
  2. Why (interpret the rationale + score notes)
  3. Missing data (list verbatim)
  4. Next action (use the engine's nextActions list)
  5. Risk (highest risk factor name + level)
  6. Confidence (use the engine's verdictConfidence)
`;
