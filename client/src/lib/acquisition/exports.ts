// Deterministic export generators. AI may polish language afterwards, but
// every field below must come straight from DealAnalysis (or the literal
// string "missing" when the engine flagged it as missing).

import type { DealAnalysis } from "./types";
import { fmtCurrencyExact, fmtMultiple } from "./dealMath";

function money(v: number | null | undefined): string {
  return v === null || v === undefined ? "missing" : fmtCurrencyExact(v);
}
function mult(v: number | null | undefined): string {
  return v === null || v === undefined ? "missing" : fmtMultiple(v);
}
function dash(v: string | null | undefined): string {
  return v && v.trim() ? v : "missing";
}

export interface ExportPayload {
  filename: string;
  title: string;
  content: string;
}

function header(a: DealAnalysis, title: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const tag = a.isDemo ? "[DEMO]" : a.isTest ? "[TEST]" : "";
  const preliminary = a.verdict.isPreliminary ? " *(PRELIMINARY)*" : "";
  return `# ${title} — ${a.companyName} ${tag}\n\nGenerated: ${today}\nDeal Verdict: **${a.verdict.verdict}**${preliminary}\n${a.scoreLabel}: ${Math.round(a.score.score)} / 100 (${a.score.bucket})\nConfidence: ${a.verdict.confidence} — ${a.verdict.confidenceReason}\n`;
}

export function generateICMemo(a: DealAnalysis): ExportPayload {
  const lines: string[] = [];
  lines.push(header(a, "Investment Committee Memo"));
  lines.push(`## Snapshot\n- Industry: ${dash(a.valuation.benchmark?.industryLabel)}\n- Revenue: ${money(a.ebitdaMargin.inputs.Revenue as number ?? a.sdeMargin.inputs.Revenue as number)}\n- Earnings Basis: ${a.earningsBasis}\n- Earnings: ${money(a.earningsUsed)}\n- Asking / Purchase Price (used): ${money(a.capitalStack.purchasePriceUsed)} (source: ${a.capitalStack.purchasePriceSource})\n- EV/EBITDA: ${mult(a.evToEBITDA.value)}\n- EV/SDE: ${mult(a.evToSDE.value)}\n- EBITDA Margin: ${a.ebitdaMargin.display}\n- SDE Margin: ${a.sdeMargin.display}`);
  const compatibilityLabel =
    a.valuation.compatibility === "basis_match"
      ? `Direct comparison (${a.valuation.benchmark?.basis} band vs ${a.earningsBasis} earnings)`
      : a.valuation.compatibility === "reference_only"
        ? `Reference only — ${a.valuation.benchmark?.basis} band shown but ${a.earningsBasis} earnings cannot be compared like-for-like.`
        : "Benchmark unavailable";
  lines.push(`## Valuation Band\n- Benchmark: ${dash(a.valuation.benchmark?.industryLabel)} — ${a.valuation.benchmarkBandLabel}\n- Comparability: ${compatibilityLabel}\n- Benchmark median implied value: ${a.valuation.compatibility === "basis_match" ? money(a.valuation.benchmarkMedianValue) : `${money(a.valuation.benchmarkMedianValue)} (reference only)`}\n- Gap vs asking price: ${a.valuation.compatibility === "basis_match" ? money(a.valuation.valueGapVsAsking) : "n/a (basis mismatch)"}\n- Band position: ${a.valuation.bandPosition.replace("_", " ")}`);
  lines.push(`## Capital Stack & Debt Service\n- SBA Loan (${(a.assumptions.sbaLoanPct * 100).toFixed(0)}%): ${money(a.capitalStack.sba.amount)} @ ${(a.assumptions.sbaInterestRate * 100).toFixed(2)}% / ${a.assumptions.sbaTermYears}yr → annual debt service ${money(a.capitalStack.sba.annualDebtService)}\n- Seller Note (${(a.assumptions.sellerNotePct * 100).toFixed(0)}%): ${money(a.capitalStack.sellerNote.amount)} @ ${(a.assumptions.sellerNoteRate * 100).toFixed(2)}% / ${a.assumptions.sellerNoteTermYears}yr, standby ${a.assumptions.sellerNoteStandbyMonths}mo → annual debt service ${money(a.capitalStack.sellerNote.annualDebtService)}\n- Buyer Equity (${(a.assumptions.buyerEquityPct * 100).toFixed(0)}%): ${money(a.capitalStack.buyerEquity.amount)}\n- Total sources: ${money(a.capitalStack.totalSources)} (Δ vs price ${money(a.capitalStack.differenceVsPurchasePrice)})\n- Total annual debt service after standby: ${money(a.capitalStack.totalAnnualDebtService)}\n- During standby (seller note excluded): ${money(a.capitalStack.totalAnnualDebtServiceDuringStandby)}\n- DSCR after standby: ${a.dscrPair.afterStandby.display}\n- DSCR during standby: ${a.dscrPair.duringStandby.display}`);
  lines.push(`## Risk (${a.risk.riskCompletenessLabel} Risk confidence: ${a.risk.riskConfidence}.)\n${a.risk.factors.map((f) => `- ${f.label}: ${f.score === null ? "missing" : f.score} (${f.level}) — ${f.rationale}`).join("\n")}`);
  lines.push(`## Verdict\n**${a.verdict.verdict}** — ${a.verdict.rationale}`);
  if (a.verdict.blockers.length)
    lines.push(`Blockers: ${a.verdict.blockers.join("; ")}`);
  if (a.score.capsApplied.length)
    lines.push(`### Score caps applied\n${a.score.capsApplied.map((c) => `- ${c}`).join("\n")}`);
  if (a.missingData.criticalMissing.length)
    lines.push(`## Critical Missing Data\n${a.missingData.criticalMissing.map((c) => `- ${c}`).join("\n")}`);
  if (a.missingData.importantMissing.length)
    lines.push(`## Important Missing Data\n${a.missingData.importantMissing.map((c) => `- ${c}`).join("\n")}`);
  lines.push(`## Next Actions\n${a.nextActions.map((n) => `1. ${n}`).join("\n")}`);
  return {
    filename: `${slug(a.companyName)}-ic-memo.md`,
    title: "Investment Committee Memo",
    content: lines.join("\n\n"),
  };
}

export function generateLenderSummary(a: DealAnalysis): ExportPayload {
  const lines: string[] = [];
  lines.push(header(a, "Lender Summary"));
  lines.push(`## Borrower & Target\n- Target company: ${a.companyName}\n- Industry: ${dash(a.valuation.benchmark?.industryLabel)}\n- Purchase price (used): ${money(a.capitalStack.purchasePriceUsed)}`);
  lines.push(`## Earnings\n- Basis: ${a.earningsBasis}\n- Earnings: ${money(a.earningsUsed)}`);
  lines.push(`## Proposed Capital Stack\n- SBA: ${money(a.capitalStack.sba.amount)} (${(a.assumptions.sbaLoanPct * 100).toFixed(0)}%) @ ${(a.assumptions.sbaInterestRate * 100).toFixed(2)}% / ${a.assumptions.sbaTermYears}yr\n- Seller note: ${money(a.capitalStack.sellerNote.amount)} (${(a.assumptions.sellerNotePct * 100).toFixed(0)}%) @ ${(a.assumptions.sellerNoteRate * 100).toFixed(2)}%, standby ${a.assumptions.sellerNoteStandbyMonths}mo\n- Buyer equity: ${money(a.capitalStack.buyerEquity.amount)} (${(a.assumptions.buyerEquityPct * 100).toFixed(0)}%)`);
  lines.push(`## DSCR\n- After standby: ${a.dscrPair.afterStandby.display}\n- During standby: ${a.dscrPair.duringStandby.display}\n- Benchmark band: ${a.valuation.benchmarkBandLabel}`);
  if (!a.missingData.canGenerateLenderPackage) {
    lines.push(`> NOTE: Deal does not yet have a complete lender package. Missing items: ${[...a.missingData.criticalMissing, ...a.missingData.importantMissing].slice(0, 6).join("; ")}.`);
  }
  return {
    filename: `${slug(a.companyName)}-lender-summary.md`,
    title: "Lender Summary",
    content: lines.join("\n\n"),
  };
}

export function generateBrokerEmail(a: DealAnalysis): ExportPayload {
  const lines: string[] = [];
  lines.push(`Subject: ${a.companyName} — follow-up on diligence items`);
  lines.push("");
  lines.push(`Hi,`);
  lines.push("");
  if (a.verdict.verdict === "KILL") {
    lines.push(`Thanks for sending ${a.companyName}. After running our underwriting checks we're going to pass — the headline economics don't fit our buy box at the current price. Happy to look at future listings.`);
  } else if (a.verdict.verdict === "RENEGOTIATE" && a.valuation.benchmark && a.earningsUsed) {
    const anchor = Math.round(a.valuation.benchmark.median * a.earningsUsed);
    lines.push(`Thanks for sending ${a.companyName}. We've underwritten the deal and the math currently lands outside our band. To make this financeable we'd need to anchor closer to ~$${anchor.toLocaleString()} (≈ ${a.valuation.benchmark.median}x ${a.earningsBasis}, the benchmark median for ${a.valuation.benchmark.industryLabel}). Would the seller entertain that range, or alternatively a larger seller note on extended standby?`);
  } else if (a.verdict.verdict === "CANNOT UNDERWRITE") {
    lines.push(`Thanks for sending ${a.companyName}. Before we can model this properly, could you share the items below? Once we have them we'll come back with a clean view.`);
    lines.push("");
    lines.push(a.missingData.criticalMissing.concat(a.missingData.importantMissing).slice(0, 8).map((m) => `  • ${m}`).join("\n"));
  } else {
    lines.push(`Thanks for sending ${a.companyName}. Initial underwriting is constructive (engine verdict: ${a.verdict.verdict}, score ${Math.round(a.score.score)}/100). To move toward LOI, could you share the items below at your convenience?`);
    lines.push("");
    lines.push(a.missingData.importantMissing.slice(0, 6).map((m) => `  • ${m}`).join("\n"));
  }
  lines.push("");
  lines.push("Appreciate it,\nBuyer");
  return {
    filename: `${slug(a.companyName)}-broker-email.md`,
    title: "Broker Email",
    content: lines.join("\n"),
  };
}

export function generateDiligenceList(a: DealAnalysis): ExportPayload {
  const sections: string[] = [];
  sections.push(`# Diligence Request List — ${a.companyName}\n`);
  sections.push(`## Critical (must-have)\n${a.missingData.criticalMissing.map((m) => `- [ ] ${m}`).join("\n") || "- All critical items received."}`);
  sections.push(`## Important\n${a.missingData.importantMissing.map((m) => `- [ ] ${m}`).join("\n") || "- All important items received."}`);
  sections.push(`## Nice-to-have\n${a.missingData.niceToHaveMissing.map((m) => `- [ ] ${m}`).join("\n") || "- All nice-to-have items received."}`);
  return {
    filename: `${slug(a.companyName)}-diligence-list.md`,
    title: "Diligence Request List",
    content: sections.join("\n\n"),
  };
}

export function generateLOIStrategy(a: DealAnalysis): ExportPayload {
  const lines: string[] = [];
  lines.push(header(a, "LOI Strategy"));
  const median = a.valuation.benchmarkMedianValue;
  const low = a.valuation.benchmarkLowValue;
  const high = a.valuation.benchmarkHighValue;
  lines.push(`## Price anchor (deterministic)\n- Benchmark low: ${money(low)}\n- Benchmark median: ${money(median)}\n- Benchmark high: ${money(high)}\n- Current asking: ${money(a.capitalStack.purchasePriceUsed)}\n- Gap (median − asking): ${money(a.valuation.valueGapVsAsking)}`);
  if (
    a.verdict.verdict === "RENEGOTIATE" &&
    median !== null &&
    a.valuation.compatibility === "basis_match"
  ) {
    lines.push(`## Recommended opening offer\nAnchor near benchmark median (${money(median)}), with seller note ${(a.assumptions.sellerNotePct * 100).toFixed(0)}% on ${a.assumptions.sellerNoteStandbyMonths}mo standby, SBA ${(a.assumptions.sbaLoanPct * 100).toFixed(0)}%, buyer equity ${(a.assumptions.buyerEquityPct * 100).toFixed(0)}%.`);
  } else if (
    (a.verdict.verdict === "PURSUE" || a.verdict.verdict === "PURSUE WITH CAUTION") &&
    !a.verdict.isPreliminary
  ) {
    lines.push(`## Recommended opening offer\nMatch current asking price (${money(a.capitalStack.purchasePriceUsed)}) with disciplined diligence contingencies. DSCR after standby: ${a.dscrPair.afterStandby.display}.`);
  } else if (a.verdict.isPreliminary) {
    lines.push(`## Recommended action\nDo NOT submit LOI yet — score is preliminary (confidence: ${a.verdict.confidence}). ${a.verdict.confidenceReason} Close the diligence and risk gaps first.`);
  } else {
    lines.push(`## Recommended action\nDo not submit LOI yet — verdict is ${a.verdict.verdict}.`);
  }
  lines.push(`## Diligence contingencies\n${a.missingData.importantMissing.map((m) => `- ${m}`).join("\n") || "- None outstanding."}`);
  return {
    filename: `${slug(a.companyName)}-loi-strategy.md`,
    title: "LOI Strategy",
    content: lines.join("\n\n"),
  };
}

export function generateKillMemo(a: DealAnalysis): ExportPayload {
  const lines: string[] = [];
  lines.push(header(a, "Deal Kill Memo"));
  lines.push(`## Why we're passing\n${a.verdict.rationale}`);
  lines.push(`## Hard blockers\n${a.verdict.blockers.map((b) => `- ${b}`).join("\n") || "- None recorded."}`);
  lines.push(`## Snapshot at time of kill\n- Earnings: ${money(a.earningsUsed)} (${a.earningsBasis})\n- Asking: ${money(a.capitalStack.purchasePriceUsed)}\n- DSCR after standby: ${a.dscrPair.afterStandby.display}\n- Score: ${Math.round(a.score.score)}/100`);
  return {
    filename: `${slug(a.companyName)}-kill-memo.md`,
    title: "Deal Kill Memo",
    content: lines.join("\n\n"),
  };
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export type ExportKind =
  | "ic-memo"
  | "lender-summary"
  | "broker-email"
  | "diligence-list"
  | "loi-strategy"
  | "kill-memo";

export function generateExport(kind: ExportKind, a: DealAnalysis): ExportPayload {
  switch (kind) {
    case "ic-memo":
      return generateICMemo(a);
    case "lender-summary":
      return generateLenderSummary(a);
    case "broker-email":
      return generateBrokerEmail(a);
    case "diligence-list":
      return generateDiligenceList(a);
    case "loi-strategy":
      return generateLOIStrategy(a);
    case "kill-memo":
      return generateKillMemo(a);
  }
}
