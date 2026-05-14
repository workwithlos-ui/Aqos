// Acquisition OS — deterministic engine type contracts.
// IMPORTANT: This file is the single source of truth for the shapes flowing
// through dealMath, capitalStack, dealScoring, riskScoring, missingData,
// dealVerdict, benchmarkMultiples, advisorContext and exports.
//
// No file in the engine layer is allowed to invent values. Every numeric
// output must carry a MetricResult so the UI can render "missing" / "invalid"
// instead of NaN, Infinity, undefined, null.

export type EarningsBasis = "EBITDA" | "SDE" | "missing";

export type MetricStatus = "actual" | "estimated" | "missing" | "invalid";

export type RevenueTrend = "growing" | "flat" | "declining" | "unknown";

export type DealStage =
  | "Target Identified"
  | "Contacted"
  | "Conversation Held"
  | "Financials Requested"
  | "Under Analysis"
  | "LOI Submitted"
  | "Diligence"
  | "Closing"
  | "Closed"
  | "Passed";

export interface RiskInputs {
  financialStabilityRisk?: number | null;
  customerConcentrationRisk?: number | null;
  ownerDependencyRisk?: number | null;
  industryRisk?: number | null;
  operationalComplexityRisk?: number | null;
}

export interface DiligenceChecklist {
  taxReturnsReceived?: boolean;
  pnlReceived?: boolean;
  balanceSheetReceived?: boolean;
  cashFlowStatementReceived?: boolean;
  addBacksDocumented?: boolean;
  customerListReceived?: boolean;
  contractsReceived?: boolean;
  employeeRosterReceived?: boolean;
  leaseReviewed?: boolean;
  debtScheduleReceived?: boolean;
  qoeComplete?: boolean;
}

// ---------------------------------------------------------------------------
// WORKING CAPITAL INPUTS
// ---------------------------------------------------------------------------

export interface WorkingCapitalInputs {
  arBalance?: number | null;
  apBalance?: number | null;
  inventoryBalance?: number | null;
  cashIncluded?: number | null;
  monthlyRevenue?: number | null;
  monthlyFixedCosts?: number | null;
  dso?: number | null;
  dpo?: number | null;
  dio?: number | null;
  arOver90Pct?: number | null;
  inventoryOver90Pct?: number | null;
  workingCapitalPeg?: number | null;
  requiredLiquidityBufferMonths?: number | null;
  seasonalityFactor?: number | null;
  capExNeedsAnnual?: number | null;
  totalDebtBalance?: number | null;
}

// ---------------------------------------------------------------------------
// INTEGRATION INPUTS
// ---------------------------------------------------------------------------

export type IntegrationComplexity = "low" | "medium" | "high" | "critical";

export interface IntegrationInputs {
  complexity?: IntegrationComplexity;
  integrationLeadAssigned?: boolean;
  integrationLeadCapacityHrsPerWeek?: number | null;
  keyEmployeesIdentified?: boolean;
  keyEmployeeRetentionPlan?: boolean;
  customerCommunicationPlan?: boolean;
  systemsMigrationPlan?: boolean;
  accountingTransitionPlan?: boolean;
  payrollTransitionPlan?: boolean;
  vendorTransitionPlan?: boolean;
  hundredDayPlanDrafted?: boolean;
  sopTransferStatus?: "not_started" | "in_progress" | "complete" | "missing";
  sellerTransitionWeeks?: number | null;
  cultureRisk?: "low" | "medium" | "high" | "missing";
}

// ---------------------------------------------------------------------------
// PER-DEAL FREEZE / EXCEPTION FLAGS
// ---------------------------------------------------------------------------

export interface DealOverrides {
  /** Buyer marks the deal as off-thesis but explicitly approved for review. */
  exceptionApproved?: boolean;
  exceptionRationale?: string | null;
  /** Buyer manually freezes a deal. */
  manualFreeze?: "green" | "yellow" | "red" | null;
  manualFreezeReason?: string | null;
}

export interface DealInput {
  id?: string;
  companyName: string;
  industry?: string | null;
  location?: string | null;
  stage?: DealStage | string | null;

  annualRevenue?: number | null;
  annualSDE?: number | null;
  annualEBITDA?: number | null;
  askingPrice?: number | null;
  purchasePrice?: number | null;

  ownerRole?: string | null;
  revenueTrend?: RevenueTrend | null;
  customerConcentrationPct?: number | null;
  recurringRevenuePct?: number | null;
  employeeCount?: number | null;
  yearsInBusiness?: number | null;

  riskInputs?: RiskInputs;
  diligence?: DiligenceChecklist;

  // Operational metadata — flagging data origin keeps demo/test deals out of
  // the strategic recommendations surface.
  isDemo?: boolean;
  isTest?: boolean;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;

  // Institutional M&A inputs.
  workingCapital?: WorkingCapitalInputs;
  integration?: IntegrationInputs;
  overrides?: DealOverrides;

  // Per-deal recurring revenue / geography signal for thesis fit.
  geography?: string | null;
}

export interface MetricResult {
  value: number | null;
  display: string;
  status: MetricStatus;
  formula: string;
  inputs: Record<string, number | null | string>;
  warning?: string;
}

export interface CapitalStackAssumptions {
  sbaLoanPct: number;
  sbaInterestRate: number;
  sbaTermYears: number;
  sellerNotePct: number;
  sellerNoteRate: number;
  sellerNoteTermYears: number;
  sellerNoteStandbyMonths: number;
  buyerEquityPct: number;
}

export interface CapitalStackComponent {
  label: "SBA Loan" | "Seller Note" | "Buyer Equity";
  pct: number;
  amount: number | null;
}

export interface CapitalStackResult {
  status: MetricStatus;
  purchasePriceUsed: number | null;
  purchasePriceSource: "purchasePrice" | "askingPrice" | "missing";
  components: CapitalStackComponent[];
  totalSources: number | null;
  differenceVsPurchasePrice: number | null;
  pctTotal: number;
  pctValid: boolean;
  sba: {
    amount: number | null;
    annualDebtService: number | null;
    monthlyPayment: number | null;
    rate: number;
    termYears: number;
  };
  sellerNote: {
    amount: number | null;
    annualDebtService: number | null;
    monthlyPayment: number | null;
    rate: number;
    termYears: number;
    standbyMonths: number;
    standbyActive: boolean;
  };
  buyerEquity: {
    amount: number | null;
    pct: number;
  };
  totalAnnualDebtService: number | null;
  totalAnnualDebtServiceDuringStandby: number | null;
  warnings: string[];
}

export interface DscrPair {
  duringStandby: MetricResult;
  afterStandby: MetricResult;
}

export interface BenchmarkMultiple {
  industryKey: string;
  industryLabel: string;
  low: number;
  median: number;
  high: number;
  basis: "EBITDA" | "SDE";
  confidence: "low" | "medium" | "high";
}

export interface BenchmarkPair {
  ebitda: BenchmarkMultiple | null;
  sde: BenchmarkMultiple | null;
}

export type ValuationCompatibility =
  | "basis_match" // Benchmark basis matches earnings basis — direct comparison.
  | "reference_only" // Benchmark exists but in opposite basis. Show with explicit caveat.
  | "unavailable"; // No benchmark for this industry, or earnings missing.

export interface ValuationResult {
  status: MetricStatus;
  earningsBasis: EarningsBasis;
  earningsUsed: number | null;
  benchmark: BenchmarkMultiple | null;
  /** The multiple actually used to compare against the band (matches benchmark.basis). */
  comparisonMultiple: MetricResult;
  /** Same as before — the implied multiple in the deal's earnings basis. */
  currentImpliedMultiple: MetricResult;
  benchmarkLowValue: number | null;
  benchmarkMedianValue: number | null;
  benchmarkHighValue: number | null;
  benchmarkBandLabel: string;
  compatibility: ValuationCompatibility;
  bandPosition:
    | "below_low"
    | "in_band"
    | "above_high"
    | "above_median"
    | "below_median"
    | "missing";
  valueGapVsAsking: number | null;
  warnings: string[];
}

export interface RiskFactor {
  key:
    | "financialStabilityRisk"
    | "customerConcentrationRisk"
    | "ownerDependencyRisk"
    | "industryRisk"
    | "operationalComplexityRisk";
  label: string;
  score: number | null;
  level: "Low" | "Moderate-Low" | "Moderate" | "High" | "Critical" | "Missing";
  source: "actual" | "derived" | "missing";
  rationale: string;
}

export interface RiskResult {
  factors: RiskFactor[];
  highestRisk: RiskFactor | null;
  criticalCount: number;
  averageScore: number | null;
  hasCritical: boolean;
  /** Number of risk factors with no actual or derived score. */
  missingCount: number;
  /** factors.length total. */
  totalFactors: number;
  /** Fraction of factors with a known score (0..1). */
  completeness: number;
  /** Confidence in the risk panel as a whole. */
  riskConfidence: "high" | "medium" | "low" | "insufficient";
  /** Plain-language summary used by UI/exports/advisor. */
  riskCompletenessLabel: string;
}

export interface DealScoreContribution {
  category:
    | "Valuation"
    | "Debt Service"
    | "Profitability"
    | "Risk"
    | "Diligence"
    | "Stage";
  earned: number;
  available: number;
  notes: string;
}

export interface DealScoreResult {
  status: "scored" | "blocked" | "review_required";
  score: number;
  contributions: DealScoreContribution[];
  capsApplied: string[];
  blockerReason?: string;
  bucket: FinalBucket;
}

/**
 * The single, deterministic post-verdict bucket. Everything user-facing
 * (Pipeline, Dashboard, Analyzer, Copilot, exports, IC memo) MUST read this
 * field. The score-only bucket is no longer authoritative; it is folded into
 * `finalBucket` by the orchestrator after the verdict and the institutional
 * gates (Acquisition Priority gate, freeze, thesis, working capital).
 */
export type FinalBucket =
  | "Acquisition Priority"
  | "Diligence Priority"
  | "Watch"
  | "Kill/Pause"
  | "Scoring Review"
  | "Cannot Underwrite"

export interface MissingDataResult {
  criticalMissing: string[];
  importantMissing: string[];
  niceToHaveMissing: string[];
  canUnderwrite: boolean;
  canRankAsAcquisitionPriority: boolean;
  canGenerateLOI: boolean;
  canGenerateLenderPackage: boolean;
}

export type Verdict =
  | "PURSUE"
  | "PURSUE WITH CAUTION"
  | "DILIGENCE PRIORITY"
  | "RENEGOTIATE"
  | "PAUSE"
  | "KILL"
  | "CANNOT UNDERWRITE"
  | "SCORING REVIEW REQUIRED";

export interface DealVerdictResult {
  verdict: Verdict;
  rationale: string;
  blockers: string[];
  confidence: "low" | "medium" | "high";
  /** When true, the headline numbers work but diligence/risk completeness is too
   * low to call this a final recommendation. UI must label the score as
   * "Preliminary". */
  isPreliminary: boolean;
  /** Sentence explaining why confidence is what it is — quoted by exports/advisor. */
  confidenceReason: string;
}

// ---------------------------------------------------------------------------
// THESIS / BUY BOX
// ---------------------------------------------------------------------------

export interface BuyBox {
  targetIndustries: string[];
  excludedIndustries: string[];
  revenueMin: number | null;
  revenueMax: number | null;
  earningsMin: number | null;
  earningsMax: number | null;
  minMarginPct: number | null;
  maxCustomerConcentrationPct: number | null;
  geographies: string[];
  ownerDependencyTolerance: "low" | "medium" | "high";
  recurringRevenuePreferredPct: number | null;
  employeeCountMin: number | null;
  employeeCountMax: number | null;
  yearsInBusinessMin: number | null;
  requiresFinancing: boolean;
  requiresSellerFinancing: boolean;
  requiresSbaEligibility: boolean;
  strategicRationale: string;
  redFlags: string[];
  mustHave: string[];
  niceToHave: string[];
}

export type ThesisFitBucket =
  | "Strong Fit"
  | "Partial Fit"
  | "Off-Thesis"
  | "Exception Required";

export interface ThesisCriterion {
  key: string;
  label: string;
  weight: "must" | "important" | "preferred";
  status: "pass" | "fail" | "unknown";
  detail: string;
}

export interface ThesisFitResult {
  enabled: boolean;
  fitScore: number; // 0..100
  bucket: ThesisFitBucket;
  passed: ThesisCriterion[];
  failed: ThesisCriterion[];
  unknown: ThesisCriterion[];
  redFlagsTriggered: string[];
  mustHaveBlocked: string[];
  exceptionApproved: boolean;
  exceptionRationale: string | null;
  rationale: string;
}

// ---------------------------------------------------------------------------
// WORKING CAPITAL RESULT
// ---------------------------------------------------------------------------

export interface WorkingCapitalResult {
  status: "complete" | "partial" | "missing";
  netWorkingCapital: number | null;
  estimatedPeg: number | null;
  liquidityBufferRequired: number | null;
  cashConversionDays: number | null;
  cashConversionRisk: "low" | "medium" | "high" | "missing";
  workingCapitalRisk: "low" | "medium" | "high" | "critical" | "missing";
  closingAdjustment: number | null;
  buyerWarnings: string[];
  blocksCloseReady: boolean;
  arOverdueRisk: "low" | "medium" | "high" | "missing";
  inventoryStaleRisk: "low" | "medium" | "high" | "missing";
  capExBurdenAnnual: number | null;
  notes: string[];
}

// ---------------------------------------------------------------------------
// INTEGRATION RESULT
// ---------------------------------------------------------------------------

export interface IntegrationGate {
  key: string;
  label: string;
  status: "pass" | "fail" | "missing";
  detail: string;
}

export interface IntegrationResult {
  status: "ready" | "in_progress" | "not_ready" | "missing";
  readinessScore: number; // 0..100
  gates: IntegrationGate[];
  blockers: string[];
  requiredActions: string[];
  hundredDayReady: boolean;
  canCloseSafely: boolean;
  integrationRisk: "low" | "medium" | "high" | "critical" | "missing";
  rationale: string;
}

// ---------------------------------------------------------------------------
// GOVERNANCE / IC GATES
// ---------------------------------------------------------------------------

export type GovernanceGateKey =
  | "thesisFitComplete"
  | "initialScreenComplete"
  | "underwritingComplete"
  | "dscrPasses"
  | "capitalStackReconciles"
  | "benchmarkBasisValid"
  | "criticalDiligenceIdentified"
  | "qoePlanDefined"
  | "workingCapitalReviewed"
  | "integrationPlanDrafted"
  | "redTeamObjectionsComplete"
  | "freezeTriggersClear"
  | "lenderPackageReady"
  | "loiTermsDrafted"
  | "legalReviewRequired";

export interface GovernanceGate {
  key: GovernanceGateKey;
  label: string;
  status: "pass" | "fail" | "pending";
  detail: string;
}

export interface GovernanceResult {
  gates: GovernanceGate[];
  passedCount: number;
  totalCount: number;
  icReady: boolean;
  loiReady: boolean;
  lenderReady: boolean;
  closeReady: boolean;
  blockers: string[];
  nextGovernanceAction: string;
}

// ---------------------------------------------------------------------------
// FREEZE COMMAND CENTER
// ---------------------------------------------------------------------------

export type FreezeStatus = "green" | "yellow" | "red";

export interface FreezeTrigger {
  key: string;
  scope: "deal" | "platform";
  severity: FreezeStatus;
  label: string;
  detail: string;
  active: boolean;
}

export interface DealFreezeResult {
  status: FreezeStatus;
  triggers: FreezeTrigger[];
  blocksAcquisitionPriority: boolean;
  blocksCloseReady: boolean;
  blocksAggressiveLOI: boolean;
  rationale: string;
}

export interface PlatformContext {
  liquidityBuffer?: number | null;
  liquidityBufferRequired?: number | null;
  portfolioDscrAfter?: number | null;
  portfolioRevenueDeclinePct?: number | null;
  portfolioEbitdaMarginDeltaPct?: number | null;
  integrationMilestonesMissed?: number | null;
  customerChurnSpikePct?: number | null;
  keyEmployeeDepartures?: number | null;
  openPostCloseIssues?: number | null;
  dealsInDiligence?: number | null;
  diligenceCapacity?: number | null;
}

export interface PlatformFreezeResult {
  status: FreezeStatus;
  triggers: FreezeTrigger[];
  rationale: string;
}

// ---------------------------------------------------------------------------
// RED TEAM
// ---------------------------------------------------------------------------

export type ObjectionSeverity = "low" | "medium" | "high" | "critical";
export type ObjectionStatus = "open" | "in_diligence" | "cleared" | "unresolvable";

export interface RedTeamObjection {
  key: string;
  prompt: string;
  finding: string;
  evidenceNeeded: string[];
  severity: ObjectionSeverity;
  owner: string;
  status: ObjectionStatus;
  cleared: boolean;
}

export interface RedTeamResult {
  objections: RedTeamObjection[];
  topObjections: RedTeamObjection[]; // first 5 by severity
  unresolvedCriticalCount: number;
  rationale: string;
}

// ---------------------------------------------------------------------------
// BUYER CASH FLOW AFTER DEBT SERVICE
// ---------------------------------------------------------------------------

export interface BuyerCashFlowResult {
  earningsUsed: number | null;
  totalAnnualDebtService: number | null;
  requiredCapEx: number | null;
  workingCapitalReserve: number | null;
  buyerCashFlow: MetricResult;
  buyerCashFlowDuringStandby: MetricResult;
  /** Annualized cash-on-cash return on buyer equity invested. */
  cashOnCashReturn: MetricResult;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// MAX SUPPORTABLE PURCHASE PRICE
// ---------------------------------------------------------------------------

export interface MaxSupportablePPResult {
  /** Max price at which DSCR after standby ≥ 1.25x */
  at1_25x: number | null;
  /** Max price at which DSCR after standby ≥ 1.50x */
  at1_50x: number | null;
  /** Max price at which DSCR after standby ≥ 2.00x */
  at2_00x: number | null;
  /** Current asking / purchase price for comparison */
  currentPrice: number | null;
  /** Whether current price is at or below the 1.25x max */
  priceIsSupported: boolean;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// STRESS TEST PANEL
// ---------------------------------------------------------------------------

export interface StressScenario {
  label: string;
  description: string;
  dscrDuringStandby: MetricResult;
  dscrAfterStandby: MetricResult;
  earningsUsed: number | null;
  debtServiceUsed: number | null;
  pass: boolean;
  failReason: string | null;
  buyerCashFlow: number | null;
}

export interface StressTestResult {
  scenarios: StressScenario[];
  worstCaseDscr: number | null;
  allScenariosPass: boolean;
  anyScenariosPass: boolean;
  stressRating: "resilient" | "moderate" | "fragile" | "missing";
  warnings: string[];
}

// ---------------------------------------------------------------------------
// REFINED VERDICT + BUYER-LANGUAGE REASON
// ---------------------------------------------------------------------------

export type RefinedVerdict =
  | "Strong Pursue"
  | "Pursue with Conditions"
  | "Renegotiate"
  | "Freeze"
  | "Walk Away";

export interface RefinedVerdictResult {
  verdict: RefinedVerdict;
  buyerReason: string; // Buyer-language, not finance jargon.
  conditions: string[]; // What must be true before moving forward.
  urgency: "high" | "medium" | "low";
}

// ---------------------------------------------------------------------------
// RECOMMENDED OFFER
// ---------------------------------------------------------------------------

export interface RecommendedOfferResult {
  openingOffer: number | null;
  targetPrice: number | null;
  maximumPrice: number | null;
  preferredStructure: string;
  sellerNoteAmount: number | null;
  earnoutAmount: number | null;
  earnoutTrigger: string | null;
  requiredTransitionWeeks: number;
  rationale: string;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// AUTO-GENERATED DILIGENCE CHECKLIST
// ---------------------------------------------------------------------------

export type DiligenceItemPriority = "critical" | "important" | "nice-to-have";
export type DiligenceItemStatus = "received" | "outstanding" | "not-applicable";

export interface DiligenceItem {
  id: string;
  category: string;
  label: string;
  priority: DiligenceItemPriority;
  status: DiligenceItemStatus;
  reason: string; // Why this item matters for this specific deal.
}

export interface AutoDiligenceResult {
  items: DiligenceItem[];
  criticalCount: number;
  importantCount: number;
  receivedCount: number;
  completionPct: number; // 0..100
  readyForLOI: boolean;
  readyForLender: boolean;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// DATA QUALITY SCORE
// ---------------------------------------------------------------------------

export interface DataQualityResult {
  score: number; // 0..100
  label: "High" | "Medium" | "Low" | "Very Low";
  fieldsProvided: number;
  fieldsTotal: number;
  criticalGaps: string[];
  importantGaps: string[];
  rationale: string;
}

// ---------------------------------------------------------------------------
// ASSUMPTION BADGE
// ---------------------------------------------------------------------------

export type AssumptionBadgeStatus =
  | "user-provided"
  | "engine-calculated"
  | "assumed"
  | "missing"
  | "needs-verification";

export interface AssumptionBadge {
  field: string;
  status: AssumptionBadgeStatus;
  detail: string;
}

// ---------------------------------------------------------------------------
// EXISTING DealAnalysis
// ---------------------------------------------------------------------------

export interface DealAnalysis {
  dealId?: string;
  companyName: string;
  isDemo: boolean;
  isTest: boolean;

  normalizedPurchasePrice: number | null;
  normalizedPurchasePriceSource: "purchasePrice" | "askingPrice" | "missing";
  earningsBasis: EarningsBasis;
  earningsUsed: number | null;

  ebitdaMargin: MetricResult;
  sdeMargin: MetricResult;
  evToEBITDA: MetricResult;
  evToSDE: MetricResult;

  capitalStack: CapitalStackResult;
  dscr: MetricResult;
  dscrPair: DscrPair;

  valuation: ValuationResult;
  risk: RiskResult;
  score: DealScoreResult;
  missingData: MissingDataResult;
  verdict: DealVerdictResult;

  /** Final, post-confidence headline label for the score, e.g. "Score" or "Preliminary Score". */
  scoreLabel: string;

  /**
   * Single deterministic bucket consumed by every UI / advisor / export
   * surface. Computed by the orchestrator from verdict + score + gates so
   * Pipeline/Dashboard/Analyzer/Copilot can never disagree.
   */
  finalBucket: FinalBucket;

  /** Human-readable explanation of why finalBucket has its value. */
  finalBucketReason: string;

  /**
   * Detailed pass/fail trace of the Acquisition Priority gate. Surfaced on
   * the Analyzer so a buyer can see exactly why a deal cannot be promoted.
   */
  acquisitionPriorityGate: {
    passed: boolean;
    reasons: string[];
    checks: Array<{ name: string; passed: boolean; detail: string }>;
  };

  // Institutional M&A modules.
  thesis: ThesisFitResult;
  workingCapital: WorkingCapitalResult;
  integration: IntegrationResult;
  governance: GovernanceResult;
  freeze: DealFreezeResult;
  redTeam: RedTeamResult;

  nextActions: string[];
  assumptions: CapitalStackAssumptions;

  // Buyer-grade advisory outputs (Iteration 6).
  buyerCashFlow: BuyerCashFlowResult;
  maxSupportablePP: MaxSupportablePPResult;
  stressTest: StressTestResult;
  refinedVerdict: RefinedVerdictResult;
  recommendedOffer: RecommendedOfferResult;
  autoDiligence: AutoDiligenceResult;
  dataQuality: DataQualityResult;
  assumptionBadges: AssumptionBadge[];
}
