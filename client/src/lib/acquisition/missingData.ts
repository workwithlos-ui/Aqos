// Missing-data classification. Drives:
//   • the verdict "CANNOT UNDERWRITE" branch
//   • the diligence priority list
//   • whether LOI / lender package buttons are enabled

import type { DealInput, MissingDataResult } from "./types";

function has(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

export function detectMissingData(input: DealInput): MissingDataResult {
  const critical: string[] = [];
  const important: string[] = [];
  const nice: string[] = [];

  if (!has(input.annualRevenue)) critical.push("Annual revenue");
  if (!has(input.annualEBITDA) && !has(input.annualSDE))
    critical.push("Annual EBITDA or SDE");
  if (!has(input.askingPrice) && !has(input.purchasePrice))
    critical.push("Asking price or purchase price");
  if (!input.industry) important.push("Industry classification");

  if (!input.revenueTrend || input.revenueTrend === "unknown")
    important.push("Revenue trend (growing / flat / declining)");
  if (!has(input.customerConcentrationPct))
    important.push("Customer concentration percentage");
  if (!input.ownerRole) important.push("Owner role / operating responsibility");
  if (!has(input.yearsInBusiness)) important.push("Years in business");

  if (!has(input.employeeCount)) nice.push("Employee count");
  if (!has(input.recurringRevenuePct)) nice.push("Recurring revenue percentage");
  if (!input.location) nice.push("Location");

  const diligence = input.diligence ?? {};
  if (!diligence.taxReturnsReceived) important.push("Tax returns");
  if (!diligence.pnlReceived) important.push("P&L statements");
  if (!diligence.balanceSheetReceived) important.push("Balance sheet");
  if (!diligence.cashFlowStatementReceived) nice.push("Cash flow statement");
  if (!diligence.addBacksDocumented) important.push("Documented add-backs");
  if (!diligence.customerListReceived) important.push("Customer list");
  if (!diligence.contractsReceived) nice.push("Customer contracts");
  if (!diligence.employeeRosterReceived) nice.push("Employee roster");
  if (!diligence.leaseReviewed) nice.push("Lease review");
  if (!diligence.debtScheduleReceived) important.push("Debt schedule");
  if (!diligence.qoeComplete) nice.push("Quality of earnings");

  const canUnderwrite =
    has(input.annualRevenue) &&
    (has(input.annualEBITDA) || has(input.annualSDE)) &&
    (has(input.askingPrice) || has(input.purchasePrice));

  const canRankAsAcquisitionPriority = canUnderwrite && important.length <= 4;

  const canGenerateLOI =
    canUnderwrite &&
    !!diligence.pnlReceived &&
    !!diligence.taxReturnsReceived;

  const canGenerateLenderPackage =
    canGenerateLOI &&
    !!diligence.balanceSheetReceived &&
    !!diligence.addBacksDocumented &&
    !!diligence.debtScheduleReceived;

  return {
    criticalMissing: critical,
    importantMissing: important,
    niceToHaveMissing: nice,
    canUnderwrite,
    canRankAsAcquisitionPriority,
    canGenerateLOI,
    canGenerateLenderPackage,
  };
}
