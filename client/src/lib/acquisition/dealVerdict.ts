// Deterministic verdict layer. The AI advisor cannot override this — it can
// only quote it. The verdict is computed from the structured DealAnalysis the
// engine already produced, so the verdict trace is auditable.
//
// Confidence is no longer hard-coded per branch. It is computed from data
// completeness (critical gaps, important gaps, and risk completeness) so that
// the preliminary-vs-final distinction is honest. This is the fix for
// Issues 3 and 4 (preliminary score labeling + missing-data influence).

import type { DealAnalysis, DealVerdictResult, Verdict } from "./types";

interface ConfidenceAssessment {
  confidence: "high" | "medium" | "low";
  isPreliminary: boolean;
  reason: string;
}

function assessConfidence(a: DealAnalysis): ConfidenceAssessment {
  const importantMissing = a.missingData.importantMissing.length;
  const riskConfidence = a.risk.riskConfidence;

  // Issue 4 anchors: lots of missing important diligence items must drag the
  // confidence down regardless of how clean the headline numbers look.
  let confidence: "high" | "medium" | "low" = "high";
  const reasons: string[] = [];

  if (importantMissing >= 8) {
    confidence = "low";
    reasons.push(`${importantMissing} important diligence items are missing`);
  } else if (importantMissing >= 4) {
    confidence = confidence === "high" ? "medium" : confidence;
    reasons.push(`${importantMissing} important diligence items are missing`);
  }

  if (riskConfidence === "insufficient") {
    confidence = "low";
    reasons.push("risk panel has fewer than two factors scored");
  } else if (riskConfidence === "low") {
    confidence = confidence === "high" ? "medium" : confidence;
    reasons.push("risk panel is incomplete");
  } else if (riskConfidence === "medium" && confidence === "high") {
    confidence = "medium";
    reasons.push("only three risk factors scored");
  }

  if (a.valuation.compatibility === "reference_only") {
    confidence = confidence === "high" ? "medium" : confidence;
    reasons.push("benchmark band is in the opposite earnings basis (reference only)");
  }
  if (a.valuation.compatibility === "unavailable" && a.earningsUsed !== null) {
    confidence = confidence === "high" ? "medium" : confidence;
    reasons.push("no benchmark band available for this industry");
  }

  // A deal that doesn't yet qualify for "Acquisition Priority" data
  // completeness should never be reported with a final, high-confidence
  // recommendation.
  const isPreliminary =
    confidence !== "high" ||
    !a.missingData.canRankAsAcquisitionPriority ||
    riskConfidence === "low" ||
    riskConfidence === "insufficient" ||
    a.valuation.compatibility !== "basis_match";

  const reasonText =
    reasons.length === 0
      ? "Headline math and diligence completeness both meet the bar for a final recommendation."
      : `Core math is available, but ${reasons.join("; ")}.`;

  return { confidence, isPreliminary, reason: reasonText };
}

function pack(
  verdict: Verdict,
  rationale: string,
  blockers: string[],
  baseConfidence: "high" | "medium" | "low",
  baseReason: string,
  assessed: ConfidenceAssessment,
  forcePreliminary?: boolean,
): DealVerdictResult {
  // Take the more cautious of the branch confidence and the data-driven
  // assessment.
  const order: Record<"low" | "medium" | "high", number> = { high: 2, medium: 1, low: 0 };
  const confidence =
    order[baseConfidence] <= order[assessed.confidence] ? baseConfidence : assessed.confidence;

  const isPreliminary = forcePreliminary ?? assessed.isPreliminary;
  const reason = baseReason ? `${baseReason} ${assessed.reason}`.trim() : assessed.reason;
  return { verdict, rationale, blockers, confidence, isPreliminary, confidenceReason: reason };
}

export function computeVerdict(a: DealAnalysis): DealVerdictResult {
  const assessed = assessConfidence(a);
  const blockers: string[] = [];

  // CANNOT UNDERWRITE: missing core inputs. This branch is itself a
  // high-confidence statement (we can confidently say we cannot underwrite),
  // and it is always preliminary because we lack inputs.
  if (!a.missingData.canUnderwrite) {
    if (a.missingData.criticalMissing.length > 0)
      blockers.push(...a.missingData.criticalMissing);
    return {
      verdict: "CANNOT UNDERWRITE",
      rationale:
        "Core financial inputs are missing. We cannot run the underwriting engine until earnings, revenue, and a price are provided.",
      blockers,
      confidence: "high",
      isPreliminary: true,
      confidenceReason: `Critical inputs missing: ${a.missingData.criticalMissing.join(", ")}.`,
    };
  }

  if (a.score.status === "review_required") {
    return {
      verdict: "SCORING REVIEW REQUIRED",
      rationale:
        a.score.blockerReason ??
        "The deterministic score does not match the underlying fundamentals.",
      blockers,
      confidence: "high",
      isPreliminary: true,
      confidenceReason: a.score.blockerReason ?? assessed.reason,
    };
  }

  const dscr = a.dscr.value;
  // Use the basis-matched comparison multiple when we have one, otherwise fall
  // back to the implied multiple for the deal's earnings basis.
  const evMultiple =
    a.valuation.compatibility === "basis_match"
      ? a.valuation.comparisonMultiple.value
      : a.earningsBasis === "EBITDA"
        ? a.evToEBITDA.value
        : a.evToSDE.value;
  const benchmark = a.valuation.compatibility === "basis_match" ? a.valuation.benchmark : null;
  const inBand =
    benchmark !== null &&
    evMultiple !== null &&
    evMultiple <= benchmark.high &&
    evMultiple >= benchmark.low;
  const aboveHigh =
    benchmark !== null && evMultiple !== null && evMultiple > benchmark.high;

  // KILL: structural failures.
  if (a.earningsUsed !== null && a.earningsUsed <= 0) {
    return {
      verdict: "KILL",
      rationale:
        "Reported earnings are zero or negative. The deal cannot service acquisition debt; there is no rational price.",
      blockers: ["Zero or negative earnings"],
      confidence: "high",
      isPreliminary: false,
      confidenceReason: "Zero earnings is itself a high-confidence kill condition.",
    };
  }
  if (dscr !== null && dscr < 1.0 && evMultiple !== null && benchmark && evMultiple > benchmark.high) {
    return pack(
      "KILL",
      "DSCR fails 1.00x at the current price AND the multiple is above the benchmark high. This deal is not financeable as priced.",
      ["DSCR < 1.00x", "Multiple above benchmark high"],
      "high",
      "Headline math fails twice over.",
      assessed,
      false,
    );
  }
  if (dscr !== null && dscr < 1.0) {
    // Sub-1.0 DSCR is a structural fail even without a benchmark comparison
    // (Issue: T7 — Big Revenue Bad Earnings, IT Services, $400K EBITDA on
    // $3M price → DSCR 0.85x, must NOT be Acquisition Priority).
    return pack(
      "KILL",
      "DSCR fails 1.00x at the current price. The deal cannot service acquisition debt with the current capital stack.",
      ["DSCR < 1.00x"],
      "high",
      "Sub-1.00x DSCR is a structural fail regardless of benchmark availability.",
      assessed,
      false,
    );
  }

  if (dscr !== null && dscr < 1.25 && aboveHigh) {
    return pack(
      "RENEGOTIATE",
      "Earnings and operations are workable, but the price drives DSCR below the 1.25x lender threshold and the multiple is above the benchmark high. Renegotiate price or restructure with a larger seller note on standby.",
      blockers,
      "high",
      "",
      assessed,
    );
  }
  if (aboveHigh && evMultiple !== null && benchmark && evMultiple > benchmark.high * 1.1) {
    return pack(
      "RENEGOTIATE",
      `Implied multiple ${evMultiple.toFixed(2)}x is materially above the benchmark high of ${benchmark.high.toFixed(2)}x. Anchor an offer near the benchmark median.`,
      blockers,
      "high",
      "",
      assessed,
    );
  }

  if (
    a.risk.hasCritical ||
    a.missingData.importantMissing.length > 3 ||
    a.risk.riskConfidence === "insufficient" ||
    a.risk.riskConfidence === "low"
  ) {
    return pack(
      "DILIGENCE PRIORITY",
      "The headline numbers are workable, but critical risks, an incomplete risk panel, or important diligence items remain unresolved. Pursue diligence before submitting an LOI.",
      a.risk.hasCritical
        ? ["Critical risk factor present"]
        : a.missingData.importantMissing.slice(0, 3),
      "medium",
      "",
      assessed,
      true,
    );
  }

  if (
    dscr !== null &&
    dscr < 1.5 &&
    benchmark !== null &&
    evMultiple !== null &&
    evMultiple > benchmark.median
  ) {
    return pack(
      "PURSUE WITH CAUTION",
      "Deal is financeable but the multiple is above benchmark median and DSCR cushion is moderate. Validate add-backs and confirm working capital before LOI.",
      blockers,
      "medium",
      "",
      assessed,
    );
  }

  if (
    dscr !== null &&
    dscr >= 1.25 &&
    !a.risk.hasCritical &&
    (inBand || (benchmark !== null && evMultiple !== null && evMultiple <= benchmark.median))
  ) {
    return pack(
      "PURSUE",
      "Deterministic checks pass: positive earnings, multiple at or below benchmark median, DSCR ≥ 1.25x, no critical risk, important diligence gaps manageable.",
      blockers,
      "high",
      "",
      assessed,
    );
  }

  return pack(
    "PURSUE WITH CAUTION",
    "Deal passes minimum financeability thresholds but does not meet the disciplined PURSUE bar on every dimension. Treat further work as conditional.",
    blockers,
    "medium",
    "",
    assessed,
  );
}

export function nextActionsFor(a: DealAnalysis): string[] {
  const actions: string[] = [];
  for (const m of a.missingData.criticalMissing) {
    actions.push(`Request ${m.toLowerCase()} from the seller before any further work.`);
  }
  if (a.verdict.verdict === "KILL") {
    actions.push("Send a polite kill / pass note to the broker and archive the deal.");
    return actions;
  }
  if (
    a.verdict.verdict === "RENEGOTIATE" &&
    a.valuation.compatibility === "basis_match" &&
    a.valuation.benchmark &&
    a.earningsUsed !== null
  ) {
    const anchor = a.valuation.benchmark.median * a.earningsUsed;
    actions.push(
      `Counter-offer near the benchmark median: ~$${Math.round(anchor).toLocaleString()} (${a.valuation.benchmark.median}x ${a.earningsBasis}).`,
    );
  }
  if (a.dscr.value !== null && a.dscr.value < 1.25) {
    actions.push(
      "Restructure capital stack — increase seller note or extend standby to raise DSCR above 1.25x.",
    );
  }
  if (a.risk.riskConfidence === "insufficient" || a.risk.riskConfidence === "low") {
    actions.push(
      `Score the missing risk factors (${a.risk.missingCount} of ${a.risk.totalFactors} unscored) before promoting this deal.`,
    );
  }
  if (a.missingData.importantMissing.length > 0) {
    actions.push(
      `Issue the diligence request list: ${a.missingData.importantMissing.slice(0, 3).join(", ")}${a.missingData.importantMissing.length > 3 ? "…" : ""}.`,
    );
  }
  if (a.verdict.verdict === "PURSUE" || a.verdict.verdict === "PURSUE WITH CAUTION") {
    if (a.missingData.canGenerateLOI)
      actions.push("Generate the LOI strategy and prepare the broker outreach.");
    else actions.push("Complete remaining diligence items, then generate LOI.");
  }
  if (a.verdict.verdict === "CANNOT UNDERWRITE") {
    actions.push("Email the broker for the missing financial documents listed above.");
  }
  return actions;
}
