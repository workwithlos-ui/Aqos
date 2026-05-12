// Internal benchmark multiple table used by the deterministic engine.
//
// IMPORTANT: A buyer compares EV/EBITDA against an EBITDA-based benchmark and
// EV/SDE against an SDE-based benchmark. Mixing the two is meaningless because
// SDE typically includes one owner's compensation while EBITDA does not, so
// SDE multiples are systemically lower for the same business.
//
// To prevent the original "EV/EBITDA 3.45x vs 2x–4x (SDE)" defect, this table
// now exposes BOTH bases per industry where the data exists, and the engine is
// required to pick the multiple that matches the deal's earnings basis. If
// only the opposite basis is available, the engine surfaces the band as
// reference-only with a warning instead of treating it as comparable.

import type { BenchmarkMultiple, BenchmarkPair } from "./types";

interface IndustryEntry {
  industryKey: string;
  industryLabel: string;
  ebitda?: { low: number; median: number; high: number; confidence: "low" | "medium" | "high" };
  sde?: { low: number; median: number; high: number; confidence: "low" | "medium" | "high" };
}

// Indicative SMB benchmarks. SDE multiples are lower than EBITDA multiples for
// the same industry because SDE adds back a single owner's compensation.
const TABLE: Record<string, IndustryEntry> = {
  plumbing: {
    industryKey: "plumbing",
    industryLabel: "Plumbing",
    sde: { low: 2.5, median: 3.5, high: 4.5, confidence: "medium" },
    ebitda: { low: 4.0, median: 5.0, high: 6.5, confidence: "medium" },
  },
  hvac: {
    industryKey: "hvac",
    industryLabel: "HVAC",
    sde: { low: 2.5, median: 3.5, high: 4.5, confidence: "medium" },
    ebitda: { low: 4.0, median: 5.5, high: 7.0, confidence: "medium" },
  },
  electrical: {
    industryKey: "electrical",
    industryLabel: "Electrical",
    sde: { low: 2.5, median: 3.5, high: 4.5, confidence: "medium" },
    ebitda: { low: 4.0, median: 5.0, high: 6.0, confidence: "medium" },
  },
  roofing: {
    industryKey: "roofing",
    industryLabel: "Roofing",
    sde: { low: 2.0, median: 3.0, high: 4.0, confidence: "medium" },
    ebitda: { low: 3.5, median: 4.5, high: 5.5, confidence: "medium" },
  },
  landscaping: {
    industryKey: "landscaping",
    industryLabel: "Landscaping",
    sde: { low: 2.0, median: 3.0, high: 4.0, confidence: "medium" },
    ebitda: { low: 3.5, median: 4.5, high: 5.5, confidence: "medium" },
  },
  "auto repair": {
    industryKey: "auto repair",
    industryLabel: "Auto Repair",
    sde: { low: 2.0, median: 3.0, high: 4.0, confidence: "medium" },
    ebitda: { low: 3.5, median: 4.5, high: 5.5, confidence: "medium" },
  },
  restaurant: {
    industryKey: "restaurant",
    industryLabel: "Restaurant",
    sde: { low: 1.0, median: 2.0, high: 3.0, confidence: "medium" },
    ebitda: { low: 2.5, median: 3.5, high: 4.5, confidence: "medium" },
  },
  "it services": {
    industryKey: "it services",
    industryLabel: "IT Services",
    ebitda: { low: 3.0, median: 4.5, high: 6.0, confidence: "medium" },
    sde: { low: 2.0, median: 3.0, high: 4.0, confidence: "medium" },
  },
  "marketing agency": {
    industryKey: "marketing agency",
    industryLabel: "Marketing Agency",
    ebitda: { low: 2.0, median: 3.0, high: 4.5, confidence: "low" },
    sde: { low: 1.5, median: 2.5, high: 3.5, confidence: "low" },
  },
};

const DEFAULT_ENTRY: IndustryEntry = {
  industryKey: "default",
  industryLabel: "Default (no industry match)",
  sde: { low: 2.0, median: 3.0, high: 4.0, confidence: "low" },
  ebitda: { low: 3.5, median: 4.5, high: 5.5, confidence: "low" },
};

function build(entry: IndustryEntry, basis: "EBITDA" | "SDE"): BenchmarkMultiple | null {
  const band = basis === "EBITDA" ? entry.ebitda : entry.sde;
  if (!band) return null;
  return {
    industryKey: entry.industryKey,
    industryLabel: entry.industryLabel,
    low: band.low,
    median: band.median,
    high: band.high,
    basis,
    confidence: band.confidence,
  };
}

function normalize(input: string | null | undefined): string | null {
  if (!input) return null;
  return input.trim().toLowerCase();
}

function lookupEntry(industry: string | null | undefined): IndustryEntry {
  const key = normalize(industry);
  if (key && TABLE[key]) return TABLE[key];
  if (key) {
    const fuzzy = Object.keys(TABLE).find(
      (k) => key.includes(k) || k.includes(key),
    );
    if (fuzzy) return TABLE[fuzzy];
  }
  return DEFAULT_ENTRY;
}

export function listBenchmarkIndustries(): BenchmarkMultiple[] {
  const out: BenchmarkMultiple[] = [];
  for (const e of Object.values(TABLE)) {
    const sde = build(e, "SDE");
    const eb = build(e, "EBITDA");
    if (sde) out.push(sde);
    if (eb) out.push(eb);
  }
  const sde = build(DEFAULT_ENTRY, "SDE");
  if (sde) out.push(sde);
  return out;
}

/** Returns both bases for an industry when available. */
export function getBenchmarkPair(industry: string | null | undefined): BenchmarkPair {
  const entry = lookupEntry(industry);
  return {
    ebitda: build(entry, "EBITDA"),
    sde: build(entry, "SDE"),
  };
}

/**
 * Legacy helper preserved for back-compat. Always prefer getBenchmarkPair +
 * picking the basis that matches the deal's earnings basis.
 */
export function getBenchmarkMultiple(
  industry: string | null | undefined,
  preferredBasis: "EBITDA" | "SDE" = "SDE",
): BenchmarkMultiple {
  const pair = getBenchmarkPair(industry);
  const preferred = preferredBasis === "EBITDA" ? pair.ebitda : pair.sde;
  return preferred ?? pair.sde ?? pair.ebitda ?? build(DEFAULT_ENTRY, "SDE")!;
}
