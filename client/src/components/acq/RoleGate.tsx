import { useRole } from "@/lib/acquisition/useRole";
import type { Permission } from "@shared/roles";
import type { ReactNode } from "react";

/**
 * RoleGate — Sprint B convention: HIDE actions for insufficient roles, do not
 * just disable. Children are rendered only when the current user has `perm`.
 *
 * Server-side middleware is the source of truth. RoleGate is purely UI hygiene.
 */
export function RoleGate({
  perm,
  children,
  fallback = null,
}: {
  perm: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can, loading } = useRole();
  if (loading) return null;
  return can(perm) ? <>{children}</> : <>{fallback}</>;
}

/** Convenience wrapper for Partner-only areas. */
export function PartnerOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const { isPartner, loading } = useRole();
  if (loading) return null;
  return isPartner ? <>{children}</> : <>{fallback}</>;
}
