/**
 * Buyer-Grade Advisory Engine — Iteration 6
 *
 * Deterministic modules for:
 *   1. Buyer Cash Flow After Debt Service
 *   2. Max Supportable Purchase Price (at 1.25x / 1.50x / 2.00x DSCR)
 *   3. Stress Test Panel (7 scenarios)
 *   4. Refined Verdict (buyer language)
 *   5. Recommended Offer
 *   6. Auto-Generated Diligence Checklist
 *   7. Data Quality Score
 *   8. Assumption Badges
 *
 * All functions are pure — no side effects, no defaults for missing inputs.
 */

import {
  annualDebtService,
  buildCapitalStack,
  dscrFromEarnings,
  isFiniteNumber,
  fmtCurrency,
  fmtMultiple,
  fmtPct,
  selectPurchasePrice,
  selectEarnings,
} from "./dealMath";
import type {
  DealAnalysis,
  DealInput,
  CapitalStackAssumptions,
  MetricResult,
  BuyerCashFlowResult,
  MaxSupportablePPResult,
  StressTestResult,
  StressScenario,
  RefinedVerdictResult,
  RecommendedOfferResult,
  AutoDiligenceResult,
  DiligenceItem,
  DataQualityResult,
  AssumptionBadge,
} from "./types";

// ─── 1. Buyer Cash Flow After Debt Service ───────────────────────────────────

export function computeBuyerCashFlow(a: DealAnalysis): BuyerCashFlowResult {
  const warnings: string[] = [];
  const earnings = a.earningsUsed;
  const ds = a.capitalStack.totalAnnualDebtService;
  const dsDuringStandby = a.capitalStack.totalAnnualDebtServiceDuringStandby;

  // Required CapEx: from workingCapital module if available, else null.
  const requiredCapEx =
    isFiniteNumber(a.workingCapital.capExBurdenAnnual)
      ? a.workingCapital.capExBurdenAnnual
      : null;

  // Working capital reserve: 1 month of monthly fixed costs if available.
  const wcReserve =
    isFiniteNumber(a.workingCapital.liquidityBufferRequired)
      ? a.workingCapital.liquidityBufferRequired
      : null;

  if (requiredCapEx === null)
    warnings.push("CapEx not provided — excluded from buyer cash flow calculation.");
  if (wcReserve === null)
    warnings.push(
      "Working capital reserve not provided — excluded from buyer cash flow calculation.",
    );

  function buildCF(
    label: string,
    debtService: number | null,
  ): MetricResult {
    const formula = `${label} = Earnings − Debt Service${requiredCapEx !== null ? " − CapEx" : ""}${wcReserve !== null ? " − WC Reserve" : ""}`;
    const inputs: Record<string, number | null> = {
      Earnings: earnings ?? null,
      DebtService: debtService ?? null,
      RequiredCapEx: requiredCapEx,
      WCReserve: wcReserve,
    };
    if (!isFiniteNumber(earnings))
      return { value: null, display: "missing", status: "missing", formula, inputs };
    if (!isFiniteNumber(debtService))
      return { value: null, display: "missing", status: "missing", formula, inputs };
    const cf =
      earnings! -
      debtService! -
      (requiredCapEx ?? 0) -
      (wcReserve ?? 0);
    return {
      value: cf,
      display: fmtCurrency(cf),
      status: requiredCapEx === null || wcReserve === null ? "estimated" : "actual",
      formula,
      inputs,
      warning:
        requiredCapEx === null || wcReserve === null
          ? "Some deductions missing — estimate only."
          : undefined,
    };
  }

  const buyerCashFlow = buildCF("Buyer Cash Flow (after standby)", ds);
  const buyerCashFlowDuringStandby = buildCF("Buyer Cash Flow (during standby)", dsDuringStandby);

  // Cash-on-cash return = Buyer Cash Flow / Buyer Equity.
  const equityAmount = a.capitalStack.buyerEquity.amount;
  let cashOnCashReturn: MetricResult;
  if (
    buyerCashFlow.value !== null &&
    isFiniteNumber(equityAmount) &&
    equityAmount! > 0
  ) {
    const coc = buyerCashFlow.value / equityAmount!;
    cashOnCashReturn = {
      value: coc,
      display: fmtPct(coc),
      status: buyerCashFlow.status,
      formula: "Buyer Cash Flow / Buyer Equity",
      inputs: { BuyerCashFlow: buyerCashFlow.value, BuyerEquity: equityAmount! },
    };
  } else {
    cashOnCashReturn = {
      value: null,
      display: "missing",
      status: "missing",
      formula: "Buyer Cash Flow / Buyer Equity",
      inputs: { BuyerCashFlow: buyerCashFlow.value ?? null, BuyerEquity: equityAmount ?? null },
    };
  }

  return {
    earningsUsed: earnings ?? null,
    totalAnnualDebtService: ds ?? null,
    requiredCapEx,
    workingCapitalReserve: wcReserve,
    buyerCashFlow,
    buyerCashFlowDuringStandby,
    cashOnCashReturn,
    warnings,
  };
}

// ─── 2. Max Supportable Purchase Price ───────────────────────────────────────

/**
 * Binary-search the maximum purchase price at which DSCR after standby
 * meets the target threshold. The search space is 0..10x earnings.
 */
function maxPriceForDscr(
  input: DealInput,
  assumptions: CapitalStackAssumptions,
  earnings: number,
  targetDscr: number,
): number | null {
  if (!isFiniteNumber(earnings) || earnings <= 0) return null;
  let lo = 0;
  let hi = earnings * 20; // generous upper bound
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const synth: DealInput = { ...input, purchasePrice: mid, askingPrice: undefined };
    const cs = buildCapitalStack(synth, assumptions);
    const ds = cs.totalAnnualDebtService;
    if (!isFiniteNumber(ds) || ds! <= 0) {
      hi = mid;
      continue;
    }
    const dscr = earnings / ds!;
    if (dscr >= targetDscr) lo = mid;
    else hi = mid;
  }
  return Math.round(lo / 1000) * 1000; // round to nearest $1K
}

export function computeMaxSupportablePP(
  input: DealInput,
  a: DealAnalysis,
): MaxSupportablePPResult {
  const warnings: string[] = [];
  const earnings = a.earningsUsed;
  const currentPrice = a.capitalStack.purchasePriceUsed;

  if (!isFiniteNumber(earnings) || earnings! <= 0) {
    warnings.push("Earnings missing or non-positive — cannot compute max supportable price.");
    return {
      at1_25x: null,
      at1_50x: null,
      at2_00x: null,
      currentPrice,
      priceIsSupported: false,
      warnings,
    };
  }

  const at1_25x = maxPriceForDscr(input, a.assumptions, earnings!, 1.25);
  const at1_50x = maxPriceForDscr(input, a.assumptions, earnings!, 1.5);
  const at2_00x = maxPriceForDscr(input, a.assumptions, earnings!, 2.0);

  const priceIsSupported =
    currentPrice !== null && at1_25x !== null && currentPrice <= at1_25x;

  return {
    at1_25x,
    at1_50x,
    at2_00x,
    currentPrice,
    priceIsSupported,
    warnings,
  };
}

// ─── 3. Stress Test Panel ────────────────────────────────────────────────────

interface StressSpec {
  label: string;
  description: string;
  earningsHaircut: number; // multiplier, e.g. 0.9 = -10%
  rateAdder: number; // absolute addition to SBA rate, e.g. 0.02 = +2%
  noStandby: boolean; // seller note pays from day 1
}

const STRESS_SPECS: StressSpec[] = [
  {
    label: "Base Case",
    description: "No adjustment — current inputs as entered.",
    earningsHaircut: 1,
    rateAdder: 0,
    noStandby: false,
  },
  {
    label: "EBITDA −10%",
    description: "Earnings decline 10% from reported level.",
    earningsHaircut: 0.9,
    rateAdder: 0,
    noStandby: false,
  },
  {
    label: "EBITDA −20%",
    description: "Earnings decline 20% — moderate recession scenario.",
    earningsHaircut: 0.8,
    rateAdder: 0,
    noStandby: false,
  },
  {
    label: "Revenue −10% / Margin Compression −5pp",
    description: "Revenue falls 10% and margin compresses 5 percentage points.",
    earningsHaircut: 0.85,
    rateAdder: 0,
    noStandby: false,
  },
  {
    label: "Interest Rate +2%",
    description: "SBA rate rises 200 basis points from current assumption.",
    earningsHaircut: 1,
    rateAdder: 0.02,
    noStandby: false,
  },
  {
    label: "Seller Note — No Standby",
    description: "Seller note payments begin immediately (no standby period).",
    earningsHaircut: 1,
    rateAdder: 0,
    noStandby: true,
  },
  {
    label: "Combined Downside",
    description: "EBITDA −20%, rate +2%, no seller note standby.",
    earningsHaircut: 0.8,
    rateAdder: 0.02,
    noStandby: true,
  },
];

export function computeStressTest(
  input: DealInput,
  a: DealAnalysis,
): StressTestResult {
  const warnings: string[] = [];
  const baseEarnings = a.earningsUsed;
  const baseAssumptions = a.assumptions;
  const price = a.capitalStack.purchasePriceUsed;

  if (!isFiniteNumber(baseEarnings) || baseEarnings! <= 0 || price === null) {
    warnings.push("Earnings or price missing — stress test cannot run.");
    return {
      scenarios: [],
      worstCaseDscr: null,
      allScenariosPass: false,
      anyScenariosPass: false,
      stressRating: "missing",
      warnings,
    };
  }

  const scenarios: StressScenario[] = STRESS_SPECS.map((spec) => {
    const stressedEarnings = baseEarnings! * spec.earningsHaircut;
    const stressedAssumptions: CapitalStackAssumptions = {
      ...baseAssumptions,
      sbaInterestRate: baseAssumptions.sbaInterestRate + spec.rateAdder,
      sellerNoteStandbyMonths: spec.noStandby ? 0 : baseAssumptions.sellerNoteStandbyMonths,
    };

    const cs = buildCapitalStack(
      { ...input, purchasePrice: price, askingPrice: undefined },
      stressedAssumptions,
    );

    const dsDuring = cs.totalAnnualDebtServiceDuringStandby;
    const dsAfter = cs.totalAnnualDebtService;

    const dscrDuring = dscrFromEarnings(stressedEarnings, dsDuring);
    const dscrAfter = dscrFromEarnings(stressedEarnings, dsAfter);

    const pass = dscrAfter.value !== null && dscrAfter.value >= 1.25;
    let failReason: string | null = null;
    if (!pass) {
      if (dscrAfter.value === null) failReason = "DSCR could not be calculated.";
      else failReason = `DSCR after standby ${dscrAfter.value.toFixed(2)}x < 1.25x minimum.`;
    }

    // Buyer cash flow under this scenario (no CapEx/WC deduction for brevity).
    const buyerCashFlow =
      isFiniteNumber(stressedEarnings) && isFiniteNumber(dsAfter)
        ? stressedEarnings - dsAfter!
        : null;

    return {
      label: spec.label,
      description: spec.description,
      dscrDuringStandby: dscrDuring,
      dscrAfterStandby: dscrAfter,
      earningsUsed: stressedEarnings,
      debtServiceUsed: dsAfter ?? null,
      pass,
      failReason,
      buyerCashFlow,
    };
  });

  const dscrValues = scenarios
    .map((s) => s.dscrAfterStandby.value)
    .filter((v): v is number => v !== null);

  const worstCaseDscr = dscrValues.length > 0 ? Math.min(...dscrValues) : null;
  const allScenariosPass = scenarios.every((s) => s.pass);
  const anyScenariosPass = scenarios.some((s) => s.pass);

  let stressRating: StressTestResult["stressRating"] = "missing";
  if (worstCaseDscr !== null) {
    if (worstCaseDscr >= 1.25) stressRating = "resilient";
    else if (worstCaseDscr >= 1.0) stressRating = "moderate";
    else stressRating = "fragile";
  }

  return {
    scenarios,
    worstCaseDscr,
    allScenariosPass,
    anyScenariosPass,
    stressRating,
    warnings,
  };
}

// ─── 4. Refined Verdict (Buyer Language) ─────────────────────────────────────

export function computeRefinedVerdict(a: DealAnalysis): RefinedVerdictResult {
  const v = a.verdict.verdict;
  const dscr = a.dscrPair.afterStandby.value;
  const price = a.capitalStack.purchasePriceUsed;
  const earnings = a.earningsUsed;

  // Walk Away
  if (
    v === "KILL" ||
    v === "CANNOT UNDERWRITE" ||
    (earnings !== null && earnings <= 0)
  ) {
    return {
      verdict: "Walk Away",
      buyerReason:
        earnings !== null && earnings <= 0
          ? "This business doesn't generate enough profit to pay back the loan you'd need to buy it. There's no price that makes the math work."
          : v === "CANNOT UNDERWRITE"
            ? "You're missing the basic financial information needed to evaluate this deal. Don't move forward until you have the financials."
            : "The numbers don't support this deal at the current price. Either the earnings are too thin or the price is too high to service the debt.",
      conditions: [],
      urgency: "high",
    };
  }

  // Freeze
  if (a.freeze.status === "red") {
    return {
      verdict: "Freeze",
      buyerReason:
        "Something critical has come up that needs to be resolved before you spend any more time or money on this deal.",
      conditions: a.freeze.triggers.filter((t) => t.severity === "red").map((t) => t.detail),
      urgency: "high",
    };
  }

  // Renegotiate
  if (v === "RENEGOTIATE") {
    const overpaidBy =
      price !== null && a.maxSupportablePP.at1_25x !== null
        ? price - a.maxSupportablePP.at1_25x
        : null;
    return {
      verdict: "Renegotiate",
      buyerReason:
        overpaidBy !== null && overpaidBy > 0
          ? `The asking price is ${fmtCurrency(overpaidBy)} more than what the business can support at a 1.25x debt coverage ratio. You need a lower price or a bigger seller note to make this work.`
          : "The price is higher than what comparable businesses sell for. You have room to negotiate — anchor your offer near the benchmark midpoint.",
      conditions: [
        "Get the seller to reduce price or increase seller note",
        "Confirm earnings quality with 3 years of tax returns",
        "Verify there are no undisclosed liabilities",
      ],
      urgency: "medium",
    };
  }

  // Pursue with Conditions (Diligence Priority)
  if (
    v === "DILIGENCE PRIORITY" ||
    v === "PURSUE WITH CAUTION" ||
    a.finalBucket === "Diligence Priority"
  ) {
    const topMissing = a.missingData.importantMissing.slice(0, 3);
    return {
      verdict: "Pursue with Conditions",
      buyerReason:
        "The headline numbers look workable, but there are gaps in the information you have. Don't submit an LOI until you've filled these gaps — they could change the deal significantly.",
      conditions: [
        ...topMissing.map((m) => `Obtain: ${m}`),
        a.risk.riskConfidence === "insufficient" || a.risk.riskConfidence === "low"
          ? "Score all risk factors before moving forward"
          : "",
        dscr !== null && dscr < 1.5
          ? "Confirm earnings quality — DSCR cushion is thin"
          : "",
      ].filter(Boolean),
      urgency: "medium",
    };
  }

  // Strong Pursue
  if (a.finalBucket === "Acquisition Priority") {
    return {
      verdict: "Strong Pursue",
      buyerReason:
        `This deal passes every check: the price is reasonable, the business generates enough cash to cover the loan${dscr !== null ? ` (${dscr.toFixed(2)}x coverage)` : ""}, risk is manageable, and you have the key financial documents. Move quickly — deals like this don't stay available long.`,
      conditions: [],
      urgency: "high",
    };
  }

  // Default: Pursue with Conditions
  return {
    verdict: "Pursue with Conditions",
    buyerReason:
      "The deal has potential but needs more work before you commit. The math is directionally positive, but verify the key assumptions before signing anything.",
    conditions: a.missingData.importantMissing.slice(0, 3).map((m) => `Verify: ${m}`),
    urgency: "medium",
  };
}

// ─── 5. Recommended Offer ────────────────────────────────────────────────────

export function computeRecommendedOffer(a: DealAnalysis): RecommendedOfferResult {
  const warnings: string[] = [];
  const earnings = a.earningsUsed;
  const basis = a.earningsBasis;
  const benchmark = a.valuation.benchmark;
  const currentPrice = a.capitalStack.purchasePriceUsed;

  if (!isFiniteNumber(earnings) || earnings! <= 0) {
    return {
      openingOffer: null,
      targetPrice: null,
      maximumPrice: null,
      preferredStructure: "Cannot compute — earnings missing.",
      sellerNoteAmount: null,
      earnoutAmount: null,
      earnoutTrigger: null,
      requiredTransitionWeeks: 12,
      rationale: "Earnings are missing or zero. No offer can be computed.",
      warnings: ["Earnings required to compute a recommended offer."],
    };
  }

  const e = earnings!;

  // Target price = benchmark median × earnings (if available), else 3.5x earnings.
  const medianMultiple = benchmark?.median ?? 3.5;
  const targetPrice = Math.round(e * medianMultiple / 1000) * 1000;

  // Opening offer = 10% below target (anchoring room).
  const openingOffer = Math.round(targetPrice * 0.9 / 1000) * 1000;

  // Maximum price = max supportable at 1.25x DSCR.
  const maximumPrice = a.maxSupportablePP.at1_25x ?? Math.round(e * (benchmark?.high ?? 4.5) / 1000) * 1000;

  // Seller note: 15% of target price (matching default assumptions).
  const sellerNoteAmount = Math.round(targetPrice * a.assumptions.sellerNotePct / 1000) * 1000;

  // Earnout: only if earnings are thin (margin < 15%) or revenue trend is unknown.
  const margin =
    basis === "EBITDA" ? a.ebitdaMargin.value : a.sdeMargin.value;
  const thinMargin = margin !== null && margin < 0.15;
  const revTrendUnknown = a.missingData.importantMissing.includes(
    "Revenue trend (growing / flat / declining)",
  );
  const needsEarnout = thinMargin || revTrendUnknown;
  const earnoutAmount = needsEarnout ? Math.round(targetPrice * 0.1 / 1000) * 1000 : null;
  const earnoutTrigger = needsEarnout
    ? `Business achieves ${fmtCurrency(e * 1.1)} in ${basis} in the 12 months post-close`
    : null;

    if (!benchmark) {
    warnings.push(
      `No benchmark available for this industry — offer anchored to 3.5x ${basis} heuristic.`,
    );
  }
  if (currentPrice !== null && currentPrice > maximumPrice) {
    warnings.push(
      `Asking price ${fmtCurrency(currentPrice)} exceeds maximum supportable price ${fmtCurrency(maximumPrice)} at 1.25x DSCR.`,
    );
  }

  // Preferred structure
  const sellerNoteStandby = a.assumptions.sellerNoteStandbyMonths;
  const preferredStructure = `SBA 7(a) loan (${(a.assumptions.sbaLoanPct * 100).toFixed(0)}%) + Seller Note (${(a.assumptions.sellerNotePct * 100).toFixed(0)}%, ${sellerNoteStandby}-month standby) + Buyer Equity (${(a.assumptions.buyerEquityPct * 100).toFixed(0)}%)`;

  // Transition period: 12 weeks default; 24 if owner dependency is unknown or high.
  const ownerDependencyUnknown = a.missingData.importantMissing.includes(
    "Owner role / operating responsibility",
  );
  const requiredTransitionWeeks = ownerDependencyUnknown ? 24 : 12;

  const rationale = [
    `Target price of ${fmtCurrency(targetPrice)} is anchored at ${medianMultiple.toFixed(1)}x ${basis}${benchmark ? " (benchmark median)" : " (heuristic \u2014 no benchmark available)"}.`,
    `Opening offer of ${fmtCurrency(openingOffer)} gives 10% negotiating room.`,
    `Maximum price of ${fmtCurrency(maximumPrice)} is the highest price at which the deal services debt at 1.25x DSCR.`,
    needsEarnout
      ? `Earnout of ${fmtCurrency(earnoutAmount!)} tied to post-close performance reduces upfront risk.`
      : "No earnout recommended \u2014 margin and revenue trend are acceptable.",
  ].join(" ");

  return {
    openingOffer,
    targetPrice,
    maximumPrice,
    preferredStructure,
    sellerNoteAmount,
    earnoutAmount,
    earnoutTrigger,
    requiredTransitionWeeks,
    rationale,
    warnings,
  };
}

// ─── 6. Auto-Generated Diligence Checklist───────────────────

const UNIVERSAL_DILIGENCE: Omit<DiligenceItem, "status" | "reason">[] = [
  { id: "d-tax-3yr", category: "Financials", label: "3 years of business tax returns", priority: "critical" },
  { id: "d-pl-3yr", category: "Financials", label: "3 years of P&L statements", priority: "critical" },
  { id: "d-bs-current", category: "Financials", label: "Current balance sheet", priority: "critical" },
  { id: "d-ar-aging", category: "Financials", label: "AR aging report", priority: "important" },
  { id: "d-ap-aging", category: "Financials", label: "AP aging report", priority: "important" },
  { id: "d-addbacks", category: "Financials", label: "Documented add-backs schedule", priority: "critical" },
  { id: "d-debt-sched", category: "Financials", label: "Debt schedule (all existing obligations)", priority: "important" },
  { id: "d-customer-list", category: "Revenue", label: "Customer list with revenue concentration", priority: "critical" },
  { id: "d-rev-trend", category: "Revenue", label: "Monthly revenue for last 24 months", priority: "important" },
  { id: "d-contracts", category: "Revenue", label: "Key customer contracts / recurring agreements", priority: "important" },
  { id: "d-owner-role", category: "Operations", label: "Owner role and daily responsibilities", priority: "critical" },
  { id: "d-org-chart", category: "Operations", label: "Org chart and key employee list", priority: "important" },
  { id: "d-sop", category: "Operations", label: "Standard operating procedures (SOPs)", priority: "nice-to-have" },
  { id: "d-licenses", category: "Legal", label: "Business licenses and permits", priority: "important" },
  { id: "d-leases", category: "Legal", label: "Lease agreements (office, equipment, vehicles)", priority: "important" },
  { id: "d-litigation", category: "Legal", label: "Litigation history and pending claims", priority: "critical" },
  { id: "d-insurance", category: "Legal", label: "Insurance policies and claims history", priority: "important" },
  { id: "d-capex", category: "Operations", label: "CapEx history and upcoming requirements", priority: "important" },
  { id: "d-equipment", category: "Operations", label: "Equipment list with age and condition", priority: "nice-to-have" },
  { id: "d-yib", category: "Background", label: "Years in business and ownership history", priority: "important" },
];

const INDUSTRY_DILIGENCE: Record<string, Omit<DiligenceItem, "status" | "reason">[]> = {
  plumbing: [
    { id: "d-plumb-licenses", category: "Licensing", label: "Plumbing contractor licenses (state + local)", priority: "critical" },
    { id: "d-plumb-trucks", category: "Operations", label: "Fleet condition and maintenance records", priority: "important" },
    { id: "d-plumb-backlog", category: "Revenue", label: "Current job backlog and pipeline", priority: "important" },
  ],
  roofing: [
    { id: "d-roof-licenses", category: "Licensing", label: "Roofing contractor licenses", priority: "critical" },
    { id: "d-roof-warranty", category: "Legal", label: "Outstanding warranty obligations", priority: "critical" },
    { id: "d-roof-seasonal", category: "Revenue", label: "Seasonal revenue breakdown", priority: "important" },
  ],
  hvac: [
    { id: "d-hvac-licenses", category: "Licensing", label: "HVAC contractor and refrigerant licenses", priority: "critical" },
    { id: "d-hvac-service", category: "Revenue", label: "Recurring service contract list", priority: "critical" },
    { id: "d-hvac-fleet", category: "Operations", label: "Fleet and equipment condition", priority: "important" },
  ],
  restaurant: [
    { id: "d-rest-health", category: "Licensing", label: "Health department inspection history", priority: "critical" },
    { id: "d-rest-lease", category: "Legal", label: "Lease assignment terms and landlord consent", priority: "critical" },
    { id: "d-rest-staff", category: "Operations", label: "Key staff retention plan", priority: "important" },
  ],
  "it services": [
    { id: "d-it-contracts", category: "Revenue", label: "Managed service agreements (MRR breakdown)", priority: "critical" },
    { id: "d-it-churn", category: "Revenue", label: "Customer churn rate last 24 months", priority: "critical" },
    { id: "d-it-tech", category: "Operations", label: "Technology stack and vendor agreements", priority: "important" },
  ],
  landscaping: [
    { id: "d-land-seasonal", category: "Revenue", label: "Seasonal revenue breakdown", priority: "important" },
    { id: "d-land-contracts", category: "Revenue", label: "Commercial contract list", priority: "important" },
    { id: "d-land-equipment", category: "Operations", label: "Equipment list and condition", priority: "important" },
  ],
};

export function computeAutoDiligence(
  input: DealInput,
  a: DealAnalysis,
): AutoDiligenceResult {
  const warnings: string[] = [];
  const industry = (input.industry ?? "").toLowerCase();

  // Build the base list.
  const baseItems = UNIVERSAL_DILIGENCE.map((item) => ({
    ...item,
    status: "outstanding" as const,
    reason: "Required for all acquisitions.",
  }));

  // Industry-specific additions.
  const industryKey = Object.keys(INDUSTRY_DILIGENCE).find((k) =>
    industry.includes(k),
  );
  const industryItems: DiligenceItem[] = industryKey
    ? INDUSTRY_DILIGENCE[industryKey].map((item) => ({
        ...item,
        status: "outstanding" as const,
        reason: `Specific to ${industryKey} acquisitions.`,
      }))
    : [];

  // Risk-driven additions.
  const riskItems: DiligenceItem[] = [];
  if (a.risk.hasCritical) {
    riskItems.push({
      id: "d-risk-critical",
      category: "Risk",
      label: "Independent risk assessment from industry expert",
      priority: "critical",
      status: "outstanding",
      reason: "Critical risk factor identified — independent verification required.",
    });
  }
  if (a.missingData.importantMissing.includes("Customer concentration percentage")) {
    riskItems.push({
      id: "d-cust-conc",
      category: "Revenue",
      label: "Top 10 customer revenue breakdown (% of total)",
      priority: "critical",
      status: "outstanding",
      reason: "Customer concentration unknown — this is a deal-breaker risk if one customer is >25% of revenue.",
    });
  }
  if (a.missingData.importantMissing.includes("Owner role / operating responsibility")) {
    riskItems.push({
      id: "d-owner-dep",
      category: "Operations",
      label: "Owner dependency assessment and transition plan",
      priority: "critical",
      status: "outstanding",
      reason: "Owner role unknown — if the owner is the business, revenue may leave with them.",
    });
  }
  if (a.workingCapital.status === "missing") {
    riskItems.push({
      id: "d-wc-detail",
      category: "Financials",
      label: "Working capital detail (AR, AP, inventory, cash)",
      priority: "important",
      status: "outstanding",
      reason: "Working capital unknown — required to set the closing peg and avoid a cash crunch at close.",
    });
  }

  const allItems: DiligenceItem[] = [...baseItems, ...industryItems, ...riskItems];

  const criticalCount = allItems.filter((i) => i.priority === "critical").length;
  const importantCount = allItems.filter((i) => i.priority === "important").length;
  const receivedCount = allItems.filter((i) => i.status === "received").length;
  const completionPct = Math.round((receivedCount / allItems.length) * 100);

  const criticalOutstanding = allItems.filter(
    (i) => i.priority === "critical" && i.status === "outstanding",
  ).length;
  const readyForLOI = criticalOutstanding <= 2;
  const readyForLender = criticalOutstanding === 0;

  if (allItems.length === 0) warnings.push("No diligence items generated.");

  return {
    items: allItems,
    criticalCount,
    importantCount,
    receivedCount,
    completionPct,
    readyForLOI,
    readyForLender,
    warnings,
  };
}

// ─── 7. Data Quality Score ───────────────────────────────────────────────────

export function computeDataQuality(input: DealInput, a: DealAnalysis): DataQualityResult {
  const criticalGaps = a.missingData.criticalMissing;
  const importantGaps = a.missingData.importantMissing;

  // Count fields that are present and positive.
  const checks = [
    isFiniteNumber(input.annualRevenue),
    isFiniteNumber(input.annualEBITDA) || isFiniteNumber(input.annualSDE),
    isFiniteNumber(a.capitalStack.purchasePriceUsed),
    a.risk.riskConfidence === "high" || a.risk.riskConfidence === "medium",
    a.workingCapital.status !== "missing",
    a.integration.status !== "not_ready",
    criticalGaps.length === 0,
    importantGaps.length <= 3,
    a.earningsBasis !== "missing",
    a.valuation.compatibility === "basis_match",
  ];

  const fieldsProvided = checks.filter(Boolean).length;
  const fieldsTotal = checks.length;

  let score = Math.round((fieldsProvided / fieldsTotal) * 100);

  // Hard penalties.
  if (criticalGaps.length > 0) score = Math.min(score, 50);
  if (importantGaps.length >= 8) score = Math.min(score, 40);
  else if (importantGaps.length >= 5) score = Math.min(score, 65);

  let label: DataQualityResult["label"] = "High";
  if (score < 40) label = "Very Low";
  else if (score < 60) label = "Low";
  else if (score < 80) label = "Medium";

  const rationale =
    criticalGaps.length > 0
      ? `Critical gaps (${criticalGaps.join(", ")}) prevent reliable analysis.`
      : importantGaps.length > 0
        ? `${importantGaps.length} important items missing reduce confidence.`
        : "All key inputs are present — analysis is reliable.";

  return {
    score,
    label,
    fieldsProvided,
    fieldsTotal,
    criticalGaps,
    importantGaps,
    rationale,
  };
}

// ─── 8. Assumption Badges ────────────────────────────────────────────────────

export function computeAssumptionBadges(
  input: DealInput,
  a: DealAnalysis,
): AssumptionBadge[] {
  const badges: AssumptionBadge[] = [];

  badges.push({
    field: "Revenue",
    status: isFiniteNumber(input.annualRevenue) ? "user-provided" : "missing",
    detail: isFiniteNumber(input.annualRevenue)
      ? `${fmtCurrency(input.annualRevenue)} — entered by user.`
      : "Annual revenue not provided.",
  });

  badges.push({
    field: "EBITDA",
    status: isFiniteNumber(input.annualEBITDA) ? "user-provided" : "missing",
    detail: isFiniteNumber(input.annualEBITDA)
      ? `${fmtCurrency(input.annualEBITDA)} — entered by user.`
      : "EBITDA not provided.",
  });

  badges.push({
    field: "SDE",
    status: isFiniteNumber(input.annualSDE) ? "user-provided" : "missing",
    detail: isFiniteNumber(input.annualSDE)
      ? `${fmtCurrency(input.annualSDE)} — entered by user.`
      : "SDE not provided.",
  });

  const ppSource = a.capitalStack.purchasePriceSource;
  badges.push({
    field: "Purchase Price",
    status:
      ppSource === "purchasePrice"
        ? "user-provided"
        : ppSource === "askingPrice"
          ? "user-provided"
          : "missing",
    detail:
      ppSource === "purchasePrice"
        ? `${fmtCurrency(a.capitalStack.purchasePriceUsed)} — negotiated purchase price.`
        : ppSource === "askingPrice"
          ? `${fmtCurrency(a.capitalStack.purchasePriceUsed)} — asking price used (no purchase price set).`
          : "No price provided.",
  });

  badges.push({
    field: "SBA Rate",
    status: "assumed",
    detail: `${(a.assumptions.sbaInterestRate * 100).toFixed(2)}% — engine default. Update in Assumptions.`,
  });

  badges.push({
    field: "SBA Term",
    status: "assumed",
    detail: `${a.assumptions.sbaTermYears} years — engine default.`,
  });

  badges.push({
    field: "Seller Note Rate",
    status: "assumed",
    detail: `${(a.assumptions.sellerNoteRate * 100).toFixed(2)}% — engine default.`,
  });

  badges.push({
    field: "Capital Stack Split",
    status: "assumed",
    detail: `${(a.assumptions.sbaLoanPct * 100).toFixed(0)}% SBA / ${(a.assumptions.sellerNotePct * 100).toFixed(0)}% Seller Note / ${(a.assumptions.buyerEquityPct * 100).toFixed(0)}% Equity — engine default.`,
  });

  function metricStatusToBadge(s: string): import('./types').AssumptionBadgeStatus {
    if (s === 'actual') return 'engine-calculated';
    if (s === 'assumed' || s === 'estimated') return 'assumed';
    if (s === 'missing') return 'missing';
    return 'needs-verification';
  }

  badges.push({
    field: "EBITDA Margin",
    status: metricStatusToBadge(a.ebitdaMargin.status),
    detail:
      a.ebitdaMargin.value !== null
        ? `${fmtPct(a.ebitdaMargin.value)} — engine-calculated from user inputs.`
        : "Cannot calculate — revenue or EBITDA missing.",
  });

  badges.push({
    field: "DSCR (after standby)",
    status: metricStatusToBadge(a.dscrPair.afterStandby.status),
    detail:
      a.dscrPair.afterStandby.value !== null
        ? `${fmtMultiple(a.dscrPair.afterStandby.value)} — engine-calculated.`
        : "Cannot calculate — earnings or capital stack missing.",
  });

  badges.push({
    field: "Benchmark Band",
    status:
      a.valuation.compatibility === "basis_match"
        ? "engine-calculated"
        : a.valuation.compatibility === "reference_only"
          ? "needs-verification"
          : "missing",
    detail:
      a.valuation.compatibility === "basis_match"
        ? `${a.valuation.benchmark ? `${a.valuation.benchmark.low}x–${a.valuation.benchmark.high}x ${a.earningsBasis}` : "Available"} — basis-matched.`
        : a.valuation.compatibility === "reference_only"
          ? "Benchmark is in a different earnings basis — reference only, not for final valuation."
          : "No benchmark available for this industry.",
  });

  badges.push({
    field: "Risk Score",
    status:
      a.risk.riskConfidence === "high"
        ? "user-provided"
        : a.risk.riskConfidence === "medium"
          ? "user-provided"
          : "needs-verification",
    detail:
      a.risk.riskConfidence === "insufficient"
        ? "Risk panel is incomplete — score all factors for a reliable risk assessment."
        : `${a.risk.totalFactors - a.risk.missingCount}/${a.risk.totalFactors} risk factors scored (confidence: ${a.risk.riskConfidence}).`,
  });

  badges.push({
    field: "Working Capital",
    status: a.workingCapital.status === "missing" ? "missing" : "user-provided",
    detail:
      a.workingCapital.status === "missing"
        ? "Working capital data not provided — closing adjustment unknown."
        : "Working capital data provided.",
  });

  return badges;
}
