// Underwriting page — verified deterministic underwriting plus stress tests.
//
// Hard-refactor rules enforced here:
//   • Purchase price comes from the engine's normalizedPurchasePrice (override
//     or asking). EBITDA × multiple is ONLY used in the optional Scenario
//     Valuation block, clearly labelled "Scenario Value", never "Purchase Price".
//   • Capital stack uses the global assumptions store via analyzeDeal(). No
//     local 60/20/20 / 70/15/15 hard-codes anywhere on this page.
//   • DSCR comes from the engine's dscrPair (during/after standby) — there is
//     no `sba * 0.08 + seller * 0.05` shortcut.
//   • Missing values render as the literal string "missing". Nothing is silently
//     coerced to 0, NaN, or Infinity.
//   • Stress tests re-run the same analyzeDeal(input, assumptions) so the
//     stressed DSCR uses the same engine as the Deal Analyzer.

import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDealStore } from "@/lib/acquisition/store";
import { analyzeDeal, fmtCurrencyExact, fmtMultiple } from "@/lib/acquisition";
import type { DealAnalysis, DealInput, CapitalStackAssumptions, StressScenario as EngineScenario } from "@/lib/acquisition/types";
import { VerdictPill, DscrPill } from "@/components/acq/Verdict";
import { ArrowLeft, Calculator, AlertTriangle } from "lucide-react";

function money(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "missing" : fmtCurrencyExact(v);
}
function mult(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "missing" : fmtMultiple(v);
}
function pctText(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "missing";
  return `${(v * 100).toFixed(1)}%`;
}

// Stress scenarios are owned by the engine (buyerAdvisory.computeStressTest)
// so the Analyzer and Underwriting always show the SAME set of scenarios.

function dscrFlag(value: number | null): { label: string; tone: "ok" | "warn" | "bad" | "n/a" } {
  if (value === null || !Number.isFinite(value)) return { label: "N/A", tone: "n/a" };
  if (value >= 1.5) return { label: "Strong", tone: "ok" };
  if (value >= 1.25) return { label: "Pass", tone: "ok" };
  if (value >= 1.0) return { label: "Risky", tone: "warn" };
  return { label: "Fail", tone: "bad" };
}

function ScenarioRow({ scenario }: { scenario: EngineScenario }) {
  const during = scenario.dscrDuringStandby.value;
  const after = scenario.dscrAfterStandby.value;
  const tone = dscrFlag(after);
  return (
    <tr className="border-t border-border/60 align-top">
      <td className="py-3 pr-4">
        <div className="font-semibold">{scenario.label}</div>
        <div className="text-xs text-muted-foreground">{scenario.description}</div>
      </td>
      <td className="py-3 pr-4 font-mono text-sm">{scenario.dscrDuringStandby.display}</td>
      <td className="py-3 pr-4 font-mono text-sm">{scenario.dscrAfterStandby.display}</td>
      <td className="py-3 pr-4">
        <Badge variant={tone.tone === "ok" ? "default" : tone.tone === "warn" ? "secondary" : "destructive"}>
          {scenario.pass ? "Pass" : "Fail"}
        </Badge>
      </td>
      <td className="py-3 pr-4 text-xs text-muted-foreground">
        {scenario.failReason ? scenario.failReason : "DSCR still clears the lender threshold."}
      </td>
    </tr>
  );
}

export default function Underwriting() {
  const params = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const { deals, assumptions } = useDealStore();

  const [selectedDealId, setSelectedDealId] = useState<string | undefined>(
    params.id ?? deals.find((d) => !d.isDemo && !d.isTest)?.id ?? deals[0]?.id,
  );

  const selectedDeal = useMemo(
    () => deals.find((d) => d.id === selectedDealId) ?? deals[0],
    [deals, selectedDealId],
  );

  // Engine analysis using the GLOBAL capital stack assumptions. No local stack.
  const analysis = useMemo<DealAnalysis | null>(
    () => (selectedDeal ? analyzeDeal(selectedDeal, assumptions) : null),
    [selectedDeal, assumptions],
  );

  // Stress test — use the SAME engine output as Deal Analyzer to guarantee parity.
  const stress = analysis?.stressTest.scenarios ?? [];

  // Optional scenario valuation — explicitly labelled, NEVER overrides PP.
  const [scenarioMultiple, setScenarioMultiple] = useState<number>(3.5);
  const scenarioValue =
    analysis && analysis.earningsUsed !== null && analysis.earningsUsed > 0
      ? analysis.earningsUsed * scenarioMultiple
      : null;

  if (!selectedDeal || !analysis) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-semibold">Underwriting</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Calculator className="mx-auto mb-3 size-10 opacity-40" />
            No deals available. Add one in{" "}
            <Link href="/analyze">
              <span className="text-primary hover:underline">Deal Analyzer</span>
            </Link>
            .
          </CardContent>
        </Card>
      </div>
    );
  }

  const pp = analysis.normalizedPurchasePrice;
  const ppSource = analysis.normalizedPurchasePriceSource;
  const dscrAfter = analysis.dscrPair.afterStandby.value;
  const dscrDuring = analysis.dscrPair.duringStandby.value;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/pipeline">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="size-3" /> Pipeline
            </span>
          </Link>
          <h1 className="font-display text-3xl font-semibold mt-2">Underwriting</h1>
          <p className="text-sm text-muted-foreground max-w-2xl mt-1">
            Verified underwriting view powered by the same deterministic engine as Deal Analyzer.
            Capital stack uses the global assumptions; missing values stay missing.
          </p>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={selectedDealId ?? ""}
            onChange={(e) => {
              setSelectedDealId(e.target.value);
              navigate(`/underwriting/${e.target.value}`);
            }}
          >
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.companyName || "(unnamed deal)"}
                {d.isDemo ? " [DEMO]" : d.isTest ? " [TEST]" : ""}
              </option>
            ))}
          </select>
          <Link href="/assumptions">
            <Button variant="outline" size="sm">Edit global capital stack</Button>
          </Link>
        </div>
      </div>

      {/* Verdict + score */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-2xl font-display">{analysis.companyName || <span className="text-muted-foreground">missing</span>}</CardTitle>
              <CardDescription>
                {analysis.scoreLabel}: <span className="font-semibold text-foreground">{Math.round(analysis.score.score)}/100</span>
                {" · "}Confidence: <span className="font-semibold text-foreground">{analysis.verdict.confidence}</span>
                {" · "}{analysis.verdict.confidenceReason}
              </CardDescription>
            </div>
            <VerdictPill verdict={analysis.verdict.verdict} size="lg" />
          </div>
        </CardHeader>
      </Card>

      {/* Capital stack & DSCR */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Capital Stack & Debt Service</CardTitle>
            <CardDescription>
              Purchase price used: <span className="font-semibold text-foreground">{money(pp)}</span>{" "}
              <span className="text-xs">(source: {ppSource})</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="text-left py-2 pr-3">Component</th>
                    <th className="text-right py-2 pr-3">% of price</th>
                    <th className="text-right py-2 pr-3">Amount</th>
                    <th className="text-right py-2 pr-3">Rate</th>
                    <th className="text-right py-2 pr-3">Term</th>
                    <th className="text-right py-2">Annual debt service</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/40">
                    <td className="py-2 pr-3 font-medium">SBA Loan</td>
                    <td className="text-right py-2 pr-3 font-mono">{(assumptions.sbaLoanPct * 100).toFixed(0)}%</td>
                    <td className="text-right py-2 pr-3 font-mono">{money(analysis.capitalStack.sba.amount)}</td>
                    <td className="text-right py-2 pr-3 font-mono">{(assumptions.sbaInterestRate * 100).toFixed(2)}%</td>
                    <td className="text-right py-2 pr-3 font-mono">{assumptions.sbaTermYears}y</td>
                    <td className="text-right py-2 font-mono">{money(analysis.capitalStack.sba.annualDebtService)}</td>
                  </tr>
                  <tr className="border-b border-border/40">
                    <td className="py-2 pr-3 font-medium">
                      Seller Note
                      {assumptions.sellerNoteStandbyMonths > 0 && (
                        <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {assumptions.sellerNoteStandbyMonths}mo standby
                        </span>
                      )}
                    </td>
                    <td className="text-right py-2 pr-3 font-mono">{(assumptions.sellerNotePct * 100).toFixed(0)}%</td>
                    <td className="text-right py-2 pr-3 font-mono">{money(analysis.capitalStack.sellerNote.amount)}</td>
                    <td className="text-right py-2 pr-3 font-mono">{(assumptions.sellerNoteRate * 100).toFixed(2)}%</td>
                    <td className="text-right py-2 pr-3 font-mono">{assumptions.sellerNoteTermYears}y</td>
                    <td className="text-right py-2 font-mono">{money(analysis.capitalStack.sellerNote.annualDebtService)}</td>
                  </tr>
                  <tr className="border-b border-border/40">
                    <td className="py-2 pr-3 font-medium">Buyer Equity</td>
                    <td className="text-right py-2 pr-3 font-mono">{(assumptions.buyerEquityPct * 100).toFixed(0)}%</td>
                    <td className="text-right py-2 pr-3 font-mono">{money(analysis.capitalStack.buyerEquity.amount)}</td>
                    <td className="text-right py-2 pr-3 font-mono">—</td>
                    <td className="text-right py-2 pr-3 font-mono">—</td>
                    <td className="text-right py-2 font-mono">—</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="py-2 pr-3 font-semibold">Total</td>
                    <td className="text-right py-2 pr-3 font-mono">
                      {((assumptions.sbaLoanPct + assumptions.sellerNotePct + assumptions.buyerEquityPct) * 100).toFixed(0)}%
                    </td>
                    <td className="text-right py-2 pr-3 font-mono font-semibold">{money(analysis.capitalStack.totalSources)}</td>
                    <td className="text-right py-2 pr-3 font-mono">—</td>
                    <td className="text-right py-2 pr-3 font-mono">—</td>
                    <td className="text-right py-2 font-mono font-semibold">{money(analysis.capitalStack.totalAnnualDebtService)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {analysis.capitalStack.warnings.length > 0 && (
              <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                {analysis.capitalStack.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <AlertTriangle className="size-3 mt-0.5 shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">DSCR (engine)</CardTitle>
            <CardDescription>
              Same engine as Deal Analyzer. Uses amortized payment formula — no shortcut.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">During standby</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold">{analysis.dscrPair.duringStandby.display}</span>
                <DscrPill label={dscrFlag(dscrDuring).label} value={dscrDuring} />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">After standby</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold">{analysis.dscrPair.afterStandby.display}</span>
                <DscrPill label={dscrFlag(dscrAfter).label} value={dscrAfter} />
              </div>
            </div>
            <div className="text-xs text-muted-foreground border-t border-border/40 pt-2">
              Earnings used: <span className="font-mono">{money(analysis.earningsUsed)}</span> ({analysis.earningsBasis})
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scenario valuation (clearly labelled, never replaces PP) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scenario Valuation</CardTitle>
          <CardDescription>
            Earnings × multiple — for scenario discussion only.{" "}
            <span className="font-semibold text-foreground">This is NOT the purchase price used by the engine.</span>{" "}
            The engine uses {money(pp)} ({ppSource}) for the actual capital stack and DSCR.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <label htmlFor="scenarioMult" className="text-xs uppercase tracking-wide text-muted-foreground w-32">
              Scenario multiple
            </label>
            <input
              id="scenarioMult"
              type="number"
              min="0"
              step="0.1"
              value={scenarioMultiple}
              onChange={(e) => setScenarioMultiple(parseFloat(e.target.value) || 0)}
              className="h-9 w-28 rounded-md border border-input bg-background px-3 text-sm font-mono"
            />
            <span className="text-sm text-muted-foreground">x {analysis.earningsBasis}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-md border border-border/60 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Earnings used</div>
              <div className="font-mono text-lg">{money(analysis.earningsUsed)}</div>
            </div>
            <div className="rounded-md border border-border/60 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Scenario multiple</div>
              <div className="font-mono text-lg">{scenarioMultiple.toFixed(2)}x</div>
            </div>
            <div className="rounded-md border border-border/60 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Scenario value</div>
              <div className="font-mono text-lg">{money(scenarioValue)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stress tests */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stress Test</CardTitle>
          <CardDescription>
            Earnings haircuts and rate shocks are applied, then{" "}
            <span className="font-mono">analyzeDeal()</span> is re-run with the same engine. DSCR
            during/after standby and what broke are reported.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analysis.earningsUsed === null ? (
            <div className="text-sm text-muted-foreground">
              Stress test unavailable — earnings are missing. Add {analysis.earningsBasis === "missing" ? "EBITDA or SDE" : analysis.earningsBasis} on the Deal Analyzer first.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="text-left py-2 pr-4">Scenario</th>
                    <th className="text-left py-2 pr-4">DSCR (during standby)</th>
                    <th className="text-left py-2 pr-4">DSCR (after standby)</th>
                    <th className="text-left py-2 pr-4">Verdict</th>
                    <th className="text-left py-2 pr-4">What broke</th>
                  </tr>
                </thead>
                <tbody>
                  {stress.map((s) => (
                    <ScenarioRow key={s.label} scenario={s} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Snapshot row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-md border border-border/60 bg-card p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Revenue</div>
          <div className="font-mono">{money(typeof selectedDeal.annualRevenue === "number" ? selectedDeal.annualRevenue : null)}</div>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{analysis.earningsBasis} margin</div>
          <div className="font-mono">{pctText(analysis.earningsBasis === "EBITDA" ? analysis.ebitdaMargin.value : analysis.earningsBasis === "SDE" ? analysis.sdeMargin.value : null)}</div>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">EV / EBITDA</div>
          <div className="font-mono">{mult(analysis.evToEBITDA.value)}</div>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">EV / SDE</div>
          <div className="font-mono">{mult(analysis.evToSDE.value)}</div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <div>
            • Capital stack assumptions are global — change them in{" "}
            <Link href="/assumptions">
              <span className="text-primary hover:underline">Capital Stack</span>
            </Link>
            . The same numbers feed Deal Analyzer, Pipeline, Exports, and the Copilot context.
          </div>
          <div>
            • Risk completeness: <span className="font-semibold text-foreground">{analysis.risk.riskCompletenessLabel}</span>.
            {" "}When risk inputs are missing, the engine discounts the score and lowers confidence.
          </div>
          <div>
            • The advisor on the Copilot page only interprets verified outputs — it does not invent any of these numbers.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
