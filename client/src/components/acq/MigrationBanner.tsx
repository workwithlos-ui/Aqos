import { useMemo, useState } from "react";
import { ArrowUpFromLine, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  legacyMigrationCompleted,
  markLegacyMigrationCompleted,
  pendingLegacyDeals,
  readLegacyDeals,
} from "@/lib/acquisition/store";
import { toast } from "sonner";

/**
 * Shown above the AppShell when:
 *   - The user has legacy v2 localStorage deals (from pre-Horizon-3) and
 *   - Those deals are NOT already in the server DB and
 *   - The user has not previously dismissed / completed the migration.
 *
 * Provides a single "Import N deals" button that calls deals.bulkImport,
 * marks migration as complete, and shows a success toast.
 */
export function MigrationBanner() {
  const dealsQuery = trpc.deals.list.useQuery();
  const utils = trpc.useUtils();
  const [dismissed, setDismissed] = useState(legacyMigrationCompleted());

  const bulkImportMut = trpc.deals.bulkImport.useMutation({
    onSuccess: ({ created, skipped }) => {
      utils.deals.list.invalidate();
      markLegacyMigrationCompleted();
      setDismissed(true);
      toast.success(
        `Migration complete: ${created} deal${created === 1 ? "" : "s"} imported${skipped > 0 ? `, ${skipped} skipped` : ""}.`,
      );
    },
    onError: (err) => {
      toast.error(`Migration failed: ${err.message}`);
    },
  });

  const pending = useMemo(() => {
    if (dismissed) return [];
    if (!dealsQuery.data) return [];
    // Cast: tRPC returns a generic object array; we know it's DealInput[].
    return pendingLegacyDeals(dealsQuery.data as unknown as ReturnType<typeof readLegacyDeals>);
  }, [dealsQuery.data, dismissed]);

  if (pending.length === 0) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-950">
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-3 flex flex-wrap items-center gap-4">
        <ArrowUpFromLine className="size-4 shrink-0 text-amber-700" />
        <div className="flex-1 min-w-0 text-[13px] leading-snug">
          <span className="font-semibold">
            {pending.length} legacy deal{pending.length === 1 ? "" : "s"} found in this browser.
          </span>{" "}
          <span className="text-amber-900/80">
            Import them now to make them available across browsers and devices.
            This is a one-time action.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="default"
            disabled={bulkImportMut.isPending}
            onClick={() => {
              bulkImportMut.mutate({
                deals: pending as unknown as Record<string, unknown>[],
              });
            }}
          >
            {bulkImportMut.isPending ? (
              "Importing…"
            ) : (
              <>
                <CheckCircle2 className="size-4 mr-1.5" />
                Import {pending.length} deal{pending.length === 1 ? "" : "s"}
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              markLegacyMigrationCompleted();
              setDismissed(true);
            }}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
