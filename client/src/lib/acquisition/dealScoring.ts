// Deal scoring (0–100). Higher is better.
// Six weighted buckets:
//   Valuation 25, Debt Service 25, Profitability 15, Risk 20, Diligence 10, Stage 5.
//
// Hard caps prevent the score from masking a structurally broken deal:
//   • No EBITDA/SDE  → cap 30
//   • No asking/purchase price → cap 45
//   • DSCR missing  → cap 60
//   • DSCR < 1.0    → cap 40
//   • Critical risk → cap 65
//   • Inconsistent  → blocked / Needs Review.

import type {
  DealAnalysis,
  DealInput,
  DealScoreContribution,
  DealScoreResult,
  MissingDataResult,
} from "./types";

const STAGE_MOMENTUM: Record<string, number> = {
  "Target Identified": 0.4,
  Contacted: 0.5,
  "Conversation Held": 0.6,
  "Financials Requested": 0.75,
  "Under Analysis": 0.85,
  "LOI Submitted": 1,
  Diligence: 1,
  Closing: 1,
  Closed: 1,
  Passed: 0.1,
};

export interface ScoreInputs {
  input: DealInput;
  analysis: Pick<
    DealAnalysis,
    | "earningsBasis"
    | "earningsUsed"
    | "valuation"
    | "evToEBITDA"
    | "evToSDE"
    | "ebitdaMargin"
    | "sdeMargin"
    | "capitalStack"
    | "dscr"
    | "risk"
    | "missingData"
  >;
}

function valuationPoints(a: ScoreInputs["analysis"]): DealScoreContribution {
  const note: string[] = [];
  let earned = 0;
  const available = 25;
  const v = a.valuation;
  if (v.status === "missing") {
    note.push("Valuation could not be calculated — earnings or price missing.");
    return { category: "Valuation", earned: 0, available, notes: note.join(" ") };
  }
  switch (v.bandPosition) {
    case "below_low":
      earned = 25;
      note.push("Asking price is below benchmark band — strong value entry.");
      break;
    case "in_band":
      earned = v.currentImpliedMultiple.value && v.benchmark
        ? v.currentImpliedMultiple.value <= v.benchmark.median
          ? 20
          : 15
        : 15;
      note.push("Asking price sits inside benchmark band.");
      break;
    case "above_median":
      earned = 12;
      note.push("Above median benchmark but inside range.");
      break;
    case "below_median":
      earned = 22;
      note.push("Below median benchmark.");
      break;
    case "above_high":
      earned = 4;
      note.push("Asking price is above benchmark high — overpriced.");
      break;
    default:
      earned = 0;
  }
  return { category: "Valuation", earned, available, notes: note.join(" ") };
}

function debtServicePoints(a: ScoreInputs["analysis"]): DealScoreContribution {
  const available = 25;
  const dscr = a.dscr.value;
  if (dscr === null) {
    return {
      category: "Debt Service",
      earned: 0,
      available,
      notes:
        a.dscr.warning ??
        "DSCR could not be calculated — capital stack or earnings missing.",
    };
  }
  let earned = 0;
  if (dscr >= 1.75) earned = 25;
  else if (dscr >= 1.5) earned = 22;
  else if (dscr >= 1.25) earned = 16;
  else if (dscr >= 1.1) earned = 9;
  else if (dscr >= 1.0) earned = 5;
  else earned = 0;
  return {
    category: "Debt Service",
    earned,
    available,
    notes: `DSCR ${dscr.toFixed(2)}x — ${dscr >= 1.25 ? "lender-acceptable" : dscr >= 1.0 ? "tight" : "fails minimum"}.`,
  };
}

function profitabilityPoints(a: ScoreInputs["analysis"]): DealScoreContribution {
  const available = 15;
  const margin =
    a.earningsBasis === "EBITDA" ? a.ebitdaMargin.value : a.sdeMargin.value;
  if (margin === null) {
    return {
      category: "Profitability",
      earned: 0,
      available,
      notes: "Margin could not be calculated.",
    };
  }
  let earned = 0;
  if (margin >= 0.25) earned = 15;
  else if (margin >= 0.18) earned = 12;
  else if (margin >= 0.12) earned = 8;
  else if (margin >= 0.06) earned = 4;
  else earned = 1;
  return {
    category: "Profitability",
    earned,
    available,
    notes: `${a.earningsBasis} margin ${(margin * 100).toFixed(1)}%.`,
  };
}

function riskPoints(a: ScoreInputs["analysis"]): DealScoreContribution {
  const available = 20;
  const avg = a.risk.averageScore;
  if (avg === null) {
    return {
      category: "Risk",
      earned: 8,
      available,
      notes: "No risk signals provided — neutral allocation.",
    };
  }
  // 1=low risk → 20 pts, 5=critical → 0 pts.
  const earned = Math.max(0, Math.min(20, Math.round((5 - avg) * 5)));
  return {
    category: "Risk",
    earned,
    available,
    notes: `Average risk score ${avg.toFixed(2)} of 5.${a.risk.hasCritical ? " Critical risk present." : ""}`,
  };
}

function diligencePoints(missing: MissingDataResult): DealScoreContribution {
  const available = 10;
  const totalMissing =
    missing.criticalMissing.length +
    missing.importantMissing.length +
    Math.max(0, missing.niceToHaveMissing.length - 2);
  let earned = 10 - Math.min(10, totalMissing);
  if (earned < 0) earned = 0;
  return {
    category: "Diligence",
    earned,
    available,
    notes: `${missing.criticalMissing.length} critical / ${missing.importantMissing.length} important data gaps.`,
  };
}

function stagePoints(input: DealInput): DealScoreContribution {
  const available = 5;
  const stage = (input.stage as string) ?? "";
  const factor = STAGE_MOMENTUM[stage] ?? 0.5;
  return {
    category: "Stage",
    earned: Math.round(available * factor),
    available,
    notes: stage ? `Pipeline stage: ${stage}.` : "Stage unspecified.",
  };
}

export function scoreDeal(args: ScoreInputs): DealScoreResult {
  const { input, analysis } = args;
  const contributions: DealScoreContribution[] = [
    valuationPoints(analysis),
    debtServicePoints(analysis),
    profitabilityPoints(analysis),
    riskPoints(analysis),
    diligencePoints(analysis.missingData),
    stagePoints(input),
  ];

  const raw = contributions.reduce((s, c) => s + c.earned, 0);

  const caps: string[] = [];
  let cap = 100;
  if (analysis.earningsUsed === null) {
    cap = Math.min(cap, 30);
    caps.push("EBITDA / SDE missing — score capped at 30.");
  } else if (analysis.earningsUsed <= 0) {
    cap = Math.min(cap, 30);
    caps.push("Earnings are zero or negative — score capped at 30.");
  }
  if (analysis.capitalStack.purchasePriceUsed === null) {
    cap = Math.min(cap, 45);
    caps.push("Asking / purchase price missing — score capped at 45.");
  }
  if (analysis.dscr.value === null) {
    cap = Math.min(cap, 60);
    caps.push("DSCR missing — score capped at 60.");
  } else if (analysis.dscr.value < 1.0) {
    cap = Math.min(cap, 40);
    caps.push("DSCR below 1.00 — score capped at 40.");
  }
  if (analysis.risk.hasCritical) {
    cap = Math.min(cap, 65);
    caps.push("Critical risk factor present — score capped at 65.");
  }

  let score = Math.min(raw, cap);

  // Anomaly: if score is high but DSCR fails badly, force review.
  let status: DealScoreResult["status"] = "scored";
  let blockerReason: string | undefined;
  if (
    score >= 70 &&
    analysis.dscr.value !== null &&
    analysis.dscr.value < 1.0
  ) {
    status = "review_required";
    blockerReason =
      "Score conflicts with fundamentals: DSCR fails 1.00x but score remains high.";
  }
  if (
    score >= 60 &&
    (analysis.earningsUsed === null || (analysis.earningsUsed ?? 0) <= 0)
  ) {
    status = "review_required";
    blockerReason =
      "Score conflicts with fundamentals: no positive earnings but score >= 60.";
  }
  if (analysis.missingData.criticalMissing.length > 0) {
    status = "blocked";
    blockerReason = `Critical data missing: ${analysis.missingData.criticalMissing.join(", ")}.`;
    score = Math.min(score, 30);
  }

  // Bucket assignment.
  let bucket: DealScoreResult["bucket"] = "Watch";
  if (!analysis.missingData.canUnderwrite) bucket = "Cannot Underwrite";
  else if (status === "review_required") bucket = "Scoring Review";
  else if (
    analysis.dscr.value !== null &&
    analysis.dscr.value < 1.0 &&
    analysis.earningsUsed !== null &&
    analysis.earningsUsed <= 0
  )
    bucket = "Kill/Pause";
  else if (
    score >= 75 &&
    analysis.dscr.value !== null &&
    analysis.dscr.value >= 1.25 &&
    !analysis.risk.hasCritical
  )
    bucket = "Acquisition Priority";
  else if (analysis.missingData.importantMissing.length > 3 || analysis.risk.hasCritical)
    bucket = "Diligence Priority";
  else if (
    analysis.dscr.value !== null &&
    analysis.dscr.value < 1.0
  )
    bucket = "Kill/Pause";

  return {
    status,
    score,
    contributions,
    capsApplied: caps,
    blockerReason,
    bucket,
  };
}
