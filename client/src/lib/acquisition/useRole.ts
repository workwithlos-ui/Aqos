import { useAuth } from "@/_core/hooks/useAuth";
import { can, normalizeRole, type Permission, type Role, ROLE_LABELS, ROLE_DESCRIPTIONS } from "@shared/roles";

/**
 * useRole — returns the current user's normalized role plus a `can()` helper
 * that the UI uses to HIDE (not disable) actions per Sprint B's rule.
 * Server-side middleware is the source of truth; this hook just keeps the UI
 * honest. A forged client request will still 403 at the tRPC layer.
 */
export function useRole() {
  const { user, loading } = useAuth();
  const rawRole = (user as unknown as { role?: string } | null)?.role;
  const role: Role = normalizeRole(rawRole ?? null);
  return {
    loading,
    role,
    label: ROLE_LABELS[role],
    description: ROLE_DESCRIPTIONS[role],
    isPartner: role === "partner",
    isAnalyst: role === "analyst",
    isObserver: role === "observer",
    can: (perm: Permission) => can(role, perm),
  };
}
