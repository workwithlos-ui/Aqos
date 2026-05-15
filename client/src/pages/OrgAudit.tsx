import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useRole } from "@/lib/acquisition/useRole";
import { AuditDiffView } from "@/components/acq/AuditDiffView";
import { Download, ShieldX, History as HistoryIcon, FileArchive } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

function downloadBase64Zip(filename: string, base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export default function OrgAudit() {
  const { isPartner, role } = useRole();
  const [filter, setFilter] = useState("");
  const auditQuery = trpc.deals.auditAll.useQuery({ limit: 500 }, { enabled: isPartner });

  const exportMutation = trpc.compliance.exportArchive.useMutation({
    onSuccess: (data) => {
      downloadBase64Zip(data.filename, data.base64);
      toast.success(
        `Compliance archive ready (${(data.sizeBytes / 1024).toFixed(1)} KB) — ${data.counts.audit} audit, ${data.counts.versions} versions, ${data.counts.deals} deals`,
      );
    },
    onError: (e) => toast.error(`Export failed: ${e.message}`),
  });

  const entries = auditQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      [e.action, e.targetId, e.summary, e.actorName, e.actorOpenId]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q)),
    );
  }, [entries, filter]);

  if (!isPartner) {
    return (
      <div className="max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldX className="size-5 text-rose-600" /> Partner access required
            </CardTitle>
            <CardDescription>
              Org-wide audit is restricted to Partner role. Your current role: <span className="font-mono">{role}</span>.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="org-audit-page">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <HistoryIcon className="size-5" />
            <h1 className="font-display text-2xl tracking-tight">Org audit</h1>
          </div>
          <p className="text-sm text-foreground/60 max-w-xl">
            Append-only record of every mutation across the org. Search by deal id, actor, or action. Export the full
            archive (audit log CSV + deal version snapshots + README) for compliance review.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter (deal id / actor / action)"
            className="w-72"
            data-testid="org-audit-filter"
          />
          <Button
            onClick={() => exportMutation.mutate({})}
            disabled={exportMutation.isPending}
            data-testid="compliance-export-button"
          >
            {exportMutation.isPending ? (
              <>
                <FileArchive className="size-4 mr-2 animate-pulse" /> Building archive…
              </>
            ) : (
              <>
                <Download className="size-4 mr-2" /> Compliance export (.zip)
              </>
            )}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Audit entries</CardTitle>
            <CardDescription>
              {filtered.length} of {entries.length} entries · newest first
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {auditQuery.isLoading ? (
            <div className="text-sm text-foreground/60">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-foreground/50 italic">No matching audit entries.</div>
          ) : (
            <div className="space-y-4">
              {filtered.map((e) => (
                <div key={e.id} className="border-l-2 border-foreground/10 pl-4 pb-4" data-testid="org-audit-entry">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <div className="text-sm font-medium">{e.summary ?? e.action}</div>
                    <div className="text-[11px] text-foreground/55">{new Date(e.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="text-xs text-foreground/60 mb-2 flex gap-4 flex-wrap">
                    <span>
                      Actor: <span className="font-medium">{e.actorName ?? e.actorOpenId}</span>
                    </span>
                    <span>
                      Action: <span className="font-mono">{e.action}</span>
                    </span>
                    {e.targetId && (
                      <span>
                        Deal: <span className="font-mono">{e.targetId}</span>
                      </span>
                    )}
                  </div>
                  <AuditDiffView diff={e.diff as { field: string; before: unknown; after: unknown }[]} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
