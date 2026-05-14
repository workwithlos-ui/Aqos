import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useDealStore } from "@/lib/acquisition/store";
import { analyzeDeal } from "@/lib/acquisition";
import { ActiveDealPicker } from "@/components/acq/ActiveDealPicker";
import { SaveStatus } from "@/components/acq/SaveStatus";
import { useEffect, useMemo, useState } from "react";
import type { WorkingCapitalInputs } from "@/lib/acquisition/types";
import { toast } from "sonner";

// Industry-default imputation table (annual % of revenue).
// Source: trade-services SBA underwriting norms.
const INDUSTRY_DEFAULTS: Record<string, { capExPct: number; wcPegPct: number; label: string }> = {
  hvac: { capExPct: 0.025, wcPegPct: 0.07, label: "HVAC" },
  plumbing: { capExPct: 0.025, wcPegPct: 0.06, label: "Plumbing" },
  electrical: { capExPct: 0.02, wcPegPct: 0.05, label: "Electrical" },
  landscaping: { capExPct: 0.04, wcPegPct: 0.05, label: "Landscaping" },
  roofing: { capExPct: 0.03, wcPegPct: 0.06, label: "Roofing" },
  restaurant: { capExPct: 0.04, wcPegPct: 0.04, label: "Restaurant" },
  "it services": { capExPct: 0.01, wcPegPct: 0.08, label: "IT Services" },
  manufacturing: { capExPct: 0.05, wcPegPct: 0.12, label: "Manufacturing" },
};

function defaultsFor(industry?: string | null) {
  if (!industry) return null;
  return INDUSTRY_DEFAULTS[industry.trim().toLowerCase()] ?? null;
}

function fmtMoney(v: number | null): string {
  if (v === null || !isFinite(v)) return "missing";
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function WorkingCapitalPage() {
  const { deals, assumptions, activeDealId, upsertDeal, lastSavedAt } = useDealStore();
  const dealId = activeDealId ?? deals[0]?.id ?? "";
  const deal = useMemo(() => deals.find((d) => d.id === dealId) ?? null, [deals, dealId]);
  const [wcData, setWcData] = useState<WorkingCapitalInputs>(() => deal?.workingCapital ?? {});

  useEffect(() => {
    setWcData(deal?.workingCapital ?? {});
  }, [deal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const analysis = useMemo(() => (deal ? analyzeDeal(deal, assumptions) : null), [deal, assumptions]);
  const ind = defaultsFor(deal?.industry);
  const revenue = deal?.annualRevenue ?? null;

  const handleChange = (key: keyof WorkingCapitalInputs, value: unknown) => {
    const updated = { ...wcData, [key]: value } as WorkingCapitalInputs;
    setWcData(updated);
  };

  const save = () => {
    if (!deal) return;
    upsertDeal({ ...deal, workingCapital: wcData });
    toast.success("Working capital saved", {
      description: "DSCR and Buyer Cash Flow will refresh on the Analyzer.",
      duration: 2500,
    });
  };

  const applyIndustryDefaults = () => {
    if (!ind || !revenue) return;
    const updated: WorkingCapitalInputs = {
      ...wcData,
      capExNeedsAnnual: wcData.capExNeedsAnnual ?? Math.round(revenue * ind.capExPct),
      workingCapitalPeg: wcData.workingCapitalPeg ?? Math.round(ind.wcPegPct * 1000) / 10, // % value
    };
    setWcData(updated);
    if (deal) upsertDeal({ ...deal, workingCapital: updated });
    toast.success(`Applied ${ind.label} industry defaults`, {
      description: `CapEx = ${(ind.capExPct * 100).toFixed(1)}% of revenue · WC peg = ${(ind.wcPegPct * 100).toFixed(0)}% of revenue.`,
      duration: 3000,
    });
  };

  if (!deal) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Working Capital Analysis</h1>
          <p className="text-muted-foreground mt-2">No deal selected.</p>
        </div>
        <ActiveDealPicker className="max-w-sm" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-bold">Working Capital Analysis</h1>
          <p className="text-muted-foreground mt-2">
            Editing for <span className="font-mono">{deal.companyName?.trim() || "Untitled deal"}</span>. CapEx and WC reserve flow into DSCR and Buyer Cash Flow on the Analyzer.
          </p>
          <div className="mt-2 flex gap-3 items-center">
            <SaveStatus lastSavedAt={lastSavedAt} />
            {analysis?.workingCapital.status && (
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Completeness: <span className="text-foreground font-medium">{analysis.workingCapital.status}</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-end gap-2">
          <ActiveDealPicker className="min-w-[220px]" />
          <Button onClick={save}>Save Working Capital</Button>
        </div>
      </div>

      {ind && revenue && (
        <Card className="border-amber-300 bg-amber-50/30 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Industry default imputation available</CardTitle>
            <CardDescription>
              {ind.label} norms: CapEx ≈ {(ind.capExPct * 100).toFixed(1)}% of revenue, WC peg ≈ {(ind.wcPegPct * 100).toFixed(0)}% of revenue.
              At your revenue ({revenue.toLocaleString()}), that is roughly{" "}
              <strong>${Math.round(revenue * ind.capExPct).toLocaleString()}</strong> annual CapEx and{" "}
              <strong>{(ind.wcPegPct * 100).toFixed(0)}%</strong> WC peg.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={applyIndustryDefaults}>Apply industry defaults to blank fields</Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Imputed values will be tagged "assumed" on the Analyzer assumption-badge panel.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AR / AP / Inventory */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Current Assets & Liabilities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Accounts Receivable ($)" value={wcData.arBalance} onChange={(v) => handleChange("arBalance", v)} />
            <Field label="Accounts Payable ($)" value={wcData.apBalance} onChange={(v) => handleChange("apBalance", v)} />
            <Field label="Inventory ($)" value={wcData.inventoryBalance} onChange={(v) => handleChange("inventoryBalance", v)} />
            <Field label="Cash Included in Deal ($)" value={wcData.cashIncluded} onChange={(v) => handleChange("cashIncluded", v)} />
          </CardContent>
        </Card>

        {/* Days Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cash Conversion Cycle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="DSO — Days Sales Outstanding" value={wcData.dso} onChange={(v) => handleChange("dso", v)} />
            <Field label="DPO — Days Payable Outstanding" value={wcData.dpo} onChange={(v) => handleChange("dpo", v)} />
            <Field label="DIO — Days Inventory Outstanding" value={wcData.dio} onChange={(v) => handleChange("dio", v)} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Liquidity & Risk</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Field label="Monthly Revenue ($)" value={wcData.monthlyRevenue} onChange={(v) => handleChange("monthlyRevenue", v)} />
            <Field label="Monthly Fixed Costs ($)" value={wcData.monthlyFixedCosts} onChange={(v) => handleChange("monthlyFixedCosts", v)} />
            <Field
              label="Seasonality Factor (0.8–1.2)"
              value={wcData.seasonalityFactor}
              step="0.1"
              onChange={(v) => handleChange("seasonalityFactor", v)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Working Capital Peg</CardTitle>
            <CardDescription>% of revenue to hold as working capital</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="WC Peg (% of Revenue)" value={wcData.workingCapitalPeg} step="0.1" onChange={(v) => handleChange("workingCapitalPeg", v)} />
            <Field label="Required Liquidity Buffer (months)" value={wcData.requiredLiquidityBufferMonths} onChange={(v) => handleChange("requiredLiquidityBufferMonths", v)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Debt & Capital Needs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Existing Debt Balance ($)" value={wcData.totalDebtBalance} onChange={(v) => handleChange("totalDebtBalance", v)} />
            <Field label="Annual CapEx Needs ($)" value={wcData.capExNeedsAnnual} onChange={(v) => handleChange("capExNeedsAnnual", v)} />
          </CardContent>
        </Card>
      </div>

      {analysis && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Live Engine Output</CardTitle>
            <CardDescription>How these inputs propagate to the analyzer right now.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm">
            <Stat label="Estimated WC peg" value={fmtMoney(analysis.workingCapital.estimatedPeg)} />
            <Stat label="Liquidity buffer required" value={fmtMoney(analysis.workingCapital.liquidityBufferRequired)} />
            <Stat label="Cash conversion cycle" value={analysis.workingCapital.cashConversionDays === null ? "missing" : `${analysis.workingCapital.cashConversionDays.toFixed(0)} days`} />
            <Stat label="Buyer cash flow (after standby)" value={analysis.buyerCashFlow.buyerCashFlow.display} />
            <Stat label="Cash-on-cash return" value={analysis.buyerCashFlow.cashOnCashReturn.display} />
            <Stat label="DSCR after standby" value={analysis.dscrPair.afterStandby.display} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({
  label, value, onChange, step,
}: { label: string; value: unknown; onChange: (v: number | null) => void; step?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        step={step}
        value={value === null || value === undefined || value === "" ? "" : String(value)}
        onChange={(e) =>
          onChange(e.target.value ? (step ? parseFloat(e.target.value) : parseInt(e.target.value)) : null)
        }
        placeholder=""
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded p-3 bg-card">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-base mt-1">{value}</div>
    </div>
  );
}
