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
    case "lender_summary":
    case "diligence_request":
      answer = `Use the deterministic export. Engine verdict ${c.verdict}, score ${c.scoreOutOf100}/100.`;
      break;
    case "challenge_assumptions":
      answer = `Engine pushback for ${c.companyName}:`;
      bullets.push(
        ...c.capsApplied.map((cap) => `[cap] ${cap}`),
        c.riskHasCritical ? "Critical risk factor present — review verdict caveats." : "",
        c.dscr.verdict === "Fail" || c.dscr.verdict === "Risky"
          ? `DSCR ${c.dscr.afterStandby} is too thin for a comfortable approval.`
          : "",
      );
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
