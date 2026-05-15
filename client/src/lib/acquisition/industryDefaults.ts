// Industry-time default imputation for CapEx and Working-Capital reserve.
//
// Contract: when the buyer selects (or changes) the industry on the Deal
// Analyzer page, both fields fire IMMEDIATELY:
//
//   if (capExNeedsAnnual == null) capExNeedsAnnual = revenue * capExPct
//   if (workingCapital.reserve == null) workingCapital.reserve = revenue * wcPct
//
// Both imputed values must be tagged `assumed (industry default)` on the
// assumption-badge panel and exposed via an inline override link so the
// buyer can replace them at any time.

export interface IndustryDefault {
  industryKey: string;
  label: string;
  capExPct: number; // fraction of annual revenue
  wcPct: number; // fraction of annual revenue (as a WC reserve / peg)
}

export const INDUSTRY_DEFAULTS: Record<string, IndustryDefault> = {
  hvac: { industryKey: "hvac", label: "HVAC", capExPct: 0.025, wcPct: 0.07 },
  plumbing: { industryKey: "plumbing", label: "Plumbing", capExPct: 0.025, wcPct: 0.06 },
  electrical: { industryKey: "electrical", label: "Electrical", capExPct: 0.02, wcPct: 0.05 },
  landscaping: { industryKey: "landscaping", label: "Landscaping", capExPct: 0.04, wcPct: 0.05 },
  roofing: { industryKey: "roofing", label: "Roofing", capExPct: 0.03, wcPct: 0.06 },
  restaurant: { industryKey: "restaurant", label: "Restaurant", capExPct: 0.04, wcPct: 0.04 },
  "it services": { industryKey: "it services", label: "IT Services", capExPct: 0.01, wcPct: 0.08 },
  saas: { industryKey: "saas", label: "SaaS", capExPct: 0.01, wcPct: 0.08 },
  ecommerce: { industryKey: "ecommerce", label: "E-commerce", capExPct: 0.015, wcPct: 0.1 },
  manufacturing: { industryKey: "manufacturing", label: "Manufacturing", capExPct: 0.05, wcPct: 0.12 },
  "auto repair": { industryKey: "auto repair", label: "Auto Repair", capExPct: 0.03, wcPct: 0.06 },
  "marketing agency": { industryKey: "marketing agency", label: "Marketing Agency", capExPct: 0.01, wcPct: 0.08 },
};

export function getIndustryDefault(industry: string | null | undefined): IndustryDefault | null {
  if (!industry) return null;
  return INDUSTRY_DEFAULTS[industry.toLowerCase().trim()] ?? null;
}

export interface ImputationResult {
  capExNeedsAnnual: number | null;
  workingCapitalReserve: number | null;
  workingCapitalPegPct: number | null; // percentage value (e.g. 7 for 7%)
  source: "user" | "industry-default" | "missing";
  rationale: string;
  capExSource: "user" | "industry-default" | "missing";
  wcSource: "user" | "industry-default" | "missing";
}

/**
 * Compute imputed CapEx and WC reserve values.
 *
 * `revenue` is the company's annual revenue. `industry` is the lowercased
 * industry key. `currentCapEx` and `currentWcReserve` are the buyer-provided
 * overrides; if either is null, the corresponding default is imputed.
 */
export function imputeWorkingCapitalDefaults(args: {
  revenue: number | null | undefined;
  industry: string | null | undefined;
  currentCapEx: number | null | undefined;
  currentWcReserve: number | null | undefined;
  currentWcPegPct: number | null | undefined; // user-entered WC peg as a %
}): ImputationResult {
  const def = getIndustryDefault(args.industry);
  const rev = typeof args.revenue === "number" && Number.isFinite(args.revenue) && args.revenue > 0
    ? args.revenue
    : null;

  // CapEx
  let capEx: number | null = null;
  let capExSource: "user" | "industry-default" | "missing" = "missing";
  if (typeof args.currentCapEx === "number" && Number.isFinite(args.currentCapEx) && args.currentCapEx > 0) {
    capEx = args.currentCapEx;
    capExSource = "user";
  } else if (def && rev) {
    capEx = Math.round(rev * def.capExPct);
    capExSource = "industry-default";
  }

  // Working capital reserve
  let wcReserve: number | null = null;
  let wcSource: "user" | "industry-default" | "missing" = "missing";
  let wcPegPct: number | null = null;
  if (typeof args.currentWcReserve === "number" && Number.isFinite(args.currentWcReserve) && args.currentWcReserve > 0) {
    wcReserve = args.currentWcReserve;
    wcSource = "user";
  } else if (typeof args.currentWcPegPct === "number" && Number.isFinite(args.currentWcPegPct) && args.currentWcPegPct > 0 && rev) {
    wcPegPct = args.currentWcPegPct;
    wcReserve = Math.round(rev * (args.currentWcPegPct / 100));
    wcSource = "user";
  } else if (def && rev) {
    wcPegPct = def.wcPct * 100;
    wcReserve = Math.round(rev * def.wcPct);
    wcSource = "industry-default";
  }

  const source: ImputationResult["source"] =
    capExSource === "user" && wcSource === "user"
      ? "user"
      : capExSource === "missing" && wcSource === "missing"
        ? "missing"
        : "industry-default";

  const rationale = def
    ? `${def.label} default: CapEx ${(def.capExPct * 100).toFixed(1)}% of revenue, WC ${(def.wcPct * 100).toFixed(0)}% of revenue.`
    : "No industry default available — supply CapEx and WC manually.";

  return {
    capExNeedsAnnual: capEx,
    workingCapitalReserve: wcReserve,
    workingCapitalPegPct: wcPegPct,
    source,
    rationale,
    capExSource,
    wcSource,
  };
}

/**
 * Iteration 9 P0.4 — Industry display name capitalization.
 *
 * Every UI surface (Analyzer banner, Red Team objections, Copilot output,
 * IC memo, exports) must render the industry with proper capitalization.
 * Some industries are uppercase ("HVAC"), some Title Case ("Plumbing"),
 * some multi-word ("IT Services"). This helper is the single source of
 * truth used across the codebase.
 */
export function industryDisplayName(industry: string | null | undefined): string {
  if (!industry) return "industry";
  const trimmed = industry.toLowerCase().trim();
  const def = INDUSTRY_DEFAULTS[trimmed];
  if (def) return def.label;
  // Fallback: Title Case each word.
  return trimmed
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}
