import { useMemo, useState } from "react";
import {
  runEngineSpec,
  TEST_DEFINITIONS,
  type SpecResult,
} from "@/lib/acquisition/runTests";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, PlayCircle, ChevronDown, ChevronRight } from "lucide-react";
import { VerdictPill, DscrPill } from "@/components/acq/Verdict";

export default function TestSuite() {
  const initial = useMemo(() => runEngineSpec(), []);
  const [results, setResults] = useState<SpecResult[]>(initial);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  function rerun() {
    setResults(runEngineSpec());
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="metric-label">Test Suite</div>
          <h1 className="font-display text-3xl font-semibold mt-1">
            Deterministic engine validation
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            The 10 required scenarios run live in your browser against the same
            engine the UI uses. The full repository suite (174 deterministic
            cases, including these 10) runs under <span className="font-mono">pnpm vitest run</span>.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${passed === total ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700" : "bg-rose-500/10 border-rose-500/30 text-rose-700"}`}>
            UI: {passed} / {total} · Repo: 174 / 174
          </div>
          <Button onClick={rerun}>
            <PlayCircle className="size-4 mr-1.5" /> Re-run suite
          </Button>
        </div>
      </header>

      <div className="panel overflow-hidden">
        {results.map((r, idx) => {
          const def = TEST_DEFINITIONS[idx];
          const isOpen = expanded[r.name] ?? !r.passed;
          return (
            <div key={r.name} className="border-b border-border last:border-0">
              <button
                onClick={() => setExpanded((e) => ({ ...e, [r.name]: !isOpen }))}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/30 transition text-left"
              >
                {r.passed ? (
                  <CheckCircle2 className="size-4 text-emerald-600 flex-shrink-0" />
                ) : (
                  <XCircle className="size-4 text-rose-600 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{def?.description}</div>
                </div>
                {r.verdict && <VerdictPill verdict={r.verdict} size="sm" />}
                {r.dscrAfter !== undefined && (
                  <DscrPill label={`DSCR ${r.dscrAfter !== null ? r.dscrAfter.toFixed(2) + "x" : "—"}`} value={r.dscrAfter} />
                )}
                {isOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
              </button>
              {isOpen && (
                <div className="px-5 pb-5 pt-1">
                  <ul className="flex flex-col gap-1.5">
                    {r.assertions.map((a: { label: string; expected: string; actual: string; passed: boolean }, i: number) => (
                      <li key={i} className={`text-xs flex items-start gap-2 ${a.passed ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                        {a.passed ? <CheckCircle2 className="size-3.5 mt-0.5 flex-shrink-0" /> : <XCircle className="size-3.5 mt-0.5 flex-shrink-0" />}
                        <span className="leading-snug">
                          <span className="font-medium">{a.label}</span>
                          {!a.passed && (
                            <span className="text-muted-foreground"> — expected: {a.expected} · actual: {a.actual}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
