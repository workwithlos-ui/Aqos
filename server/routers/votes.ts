import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { permissionProcedure, protectedProcedure } from "../_core/trpc";
import {
  openVote,
  castBallot,
  closeVote,
  reopenVote,
  getVoteById,
  getVoteForDeal,
  listBallotsForVote,
  computeVoteOutcome,
  getDealById,
  hasUnresolvedBlockers,
  hasUnacknowledgedConflictsForPartners,
  listUsersByOrgAndRole,
  insertAuditEntry,
} from "../db";

export const votesRouter = {
  // Get the current vote for a deal (all roles can view)
  getForDeal: protectedProcedure
    .input(z.object({ dealId: z.string() }))
    .query(async ({ ctx, input }) => {
      const vote = await getVoteForDeal(input.dealId, ctx.user.orgId);
      if (!vote) return null;
      
      const ballots = await listBallotsForVote(vote.id);
      const outcome = await computeVoteOutcome(vote.id, ctx.user.orgId);
      
      return { ...vote, ballots, outcome };
    }),

  // Open a vote (Partner only)
  open: permissionProcedure("vote.open")
    .input(
      z.object({
        dealId: z.string(),
        deadlineHours: z.number().default(72),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Precondition: check for unresolved blockers
      const hasBlockers = await hasUnresolvedBlockers(input.dealId, ctx.user.orgId);
      if (hasBlockers) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Cannot open vote: deal has unresolved blocker comments",
        });
      }

      // Precondition: check for unacknowledged conflicts
      const hasUnacknowledgedConflicts = await hasUnacknowledgedConflictsForPartners(
        ctx.user.orgId,
        input.dealId,
      );
      if (hasUnacknowledgedConflicts) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Cannot open vote: deal has unacknowledged conflicts",
        });
      }

      // Precondition: at least 2 active Partners
      const partners = await listUsersByOrgAndRole(ctx.user.orgId, ["partner", "admin"]);
      if (partners.length < 2) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Cannot open vote: at least 2 Partners required",
        });
      }

      const deadlineAt = new Date(Date.now() + input.deadlineHours * 60 * 60 * 1000);

      const vote = await openVote(
        input.dealId,
        ctx.user.orgId,
        ctx.user.openId,
        ctx.user.name || null,
        deadlineAt,
      );

      // Audit log
      await insertAuditEntry({
        orgId: ctx.user.orgId,
        targetType: "vote",
        targetId: String(vote?.id ?? 0),
        action: "vote.open",
        actorOpenId: ctx.user.openId,
        actorName: ctx.user.name || null,
        summary: `Opened IC vote (deadline: ${input.deadlineHours}h)`,
        diff: [
          {
            field: "state",
            before: "NOT_STARTED",
            after: "OPEN",
          },
        ],
      });

      return vote;
    }),

  // Cast or update a ballot (Partner + Analyst only)
  castBallot: permissionProcedure("ballot.cast")
    .input(
      z.object({
        voteId: z.number(),
        choice: z.enum(["APPROVE", "REJECT", "ABSTAIN", "REQUEST_CHANGES"]),
        rationale: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const vote = await getVoteById(input.voteId);
      if (!vote) throw new TRPCError({ code: "NOT_FOUND" });

      // Only OPEN or REOPENED states allow ballot changes
      if (vote.state !== "OPEN" && vote.state !== "REOPENED") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Cannot cast ballot: vote is ${vote.state}`,
        });
      }

      const ballot = await castBallot(
        input.voteId,
        vote.dealId,
        ctx.user.orgId,
        ctx.user.openId,
        ctx.user.name || null,
        input.choice,
        input.rationale || null,
      );

      // Audit log
      await insertAuditEntry({
        orgId: ctx.user.orgId,
        targetType: "ballot",
        targetId: String(ballot?.id ?? 0),
        action: "ballot.cast",
        actorOpenId: ctx.user.openId,
        actorName: ctx.user.name || null,
        summary: `Cast ballot: ${input.choice}`,
        diff: [
          {
            field: "choice",
            before: null,
            after: input.choice,
          },
        ],
      });

      return ballot;
    }),

  // Close a vote manually (Partner only)
  close: permissionProcedure("vote.close")
    .input(z.object({ voteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const vote = await getVoteById(input.voteId);
      if (!vote) throw new TRPCError({ code: "NOT_FOUND" });

      if (vote.state !== "OPEN" && vote.state !== "REOPENED") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Cannot close vote: vote is ${vote.state}`,
        });
      }

      const updated = await closeVote(input.voteId, ctx.user.openId, ctx.user.name || null);
      const outcome = await computeVoteOutcome(input.voteId, ctx.user.orgId);

      // Audit log
      await insertAuditEntry({
        orgId: ctx.user.orgId,
        targetType: "vote",
        targetId: String(input.voteId),
        action: "vote.close",
        actorOpenId: ctx.user.openId,
        actorName: ctx.user.name || null,
        summary: `Closed vote: outcome ${outcome}`,
        diff: [
          {
            field: "state",
            before: vote.state,
            after: "CLOSED",
          },
          {
            field: "outcome",
            before: vote.outcome,
            after: outcome,
          },
        ],
      });

      return { ...updated, outcome };
    }),

  // Reopen a vote (Partner only, max 2 reopens)
  reopen: permissionProcedure("vote.reopen")
    .input(
      z.object({
        voteId: z.number(),
        reason: z.string().min(10).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const vote = await getVoteById(input.voteId);
      if (!vote) throw new TRPCError({ code: "NOT_FOUND" });

      if (vote.state !== "CLOSED") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Cannot reopen vote: vote is ${vote.state}`,
        });
      }

      // Phase 3b: reopen cap enforcement (deferred)
      // For now, allow unlimited reopens

      const updated = await reopenVote(
        input.voteId,
        ctx.user.openId,
        ctx.user.name || null,
        input.reason,
      );

      // Audit log
      await insertAuditEntry({
        orgId: ctx.user.orgId,
        targetType: "vote",
        targetId: String(input.voteId),
        action: "vote.reopen",
        actorOpenId: ctx.user.openId,
        actorName: ctx.user.name || null,
        summary: `Reopened vote: ${input.reason}`,
        diff: [
          {
            field: "state",
            before: "CLOSED",
            after: "REOPENED",
          },
          {
            field: "reopenReason",
            before: null,
            after: input.reason,
          },
        ],
      });

      return updated;
    }),
};
