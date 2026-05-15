import {
  bigint,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// ---------------------------------------------------------------------------
// USERS — Manus OAuth-backed identity. Owned by the framework.
// ---------------------------------------------------------------------------

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "partner", "analyst", "observer"]).default("analyst").notNull(),
  /** Org the user belongs to. Defaults to org 1 (the owner's org) on first login. */
  orgId: int("orgId").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ---------------------------------------------------------------------------
// ORGS — Multi-tenant container. Every deal belongs to one org.
// ---------------------------------------------------------------------------

export const orgs = mysqlTable("orgs", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  /** openId of the org owner (creator). */
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Org = typeof orgs.$inferSelect;
export type InsertOrg = typeof orgs.$inferInsert;

// ---------------------------------------------------------------------------
// DEALS — One row per deal. The full DealInput payload lives in `payload` JSON.
// ---------------------------------------------------------------------------

export const deals = mysqlTable(
  "deals",
  {
    /** Surrogate key. */
    id: int("id").autoincrement().primaryKey(),
    /** Public-facing deal id, stable across versions (matches DealInput.id). */
    dealId: varchar("dealId", { length: 64 }).notNull().unique(),
    orgId: int("orgId").notNull(),
    /** Denormalized for cheap list queries. */
    companyName: varchar("companyName", { length: 256 }).notNull(),
    industry: varchar("industry", { length: 128 }),
    stage: varchar("stage", { length: 64 }),
    /** Full DealInput JSON — single source of truth for the deterministic engine. */
    payload: json("payload").$type<Record<string, unknown>>().notNull(),
    /** Demo / test markers — preserved from localStorage seed semantics. */
    isDemo: int("isDemo").default(0).notNull(),
    isTest: int("isTest").default(0).notNull(),
    /** Monotonically increasing version, bumped on every mutation. */
    version: int("version").default(1).notNull(),
    createdByOpenId: varchar("createdByOpenId", { length: 64 }).notNull(),
    updatedByOpenId: varchar("updatedByOpenId", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    orgIdx: index("deals_org_idx").on(table.orgId),
    stageIdx: index("deals_stage_idx").on(table.stage),
  }),
);

export type Deal = typeof deals.$inferSelect;
export type InsertDeal = typeof deals.$inferInsert;

// ---------------------------------------------------------------------------
// DEAL_VERSIONS — Full snapshots for point-in-time recovery and "see history".
// ---------------------------------------------------------------------------

export const dealVersions = mysqlTable(
  "deal_versions",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    dealId: varchar("dealId", { length: 64 }).notNull(),
    orgId: int("orgId").notNull(),
    version: int("version").notNull(),
    payload: json("payload").$type<Record<string, unknown>>().notNull(),
    actorOpenId: varchar("actorOpenId", { length: 64 }).notNull(),
    /** Free-form reason e.g. "edit", "create", "stage_change". */
    reason: varchar("reason", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    dealIdx: index("deal_versions_deal_idx").on(table.dealId),
    orgIdx: index("deal_versions_org_idx").on(table.orgId),
  }),
);

export type DealVersion = typeof dealVersions.$inferSelect;
export type InsertDealVersion = typeof dealVersions.$inferInsert;

// ---------------------------------------------------------------------------
// AUDIT_LOG — Every mutation, with structured diff. Append-only.
// ---------------------------------------------------------------------------

export type AuditAction =
  | "deal.create"
  | "deal.update"
  | "deal.delete"
  | "deal.stage_change"
  | "assumptions.update"
  | "assumptions.reset"
  | "seed.reset"
  | "active_deal.set"
  | "migration.import"
  | "comment.create"
  | "comment.update"
  | "comment.delete"
  | "comment.resolve"
  | "comment.unresolve"
  | "comment.set_blocker";

export type AuditDiffEntry = {
  field: string;
  before: unknown;
  after: unknown;
};

export const auditLog = mysqlTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    orgId: int("orgId").notNull(),
    actorOpenId: varchar("actorOpenId", { length: 64 }).notNull(),
    actorName: text("actorName"),
    action: varchar("action", { length: 64 }).notNull(),
    /** Optional target — e.g. dealId for deal.* actions. */
    targetType: varchar("targetType", { length: 64 }),
    targetId: varchar("targetId", { length: 64 }),
    /** Structured diff: array of {field, before, after}. */
    diff: json("diff").$type<AuditDiffEntry[]>(),
    /** Optional human summary for fast scanning. */
    summary: text("summary"),
    /** IP / user-agent metadata for forensic review. */
    ipAddress: varchar("ipAddress", { length: 64 }),
    userAgent: text("userAgent"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("audit_log_org_idx").on(table.orgId),
    targetIdx: index("audit_log_target_idx").on(table.targetType, table.targetId),
    actorIdx: index("audit_log_actor_idx").on(table.actorOpenId),
  }),
);

export type AuditEntry = typeof auditLog.$inferSelect;
export type InsertAuditEntry = typeof auditLog.$inferInsert;

// ---------------------------------------------------------------------------
// ORG_SETTINGS — Per-org capital stack assumptions and active deal selection.
// One row per org.
// ---------------------------------------------------------------------------

export const orgSettings = mysqlTable("org_settings", {
  orgId: int("orgId").primaryKey(),
  /** Full CapitalStackAssumptions JSON. */
  assumptions: json("assumptions").$type<Record<string, unknown>>().notNull(),
  /** Last-selected active deal id for the org. */
  activeDealId: varchar("activeDealId", { length: 64 }),
  updatedByOpenId: varchar("updatedByOpenId", { length: 64 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OrgSettings = typeof orgSettings.$inferSelect;
export type InsertOrgSettings = typeof orgSettings.$inferInsert;

// ---------------------------------------------------------------------------
// COMMENTS — Per-deal flat threads. Soft-delete only.
// ---------------------------------------------------------------------------

export const comments = mysqlTable(
  "comments",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    dealId: varchar("dealId", { length: 64 }).notNull(),
    orgId: int("orgId").notNull(),
    authorOpenId: varchar("authorOpenId", { length: 64 }).notNull(),
    /** Markdown body. */
    body: text("body").notNull(),
    /** Resolved state with attribution. */
    resolvedAt: timestamp("resolvedAt"),
    resolvedByOpenId: varchar("resolvedByOpenId", { length: 64 }),
    /** Blocker flag (Partner-only). Independent of resolved state. */
    isBlocker: int("isBlocker").default(0).notNull(),
    /** Soft delete marker. */
    deletedAt: timestamp("deletedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    dealIdx: index("comments_deal_idx").on(table.dealId),
    orgIdx: index("comments_org_idx").on(table.orgId),
    authorIdx: index("comments_author_idx").on(table.authorOpenId),
  }),
);

export type Comment = typeof comments.$inferSelect;
export type InsertComment = typeof comments.$inferInsert;

/** Computed field: true if deal has any unresolved blocker comments. */
export type CommentWithBlocker = Comment & { isBlocker: 0 | 1 };

// ---------------------------------------------------------------------------
// NOTIFICATIONS — In-app bell notifications for @mentions and comment events.
// ---------------------------------------------------------------------------

export const notifications = mysqlTable(
  "notifications",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    recipientOpenId: varchar("recipientOpenId", { length: 64 }).notNull(),
    orgId: int("orgId").notNull(),
    /** Reference to the triggering comment. */
    commentId: bigint("commentId", { mode: "number" }).notNull(),
    dealId: varchar("dealId", { length: 64 }).notNull(),
    /** Notification type: 'mention', 'resolve', 'reply', etc. */
    type: varchar("type", { length: 64 }).default("mention").notNull(),
    /** Read state. */
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    recipientIdx: index("notifications_recipient_idx").on(table.recipientOpenId),
    dealIdx: index("notifications_deal_idx").on(table.dealId),
    orgIdx: index("notifications_org_idx").on(table.orgId),
  }),
);

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
