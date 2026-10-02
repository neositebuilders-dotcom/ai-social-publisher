import { getAuthUserId } from "@convex-dev/auth/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx | ActionCtx;

/** Throws unless a user is signed in, returning their id. */
export async function requireUserId(ctx: Ctx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId;
}
