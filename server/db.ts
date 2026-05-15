import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  AuditDiffEntry,
  InsertAuditEntry,
  InsertDeal,
  InsertDealVersion,
  InsertOrgSettings,
  InsertUser,
  auditLog,
  dealVersions,
  deals,
  orgSettings,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ---------------------------------------------------------------------------
// USERS
// ---------------------------------------------------------------------------

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      // Sprint B: canonical roles are partner/analyst/observer.
      // Owner defaults to partner. Existing 'admin' rows are mapped to partner
      // by shared/roles.ts normalizeRole() so this is a forward-only change.
      values.role = "partner";
      updateSet.role = "partner";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ---------------------------------------------------------------------------
// DEALS
// ---------------------------------------------------------------------------

export async function listDealsByOrg(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(deals)
    .where(eq(deals.orgId, orgId))
    .orderBy(desc(deals.updatedAt));
}

export async function getDealByDealId(orgId: number, dealId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(deals)
    .where(and(eq(deals.orgId, orgId), eq(deals.dealId, dealId)))
    .limit(1);
  return rows[0];
}

export async function insertDealRow(insert: InsertDeal) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(deals).values(insert);
  return getDealByDealId(insert.orgId, insert.dealId);
}

export async function updateDealRow(
  orgId: number,
  dealId: string,
  patch: Partial<InsertDeal>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(deals)
    .set(patch)
    .where(and(eq(deals.orgId, orgId), eq(deals.dealId, dealId)));
  return getDealByDealId(orgId, dealId);
}

export async function deleteDealRow(orgId: number, dealId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(deals).where(and(eq(deals.orgId, orgId), eq(deals.dealId, dealId)));
}

// ---------------------------------------------------------------------------
// DEAL VERSIONS
// ---------------------------------------------------------------------------

export async function insertDealVersion(insert: InsertDealVersion) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(dealVersions).values(insert);
}

export async function listDealVersions(orgId: number, dealId: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(dealVersions)
    .where(and(eq(dealVersions.orgId, orgId), eq(dealVersions.dealId, dealId)))
    .orderBy(desc(dealVersions.version))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// AUDIT LOG
// ---------------------------------------------------------------------------

export async function insertAuditEntry(entry: InsertAuditEntry) {
  const db = await getDb();
  if (!db) {
    console.warn("[Audit] Database unavailable, dropping entry:", entry.action);
    return;
  }
  try {
    await db.insert(auditLog).values(entry);
  } catch (e) {
    // Audit log failures must never block the user. They are still logged.
    console.error("[Audit] Failed to insert entry:", e);
  }
}

export async function listAuditEntries(orgId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.orgId, orgId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

export async function listAuditEntriesForDeal(orgId: number, dealId: string, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.orgId, orgId),
        eq(auditLog.targetType, "deal"),
        eq(auditLog.targetId, dealId),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// ORG SETTINGS
// ---------------------------------------------------------------------------

export async function getOrgSettings(orgId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId)).limit(1);
  return rows[0];
}

export async function upsertOrgSettings(insert: InsertOrgSettings) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .insert(orgSettings)
    .values(insert)
    .onDuplicateKeyUpdate({
      set: {
        assumptions: insert.assumptions,
        activeDealId: insert.activeDealId,
        updatedByOpenId: insert.updatedByOpenId,
      },
    });
  return getOrgSettings(insert.orgId);
}

// ---------------------------------------------------------------------------
// DIFF UTILITY — produce a structured before/after diff for the audit log.
// Compares top-level fields of the deal payload only, with deep equality on
// nested objects (workingCapital, integration, riskInputs, etc).
// ---------------------------------------------------------------------------

export function computeDealDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): AuditDiffEntry[] {
  const diff: AuditDiffEntry[] = [];
  const keys = Array.from(new Set<string>([
    ...(before ? Object.keys(before) : []),
    ...Object.keys(after),
  ]));
  for (const k of keys) {
    const a = before ? (before as Record<string, unknown>)[k] : undefined;
    const b = (after as Record<string, unknown>)[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      diff.push({ field: k, before: a ?? null, after: b ?? null });
    }
  }
  return diff;
}


// ---------------------------------------------------------------------------
// COMPLIANCE EXPORT HELPERS (Sprint B)
// ---------------------------------------------------------------------------

export async function listAllDealVersionsForOrg(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(dealVersions)
    .where(eq(dealVersions.orgId, orgId))
    .orderBy(desc(dealVersions.createdAt));
}

export async function listAllAuditEntriesForOrg(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.orgId, orgId))
    .orderBy(desc(auditLog.createdAt));
}

export async function getOrgRow(orgId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { orgs } = await import("../drizzle/schema");
  const rows = await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1);
  return rows[0];
}

// ---------------------------------------------------------------------------
// COMMENTS — CRUD + soft delete + 15-min edit window + @mention extraction
// ---------------------------------------------------------------------------

export async function createComment(insert: {
  dealId: string;
  orgId: number;
  authorOpenId: string;
  body: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const { comments } = await import("../drizzle/schema");
  const result = await db.insert(comments).values(insert);
  const id = result[0].insertId;
  return db.select().from(comments).where(eq(comments.id, Number(id))).limit(1);
}

export async function getCommentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { comments } = await import("../drizzle/schema");
  const rows = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
  return rows[0];
}

export async function listCommentsForDeal(dealId: string, orgId: number) {
  const db = await getDb();
  if (!db) return [];
  const { comments } = await import("../drizzle/schema");
  return db
    .select()
    .from(comments)
    .where(and(eq(comments.dealId, dealId), eq(comments.orgId, orgId), isNull(comments.deletedAt)))
    .orderBy(asc(comments.createdAt));
}

export async function updateCommentBody(id: number, body: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const { comments } = await import("../drizzle/schema");
  const existing = await getCommentById(id);
  if (!existing) throw new Error("Comment not found");
  await db.update(comments).set({ body, updatedAt: new Date() }).where(eq(comments.id, id));
  return getCommentById(id);
}

export async function softDeleteComment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const { comments } = await import("../drizzle/schema");
  await db.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, id));
}

export async function resolveComment(id: number, resolvedByOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const { comments } = await import("../drizzle/schema");
  await db
    .update(comments)
    .set({ resolvedAt: new Date(), resolvedByOpenId })
    .where(eq(comments.id, id));
  return getCommentById(id);
}

export async function unresolveComment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const { comments } = await import("../drizzle/schema");
  await db.update(comments).set({ resolvedAt: null, resolvedByOpenId: null }).where(eq(comments.id, id));
  return getCommentById(id);
}

/**
 * Extract @mentions from markdown body. Returns array of openIds mentioned.
 * Pattern: @openId (alphanumeric + hyphens, case-insensitive for matching but preserve original case).
 */
export function extractMentions(body: string): string[] {
  const mentions = new Set<string>();
  const pattern = /@([a-zA-Z0-9_-]+)/g;
  let match;
  while ((match = pattern.exec(body)) !== null) {
    mentions.add(match[1]);
  }
  return Array.from(mentions);
}

/**
 * Check if a comment can be edited by the actor. Must be within 15 minutes of creation.
 */
export function canEditComment(comment: { createdAt: Date }, nowMs: number): boolean {
  const createdMs = comment.createdAt.getTime();
  const elapsedMs = nowMs - createdMs;
  const fifteenMinutesMs = 15 * 60 * 1000;
  return elapsedMs <= fifteenMinutesMs;
}

// ---------------------------------------------------------------------------
// NOTIFICATIONS — In-app bell
// ---------------------------------------------------------------------------

export async function createNotification(insert: {
  recipientOpenId: string;
  orgId: number;
  commentId: number;
  dealId: string;
  type: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const { notifications } = await import("../drizzle/schema");
  await db.insert(notifications).values(insert);
}

export async function listNotificationsForUser(recipientOpenId: string, orgId: number) {
  const db = await getDb();
  if (!db) return [];
  const { notifications } = await import("../drizzle/schema");
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.recipientOpenId, recipientOpenId), eq(notifications.orgId, orgId)))
    .orderBy(desc(notifications.createdAt));
}

export async function getUnreadNotificationCount(recipientOpenId: string, orgId: number) {
  const db = await getDb();
  if (!db) return 0;
  const { notifications } = await import("../drizzle/schema");
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientOpenId, recipientOpenId),
        eq(notifications.orgId, orgId),
        isNull(notifications.readAt),
      ),
    );
  return result[0]?.count ?? 0;
}

export async function markNotificationAsRead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const { notifications } = await import("../drizzle/schema");
  await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id));
}

export async function markAllNotificationsAsRead(recipientOpenId: string, orgId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const { notifications } = await import("../drizzle/schema");
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.recipientOpenId, recipientOpenId),
        eq(notifications.orgId, orgId),
        isNull(notifications.readAt),
      ),
    );
}


export async function setCommentBlocker(id: number, isBlocker: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const { comments } = await import("../drizzle/schema");
  await db.update(comments).set({ isBlocker: isBlocker ? 1 : 0 }).where(eq(comments.id, id));
  return getCommentById(id);
}

export async function hasUnresolvedBlockers(dealId: string, orgId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const { comments } = await import("../drizzle/schema");
  const rows = await db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.dealId, dealId),
        eq(comments.orgId, orgId),
        eq(comments.isBlocker, 1),
        isNull(comments.resolvedAt),
        isNull(comments.deletedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}


export async function getDealWithBlockerStatus(dealId: string, orgId: number) {
  const deal = await getDealByDealId(orgId, dealId);
  if (!deal) return null;
  const blockerStatus = await hasUnresolvedBlockers(dealId, orgId);
  return { ...deal, hasUnresolvedBlockers: blockerStatus };
}


// ---------------------------------------------------------------------------
// AUDIT ENTITY-FILTER HELPER
// ---------------------------------------------------------------------------

export async function listAuditEntriesByEntity(
  orgId: number,
  entityType: string,
  entityId: string | undefined,
  limit = 100,
) {
  const db = await getDb();
  if (!db) return [];
  const conds = [eq(auditLog.orgId, orgId), eq(auditLog.targetType, entityType)];
  if (entityId) conds.push(eq(auditLog.targetId, entityId));
  return db
    .select()
    .from(auditLog)
    .where(and(...conds))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
