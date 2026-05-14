import type {
  DealInput,
  WorkingCapitalResult,
} from "./types";
import { imputeWorkingCapitalDefaults, getIndustryDefault } from "./industryDefaults";

/**
 * Score the working capital inputs against the deal context.
 *
 * Critical contract: `workingCapital.workingCapitalPeg` is a **percentage**
 * (e.g. 7 means 7% of annual revenue). The engine multiplies that percentage
 * by annual revenue to produce a dollar peg. Earlier versions treated it as a
 * dollar amount, which caused the `$7` rendering bug on the Live Engine Output
 * panel.
 *
 * CapEx and WC reserve defaults are imputed industry-time (driven by
 * `industryDefaults.ts`) the moment the buyer selects an industry on the
 * Analyzer — this function uses the same defaults as the fallback when the
 * buyer has not entered explicit values yet.
 */
export function scoreWorkingCapital(input: DealInput): WorkingCapitalResult {
  const wc = input.workingCapital ?? {};

  const ar = wc.arBalance ?? null;
  const ap = wc.apBalance ?? null;
  const inv = wc.inventoryBalance ?? null;
  const cash = wc.cashIncluded ?? null;
  const monthlyRev = wc.monthlyRevenue ?? null;
  const monthlyFC = wc.monthlyFixedCosts ?? null;
  const dso = wc.dso ?? null;
  const dpo = wc.dpo ?? null;
  const dio = wc.dio ?? null;
  const arOver90 = wc.arOver90Pct ?? null;
  const invOver90 = wc.inventoryOver90Pct ?? null;
  // workingCapitalPeg is a PERCENTAGE of annual revenue (e.g. 7 means 7%).
  const wcPegPct =
    typeof wc.workingCapitalPeg === "number" && Number.isFinite(wc.workingCapitalPeg)
      ? wc.workingCapitalPeg
      : null;
  const bufferMonths = wc.requiredLiquidityBufferMonths ?? null;
  const capEx = wc.capExNeedsAnnual ?? null;

  // Determine completeness
  const fieldsProvided = [ar, ap, inv, cash, monthlyRev, monthlyFC, dso, dpo, dio].filter(
    (f) => f !== null,
  ).length;
  const status =
    fieldsProvided >= 7 ? "complete" : fieldsProvided >= 4 ? "partial" : "missing";

  // Net working capital = AR + Inventory - AP
  const nwc =
    ar !== null && inv !== null && ap !== null ? ar + inv - ap : null;

  // Cash conversion cycle = DSO + DIO - DPO
  const ccc =
    dso !== null && dio !== null && dpo !== null ? dso + dio - dpo : null;

  // Imputed defaults — these fire industry-time on the Analyzer, but we
  // also fall back to them here in case the buyer never set explicit values.
  const annualRev = input.annualRevenue ?? null;
  const imputed = imputeWorkingCapitalDefaults({
    revenue: annualRev,
    industry: input.industry,
    currentCapEx: capEx,
    currentWcReserve: null,
    currentWcPegPct: wcPegPct,
  });

  // Estimated WC peg in DOLLARS.
  // Priority 1: user-entered % × revenue
  // Priority 2: industry-default % × revenue
  // Priority 3: 12% × revenue (legacy fallback)
  let estimatedPeg: number | null;
  if (wcPegPct !== null && annualRev) {
    estimatedPeg = Math.round(annualRev * (wcPegPct / 100));
  } else if (imputed.workingCapitalReserve !== null) {
    estimatedPeg = imputed.workingCapitalReserve;
  } else if (annualRev) {
    estimatedPeg = Math.round(annualRev * 0.12);
  } else {
    estimatedPeg = null;
  }

  // Liquidity buffer required (months × monthly fixed costs).  If not set,
  // fall back to estimated peg so DSCR still sees a working-capital reserve.
  const explicitBuffer =
    bufferMonths !== null && monthlyFC ? monthlyFC * bufferMonths : null;
  const liquidityBufferRequired =
    explicitBuffer ?? estimatedPeg ?? null;

  // Risk assessment
  let cashConversionRisk: WorkingCapitalResult["cashConversionRisk"] = "missing";
  if (ccc !== null) {
    if (ccc < 0) cashConversionRisk = "low";
    else if (ccc < 30) cashConversionRisk = "low";
    else if (ccc < 60) cashConversionRisk = "medium";
    else cashConversionRisk = "high";
  }

  let arOverdueRisk: WorkingCapitalResult["arOverdueRisk"] = "missing";
  if (arOver90 !== null) {
    if (arOver90 < 10) arOverdueRisk = "low";
    else if (arOver90 < 25) arOverdueRisk = "medium";
    else arOverdueRisk = "high";
  }

  let inventoryStaleRisk: WorkingCapitalResult["inventoryStaleRisk"] = "missing";
  if (invOver90 !== null) {
    if (invOver90 < 5) inventoryStaleRisk = "low";
    else if (invOver90 < 15) inventoryStaleRisk = "medium";
    else inventoryStaleRisk = "high";
  }

  let wcRisk: WorkingCapitalResult["workingCapitalRisk"] = "missing";
  if (status === "complete") {
    const riskCount = [
      cashConversionRisk === "high" ? 1 : 0,
      arOverdueRisk === "high" ? 1 : 0,
      inventoryStaleRisk === "high" ? 1 : 0,
    ].reduce((a, b) => a + b, 0);
    if (riskCount === 0) wcRisk = "low";
    else if (riskCount === 1) wcRisk = "medium";
    else wcRisk = "high";
  }

  // Closing adjustment
  const closingAdjustment =
    nwc !== null && estimatedPeg !== null ? nwc - estimatedPeg : null;

  // Buyer warnings
  const warnings: string[] = [];
  if (status === "missing") {
    warnings.push("Working capital data is missing — cannot assess cash needs.");
  }
  if (arOverdueRisk === "high") {
    warnings.push(`High AR over 90 days (${arOver90}%) — collection risk.`);
  }
  if (inventoryStaleRisk === "high") {
    warnings.push(
      `High inventory over 90 days (${invOver90}%) — obsolescence risk.`,
    );
  }
  if (ccc !== null && ccc > 60) {
    warnings.push(
      `Long cash conversion cycle (${ccc} days) — significant working capital investment required.`,
    );
  }
  if (capEx !== null && capEx > (annualRev ?? 0) * 0.1) {
    warnings.push(
      `Annual CapEx ($${(capEx / 1_000_000).toFixed(1)}M) is ${((capEx / (annualRev ?? 1)) * 100).toFixed(0)}% of revenue.`,
    );
  }

  // CapEx burden in DSCR/Buyer Cash Flow uses the user value first, otherwise
  // the industry-default imputation.
  const capExBurden = capEx ?? imputed.capExNeedsAnnual;

  const indDef = getIndustryDefault(input.industry);
  const imputedNotes: string[] = [];
  if (capEx === null && imputed.capExNeedsAnnual !== null && indDef) {
    imputedNotes.push(
      `CapEx imputed at ${(indDef.capExPct * 100).toFixed(1)}% of revenue (${indDef.label} industry default).`,
    );
  }
  if (wcPegPct === null && imputed.workingCapitalReserve !== null && indDef) {
    imputedNotes.push(
      `WC reserve imputed at ${(indDef.wcPct * 100).toFixed(0)}% of revenue (${indDef.label} industry default).`,
    );
  }

  return {
    status,
    netWorkingCapital: nwc,
    estimatedPeg,
    liquidityBufferRequired,
    cashConversionDays: ccc,
    cashConversionRisk,
    workingCapitalRisk: wcRisk,
    closingAdjustment,
    buyerWarnings: [...warnings, ...imputedNotes],
    blocksCloseReady: status === "missing",
    arOverdueRisk,
    inventoryStaleRisk,
    capExBurdenAnnual: capExBurden,
    notes: [
      status === "complete"
        ? `NWC: $${(nwc ?? 0).toLocaleString()}; Peg: $${(estimatedPeg ?? 0).toLocaleString()}`
        : "Working capital incomplete",
      ...imputedNotes,
    ],
  };
}
