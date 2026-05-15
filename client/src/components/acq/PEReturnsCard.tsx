import type { PEReturnsResult, ScenarioProjection } from "@/lib/acquisition/peReturns";

interface Props {
  result: PEReturnsResult;
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtMult(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(2)}x`;
}

function irrShade(irr: number | null): string {
  if (irr === null || !Number.isFinite(irr)) return "bg-muted/30 text-muted-foreground";
  if (irr < 0) return "bg-rose-900/30 text-rose-200";
  if (irr < 0.1) return "bg-amber-900/30 text-amber-100";
  if (irr < 0.2) return "bg-emerald-900/20 text-emerald-100";
  if (irr < 0.3) return "bg-emerald-700/30 text-emerald-50";
  return "bg-emerald-600/40 text-emerald-50";
}

function ScenarioColumn({ s, accent }: { s: ScenarioProjection; accent: string }) {
  return (
    <div className="panel p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className={`text-xs font-semibold tracking-widest uppercase ${accent}`}>{s.label}</div>
        <div className="text-[11px] text-muted-foreground">{s.rows.length > 0 ? `${s.rows.length - 1}yr hold` : "—"}</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="metric-label">IRR</div>
          <div className="text-2xl font-display font-semibold">{fmtPct(s.irr)}</div>
        </div>
        <div>
          <div className="metric-label">MOIC</div>
          <div className="text-2xl font-display font-semibold">{fmtMult(s.moic)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-[12px]">
        <div>
          <div className="metric-label">Exit EV</div>
          <div className="font-mono">{fmtUsd(s.exitEnterpriseValue)}</div>
        </div>
        <div>
          <div className="metric-label">Exit equity</div>
          <div className="font-mono">{fmtUsd(s.exitEquityProceeds)}</div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{s.rationale}</p>
    </div>
  );
}

export default function PEReturnsCard({ result }: Props) {
  if (!result.available) {
    return (
      <section className="panel p-6">
        <div className="metric-label mb-1">Projected returns</div>
        <h3 className="text-xl font-display font-semibold">5-year IRR / MOIC</h3>
        <p className="text-sm text-muted-foreground mt-3">
          {result.reason ?? "Projection unavailable — provide revenue, EBITDA, purchase price, and capital stack."}
        </p>
      </section>
    );
  }

  const yearLabels = result.base.rows.map((r) => r.year);

  return (
    <section className="panel p-6 flex flex-col gap-6" data-testid="pe-returns-card">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="metric-label">Projected returns</div>
          <h3 className="text-xl font-display font-semibold">
            {result.assumptions.holdYears}-year IRR / MOIC across scenarios
          </h3>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-2xl">
            Deterministic projection. CapEx scales with revenue ({(result.assumptions.industryCapexPct * 100).toFixed(1)}%),
            ΔWC scales with revenue change ({(result.assumptions.industryWcPct * 100).toFixed(1)}%).
            Tax {(result.assumptions.taxRate * 100).toFixed(0)}% on FCF, capital gains tax {(result.assumptions.capitalGainsTaxRate * 100).toFixed(0)}% on exit gain.
            Exit multiples re-centred on entry {fmtMult(result.assumptions.entryMultiple)} × 0.85/1.00/1.15.
            <br/>
            <span className="text-foreground/80">Equity-at-risk denominator: {fmtUsd(result.assumptions.initialEquityAtRisk)}</span>
             (buyer equity tranche + closing-cost reserve at {(result.assumptions.closingCostsPct * 100).toFixed(1)}% of price).
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ScenarioColumn s={result.bear} accent="text-rose-300" />
        <ScenarioColumn s={result.base} accent="text-amber-200" />
        <ScenarioColumn s={result.bull} accent="text-emerald-300" />
      </div>

      <div className="overflow-auto">
        <div className="metric-label mb-2">Base-case projection</div>
        <table className="w-full text-[12px] font-mono border border-border rounded-md overflow-hidden">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-3 py-1.5">Year</th>
              {yearLabels.map((y) => (
                <th key={y} className="text-right px-3 py-1.5">{y === 0 ? "Entry" : `Y${y}`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border">
              <td className="px-3 py-1.5">Revenue</td>
              {result.base.rows.map((r) => (
                <td key={`rev-${r.year}`} className="text-right px-3 py-1.5">{fmtUsd(r.revenue)}</td>
              ))}
            </tr>
            <tr className="border-t border-border">
              <td className="px-3 py-1.5">EBITDA</td>
              {result.base.rows.map((r) => (
                <td key={`eb-${r.year}`} className="text-right px-3 py-1.5">{fmtUsd(r.ebitda)}</td>
              ))}
            </tr>
            <tr className="border-t border-border">
              <td className="px-3 py-1.5">Margin</td>
              {result.base.rows.map((r) => (
                <td key={`m-${r.year}`} className="text-right px-3 py-1.5">{fmtPct(r.margin)}</td>
              ))}
            </tr>
            <tr className="border-t border-border">
              <td className="px-3 py-1.5">Debt service</td>
              {result.base.rows.map((r) => (
                <td key={`ds-${r.year}`} className="text-right px-3 py-1.5">{fmtUsd(r.debtService)}</td>
              ))}
            </tr>
            <tr className="border-t border-border">
              <td className="px-3 py-1.5 text-muted-foreground">CapEx</td>
              {result.base.rows.map((r) => (
                <td key={`cx-${r.year}`} className="text-right px-3 py-1.5 text-muted-foreground">{r.year === 0 ? "—" : fmtUsd(r.capex)}</td>
              ))}
            </tr>
            <tr className="border-t border-border">
              <td className="px-3 py-1.5 text-muted-foreground">ΔWC</td>
              {result.base.rows.map((r) => (
                <td key={`wc-${r.year}`} className="text-right px-3 py-1.5 text-muted-foreground">{r.year === 0 ? "—" : fmtUsd(r.workingCapitalChange)}</td>
              ))}
            </tr>
            <tr className="border-t border-border">
              <td className="px-3 py-1.5 text-muted-foreground">Tax</td>
              {result.base.rows.map((r) => (
                <td key={`tx-${r.year}`} className="text-right px-3 py-1.5 text-muted-foreground">{r.year === 0 ? "—" : fmtUsd(r.tax)}</td>
              ))}
            </tr>
            <tr className="border-t border-border">
              <td className="px-3 py-1.5">Buyer FCF</td>
              {result.base.rows.map((r) => (
                <td key={`cf-${r.year}`} className="text-right px-3 py-1.5">{fmtUsd(r.buyerCashFlow)}</td>
              ))}
            </tr>
            <tr className="border-t border-border bg-muted/20">
              <td className="px-3 py-1.5">Debt balance</td>
              {result.base.rows.map((r) => (
                <td key={`db-${r.year}`} className="text-right px-3 py-1.5">{fmtUsd(r.debtBalance)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <div className="metric-label mb-2">Sensitivity: IRR by exit multiple × revenue growth</div>
        <div className="overflow-auto">
          <table className="text-[11px] font-mono border border-border rounded-md overflow-hidden" data-testid="pe-returns-sensitivity">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-2 py-1 font-semibold">Exit ↓ / Rev →</th>
                {result.sensitivity.revenueGrowths.map((g) => (
                  <th key={g} className="text-right px-3 py-1">{fmtPct(g)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.sensitivity.cells.map((row, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-2 py-1 bg-muted/20 font-semibold">{fmtMult(result.sensitivity.exitMultiples[i])}</td>
                  {row.map((c, j) => (
                    <td
                      key={j}
                      className={`text-right px-3 py-1.5 ${irrShade(c.irr)} ${
                        i === 2 && j === 2 ? "ring-1 ring-foreground/30" : ""
                      }`}
                      title={`Exit ${fmtMult(c.exitMultiple)} × Growth ${fmtPct(c.revenueGrowth)} → IRR ${fmtPct(c.irr)}`}
                    >
                      {fmtPct(c.irr)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
          5×5 grid centred on base assumptions. Darker green = stronger IRR. The center cell (highlighted) is the base case.
        </p>
      </div>
    </section>
  );
}
