import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useDealStore } from "@/lib/acquisition/store";
import { useRole } from "@/lib/acquisition/useRole";
import { AuditDiffView } from "@/components/acq/AuditDiffView";
import { Link, useParams, useLocation } from "wouter";
import { useMemo, useState } from "react";
import { ArrowLeft, History, RotateCcw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export default function DealHistory() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { deals } = useDealStore();
  const { isPartner, can } = useRole();

  const deal = useMemo(() => deals.find((d) => d.id === id), [deals, id]);

  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");

  const auditQuery = trpc.deals.auditForDeal.useQuery(
    { dealId: id ?? "", limit: 200 },
    { enabled: Boolean(id) },
  );

  // Also fetch comment audit entries for this deal
  const commentAuditQuery = trpc.deals.auditForEntity.useQuery(
    { entityType: "comment", entityId: id ?? "", limit: 200 },
    { enabled: Boolean(id) },
  );
  const versionsQuery = trpc.deals.versions.useQuery(
    { dealId: id ?? "" },
    { enabled: Boolean(id) },
  );

  const utils = trpc.useUtils();
  const restoreMutation = trpc.deals.restoreVersion.useMutation({
    onSuccess: (data) => {
      toast.success(`Restored to version ${data.restoredFromVersion}. New version: v${data.newVersion}.`);
      utils.deals.list.invalidate();
      utils.deals.auditForDeal.invalidate({ dealId: id ?? "" });
      utils.deals.versions.invalidate({ dealId: id ?? "" });
    },
    onError: (e) => toast.error(`Restore failed: ${e.message}`),
  });

  const [pendingRestore, setPendingRestore] = useState<number | null>(null);

  if (!id) return <div className="p-6">Missing deal id.</div>;
  if (!deal) {
    return (
      <div className="p-6">
        <Link href="/pipeline">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4 mr-2" /> Back to pipeline
          </Button>
        </Link>
        <div className="mt-6 text-foreground/60">Deal not found in this org.</div>
      </div>
    );
  }

  // Merge deal + comment audit entries, sort newest first
  const allAudit = useMemo(() => {
    type AuditRow = {
      id: number | string;
      targetType: string | null;
      targetId: string | null;
      action: string;
      summary: string | null;
      actorName: string | null;
      actorOpenId: string;
      diff: unknown;
      createdAt: string | Date;
    };
    const dealEntries = ((auditQuery.data ?? []) as AuditRow[]).map((e) => ({ ...e, entityType: e.targetType ?? "deal" }));
    const commentEntries = ((commentAuditQuery.data ?? []) as AuditRow[]).map((e) => ({ ...e, entityType: e.targetType ?? "comment" }));
    const merged = [...dealEntries, ...commentEntries].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (entityTypeFilter === "all") return merged;
    return merged.filter((e) => e.entityType === entityTypeFilter);
  }, [auditQuery.data, commentAuditQuery.data, entityTypeFilter]);

  const audit = allAudit;
  const versions = versionsQuery.data ?? [];

  return (
    <div className="space-y-6" data-testid="deal-history-page">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/analyze/${id}`)}>
          <ArrowLeft className="size-4 mr-2" /> Back to deal
        </Button>
        <div>
          <h1 className="font-display text-2xl tracking-tight">History — {deal.companyName}</h1>
          <p className="text-sm text-foreground/60">
            Every mutation. Newest first. Restore is partner-only.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Audit log column */}
        <Card data-testid="history-audit-column">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <History className="size-4" /> Audit log
                </CardTitle>
                <CardDescription>{audit.length} entries</CardDescription>
              </div>
              <select
                value={entityTypeFilter}
                onChange={(e) => setEntityTypeFilter(e.target.value)}
                className="text-xs border rounded px-2 py-1 bg-background"
                data-testid="history-filter"
              >
                <option value="all">All events</option>
                <option value="deal">Deal mutations</option>
                <option value="comment">Comments</option>
              </select>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {audit.length === 0 ? (
              <div className="text-sm text-foreground/50 italic">No audit entries yet.</div>
            ) : (
              audit.map((entry) => (
                <div key={entry.id} className="border-l-2 border-foreground/10 pl-4 pb-4" data-testid="audit-entry">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <div className="text-sm font-medium" data-testid="audit-summary">
                      {entry.summary ?? entry.action}
                    </div>
                    <div className="text-[11px] text-foreground/50">
                      {new Date(entry.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-xs text-foreground/60 mb-2">
                    by <span className="font-medium" data-testid="audit-actor">{entry.actorName ?? entry.actorOpenId}</span>{" "}
                    · {entry.action}
                  </div>
                  <AuditDiffView diff={entry.diff as { field: string; before: unknown; after: unknown }[]} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Versions column */}
        <Card data-testid="history-versions-column">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="size-4" /> Versions
            </CardTitle>
            <CardDescription>
              {versions.length} snapshots · latest v{versions[0]?.version ?? 1}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!can("deal.restore_version") && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                <ShieldAlert className="size-4 shrink-0 mt-0.5" />
                <div>
                  Your role can view versions but cannot restore. Restore is partner-only and will be enforced at the server.
                </div>
              </div>
            )}
            {versions.length === 0 ? (
              <div className="text-sm text-foreground/50 italic">No version snapshots.</div>
            ) : (
              versions.map((v) => {
                const payload = v.payload as Record<string, unknown>;
                return (
                  <div
                    key={v.id}
                    className="border border-border rounded-lg p-3 hover:bg-muted/40 transition-colors"
                    data-testid="version-row"
                    data-version={v.version}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm">
                          Version {v.version}{" "}
                          {v.reason ? (
                            <span className="text-[11px] uppercase tracking-wider text-foreground/50 ml-2">
                              {v.reason}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-foreground/55">
                          {new Date(v.createdAt).toLocaleString()} · {String(payload.companyName ?? deal.companyName)}{" "}
                          · stage: {String(payload.stage ?? "—")}
                        </div>
                      </div>
                      {isPartner ? (
                        <Button
                          size="sm"
                          variant={pendingRestore === v.id ? "default" : "outline"}
                          disabled={restoreMutation.isPending}
                          data-testid="restore-button"
                          onClick={() => {
                            if (pendingRestore === v.id) {
                              restoreMutation.mutate({ dealId: id, versionId: v.id });
                              setPendingRestore(null);
                            } else {
                              setPendingRestore(v.id);
                              setTimeout(() => setPendingRestore((curr) => (curr === v.id ? null : curr)), 4_000);
                            }
                          }}
                        >
                          {pendingRestore === v.id ? "Click to confirm" : "Restore as of"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
