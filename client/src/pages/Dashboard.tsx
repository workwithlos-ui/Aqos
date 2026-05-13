import { useMemo } from "react";
import { Link } from "wouter";
import {
  ArrowUpRight,
  Briefcase,
  Calculator,
  ClipboardCheck,
  Gauge,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useDealStore } from "@/lib/acquisition/store";
import { analyzeDeal, fmtCurrencyExact } from "@/lib/acquisition";
import { VerdictPill, DscrPill } from "@/components/acq/Verdict";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { deals, assumptions, liveDeals, demoDeals } = useDealStore();
  const analyses = useMemo(
    () => deals.map((d) => analyzeDeal(d, assumptions)),
    [deals, assumptions],
  );
  const liveAnalyses = useMemo(
    () => analyses.filter((a) => !a.isDemo && !a.isTest),
    [analyses],
  );

  const bucket = (name: string) =>
    liveAnalyses.filter((a) => a.finalBucket === name);

  const acquisition = bucket("Acquisition Priority");
  const diligence = bucket("Diligence Priority");
  const killPause = bucket("Kill/Pause");
  const scoringReview = bucket("Scoring Review");
  const cannotUW = bucket("Cannot Underwrite");

  // Aggregate totals only sum deals that actually have a value for the
  // metric. We never coerce missing → 0 because that would make the headline
  // numbers misleading. We surface a "k of N" denominator so the user knows.
  const earningsHave = liveAnalyses.filter((a) => a.earningsUsed !== null);
  const totalEarnings = earningsHave.reduce((s, a) => s + (a.earningsUsed as number), 0);
  const askingHave = liveAnalyses.filter((a) => a.capitalStack.purchasePriceUsed !== null);
  const totalAsking = askingHave.reduce(
    (s, a) => s + (a.capitalStack.purchasePriceUsed as number),
    0,
  );
  const topActions = liveAnalyses
    .filter((a) => a.nextActions.length > 0)
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="metric-label">Acquisition Desk</div>
          <h1 className="font-display text-3xl md:text-4xl font-semibold mt-1">
            Today on the desk
          </h1>
          <p className="text-muted-foreground mt-2 text-sm max-w-xl">
            The deterministic engine has scored every deal. The advisor will only
            interpret verified outputs — nothing here is invented.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/analyze">
            <Button>
              <Calculator className="size-4 mr-1.5" /> New deal
            </Button>
          </Link>
          <Link href="/advisor">
            <Button variant="outline" className="bg-card">
              <Sparkles className="size-4 mr-1.5" /> Ask Copilot
            </Button>
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard
          title="Live deals"
          value={String(liveDeals.length)}
          sub={`${demoDeals.length} demo excluded`}
          icon={<Briefcase className="size-4" />}
        />
        <StatCard
          title="Acquisition priority"
          value={String(acquisition.length)}
          sub="Score ≥ 75 + DSCR ≥ 1.25"
          accent="emerald"
          icon={<Gauge className="size-4" />}
        />
        <StatCard
          title="Diligence priority"
          value={String(diligence.length)}
          sub="Upside, but data gaps"
          accent="amber"
          icon={<ClipboardCheck className="size-4" />}
        />
        <StatCard
          title="Kill / pause"
          value={String(killPause.length)}
          sub="Fails DSCR or earnings"
          accent="rose"
          icon={<ShieldAlert className="size-4" />}
        />
        <StatCard
          title="Pipeline earnings"
          value={earningsHave.length === 0 ? "missing" : fmtCurrencyExact(totalEarnings)}
          sub={`${earningsHave.length}/${liveAnalyses.length} report earnings · Asking: ${askingHave.length === 0 ? "missing" : fmtCurrencyExact(totalAsking)}`}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="panel p-6 lg:col-span-3">
          <div className="flex items-end justify-between mb-4">
            <h2 className="font-display text-xl font-semibold">
              Top of stack
            </h2>
            <Link href="/pipeline">
              <span className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                Full pipeline <ArrowUpRight className="size-3" />
              </span>
            </Link>
          </div>
          {acquisition.length === 0 && diligence.length === 0 ? (
            <EmptyHint
              title="No live deals scored yet"
              hint="Add a deal in the Analyzer, or open the Test Suite to see all 10 deterministic cases."
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              {[...acquisition, ...diligence].slice(0, 6).map((a) => (
                <Link href={`/analyze/${a.dealId ?? ""}`} key={a.dealId ?? a.companyName}>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/60 px-4 py-3 hover:bg-card transition">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{a.companyName}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {a.valuation.benchmark?.industryLabel ?? "Industry missing"} ·
                        {" "}{a.earningsBasis} {a.earningsUsed !== null ? fmtCurrencyExact(a.earningsUsed) : "missing"} ·
                        Score {Math.round(a.score.score)}/100
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <DscrPill label={`DSCR ${a.dscr.display}`} value={a.dscr.value} />
                      <VerdictPill verdict={a.verdict.verdict} size="sm" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="panel p-6 lg:col-span-2">
          <h2 className="font-display text-xl font-semibold mb-4">Next actions</h2>
          {topActions.length === 0 ? (
            <EmptyHint title="No actions queued" hint="Score a deal to populate this stream." />
          ) : (
            <ol className="flex flex-col gap-3">
              {topActions.map((a) => (
                <li key={a.dealId} className="rounded-xl border border-border p-3 bg-background/60">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-sm font-medium truncate">{a.companyName}</div>
                    <VerdictPill verdict={a.verdict.verdict} size="sm" />
                  </div>
                  <ul className="text-xs text-muted-foreground leading-relaxed list-disc pl-4">
                    {a.nextActions.slice(0, 2).map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <BucketCard title="Scoring review" items={scoringReview} accent="fuchsia" />
        <BucketCard title="Cannot underwrite" items={cannotUW} accent="slate" />
        <BucketCard title="Kill / pause" items={killPause} accent="rose" />
      </section>
    </div>
  );
}

function StatCard({
  title,
  value,
  sub,
  icon,
  accent,
}: {
  title: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  accent?: "emerald" | "amber" | "rose";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-600"
      : accent === "amber"
        ? "text-amber-600"
        : accent === "rose"
          ? "text-rose-600"
          : "";
  return (
    <div className="panel p-4">
      <div className="metric-label flex items-center gap-1.5">
        {icon}
        {title}
      </div>
      <div className={`font-display text-2xl mt-1.5 ${accentClass}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function BucketCard({
  title,
  items,
  accent,
}: {
  title: string;
  items: ReturnType<typeof analyzeDeal>[];
  accent: "fuchsia" | "slate" | "rose";
}) {
  const dot =
    accent === "fuchsia"
      ? "bg-fuchsia-500"
      : accent === "slate"
        ? "bg-slate-500"
        : "bg-rose-500";
  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className={`size-2 rounded-full ${dot}`} />
        <h3 className="font-display text-base font-semibold">{title}</h3>
        <span className="ml-auto text-xs text-muted-foreground">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground">No deals in this bucket.</div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.slice(0, 4).map((a) => (
            <Link key={a.dealId} href={`/analyze/${a.dealId}`}>
              <li className="text-sm flex items-center justify-between gap-2 hover:bg-background/60 rounded px-2 py-1.5">
                <span className="truncate">{a.companyName}</span>
                <span className="text-xs text-muted-foreground">
                  {Math.round(a.score.score)}/100
                </span>
              </li>
            </Link>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyHint({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-center">
      <div className="font-medium">{title}</div>
      <div className="text-xs text-muted-foreground mt-1">{hint}</div>
    </div>
  );
}
