// Deterministic verdict layer. The AI advisor cannot override this — it can
// only quote it. The verdict is computed from the structured DealAnalysis the
// engine already produced, so the verdict trace is auditable.

import type { DealAnalysis, DealVerdictResult } from "./types";

export function computeVerdict(a: DealAnalysis): DealVerdictResult {
  const blockers: string[] = [];

  // CANNOT UNDERWRITE: missing core inputs.
  if (!a.missingData.canUnderwrite) {
    if (a.missingData.criticalMissing.length > 0)
      blockers.push(...a.missingData.criticalMissing);
    return {
      verdict: "CANNOT UNDERWRITE",
      rationale:
        "Core financial inputs are missing. We cannot run the underwriting engine until earnings, revenue, and a price are provided.",
      blockers,
      confidence: "high",
    };
  }

  // SCORING REVIEW REQUIRED: scoring engine itself flagged an anomaly.
  if (a.score.status === "review_required") {
    return {
      verdict: "SCORING REVIEW REQUIRED",
      rationale:
        a.score.blockerReason ??
        "The deterministic score does not match the underlying fundamentals.",
      blockers,
      confidence: "high",
    };
  }

  const dscr = a.dscr.value;
  const evMultiple =
    a.earningsBasis === "EBITDA" ? a.evToEBITDA.value : a.evToSDE.value;
  const benchmark = a.valuation.benchmark;
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
    };
  }
  if (dscr !== null && dscr < 1.0 && evMultiple !== null && benchmark && evMultiple > benchmark.high) {
    return {
      verdict: "KILL",
      rationale:
        "DSCR fails 1.00x at the current price AND the multiple is above the benchmark high. This deal is not financeable as priced.",
      blockers: ["DSCR < 1.00x", "Multiple above benchmark high"],
      confidence: "high",
    };
  }

  // RENEGOTIATE: business is decent but price/DSCR is too tight.
  if (dscr !== null && dscr < 1.25 && aboveHigh) {
    return {
      verdict: "RENEGOTIATE",
      rationale:
        "Earnings and operations are workable, but the price drives DSCR below the 1.25x lender threshold and the multiple is above the benchmark high. Renegotiate price or restructure with a larger seller note on standby.",
      blockers,
      confidence: "high",
    };
  }
  if (aboveHigh && evMultiple !== null && benchmark && evMultiple > benchmark.high * 1.1) {
    return {
      verdict: "RENEGOTIATE",
      rationale: `Implied multiple ${evMultiple.toFixed(2)}x is materially above the benchmark high of ${benchmark.high.toFixed(2)}x. Anchor an offer near the benchmark median.`,
      blockers,
      confidence: "high",
    };
  }

  // DILIGENCE PRIORITY: upside exists but critical data gaps remain.
  if (a.risk.hasCritical || a.missingData.importantMissing.length > 3) {
    return {
      verdict: "DILIGENCE PRIORITY",
      rationale:
        "The headline numbers are workable, but critical risks or important diligence items remain unresolved. Pursue diligence before submitting an LOI.",
      blockers: a.risk.hasCritical
        ? ["Critical risk factor present"]
        : a.missingData.importantMissing.slice(0, 3),
      confidence: "medium",
    };
  }

  // PAUSE: weak signals but not killable.
  if (dscr !== null && dscr < 1.0) {
    return {
      verdict: "PAUSE",
      rationale:
        "DSCR fails 1.00x at the current price. Pause until you can renegotiate, increase seller financing, or update earnings.",
      blockers: ["DSCR < 1.00x"],
      confidence: "high",
    };
  }

  // PURSUE WITH CAUTION: small DSCR cushion or above-median multiple.
  if (
    dscr !== null &&
    dscr < 1.5 &&
    benchmark !== null &&
    evMultiple !== null &&
    evMultiple > benchmark.median
  ) {
    return {
      verdict: "PURSUE WITH CAUTION",
      rationale:
        "Deal is financeable but the multiple is above benchmark median and DSCR cushion is moderate. Validate add-backs and confirm working capital before LOI.",
      blockers,
      confidence: "medium",
    };
  }

  // PURSUE: all green.
  if (
    dscr !== null &&
    dscr >= 1.25 &&
    !a.risk.hasCritical &&
    (inBand || (benchmark !== null && evMultiple !== null && evMultiple <= benchmark.median))
  ) {
    return {
      verdict: "PURSUE",
      rationale:
        "Deterministic checks pass: positive earnings, multiple at or below benchmark median, DSCR ≥ 1.25x, no critical risk, important diligence gaps manageable.",
      blockers,
      confidence: "high",
    };
  }

  return {
    verdict: "PURSUE WITH CAUTION",
    rationale:
      "Deal passes minimum financeability thresholds but does not meet the disciplined PURSUE bar on every dimension. Treat further work as conditional.",
    blockers,
    confidence: "medium",
  };
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
  if (a.verdict.verdict === "RENEGOTIATE" && a.valuation.benchmark && a.earningsUsed !== null) {
    const anchor = a.valuation.benchmark.median * a.earningsUsed;
    actions.push(
      `Counter-offer near the benchmark median: ~$${Math.round(anchor).toLocaleString()} (${a.valuation.benchmark.median}x ${a.earningsBasis}).`,
    );
  }
  if (a.dscr.value !== null && a.dscr.value < 1.25) {
    actions.push("Restructure capital stack — increase seller note or extend standby to raise DSCR above 1.25x.");
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
