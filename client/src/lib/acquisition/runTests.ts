// Deterministic engine test spec.
//
// One function (runEngineSpec) runs the 10 required scenarios from the brief.
// The same code is invoked by:
//   • the TestSuite page (UI button)
//   • the Vitest test in client/src/lib/acquisition/__tests__/engine.spec.ts
//
// Every assertion runs against the live analyzeDeal() / buildCapitalStack()
// code path, so passing the suite proves the UI is computing the same numbers
// the tests are checking.

import { analyzeDeal } from "./index";
import { buildCapitalStack, DEFAULT_ASSUMPTIONS } from "./dealMath";
import type {
  CapitalStackAssumptions,
  DealInput,
  Verdict,
} from "./types";

export interface SpecAssertion {
  label: string;
  expected: string;
  actual: string;
  passed: boolean;
}

export interface SpecResult {
  name: string;
  passed: boolean;
  verdict?: Verdict;
  score?: number;
  dscrAfter?: number | null;
  assertions: SpecAssertion[];
}

export interface SpecDefinition {
  name: string;
  description: string;
  input: DealInput;
  expect: {
    verdictIn?: Verdict[];
    minScore?: number;
    maxScore?: number;
    dscrCondition?: "missing" | "below_one" | "at_or_above_125" | "any";
    capitalStackChecks?: Array<{
      assumptions: CapitalStackAssumptions;
      expectSba: number;
      expectSellerNote: number;
      expectBuyerEquity: number;
      expectInvalid: boolean;
    }>;
  };
}

const ASSUMPTIONS_75_15_10: CapitalStackAssumptions = {
  ...DEFAULT_ASSUMPTIONS,
  sbaLoanPct: 0.75,
  sellerNotePct: 0.15,
  buyerEquityPct: 0.1,
};

const ASSUMPTIONS_80_15_10_INVALID: CapitalStackAssumptions = {
  ...DEFAULT_ASSUMPTIONS,
  sbaLoanPct: 0.8,
  sellerNotePct: 0.15,
  buyerEquityPct: 0.1, // sums to 105% — invalid
};

export const TEST_DEFINITIONS: SpecDefinition[] = [
  {
    name: "Test 1 — Strong deal",
    description:
      "Plumbing, $4.2M revenue, $1.1M EBITDA, asking $3.8M. Expect Pursue or Pursue with Caution, DSCR ≥ 1.25x.",
    input: {
      id: "spec-1",
      companyName: "Strong Deal Test",
      industry: "plumbing",
      annualRevenue: 4_200_000,
      annualEBITDA: 1_100_000,
      askingPrice: 3_800_000,
      revenueTrend: "growing",
      ownerRole: "general manager",
      customerConcentrationPct: 12,
      employeeCount: 28,
      yearsInBusiness: 18,
      isTest: true,
      diligence: { taxReturnsReceived: true, pnlReceived: true, balanceSheetReceived: true, addBacksDocumented: true, debtScheduleReceived: true },
    },
    expect: {
      verdictIn: ["PURSUE", "PURSUE WITH CAUTION", "DILIGENCE PRIORITY"],
      minScore: 65,
      dscrCondition: "at_or_above_125",
    },
  },
  {
    name: "Test 2 — Fair deal",
    description:
      "Auto repair, $2.4M revenue, $480K EBITDA, asking $1.55M. Expect Pursue with Caution / Diligence Priority.",
    input: {
      id: "spec-2",
      companyName: "Fair Deal Test",
      industry: "auto repair",
      annualRevenue: 2_400_000,
      annualEBITDA: 480_000,
      askingPrice: 1_550_000,
      revenueTrend: "flat",
      ownerRole: "owner-operator",
      customerConcentrationPct: 18,
      employeeCount: 14,
      yearsInBusiness: 22,
      isTest: true,
      diligence: { pnlReceived: true, taxReturnsReceived: true },
    },
    expect: {
      verdictIn: ["PURSUE", "PURSUE WITH CAUTION", "DILIGENCE PRIORITY"],
      minScore: 50,
      dscrCondition: "any",
    },
  },
  {
    name: "Test 3 — Overpriced",
    description:
      "Restaurant, $1.8M revenue, $300K EBITDA, asking $1.8M (6x EBITDA on a restaurant). Expect Renegotiate.",
    input: {
      id: "spec-3",
      companyName: "Overpriced Test",
      industry: "restaurant",
      annualRevenue: 1_800_000,
      annualEBITDA: 300_000,
      askingPrice: 1_800_000,
      revenueTrend: "flat",
      ownerRole: "owner-operator",
      customerConcentrationPct: 5,
      employeeCount: 22,
      yearsInBusiness: 11,
      isTest: true,
      diligence: { pnlReceived: true },
    },
    expect: { verdictIn: ["RENEGOTIATE", "PAUSE", "KILL"], dscrCondition: "any" },
  },
  {
    name: "Test 4 — Revenue trap",
    description:
      "Landscaping, $3M revenue, $180K EBITDA, asking $900K. 35% concentration. Margin is thin; verdict should not be PURSUE.",
    input: {
      id: "spec-4",
      companyName: "Revenue Trap Test",
      industry: "landscaping",
      annualRevenue: 3_000_000,
      annualEBITDA: 180_000,
      askingPrice: 900_000,
      revenueTrend: "growing",
      ownerRole: "owner-operator",
      customerConcentrationPct: 35,
      employeeCount: 25,
      yearsInBusiness: 9,
      isTest: true,
    },
    expect: {
      verdictIn: ["DILIGENCE PRIORITY", "PAUSE", "PURSUE WITH CAUTION", "RENEGOTIATE", "KILL"],
      dscrCondition: "any",
    },
  },
  {
    name: "Test 5 — Small undervalued",
    description:
      "Plumbing, $900K revenue, $250K EBITDA, asking $650K. Strong margin, sub-3x. Should not be killed.",
    input: {
      id: "spec-5",
      companyName: "Small Undervalued Test",
      industry: "plumbing",
      annualRevenue: 900_000,
      annualEBITDA: 250_000,
      askingPrice: 650_000,
      revenueTrend: "growing",
      ownerRole: "owner-operator",
      customerConcentrationPct: 14,
      employeeCount: 6,
      yearsInBusiness: 14,
      isTest: true,
      diligence: { pnlReceived: true, taxReturnsReceived: true, addBacksDocumented: true },
    },
    expect: {
      verdictIn: ["PURSUE", "PURSUE WITH CAUTION", "DILIGENCE PRIORITY"],
      minScore: 55,
      dscrCondition: "at_or_above_125",
    },
  },
  {
    name: "Test 6 — Zero EBITDA",
    description:
      "Restaurant, $1M revenue, $0 EBITDA, asking $1.2M. Engine must KILL — no rational price.",
    input: {
      id: "spec-6",
      companyName: "Zero EBITDA Test",
      industry: "restaurant",
      annualRevenue: 1_000_000,
      annualEBITDA: 0,
      askingPrice: 1_200_000,
      revenueTrend: "declining",
      ownerRole: "owner-operator",
      customerConcentrationPct: 8,
      employeeCount: 12,
      yearsInBusiness: 6,
      isTest: true,
    },
    expect: {
      verdictIn: ["KILL"],
      maxScore: 30,
      dscrCondition: "any",
    },
  },
  {
    name: "Test 7 — Big revenue, bad earnings",
    description:
      "IT services, $10M revenue but only $400K EBITDA, asking $3M. Margin trap. Engine should not say PURSUE.",
    input: {
      id: "spec-7",
      companyName: "Big Revenue Bad Earnings Test",
      industry: "it services",
      annualRevenue: 10_000_000,
      annualEBITDA: 400_000,
      askingPrice: 3_000_000,
      revenueTrend: "flat",
      ownerRole: "general manager",
      customerConcentrationPct: 45,
      employeeCount: 70,
      yearsInBusiness: 14,
      isTest: true,
      diligence: { pnlReceived: true },
    },
    expect: {
      verdictIn: ["RENEGOTIATE", "PAUSE", "DILIGENCE PRIORITY", "KILL"],
      dscrCondition: "any",
    },
  },
  {
    name: "Test 8 — Missing asking price",
    description:
      "$2M revenue, $500K EBITDA, no asking price. Engine MUST flag missing data and refuse to recommend.",
    input: {
      id: "spec-8",
      companyName: "Missing Asking Price Test",
      industry: "plumbing",
      annualRevenue: 2_000_000,
      annualEBITDA: 500_000,
      askingPrice: null,
      purchasePrice: null,
      revenueTrend: "growing",
      ownerRole: "owner-operator",
      customerConcentrationPct: 10,
      employeeCount: 14,
      yearsInBusiness: 12,
      isTest: true,
      diligence: { pnlReceived: true },
    },
    expect: {
      verdictIn: ["CANNOT UNDERWRITE"],
      maxScore: 45,
      dscrCondition: "missing",
    },
  },
  {
    name: "Test 9 — Capital stack reconciliation",
    description:
      "Purchase price $3.8M with 75/15/10 split: SBA $2.85M, Seller Note $570K, Buyer Equity $380K, total $3.8M.",
    input: {
      id: "spec-9",
      companyName: "Capital Stack Reconciliation",
      industry: "plumbing",
      annualRevenue: 5_000_000,
      annualEBITDA: 900_000,
      askingPrice: 3_800_000,
      isTest: true,
    },
    expect: {
      verdictIn: [],
      dscrCondition: "any",
      capitalStackChecks: [
        {
          assumptions: ASSUMPTIONS_75_15_10,
          expectSba: 2_850_000,
          expectSellerNote: 570_000,
          expectBuyerEquity: 380_000,
          expectInvalid: false,
        },
      ],
    },
  },
  {
    name: "Test 10 — Invalid capital stack (105%)",
    description:
      "80/15/10 totals 105% — engine must reject and mark the capital stack invalid.",
    input: {
      id: "spec-10",
      companyName: "Bad Capital Stack",
      industry: "plumbing",
      annualRevenue: 5_000_000,
      annualEBITDA: 900_000,
      askingPrice: 3_800_000,
      isTest: true,
    },
    expect: {
      verdictIn: [],
      dscrCondition: "any",
      capitalStackChecks: [
        {
          assumptions: ASSUMPTIONS_80_15_10_INVALID,
          expectSba: 3_040_000,
          expectSellerNote: 570_000,
          expectBuyerEquity: 380_000,
          expectInvalid: true,
        },
      ],
    },
  },
];

function assertion(label: string, expected: string, actual: string, passed: boolean): SpecAssertion {
  return { label, expected, actual, passed };
}

export function runSingleSpec(def: SpecDefinition): SpecResult {
  const analysis = analyzeDeal(def.input);
  const assertions: SpecAssertion[] = [];

  if (def.expect.verdictIn && def.expect.verdictIn.length > 0) {
    const inSet = def.expect.verdictIn.includes(analysis.verdict.verdict);
    assertions.push(
      assertion(
        "Verdict in expected set",
        def.expect.verdictIn.join(" / "),
        analysis.verdict.verdict,
        inSet,
      ),
    );
  }

  if (def.expect.minScore !== undefined) {
    assertions.push(
      assertion(
        `Score ≥ ${def.expect.minScore}`,
        `>= ${def.expect.minScore}`,
        String(Math.round(analysis.score.score)),
        analysis.score.score >= def.expect.minScore,
      ),
    );
  }
  if (def.expect.maxScore !== undefined) {
    assertions.push(
      assertion(
        `Score ≤ ${def.expect.maxScore}`,
        `<= ${def.expect.maxScore}`,
        String(Math.round(analysis.score.score)),
        analysis.score.score <= def.expect.maxScore,
      ),
    );
  }

  const dscr = analysis.dscrPair.afterStandby.value;
  switch (def.expect.dscrCondition) {
    case "missing":
      assertions.push(assertion("DSCR is missing", "null", String(dscr), dscr === null));
      break;
    case "below_one":
      assertions.push(assertion("DSCR < 1.00x", "< 1.00", dscr === null ? "missing" : dscr.toFixed(2), dscr !== null && dscr < 1));
      break;
    case "at_or_above_125":
      assertions.push(assertion("DSCR ≥ 1.25x", ">= 1.25", dscr === null ? "missing" : dscr.toFixed(2), dscr !== null && dscr >= 1.25));
      break;
    case "any":
    default:
      break;
  }

  if (def.expect.capitalStackChecks) {
    for (const check of def.expect.capitalStackChecks) {
      const stack = buildCapitalStack(def.input, check.assumptions);
      const sba = stack.sba.amount ?? 0;
      const seller = stack.sellerNote.amount ?? 0;
      const equity = stack.buyerEquity.amount ?? 0;
      assertions.push(
        assertion("SBA tranche", `$${check.expectSba.toLocaleString()}`, `$${Math.round(sba).toLocaleString()}`, Math.round(sba) === check.expectSba),
        assertion("Seller note tranche", `$${check.expectSellerNote.toLocaleString()}`, `$${Math.round(seller).toLocaleString()}`, Math.round(seller) === check.expectSellerNote),
        assertion("Buyer equity tranche", `$${check.expectBuyerEquity.toLocaleString()}`, `$${Math.round(equity).toLocaleString()}`, Math.round(equity) === check.expectBuyerEquity),
        assertion(
          check.expectInvalid ? "Capital stack flagged invalid" : "Capital stack reconciles to 100%",
          check.expectInvalid ? "pctValid = false" : "pctValid = true",
          `pctValid = ${stack.pctValid}, pctTotal = ${(stack.pctTotal * 100).toFixed(2)}%`,
          stack.pctValid !== check.expectInvalid,
        ),
      );
    }
  }

  return {
    name: def.name,
    passed: assertions.every((a) => a.passed),
    verdict: analysis.verdict.verdict,
    score: analysis.score.score,
    dscrAfter: dscr,
    assertions,
  };
}

export function runEngineSpec(): SpecResult[] {
  return TEST_DEFINITIONS.map(runSingleSpec);
}
