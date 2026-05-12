import { cn } from "@/lib/utils";
import type { Verdict } from "@/lib/acquisition/types";

const STYLE: Record<Verdict, { bg: string; border: string; text: string; dot: string }> = {
  PURSUE: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  "PURSUE WITH CAUTION": {
    bg: "bg-sky-500/10",
    border: "border-sky-500/30",
    text: "text-sky-700 dark:text-sky-400",
    dot: "bg-sky-500",
  },
  "DILIGENCE PRIORITY": {
    bg: "bg-amber-500/10",
    border: "border-amber-500/40",
    text: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  RENEGOTIATE: {
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    text: "text-orange-700 dark:text-orange-400",
    dot: "bg-orange-500",
  },
  PAUSE: {
    bg: "bg-zinc-500/10",
    border: "border-zinc-500/30",
    text: "text-zinc-700 dark:text-zinc-400",
    dot: "bg-zinc-500",
  },
  KILL: {
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
    text: "text-rose-700 dark:text-rose-400",
    dot: "bg-rose-500",
  },
  "CANNOT UNDERWRITE": {
    bg: "bg-slate-500/10",
    border: "border-slate-500/30",
    text: "text-slate-700 dark:text-slate-300",
    dot: "bg-slate-500",
  },
  "SCORING REVIEW REQUIRED": {
    bg: "bg-fuchsia-500/10",
    border: "border-fuchsia-500/30",
    text: "text-fuchsia-700 dark:text-fuchsia-300",
    dot: "bg-fuchsia-500",
  },
};

export function VerdictPill({ verdict, size = "md" }: { verdict: Verdict; size?: "sm" | "md" | "lg" }) {
  const s = STYLE[verdict];
  return (
    <span
      className={cn(
        "verdict-pill border",
        s.bg,
        s.border,
        s.text,
        size === "sm" && "text-[10px] px-2 py-0.5",
        size === "lg" && "text-sm px-3 py-1.5",
      )}
    >
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {verdict}
    </span>
  );
}

export function DscrPill({ label, value }: { label: string; value: number | null }) {
  let color = "bg-slate-500/10 border-slate-500/30 text-slate-600";
  let dot = "bg-slate-500";
  if (value !== null) {
    if (value >= 1.5) { color = "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"; dot = "bg-emerald-500"; }
    else if (value >= 1.25) { color = "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400"; dot = "bg-amber-500"; }
    else if (value >= 1.0) { color = "bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-400"; dot = "bg-orange-500"; }
    else { color = "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400"; dot = "bg-rose-500"; }
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", color)}>
      <span className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}
