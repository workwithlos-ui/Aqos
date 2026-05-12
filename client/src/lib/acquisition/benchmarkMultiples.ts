// Internal benchmark multiple table used by the deterministic engine.
// These numbers are intentionally conservative and explicitly disclose their
// confidence level so the AI advisor and exports can quote them with caveats.

import type { BenchmarkMultiple } from "./types";

const TABLE: Record<string, BenchmarkMultiple> = {
  plumbing: {
    industryKey: "plumbing",
    industryLabel: "Plumbing",
    low: 2.5,
    median: 3.5,
    high: 4.5,
    basis: "SDE",
    confidence: "medium",
  },
  roofing: {
    industryKey: "roofing",
    industryLabel: "Roofing",
    low: 2.0,
    median: 3.0,
    high: 4.0,
    basis: "SDE",
    confidence: "medium",
  },
  landscaping: {
    industryKey: "landscaping",
    industryLabel: "Landscaping",
    low: 2.0,
    median: 3.0,
    high: 4.0,
    basis: "SDE",
    confidence: "medium",
  },
  "it services": {
    industryKey: "it services",
    industryLabel: "IT Services",
    low: 3.0,
    median: 4.5,
    high: 6.0,
    basis: "EBITDA",
    confidence: "medium",
  },
  "marketing agency": {
    industryKey: "marketing agency",
    industryLabel: "Marketing Agency",
    low: 2.0,
    median: 3.0,
    high: 4.5,
    basis: "EBITDA",
    confidence: "low",
  },
  "auto repair": {
    industryKey: "auto repair",
    industryLabel: "Auto Repair",
    low: 2.0,
    median: 3.0,
    high: 4.0,
    basis: "SDE",
    confidence: "medium",
  },
  restaurant: {
    industryKey: "restaurant",
    industryLabel: "Restaurant",
    low: 1.0,
    median: 2.0,
    high: 3.0,
    basis: "SDE",
    confidence: "medium",
  },
};

const DEFAULT_BENCHMARK: BenchmarkMultiple = {
  industryKey: "default",
  industryLabel: "Default (no industry match)",
  low: 2.0,
  median: 3.0,
  high: 4.0,
  basis: "SDE",
  confidence: "low",
};

function normalize(input: string | null | undefined): string | null {
  if (!input) return null;
  return input.trim().toLowerCase();
}

export function listBenchmarkIndustries(): BenchmarkMultiple[] {
  return [...Object.values(TABLE), DEFAULT_BENCHMARK];
}

export function getBenchmarkMultiple(
  industry: string | null | undefined,
): BenchmarkMultiple {
  const key = normalize(industry);
  if (key && TABLE[key]) return TABLE[key];
  if (key) {
    // Loose fuzzy match — "it" / "it consulting" → "it services" etc.
    const fuzzy = Object.keys(TABLE).find(
      (k) => key.includes(k) || k.includes(key),
    );
    if (fuzzy) return TABLE[fuzzy];
  }
  return DEFAULT_BENCHMARK;
}
