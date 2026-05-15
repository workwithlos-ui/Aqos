import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, LogIn } from "lucide-react";
import { getLoginUrl } from "@/const";
import type { ReactNode } from "react";
import { MigrationBanner } from "./MigrationBanner";

/**
 * Server-backed mode requires authentication. This gate replaces the entire
 * shell with a sign-in card while the user is logged out. Once authenticated,
 * children render and the migration banner is shown above them if there are
 * legacy localStorage deals to import.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
          <div className="text-sm">Loading session…</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen grid place-items-center bg-background px-6">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl shadow-sm p-8 text-card-foreground">
          <div className="size-10 rounded-lg bg-foreground text-background grid place-items-center mb-5">
            <ShieldCheck className="size-5" />
          </div>
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
            Acquisition OS · Buyer-grade engine
          </div>
          <h1 className="text-2xl font-display font-semibold mb-3">
            Sign in to continue
          </h1>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            Every deal change is persisted to the institutional database and
            recorded in an immutable audit log. Sign in with your Manus
            account to see your pipeline across browsers and devices.
          </p>
          <Button
            className="w-full"
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
          >
            <LogIn className="size-4 mr-2" />
            Sign in with Manus
          </Button>
          <div className="mt-6 text-[11px] text-muted-foreground leading-relaxed">
            Sessions persist for 30 days. Logging in on a second browser will
            show the same deals and the same audit trail.
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <MigrationBanner />
      {children}
    </>
  );
}
