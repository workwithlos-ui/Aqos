// LocalAdvisor — a deterministic, rule-based advisor that answers buyer
// prompts using ONLY the AdvisorContext + AdvisorPortfolioContext. It does
// not contact any LLM. When a real LLM is wired in later, the same
// AdvisorContext can be sent verbatim and the guardrail prompt
// (ADVISOR_SYSTEM_PROMPT) used as the system message.

import type { AdvisorDealContext, AdvisorPortfolioContext } from "./advisorContext";

export interface AdvisorAnswer {
  question: string;
  intent: AdvisorIntent;
  answer: string;
  bullets: string[];
  followUps: string[];
}

export type AdvisorIntent =
  | "prioritize"
  | "missing_data"
  | "what_to_offer"
  | "kill"
  | "financeable"
  | "broker_email"
  | "ic_memo"
  | "lender_summary"
  | "diligence_request"
  | "challenge_assumptions"
  | "verdict_focused"
  | "general";

const INTENT_KEYWORDS: Array<{ intent: AdvisorIntent; keywords: RegExp }> = [
  { intent: "prioritize", keywords: /priorit|focus on|which deals.*pursue|top deals/i },
  { intent: "missing_data", keywords: /missing|gaps|need|data we don't|incomplete/i },
  { intent: "what_to_offer", keywords: /offer|price|loi|counter|anchor/i },
  { intent: "kill", keywords: /kill|pass|dead|skip|drop/i },
  { intent: "financeable", keywords: /financ|lender|dscr|debt|sba/i },
  { intent: "broker_email", keywords: /broker|email|message|outreach/i },
  { intent: "ic_memo", keywords: /ic memo|investment committee/i },
  { intent: "lender_summary", keywords: /lender summary|lender package|bank summary/i },
  { intent: "diligence_request", keywords: /diligence|request list|qoe|documents/i },
  { intent: "challenge_assumptions", keywords: /challenge|stress|push back|assumption/i },
];

function classifyIntent(q: string): AdvisorIntent {
  for (const { intent, keywords } of INTENT_KEYWORDS) {
    if (keywords.test(q)) return intent;
  }
  return "general";
}

function fmtList(arr: string[], empty = "None"): string {
  return arr.length === 0 ? empty : arr.map((a) => `• ${a}`).join("\n");
}

function dealLine(c: AdvisorDealContext): string {
  const tag = c.isPreliminary ? " *(preliminary)*" : "";
  return `${c.companyName} — verdict ${c.verdict}${tag} (${c.verdictConfidence}), ${c.scoreLabel} ${c.scoreOutOf100}/100, DSCR ${c.dscr.afterStandby}, ${c.earningsBasis} ${c.earnings}, multiple ${c.multipleEvEbitda !== "missing" ? c.multipleEvEbitda : c.multipleEvSde}`;
}

function caveats(c: AdvisorDealContext): string[] {
  const out: string[] = [];
  if (c.isPreliminary) {
    out.push(`Score is **preliminary** (${c.verdictConfidence} confidence) — ${c.verdictConfidenceReason}`);
  }
  if (c.benchmarkCompatibility === "reference_only") {
    out.push(
      `Benchmark caveat: ${c.benchmarkBand} is shown for reference only — the deal's earnings basis is ${c.earningsBasis} but the benchmark is in ${c.benchmarkBasis}. Not a like-for-like comparison.`,
    );
  } else if (c.benchmarkCompatibility === "unavailable") {
    out.push("Benchmark caveat: no benchmark band available for this industry.");
  }
  if (c.riskConfidence === "insufficient" || c.riskConfidence === "low") {
    out.push(`Risk caveat: ${c.riskCompletenessLabel} (risk confidence ${c.riskConfidence}).`);
  }
  return out;
}

// ─── Composers (Copilot writes from verified outputs only) ──────────────────

function composeICMemoFromContext(c: AdvisorDealContext): string {
  const lines: string[] = [];
  lines.push(`# IC Memo — ${c.companyName}${c.isDemoOrTest ? " (DEMO)" : ""}`);
  lines.push(`*Composed by Deal Copilot from verified engine outputs only. ${c.isPreliminary ? "**THIS IS A PRELIMINARY ANALYSIS — DO NOT RELY UNTIL VERIFIED.**" : ""}*`);
  lines.push("");
  lines.push(`## Executive Summary`);
  lines.push(`Engine verdict: **${c.verdict}**${c.isPreliminary ? " (PRELIMINARY)" : ""} — ${c.verdictRationale}`);
  lines.push(`Refined verdict (buyer language): **${c.refinedVerdict}** — ${c.refinedVerdictReason}`);
  lines.push(`Final bucket: **${c.scoreBucket}** — ${c.finalBucketReason}`);
  lines.push(`${c.scoreLabel}: ${c.scoreOutOf100}/100. Confidence: **${c.verdictConfidence}** — ${c.verdictConfidenceReason}.`);
  lines.push("");
  lines.push(`## Deal Snapshot`);
  lines.push(`- Industry: ${c.industry}`);
  lines.push(`- Revenue: ${c.revenue}`);
  lines.push(`- ${c.earningsBasis}: ${c.earnings}`);
  lines.push(`- Asking / Purchase Price: ${c.purchasePriceUsed} (${c.purchasePriceSource})`);
  lines.push(`- EV/EBITDA: ${c.multipleEvEbitda} | EV/SDE: ${c.multipleEvSde}`);
  lines.push(`- EBITDA margin: ${c.ebitdaMargin} | SDE margin: ${c.sdeMargin}`);
  lines.push("");
  lines.push(`## Valuation`);
  lines.push(`Benchmark: ${c.benchmark}. Band: ${c.benchmarkBand}.`);
  lines.push(`Compatibility: **${c.benchmarkCompatibility}**. Band position: ${c.bandPosition}.`);
  lines.push(`Median implied value: ${c.benchmarkMedianImpliedValue}. Gap vs asking: ${c.benchmarkValueGapVsAsking}.`);
  lines.push("");
  lines.push(`## Capital Stack & DSCR`);
  lines.push(`- Purchase price: ${c.capitalStack.purchasePrice}`);
  lines.push(`- SBA: ${c.capitalStack.sba} → annual DS ${c.capitalStack.sbaAnnualDebtService}`);
  lines.push(`- Seller note: ${c.capitalStack.sellerNote} → annual DS ${c.capitalStack.sellerNoteAnnualDebtService} (standby ${c.capitalStack.sellerNoteStandby})`);
  lines.push(`- Buyer equity: ${c.capitalStack.buyerEquity}`);
  lines.push(`- Total annual debt service: ${c.capitalStack.totalAnnualDebtService}`);
  lines.push(`- DSCR during standby: ${c.dscr.duringStandby} | after standby: **${c.dscr.afterStandby}** (${c.dscr.verdict})`);
  lines.push("");
  lines.push(`## Buyer Cash Flow`);
  lines.push(`- Buyer cash flow during standby: ${c.buyerCashFlowDuringStandby}`);
  lines.push(`- Buyer cash flow after standby: ${c.buyerCashFlow}`);
  lines.push(`- Cash-on-cash return: ${c.cashOnCashReturn}`);
  lines.push("");
  lines.push(`## Max Supportable Purchase Price`);
  lines.push(`- @ 1.25x DSCR (lender floor): ${c.maxPPAt1_25x}`);
  lines.push(`- @ 1.50x DSCR (buyer comfort): ${c.maxPPAt1_50x}`);
  lines.push(`- @ 2.00x DSCR (conservative): ${c.maxPPAt2_00x}`);
  lines.push(`- Price supported by deal economics? **${c.priceIsSupported ? "YES" : "NO"}**`);
  lines.push("");
  lines.push(`## Stress Test`);
  lines.push(`Stress rating: **${c.stressRating}**. Worst-case DSCR: ${c.worstCaseDscr}. All scenarios pass: ${c.allScenariosPass ? "YES" : "NO"}.`);
  lines.push("");
  lines.push(`## Recommended Offer`);
  lines.push(`- Opening offer: ${c.openingOffer}`);
  lines.push(`- Target price: ${c.targetPrice}`);
  lines.push(`- Maximum price: ${c.maximumPrice}`);
  lines.push(`- Preferred structure: ${c.preferredStructure}`);
  lines.push(`- Seller note: ${c.sellerNoteAmount}`);
  lines.push(`- Earnout: ${c.earnoutAmount}`);
  lines.push(`- Required transition: ${c.requiredTransitionWeeks} weeks`);
  lines.push("");
  lines.push(`## Risk`);
  lines.push(`Risk completeness: ${c.riskCompletenessLabel} (confidence ${c.riskConfidence}). Critical risk factor present: ${c.riskHasCritical ? "YES" : "no"}.`);
  for (const f of c.riskFactors) {
    lines.push(`- ${f.label}: ${f.score}/5 (${f.level}) — ${f.rationale}`);
  }
  lines.push("");
  lines.push(`## Anomalies (Engine-Detected)`);
  if (c.anomalies.length === 0) lines.push("None.");
  for (const a of c.anomalies) lines.push(`- [${a.severity}] **${a.title}** — ${a.detail}`);
  lines.push("");
  lines.push(`## Missing Data`);
  lines.push(`Critical: ${c.missingCritical.join(", ") || "none"}.`);
  lines.push(`Important: ${c.missingImportant.join(", ") || "none"}.`);
  lines.push("");
  lines.push(`## Working Capital & Integration`);
  lines.push(`Working capital status: ${c.workingCapitalStatus} (risk ${c.workingCapitalRisk}). Blocks Close Ready: ${c.wcBlocksCloseReady ? "YES" : "no"}.`);
  lines.push(`Integration readiness: ${c.integrationReadinessScore}/100 (${c.integrationStatus}). 100-day ready: ${c.hundredDayReady ? "YES" : "no"}. Can close safely: ${c.canCloseSafely ? "YES" : "no"}.`);
  lines.push("");
  lines.push(`## Data Quality`);
  lines.push(`${c.dataQualityScore}/100 (${c.dataQualityLabel}). Top gaps: ${c.dataQualityGaps.slice(0, 6).join(", ") || "none"}.`);
  lines.push("");
  lines.push(`## Recommendation`);
  lines.push(`Engine: **${c.verdict}**. Buyer language: **${c.refinedVerdict}**. ${c.isPreliminary ? "DO NOT RELY UNTIL VERIFIED — close diligence gaps before LOI." : ""}`);
  if (c.refinedVerdictConditions.length) {
    lines.push(`Conditions: ${c.refinedVerdictConditions.join("; ")}.`);
  }
  return lines.join("\n");
}

function composeLenderSummaryFromContext(c: AdvisorDealContext): string {
  const out: string[] = [];
  out.push(`# Lender Summary — ${c.companyName}`);
  out.push("");
  out.push(`Industry: ${c.industry}. Revenue: ${c.revenue}. ${c.earningsBasis}: ${c.earnings}. Margin: ${c.ebitdaMargin}.`);
  out.push(`Purchase price: ${c.purchasePriceUsed} (${c.purchasePriceSource}). EV/${c.earningsBasis}: ${c.earningsBasis === "EBITDA" ? c.multipleEvEbitda : c.multipleEvSde}.`);
  out.push("");
  out.push(`## Capital Stack`);
  out.push(`- SBA: ${c.capitalStack.sba} → DS ${c.capitalStack.sbaAnnualDebtService}`);
  out.push(`- Seller note: ${c.capitalStack.sellerNote} → DS ${c.capitalStack.sellerNoteAnnualDebtService} (standby ${c.capitalStack.sellerNoteStandby})`);
  out.push(`- Buyer equity: ${c.capitalStack.buyerEquity}`);
  out.push(`- Total annual debt service: ${c.capitalStack.totalAnnualDebtService}`);
  out.push("");
  out.push(`## DSCR`);
  out.push(`- During standby: ${c.dscr.duringStandby}`);
  out.push(`- After standby: **${c.dscr.afterStandby}** (${c.dscr.verdict})`);
  out.push(`- Buyer cash flow after debt service: ${c.buyerCashFlow}`);
  out.push("");
  out.push(`## Stress`);
  out.push(`Stress rating: ${c.stressRating}. Worst-case DSCR: ${c.worstCaseDscr}. All scenarios pass: ${c.allScenariosPass ? "YES" : "NO"}.`);
  out.push("");
  out.push(`## Risk Caveats`);
  out.push(`Risk completeness: ${c.riskCompletenessLabel} (${c.riskConfidence}).`);
  if (c.anomalies.length) {
    out.push("");
    out.push(`## Anomalies`);
    for (const a of c.anomalies) out.push(`- [${a.severity}] ${a.title}`);
  }
  return out.join("\n");
}

function composeDiligenceRequestFromContext(c: AdvisorDealContext): string {
  const out: string[] = [];
  out.push(`# Diligence Request — ${c.companyName}`);
  out.push("");
  if (c.missingCritical.length) {
    out.push(`## Critical (block IC / Lender / Close)`);
    for (const m of c.missingCritical) out.push(`- [ ] ${m}`);
    out.push("");
  }
  if (c.missingImportant.length) {
    out.push(`## Important`);
    for (const m of c.missingImportant) out.push(`- [ ] ${m}`);
    out.push("");
  }
  if (c.missingNiceToHave.length) {
    out.push(`## Nice to Have`);
    for (const m of c.missingNiceToHave) out.push(`- [ ] ${m}`);
    out.push("");
  }
  if (c.anomalies.length) {
    out.push(`## Anomaly-driven Triggers`);
    for (const a of c.anomalies) {
      for (const t of a.diligenceTriggers) out.push(`- [ ] ${t} (from: ${a.title})`);
    }
  }
  return out.join("\n");
}

export function answerAdvisor(
  question: string,
  portfolio: AdvisorPortfolioContext,
  focused: AdvisorDealContext | null,
): AdvisorAnswer {
  const intent = focused ? classifyIntent(question) : classifyIntent(question);

  if (focused) {
    return answerForFocusedDeal(question, intent, focused);
  }
  return answerForPortfolio(question, intent, portfolio);
}

function answerForFocusedDeal(
  question: string,
  intent: AdvisorIntent,
  c: AdvisorDealContext,
): AdvisorAnswer {
  const bullets: string[] = [];
  let answer = "";

  switch (intent) {
    case "what_to_offer":
      answer = `Engine verdict: **${c.verdict}**${c.isPreliminary ? " (preliminary — see caveats)" : ""}. Benchmark band ${c.benchmarkBand}; current implied multiple ${c.multipleEvEbitda !== "missing" ? c.multipleEvEbitda : c.multipleEvSde}.`;
      bullets.push(
        `Asking price (used): ${c.askingPrice}`,
        `Benchmark median implied value: ${c.benchmarkMedianImpliedValue}`,
        `Gap vs asking: ${c.benchmarkValueGapVsAsking}`,
        c.verdict === "RENEGOTIATE" && c.benchmarkCompatibility === "basis_match"
          ? `Suggested anchor: ${c.benchmarkMedianImpliedValue} (benchmark median).`
          : c.isPreliminary
            ? `Do NOT submit LOI yet — score is preliminary (${c.verdictConfidence} confidence).`
            : `Hold price discipline at or near asking — verdict is ${c.verdict}.`,
        ...caveats(c),
      );
      break;
    case "financeable":
      answer = `DSCR after standby is ${c.dscr.afterStandby} (${c.dscr.verdict}). During standby: ${c.dscr.duringStandby}.`;
      bullets.push(
        `Total annual debt service: ${c.capitalStack.totalAnnualDebtService}`,
        `SBA debt service: ${c.capitalStack.sbaAnnualDebtService}`,
        `Seller note debt service: ${c.capitalStack.sellerNoteAnnualDebtService}`,
        `Seller note standby: ${c.capitalStack.sellerNoteStandby}`,
      );
      break;
    case "kill":
      answer = c.verdict === "KILL"
        ? `Engine has already issued a KILL verdict. Reason: ${c.verdictRationale}`
        : `Engine has NOT issued a KILL verdict. Current verdict: ${c.verdict}.`;
      bullets.push(...c.verdictBlockers);
      break;
    case "missing_data":
      answer = `Critical/important diligence gaps for ${c.companyName}:`;
      bullets.push(
        ...c.missingCritical.map((m) => `[critical] ${m}`),
        ...c.missingImportant.map((m) => `[important] ${m}`),
      );
      break;
    case "broker_email":
      answer = `Use the deterministic broker email export. Engine verdict: ${c.verdict}. Anchor: ${c.benchmarkMedianImpliedValue}.`;
      break;
    case "ic_memo":
      answer = composeICMemoFromContext(c);
      bullets.push(
        `Verdict (engine): **${c.verdict}**${c.isPreliminary ? " (PRELIMINARY)" : ""}`,
        `Refined verdict (buyer language): **${c.refinedVerdict}** — ${c.refinedVerdictReason}`,
        `${c.scoreLabel}: ${c.scoreOutOf100}/100 (${c.scoreBucket})`,
        `DSCR after standby: ${c.dscr.afterStandby} (${c.dscr.verdict})`,
        `Recommended offer: open ${c.openingOffer} · target ${c.targetPrice} · max ${c.maximumPrice}`,
        `Data quality: ${c.dataQualityScore}/100 (${c.dataQualityLabel})`,
      );
      break;
    case "lender_summary":
      answer = composeLenderSummaryFromContext(c);
      bullets.push(
        `Total annual debt service: ${c.capitalStack.totalAnnualDebtService}`,
        `DSCR after standby: ${c.dscr.afterStandby}`,
        `Buyer cash flow after debt service: ${c.buyerCashFlow}`,
        `Max supportable PP @ 1.25x DSCR: ${c.maxPPAt1_25x}`,
      );
      break;
    case "diligence_request":
      answer = composeDiligenceRequestFromContext(c);
      bullets.push(
        ...c.missingCritical.slice(0, 5).map((m) => `[critical] ${m}`),
        ...c.missingImportant.slice(0, 5).map((m) => `[important] ${m}`),
      );
      break;
    case "challenge_assumptions":
      answer = `Engine pushback for ${c.companyName} — pulled from anomalies, caps, and DSCR margins:`;
      bullets.push(
        ...c.anomalies.map((x) => `[${x.severity}] ${x.title}: ${x.detail}`),
        ...c.capsApplied.map((cap) => `[cap] ${cap}`),
        c.riskHasCritical ? "Critical risk factor present — verdict caveats apply." : "",
        c.dscr.verdict === "Fail" || c.dscr.verdict === "Risky"
          ? `DSCR ${c.dscr.afterStandby} is too thin for a comfortable approval.`
          : "",
      );
      if (c.anomalies.length === 0) {
        bullets.push("Engine detected no deal-specific anomalies — assumptions appear internally consistent given the data provided. Re-run after filling missing inputs.");
      }
      break;
    default:
      answer = `**${c.verdict}**${c.isPreliminary ? " (preliminary)" : ""} — ${c.verdictRationale}`;
      bullets.push(
        `${c.scoreLabel}: ${c.scoreOutOf100}/100 (${c.scoreBucket})`,
        `DSCR after standby: ${c.dscr.afterStandby} (${c.dscr.verdict})`,
        `Multiple: ${c.multipleEvEbitda !== "missing" ? c.multipleEvEbitda : c.multipleEvSde} vs ${c.benchmarkBand}`,
        `Confidence: ${c.verdictConfidence} — ${c.verdictConfidenceReason}`,
        ...caveats(c),
      );
  }
  return {
    question,
    intent,
    answer,
    bullets: bullets.filter(Boolean),
    followUps: [
      `Why is the verdict ${c.verdict}?`,
      `What should I offer for ${c.companyName}?`,
      `What data is missing on ${c.companyName}?`,
      `Is ${c.companyName} financeable?`,
    ],
  };
}

function answerForPortfolio(
  question: string,
  intent: AdvisorIntent,
  p: AdvisorPortfolioContext,
): AdvisorAnswer {
  const bullets: string[] = [];
  let answer = "";

  switch (intent) {
    case "prioritize":
      answer = `${p.acquisitionPriority.length} acquisition-priority deal(s), ${p.diligencePriority.length} diligence-priority, ${p.killOrPause.length} kill/pause, ${p.scoringReview.length} scoring review, ${p.cannotUnderwrite.length} cannot underwrite.`;
      bullets.push(...p.acquisitionPriority.map(dealLine));
      if (p.acquisitionPriority.length === 0)
        bullets.push("No live deals currently clear the Acquisition Priority threshold.");
      break;
    case "missing_data":
      answer = "Deals blocked by critical missing data:";
      bullets.push(
        ...[...p.cannotUnderwrite, ...p.diligencePriority].map(
          (c) =>
            `${c.companyName}: ${[...c.missingCritical, ...c.missingImportant].slice(0, 4).join(", ") || "—"}`,
        ),
      );
      break;
    case "kill":
      answer = "Deals the engine recommends killing or pausing:";
      bullets.push(...p.killOrPause.map(dealLine));
      if (p.killOrPause.length === 0)
        bullets.push("No live deals currently warrant a Kill/Pause verdict.");
      break;
    case "financeable":
      answer = "Financeable deals (DSCR ≥ 1.25x and not Cannot Underwrite):";
      bullets.push(
        ...[...p.acquisitionPriority, ...p.diligencePriority]
          .filter((c) => c.dscr.verdict === "Strong" || c.dscr.verdict === "Acceptable")
          .map(dealLine),
      );
      if (bullets.length === 0)
        bullets.push("No live deals currently meet DSCR ≥ 1.25x.");
      break;
    case "challenge_assumptions":
      answer = "Deterministic pushback across the portfolio:";
      bullets.push(
        ...p.scoringReview.map((c) => `${c.companyName}: ${c.capsApplied.join("; ") || "score/verdict conflict"}`),
      );
      if (bullets.length === 0)
        bullets.push("No scoring-review anomalies detected.");
      break;
    default:
      answer = `${p.totalDeals} live deals (${p.excludedDemoOrTest} demo/test excluded). Acquisition Priority: ${p.acquisitionPriority.length}. Diligence Priority: ${p.diligencePriority.length}. Kill/Pause: ${p.killOrPause.length}. Cannot Underwrite: ${p.cannotUnderwrite.length}.`;
      bullets.push("Ask: 'Which deals should I prioritize?' or open a specific deal for tailored guidance.");
  }
  return {
    question,
    intent,
    answer,
    bullets: bullets.filter(Boolean),
    followUps: [
      "Which deals should I prioritize?",
      "Which deals should I kill?",
      "What data is missing across my pipeline?",
      "Which deals are financeable today?",
      "Challenge my assumptions.",
    ],
  };
}

export const SAMPLE_QUESTIONS = [
  "Which deals should I prioritize?",
  "Which deals should I kill?",
  "What data is missing?",
  "Which deal is financeable?",
  "What should I offer?",
  "Write an IC memo.",
  "Write a lender summary.",
  "Write a diligence request list.",
  "Challenge my assumptions.",
];
