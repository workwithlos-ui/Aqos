import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useDealStore } from "@/lib/acquisition/store";
import { analyzeDeal } from "@/lib/acquisition";
import { useMemo } from "react";
import { ActiveDealPicker } from "@/components/acq/ActiveDealPicker";

export default function RedTeamPage() {
  const { deals, assumptions, activeDealId } = useDealStore();
  const dealId = activeDealId ?? deals[0]?.id ?? "";
  const deal = useMemo(() => deals.find((d) => d.id === dealId) ?? null, [deals, dealId]);
  const analysis = useMemo(() => (deal ? analyzeDeal(deal, assumptions) : null), [deal, assumptions]);

  if (!analysis || !deal) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Red Team Objections</h1>
          <p className="text-muted-foreground mt-2">No deal selected.</p>
        </div>
        <ActiveDealPicker className="max-w-sm" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-bold">Red Team Objections</h1>
          <p className="text-muted-foreground mt-2">
            Deal-specific objections derived from <span className="font-mono">{deal.companyName?.trim() || "Untitled deal"}</span>'s verified DealAnalysis.
          </p>
        </div>
        <ActiveDealPicker className="min-w-[220px]" />
      </div>

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
    </div>
  );
}
