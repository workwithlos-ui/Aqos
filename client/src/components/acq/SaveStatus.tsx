import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

/**
 * SaveStatus indicator (P0 ship-blocker 3.6).
 *
 * Three explicit states:
 *   - "idle"   → either nothing yet, or muted "Saved · Xs ago" auto-incrementing
 *   - "saving" → spinner + "Saving…" (must appear within 500ms of click)
 *   - "saved"  → green check + "Saved" (sticks for ~3s then collapses to idle)
 */

export type SaveStatusState = "idle" | "saving" | "saved";

function relative(ts: number | null): string {
  if (!ts) return "Not saved yet";
  const delta = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (delta < 5) return "Saved · just now";
  if (delta < 60) return `Saved · ${delta}s ago`;
  const m = Math.floor(delta / 60);
  if (m < 60) return `Saved · ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Saved · ${h}h ago`;
  return `Saved · ${Math.floor(h / 24)}d ago`;
}

export function SaveStatus({
  state = "idle",
  lastSavedAt,
}: {
  state?: SaveStatusState;
  lastSavedAt: number | null;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((t) => t + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  if (state === "saving") {
    return (
      <div
        data-testid="save-status-saving"
        className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Saving…</span>
      </div>
    );
  }

  if (state === "saved") {
    return (
      <div
        data-testid="save-status-saved"
        className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300"
      >
        <Check className="size-3.5" />
        <span>Saved</span>
      </div>
    );
  }

  return (
    <div
      data-testid="save-status-idle"
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      <Check className="size-3.5 text-emerald-600" />
      <span>{relative(lastSavedAt)}</span>
    </div>
  );
}
