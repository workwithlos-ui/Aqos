import { useState, useEffect } from "react";
import { useDealStore } from "@/lib/acquisition/store";
import type { CapitalStackAssumptions } from "@/lib/acquisition/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

export default function Assumptions() {
  const { assumptions, setAssumptions, resetAssumptions, resetSeed } = useDealStore();
  const [f, setF] = useState<CapitalStackAssumptions>(assumptions);
  useEffect(() => setF(assumptions), [assumptions]);

  const pctTotal = f.sbaLoanPct + f.sellerNotePct + f.buyerEquityPct;
  const invalid = Math.abs(pctTotal - 1) > 0.005;

  function update<K extends keyof CapitalStackAssumptions>(key: K, value: CapitalStackAssumptions[K]) {
    setF((curr) => ({ ...curr, [key]: value }));
  }
  function save() {
    if (invalid) {
      toast.error("Capital stack must total exactly 100%.");
      return;
    }
    setAssumptions(f);
    toast.success("Assumptions saved");
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="metric-label">Capital Stack</div>
        <h1 className="font-display text-3xl font-semibold mt-1">Underwriting assumptions</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          These values flow into every DSCR, IC memo, and lender summary. The
          engine refuses to underwrite if the tranches don't reconcile to 100%
          of the purchase price.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="panel p-6 lg:col-span-2 flex flex-col gap-5">
          <div className="grid grid-cols-3 gap-4">
            <PctField label="SBA loan %" value={f.sbaLoanPct} onChange={(v) => update("sbaLoanPct", v)} />
            <PctField label="Seller note %" value={f.sellerNotePct} onChange={(v) => update("sellerNotePct", v)} />
            <PctField label="Buyer equity %" value={f.buyerEquityPct} onChange={(v) => update("buyerEquityPct", v)} />
          </div>
          <div className={`text-sm rounded-lg border px-3 py-2 ${invalid ? "border-rose-300 bg-rose-50/60 text-rose-700" : "border-emerald-300 bg-emerald-50/60 text-emerald-700"}`}>
            {invalid ? (
              <>
                <AlertTriangle className="inline size-4 mr-1" />
                Total = {(pctTotal * 100).toFixed(2)}% — must equal exactly 100%.
              </>
            ) : (
              <>Capital stack reconciles to 100.00%.</>
            )}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <NumField label="SBA rate" value={f.sbaInterestRate} step={0.005} pct onChange={(v) => update("sbaInterestRate", v)} />
            <NumField label="SBA term (years)" value={f.sbaTermYears} onChange={(v) => update("sbaTermYears", v)} />
            <NumField label="Seller note rate" value={f.sellerNoteRate} step={0.005} pct onChange={(v) => update("sellerNoteRate", v)} />
            <NumField label="Seller note term" value={f.sellerNoteTermYears} onChange={(v) => update("sellerNoteTermYears", v)} />
            <NumField label="Seller note standby (months)" value={f.sellerNoteStandbyMonths} onChange={(v) => update("sellerNoteStandbyMonths", v)} />
            <NumField
              label="Buyer DSCR target"
              value={f.buyerDscrTarget ?? 1.5}
              step={0.05}
              onChange={(v) => update("buyerDscrTarget", v)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Buyer DSCR target is your personal margin of safety, separate from the
            <span className="font-mono"> 1.25x </span>
            lender minimum. Max Supportable Purchase Price is computed at this target.
          </p>
          <div className="flex gap-2 pt-2 border-t border-border">
            <Button onClick={save}>Save assumptions</Button>
            <Button variant="outline" className="bg-card" onClick={() => { resetAssumptions(); toast.success("Reset to defaults"); }}>
              Reset to defaults
            </Button>
          </div>
        </section>

        <section className="panel p-6">
          <h2 className="font-display text-lg font-semibold mb-3">Reset workspace</h2>
          <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
            Reload the demo + test seed corpus. This clears your in-progress live
            deals.
          </p>
          <Button variant="outline" className="bg-card" onClick={() => { resetSeed(); toast.success("Workspace re-seeded"); }}>
            Reset to seed deals
          </Button>
        </section>
      </div>
    </div>
  );
}

function PctField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          step={1}
          value={Math.round(value * 100)}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            onChange(Number.isFinite(n) ? n / 100 : 0);
          }}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, step = 1, pct = false }: { label: string; value: number; onChange: (v: number) => void; step?: number; pct?: boolean }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          step={step}
          value={pct ? (value * 100).toFixed(2) : value}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            onChange(Number.isFinite(n) ? (pct ? n / 100 : n) : 0);
          }}
        />
        {pct && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>}
      </div>
    </div>
  );
}
