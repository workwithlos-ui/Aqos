import { useMemo, useState } from "react";
import { useDealStore } from "@/lib/acquisition/store";
import { analyzeDeal } from "@/lib/acquisition";
import {
  buildAdvisorDealContext,
  buildAdvisorPortfolioContext,
} from "@/lib/acquisition/advisorContext";
import { answerAdvisor, SAMPLE_QUESTIONS, type AdvisorAnswer } from "@/lib/acquisition/localAdvisor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Bot, CornerDownLeft, ShieldCheck } from "lucide-react";
import { VerdictPill } from "@/components/acq/Verdict";

interface Turn {
  role: "user" | "copilot";
  content?: string;
  answer?: AdvisorAnswer;
}

export default function Advisor() {
  const { deals, assumptions } = useDealStore();
  const analyses = useMemo(
    () => deals.map((d) => analyzeDeal(d, assumptions)),
    [deals, assumptions],
  );
  const portfolio = useMemo(
    () => buildAdvisorPortfolioContext(analyses),
    [analyses],
  );

  const [focusId, setFocusId] = useState<string>("portfolio");
  const focused = useMemo(() => {
    if (focusId === "portfolio") return null;
    const a = analyses.find((x) => x.dealId === focusId);
    return a ? buildAdvisorDealContext(a) : null;
  }, [focusId, analyses]);

  const [draft, setDraft] = useState("");
  const [thread, setThread] = useState<Turn[]>([]);

  function ask(q: string) {
    const ans = answerAdvisor(q, portfolio, focused);
    setThread((t) => [...t, { role: "user", content: q }, { role: "copilot", answer: ans }]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="metric-label">Deal Copilot</div>
          <h1 className="font-display text-3xl font-semibold mt-1">Acquisition Copilot</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            The Copilot is wired to the AdvisorContext built from the deterministic
            engine. It cannot read raw deal data, cannot recompute math, cannot
            invent revenue / EBITDA / SDE / DSCR / multiples / risk scores / verdicts,
            and cannot override the engine. Any field the engine flagged as
            <span className="font-mono"> missing </span> is reported as missing.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 rounded-full px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30">
          <ShieldCheck className="size-3.5" /> Deterministic mode
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <aside className="panel p-5 lg:col-span-1 flex flex-col gap-4">
          <div>
            <div className="metric-label mb-1">Context</div>
            <Select value={focusId} onValueChange={setFocusId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="portfolio">Whole portfolio</SelectItem>
                {analyses
                  .filter((a) => !a.isTest)
                  .map((a) => (
                    <SelectItem key={a.dealId} value={a.dealId ?? ""}>
                      {a.companyName}{a.isDemo ? " (demo)" : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {focused && (
            <div className="rounded-xl border border-border p-3 text-xs leading-relaxed">
              <div className="font-semibold text-sm mb-1">{focused.companyName}</div>
              <VerdictPill verdict={focused.verdict} size="sm" />
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <span className="text-muted-foreground">Score</span>
                <span className="font-mono text-right">{focused.scoreOutOf100}/100</span>
                <span className="text-muted-foreground">DSCR after</span>
                <span className="font-mono text-right">{focused.dscr.afterStandby}</span>
                <span className="text-muted-foreground">Earnings</span>
                <span className="font-mono text-right">{focused.earnings}</span>
                <span className="text-muted-foreground">Asking</span>
                <span className="font-mono text-right">{focused.askingPrice}</span>
                <span className="text-muted-foreground">Multiple</span>
                <span className="font-mono text-right">{focused.multipleEvEbitda !== "missing" ? focused.multipleEvEbitda : focused.multipleEvSde}</span>
              </div>
            </div>
          )}
          <div>
            <div className="metric-label mb-2">Try asking</div>
            <div className="flex flex-col gap-1.5">
              {SAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => ask(q)}
                  className="text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted/40 transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="panel p-0 lg:col-span-3 flex flex-col">
          <div className="flex-1 overflow-auto p-6 flex flex-col gap-4 min-h-[440px]">
            {thread.length === 0 ? (
              <div className="text-center my-auto text-muted-foreground">
                <Bot className="size-6 mx-auto mb-2 opacity-70" />
                <div className="text-sm">Ask the Copilot about your pipeline or a focused deal.</div>
                <div className="text-xs mt-1">Every answer cites only verified engine outputs.</div>
              </div>
            ) : (
              thread.map((t, i) =>
                t.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2 text-sm max-w-[80%]">
                      {t.content}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex flex-col gap-1.5">
                    <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Bot className="size-3.5" /> Copilot · intent: {t.answer?.intent}
                    </div>
                    <div className="rounded-2xl rounded-tl-sm bg-muted/40 border border-border px-4 py-3 max-w-[85%]">
                      <p className="text-sm leading-relaxed">{t.answer?.answer}</p>
                      {t.answer && t.answer.bullets.length > 0 && (
                        <ul className="mt-2 space-y-1 text-sm leading-relaxed">
                          {t.answer.bullets.map((b, j) => (
                            <li key={j} className="flex gap-2">
                              <span className="text-muted-foreground">•</span>
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ),
              )
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) ask(draft.trim());
            }}
            className="border-t border-border p-4 flex gap-2"
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                focused
                  ? `Ask about ${focused.companyName}…`
                  : "Ask about the portfolio…"
              }
            />
            <Button type="submit"><CornerDownLeft className="size-4" /></Button>
          </form>
        </section>
      </div>
    </div>
  );
}
