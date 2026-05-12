// Tests 11-15 for institutional M&A modules

import { analyzeDeal } from "./index";
import type { DealInput } from "./types";

export function runNewTests() {
  const results: { name: string; passed: boolean; detail: string }[] = [];

  // Test 11: Benchmark Basis Mismatch
  try {
    const input11: DealInput = {
      companyName: "Benchmark Basis Mismatch Test",
      industry: "restaurant",
      annualRevenue: 1_500_000,
      annualEBITDA: 300_000,
      annualSDE: null,
      askingPrice: 1_200_000,
      isTest: true,
    };
    const analysis11 = analyzeDeal(input11);
    const passed11 =
      analysis11.valuation.compatibility === "reference_only" ||
      (analysis11.valuation.compatibility === "basis_match" &&
        analysis11.earningsBasis === "EBITDA");
    const detail11 = passed11
      ? `Benchmark compatibility correctly set to ${analysis11.valuation.compatibility} for EBITDA basis.`
      : `Expected reference_only or basis_match for EBITDA; got ${analysis11.valuation.compatibility}`;
    results.push({ name: "Test 11 - Benchmark Basis Mismatch", passed: passed11, detail: detail11 });
  } catch (e) {
    results.push({
      name: "Test 11 - Benchmark Basis Mismatch",
      passed: false,
      detail: `Error: ${(e as Error).message}`,
    });
  }

  // Test 12: Missing Risk Inputs
  try {
    const input12: DealInput = {
      companyName: "Missing Risk Inputs Test",
      industry: "plumbing",
      annualRevenue: 2_000_000,
      annualEBITDA: 500_000,
      askingPrice: 1_500_000,
      riskInputs: {
        // All missing — no risk inputs provided
      },
      isTest: true,
    };
    const analysis12 = analyzeDeal(input12);
    const passed12 =
      analysis12.risk.riskConfidence === "low" || analysis12.risk.riskConfidence === "insufficient";
    const detail12 = passed12
      ? `Risk confidence correctly downgraded to ${analysis12.risk.riskConfidence} with missing inputs.`
      : `Expected low/insufficient risk confidence; got ${analysis12.risk.riskConfidence}`;
    results.push({
      name: "Test 12 - Missing Risk Inputs",
      passed: passed12,
      detail: detail12,
    });
  } catch (e) {
    results.push({
      name: "Test 12 - Missing Risk Inputs",
      passed: false,
      detail: `Error: ${(e as Error).message}`,
    });
  }

  // Test 13: Freeze Trigger (DSCR < 1.0)
  try {
    const input13: DealInput = {
      companyName: "Freeze Trigger Test",
      industry: "it services",
      annualRevenue: 5_000_000,
      annualEBITDA: 250_000,
      askingPrice: 4_000_000,
      isTest: true,
    };
    const analysis13 = analyzeDeal(input13);
    const passed13 =
      analysis13.freeze.status === "red" &&
      analysis13.freeze.triggers.some((t) => t.key.includes("dscr"));
    const detail13 = passed13
      ? `Freeze correctly set to RED with DSCR trigger.`
      : `Expected red freeze with DSCR trigger; got ${analysis13.freeze.status}`;
    results.push({
      name: "Test 13 - Freeze Trigger (DSCR < 1.0)",
      passed: passed13,
      detail: detail13,
    });
  } catch (e) {
    results.push({
      name: "Test 13 - Freeze Trigger (DSCR < 1.0)",
      passed: false,
      detail: `Error: ${(e as Error).message}`,
    });
  }

  // Test 14: Working Capital Missing Near Close
  try {
    const input14: DealInput = {
      companyName: "Working Capital Missing Test",
      industry: "plumbing",
      annualRevenue: 2_500_000,
      annualEBITDA: 625_000,
      askingPrice: 1_875_000,
      workingCapital: {
        // All missing
      },
      isTest: true,
    };
    const analysis14 = analyzeDeal(input14);
    const passed14 =
      analysis14.workingCapital.status === "missing" &&
      analysis14.workingCapital.blocksCloseReady === true;
    const detail14 = passed14
      ? `Working capital correctly blocks close-ready.`
      : `Expected WC to block close-ready; got status=${analysis14.workingCapital.status}, blocksCloseReady=${analysis14.workingCapital.blocksCloseReady}`;
    results.push({
      name: "Test 14 - Working Capital Missing Near Close",
      passed: passed14,
      detail: detail14,
    });
  } catch (e) {
    results.push({
      name: "Test 14 - Working Capital Missing Near Close",
      passed: false,
      detail: `Error: ${(e as Error).message}`,
    });
  }

  // Test 15: Demo/Test Exclusion
  try {
    const input15a: DealInput = {
      companyName: "Demo Deal",
      industry: "plumbing",
      annualRevenue: 2_000_000,
      annualEBITDA: 500_000,
      askingPrice: 1_500_000,
      isDemo: true,
    };
    const input15b: DealInput = {
      companyName: "Test Deal",
      industry: "plumbing",
      annualRevenue: 2_000_000,
      annualEBITDA: 500_000,
      askingPrice: 1_500_000,
      isTest: true,
    };
    const analysis15a = analyzeDeal(input15a);
    const analysis15b = analyzeDeal(input15b);
    const passed15 = analysis15a.isDemo === true && analysis15b.isTest === true;
    const detail15 = passed15
      ? `Demo and test flags correctly preserved.`
      : `Expected isDemo=true and isTest=true; got isDemo=${analysis15a.isDemo}, isTest=${analysis15b.isTest}`;
    results.push({
      name: "Test 15 - Demo/Test Exclusion",
      passed: passed15,
      detail: detail15,
    });
  } catch (e) {
    results.push({
      name: "Test 15 - Demo/Test Exclusion",
      passed: false,
      detail: `Error: ${(e as Error).message}`,
    });
  }

  return results;
}
