import type { DealInput, WorkingCapitalInputs, WorkingCapitalResult } from "./types";

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
  const wcPeg = wc.workingCapitalPeg ?? null;
  const bufferMonths = wc.requiredLiquidityBufferMonths ?? null;
  const seasonality = wc.seasonalityFactor ?? null;
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

  // Estimated peg: typically 10–15% of annual revenue
  const annualRev = input.annualRevenue ?? null;
  const estimatedPeg =
    wcPeg !== null
      ? wcPeg
      : annualRev && monthlyRev
        ? (monthlyRev * 12 * 0.12) / 1
        : annualRev
          ? annualRev * 0.12
          : null;

  // Liquidity buffer required
  const liquidityBufferRequired =
    bufferMonths && monthlyFC ? monthlyFC * bufferMonths : null;

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

  const capExBurden = capEx ?? null;

  return {
    status,
    netWorkingCapital: nwc,
    estimatedPeg,
    liquidityBufferRequired,
    cashConversionDays: ccc,
    cashConversionRisk,
    workingCapitalRisk: wcRisk,
    closingAdjustment,
    buyerWarnings: warnings,
    blocksCloseReady: status === "missing",
    arOverdueRisk,
    inventoryStaleRisk,
    capExBurdenAnnual: capExBurden,
    notes: [
      status === "complete"
        ? `NWC: $${(nwc ?? 0).toLocaleString()}; Peg: $${(estimatedPeg ?? 0).toLocaleString()}`
        : "Working capital incomplete",
    ],
  };
}
