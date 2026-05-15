import { and, asc, desc, eq } from "drizzle-orm";
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
      values.role = "admin";
      updateSet.role = "admin";
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
