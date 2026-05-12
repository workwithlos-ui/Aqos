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
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Save, Trash2 } from "lucide-react";

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

  function update<K extends keyof DealInput>(key: K, value: DealInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateDiligence(key: keyof NonNullable<DealInput["diligence"]>, value: boolean) {
    setForm((f) => ({ ...f, diligence: { ...f.diligence, [key]: value } }));
  }

  function save() {
    if (!form.companyName.trim()) {
      toast.error("Company name is required");
      return;
    }
    const id = form.id ?? `deal-${Date.now()}`;
    upsertDeal({ ...form, id, updatedAt: new Date().toISOString(), createdAt: form.createdAt ?? new Date().toISOString() });
    toast.success(`${form.companyName} saved`);
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
          <div className="flex items-center gap-2 mt-3">
            <VerdictPill verdict={analysis.verdict.verdict} size="md" />
            <DscrPill label={`DSCR after standby ${analysis.dscrPair.afterStandby.display}`} value={analysis.dscrPair.afterStandby.value} />
            <span className="text-xs font-mono px-2 py-1 rounded border border-border bg-card">
              Score {Math.round(analysis.score.score)}/100 · {analysis.score.bucket}
            </span>
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
          <Button onClick={save}><Save className="size-4 mr-1.5" /> Save deal</Button>
        </div>
      </header>

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
            <div className="col-span-2">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => update("notes", e.target.value || null)} />
            </div>
          </div>

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
              <Metric label="Benchmark band" value={analysis.valuation.benchmarkBandLabel} />
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
            <h2 className="font-display text-lg font-semibold mb-3">Valuation vs benchmark</h2>
            {analysis.valuation.benchmark ? (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                  <Metric label="Benchmark median" value={fmtCurrencyExact(analysis.valuation.benchmarkMedianValue)} />
                  <Metric label="Benchmark low" value={fmtCurrencyExact(analysis.valuation.benchmarkLowValue)} />
                  <Metric label="Benchmark high" value={fmtCurrencyExact(analysis.valuation.benchmarkHighValue)} />
                  <Metric label="Gap vs asking" value={fmtCurrencyExact(analysis.valuation.valueGapVsAsking)} />
                </div>
                <BandTrack
                  low={analysis.valuation.benchmark.low}
                  median={analysis.valuation.benchmark.median}
                  high={analysis.valuation.benchmark.high}
                  current={
                    analysis.earningsBasis === "EBITDA"
                      ? analysis.evToEBITDA.value
                      : analysis.evToSDE.value
                  }
                />
                {analysis.valuation.warnings.map((w) => (
                  <div key={w} className="mt-3 text-xs text-amber-700 flex items-center gap-1.5">
                    <AlertTriangle className="size-3" /> {w}
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
              <h2 className="font-display text-lg font-semibold mb-3">Risk factors</h2>
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
              <div className="flex items-baseline gap-3 mb-3">
                <div className="font-display text-4xl font-semibold">{Math.round(analysis.score.score)}</div>
                <div className="text-sm text-muted-foreground">/ 100 · {analysis.score.bucket}</div>
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

          {/* Verdict + actions + missing data */}
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
