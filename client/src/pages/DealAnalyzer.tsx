import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useDealStore } from "@/lib/acquisition/store";
import {
  analyzeDeal,
  fmtCurrencyExact,
  fmtMultiple,
} from "@/lib/acquisition";
import { listBenchmarkIndustries } from "@/lib/acquisition/benchmarkMultiples";
import type { DealInput, RevenueTrend } from "@/lib/acquisition/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VerdictPill, DscrPill } from "@/components/acq/Verdict";
import { AnomalyBannerStack } from "@/components/acq/AnomalyBanner";
import { SaveStatus, type SaveStatusState } from "@/components/acq/SaveStatus";
import PEReturnsCard from "@/components/acq/PEReturnsCard";
import { getIndustryDefault } from "@/lib/acquisition/industryDefaults";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Save, Trash2, TrendingDown, CheckCircle2, XCircle, Info } from "lucide-react";

const EMPTY: DealInput = {
  companyName: "",
  industry: null,
  location: null,
  stage: "Target Identified",
  annualRevenue: null,
  annualEBITDA: null,
  annualSDE: null,
  askingPrice: null,
  purchasePrice: null,
  revenueTrend: null,
  ownerRole: null,
  customerConcentrationPct: null,
  recurringRevenuePct: null,
  employeeCount: null,
  yearsInBusiness: null,
  diligence: {},
};

const DILIGENCE_FIELDS: Array<{ key: keyof NonNullable<DealInput["diligence"]>; label: string }> = [
  { key: "taxReturnsReceived", label: "Tax returns" },
  { key: "pnlReceived", label: "P&L" },
  { key: "balanceSheetReceived", label: "Balance sheet" },
  { key: "cashFlowStatementReceived", label: "Cash flow statement" },
  { key: "addBacksDocumented", label: "Add-backs documented" },
  { key: "customerListReceived", label: "Customer list" },
  { key: "contractsReceived", label: "Customer contracts" },
  { key: "employeeRosterReceived", label: "Employee roster" },
  { key: "leaseReviewed", label: "Lease reviewed" },
  { key: "debtScheduleReceived", label: "Debt schedule" },
  { key: "qoeComplete", label: "QoE complete" },
];

function num(s: string): number | null {
  if (s.trim() === "") return null;
  const n = parseFloat(s.replace(/[,$]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export default function DealAnalyzer() {
  const params = useParams<{ id?: string }>();
  const { deals, upsertDeal, removeDeal, assumptions } = useDealStore();

  const existing = useMemo(
    () => (params.id ? deals.find((d) => d.id === params.id) : undefined),
    [params.id, deals],
  );

  const [form, setForm] = useState<DealInput>(existing ?? EMPTY);

  useEffect(() => {
    if (existing) setForm(existing);
  }, [existing]);

  const analysis = useMemo(() => analyzeDeal(form, assumptions), [form, assumptions]);

  // P0 ship-blocker 3.6 — save status indicator. Transitions:
  //   idle  → (Save clicked) saving → saved → idle.
  // "saving" must be visible within 500ms of click; "saved" sticks for 3s
  // then collapses to a muted "Saved · Xs ago" label that auto-increments.
  const [saveState, setSaveState] = useState<SaveStatusState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  function update<K extends keyof DealInput>(key: K, value: DealInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // P0 architectural rule — industry-time imputation. The moment the buyer
  // selects (or changes) the industry, both CapEx and WC reserve are filled
  // in from the industry-default table when the buyer has not entered an
  // explicit value. Both are tagged "assumed (industry default)" via the
  // assumption-badge panel below, so the buyer can override at any time.
  useEffect(() => {
    const def = getIndustryDefault(form.industry);
    if (!def || !form.annualRevenue) return;
    const wc = form.workingCapital ?? {};
    const needsCapEx =
      wc.capExNeedsAnnual === null || wc.capExNeedsAnnual === undefined;
    const needsWcPeg =
      wc.workingCapitalPeg === null || wc.workingCapitalPeg === undefined;
    if (!needsCapEx && !needsWcPeg) return;
    setForm((f) => ({
      ...f,
      workingCapital: {
        ...wc,
        ...(needsCapEx
          ? { capExNeedsAnnual: Math.round(form.annualRevenue! * def.capExPct) }
          : {}),
        ...(needsWcPeg ? { workingCapitalPeg: def.wcPct * 100 } : {}),
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.industry, form.annualRevenue]);

  function updateDiligence(key: keyof NonNullable<DealInput["diligence"]>, value: boolean) {
    setForm((f) => ({ ...f, diligence: { ...f.diligence, [key]: value } }));
  }

  function save() {
    if (!form.companyName.trim()) {
      toast.error("Company name is required");
      return;
    }
    setSaveState("saving");
    // Force the user-visible state change within 500ms by performing the
    // upsert on the next microtask and flipping to "saved".  The store is
    // synchronous, so the upsert completes well within budget.
    setTimeout(() => {
      const id = form.id ?? `deal-${Date.now()}`;
      upsertDeal({ ...form, id, updatedAt: new Date().toISOString(), createdAt: form.createdAt ?? new Date().toISOString() });
      setLastSavedAt(Date.now());
      setSaveState("saved");
      toast.success(`${form.companyName} saved`, { duration: 1500 });
      setTimeout(() => setSaveState("idle"), 3000);
    }, 50);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/pipeline" className="text-xs text-muted-foreground inline-flex items-center gap-1 mb-2">
            <ArrowLeft className="size-3" /> Back to pipeline
          </Link>
          <div className="metric-label">Deal Analyzer</div>
          <h1 className="font-display text-3xl font-semibold mt-1">
            {form.companyName || "New deal"}
          </h1>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <VerdictPill verdict={analysis.verdict.verdict} size="md" />
            <DscrPill label={`DSCR after standby ${analysis.dscrPair.afterStandby.display}`} value={analysis.dscrPair.afterStandby.value} />
            <span
              className="text-xs font-mono px-2 py-1 rounded border border-border bg-card"
              title={analysis.finalBucketReason}
            >
              {analysis.scoreLabel} {analysis.score.score === null ? "—" : `${Math.round(analysis.score.score ?? 0)}/100`} · {analysis.finalBucket}
            </span>
            <span className={`text-xs font-mono px-2 py-1 rounded border ${
              analysis.verdict.confidence === "high"
                ? "border-emerald-300/60 bg-emerald-50/60 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                : analysis.verdict.confidence === "medium"
                  ? "border-amber-300/60 bg-amber-50/60 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                  : "border-rose-300/60 bg-rose-50/60 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
            }`}>
              Confidence: {analysis.verdict.confidence}
            </span>
            <SaveStatus state={saveState} lastSavedAt={lastSavedAt} />
          </div>
        </div>
        <div className="flex gap-2">
          {form.id && !form.isTest && (
            <Button
              variant="outline"
              className="bg-card text-rose-600"
              onClick={() => {
                if (form.id) {
                  removeDeal(form.id);
                  toast.success(`${form.companyName} removed`);
                }
              }}
            >
              <Trash2 className="size-4 mr-1.5" /> Delete
            </Button>
          )}
          <Button onClick={save} disabled={saveState === "saving"} data-testid="save-deal-btn">
            <Save className="size-4 mr-1.5" /> {saveState === "saving" ? "Saving…" : "Save deal"}
          </Button>
        </div>
      </header>

      {/* AnomalyBus — single source of engine-detected anomalies, rendered
          directly under the headline verdict.  The Red Team page, IC memo,
          Exports header, Copilot, and Governance gates all subscribe to the
          same `analysis.anomalies` array. */}
      <AnomalyBannerStack anomalies={analysis.anomalies} />

      {/* Input form */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <section className="panel p-6 lg:col-span-2 flex flex-col gap-4">
          <h2 className="font-display text-lg font-semibold">Deal inputs</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Company name</Label>
              <Input value={form.companyName} onChange={(e) => update("companyName", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Industry</Label>
              <Select
                value={form.industry ?? "missing"}
                onValueChange={(v) => update("industry", v === "missing" ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="missing">— missing —</SelectItem>
                  {listBenchmarkIndustries().map((b) => (
                    <SelectItem key={b.industryKey} value={b.industryKey}>{b.industryLabel}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Stage</Label>
              <Select value={(form.stage as string) ?? "Target Identified"} onValueChange={(v) => update("stage", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Target Identified","Contacted","Conversation Held","Financials Requested","Under Analysis","LOI Submitted","Diligence","Closing"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Annual revenue</Label>
              <Input type="number" inputMode="decimal" value={form.annualRevenue ?? ""} onChange={(e) => update("annualRevenue", num(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Annual EBITDA</Label>
              <Input type="number" inputMode="decimal" value={form.annualEBITDA ?? ""} onChange={(e) => update("annualEBITDA", num(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Annual SDE (optional)</Label>
              <Input type="number" inputMode="decimal" value={form.annualSDE ?? ""} onChange={(e) => update("annualSDE", num(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Asking price</Label>
              <Input type="number" inputMode="decimal" value={form.askingPrice ?? ""} onChange={(e) => update("askingPrice", num(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Purchase price (override)</Label>
              <Input type="number" inputMode="decimal" value={form.purchasePrice ?? ""} onChange={(e) => update("purchasePrice", num(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Revenue trend</Label>
              <Select value={(form.revenueTrend as string) ?? "unknown"} onValueChange={(v) => update("revenueTrend", v as RevenueTrend)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="growing">Growing</SelectItem>
                  <SelectItem value="flat">Flat</SelectItem>
                  <SelectItem value="declining">Declining</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Customer concentration %</Label>
              <Input type="number" inputMode="decimal" value={form.customerConcentrationPct ?? ""} onChange={(e) => update("customerConcentrationPct", num(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Owner role</Label>
              <Input value={form.ownerRole ?? ""} onChange={(e) => update("ownerRole", e.target.value || null)} placeholder="e.g. general manager" />
            </div>
            <div>
              <Label className="text-xs">Employees</Label>
              <Input type="number" inputMode="decimal" value={form.employeeCount ?? ""} onChange={(e) => update("employeeCount", num(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Years in business</Label>
              <Input type="number" inputMode="decimal" value={form.yearsInBusiness ?? ""} onChange={(e) => update("yearsInBusiness", num(e.target.value))} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Location</Label>
              <Input value={form.location ?? ""} onChange={(e) => update("location", e.target.value || null)} />
            </div>
            <div>
              <Label className="text-xs">Deal structure</Label>
              <Select
                value={(form.dealStructure as string) ?? "asset"}
                onValueChange={(v) => update("dealStructure", v as "asset" | "stock")}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="asset">Asset purchase (typical SBA)</SelectItem>
                  <SelectItem value="stock">Stock purchase</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => update("notes", e.target.value || null)} />
            </div>
          </div>

          <details className="rounded border border-border bg-muted/30 px-3 py-2">
            <summary className="text-sm font-semibold cursor-pointer">
              Itemized add-backs ({(form.addBackItems ?? []).length})
            </summary>
            <div className="space-y-2 pt-2">
              {(form.addBackItems ?? []).map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <Input
                    className="col-span-5"
                    placeholder="e.g. Owner salary, one-time legal"
                    value={it.label}
                    onChange={(e) => {
                      const next = [...(form.addBackItems ?? [])];
                      next[i] = { ...next[i], label: e.target.value };
                      update("addBackItems", next);
                    }}
                  />
                  <Input
                    className="col-span-3"
                    type="number"
                    inputMode="decimal"
                    placeholder="$"
                    value={it.amount}
                    onChange={(e) => {
                      const next = [...(form.addBackItems ?? [])];
                      next[i] = { ...next[i], amount: Number(e.target.value) || 0 };
                      update("addBackItems", next);
                    }}
                  />
                  <Select
                    value={it.category ?? "other"}
                    onValueChange={(v) => {
                      const next = [...(form.addBackItems ?? [])];
                      next[i] = { ...next[i], category: v as never };
                      update("addBackItems", next);
                    }}
                  >
                    <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner_comp">Owner comp</SelectItem>
                      <SelectItem value="one_time">One-time</SelectItem>
                      <SelectItem value="non_operating">Non-operating</SelectItem>
                      <SelectItem value="discretionary">Discretionary</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    className="col-span-1 text-xs text-destructive hover:underline"
                    onClick={() => {
                      const next = (form.addBackItems ?? []).filter((_, j) => j !== i);
                      update("addBackItems", next);
                    }}
                  >
                    remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-xs underline text-primary"
                onClick={() => {
                  const next = [...(form.addBackItems ?? []), { label: "", amount: 0, category: "owner_comp" as const }];
                  update("addBackItems", next);
                }}
              >
                + Add line item
              </button>
              {(form.addBackItems ?? []).length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Total documented add-backs:{" "}
                  <span className="font-mono">
                    ${(form.addBackItems ?? []).reduce((s, it) => s + (Number(it.amount) || 0), 0).toLocaleString()}
                  </span>
                </p>
              )}
            </div>
          </details>

          <div>
            <h3 className="text-sm font-semibold mt-3 mb-2">Diligence checklist</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {DILIGENCE_FIELDS.map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="rounded border-border"
                    checked={!!form.diligence?.[f.key]}
                    onChange={(e) => updateDiligence(f.key, e.target.checked)}
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* Right: deterministic outputs */}
        <section className="lg:col-span-3 flex flex-col gap-5">
          <div className="panel p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-semibold">Underwriting math</h2>
              <span className="text-[11px] text-muted-foreground">All values are engine-calculated.</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Metric label="Earnings basis" value={analysis.earningsBasis === "missing" ? "missing" : analysis.earningsBasis} />
              <Metric label="Earnings used" value={fmtCurrencyExact(analysis.earningsUsed)} />
              <Metric label="EV / EBITDA" value={analysis.evToEBITDA.display} status={analysis.evToEBITDA.status} formula={analysis.evToEBITDA.formula} />
              <Metric label="EV / SDE" value={analysis.evToSDE.display} status={analysis.evToSDE.status} formula={analysis.evToSDE.formula} />
              <Metric label="EBITDA margin" value={analysis.ebitdaMargin.display} status={analysis.ebitdaMargin.status} />
              <Metric label="SDE margin" value={analysis.sdeMargin.display} status={analysis.sdeMargin.status} />
              <Metric label="Purchase price used" value={fmtCurrencyExact(analysis.capitalStack.purchasePriceUsed)} status={analysis.capitalStack.purchasePriceSource === "missing" ? "missing" : "actual"} />
              <Metric
                label={`Benchmark band${analysis.valuation.compatibility === "reference_only" ? " (reference only)" : analysis.valuation.compatibility === "unavailable" ? " (unavailable)" : ""}`}
                value={analysis.valuation.benchmarkBandLabel}
                status={analysis.valuation.compatibility === "basis_match" ? "actual" : "missing"}
              />
            </div>
          </div>

          {/* Capital stack */}
          <div className="panel p-6">
            <h2 className="font-display text-lg font-semibold mb-3">Capital stack</h2>
            {analysis.capitalStack.warnings.map((w) => (
              <div key={w} className="mb-3 flex items-start gap-2 rounded-lg border border-rose-300/60 bg-rose-50/60 dark:bg-rose-950/20 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                <AlertTriangle className="size-4 mt-0.5" /> {w}
              </div>
            ))}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="text-left py-2">Tranche</th>
                    <th className="text-right py-2">% of price</th>
                    <th className="text-right py-2">Amount</th>
                    <th className="text-right py-2">Rate</th>
                    <th className="text-right py-2">Term</th>
                    <th className="text-right py-2">Annual debt service</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border">
                    <td className="py-2 font-medium">SBA Loan</td>
                    <td className="text-right font-mono">{(assumptions.sbaLoanPct * 100).toFixed(1)}%</td>
                    <td className="text-right font-mono">{fmtCurrencyExact(analysis.capitalStack.sba.amount)}</td>
                    <td className="text-right font-mono">{(assumptions.sbaInterestRate * 100).toFixed(2)}%</td>
                    <td className="text-right font-mono">{assumptions.sbaTermYears}y</td>
                    <td className="text-right font-mono">{fmtCurrencyExact(analysis.capitalStack.sba.annualDebtService)}</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="py-2 font-medium">Seller Note <span className="text-xs text-muted-foreground">({assumptions.sellerNoteStandbyMonths}mo standby)</span></td>
                    <td className="text-right font-mono">{(assumptions.sellerNotePct * 100).toFixed(1)}%</td>
                    <td className="text-right font-mono">{fmtCurrencyExact(analysis.capitalStack.sellerNote.amount)}</td>
                    <td className="text-right font-mono">{(assumptions.sellerNoteRate * 100).toFixed(2)}%</td>
                    <td className="text-right font-mono">{assumptions.sellerNoteTermYears}y</td>
                    <td className="text-right font-mono">{fmtCurrencyExact(analysis.capitalStack.sellerNote.annualDebtService)}</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="py-2 font-medium">Buyer Equity</td>
                    <td className="text-right font-mono">{(assumptions.buyerEquityPct * 100).toFixed(1)}%</td>
                    <td className="text-right font-mono">{fmtCurrencyExact(analysis.capitalStack.buyerEquity.amount)}</td>
                    <td className="text-right font-mono">—</td>
                    <td className="text-right font-mono">—</td>
                    <td className="text-right font-mono">—</td>
                  </tr>
                  <tr className="border-t-2 border-border bg-muted/30">
                    <td className="py-2 font-semibold">Total sources</td>
                    <td className="text-right font-mono font-semibold">{(analysis.capitalStack.pctTotal * 100).toFixed(1)}%</td>
                    <td className="text-right font-mono font-semibold">{fmtCurrencyExact(analysis.capitalStack.totalSources)}</td>
                    <td className="text-right text-xs text-muted-foreground" colSpan={2}>Δ vs purchase price</td>
                    <td className="text-right font-mono">{fmtCurrencyExact(analysis.capitalStack.differenceVsPurchasePrice)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
              <Metric label="Total annual debt service" value={fmtCurrencyExact(analysis.capitalStack.totalAnnualDebtService)} />
              <Metric label="During standby" value={fmtCurrencyExact(analysis.capitalStack.totalAnnualDebtServiceDuringStandby)} />
              <Metric label="DSCR during standby" value={analysis.dscrPair.duringStandby.display} status={analysis.dscrPair.duringStandby.status} />
              <Metric label="DSCR after standby" value={analysis.dscrPair.afterStandby.display} status={analysis.dscrPair.afterStandby.status} />
            </div>
          </div>

          {/* Valuation band */}
          <div className="panel p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg font-semibold">Valuation vs benchmark</h2>
              <span className={`text-[11px] uppercase tracking-wider px-2 py-1 rounded ${
                analysis.valuation.compatibility === "basis_match"
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : analysis.valuation.compatibility === "reference_only"
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                    : "bg-muted text-muted-foreground"
              }`}>
                {analysis.valuation.compatibility === "basis_match" && `Comparable — ${analysis.valuation.benchmark?.basis} basis match`}
                {analysis.valuation.compatibility === "reference_only" && `Reference only — ${analysis.valuation.benchmark?.basis} band, ${analysis.earningsBasis} earnings`}
                {analysis.valuation.compatibility === "unavailable" && "Benchmark unavailable"}
              </span>
            </div>
            {analysis.valuation.benchmark ? (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                  <Metric label={`Benchmark median (${analysis.valuation.benchmark.basis})`} value={fmtCurrencyExact(analysis.valuation.benchmarkMedianValue)} />
                  <Metric label={`Benchmark low (${analysis.valuation.benchmark.basis})`} value={fmtCurrencyExact(analysis.valuation.benchmarkLowValue)} />
                  <Metric label={`Benchmark high (${analysis.valuation.benchmark.basis})`} value={fmtCurrencyExact(analysis.valuation.benchmarkHighValue)} />
                  <Metric
                    label="Gap vs asking"
                    value={analysis.valuation.compatibility === "basis_match" ? fmtCurrencyExact(analysis.valuation.valueGapVsAsking) : "n/a"}
                    status={analysis.valuation.compatibility === "basis_match" ? "actual" : "missing"}
                  />
                </div>
                {analysis.valuation.compatibility === "basis_match" ? (
                  <BandTrack
                    low={analysis.valuation.benchmark.low}
                    median={analysis.valuation.benchmark.median}
                    high={analysis.valuation.benchmark.high}
                    current={analysis.valuation.comparisonMultiple.value}
                  />
                ) : (
                  <div className="rounded-lg border border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                    <AlertTriangle className="size-4 mt-0.5" />
                    <span>
                      {analysis.valuation.compatibility === "reference_only"
                        ? `This deal's earnings are reported as ${analysis.earningsBasis}, but the only benchmark we have for ${analysis.valuation.benchmark.industryLabel} is in ${analysis.valuation.benchmark.basis}. The band is shown for reference — it does NOT score this deal and is not used to set band position.`
                        : "No benchmark band is available for this combination of industry and earnings basis."}
                    </span>
                  </div>
                )}
                {analysis.valuation.warnings.map((w) => (
                  <div key={w} className="mt-3 text-xs text-amber-700 flex items-start gap-1.5">
                    <AlertTriangle className="size-3 mt-0.5" /> <span>{w}</span>
                  </div>
                ))}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">
                Industry missing — benchmark band unavailable. Add an industry to unlock the band view.
              </div>
            )}
          </div>

          {/* Risk + scoring + missing data */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="panel p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-lg font-semibold">Risk factors</h2>
                <span className={`text-[11px] uppercase tracking-wider px-2 py-1 rounded ${
                  analysis.risk.riskConfidence === "high"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : analysis.risk.riskConfidence === "medium"
                      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                      : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                }`}>
                  Risk confidence: {analysis.risk.riskConfidence}
                </span>
              </div>
              {(() => {
                const total = analysis.risk.totalFactors;
                const inferred = analysis.risk.factors.filter((f) => f.score !== null).length;
                const confirmed = analysis.risk.factors.filter((f) => f.source === "actual").length;
                return (
                  <p
                    className="text-xs text-muted-foreground mb-3"
                    data-testid="risk-panel-completeness"
                  >
                    <span className="font-mono text-foreground">
                      {inferred} of {total} engine-inferred · {confirmed} of {total} buyer-confirmed
                    </span>
                    <span className="ml-2">
                      Confirm each factor to grow the Risk score from {confirmed * 4}/20 toward 20/20.
                    </span>
                  </p>
                );
              })()}
              <ul className="flex flex-col gap-2">
                {analysis.risk.factors.map((f) => (
                  <li key={f.key} className="flex items-start justify-between gap-3 border-b border-border/60 last:border-0 pb-2 last:pb-0">
                    <div>
                      <div className="text-sm font-medium">{f.label}</div>
                      <div className="text-xs text-muted-foreground">{f.rationale}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-mono">{f.score === null ? "—" : `${f.score}/5`}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{f.level}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="panel p-6">
              <h2 className="font-display text-lg font-semibold mb-3">Deterministic score</h2>
              <div className="flex items-baseline gap-3 mb-1">
                <div className="font-display text-4xl font-semibold">{analysis.score.score === null ? "—" : Math.round(analysis.score.score ?? 0)}</div>
                <div className="text-sm text-muted-foreground">{analysis.score.score === null ? `${analysis.finalBucket}` : `/ 100 · ${analysis.finalBucket}`}</div>
              </div>
              <div className="text-xs text-muted-foreground mb-3">
                <span className="font-semibold">{analysis.scoreLabel}</span>
                {analysis.verdict.isPreliminary && (
                  <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    Preliminary · confidence {analysis.verdict.confidence}
                  </span>
                )}
                <div className="mt-1">{analysis.verdict.confidenceReason}</div>
              </div>
              <ul className="text-xs flex flex-col gap-1.5">
                {analysis.score.contributions.map((c) => (
                  <li key={c.category} className="flex justify-between gap-2">
                    <span>{c.category}</span>
                    <span className="font-mono">{c.earned}/{c.available}</span>
                  </li>
                ))}
              </ul>
              {analysis.score.capsApplied.length > 0 && (
                <div className="mt-3 text-xs text-amber-700 dark:text-amber-400">
                  <div className="font-semibold mb-1">Score caps applied</div>
                  <ul className="list-disc pl-4">
                    {analysis.score.capsApplied.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {analysis.score.blockerReason && (
                <div className="mt-3 text-xs text-rose-700 dark:text-rose-400">
                  <AlertTriangle className="inline size-3 mr-1" />
                  {analysis.score.blockerReason}
                </div>
              )}
            </div>
          </div>

          {/* Acquisition Priority gate — single source of truth for bucket */}
          <div className="panel p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h2 className="font-display text-lg font-semibold">Acquisition Priority gate</h2>
              <div className="text-xs font-mono">
                {analysis.acquisitionPriorityGate.passed ? (
                  <span className="px-2 py-0.5 rounded border border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                    All checks pass — eligible
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded border border-amber-300/60 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    {analysis.acquisitionPriorityGate.reasons.length} check(s) failed — cannot promote
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-3 max-w-2xl">
              {analysis.finalBucketReason}
            </p>
            <ul className="text-xs flex flex-col gap-1.5">
              {analysis.acquisitionPriorityGate.checks.map((c) => (
                <li key={c.name} className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 size-2 rounded-full flex-shrink-0 ${
                      c.passed ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                  />
                  <span className="flex-1">
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-muted-foreground"> · {c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Buyer Cash Flow ─────────────────────────────────────────── */}
          <div className="panel p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg font-semibold">Buyer cash flow after debt service</h2>
              <span className="text-[11px] text-muted-foreground">EBITDA − Total Debt Service − CapEx − WC Reserve</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              <Metric label="Earnings used" value={fmtCurrencyExact(analysis.buyerCashFlow.earningsUsed)} />
              <Metric label="Total annual debt service" value={fmtCurrencyExact(analysis.buyerCashFlow.totalAnnualDebtService)} />
              <Metric label="Required CapEx" value={fmtCurrencyExact(analysis.buyerCashFlow.requiredCapEx)} />
              <Metric label="WC reserve" value={fmtCurrencyExact(analysis.buyerCashFlow.workingCapitalReserve)} />
              <Metric
                label="Buyer cash flow (after standby)"
                value={analysis.buyerCashFlow.buyerCashFlow.display}
                status={analysis.buyerCashFlow.buyerCashFlow.status}
                formula={analysis.buyerCashFlow.buyerCashFlow.formula}
              />
              <Metric
                label="Buyer cash flow (during standby)"
                value={analysis.buyerCashFlow.buyerCashFlowDuringStandby.display}
                status={analysis.buyerCashFlow.buyerCashFlowDuringStandby.status}
              />
              <Metric
                label="Cash-on-cash return"
                value={analysis.buyerCashFlow.cashOnCashReturn.display}
                status={analysis.buyerCashFlow.cashOnCashReturn.status}
              />
            </div>
            {analysis.buyerCashFlow.warnings.map((w) => (
              <div key={w} className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 mt-1">
                <AlertTriangle className="size-3 mt-0.5" /> {w}
              </div>
            ))}
          </div>

          {/* ── Max Supportable Purchase Price ──────────────────────────── */}
          <div className="panel p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg font-semibold">Max supportable purchase price</h2>
              <span className={`text-[11px] px-2 py-0.5 rounded font-mono ${
                analysis.maxSupportablePP.priceIsSupported
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                  : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
              }`}>
                {analysis.maxSupportablePP.priceIsSupported ? "Current price supported" : "Current price NOT supported"}
              </span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              <Metric label="At 1.25x DSCR" value={fmtCurrencyExact(analysis.maxSupportablePP.at1_25x)} />
              <Metric label="At 1.50x DSCR" value={fmtCurrencyExact(analysis.maxSupportablePP.at1_50x)} />
              <Metric label="At 2.00x DSCR" value={fmtCurrencyExact(analysis.maxSupportablePP.at2_00x)} />
              <Metric label="Current price" value={fmtCurrencyExact(analysis.maxSupportablePP.currentPrice)} />
            </div>
            {analysis.maxSupportablePP.warnings.map((w) => (
              <div key={w} className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 mt-1">
                <AlertTriangle className="size-3 mt-0.5" /> {w}
              </div>
            ))}
          </div>

          {/* ── Stress Test Panel ────────────────────────────────────────── */}
          <div className="panel p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg font-semibold">Stress test panel</h2>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] px-2 py-0.5 rounded font-mono ${
                  analysis.stressTest.stressRating === "resilient" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                  : analysis.stressTest.stressRating === "moderate" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                  : analysis.stressTest.stressRating === "fragile" ? "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300"
                  : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
                }`}>
                  {analysis.stressTest.stressRating === "missing" ? "Stress: missing earnings" : `Stress: ${analysis.stressTest.stressRating}`}
                </span>
              </div>
            </div>
            {analysis.stressTest.scenarios.length === 0 ? (
              <div className="text-sm text-muted-foreground">Earnings or price missing — stress tests cannot run.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left py-2">Scenario</th>
                      <th className="text-right py-2">DSCR during</th>
                      <th className="text-right py-2">DSCR after</th>
                      <th className="text-right py-2">Pass (1.25x)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.stressTest.scenarios.map((s) => (
                      <tr key={s.label} className="border-b border-border/60 last:border-0">
                        <td className="py-2 font-medium">{s.label}</td>
                        <td className="text-right font-mono">{s.dscrDuringStandby.display}</td>
                        <td className="text-right font-mono">{s.dscrAfterStandby.display}</td>
                        <td className="text-right">
                          {s.pass
                            ? <CheckCircle2 className="size-4 text-emerald-600 ml-auto" />
                            : <XCircle className="size-4 text-rose-600 ml-auto" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Worst-case DSCR: {analysis.stressTest.worstCaseDscr === null ? "missing" : analysis.stressTest.worstCaseDscr.toFixed(2) + "x"}
                  {" · "}{analysis.stressTest.allScenariosPass ? "All scenarios pass" : analysis.stressTest.anyScenariosPass ? "Some scenarios pass" : "All scenarios fail"}
                </div>
              </div>
            )}
          </div>

          {/* ── Refined Verdict + Recommended Offer ─────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="panel p-6">
              <h2 className="font-display text-lg font-semibold mb-3">Deal verdict</h2>
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold mb-3 ${
                analysis.refinedVerdict.verdict === "Strong Pursue"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : analysis.refinedVerdict.verdict === "Pursue with Conditions"
                    ? "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                    : analysis.refinedVerdict.verdict === "Renegotiate"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                      : analysis.refinedVerdict.verdict === "Freeze"
                        ? "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300"
                        : "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
              }`}>
                <TrendingDown className="size-4" />
                {analysis.refinedVerdict.verdict}
              </div>
              <p className="text-sm leading-relaxed mb-3">{analysis.refinedVerdict.buyerReason}</p>
              {analysis.refinedVerdict.conditions.length > 0 && (
                <div>
                  <div className="metric-label mb-1">Conditions</div>
                  <ul className="list-disc pl-5 text-xs space-y-0.5">
                    {analysis.refinedVerdict.conditions.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                </div>
              )}
              <div className="mt-3 text-xs text-muted-foreground">Urgency: <span className="font-semibold">{analysis.refinedVerdict.urgency}</span></div>
            </div>
            <div className="panel p-6">
              <h2 className="font-display text-lg font-semibold mb-3">Recommended offer</h2>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Metric label="Opening offer" value={fmtCurrencyExact(analysis.recommendedOffer.openingOffer)} />
                <Metric label="Target price" value={fmtCurrencyExact(analysis.recommendedOffer.targetPrice)} />
                <Metric label="Maximum price" value={fmtCurrencyExact(analysis.recommendedOffer.maximumPrice)} />
                <Metric label="Seller note" value={fmtCurrencyExact(analysis.recommendedOffer.sellerNoteAmount)} />
                {analysis.recommendedOffer.earnoutAmount !== null && (
                  <Metric label="Earnout" value={fmtCurrencyExact(analysis.recommendedOffer.earnoutAmount)} />
                )}
                <Metric label="Transition period" value={`${analysis.recommendedOffer.requiredTransitionWeeks} weeks`} />
              </div>
              <div className="text-xs text-muted-foreground mb-2">
                <span className="font-semibold">Structure:</span> {analysis.recommendedOffer.preferredStructure}
              </div>              <p className="text-xs leading-relaxed text-muted-foreground">{analysis.recommendedOffer.rationale}</p>
              {analysis.recommendedOffer.warnings.map((w) => (
                <div key={w} className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 mt-1">
                  <AlertTriangle className="size-3 mt-0.5" /> {w}
                </div>
              ))}
            </div>
          </div>

          {/* ── PE-grade Returns Projection (Iteration 9) ─────────────────── */}
          <PEReturnsCard result={analysis.peReturns} />

          {/* ── Auto-generated Diligence Checklist ────────────────────────── */}          <div className="panel p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg font-semibold">Auto-generated diligence checklist</h2>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{analysis.autoDiligence.completionPct}% complete</span>
                <span className={`px-2 py-0.5 rounded font-mono ${
                  analysis.autoDiligence.readyForLOI ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                }`}>{analysis.autoDiligence.readyForLOI ? "LOI ready" : "Not LOI ready"}</span>
                <span className={`px-2 py-0.5 rounded font-mono ${
                  analysis.autoDiligence.readyForLender ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                }`}>{analysis.autoDiligence.readyForLender ? "Lender ready" : "Not lender ready"}</span>
              </div>
            </div>
            {analysis.autoDiligence.items.length === 0 ? (
              <div className="text-sm text-muted-foreground">No diligence items generated — add industry and deal data.</div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {analysis.autoDiligence.items.map((item) => (
                  <div key={item.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                    item.status === "received"
                      ? "border-emerald-300/60 bg-emerald-50/40 dark:bg-emerald-950/20"
                      : item.priority === "critical"
                        ? "border-rose-300/60 bg-rose-50/40 dark:bg-rose-950/20"
                        : item.priority === "important"
                          ? "border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/20"
                          : "border-border bg-background/60"
                  }`}>
                    <span className={`mt-0.5 size-2 rounded-full flex-shrink-0 ${
                      item.status === "received" ? "bg-emerald-500"
                      : item.priority === "critical" ? "bg-rose-500"
                      : item.priority === "important" ? "bg-amber-500"
                      : "bg-slate-400"
                    }`} />
                    <div className="flex-1">
                      <div className="font-medium">{item.label}</div>
                      <div className="text-muted-foreground">{item.reason}</div>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Data Quality Score + Assumption Badges ──────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="panel p-6">
              <h2 className="font-display text-lg font-semibold mb-3">Data quality score</h2>
              <div className="flex items-baseline gap-3 mb-2">
                <div className="font-display text-4xl font-semibold">{analysis.dataQuality.score}</div>
                <div className="text-sm text-muted-foreground">/ 100 · {analysis.dataQuality.label}</div>
              </div>
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden mb-3">
                <div
                  className={`h-full rounded-full transition-all ${
                    analysis.dataQuality.score >= 80 ? "bg-emerald-500"
                    : analysis.dataQuality.score >= 60 ? "bg-amber-500"
                    : analysis.dataQuality.score >= 40 ? "bg-orange-500"
                    : "bg-rose-500"
                  }`}
                  style={{ width: `${analysis.dataQuality.score}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mb-3">{analysis.dataQuality.rationale}</p>
              {analysis.dataQuality.criticalGaps.length > 0 && (
                <div className="mb-2">
                  <div className="metric-label mb-1">Critical gaps</div>
                  <ul className="list-disc pl-4 text-xs space-y-0.5">
                    {analysis.dataQuality.criticalGaps.map((g) => <li key={g} className="text-rose-700 dark:text-rose-400">{g}</li>)}
                  </ul>
                </div>
              )}
              {analysis.dataQuality.importantGaps.length > 0 && (
                <div>
                  <div className="metric-label mb-1">Important gaps</div>
                  <ul className="list-disc pl-4 text-xs space-y-0.5">
                    {analysis.dataQuality.importantGaps.map((g) => <li key={g} className="text-amber-700 dark:text-amber-400">{g}</li>)}
                  </ul>
                </div>
              )}
            </div>
            <div className="panel p-6">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="font-display text-lg font-semibold">Assumption badges</h2>
                <span title="Every output is tagged with its data source.">
                  <Info className="size-4 text-muted-foreground" />
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">Each output is tagged: user-provided, engine-calculated, assumed, missing, or needs-verification.</p>
              <div className="flex flex-wrap gap-2">
                {analysis.assumptionBadges.map((b) => (
                  <div
                    key={b.field}
                    title={b.detail ?? b.field}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                      b.status === "user-provided" ? "border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                      : b.status === "engine-calculated" ? "border-blue-300/60 bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300"
                      : b.status === "assumed" ? "border-amber-300/60 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                      : b.status === "missing" ? "border-rose-300/60 bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
                      : "border-slate-300/60 bg-slate-50 text-slate-700 dark:bg-slate-950/30 dark:text-slate-300"
                    }`}
                  >
                    <span className={`size-1.5 rounded-full ${
                      b.status === "user-provided" ? "bg-emerald-500"
                      : b.status === "engine-calculated" ? "bg-blue-500"
                      : b.status === "assumed" ? "bg-amber-500"
                      : b.status === "missing" ? "bg-rose-500"
                      : "bg-slate-400"
                    }`} />
                    {b.field}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                {(["user-provided", "engine-calculated", "assumed", "missing", "needs-verification"] as const).map((s) => (
                  <span key={s} className="flex items-center gap-1">
                    <span className={`size-1.5 rounded-full ${
                      s === "user-provided" ? "bg-emerald-500"
                      : s === "engine-calculated" ? "bg-blue-500"
                      : s === "assumed" ? "bg-amber-500"
                      : s === "missing" ? "bg-rose-500"
                      : "bg-slate-400"
                    }`} />
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ── Verdict + actions + missing data ────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="panel p-6">
              <h2 className="font-display text-lg font-semibold mb-3">Verdict</h2>
              <VerdictPill verdict={analysis.verdict.verdict} size="lg" />
              <p className="text-sm leading-relaxed mt-3">{analysis.verdict.rationale}</p>
              {analysis.verdict.blockers.length > 0 && (
                <div className="mt-3">
                  <div className="metric-label mb-1">Blockers</div>
                  <ul className="list-disc pl-5 text-xs">
                    {analysis.verdict.blockers.map((b) => <li key={b}>{b}</li>)}
                  </ul>
                </div>
              )}
              <div className="mt-3 text-xs text-muted-foreground">
                Confidence: <span className="font-semibold">{analysis.verdict.confidence}</span>
                {analysis.verdict.isPreliminary && (
                  <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    Preliminary
                  </span>
                )}
                <div className="mt-1">{analysis.verdict.confidenceReason}</div>
              </div>
              {analysis.nextActions.length > 0 && (
                <div className="mt-4">
                  <div className="metric-label mb-1">Next actions</div>
                  <ol className="list-decimal pl-5 text-sm space-y-1">
                    {analysis.nextActions.map((n, i) => <li key={i}>{n}</li>)}
                  </ol>
                </div>
              )}
            </div>
            <div className="panel p-6">
              <h2 className="font-display text-lg font-semibold mb-3">Missing data</h2>
              <MissingList title="Critical" items={analysis.missingData.criticalMissing} accent="rose" />
              <MissingList title="Important" items={analysis.missingData.importantMissing} accent="amber" />
              <MissingList title="Nice-to-have" items={analysis.missingData.niceToHaveMissing} accent="slate" />
              <div className="text-xs text-muted-foreground mt-3 leading-relaxed">
                Can underwrite: <b>{String(analysis.missingData.canUnderwrite)}</b> · Rank as priority:{" "}
                <b>{String(analysis.missingData.canRankAsAcquisitionPriority)}</b> · LOI ready:{" "}
                <b>{String(analysis.missingData.canGenerateLOI)}</b> · Lender ready:{" "}
                <b>{String(analysis.missingData.canGenerateLenderPackage)}</b>
              </div>
              <Link href={`/exports/${analysis.dealId ?? ""}`}>
                <Button className="mt-4 w-full">Open exports</Button>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  status,
  formula,
}: {
  label: string;
  value: string;
  status?: "actual" | "estimated" | "missing" | "invalid";
  formula?: string;
}) {
  const isMissing = status === "missing" || value === "missing" || value === "—";
  const isInvalid = status === "invalid" || value === "invalid";
  return (
    <div className="rounded-xl border border-border bg-background/60 px-3 py-2.5">
      <div className="metric-label">{label}</div>
      <div className={`font-mono mt-1 text-sm ${isInvalid ? "text-rose-600" : isMissing ? "text-muted-foreground" : ""}`}>
        {isInvalid ? "invalid" : isMissing ? "missing" : value}
      </div>
      {formula && <div className="text-[10px] text-muted-foreground mt-1 truncate">{formula}</div>}
    </div>
  );
}

function MissingList({ title, items, accent }: { title: string; items: string[]; accent: "rose" | "amber" | "slate" }) {
  const dot = accent === "rose" ? "bg-rose-500" : accent === "amber" ? "bg-amber-500" : "bg-slate-500";
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={`size-1.5 rounded-full ${dot}`} />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title} ({items.length})</span>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground pl-3.5">— Complete —</div>
      ) : (
        <ul className="list-disc pl-5 text-xs space-y-0.5">
          {items.map((i) => <li key={i}>{i}</li>)}
        </ul>
      )}
    </div>
  );
}

function BandTrack({ low, median, high, current }: { low: number; median: number; high: number; current: number | null }) {
  const span = Math.max(high * 1.4 - low * 0.7, 0.01);
  const start = low * 0.7;
  const lowPos = ((low - start) / span) * 100;
  const medianPos = ((median - start) / span) * 100;
  const highPos = ((high - start) / span) * 100;
  const currentPos = current !== null ? Math.max(0, Math.min(100, ((current - start) / span) * 100)) : null;

  return (
    <div className="relative h-12">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-muted" />
      <div
        className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-400"
        style={{ left: `${lowPos}%`, width: `${highPos - lowPos}%` }}
      />
      <Tick pos={lowPos} label={`Low ${fmtMultiple(low)}`} />
      <Tick pos={medianPos} label={`Median ${fmtMultiple(median)}`} bold />
      <Tick pos={highPos} label={`High ${fmtMultiple(high)}`} />
      {currentPos !== null && (
        <div className="absolute -top-2" style={{ left: `${currentPos}%`, transform: "translateX(-50%)" }}>
          <div className="size-3 rounded-full bg-foreground border-2 border-background shadow" />
          <div className="text-[10px] mt-1 font-mono whitespace-nowrap">Current {current !== null ? fmtMultiple(current) : "—"}</div>
        </div>
      )}
    </div>
  );
}
function Tick({ pos, label, bold }: { pos: number; label: string; bold?: boolean }) {
  return (
    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-[10px] text-muted-foreground"
         style={{ left: `${pos}%` }}>
      <div className={`mx-auto h-3 w-px ${bold ? "bg-foreground" : "bg-muted-foreground"}`} />
      <div className={`mt-1 whitespace-nowrap ${bold ? "font-semibold text-foreground" : ""}`}>{label}</div>
    </div>
  );
}
