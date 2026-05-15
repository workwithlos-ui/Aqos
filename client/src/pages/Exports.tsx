import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useDealStore } from "@/lib/acquisition/store";
import { analyzeDeal } from "@/lib/acquisition";
import { generateExport, type ExportKind } from "@/lib/acquisition/exports";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Streamdown } from "streamdown";
import { Copy, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { buildLOIDocx, defaultLOIFields } from "@/lib/acquisition/loiDocx";
import type { DealAnalysis, DealInput } from "@/lib/acquisition/types";

const KINDS: Array<{ id: ExportKind; label: string; desc: string }> = [
  { id: "ic-memo", label: "Investment Committee Memo", desc: "Full deterministic underwriting memo." },
  { id: "lender-summary", label: "Lender Summary", desc: "Capital stack + DSCR package for the bank." },
  { id: "broker-email", label: "Broker Email", desc: "Verdict-aware outreach to broker / seller." },
  { id: "diligence-list", label: "Diligence Request List", desc: "Critical / important / nice-to-have." },
  { id: "loi-strategy", label: "LOI Strategy", desc: "Anchor + structure recommendation." },
  { id: "kill-memo", label: "Kill Memo", desc: "Documented pass — only when verdict is KILL." },
];

export default function Exports() {
  const params = useParams<{ id?: string }>();
  const { deals, assumptions, activeDealId, setActiveDealId } = useDealStore();
  const [kind, setKind] = useState<ExportKind>("ic-memo");

  // Route param is a one-time initializer only.
  const [routeInitialized, setRouteInitialized] = useState(false);
  useEffect(() => {
    if (!routeInitialized && params.id && params.id !== activeDealId) {
      setActiveDealId(params.id);
    }
    if (params.id || routeInitialized === false) setRouteInitialized(true);
  }, [params.id, activeDealId, setActiveDealId, routeInitialized]);

  const dealId =
    activeDealId ??
    params.id ??
    deals.find((d) => !d.isTest)?.id ??
    "";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="metric-label">Exports</div>
          <h1 className="font-display text-3xl font-semibold mt-1">Buyer-grade deliverables</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Every export is generated from the verified DealAnalysis for the
            selected deal. Missing data appears literally as "missing" — nothing
            is invented.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <aside className="panel p-5 lg:col-span-1 flex flex-col gap-4">
          <div>
            <div className="metric-label mb-1">Deal</div>
            <Select value={dealId} onValueChange={(v) => setActiveDealId(v)}>
              <SelectTrigger data-testid="exports-deal-select">
                <SelectValue placeholder="Select deal" />
              </SelectTrigger>
              <SelectContent>
                {deals.map((d) => (
                  <SelectItem key={d.id} value={d.id ?? ""} data-testid={`exports-deal-option-${d.id}`}>
                    {d.companyName?.trim() || "Untitled deal"}{d.isDemo ? " (demo)" : d.isTest ? " (test)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="metric-label mb-2">Export type</div>
            <div className="flex flex-col gap-1.5">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  onClick={() => setKind(k.id)}
                  className={`text-left p-3 rounded-lg border transition ${
                    kind === k.id ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="text-sm font-medium">{k.label}</div>
                  <div className={`text-[11px] ${kind === k.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{k.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/*
          P0.1 Iteration 10 — React key={dealId+kind} forces full unmount + remount of
          the entire export content section every time the dropdown OR export kind
          changes. Streamdown caches its rendered output by content prop reference,
          so without remount the markdown body would stick to the previous deal even
          though the title updated. With remount, every dropdown switch produces a
          fresh component tree with fresh analyzeDeal output.
        */}
        <ExportContent
          key={`${dealId}-${kind}`}
          dealId={dealId}
          deal={deals.find((d) => d.id === dealId) ?? null}
          assumptions={assumptions}
          kind={kind}
        />
      </div>
    </div>
  );
}

function ExportContent({
  dealId,
  deal,
  assumptions,
  kind,
}: {
  dealId: string;
  deal: DealInput | null;
  assumptions: Parameters<typeof analyzeDeal>[1];
  kind: ExportKind;
}) {
  // No useMemo — compute fresh each render. Render is keyed by dealId so this
  // only runs when the deal actually changes.
  const analysis: DealAnalysis | null = deal ? analyzeDeal(deal, assumptions) : null;
  const payload = analysis ? generateExport(kind, analysis) : null;

  function copy() {
    if (!payload) return;
    navigator.clipboard.writeText(payload.content);
    toast.success(`Copied "${payload.title}" to clipboard`);
  }
  function download() {
    if (!payload) return;
    const blob = new Blob([payload.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = payload.filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${payload.filename}`);
  }

  return (
    <section className="panel p-0 lg:col-span-3 overflow-hidden flex flex-col" data-testid="exports-content-section">
      {payload && analysis ? (
        <>
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div>
              <div className="font-semibold" data-testid="exports-payload-title">{payload.title}</div>
              <div className="text-[11px] text-muted-foreground font-mono" data-testid="exports-filename">{payload.filename}</div>
              <div
                className="text-[11px] text-muted-foreground mt-0.5"
                data-testid="exports-active-company"
              >
                Bound to: <span className="font-mono text-foreground">{analysis.companyName?.trim() || "Untitled deal"}</span>
                {" · "}
                <span className="font-mono">{dealId.slice(0, 8)}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="bg-card" onClick={copy}><Copy className="size-4 mr-1.5" /> Copy</Button>
              <Button onClick={download}><Download className="size-4 mr-1.5" /> Download .md</Button>
              {deal && (
                <Button
                  variant="outline"
                  className="bg-card"
                  data-testid="download-loi-docx"
                  onClick={async () => {
                    try {
                      const { blob, filename } = await buildLOIDocx(deal, analysis, defaultLOIFields());
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = filename;
                      a.click();
                      URL.revokeObjectURL(url);
                      toast.success(`Downloaded ${filename}`);
                    } catch (err) {
                      toast.error("LOI generation failed: " + String(err));
                    }
                  }}
                >
                  <FileText className="size-4 mr-1.5" /> Download LOI (.docx)
                </Button>
              )}
            </div>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none p-6 overflow-auto" data-testid="exports-body">
            <Streamdown>{payload.content}</Streamdown>
          </div>
        </>
      ) : (
        <div className="p-10 text-center text-muted-foreground text-sm">
          Pick a deal to preview the export.
        </div>
      )}
    </section>
  );
}
