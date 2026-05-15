import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { permissionProcedure, protectedProcedure } from "../_core/trpc";
import {
  listConflictsForDeal,
  insertConflict,
  withdrawConflict,
  acknowledgeConflict,
  getConflictById,
  insertAuditEntry,
} from "../db";

export const conflictsRouter = {
  // List all conflicts for a deal (all roles can view)
  listForDeal: protectedProcedure
    .input(z.object({ dealId: z.string() }))
    .query(async ({ ctx, input }) => {
      const conflicts = await listConflictsForDeal(ctx.user.orgId, input.dealId);
      return conflicts;
    }),

  // Declare a new conflict (Partner + Analyst only)
  declare: permissionProcedure("conflict.declare")
    .input(
      z.object({
        dealId: z.string(),
        conflictType: z.enum(["financial", "personal", "professional", "other"]),
        description: z.string().min(10).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await insertConflict({
        dealId: input.dealId,
        orgId: ctx.user.orgId,
        declarerOpenId: ctx.user.openId,
        declarerName: ctx.user.name || null,
        conflictType: input.conflictType,
        description: input.description,
      });

      // Audit log
      await insertAuditEntry({
        orgId: ctx.user.orgId,
        targetType: "conflict",
        targetId: String(result?.id ?? 0),
        action: "conflict.declare",
        actorOpenId: ctx.user.openId,
        actorName: ctx.user.name || null,
        summary: `Declared ${input.conflictType} conflict`,
        diff: [
          {
            field: "conflictType",
            before: null,
            after: input.conflictType,
          },
          {
            field: "description",
            before: null,
            after: input.description,
          },
        ],
      });

      return result;
    }),

  // Withdraw a conflict (declarer can withdraw own; Partner can withdraw any)
  withdraw: permissionProcedure("conflict.withdraw_own")
    .input(
      z.object({
        conflictId: z.number(),
        reason: z.string().min(5).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const conflict = await getConflictById(ctx.user.orgId, input.conflictId);
      if (!conflict) throw new TRPCError({ code: "NOT_FOUND" });

      // Check permission: declarer can always withdraw own; Partner can withdraw any
      const isOwnConflict = conflict.declarerOpenId === ctx.user.openId;
      const isPartner = ctx.user.role === "partner" || ctx.user.role === "admin";
      if (!isOwnConflict && !isPartner) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the declarer or a Partner can withdraw a conflict",
        });
      }

      const before = {
        withdrawnAt: conflict.withdrawnAt,
        withdrawnReason: conflict.withdrawnReason,
      };

      await withdrawConflict(
        ctx.user.orgId,
        input.conflictId,
        ctx.user.openId,
        ctx.user.name || null,
        input.reason,
      );

      // Audit log
      await insertAuditEntry({
        orgId: ctx.user.orgId,
        targetType: "conflict",
        targetId: String(input.conflictId),
        action: "conflict.withdraw",
        actorOpenId: ctx.user.openId,
        actorName: ctx.user.name || null,
        summary: `Withdrew conflict: ${input.reason}`,
        diff: [
          {
            field: "withdrawnReason",
            before: before.withdrawnReason,
            after: input.reason,
          },
        ],
      });
    }),

  // Acknowledge a conflict (all roles except the declarer)
  acknowledge: permissionProcedure("conflict.acknowledge")
    .input(z.object({ conflictId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const conflict = await getConflictById(ctx.user.orgId, input.conflictId);
      if (!conflict) throw new TRPCError({ code: "NOT_FOUND" });

      // Cannot acknowledge own conflict
      if (conflict.declarerOpenId === ctx.user.openId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot acknowledge your own conflict disclosure",
        });
      }

      await acknowledgeConflict({
        conflictId: input.conflictId,
        orgId: ctx.user.orgId,
        dealId: conflict.dealId,
        acknowledgerOpenId: ctx.user.openId,
        acknowledgerName: ctx.user.name || null,
      });

      // Audit log
      await insertAuditEntry({
        orgId: ctx.user.orgId,
        targetType: "conflict",
        targetId: String(input.conflictId),
        action: "conflict.acknowledge",
        actorOpenId: ctx.user.openId,
        actorName: ctx.user.name || null,
        summary: `Acknowledged conflict`,
        diff: [
          {
            field: "acknowledgedBy",
            before: null,
            after: ctx.user.name || ctx.user.openId,
          },
        ],
      });
    }),
};
