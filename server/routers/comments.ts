import { z } from "zod";
import {
  canEditComment,
  createComment,
  createNotification,
  extractMentions,
  getCommentById,
  listCommentsForDeal,
  markAllNotificationsAsRead,
  resolveComment,
  softDeleteComment,
  updateCommentBody,
  unresolveComment,
  listNotificationsForUser,
  getUnreadNotificationCount,
  markNotificationAsRead,
  setCommentBlocker,
} from "../db";
import { permissionProcedure, protectedProcedure, router } from "../_core/trpc";
import type { TrpcContext } from "../_core/context";
import { TRPCError } from "@trpc/server";
import { insertAuditEntry, getDealByDealId, listDealsByOrg } from "../db";

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

export const commentsRouter = router({
  // ---------------------------------------------------------------- list
  listForDeal: protectedProcedure
    .input(z.object({ dealId: z.string() }))
    .query(async ({ ctx, input }) => {
      const orgId = orgIdFromCtx(ctx);
      const comments = await listCommentsForDeal(input.dealId, orgId);
      return comments.map((c) => ({
        id: c.id,
        dealId: c.dealId,
        authorOpenId: c.authorOpenId,
        body: c.body,
        resolvedAt: c.resolvedAt?.toISOString() ?? null,
        resolvedByOpenId: c.resolvedByOpenId,
        deletedAt: c.deletedAt?.toISOString() ?? null,
        createdAt: c.createdAt?.toISOString(),
        updatedAt: c.updatedAt?.toISOString(),
      }));
    }),

  // ---------------------------------------------------------------- create
  create: permissionProcedure("comment.create")
    .input(
      z.object({
        dealId: z.string(),
        body: z.string().min(1).max(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = orgIdFromCtx(ctx);
      const meta = actorMeta(ctx);

      // Verify deal exists
      const deal = await getDealByDealId(orgId, input.dealId);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });

      // Create comment
      const result = await createComment({
        dealId: input.dealId,
        orgId,
        authorOpenId: ctx.user!.openId,
        body: input.body,
      });
      const comment = result[0];

      // Write audit entry
      await insertAuditEntry({
        orgId,
        ...meta,
        action: "comment.create",
        targetType: "comment",
        targetId: String(comment.id),
        summary: `Created comment on deal ${input.dealId}`,
        diff: [{ field: "body", before: null, after: input.body }],
      });

      // Extract @mentions and create notifications
      const mentions = extractMentions(input.body);
      if (mentions.length > 0) {
        // Get all org members (Partner + Analyst only, not Observer)
        const orgMembers = await listDealsByOrg(orgId); // This is a proxy; ideally we'd query users by orgId
        // For now, we'll create notifications for any mentioned user who is Partner/Analyst
        // In production, you'd query the users table filtered by orgId and role
        for (const mention of mentions) {
          // Skip self-mentions
          if (mention === ctx.user!.openId) continue;
          // Create notification (in v2, filter by role)
          await createNotification({
            recipientOpenId: mention,
            orgId,
            commentId: Number(comment.id),
            dealId: input.dealId,
            type: "mention",
          });
        }
      }

      return {
        id: comment.id,
        dealId: comment.dealId,
        authorOpenId: comment.authorOpenId,
        body: comment.body,
        resolvedAt: comment.resolvedAt?.toISOString() ?? null,
        resolvedByOpenId: comment.resolvedByOpenId,
        deletedAt: comment.deletedAt?.toISOString() ?? null,
        createdAt: comment.createdAt?.toISOString(),
        updatedAt: comment.updatedAt?.toISOString(),
      };
    }),

  // ---------------------------------------------------------------- edit (own only, 15-min window)
  editOwn: permissionProcedure("comment.edit_own")
    .input(
      z.object({
        commentId: z.number(),
        body: z.string().min(1).max(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const meta = actorMeta(ctx);
      const comment = await getCommentById(input.commentId);
      if (!comment) throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });

      // Verify ownership
      if (comment.authorOpenId !== ctx.user!.openId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Can only edit your own comments" });
      }

      // Verify 15-min window
      const nowMs = Date.now();
      if (!canEditComment(comment, nowMs)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Edit window closed (15 minutes after creation)",
        });
      }

      // Update body
      const before = comment.body;
      const updated = await updateCommentBody(input.commentId, input.body);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found after update" });

      // Write audit entry
      await insertAuditEntry({
        orgId: comment.orgId,
        ...meta,
        action: "comment.update",
        targetType: "comment",
        targetId: String(comment.id),
        summary: `Edited comment on deal ${comment.dealId}`,
        diff: [{ field: "body", before, after: input.body }],
      });

      const result = updated;
      return {
        id: result.id,
        dealId: result.dealId,
        authorOpenId: result.authorOpenId,
        body: result.body,
        resolvedAt: result.resolvedAt?.toISOString() ?? null,
        resolvedByOpenId: result.resolvedByOpenId,
        deletedAt: result.deletedAt?.toISOString() ?? null,
        createdAt: result.createdAt?.toISOString(),
        updatedAt: result.updatedAt?.toISOString(),
      };
    }),

  // ---------------------------------------------------------------- delete own
  deleteOwn: permissionProcedure("comment.delete_own")
    .input(z.object({ commentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const meta = actorMeta(ctx);
      const comment = await getCommentById(input.commentId);
      if (!comment) throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });

      // Verify ownership
      if (comment.authorOpenId !== ctx.user!.openId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Can only delete your own comments" });
      }

      // Soft delete
      await softDeleteComment(input.commentId);

      // Write audit entry
      await insertAuditEntry({
        orgId: comment.orgId,
        ...meta,
        action: "comment.delete",
        targetType: "comment",
        targetId: String(comment.id),
        summary: `Deleted own comment on deal ${comment.dealId}`,
        diff: [{ field: "deletedAt", before: null, after: new Date().toISOString() }],
      });

      return { success: true };
    }),

  // ---------------------------------------------------------------- delete any (partner only)
  deleteAny: permissionProcedure("comment.delete_any")
    .input(z.object({ commentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const meta = actorMeta(ctx);
      const comment = await getCommentById(input.commentId);
      if (!comment) throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });

      // Soft delete
      await softDeleteComment(input.commentId);

      // Write audit entry
      await insertAuditEntry({
        orgId: comment.orgId,
        ...meta,
        action: "comment.delete",
        targetType: "comment",
        targetId: String(comment.id),
        summary: `Deleted comment by ${comment.authorOpenId} on deal ${comment.dealId}`,
        diff: [{ field: "deletedAt", before: null, after: new Date().toISOString() }],
      });

      return { success: true };
    }),

  // ---------------------------------------------------------------- resolve
  resolve: permissionProcedure("comment.resolve")
    .input(z.object({ commentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const meta = actorMeta(ctx);
      const comment = await getCommentById(input.commentId);
      if (!comment) throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });

      if (comment.resolvedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Comment already resolved" });
      }

      // Resolve
      const updated = await resolveComment(input.commentId, ctx.user!.openId);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found after resolve" });

      // Write audit entry
      await insertAuditEntry({
        orgId: comment.orgId,
        ...meta,
        action: "comment.resolve",
        targetType: "comment",
        targetId: String(comment.id),
        summary: `Resolved comment on deal ${comment.dealId}`,
        diff: [{ field: "resolvedAt", before: null, after: new Date().toISOString() }],
      });

      const result = updated;
      return {
        id: result.id,
        dealId: result.dealId,
        authorOpenId: result.authorOpenId,
        body: result.body,
        resolvedAt: result.resolvedAt?.toISOString() ?? null,
        resolvedByOpenId: result.resolvedByOpenId,
        deletedAt: result.deletedAt?.toISOString() ?? null,
        createdAt: result.createdAt?.toISOString(),
        updatedAt: result.updatedAt?.toISOString(),
      };
    }),

  // ---------------------------------------------------------------- unresolve
  unresolve: permissionProcedure("comment.resolve")
    .input(z.object({ commentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const meta = actorMeta(ctx);
      const comment = await getCommentById(input.commentId);
      if (!comment) throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });

      if (!comment.resolvedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Comment is not resolved" });
      }

      // Unresolve
      const updated = await unresolveComment(input.commentId);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found after unresolve" });

      // Write audit entry
      await insertAuditEntry({
        orgId: comment.orgId,
        ...meta,
        action: "comment.unresolve",
        targetType: "comment",
        targetId: String(comment.id),
        summary: `Unresolved comment on deal ${comment.dealId}`,
        diff: [{ field: "resolvedAt", before: comment.resolvedAt?.toISOString() ?? null, after: null }],
      });

      const result = updated;
      return {
        id: result.id,
        dealId: result.dealId,
        authorOpenId: result.authorOpenId,
        body: result.body,
        resolvedAt: result.resolvedAt?.toISOString() ?? null,
        resolvedByOpenId: result.resolvedByOpenId,
        deletedAt: result.deletedAt?.toISOString() ?? null,
        createdAt: result.createdAt?.toISOString(),
        updatedAt: result.updatedAt?.toISOString(),
      };
    }),

  // ---------------------------------------------------------------- set blocker (partner only)
  setBlocker: permissionProcedure("comment.set_blocker")
    .input(z.object({ commentId: z.number(), isBlocker: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const meta = actorMeta(ctx);
      const comment = await getCommentById(input.commentId);
      if (!comment) throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });

      const before = comment.isBlocker === 1;
      if (before === input.isBlocker) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Comment is already ${input.isBlocker ? "flagged" : "unflagged"}`,
        });
      }

      // Set blocker
      const updated = await setCommentBlocker(input.commentId, input.isBlocker);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found after blocker toggle" });

      // Write audit entry
      await insertAuditEntry({
        orgId: comment.orgId,
        ...meta,
        action: "comment.set_blocker",
        targetType: "comment",
        targetId: String(comment.id),
        summary: `${input.isBlocker ? "Flagged" : "Unflagged"} comment as blocker on deal ${comment.dealId}`,
        diff: [{ field: "isBlocker", before, after: input.isBlocker }],
      });

      const result = updated;
      return {
        id: result.id,
        dealId: result.dealId,
        authorOpenId: result.authorOpenId,
        body: result.body,
        isBlocker: result.isBlocker === 1,
        resolvedAt: result.resolvedAt?.toISOString() ?? null,
        resolvedByOpenId: result.resolvedByOpenId,
        deletedAt: result.deletedAt?.toISOString() ?? null,
        createdAt: result.createdAt?.toISOString(),
        updatedAt: result.updatedAt?.toISOString(),
      };
    }),
});

export const notificationsRouter = router({
  // ---------------------------------------------------------------- list
  list: permissionProcedure("notification.read")
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const orgId = orgIdFromCtx(ctx);
      const notifications = await listNotificationsForUser(ctx.user!.openId, orgId);
      return notifications.slice(0, input.limit).map((n) => ({
        id: n.id,
        recipientOpenId: n.recipientOpenId,
        commentId: n.commentId,
        dealId: n.dealId,
        type: n.type,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt?.toISOString(),
      }));
    }),

  // ---------------------------------------------------------------- unread count
  unreadCount: permissionProcedure("notification.read")
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const orgId = orgIdFromCtx(ctx);
      const count = await getUnreadNotificationCount(ctx.user!.openId, orgId);
      return { count };
    }),

  // ---------------------------------------------------------------- mark as read
  markAsRead: permissionProcedure("notification.read")
    .input(z.object({ notificationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await markNotificationAsRead(input.notificationId);
      return { success: true };
    }),

  // ---------------------------------------------------------------- mark all as read
  markAllAsRead: permissionProcedure("notification.read")
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      const orgId = orgIdFromCtx(ctx);
      await markAllNotificationsAsRead(ctx.user!.openId, orgId);
      return { success: true };
    }),
});
