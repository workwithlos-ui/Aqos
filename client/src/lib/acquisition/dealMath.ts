// Acquisition OS deterministic math layer.
//
// Every public helper here either returns a real, finite number or a
// MetricResult flagged as `missing` / `invalid`. Nothing in this file is
// allowed to fall back to a default value when an input is missing.

import type {
  DealInput,
  EarningsBasis,
  MetricResult,
  CapitalStackAssumptions,
  CapitalStackResult,
} from "./types";

const ZERO_TOLERANCE = 1; // dollars

export const DEFAULT_ASSUMPTIONS: CapitalStackAssumptions = {
  sbaLoanPct: 0.75,
  sbaInterestRate: 0.105,
  sbaTermYears: 10,
  sellerNotePct: 0.15,
  sellerNoteRate: 0.06,
  sellerNoteTermYears: 5,
  sellerNoteStandbyMonths: 24,
  buyerEquityPct: 0.1,
  buyerDscrTarget: 1.5,
};

// ─── Pure helpers ────────────────────────────────────────────────────────────

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function toMoney(value: number | null | undefined): number | null {
  if (!isFiniteNumber(value)) return null;
  return Math.round(value * 100) / 100;
}

export function fmtCurrency(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function fmtCurrencyExact(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return "—";
  return `$${Math.round(value).toLocaleString()}`;
}

export function fmtPct(value: number | null | undefined, digits = 1): string {
  if (!isFiniteNumber(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function fmtMultiple(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return "—";
  return `${value.toFixed(2)}x`;
}

// ─── Earnings & purchase price selection ─────────────────────────────────────

export function selectEarnings(input: DealInput): {
  basis: EarningsBasis;
  value: number | null;
} {
  // EBITDA wins over SDE when both are provided. Spec lists EBITDA first.
  if (isFiniteNumber(input.annualEBITDA)) {
    return { basis: "EBITDA", value: input.annualEBITDA };
  }
  if (isFiniteNumber(input.annualSDE)) {
    return { basis: "SDE", value: input.annualSDE };
  }
  return { basis: "missing", value: null };
}

export function selectPurchasePrice(input: DealInput): {
  source: "purchasePrice" | "askingPrice" | "missing";
  value: number | null;
} {
  if (isFiniteNumber(input.purchasePrice) && input.purchasePrice > 0) {
    return { source: "purchasePrice", value: input.purchasePrice };
  }
  if (isFiniteNumber(input.askingPrice) && input.askingPrice > 0) {
    return { source: "askingPrice", value: input.askingPrice };
  }
  return { source: "missing", value: null };
}

// ─── Margin & multiple metrics ───────────────────────────────────────────────

function missingMetric(formula: string, inputs: Record<string, number | null | string>): MetricResult {
  return { value: null, display: "missing", status: "missing", formula, inputs };
}

function invalidMetric(
  formula: string,
  inputs: Record<string, number | null | string>,
  warning: string,
): MetricResult {
  return {
    value: null,
    display: "invalid",
    status: "invalid",
    formula,
    inputs,
    warning,
  };
}

export function ebitdaMargin(input: DealInput): MetricResult {
  const formula = "EBITDA / Revenue";
  const inputs = { Revenue: input.annualRevenue ?? null, EBITDA: input.annualEBITDA ?? null };
  if (!isFiniteNumber(input.annualEBITDA)) return missingMetric(formula, inputs);
  if (!isFiniteNumber(input.annualRevenue))
    return missingMetric(formula, inputs);
  if (input.annualRevenue <= 0)
    return invalidMetric(formula, inputs, "Revenue is zero or negative.");
  const value = input.annualEBITDA / input.annualRevenue;
  return {
    value,
    display: fmtPct(value),
    status: "actual",
    formula,
    inputs,
  };
}

export function sdeMargin(input: DealInput): MetricResult {
  const formula = "SDE / Revenue";
  const inputs = { Revenue: input.annualRevenue ?? null, SDE: input.annualSDE ?? null };
  if (!isFiniteNumber(input.annualSDE)) return missingMetric(formula, inputs);
  if (!isFiniteNumber(input.annualRevenue))
    return missingMetric(formula, inputs);
  if (input.annualRevenue <= 0)
    return invalidMetric(formula, inputs, "Revenue is zero or negative.");
  const value = input.annualSDE / input.annualRevenue;
  return {
    value,
    display: fmtPct(value),
    status: "actual",
    formula,
    inputs,
  };
}

export function evToEBITDA(input: DealInput): MetricResult {
  const formula = "Purchase Price (or Asking Price) / EBITDA";
  const price = selectPurchasePrice(input);
  const inputs = {
    PurchasePriceUsed: price.value ?? null,
    PriceSource: price.source,
    EBITDA: input.annualEBITDA ?? null,
  };
  if (price.value === null) return missingMetric(formula, inputs);
  if (!isFiniteNumber(input.annualEBITDA)) return missingMetric(formula, inputs);
  if (input.annualEBITDA <= 0)
    return invalidMetric(formula, inputs, "EBITDA is zero or negative — multiple undefined.");
  const value = price.value / input.annualEBITDA;
  return { value, display: fmtMultiple(value), status: "actual", formula, inputs };
}

export function evToSDE(input: DealInput): MetricResult {
  const formula = "Purchase Price (or Asking Price) / SDE";
  const price = selectPurchasePrice(input);
  const inputs = {
    PurchasePriceUsed: price.value ?? null,
    PriceSource: price.source,
    SDE: input.annualSDE ?? null,
  };
  if (price.value === null) return missingMetric(formula, inputs);
  if (!isFiniteNumber(input.annualSDE)) return missingMetric(formula, inputs);
  if (input.annualSDE <= 0)
    return invalidMetric(formula, inputs, "SDE is zero or negative — multiple undefined.");
  const value = price.value / input.annualSDE;
  return { value, display: fmtMultiple(value), status: "actual", formula, inputs };
}

// ─── Capital stack engine ────────────────────────────────────────────────────

/** Amortized annual debt service. Returns null on bad inputs. */
export function annualDebtService(
  principal: number | null,
  annualRate: number | null,
  termYears: number | null,
): number | null {
  if (!isFiniteNumber(principal) || principal <= 0) return null;
  if (!isFiniteNumber(termYears) || termYears <= 0) return null;
  if (!isFiniteNumber(annualRate) || annualRate < 0) return null;
  // Zero interest → straight-line.
  if (annualRate === 0) {
    return principal / termYears;
  }
  const r = annualRate / 12;
  const n = termYears * 12;
  const monthly = (principal * r) / (1 - Math.pow(1 + r, -n));
  if (!isFiniteNumber(monthly)) return null;
  return monthly * 12;
}

export function monthlyPayment(annualPay: number | null): number | null {
  if (!isFiniteNumber(annualPay)) return null;
  return annualPay / 12;
}

export function validateAssumptions(a: CapitalStackAssumptions): {
  valid: boolean;
  total: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  const total = a.sbaLoanPct + a.sellerNotePct + a.buyerEquityPct;
  const rounded = Math.round(total * 1000) / 1000;
  const valid = Math.abs(rounded - 1) < 1e-6;
  if (!valid) {
    warnings.push(
      `Capital stack percentages must total 100%. Current total: ${(total * 100).toFixed(2)}%.`,
    );
  }
  if (a.sbaInterestRate < 0 || a.sbaInterestRate > 0.5)
    warnings.push("SBA interest rate appears outside plausible 0–50% range.");
  if (a.sellerNoteRate < 0 || a.sellerNoteRate > 0.5)
    warnings.push("Seller note rate appears outside plausible 0–50% range.");
  if (a.sbaTermYears <= 0 || a.sbaTermYears > 30)
    warnings.push("SBA term must be between 1 and 30 years.");
  if (a.sellerNoteTermYears <= 0 || a.sellerNoteTermYears > 15)
    warnings.push("Seller note term must be between 1 and 15 years.");
  return { valid, total, warnings };
}

export function buildCapitalStack(
  input: DealInput,
  assumptions: CapitalStackAssumptions,
): CapitalStackResult {
  const price = selectPurchasePrice(input);
  const a = assumptions;
  const validation = validateAssumptions(a);

  const sbaAmount = price.value !== null ? price.value * a.sbaLoanPct : null;
  const sellerNoteAmount = price.value !== null ? price.value * a.sellerNotePct : null;
  const buyerEquityAmount = price.value !== null ? price.value * a.buyerEquityPct : null;

  const sbaDS = annualDebtService(sbaAmount, a.sbaInterestRate, a.sbaTermYears);
  const sellerNoteDS = annualDebtService(
    sellerNoteAmount,
    a.sellerNoteRate,
    a.sellerNoteTermYears,
  );

  const totalSources =
    sbaAmount !== null && sellerNoteAmount !== null && buyerEquityAmount !== null
      ? sbaAmount + sellerNoteAmount + buyerEquityAmount
      : null;

  const diff =
    totalSources !== null && price.value !== null
      ? totalSources - price.value
      : null;

  const standbyActive = a.sellerNoteStandbyMonths > 0;

  const totalAnnual =
    sbaDS !== null
      ? (sellerNoteDS !== null ? sbaDS + sellerNoteDS : sbaDS)
      : null;

  const totalAnnualDuringStandby =
    sbaDS !== null ? sbaDS : null;

  // Status: invalid if assumptions fail, missing if price missing.
  let status: CapitalStackResult["status"] = "actual";
  if (!validation.valid) status = "invalid";
  else if (price.value === null) status = "missing";

  return {
    status,
    purchasePriceUsed: price.value,
    purchasePriceSource: price.source,
    components: [
      { label: "SBA Loan", pct: a.sbaLoanPct, amount: sbaAmount },
      { label: "Seller Note", pct: a.sellerNotePct, amount: sellerNoteAmount },
      { label: "Buyer Equity", pct: a.buyerEquityPct, amount: buyerEquityAmount },
    ],
    totalSources,
    differenceVsPurchasePrice:
      diff !== null && Math.abs(diff) < ZERO_TOLERANCE ? 0 : diff,
    pctTotal: validation.total,
    pctValid: validation.valid,
    sba: {
      amount: sbaAmount,
      annualDebtService: sbaDS,
      monthlyPayment: monthlyPayment(sbaDS),
      rate: a.sbaInterestRate,
      termYears: a.sbaTermYears,
    },
    sellerNote: {
      amount: sellerNoteAmount,
      annualDebtService: sellerNoteDS,
      monthlyPayment: monthlyPayment(sellerNoteDS),
      rate: a.sellerNoteRate,
      termYears: a.sellerNoteTermYears,
      standbyMonths: a.sellerNoteStandbyMonths,
      standbyActive,
    },
    buyerEquity: {
      amount: buyerEquityAmount,
      pct: a.buyerEquityPct,
    },
    totalAnnualDebtService: totalAnnual,
    totalAnnualDebtServiceDuringStandby: totalAnnualDuringStandby,
    warnings: validation.warnings,
  };
}

// ─── DSCR ────────────────────────────────────────────────────────────────────

export function dscrFromEarnings(
  earnings: number | null,
  debtService: number | null,
): MetricResult {
  const formula = "Earnings (EBITDA or SDE) / Total Annual Debt Service";
  const inputs = { Earnings: earnings, AnnualDebtService: debtService };
  if (!isFiniteNumber(earnings)) return missingMetric(formula, inputs);
  if (!isFiniteNumber(debtService)) return missingMetric(formula, inputs);
  if (debtService <= 0)
    return invalidMetric(formula, inputs, "Annual debt service is zero — DSCR undefined.");
  if (earnings <= 0)
    return invalidMetric(formula, inputs, "Earnings are zero or negative — DSCR cannot be calculated.");
  const value = earnings / debtService;
  return {
    value,
    display: fmtMultiple(value),
    status: "actual",
    formula,
    inputs,
  };
}

export function dscrVerdict(value: number | null): {
  label: "Strong" | "Acceptable" | "Risky" | "Fail" | "Missing";
  color: "emerald" | "amber" | "orange" | "red" | "slate";
} {
  if (!isFiniteNumber(value)) return { label: "Missing", color: "slate" };
  if (value >= 1.5) return { label: "Strong", color: "emerald" };
  if (value >= 1.25) return { label: "Acceptable", color: "amber" };
  if (value >= 1.0) return { label: "Risky", color: "orange" };
  return { label: "Fail", color: "red" };
}
