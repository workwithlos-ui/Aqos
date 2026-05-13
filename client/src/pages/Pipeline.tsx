import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useDealStore } from "@/lib/acquisition/store";
import { analyzeDeal, fmtCurrencyExact, fmtMultiple } from "@/lib/acquisition";
import { VerdictPill, DscrPill } from "@/components/acq/Verdict";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

type BucketName =
  | "All"
  | "Acquisition Priority"
  | "Diligence Priority"
  | "Kill/Pause"
  | "Scoring Review"
  | "Cannot Underwrite"
  | "Watch"
  | "Demo/Test";

const BUCKETS: BucketName[] = [
  "All",
  "Acquisition Priority",
  "Diligence Priority",
  "Watch",
  "Kill/Pause",
  "Scoring Review",
  "Cannot Underwrite",
  "Demo/Test",
];

export default function Pipeline() {
  const { deals, assumptions, removeDeal } = useDealStore();
  const [bucket, setBucket] = useState<BucketName>("All");
  const [showDemo, setShowDemo] = useState(true);
  const [q, setQ] = useState("");

  const analyses = useMemo(
    () => deals.map((d) => ({ deal: d, analysis: analyzeDeal(d, assumptions) })),
    [deals, assumptions],
  );

  const filtered = useMemo(() => {
    return analyses.filter(({ deal, analysis }) => {
      const isDemoTest = deal.isDemo || deal.isTest;
      if (!showDemo && isDemoTest) return false;
      if (bucket === "Demo/Test" && !isDemoTest) return false;
      if (bucket !== "All" && bucket !== "Demo/Test" && analysis.finalBucket !== bucket) return false;
      if (q) {
        const hay = `${deal.companyName} ${deal.industry ?? ""} ${deal.location ?? ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [analyses, bucket, showDemo, q]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    analyses.forEach(({ deal, analysis }) => {
      const key = deal.isDemo || deal.isTest ? "Demo/Test" : analysis.finalBucket;
      map[key] = (map[key] || 0) + 1;
    });
    map.All = analyses.length;
    return map;
  }, [analyses]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="metric-label">Pipeline</div>
          <h1 className="font-display text-3xl font-semibold mt-1">Disciplined deal flow</h1>
          <p className="text-muted-foreground text-sm mt-2 max-w-xl">
            Deals are auto-bucketed by the deterministic engine using DSCR, multiple,
            risk, and missing-data signals. Demo/test deals are flagged and excluded
            from strategic recommendations by default.
          </p>
        </div>
        <Link href="/analyze">
          <Button><Plus className="size-4 mr-1.5" /> Add deal</Button>
        </Link>
      </header>

      <div className="panel p-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2 items-center">
          {BUCKETS.map((b) => (
            <button
              key={b}
              onClick={() => setBucket(b)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                bucket === b
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {b}
              <span className="ml-1.5 opacity-70">{counts[b] ?? 0}</span>
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showDemo}
              onChange={(e) => setShowDemo(e.target.checked)}
              className="rounded border-border"
            />
            Show demo/test
          </label>
        </div>
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by company, industry, or location"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="panel p-10 text-center">
          <div className="font-medium">No deals match this filter.</div>
          <div className="text-xs text-muted-foreground mt-1">
            Clear the search or pick a different bucket.
          </div>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="grid grid-cols-12 gap-2 text-[11px] uppercase tracking-wider text-muted-foreground px-5 py-3 border-b border-border bg-muted/30">
            <div className="col-span-3">Company</div>
            <div className="col-span-1 text-right">Revenue</div>
            <div className="col-span-1 text-right">Earnings</div>
            <div className="col-span-1 text-right">Asking</div>
            <div className="col-span-1 text-right">Multiple</div>
            <div className="col-span-1 text-right">Margin</div>
            <div className="col-span-1 text-center">DSCR</div>
            <div className="col-span-1 text-center">Risk</div>
            <div className="col-span-1 text-center">Score</div>
            <div className="col-span-1 text-right">Verdict</div>
          </div>
          {filtered.map(({ deal, analysis: a }) => {
            const revenue =
              (a.ebitdaMargin.inputs.Revenue as number | null | undefined) ??
              (a.sdeMargin.inputs.Revenue as number | null | undefined) ??
              null;
            const margin =
              a.earningsBasis === "EBITDA"
                ? a.ebitdaMargin.value
                : a.sdeMargin.value;
            const multiple =
              a.earningsBasis === "EBITDA" ? a.evToEBITDA.value : a.evToSDE.value;
            const missingCount = a.missingData.criticalMissing.length + a.missingData.importantMissing.length;
            return (
              <Link key={deal.id} href={`/analyze/${deal.id}`}>
                <div className="grid grid-cols-12 gap-2 items-center px-5 py-3.5 border-b border-border/60 last:border-b-0 hover:bg-muted/30 transition">
                  <div className="col-span-3 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {deal.companyName && deal.companyName.trim()
                          ? deal.companyName
                          : <span className="italic text-rose-600">Company name missing</span>}
                      </span>
                      {(deal.isDemo || deal.isTest) && (
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                          {deal.isTest ? "test" : "demo"}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {a.valuation.benchmark?.industryLabel ?? "industry missing"}
                      {deal.location ? ` · ${deal.location}` : ""}
                      {` · ${missingCount} gaps`}
                    </div>
                  </div>
                  <div className="col-span-1 text-right text-sm font-mono">{revenue !== null ? fmtCurrencyExact(revenue) : "—"}</div>
                  <div className="col-span-1 text-right text-sm font-mono">{a.earningsUsed !== null ? fmtCurrencyExact(a.earningsUsed) : "missing"}</div>
                  <div className="col-span-1 text-right text-sm font-mono">{a.capitalStack.purchasePriceUsed !== null ? fmtCurrencyExact(a.capitalStack.purchasePriceUsed) : "missing"}</div>
                  <div className="col-span-1 text-right text-sm font-mono">{multiple !== null ? fmtMultiple(multiple) : "—"}</div>
                  <div className="col-span-1 text-right text-sm font-mono">{margin !== null ? `${(margin * 100).toFixed(1)}%` : "—"}</div>
                  <div className="col-span-1 flex justify-center">
                    <DscrPill label={a.dscr.display} value={a.dscr.value} />
                  </div>
                  <div
                    className="col-span-1 text-center text-xs"
                    title={a.risk.riskCompletenessLabel}
                  >
                    {a.risk.averageScore === null
                      ? "—"
                      : `${a.risk.averageScore.toFixed(1)}/5`}
                    {a.risk.missingCount > 0 && (
                      <span className="text-amber-600 ml-0.5">*</span>
                    )}
                  </div>
                  <div
                    className="col-span-1 text-center text-sm font-semibold flex flex-col items-center"
                    title={a.verdict.confidenceReason}
                  >
                    <span>{Math.round(a.score.score)}</span>
                    {a.verdict.isPreliminary && (
                      <span className="text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-300 font-normal">
                        prelim
                      </span>
                    )}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <div className="flex items-center gap-1.5">
                      <VerdictPill verdict={a.verdict.verdict} size="sm" />
                      <button
                        type="button"
                        title="Remove"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (deal.id) {
                            removeDeal(deal.id);
                            toast.success(`${deal.companyName} removed`);
                          }
                        }}
                        className="text-muted-foreground hover:text-rose-600 transition"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
