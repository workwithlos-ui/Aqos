// Centralized role + permission map for Acquisition OS.
// SHARED between server (RBAC middleware) and client (UI hide/show).
// Single source of truth — updating this file changes both sides.

export type Role = "partner" | "analyst" | "observer" | "admin" | "user";

/** Canonical roles introduced in Sprint B. `admin`/`user` are legacy. */
export const CANONICAL_ROLES: Role[] = ["partner", "analyst", "observer"];

/** Treat legacy values as their closest canonical equivalents. */
export function normalizeRole(role: Role | string | null | undefined): Role {
  if (!role) return "observer";
  if (role === "admin") return "partner";
  if (role === "user") return "analyst";
  if (role === "partner" || role === "analyst" || role === "observer") return role;
  return "observer";
}

/**
 * Permission keys. Server middleware checks these; client UI checks the same
 * map so every gate has exactly one place to be wrong.
 */
export type Permission =
  | "deal.create"
  | "deal.edit"
  | "deal.delete"
  | "deal.stage_change"
  | "deal.send_to_ic"
  | "deal.vote_ic"
  | "deal.approve_loi"
  | "deal.override_engine"
  | "deal.restore_version"
  | "assumptions.edit"
  | "audit.view_org"
  | "compliance.export"
  | "comment.create"
  | "comment.edit_own"
  | "comment.delete_own"
  | "comment.delete_any"
  | "comment.resolve"
  | "comment.set_blocker"
  | "notification.read"
  | "conflict.declare"
  | "conflict.withdraw_own"
  | "conflict.withdraw_any"
  | "conflict.acknowledge"
  | "conflict.view"
  | "vote.open"
  | "vote.close"
  | "vote.reopen"
  | "ballot.cast";

const PARTNER_PERMS: Permission[] = [
  "deal.create",
  "deal.edit",
  "deal.delete",
  "deal.stage_change",
  "deal.send_to_ic",
  "deal.vote_ic",
  "deal.approve_loi",
  "deal.override_engine",
  "deal.restore_version",
  "assumptions.edit",
  "audit.view_org",
  "compliance.export",
  "comment.create",
  "comment.edit_own",
  "comment.delete_own",
  "comment.delete_any",
  "comment.resolve",
  "comment.set_blocker",
  "notification.read",
  "conflict.declare",
  "conflict.withdraw_own",
  "conflict.withdraw_any",
  "conflict.acknowledge",
  "conflict.view",
  "vote.open",
  "vote.close",
  "vote.reopen",
  "ballot.cast",
];

const ANALYST_PERMS: Permission[] = [
  "deal.create",
  "deal.edit",
  "deal.stage_change",
  "assumptions.edit",
  "comment.create",
  "comment.edit_own",
  "comment.delete_own",
  "comment.resolve",
  "notification.read",
  "conflict.declare",
  "conflict.withdraw_own",
  "conflict.acknowledge",
  "conflict.view",
  "ballot.cast",
];

const OBSERVER_PERMS: Permission[] = [
  "notification.read", // Observers can read notifications but cannot create/edit/delete/resolve/flag comments
  "conflict.acknowledge", // Observers can acknowledge conflicts (but not declare or withdraw)
  "conflict.view",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  partner: PARTNER_PERMS,
  analyst: ANALYST_PERMS,
  observer: OBSERVER_PERMS,
  admin: PARTNER_PERMS, // legacy — treated as partner
  user: ANALYST_PERMS, // legacy — treated as analyst
};

export function can(role: Role | string | null | undefined, perm: Permission): boolean {
  const r = normalizeRole(role);
  return ROLE_PERMISSIONS[r].includes(perm);
}

export const ROLE_LABELS: Record<Role, string> = {
  partner: "Partner",
  analyst: "Analyst",
  observer: "Observer",
  admin: "Partner",
  user: "Analyst",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  partner: "Full access. Vote in IC. Approve LOIs. Override engine. Can delete any comment.",
  analyst: "Create and edit deals. Run analysis. Cannot approve LOIs or vote. Can comment and resolve.",
  observer: "Read-only. LP-style access. Can read comments but cannot create, edit, delete, or resolve.",
  admin: "Full access. Vote in IC. Approve LOIs. Override engine. Can delete any comment.",
  user: "Create and edit deals. Run analysis. Cannot approve LOIs or vote. Can comment and resolve.",
};
