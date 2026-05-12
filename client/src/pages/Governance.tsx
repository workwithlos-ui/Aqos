import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDealStore } from "@/lib/acquisition/store";
import { analyzeDeal } from "@/lib/acquisition";
import { useState, useMemo } from "react";

export default function GovernancePage() {
  const { deals } = useDealStore();
  const currentDeal = deals[0];
  const [selectedDealId, setSelectedDealId] = useState(currentDeal?.id);

  const analysis = useMemo(() => {
    const deal = deals.find((d) => d.id === selectedDealId) ?? deals[0];
    return deal ? analyzeDeal(deal) : null;
  }, [selectedDealId, deals]);

  if (!analysis) {
    return <div className="text-muted-foreground">No deal selected.</div>;
  }

  const freezeStatusColor =
    analysis.freeze.status === "red"
      ? "destructive"
      : analysis.freeze.status === "yellow"
        ? "secondary"
        : "default";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Governance & Freeze Command</h1>
        <p className="text-muted-foreground mt-2">
          Track readiness gates and freeze status. Red freeze blocks Acquisition Priority and Close Ready.
        </p>
      </div>

      {/* Deal Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Select Deal</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            className="w-full px-2 py-1 border rounded"
            value={selectedDealId ?? ""}
            onChange={(e) => setSelectedDealId(e.target.value)}
          >
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.companyName}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Freeze Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Freeze Status</CardTitle>
          <CardDescription>Blocks deal progression</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">Status</span>
            <Badge variant={freezeStatusColor as any}>{analysis.freeze.status.toUpperCase()}</Badge>
          </div>
          {analysis.freeze.rationale && (
            <div>
              <p className="text-sm text-muted-foreground">{analysis.freeze.rationale}</p>
            </div>
          )}
          {analysis.freeze.triggers.length > 0 && (
            <div>
              <p className="font-medium text-sm mb-2">Triggers:</p>
              <ul className="space-y-1">
                {analysis.freeze.triggers.map((t, i) => (
                  <li key={i} className="text-sm text-muted-foreground">
                    • {t.label}: {t.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Blocks Acq Priority:</span>
              <p className="font-medium">{analysis.freeze.blocksAcquisitionPriority ? "Yes" : "No"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Blocks Close Ready:</span>
              <p className="font-medium">{analysis.freeze.blocksCloseReady ? "Yes" : "No"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Governance Gates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Governance Gates</CardTitle>
          <CardDescription>
            {analysis.governance.passedCount} / {analysis.governance.totalCount} passed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="border rounded p-3">
              <p className="text-sm text-muted-foreground">IC Ready</p>
              <Badge variant={analysis.governance.icReady ? "default" : "outline"}>
                {analysis.governance.icReady ? "✓" : "✗"}
              </Badge>
            </div>
            <div className="border rounded p-3">
              <p className="text-sm text-muted-foreground">LOI Ready</p>
              <Badge variant={analysis.governance.loiReady ? "default" : "outline"}>
                {analysis.governance.loiReady ? "✓" : "✗"}
              </Badge>
            </div>
            <div className="border rounded p-3">
              <p className="text-sm text-muted-foreground">Lender Ready</p>
              <Badge variant={analysis.governance.lenderReady ? "default" : "outline"}>
                {analysis.governance.lenderReady ? "✓" : "✗"}
              </Badge>
            </div>
            <div className="border rounded p-3">
              <p className="text-sm text-muted-foreground">Close Ready</p>
              <Badge variant={analysis.governance.closeReady ? "default" : "outline"}>
                {analysis.governance.closeReady ? "✓" : "✗"}
              </Badge>
            </div>
          </div>

          {analysis.governance.blockers.length > 0 && (
            <div>
              <p className="font-medium text-sm mb-2">Blockers:</p>
              <ul className="space-y-1">
                {analysis.governance.blockers.map((b, i) => (
                  <li key={i} className="text-sm text-destructive">
                    • {b}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.governance.nextGovernanceAction && (
            <div className="bg-muted p-3 rounded">
              <p className="text-sm font-medium">Next Action:</p>
              <p className="text-sm text-muted-foreground">{analysis.governance.nextGovernanceAction}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Institutional Readiness Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Institutional Readiness Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Thesis Fit</p>
              <p className="font-medium">{analysis.thesis.bucket}</p>
              <p className="text-xs text-muted-foreground">{analysis.thesis.fitScore}/100</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Working Capital</p>
              <p className="font-medium">{analysis.workingCapital.status}</p>
              <p className="text-xs text-muted-foreground">{analysis.workingCapital.workingCapitalRisk}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Integration</p>
              <p className="font-medium">{analysis.integration.status}</p>
              <p className="text-xs text-muted-foreground">{analysis.integration.readinessScore.toFixed(0)}/100</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Red Team Objections</p>
              <p className="font-medium">{analysis.redTeam.unresolvedCriticalCount} unresolved critical</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline">Export Governance Report</Button>
        <Button>Refresh Analysis</Button>
      </div>
    </div>
  );
}
