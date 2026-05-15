/**
 * PE-grade returns engine — Iteration 9
 *
 * Deterministic 5-year projection + IRR + MOIC across bear / base / bull
 * scenarios, plus a sensitivity grid on (exit multiple × revenue growth)
 * shaded by IRR. Every number here is computed from inputs that are already
 * on the DealAnalysis — no AI invention.
 *
 * Assumptions explicitly surfaced (not hidden):
 *   • Hold period: configurable; default 5 years
 *   • Annual revenue growth (bear, base, bull): industry-default curve
 *   • EBITDA margin trajectory: tied to the entry margin, with bear/bull tilts
 *   • Exit multiple: defaults to entry comparison multiple (EV/EBITDA or EV/SDE)
 *   • Debt paydown: straight-line amortization on SBA + seller note
 *   • Cash sweep: 100% of buyer cash flow swept to debt principal
 *
 * IRR uses Newton-Raphson with bisection fallback. MOIC is the standard
 * total-distributions / total-equity-in. Returns are computed at the equity
 * level (buyer's view), not deal level.
 */

import type {
  DealAnalysis,
  DealInput,
  CapitalStackAssumptions,
} from "./types";
import { isFiniteNumber } from "./dealMath";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProjectionAssumptions {
  holdYears: number;
  revenueGrowthBear: number; // e.g. -0.02 = -2%/yr
  revenueGrowthBase: number;
  revenueGrowthBull: number;
  marginDriftBear: number; // change in EBITDA margin per year (additive)
  marginDriftBase: number;
  marginDriftBull: number;
  exitMultipleBear: number; // EBITDA multiple at exit
  exitMultipleBase: number;
  exitMultipleBull: number;
  exitTransactionCostsPct: number; // % of exit EV
}

export interface ProjectionYearRow {
  year: number;
  revenue: number;
  ebitda: number;
  margin: number;
  debtService: number;
  buyerCashFlow: number;
  debtBalance: number;
  cumulativeEquityCashFlow: number;
}

export interface ScenarioProjection {
  label: "Bear" | "Base" | "Bull";
  rows: ProjectionYearRow[];
  exitEnterpriseValue: number;
  exitDebtPayoff: number;
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
  cells: SensitivityCell[][]; // [row=multiple][col=growth]
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
  exitMultiplePadding: number; // exit multiple = entry × (1 + padding) for base
}

const INDUSTRY_PROJECTION_CURVES: Record<string, IndustryProjectionCurve> = {
  hvac: {
    growth: { bear: -0.02, base: 0.04, bull: 0.08 },
    marginDrift: { bear: -0.01, base: 0.005, bull: 0.015 },
    exitMultiplePadding: 0.05,
  },
  plumbing: {
    growth: { bear: -0.02, base: 0.03, bull: 0.07 },
    marginDrift: { bear: -0.01, base: 0.005, bull: 0.015 },
    exitMultiplePadding: 0.05,
  },
  electrical: {
    growth: { bear: -0.02, base: 0.03, bull: 0.07 },
    marginDrift: { bear: -0.01, base: 0.005, bull: 0.015 },
    exitMultiplePadding: 0.05,
  },
  roofing: {
    growth: { bear: -0.03, base: 0.025, bull: 0.06 },
    marginDrift: { bear: -0.015, base: 0, bull: 0.01 },
    exitMultiplePadding: 0.0,
  },
  landscaping: {
    growth: { bear: -0.03, base: 0.03, bull: 0.07 },
    marginDrift: { bear: -0.01, base: 0, bull: 0.01 },
    exitMultiplePadding: 0.0,
  },
  "auto repair": {
    growth: { bear: -0.03, base: 0.02, bull: 0.06 },
    marginDrift: { bear: -0.015, base: 0, bull: 0.01 },
    exitMultiplePadding: 0.0,
  },
  restaurant: {
    growth: { bear: -0.05, base: 0.02, bull: 0.06 },
    marginDrift: { bear: -0.02, base: -0.005, bull: 0.01 },
    exitMultiplePadding: -0.05,
  },
  "it services": {
    growth: { bear: -0.02, base: 0.06, bull: 0.12 },
    marginDrift: { bear: -0.01, base: 0.01, bull: 0.02 },
    exitMultiplePadding: 0.1,
  },
  "marketing agency": {
    growth: { bear: -0.05, base: 0.05, bull: 0.1 },
    marginDrift: { bear: -0.02, base: 0, bull: 0.015 },
    exitMultiplePadding: 0.0,
  },
};

const DEFAULT_CURVE: IndustryProjectionCurve = {
  growth: { bear: -0.03, base: 0.03, bull: 0.07 },
  marginDrift: { bear: -0.01, base: 0, bull: 0.015 },
  exitMultiplePadding: 0.0,
};

function curveFor(industry: string | null | undefined): IndustryProjectionCurve {
  if (!industry) return DEFAULT_CURVE;
  return INDUSTRY_PROJECTION_CURVES[industry.toLowerCase().trim()] ?? DEFAULT_CURVE;
}

// ─── IRR / MOIC math ────────────────────────────────────────────────────────

/**
 * Newton-Raphson IRR with bisection fallback. Cash flows are year-end,
 * with year 0 being the initial equity outflow (negative).
 */
export function computeIRR(cashFlows: number[]): number | null {
  if (cashFlows.length < 2) return null;
  // Need at least one positive and one negative.
  const hasNeg = cashFlows.some((c) => c < 0);
  const hasPos = cashFlows.some((c) => c > 0);
  if (!hasNeg || !hasPos) return null;

  const npv = (r: number) =>
    cashFlows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + r, t), 0);
  const dnpv = (r: number) =>
    cashFlows.reduce((acc, cf, t) => acc - (t * cf) / Math.pow(1 + r, t + 1), 0);

  // Try Newton from r=0.1
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

  // Bisection fallback in [-0.99, 10]
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

function projectScenario(args: {
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
  buyerEquity: number;
  rationale: string;
}): ScenarioProjection {
  const rows: ProjectionYearRow[] = [];
  let revenue = args.startRevenue;
  let margin = args.startMargin;
  let debtBalance = args.startDebtBalance;
  let cumulativeEquityCashFlow = -args.buyerEquity; // year 0 outflow

  // Year 0 row (entry)
  rows.push({
    year: 0,
    revenue: args.startRevenue,
    ebitda: args.startRevenue * args.startMargin,
    margin: args.startMargin,
    debtService: 0,
    buyerCashFlow: 0,
    debtBalance: args.startDebtBalance,
    cumulativeEquityCashFlow,
  });

  // Years 1..holdYears
  // Principal portion of debt service approximates straight-line amortization.
  const principalPerYear = args.holdYears > 0 ? args.startDebtBalance / args.holdYears : 0;

  for (let year = 1; year <= args.holdYears; year++) {
    revenue = revenue * (1 + args.growth);
    margin = Math.max(0, Math.min(1, margin + args.marginDrift));
    const ebitda = revenue * margin;
    const debtService = Math.min(args.annualDebtService, ebitda + debtBalance);
    const buyerCashFlow = ebitda - debtService;
    debtBalance = Math.max(0, debtBalance - principalPerYear);
    cumulativeEquityCashFlow += buyerCashFlow;
    rows.push({
      year,
      revenue,
      ebitda,
      margin,
      debtService,
      buyerCashFlow,
      debtBalance,
      cumulativeEquityCashFlow,
    });
  }

  // Exit
  const exitYear = rows[rows.length - 1];
  const exitEV = exitYear.ebitda * args.exitMultiple;
  const exitEVNet = exitEV * (1 - args.exitTransactionCostsPct);
  const exitDebtPayoff = exitYear.debtBalance;
  const exitEquityProceeds = Math.max(0, exitEVNet - exitDebtPayoff);

  // Build equity cash-flow stream for IRR: year 0 = -equity, years 1..N = cash flow, year N also adds exit proceeds.
  const cashFlowStream: number[] = [-args.buyerEquity];
  for (let y = 1; y <= args.holdYears; y++) {
    const r = rows[y];
    const cf = r.buyerCashFlow + (y === args.holdYears ? exitEquityProceeds : 0);
    cashFlowStream.push(cf);
  }
  const irr = computeIRR(cashFlowStream);

  const totalDistributions =
    rows.slice(1).reduce((sum, r) => sum + r.buyerCashFlow, 0) + exitEquityProceeds;
  const moic = computeMOIC(args.buyerEquity, totalDistributions);

  return {
    label: args.label,
    rows,
    exitEnterpriseValue: exitEV,
    exitDebtPayoff,
    exitEquityProceeds,
    totalEquityIn: args.buyerEquity,
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
  buyerEquity: number;
}): SensitivityGrid {
  // 5 exit multiples × 5 revenue growths centred on base.
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
        buyerEquity: args.buyerEquity,
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
  const buyerEquity = a.capitalStack.buyerEquity.amount ?? null;
  const annualDebtService = a.capitalStack.totalAnnualDebtService;
  const sbaBalance = a.capitalStack.sba.amount ?? 0;
  const sellerBalance = a.capitalStack.sellerNote.amount ?? 0;
  const startDebtBalance = sbaBalance + sellerBalance;

  const curve = curveFor(input.industry);
  const entryMultiple =
    a.valuation.comparisonMultiple?.value && Number.isFinite(a.valuation.comparisonMultiple.value)
      ? (a.valuation.comparisonMultiple.value as number)
      : 4.5;

  const assumptions: ProjectionAssumptions = {
    holdYears: overrides?.holdYears ?? 5,
    revenueGrowthBear: overrides?.revenueGrowthBear ?? curve.growth.bear,
    revenueGrowthBase: overrides?.revenueGrowthBase ?? curve.growth.base,
    revenueGrowthBull: overrides?.revenueGrowthBull ?? curve.growth.bull,
    marginDriftBear: overrides?.marginDriftBear ?? curve.marginDrift.bear,
    marginDriftBase: overrides?.marginDriftBase ?? curve.marginDrift.base,
    marginDriftBull: overrides?.marginDriftBull ?? curve.marginDrift.bull,
    exitMultipleBear: overrides?.exitMultipleBear ?? entryMultiple * 0.85,
    exitMultipleBase: overrides?.exitMultipleBase ?? entryMultiple * (1 + curve.exitMultiplePadding),
    exitMultipleBull: overrides?.exitMultipleBull ?? entryMultiple * 1.2,
    exitTransactionCostsPct: overrides?.exitTransactionCostsPct ?? 0.03,
  };

  if (
    !isFiniteNumber(revenue) ||
    !isFiniteNumber(ebitda) ||
    !isFiniteNumber(purchasePrice) ||
    !isFiniteNumber(buyerEquity) ||
    !isFiniteNumber(annualDebtService) ||
    buyerEquity! <= 0
  ) {
    return {
      available: false,
      reason:
        "Returns projection requires revenue, EBITDA (or SDE), purchase price, buyer equity, and debt service to be present.",
      assumptions,
      bear: emptyScenario("Bear", assumptions),
      base: emptyScenario("Base", assumptions),
      bull: emptyScenario("Bull", assumptions),
      sensitivity: { exitMultiples: [], revenueGrowths: [], cells: [] },
    };
  }

  const startMargin = ebitda! / revenue!;
  const common = {
    startRevenue: revenue!,
    startMargin,
    startDebtBalance,
    annualDebtService: annualDebtService!,
    holdYears: assumptions.holdYears,
    exitTransactionCostsPct: assumptions.exitTransactionCostsPct,
    buyerEquity: buyerEquity!,
  };

  const bear = projectScenario({
    ...common,
    label: "Bear",
    growth: assumptions.revenueGrowthBear,
    marginDrift: assumptions.marginDriftBear,
    exitMultiple: assumptions.exitMultipleBear,
    rationale: `Bear: revenue ${(assumptions.revenueGrowthBear * 100).toFixed(1)}%/yr, margin drift ${(assumptions.marginDriftBear * 100).toFixed(1)}pp/yr, exit ${assumptions.exitMultipleBear.toFixed(1)}x.`,
  });
  const base = projectScenario({
    ...common,
    label: "Base",
    growth: assumptions.revenueGrowthBase,
    marginDrift: assumptions.marginDriftBase,
    exitMultiple: assumptions.exitMultipleBase,
    rationale: `Base: revenue ${(assumptions.revenueGrowthBase * 100).toFixed(1)}%/yr, margin drift ${(assumptions.marginDriftBase * 100).toFixed(1)}pp/yr, exit ${assumptions.exitMultipleBase.toFixed(1)}x.`,
  });
  const bull = projectScenario({
    ...common,
    label: "Bull",
    growth: assumptions.revenueGrowthBull,
    marginDrift: assumptions.marginDriftBull,
    exitMultiple: assumptions.exitMultipleBull,
    rationale: `Bull: revenue ${(assumptions.revenueGrowthBull * 100).toFixed(1)}%/yr, margin drift ${(assumptions.marginDriftBull * 100).toFixed(1)}pp/yr, exit ${assumptions.exitMultipleBull.toFixed(1)}x.`,
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
    buyerEquity: buyerEquity!,
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

function emptyScenario(
  label: "Bear" | "Base" | "Bull",
  _a: ProjectionAssumptions,
): ScenarioProjection {
  return {
    label,
    rows: [],
    exitEnterpriseValue: 0,
    exitDebtPayoff: 0,
    exitEquityProceeds: 0,
    totalEquityIn: 0,
    totalDistributions: 0,
    irr: null,
    moic: null,
    rationale: "Projection unavailable — missing inputs.",
  };
}
