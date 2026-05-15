import type { BuyBox, DealInput, ThesisCriterion, ThesisFitResult } from "./types";
import { industryDisplayName } from "./industryDefaults";

export function scoreThesisFit(input: DealInput, buyBox: BuyBox | null): ThesisFitResult {
  if (!buyBox || !buyBox.targetIndustries || buyBox.targetIndustries.length === 0) {
    return {
      enabled: false,
      fitScore: 100,
      bucket: "Strong Fit",
      passed: [],
      failed: [],
      unknown: [],
      redFlagsTriggered: [],
      mustHaveBlocked: [],
      exceptionApproved: false,
      exceptionRationale: null,
      rationale: "Buy Box not configured.",
    };
  }

  const criteria: ThesisCriterion[] = [];
  const passed: ThesisCriterion[] = [];
  const failed: ThesisCriterion[] = [];
  const unknown: ThesisCriterion[] = [];
  const redFlagsTriggered: string[] = [];
  let mustHaveBlocked: string[] = [];

  // Industry check
  const industry = (input.industry ?? "").toLowerCase();
  const inTarget = buyBox.targetIndustries.some((t) => industry.includes(t.toLowerCase()));
  const inExcluded = buyBox.excludedIndustries.some((e) => industry.includes(e.toLowerCase()));

  if (inExcluded) {
    failed.push({
      key: "excluded_industry",
      label: "Excluded Industry",
      weight: "must",
      status: "fail",
      detail: `Industry "${industryDisplayName(input.industry as string)}" is on the exclusion list.`,
    });
    mustHaveBlocked.push("Excluded industry");
  } else if (!inTarget && buyBox.targetIndustries.length > 0) {
    failed.push({
      key: "not_target_industry",
      label: "Not Target Industry",
      weight: "must",
      status: "fail",
      detail: `Industry "${industryDisplayName(input.industry as string)}" not in target list: ${buyBox.targetIndustries.map((t) => industryDisplayName(t)).join(", ")}.`,
    });
    mustHaveBlocked.push("Not target industry");
  } else if (inTarget) {
    passed.push({
      key: "target_industry",
      label: "Target Industry",
      weight: "must",
      status: "pass",
      detail: `Industry "${industryDisplayName(input.industry as string)}" matches target.`,
    });
  }

  // Revenue range
  const rev = input.annualRevenue ?? null;
  if (rev === null) {
    unknown.push({
      key: "revenue_range",
      label: "Revenue in Range",
      weight: "must",
      status: "unknown",
      detail: "Annual revenue not provided.",
    });
  } else {
    const minOk = buyBox.revenueMin === null || rev >= buyBox.revenueMin;
    const maxOk = buyBox.revenueMax === null || rev <= buyBox.revenueMax;
    if (minOk && maxOk) {
      passed.push({
        key: "revenue_range",
        label: "Revenue in Range",
        weight: "must",
        status: "pass",
        detail: `Revenue $${(rev / 1_000_000).toFixed(1)}M within range.`,
      });
    } else {
      failed.push({
        key: "revenue_range",
        label: "Revenue in Range",
        weight: "must",
        status: "fail",
        detail: `Revenue $${(rev / 1_000_000).toFixed(1)}M outside range [$${buyBox.revenueMin ? (buyBox.revenueMin / 1_000_000).toFixed(1) : "0"}M–$${buyBox.revenueMax ? (buyBox.revenueMax / 1_000_000).toFixed(1) : "∞"}M].`,
      });
      mustHaveBlocked.push("Revenue out of range");
    }
  }

  // Earnings range
  const earnings = input.annualEBITDA ?? input.annualSDE ?? null;
  if (earnings === null) {
    unknown.push({
      key: "earnings_range",
      label: "Earnings in Range",
      weight: "must",
      status: "unknown",
      detail: "EBITDA/SDE not provided.",
    });
  } else {
    const minOk = buyBox.earningsMin === null || earnings >= buyBox.earningsMin;
    const maxOk = buyBox.earningsMax === null || earnings <= buyBox.earningsMax;
    if (minOk && maxOk) {
      passed.push({
        key: "earnings_range",
        label: "Earnings in Range",
        weight: "must",
        status: "pass",
        detail: `Earnings $${(earnings / 1_000_000).toFixed(2)}M within range.`,
      });
    } else {
      failed.push({
        key: "earnings_range",
        label: "Earnings in Range",
        weight: "must",
        status: "fail",
        detail: `Earnings $${(earnings / 1_000_000).toFixed(2)}M outside range.`,
      });
      mustHaveBlocked.push("Earnings out of range");
    }
  }

  // Margin check
  const margin =
    rev && earnings ? ((earnings / rev) * 100).toFixed(1) : null;
  if (buyBox.minMarginPct !== null) {
    if (margin === null) {
      unknown.push({
        key: "margin_check",
        label: "Margin Threshold",
        weight: "important",
        status: "unknown",
        detail: "Cannot calculate margin.",
      });
    } else if (parseFloat(margin) >= buyBox.minMarginPct) {
      passed.push({
        key: "margin_check",
        label: "Margin Threshold",
        weight: "important",
        status: "pass",
        detail: `Margin ${margin}% meets minimum ${buyBox.minMarginPct}%.`,
      });
    } else {
      failed.push({
        key: "margin_check",
        label: "Margin Threshold",
        weight: "important",
        status: "fail",
        detail: `Margin ${margin}% below minimum ${buyBox.minMarginPct}%.`,
      });
    }
  }

  // Customer concentration
  const conc = input.customerConcentrationPct ?? null;
  if (buyBox.maxCustomerConcentrationPct !== null) {
    if (conc === null) {
      unknown.push({
        key: "customer_concentration",
        label: "Customer Concentration",
        weight: "important",
        status: "unknown",
        detail: "Customer concentration not provided.",
      });
    } else if (conc <= buyBox.maxCustomerConcentrationPct) {
      passed.push({
        key: "customer_concentration",
        label: "Customer Concentration",
        weight: "important",
        status: "pass",
        detail: `Concentration ${conc}% within tolerance.`,
      });
    } else {
      failed.push({
        key: "customer_concentration",
        label: "Customer Concentration",
        weight: "important",
        status: "fail",
        detail: `Concentration ${conc}% exceeds max ${buyBox.maxCustomerConcentrationPct}%.`,
      });
    }
  }

  // Geography
  if (buyBox.geographies && buyBox.geographies.length > 0) {
    const geo = (input.geography ?? "").toLowerCase();
    const geoMatch = buyBox.geographies.some((g) => geo.includes(g.toLowerCase()));
    if (!input.geography) {
      unknown.push({
        key: "geography",
        label: "Geography",
        weight: "preferred",
        status: "unknown",
        detail: "Geography not provided.",
      });
    } else if (geoMatch) {
      passed.push({
        key: "geography",
        label: "Geography",
        weight: "preferred",
        status: "pass",
        detail: `Geography "${input.geography}" matches target.`,
      });
    } else {
      failed.push({
        key: "geography",
        label: "Geography",
        weight: "preferred",
        status: "fail",
        detail: `Geography "${input.geography}" not in target list.`,
      });
    }
  }

  // Recurring revenue preference
  if (buyBox.recurringRevenuePreferredPct !== null) {
    const recurring = input.recurringRevenuePct ?? null;
    if (recurring === null) {
      unknown.push({
        key: "recurring_revenue",
        label: "Recurring Revenue",
        weight: "preferred",
        status: "unknown",
        detail: "Recurring revenue % not provided.",
      });
    } else if (recurring >= buyBox.recurringRevenuePreferredPct) {
      passed.push({
        key: "recurring_revenue",
        label: "Recurring Revenue",
        weight: "preferred",
        status: "pass",
        detail: `Recurring revenue ${recurring}% meets preference.`,
      });
    } else {
      failed.push({
        key: "recurring_revenue",
        label: "Recurring Revenue",
        weight: "preferred",
        status: "fail",
        detail: `Recurring revenue ${recurring}% below preference ${buyBox.recurringRevenuePreferredPct}%.`,
      });
    }
  }

  // Employee count range
  const empCount = input.employeeCount ?? null;
  if (buyBox.employeeCountMin !== null || buyBox.employeeCountMax !== null) {
    if (empCount === null) {
      unknown.push({
        key: "employee_count",
        label: "Employee Count",
        weight: "preferred",
        status: "unknown",
        detail: "Employee count not provided.",
      });
    } else {
      const minOk = buyBox.employeeCountMin === null || empCount >= buyBox.employeeCountMin;
      const maxOk = buyBox.employeeCountMax === null || empCount <= buyBox.employeeCountMax;
      if (minOk && maxOk) {
        passed.push({
          key: "employee_count",
          label: "Employee Count",
          weight: "preferred",
          status: "pass",
          detail: `${empCount} employees within range.`,
        });
      } else {
        failed.push({
          key: "employee_count",
          label: "Employee Count",
          weight: "preferred",
          status: "fail",
          detail: `${empCount} employees outside preferred range.`,
        });
      }
    }
  }

  // Years in business
  if (buyBox.yearsInBusinessMin !== null) {
    const yrs = input.yearsInBusiness ?? null;
    if (yrs === null) {
      unknown.push({
        key: "years_in_business",
        label: "Years in Business",
        weight: "preferred",
        status: "unknown",
        detail: "Years in business not provided.",
      });
    } else if (yrs >= buyBox.yearsInBusinessMin) {
      passed.push({
        key: "years_in_business",
        label: "Years in Business",
        weight: "preferred",
        status: "pass",
        detail: `${yrs} years exceeds minimum ${buyBox.yearsInBusinessMin}.`,
      });
    } else {
      failed.push({
        key: "years_in_business",
        label: "Years in Business",
        weight: "preferred",
        status: "fail",
        detail: `${yrs} years below minimum ${buyBox.yearsInBusinessMin}.`,
      });
    }
  }

  // Red flags
  for (const flag of buyBox.redFlags) {
    if (flag.toLowerCase().includes("declining") && input.revenueTrend === "declining") {
      redFlagsTriggered.push(flag);
    }
    if (flag.toLowerCase().includes("owner") && input.ownerRole?.toLowerCase().includes("sole")) {
      redFlagsTriggered.push(flag);
    }
  }

  // Compute fit score
  let fitScore = 100;
  fitScore -= failed.filter((c) => c.weight === "must").length * 30;
  fitScore -= failed.filter((c) => c.weight === "important").length * 15;
  fitScore -= failed.filter((c) => c.weight === "preferred").length * 5;
  fitScore = Math.max(0, Math.min(100, fitScore));

  // Determine bucket
  let bucket: ThesisFitResult["bucket"] = "Strong Fit";
  if (mustHaveBlocked.length > 0) {
    bucket = input.overrides?.exceptionApproved ? "Exception Required" : "Off-Thesis";
  } else if (failed.length > 0) {
    bucket = "Partial Fit";
  }

  return {
    enabled: true,
    fitScore,
    bucket,
    passed,
    failed,
    unknown,
    redFlagsTriggered,
    mustHaveBlocked,
    exceptionApproved: input.overrides?.exceptionApproved ?? false,
    exceptionRationale: input.overrides?.exceptionRationale ?? null,
    rationale:
      bucket === "Strong Fit"
        ? "Deal meets all must-have criteria."
        : bucket === "Partial Fit"
          ? `Deal meets core criteria but has ${failed.length} mismatches.`
          : bucket === "Off-Thesis"
            ? `Deal blocked by ${mustHaveBlocked.length} must-have criteria.`
            : "Deal approved as exception despite off-thesis status.",
  };
}

export const DEFAULT_BUY_BOX: BuyBox = {
  targetIndustries: [],
  excludedIndustries: [],
  revenueMin: null,
  revenueMax: null,
  earningsMin: null,
  earningsMax: null,
  minMarginPct: null,
  maxCustomerConcentrationPct: null,
  geographies: [],
  ownerDependencyTolerance: "medium",
  recurringRevenuePreferredPct: null,
  employeeCountMin: null,
  employeeCountMax: null,
  yearsInBusinessMin: null,
  requiresFinancing: false,
  requiresSellerFinancing: false,
  requiresSbaEligibility: false,
  strategicRationale: "",
  redFlags: [],
  mustHave: [],
  niceToHave: [],
};
