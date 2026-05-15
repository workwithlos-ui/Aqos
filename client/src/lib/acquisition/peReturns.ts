/**
 * PE-grade returns engine — Iteration 10 (calibrated)
 *
 * Calibration rules (per brief):
 *   1. Initial equity denominator = full equity-at-risk = buyer equity tranche
 *      + closing-cost reserve (legal + QoE + lender fees + post-close runway).
 *      Same value used in cash-on-cash.
 *   2. taxRate (default 27%) applied to Y1–Y5 buyer FCF (after debt service).
 *   3. capitalGainsTaxRate (default 24%) applied to exit GAIN only
 *      (proceeds − initial equity-at-risk), never to return-of-capital.
 *   4. CapEx scales with revenue: capex_y_n = revenue_y_n × industryCapexPct.
 *   5. ΔWC scales with revenue change: ΔWC = (rev_n − rev_n−1) × industryWcPct.
 *   6. Exit multiples re-centered on entry multiple × {0.85, 1.00, 1.15},
 *      NOT benchmark band edges.
 *
 * Buyer Free Cash Flow per year =
 *   EBITDA
 *   − Debt service (interest + principal portion)
 *   − CapEx (scaled with revenue)
 *   − ΔWC (scaled with revenue change)
 *   − Tax (27% applied on the pre-tax buyer FCF that is positive)
 *
 * Equity proceeds at exit =
 *   Exit EV (net of transaction costs)
 *   − Remaining debt balance
 *   − Capital gains tax on (gross proceeds − initial equity-at-risk)
 *
 * IRR is computed on the equity stream:
 *   year 0:        −initialEquityAtRisk
 *   year 1..N−1:   buyer FCF after tax
 *   year N:        buyer FCF after tax + after-tax exit equity proceeds
 */

import type {
  DealAnalysis,
  DealInput,
} from "./types";
import { isFiniteNumber } from "./dealMath";
import { getIndustryDefault } from "./industryDefaults";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProjectionAssumptions {
  holdYears: number;
  revenueGrowthBear: number;
  revenueGrowthBase: number;
  revenueGrowthBull: number;
  marginDriftBear: number;
  marginDriftBase: number;
  marginDriftBull: number;
  exitMultipleBear: number;
  exitMultipleBase: number;
  exitMultipleBull: number;
  exitTransactionCostsPct: number;
  taxRate: number;
  capitalGainsTaxRate: number;
  industryCapexPct: number;
  industryWcPct: number;
  closingCostsPct: number;
  entryMultiple: number;
  initialEquityAtRisk: number;
}

export interface ProjectionYearRow {
  year: number;
  revenue: number;
  ebitda: number;
  margin: number;
  debtService: number;
  capex: number;
  workingCapitalChange: number;
  preTaxBuyerCashFlow: number;
  tax: number;
  buyerCashFlow: number;
  debtBalance: number;
  cumulativeEquityCashFlow: number;
}

export interface ScenarioProjection {
  label: "Bear" | "Base" | "Bull";
  rows: ProjectionYearRow[];
  exitEnterpriseValue: number;
  exitDebtPayoff: number;
  exitGrossEquityProceeds: number;
  exitCapitalGainsTax: number;
  exitEquityProceeds: number;
  totalEquityIn: number;
  totalDistributions: number;
  irr: number | null;
  moic: number | null;
  rationale: string;
}

export interface SensitivityCell {
  exitMultiple: number;
  revenueGrowth: number;
  irr: number | null;
}

export interface SensitivityGrid {
  exitMultiples: number[];
  revenueGrowths: number[];
  cells: SensitivityCell[][];
}

export interface PEReturnsResult {
  available: boolean;
  reason?: string;
  assumptions: ProjectionAssumptions;
  bear: ScenarioProjection;
  base: ScenarioProjection;
  bull: ScenarioProjection;
  sensitivity: SensitivityGrid;
}

// ─── Industry-default projection curves ─────────────────────────────────────

interface IndustryProjectionCurve {
  growth: { bear: number; base: number; bull: number };
  marginDrift: { bear: number; base: number; bull: number };
}

const INDUSTRY_PROJECTION_CURVES: Record<string, IndustryProjectionCurve> = {
  hvac: {
    // HVAC is a mature trade. Realistic organic base growth is ~3.5%.
    growth: { bear: -0.02, base: 0.035, bull: 0.065 },
    // Margins are stable. Base case = no operational improvement.
    marginDrift: { bear: -0.015, base: 0, bull: 0.01 },
  },
  plumbing: {
    growth: { bear: -0.02, base: 0.03, bull: 0.07 },
    marginDrift: { bear: -0.01, base: 0.005, bull: 0.015 },
  },
  electrical: {
    growth: { bear: -0.02, base: 0.03, bull: 0.07 },
    marginDrift: { bear: -0.01, base: 0.005, bull: 0.015 },
  },
  roofing: {
    growth: { bear: -0.03, base: 0.025, bull: 0.06 },
    marginDrift: { bear: -0.015, base: 0, bull: 0.01 },
  },
  landscaping: {
    growth: { bear: -0.03, base: 0.03, bull: 0.07 },
    marginDrift: { bear: -0.01, base: 0, bull: 0.01 },
  },
  "auto repair": {
    growth: { bear: -0.03, base: 0.02, bull: 0.06 },
    marginDrift: { bear: -0.015, base: 0, bull: 0.01 },
  },
  restaurant: {
    growth: { bear: -0.05, base: 0.02, bull: 0.06 },
    marginDrift: { bear: -0.02, base: -0.005, bull: 0.01 },
  },
  "it services": {
    growth: { bear: -0.02, base: 0.06, bull: 0.12 },
    marginDrift: { bear: -0.01, base: 0.01, bull: 0.02 },
  },
  "marketing agency": {
    growth: { bear: -0.05, base: 0.05, bull: 0.1 },
    marginDrift: { bear: -0.02, base: 0, bull: 0.015 },
  },
};

const DEFAULT_CURVE: IndustryProjectionCurve = {
  growth: { bear: -0.03, base: 0.03, bull: 0.07 },
  marginDrift: { bear: -0.01, base: 0, bull: 0.015 },
};

function curveFor(industry: string | null | undefined): IndustryProjectionCurve {
  if (!industry) return DEFAULT_CURVE;
  return INDUSTRY_PROJECTION_CURVES[industry.toLowerCase().trim()] ?? DEFAULT_CURVE;
}

// ─── IRR / MOIC math ────────────────────────────────────────────────────────

export function computeIRR(cashFlows: number[]): number | null {
  if (cashFlows.length < 2) return null;
  const hasNeg = cashFlows.some((c) => c < 0);
  const hasPos = cashFlows.some((c) => c > 0);
  if (!hasNeg || !hasPos) return null;

  const npv = (r: number) =>
    cashFlows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + r, t), 0);
  const dnpv = (r: number) =>
    cashFlows.reduce((acc, cf, t) => acc - (t * cf) / Math.pow(1 + r, t + 1), 0);

  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npv(r);
    if (Math.abs(f) < 1e-6) return r;
    const df = dnpv(r);
    if (Math.abs(df) < 1e-10) break;
    const next = r - f / df;
    if (!Number.isFinite(next) || next < -0.99) break;
    r = next;
  }

  let lo = -0.99;
  let hi = 10;
  let fLo = npv(lo);
  let fHi = npv(hi);
  if (fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-6) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

function computeMOIC(totalEquityIn: number, totalDistributions: number): number | null {
  if (!isFiniteNumber(totalEquityIn) || totalEquityIn <= 0) return null;
  return totalDistributions / totalEquityIn;
}

// ─── Single-scenario projection ─────────────────────────────────────────────

interface ProjectArgs {
  label: "Bear" | "Base" | "Bull";
  startRevenue: number;
  startMargin: number;
  growth: number;
  marginDrift: number;
  startDebtBalance: number;
  annualDebtService: number;
  holdYears: number;
  exitMultiple: number;
  exitTransactionCostsPct: number;
  initialEquityAtRisk: number;
  industryCapexPct: number;
  industryWcPct: number;
  taxRate: number;
  capitalGainsTaxRate: number;
  blendedDebtRate: number; // weighted-avg interest rate used for amortization
  debtTermYears: number;   // weighted-avg term used for amortization
  rationale: string;
}

function projectScenario(args: ProjectArgs): ScenarioProjection {
  const rows: ProjectionYearRow[] = [];
  let revenue = args.startRevenue;
  let prevRevenue = args.startRevenue;
  let margin = args.startMargin;
  let debtBalance = args.startDebtBalance;
  let cumulativeEquityCashFlow = -args.initialEquityAtRisk;

  // Year 0 row
  rows.push({
    year: 0,
    revenue: args.startRevenue,
    ebitda: args.startRevenue * args.startMargin,
    margin: args.startMargin,
    debtService: 0,
    capex: 0,
    workingCapitalChange: 0,
    preTaxBuyerCashFlow: 0,
    tax: 0,
    buyerCashFlow: 0,
    debtBalance: args.startDebtBalance,
    cumulativeEquityCashFlow,
  });

  // Level-payment amortization (SBA / commercial-loan style).
  // The debt is fully amortizing over its full term. We track principal vs.
  // interest each year using the standard amortization formula, so the debt
  // balance at exit reflects how much of the loan is actually paid down
  // during the hold period — not the full payoff that straight-line
  // assumed (which inflated equity proceeds).
  const r = args.blendedDebtRate;
  const annualPayment = args.annualDebtService;

  for (let year = 1; year <= args.holdYears; year++) {
    revenue = revenue * (1 + args.growth);
    margin = Math.max(0, Math.min(1, margin + args.marginDrift));
    const ebitda = revenue * margin;
    const debtService = Math.min(annualPayment, ebitda + debtBalance);

    // Split debt service into interest + principal at the blended rate.
    const interest = debtBalance * r;
    const principalPaid = Math.max(0, Math.min(debtBalance, debtService - interest));

    // CapEx scales with revenue
    const capex = revenue * args.industryCapexPct;
    // ΔWC scales with revenue change (only positive growth eats WC)
    const wcChange = Math.max(0, revenue - prevRevenue) * args.industryWcPct;

    const preTaxBuyerCashFlow = ebitda - debtService - capex - wcChange;
    const tax = preTaxBuyerCashFlow > 0 ? preTaxBuyerCashFlow * args.taxRate : 0;
    const buyerCashFlow = preTaxBuyerCashFlow - tax;

    debtBalance = Math.max(0, debtBalance - principalPaid);
    cumulativeEquityCashFlow += buyerCashFlow;

    rows.push({
      year,
      revenue,
      ebitda,
      margin,
      debtService,
      capex,
      workingCapitalChange: wcChange,
      preTaxBuyerCashFlow,
      tax,
      buyerCashFlow,
      debtBalance,
      cumulativeEquityCashFlow,
    });

    prevRevenue = revenue;
  }

  // Exit
  const exitYear = rows[rows.length - 1];
  const exitEV = exitYear.ebitda * args.exitMultiple;
  const exitEVNet = exitEV * (1 - args.exitTransactionCostsPct);
  const exitDebtPayoff = exitYear.debtBalance;
  const exitGrossEquityProceeds = Math.max(0, exitEVNet - exitDebtPayoff);

  // Capital gains tax on the gain portion only (proceeds − initial equity-at-risk),
  // with a floor at 0 (no negative tax on a loss).
  const exitGain = Math.max(0, exitGrossEquityProceeds - args.initialEquityAtRisk);
  const exitCapitalGainsTax = exitGain * args.capitalGainsTaxRate;
  const exitEquityProceeds = exitGrossEquityProceeds - exitCapitalGainsTax;

  // Cash flow stream for IRR
  const cashFlowStream: number[] = [-args.initialEquityAtRisk];
  for (let y = 1; y <= args.holdYears; y++) {
    const r = rows[y];
    const cf = r.buyerCashFlow + (y === args.holdYears ? exitEquityProceeds : 0);
    cashFlowStream.push(cf);
  }
  const irr = computeIRR(cashFlowStream);

  const totalDistributions =
    rows.slice(1).reduce((sum, r) => sum + r.buyerCashFlow, 0) + exitEquityProceeds;
  const moic = computeMOIC(args.initialEquityAtRisk, totalDistributions);

  return {
    label: args.label,
    rows,
    exitEnterpriseValue: exitEV,
    exitDebtPayoff,
    exitGrossEquityProceeds,
    exitCapitalGainsTax,
    exitEquityProceeds,
    totalEquityIn: args.initialEquityAtRisk,
    totalDistributions,
    irr,
    moic,
    rationale: args.rationale,
  };
}

// ─── Sensitivity grid ───────────────────────────────────────────────────────

function buildSensitivityGrid(args: {
  startRevenue: number;
  startMargin: number;
  startDebtBalance: number;
  annualDebtService: number;
  holdYears: number;
  marginDriftBase: number;
  baseExitMultiple: number;
  baseGrowth: number;
  exitTransactionCostsPct: number;
  initialEquityAtRisk: number;
  industryCapexPct: number;
  industryWcPct: number;
  taxRate: number;
  capitalGainsTaxRate: number;
  blendedDebtRate: number;
  debtTermYears: number;
}): SensitivityGrid {
  const exitMultiples = [
    args.baseExitMultiple * 0.7,
    args.baseExitMultiple * 0.85,
    args.baseExitMultiple,
    args.baseExitMultiple * 1.15,
    args.baseExitMultiple * 1.3,
  ];
  const revenueGrowths = [
    args.baseGrowth - 0.04,
    args.baseGrowth - 0.02,
    args.baseGrowth,
    args.baseGrowth + 0.02,
    args.baseGrowth + 0.04,
  ];
  const cells: SensitivityCell[][] = exitMultiples.map((m) =>
    revenueGrowths.map((g) => {
      const scen = projectScenario({
        label: "Base",
        startRevenue: args.startRevenue,
        startMargin: args.startMargin,
        growth: g,
        marginDrift: args.marginDriftBase,
        startDebtBalance: args.startDebtBalance,
        annualDebtService: args.annualDebtService,
        holdYears: args.holdYears,
        exitMultiple: m,
        exitTransactionCostsPct: args.exitTransactionCostsPct,
        initialEquityAtRisk: args.initialEquityAtRisk,
        industryCapexPct: args.industryCapexPct,
        industryWcPct: args.industryWcPct,
        taxRate: args.taxRate,
        capitalGainsTaxRate: args.capitalGainsTaxRate,
        blendedDebtRate: args.blendedDebtRate,
        debtTermYears: args.debtTermYears,
        rationale: "Sensitivity cell",
      });
      return { exitMultiple: m, revenueGrowth: g, irr: scen.irr };
    }),
  );
  return { exitMultiples, revenueGrowths, cells };
}

// ─── Entry point ────────────────────────────────────────────────────────────

export function computePEReturns(
  input: DealInput,
  a: DealAnalysis,
  overrides?: Partial<ProjectionAssumptions>,
): PEReturnsResult {
  const revenue = input.annualRevenue ?? null;
  const ebitda = input.annualEBITDA ?? input.annualSDE ?? null;
  const purchasePrice = a.capitalStack.purchasePriceUsed;
  const buyerEquityTranche = a.capitalStack.buyerEquity.amount ?? null;
  const annualDebtService = a.capitalStack.totalAnnualDebtService;
  const sbaBalance = a.capitalStack.sba.amount ?? 0;
  const sellerBalance = a.capitalStack.sellerNote.amount ?? 0;
  const startDebtBalance = sbaBalance + sellerBalance;

  const curve = curveFor(input.industry);
  const industryDefault = input.industry ? getIndustryDefault(input.industry) : null;
  const industryCapexPct = industryDefault?.capExPct ?? 0.025;
  const industryWcPct = industryDefault?.wcPct ?? 0.05;

  // Entry multiple is the deal's actual entry multiple
  const entryMultiple =
    a.valuation.comparisonMultiple?.value && Number.isFinite(a.valuation.comparisonMultiple.value)
      ? (a.valuation.comparisonMultiple.value as number)
      : 4.5;

  // Closing-cost reserve. The cash-on-cash denominator already counts:
  //   legal + QoE + lender fees ≈ 7% of price
  // We additionally model a 3-month post-close operating runway so the buyer
  //   can absorb working-capital swings before the business stabilises.
  // The TOTAL closingCostsPct surfaced in assumptions includes both pieces.
  const baseClosingPct = a.assumptions.closingCostsPct ?? 0.07;
  const closingFees =
    isFiniteNumber(purchasePrice) && purchasePrice! > 0
      ? Math.round(purchasePrice! * baseClosingPct)
      : 0;
  // Operating runway reserve = 3 months of revenue × industry WC pct
  // (proxy for the cash float a small business needs).
  const runwayMonths = 3;
  const monthlyRevenue = isFiniteNumber(revenue) && revenue! > 0 ? revenue! / 12 : 0;
  const runwayReserve = Math.round(monthlyRevenue * runwayMonths * industryWcPct);
  const closingCostsReserve = closingFees + runwayReserve;
  // Surface the effective closing cost % (fees + runway) for the assumption banner.
  const closingCostsPct =
    isFiniteNumber(purchasePrice) && purchasePrice! > 0
      ? closingCostsReserve / purchasePrice!
      : baseClosingPct;

  // Initial equity-at-risk = buyer equity tranche + closing fees + runway reserve.
  // This is the SAME denominator used in cash-on-cash. Without runway the IRR
  // explodes because we'd be dividing by only the 10% buyer equity slice plus a
  // skinny closing reserve.
  const initialEquityAtRisk =
    isFiniteNumber(buyerEquityTranche) && buyerEquityTranche! > 0
      ? buyerEquityTranche! + closingCostsReserve
      : 0;

  const assumptions: ProjectionAssumptions = {
    holdYears: overrides?.holdYears ?? 5,
    revenueGrowthBear: overrides?.revenueGrowthBear ?? curve.growth.bear,
    revenueGrowthBase: overrides?.revenueGrowthBase ?? curve.growth.base,
    revenueGrowthBull: overrides?.revenueGrowthBull ?? curve.growth.bull,
    marginDriftBear: overrides?.marginDriftBear ?? curve.marginDrift.bear,
    marginDriftBase: overrides?.marginDriftBase ?? curve.marginDrift.base,
    marginDriftBull: overrides?.marginDriftBull ?? curve.marginDrift.bull,
    // Entry-anchored exit multiples × {0.85, 1.00, 1.15} per brief.
    exitMultipleBear: overrides?.exitMultipleBear ?? entryMultiple * 0.85,
    exitMultipleBase: overrides?.exitMultipleBase ?? entryMultiple * 1.0,
    exitMultipleBull: overrides?.exitMultipleBull ?? entryMultiple * 1.15,
    exitTransactionCostsPct: overrides?.exitTransactionCostsPct ?? 0.03,
    taxRate: overrides?.taxRate ?? 0.27,
    capitalGainsTaxRate: overrides?.capitalGainsTaxRate ?? 0.24,
    industryCapexPct: overrides?.industryCapexPct ?? industryCapexPct,
    industryWcPct: overrides?.industryWcPct ?? industryWcPct,
    closingCostsPct,
    entryMultiple,
    initialEquityAtRisk,
  };

  if (
    !isFiniteNumber(revenue) ||
    !isFiniteNumber(ebitda) ||
    !isFiniteNumber(purchasePrice) ||
    !isFiniteNumber(buyerEquityTranche) ||
    !isFiniteNumber(annualDebtService) ||
    initialEquityAtRisk <= 0
  ) {
    return {
      available: false,
      reason:
        "Returns projection requires revenue, EBITDA (or SDE), purchase price, buyer equity, and debt service to be present.",
      assumptions,
      bear: emptyScenario("Bear"),
      base: emptyScenario("Base"),
      bull: emptyScenario("Bull"),
      sensitivity: { exitMultiples: [], revenueGrowths: [], cells: [] },
    };
  }

  const startMargin = ebitda! / revenue!;

  // Weighted-average debt rate + term used for level-payment amortization.
  const sbaWeight = sbaBalance / Math.max(1, startDebtBalance);
  const sellerWeight = sellerBalance / Math.max(1, startDebtBalance);
  const blendedDebtRate =
    sbaWeight * a.assumptions.sbaInterestRate +
    sellerWeight * a.assumptions.sellerNoteRate;
  const debtTermYears =
    sbaWeight * a.assumptions.sbaTermYears +
    sellerWeight * a.assumptions.sellerNoteTermYears;

  const common = {
    startRevenue: revenue!,
    startMargin,
    startDebtBalance,
    annualDebtService: annualDebtService!,
    holdYears: assumptions.holdYears,
    exitTransactionCostsPct: assumptions.exitTransactionCostsPct,
    initialEquityAtRisk,
    industryCapexPct: assumptions.industryCapexPct,
    industryWcPct: assumptions.industryWcPct,
    taxRate: assumptions.taxRate,
    capitalGainsTaxRate: assumptions.capitalGainsTaxRate,
    blendedDebtRate,
    debtTermYears,
  };

  const bear = projectScenario({
    ...common,
    label: "Bear",
    growth: assumptions.revenueGrowthBear,
    marginDrift: assumptions.marginDriftBear,
    exitMultiple: assumptions.exitMultipleBear,
    rationale: `Bear: revenue ${(assumptions.revenueGrowthBear * 100).toFixed(1)}%/yr, margin drift ${(assumptions.marginDriftBear * 100).toFixed(1)}pp/yr, exit ${assumptions.exitMultipleBear.toFixed(2)}x (entry × 0.85).`,
  });
  const base = projectScenario({
    ...common,
    label: "Base",
    growth: assumptions.revenueGrowthBase,
    marginDrift: assumptions.marginDriftBase,
    exitMultiple: assumptions.exitMultipleBase,
    rationale: `Base: revenue ${(assumptions.revenueGrowthBase * 100).toFixed(1)}%/yr, margin drift ${(assumptions.marginDriftBase * 100).toFixed(1)}pp/yr, exit ${assumptions.exitMultipleBase.toFixed(2)}x (entry × 1.00).`,
  });
  const bull = projectScenario({
    ...common,
    label: "Bull",
    growth: assumptions.revenueGrowthBull,
    marginDrift: assumptions.marginDriftBull,
    exitMultiple: assumptions.exitMultipleBull,
    rationale: `Bull: revenue ${(assumptions.revenueGrowthBull * 100).toFixed(1)}%/yr, margin drift ${(assumptions.marginDriftBull * 100).toFixed(1)}pp/yr, exit ${assumptions.exitMultipleBull.toFixed(2)}x (entry × 1.15).`,
  });

  const sensitivity = buildSensitivityGrid({
    startRevenue: revenue!,
    startMargin,
    startDebtBalance,
    annualDebtService: annualDebtService!,
    holdYears: assumptions.holdYears,
    marginDriftBase: assumptions.marginDriftBase,
    baseExitMultiple: assumptions.exitMultipleBase,
    baseGrowth: assumptions.revenueGrowthBase,
    exitTransactionCostsPct: assumptions.exitTransactionCostsPct,
    initialEquityAtRisk,
    industryCapexPct: assumptions.industryCapexPct,
    industryWcPct: assumptions.industryWcPct,
    taxRate: assumptions.taxRate,
    capitalGainsTaxRate: assumptions.capitalGainsTaxRate,
    blendedDebtRate,
    debtTermYears,
  });

  return {
    available: true,
    assumptions,
    bear,
    base,
    bull,
    sensitivity,
  };
}

function emptyScenario(label: "Bear" | "Base" | "Bull"): ScenarioProjection {
  return {
    label,
    rows: [],
    exitEnterpriseValue: 0,
    exitDebtPayoff: 0,
    exitGrossEquityProceeds: 0,
    exitCapitalGainsTax: 0,
    exitEquityProceeds: 0,
    totalEquityIn: 0,
    totalDistributions: 0,
    irr: null,
    moic: null,
    rationale: "Projection unavailable — missing inputs.",
  };
}
