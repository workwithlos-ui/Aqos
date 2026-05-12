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
  bucket:
    | "Acquisition Priority"
    | "Diligence Priority"
    | "Watch"
    | "Kill/Pause"
    | "Scoring Review"
    | "Cannot Underwrite";
}

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

  nextActions: string[];
  assumptions: CapitalStackAssumptions;
}
