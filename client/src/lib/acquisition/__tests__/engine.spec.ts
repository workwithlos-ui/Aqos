import { describe, expect, it } from "vitest";
import { runEngineSpec, TEST_DEFINITIONS } from "../runTests";
import { analyzeDeal } from "../index";
import { buildCapitalStack, DEFAULT_ASSUMPTIONS } from "../dealMath";

describe("Deterministic engine spec (10 required scenarios)", () => {
  const results = runEngineSpec();
  TEST_DEFINITIONS.forEach((def, i) => {
    const r = results[i];
    it(`${def.name}: passes every assertion`, () => {
      for (const a of r.assertions) {
        if (!a.passed) {
          // eslint-disable-next-line no-console
          console.error(`FAIL ${def.name} :: ${a.label} :: expected ${a.expected} actual ${a.actual}`);
        }
        expect(a.passed, `${a.label} — expected ${a.expected}, actual ${a.actual}`).toBe(true);
      }
    });
  });
});

describe("Engine never returns NaN / Infinity for required test cases", () => {
  for (const def of TEST_DEFINITIONS) {
    it(`${def.name}: numeric outputs are finite or null`, () => {
      const a = analyzeDeal(def.input);
      const numericFields = [
        a.earningsUsed,
        a.evToEBITDA.value,
        a.evToSDE.value,
        a.ebitdaMargin.value,
        a.sdeMargin.value,
        a.dscrPair.afterStandby.value,
        a.dscrPair.duringStandby.value,
        a.score.score,
        a.valuation.benchmarkLowValue,
        a.valuation.benchmarkMedianValue,
        a.valuation.benchmarkHighValue,
        a.valuation.valueGapVsAsking,
        a.capitalStack.totalSources,
        a.capitalStack.totalAnnualDebtService,
        a.capitalStack.totalAnnualDebtServiceDuringStandby,
      ];
      for (const v of numericFields) {
        const ok = v === null || (Number.isFinite(v) && !Number.isNaN(v));
        expect(ok, `Field returned non-finite value: ${v}`).toBe(true);
      }
    });
  }
});

describe("Demo / test deals are flagged and excluded from strategy buckets", () => {
  it("Test deals retain isTest flag in DealAnalysis", () => {
    for (const def of TEST_DEFINITIONS) {
      const a = analyzeDeal(def.input);
      expect(a.isTest).toBe(true);
    }
  });
});

describe("Capital stack reconciliation", () => {
  it("75/15/10 split on $3.8M reconciles exactly", () => {
    const stack = buildCapitalStack(
      { companyName: "x", askingPrice: 3_800_000 },
      { ...DEFAULT_ASSUMPTIONS, sbaLoanPct: 0.75, sellerNotePct: 0.15, buyerEquityPct: 0.1 },
    );
    expect(Math.round(stack.sba.amount ?? 0)).toBe(2_850_000);
    expect(Math.round(stack.sellerNote.amount ?? 0)).toBe(570_000);
    expect(Math.round(stack.buyerEquity.amount ?? 0)).toBe(380_000);
    expect(Math.round(stack.totalSources ?? 0)).toBe(3_800_000);
    expect(stack.pctValid).toBe(true);
  });
  it("80/15/10 split (105%) is flagged invalid", () => {
    const stack = buildCapitalStack(
      { companyName: "x", askingPrice: 3_800_000 },
      { ...DEFAULT_ASSUMPTIONS, sbaLoanPct: 0.8, sellerNotePct: 0.15, buyerEquityPct: 0.1 },
    );
    expect(stack.pctValid).toBe(false);
    expect(stack.warnings.length).toBeGreaterThan(0);
  });
});

describe("Missing-data engine refuses to underwrite without price or earnings", () => {
  it("Missing asking price → CANNOT UNDERWRITE verdict", () => {
    const a = analyzeDeal({
      companyName: "no-price",
      industry: "plumbing",
      annualRevenue: 2_000_000,
      annualEBITDA: 500_000,
      askingPrice: null,
    });
    expect(a.verdict.verdict).toBe("CANNOT UNDERWRITE");
    expect(a.missingData.canUnderwrite).toBe(false);
  });
  it("Zero EBITDA → KILL verdict", () => {
    const a = analyzeDeal({
      companyName: "zero",
      industry: "restaurant",
      annualRevenue: 1_000_000,
      annualEBITDA: 0,
      askingPrice: 1_200_000,
    });
    expect(a.verdict.verdict).toBe("KILL");
  });
});
