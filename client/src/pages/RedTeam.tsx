import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useDealStore } from "@/lib/acquisition/store";
import { analyzeDeal } from "@/lib/acquisition";
import { useState, useMemo } from "react";

export default function RedTeamPage() {
  const { deals, assumptions } = useDealStore();
  const currentDeal = deals[0];
  const [selectedDealId, setSelectedDealId] = useState(currentDeal?.id);

  const analysis = useMemo(() => {
    const deal = deals.find((d) => d.id === selectedDealId) ?? deals[0];
    return deal ? analyzeDeal(deal, assumptions) : null;
  }, [selectedDealId, deals, assumptions]);

  if (!analysis) {
    return <div className="text-muted-foreground">No deal selected.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Red Team Objections</h1>
        <p className="text-muted-foreground mt-2">
          What could destroy value? What would a lender reject? What assumptions are most fragile?
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

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Objection Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total Objections</p>
            <p className="text-2xl font-bold">{analysis.redTeam.objections.length}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Unresolved Critical</p>
            <Badge variant={analysis.redTeam.unresolvedCriticalCount > 0 ? "destructive" : "default"}>
              {analysis.redTeam.unresolvedCriticalCount}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Top Objections */}
      {analysis.redTeam.topObjections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Objections</CardTitle>
            <CardDescription>Most critical issues to resolve</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {analysis.redTeam.topObjections.map((obj, i) => (
              <div key={i} className="border rounded p-3">
                <p className="font-medium text-sm mb-1">{obj.prompt}</p>
                <p className="text-sm text-muted-foreground">{obj.finding}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* All Objections */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Objections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {analysis.redTeam.objections.length === 0 ? (
            <p className="text-muted-foreground">No objections identified.</p>
          ) : (
            analysis.redTeam.objections.map((obj, i) => (
              <div key={i} className="border rounded p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium">{obj.prompt}</p>
                    <p className="text-sm text-muted-foreground mt-1">{obj.finding}</p>
                  </div>
                  <Badge
                    variant={
                      obj.severity === "critical"
                        ? "destructive"
                        : obj.severity === "high"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {obj.severity}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <p className="font-medium">{obj.status}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Owner:</span>
                    <p className="font-medium">{obj.owner}</p>
                  </div>
                </div>

                {obj.evidenceNeeded.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-1">Evidence Needed:</p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {obj.evidenceNeeded.map((e, j) => (
                        <li key={j} className="flex items-center gap-2">
                          <Checkbox checked={false} disabled />
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <Checkbox checked={obj.cleared ?? false} disabled />
                  <span className="text-sm">{obj.cleared ? "Cleared" : "Unresolved"}</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline">Export Red Team Report</Button>
        <Button>Refresh Analysis</Button>
      </div>
    </div>
  );
}
