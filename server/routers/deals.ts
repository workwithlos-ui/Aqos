import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  computeDealDiff,
  deleteDealRow,
  getDealByDealId,
  getOrgSettings,
  insertAuditEntry,
  insertDealRow,
  insertDealVersion,
  listAuditEntries,
  listAuditEntriesForDeal,
  listDealVersions,
  listDealsByOrg,
  updateDealRow,
  upsertOrgSettings,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import type { TrpcContext } from "../_core/context";

// The deal payload is a deep, evolving JSON shape (DealInput from
// client/src/lib/acquisition/types.ts). We keep validation light at the API
// boundary so the deterministic engine stays the single source of truth.
const dealPayloadSchema = z
  .record(z.string(), z.unknown())
  .refine((v) => typeof v.companyName === "string" && v.companyName.length > 0, {
    message: "companyName is required",
  });

function actorMeta(ctx: TrpcContext) {
  return {
    actorOpenId: ctx.user!.openId,
    actorName: ctx.user!.name ?? null,
    ipAddress: (ctx.req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      ctx.req.socket?.remoteAddress ||
      null,
    userAgent: (ctx.req.headers["user-agent"] as string) ?? null,
  };
}

function orgIdFromCtx(ctx: TrpcContext): number {
  return ctx.user!.orgId ?? 1;
}

function genDealId(): string {
  return `deal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const dealsRouter = router({
  // ---------------------------------------------------------------- list
  list: protectedProcedure.query(async ({ ctx }) => {
    const orgId = orgIdFromCtx(ctx);
    const rows = await listDealsByOrg(orgId);
    return rows.map((r) => ({
      ...((r.payload ?? {}) as Record<string, unknown>),
      id: r.dealId,
      createdAt: r.createdAt?.toISOString(),
      updatedAt: r.updatedAt?.toISOString(),
    }));
  }),

  // ---------------------------------------------------------------- get one
  get: protectedProcedure
    .input(z.object({ dealId: z.string() }))
    .query(async ({ ctx, input }) => {
      const orgId = orgIdFromCtx(ctx);
      const row = await getDealByDealId(orgId, input.dealId);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        ...((row.payload ?? {}) as Record<string, unknown>),
        id: row.dealId,
        version: row.version,
      };
    }),

  // ---------------------------------------------------------------- upsert
  upsert: protectedProcedure
    .input(
      z.object({
        dealId: z.string().optional(),
        payload: dealPayloadSchema,
        reason: z.string().default("edit"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = orgIdFromCtx(ctx);
      const meta = actorMeta(ctx);
      const dealId = input.dealId ?? (input.payload.id as string | undefined) ?? genDealId();
      // Normalize the payload's id to match the canonical dealId.
      const payload = { ...input.payload, id: dealId } as Record<string, unknown>;

      const existing = await getDealByDealId(orgId, dealId);

      if (!existing) {
        const created = await insertDealRow({
          dealId,
          orgId,
          companyName: String(payload.companyName ?? "Untitled"),
          industry: (payload.industry as string | null) ?? null,
          stage: (payload.stage as string | null) ?? null,
          payload,
          isDemo: payload.isDemo ? 1 : 0,
          isTest: payload.isTest ? 1 : 0,
          version: 1,
          createdByOpenId: meta.actorOpenId,
          updatedByOpenId: meta.actorOpenId,
        });
        await insertDealVersion({
          dealId,
          orgId,
          version: 1,
          payload,
          actorOpenId: meta.actorOpenId,
          reason: "create",
        });
        await insertAuditEntry({
          orgId,
          ...meta,
          action: "deal.create",
          targetType: "deal",
          targetId: dealId,
          diff: computeDealDiff(null, payload),
          summary: `Created deal "${payload.companyName}"`,
        });
        return {
          ...((created?.payload ?? payload) as Record<string, unknown>),
          id: dealId,
          version: 1,
        };
      }

      // Update path
      const nextVersion = existing.version + 1;
      const before = (existing.payload ?? null) as Record<string, unknown> | null;
      const diff = computeDealDiff(before, payload);
      const stageChanged = before?.stage !== payload.stage;

      const updated = await updateDealRow(orgId, dealId, {
        companyName: String(payload.companyName ?? existing.companyName),
        industry: (payload.industry as string | null) ?? null,
        stage: (payload.stage as string | null) ?? null,
        payload,
        isDemo: payload.isDemo ? 1 : 0,
        isTest: payload.isTest ? 1 : 0,
        version: nextVersion,
        updatedByOpenId: meta.actorOpenId,
      });
      await insertDealVersion({
        dealId,
        orgId,
        version: nextVersion,
        payload,
        actorOpenId: meta.actorOpenId,
        reason: input.reason,
      });
      await insertAuditEntry({
        orgId,
        ...meta,
        action: stageChanged ? "deal.stage_change" : "deal.update",
        targetType: "deal",
        targetId: dealId,
        diff,
        summary: stageChanged
          ? `Stage changed: ${String(before?.stage ?? "—")} → ${String(payload.stage ?? "—")}`
          : `Updated deal "${payload.companyName}" (${diff.length} field${diff.length === 1 ? "" : "s"} changed)`,
      });
      return {
        ...((updated?.payload ?? payload) as Record<string, unknown>),
        id: dealId,
        version: nextVersion,
      };
    }),

  // ---------------------------------------------------------------- delete
  remove: protectedProcedure
    .input(z.object({ dealId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = orgIdFromCtx(ctx);
      const meta = actorMeta(ctx);
      const existing = await getDealByDealId(orgId, input.dealId);
      if (!existing) return { success: true };
      await deleteDealRow(orgId, input.dealId);
      await insertAuditEntry({
        orgId,
        ...meta,
        action: "deal.delete",
        targetType: "deal",
        targetId: input.dealId,
        diff: [
          {
            field: "_deleted",
            before: existing.payload,
            after: null,
          },
        ],
        summary: `Deleted deal "${existing.companyName}"`,
      });
      // Clear active deal if it was selected.
      const settings = await getOrgSettings(orgId);
      if (settings && settings.activeDealId === input.dealId) {
        await upsertOrgSettings({
          orgId,
          assumptions: settings.assumptions,
          activeDealId: null,
          updatedByOpenId: meta.actorOpenId,
        });
      }
      return { success: true };
    }),

  // ---------------------------------------------------------------- versions
  versions: protectedProcedure
    .input(z.object({ dealId: z.string() }))
    .query(async ({ ctx, input }) => {
      const orgId = orgIdFromCtx(ctx);
      return listDealVersions(orgId, input.dealId);
    }),

  // ---------------------------------------------------------------- audit log
  auditAll: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
    .query(async ({ ctx, input }) => {
      const orgId = orgIdFromCtx(ctx);
      return listAuditEntries(orgId, input?.limit ?? 100);
    }),

  auditForDeal: protectedProcedure
    .input(z.object({ dealId: z.string(), limit: z.number().int().min(1).max(500).default(100) }))
    .query(async ({ ctx, input }) => {
      const orgId = orgIdFromCtx(ctx);
      return listAuditEntriesForDeal(orgId, input.dealId, input.limit);
    }),

  // ---------------------------------------------------------------- bulk import (migration)
  bulkImport: protectedProcedure
    .input(
      z.object({
        deals: z.array(dealPayloadSchema),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = orgIdFromCtx(ctx);
      const meta = actorMeta(ctx);
      let created = 0;
      let skipped = 0;
      for (const payload of input.deals) {
        const dealId = (payload.id as string | undefined) ?? genDealId();
        const existing = await getDealByDealId(orgId, dealId);
        if (existing) {
          skipped++;
          continue;
        }
        const normalized = { ...payload, id: dealId } as Record<string, unknown>;
        await insertDealRow({
          dealId,
          orgId,
          companyName: String(normalized.companyName ?? "Untitled"),
          industry: (normalized.industry as string | null) ?? null,
          stage: (normalized.stage as string | null) ?? null,
          payload: normalized,
          isDemo: normalized.isDemo ? 1 : 0,
          isTest: normalized.isTest ? 1 : 0,
          version: 1,
          createdByOpenId: meta.actorOpenId,
          updatedByOpenId: meta.actorOpenId,
        });
        await insertDealVersion({
          dealId,
          orgId,
          version: 1,
          payload: normalized,
          actorOpenId: meta.actorOpenId,
          reason: "migration.import",
        });
        created++;
      }
      await insertAuditEntry({
        orgId,
        ...meta,
        action: "migration.import",
        targetType: "org",
        targetId: String(orgId),
        diff: null,
        summary: `Imported ${created} deals from local storage (${skipped} skipped as duplicates)`,
      });
      return { created, skipped };
    }),

  // ---------------------------------------------------------------- assumptions / active
  getOrgState: protectedProcedure.query(async ({ ctx }) => {
    const orgId = orgIdFromCtx(ctx);
    const s = await getOrgSettings(orgId);
    return {
      orgId,
      assumptions: (s?.assumptions ?? null) as Record<string, unknown> | null,
      activeDealId: s?.activeDealId ?? null,
    };
  }),

  setAssumptions: protectedProcedure
    .input(z.object({ assumptions: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ ctx, input }) => {
      const orgId = orgIdFromCtx(ctx);
      const meta = actorMeta(ctx);
      const before = await getOrgSettings(orgId);
      await upsertOrgSettings({
        orgId,
        assumptions: input.assumptions,
        activeDealId: before?.activeDealId ?? null,
        updatedByOpenId: meta.actorOpenId,
      });
      await insertAuditEntry({
        orgId,
        ...meta,
        action: "assumptions.update",
        targetType: "org",
        targetId: String(orgId),
        diff: computeDealDiff(
          (before?.assumptions ?? null) as Record<string, unknown> | null,
          input.assumptions,
        ),
        summary: "Updated capital stack assumptions",
      });
      return { success: true };
    }),

  setActiveDealId: protectedProcedure
    .input(z.object({ dealId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = orgIdFromCtx(ctx);
      const meta = actorMeta(ctx);
      const before = await getOrgSettings(orgId);
      await upsertOrgSettings({
        orgId,
        assumptions: (before?.assumptions ?? {}) as Record<string, unknown>,
        activeDealId: input.dealId,
        updatedByOpenId: meta.actorOpenId,
      });
      // No audit log for active selection — high-volume, low-value churn.
      return { success: true };
    }),
});
