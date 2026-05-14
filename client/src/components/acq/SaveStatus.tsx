import { useEffect, useState } from "react";
import { Check } from "lucide-react";

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

export function SaveStatus({ lastSavedAt }: { lastSavedAt: number | null }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => clearInterval(id);
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _ = tick;
  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Check className="size-3.5 text-emerald-600" />
      <span>{relative(lastSavedAt)}</span>
    </div>
  );
}
