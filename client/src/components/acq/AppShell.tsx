import { cn } from "@/lib/utils";
import { useRole } from "@/lib/acquisition/useRole";
import {
  LayoutDashboard,
  Target,
  Calculator,
  Bot,
  FileText,
  SlidersHorizontal,
  ShieldCheck,
  Briefcase,
  TrendingUp,
  Zap,
  CheckCircle,
  AlertTriangle,
  Layers,
  History,
} from "lucide-react";
import type { ReactNode } from "react";
import { useLocation, Link } from "wouter";

const NAV = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/pipeline", label: "Pipeline", icon: Target },
  { path: "/analyze", label: "Deal Analyzer", icon: Calculator },
  { path: "/underwriting", label: "Underwriting", icon: Layers },
  { path: "/advisor", label: "Deal Copilot", icon: Bot },
  { path: "/exports", label: "Exports", icon: FileText },
  { path: "/assumptions", label: "Capital Stack", icon: SlidersHorizontal },
  { path: "/tests", label: "Test Suite", icon: ShieldCheck },
];

const M_AND_A_NAV = [
  { path: "/m-and-a/thesis", label: "Buy Box / Thesis", icon: Briefcase },
  { path: "/m-and-a/working-capital", label: "Working Capital", icon: TrendingUp },
  { path: "/m-and-a/integration", label: "Integration", icon: Zap },
  { path: "/m-and-a/governance", label: "Governance", icon: CheckCircle },
  { path: "/m-and-a/red-team", label: "Red Team", icon: AlertTriangle },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const { role, label, isPartner } = useRole();
  return (
    <div className="min-h-screen flex">
      <aside className="hidden md:flex w-[240px] shrink-0 flex-col bg-sidebar text-sidebar-foreground p-4 gap-1 sticky top-0 h-screen border-r border-sidebar-border overflow-y-auto">
        <div className="px-2 py-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center font-display font-semibold text-base">
              A
            </div>
            <div>
              <div className="font-display font-semibold text-sidebar-foreground leading-tight">Acquisition OS</div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-sidebar-foreground/60">Buyer-grade engine</div>
            </div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((n) => {
            const active = n.path === "/" ? loc === "/" : loc.startsWith(n.path);
            const Icon = n.icon;
            return (
              <Link key={n.path} href={n.path}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] transition-all",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-[inset_0_0_0_1px_oklch(1_0_0/0.08)]"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/40",
                  )}
                  style={{ transitionDuration: "180ms", transitionTimingFunction: "var(--ease-out)" }}
                >
                  <Icon className="size-4" />
                  <span>{n.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 pt-4 border-t border-sidebar-border">
          <div className="px-2 py-2 text-[11px] uppercase tracking-[0.18em] text-sidebar-foreground/50 font-semibold mb-2">
            M&A OS
          </div>
          <nav className="flex flex-col gap-0.5">
            {M_AND_A_NAV.map((n) => {
              const active = loc.startsWith(n.path);
              const Icon = n.icon;
              return (
                <Link key={n.path} href={n.path}>
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-[inset_0_0_0_1px_oklch(1_0_0/0.08)]"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/40",
                    )}
                    style={{ transitionDuration: "180ms", transitionTimingFunction: "var(--ease-out)" }}
                  >
                    <Icon className="size-4" />
                    <span>{n.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>

        {isPartner && (
          <div className="mt-4">
            <div className="px-2 py-2 text-[11px] uppercase tracking-[0.18em] text-sidebar-foreground/50 font-semibold mb-2">
              Partner
            </div>
            <nav className="flex flex-col gap-0.5">
              <Link href="/org/audit">
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all",
                    loc.startsWith("/org/audit")
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/40",
                  )}
                  style={{ transitionDuration: "180ms", transitionTimingFunction: "var(--ease-out)" }}
                >
                  <History className="size-4" />
                  <span>Org Audit</span>
                </div>
              </Link>
            </nav>
          </div>
        )}

        <div className="mt-auto space-y-3">
          <div
            className="rounded-lg border border-sidebar-border bg-sidebar-accent/30 px-3 py-2 text-[11px] text-sidebar-foreground/80 flex items-center justify-between"
            data-testid="role-badge"
          >
            <span className="uppercase tracking-[0.14em] text-sidebar-foreground/50">Role</span>
            <span className="font-semibold text-sidebar-foreground" data-role={role}>{label}</span>
          </div>
          <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3 text-[11px] text-sidebar-foreground/70 leading-snug">
            <div className="font-semibold text-sidebar-foreground mb-1">Deterministic engine</div>
            Every metric is computed by the rules engine. AI advisor only interprets verified outputs — it does not invent math.
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="md:hidden sticky top-0 z-40 bg-sidebar text-sidebar-foreground border-b border-sidebar-border px-4 py-3 flex gap-3 overflow-x-auto">
          {NAV.map((n) => (
            <Link key={n.path} href={n.path}>
              <span className={cn("text-xs whitespace-nowrap", loc === n.path && "font-semibold text-sidebar-primary")}>
                {n.label}
              </span>
            </Link>
          ))}
        </div>
        <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
