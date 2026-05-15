// Risk scoring is intentionally separate from deal scoring.
// Deal Score: 0–100, higher is better.
// Risk Score: 1–5 per factor, higher is riskier.
//
// Factors come from explicit inputs OR can be derived from structured signals
// (customer concentration %, owner role, revenue trend, years in business).
// Derived risks are flagged with `source: "derived"` so the UI can show the
// reasoning trace.

import type { DealInput, RiskFactor, RiskResult } from "./types";
import { industryDisplayName } from "./industryDefaults";

const LEVELS: RiskFactor["level"][] = [
  "Low",
  "Moderate-Low",
  "Moderate",
  "High",
  "Critical",
];

function levelFromScore(score: number | null): RiskFactor["level"] {
  if (score === null) return "Missing";
  const clamped = Math.max(1, Math.min(5, Math.round(score)));
  return LEVELS[clamped - 1];
}

function deriveFinancialStability(input: DealInput): {
  score: number | null;
  rationale: string;
} {
  const trend = input.revenueTrend ?? null;
  const ebitda = input.annualEBITDA ?? null;
  const rev = input.annualRevenue ?? null;
  if (ebitda !== null && ebitda <= 0) {
    return {
      score: 5,
      rationale: "EBITDA is zero or negative — earnings stability cannot be assumed.",
    };
  }
  if (trend === "declining") {
    return { score: 4, rationale: "Revenue trend reported as declining." };
  }
  if (trend === "growing" && rev && rev > 0) {
    return { score: 2, rationale: "Revenue trend reported as growing." };
  }
  if (trend === "flat") {
    return { score: 3, rationale: "Revenue trend reported as flat." };
  }
  return { score: null, rationale: "No financial stability signal provided." };
}

function deriveCustomerConcentration(input: DealInput): {
  score: number | null;
  rationale: string;
} {
  const pct = input.customerConcentrationPct;
  if (pct === null || pct === undefined) {
    return {
      score: null,
      rationale: "Customer concentration percentage not provided.",
    };
  }
  if (pct >= 50)
    return { score: 5, rationale: `Top customers represent ${pct}% of revenue.` };
  if (pct >= 30)
    return { score: 4, rationale: `Top customers represent ${pct}% of revenue.` };
  if (pct >= 20)
    return { score: 3, rationale: `Top customers represent ${pct}% of revenue.` };
  if (pct >= 10)
    return { score: 2, rationale: `Top customers represent ${pct}% of revenue.` };
  return { score: 1, rationale: `Top customers represent ${pct}% of revenue.` };
}

function deriveOwnerDependency(input: DealInput): {
  score: number | null;
  rationale: string;
} {
  const role = input.ownerRole?.toLowerCase() ?? null;
  if (!role) {
    return { score: null, rationale: "Owner role not described." };
  }
  if (/sole|only|primary|owner-operator|owner operator/.test(role)) {
    return { score: 5, rationale: "Owner described as sole operator." };
  }
  if (/manager|gm|general manager|operator/.test(role)) {
    return { score: 2, rationale: "Owner role described as oversight, with operating managers in place." };
  }
  return { score: 3, rationale: `Owner role: ${input.ownerRole}.` };
}

function deriveIndustryRisk(input: DealInput): {
  score: number | null;
  rationale: string;
} {
  const ind = input.industry?.toLowerCase() ?? null;
  if (!ind) return { score: null, rationale: "Industry not provided." };
  const label = industryDisplayName(input.industry);
  if (/restaurant|retail/.test(ind))
    return { score: 4, rationale: `Cyclical / margin-thin industry: ${label}.` };
  if (/it services|software|saas/.test(ind))
    return { score: 2, rationale: `Resilient services industry: ${label}.` };
  if (/plumbing|hvac|electrical|roofing|landscaping|auto repair/.test(ind))
    return { score: 2, rationale: `Essential trade industry: ${label}.` };
  return { score: 3, rationale: `Industry baseline risk: ${label}.` };
}

function deriveOperationalComplexity(input: DealInput): {
  score: number | null;
  rationale: string;
} {
  const count = input.employeeCount ?? null;
  if (count === null) {
    return { score: null, rationale: "Employee count not provided." };
  }
  if (count > 75) return { score: 4, rationale: `Headcount of ${count} adds integration complexity.` };
  if (count > 25) return { score: 3, rationale: `Mid-size team of ${count} employees.` };
  if (count > 5) return { score: 2, rationale: `Lean team of ${count} employees.` };
  return { score: 1, rationale: `Small team of ${count} employees.` };
}

export function scoreRisk(input: DealInput): RiskResult {
  const explicit = input.riskInputs ?? {};

  const factorsRaw: Array<{
    key: RiskFactor["key"];
    label: string;
    explicit: number | null | undefined;
    derived: { score: number | null; rationale: string };
  }> = [
    {
      key: "financialStabilityRisk",
      label: "Financial Stability Risk",
      explicit: explicit.financialStabilityRisk,
      derived: deriveFinancialStability(input),
    },
    {
      key: "customerConcentrationRisk",
      label: "Customer Concentration Risk",
      explicit: explicit.customerConcentrationRisk,
      derived: deriveCustomerConcentration(input),
    },
    {
      key: "ownerDependencyRisk",
      label: "Owner Dependency Risk",
      explicit: explicit.ownerDependencyRisk,
      derived: deriveOwnerDependency(input),
    },
    {
      key: "industryRisk",
      label: "Industry Risk",
      explicit: explicit.industryRisk,
      derived: deriveIndustryRisk(input),
    },
    {
      key: "operationalComplexityRisk",
      label: "Operational Complexity Risk",
      explicit: explicit.operationalComplexityRisk,
      derived: deriveOperationalComplexity(input),
    },
  ];

  const factors: RiskFactor[] = factorsRaw.map((r) => {
    if (typeof r.explicit === "number" && Number.isFinite(r.explicit)) {
      const s = Math.max(1, Math.min(5, Math.round(r.explicit)));
      return {
        key: r.key,
        label: r.label,
        score: s,
        level: levelFromScore(s),
        source: "actual",
        rationale: "Provided by buyer.",
      };
    }
    if (r.derived.score !== null) {
      return {
        key: r.key,
        label: r.label,
        score: r.derived.score,
        level: levelFromScore(r.derived.score),
        source: "derived",
        rationale: r.derived.rationale,
      };
    }
    return {
      key: r.key,
      label: r.label,
      score: null,
      level: "Missing",
      source: "missing",
      rationale: r.derived.rationale,
    };
  });

  const scored = factors.filter((f) => f.score !== null);
  const avg =
    scored.length === 0
      ? null
      : scored.reduce((sum, f) => sum + (f.score ?? 0), 0) / scored.length;
  const criticalCount = factors.filter((f) => f.score === 5).length;
  const highest =
    scored.length === 0
      ? null
      : scored.reduce((a, b) => ((b.score ?? 0) > (a.score ?? 0) ? b : a));

  const totalFactors = factors.length;
  const missingCount = totalFactors - scored.length;
  const completeness = totalFactors === 0 ? 0 : scored.length / totalFactors;

  // Risk confidence is a function of how many of the five factors we actually
  // know. ONLY explicit buyer-provided risk scores count toward confidence —
  // derived signals (industry, headcount-based complexity) are not enough to
  // mark the panel materially complete. With four or five buyer-provided, the
  // panel is high. Three buyer-provided is medium. Two is low. Fewer than
  // two is insufficient.
  const buyerScoredCount = factors.filter((f) => f.source === "actual").length;
  let riskConfidence: "high" | "medium" | "low" | "insufficient";
  if (buyerScoredCount >= 4) riskConfidence = "high";
  else if (buyerScoredCount === 3) riskConfidence = "medium";
  else if (buyerScoredCount === 2) riskConfidence = "low";
  else riskConfidence = "insufficient";

  const buyerMissing = totalFactors - buyerScoredCount;
  const riskCompletenessLabel =
    buyerScoredCount >= 4 && missingCount === 0
      ? "All five risk factors scored."
      : buyerScoredCount === 0
        ? `0 of ${totalFactors} risk factors scored by buyer — risk panel is incomplete (derived signals only).`
        : `${buyerMissing} of ${totalFactors} risk factors are missing buyer input — risk score is incomplete.`;

  return {
    factors,
    highestRisk: highest,
    criticalCount,
    averageScore: avg,
    hasCritical: criticalCount > 0,
    missingCount,
    totalFactors,
    completeness,
    riskConfidence,
    riskCompletenessLabel,
  };
}
