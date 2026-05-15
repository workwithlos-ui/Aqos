import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { can, normalizeRole, type Permission } from "@shared/roles";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/**
 * Role-aware procedure factory. Pass a Permission key from shared/roles.ts.
 * The middleware loads the user's normalized role and asserts the permission
 * is in their grant set. Server-side enforcement is the source of truth — the
 * client UI hides actions but a forged request still fails here.
 */
export function permissionProcedure(perm: Permission) {
  return t.procedure.use(
    t.middleware(async ({ ctx, next }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
      }
      const role = normalizeRole(ctx.user.role);
      if (!can(role, perm)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Your role (${role}) is not permitted to ${perm}.`,
        });
      }
      return next({ ctx: { ...ctx, user: ctx.user } });
    }),
  );
}

/** Convenience wrappers — partner-only / analyst-or-higher. */
export const partnerProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    const role = normalizeRole(ctx.user.role);
    if (role !== "partner") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Partner role required (you are ${role}).`,
      });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);
